<?php

// ── Auto-whitelist helper ──────────────────────────────────────
function autoWhitelistSupplierIPs($host){
    if(empty($host)) return;
    $ips = array_filter(array_map('trim', explode(',', $host)));
    foreach($ips as $ip){
        if(!filter_var($ip, FILTER_VALIDATE_IP)) continue;
        // UFW whitelist
        exec("ufw allow from {$ip} to any port 5060 proto udp 2>/dev/null");
        exec("ufw allow from {$ip} 2>/dev/null");
        // Log
        file_put_contents('/tmp/whitelist.log',
            date('Y-m-d H:i:s')." Whitelisted: {$ip}\n", FILE_APPEND);
    }
}
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\DB;
use App\Models\User;
use App\Http\Controllers\AsteriskConfigController;

// -- Supplier/trunk secret redaction --
function redactTrunk($trunk) {
    if (!$trunk) return $trunk;
    $arr = (array) $trunk;
    foreach (['panel_password', 'api_key', 'api_secret', 'sip_password'] as $secretField) {
        $arr['has_'.$secretField] = !empty($arr[$secretField]);
        unset($arr[$secretField]);
    }
    return $arr;
}

// Supplier business accounts are distinct from trunks (SIP/PJSIP technical
// config). Same secret-redaction pattern as redactTrunk(): the raw
// api_secret is never returned here, only a has_api_secret flag - the
// actual value is only obtainable via the superadmin-only /reveal endpoint.
function redactSupplier($supplier) {
    if (!$supplier) return $supplier;
    $arr = (array) $supplier;
    $arr['has_api_secret'] = !empty($arr['api_secret']);
    unset($arr['api_secret']);
    return $arr;
}

// Supplier payable is calculated from the rate configured on the supplier's
// Prefix (the master inventory record - supplier_prefixes.price), never
// from cdrs.revenue (customer-facing selling revenue) and never from a
// currency field: the platform pays suppliers in USDT only. Individual
// DIDs are matched exactly by number; anything only covered by a range
// (no individual DID row) is matched by prefix string. Rows without a
// linked prefix_id fall back to the legacy dids.tariff/did_ranges.rate
// (pre-Prefix-system data) so older/unrelated DIDs are unaffected. Grouped
// by payment_term, since that now belongs to the Prefix and different
// prefixes under the same supplier may carry different terms.
function computeSupplierPayable($supplierId, $from, $to, $defaultTerm = 'Net 30') {
    // Asterisk CDRs store the dialed number without a leading '+' (see
    // import_cdr.sh), while dids.number is stored with one - REPLACE()
    // normalizes both sides so the exact match isn't silently missed.
    $exact = DB::table('cdrs')
        ->join('dids', function($join) {
            $join->on(DB::raw("REPLACE(cdrs.did,'+','')"), '=', DB::raw("REPLACE(dids.number,'+','')"));
        })
        ->leftJoin('supplier_prefixes', 'dids.prefix_id', '=', 'supplier_prefixes.id')
        ->where('dids.supplier_id', $supplierId)
        ->whereBetween('cdrs.call_start', [$from, $to])
        ->select('cdrs.id', 'cdrs.billsec',
            DB::raw('COALESCE(supplier_prefixes.price, dids.tariff) as rate'),
            DB::raw("COALESCE(supplier_prefixes.payment_term, '$defaultTerm') as payment_term"))
        ->get();

    $matchedIds = $exact->pluck('id')->all();
    $ranges = DB::table('did_ranges')
        ->leftJoin('supplier_prefixes', 'did_ranges.prefix_id', '=', 'supplier_prefixes.id')
        ->where('did_ranges.supplier_id', $supplierId)
        ->whereNotNull('did_ranges.prefix')->where('did_ranges.prefix', '!=', '')
        ->select('did_ranges.prefix', DB::raw('COALESCE(supplier_prefixes.price, did_ranges.rate) as rate'),
            DB::raw("COALESCE(supplier_prefixes.payment_term, '$defaultTerm') as payment_term"))
        ->get();

    $rangeMatches = collect();
    if ($ranges->isNotEmpty()) {
        $q = DB::table('cdrs')->whereBetween('call_start', [$from, $to]);
        if (!empty($matchedIds)) $q->whereNotIn('id', $matchedIds);
        foreach ($q->get(['id', 'did', 'billsec']) as $c) {
            $digits = ltrim($c->did ?? '', '+');
            foreach ($ranges as $rng) {
                $prefix = preg_replace('/\s+/', '', $rng->prefix);
                if ($prefix !== '' && str_starts_with($digits, $prefix)) {
                    $rangeMatches->push((object)['id'=>$c->id,'billsec'=>$c->billsec,'rate'=>$rng->rate,'payment_term'=>$rng->payment_term]);
                    break;
                }
            }
        }
    }

    $out = [];
    foreach ($exact->concat($rangeMatches)->groupBy('payment_term') as $term => $rows) {
        $minutes = $rows->sum('billsec') / 60;
        $amount  = $rows->sum(fn($r) => ($r->billsec / 60) * (float)$r->rate);
        $out[] = [
            'payment_term' => $term,
            'calls'        => $rows->count(),
            'minutes'      => round($minutes, 2),
            'amount'       => round($amount, 4),
            'rate'         => $minutes > 0 ? round($amount / $minutes, 6) : 0,
        ];
    }
    return $out;
}

function parsePaymentTermDays($term) {
    if ($term && preg_match('/(\d+)/', $term, $m)) return (int)$m[1];
    return 30;
}

// ── Supplier number import: ONE shared parser for Upload and Paste ──
// Both features send their raw text (a file's contents, or a pasted
// textarea) to the same /import/preview and /import/confirm routes below,
// which call these exact same functions - there is no separate code path
// per input method. No fixed template is required: header-based CSV is
// detected when recognizable column names are present, otherwise each
// line is parsed heuristically token-by-token.
function importCountryNames() {
    static $names = null;
    if ($names === null) {
        // Small curated list covering the common cases; heuristic parsing
        // degrades gracefully (leaves country blank) for anything else -
        // it never blocks import of numbers/ranges/prices.
        $names = ['Afghanistan','Albania','Algeria','Argentina','Australia','Bahrain','Bangladesh','Belgium',
            'Brazil','Canada','China','Egypt','France','Germany','Ghana','India','Indonesia','Iran','Iraq',
            'Ireland','Israel','Italy','Japan','Jordan','Kenya','Kuwait','Lebanon','Libya','Malaysia',
            'Mexico','Morocco','Myanmar','Nepal','Netherlands','Nigeria','Oman','Pakistan','Philippines',
            'Poland','Qatar','Russia','Satellite','Saudi Arabia','Singapore','Somalia','South Africa',
            'Spain','Sri Lanka','Sudan','Syria','Tanzania','Thailand','Tunisia','Turkey','UAE',
            'United Arab Emirates','Uganda','Ukraine','United Kingdom','United States','USA','Vietnam','Yemen'];
    }
    return $names;
}

// Delimiter is detected per LINE, not once for the whole file - a "no
// fixed template" import can freely mix comma-delimited rows with
// whitespace-delimited rows in the same paste/file, and a single global
// delimiter would silently mangle whichever lines don't use it.
// str_getcsv (not a naive explode) correctly respects quoted fields, so a
// quoted value containing the delimiter is never split into extra columns
// and never merged with its neighbor - each CSV row stays exactly one
// record, with prefix/number/price etc. as separate fields throughout.
//
// Semicolon is checked before comma: many European exports use semicolon
// as the true field separator specifically because comma is the decimal
// separator there (e.g. a price field of "0,042"). If comma were tried
// first, a line like `...;0,042;EUR;...` would be wrongly split on that
// decimal comma instead of the real semicolon boundaries, shredding the
// price/currency field into unrelated fragments.
function importSplitLine($line) {
    foreach ([";", ",", "\t", "|"] as $d) {
        if (substr_count($line, $d) >= 1) {
            return array_map(fn($p) => trim(is_string($p) ? $p : '', " \t\"'"), str_getcsv($line, $d));
        }
    }
    return array_map(fn($p) => trim($p, " \t\"'"), preg_split('/\s+/', trim($line)));
}

function importDetectHeaderMap($tokens) {
    $synonyms = [
        'number'       => ['number','msisdn','did','phone','telephone'],
        'range_start'  => ['range_start','rangestart','from','start'],
        'range_end'    => ['range_end','rangeend','to','end'],
        'country'      => ['country'],
        'prefix'       => ['prefix','code'],
        'price'        => ['price','rate','cost','tariff','payout'],
        'payment_term' => ['payment_term','paymentterm','term','terms','billing_period','billingperiod'],
        'operator'     => ['operator','carrier','network'],
    ];
    $map = [];
    $matches = 0;
    foreach ($tokens as $i => $tok) {
        $norm = strtolower(str_replace([' ','-'], '_', trim($tok)));
        foreach ($synonyms as $field => $words) {
            if (in_array($norm, $words, true)) { $map[$i] = $field; $matches++; break; }
        }
    }
    return $matches >= 2 ? $map : null;
}

function importNormalizeDigits($v) { return preg_replace('/[^0-9]/', '', (string)$v); }

// Accepts both "0.042" (dot-decimal) and the European "0,042"
// (comma-decimal) formats now that fields are correctly delimiter-split;
// returns null for anything that isn't a plain decimal number so a bad
// value never silently becomes 0 or some other misleading default.
function importParsePrice($v) {
    if ($v === null) return null;
    $v = trim((string)$v);
    if ($v === '') return null;
    if (preg_match('/^\d+,\d+$/', $v)) $v = str_replace(',', '.', $v);
    return is_numeric($v) ? (float)$v : null;
}

function importDerivePrefix($digits) {
    $digits = ltrim($digits, '+');
    return strlen($digits) > 4 ? substr($digits, 0, -4) : $digits;
}

function importParseRecordFromHeader($tokens, $headerMap) {
    $rec = ['number'=>null,'range_start'=>null,'range_end'=>null,'country'=>null,'prefix'=>null,
        'price'=>null,'payment_term'=>null,'operator'=>null];
    foreach ($headerMap as $i => $field) {
        if (isset($tokens[$i]) && $tokens[$i] !== '') $rec[$field] = $tokens[$i];
    }
    if ($rec['number']) $rec['number'] = importNormalizeDigits($rec['number']);
    if ($rec['range_start']) $rec['range_start'] = importNormalizeDigits($rec['range_start']);
    if ($rec['range_end']) $rec['range_end'] = importNormalizeDigits($rec['range_end']);
    // An explicit Prefix column can arrive formatted for readability (e.g.
    // "88 233 770") rather than as a bare digit string - normalize it the
    // same way numbers are, so it actually matches existing prefixes.
    if ($rec['prefix']) $rec['prefix'] = importNormalizeDigits($rec['prefix']);
    if ($rec['price'] !== null) $rec['price'] = importParsePrice($rec['price']);
    if (!$rec['prefix']) {
        $base = $rec['range_start'] ?: $rec['number'];
        if ($base) $rec['prefix'] = importDerivePrefix($base);
    }
    return $rec;
}

function importMergeSplitPaymentTerms($tokens) {
    // Whitespace-split input turns "Net 30" into two tokens ("Net","30");
    // merge them back before classification so the digit half doesn't get
    // mistaken for a prefix and the payment term isn't lost entirely.
    $merged = [];
    for ($i = 0; $i < count($tokens); $i++) {
        if (preg_match('/^net$/i', $tokens[$i]) && isset($tokens[$i+1]) && preg_match('/^\d+$/', $tokens[$i+1])) {
            $merged[] = 'Net '.$tokens[$i+1];
            $i++;
        } else {
            $merged[] = $tokens[$i];
        }
    }
    return $merged;
}

function importParseRecordHeuristic($tokens) {
    $rec = ['number'=>null,'range_start'=>null,'range_end'=>null,'country'=>null,'prefix'=>null,
        'price'=>null,'payment_term'=>null,'operator'=>null];
    $numberLike = [];
    $countries = importCountryNames();
    $leftover = [];
    $tokens = importMergeSplitPaymentTerms($tokens);

    foreach ($tokens as $tok) {
        if ($tok === '') continue;
        $digits = preg_replace('/[^0-9]/', '', $tok);
        if (preg_match('/^\d+[.,]\d+$/', $tok) && $rec['price'] === null) {
            $rec['price'] = importParsePrice($tok);
        } elseif (preg_match('/^(EUR|USD|USDT|GBP|SAR|AED)$/i', $tok)) {
            // The platform is USDT-only regardless of what currency a
            // supplier's own file quotes - the code is simply discarded
            // rather than risk it being misread as an operator/prefix.
            continue;
        } elseif (preg_match('/^(net\s*\d+|daily|weekly|monthly|custom)$/i', $tok) && $rec['payment_term'] === null) {
            $rec['payment_term'] = ucwords(strtolower($tok));
        } elseif (in_array($tok, $countries, true) && $rec['country'] === null) {
            $rec['country'] = $tok;
        } elseif (strlen($digits) >= 6 && strlen($digits) <= 15 && $digits === preg_replace('/[\s\-\(\)\+]/','',$tok)) {
            $numberLike[] = $digits;
        } else {
            $lower = strtolower($tok);
            foreach ($countries as $c) {
                if (strtolower($c) === $lower) { $rec['country'] = $c; continue 2; }
            }
            $leftover[] = $tok;
        }
    }

    // Two number-like tokens are ambiguous in general: it could be a
    // range's start/end (equal digit length - same prefix, differing
    // suffix), a (prefix, number) pair (different lengths), or simply two
    // unrelated full numbers on a richer row - e.g. caller + destination
    // in a CDR-shaped export, which commonly differ by only 1-2 digits of
    // length depending on country code length. Only guess "different
    // lengths = prefix+number" when the row is EXACTLY those two fields
    // and nothing else; with other columns present (dates, durations,
    // prices...) that signal is unreliable, so the safer choice is to
    // take the last number found and derive its prefix mechanically
    // rather than risk mistaking one real number for a prefix of another.
    if (count($numberLike) >= 2) {
        [$a, $b] = [$numberLike[0], $numberLike[1]];
        if (count($numberLike) === 2 && count($tokens) === 2 && strlen($a) === strlen($b)) {
            $rec['range_start'] = $a;
            $rec['range_end']   = $b;
        } elseif (count($numberLike) === 2 && count($tokens) === 2 && strlen($a) !== strlen($b)) {
            if (strlen($a) < strlen($b)) { $rec['prefix'] = $a; $rec['number'] = $b; }
            else { $rec['prefix'] = $b; $rec['number'] = $a; }
        } elseif (strlen($a) === strlen($b)) {
            // Equal length with extra columns present is still an
            // unambiguous range (e.g. "range_start range_end country
            // price term operator").
            $rec['range_start'] = $a;
            $rec['range_end']   = $b;
        } else {
            $rec['number'] = end($numberLike);
        }
    } elseif (count($numberLike) === 1) {
        $rec['number'] = $numberLike[0];
    }

    // A short leftover alnum token with no digits is most likely the
    // operator/carrier name. A short digit leftover is only accepted as an
    // explicit prefix override if it's actually a prefix of the detected
    // number/range - i.e. the number literally starts with it. Without
    // that check, an unrelated short numeric column (call duration, a
    // sequence id, a count) gets mistaken for the prefix purely because it
    // happens to be 2-6 digits, which is a real column, just not this one.
    $numBase = $rec['range_start'] ?: $rec['number'];
    foreach ($leftover as $tok) {
        if (preg_match('/^[A-Za-z][A-Za-z\-\s]{1,30}$/', $tok) && $rec['operator'] === null) {
            $rec['operator'] = $tok;
        } elseif (preg_match('/^\d{2,6}$/', $tok) && $rec['prefix'] === null
            && $numBase && str_starts_with($numBase, $tok)) {
            $rec['prefix'] = $tok;
        }
    }

    if (!$rec['prefix']) {
        $base = $rec['range_start'] ?: $rec['number'];
        if ($base) $rec['prefix'] = importDerivePrefix($base);
    }
    return $rec;
}

function parseSupplierImportRecords($text, $defaultCountry = null) {
    $text = (string)$text;
    // Strip a UTF-8 BOM (common in Excel-exported CSVs) - left in place it
    // silently attaches to the first header cell (e.g. "\xEF\xBB\xBFPrefix")
    // so it never matches a known column name, and the whole row falls
    // through to heuristic parsing instead of the header-mapped path.
    if (substr($text, 0, 3) === "\xEF\xBB\xBF") $text = substr($text, 3);
    $lines = preg_split('/\r\n|\r|\n/', trim($text));
    $lines = array_values(array_filter($lines, fn($l) => trim($l) !== ''));
    if (empty($lines)) return [];

    $firstTokens = importSplitLine($lines[0]);
    $headerMap = importDetectHeaderMap($firstTokens);
    $startIdx = $headerMap ? 1 : 0;

    $records = [];
    for ($i = $startIdx; $i < count($lines); $i++) {
        $line = trim($lines[$i]);
        if ($line === '') continue;
        $tokens = importSplitLine($line);
        $rec = $headerMap ? importParseRecordFromHeader($tokens, $headerMap) : importParseRecordHeuristic($tokens);
        // Many supplier files only ever cover one country/network (their
        // own), so it's often simply not a column at all - fall back to
        // the supplier's own on-file country rather than leaving it blank.
        if (!$rec['country'] && $defaultCountry) $rec['country'] = $defaultCountry;
        $rec['raw_line'] = $line;
        $rec['mode'] = $rec['range_start'] && $rec['range_end'] ? 'range' : 'single';
        $records[] = $rec;
    }
    return $records;
}

// ── Auth ──────────────────────────────────────────────────────────
Route::post('/v1/auth/login', function(Request $request) {
    $user = User::where('email', $request->email)
        ->orWhere('username', $request->username)
        ->orWhere('username', $request->email)
        ->first();
    if(!$user || !Hash::check($request->password, $user->password))
        return response()->json(['message'=>'Invalid credentials'], 401);
    $token = $user->createToken('api')->plainTextToken;
    // Log login
    DB::table('audit_logs')->insert([
        'user'       => $user->name,
        'role'       => $user->role??'unknown',
        'action'     => 'LOGIN',
        'module'     => 'Auth',
        'details'    => 'User logged in from '.$request->ip(),
        'ip_address' => $request->ip(),
        'method'     => 'POST',
        'url'        => '/api/v1/auth/login',
        'status_code'=> 200,
        'created_at' => now(),
        'updated_at' => now(),
    ]);
    return response()->json(['token'=>$token, 'user'=>$user]);
});

// Public health check
Route::get('/v1/system/health', function() {
    try {
        DB::connection()->getPdo();
        $db = 'connected';
    } catch(\Exception $e) {
        $db = 'error';
    }
    return response()->json(['api'=>'online','database'=>$db,'timestamp'=>now()->toDateTimeString()]);
});

