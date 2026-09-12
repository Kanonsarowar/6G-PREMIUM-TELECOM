<?php
$env = [];
while (($line = fgets(STDIN)) !== false) {
    $line = trim($line);
    if ($line === '') break;
    if (preg_match('/^agi_(\w+):\s*(.*)$/', $line, $m))
        $env[$m[1]] = $m[2];
}

// Args: src, dst/did, billsec, tariff, ivr_context, channel
$src       = $argv[1] ?? $env['callerid'] ?? '';
$did       = $argv[2] ?? $env['extension'] ?? '';
$billsec   = intval($argv[3] ?? 0);
$ivr       = $argv[5] ?? 'custom/6g-premium-telecom';
$channel   = $argv[6] ?? $env['channel'] ?? '';
$call_start= time() - $billsec;

// Detect supplier from channel
$trunk_name = 'PROFESSOR';
$endpointMap = [
    'WTP'=>'WTP',
    'MEDIATEL'   => 'Tokyo',
    'PHONEGROUP' => 'Berlin',
    'GAMA'       => 'Nairobi',
];
foreach($endpointMap as $endpoint => $codeName){
    if(stripos($channel, $endpoint) !== false){
        $trunk_name = $codeName;
        break;
    }
}

try {
    // Credentials live in db_config.php (git-ignored, deployed separately
    // from source control) — see db_config.php.example for the shape.
    $db  = require __DIR__.'/db_config.php';
    $pdo = new PDO("mysql:host={$db['host']};dbname={$db['dbname']}", $db['user'], $db['pass']);

    // Get DID tariff and currency
    $stmt = $pdo->prepare("SELECT tariff, currency FROM dids WHERE number=? OR number=? LIMIT 1");
    $stmt->execute([$did, '+'.$did]);
    $did_data = $stmt->fetch(PDO::FETCH_ASSOC);

    $tariff   = floatval($did_data['tariff'] ?? 0.07);
    $currency = $did_data['currency'] ?? 'EUR';
    $revenue  = round(($billsec / 60) * $tariff, 6);

    $pdo->prepare("INSERT INTO cdrs
        (src, dst, did, caller, callee, billsec, duration, disposition, revenue, revenue_eur, ivr_context, trunk_name, call_start, currency, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,FROM_UNIXTIME(?),?,NOW(),NOW())")
        ->execute([
            $src, $did, $did, $src, $did,
            $billsec, $billsec,
            $billsec > 0 ? 'ANSWERED' : 'NO ANSWER',
            $revenue, $revenue,
            $ivr, $trunk_name, $call_start, $currency
        ]);

    fwrite(STDOUT, "VERBOSE \"CDR saved: $did $billsec s $trunk_name $revenue $currency\" 1\n");
    file_put_contents('/tmp/cdr_debug.log',
        date('Y-m-d H:i:s')." DID=$did SRC=$src BILLSEC=$billsec TARIFF=$tariff REV=$revenue SUPPLIER=$trunk_name\n",
        FILE_APPEND);

} catch(Exception $e){
    file_put_contents('/tmp/cdr_error.log',
        date('Y-m-d H:i:s')." | ".$e->getMessage()."\n",
        FILE_APPEND);
    fwrite(STDOUT, "VERBOSE \"CDR ERROR: ".$e->getMessage()."\" 1\n");
}
fgets(STDIN);
