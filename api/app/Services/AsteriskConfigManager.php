<?php

namespace App\Services;

use App\Models\AsteriskConfigHistory;
use App\Models\AsteriskSetting;
use Illuminate\Support\Facades\DB;

/**
 * Orchestrates Preview/Apply/Reload/Status/Rollback for the Asterisk
 * Configuration module.
 *
 * Design note on privilege: /etc/asterisk/pjsip.conf, extensions.conf and
 * rtp.conf are mode 640 root:asterisk — www-data (this process) can read
 * them but NOT write them. Writing/restoring those files is therefore
 * delegated to the single root-owned helper script
 * (asterisk/bin/apply_asterisk_config.php) via the narrow sudoers rule
 * installed by asterisk/bin/install-asterisk-config-module.sh. Everything
 * else here — reload commands, status/validation `asterisk -rx` calls —
 * runs directly as www-data exactly like the existing
 * /v1/system/health and /v1/system/exec routes already do, because
 * www-data is in the `asterisk` group which has rw on the Asterisk
 * control socket.
 */
class AsteriskConfigManager
{
    public function __construct(private AsteriskConfigGenerator $generator)
    {
    }

    public function detectStatus(): array
    {
        exec("asterisk -rx 'core show version' 2>/dev/null", $versionOut, $versionRc);
        exec("asterisk -rx 'core show channels' 2>/dev/null", $channelsOut);
        $activeCalls = 0;
        foreach ($channelsOut as $l) {
            if (preg_match('/(\d+) active call/', $l, $m)) {
                $activeCalls = (int) $m[1];
            }
        }
        exec("asterisk -rx 'pjsip show identifies' 2>/dev/null", $identOut);
        $identifyCount = 0;
        foreach ($identOut as $l) {
            if (preg_match('/Objects found: (\d+)/', $l, $m)) {
                $identifyCount = (int) $m[1];
            }
        }

        $settings = AsteriskSetting::current();
        $lastApply = AsteriskConfigHistory::where('action', 'apply')->where('status', 'success')->latest()->first();
        $lastReload = AsteriskConfigHistory::whereIn('action', ['reload_pjsip', 'reload_dialplan', 'reload_all', 'apply'])
            ->where('status', 'success')->latest()->first();

        return [
            'online' => $versionRc === 0,
            'version' => $versionOut[0] ?? 'Unknown',
            'active_calls' => $activeCalls,
            'live_identify_count' => $identifyCount,
            'public_ip' => $settings->public_ip_override ?: $this->detectLocalIp(),
            'sip_port' => $settings->sip_port,
            'rtp_start' => $settings->rtp_start,
            'rtp_end' => $settings->rtp_end,
            'codecs' => $settings->codecs,
            'inbound_context' => $settings->inbound_context,
            'active_suppliers' => DB::table('suppliers')->where('status', 'active')->count(),
            'active_did_ranges' => DB::table('route_prefixes')->where('is_active', 1)->count(),
            'active_ivrs' => DB::table('ivrs')->where('is_active', 1)->count(),
            'last_apply_at' => $lastApply?->created_at,
            'last_reload_at' => $lastReload?->created_at,
        ];
    }

    private function detectLocalIp(): string
    {
        exec("hostname -I 2>/dev/null", $out);
        $parts = explode(' ', trim($out[0] ?? ''));

        return $parts[0] ?? '';
    }