Route::middleware('auth:sanctum')->group(function() {

    Route::get('/v1/auth/me', fn(Request $r)=>response()->json(['data'=>$r->user()]));

    // ── Live Calls ────────────────────────────────────────────

    // ── CDR ───────────────────────────────────────────────────
    Route::get('/v1/cdr', function(Request $r) {
        // Billable calls only - a call with no revenue (a $0-rate test prefix,
        // an unrated/failed leg, etc.) isn't real traffic and clutters the CDR.
        $q = DB::table('cdrs')->where('revenue','>',0)->orderByDesc('call_start');
        if($r->search) {
            $term = $r->search;
            $q->where(fn($q2) => $q2->where('src','like',"%{$term}%")->orWhere('did','like',"%{$term}%"));
        }
        return response()->json($q->paginate($r->per_page??50));
    });

    // ── DIDs ──────────────────────────────────────────────────
    Route::get('/v1/dids', function(Request $r) {
        $q = DB::table('dids')
            ->leftJoin('trunks','dids.trunk_id','=','trunks.id')
            ->select('dids.*','trunks.nickname as supplier_name');
        if($r->number) $q->where('dids.number',$r->number);
        $dids = $q->get();
        return response()->json(['data'=>$dids,'total'=>$dids->count()]);
    });
    Route::post('/v1/dids', function(Request $r) {
        $num = '+'.ltrim(preg_replace('/[^0-9]/','',$r->number),'+');
        if(DB::table('dids')->where('number',$num)->exists())
            return response()->json(['error'=>'Number already exists'],409);
        $trunk = DB::table('trunks')->find($r->trunk_id);
        $id = DB::table('dids')->insertGetId([
            'number'        => $num,
            'trunk_id'      => $r->trunk_id,
            'prefix'        => $r->prefix??'',
            'country_name'  => $r->country_name??'Unknown',
            'country_code'  => $r->country_code??'XX',
            'tariff'        => $r->tariff??0.07,
            'selling_price' => $r->selling_price??$r->tariff??0.07,
            'currency'      => $r->currency??'USDT',
            'payment_terms' => $r->payment_terms??'Weekly',
            'status'        => 'active',
            'ivr_context'   => 'custom/6g-premium-telecom',
            'created_at'    => now(),
            'updated_at'    => now(),
        ]);
        // Auto-detect prefix if not provided
        $autoPrefix = $r->prefix;
        if(!$autoPrefix){
            $stripped2 = ltrim($num,'+');
            $autoPrefix = substr($stripped2, 0, strlen($stripped2)-4);
        }
        // Auto create/update range
        if($autoPrefix){
            $existing = DB::table('did_ranges')->where('prefix',$autoPrefix)->first();
            $stripped = ltrim($num,'+');
            if($existing){
                DB::table('did_ranges')->where('id',$existing->id)->update([
                    'total_count' => DB::table('dids')->where('prefix',$autoPrefix)->count(),
                    'updated_at'  => now(),
                ]);
            } else {
                DB::table('did_ranges')->insert([
                    'batch_name'    => ($r->country_name??'Unknown').' '.$autoPrefix,
                    'prefix'        => $autoPrefix,
                    'range_start'   => $stripped,
                    'range_end'     => $stripped,
                    'country_code'  => $r->country_code??'XX',
                    'country_name'  => $r->country_name??'Unknown',
                    'rate'          => $r->tariff??0.07,
                    'selling_price' => $r->tariff??0.07,
                    'currency'      => $r->currency??'USDT',
                    'payment_terms' => 'Weekly',
                    'total_count'   => 1,
                    'supplier_name' => $trunk->nickname??$trunk->name??'',
                    'created_at'    => now(),
                    'updated_at'    => now(),
                ]);
            }
        }
        return response()->json(['success'=>true,'message'=>'Number added successfully','data'=>DB::table('dids')->find($id)]);
    });
    Route::delete('/v1/dids/{id}', function($id) {
        DB::table('dids')->where('id',$id)->delete();
        return response()->json(['success'=>true]);
    });

    // ── DID Ranges ────────────────────────────────────────────
    Route::get('/v1/did-ranges', function() {
        $ranges = DB::table('did_ranges')->get();
        // Add IVR context from first matching DID
        foreach($ranges as $r){
            $did = DB::table('dids')->where('prefix', preg_replace('/\s+/','',$r->prefix??''))->first();
            $r->ivr_context = $did->ivr_context ?? 'custom/6g-premium-telecom';
        }
        return response()->json(['data'=>$ranges,'total'=>count($ranges)]);
    });

    Route::post('/v1/did-ranges/import-range', function(Request $r) {
        $start = preg_replace('/[^0-9]/','', $r->range_start);
        $end   = preg_replace('/[^0-9]/','', $r->range_end);
        $count = (int)$end - (int)$start + 1;
        $id = DB::table('did_ranges')->insertGetId([
            'batch_name'   => $r->batch_name ?? ($r->country_name.' '.substr($start,0,-4)),
            'country_code' => $r->country_code,
            'country_name' => $r->country_name,
            'prefix'       => substr($start,0,-4),
            'range_start'  => $start,
            'range_end'    => $end,
            'rate'         => $r->tariff ?? 0.063,
            'selling_price'=> $r->selling_price ?? 0.07,
            'currency'     => $r->currency ?? 'USDT',
            'payment_terms'=> 'Daily',
            'supplier_name'=> $r->supplier,
            'default_ivr'  => $r->default_ivr ?? 'custom/6g-premium-telecom',
            'total_count'  => $count,
            'is_active'    => 1,
            'created_at'   => now(),
            'updated_at'   => now(),
        ]);
        return response()->json(['success'=>true,'id'=>$id,'total'=>$count,'message'=>"Range imported — $count numbers"]);
    });

    // ── Revenue ───────────────────────────────────────────────
    // Revenue we have not yet paid out, per supplier: every CDR of the supplier's
    // numbers since its last PAID supplier payment (all of it if never paid).
    // Marking a period paid on the Payments page moves that supplier's cut-off.
    Route::get('/v1/billing/unpaid-revenue', function() {
        $out = [];
        foreach (DB::table('suppliers')->where('status','active')->get() as $sup) {
            $names = [$sup->name];
            if ($sup->name === 'World Premium Telecom') $names[] = 'WTP';   // legacy CDR label
            $trunks = DB::table('did_ranges')->join('trunks','trunks.id','=','did_ranges.trunk_id')
                ->where('did_ranges.supplier_id',$sup->id)->select('trunks.name','trunks.nickname')->distinct()->get();
            foreach ($trunks as $t) { $names[] = $t->name; if ($t->nickname) $names[] = $t->nickname; }
            $names = array_values(array_unique(array_filter($names)));

            $lastPaid = DB::table('invoices')->where('supplier_id',$sup->id)
                ->where('invoice_type','supplier_payment')->where('status','paid')
                ->where('invoice_number','like','SPAY-%')->max('paid_at');
            $paidRefs = DB::table('invoices')->where('supplier_id',$sup->id)
                ->where('invoice_type','supplier_payment')->where('status','paid')->pluck('invoice_number')->all();
            $q = DB::table('cdrs')->whereIn('trunk_name',$names);
            if ($lastPaid) $q->where('call_start','>',$lastPaid);
            if ($paidRefs) $q->where(fn($w)=>$w->whereNull('invoice_ref')->orWhereNotIn('invoice_ref',$paidRefs));
            $row = $q->selectRaw('COUNT(*) as calls, COALESCE(SUM(billsec),0)/60 as minutes, COALESCE(SUM(revenue),0) as amount')->first();
            // unpaid bills entered from a supplier's own report (no per-call rows behind them)
            $manual = DB::table('invoices')->where('supplier_id',$sup->id)->where('invoice_type','supplier_payment')
                ->where('status','unpaid')->where('invoice_number','like','M%')
                ->selectRaw('COALESCE(SUM(total_calls),0) c, COALESCE(SUM(total_minutes),0) m, COALESCE(SUM(total_amount),0) a')->first();
            $amount = (float)$row->amount + (float)$manual->a;
            if ($amount <= 0) continue;
            $out[] = ['supplier_id'=>$sup->id,'supplier_name'=>$sup->name,'calls'=>(int)$row->calls + (int)$manual->c,
                      'minutes'=>round($row->minutes + (float)$manual->m,2),'amount'=>round($amount,4)];
        }
        usort($out, fn($a,$b) => $b['amount'] <=> $a['amount']);
        return response()->json(['data'=>$out,'total'=>round(array_sum(array_column($out,'amount')),4)]);
    });

    Route::get('/v1/billing/current-revenue', function() {
        $today = date('Y-m-d');
        // Current week: Monday 00:00 -> now (same boundary as invoices)
        $weekStart = now()->startOfWeek(\Carbon\Carbon::MONDAY);
        $weekEnd   = now()->endOfWeek(\Carbon\Carbon::SUNDAY);
        $weekData = DB::table('cdrs')
            ->selectRaw('COUNT(*) as calls, SUM(billsec/60) as minutes, SUM(revenue) as revenue')
            ->whereBetween('call_start', [$weekStart, $weekEnd])
            ->first();
        $weekEur = DB::table('cdrs')
            ->whereBetween('call_start', [$weekStart, $weekEnd])->where('currency','EUR')
            ->sum('revenue');
        $weekUsd = DB::table('cdrs')
            ->whereBetween('call_start', [$weekStart, $weekEnd])->where('currency','USD')
            ->sum('revenue');
        $data = DB::table('cdrs')
            ->selectRaw('COUNT(*) as calls, SUM(billsec/60) as minutes, SUM(revenue) as revenue')
            ->first();
        $todayData = DB::table('cdrs')
            ->selectRaw('COUNT(*) as calls, SUM(billsec/60) as minutes, SUM(revenue) as revenue')
            ->whereDate('call_start', $today)
            ->first();
        $todayEur = DB::table('cdrs')
            ->whereDate('call_start', $today)->where('currency','EUR')
            ->sum('revenue');
        $todayUsd = DB::table('cdrs')
            ->whereDate('call_start', $today)->where('currency','USD')
            ->sum('revenue');
        $allEur = DB::table('cdrs')->where('currency','EUR')->sum('revenue');
        $allUsd = DB::table('cdrs')->where('currency','USD')->sum('revenue');
        return response()->json(['data'=>[
            'calls'         => $data->calls??0,
            'minutes'       => $data->minutes??0,
            'revenue'       => $data->revenue??0,
            'revenue_eur'   => $allEur??0,
            'revenue_usd'   => $allUsd??0,
            'today_calls'   => $todayData->calls??0,
            'today_minutes' => $todayData->minutes??0,
            'today_revenue' => $todayData->revenue??0,
            'today_eur'     => $todayEur??0,
            'today_usd'     => $todayUsd??0,
            'week_calls'    => $weekData->calls??0,
            'week_minutes'  => $weekData->minutes??0,
            'week_revenue'  => $weekData->revenue??0,
            'week_eur'      => $weekEur??0,
            'week_usd'      => $weekUsd??0,
            'week_start'    => $weekStart->toDateString(),
            'week_end'      => $weekEnd->toDateString(),
        ]]);
    });

    Route::get('/v1/billing/invoices', function() {
        $invoices = DB::table('invoices')->orderByDesc('created_at')->get();
        return response()->json(['data'=>$invoices]);
    });

    // ── Customers ─────────────────────────────────────────────
    Route::get('/v1/customers', function() {
        return response()->json(['data'=>User::orderBy('client_id')->get()]);
    });

    Route::post('/v1/customers', function(Request $request) {
        $last  = User::whereNotNull('client_id')->max('client_id') ?? '0000';
        $nextId = str_pad((int)$last + 1, 4, '0', STR_PAD_LEFT);
        $user  = User::create([
            'name'      => $request->name,
            'email'     => $request->email,
            'password'  => Hash::make($request->password),
            'role'      => $request->role ?? 'reseller',
            'client_id' => $nextId,
        ]);
        return response()->json(['data'=>$user,'client_id'=>$nextId,'password'=>$request->password], 201);
    });

    // ── Suppliers ─────────────────────────────────────────────
    // Secrets (panel_password, api_key, api_secret) are never returned by
    // this list - every authenticated role gets full non-secret metadata
    // plus has_panel_password/has_api_key/has_api_secret flags. Actual
    // secret values are only obtainable via the superadmin-only /reveal
    // endpoint below, which is audit-logged.
    Route::get('/v1/suppliers', function(Request $request) {
        $didCounts = DB::table('dids')->select('trunk_id', DB::raw('COUNT(*) as c'))
            ->groupBy('trunk_id')->pluck('c', 'trunk_id');
        $supplierNames = DB::table('suppliers')->pluck('name', 'id');
        $trunks = DB::table('trunks')->get()->map(function($t) use ($didCounts, $supplierNames) {
            $t = redactTrunk($t);
            $t['did_count'] = $didCounts[$t['id']] ?? 0;
            $t['supplier_name'] = $t['supplier_id'] ? ($supplierNames[$t['supplier_id']] ?? null) : null;
            return $t;
        })->values();
        return response()->json(['data'=>$trunks]);
    });

    Route::post('/v1/suppliers', function(Request $r) {
        if ($r->user()->role !== 'superadmin') {
            return response()->json(['error'=>'Unauthorized'],403);
        }
        $id = DB::table('trunks')->insertGetId([
            'supplier_id' => $r->supplier_id ?: null,
            'name'       => $r->name,
            'host'       => $r->host,
            'port'       => $r->port ?? 5060,
            'transport'  => $r->transport ?? 'udp',
            'is_active'  => 1,
            'notes'      => $r->notes,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        autoWhitelistSupplierIPs($r->host);
        return response()->json(['data'=>redactTrunk(DB::table('trunks')->find($id)),'success'=>true]);
    });

    Route::put('/v1/suppliers/{id}', function(Request $r, $id) {
        if ($r->user()->role !== 'superadmin') {
            return response()->json(['error'=>'Unauthorized'],403);
        }
        $data = [
            'supplier_id'       => $r->supplier_id ?: null,
            'name'              => $r->name,
            'nickname'          => $r->nickname,
            'host'              => $r->host,
            'port'              => $r->port ?? 5060,
            'transport'         => $r->transport ?? 'udp',
            'codecs'            => $r->codecs,
            'is_active'         => $r->is_active ?? 1,
            'notes'             => $r->notes,
            'panel_url'         => $r->panel_url,
            'panel_user'        => $r->panel_user,
            'team_link'         => $r->team_link,
            'sales_person'      => $r->sales_person,
            'whatsapp'          => $r->whatsapp,
            'api_url'           => $r->api_url,
            'pjsip_name'        => $r->pjsip_name ?: strtoupper(preg_replace('/[^A-Za-z0-9]+/','-',$r->nickname ?? '')),
            'qualify'           => is_numeric($r->qualify) ? (int)$r->qualify : 60,
            'auth_type'         => in_array($r->auth_type,['ip','userpass','both']) ? $r->auth_type : 'ip',
            'max_channels'      => is_numeric($r->max_channels) ? (int)$r->max_channels : 500,
            'max_call_duration' => is_numeric($r->max_call_duration) ? (int)$r->max_call_duration : 1800,
            'sip_username'      => $r->sip_username,
            'updated_at'        => now(),
        ];
        foreach (['panel_password', 'api_key', 'api_secret'] as $secretField) {
            if ($r->filled($secretField)) $data[$secretField] = $r->$secretField;
        }
        if ($r->filled('sip_password')) {
            $data['sip_password'] = \Illuminate\Support\Facades\Crypt::encryptString($r->sip_password);
        }
        DB::table('trunks')->where('id',$id)->update($data);
        return response()->json(['data'=>redactTrunk(DB::table('trunks')->find($id)),'success'=>true]);
    });

    Route::delete('/v1/suppliers/{id}', function(Request $r, $id) {
        if ($r->user()->role !== 'superadmin') {
            return response()->json(['error'=>'Unauthorized'],403);
        }
        DB::table('trunks')->delete($id);
        return response()->json(['success'=>true]);
    });

    Route::post('/v1/suppliers/{id}/reveal', function(Request $r, $id) {
        if ($r->user()->role !== 'superadmin') {
            return response()->json(['error'=>'Unauthorized'],403);
        }
        $field = $r->field;
        if (!in_array($field, ['panel_password', 'api_key', 'api_secret', 'sip_password'], true)) {
            return response()->json(['error'=>'Invalid field'],422);
        }
        $trunk = DB::table('trunks')->find($id);
        if (!$trunk) return response()->json(['error'=>'Supplier not found'],404);

        DB::table('audit_logs')->insert([
            'user'       => $r->user()->name,
            'role'       => $r->user()->role ?? 'unknown',
            'action'     => 'REVEAL_SECRET',
            'module'     => 'Suppliers',
            'details'    => "Revealed {$field} for supplier #{$id} (".($trunk->nickname ?? $trunk->name).")",
            'ip_address' => $r->ip(),
            'method'     => 'POST',
            'url'        => "/api/v1/suppliers/{$id}/reveal",
            'status_code'=> 200,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $value = $trunk->$field;
        if ($field === 'sip_password' && $value) {
            try {
                $value = \Illuminate\Support\Facades\Crypt::decryptString($value);
            } catch (\Throwable $e) {
                $value = null;
            }
        }

        return response()->json(['field'=>$field,'value'=>$value]);
    });

    // ── Supplier Accounts (business entity — NOT SIP trunk config) ──
    // Supplier is the master business record: name, contact, country,
    // commercial terms, optional external API. A trunk may reference a
    // supplier via trunks.supplier_id, but trunk/PJSIP config is managed
    // exclusively under Asterisk Configuration -> Trunks, never here.
    Route::get('/v1/supplier-accounts', function() {
        $suppliers = DB::table('suppliers')->orderBy('name')->get();
        $numberCounts = DB::table('dids')->where('is_test',0)->whereNotNull('supplier_id')
            ->select('supplier_id', DB::raw('COUNT(*) as c'))->groupBy('supplier_id')->pluck('c','supplier_id');
        $rangeCounts = DB::table('did_ranges')->whereNotNull('supplier_id')
            ->whereNotExists(fn($q)=>$q->select(DB::raw(1))->from('dids')->whereColumn('dids.batch_id','did_ranges.id'))
            ->select('supplier_id', DB::raw('COALESCE(SUM(total_count),0) as c'))->groupBy('supplier_id')->pluck('c','supplier_id');
        $testCounts = DB::table('dids')->where('is_test',1)->whereNotNull('supplier_id')
            ->select('supplier_id', DB::raw('COUNT(*) as c'))->groupBy('supplier_id')->pluck('c','supplier_id');
        $trunkLinks = DB::table('trunks')->whereNotNull('supplier_id')->get()->keyBy('supplier_id');

        $out = $suppliers->map(function($s) use ($numberCounts,$rangeCounts,$testCounts,$trunkLinks) {
            $sid = $s->id;
            $didNumbers = DB::table('dids')->where('supplier_id',$sid)->where('is_test',0)->pluck('number');
            $cdr = $didNumbers->isEmpty() ? null : DB::table('cdrs')->whereIn('did',$didNumbers)
                ->selectRaw('COUNT(*) as calls, COALESCE(SUM(billsec),0)/60 as minutes, COALESCE(SUM(revenue),0) as revenue')
                ->first();
            $s = redactSupplier($s);
            $s['number_count']      = ($numberCounts[$sid] ?? 0) + ($rangeCounts[$sid] ?? 0);
            $s['test_number_count'] = $testCounts[$sid] ?? 0;
            $s['calls']             = $cdr->calls ?? 0;
            $s['minutes']           = round($cdr->minutes ?? 0, 2);
            $s['revenue']           = round($cdr->revenue ?? 0, 4);
            $trunk = $trunkLinks[$sid] ?? null;
            $s['linked_trunk']      = $trunk ? ['id'=>$trunk->id,'nickname'=>$trunk->nickname ?? $trunk->name] : null;
            return $s;
        })->values();
        return response()->json(['data'=>$out]);
    });

    Route::post('/v1/supplier-accounts', function(Request $r) {
        if (!$r->name) return response()->json(['error'=>'Supplier name is required'],422);
        $id = DB::table('suppliers')->insertGetId([
            'name'         => $r->name,
            'code'         => $r->code,
            'country'      => $r->country,
            'contact_name' => $r->contact_name,
            'email'        => $r->email,
            'phone'        => $r->phone,
            'status'       => $r->status ?? 'active',
            'notes'        => $r->notes,
            'created_at'   => now(),
            'updated_at'   => now(),
        ]);
        DB::table('audit_logs')->insert([
            'user'=>$r->user()->name,'role'=>$r->user()->role??'unknown','action'=>'CREATE',
            'module'=>'Suppliers','details'=>"Created supplier #{$id} ({$r->name})",
            'ip_address'=>$r->ip(),'method'=>'POST','url'=>'/api/v1/supplier-accounts',
            'status_code'=>201,'created_at'=>now(),'updated_at'=>now(),
        ]);
        return response()->json(['success'=>true,'data'=>redactSupplier(DB::table('suppliers')->find($id))],201);
    });

    Route::get('/v1/supplier-accounts/{id}', function($id) {
        $s = DB::table('suppliers')->find($id);
        if (!$s) return response()->json(['error'=>'Supplier not found'],404);
        $trunk = DB::table('trunks')->where('supplier_id',$id)->first();
        $s = redactSupplier($s);
        $s['linked_trunk'] = $trunk ? ['id'=>$trunk->id,'nickname'=>$trunk->nickname ?? $trunk->name] : null;
        return response()->json(['data'=>$s]);
    });

    Route::put('/v1/supplier-accounts/{id}', function(Request $r, $id) {
        $s = DB::table('suppliers')->find($id);
        if (!$s) return response()->json(['error'=>'Supplier not found'],404);
        $data = $r->only([
            'name','code','country','contact_name','email','phone','status','notes',
            'tariff','currency','payment_terms','settlement_period',
            'api_enabled','api_type','api_endpoint','api_auth_method',
        ]);
        if ($r->filled('api_secret')) $data['api_secret'] = $r->api_secret;
        $data['updated_at'] = now();
        DB::table('suppliers')->where('id',$id)->update($data);
        return response()->json(['success'=>true,'data'=>redactSupplier(DB::table('suppliers')->find($id))]);
    });

    Route::delete('/v1/supplier-accounts/{id}', function(Request $r, $id) {
        if ($r->user()->role !== 'superadmin') {
            return response()->json(['error'=>'Unauthorized'],403);
        }
        DB::table('suppliers')->where('id',$id)->delete();
        return response()->json(['success'=>true]);
    });

    Route::post('/v1/supplier-accounts/{id}/reveal', function(Request $r, $id) {
        if ($r->user()->role !== 'superadmin') {
            return response()->json(['error'=>'Unauthorized'],403);
        }
        $s = DB::table('suppliers')->find($id);
        if (!$s) return response()->json(['error'=>'Supplier not found'],404);
        DB::table('audit_logs')->insert([
            'user'=>$r->user()->name,'role'=>$r->user()->role??'unknown','action'=>'REVEAL_SECRET',
            'module'=>'Suppliers','details'=>"Revealed api_secret for supplier #{$id} ({$s->name})",
            'ip_address'=>$r->ip(),'method'=>'POST','url'=>"/api/v1/supplier-accounts/{$id}/reveal",
            'status_code'=>200,'created_at'=>now(),'updated_at'=>now(),
        ]);
        return response()->json(['field'=>'api_secret','value'=>$s->api_secret]);
    });

    Route::post('/v1/supplier-accounts/{id}/api-test', function(Request $r, $id) {
        $s = DB::table('suppliers')->find($id);
        if (!$s) return response()->json(['error'=>'Supplier not found'],404);
        if (!$s->api_enabled || !$s->api_endpoint) return response()->json(['error'=>'API not configured'],400);
        $ok = false; $code = null;
        try {
            $ch = curl_init($s->api_endpoint);
            curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER=>true, CURLOPT_TIMEOUT=>8, CURLOPT_NOBODY=>true, CURLOPT_SSL_VERIFYPEER=>true]);
            curl_exec($ch);
            $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);
            $ok = $code > 0 && $code < 500;
        } catch (\Throwable $e) { $ok = false; }
        DB::table('suppliers')->where('id',$id)->update([
            'api_last_sync'   => now(),
            'api_last_status' => $ok ? 'connected' : 'failed',
            'updated_at'      => now(),
        ]);
        return response()->json(['success'=>$ok,'status'=>$ok?'connected':'failed','http_code'=>$code]);
    });

    // ── Supplier's own API sync (World Premium Telecom-style REST API:
    // GET {endpoint}/numbers and GET {endpoint}/cdr, paginated via
    // page/pageSize, auth via Bearer token in api_secret). Numbers sync
    // upserts into the existing dids table (never creates a parallel
    // number store); CDR sync writes into supplier_cdrs, a dedicated
    // table for this supplier's own billing/CDR feed - kept separate
    // from the Asterisk-driven cdrs table so Asterisk CDR/revenue/IVR
    // logic is never touched by this sync.
    $supplierApiCall = function($s, $path, $page, $extraQuery=[]) {
        $query = array_merge(['page'=>$page,'pageSize'=>200], $extraQuery);
        $url = rtrim($s->api_endpoint,'/').'/'.ltrim($path,'/').'?'.http_build_query($query);
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 20,
            CURLOPT_HTTPHEADER     => [
                'Authorization: Bearer '.($s->api_secret??''),
                'Accept: application/json',
            ],
        ]);
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        return [$response, $httpCode];
    };

    Route::post('/v1/supplier-accounts/{id}/api-sync-numbers', function($id) use ($supplierApiCall) {
        $s = DB::table('suppliers')->find($id);
        if (!$s) return response()->json(['error'=>'Supplier not found'],404);
        if (!$s->api_enabled || !$s->api_endpoint) return response()->json(['error'=>'API not configured'],400);

        $imported=0; $updated=0; $errors=0; $page=1; $pages=1; $total=0;
        do {
            [$response,$httpCode] = $supplierApiCall($s,'numbers',$page);
            if ($httpCode === 403) return response()->json(['error'=>'The API token is not valid'],403);
            $body = json_decode($response,true);
            if ($httpCode >= 400) {
                $apiError = $body['errors'][0]['error'] ?? $body['message'] ?? 'Request rejected by supplier API';
                DB::table('suppliers')->where('id',$id)->update(['api_last_sync'=>now(),'api_last_status'=>'failed','updated_at'=>now()]);
                return response()->json(['error'=>$apiError,'http_code'=>$httpCode],502);
            }
            if (!$body || !isset($body['data']) || !is_array($body['data'])) {
                DB::table('suppliers')->where('id',$id)->update(['api_last_sync'=>now(),'api_last_status'=>'failed','updated_at'=>now()]);
                return response()->json(['error'=>'Invalid response from supplier API','http_code'=>$httpCode],502);
            }
            $pages = $body['pages'] ?? 1;
            $total = $body['total'] ?? count($body['data']);

            foreach ($body['data'] as $item) {
                $num = preg_replace('/[^0-9]/','', $item['number'] ?? '');
                if (!$num) { $errors++; continue; }
                $e164 = '+'.$num;

                // Match the longest known prefix for this supplier to inherit
                // country/prefix_id (the /numbers feed has no country field).
                $prefix = DB::table('supplier_prefixes')->where('supplier_id',$id)
                    ->get()->filter(fn($p)=>str_starts_with($num, preg_replace('/\s+/','',$p->prefix)))
                    ->sortByDesc(fn($p)=>strlen($p->prefix))->first();

                $rate = $item['offpeakPrice'] ?? $item['peakPrice'] ?? $prefix->price ?? 0;
                $data = [
                    'currency'       => $item['currency'] ?? 'EUR',
                    'tariff'         => $rate,
                    'selling_price'  => $rate,
                    'payment_terms'  => ucfirst(strtolower($item['billingPeriod'] ?? 'Weekly')),
                    'country_name'   => $prefix->country ?? 'Unknown',
                    'country_code'   => 'XX',
                    'prefix'         => $prefix->prefix ?? null,
                    'prefix_id'      => $prefix->id ?? null,
                    'ivr_context'    => 'custom/6g-premium-telecom',
                    'status'         => 'active',
                    'updated_at'     => now(),
                ];

                $existing = DB::table('dids')->where('supplier_id',$id)
                    ->where(function($q) use ($num,$e164){ $q->where('number',$e164)->orWhere('number',$num); })
                    ->first();
                if ($existing) {
                    DB::table('dids')->where('id',$existing->id)->update($data);
                    $updated++;
                } else {
                    DB::table('dids')->insert(array_merge($data, [
                        'number'=>$e164,'supplier_id'=>$id,'is_test'=>0,'created_at'=>now(),
                    ]));
                    $imported++;
                }
            }
            $page++;
        } while ($page <= $pages);

        DB::table('suppliers')->where('id',$id)->update(['api_last_sync'=>now(),'api_last_status'=>'connected','updated_at'=>now()]);
        return response()->json([
            'success'  => true,
            'imported' => $imported,
            'updated'  => $updated,
            'errors'   => $errors,
            'total'    => $total,
            'message'  => "Numbers sync: {$imported} new, {$updated} updated, {$errors} skipped",
        ]);
    });

    Route::post('/v1/supplier-accounts/{id}/api-sync-cdr', function(Request $r, $id) use ($supplierApiCall) {
        $s = DB::table('suppliers')->find($id);
        if (!$s) return response()->json(['error'=>'Supplier not found'],404);
        if (!$s->api_enabled || !$s->api_endpoint) return response()->json(['error'=>'API not configured'],400);

        // The supplier's /cdr endpoint requires dateFrom; default to the
        // last 30 days (or a custom range the caller passes in).
        $dateFrom = $r->query('date_from') ? date('Y-m-d\TH:i:s', strtotime($r->query('date_from'))) : date('Y-m-d\TH:i:s', strtotime('-30 days'));

        $imported=0; $skipped=0; $page=1; $pages=1; $total=0;
        do {
            [$response,$httpCode] = $supplierApiCall($s,'cdr',$page,['dateFrom'=>$dateFrom]);
            if ($httpCode === 403) return response()->json(['error'=>'The API token is not valid'],403);
            $body = json_decode($response,true);
            if ($httpCode >= 400) {
                $apiError = $body['errors'][0]['error'] ?? $body['message'] ?? 'Request rejected by supplier API';
                DB::table('suppliers')->where('id',$id)->update(['api_last_sync'=>now(),'api_last_status'=>'failed','updated_at'=>now()]);
                return response()->json(['error'=>$apiError,'http_code'=>$httpCode],502);
            }
            if (!$body || !isset($body['data']) || !is_array($body['data'])) {
                DB::table('suppliers')->where('id',$id)->update(['api_last_sync'=>now(),'api_last_status'=>'failed','updated_at'=>now()]);
                return response()->json(['error'=>'Invalid response from supplier API','http_code'=>$httpCode],502);
            }
            $pages = $body['pages'] ?? 1;
            $total = $body['total'] ?? count($body['data']);

            foreach ($body['data'] as $item) {
                $callDate = isset($item['date']) ? date('Y-m-d H:i:s', strtotime($item['date'])) : null;
                $exists = DB::table('supplier_cdrs')->where('supplier_id',$id)
                    ->where('cli',$item['cli']??'')->where('prn',$item['prn']??'')
                    ->where('call_date',$callDate)->exists();
                if ($exists) { $skipped++; continue; }
                DB::table('supplier_cdrs')->insert([
                    'supplier_id'    => $id,
                    'cli'            => $item['cli'] ?? null,
                    'prn'            => $item['prn'] ?? null,
                    'operator'       => $item['operator'] ?? null,
                    'country'        => $item['country'] ?? null,
                    'billsec'        => $item['billsec'] ?? 0,
                    'call_date'      => $callDate,
                    'payout'         => $item['payout'] ?? 0,
                    'payout_per_min' => $item['payoutPerMin'] ?? 0,
                    'currency_code'  => $item['currencyCode'] ?? 'EUR',
                    'account'        => $item['account'] ?? null,
                    'sub_account'    => $item['subAccount'] ?? null,
                    'created_at'     => now(),
                    'updated_at'     => now(),
                ]);
                $imported++;
            }
            $page++;
        } while ($page <= $pages);

        DB::table('suppliers')->where('id',$id)->update(['api_last_sync'=>now(),'api_last_status'=>'connected','updated_at'=>now()]);
        return response()->json([
            'success'  => true,
            'imported' => $imported,
            'skipped'  => $skipped,
            'total'    => $total,
            'message'  => "CDR sync: {$imported} new, {$skipped} already recorded",
        ]);
    });

    // Real-time active calls from the supplier's own API (GET /active-calls
    // - no pagination needed, WTP returns the current snapshot directly).
    // Read-only passthrough normalized for the frontend's Live Call merge;
    // nothing is written to the database here.
    Route::get('/v1/supplier-accounts/{id}/api-live-calls', function($id) use ($supplierApiCall) {
        $s = DB::table('suppliers')->find($id);
        if (!$s || !$s->api_enabled || !$s->api_endpoint) return response()->json(['data'=>[]]);
        [$response,$httpCode] = $supplierApiCall($s,'active-calls',1);
        if ($httpCode !== 200) return response()->json(['data'=>[]]);
        $body = json_decode($response,true);
        $calls = array_map(function($c){
            return [
                'cli'          => $c['cli'] ?? null,
                'prn'          => $c['prn'] ?? null,
                'callDuration' => $c['callDuration'] ?? 0,
                'callBegan'    => $c['callBegan'] ?? null,
                'operator'     => $c['operator'] ?? null,
                'country'      => $c['country'] ?? null,
                'account'      => $c['account'] ?? null,
                'subAccount'   => $c['subAccount'] ?? null,
            ];
        }, $body['data'] ?? []);
        return response()->json(['data'=>$calls]);
    });

    Route::get('/v1/supplier-accounts/{id}/cdr', function(Request $r, $id) {
        $q = DB::table('supplier_cdrs')->where('supplier_id',$id)->orderByDesc('call_date');
        $total = $q->count();
        $perPage = (int)($r->query('pageSize', 50));
        $page = max(1,(int)($r->query('page',1)));
        $rows = $q->forPage($page,$perPage)->get();
        return response()->json(['data'=>$rows,'page'=>$page,'pageSize'=>$perPage,'total'=>$total]);
    });

    // Manual CDR upload (rows parsed from csv/xlsx in the dashboard).
    // Each row goes to two places:
    //  1. supplier_cdrs (the supplier's own record; duplicate = same supplier + CLI + PRN + call date)
    //  2. cdrs, the main CDR list, for billable rows only (billsec > 0). A row matches an
    //     existing main CDR when caller + number agree and the start times fall in the same minute.
    // New rows are added; for rows that already exist, mode 'skip' leaves them alone and
    // mode 'replace' overwrites them.
    Route::post('/v1/supplier-accounts/{id}/cdr-import', function(Request $r, $id) {
        $supplier = DB::table('suppliers')->find($id);
        if (!$supplier) return response()->json(['error'=>'Supplier not found'],404);
        $mode = $r->input('mode','skip');
        if (!in_array($mode,['skip','replace'],true)) return response()->json(['error'=>'mode must be skip or replace'],422);
        $rows = $r->input('rows',[]);
        if (!is_array($rows) || count($rows) === 0) return response()->json(['error'=>'No rows to import'],422);
        if (count($rows) > 2000) return response()->json(['error'=>'Send at most 2000 rows per request'],422);

        $c = ['added'=>0,'replaced'=>0,'skipped'=>0,'invalid'=>0,'main_added'=>0,'main_replaced'=>0,'main_skipped'=>0];
        DB::transaction(function() use ($rows,$id,$mode,$supplier,&$c) {
            foreach ($rows as $item) {
                $ts = strtotime($item['call_date'] ?? '');
                if (!$ts) { $c['invalid']++; continue; }
                $callDate = date('Y-m-d H:i:s',$ts);
                $cli = trim((string)($item['cli'] ?? ''));
                $prn = trim((string)($item['prn'] ?? ''));
                if ($cli === '' && $prn === '') { $c['invalid']++; continue; }

                $values = [
                    'operator'       => $item['operator'] ?? null,
                    'country'        => $item['country'] ?? null,
                    'billsec'        => (int)($item['billsec'] ?? 0),
                    'payout'         => (float)($item['payout'] ?? 0),
                    'payout_per_min' => (float)($item['payout_per_min'] ?? 0),
                    'currency_code'  => substr($item['currency_code'] ?? 'EUR',0,5),
                    'account'        => $item['account'] ?? null,
                    'sub_account'    => $item['sub_account'] ?? null,
                ];
                $match = DB::table('supplier_cdrs')->where('supplier_id',$id)
                    ->where('cli',$cli)->where('prn',$prn)->where('call_date',$callDate);
                if ($match->exists()) {
                    if ($mode === 'replace') { $match->update($values + ['updated_at'=>now()]); $c['replaced']++; }
                    else { $c['skipped']++; }
                } else {
                    DB::table('supplier_cdrs')->insert($values + [
                        'supplier_id'=>$id,'cli'=>$cli,'prn'=>$prn,'call_date'=>$callDate,
                        'created_at'=>now(),'updated_at'=>now(),
                    ]);
                    $c['added']++;
                }

                // ── main CDR (billable calls only) ──
                if ($values['billsec'] <= 0) continue;
                $revenue = $values['payout'] > 0 ? $values['payout'] : round(($values['billsec']/60)*$values['payout_per_min'],6);
                $currency = substr($item['currency_code'] ?? 'USD',0,5);
                $mainMatch = DB::table('cdrs')->where('src',$cli)
                    ->whereRaw("REPLACE(did,'+','') = ?",[ltrim($prn,'+')]);
                // Supplier files often list start times to the minute only (seconds = 00):
                // match anything inside that same minute, so two calls a minute apart stay
                // separate. Otherwise allow a few seconds of clock difference.
                if (date('s',$ts) === '00') {
                    $mainMatch->whereRaw('call_start >= ? AND call_start < DATE_ADD(?, INTERVAL 60 SECOND)',[$callDate,$callDate]);
                } else {
                    $mainMatch->whereRaw('ABS(TIMESTAMPDIFF(SECOND, call_start, ?)) <= 10',[$callDate]);
                }
                if ($mainMatch->exists()) {
                    if ($mode === 'replace') {
                        $mainMatch->update(['billsec'=>$values['billsec'],'duration'=>$values['billsec'],'revenue'=>$revenue,'revenue_eur'=>$revenue,
                            'currency'=>$currency,'disposition'=>'ANSWERED','updated_at'=>now()]);
                        $c['main_replaced']++;
                    } else { $c['main_skipped']++; }
                    continue;
                }
                $did = DB::table('dids')->where('number',$prn)->orWhere('number','+'.$prn)->first();
                DB::table('cdrs')->insert([
                    'src'=>$cli,'dst'=>$prn,'did'=>$prn,'caller'=>$cli,'callee'=>$prn,
                    'billsec'=>$values['billsec'],'duration'=>$values['billsec'],'disposition'=>'ANSWERED',
                    'revenue'=>$revenue,'revenue_eur'=>$revenue,'ivr_context'=>$did->ivr_context ?? null,
                    'trunk_name'=>$supplier->name,'call_start'=>$callDate,'currency'=>$currency,
                    'created_at'=>now(),'updated_at'=>now(),
                ]);
                $c['main_added']++;
            }
        });
        // Weeks that have ended get their unpaid weekly entries (Weekly tab on Supplier Payments)
        $wk = \App\Support\WeeklyEntries::sync((int)$id);
        return response()->json([
            'success'=>true,'added'=>$c['added'],'replaced'=>$c['replaced'],'skipped'=>$c['skipped'],'invalid'=>$c['invalid'],
            'main_added'=>$c['main_added'],'main_replaced'=>$c['main_replaced'],'main_skipped'=>$c['main_skipped'],
            'weekly_created'=>$wk['created'],'weekly_updated'=>$wk['updated'],
            'message'=>"Supplier CDR: {$c['added']} new, {$c['replaced']} replaced, {$c['skipped']} skipped. Main CDR: {$c['main_added']} new, {$c['main_replaced']} replaced, {$c['main_skipped']} skipped. Weekly entries: {$wk['created']} new, {$wk['updated']} updated. {$c['invalid']} invalid",
        ]);
    });

    // Supplier weekly report (CLIENT / TERMINATION / NUMBER / CALLS / MINUTES / ACD / RATE / PAYOUT):
    // one line per number, no dates or callers. It becomes ONE unpaid weekly entry per currency (shown on
    // Supplier Payments -> Weekly and counted in Rev) plus its lines on the supplier's CDR page. Uploading the
    // same week again is skipped, or replaced (mode 'replace') while the entry is still unpaid.
    Route::post('/v1/supplier-accounts/{id}/weekly-report', function(Request $r, $id) {
        $sup = DB::table('suppliers')->find($id);
        if (!$sup) return response()->json(['error'=>'Supplier not found'],404);
        $mode = $r->input('mode','skip');
        if (!in_array($mode,['skip','replace'],true)) return response()->json(['error'=>'mode must be skip or replace'],422);
        $lines = $r->input('lines',[]);
        if (!is_array($lines) || count($lines) === 0) return response()->json(['error'=>'No lines to import'],422);
        if (count($lines) > 5000) return response()->json(['error'=>'Too many lines'],422);
        $ts = strtotime($r->input('week_start',''));
        if (!$ts) return response()->json(['error'=>'A valid week is required'],422);
        $start = \Carbon\Carbon::createFromTimestamp($ts)->startOfWeek();          // Monday
        $end = $start->copy()->addDays(6);
        $callDate = $start->toDateString().' 00:00:00';

        $byCur = [];
        foreach ($lines as $l) $byCur[strtoupper(substr($l['currency'] ?? 'USD',0,5))][] = $l;

        $res = ['created'=>[],'replaced'=>[],'skipped'=>[],'blocked'=>[]];
        DB::transaction(function() use ($byCur,$sup,$id,$mode,$start,$end,$callDate,&$res) {
            $n = 0;
            foreach ($byCur as $cur => $ls) {
                $ref = "M{$id}-".$start->toDateString()."-{$cur}";
                $entry = DB::table('invoices')->where('invoice_number',$ref)->first();
                if ($entry && $entry->status === 'paid') { $res['blocked'][] = $cur; continue; }   // never change a paid week
                if ($entry && $mode === 'skip') { $res['skipped'][] = $cur; continue; }
                DB::table('supplier_cdrs')->where('supplier_id',$id)->where('call_date',$callDate)
                    ->where('cli','like','SUMMARY-%')->where('currency_code',$cur)->delete();
                $calls = 0; $min = 0.0; $pay = 0.0;
                foreach ($ls as $l) {
                    $n++;
                    $calls += (int)($l['calls'] ?? 0); $min += (float)($l['minutes'] ?? 0); $pay += (float)($l['payout'] ?? 0);
                    DB::table('supplier_cdrs')->insert([
                        'supplier_id'=>$id,'cli'=>'SUMMARY-'.str_pad($n,2,'0',STR_PAD_LEFT),'prn'=>substr((string)($l['number'] ?? ''),0,255),
                        'operator'=>$l['operator'] ?? null,'country'=>$l['country'] ?? null,
                        'billsec'=>(int)round(((float)($l['minutes'] ?? 0))*60),'call_date'=>$callDate,
                        'payout'=>(float)($l['payout'] ?? 0),'payout_per_min'=>(float)($l['rate'] ?? 0),'currency_code'=>$cur,
                        'account'=>$l['client'] ?? null,'sub_account'=>((int)($l['calls'] ?? 0)).' calls · ACD '.((float)($l['acd'] ?? 0)),
                        'created_at'=>now(),'updated_at'=>now(),
                    ]);
                }
                $vals = ['total_calls'=>$calls,'total_minutes'=>round($min,4),'total_amount'=>round($pay,4),
                         'rate'=>$min > 0 ? round($pay/$min,6) : 0,'updated_at'=>now()];
                if ($entry) { DB::table('invoices')->where('id',$entry->id)->update($vals); $res['replaced'][] = $cur; }
                else {
                    DB::table('invoices')->insert($vals + [
                        'invoice_number'=>$ref,'supplier_id'=>$id,'supplier_name'=>$sup->name,'period_start'=>$start->toDateString(),
                        'period_end'=>$end->toDateString(),'currency'=>$cur,'status'=>'unpaid','invoice_type'=>'supplier_payment',
                        'payment_term'=>'Weekly','notes'=>'Weekly report upload','created_at'=>now(),
                    ]);
                    $res['created'][] = $cur;
                }
            }
        });
        $tot = collect($lines)->sum(fn($l)=>(float)($l['payout'] ?? 0));
        $msg = 'Weekly report '.$start->format('d M').' – '.$end->format('d M Y').': '.count($lines).' lines, payout '.number_format($tot,4).'. ';
        $msg .= count($res['created']).' new unpaid weekly entr'.(count($res['created'])===1?'y':'ies').', '.count($res['replaced']).' replaced, '.count($res['skipped']).' skipped (already recorded)';
        if ($res['blocked']) $msg .= ', '.count($res['blocked']).' not changed because that week is already PAID';
        return response()->json(['success'=>true,'week_start'=>$start->toDateString(),'week_end'=>$end->toDateString()] + $res + ['message'=>$msg]);
    });

    // ── Supplier Prefixes (master inventory record) ─────────────
    // Prefix is the master record: Numbers/Ranges and Test Numbers both
    // belong to a Prefix (prefix_id) and inherit country/price/payment_term
    // from it. Rate is always USDT/min - no currency field exists here by
    // design. Deleting a Prefix cascades (DB-level FK) to its child
    // dids/did_ranges rows only; cdrs and invoices have no FK to
    // supplier_prefixes, so historical CDRs/revenue/payments are never
    // affected by a prefix deletion.
    Route::get('/v1/supplier-accounts/{id}/prefixes', function($id) {
        $prefixes = DB::table('supplier_prefixes')->where('supplier_id',$id)->orderBy('prefix')->get();
        $numberCounts = DB::table('dids')->where('supplier_id',$id)->where('is_test',0)
            ->whereNotNull('prefix_id')->select('prefix_id',DB::raw('COUNT(*) as c'))->groupBy('prefix_id')->pluck('c','prefix_id');
        // A range that has been materialised into dids rows (dids.batch_id) is
        // already counted above - only bare ranges add their total_count.
        $rangeCounts = DB::table('did_ranges')->where('supplier_id',$id)
            ->whereNotExists(fn($q)=>$q->select(DB::raw(1))->from('dids')->whereColumn('dids.batch_id','did_ranges.id'))
            ->whereNotNull('prefix_id')->select('prefix_id',DB::raw('COALESCE(SUM(total_count),0) as c'))->groupBy('prefix_id')->pluck('c','prefix_id');
        $testCounts = DB::table('dids')->where('supplier_id',$id)->where('is_test',1)
            ->whereNotNull('prefix_id')->select('prefix_id',DB::raw('COUNT(*) as c'))->groupBy('prefix_id')->pluck('c','prefix_id');
        $out = $prefixes->map(function($p) use ($numberCounts,$rangeCounts,$testCounts) {
            $p = (array)$p;
            $p['number_count'] = ($numberCounts[$p['id']] ?? 0) + ($rangeCounts[$p['id']] ?? 0);
            $p['test_number_count'] = $testCounts[$p['id']] ?? 0;
            return $p;
        });
        return response()->json(['data'=>$out]);
    });

    Route::post('/v1/supplier-accounts/{id}/prefixes', function(Request $r, $id) {
        $supplier = DB::table('suppliers')->find($id);
        if (!$supplier) return response()->json(['error'=>'Supplier not found'],404);
        if (!$r->prefix || !$r->country || !$r->price || !$r->payment_term || !$r->test_number)
            return response()->json(['error'=>'Prefix, country, price, payment term and test number are required'],422);
        if (DB::table('supplier_prefixes')->where('supplier_id',$id)->where('prefix',$r->prefix)->exists())
            return response()->json(['error'=>'This prefix already exists for this supplier'],409);

        $ivrContext = $r->ivr_context ?: 'custom/6g-premium-telecom';
        $prefixId = DB::table('supplier_prefixes')->insertGetId([
            'supplier_id'   => $id,
            'prefix'        => $r->prefix,
            'country'       => $r->country,
            'country_code'  => $r->country_code,
            'price'         => $r->price,
            'payment_term'  => $r->payment_term,
            'test_number'   => $r->test_number,
            'operator'      => $r->operator,
            'ivr_context'   => $r->ivr_context,
            'status'        => $r->status ?? 'active',
            'created_at'    => now(),
            'updated_at'    => now(),
        ]);

        // The Prefix's own required test number is immediately reflected as
        // a real Test Number record too, so both tables stay in sync without
        // asking the user to enter it twice.
        $num = '+'.ltrim(preg_replace('/[^0-9]/','',$r->test_number),'+');
        if (!DB::table('dids')->where('number',$num)->exists()) {
            $trunk = DB::table('trunks')->where('supplier_id',$id)->first();
            DB::table('dids')->insert([
                'number' => $num, 'trunk_id' => $trunk->id ?? null, 'supplier_id' => $id,
                'prefix_id' => $prefixId, 'is_test' => 1, 'prefix' => $r->prefix,
                'country_name' => $r->country, 'country_code' => 'XX', 'tariff' => $r->price,
                'currency' => 'USDT', 'status' => 'active', 'ivr_context' => $ivrContext,
                'created_at' => now(), 'updated_at' => now(),
            ]);
        }

        return response()->json(['success'=>true,'data'=>DB::table('supplier_prefixes')->find($prefixId)],201);
    });

    Route::put('/v1/supplier-accounts/{id}/prefixes/{prefixId}', function(Request $r, $id, $prefixId) {
        $prefix = DB::table('supplier_prefixes')->where('id',$prefixId)->where('supplier_id',$id)->first();
        if (!$prefix) return response()->json(['error'=>'Prefix not found for this supplier'],404);
        if ($r->filled('prefix') && $r->prefix !== $prefix->prefix
            && DB::table('supplier_prefixes')->where('supplier_id',$id)->where('prefix',$r->prefix)->exists())
            return response()->json(['error'=>'This prefix already exists for this supplier'],409);
        $newIvrContext = $r->ivr_context ?? $prefix->ivr_context;
        DB::table('supplier_prefixes')->where('id',$prefixId)->update([
            'prefix'       => $r->prefix ?? $prefix->prefix,
            'country'      => $r->country ?? $prefix->country,
            'country_code' => $r->country_code ?? $prefix->country_code,
            'price'        => $r->price ?? $prefix->price,
            'payment_term' => $r->payment_term ?? $prefix->payment_term,
            'test_number'  => $r->test_number ?? $prefix->test_number,
            'operator'     => $r->operator ?? $prefix->operator,
            'ivr_context'  => $newIvrContext,
            'status'       => $r->status ?? $prefix->status,
            'updated_at'   => now(),
        ]);

        // Changing the prefix's IVR re-applies it to every number already
        // created under this prefix - the whole point of assigning IVR at
        // the prefix level instead of per individual number.
        if ($r->filled('ivr_context') && $newIvrContext !== $prefix->ivr_context) {
            DB::table('dids')->where('prefix_id', $prefixId)->update(['ivr_context' => $newIvrContext, 'updated_at' => now()]);
            DB::table('did_ranges')->where('prefix_id', $prefixId)->update(['default_ivr' => $newIvrContext, 'updated_at' => now()]);
        }

        return response()->json(['success'=>true,'data'=>DB::table('supplier_prefixes')->find($prefixId)]);
    });

    Route::delete('/v1/supplier-accounts/{id}/prefixes/{prefixId}', function($id, $prefixId) {
        $prefix = DB::table('supplier_prefixes')->where('id',$prefixId)->where('supplier_id',$id)->first();
        if (!$prefix) return response()->json(['error'=>'Prefix not found for this supplier'],404);
        // DB-level ON DELETE CASCADE removes child dids/did_ranges rows;
        // cdrs/invoices are untouched (no FK path from supplier_prefixes).
        DB::table('supplier_prefixes')->where('id',$prefixId)->delete();
        return response()->json(['success'=>true]);
    });

    // Numbers/ranges are the supplier's production inventory (existing
    // dids/did_ranges tables, filtered by supplier_id) and always belong to
    // a Prefix. Test numbers use the same dids table with is_test=1 so they
    // can never mix with production numbers.
    Route::get('/v1/supplier-accounts/{id}/numbers', function($id) {
        $numbers = DB::table('dids')->where('supplier_id',$id)->where('is_test',0)->orderByDesc('created_at')->get();
        $ranges  = DB::table('did_ranges')->where('supplier_id',$id)->orderByDesc('created_at')->get();
        return response()->json(['data'=>['numbers'=>$numbers,'ranges'=>$ranges]]);
    });

    Route::post('/v1/supplier-accounts/{id}/numbers', function(Request $r, $id) {
        $supplier = DB::table('suppliers')->find($id);
        if (!$supplier) return response()->json(['error'=>'Supplier not found'],404);
        if (!$r->prefix_id) return response()->json(['error'=>'prefix_id is required'],422);
        $prefix = DB::table('supplier_prefixes')->where('id',$r->prefix_id)->where('supplier_id',$id)->first();
        if (!$prefix) return response()->json(['error'=>'Prefix not found for this supplier'],422);
        $trunk = DB::table('trunks')->where('supplier_id',$id)->first();

        if ($r->mode === 'range') {
            if (!$r->range_start || !$r->range_end) return response()->json(['error'=>'range_start and range_end are required'],422);
            $start = preg_replace('/[^0-9]/','',$r->range_start);
            $end   = preg_replace('/[^0-9]/','',$r->range_end);
            $count = (int)$end - (int)$start + 1;
            if ($count < 1) return response()->json(['error'=>'range_end must be >= range_start'],422);
            $rangeId = DB::table('did_ranges')->insertGetId([
                'batch_name'    => $r->batch_name ?? ($prefix->country.' '.$prefix->prefix),
                'country_code'  => 'XX',
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
                'supplier_id'   => $id,
                'trunk_id'      => $trunk->id ?? null,
                'default_ivr'   => $r->ivr_context ?? $prefix->ivr_context ?? 'custom/6g-premium-telecom',
                'total_count'   => $count,
                'is_active'     => 1,
                'created_at'    => now(),
                'updated_at'    => now(),
            ]);
            return response()->json(['success'=>true,'data'=>DB::table('did_ranges')->find($rangeId)],201);
        }

        // Single number
        if (!$r->number) return response()->json(['error'=>'number is required'],422);
        $num = '+'.ltrim(preg_replace('/[^0-9]/','',$r->number),'+');
        if (DB::table('dids')->where('number',$num)->exists())
            return response()->json(['error'=>'Number already exists'],409);
        $didId = DB::table('dids')->insertGetId([
            'number'        => $num,
            'trunk_id'      => $trunk->id ?? null,
            'supplier_id'   => $id,
            'prefix_id'     => $prefix->id,
            'is_test'       => 0,
            'prefix'        => $prefix->prefix,
            'country_name'  => $prefix->country,
            'country_code'  => 'XX',
            'tariff'        => $prefix->price,
            'selling_price' => $prefix->price,
            'currency'      => 'USDT',
            'payment_terms' => $prefix->payment_term,
            'status'        => 'active',
            'ivr_context'   => $r->ivr_context ?? $prefix->ivr_context ?? 'custom/6g-premium-telecom',
            'created_at'    => now(),
            'updated_at'    => now(),
        ]);
        return response()->json(['success'=>true,'data'=>DB::table('dids')->find($didId)],201);
    });

    Route::get('/v1/supplier-accounts/{id}/test-numbers', function($id) {
        $rows = DB::table('dids')->where('supplier_id',$id)->where('is_test',1)->orderByDesc('created_at')->get();
        return response()->json(['data'=>$rows]);
    });

    Route::post('/v1/supplier-accounts/{id}/test-numbers', function(Request $r, $id) {
        $supplier = DB::table('suppliers')->find($id);
        if (!$supplier) return response()->json(['error'=>'Supplier not found'],404);
        if (!$r->prefix_id) return response()->json(['error'=>'prefix_id is required'],422);
        $prefix = DB::table('supplier_prefixes')->where('id',$r->prefix_id)->where('supplier_id',$id)->first();
        if (!$prefix) return response()->json(['error'=>'Prefix not found for this supplier'],422);
        if (!$r->number) return response()->json(['error'=>'number is required'],422);
        $num = '+'.ltrim(preg_replace('/[^0-9]/','',$r->number),'+');
        if (DB::table('dids')->where('number',$num)->exists())
            return response()->json(['error'=>'Number already exists'],409);
        $trunk = DB::table('trunks')->where('supplier_id',$id)->first();
        $id2 = DB::table('dids')->insertGetId([
            'number'        => $num,
            'trunk_id'      => $trunk->id ?? null,
            'supplier_id'   => $id,
            'prefix_id'     => $prefix->id,
            'is_test'       => 1,
            'prefix'        => $prefix->prefix,
            'country_name'  => $prefix->country,
            'country_code'  => 'XX',
            'tariff'        => $prefix->price,
            'currency'      => 'USDT',
            'status'        => 'active',
            'ivr_context'   => $r->ivr_context ?? $prefix->ivr_context ?? 'custom/6g-premium-telecom',
            'created_at'    => now(),
            'updated_at'    => now(),
        ]);
        if ($r->notes) DB::table('dids')->where('id',$id2)->update(['route'=>$r->notes]);
        return response()->json(['success'=>true,'data'=>DB::table('dids')->find($id2)],201);
    });

    // ── Numbers & IVR: Add Range (preview -> import) ─────────────────
    // Supplier -> Trunk + Prefix -> Range -> individual DIDs -> IVR.
    // Both endpoints share one planner so the preview is exactly what the
    // import will do; preview never writes. Import materialises one dids
    // row per number (did_router.php looks DIDs up by exact number) plus a
    // did_ranges row that ties them together via dids.batch_id.
    $rangePlan = function(Request $r) {
        $errors = []; $warnings = [];
        $digits = fn($v) => preg_replace('/[^0-9]/', '', (string)$v);
        $supplier = DB::table('suppliers')->find($r->supplier_id);
        if (!$supplier) $errors[] = 'Select a supplier';
        $prefix = $digits($r->prefix);
        $start  = $digits($r->range_start);
        $end    = $digits($r->range_end);
        $test   = $digits($r->test_number);
        $country = trim((string)$r->country);
        $tariff = $r->tariff; $selling = $r->selling_price;
        if ($country === '') $errors[] = 'Country is required';
        if ($prefix === '') $errors[] = 'Prefix is required';
        if ($start === '' || $end === '') $errors[] = 'Range start and end are required';
        if (!is_numeric($tariff) || $tariff < 0) $errors[] = 'Tariff must be a number';
        if (!is_numeric($selling) || $selling < 0) $errors[] = 'Selling price must be a number';
        if (trim((string)$r->payment_term) === '') $errors[] = 'Payment term is required';

        $count = 0;
        if ($prefix !== '' && $start !== '' && $end !== '') {
            if (strlen($start) !== strlen($end)) $errors[] = 'Range start and end must have the same number of digits';
            elseif (strlen($start) > 15) $errors[] = 'Numbers cannot be longer than 15 digits';
            elseif (!str_starts_with($start, $prefix) || !str_starts_with($end, $prefix))
                $errors[] = "Range start and end must both begin with the prefix $prefix";
            elseif ((int)$end < (int)$start) $errors[] = 'Range end must not be before range start';
            else {
                $count = (int)$end - (int)$start + 1;
                if ($count > 100000) { $errors[] = 'Range too large (max 100,000 numbers)'; }
            }
        }
        if ($test !== '' && $count > 0 && ((int)$test < (int)$start || (int)$test > (int)$end || strlen($test) !== strlen($start)))
            $errors[] = 'Test number must be inside the range';

        $existing = []; $trunk = null; $prefixRow = null;
        if ($supplier) {
            $trunk = DB::table('trunks')->where('supplier_id', $supplier->id)->first();
            if (!$trunk) $warnings[] = 'This supplier has no trunk yet - numbers will be created without one';
            if ($prefix !== '') {
                $prefixRow = DB::table('supplier_prefixes')->where('supplier_id', $supplier->id)->where('prefix', $prefix)->first();
                if ($prefixRow && is_numeric($tariff) && abs((float)$prefixRow->price - (float)$tariff) > 0.0000001)
                    $errors[] = "Prefix $prefix already exists for {$supplier->name} at tariff "
                        . rtrim(rtrim(number_format((float)$prefixRow->price, 6, '.', ''), '0'), '.')
                        . ' - use the same tariff or edit the prefix first';
            }
        }
        if ($count > 0 && !$errors) {
            $overlap = DB::table('did_ranges')->where('range_start', '<=', $end)->where('range_end', '>=', $start)
                ->whereRaw('LENGTH(range_start) = ?', [strlen($start)])->first();
            if ($overlap) $errors[] = "Overlaps existing range {$overlap->range_start} - {$overlap->range_end}";
            DB::table('dids')->whereBetween('number', ['+'.$start, '+'.$end])->orWhereBetween('number', [$start, $end])
                ->select('number', 'supplier_id')->orderBy('number')->get()
                ->each(function($d) use (&$existing) { $existing[ltrim($d->number, '+')] = $d->supplier_id; });
            if ($existing) $warnings[] = count($existing) . ' number(s) already exist and will be skipped';
        }

        $ivr = trim((string)$r->ivr_context);
        if ($ivr === '') $ivr = $prefixRow->ivr_context ?? 'custom/6g-premium-telecom';
        elseif (!str_starts_with($ivr, 'custom/')) $ivr = 'custom/'.$ivr;

        return compact('errors', 'warnings', 'supplier', 'trunk', 'prefixRow', 'prefix', 'start', 'end', 'test',
            'count', 'existing', 'country', 'tariff', 'selling', 'ivr');
    };

    Route::post('/v1/number-ranges/preview', function(Request $r) use ($rangePlan) {
        $p = $rangePlan($r);
        $numbers = [];
        if ($p['count'] > 0 && !$p['errors']) {
            $start = (int)$p['start']; $len = strlen($p['start']);
            $shown = $p['count'] <= 50 ? range(0, $p['count'] - 1)
                : array_merge(range(0, 9), range($p['count'] - 3, $p['count'] - 1));
            foreach ($shown as $i) {
                $n = str_pad((string)($start + $i), $len, '0', STR_PAD_LEFT);
                $numbers[] = ['number' => $n, 'exists' => array_key_exists($n, $p['existing']), 'test' => $n === $p['test']];
            }
        }
        return response()->json(['data' => [
            'valid'        => !$p['errors'],
            'errors'       => $p['errors'],
            'warnings'     => $p['warnings'],
            'total'        => $p['count'],
            'new_count'    => $p['count'] - count($p['existing']),
            'existing_count' => count($p['existing']),
            'prefix_exists' => (bool)$p['prefixRow'],
            'truncated'    => $p['count'] > 50,
            'numbers'      => $numbers,
            'supplier'     => $p['supplier']->name ?? null,
            'trunk'        => $p['trunk']->pjsip_name ?? $p['trunk']->name ?? null,
            'ivr_context'  => $p['ivr'],
        ]]);
    });

    Route::post('/v1/number-ranges/import', function(Request $r) use ($rangePlan) {
        $p = $rangePlan($r);
        if ($p['errors']) return response()->json(['error' => implode('; ', $p['errors'])], 422);
        $supplier = $p['supplier']; $trunk = $p['trunk'];
        $len = strlen($p['start']); $start = (int)$p['start'];

        $created = 0;
        $rangeId = null;
        DB::transaction(function() use ($p, $r, $supplier, $trunk, $len, $start, &$created, &$rangeId) {
            $prefixRow = $p['prefixRow'];
            if (!$prefixRow) {
                $prefixId = DB::table('supplier_prefixes')->insertGetId([
                    'supplier_id' => $supplier->id, 'prefix' => $p['prefix'], 'country' => $p['country'],
                    'price' => $p['tariff'], 'payment_term' => $r->payment_term,
                    'test_number' => $p['test'] !== '' ? '+'.$p['test'] : null,
                    'ivr_context' => $p['ivr'], 'status' => 'active',
                    'created_at' => now(), 'updated_at' => now(),
                ]);
            } else {
                $prefixId = $prefixRow->id;
            }
            $rangeId = DB::table('did_ranges')->insertGetId([
                'batch_name'    => $p['country'].' '.$p['prefix'],
                'country_code'  => 'XX', 'country_name' => $p['country'],
                'prefix'        => $p['prefix'], 'prefix_id' => $prefixId,
                'range_start'   => $p['start'], 'range_end' => $p['end'],
                'rate'          => $p['tariff'], 'selling_price' => $p['selling'],
                'currency'      => 'USDT', 'payment_terms' => $r->payment_term,
                'supplier_name' => $supplier->name, 'supplier_id' => $supplier->id,
                'trunk_id'      => $trunk->id ?? null, 'default_ivr' => $p['ivr'],
                'total_count'   => $p['count'], 'is_active' => 1,
                'created_at'    => now(), 'updated_at' => now(),
            ]);
            $batch = [];
            for ($i = 0; $i < $p['count']; $i++) {
                $n = str_pad((string)($start + $i), $len, '0', STR_PAD_LEFT);
                if (array_key_exists($n, $p['existing'])) continue;
                $batch[] = [
                    'number' => '+'.$n, 'e164_number' => '+'.$n,
                    'trunk_id' => $trunk->id ?? null, 'supplier_id' => $supplier->id,
                    'prefix_id' => $prefixId, 'batch_id' => $rangeId,
                    'is_test' => $n === $p['test'] ? 1 : 0,
                    'prefix' => $p['prefix'], 'country_name' => $p['country'], 'country_code' => 'XX',
                    'tariff' => $p['tariff'], 'selling_price' => $p['selling'],
                    'currency' => 'USDT', 'payment_terms' => $r->payment_term,
                    'lifecycle_status' => 'available', 'status' => 'active',
                    'ivr_context' => $p['ivr'],
                    'created_at' => now(), 'updated_at' => now(),
                ];
                if (count($batch) >= 1000) { DB::table('dids')->insert($batch); $created += count($batch); $batch = []; }
            }
            if ($batch) { DB::table('dids')->insert($batch); $created += count($batch); }
        });

        DB::table('audit_logs')->insert([
            'user'=>$r->user()->name,'role'=>$r->user()->role??'unknown','action'=>'ADD_RANGE',
            'module'=>'Numbers',
            'details'=>"Range {$p['start']}-{$p['end']} for {$supplier->name}: {$created} of {$p['count']} numbers created (prefix {$p['prefix']}, IVR {$p['ivr']})",
            'ip_address'=>$r->ip(),'method'=>'POST','url'=>'/api/v1/number-ranges/import',
            'status_code'=>201,'created_at'=>now(),'updated_at'=>now(),
        ]);
        return response()->json(['success'=>true,'range_id'=>$rangeId,'created'=>$created,
            'skipped'=>$p['count']-$created,'total'=>$p['count']], 201);
    });

    // ── Numbers & IVR: flat Numbers list + Number Details ────────────
    // Paginated server-side because a single Add Range can create tens of
    // thousands of dids rows. "disabled" is a dids.status value; everything
    // else (incl. NULL from older rows) reads as Available.
    $numbersBase = function(Request $r) {
        $q = DB::table('dids')
            ->leftJoin('suppliers', 'dids.supplier_id', '=', 'suppliers.id')
            ->leftJoin('trunks', 'dids.trunk_id', '=', 'trunks.id');
        if ($r->filled('supplier_id')) $q->where('dids.supplier_id', $r->supplier_id);
        elseif ($r->boolean('unassigned')) $q->whereNull('dids.supplier_id');
        if ($r->status === 'disabled') $q->where('dids.status', 'disabled');
        elseif ($r->status === 'available') $q->where(fn($w) => $w->whereNull('dids.status')->orWhere('dids.status', '!=', 'disabled'));
        if ($r->filled('search')) {
            $s = trim($r->search); $d = preg_replace('/[^0-9]/', '', $s);
            $q->where(function($w) use ($s, $d) {
                if ($d !== '') $w->where('dids.number', 'like', "%$d%");
                $w->orWhere('dids.country_name', 'like', "%$s%")->orWhere('dids.prefix', 'like', "%$s%");
            });
        }
        return $q;
    };

    // Delete a whole prefix group (same supplier + prefix as one row of the Numbers screen):
    // its numbers and its range records, in one transaction. The supplier's prefix
    // definition (price/terms) is left alone. expected is the count the user saw; if the
    // group changed since, nothing is deleted. Disabled numbers are un-blocked in the
    // AstDB so a stale blocked_dids entry cannot outlive the number.
    if (!function_exists('deleteNumberGroup')) {
        function deleteNumberGroup($supplierId, $prefix, $expected, $actor, $ip = null) {
            $scope = function($t) use ($supplierId, $prefix) {
                return DB::table($t)->where(DB::raw("COALESCE($t.prefix,'')"), (string)$prefix)
                    ->when($supplierId === null, fn($w) => $w->whereNull("$t.supplier_id"), fn($w) => $w->where("$t.supplier_id", $supplierId));
            };
            $rows = $scope('dids')->get(['id', 'number', 'status']);
            if ($rows->count() !== (int)$expected)
                return ['ok' => false, 'status' => 409, 'error' => "This group now has {$rows->count()} numbers (you saw ".(int)$expected.") - refresh and check again"];
            if ($rows->isEmpty()) return ['ok' => true, 'deleted' => 0, 'ranges' => 0];
            $ranges = 0;
            DB::transaction(function() use ($rows, $scope, &$ranges) {
                foreach ($rows->pluck('id')->chunk(1000) as $c) DB::table('dids')->whereIn('id', $c)->delete();
                $ranges = $scope('did_ranges')->delete();
            });
            foreach ($rows->where('status', 'disabled') as $d)
                exec('asterisk -rx '.escapeshellarg('database del blocked_dids '.preg_replace('/[^0-9]/', '', $d->number)).' 2>&1');
            DB::table('audit_logs')->insert([
                'user' => $actor->name ?? 'system', 'role' => $actor->role ?? 'unknown', 'action' => 'DELETE_NUMBER_GROUP',
                'module' => 'Numbers', 'details' => "Deleted prefix group \"$prefix\" (supplier ".($supplierId ?? 'none')."): {$rows->count()} numbers, $ranges range record(s)",
                'ip_address' => $ip, 'method' => 'DELETE', 'url' => '/api/v1/number-groups',
                'status_code' => 200, 'created_at' => now(), 'updated_at' => now(),
            ]);
            return ['ok' => true, 'deleted' => $rows->count(), 'ranges' => $ranges];
        }
    }

    Route::delete('/v1/number-groups', function(Request $r) {
        if (!$r->has('prefix') || !$r->has('expected_total')) return response()->json(['error' => 'prefix and expected_total are required'], 422);
        $sup = $r->boolean('unassigned') ? null : ($r->filled('supplier_id') ? (int)$r->supplier_id : false);
        if ($sup === false) return response()->json(['error' => 'supplier_id or unassigned=1 is required'], 422);
        try { $res = deleteNumberGroup($sup, (string)$r->prefix, $r->expected_total, $r->user(), $r->ip()); }
        catch (\Throwable $e) { return response()->json(['success' => false, 'error' => 'Delete failed, nothing was removed: '.$e->getMessage()], 500); }
        if (!$res['ok']) return response()->json(['success' => false, 'error' => $res['error']], $res['status']);
        return response()->json(['success' => true, 'deleted' => $res['deleted'], 'ranges' => $res['ranges']]);
    });

    // Prefix groups for the Numbers screen. hit_count = how many of the group's
    // numbers have ever received a call (a cdrs row for that DID).
    Route::get('/v1/number-groups', function(Request $r) use ($numbersBase) {
        $groups = $numbersBase($r)
            ->select(DB::raw("COALESCE(dids.prefix,'') as prefix"), 'dids.supplier_id',
                DB::raw('MAX(dids.country_name) as country_name'),
                DB::raw('MAX(COALESCE(suppliers.name, trunks.nickname)) as supplier_name'),
                DB::raw('COUNT(*) as total'),
                DB::raw('MIN(dids.tariff) as min_tariff'), DB::raw('MAX(dids.tariff) as max_tariff'),
                DB::raw('SUM(EXISTS(SELECT 1 FROM cdrs WHERE cdrs.did IN (dids.number, SUBSTRING(dids.number,2)))) as hit_count'))
            ->groupBy(DB::raw("COALESCE(dids.prefix,'')"), 'dids.supplier_id')
            ->orderBy(DB::raw("COALESCE(dids.prefix,'')"))->get();
        return response()->json(['data' => $groups]);
    });

    Route::get('/v1/numbers', function(Request $r) use ($numbersBase) {
        $q = $numbersBase($r)
            ->select('dids.id', 'dids.number', 'dids.country_name', 'dids.prefix', 'dids.ivr_context',
                'dids.status', 'dids.is_test', 'dids.supplier_id', 'dids.tariff',
                DB::raw('COALESCE(suppliers.name, trunks.nickname) as supplier_name'));
        if ($r->has('prefix')) $q->where(DB::raw("COALESCE(dids.prefix,'')"), (string)$r->prefix);
        $total = (clone $q)->count();
        $per = min(max((int)($r->per_page ?: 50), 1), 200);
        $page = max((int)($r->page ?: 1), 1);
        $rows = $q->orderBy('dids.number')->offset(($page - 1) * $per)->limit($per)->get();
        // Call history for just this page: how many calls each number has taken and when last.
        $forms = $rows->flatMap(fn($d) => [$d->number, ltrim($d->number, '+')])->unique()->values()->all();
        $hits = $forms ? DB::table('cdrs')->whereIn('did', $forms)
            ->select(DB::raw("REPLACE(did,'+','') as n"), DB::raw('COUNT(*) as hits'), DB::raw('MAX(created_at) as last_hit'))
            ->groupBy(DB::raw("REPLACE(did,'+','')"))->get()->keyBy('n') : collect();
        foreach ($rows as $d) {
            $h = $hits[ltrim($d->number, '+')] ?? null;
            $d->hits = (int)($h->hits ?? 0);
            $d->last_hit = $h->last_hit ?? null;
        }
        return response()->json(['data' => $rows, 'total' => $total, 'page' => $page,
            'last_page' => max((int)ceil($total / $per), 1)]);
    });

    Route::get('/v1/numbers/{id}', function($id) {
        $d = DB::table('dids')->find($id);
        if (!$d) return response()->json(['error' => 'Number not found'], 404);
        $supplier = $d->supplier_id ? DB::table('suppliers')->find($d->supplier_id) : null;
        $trunk = $d->trunk_id ? DB::table('trunks')->find($d->trunk_id) : null;
        $prefix = $d->prefix_id ? DB::table('supplier_prefixes')->find($d->prefix_id) : null;
        $range = $d->batch_id ? DB::table('did_ranges')->find($d->batch_id) : null;
        return response()->json(['data' => [
            'id' => $d->id, 'number' => ltrim($d->number, '+'),
            'supplier' => $supplier->name ?? ($trunk->nickname ?? null),
            'trunk' => $trunk->pjsip_name ?? $trunk->name ?? null,
            'country' => $d->country_name, 'prefix' => $d->prefix,
            'tariff' => $d->tariff, 'selling_price' => $d->selling_price,
            'payment_term' => $prefix->payment_term ?? $d->payment_terms,
            'ivr_context' => $d->ivr_context, 'is_test' => (bool)$d->is_test,
            'status' => $d->status === 'disabled' ? 'disabled' : 'available',
            'range' => $range ? "{$range->range_start} - {$range->range_end}" : null,
            'created_at' => $d->created_at,
        ]]);
    });

    Route::put('/v1/numbers/{id}', function(Request $r, $id) {
        $d = DB::table('dids')->find($id);
        if (!$d) return response()->json(['error' => 'Number not found'], 404);
        $upd = [];
        if ($r->has('ivr_context')) {
            $ivr = trim((string)$r->ivr_context);
            if ($ivr === '') return response()->json(['error' => 'Select an IVR'], 422);
            $upd['ivr_context'] = str_starts_with($ivr, 'custom/') ? $ivr : 'custom/'.$ivr;
        }
        if ($r->has('selling_price')) {
            if (!is_numeric($r->selling_price) || $r->selling_price < 0) return response()->json(['error' => 'Selling price must be a number'], 422);
            $upd['selling_price'] = $r->selling_price;
        }
        if ($r->has('is_test')) $upd['is_test'] = $r->boolean('is_test') ? 1 : 0;
        if ($r->has('status')) {
            if (!in_array($r->status, ['available', 'disabled'], true)) return response()->json(['error' => 'Invalid status'], 422);
            $upd['status'] = $r->status === 'disabled' ? 'disabled' : 'active';
        }
        if (!$upd) return response()->json(['error' => 'Nothing to update'], 422);
        $upd['updated_at'] = now();
        DB::table('dids')->where('id', $id)->update($upd);

        // Disabling has to stop calls, not just relabel the row. Legacy carrier
        // contexts read dids.status in did_router.php. The supplier dialplan is
        // static (no DB at call time), so it consults Asterisk's local AstDB
        // family blocked_dids, which is flipped here and takes effect at once.
        $enforce = null;
        if (isset($upd['status'])) {
            $digits = preg_replace('/[^0-9]/', '', $d->number);
            $cmd = $upd['status'] === 'disabled'
                ? "database put blocked_dids $digits 1" : "database del blocked_dids $digits";
            exec('asterisk -rx '.escapeshellarg($cmd).' 2>&1', $out, $rc);
            $installed = str_contains((string)@file_get_contents(config('asterisk.extensions_conf')), 'blocked_dids');
            $enforce = ['ok' => $rc === 0 && $digits !== '', 'dialplan_ready' => $installed];
        }
        DB::table('audit_logs')->insert([
            'user'=>$r->user()->name,'role'=>$r->user()->role??'unknown','action'=>'UPDATE_NUMBER',
            'module'=>'Numbers','details'=>"Number {$d->number}: ".json_encode(array_diff_key($upd, ['updated_at'=>1])),
            'ip_address'=>$r->ip(),'method'=>'PUT','url'=>"/api/v1/numbers/{$id}",
            'status_code'=>200,'created_at'=>now(),'updated_at'=>now(),
        ]);
        return response()->json(['success' => true, 'enforcement' => $enforce]);
    });

    // ── Number Import (Upload + Paste share this exact same engine) ──
    // Both the file-upload and paste-textarea frontend flows send their
    // raw text here first for a dry-run preview, then to /confirm to
    // actually write. Neither writes to the database on preview, and
    // Asterisk configuration is never touched by import - only
    // suppliers/supplier_prefixes/dids/did_ranges rows are affected,
    // exactly the same tables the manual Add Prefix/Number forms use.
    Route::post('/v1/supplier-accounts/{id}/import/preview', function(Request $r, $id) {
        $supplier = DB::table('suppliers')->find($id);
        if (!$supplier) return response()->json(['error'=>'Supplier not found'],404);
        if (!$r->filled('raw_text')) return response()->json(['error'=>'raw_text is required'],422);

        $parsed = parseSupplierImportRecords($r->raw_text, $supplier->country);
        $existingPrefixes = DB::table('supplier_prefixes')->where('supplier_id',$id)->get()->keyBy('prefix');
        $existingNumbers = DB::table('dids')->pluck('number')
            ->map(fn($n)=>ltrim($n,'+'))->flip();
        $existingRanges = DB::table('did_ranges')->get(['range_start','range_end']);

        $seenInBatch = [];
        $out = [];
        foreach ($parsed as $rec) {
            $status = 'new';
            $reason = null;
            $matchedPrefix = $rec['prefix'] ? ($existingPrefixes[$rec['prefix']] ?? null) : null;

            if ($rec['mode'] === 'single') {
                if (!$rec['number']) { $status='error'; $reason='Could not detect a number'; }
                elseif (isset($existingNumbers[$rec['number']])) { $status='duplicate'; $reason='Number already exists'; }
                elseif (isset($seenInBatch['n:'.$rec['number']])) { $status='duplicate'; $reason='Duplicate within this import'; }
            } else {
                if (!$rec['range_start'] || !$rec['range_end']) { $status='error'; $reason='Could not detect a full range'; }
                elseif ((int)$rec['range_end'] < (int)$rec['range_start']) { $status='error'; $reason='Range end is before range start'; }
                else {
                    foreach ($existingRanges as $er) {
                        if ($rec['range_start'] <= $er->range_end && $rec['range_end'] >= $er->range_start) {
                            $status='duplicate'; $reason='Overlaps an existing range'; break;
                        }
                    }
                    $batchKey = 'r:'.$rec['range_start'].'-'.$rec['range_end'];
                    if ($status==='new' && isset($seenInBatch[$batchKey])) { $status='duplicate'; $reason='Duplicate within this import'; }
                }
            }

            if ($status==='new' && !$matchedPrefix && !$rec['price']) {
                $status='error'; $reason='No matching prefix and no price detected - cannot create a new prefix';
            }

            if ($status==='new') {
                $key = $rec['mode']==='single' ? 'n:'.$rec['number'] : 'r:'.$rec['range_start'].'-'.$rec['range_end'];
                $seenInBatch[$key] = true;
            }

            $out[] = array_merge($rec, [
                'status' => $status,
                'reason' => $reason,
                'matched_prefix_id' => $matchedPrefix->id ?? null,
                'will_create_prefix' => $status==='new' && !$matchedPrefix,
            ]);
        }

        $newRows = array_filter($out, fn($x)=>$x['status']==='new');
        $summary = [
            'total'        => count($out),
            'new'          => count($newRows),
            'duplicate'    => count(array_filter($out, fn($x)=>$x['status']==='duplicate')),
            'error'        => count(array_filter($out, fn($x)=>$x['status']==='error')),
            'new_prefixes' => count(array_unique(array_map(fn($x)=>$x['prefix'],
                array_filter($newRows, fn($x)=>$x['will_create_prefix'])))),
        ];

        return response()->json(['data'=>['records'=>$out,'summary'=>$summary]]);
    });

    Route::post('/v1/supplier-accounts/{id}/import/confirm', function(Request $r, $id) {
        $supplier = DB::table('suppliers')->find($id);
        if (!$supplier) return response()->json(['error'=>'Supplier not found'],404);
        $records = $r->records ?? [];
        if (!is_array($records) || empty($records)) return response()->json(['error'=>'No records to import'],422);

        $trunk = DB::table('trunks')->where('supplier_id',$id)->first();
        $prefixCache = DB::table('supplier_prefixes')->where('supplier_id',$id)->get()->keyBy('prefix');
        $newPrefixCache = [];
        $createdPrefixes = 0; $createdNumbers = 0; $createdRanges = 0; $skipped = 0;

        foreach ($records as $rec) {
            if (($rec['status'] ?? null) !== 'new') { $skipped++; continue; }
            $mode = $rec['mode'] ?? 'single';
            $prefixStr = $rec['prefix'] ?? null;
            if (!$prefixStr) { $skipped++; continue; }

            // Re-checked here (not just at preview time) so a race between
            // preview and confirm can never create a duplicate.
            if ($mode === 'single') {
                $num = '+'.ltrim($rec['number'] ?? '', '+');
                if (!$rec['number'] || DB::table('dids')->where('number',$num)->exists()) { $skipped++; continue; }
            } else {
                if (!$rec['range_start'] || !$rec['range_end']) { $skipped++; continue; }
                $overlap = DB::table('did_ranges')
                    ->where('range_start','<=',$rec['range_end'])->where('range_end','>=',$rec['range_start'])
                    ->exists();
                if ($overlap) { $skipped++; continue; }
            }

            $prefixRow = $prefixCache[$prefixStr] ?? ($newPrefixCache[$prefixStr] ?? null);
            if (!$prefixRow) {
                $price = $rec['price'] ?? null;
                if (!$price) { $skipped++; continue; }
                $newId = DB::table('supplier_prefixes')->insertGetId([
                    'supplier_id'   => $id,
                    'prefix'        => $prefixStr,
                    'country'       => $rec['country'] ?? null,
                    'price'         => $price,
                    'payment_term'  => $rec['payment_term'] ?? null,
                    'operator'      => $rec['operator'] ?? null,
                    'status'        => 'active',
                    'created_at'    => now(),
                    'updated_at'    => now(),
                ]);
                $prefixRow = DB::table('supplier_prefixes')->find($newId);
                $newPrefixCache[$prefixStr] = $prefixRow;
                $createdPrefixes++;
            }

            if ($mode === 'single') {
                DB::table('dids')->insert([
                    'number'        => $num,
                    'trunk_id'      => $trunk->id ?? null,
                    'supplier_id'   => $id,
                    'prefix_id'     => $prefixRow->id,
                    'is_test'       => 0,
                    'prefix'        => $prefixRow->prefix,
                    'country_name'  => $rec['country'] ?? $prefixRow->country,
                    'country_code'  => 'XX',
                    'tariff'        => $rec['price'] ?? $prefixRow->price,
                    'selling_price' => $rec['price'] ?? $prefixRow->price,
                    'currency'      => 'USDT',
                    'payment_terms' => $rec['payment_term'] ?? $prefixRow->payment_term,
                    'status'        => 'active',
                    'ivr_context'   => 'custom/6g-premium-telecom',
                    'created_at'    => now(),
                    'updated_at'    => now(),
                ]);
                $createdNumbers++;
            } else {
                $count = (int)$rec['range_end'] - (int)$rec['range_start'] + 1;
                DB::table('did_ranges')->insert([
                    'batch_name'    => ($rec['country'] ?? $prefixRow->country).' '.$prefixRow->prefix,
                    'country_code'  => 'XX',
                    'country_name'  => $rec['country'] ?? $prefixRow->country,
                    'prefix'        => $prefixRow->prefix,
                    'prefix_id'     => $prefixRow->id,
                    'range_start'   => $rec['range_start'],
                    'range_end'     => $rec['range_end'],
                    'rate'          => $rec['price'] ?? $prefixRow->price,
                    'selling_price' => $rec['price'] ?? $prefixRow->price,
                    'currency'      => 'USDT',
                    'payment_terms' => $rec['payment_term'] ?? $prefixRow->payment_term,
                    'supplier_name' => $supplier->name,
                    'supplier_id'   => $id,
                    'default_ivr'   => 'custom/6g-premium-telecom',
                    'total_count'   => $count,
                    'is_active'     => 1,
                    'created_at'    => now(),
                    'updated_at'    => now(),
                ]);
                $createdRanges++;
            }
        }

        DB::table('audit_logs')->insert([
            'user'=>$r->user()->name,'role'=>$r->user()->role??'unknown','action'=>'IMPORT_NUMBERS',
            'module'=>'Suppliers',
            'details'=>"Imported for supplier #{$id} ({$supplier->name}): {$createdNumbers} numbers, {$createdRanges} ranges, {$createdPrefixes} new prefixes, {$skipped} skipped",
            'ip_address'=>$r->ip(),'method'=>'POST','url'=>"/api/v1/supplier-accounts/{$id}/import/confirm",
            'status_code'=>200,'created_at'=>now(),'updated_at'=>now(),
        ]);

        return response()->json([
            'success'=>true,'created_prefixes'=>$createdPrefixes,'created_numbers'=>$createdNumbers,
            'created_ranges'=>$createdRanges,'skipped'=>$skipped,
        ]);
    });

    // Access History uses real CDRs against this supplier's test numbers.
    // "Access From" is the CALLER origin (cdrs.src) - never the supplier's
    // own SIP IP, which is a Trunk/Asterisk concept and has no place here.
    Route::get('/v1/supplier-accounts/{id}/access-history', function($id) {
        // Keyed by the number with any leading '+' stripped, since Asterisk
        // CDRs (cdrs.did) never carry one while dids.number always does.
        $testNumbers = DB::table('dids')->where('supplier_id',$id)->where('is_test',1)->get()
            ->keyBy(fn($d) => ltrim($d->number, '+'));
        if ($testNumbers->isEmpty()) return response()->json(['data'=>[]]);
        $prefixes = DB::table('supplier_prefixes')->where('supplier_id',$id)->get()->keyBy('id');
        $rows = DB::table('cdrs')->whereIn(DB::raw("REPLACE(did,'+','')"), $testNumbers->keys())
            ->orderByDesc('call_start')->limit(200)->get();
        $out = $rows->map(function($c) use ($testNumbers, $prefixes) {
            $tn = $testNumbers[ltrim($c->did,'+')] ?? null;
            $prefix = $tn && $tn->prefix_id ? ($prefixes[$tn->prefix_id] ?? null) : null;
            return [
                'date'        => $c->call_start,
                'prefix'      => $prefix->prefix ?? ($tn->prefix ?? '—'),
                'price'       => $prefix->price ?? ($tn->tariff ?? 0),
                'test_number' => $c->did,
                'access_from' => $c->src ?? '—',
            ];
        });
        return response()->json(['data'=>$out->values()]);
    });

    // ── Supplier Payments (reuses invoices table, invoice_type='supplier_payment') ──
    // Rate always comes from the supplier's Number/Prefix/Range records
    // (see computeSupplierPayable above), never from customer revenue.
    // Existing 'weekly'/'weekly_supplier' invoice types and their cron jobs
    // are untouched - this is an additive, distinct invoice_type.
    Route::get('/v1/supplier-payments/pending', function() {
        $suppliers = DB::table('suppliers')->where('status','active')->get();
        $buckets = ['Daily'=>[], 'Weekly'=>[], 'Monthly'=>[], 'Other'=>[]];

        foreach ($suppliers as $s) {
            // paid_at (full timestamp) is used as the boundary, not period_end
            // (a DATE column) - using a date-only boundary would round back to
            // midnight and re-include CDRs from earlier the same day that were
            // already paid.
            $lastPaid = DB::table('invoices')
                ->where('supplier_id', $s->id)->where('invoice_type','supplier_payment')->where('status','paid')
                ->where('invoice_number','like','SPAY-%')
                ->max('paid_at');
            $from = $lastPaid ? \Carbon\Carbon::parse($lastPaid)->addSecond() : \Carbon\Carbon::parse($s->created_at);
            $to = now();
            if ($from->gte($to)) continue;

            $defaultTerm = $s->settlement_period ?: 'Net 30';
            foreach (computeSupplierPayable($s->id, $from, $to, $defaultTerm) as $row) {
                if ($row['calls'] <= 0) continue;
                $bucket = in_array($row['payment_term'], ['Daily','Weekly','Monthly']) ? $row['payment_term'] : 'Other';
                $buckets[$bucket][] = [
                    'supplier_id'   => $s->id,
                    'supplier_name' => $s->name,
                    'period_start'  => $from->toDateString(),
                    'period_end'    => $to->toDateString(),
                    'calls'         => $row['calls'],
                    'minutes'       => $row['minutes'],
                    'amount'        => $row['amount'],
                    'currency'      => 'USDT',
                    'rate'          => $row['rate'],
                    'payment_term'  => $row['payment_term'],
                    'due_date'      => $to->copy()->addDays(parsePaymentTermDays($row['payment_term']))->toDateString(),
                ];
            }
        }
        return response()->json(['data'=>$buckets]);
    });

    // Weekly entries (old supplier invoices): click Paid -> its calls stop counting as unpaid revenue.
    Route::post('/v1/supplier-payments/invoices/{id}/mark-paid', function(Request $r, $id) {
        $inv = DB::table('invoices')->where('id',$id)->where('invoice_type','supplier_payment')->first();
        if (!$inv) return response()->json(['error'=>'Entry not found'],404);
        if ($inv->status === 'paid') return response()->json(['error'=>'Already marked paid'],422);
        $usdtMethodId = DB::table('payment_methods')->where('name','USDT')->value('id');
        DB::table('invoices')->where('id',$id)->update([
            'status'=>'paid','paid_at'=>$r->paid_at ? \Carbon\Carbon::parse($r->paid_at) : now(),
            'payment_method_id'=>$usdtMethodId,'reference'=>$r->reference,'notes'=>$r->notes,'updated_at'=>now(),
        ]);
        DB::table('audit_logs')->insert([
            'user'=>$r->user()->name,'role'=>$r->user()->role??'unknown','action'=>'MARK_PAID',
            'module'=>'Supplier Payments','details'=>"Marked paid: {$inv->supplier_name} week {$inv->period_start}–{$inv->period_end}, {$inv->total_amount} {$inv->currency}",
            'ip_address'=>$r->ip(),'method'=>'POST','url'=>"/api/v1/supplier-payments/invoices/{$id}/mark-paid",
            'status_code'=>200,'created_at'=>now(),'updated_at'=>now(),
        ]);
        return response()->json(['success'=>true]);
    });
    Route::post('/v1/supplier-payments/invoices/{id}/mark-unpaid', function(Request $r, $id) {
        $inv = DB::table('invoices')->where('id',$id)->where('invoice_type','supplier_payment')->first();
        if (!$inv) return response()->json(['error'=>'Entry not found'],404);
        if (str_starts_with((string)$inv->invoice_number,'SPAY-')) return response()->json(['error'=>'Only weekly entries can be set back to unpaid'],422);
        DB::table('invoices')->where('id',$id)->update(['status'=>'unpaid','paid_at'=>null,'updated_at'=>now()]);
        DB::table('audit_logs')->insert([
            'user'=>$r->user()->name,'role'=>$r->user()->role??'unknown','action'=>'MARK_UNPAID',
            'module'=>'Supplier Payments','details'=>"Set back to unpaid: {$inv->supplier_name} week {$inv->period_start}–{$inv->period_end}, {$inv->total_amount} {$inv->currency}",
            'ip_address'=>$r->ip(),'method'=>'POST','url'=>"/api/v1/supplier-payments/invoices/{$id}/mark-unpaid",
            'status_code'=>200,'created_at'=>now(),'updated_at'=>now(),
        ]);
        return response()->json(['success'=>true]);
    });

    Route::post('/v1/supplier-payments/mark-paid', function(Request $r) {
        $supplier = DB::table('suppliers')->find($r->supplier_id);
        if (!$supplier) return response()->json(['error'=>'Supplier not found'],404);
        if (!$r->period_start || !$r->period_end || !$r->payment_term) return response()->json(['error'=>'period_start, period_end and payment_term are required'],422);

        // Recompute authoritatively server-side rather than trusting client totals.
        $from = \Carbon\Carbon::parse($r->period_start)->startOfDay();
        $to   = \Carbon\Carbon::parse($r->period_end)->endOfDay();
        $rows = collect(computeSupplierPayable($supplier->id, $from, $to, $r->payment_term))->firstWhere('payment_term', $r->payment_term);
        if (!$rows || $rows['calls'] <= 0) return response()->json(['error'=>'No pending payable amount found for this period/term'],422);

        // Platform pays suppliers in USDT only - fixed method, no selection UI.
        $usdtMethodId = DB::table('payment_methods')->where('name','USDT')->value('id');
        if (!$usdtMethodId) {
            $usdtMethodId = DB::table('payment_methods')->insertGetId(['name'=>'USDT','enabled'=>true,'created_at'=>now(),'updated_at'=>now()]);
        }

        $invNum = 'SPAY-'.now()->format('YmdHis').'-'.$supplier->id;
        $id = DB::table('invoices')->insertGetId([
            'invoice_number'    => $invNum,
            'supplier_id'       => $supplier->id,
            'supplier_name'     => $supplier->name,
            'period_start'      => $from->toDateString(),
            'period_end'        => $to->toDateString(),
            'total_calls'       => $rows['calls'],
            'total_minutes'     => $rows['minutes'],
            'total_amount'      => $rows['amount'],
            'currency'          => 'USDT',
            'rate'              => $rows['rate'],
            'status'            => 'paid',
            'invoice_type'      => 'supplier_payment',
            'payment_method_id' => $usdtMethodId,
            'paid_at'           => $r->paid_at ? \Carbon\Carbon::parse($r->paid_at) : now(),
            'reference'         => $r->reference,
            'payment_term'      => $r->payment_term,
            'notes'             => $r->notes,
            'created_at'        => now(),
            'updated_at'        => now(),
        ]);

        DB::table('audit_logs')->insert([
            'user'=>$r->user()->name,'role'=>$r->user()->role??'unknown','action'=>'MARK_PAID',
            'module'=>'Supplier Payments','details'=>"Paid {$rows['amount']} USDT to {$supplier->name} for {$from->toDateString()}–{$to->toDateString()}",
            'ip_address'=>$r->ip(),'method'=>'POST','url'=>'/api/v1/supplier-payments/mark-paid',
            'status_code'=>201,'created_at'=>now(),'updated_at'=>now(),
        ]);

        return response()->json(['success'=>true,'data'=>DB::table('invoices')->find($id)],201);
    });

    Route::get('/v1/supplier-payments/history', function(Request $r) {
        $q = DB::table('invoices')
            ->leftJoin('payment_methods','invoices.payment_method_id','=','payment_methods.id')
            ->where('invoice_type','supplier_payment')
            ->select('invoices.*','payment_methods.name as payment_method_name');
        if ($r->status === 'all') { /* paid and unpaid weekly entries */ }
        else $q->where('invoices.status', $r->status ?: 'paid');
        if ($r->supplier_id) $q->where('invoices.supplier_id', $r->supplier_id);
        if ($r->payment_method_id) $q->where('invoices.payment_method_id', $r->payment_method_id);
        if ($r->currency) $q->where('invoices.currency', $r->currency);
        if ($r->payment_term) $q->where('invoices.payment_term', $r->payment_term);
        if ($r->date_from) $q->whereDate('invoices.paid_at', '>=', $r->date_from);
        if ($r->date_to) $q->whereDate('invoices.paid_at', '<=', $r->date_to);
        $data = $q->orderByDesc('invoices.period_end')->orderByDesc('invoices.paid_at')->orderByDesc('invoices.id')->get();
        return response()->json(['data'=>$data]);
    });

    // ── Payment Methods ──────────────────────────────────────────
    Route::get('/v1/payment-methods', function() {
        return response()->json(['data'=>DB::table('payment_methods')->orderBy('name')->get()]);
    });
    Route::post('/v1/payment-methods', function(Request $r) {
        if (!$r->name) return response()->json(['error'=>'Name is required'],422);
        $id = DB::table('payment_methods')->insertGetId([
            'name'=>$r->name,'enabled'=>$r->enabled ?? true,'created_at'=>now(),'updated_at'=>now(),
        ]);
        return response()->json(['success'=>true,'data'=>DB::table('payment_methods')->find($id)],201);
    });
    Route::put('/v1/payment-methods/{id}', function(Request $r, $id) {
        if (!DB::table('payment_methods')->where('id',$id)->exists()) return response()->json(['error'=>'Not found'],404);
        DB::table('payment_methods')->where('id',$id)->update([
            'name'=>$r->name, 'enabled'=>$r->enabled ?? true, 'updated_at'=>now(),
        ]);
        return response()->json(['success'=>true,'data'=>DB::table('payment_methods')->find($id)]);
    });
    Route::delete('/v1/payment-methods/{id}', function($id) {
        if (DB::table('invoices')->where('payment_method_id',$id)->exists())
            return response()->json(['error'=>'Method is used by existing payment history and cannot be deleted — disable it instead'],409);
        DB::table('payment_methods')->where('id',$id)->delete();
        return response()->json(['success'=>true]);
    });

    // ── IVR ───────────────────────────────────────────────────
    Route::get('/v1/ivr-lib/audio', function() {
        $ivrs = DB::table('ivrs')->get();
        return response()->json(['data'=>$ivrs]);
    });

    // ── System Health ─────────────────────────────────────────
    Route::get('/v1/system/health', function() {
        return response()->json(['api'=>'online','database'=>'connected']);
    });

    Route::post('/v1/system/exec', function(Request $r) {
        $allowed = [
            'Reload Asterisk'      => "asterisk -rx 'core reload'",
            '⟳ Reload Asterisk'   => "asterisk -rx 'core reload'",
            'Reload PJSIP'         => "asterisk -rx 'module reload res_pjsip.so'",
            '⟳ Reload PJSIP'      => "asterisk -rx 'module reload res_pjsip.so'",
            'Restart Asterisk'     => "systemctl restart asterisk",
            '↻ Restart Asterisk'  => "systemctl restart asterisk",
            'Restart Server'       => "systemctl restart php8.3-fpm nginx",
            '↻ Restart Server'    => "systemctl restart php8.3-fpm nginx",
            '▶ Restart Nginx'     => "systemctl restart nginx",
            '⏻ Turn Off'          => "systemctl poweroff",
        ];
        $cmd = $r->cmd;
        if(!isset($allowed[$cmd])) return response()->json(['error'=>'Not allowed'],403);
        exec($allowed[$cmd].' 2>&1', $out, $code);
        return response()->json(['success'=>$code===0,'output'=>implode("\n",$out)]);
    });

    // ── Asterisk Configuration module ──────────────────────────
    Route::prefix('v1/asterisk-config')->group(function () {
        Route::get('/status', [AsteriskConfigController::class, 'status']);
        Route::get('/general', [AsteriskConfigController::class, 'generalShow']);
        Route::put('/general', [AsteriskConfigController::class, 'generalUpdate']);
        Route::get('/rtp', [AsteriskConfigController::class, 'rtpShow']);
        Route::put('/rtp', [AsteriskConfigController::class, 'rtpUpdate']);
        Route::get('/firewall', [AsteriskConfigController::class, 'firewallInfo']);
        Route::get('/preview', [AsteriskConfigController::class, 'preview']);
        Route::post('/apply', [AsteriskConfigController::class, 'apply']);
        Route::post('/reload/pjsip', [AsteriskConfigController::class, 'reloadPjsip']);
        Route::post('/reload/dialplan', [AsteriskConfigController::class, 'reloadDialplan']);
        Route::post('/reload/all', [AsteriskConfigController::class, 'reloadAll']);
        Route::post('/test', [AsteriskConfigController::class, 'testConfiguration']);
        Route::get('/history', [AsteriskConfigController::class, 'historyIndex']);
        Route::get('/history/{id}', [AsteriskConfigController::class, 'historyShow']);
        Route::get('/history/{id}/download', [AsteriskConfigController::class, 'historyDownload']);
        Route::post('/history/{id}/rollback', [AsteriskConfigController::class, 'rollback']);
    });

});

