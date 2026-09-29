<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;

/**
 * Creates supplier prefixes from call data: any number a supplier's calls
 * reached in the last $days days that matches none of its prefixes gets a
 * prefix of its first 8 digits (same grouping as the Stats tab). Country
 * comes from the dial code, payment term from the supplier's usual term,
 * and the price is left NULL ("not set") for someone to fill in.
 */
class AutoPrefixes
{
    // Dial code => [ISO code, country]; longest code wins.
    private const CODES = [
        '973'=>['BH','Bahrain'],'977'=>['NP','Nepal'],'235'=>['TD','Chad'],'966'=>['SA','Saudi Arabia'],
        '971'=>['AE','United Arab Emirates'],'974'=>['QA','Qatar'],'965'=>['KW','Kuwait'],'968'=>['OM','Oman'],
        '962'=>['JO','Jordan'],'961'=>['LB','Lebanon'],'964'=>['IQ','Iraq'],'963'=>['SY','Syria'],'967'=>['YE','Yemen'],
        '970'=>['PS','Palestine'],'972'=>['IL','Israel'],'98'=>['IR','Iran'],'90'=>['TR','Turkey'],'20'=>['EG','Egypt'],
        '212'=>['MA','Morocco'],'213'=>['DZ','Algeria'],'216'=>['TN','Tunisia'],'218'=>['LY','Libya'],
        '220'=>['GM','Gambia'],'221'=>['SN','Senegal'],'222'=>['MR','Mauritania'],'223'=>['ML','Mali'],
        '224'=>['GN','Guinea'],'225'=>['CI','Ivory Coast'],'226'=>['BF','Burkina Faso'],'227'=>['NE','Niger'],
        '228'=>['TG','Togo'],'229'=>['BJ','Benin'],'231'=>['LR','Liberia'],'232'=>['SL','Sierra Leone'],
        '233'=>['GH','Ghana'],'234'=>['NG','Nigeria'],'236'=>['CF','Central African Republic'],'237'=>['CM','Cameroon'],
        '241'=>['GA','Gabon'],'242'=>['CG','Congo'],'243'=>['CD','DR Congo'],'244'=>['AO','Angola'],
        '248'=>['SC','Seychelles'],'249'=>['SD','Sudan'],'251'=>['ET','Ethiopia'],'252'=>['SO','Somalia'],
        '253'=>['DJ','Djibouti'],'254'=>['KE','Kenya'],'255'=>['TZ','Tanzania'],'256'=>['UG','Uganda'],
        '257'=>['BI','Burundi'],'260'=>['ZM','Zambia'],'261'=>['MG','Madagascar'],'263'=>['ZW','Zimbabwe'],
        '269'=>['KM','Comoros'],'27'=>['ZA','South Africa'],'91'=>['IN','India'],'92'=>['PK','Pakistan'],
        '880'=>['BD','Bangladesh'],'94'=>['LK','Sri Lanka'],'93'=>['AF','Afghanistan'],'95'=>['MM','Myanmar'],
        '960'=>['MV','Maldives'],'975'=>['BT','Bhutan'],'976'=>['MN','Mongolia'],'992'=>['TJ','Tajikistan'],
        '993'=>['TM','Turkmenistan'],'994'=>['AZ','Azerbaijan'],'995'=>['GE','Georgia'],'996'=>['KG','Kyrgyzstan'],
        '998'=>['UZ','Uzbekistan'],'7'=>['RU','Russia'],'370'=>['LT','Lithuania'],'371'=>['LV','Latvia'],
        '372'=>['EE','Estonia'],'373'=>['MD','Moldova'],'374'=>['AM','Armenia'],'375'=>['BY','Belarus'],
        '380'=>['UA','Ukraine'],'381'=>['RS','Serbia'],'355'=>['AL','Albania'],'359'=>['BG','Bulgaria'],
        '44'=>['GB','United Kingdom'],'39'=>['IT','Italy'],'33'=>['FR','France'],'49'=>['DE','Germany'],
        '34'=>['ES','Spain'],'31'=>['NL','Netherlands'],'32'=>['BE','Belgium'],'41'=>['CH','Switzerland'],
        '43'=>['AT','Austria'],'48'=>['PL','Poland'],'40'=>['RO','Romania'],'30'=>['GR','Greece'],
        '351'=>['PT','Portugal'],'353'=>['IE','Ireland'],'1'=>['US','USA / NANP'],'52'=>['MX','Mexico'],
        '55'=>['BR','Brazil'],'593'=>['EC','Ecuador'],'86'=>['CN','China'],'62'=>['ID','Indonesia'],
        '63'=>['PH','Philippines'],'84'=>['VN','Vietnam'],'66'=>['TH','Thailand'],'60'=>['MY','Malaysia'],
        '505'=>['NI','Nicaragua'],'502'=>['GT','Guatemala'],'503'=>['SV','El Salvador'],'504'=>['HN','Honduras'],
        '506'=>['CR','Costa Rica'],'507'=>['PA','Panama'],'878'=>['UPT','Universal Personal Telecom'],
        '881'=>['SAT','Satellite'],'882'=>['INT','International Networks'],'883'=>['INT','International Networks'],
    ];