    /**
     * Single source of truth for Preview AND Apply, so they can never
     * disagree: generates all three blocks against the LIVE files (needed to
     * preserve protected routes verbatim) and collects every blocking error
     * and warning. Read-only.
     */
    private function build(): array
    {
        $settings = AsteriskSetting::current();
        $trunks = DB::table('trunks')->get();
        $routePrefixes = DB::table('route_prefixes')->get();
        $ivrs = DB::table('ivrs')->get();
        $didRanges = DB::table('did_ranges')->where('is_active', 1)->get();

        $livePjsip = $this->extractManagedBlock(config('asterisk.pjsip_conf'), AsteriskConfigGenerator::PJSIP_BEGIN, AsteriskConfigGenerator::PJSIP_END);
        $liveDialplan = $this->extractManagedBlock(config('asterisk.extensions_conf'), AsteriskConfigGenerator::DIALPLAN_BEGIN, AsteriskConfigGenerator::DIALPLAN_END);

        // Per-trunk contexts come from trunks.dialplan_context (never forced);
        // settings->inbound_context is the generated normal context and the
        // fallback for a trunk with an empty value. Protected routes (Purple)
        // are copied verbatim from $livePjsip.
        $pjsip = $this->generator->pjsipManagedBlock($trunks, $settings->inbound_context, $settings->codecs, $livePjsip);
        $dialplan = $this->generator->dialplanManagedBlock($routePrefixes, $ivrs, $settings->inbound_context, $pjsip['limits']);
        $rtp = $this->generator->rtpConf($settings->rtp_start, $settings->rtp_end);

        $errors = array_values(array_unique(array_merge(
            $this->generator->validateRtp($settings->rtp_start, $settings->rtp_end),
            $pjsip['errors'],
            $dialplan['errors'],
            $this->crossValidate($pjsip, $dialplan)
        )));
        $warnings = array_values(array_unique(array_merge(
            $pjsip['warnings'],
            $dialplan['warnings'],
            $this->routeWarnings($pjsip['endpoints'], $routePrefixes, $settings->inbound_context),
            $this->audioWarnings($ivrs)
        )));

        return [
            'settings' => $settings,
            'pjsip' => $pjsip,
            'dialplan' => $dialplan,
            'rtp' => $rtp,
            'errors' => $errors,
            'warnings' => $warnings,
            'livePjsip' => $livePjsip,
            'liveDialplan' => $liveDialplan,
            'routing' => $this->buildRouting($pjsip, $routePrefixes, $didRanges, $settings->inbound_context),
        ];
    }

    /**
     * Read-only: generates the three config blocks and diffs them against
     * what's currently live. Never touches the filesystem.
     */
    public function preview(): array
    {
        $b = $this->build();

        return [
            // Passwords are needed in the real file but never in Preview output.
            'pjsip' => preg_replace('/^(password=).*$/m', '$1********', $b['pjsip']['text']),
            'dialplan' => $b['dialplan']['text'],
            'rtp' => $b['rtp'],
            'errors' => $b['errors'],
            'warnings' => $b['warnings'],
            'blocked' => (bool) $b['errors'],
            'skipped_suppliers' => $b['pjsip']['skipped'],
            'routing' => $b['routing'],
            'changes' => $this->summarizeChanges($b['livePjsip'], $b['pjsip']['text'], $b['liveDialplan'], $b['dialplan']['text']),
        ];
    }

    /** Names of every [context] in a chunk of extensions.conf text. */
    private function contextNames(string $text): array
    {
        preg_match_all('/^\[([^\]]+)\]/m', $text, $m);

        return array_values(array_unique($m[1]));
    }

    /**
     * Cross-file checks the generator cannot do on its own: every endpoint
     * must land in a context that really exists, the generated block must not
     * redefine a hand-written context, and protected routes need their
     * hand-written context to still be present.
     */
    private function crossValidate(array $pjsip, array $dialplan): array
    {
        $errors = [];
        $extPath = config('asterisk.extensions_conf');
        $liveExt = is_file($extPath) ? (string) file_get_contents($extPath) : '';
        $b = strpos($liveExt, AsteriskConfigGenerator::DIALPLAN_BEGIN);
        $e = strpos($liveExt, AsteriskConfigGenerator::DIALPLAN_END);
        if ($b !== false && $e !== false && $e > $b) {
            $liveExt = substr($liveExt, 0, $b).substr($liveExt, $e + strlen(AsteriskConfigGenerator::DIALPLAN_END));
        }
        $handWritten = $this->contextNames($liveExt);
        $generated = $this->contextNames($dialplan['text']);

        foreach (array_intersect($generated, $handWritten) as $c) {
            $errors[] = "Generated context [{$c}] would duplicate a hand-written context in extensions.conf";
        }
        $known = array_merge($handWritten, $generated);
        foreach ($pjsip['endpoints'] as $ep) {
            if (!in_array($ep['context'], $known, true)) {
                $errors[] = "Endpoint {$ep['pjsip']} routes to context \"{$ep['context']}\" which does not exist in extensions.conf";
            }
            if ($ep['status'] === 'PROTECTED' && !in_array($ep['context'], $handWritten, true)) {
                $errors[] = AsteriskConfigGenerator::PROTECTED_MESSAGE." (context [{$ep['context']}] missing from extensions.conf)";
            }
        }

        return $errors;
    }