// Import Range — store range and generate numbers
Route::post('/v1/did-ranges/import-range', function(Request $r) {
    $start  = preg_replace('/[^0-9]/','',$r->range_start);
    $end    = preg_replace('/[^0-9]/','',$r->range_end);
    $count  = (int)$end - (int)$start + 1;
    $prefix = substr($start,0,-4);

    if($count > 100000) return response()->json(['error'=>'Range too large (max 100,000)'],400);

    // Insert range record
    $rangeId = DB::table('did_ranges')->insertGetId([
        'batch_name'    => $r->batch_name ?? ($r->country_name.' '.$prefix),
        'country_code'  => $r->country_code,
        'country_name'  => $r->country_name,
        'prefix'        => $prefix,
        'range_start'   => $start,
        'range_end'     => $end,
        'rate'          => $r->tariff ?? 0.063,
        'selling_price' => $r->selling_price ?? 0.07,
        'currency'      => $r->currency ?? 'USDT',
        'payment_terms' => $r->payment_terms ?? 'Weekly',
        'supplier_name' => $r->supplier ?? (DB::table('trunks')->where('id',$r->trunk_id)->value('nickname') ?? ''),
        'trunk_id'      => $r->trunk_id ?? 1,
        'default_ivr'   => $r->default_ivr ?? 'custom/6g-premium-telecom',
        'total_count'   => $count,
        'is_active'     => 1,
        'created_at'    => now(),
        'updated_at'    => now(),
    ]);

    // Generate individual numbers
    $imported = 0;
    $batch = [];
    for($i=(int)$start; $i<=(int)$end; $i++){
        $number = '+'.$i;
        $batch[] = [
            'number'           => $number,
            'e164_number'      => $number,
            'country_code'     => $r->country_code,
            'country_name'     => $r->country_name,
            'prefix'           => $prefix,
            'tariff'           => $r->tariff ?? 0.063,
            'selling_price'    => $r->selling_price ?? 0.07,
            'currency'         => $r->currency ?? 'USDT',
            'payment_terms'    => $r->payment_terms ?? 'Weekly',
            'lifecycle_status' => 'available',
            'status'           => 'active',
            'ivr_context'      => $r->default_ivr ?? 'custom/6g-premium-telecom',
            'trunk_id'         => $r->trunk_id ?? 1,
            'batch_id'         => $rangeId,
            'created_at'       => now(),
            'updated_at'       => now(),
        ];
        // Insert in batches of 1000
        if(count($batch) >= 1000){
            DB::table('dids')->insertOrIgnore($batch);
            $imported += count($batch);
            $batch = [];
        }
    }
    if(!empty($batch)){
        DB::table('dids')->insertOrIgnore($batch);
        $imported += count($batch);
    }


    return response()->json([
        'success' => true,
        'range_id'=> $rangeId,
        'imported'=> $imported,
        'total'   => $count,
        'message' => "Range imported — $imported numbers (+$start → +$end)",
    ]);
});

