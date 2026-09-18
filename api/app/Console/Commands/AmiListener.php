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

    public function handle()
    {
        $trunks = DB::table('trunks')->get();

        while (true) {
            $socket = @fsockopen(env('ASTERISK_AMI_HOST', '127.0.0.1'), env('ASTERISK_AMI_PORT', 5038), $errno, $errstr, 5);

            if (!$socket) {
                Log::error("ami:listen could not connect to AMI: {$errstr} ({$errno})");
                sleep(5);
                continue;
            }

            fputs($socket, "Action: Login\r\nUsername: " . env('ASTERISK_AMI_USER') . "\r\nSecret: " . env('ASTERISK_AMI_PASS') . "\r\nEvents: call\r\n\r\n");

            while (!feof($socket)) {
                $line = fgets($socket);
                if ($line === false) {
                    break;
                }
                $line = trim($line);

                if (str_starts_with($line, "Event: Newchannel")) {
                    $this->handleNewChannel($this->readEvent($socket), $trunks);
                } elseif (str_starts_with($line, "Event: DialBegin")) {
                    $this->handleDialBegin($this->readEvent($socket));
                } elseif (str_starts_with($line, "Event: DialEnd")) {
                    $this->handleDialEnd($this->readEvent($socket));
                } elseif (str_starts_with($line, "Event: Hangup")) {
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

        LiveCall::updateOrCreate(
            ['uniqueid' => $e['Uniqueid']],
            [
                'caller'     => $e['CallerIDNum'] ?? '',
                'callee'     => '',
                'src'        => $e['CallerIDNum'] ?? '',
                'channel'    => $channel,
                'trunk_name' => $trunk->nickname ?? $trunk->name ?? null,
                'status'     => 'New',
                'duration'   => 0,
                'ended_at'   => null,
                'hangup_cause' => null,
            ]
        );
    }

    private function handleDialBegin(array $e)
    {
        if (empty($e['Uniqueid'])) {
            return;
        }

        AmiEvent::create(['uniqueid' => $e['Uniqueid'], 'event' => 'DialBegin']);

        LiveCall::where('uniqueid', $e['Uniqueid'])->update([
            'callee' => $e['DialString'] ?? ($e['DestExten'] ?? ''),
            'dst'    => $e['DestExten'] ?? null,
            'status' => 'Ringing',
        ]);
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
        if (!$call) {
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
}