    /** Active generated routes that the owning trunk can never reach. */
    private function routeWarnings(array $endpoints, $routePrefixes, string $inboundContext): array
    {
        $byTrunk = [];
        foreach ($endpoints as $ep) {
            if ($ep['trunk_id'] !== null) {
                $byTrunk[$ep['trunk_id']] = $ep;
            }
        }
        $warnings = [];
        foreach ($routePrefixes as $r) {
            if (empty($r->is_active) || empty($r->trunk_id)) {
                continue;
            }
            $ep = $byTrunk[$r->trunk_id] ?? null;
            if ($ep === null) {
                $warnings[] = "Route \"{$r->prefix}\" (#{$r->id}) belongs to trunk #{$r->trunk_id} which has no generated endpoint";
            } elseif ($ep['context'] !== $inboundContext) {
                $warnings[] = "Route \"{$r->prefix}\" (#{$r->id}) belongs to {$ep['pjsip']}, whose context is \"{$ep['context']}\" (not \"{$inboundContext}\") — this generated route is not reachable from that trunk";
            }
        }

        return $warnings;
    }

    private function audioWarnings($ivrs): array
    {
        $dir = rtrim(config('asterisk.sounds_dir', '/usr/share/asterisk/sounds/custom'), '/');
        $warnings = [];
        foreach ($ivrs as $ivr) {
            if (!empty($ivr->is_active) && !glob($dir.'/'.$ivr->name.'.*')) {
                $warnings[] = "IVR \"{$ivr->name}\": no audio file {$ivr->name}.* found in {$dir}";
            }
        }

        return $warnings;
    }

    /** The "where does each supplier enter Asterisk" table for Preview. */
    private function buildRouting(array $pjsip, $routePrefixes, $didRanges, string $inboundContext): array
    {
        $rows = [];
        foreach ($pjsip['endpoints'] as $ep) {
            if ($ep['status'] === 'PROTECTED' || $ep['context'] !== $inboundContext) {
                // dynamic path: DIDs resolved by did_router.php from the dids table
                $ranges = $didRanges->where('trunk_id', $ep['trunk_id']);
                $prefixes = $ranges->pluck('prefix')->filter()->values()->all();
                $ivrList = $ranges->pluck('default_ivr')->filter()->unique()->values()->all();
                $source = 'did_router.php (dids table)';
            } else {
                $routes = $routePrefixes->where('trunk_id', $ep['trunk_id'])->where('is_active', 1);
                $prefixes = $routes->pluck('prefix')->values()->all();
                $ivrList = $routes->pluck('ivr_context')->unique()->values()->all();
                $source = 'number-routing (static route_prefixes)';
            }
            $rows[] = [
                'supplier' => $ep['supplier'],
                'pjsip' => $ep['pjsip'],
                'auth' => $ep['auth'],
                'context' => $ep['context'],
                'prefixes' => $prefixes,
                'ivrs' => $ivrList,
                'route_source' => $source,
                'max_channels' => $ep['max_channels'],
                'max_call_duration' => $ep['max_call_duration'],
                'status' => $ep['status'],
            ];
        }
        foreach ($pjsip['skipped'] as $why) {
            $rows[] = ['supplier' => $why, 'pjsip' => null, 'auth' => null, 'context' => null, 'prefixes' => [], 'ivrs' => [],
                'route_source' => null, 'max_channels' => null, 'max_call_duration' => null, 'status' => 'SKIPPED'];
        }

        return $rows;
    }

    private function extractManagedBlock(string $path, string $begin, string $end): string
    {
        if (!is_file($path)) {
            return '';
        }
        $live = file_get_contents($path);
        $b = strpos($live, $begin);
        $e = strpos($live, $end);
        if ($b === false || $e === false) {
            return '';
        }

        return substr($live, $b, $e - $b + strlen($end));
    }