// Add single DID
Route::post('/v1/dids/add', function(Request $r) {
    if(DB::table('dids')->where('number',$r->number)->exists())
        return response()->json(['error'=>'Number already exists'],400);
    $id = DB::table('dids')->insertGetId([
        'number'          => $r->number,
        'e164_number'     => $r->number,
        'country_code'    => $r->country_code,
        'country_name'    => $r->country_name,
        'prefix'          => $r->prefix,
        'tariff'          => $r->tariff ?? 0.063,
        'selling_price'   => $r->selling_price ?? 0.07,
        'currency'        => $r->currency ?? 'USDT',
        'payment_terms'   => $r->payment_terms ?? 'Weekly',
        'lifecycle_status'=> 'available',
        'status'          => 'active',
        'ivr_context'     => 'custom/6g-premium-telecom',
        'trunk_id'        => $r->trunk_id ?? 1,
        'created_at'      => now(),
        'updated_at'      => now(),
    ]);
    return response()->json(['success'=>true,'id'=>$id,'number'=>$r->number]);
});

// Revenue by currency
Route::get('/v1/billing/revenue-by-currency', function() {
    $usd = DB::table('cdrs')->where('currency','USD')
        ->selectRaw('COUNT(*) as calls, SUM(billsec/60) as minutes, SUM(revenue) as revenue')
        ->first();
    $eur = DB::table('cdrs')->where('currency','EUR')
        ->selectRaw('COUNT(*) as calls, SUM(billsec/60) as minutes, SUM(revenue) as revenue')
        ->first();
    // Default all to USD if no currency set
    $all = DB::table('cdrs')
        ->selectRaw('COUNT(*) as calls, SUM(billsec/60) as minutes, SUM(revenue) as revenue')
        ->first();
    return response()->json([
        'usd' => ['calls'=>$usd->calls??0,'minutes'=>round($usd->minutes??0,2),'revenue'=>round($usd->revenue??0,4)],
        'eur' => ['calls'=>$eur->calls??0,'minutes'=>round($eur->minutes??0,2),'revenue'=>round($eur->revenue??0,4)],
        'total_calls' => $all->calls??0,
        'total_minutes' => round($all->minutes??0,2),
    ]);
});

