<?php

namespace App\Http\Controllers;

use App\Models\AsteriskConfigHistory;
use App\Models\AsteriskSetting;
use App\Services\AsteriskConfigManager;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AsteriskConfigController extends Controller
{
    public function __construct(private AsteriskConfigManager $manager)
    {
    }

    private function requireSuperadmin(Request $r)
    {
        if ($r->user()->role !== 'superadmin') {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        return null;
    }

    private function audit(Request $r, string $action, string $details): void
    {
        DB::table('audit_logs')->insert([
            'user' => $r->user()->name,
            'role' => $r->user()->role ?? 'unknown',
            'action' => $action,
            'module' => 'Asterisk Configuration',
            'details' => $details,
            'ip_address' => $r->ip(),
            'method' => $r->method(),
            'url' => $r->path(),
            'status_code' => 200,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    public function status(Request $r)
    {
        if ($deny = $this->requireSuperadmin($r)) {
            return $deny;
        }

        return response()->json(['data' => $this->manager->detectStatus()]);
    }

    public function generalShow(Request $r)
    {
        if ($deny = $this->requireSuperadmin($r)) {
            return $deny;
        }

        return response()->json(['data' => AsteriskSetting::current()]);
    }

    public function generalUpdate(Request $r)
    {
        if ($deny = $this->requireSuperadmin($r)) {
            return $deny;
        }
        $settings = AsteriskSetting::current();
        $settings->update([
            'codecs' => $r->codecs ?: $settings->codecs,
            'inbound_context' => $r->inbound_context ?: $settings->inbound_context,
            'sip_port' => is_numeric($r->sip_port) ? (int) $r->sip_port : $settings->sip_port,
            'public_ip_override' => $r->public_ip_override,
            'updated_by' => $r->user()->email,
        ]);
        $this->audit($r, 'UPDATE_GENERAL', 'Updated Asterisk general settings');

        return response()->json(['data' => $settings->fresh(), 'success' => true]);
    }

    public function rtpShow(Request $r)
    {
        if ($deny = $this->requireSuperadmin($r)) {
            return $deny;
        }

        return response()->json(['data' => AsteriskSetting::current()]);
    }

    public function rtpUpdate(Request $r)
    {
        if ($deny = $this->requireSuperadmin($r)) {
            return $deny;
        }
        $start = (int) $r->rtp_start;
        $end = (int) $r->rtp_end;
        $errors = app(\App\Services\AsteriskConfigGenerator::class)->validateRtp($start, $end);
        if ($errors) {
            return response()->json(['error' => implode('; ', $errors)], 422);
        }
        $settings = AsteriskSetting::current();
        $settings->update(['rtp_start' => $start, 'rtp_end' => $end, 'updated_by' => $r->user()->email]);
        $this->audit($r, 'UPDATE_RTP', "Set RTP range to {$start}-{$end} (staged — requires Apply Configuration)");

        return response()->json(['data' => $settings->fresh(), 'success' => true, 'note' => 'Saved. Click Apply Configuration to push this to Asterisk, then reload Asterisk fully (RTP range is read at startup).']);
    }

    public function firewallInfo(Request $r)
    {
        if ($deny = $this->requireSuperadmin($r)) {
            return $deny;
        }
        exec('ufw status numbered 2>/dev/null', $ufw);
        $rules = [];
        foreach ($ufw as $line) {
            if (preg_match('/\[\s*(\d+)\]\s+(.+?)\s+(ALLOW|DENY)\s+IN\s+(.+)/', $line, $m)) {
                $rules[] = ['num' => (int) $m[1], 'port' => trim($m[2]), 'action' => $m[3], 'from' => trim($m[4])];
            }
        }

        return response()->json(['data' => ['firewall_rules' => $rules]]);
    }

    public function preview(Request $r)
    {
        if ($deny = $this->requireSuperadmin($r)) {
            return $deny;
        }

        return response()->json(['data' => $this->manager->preview()]);
    }

    public function apply(Request $r)
    {
        if ($deny = $this->requireSuperadmin($r)) {
            return $deny;
        }
        $result = $this->manager->apply($r->user()->name, $r->user()->email);
        $this->audit($r, 'APPLY_CONFIG', $result['summary'] ?? '');

        return response()->json(['data' => $result]);
    }

    public function reloadPjsip(Request $r)
    {
        if ($deny = $this->requireSuperadmin($r)) {
            return $deny;
        }
        $result = $this->manager->reloadPjsip($r->user()->name, $r->user()->email);
        $this->audit($r, 'RELOAD_PJSIP', $result['summary'] ?? '');

        return response()->json(['data' => $result]);
    }

    public function reloadDialplan(Request $r)
    {
        if ($deny = $this->requireSuperadmin($r)) {
            return $deny;
        }
        $result = $this->manager->reloadDialplan($r->user()->name, $r->user()->email);
        $this->audit($r, 'RELOAD_DIALPLAN', $result['summary'] ?? '');

        return response()->json(['data' => $result]);
    }

    public function reloadAll(Request $r)
    {
        if ($deny = $this->requireSuperadmin($r)) {
            return $deny;
        }
        $result = $this->manager->reloadAll($r->user()->name, $r->user()->email);
        $this->audit($r, 'RELOAD_ALL', $result['summary'] ?? '');

        return response()->json(['data' => $result]);
    }

    public function testConfiguration(Request $r)
    {
        if ($deny = $this->requireSuperadmin($r)) {
            return $deny;
        }

        return response()->json(['data' => $this->manager->testConfiguration()]);
    }

    public function historyIndex(Request $r)
    {
        if ($deny = $this->requireSuperadmin($r)) {
            return $deny;
        }

        return response()->json(['data' => AsteriskConfigHistory::orderByDesc('id')->limit(200)->get()]);
    }

    public function historyShow(Request $r, $id)
    {
        if ($deny = $this->requireSuperadmin($r)) {
            return $deny;
        }
        $entry = AsteriskConfigHistory::findOrFail($id);

        return response()->json(['data' => $entry]);
    }

    public function historyDownload(Request $r, $id)
    {
        if ($deny = $this->requireSuperadmin($r)) {
            return $deny;
        }
        $entry = AsteriskConfigHistory::findOrFail($id);
        $backupId = $entry->pjsip_backup_path;
        if (!$backupId) {
            return response()->json(['error' => 'No backup for this history entry'], 404);
        }
        $dir = rtrim(config('asterisk.backups_dir'), '/').'/'.basename($backupId);
        if (!is_dir($dir)) {
            return response()->json(['error' => 'Backup files no longer exist on disk'], 404);
        }
        $zipPath = sys_get_temp_dir().'/asterisk-backup-'.basename($backupId).'.zip';
        $zip = new \ZipArchive();
        $zip->open($zipPath, \ZipArchive::CREATE | \ZipArchive::OVERWRITE);
        foreach (glob($dir.'/*') as $f) {
            $zip->addFile($f, basename($f));
        }
        $zip->close();
        $this->audit($r, 'DOWNLOAD_BACKUP', "Downloaded backup {$backupId} (history #{$id})");

        return response()->download($zipPath, "asterisk-backup-{$backupId}.zip")->deleteFileAfterSend(true);
    }

    public function rollback(Request $r, $id)
    {
        if ($deny = $this->requireSuperadmin($r)) {
            return $deny;
        }
        $result = $this->manager->rollback((int) $id, $r->user()->name, $r->user()->email);
        $this->audit($r, 'ROLLBACK_CONFIG', $result['summary'] ?? '');

        return response()->json(['data' => $result]);
    }
}
