<?php
/**
 * Generates PJSIP endpoint config from trunks table.
 *   php pjsip_generate.php          → dry run, shows diff
 *   php pjsip_generate.php --apply  → backup, write, reload, verify
 */
$LIVE   = '/etc/asterisk/pjsip.conf';
$TMP    = '/tmp/pjsip.generated.conf';
$BEGIN  = '; === BEGIN MANAGED TRUNKS - generated, do not edit ===';
$END    = '; === END MANAGED TRUNKS ===';
$apply  = in_array('--apply', $argv);

$INSTALLED = ['ulaw','alaw','g722','gsm','slin','g726','speex','opus'];

$env = [];
foreach(file('/var/www/6g-api/.env') as $line){
    if(preg_match('/^(DB_\w+)=(.*)$/', trim($line), $m))
        $env[$m[1]] = trim($m[2], '"\'');
}
$pdo = new PDO(
    "mysql:host={$env['DB_HOST']};dbname={$env['DB_DATABASE']};charset=utf8mb4",
    $env['DB_USERNAME'], $env['DB_PASSWORD'],
    [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);

$rows = $pdo->query("SELECT * FROM trunks WHERE is_active=1 AND host IS NOT NULL AND host<>'' ORDER BY id")->fetchAll(PDO::FETCH_OBJ);

$out = [$BEGIN, ''];
$skipped = [];
$names = [];

foreach($rows as $t){
    $ips = array_values(array_filter(array_map('trim', explode(',', $t->host)),
             fn($ip)=>filter_var($ip, FILTER_VALIDATE_IP)));
    if(!$ips){ $skipped[] = "{$t->nickname} ({$t->host} - not an IP)"; continue; }

    $name = $t->pjsip_name ?: strtoupper(preg_replace('/[^A-Za-z0-9]+/','-',$t->nickname));
    if(in_array($name,$names)){ $skipped[] = "{$t->nickname} (duplicate name $name)"; continue; }
    $names[] = $name;

    $port = $t->port ?: 5060;
    $codecs = array_values(array_unique(array_filter(
        array_map('trim', explode(',', $t->codecs ?: 'ulaw,alaw,g722,gsm,slin')),
        fn($c)=>in_array($c,$INSTALLED))));
    if(!$codecs) $codecs = ['ulaw','alaw','g722','gsm','slin'];

    // Purple's spec requires 180 Ringing instead of the 183 Session Progress
    // that [from-carrier] sends via Progress() - see from-carrier-purple.
    $context = ($name === 'PURPLE') ? 'from-carrier-purple' : 'from-carrier';

    $out[] = "; ── {$t->nickname} ──";
    $out[] = "[{$name}]";
    $out[] = "type=endpoint";
    $out[] = "context={$context}";
    $out[] = "disallow=all";
    foreach($codecs as $c) $out[] = "allow={$c}";
    $out[] = "direct_media=no";
    $out[] = "trust_id_inbound=yes";
    $out[] = "rtp_symmetric=yes";
    $out[] = "force_rport=yes";
    $out[] = "rewrite_contact=yes";
    $out[] = "device_state_busy_at=0";
    $out[] = "aors={$name}-aor";
    $out[] = "";
    $out[] = "[{$name}-aor]";
    $out[] = "type=aor";
    $out[] = "max_contacts=100";
    $out[] = "qualify_frequency=".(int)($t->qualify ?? 60);
    foreach($ips as $ip) $out[] = "contact=sip:{$ip}:{$port}";
    $out[] = "";
    $out[] = "[{$name}-identify]";
    $out[] = "type=identify";
    $out[] = "endpoint={$name}";
    foreach($ips as $ip) $out[] = "match={$ip}";
    $out[] = "";
}
$out[] = $END;
$generated = implode("\n", $out)."\n";

// preserve global/transport from live file
$live = file_get_contents($LIVE);
if(strpos($live,$BEGIN)!==false){
    $head = substr($live, 0, strpos($live,$BEGIN));
    $tail = substr($live, strpos($live,$END)+strlen($END));
} else {
    // first run: keep everything before the first supplier endpoint
    $firstEp = strpos($live, '; ── WTP');
    if($firstEp===false) $firstEp = strpos($live, '[WTP]');
    $head = substr($live, 0, $firstEp);
    $tail = "\n";
}
$final = rtrim($head)."\n\n".$generated.$tail;
file_put_contents($TMP, $final);

// validate
$secs = [];
preg_match_all('/^\[([^\]]+)\]/m', $final, $m);
$dupes = array_filter(array_count_values($m[1]), fn($n)=>$n>1);

echo "── GENERATED ──\n";
echo "Endpoints : ".count($names)." (".implode(', ',$names).")\n";
if($skipped) echo "Skipped   : ".implode('; ',$skipped)."\n";
echo "Sections  : ".count($m[1])."\n";
echo "Duplicates: ".($dupes ? "YES - ".implode(',',array_keys($dupes)) : "none")."\n\n";

if($dupes){ echo "ABORT: duplicate sections\n"; exit(1); }

echo "── DIFF vs LIVE ──\n";
passthru("diff -u ".escapeshellarg($LIVE)." ".escapeshellarg($TMP)." | head -80");

if(!$apply){ echo "\nDry run. Re-run with --apply to write.\n"; exit(0); }

$bak = "/root/pjsip.conf.bak-".date('Ymd-His');
copy($LIVE,$bak);
copy($TMP,$LIVE);
exec("asterisk -rx 'module reload res_pjsip.so' 2>&1");
sleep(3);
exec("asterisk -rx 'pjsip show identifies' 2>&1", $chk);
$found = 0;
foreach($chk as $l) if(preg_match('/Objects found: (\d+)/',$l,$mm)) $found=(int)$mm[1];

echo "\nBackup: $bak\n";
echo "Identifies loaded: $found (expected ".count($names).")\n";
if($found < count($names)){
    copy($bak,$LIVE);
    exec("systemctl restart asterisk");
    echo "FAILED - restored backup and restarted Asterisk\n";
    exit(2);
}
echo "OK\n";
