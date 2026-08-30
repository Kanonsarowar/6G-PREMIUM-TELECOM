<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Models\Ivr;
use App\Models\IvrOption;

class GenerateIvrDialplan extends Command
{
    protected $signature = 'ivr:generate-dialplan';
    protected $description = 'Generate Asterisk IVR dialplan from database';

    public function handle()
    {
        $ivrs = Ivr::with('options')->get();

        $dialplan = "; AUTO-GENERATED IVR DIALPLAN\n\n";

        foreach ($ivrs as $ivr) {
            $dialplan .= "[{$ivr->name}]\n";
            $dialplan .= "exten => s,1,Set(PROMPT={$ivr->audio_file})\n";

            $map = [
                '0' => 'DTMF0', '1' => 'DTMF1', '2' => 'DTMF2', '3' => 'DTMF3',
                '4' => 'DTMF4', '5' => 'DTMF5', '6' => 'DTMF6', '7' => 'DTMF7',
                '8' => 'DTMF8', '9' => 'DTMF9', '*' => 'DTMFSTAR', '#' => 'DTMFHASH',
                'timeout' => 'TIMEOUT',
            ];

            foreach ($ivr->options as $opt) {
                $var = $map[$opt->dtmf_key] ?? null;
                if (!$var) continue;

                $target = $this->buildTarget($opt);
                $dialplan .= " same => n,Set({$var}={$target})\n";
            }

            $dialplan .= " same => n,Goto(ivr-engine,s,1)\n\n";
        }

        file_put_contents('/etc/asterisk/extensions_ivr.conf', $dialplan);

        exec('asterisk -rx "dialplan reload"');

        $this->info('IVR dialplan generated and reloaded.');
    }

    protected function buildTarget(IvrOption $opt): string
    {
        return match ($opt->action_type) {
            'ivr'    => "{$opt->target_value},s,1",
            'number' => "from-internal,{$opt->target_value},1",
            'hangup' => "ivr-hangup,s,1",
            'repeat' => "{$opt->ivr->name},s,1",
            default  => "{$opt->ivr->name},s,1",
        };
    }
}
// ADD DIALPLAN LOGIC HERE
