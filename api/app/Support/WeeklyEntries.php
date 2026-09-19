<?php

namespace App\Support;

use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Weekly payment entries for a supplier.
 *
 * Every billable CDR that is not yet on an entry (cdrs.invoice_ref IS NULL) and
 * belongs to a week that has already ended (Monday-Sunday) is grouped by week
 * and currency into an UNPAID supplier_payment entry. The current, still open
 * week is left alone (it stays "current revenue"). Marking an entry paid takes
 * its calls out of the unpaid revenue (see /billing/unpaid-revenue).
 *
 * Safe to run repeatedly: calls already linked to an entry are never touched,
 * and late calls for a week that still has an UNPAID entry are added to it.
 */
class WeeklyEntries
{
    /** CDR trunk_name values that belong to a supplier */
    public static function cdrNames(object $sup): array
    {
        $names = [$sup->name];
        if ($sup->name === 'World Premium Telecom') $names[] = 'WTP'; // legacy CDR label
        $trunks = DB::table('did_ranges')->join('trunks', 'trunks.id', '=', 'did_ranges.trunk_id')
            ->where('did_ranges.supplier_id', $sup->id)->select('trunks.name', 'trunks.nickname')->distinct()->get();
        foreach ($trunks as $t) {
            $names[] = $t->name;
            if ($t->nickname) $names[] = $t->nickname;
        }
        return array_values(array_unique(array_filter($names)));
    }

    /** @return array{created:int,updated:int} */
    public static function sync(int $supplierId): array
    {
        $sup = DB::table('suppliers')->find($supplierId);
        if (!$sup) return ['created' => 0, 'updated' => 0];

        $openWeekStart = now()->startOfWeek(); // Monday 00:00 of the current week
        $cdrs = DB::table('cdrs')->whereIn('trunk_name', self::cdrNames($sup))
            ->whereNull('invoice_ref')->where('revenue', '>', 0)->where('call_start', '<', $openWeekStart)
            ->get(['id', 'call_start', 'currency']);

        $groups = [];
        foreach ($cdrs as $c) {
            $start = Carbon::parse($c->call_start)->startOfWeek()->toDateString();
            $cur = strtoupper($c->currency ?: 'USD');
            $groups[$start . '|' . $cur][] = $c->id;
        }

        $created = $updated = 0;
        foreach ($groups as $key => $ids) {
            [$start, $cur] = explode('|', $key);
            $end = Carbon::parse($start)->addDays(6)->toDateString();

            $entry = DB::table('invoices')->where('supplier_id', $supplierId)->where('invoice_type', 'supplier_payment')
                ->where('payment_term', 'Weekly')->where('period_start', $start)->where('period_end', $end)
                ->where('currency', $cur)->where('status', 'unpaid')->where('invoice_number', 'not like', 'SPAY-%')
                ->where('invoice_number', 'not like', 'M%')->first();

            if ($entry) {
                $ref = $entry->invoice_number;
            } else {
                $base = "W{$supplierId}-{$start}-{$cur}";
                $taken = DB::table('invoices')->where('invoice_number', 'like', $base . '%')->count();
                $ref = $taken ? $base . '-' . ($taken + 1) : $base;
            }

            DB::transaction(function () use ($ids, $ref, $entry, $sup, $supplierId, $start, $end, $cur, &$created, &$updated) {
                foreach (array_chunk($ids, 500) as $chunk) {
                    DB::table('cdrs')->whereIn('id', $chunk)->update(['invoice_ref' => $ref]);
                }
                $t = DB::table('cdrs')->where('invoice_ref', $ref)
                    ->selectRaw('COUNT(*) calls, COALESCE(SUM(billsec),0)/60 minutes, COALESCE(SUM(revenue),0) amount')->first();
                $vals = [
                    'total_calls' => (int)$t->calls,
                    'total_minutes' => round($t->minutes, 4),
                    'total_amount' => round((float)$t->amount, 4),
                    'rate' => $t->minutes > 0 ? round($t->amount / $t->minutes, 6) : 0,
                    'updated_at' => now(),
                ];
                if ($entry) {
                    DB::table('invoices')->where('id', $entry->id)->update($vals);
                    $updated++;
                } else {
                    DB::table('invoices')->insert($vals + [
                        'invoice_number' => $ref, 'supplier_id' => $supplierId, 'supplier_name' => $sup->name,
                        'period_start' => $start, 'period_end' => $end, 'currency' => $cur, 'status' => 'unpaid',
                        'invoice_type' => 'supplier_payment', 'payment_term' => 'Weekly', 'created_at' => now(),
                    ]);
                    $created++;
                }
            });
        }
        return ['created' => $created, 'updated' => $updated];
    }
}
