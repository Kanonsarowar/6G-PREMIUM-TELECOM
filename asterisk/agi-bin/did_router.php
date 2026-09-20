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
    // Credentials live in db_config.php (git-ignored, deployed separately
    // from source control) — see db_config.php.example for the shape.
    $db  = require __DIR__.'/db_config.php';
    $pdo = new PDO("mysql:host={$db['host']};dbname={$db['dbname']}", $db['user'], $db['pass']);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    // Try all formats
    $stmt = $pdo->prepare("SELECT id,ivr_context,tariff,country_name,status FROM dids 
        WHERE number=? OR number=? OR number=? LIMIT 1");
    $stmt->execute([$did, $didClean, '+'.$didClean]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);

    // A number disabled in the panel is rejected here, before any answer/IVR
    // (cause 21, call rejected). Enabled, unknown and lookup-failure cases
    // fall through to the normal flow unchanged.
    if (($row['status'] ?? '') === 'disabled') {
        fwrite(STDOUT, "VERBOSE \"6G DID:$did DISABLED - rejecting\" 1\n");
        fgets(STDIN);
        fwrite(STDOUT, "EXEC Hangup 21\n");
        fgets(STDIN);
        exit(0);
    }

    $ivr     = $row['ivr_context'] ?? 'custom/6g-premium-telecom';

    // Default IVR = random pick from the pool of active IVRs, chosen fresh on every call
    // (same DID, different calls, different IVRs). Any failure or an empty pool keeps
    // the default/fallback IVR above. Unknown DIDs (no row) are never pooled.
    if ($row && ($ivr === '' || $ivr === 'custom/6g-premium-telecom')) {
        try {
            $names = $pdo->query("SELECT name FROM ivrs WHERE is_active=1 AND in_pool=1")->fetchAll(PDO::FETCH_COLUMN);
            $names = array_values(array_filter($names, fn($n) => glob('/usr/share/asterisk/sounds/custom/'.$n.'.*')));
            if ($names) $ivr = 'custom/'.$names[random_int(0, count($names) - 1)];
        } catch (\Throwable $e) { $ivr = 'custom/6g-premium-telecom'; }
    }
    $tariff  = $row['tariff']      ?? 0.063;
    $country = $row['country_name']?? 'Unknown';

} catch(\Throwable $e){
    // \Throwable (not just Exception) so a missing/unreadable
    // db_config.php - which PHP raises as an uncatchable-by-Exception
    // Error from require() - still falls back gracefully here instead of
    // crashing the AGI script uncaught.
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
