<?php

namespace App\Console\Commands;

use App\Support\AutoPrefixes;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class SyncAutoPrefixes extends Command
{
    protected $signature = 'supplier:auto-prefixes {--days=60}';
    protected $description = 'Create missing supplier prefixes (price not set) from numbers their calls reached';

    public function handle()
    {
        foreach (DB::table('suppliers')->where('status', 'active')->get() as $s) {
            $r = AutoPrefixes::sync($s->id, (int) $this->option('days'));
            if ($r['created']) $this->line(now()." {$s->name}: created ".implode(', ', $r['created']));
        }
    }
}
