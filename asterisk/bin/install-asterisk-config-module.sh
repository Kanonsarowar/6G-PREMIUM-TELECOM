#!/bin/bash
# One-time server bootstrap for the panel's Asterisk Configuration module.
# Run once, as root, on the box that actually runs Asterisk + php-fpm
# (this file documents/reproduces the setup already applied on this box).
#
# It does exactly three things:
#   1. Locks down apply_asterisk_config.php to root-only (the ONLY script
#      the sudoers rule below is allowed to run as root).
#   2. Creates the staging (www-data-writable) and backups (root-writable,
#      www-data-readable) directories the helper script and Laravel share.
#   3. Installs a single, exact-path, argument-less sudoers NOPASSWD rule
#      so www-data can run that one script as root — nothing else.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HELPER="$SCRIPT_DIR/apply_asterisk_config.php"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root." >&2
  exit 1
fi

chown root:root "$HELPER"
chmod 750 "$HELPER"

mkdir -p /var/lib/6g-asterisk-config/staging /var/lib/6g-asterisk-config/backups
chown www-data:www-data /var/lib/6g-asterisk-config/staging
chmod 750 /var/lib/6g-asterisk-config/staging
chown root:www-data /var/lib/6g-asterisk-config/backups
chmod 750 /var/lib/6g-asterisk-config/backups

SUDOERS_LINE="www-data ALL=(root) NOPASSWD: /usr/bin/php $HELPER"
TMP_SUDOERS="$(mktemp)"
{
  echo "# Allows the web app (www-data) to run ONLY this exact, root-owned,"
  echo "# argument-less helper script as root. Do not add wildcards or"
  echo "# extra commands here."
  echo "$SUDOERS_LINE"
} > "$TMP_SUDOERS"

visudo -c -f "$TMP_SUDOERS"
install -m 0440 -o root -g root "$TMP_SUDOERS" /etc/sudoers.d/6g-asterisk-config
rm -f "$TMP_SUDOERS"
visudo -c

echo "OK — installed. Verify with: sudo -n -u www-data sudo -n -l | grep asterisk"
