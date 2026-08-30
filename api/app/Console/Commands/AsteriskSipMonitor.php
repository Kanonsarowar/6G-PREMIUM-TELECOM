<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use PAMI\Client\Impl\ClientImpl;

class AsteriskSipMonitor extends Command
{
    protected $signature = 'asterisk:sip-monitor';
    protected $description = 'Real-time SIP INVITE monitor from Asterisk AMI';

    public function handle()
    {
        $options = [
            'host' => '127.0.0.1',
            'scheme' => 'tcp://',
            'port' => 5038,
            'username' => 'laravel',
            'secret' => 'StrongPasswordHere',
            'connect_timeout' => 10000,
            'read_timeout' => 10000,
        ];

        $client = new ClientImpl($options);
        $client->open();

        $client->registerEventListener(function ($event) {
            if ($event->getName() === 'Newchannel') {
                if (str_contains($event->getChannel(), 'SIP') ||
                    str_contains($event->getChannel(), 'PJSIP')) {

                    broadcast(new \App\Events\SipInviteEvent([
                        'caller' => $event->getCallerIDNum(),
                        'callee' => $event->getExten(),
                        'channel' => $event->getChannel(),
                        'timestamp' => now()->toDateTimeString(),
                    ]));
                }
            }
        });

        while (true) {
            $client->process();
            usleep(1000);
        }
    }
}