    public static function country(string $digits): array
    {
        foreach ([3, 2, 1] as $n) {
            $code = substr($digits, 0, $n);
            if (isset(self::CODES[$code])) return self::CODES[$code];
        }
        return [null, null];
    }

    /** @return array{created: string[]} */
    public static function sync(int $supplierId, int $days = 60): array
    {
        $sup = DB::table('suppliers')->find($supplierId);
        if (!$sup) return ['created' => []];

        // CDRs are labelled with the trunk's display name (save_cdr.php).
        $names = [$sup->name];
        foreach (DB::table('trunks')->where('supplier_id', $supplierId)->get(['name', 'nickname']) as $t) {
            $names[] = $t->name;
            if ($t->nickname) $names[] = $t->nickname;
        }
        $names = array_values(array_unique(array_filter($names)));

        $existing = DB::table('supplier_prefixes')->where('supplier_id', $supplierId)->pluck('prefix')
            ->map(fn($p) => preg_replace('/\D/', '', $p))->filter()->values();
        $term = DB::table('supplier_prefixes')->where('supplier_id', $supplierId)->whereNotNull('payment_term')
            ->select('payment_term', DB::raw('COUNT(*) c'))->groupBy('payment_term')->orderByDesc('c')->value('payment_term')
            ?: 'Weekly';

        $dids = DB::table('cdrs')->whereIn('trunk_name', $names)
            ->where('call_start', '>=', now()->subDays($days))
            ->distinct()->pluck('did');

        $created = [];
        foreach ($dids as $did) {
            $d = preg_replace('/\D/', '', (string) $did);
            if (strlen($d) < 9) continue;                           // too short to be a real number
            if ($existing->contains(fn($p) => str_starts_with($d, $p) || str_starts_with($p, substr($d, 0, 8)))) continue;
            $prefix = substr($d, 0, 8);
            [$iso, $country] = self::country($d);
            $ok = DB::table('supplier_prefixes')->insertOrIgnore([
                'supplier_id' => $supplierId, 'prefix' => $prefix, 'country' => $country, 'country_code' => $iso,
                'price' => null, 'payment_term' => $term, 'status' => 'active',
                'created_at' => now(), 'updated_at' => now(),
            ]);
            if ($ok) {
                $existing->push($prefix);
                $created[] = $prefix;
                DB::table('audit_logs')->insert([
                    'user' => 'system', 'role' => 'system', 'action' => 'AUTO_PREFIX', 'module' => 'Suppliers',
                    'details' => "{$sup->name}: auto-created prefix {$prefix}".($country ? " ({$country})" : '')." from call data - price not set",
                    'created_at' => now(), 'updated_at' => now(),
                ]);
            }
        }
        return ['created' => $created];
    }
}
