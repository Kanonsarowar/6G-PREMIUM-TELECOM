<?php

namespace App\Console\Commands;

use App\Support\WeeklyEntries;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class SyncWeeklyEntries extends Command
{
    protected $signature = 'supplier:weekly-entries';
    protected $description = 'Create unpaid weekly payment entries for every supplier from CDRs of weeks that have ended';

    public function handle()
    {
        foreach (DB::table('suppliers')->where('status', 'active')->get() as $s) {
            $r = WeeklyEntries::sync($s->id);
            $this->line("{$s->name}: {$r['created']} new, {$r['updated']} updated");
        }
    }
}
