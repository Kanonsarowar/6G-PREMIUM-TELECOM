#!/usr/bin/php
<?php
$agi = [];
while(!feof(STDIN)){
    $line = trim(fgets(STDIN));
    if($line === "") break;
    if(preg_match('/^agi_(\w+):\s*(.*)$/', $line, $m))
        $agi[$m[1]] = $m[2];
}

$did        = preg_replace('/^\+|^00/', '', $argv[1] ?? $agi['extension'] ?? '');
$call_start = $argv[2] ?? time();
$billsec    = (int)($argv[3] ?? 0);
$tariff     = (float)($argv[4] ?? 0.090);
$ivr        = $argv[5] ?? 'custom/6g-premium-telecom';
$src        = preg_replace('/^\+|^00/', '', $agi['callerid'] ?? 'unknown');
$revenue    = round(($billsec / 60) * $tariff, 6);

// Log for debugging
file_put_contents('/tmp/cdr_debug.log',
    date('Y-m-d H:i:s')." DID=$did SRC=$src BILLSEC=$billsec TARIFF=$tariff REV=$revenue\n",
    FILE_APPEND);

try {
    $pdo = new PDO('mysql:host=127.0.0.1;dbname=telecom_api', 'telecom_user', 'Kanon@DB2026');
    $pdo->prepare("INSERT INTO cdrs 
        (src, dst, did, caller, callee, billsec, duration, disposition, revenue, revenue_eur, ivr_context, trunk_name, call_start, currency, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,FROM_UNIXTIME(?),?,NOW(),NOW())")
        ->execute([
            $src, $did, $did, $src, $did,
            $billsec, $billsec,
            $billsec > 0 ? 'ANSWERED' : 'NO ANSWER',
            $revenue, $revenue,
            $ivr, 'WTP', $call_start, 'EUR'
        ]);
    fwrite(STDOUT, "VERBOSE \"CDR saved: $did $billsec s revenue:$revenue\" 1\n");
} catch(Exception $e){
    file_put_contents('/tmp/cdr_error.log', $e->getMessage()."\n", FILE_APPEND);
    fwrite(STDOUT, "VERBOSE \"CDR ERROR: ".$e->getMessage()."\" 1\n");
}
fgets(STDIN);
