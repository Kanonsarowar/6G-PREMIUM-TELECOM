#!/usr/bin/php
<?php
// Read AGI vars
$agi = [];
while(!feof(STDIN)){
    $line = trim(fgets(STDIN));
    if($line === "") break;
    if(preg_match('/^agi_(\w+):\s*(.*)$/', $line, $m))
        $agi[$m[1]] = $m[2];
}

$did = $agi['extension'] ?? $agi['dnid'] ?? '';
$src = $agi['callerid'] ?? 'unknown';

// Normalize DID - remove + and 00 prefix
$didClean = preg_replace('/^\+|^00/', '', $did);

// DB lookup
try {
    $pdo = new PDO('mysql:host=127.0.0.1;dbname=telecom_api','telecom_user','Kanon@DB2026');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    // Try all formats
    $stmt = $pdo->prepare("SELECT id,ivr_context,tariff,country_name FROM dids 
        WHERE number=? OR number=? OR number=? LIMIT 1");
    $stmt->execute([$did, $didClean, '+'.$didClean]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);

    $ivr     = $row['ivr_context'] ?? 'custom/6g-premium-telecom';
    $tariff  = $row['tariff']      ?? 0.063;
    $country = $row['country_name']?? 'Unknown';

} catch(Exception $e){
    $ivr    = 'custom/6g-premium-telecom';
    $tariff = 0.063;
    $country= 'Unknown';
}

// Set variables
fwrite(STDOUT, "SET VARIABLE IVR_CONTEXT $ivr\n");
fgets(STDIN);

fwrite(STDOUT, "SET VARIABLE TARIFF $tariff\n");
fgets(STDIN);

fwrite(STDOUT, "VERBOSE \"6G DID:$did CLEAN:$didClean IVR:$ivr Country:$country\" 1\n");
fgets(STDIN);
