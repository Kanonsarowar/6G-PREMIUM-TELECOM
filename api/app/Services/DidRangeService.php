<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;

/**
 * Creates a did_ranges row under an existing supplier prefix and
 * materialises every individual DID in it, in one transaction.
 *
 * - range_start/range_end must be digit strings of equal length that both
 *   start with the prefix, with range_start <= range_end.
 * - Submitting the exact same range again reuses the existing did_ranges row
 *   and only fills in DIDs that are missing (idempotent).
 * - A range that overlaps a different range of the same prefix is rejected.
 * - A number that already exists in dids (with or without "+") is never
 *   duplicated; it is reported as skipped.
 * - did_ranges.total_count is set from the DIDs actually linked to the range
 *   (dids.batch_id), never from a client-supplied count.
 */
class DidRangeService
{
    public const MAX_RANGE_SIZE = 100000;

    /**
     * @return array{range: object, created: int, skipped: string[], reused: bool}
     * @throws \InvalidArgumentException on validation failure (message is user-facing)
     */
    public function createRange(int $supplierId, int $prefixId, string $rangeStart, string $rangeEnd, array $options = []): array
    {
        $start = preg_replace('/[^0-9]/', '', $rangeStart);
        $end   = preg_replace('/[^0-9]/', '', $rangeEnd);
        if ($start === '' || $end === '') throw new \InvalidArgumentException('range_start and range_end are required');

        return DB::transaction(function () use ($supplierId, $prefixId, $start, $end, $options) {
            // Lock the prefix row so two concurrent submissions of the same
            // range serialise instead of both inserting DIDs.
            $prefix = DB::table('supplier_prefixes')->where('id', $prefixId)->where('supplier_id', $supplierId)->lockForUpdate()->first();
            if (!$prefix) throw new \InvalidArgumentException('Prefix not found for this supplier');
            $supplier = DB::table('suppliers')->find($supplierId);
            if (!$supplier) throw new \InvalidArgumentException('Supplier not found');

            $p = preg_replace('/[^0-9]/', '', $prefix->prefix);
            if (!str_starts_with($start, $p) || !str_starts_with($end, $p))
                throw new \InvalidArgumentException("range_start and range_end must both start with prefix {$p}");
            if (strlen($start) !== strlen($end))
                throw new \InvalidArgumentException('range_start and range_end must have the same number of digits');
            if (strlen($start) > 18)
                throw new \InvalidArgumentException('Numbers longer than 18 digits are not supported');
            if (strcmp($start, $end) > 0)
                throw new \InvalidArgumentException('range_start must be <= range_end');
            $size = (int) $end - (int) $start + 1;
            if ($size > self::MAX_RANGE_SIZE)
                throw new \InvalidArgumentException('Range too large (max ' . self::MAX_RANGE_SIZE . ')');

            $ranges = DB::table('did_ranges')->where('prefix_id', $prefix->id)->get();
            $range = $ranges->first(fn($r) => $r->range_start === $start && $r->range_end === $end);
            $overlap = $ranges->first(fn($r) => $r !== $range && strlen((string) $r->range_start) === strlen($start)
                && strcmp($start, $r->range_end) <= 0 && strcmp($r->range_start, $end) <= 0);
            if ($overlap)
                throw new \InvalidArgumentException("Range overlaps existing range {$overlap->range_start}–{$overlap->range_end}");

            $trunk = DB::table('trunks')->where('supplier_id', $supplierId)->first();
            $ivr = $options['ivr_context'] ?? $prefix->ivr_context ?? 'custom/6g-premium-telecom';
            $countryCode = $prefix->country_code ?: 'XX';
            $reused = (bool) $range;

            if (!$range) {
                $rangeId = DB::table('did_ranges')->insertGetId([
                    'batch_name'    => $options['batch_name'] ?? ($prefix->country . ' ' . $prefix->prefix),
                    'country_code'  => $countryCode,
                    'country_name'  => $prefix->country,
                    'prefix'        => $prefix->prefix,
                    'prefix_id'     => $prefix->id,
                    'range_start'   => $start,
                    'range_end'     => $end,
                    'rate'          => $prefix->price,
                    'selling_price' => $prefix->price,
                    'currency'      => 'USDT',
                    'payment_terms' => $prefix->payment_term,
                    'supplier_name' => $supplier->name,
                    'supplier_id'   => $supplierId,
                    'trunk_id'      => $trunk->id ?? null,
                    'default_ivr'   => $ivr,
                    'total_count'   => 0,
                    'is_active'     => 1,
                    'created_at'    => now(),
                    'updated_at'    => now(),
                ]);
                $range = DB::table('did_ranges')->find($rangeId);
            }

            $numbers = [];
            for ($n = (int) $start; $n <= (int) $end; $n++) $numbers[] = str_pad((string) $n, strlen($start), '0', STR_PAD_LEFT);

            // Existing numbers may be stored with or without a leading "+"
            $existing = [];
            foreach (array_chunk($numbers, 1000) as $chunk) {
                $withPlus = array_map(fn($x) => '+' . $x, $chunk);
                foreach (DB::table('dids')->whereIn('number', array_merge($chunk, $withPlus))->pluck('number') as $x)
                    $existing[ltrim($x, '+')] = true;
            }

            $testNumber = preg_replace('/[^0-9]/', '', (string) $prefix->test_number);
            $rows = [];
            $skipped = [];
            foreach ($numbers as $num) {
                if (isset($existing[$num])) { $skipped[] = $num; continue; }
                $rows[] = [
                    'number'           => $num,
                    'e164_number'      => '+' . $num,
                    'trunk_id'         => $trunk->id ?? null,
                    'supplier_id'      => $supplierId,
                    'prefix_id'        => $prefix->id,
                    'is_test'          => $num === $testNumber ? 1 : 0,
                    'country_code'     => $countryCode,
                    'country_name'     => $prefix->country,
                    'prefix'           => $prefix->prefix,
                    'tariff'           => $prefix->price,
                    'selling_price'    => $prefix->price,
                    'currency'         => 'USDT',
                    'payment_terms'    => $prefix->payment_term,
                    'ivr_context'      => $ivr,
                    'status'           => 'active',
                    'lifecycle_status' => 'available',
                    'batch_id'         => $range->id,
                    'created_at'       => now(),
                    'updated_at'       => now(),
                ];
            }
            foreach (array_chunk($rows, 1000) as $chunk) DB::table('dids')->insert($chunk);

            $total = DB::table('dids')->where('batch_id', $range->id)->count();
            if ($total === 0) throw new \InvalidArgumentException('Every number in this range already exists');
            DB::table('did_ranges')->where('id', $range->id)->update(['total_count' => $total, 'updated_at' => now()]);

            return [
                'range'   => DB::table('did_ranges')->find($range->id),
                'created' => count($rows),
                'skipped' => $skipped,
                'reused'  => $reused,
            ];
        });
    }
}
