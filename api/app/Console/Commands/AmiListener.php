<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Models\LiveCall;
use App\Models\AmiEvent;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class AmiListener extends Command
{
    protected $signature = 'ami:listen';
    protected $description = 'Listen to Asterisk AMI events and track every inbound supplier call (New/Ringing/Answered/Busy/No Answer/Cancelled/Congestion/Rejected/Hangup)';

    /** DialStatus (DialEnd event) -> display status */
    private const DIAL_STATUS_MAP = [
        'ANSWER'      => 'Answered',
        'BUSY'        => 'Busy',
        'NOANSWER'    => 'No Answer',
        'CANCEL'      => 'Cancelled',
        'CONGESTION'  => 'Congestion',
        'CHANUNAVAIL' => 'Unavailable',
        'DONTCALL'    => 'Rejected',
        'TORTURE'     => 'Rejected',
        'INVALIDARGS' => 'Failed',
    ];

    /** Hangup Cause code -> display status, used when a channel never reached DialEnd */
    private const HANGUP_CAUSE_MAP = [
        1  => 'Rejected',    // Unallocated number
        16 => 'Cancelled',   // Normal clearing (caller hung up before answer)
        17 => 'Busy',        // User busy
        18 => 'No Answer',   // No user responding
        19 => 'No Answer',   // No answer from user
        21 => 'Rejected',    // Call rejected
        34 => 'Congestion',  // No circuit/channel available
        38 => 'Congestion',  // Network out of order
        42 => 'Congestion',  // Switching equipment congestion
        44 => 'Congestion',  // Requested channel unavailable
    ];

    /** Seconds between checks for calls whose Hangup event never arrived */
    private const SWEEP_EVERY = 60;

    private int $lastSweep = 0;

    public function handle()
    {
        while (true) {
            $socket = @fsockopen(env('ASTERISK_AMI_HOST', '127.0.0.1'), env('ASTERISK_AMI_PORT', 5038), $errno, $errstr, 5);

            if (!$socket) {
                Log::error("ami:listen could not connect to AMI: {$errstr} ({$errno})");
                sleep(5);
                continue;
            }

            fputs($socket, "Action: Login\r\nUsername: " . env('ASTERISK_AMI_USER') . "\r\nSecret: " . env('ASTERISK_AMI_PASS') . "\r\nEvents: call\r\n\r\n");
            // Wake up regularly even when no calls come in, so stale rows get swept
            // and a dead connection is noticed (a Ping on it fails and we reconnect).
            stream_set_timeout($socket, self::SWEEP_EVERY);

            while (!feof($socket)) {
                if (time() - $this->lastSweep >= self::SWEEP_EVERY) {
                    $this->sweepStaleCalls();
                }

                $line = fgets($socket);
                if ($line === false) {
                    if (stream_get_meta_data($socket)['timed_out'] && @fputs($socket, "Action: Ping\r\n\r\n")) {
                        continue;
                    }
                    break;
                }
                $line = trim($line);

                // Exact matches: "Event: Hangup" must not also catch HangupRequest / HangupHandler*
                if ($line === "Event: Newchannel") {
                    // Read the supplier list fresh for every new call so a renamed supplier applies immediately
                    $this->handleNewChannel($this->readEvent($socket), DB::table('trunks')->get());
                } elseif ($line === "Event: Newstate") {
                    $this->handleNewState($this->readEvent($socket));
                } elseif ($line === "Event: DialBegin") {
                    $this->handleDialBegin($this->readEvent($socket));
                } elseif ($line === "Event: DialEnd") {
                    $this->handleDialEnd($this->readEvent($socket));
                } elseif ($line === "Event: Hangup") {
                    $this->handleHangup($this->readEvent($socket));
                }
            }

            fclose($socket);
            Log::warning('ami:listen lost connection to AMI, reconnecting in 5s');
            sleep(5);
        }
    }

    private function readEvent($socket): array
    {
        $data = [];
        while (($line = fgets($socket)) !== false) {
            $line = trim($line);
            if ($line === "") {
                break;
            }
            [$k, $v] = array_pad(explode(": ", $line, 2), 2, null);
            $data[$k] = $v;
        }
        return $data;
    }

    /** Only track real SIP/PJSIP channels (skips internal Local/dialplan legs) */
    private function isSipChannel(?string $channel): bool
    {
        return $channel && (str_contains($channel, 'SIP') || str_contains($channel, 'PJSIP'));
    }

    private function detectTrunk(string $channel, $trunks)
    {
        foreach ($trunks as $t) {
            if (($t->pjsip_name && stripos($channel, $t->pjsip_name) !== false)
                || stripos($channel, $t->name) !== false) {
                return $t;
            }
        }
        return null;
    }

    private function handleNewChannel(array $e, $trunks)
    {
        $channel = $e['Channel'] ?? '';
        if (!$this->isSipChannel($channel) || empty($e['Uniqueid'])) {
            return;
        }

        AmiEvent::create(['uniqueid' => $e['Uniqueid'], 'event' => 'Newchannel']);

        $trunk = $this->detectTrunk($channel, $trunks);
        // The dialled DID is the extension on the carrier leg ('s' once it has moved into an IVR context)
        $exten = $e['Exten'] ?? '';
        $dst = ($exten !== '' && $exten !== 's') ? $exten : null;

        LiveCall::updateOrCreate(
            ['uniqueid' => $e['Uniqueid']],
            [
                'caller'     => $e['CallerIDNum'] ?? '',
                'callee'     => '',
                'src'        => $e['CallerIDNum'] ?? '',
                'dst'        => $dst,
                'channel'    => $channel,
                'trunk_name' => $trunk->nickname ?? $trunk->name ?? null,
                'status'     => 'New',
                'duration'   => 0,
                'ended_at'   => null,
                'hangup_cause' => null,
            ]
        );
    }

    /**
     * Channel went Up = the call was answered. Calls routed straight into an IVR
     * (Answer + Playback) never Dial anywhere, so there is no DialEnd to tell us.
     */
    private function handleNewState(array $e)
    {
        if (empty($e['Uniqueid']) || ($e['ChannelState'] ?? '') !== '6') {
            return;
        }

        AmiEvent::create(['uniqueid' => $e['Uniqueid'], 'event' => 'Newstate']);

        LiveCall::where('uniqueid', $e['Uniqueid'])
            ->whereIn('status', ['New', 'Ringing'])
            ->update(['status' => 'Answered']);
    }

    private function handleDialBegin(array $e)
    {
        if (empty($e['Uniqueid'])) {
            return;
        }

        AmiEvent::create(['uniqueid' => $e['Uniqueid'], 'event' => 'DialBegin']);

        $call = LiveCall::where('uniqueid', $e['Uniqueid'])->first();
        if (!$call) {
            return;
        }
        $update = ['callee' => $e['DialString'] ?? ($e['DestExten'] ?? '')];
        if (!$call->dst && !empty($e['DestExten'])) {
            $update['dst'] = $e['DestExten'];
        }
        if ($call->status === 'New') {
            $update['status'] = 'Ringing';
        }
        $call->update($update);
    }

    private function handleDialEnd(array $e)
    {
        if (empty($e['Uniqueid'])) {
            return;
        }

        AmiEvent::create(['uniqueid' => $e['Uniqueid'], 'event' => 'DialEnd']);

        $status = self::DIAL_STATUS_MAP[$e['DialStatus'] ?? ''] ?? null;
        if ($status) {
            LiveCall::where('uniqueid', $e['Uniqueid'])->update(['status' => $status]);
        }
    }

    private function handleHangup(array $e)
    {
        if (empty($e['Uniqueid'])) {
            return;
        }

        AmiEvent::create(['uniqueid' => $e['Uniqueid'], 'event' => 'Hangup']);

        $call = LiveCall::where('uniqueid', $e['Uniqueid'])->first();
        if (!$call || $call->ended_at) {
            return;
        }

        $cause = isset($e['Cause']) ? (int) $e['Cause'] : null;
        $causeTxt = $e['Cause-txt'] ?? null;

        if ($call->status === 'Answered') {
            $finalStatus = 'Hangup';
        } elseif (in_array($call->status, array_values(self::DIAL_STATUS_MAP), true)) {
            $finalStatus = $call->status;
        } else {
            $finalStatus = self::HANGUP_CAUSE_MAP[$cause] ?? 'Rejected';
        }

        $call->update([
            'status'       => $finalStatus,
            'ended_at'     => now(),
            'hangup_cause' => $causeTxt,
            'duration'     => $call->created_at ? now()->diffInSeconds($call->created_at) : 0,
        ]);
    }

    /**
     * Close calls still open in live_calls that Asterisk no longer has (their
     * Hangup event was missed), using Asterisk's own CDR for the real outcome.
     */
    private function sweepStaleCalls(): void
    {
        $this->lastSweep = time();

        $open = LiveCall::whereNull('ended_at')
            ->where('created_at', '<', now()->subMinutes(2))
            ->get();
        if ($open->isEmpty()) {
            return;
        }

        $out = [];
        exec("asterisk -rx 'core show channels concise' 2>/dev/null", $out, $rc);
        if ($rc !== 0) {
            return;   // Asterisk unreachable: can't tell which calls are really gone
        }
        $alive = [];
        foreach ($out as $l) {
            $p = explode('!', $l);
            if (isset($p[13])) {
                $alive[trim($p[13])] = true;
            }
        }

        $cdr = $this->readCdrs();
        foreach ($open as $call) {
            if (isset($alive[$call->uniqueid])) {
                continue;
            }
            $row = $cdr[$call->uniqueid] ?? null;
            $update = ['ended_at' => $row['end'] ?? now()];
            if ($row) {
                $update['duration'] = $row['duration'];
                $update['billsec'] = $row['billsec'];
                $update['dst'] = $call->dst ?: $row['dst'];
                $update['status'] = match ($row['disposition']) {
                    'ANSWERED'   => 'Hangup',
                    'BUSY'       => 'Busy',
                    'NO ANSWER'  => 'No Answer',
                    'CONGESTION' => 'Congestion',
                    default      => 'Rejected',
                };
            } else {
                $update['status'] = $call->status === 'Answered' ? 'Hangup' : 'Cancelled';
            }
            $update['hangup_cause'] = $call->hangup_cause ?: 'Hangup event missed (closed from CDR)';
            $call->update($update);
        }
    }

    /** uniqueid => outcome, from the tail of Asterisk's Master.csv CDR log */
    private function readCdrs(): array
    {
        $file = '/var/log/asterisk/cdr-csv/Master.csv';
        $rows = [];
        if (!is_readable($file)) {
            return $rows;
        }
        exec('tail -n 2000 ' . escapeshellarg($file), $lines);
        foreach ($lines as $l) {
            $f = str_getcsv($l);
            if (count($f) < 17 || $f[16] === '') {
                continue;
            }
            $rows[$f[16]] = [
                'dst'         => $f[2],
                'end'         => $f[11] ?: null,
                'duration'    => (int) $f[12],
                'billsec'     => (int) $f[13],
                'disposition' => $f[14],
            ];
        }
        return $rows;
    }
}
