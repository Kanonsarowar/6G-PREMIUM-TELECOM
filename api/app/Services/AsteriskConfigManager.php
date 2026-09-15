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
     * Read-only: generates the three config blocks and diffs them against
     * what's currently live. Never touches the filesystem.
     */
    public function preview(): array
    {
        $settings = AsteriskSetting::current();
        $trunks = DB::table('trunks')->get();
        $routePrefixes = DB::table('route_prefixes')->get();
        $ivrs = DB::table('ivrs')->get();

        $pjsip = $this->generator->pjsipManagedBlock($trunks, $settings->inbound_context, $settings->codecs);
        $dialplan = $this->generator->dialplanManagedBlock($routePrefixes, $ivrs, $settings->inbound_context);
        $rtp = $this->generator->rtpConf($settings->rtp_start, $settings->rtp_end);

        $livePjsip = $this->extractManagedBlock(config('asterisk.pjsip_conf'), AsteriskConfigGenerator::PJSIP_BEGIN, AsteriskConfigGenerator::PJSIP_END);
        $liveDialplan = $this->extractManagedBlock(config('asterisk.extensions_conf'), AsteriskConfigGenerator::DIALPLAN_BEGIN, AsteriskConfigGenerator::DIALPLAN_END);

        return [
            'pjsip' => $pjsip['text'],
            'dialplan' => $dialplan['text'],
            'rtp' => $rtp,
            'errors' => $dialplan['errors'],
            'warnings' => array_merge($pjsip['warnings'], $dialplan['warnings']),
            'skipped_suppliers' => $pjsip['skipped'],
            'changes' => $this->summarizeChanges($livePjsip, $pjsip['text'], $liveDialplan, $dialplan['text']),
        ];
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
     * Step 1-8 of the spec's Apply flow. Returns success/failure + summary.
     */
    public function apply(string $actorName, string $actorEmail): array
    {
        $settings = AsteriskSetting::current();
        $trunks = DB::table('trunks')->get();
        $routePrefixes = DB::table('route_prefixes')->get();
        $ivrs = DB::table('ivrs')->get();

        // Step 1: validate
        $rtpErrors = $this->generator->validateRtp($settings->rtp_start, $settings->rtp_end);
        $prefixValidation = $this->generator->validatePrefixes($routePrefixes);
        $errors = array_merge($rtpErrors, $prefixValidation['errors']);
        if ($errors) {
            return $this->recordHistory($actorName, $actorEmail, 'apply', 'failed', implode('; ', $errors));
        }

        // Step 2: generate
        $oldPjsip = $this->extractManagedBlock(config('asterisk.pjsip_conf'), AsteriskConfigGenerator::PJSIP_BEGIN, AsteriskConfigGenerator::PJSIP_END);
        $oldDialplan = $this->extractManagedBlock(config('asterisk.extensions_conf'), AsteriskConfigGenerator::DIALPLAN_BEGIN, AsteriskConfigGenerator::DIALPLAN_END);
        $pjsip = $this->generator->pjsipManagedBlock($trunks, $settings->inbound_context, $settings->codecs);
        $dialplan = $this->generator->dialplanManagedBlock($routePrefixes, $ivrs, $settings->inbound_context);

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
        exec("asterisk -rx 'module reload res_pjsip.so' 2>&1");
        exec("asterisk -rx 'dialplan reload' 2>&1");
        sleep(2);

        // Step 7: verify
        exec("asterisk -rx 'pjsip show identifies' 2>/dev/null", $identOut);
        $found = 0;
        foreach ($identOut as $l) {
            if (preg_match('/Objects found: (\d+)/', $l, $m)) {
                $found = (int) $m[1];
            }
        }
        exec("asterisk -rx 'dialplan show number-routing' 2>/dev/null", $dpOut);
        $dialplanOk = !str_contains(implode("\n", $dpOut), 'No such context');

        if ($found < $pjsip['identify_count'] || !$dialplanOk) {
            // Auto-revert
            $this->runHelper(['action' => 'restore', 'backup_id' => $backupId]);
            exec("asterisk -rx 'module reload res_pjsip.so' 2>&1");
            exec("asterisk -rx 'dialplan reload' 2>&1");

            return $this->recordHistory(
                $actorName, $actorEmail, 'apply', 'rolled_back',
                "Verification failed after apply (identifies {$found}/{$pjsip['identify_count']}, dialplan ".($dialplanOk ? 'ok' : 'missing').") — reverted to backup {$backupId}",
                $backupId
            );
        }

        // Step 8
        $settings->update(['updated_by' => $actorEmail]);
        $changeBullets = $this->summarizeChanges($oldPjsip, $pjsip['text'], $oldDialplan, $dialplan['text']);

        return $this->recordHistory($actorName, $actorEmail, 'apply', 'success', implode("\n", $changeBullets), $backupId);
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