// Supplier revenue summary
Route::get('/v1/billing/supplier-revenue', function() {
    $data = DB::table('cdrs')
        ->leftJoin('trunks', 'cdrs.trunk_name', '=', 'trunks.name')
        ->selectRaw('cdrs.trunk_name as supplier, 
            trunks.nickname,
            COUNT(*) as calls, 
            SUM(cdrs.billsec/60) as minutes, 
            SUM(cdrs.revenue) as revenue,
            cdrs.currency,
            COUNT(DISTINCT cdrs.did) as unique_dids')
        ->groupBy('cdrs.trunk_name','trunks.nickname','cdrs.currency')
        ->orderByDesc('revenue')
        ->get();
    return response()->json(['data'=>$data]);
});

// Get invoices
Route::get('/v1/invoices', function(Request $r) {
    $q = DB::table('invoices')->orderByDesc('created_at');
    if($r->currency) $q->where('currency',$r->currency);
    return response()->json($q->paginate(50));
});

// Generate weekly invoice manually
Route::post('/v1/invoices/generate-weekly', function() {
    $now = now();
    $weekStart = $now->copy()->subWeek()->startOfWeek(\Carbon\Carbon::MONDAY);
    $weekEnd   = $weekStart->copy()->endOfWeek(\Carbon\Carbon::SUNDAY);

    $invoiceNum = 'INV-'.date('YW').'-'.strtoupper(substr(md5(time()),0,6));

    // USD invoice
    $usd = DB::table('cdrs')
        ->whereBetween('call_start',[$weekStart,$weekEnd])
        ->where('currency','USD')
        ->selectRaw('COUNT(*) as calls, SUM(billsec/60) as minutes, SUM(revenue) as revenue')
        ->first();

    // EUR invoice
    $eur = DB::table('cdrs')
        ->whereBetween('call_start',[$weekStart,$weekEnd])
        ->where('currency','EUR')
        ->selectRaw('COUNT(*) as calls, SUM(billsec/60) as minutes, SUM(revenue) as revenue')
        ->first();

    $created = [];

    if(($usd->calls??0) > 0){
        DB::table('invoices')->insert([
            'invoice_number' => $invoiceNum.'-USD',
            'period_start'   => $weekStart->toDateString(),
            'period_end'     => $weekEnd->toDateString(),
            'total_calls'    => $usd->calls??0,
            'total_minutes'  => round($usd->minutes??0,4),
            'total_amount'   => round($usd->revenue??0,6),
            'currency'       => 'USD',
            'status'         => 'unpaid',
            'invoice_type'   => 'weekly',
            'created_at'     => now(),
            'updated_at'     => now(),
        ]);
        $created[] = $invoiceNum.'-USD';
    }

    if(($eur->calls??0) > 0){
        DB::table('invoices')->insert([
            'invoice_number' => $invoiceNum.'-EUR',
            'period_start'   => $weekStart->toDateString(),
            'period_end'     => $weekEnd->toDateString(),
            'total_calls'    => $eur->calls??0,
            'total_minutes'  => round($eur->minutes??0,4),
            'total_amount'   => round($eur->revenue??0,6),
            'currency'       => $r->currency ?? 'USDT',
            'status'         => 'unpaid',
            'invoice_type'   => 'weekly',
            'created_at'     => now(),
            'updated_at'     => now(),
        ]);
        $created[] = $invoiceNum.'-EUR';
    }

    return response()->json([
        'success' => true,
        'created' => $created,
        'period'  => $weekStart->toDateString().' → '.$weekEnd->toDateString(),
        'message' => count($created).' invoice(s) generated',
    ]);
});

// Update invoice status
Route::put('/v1/invoices/{id}/status', function(Request $r, $id) {
    DB::table('invoices')->where('id',$id)->update(['status'=>$r->status,'updated_at'=>now()]);
    return response()->json(['success'=>true]);
});

// Generate supplier-wise weekly invoice
Route::post('/v1/invoices/generate-weekly-supplier', function() {
    $now       = now();
    $weekStart = $now->copy()->subWeek()->startOfWeek(\Carbon\Carbon::MONDAY);
    $weekEnd   = $weekStart->copy()->endOfWeek(\Carbon\Carbon::SUNDAY);
    $weekNum   = $now->format('YW');
    $created   = [];

    // Get all suppliers
    $suppliers = DB::table('trunks')->where('is_active',1)->get();

    foreach($suppliers as $supplier){
        // Get CDRs for this supplier this week
        $usd = DB::table('cdrs')
            ->where('trunk_name', $supplier->name)
            ->where('currency','USD')
            ->whereBetween('call_start',[$weekStart,$weekEnd])
            ->selectRaw('COUNT(*) as calls, SUM(billsec/60) as minutes, SUM(revenue) as revenue, COUNT(DISTINCT did) as dids')
            ->first();

        $eur = DB::table('cdrs')
            ->where('trunk_name', $supplier->name)
            ->where('currency','EUR')
            ->whereBetween('call_start',[$weekStart,$weekEnd])
            ->selectRaw('COUNT(*) as calls, SUM(billsec/60) as minutes, SUM(revenue) as revenue, COUNT(DISTINCT did) as dids')
            ->first();

        foreach([['USD',$usd],['EUR',$eur]] as [$currency,$data]){
            if(($data->calls??0) > 0){
                $invNum = 'SINV-'.$weekNum.'-'.strtoupper($supplier->name).'-'.$currency;
                // Skip if already exists
                if(DB::table('invoices')->where('invoice_number',$invNum)->exists()) continue;

                DB::table('invoices')->insert([
                    'invoice_number' => $invNum,
                    'supplier_name'  => $supplier->name,
                    'period_start'   => $weekStart->toDateString(),
                    'period_end'     => $weekEnd->toDateString(),
                    'total_calls'    => $data->calls??0,
                    'total_minutes'  => round($data->minutes??0,4),
                    'total_amount'   => round($data->revenue??0,6),
                    'currency'       => $currency,
                    'status'         => 'unpaid',
                    'invoice_type'   => 'weekly_supplier',
                    'notes'          => ($supplier->nickname??$supplier->name).' — Week '.$weekStart->toDateString().' to '.$weekEnd->toDateString(),
                    'created_at'     => now(),
                    'updated_at'     => now(),
                ]);
                $created[] = $invNum;
            }
        }
    }

    return response()->json([
        'success' => true,
        'created' => $created,
        'period'  => $weekStart->toDateString().' → '.$weekEnd->toDateString(),
        'message' => count($created).' supplier invoice(s) generated',
    ]);
});

// Get supplier invoices
Route::get('/v1/invoices/supplier', function() {
    $data = DB::table('invoices')
        ->where('invoice_type','weekly_supplier')
        ->orderByDesc('created_at')
        ->get();
    return response()->json(['data'=>$data]);
});

// Route Prefixes
Route::get('/v1/route-prefixes', function() {
    return response()->json(['data'=>DB::table('route_prefixes')->orderBy('priority')->get()]);
});

Route::post('/v1/route-prefixes', function(Request $r) {
    $id = DB::table('route_prefixes')->insertGetId([
        'prefix'       => $r->prefix,
        'country_code' => $r->country_code,
        'country_name' => $r->country_name,
        'ivr_context'  => $r->ivr_context ?? 'custom/6g-premium-telecom',
        'trunk_id'     => $r->trunk_id,
        'supplier_name'=> $r->supplier_name,
        'priority'     => $r->priority ?? 1,
        'is_active'    => 1,
        'notes'        => $r->notes,
        'created_at'   => now(),
        'updated_at'   => now(),
    ]);
    // Update AGI script with new prefix
    return response()->json(['success'=>true,'id'=>$id]);
});

Route::delete('/v1/route-prefixes/{id}', function($id) {
    DB::table('route_prefixes')->delete($id);
    return response()->json(['success'=>true]);
});

Route::put('/v1/route-prefixes/{id}', function(Request $r, $id) {
    $current = DB::table('route_prefixes')->find($id);
    if (!$current) {
        return response()->json(['error'=>'Route not found'],404);
    }
    DB::table('route_prefixes')->where('id',$id)->update([
        'prefix'       => $r->has('prefix') ? $r->prefix : $current->prefix,
        'country_code' => $r->has('country_code') ? $r->country_code : $current->country_code,
        'country_name' => $r->has('country_name') ? $r->country_name : $current->country_name,
        'ivr_context'  => $r->has('ivr_context') ? $r->ivr_context : $current->ivr_context,
        'is_active'    => $r->has('is_active') ? $r->is_active : $current->is_active,
        'priority'     => $r->has('priority') ? $r->priority : $current->priority,
        'updated_at'   => now(),
    ]);
    return response()->json(['success'=>true]);
});

// IVR Library <-> Asterisk custom sounds.
// Every file for an IVR lives at <sounds>/custom/<name>.<ext> (the original upload
// plus the .slin/.ul/.wav Asterisk plays). Replace and delete must keep that set
// in step with the ivrs row, so stale formats never linger and get played/previewed.
if (!function_exists('ivrSoundsDir')) {
    function ivrSoundsDir() { return rtrim(config('asterisk.sounds_dir', '/usr/share/asterisk/sounds/custom'), '/').'/'; }
    function ivrPurgeSounds($name) {
        // name is [a-zA-Z0-9_-] only (sanitised on upload), so the glob cannot match other IVRs
        foreach (['/usr/share/asterisk/sounds/custom/', '/var/lib/asterisk/sounds/custom/', ivrSoundsDir()] as $d)
            foreach (glob($d.$name.'.*') ?: [] as $f) @unlink($f);
    }
}

// Default-IVR pool. The pool is every IVR that is active, opted in (in_pool) and has a sound
// file on disk. did_router.php (from-carrier) reads it from MySQL per call; the static
// from-suppliers dialplan cannot, so it is mirrored into the Asterisk AstDB family ivr_pool
// (count + 1..N -> custom/<name>) and picked with RAND() per call. Called after every change.
if (!function_exists('ivrPoolContexts')) {
    function ivrPoolContexts() {
        $out = [];
        foreach (DB::table('ivrs')->where('is_active',1)->where('in_pool',1)->orderBy('id')->pluck('name') as $n)
            if (glob(ivrSoundsDir().$n.'.*')) $out[] = 'custom/'.$n;
        return $out;
    }
    function ivrPoolSync() {
        $ast = fn($c) => (function() use ($c) { $o = []; exec('asterisk -rx '.escapeshellarg($c).' 2>&1', $o, $rc); return [$rc, implode("\n", $o)]; })();
        $pool = ivrPoolContexts(); $n = count($pool);
        [, $old] = $ast('database get ivr_pool count');
        $oldN = preg_match('/Value:\s*(\d+)/', $old, $m) ? (int)$m[1] : 0;
        // entries first, count last, stale entries after: a call never sees a half-written pool
        foreach ($pool as $i => $ctx) { [$rc] = $ast('database put ivr_pool '.($i+1).' '.$ctx); if ($rc !== 0) return ['ok'=>false,'count'=>$n]; }
        [$rc] = $ast('database put ivr_pool count '.$n);
        for ($i = $n + 1; $i <= $oldN; $i++) $ast('database del ivr_pool '.$i);
        return ['ok'=>$rc === 0,'count'=>$n];
    }
}

// IVR Upload (a same-name upload replaces the existing IVR in place)
Route::post('/v1/ivr-lib/upload', function(Request $r) {
    $r->headers->set('Accept','application/json');
    $r->validate(['audio'=>'required|file|extensions:wav,mp3,ogg,slin,m4a,aac,flac,mp4','name'=>'required']);

    $file = $r->file('audio');
    $name = preg_replace('/[^a-zA-Z0-9_-]/','-',$r->name);
    $displayName = $r->display_name ?? $r->name;
    $ext = strtolower($file->getClientOriginalExtension());
    $path = ivrSoundsDir();
    if(!is_dir($path)) mkdir($path,0755,true);

    // Stage and convert first: the IVR's current audio is only removed once
    // every new format converted, so a failed upload never leaves it silent.
    $stage = '.stage-'.uniqid();
    $file->move($path,$stage.'-in.'.$ext);   // own name: the input may share an extension with an output (wav, slin)
    $in = escapeshellarg($path.$stage.'-in.'.$ext);
    $raw = $ext === 'slin' ? '-f s16le -ar 8000 -ac 1 ' : '';
    $outs = ['slin'=>'-ar 8000 -ac 1 -acodec pcm_s16le -f s16le', 'ul'=>'-ar 8000 -ac 1 -acodec pcm_mulaw -f mulaw', 'wav'=>'-ar 8000 -ac 1 -f wav'];
    $failed = null;
    foreach($outs as $e=>$args){
        exec("ffmpeg {$raw}-i {$in} {$args} ".escapeshellarg($path.$stage.'.'.$e)." -y 2>&1", $o, $rc);
        if($rc !== 0 || !is_file($path.$stage.'.'.$e) || filesize($path.$stage.'.'.$e) === 0){ $failed = $e; break; }
    }
    if($failed){
        foreach(array_merge(glob($path.$stage.'.*') ?: [], glob($path.$stage.'-in.*') ?: []) as $f) @unlink($f);
        return response()->json(['success'=>false,'error'=>"Could not convert audio to .{$failed} - existing IVR audio was left unchanged"],422);
    }

    ivrPurgeSounds($name);                       // drop every old format of this IVR
    $filename = $name.'.'.$ext;
    rename($path.$stage.'-in.'.$ext, $path.$filename);
    foreach(array_keys($outs) as $e) rename($path.$stage.'.'.$e, $path.$name.'.'.$e);
    foreach(glob($path.$name.'.*') ?: [] as $f){ @chown($f,'asterisk'); @chgrp($f,'asterisk'); @chmod($f,0644); }

    $row = ['title'=>$displayName,'audio_file'=>$filename,'display_name'=>$displayName,'updated_at'=>now()];
    $existing = DB::table('ivrs')->where('name',$name)->first();
    if($existing){ DB::table('ivrs')->where('id',$existing->id)->update($row); $id = $existing->id; }
    else $id = DB::table('ivrs')->insertGetId($row + ['name'=>$name,'is_active'=>1,'created_at'=>now()]);

    ivrPoolSync();   // the pool depends on the sound file existing
    return response()->json(['success'=>true,'id'=>$id,'name'=>$name,'display_name'=>$displayName,'replaced'=>(bool)$existing]);
});

// Delete IVR: refused while numbers/ranges/routes still point at it; otherwise the row and all its sound files go
Route::delete('/v1/ivr-lib/{id}', function($id) {
    $ivr = DB::table('ivrs')->find($id);
    if(!$ivr) return response()->json(['success'=>true]);
    $ctx = 'custom/'.$ivr->name;
    $usage = array_filter([
        'numbers'  => DB::table('dids')->where('ivr_context',$ctx)->count(),
        'ranges'   => DB::table('did_ranges')->where('default_ivr',$ctx)->count(),
        'routes'   => DB::table('route_prefixes')->where('ivr_context',$ctx)->count(),
        'prefixes' => DB::table('supplier_prefixes')->where('ivr_context',$ctx)->count(),
    ]);
    if($usage){
        $txt = implode(', ', array_map(fn($k,$v)=>"$v $k", array_keys($usage), $usage));
        return response()->json(['success'=>false,'error'=>"IVR \"{$ivr->name}\" is still used by $txt - assign them another IVR first",'usage'=>$usage],409);
    }
    ivrPurgeSounds($ivr->name);
    DB::table('ivrs')->delete($id);
    ivrPoolSync();
    return response()->json(['success'=>true]);
});

// SIP Monitor - Asterisk logs
Route::get('/v1/sip/activity', function() {
    // Get INVITE events from Asterisk log
    $invites = [];
    $logFile = '/var/log/asterisk/full';
    if(file_exists($logFile)){
        exec("grep -E 'INVITE|from-carrier|6G DID|Playback|ANSWERED|BUSY|CANCEL|failed' {$logFile} | tail -100", $logLines);
        foreach($logLines as $line){
            // Parse NOTICE lines for INVITE failures
            if(preg_match("/NOTICE.*Request '(\w+)' from '(.+?)' failed for '(.+?)' - (.+)/", $line, $m)){
                $invites[] = [
                    'time'     => substr($line, 1, 19),
                    'method'   => $m[1],
                    'caller'   => $m[2],
                    'source'   => $m[3],
                    'result'   => 'REJECTED',
                    'reason'   => $m[4],
                    'did'      => '—',
                    'supplier' => '—',
                ];
            }
            // Parse successful INVITEs from CDR verbose
            if(preg_match("/6G DID:(\+[\d]+).*IVR:([\w\/\-]+)/", $line, $m)){
                // successful routing
            }
        }
    }

    // Get every tracked supplier INVITE (all outcomes) from live_calls, kept by
    // App\Console\Commands\AmiListener via real Asterisk AMI events - not just
    // the ones that happened to complete a CDR row (CDR rows for internal
    // dialplan legs are always "ANSWERED" regardless of the real call outcome,
    // so they can't be used to tell rejected/no-answer calls apart).
    $resultMap = [
        'Answered'    => 'ANSWERED',
        'Hangup'      => 'ANSWERED',
        'Busy'        => 'BUSY',
        'No Answer'   => 'NOANSWER',
        'Cancelled'   => 'CANCELLED',
        'Congestion'  => 'CONGESTION',
        'Unavailable' => 'UNAVAILABLE',
        'Rejected'    => 'REJECTED',
        'Ringing'     => 'RINGING',
        'New'         => 'RINGING',
    ];

    $tracked = [];
    foreach (DB::table('live_calls')->whereNotNull('trunk_name')->orderByDesc('created_at')->limit(50)->get() as $c) {
        $duration = $c->ended_at
            ? (strtotime($c->ended_at) - strtotime($c->created_at))
            : (time() - strtotime($c->created_at));

        $tracked[] = [
            'time'     => $c->created_at,
            'method'   => 'INVITE',
            'caller'   => $c->src ?: $c->caller,
            'did'      => $c->dst ?: $c->callee,
            'supplier' => $c->trunk_name,
            'result'   => $resultMap[$c->status] ?? 'REJECTED',
            'reason'   => $c->hangup_cause ?: $c->status,
            'duration' => max(0, (int) $duration),
            'source'   => '—',
        ];
    }

    // Merge and sort by time desc
    $all = array_merge($tracked, $invites);
    usort($all, fn($a,$b)=>strcmp($b['time'],$a['time']));

    // Get channels
    exec("asterisk -rx 'core show channels' 2>/dev/null", $channels);
    // Get PJSIP endpoints
    exec("asterisk -rx 'pjsip show endpoints' 2>/dev/null", $pjsip);

    return response()->json([
        'invites'   => array_slice($all, 0, 50),
        'activity'  => [],
        'channels'  => $channels,
        'pjsip'     => $pjsip,
        'timestamp' => now()->toDateTimeString(),
    ]);
});
// DEAD ROUTE BELOW - kept for compatibility
Route::get('/v1/sip/activity_old', function() {
    $lines = [];
    
    // Get recent Asterisk log
    $log = '/var/log/asterisk/full';
    if(file_exists($log)){
        exec("tail -100 {$log} | grep -E 'INVITE|AGI|from-carrier|did_router|CDR|ANSWER|HANGUP|6G' 2>/dev/null", $lines);
    }
    
    // Get active channels
    exec("asterisk -rx 'core show channels' 2>/dev/null", $channels);
    
    // Get PJSIP status
    exec("asterisk -rx 'pjsip show endpoints' 2>/dev/null | grep -E 'STANDARD|Avail|Unavail'", $pjsip);

    return response()->json([
        'activity' => array_slice($lines, -50),
        'channels' => $channels,
        'pjsip'    => $pjsip,
        'timestamp'=> now()->toDateTimeString(),
    ]);
});

// Enable Asterisk verbose logging
Route::post('/v1/sip/verbose', function(Request $r) {
    $level = $r->level ?? 3;
    exec("asterisk -rx 'core set verbose {$level}' 2>/dev/null", $out);
    exec("asterisk -rx 'core set debug {$level}' 2>/dev/null", $out2);
    return response()->json(['success'=>true,'level'=>$level]);
});

// Get Asterisk full log stream
Route::get('/v1/sip/log', function() {
    $log = '/var/log/asterisk/full';
    $lines = [];
    if(file_exists($log)){
        exec("tail -200 {$log}", $lines);
    }
    return response()->json(['data'=>array_slice($lines,-100),'total'=>count($lines)]);
});

// Live calls from Asterisk
Route::get('/v1/live-calls', function() {
    $calls = [];
    
    // Get active channels from Asterisk
    exec("asterisk -rx 'core show channels concise' 2>/dev/null", $lines);
    
    foreach($lines as $line){
        if(empty(trim($line))) continue;
        $parts = explode('!', $line);
        if(count($parts) < 7) continue;
        
        $channel  = $parts[0] ?? '';
        $context  = $parts[1] ?? '';
        $exten    = $parts[2] ?? '';
        $priority = $parts[3] ?? '';
        $appname  = $parts[4] ?? '';
        $state    = $parts[6] ?? '';
        // Asterisk concise format: chan!ctx!ext!pri!state!app!data!cid!???!???!???!duration!???!uniqueid
        // Duration is field 11
        $duration = intval($parts[11] ?? 0);
        $callerid = trim($parts[7] ?? '','"');
        // Sanity check
        if($duration > 86400) $duration = 0;
        
        // Legacy carrier contexts (from-carrier, from-carrier-purple, ...) keep the
        // dialled number in the extension. Trunks on the generated from-suppliers
        // path move on into number-routing / an IVR context where the extension is
        // just 's', so their inbound PJSIP legs are listed too and the number is
        // read from the DID_NUMBER channel variable the inbound context sets.
        $legacy = str_starts_with($context,'from-carrier') || str_contains($channel,'from-carrier');
        $supplierPath = !$legacy && str_starts_with($channel,'PJSIP/')
            && ($context === 'from-suppliers' || $context === 'number-routing' || str_starts_with($context,'custom/'));
        if(!$legacy && !$supplierPath) continue;
        if($supplierPath){
            $info = [];
            exec('asterisk -rx '.escapeshellarg('core show channel '.$channel).' 2>/dev/null', $info);
            $exten = preg_match('/^DID_NUMBER=(\d+)/m', implode("\n", $info), $dm) ? $dm[1] : $exten;
        }
        
        // Get DID info from DB
        $did = \Illuminate\Support\Facades\DB::table('dids')
            ->where('number', $exten)
            ->orWhere('number', '+'.$exten)
            ->first();

        // Detect supplier from channel using Asterisk endpoint name
        $trunk_name = 'Unknown';
        // Map Asterisk endpoint names to code names
        $endpointMap = [
            'WORLD-PREMIUM-TELECOM' => 'WTP',
            'MEDIATEL'   => 'Mediatel',
            'PHONEGROUP' => 'Phonegroup',
            'GAMA'       => 'Purple Number',
            'PURPLE-NUMBER' => 'Purple Number',
        ];
        foreach($endpointMap as $endpoint => $codeName){
            if(str_contains(strtoupper($channel), $endpoint)){
                $trunk_name = $codeName;
                break;
            }
        }
        // Also try to match from trunks table by IP
        if($trunk_name === 'Unknown'){
            $trunks = DB::table('trunks')->where('is_active',1)->get();
            foreach($trunks as $t){
                if(str_contains(strtoupper($channel), strtoupper($t->name))){
                    $trunk_name = $t->nickname ?? $t->name;
                    break;
                }
            }
        }

        // Calculate start time from duration
        $start_time = date('H:i:s', time() - (int)$duration);

        $calls[] = [
            'channel'     => $channel,
            'src'         => $callerid ?: ($parts[7]??'Unknown'),
            'prefix'      => $did->prefix ?? substr(ltrim($exten,'+'),0,strlen(ltrim($exten,'+'))-4),
            'did'         => $exten,
            'dst'         => $exten,
            'context'     => $context,
            'state'       => $state,
            'billsec'     => (int)$duration,
            'seconds'     => (int)$duration,
            'ivr_context' => $did->ivr_context ?? 'custom/6g-premium-telecom',
            'country'     => $did->country_name ?? '—',
            'trunk_name'  => $trunk_name,
            'start_time'  => $start_time,
            'server'      => '195.200.14.165',
        ];
    }
    
    return response()->json(['data'=>$calls,'total'=>count($calls)]);
}, ['middleware'=>['auth:sanctum']]);

// Bulk update IVR for all DIDs
Route::put('/v1/did-ranges/bulk-ivr', function(Request $r) {
    $ivr = $r->ivr_context ?? 'custom/6g-premium-telecom';
    $count = DB::table('dids')->update(['ivr_context'=>$ivr,'updated_at'=>now()]);
    // Copy selected IVR file as default
    $ivrName = str_replace('custom/','',$ivr);
    $srcSlin = "/var/lib/asterisk/sounds/custom/{$ivrName}.slin";
    $dstSlin = "/var/lib/asterisk/sounds/custom/6g-premium-telecom.slin";
    if(file_exists($srcSlin) && $ivrName !== '6g-premium-telecom'){
        copy($srcSlin, $dstSlin);
        exec("chown asterisk:asterisk {$dstSlin}");
        exec("chmod 644 {$dstSlin}");
        // Copy to all Asterisk sound locations
        foreach([
            "/usr/share/asterisk/sounds/custom/6g-premium-telecom.slin",
        ] as $altDst){
            @copy($srcSlin, $altDst);
            exec("chown asterisk:asterisk {$altDst} 2>/dev/null");
            exec("chmod 644 {$altDst} 2>/dev/null");
        }
    }
    DB::table('did_ranges')->update(['default_ivr'=>$ivr,'updated_at'=>now()]);
    return response()->json(['success'=>true,'message'=>"IVR applied to {$count} numbers",'count'=>$count]);
});

// Update IVR for specific range
Route::put('/v1/did-ranges/{id}/ivr', function(Request $r, $id) {
    $ivr = $r->ivr_context ?? 'custom/6g-premium-telecom';
    $range = DB::table('did_ranges')->find($id);
    if(!$range) return response()->json(['error'=>'Range not found'],404);

    // Update DIDs in this range
    $count = DB::table('dids')
        ->where('prefix',$range->prefix)
        ->update(['ivr_context'=>$ivr,'updated_at'=>now()]);

    DB::table('did_ranges')->where('id',$id)->update(['default_ivr'=>$ivr,'updated_at'=>now()]);
    return response()->json(['success'=>true,'message'=>"IVR applied to {$count} numbers",'count'=>$count]);
});

// ── Prefixes (IVR is assigned here, not on ranges - see
// 2026_09_15_000011_add_ivr_context_to_supplier_prefixes migration) ──
Route::get('/v1/prefixes', function(Request $r) {
    $prefixes = DB::table('supplier_prefixes')
        ->leftJoin('suppliers','supplier_prefixes.supplier_id','=','suppliers.id')
        ->select('supplier_prefixes.*','suppliers.name as supplier_name')
        ->orderBy('supplier_prefixes.prefix')
        ->get();
    $numberCounts = DB::table('dids')->whereNotNull('prefix_id')
        ->select('prefix_id',DB::raw('COUNT(*) as c'))->groupBy('prefix_id')->pluck('c','prefix_id');
    $rangeCounts = DB::table('did_ranges')->whereNotNull('prefix_id')
        ->whereNotExists(fn($q)=>$q->select(DB::raw(1))->from('dids')->whereColumn('dids.batch_id','did_ranges.id'))
        ->select('prefix_id',DB::raw('SUM(total_count) as c'))->groupBy('prefix_id')->pluck('c','prefix_id');
    $out = $prefixes->map(function($p) use ($numberCounts,$rangeCounts) {
        $p = (array)$p;
        $p['number_count'] = ($numberCounts[$p['id']] ?? 0) + ($rangeCounts[$p['id']] ?? 0);
        return $p;
    })
        // Connect IVR only makes sense for a Prefix that actually has numbers
        // routed under it - suppliers often carry an empty placeholder Prefix
        // (created for its required test number) with nothing real assigned yet.
        // (?all=1 keeps the empty ones - the Prefix / Routes screen lists every route)
        ->filter(fn($p) => $r->boolean('all') || $p['number_count'] > 0)
        ->values();
    return response()->json(['data'=>$out,'total'=>count($out)]);
});

// Bulk update IVR for all Prefixes - cascades to every DID/range under each one
Route::put('/v1/prefixes/bulk-ivr', function(Request $r) {
    $ivr = $r->ivr_context ?? 'custom/6g-premium-telecom';
    DB::table('supplier_prefixes')->update(['ivr_context'=>$ivr,'updated_at'=>now()]);
    $count = DB::table('dids')->update(['ivr_context'=>$ivr,'updated_at'=>now()]);
    // Copy selected IVR file as default
    $ivrName = str_replace('custom/','',$ivr);
    $srcSlin = "/var/lib/asterisk/sounds/custom/{$ivrName}.slin";
    $dstSlin = "/var/lib/asterisk/sounds/custom/6g-premium-telecom.slin";
    if(file_exists($srcSlin) && $ivrName !== '6g-premium-telecom'){
        copy($srcSlin, $dstSlin);
        exec("chown asterisk:asterisk {$dstSlin}");
        exec("chmod 644 {$dstSlin}");
        foreach([
            "/usr/share/asterisk/sounds/custom/6g-premium-telecom.slin",
        ] as $altDst){
            @copy($srcSlin, $altDst);
            exec("chown asterisk:asterisk {$altDst} 2>/dev/null");
            exec("chmod 644 {$altDst} 2>/dev/null");
        }
    }
    DB::table('did_ranges')->update(['default_ivr'=>$ivr,'updated_at'=>now()]);
    return response()->json(['success'=>true,'message'=>"IVR applied to {$count} numbers",'count'=>$count]);
});

// Update IVR for a specific Prefix - re-applies to every DID/range already
// created under it, the same way price/payment term cascade at the prefix level.
Route::put('/v1/prefixes/{id}/ivr', function(Request $r, $id) {
    $ivr = $r->ivr_context ?? 'custom/6g-premium-telecom';
    $prefix = DB::table('supplier_prefixes')->find($id);
    if(!$prefix) return response()->json(['error'=>'Prefix not found'],404);

    DB::table('supplier_prefixes')->where('id',$id)->update(['ivr_context'=>$ivr,'updated_at'=>now()]);
    $count = DB::table('dids')->where('prefix_id',$id)->update(['ivr_context'=>$ivr,'updated_at'=>now()]);
    DB::table('did_ranges')->where('prefix_id',$id)->update(['default_ivr'=>$ivr,'updated_at'=>now()]);
    return response()->json(['success'=>true,'message'=>"IVR applied to {$count} numbers",'count'=>$count]);
});

// Live calls from Asterisk AMI - override existing

// ── Supplier API Sync ─────────────────────────────────────────
Route::post('/v1/suppliers/{id}/sync-dids', function($id) {
    $supplier = DB::table('trunks')->find($id);
    if(!$supplier) return response()->json(['error'=>'Supplier not found'],404);
    if(!$supplier->api_url) return response()->json(['error'=>'No API URL configured'],400);
    if(!$supplier->api_did || $supplier->api_did==='0') return response()->json(['error'=>'DID API not enabled'],400);

    // Build API URL
    $url = rtrim($supplier->api_url,'/').'/'.ltrim($supplier->api_did_path??'dids','/');

    // Call supplier API
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_HTTPHEADER => [
            'Authorization: Bearer '.($supplier->api_key??''),
            'X-API-Key: '.($supplier->api_key??''),
            'Accept: application/json',
        ],
    ]);
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if(!$response) return response()->json(['error'=>'Could not reach supplier API'],502);

    $data = json_decode($response, true);
    if(!$data) return response()->json(['error'=>'Invalid JSON response from supplier'],502);

    // ── Universal Normalizer ──────────────────────────────────
    // Try to find the array of numbers in response
    $numbers = [];
    $possibleArrayKeys = ['data','numbers','dids','items','results','list','records','numbers_list'];
    foreach($possibleArrayKeys as $key){
        if(isset($data[$key]) && is_array($data[$key])){
            $numbers = $data[$key];
            break;
        }
    }
    // If response itself is array
    if(empty($numbers) && isset($data[0])) $numbers = $data;

    if(empty($numbers)) return response()->json(['error'=>'Could not find numbers in response','raw'=>substr($response,0,500)],422);

    // Field name variations for each standard field
    $fieldMap = [
        'number'       => ['number','did','ddi','msisdn','e164','phone','phonenumber','num','cli','destination','tn'],
        'country_code' => ['country_code','countrycode','cc','country','iso','iso2','country_iso'],
        'country_name' => ['country_name','countryname','country','nation','country_label'],
        'rate'         => ['rate','tariff','price','cost','buy_rate','buying_rate','rate_per_min','price_per_minute'],
        'currency'     => ['currency','cur','currency_code','curr'],
    ];

    $imported = 0;
    $skipped  = 0;
    $errors   = 0;

    foreach($numbers as $item){
        if(!is_array($item)) continue;

        // Normalize keys to lowercase
        $item = array_change_key_case($item, CASE_LOWER);

        // Extract each field trying all variations
        $extracted = [];
        foreach($fieldMap as $standard => $variations){
            foreach($variations as $v){
                if(isset($item[$v]) && $item[$v]!==null && $item[$v]!==''){
                    $extracted[$standard] = $item[$v];
                    break;
                }
            }
        }

        // Must have a number at minimum
        if(empty($extracted['number'])) { $errors++; continue; }

        // Normalize number format to E.164
        $num = preg_replace('/[^0-9+]/','',$extracted['number']);
        if(!str_starts_with($num,'+')) $num = '+'.$num;

        // Skip if already exists
        $exists = DB::table('dids')->where('number',$num)->orWhere('number',ltrim($num,'+'  ))->exists();
        if($exists){ $skipped++; continue; }

        // Detect country from number if not provided
        $countryCode = $extracted['country_code'] ?? null;
        $countryName = $extracted['country_name'] ?? null;
        if(!$countryCode){
            // Basic prefix detection
            $prefixMap = [
                '39'=>['IT','Italy'],'44'=>['GB','UK'],'33'=>['FR','France'],
                '49'=>['DE','Germany'],'1'=>['US','USA'],'966'=>['SA','Saudi Arabia'],
                '90'=>['TR','Turkey'],'7'=>['RU','Russia'],'86'=>['CN','China'],
                '91'=>['IN','India'],'55'=>['BR','Brazil'],'52'=>['MX','Mexico'],
                '880'=>['BD','Bangladesh'],'92'=>['PK','Pakistan'],'998'=>['UZ','Uzbekistan'],
                '593'=>['EC','Ecuador'],'995'=>['GE','Georgia'],'882'=>['SAT','Satellite'],
            ];
            $stripped = ltrim($num,'+');
            foreach([3,2,1] as $len){
                $prefix = substr($stripped,0,$len);
                if(isset($prefixMap[$prefix])){
                    $countryCode = $prefixMap[$prefix][0];
                    $countryName = $prefixMap[$prefix][1];
                    break;
                }
            }
        }

        // Insert normalized DID
        DB::table('dids')->insert([
            'number'       => $num,
            'trunk_id'     => $supplier->id,
            'country_code' => $countryCode ?? 'XX',
            'country_name' => $countryName ?? 'Unknown',
            'rate'         => floatval($extracted['rate'] ?? 0),
            'currency'     => $extracted['currency'] ?? 'USD',
            'status'       => 'active',
            'created_at'   => now(),
            'updated_at'   => now(),
        ]);
        $imported++;
    }

    // Update last sync time
    DB::table('trunks')->where('id',$id)->update(['updated_at'=>now()]);

    return response()->json([
        'success'  => true,
        'imported' => $imported,
        'skipped'  => $skipped,
        'errors'   => $errors,
        'total'    => count($numbers),
        'message'  => "Sync complete: {$imported} imported, {$skipped} already exist, {$errors} failed",
    ]);
});

