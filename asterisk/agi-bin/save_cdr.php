#!/usr/bin/php
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

// Asterisk's own billsec truncates any fractional second (floor), while the
// supplier bills any started second as a full one (ceiling). Bump by 1 so
// our recorded duration/revenue matches the supplier's convention instead of
// reading a false ~1s-shorter call on every reconciliation. Done after
// $call_start so the start time itself isn't skewed by the rounding.
if ($billsec > 0) $billsec++;

// Detect supplier from the PJSIP endpoint in the channel name
// (PJSIP/<ENDPOINT>-<hex>). The trunks table is the source of truth and is
// matched EXACTLY on pjsip_name; the historical alias map below is only a
// last-resort fallback for an endpoint that is not in the table, so a
// supplier is never mislabelled (e.g. MEDIATEL -> "Tokyo") when the DB knows it.
$trunk_name = 'UNKNOWN';
$endpoint = preg_match('#^PJSIP/(.+)-[0-9a-f]{8}$#i', $channel, $em) ? $em[1] : '';
$endpointMap = [
    'WTP'=>'WTP',
    'MEDIATEL'   => 'Tokyo',
    'PHONEGROUP' => 'Berlin',
];
$matched = false;

try {
    // Credentials live in db_config.php (git-ignored, deployed separately
    // from source control) — see db_config.php.example for the shape.
    $db  = require __DIR__.'/db_config.php';
    $pdo = new PDO("mysql:host={$db['host']};dbname={$db['dbname']}", $db['user'], $db['pass']);

    if ($endpoint !== '') {
        // Best-effort: a lookup failure must never block the CDR insert below.
        try {
            $stmt = $pdo->prepare("SELECT nickname, name FROM trunks WHERE pjsip_name = ? LIMIT 1");
            $stmt->execute([$endpoint]);
            if ($t = $stmt->fetch(PDO::FETCH_ASSOC)) {
                $trunk_name = $t['nickname'] ?: $t['name'];
                $matched = true;
            }
        } catch (\Throwable $e) {
            file_put_contents('/tmp/cdr_error.log',
                date('Y-m-d H:i:s')." | trunk lookup failed: ".$e->getMessage()."\n",
                FILE_APPEND);
        }
    }
    if (!$matched) {
        foreach ($endpointMap as $alias => $codeName) {
            if (stripos($channel, $alias) !== false) { $trunk_name = $codeName; $matched = true; break; }
        }
    }

    // Get DID tariff and currency
    $stmt = $pdo->prepare("SELECT dids.tariff, dids.currency, trunks.nickname, trunks.name
        FROM dids LEFT JOIN trunks ON trunks.id = dids.trunk_id
        WHERE dids.number=? OR dids.number=? LIMIT 1");
    $stmt->execute([$did, '+'.$did]);
    $did_data = $stmt->fetch(PDO::FETCH_ASSOC) ?: [];

    // Self-originated test calls (e.g. the NOC "test number" verifier) don't
    // arrive over a supplier's PJSIP trunk, so there is no endpoint to read
    // above - they're placed directly into the dialplan. The DID being
    // tested still belongs to exactly one supplier though, so fall back to
    // that instead of leaving the CDR mislabelled with a placeholder.
    if (!$matched && $did_data && ($did_data['nickname'] || $did_data['name'])) {
        $trunk_name = $did_data['nickname'] ?: $did_data['name'];
        $matched = true;
    }

    // Numbers dialled alongside the registered test number (same block,
    // different last digit) aren't in `dids` individually - they're only
    // covered by their did_ranges prefix. Check that range whenever the
    // trunk is still unmatched OR the DID has no tariff of its own: silently
    // falling back to a hardcoded rate/currency here used to bill every such
    // call at the wrong price (e.g. 0.07 EUR/min instead of a range's real
    // 0.35 USDT/min), and it's most calls - about half of DIDs are only
    // covered by a range, not an individual `dids` row.
    $range = [];
    if (!$matched || empty($did_data['tariff'])) {
        $stmt = $pdo->prepare("SELECT supplier_name, rate, currency FROM did_ranges
            WHERE ? LIKE CONCAT(prefix, '%') ORDER BY LENGTH(prefix) DESC LIMIT 1");
        $stmt->execute([$did]);
        $range = $stmt->fetch(PDO::FETCH_ASSOC) ?: [];
        if (!$matched && !empty($range['supplier_name'])) {
            $trunk_name = $range['supplier_name'];
            $matched = true;
        }
    }

    $tariff   = floatval($did_data['tariff'] ?? ($range['rate'] ?? 0.07));
    $currency = $did_data['currency'] ?? ($range['currency'] ?? 'EUR');
    $revenue  = round(($billsec / 60) * $tariff, 6);

    // A call must never be billed twice: guard against this AGI firing more
    // than once for the same call (e.g. a re-triggered hangup handler) and
    // against overlapping with import_cdr.sh's Master.csv backfill for the
    // same call. Same src+did+billsec+5s call_start window that
    // import_cdr.sh already uses for its own dedup check.
    $dupe = $pdo->prepare("SELECT COUNT(*) FROM cdrs
        WHERE src = ? AND REPLACE(did,'+','') = REPLACE(?,'+','') AND billsec = ?
          AND ABS(TIMESTAMPDIFF(SECOND, call_start, FROM_UNIXTIME(?))) <= 5");
    $dupe->execute([$src, $did, $billsec, $call_start]);

    if ((int)$dupe->fetchColumn() > 0) {
        fwrite(STDOUT, "VERBOSE \"CDR SKIPPED (duplicate): $did $billsec s\" 1\n");
        file_put_contents('/tmp/cdr_debug.log',
            date('Y-m-d H:i:s')." DUPLICATE SKIPPED DID=$did SRC=$src BILLSEC=$billsec\n",
            FILE_APPEND);
    } else {
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
    }

} catch(\Throwable $e){
    // \Throwable (not just Exception) so a missing/unreadable
    // db_config.php - which PHP raises as an uncatchable-by-Exception
    // Error from require() - still gets logged here instead of crashing
    // the AGI script uncaught (and silently dropping the CDR).
    file_put_contents('/tmp/cdr_error.log',
        date('Y-m-d H:i:s')." | ".$e->getMessage()."\n",
        FILE_APPEND);
    fwrite(STDOUT, "VERBOSE \"CDR ERROR: ".$e->getMessage()."\" 1\n");
}
fgets(STDIN);