    private function summarizeChanges(string $oldPjsip, string $newPjsip, string $oldDialplan, string $newDialplan): array
    {
        $bullets = [];
        $diffSections = function (string $old, string $new) {
            preg_match_all('/^\[([^\]]+)\]/m', $old, $om);
            preg_match_all('/^\[([^\]]+)\]/m', $new, $nm);
            $oldSet = array_unique($om[1]);
            $newSet = array_unique($nm[1]);
            $added = array_diff($newSet, $oldSet);
            $removed = array_diff($oldSet, $newSet);

            return [$added, $removed];
        };

        [$addedP, $removedP] = $diffSections($oldPjsip, $newPjsip);
        [$addedD, $removedD] = $diffSections($oldDialplan, $newDialplan);

        foreach ($addedP as $s) {
            $bullets[] = "+ Added {$s}";
        }
        foreach ($removedP as $s) {
            $bullets[] = "- Removed {$s}";
        }
        foreach ($addedD as $s) {
            $bullets[] = "+ Added {$s}";
        }
        foreach ($removedD as $s) {
            $bullets[] = "- Removed {$s}";
        }
        if (!$bullets && ($oldPjsip !== $newPjsip || $oldDialplan !== $newDialplan)) {
            $bullets[] = '~ Changed existing configuration (no sections added/removed)';
        }
        if (!$bullets) {
            $bullets[] = 'No changes detected';
        }

        return $bullets;
    }

    /**
     * Validate -> generate -> back up + write (privileged helper) -> reload ->
     * verify against the running Asterisk. Any failed verification restores the
     * backup and reloads. Nothing is written if validation reports an error
     * (including "Purple protected route detected").
     */
    public function apply(string $actorName, string $actorEmail): array
    {
        // Steps 1-2: validate + generate (same code path as Preview)
        $build = $this->build();
        if ($build['errors']) {
            return $this->recordHistory($actorName, $actorEmail, 'apply', 'failed', 'Apply blocked: '.implode('; ', $build['errors']));
        }
        $settings = $build['settings'];
        $pjsip = $build['pjsip'];
        $dialplan = $build['dialplan'];
        $oldPjsip = $build['livePjsip'];
        $oldDialplan = $build['liveDialplan'];

        // Step 3: static re-validation of the generated text (brackets/dupes)
        $staticErrors = $this->staticValidate($pjsip['text']);
        $staticErrors = array_merge($staticErrors, $this->staticValidate($dialplan['text']));
        if ($staticErrors) {
            return $this->recordHistory($actorName, $actorEmail, 'apply', 'failed', implode('; ', $staticErrors));
        }

        // Step 4+5: backup + atomic replace, via the privileged helper
        $job = [
            'action' => 'write',
            'pjsip_managed' => $pjsip['text'],
            'dialplan_managed' => $dialplan['text'],
            'rtp_start' => $settings->rtp_start,
            'rtp_end' => $settings->rtp_end,
        ];
        $result = $this->runHelper($job);
        if (!($result['success'] ?? false)) {
            return $this->recordHistory($actorName, $actorEmail, 'apply', 'failed', $result['error'] ?? 'helper failed');
        }
        $backupId = $result['backup_id'];

        // Step 6: reload
        exec("asterisk -rx 'module reload res_pjsip.so' 2>&1", $pjReload);
        exec("asterisk -rx 'dialplan reload' 2>&1", $dpReload);
        sleep(2);

        // Step 7: verify the RUNNING configuration
        $failures = $this->verifyLive($pjsip, $dialplan, $settings->inbound_context, array_merge($pjReload, $dpReload));

        if ($failures) {
            // Auto-revert
            $this->runHelper(['action' => 'restore', 'backup_id' => $backupId]);
            exec("asterisk -rx 'module reload res_pjsip.so' 2>&1");
            exec("asterisk -rx 'dialplan reload' 2>&1");
            sleep(1);
            $after = $this->verifyProtected($pjsip);

            return $this->recordHistory(
                $actorName, $actorEmail, 'apply', 'rolled_back',
                'Verification failed after apply ('.implode('; ', $failures).") — reverted to backup {$backupId}. Protected routes after restore: ".($after ?: 'unchanged'),
                $backupId
            );
        }

        // Step 8
        $settings->update(['updated_by' => $actorEmail]);
        $changeBullets = $this->summarizeChanges($oldPjsip, $pjsip['text'], $oldDialplan, $dialplan['text']);

        return $this->recordHistory($actorName, $actorEmail, 'apply', 'success', implode("\n", $changeBullets), $backupId);
    }

