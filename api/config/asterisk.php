<?php

return [
    // The one root-owned script the 6g-asterisk-config sudoers rule allows
    // www-data to run — see asterisk/bin/apply_asterisk_config.php and
    // asterisk/bin/install-asterisk-config-module.sh.
    'apply_script' => env('ASTERISK_APPLY_SCRIPT', '/root/6g-telecom-mono/asterisk/bin/apply_asterisk_config.php'),

    // Must match the constants inside apply_asterisk_config.php.
    'staging_dir' => env('ASTERISK_STAGING_DIR', '/var/lib/6g-asterisk-config/staging'),
    'backups_dir' => env('ASTERISK_BACKUPS_DIR', '/var/lib/6g-asterisk-config/backups'),

    'pjsip_conf' => env('ASTERISK_PJSIP_CONF', '/etc/asterisk/pjsip.conf'),
    'extensions_conf' => env('ASTERISK_EXTENSIONS_CONF', '/etc/asterisk/extensions.conf'),
    'rtp_conf' => env('ASTERISK_RTP_CONF', '/etc/asterisk/rtp.conf'),
];