// ── Supplier Live Calls Sync ───────────────────────────────────
Route::get('/v1/suppliers/{id}/live-calls', function($id) {
    $supplier = DB::table('trunks')->find($id);
    if(!$supplier||!$supplier->api_url) return response()->json(['data'=>[]]);

    $url = rtrim($supplier->api_url,'/').'/'.ltrim($supplier->api_livecalls_path??'livecalls','/');
    $ch = curl_init();
    curl_setopt_array($ch,[
        CURLOPT_URL=>$url,
        CURLOPT_RETURNTRANSFER=>true,
        CURLOPT_TIMEOUT=>10,
        CURLOPT_HTTPHEADER=>[
            'Authorization: Bearer '.($supplier->api_key??''),
            'X-API-Key: '.($supplier->api_key??''),
            'Accept: application/json',
        ],
    ]);
    $response = curl_exec($ch);
    curl_close($ch);
    $data = json_decode($response,true);
    return response()->json(['data'=>$data??[],'supplier'=>$supplier->nickname??$supplier->name]);
});


// ── Invoice PDF Download ───────────────────────────────────────
Route::get('/v1/invoices/{id}/pdf', function($id) {
    $invoice = DB::table('invoices')->find($id);
    if(!$invoice) return response()->json(['error'=>'Not found'],404);
    $pdf = \Barryvdh\DomPDF\Facade\Pdf::loadView('invoices.template',['invoice'=>$invoice]);
    return $pdf->download('invoice-'.$invoice->invoice_number.'.pdf');
});