    /** `asterisk -rx` helper; the command is a fixed string built from validated names. */
    private function cli(string $command): string
    {
        $out = [];
        exec('asterisk -rx '.escapeshellarg($command).' 2>&1', $out);

        return implode("\n", $out);
    }

    private function contextMissing(string $cliOutput): bool
    {
        // Asterisk prints "There is no existence of '<ctx>' context" (older builds: "No such context").
        return str_contains($cliOutput, 'There is no existence of') || str_contains($cliOutput, 'No such context') || trim($cliOutput) === '';
    }

    /** Failures for protected endpoints only (also used after a restore). */
    private function verifyProtected(array $pjsip): string
    {
        $problems = [];
        foreach ($pjsip['endpoints'] as $ep) {
            if ($ep['status'] !== 'PROTECTED') {
                continue;
            }
            $endpoint = $this->cli("pjsip show endpoint {$ep['pjsip']}");
            $ctx = preg_match('/^\s*context\s*:\s*(\S*)/m', $endpoint, $m) ? $m[1] : '(not found)';
            if ($ctx !== $ep['context']) {
                $problems[] = "{$ep['pjsip']} context is \"{$ctx}\", expected \"{$ep['context']}\"";
            }
            $identify = $this->cli("pjsip show identify {$ep['pjsip']}-identify");
            foreach ($ep['ips'] as $ip) {
                if (!str_contains($identify, "Match: {$ip}/")) {
                    $problems[] = "{$ep['pjsip']} identify IP {$ip} missing";
                }
            }
        }

        return implode('; ', $problems);
    }

    /**
     * Post-reload checks against the running Asterisk. Returns a list of
     * failures (empty = verified).
     */
    private function verifyLive(array $pjsip, array $dialplan, string $inboundContext, array $reloadOutput): array
    {
        $failures = [];

        foreach ($reloadOutput as $l) {
            if (preg_match('/\b(ERROR|Failed|Invalid)\b/i', $l)) {
                $failures[] = 'reload reported: '.trim($l);
            }
        }

        $identifies = $this->cli('pjsip show identifies');
        $found = preg_match('/Objects found: (\d+)/', $identifies, $m) ? (int) $m[1] : 0;
        if ($found < $pjsip['identify_count']) {
            $failures[] = "identifies {$found}/{$pjsip['identify_count']}";
        }

        // Every active endpoint (protected ones included) must have its expected context.
        foreach ($pjsip['endpoints'] as $ep) {
            $out = $this->cli("pjsip show endpoint {$ep['pjsip']}");
            $ctx = preg_match('/^\s*context\s*:\s*(\S*)/m', $out, $m) ? $m[1] : '(not found)';
            if ($ctx !== $ep['context']) {
                $failures[] = "{$ep['pjsip']} context \"{$ctx}\" != expected \"{$ep['context']}\"";
            }
        }
        if ($protected = $this->verifyProtected($pjsip)) {
            $failures[] = 'PROTECTED ROUTE CHANGED: '.$protected;
        }

        // Contexts the generated routing and every endpoint depend on.
        $contexts = array_unique(array_merge(
            [$inboundContext, 'number-routing', 'supplier-limits'],
            array_column($pjsip['endpoints'], 'context')
        ));
        foreach ($contexts as $ctx) {
            if ($this->contextMissing($this->cli("dialplan show {$ctx}"))) {
                $failures[] = "dialplan context [{$ctx}] missing";
            }
        }

        return $failures;
    }

    private function staticValidate(string $text): array
    {
        $errors = [];
        $opens = substr_count($text, '[');
        $closes = substr_count($text, ']');
        if ($opens !== $closes) {
            $errors[] = 'Malformed config: unbalanced section brackets';
        }
        preg_match_all('/^\[([^\]]+)\]/m', $text, $m);
        $dupes = array_filter(array_count_values($m[1]), fn ($n) => $n > 1);
        if ($dupes) {
            $errors[] = 'Duplicate section(s): '.implode(', ', array_keys($dupes));
        }

        return $errors;
    }

