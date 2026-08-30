<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Models\LiveCall;
use App\Models\SipInvite;
use App\Models\AmiEvent;
use App\Services\SipInviteParser;
use App\Services\PddCalculator;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Event;

class AmiListener extends Command
{
    protected $signature = 'ami:listen';
    protected $description = 'Listen to Asterisk AMI events and update live calls';

    public function handle()
    {
        $socket = fsockopen(env('ASTERISK_AMI_HOST'), env('ASTERISK_AMI_PORT'));
        fputs($socket, "Action: Login\r\nUsername: ".env('ASTERISK_AMI_USER')."\r\nSecret: ".env('ASTERISK_AMI_PASS')."\r\n\r\n");

        while (!feof($socket)) {
            $line = trim(fgets($socket));

            if (str_starts_with($line, "Event: Newchannel")) {
                $event = $this->readEvent($socket);
                $this->handleNewChannel($event);
            }

            if (str_starts_with($line, "Event: DialBegin")) {
                $event = $this->readEvent($socket);
                $this->handleDialBegin($event);
            }

            if (str_starts_with($line, "Event: DialEnd")) {
                $event = $this->readEvent($socket);
                $this->handleDialEnd($event);
            }

            if (str_starts_with($line, "Event: Hangup")) {
                $event = $this->readEvent($socket);
                $this->handleHangup($event);
            }
        }
    }

    private function readEvent($socket)
    {
        $data = [];
        while (($line = trim(fgets($socket))) !== "") {
            [$k, $v] = array_pad(explode(": ", $line, 2), 2, null);
            $data[$k] = $v;
        }
        return $data;
    }

    private function handleNewChannel($e)
    {
        AmiEvent::create(['uniqueid' => $e['Uniqueid'], 'event' => 'Newchannel']);

        LiveCall::updateOrCreate(
            ['uniqueid' => $e['Uniqueid']],
            [
                'caller' => $e['CallerIDNum'] ?? '',
                'callee' => '',
                'status' => 'New',
                'duration' => '00:00'
            ]
        );
    }

    private function handleDialBegin($e)
    {
        AmiEvent::create(['uniqueid' => $e['Uniqueid'], 'event' => 'DialBegin']);

        LiveCall::where('uniqueid', $e['Uniqueid'])
            ->update([
                'callee' => $e['DialString'] ?? '',
                'status' => 'Ringing'
            ]);
    }

    private function handleDialEnd($e)
    {
        AmiEvent::create(['uniqueid' => $e['Uniqueid'], 'event' => 'DialEnd']);

        if (($e['DialStatus'] ?? '') === 'ANSWER') {
            LiveCall::where('uniqueid', $e['Uniqueid'])
                ->update(['status' => 'Answered']);
        }
    }

    private function handleHangup($e)
    {
        AmiEvent::create(['uniqueid' => $e['Uniqueid'], 'event' => 'Hangup']);

        LiveCall::where('uniqueid', $e['Uniqueid'])->delete();
    }
}