// ── Invoice Status Update ──────────────────────────────────────
Route::put('/v1/invoices/{id}/status', function(Request $r, $id) {
    DB::table('invoices')->where('id',$id)->update([
        'status'     => $r->status,
        'updated_at' => now(),
    ]);
    return response()->json(['success'=>true]);
});

// ── Bulk DID Management ────────────────────────────────────────
// Bulk delete DIDs
Route::post('/v1/dids/bulk-delete', function(Request $r) {
    $ids = $r->ids ?? [];
    if(empty($ids)) return response()->json(['error'=>'No IDs provided'],400);
    $deleted = DB::table('dids')->whereIn('id',$ids)->delete();
    return response()->json(['success'=>true,'deleted'=>$deleted]);
});

// Bulk assign supplier
Route::post('/v1/dids/bulk-supplier', function(Request $r) {
    $ids = $r->ids ?? [];
    $trunk_id = $r->trunk_id;
    if(empty($ids)||!$trunk_id) return response()->json(['error'=>'Missing ids or trunk_id'],400);
    $updated = DB::table('dids')->whereIn('id',$ids)->update(['trunk_id'=>$trunk_id,'updated_at'=>now()]);
    return response()->json(['success'=>true,'updated'=>$updated]);
});

// Bulk assign IVR
Route::post('/v1/dids/bulk-ivr', function(Request $r) {
    $ids = $r->ids ?? [];
    $ivr = $r->ivr_context;
    if(empty($ids)||!$ivr) return response()->json(['error'=>'Missing ids or ivr_context'],400);
    $updated = DB::table('dids')->whereIn('id',$ids)->update(['ivr_context'=>$ivr,'updated_at'=>now()]);
    // Update Asterisk extensions
    $numbers = DB::table('dids')->whereIn('id',$ids)->pluck('number');
    return response()->json(['success'=>true,'updated'=>$updated,'numbers'=>$numbers]);
});

// Upload CSV/Excel of DIDs
Route::post('/v1/dids/bulk-upload', function(Request $r) {
    if(!$r->hasFile('file')) return response()->json(['error'=>'No file uploaded'],400);
    $file = $r->file('file');
    $content = file_get_contents($file->getRealPath());
    $lines = array_filter(explode("\n", str_replace("\r","",$content)));
    $imported=0; $skipped=0; $errors=[];
    $trunkId = $r->trunk_id ?? null;
    $rate = $r->rate ?? 0.07;
    $currency = $r->currency ?? 'USDT';

    foreach($lines as $i=>$line){
        if($i===0 && stripos($line,'number')!==false) continue; // skip header
        $cols = str_getcsv($line);
        $num = trim($cols[0] ?? '');
        if(!$num) continue;
        $num = preg_replace('/[^0-9+]/','',$num);
        if(!str_starts_with($num,'+')) $num='+'.$num;
        if(strlen($num)<8){$errors[]=$num." (too short)";continue;}
        if(DB::table('dids')->where('number',$num)->orWhere('number',ltrim($num,'+'))->exists()){$skipped++;continue;}

        // Auto detect country
        $countryCode='XX'; $countryName='Unknown';
        $stripped=ltrim($num,'+');
        $prefixMap=['39'=>['IT','Italy'],'44'=>['GB','UK'],'33'=>['FR','France'],
            '49'=>['DE','Germany'],'1'=>['US','USA'],'966'=>['SA','Saudi Arabia'],
            '90'=>['TR','Turkey'],'7'=>['RU','Russia'],'593'=>['EC','Ecuador'],
            '998'=>['UZ','Uzbekistan'],'995'=>['GE','Georgia'],'882'=>['SAT','Satellite'],
            '88'=>['SAT','Satellite']];
        foreach([3,2,1] as $len){
            $p=substr($stripped,0,$len);
            if(isset($prefixMap[$p])){$countryCode=$prefixMap[$p][0];$countryName=$prefixMap[$p][1];break;}
        }
        DB::table('dids')->insert([
            'number'=>$num,'trunk_id'=>$trunkId,'country_code'=>$countryCode,
            'country_name'=>$countryName,'rate'=>$rate,'currency'=>$currency,
            'status'=>'active','ivr_context'=>'custom/6g-premium-telecom',
            'created_at'=>now(),'updated_at'=>now(),
        ]);
        $imported++;
    }
    return response()->json(['success'=>true,'imported'=>$imported,'skipped'=>$skipped,
        'errors'=>array_slice($errors,0,10),'message'=>"$imported imported, $skipped skipped"]);
});

// Export DIDs as CSV
Route::get('/v1/dids/export-csv', function() {
    $dids = DB::table('dids')
        ->leftJoin('trunks','dids.trunk_id','=','trunks.id')
        ->select('dids.number','dids.country_name','dids.rate','dids.currency',
            'trunks.nickname as supplier','dids.status','dids.ivr_context','dids.created_at')
        ->get();
    $csv = "Number,Country,Rate,Currency,Supplier,Status,IVR,Created\n";
    foreach($dids as $d){
        $csv .= implode(',',[
            $d->number,$d->country_name,$d->rate,$d->currency,
            $d->supplier??'—',$d->status,$d->ivr_context,$d->created_at
        ])."\n";
    }
    return response($csv,200,['Content-Type'=>'text/csv',
        'Content-Disposition'=>'attachment; filename="dids-export-'.date('Y-m-d').'.csv"']);
});

// ── IVR Audio Manager ──────────────────────────────────────────
Route::get('/v1/ivr-lib/preview/{id}', function($id) {
    $ivr = DB::table('ivrs')->find($id);
    if(!$ivr) return response()->json(['error'=>'Not found'],404);
    $paths = [
        "/usr/share/asterisk/sounds/custom/{$ivr->name}.mp3",
        "/usr/share/asterisk/sounds/custom/{$ivr->name}.wav",
        "/usr/share/asterisk/sounds/custom/{$ivr->audio_file}",
        "/var/lib/asterisk/sounds/custom/{$ivr->name}.mp3",
        "/var/lib/asterisk/sounds/custom/{$ivr->name}.wav",
    ];
    foreach($paths as $path){
        if(file_exists($path)){
            $ext = pathinfo($path, PATHINFO_EXTENSION);
            $mime = $ext==='mp3'?'audio/mpeg':'audio/wav';
            return response()->file($path,['Content-Type'=>$mime,'Accept-Ranges'=>'bytes']);
        }
    }
    return response()->json(['error'=>'Audio file not found on disk'],404);
});

Route::put('/v1/ivr-lib/{id}', function(Request $r, $id) {
    // only the fields sent are changed (a partial update must not blank display_name / re-activate)
    $upd = ['updated_at'=>now()];
    if($r->has('display_name')) $upd['display_name'] = $r->display_name;
    if($r->has('is_active'))    $upd['is_active']    = $r->boolean('is_active') ? 1 : 0;
    if($r->has('in_pool'))      $upd['in_pool']      = $r->boolean('in_pool') ? 1 : 0;
    DB::table('ivrs')->where('id',$id)->update($upd);
    $pool = ivrPoolSync();
    return response()->json(['success'=>true,'data'=>DB::table('ivrs')->find($id),'pool'=>$pool]);
});

Route::get('/v1/ivr-lib/stats', function() {
    $ivrs = DB::table('ivrs')->get();
    $stats = $ivrs->map(function($ivr){
        $dids = DB::table('dids')->where('ivr_context','custom/'.$ivr->name)->count();
        $calls = DB::table('cdrs')->where('ivr_context','custom/'.$ivr->name)->count();
        $revenue = DB::table('cdrs')->where('ivr_context','custom/'.$ivr->name)->sum('revenue');
        $paths = [
            "/usr/share/asterisk/sounds/custom/{$ivr->name}.wav",
            "/usr/share/asterisk/sounds/custom/{$ivr->name}.mp3",
            "/usr/share/asterisk/sounds/custom/{$ivr->name}.slin",
        ];
        $fileSize = 0;
        $fileExists = false;
        foreach($paths as $p){
            if(file_exists($p)){$fileExists=true;$fileSize=filesize($p);break;}
        }
        return [
            'id'           => $ivr->id,
            'name'         => $ivr->name,
            'display_name' => $ivr->display_name??$ivr->name,
            'is_active'    => $ivr->is_active,
            'dids_count'   => $dids,
            'calls_count'  => $calls,
            'revenue'      => round($revenue,4),
            'file_exists'  => $fileExists,
            'file_size'    => $fileSize,
            'created_at'   => $ivr->created_at,
        ];
    });
    return response()->json(['data'=>$stats]);
});