    private function runHelper(array $job): array
    {
        $stagingDir = config('asterisk.staging_dir');
        if (!is_dir($stagingDir)) {
            return ['success' => false, 'error' => 'staging directory missing: '.$stagingDir];
        }
        file_put_contents($stagingDir.'/job.json', json_encode($job));
        chmod($stagingDir.'/job.json', 0640);

        $script = config('asterisk.apply_script');
        exec('sudo -n /usr/bin/php '.escapeshellarg($script).' 2>&1', $out, $exit);
        $last = end($out) ?: '{}';
        $decoded = json_decode($last, true);

        return is_array($decoded) ? $decoded : ['success' => false, 'error' => 'helper returned no valid result: '.implode("\n", $out)];
    }

    public function reloadPjsip(string $actorName, string $actorEmail): array
    {
        exec("asterisk -rx 'module reload res_pjsip.so' 2>&1", $out, $rc);

        return $this->recordHistory($actorName, $actorEmail, 'reload_pjsip', $rc === 0 ? 'success' : 'failed', implode("\n", $out));
    }

    public function reloadDialplan(string $actorName, string $actorEmail): array
    {
        exec("asterisk -rx 'dialplan reload' 2>&1", $out, $rc);

        return $this->recordHistory($actorName, $actorEmail, 'reload_dialplan', $rc === 0 ? 'success' : 'failed', implode("\n", $out));
    }

    public function reloadAll(string $actorName, string $actorEmail): array
    {
        exec("asterisk -rx 'module reload res_pjsip.so' 2>&1", $out1, $rc1);
        exec("asterisk -rx 'dialplan reload' 2>&1", $out2, $rc2);

        return $this->recordHistory($actorName, $actorEmail, 'reload_all', ($rc1 === 0 && $rc2 === 0) ? 'success' : 'failed', implode("\n", array_merge($out1, $out2)));
    }

    public function testConfiguration(): array
    {
        $settings = AsteriskSetting::current();
        $rtpErrors = $this->generator->validateRtp($settings->rtp_start, $settings->rtp_end);
        $prefixValidation = $this->generator->validatePrefixes(DB::table('route_prefixes')->get());

        exec("asterisk -rx 'core show version' 2>/dev/null", $versionOut, $versionRc);
        exec("asterisk -rx 'pjsip show endpoints' 2>/dev/null", $epOut);

        return [
            'asterisk_reachable' => $versionRc === 0,
            'version' => $versionOut[0] ?? null,
            'endpoint_count' => count(preg_grep('/^\s*Endpoint:/', $epOut)),
            'errors' => array_merge($rtpErrors, $prefixValidation['errors']),
            'warnings' => $prefixValidation['warnings'],
        ];
    }

    public function rollback(int $historyId, string $actorName, string $actorEmail): array
    {
        $entry = AsteriskConfigHistory::find($historyId);
        if (!$entry || !$entry->pjsip_backup_path) {
            return $this->recordHistory($actorName, $actorEmail, 'rollback', 'failed', "History #{$historyId} has no backup to restore");
        }

        $result = $this->runHelper(['action' => 'restore', 'backup_id' => $entry->pjsip_backup_path]);
        if (!($result['success'] ?? false)) {
            return $this->recordHistory($actorName, $actorEmail, 'rollback', 'failed', $result['error'] ?? 'helper failed');
        }

        exec("asterisk -rx 'module reload res_pjsip.so' 2>&1");
        exec("asterisk -rx 'dialplan reload' 2>&1");

        return $this->recordHistory($actorName, $actorEmail, 'rollback', 'success', "Restored backup {$entry->pjsip_backup_path} (safety snapshot {$result['safety_backup_id']})", $result['safety_backup_id']);
    }

    private function recordHistory(string $actorName, string $actorEmail, string $action, string $status, string $summary, ?string $backupId = null): array
    {
        $history = AsteriskConfigHistory::create([
            'user_name' => $actorName,
            'user_email' => $actorEmail,
            'action' => $action,
            'summary' => $summary,
            'status' => $status,
            'pjsip_backup_path' => $backupId,
            'extensions_backup_path' => $backupId,
        ]);

        return [
            'success' => $status === 'success',
            'status' => $status,
            'summary' => $summary,
            'history_id' => $history->id,
        ];
    }
}
