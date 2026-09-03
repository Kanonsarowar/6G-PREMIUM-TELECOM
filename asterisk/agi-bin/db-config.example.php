<?php
// Example AGI database credentials file.
//
// This file is a TEMPLATE only. It must never contain a real password
// and must never be deployed as-is.
//
// Setup on the Asterisk server:
//   1. sudo mkdir -p /etc/6g-premium-telecom
//   2. sudo cp db-config.example.php /etc/6g-premium-telecom/agi-db.php
//   3. Edit /etc/6g-premium-telecom/agi-db.php and fill in the real,
//      rotated credentials.
//   4. sudo chown root:asterisk /etc/6g-premium-telecom/agi-db.php
//      sudo chmod 640 /etc/6g-premium-telecom/agi-db.php
//      (adjust the group to whichever account actually runs the AGI
//      scripts on this server if it is not "asterisk")
//
// did_router.php and save_cdr.php read this exact path
// (/etc/6g-premium-telecom/agi-db.php) at runtime. Nothing under the
// git repository should ever hold the real password.
return [
    'host'     => '127.0.0.1',
    'database' => 'telecom_api',
    'username' => 'telecom_user',
    'password' => 'REPLACE_WITH_ROTATED_PASSWORD',
];