// ── Reseller Portal API ────────────────────────────────────────
// Get all resellers/customers with stats
Route::get('/v1/resellers', function() {
    $resellers = DB::table('customers')
        ->get()
        ->map(function($r){
            $dids = DB::table('dids')->where('trunk_id',$r->reseller_id??0)->count();
            $cdrs = DB::table('cdrs')->whereIn('did',
                DB::table('dids')->where('trunk_id',$r->reseller_id??0)->pluck('number')
            );
            return [
                'id'           => $r->id,
                'name'         => $r->name,
                'email'        => $r->email,
                'company'      => $r->company??'',
                'phone'        => $r->phone??'',
                'role'         => $r->role??'reseller',
                'status'       => $r->status??'active',
                'credit_limit' => $r->credit_limit??0,
                'balance'      => $r->balance??0,
                'markup'       => $r->markup??0,
                'dids_count'   => $dids,
                'calls_count'  => $cdrs->count(),
                'revenue'      => round($cdrs->sum('revenue'),4),
                'last_login'   => $r->last_login??null,
                'created_at'   => $r->created_at,
                'notes'        => $r->notes??'',
            ];
        });
    return response()->json(['data'=>$resellers]);
});

// Create reseller
Route::post('/v1/resellers', function(Request $r) {
    $id = DB::table('customers')->insertGetId([
        'name'         => $r->name,
        'email'        => $r->email,
        'password'     => bcrypt($r->password??'Reseller@2026'),
        'company'      => $r->company,
        'phone'        => $r->phone,
        'role'         => $r->role??'reseller',
        'status'       => 'active',
        'credit_limit' => $r->credit_limit??0,
        'markup'       => $r->markup??0,
        'notes'        => $r->notes,
        'created_at'   => now(),
        'updated_at'   => now(),
    ]);
    return response()->json(['success'=>true,'id'=>$id,'data'=>DB::table('customers')->find($id)]);
});

// Update reseller
Route::put('/v1/resellers/{id}', function(Request $r, $id) {
    $update = [
        'name'         => $r->name,
        'email'        => $r->email,
        'company'      => $r->company,
        'phone'        => $r->phone,
        'role'         => $r->role??'reseller',
        'status'       => $r->status??'active',
        'credit_limit' => $r->credit_limit??0,
        'markup'       => $r->markup??0,
        'notes'        => $r->notes,
        'updated_at'   => now(),
    ];
    if($r->password) $update['password'] = bcrypt($r->password);
    DB::table('customers')->where('id',$id)->update($update);
    return response()->json(['success'=>true,'data'=>DB::table('customers')->find($id)]);
});

// Delete reseller
Route::delete('/v1/resellers/{id}', function($id) {
    DB::table('customers')->delete($id);
    return response()->json(['success'=>true]);
});

// Get reseller CDR (filtered by their DIDs)
Route::get('/v1/resellers/{id}/cdr', function($id) {
    $reseller = DB::table('customers')->find($id);
    $dids = DB::table('dids')->where('trunk_id',$reseller->reseller_id??0)->pluck('number');
    $cdrs = DB::table('cdrs')->whereIn('did',$dids)->orderByDesc('created_at')->limit(100)->get();
    return response()->json(['data'=>$cdrs,'total'=>$cdrs->count()]);
});

// Top up reseller balance
Route::post('/v1/resellers/{id}/topup', function(Request $r, $id) {
    $amount = floatval($r->amount??0);
    DB::table('customers')->where('id',$id)->increment('balance',$amount);
    return response()->json(['success'=>true,'new_balance'=>DB::table('customers')->find($id)->balance??0]);
});

// ── IP Whitelist Manager ───────────────────────────────────────
Route::get('/v1/whitelist', function() {
    // Get UFW rules
    exec('ufw status numbered 2>/dev/null', $ufw);
    $rules = [];
    foreach($ufw as $line){
        if(preg_match('/\[\s*(\d+)\]\s+(.+?)\s+(ALLOW|DENY)\s+IN\s+(.+)/', $line, $m)){
            $rules[] = [
                'num'    => intval($m[1]),
                'port'   => trim($m[2]),
                'action' => $m[3],
                'from'   => trim($m[4]),
                'type'   => 'firewall',
            ];
        }
    }
    // Get Asterisk PJSIP identifies
    $pjsip = file_get_contents('/etc/asterisk/pjsip.conf');
    $endpoints = [];
    preg_match_all('/\[([\w-]+)-identify\]\ntype=identify\nendpoint=[\w-]+\n((?:match=.+\n?)*)/m', $pjsip, $matches, PREG_SET_ORDER);
    foreach($matches as $m){
        $ips = [];
        preg_match_all('/match=(.+)/', $m[2], $ipMatches);
        foreach($ipMatches[1] as $ip) $ips[] = trim($ip);
        $endpoints[] = ['name'=>$m[1],'ips'=>$ips,'type'=>'asterisk'];
    }
    // Get failed login attempts
    exec('grep "Invalid user\|authentication failure\|SECURITY" /var/log/asterisk/security* 2>/dev/null | tail -20', $security);
    return response()->json([
        'firewall_rules' => $rules,
        'asterisk_endpoints' => $endpoints,
        'security_log' => array_values($security),
    ]);
});

// Add IP to UFW firewall
Route::post('/v1/whitelist/firewall', function(Request $r) {
    $ip = preg_replace('/[^0-9\.\/:a-fA-F]/','',$r->ip??'');
    $port = preg_replace('/[^0-9\/a-z]/','',$r->port??'any');
    $action = $r->action==='deny'?'deny':'allow';
    if(!$ip) return response()->json(['error'=>'Invalid IP'],400);
    $cmd = $port==='any' ? "ufw $action from $ip" : "ufw $action from $ip to any port $port";
    exec($cmd.' 2>&1', $out, $code);
    return response()->json(['success'=>$code===0,'output'=>implode("\n",$out),'cmd'=>$cmd]);
});

// Remove UFW rule by number
Route::delete('/v1/whitelist/firewall/{num}', function($num) {
    exec("ufw --force delete $num 2>&1", $out, $code);
    return response()->json(['success'=>$code===0,'output'=>implode("\n",$out)]);
});

// Add IP to Asterisk PJSIP endpoint
Route::post('/v1/whitelist/asterisk', function(Request $r) {
    $endpoint = strtoupper(preg_replace('/[^a-zA-Z0-9_-]/','',$r->endpoint??''));
    $ip = preg_replace('/[^0-9\.\/:a-fA-F]/','',$r->ip??'');
    if(!$endpoint||!$ip) return response()->json(['error'=>'Invalid endpoint or IP'],400);
    $pjsip = file_get_contents('/etc/asterisk/pjsip.conf');
    $identifyBlock = "[$endpoint-identify]";
    if(strpos($pjsip,$identifyBlock)!==false){
        // Add match to existing identify block
        $pjsip = str_replace($identifyBlock."\ntype=identify\nendpoint=$endpoint\n",
            $identifyBlock."\ntype=identify\nendpoint=$endpoint\nmatch=$ip\n", $pjsip);
    }
    file_put_contents('/etc/asterisk/pjsip.conf',$pjsip);
    exec("asterisk -rx 'module reload res_pjsip.so' 2>&1",$out);
    return response()->json(['success'=>true,'message'=>"IP $ip added to $endpoint"]);
});

// Remove IP from Asterisk PJSIP endpoint
Route::delete('/v1/whitelist/asterisk', function(Request $r) {
    $ip = preg_replace('/[^0-9\.\/:a-fA-F]/','',$r->ip??'');
    if(!$ip) return response()->json(['error'=>'Invalid IP'],400);
    $pjsip = file_get_contents('/etc/asterisk/pjsip.conf');
    $pjsip = preg_replace('/^match='.preg_quote($ip,'/').'$/m','',$pjsip);
    file_put_contents('/etc/asterisk/pjsip.conf',$pjsip);
    exec("asterisk -rx 'module reload res_pjsip.so' 2>&1",$out);
    return response()->json(['success'=>true,'message'=>"IP $ip removed"]);
});

// Block IP completely
Route::post('/v1/whitelist/block', function(Request $r) {
    $ip = preg_replace('/[^0-9\.\/:a-fA-F]/','',$r->ip??'');
    if(!$ip) return response()->json(['error'=>'Invalid IP'],400);
    exec("ufw deny from $ip 2>&1",$out,$code);
    return response()->json(['success'=>$code===0,'message'=>"IP $ip blocked",'output'=>implode("\n",$out)]);
});

// ── Audit Log ─────────────────────────────────────────────────
Route::get('/v1/audit-logs', function(Request $r) {
    $q = DB::table('audit_logs')->orderByDesc('created_at');
    if($r->module) $q->where('module',$r->module);
    if($r->user) $q->where('user','like','%'.$r->user.'%');
    if($r->action) $q->where('action','like','%'.$r->action.'%');
    if($r->from) $q->where('created_at','>=',$r->from);
    if($r->to) $q->where('created_at','<=',$r->to.' 23:59:59');
    $logs = $q->limit(200)->get();
    $stats = [
        'total'   => DB::table('audit_logs')->count(),
        'today'   => DB::table('audit_logs')->whereDate('created_at',now())->count(),
        'modules' => DB::table('audit_logs')->select('module',DB::raw('COUNT(*) as count'))->groupBy('module')->get(),
        'users'   => DB::table('audit_logs')->select('user',DB::raw('COUNT(*) as count'))->groupBy('user')->orderByDesc('count')->limit(10)->get(),
    ];
    return response()->json(['data'=>$logs,'stats'=>$stats]);
});

// Log an action manually (from frontend)
Route::post('/v1/audit-logs', function(Request $r) {
    $user = $r->user();
    DB::table('audit_logs')->insert([
        'user'       => $user?->name??$r->user_name??'System',
        'role'       => $user?->role??$r->role??'unknown',
        'action'     => $r->action??'unknown',
        'module'     => $r->module??'unknown',
        'details'    => $r->details,
        'ip_address' => $r->ip(),
        'method'     => $r->method_type??'manual',
        'url'        => $r->url_path??'',
        'status_code'=> $r->status_code??200,
        'created_at' => now(),
        'updated_at' => now(),
    ]);
    return response()->json(['success'=>true]);
});

// Clear old logs
Route::delete('/v1/audit-logs/clear', function(Request $r) {
    $days = intval($r->days??30);
    $deleted = DB::table('audit_logs')->where('created_at','<',now()->subDays($days))->delete();
    return response()->json(['success'=>true,'deleted'=>$deleted,'message'=>"$deleted logs older than $days days deleted"]);
});

// Unassign DIDs from reseller
Route::post('/v1/dids/bulk-unassign', function(Request $r) {
    $ids = $r->ids ?? [];
    if(empty($ids)) return response()->json(['error'=>'No IDs provided'],400);
    $updated = DB::table('dids')->whereIn('id',$ids)->update([
        'customer_id' => null,
        'updated_at'  => now(),
    ]);
    return response()->json(['success'=>true,'updated'=>$updated,'message'=>$updated.' DIDs unassigned and returned to panel']);
});

// ── Smart CSV Sync ─────────────────────────────────────────────
Route::post('/v1/dids/smart-sync', function(Request $r) {
    if(!$r->hasFile('file')) return response()->json(['error'=>'No file uploaded'],400);
    $trunkId = $r->trunk_id;
    if(!$trunkId) return response()->json(['error'=>'No supplier selected'],400);

    $trunk = DB::table('trunks')->find($trunkId);
    $content = file_get_contents($r->file('file')->getRealPath());
    $lines = array_filter(array_map('trim', explode("\n", str_replace("\r","",$content))));

    // Detect separator
    $firstLine = array_values($lines)[0] ?? '';
    $sep = substr_count($firstLine,';') > substr_count($firstLine,',') ? ';' : ',';

    // Find number column from header
    $numberCol = 0;
    $rateCol = null;
    $currencyCol = null;
    $prefixCol = null;
    $headers = str_getcsv($firstLine, $sep);
    foreach($headers as $i=>$h){
        $h = strtolower(trim(str_replace(['"',"'"],'',$h)));
        if(in_array($h,['number','did','ddi','msisdn','phone','num','e164','destination','tn','cli'])) $numberCol=$i;
        if(in_array($h,['payout','rate','tariff','price','cost','buy_rate'])) $rateCol=$i;
        if(in_array($h,['currency','cur','currency_code'])) $currencyCol=$i;
        if(in_array($h,['prefix','prefix_code'])) $prefixCol=$i;
    }

    // Parse all numbers from CSV
    $csvNumbers = [];
    $csvRates = [];
    $csvPrefixes = [];
    foreach($lines as $lineIdx=>$line){
        if($lineIdx===0) continue; // skip header
        $cols = str_getcsv($line, $sep);
        $raw = trim(str_replace(['"',"'",' '],'',$cols[$numberCol]??''));
        $num = preg_replace('/[^0-9+]/','',$raw);
        if(!$num) continue;
        if(!str_starts_with($num,'+')) $num='+'.$num;
        if(strlen($num)<8) continue;
        if(!in_array($num,$csvNumbers)){
            $csvNumbers[] = $num;
            // Store rate from CSV
            if($rateCol!==null){
                $rate = str_replace(',','.',trim(str_replace(['"',"'"],'',$cols[$rateCol]??'0')));
                $csvRates[$num] = floatval($rate);
            }
            // Store currency from CSV
            if($currencyCol!==null){
                $csvCurrencies[$num] = trim(str_replace(['"',"'"],'',$cols[$currencyCol]??'USDT'));
            }
            // Store prefix from CSV
            if($prefixCol!==null){
                $prefix = preg_replace('/[^0-9]/','',$cols[$prefixCol]??'');
                if($prefix) $csvPrefixes[$num] = $prefix;
            }
        }
    }

    // Get existing DIDs for this supplier
    $existingDids = DB::table('dids')->where('trunk_id',$trunkId)->get()->keyBy('id');
    $existingNumbers = $existingDids->pluck('number')->toArray();

    // New numbers to add
    $toAdd = array_diff($csvNumbers, $existingNumbers);
    // Numbers to remove (in DB but not in new CSV)
    $toRemove = array_diff($existingNumbers, $csvNumbers);

    $prefixMap = [
        '39'=>['IT','Italy'],'44'=>['GB','UK'],'33'=>['FR','France'],
        '49'=>['DE','Germany'],'1'=>['US','USA'],'966'=>['SA','Saudi Arabia'],
        '90'=>['TR','Turkey'],'7'=>['RU','Russia'],'593'=>['EC','Ecuador'],
        '998'=>['UZ','Uzbekistan'],'995'=>['GE','Georgia'],
        '88'=>['SAT','Satellite'],'882'=>['SAT','Satellite'],
        '220'=>['GM','Gambia'],'248'=>['SC','Seychelles'],
        '269'=>['KM','Comoros'],'370'=>['LT','Lithuania'],
    ];

    $added=0; $removed=0;

    // Add new numbers
    foreach($toAdd as $num){ $num = '+'.ltrim($num,'+');
        $stripped = ltrim($num,'+');
        $cc='XX'; $cn='Unknown'; $detectedPrefix='';
        foreach([3,2,1] as $len){
            $p=substr($stripped,0,$len);
            if(isset($prefixMap[$p])){$cc=$prefixMap[$p][0];$cn=$prefixMap[$p][1];$detectedPrefix=$p;break;}
        }
        $finalPrefix = $csvPrefixes[$num] ?? $detectedPrefix;
        DB::table('dids')->insert([
            'number'        => $num,
            'trunk_id'      => $trunkId,
            'prefix'        => $finalPrefix,
            'country_name'  => $cn,
            'country_code'  => $cc,
            'tariff'        => $csvRates[$num] ?? ($r->rate??0.07),
            'selling_price' => $csvRates[$num] ?? ($r->rate??0.07),
            'currency'      => $csvCurrencies[$num] ?? ($r->currency??'USDT'),
            'payment_terms' => 'Weekly',
            'status'        => 'active',
            'ivr_context'   => 'custom/6g-premium-telecom',
            'created_at'    => now(),
            'updated_at'    => now(),
        ]);
        $added++;
    }

    // Remove numbers not in CSV anymore
    if(!empty($toRemove)){
        $idsToRemove = $existingDids->filter(function($d) use ($toRemove){
            $norm = '+'.ltrim($d->number,'+');
            return in_array($norm,$toRemove);
        })->keys()->toArray();
        DB::table('dids')->whereIn('id',$idsToRemove)->delete();
        $removed = count($idsToRemove);
    }

    // Auto create/update ranges
    $allDids = DB::table('dids')->where('trunk_id',$trunkId)->get();
    $rangeGroups = [];
    foreach($allDids as $d){
        $p = $d->prefix ?? substr(ltrim($d->number,'+'),0,4);
        if(!$p) continue;
        if(!isset($rangeGroups[$p])){
            $rangeGroups[$p]=['numbers'=>[],'country_name'=>$d->country_name,
                'country_code'=>$d->country_code,'rate'=>$d->tariff,'currency'=>$d->currency];
        }
        $rangeGroups[$p]['numbers'][] = ltrim($d->number,'+');
    }
    foreach($rangeGroups as $prefix=>$g){
        sort($g['numbers']);
        $start=reset($g['numbers']); $end=end($g['numbers']); $count=count($g['numbers']);
        $existing=DB::table('did_ranges')->where('prefix',$prefix)->first();
        if($existing){
            DB::table('did_ranges')->where('id',$existing->id)->update([
                'range_start'=>$start,'range_end'=>$end,'total_count'=>$count,
                'supplier_name'=>$trunk->nickname??$trunk->name,'updated_at'=>now()
            ]);
        } else {
            DB::table('did_ranges')->insert([
                'batch_name'=>$g['country_name'].' '.$prefix,'prefix'=>$prefix,
                'range_start'=>$start,'range_end'=>$end,'country_code'=>$g['country_code'],
                'country_name'=>$g['country_name'],'rate'=>$g['rate'],'selling_price'=>$g['rate'],
                'currency'=>$g['currency'],'payment_terms'=>'Weekly','total_count'=>$count,
                'supplier_name'=>$trunk->nickname??$trunk->name,'created_at'=>now(),'updated_at'=>now()
            ]);
        }
    }
    return response()->json([
        'success'   => true,
        'added'     => $added,
        'removed'   => $removed,
        'unchanged' => count($csvNorm)-count($toAdd),
        'total_csv' => count($csvNumbers),
        'total_db'  => DB::table('dids')->where('trunk_id',$trunkId)->count(),
        'supplier'  => $trunk->nickname??$trunk->name,
        'message'   => "Sync complete: +{$added} added, -{$removed} removed, ".(count($csvNorm)-count($toAdd))." unchanged",
    ]);
});

// ── System Health ──────────────────────────────────────────────
Route::get('/v1/system/health', function() {
    $checks = [];

    // Asterisk
    exec("asterisk -rx 'core show version' 2>/dev/null", $av, $arc);
    exec("asterisk -rx 'core show channels' 2>/dev/null", $ac);
    $activeCalls = 0;
    foreach($ac as $l){ if(preg_match('/(\d+) active call/', $l, $m)) $activeCalls=intval($m[1]); }
    $checks['asterisk'] = [
        'name'=>'Asterisk PBX','status'=>$arc===0?'healthy':'critical',
        'version'=>$av[0]??'Unknown','active_calls'=>$activeCalls,
        'latency'=>null,'detail'=>$arc===0?'Running':'Not responding'
    ];

    // Nginx
    exec("systemctl is-active nginx 2>/dev/null", $no, $nr);
    $checks['nginx'] = [
        'name'=>'Nginx','status'=>trim($no[0]??'')==='active'?'healthy':'critical',
        'detail'=>trim($no[0]??'unknown')
    ];

    // PHP-FPM
    exec("systemctl is-active php8.3-fpm 2>/dev/null", $po, $pr);
    $checks['php_fpm'] = [
        'name'=>'PHP 8.3-FPM','status'=>trim($po[0]??'')==='active'?'healthy':'critical',
        'detail'=>trim($po[0]??'unknown')
    ];

    // MySQL
    try {
        $start = microtime(true);
        DB::select('SELECT 1');
        $latency = round((microtime(true)-$start)*1000,2);
        $checks['mysql'] = ['name'=>'MariaDB','status'=>'healthy','latency'=>$latency.'ms','detail'=>'Connected'];
    } catch(Exception $e) {
        $checks['mysql'] = ['name'=>'MariaDB','status'=>'critical','detail'=>$e->getMessage()];
    }

    // API
    $start = microtime(true);
    $apiLatency = round((microtime(true)-$start)*1000,2);
    $checks['api'] = ['name'=>'Laravel API','status'=>'healthy','latency'=>$apiLatency.'ms','detail'=>'Responding'];

    // CPU/RAM/Disk
    $load = sys_getloadavg();
    exec("free -m 2>/dev/null", $free);
    preg_match('/Mem:\s+(\d+)\s+(\d+)/', implode("\n",$free), $mem);
    $totalMem = intval($mem[1]??0);
    $usedMem = intval($mem[2]??0);
    $memPct = $totalMem>0?round($usedMem/$totalMem*100,1):0;

    exec("df -h / 2>/dev/null", $df);
    preg_match('/(\d+)%/', $df[1]??'', $disk);
    $diskPct = intval($disk[1]??0);

    $checks['cpu'] = [
        'name'=>'CPU','status'=>$load[0]>8?'critical':($load[0]>4?'warning':'healthy'),
        'detail'=>'Load: '.implode(', ',$load)
    ];
    $checks['memory'] = [
        'name'=>'Memory','status'=>$memPct>90?'critical':($memPct>75?'warning':'healthy'),
        'detail'=>$usedMem.'MB / '.$totalMem.'MB ('.$memPct.'%)',
        'percent'=>$memPct
    ];
    $checks['disk'] = [
        'name'=>'Disk','status'=>$diskPct>90?'critical':($diskPct>75?'warning':'healthy'),
        'detail'=>$diskPct.'% used','percent'=>$diskPct
    ];

    // SIP Trunks
    exec("asterisk -rx 'pjsip show endpoints' 2>/dev/null", $ep);
    $trunks = [];
    $current = null;
    foreach($ep as $line){
        if(preg_match('/Endpoint:\s+(\w[\w-]+)/', $line, $m)) $current = $m[1];
        if($current && preg_match('/(Avail|Unavail|NonQual|Not in use|In use)/i', $line, $s)){
            $trunks[$current] = trim($s[1]);
        }
    }
    $checks['sip'] = ['name'=>'SIP Trunks','status'=>'healthy','trunks'=>$trunks,'detail'=>count($trunks).' endpoints'];

    // Overall status
    $statuses = array_column($checks,'status');
    $overall = in_array('critical',$statuses)?'critical':(in_array('warning',$statuses)?'warning':'healthy');

    return response()->json([
        'overall'  => $overall,
        'checks'   => $checks,
        'timestamp'=> now()->toISOString(),
    ]);
});

// ── Test Number Access List ────────────────────────────────────
Route::get('/v1/test/access-list', function() {
    try {
        $list = DB::table('test_access_list')->orderByDesc('created_at')->get();
        return response()->json(['data'=>$list]);
    } catch(Exception $e) {
        return response()->json(['data'=>[]]);
    }
});
Route::post('/v1/test/access-list', function(Request $r) {
    try {
        DB::statement("CREATE TABLE IF NOT EXISTS test_access_list (
            id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            cli VARCHAR(50) NOT NULL,
            type VARCHAR(20) DEFAULT 'allow',
            description VARCHAR(200),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )");
        $id = DB::table('test_access_list')->insertGetId([
            'cli'         => $r->cli,
            'type'        => $r->type ?? 'allow',
            'description' => $r->description,
            'created_at'  => now(),
            'updated_at'  => now(),
        ]);
        return response()->json(['success'=>true,'data'=>DB::table('test_access_list')->find($id)]);
    } catch(Exception $e) {
        return response()->json(['error'=>$e->getMessage()],500);
    }
});
Route::delete('/v1/test/access-list/{id}', function($id) {
    DB::table('test_access_list')->delete($id);
    return response()->json(['success'=>true]);
});

// ── Delete DID Range (and its numbers) ─────────────────────────
Route::delete('/v1/did-ranges/{id}', function($id) {
    $range = DB::table('did_ranges')->find($id);
    if(!$range) return response()->json(['error'=>'Range not found'],404);

    $didCount = DB::table('dids')->where('prefix',$range->prefix)->count();
    DB::table('dids')->where('prefix',$range->prefix)->delete();
    DB::table('did_ranges')->where('id',$id)->delete();

    DB::table('audit_logs')->insert([
        'user'=>'admin','action'=>'range_deleted','module'=>'Numbers',
        'details'=>"Deleted range {$range->prefix} ({$range->country_name}) and {$didCount} DIDs",
        'created_at'=>now(),'updated_at'=>now(),
    ]);

    return response()->json([
        'success'=>true,
        'message'=>"Deleted range {$range->prefix} and {$didCount} numbers",
        'dids_deleted'=>$didCount,
    ]);
});
