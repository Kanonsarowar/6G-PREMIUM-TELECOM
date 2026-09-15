
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

<?php
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\DB;
use App\Models\User;

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
        $q = DB::table('cdrs')->orderByDesc('call_start');
        if($r->search) $q->where('src','like',"%{$r->search}%")->orWhere('did','like',"%{$r->search}%");
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
            'currency'      => $r->currency??'EUR',
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
                    'currency'      => $r->currency??'EUR',
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
            'currency'     => 'EUR',
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
    Route::get('/v1/suppliers', function(Request $request) {
        $user = $request->user();
        $trunks = DB::table('trunks')->get();
        // Admin only sees nickname list
        if ($user && $user->role === 'admin') {
            $trunks = $trunks->map(function($t) {
                return [
                    'id'       => $t->id,
                    'nickname' => $t->nickname ?? $t->name,
                    'status'   => $t->is_active ? 'active' : 'inactive',
                ];
            });
        }
        return response()->json(['data'=>$trunks]);
    });

    Route::post('/v1/suppliers', function(Request $r) {
        if ($r->user()->role !== 'superadmin') {
            return response()->json(['error'=>'Unauthorized'],403);
        }
        $id = DB::table('trunks')->insertGetId([
            'name'       => $r->name,
            'host'       => $r->host,
            'port'       => $r->port ?? 5060,
            'transport'  => $r->transport ?? 'udp',
            'is_active'  => 1,
            'notes'      => $r->notes,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        // Auto-whitelist supplier IPs
        autoWhitelistSupplierIPs($r->host);
        return response()->json(['data'=>DB::table('trunks')->find($id),'success'=>true]);
    });

    Route::put('/v1/suppliers/{id}', function(Request $r, $id) {
        DB::table('trunks')->where('id',$id)->update([
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
            'panel_password'    => $r->panel_password,
            'team_link'         => $r->team_link,
            'sales_person'      => $r->sales_person,
            'whatsapp'          => $r->whatsapp,
            'api_url'           => $r->api_url,
            'api_key'           => $r->api_key,
            'api_secret'        => $r->api_secret,
            'api_did'           => $r->api_did ?? '0',
            'api_livecalls'     => $r->api_livecalls ?? '0',
            'api_cdr'           => $r->api_cdr ?? '0',
            'api_balance'       => $r->api_balance ?? '0',
            'api_did_path'      => $r->api_did_path,
            'api_livecalls_path'=> $r->api_livecalls_path,
            'updated_at'        => now(),
        ]);
        return response()->json(['data'=>DB::table('trunks')->find($id),'success'=>true]);
    });

    Route::delete('/v1/suppliers/{id}', function($id) {
        DB::table('trunks')->delete($id);
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
        'currency'      => 'EUR',
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
            'currency'         => 'EUR',
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
        'currency'        => 'EUR',
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
            'currency'       => 'EUR',
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
    DB::table('route_prefixes')->where('id',$id)->update([
        'ivr_context'  => $r->ivr_context,
        'is_active'    => $r->is_active ?? 1,
        'priority'     => $r->priority ?? 1,
        'updated_at'   => now(),
    ]);
    return response()->json(['success'=>true]);
});

// IVR Upload
Route::post('/v1/ivr-lib/upload', function(Request $r) {
    $r->validate(['audio'=>'required|file|mimes:wav,mp3,ogg,slin','name'=>'required']);
    
    $file = $r->file('audio');
    $name = preg_replace('/[^a-zA-Z0-9_-]/','-',$r->name);
    $displayName = $r->display_name ?? $r->name;
    
    // Save to asterisk custom sounds
    $path = '/usr/share/asterisk/sounds/custom/';
    if(!is_dir($path)) mkdir($path,0755,true);
    
    $filename = $name.'.'.$file->getClientOriginalExtension();
    $file->move($path,$filename);
    
    // Convert to multiple formats for Asterisk compatibility
    $slinFile = $path.$name.'.slin';
    $ulFile   = $path.$name.'.ul';
    $wavFile  = $path.$name.'.wav';
    if($file->getClientOriginalExtension() !== 'slin'){
        // Convert to slin (raw signed 16-bit 8kHz)
        $src = escapeshellarg($path.$filename);
        $dst_slin = escapeshellarg($slinFile);
        $dst_ul = escapeshellarg($ulFile);
        $dst_wav = escapeshellarg($wavFile);
        exec("ffmpeg -i {$src} -ar 8000 -ac 1 -acodec pcm_s16le -f s16le {$dst_slin} -y 2>&1", $out1);
        exec("ffmpeg -i {$src} -ar 8000 -ac 1 -acodec pcm_mulaw -f mulaw {$dst_ul} -y 2>&1", $out2);
        exec("ffmpeg -i {$src} -ar 8000 -ac 1 {$dst_wav} -y 2>&1", $out3);
        exec("chown asterisk:asterisk {$dst_slin} {$dst_ul} {$dst_wav} 2>&1");
        exec("chmod 644 {$dst_slin} {$dst_ul} {$dst_wav} 2>&1");
    }
    
    // Save to DB
    $id = DB::table('ivrs')->insertGetId([
        'name'         => $name,
        'title'        => $displayName,
        'audio_file'   => $filename,
        'display_name' => $displayName,
        'is_active'    => 1,
        'created_at'   => now(),
        'updated_at'   => now(),
    ]);
    
    return response()->json(['success'=>true,'id'=>$id,'name'=>$name,'display_name'=>$displayName]);
});

// Delete IVR
Route::delete('/v1/ivr-lib/{id}', function($id) {
    $ivr = DB::table('ivrs')->find($id);
    if($ivr){
        @unlink('/var/lib/asterisk/sounds/custom/'.$ivr->audio_file);
        @unlink('/var/lib/asterisk/sounds/custom/'.$ivr->name.'.slin');
        DB::table('ivrs')->delete($id);
    }
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

    // Get CDR CSV for recent answered calls
    $answered = [];
    $csvFile = '/var/log/asterisk/cdr-csv/Master.csv';
    if(file_exists($csvFile)){
        exec("tail -20 {$csvFile}", $csvLines);
        foreach($csvLines as $line){
            $parts = str_getcsv($line);
            if(count($parts) < 14) continue;
            $src = trim($parts[1]??'','"');
            $dst = trim($parts[2]??'','"');
            $channel = trim($parts[5]??'','"');
            $start = trim($parts[9]??'','"');
            $billsec = trim($parts[13]??'0','"');
            $disposition = trim($parts[14]??'','"');
            if(empty($src)||empty($dst)) continue;
            $supplier = 'WTP';
            if(stripos($channel,'MEDIATEL')!==false) $supplier='Mediatel';
            elseif(stripos($channel,'PHONEGROUP')!==false) $supplier='Phonegroup';
            elseif(stripos($channel,'PURPLE')!==false) $supplier='Purple Number';
            $answered[] = [
                'time'     => $start,
                'method'   => 'INVITE',
                'caller'   => $src,
                'did'      => $dst,
                'supplier' => $supplier,
                'result'   => $disposition==='ANSWERED'?'ANSWERED':($disposition==='BUSY'?'BUSY':'REJECTED'),
                'reason'   => $disposition,
                'duration' => intval($billsec),
                'source'   => '—',
            ];
        }
    }

    // Merge and sort by time desc
    $all = array_merge(array_reverse($answered), $invites);
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
        
        // Only show from-carrier context
        if($context !== 'from-carrier' && !str_contains($channel,'from-carrier')) continue;
        
        // Get DID info from DB
        $did = \Illuminate\Support\Facades\DB::table('dids')
            ->where('number', $exten)
            ->orWhere('number', '+'.$exten)
            ->first();

        // Detect supplier from channel using Asterisk endpoint name
        $trunk_name = 'Unknown';
        // Map Asterisk endpoint names to code names
        $endpointMap = [
            'WTP'        => 'WTP',
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

// ── Auto Generate Weekly Invoice (cron) ───────────────────────
Route::post('/v1/invoices/generate-weekly-supplier', function() {
    $suppliers = DB::table('trunks')->where('is_active',1)->get();
    $created = [];
    foreach($suppliers as $supplier){
        $cdrs = DB::table('cdrs')
            ->where('trunk_name',$supplier->name)
            ->where('created_at','>=',now()->startOfWeek())
            ->where('created_at','<=',now()->endOfWeek())
            ->get();
        if($cdrs->isEmpty()) continue;
        $total = $cdrs->sum('revenue');
        $calls = $cdrs->count();
        $minutes = $cdrs->sum('billsec') / 60;
        $invNum = 'SINV-'.date('YW').'-'.strtoupper($supplier->name);
        DB::table('invoices')->insert([
            'invoice_number' => $invNum,
            'supplier_name'  => $supplier->nickname??$supplier->name,
            'period_start'   => now()->startOfWeek(),
            'period_end'     => now()->endOfWeek(),
            'total_calls'    => $calls,
            'total_minutes'  => round($minutes,2),
            'total_amount'   => round($total,4),
            'currency'       => 'EUR',
            'status'         => 'unpaid',
            'invoice_type'   => 'supplier-weekly',
            'due_date'       => now()->addDays(7),
            'created_at'     => now(),
            'updated_at'     => now(),
        ]);
        $created[] = $invNum;
    }
    return response()->json(['success'=>true,'created'=>$created,'message'=>count($created).' supplier invoices generated']);
});

// ── Call Quality Monitor ───────────────────────────────────────
Route::get('/v1/quality/overview', function() {
    $cdrs = DB::table('cdrs')->get();
    $total = $cdrs->count();
    $answered = $cdrs->where('disposition','ANSWERED')->count();
    $asr = $total > 0 ? round($answered/$total*100,2) : 0;
    $acd = $answered > 0 ? round($cdrs->where('disposition','ANSWERED')->avg('billsec'),2) : 0;

    // Per DID stats
    $didStats = DB::table('cdrs')
        ->select('did', DB::raw('COUNT(*) as calls'),
            DB::raw('SUM(CASE WHEN disposition="ANSWERED" THEN 1 ELSE 0 END) as answered'),
            DB::raw('AVG(billsec) as acd'),
            DB::raw('SUM(revenue) as revenue'))
        ->groupBy('did')
        ->orderByDesc('calls')
        ->limit(20)
        ->get()
        ->map(function($d){
            $d->asr = $d->calls > 0 ? round($d->answered/$d->calls*100,1) : 0;
            $d->acd = round($d->acd,1);
            $d->revenue = round($d->revenue,4);
            return $d;
        });

    // Per supplier stats
    $supplierStats = DB::table('cdrs')
        ->select('trunk_name',
            DB::raw('COUNT(*) as calls'),
            DB::raw('SUM(CASE WHEN disposition="ANSWERED" THEN 1 ELSE 0 END) as answered'),
            DB::raw('AVG(billsec) as acd'),
            DB::raw('SUM(revenue) as revenue'))
        ->groupBy('trunk_name')
        ->get()
        ->map(function($s){
            $s->asr = $s->calls > 0 ? round($s->answered/$s->calls*100,1) : 0;
            $s->acd = round($s->acd,1);
            return $s;
        });

    // Dead DIDs - DIDs with no calls in last 7 days
    $activeDids = DB::table('dids')->pluck('number');
    $recentDids = DB::table('cdrs')
        ->where('created_at','>=',now()->subDays(7))
        ->pluck('did')->unique();
    $deadDids = $activeDids->diff($recentDids)->values();

    // Hourly distribution
    $hourly = DB::table('cdrs')
        ->select(DB::raw('HOUR(call_start) as hour'), DB::raw('COUNT(*) as calls'))
        ->whereNotNull('call_start')
        ->groupBy('hour')
        ->orderBy('hour')
        ->get();

    return response()->json([
        'asr'          => $asr,
        'acd'          => $acd,
        'total'        => $total,
        'answered'     => $answered,
        'failed'       => $total - $answered,
        'did_stats'    => $didStats,
        'supplier_stats'=> $supplierStats,
        'dead_dids'    => $deadDids->take(20),
        'hourly'       => $hourly,
    ]);
});

// ── DID Performance Report ─────────────────────────────────────
Route::get('/v1/did-performance', function() {
    // DID stats from CDRs
    $didStats = DB::table('cdrs')
        ->select(
            'did',
            DB::raw('COUNT(*) as total_calls'),
            DB::raw('SUM(CASE WHEN disposition="ANSWERED" THEN 1 ELSE 0 END) as answered'),
            DB::raw('SUM(CASE WHEN disposition!="ANSWERED" THEN 1 ELSE 0 END) as failed'),
            DB::raw('AVG(billsec) as avg_duration'),
            DB::raw('SUM(billsec) as total_seconds'),
            DB::raw('SUM(revenue) as total_revenue'),
            DB::raw('MAX(call_start) as last_call'),
            DB::raw('trunk_name as supplier')
        )
        ->groupBy('did','trunk_name')
        ->orderByDesc('total_calls')
        ->get()
        ->map(function($d){
            $d->asr = $d->total_calls>0 ? round($d->answered/$d->total_calls*100,1) : 0;
            $d->avg_duration = round($d->avg_duration,1);
            $d->total_minutes = round($d->total_seconds/60,2);
            $d->total_revenue = round($d->total_revenue,4);
            $d->status = $d->asr >= 70 ? 'good' : ($d->asr >= 40 ? 'fair' : 'poor');
            // Check if dead (no calls in 7 days)
            $d->is_dead = $d->last_call ? \Carbon\Carbon::parse($d->last_call)->lt(now()->subDays(7)) : true;
            return $d;
        });

    // Summary stats
    $totalDids = DB::table('dids')->count();
    $activeDids = $didStats->where('is_dead',false)->count();
    $deadDids = $didStats->where('is_dead',true)->count();
    $topDid = $didStats->sortByDesc('total_revenue')->first();
    $poorDids = $didStats->where('status','poor')->count();

    return response()->json([
        'summary' => [
            'total_dids'  => $totalDids,
            'active_dids' => $activeDids,
            'dead_dids'   => $deadDids,
            'poor_dids'   => $poorDids,
            'top_did'     => $topDid?->did ?? '—',
            'top_revenue' => $topDid?->total_revenue ?? 0,
        ],
        'dids' => $didStats->values(),
    ]);
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
    $currency = $r->currency ?? 'EUR';

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
    DB::table('ivrs')->where('id',$id)->update([
        'display_name' => $r->display_name,
        'is_active'    => $r->is_active ?? 1,
        'updated_at'   => now(),
    ]);
    return response()->json(['success'=>true,'data'=>DB::table('ivrs')->find($id)]);
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
                $csvCurrencies[$num] = trim(str_replace(['"',"'"],'',$cols[$currencyCol]??'EUR'));
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
            'currency'      => $csvCurrencies[$num] ?? ($r->currency??'EUR'),
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

// ── Fraud Control ──────────────────────────────────────────────

// Fraud overview/stats
Route::get('/v1/fraud/overview', function() {
    $today = date('Y-m-d');
    $events = DB::table('fraud_events');
    $blocks = DB::table('fraud_blocks');
    
    // Real-time CPS calculation
    $last60s = DB::table('cdrs')
        ->where('call_start', '>=', date('Y-m-d H:i:s', time()-60))
        ->count();
    
    // Concurrent calls
    exec("asterisk -rx 'core show channels concise' 2>/dev/null", $lines);
    $concurrent = max(0, count(array_filter($lines, fn($l)=>strlen(trim($l))>0)) - 0);
    
    return response()->json([
        'total_events'    => $events->count(),
        'open_events'     => $events->where('status','open')->count(),
        'today_events'    => $events->whereDate('created_at',$today)->count(),
        'active_blocks'   => $blocks->where('status','active')->count(),
        'cps_current'     => $last60s,
        'concurrent_calls'=> $concurrent,
        'critical_events' => $events->where('severity','critical')->where('status','open')->count(),
    ]);
});

// Fraud rules CRUD
Route::get('/v1/fraud/rules', function() {
    return response()->json(['data'=>DB::table('fraud_rules')->orderByDesc('created_at')->get()]);
});
Route::post('/v1/fraud/rules', function(Request $r) {
    $id = DB::table('fraud_rules')->insertGetId([
        'name'        => $r->name,
        'type'        => $r->type,
        'action'      => $r->action ?? 'alert',
        'status'      => 'active',
        'config'      => json_encode($r->config ?? []),
        'threshold'   => $r->threshold,
        'severity'    => $r->severity ?? 'medium',
        'auto_block'  => $r->auto_block ?? false,
        'description' => $r->description,
        'created_at'  => now(),
        'updated_at'  => now(),
    ]);
    DB::table('audit_logs')->insert(['user'=>'system','action'=>'fraud_rule_created','module'=>'fraud','details'=>$r->name,'created_at'=>now(),'updated_at'=>now()]);
    return response()->json(['success'=>true,'data'=>DB::table('fraud_rules')->find($id)]);
});
Route::put('/v1/fraud/rules/{id}', function(Request $r, $id) {
    DB::table('fraud_rules')->where('id',$id)->update([
        'name'=>$r->name,'type'=>$r->type,'action'=>$r->action,
        'status'=>$r->status,'threshold'=>$r->threshold,
        'severity'=>$r->severity,'auto_block'=>$r->auto_block??false,
        'description'=>$r->description,'updated_at'=>now(),
    ]);
    return response()->json(['success'=>true]);
});
Route::delete('/v1/fraud/rules/{id}', function($id) {
    DB::table('fraud_rules')->delete($id);
    return response()->json(['success'=>true]);
});

// Fraud events
Route::get('/v1/fraud/events', function(Request $r) {
    $q = DB::table('fraud_events')->orderByDesc('created_at');
    if($r->status) $q->where('status',$r->status);
    if($r->severity) $q->where('severity',$r->severity);
    return response()->json(['data'=>$q->limit(200)->get()]);
});
Route::put('/v1/fraud/events/{id}', function(Request $r, $id) {
    DB::table('fraud_events')->where('id',$id)->update([
        'status'=>$r->status,
        'resolved_at'=>$r->status==='resolved'?now():null,
        'updated_at'=>now(),
    ]);
    return response()->json(['success'=>true]);
});

// Fraud blocks
Route::get('/v1/fraud/blocks', function() {
    return response()->json(['data'=>DB::table('fraud_blocks')->orderByDesc('created_at')->get()]);
});
Route::post('/v1/fraud/blocks', function(Request $r) {
    $id = DB::table('fraud_blocks')->insertGetId([
        'type'       => $r->type,
        'value'      => $r->value,
        'reason'     => $r->reason,
        'blocked_by' => 'manual',
        'status'     => 'active',
        'expires_at' => $r->expires_at,
        'created_at' => now(),
        'updated_at' => now(),
    ]);
    DB::table('audit_logs')->insert(['user'=>'admin','action'=>'manual_block','module'=>'fraud','details'=>$r->type.':'.$r->value.' - '.$r->reason,'created_at'=>now(),'updated_at'=>now()]);
    return response()->json(['success'=>true,'data'=>DB::table('fraud_blocks')->find($id)]);
});
Route::put('/v1/fraud/blocks/{id}/release', function($id) {
    DB::table('fraud_blocks')->where('id',$id)->update([
        'status'=>'released','released_at'=>now(),'updated_at'=>now()
    ]);
    DB::table('audit_logs')->insert(['user'=>'admin','action'=>'block_released','module'=>'fraud','details'=>'Block ID:'.$id,'created_at'=>now(),'updated_at'=>now()]);
    return response()->json(['success'=>true]);
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

// ── Supplier CDR Reconciliation ────────────────────────────────
Route::get('/v1/reconciliation/summary', function(Request $r) {
    $from = $r->from ?? date('Y-m-d', strtotime('-7 days'));
    $to   = $r->to   ?? date('Y-m-d');
    $sup  = $r->supplier ?? 'WTP';

    $ours = DB::table('cdrs')
        ->whereBetween(DB::raw('DATE(call_start)'), [$from,$to])
        ->where('trunk_name',$sup)
        ->selectRaw('COUNT(*) calls, COALESCE(SUM(billsec),0) sec, COALESCE(SUM(revenue),0) rev')
        ->first();

    $theirs = DB::table('supplier_cdrs')
        ->whereBetween(DB::raw('DATE(call_date)'), [$from,$to])
        ->where('supplier_name',$sup)
        ->selectRaw('COUNT(*) calls, COALESCE(SUM(billsec),0) sec, COALESCE(SUM(payout),0) rev')
        ->first();

    $secDiff = (int)$ours->sec - (int)$theirs->sec;
    return response()->json([
        'from'=>$from, 'to'=>$to, 'supplier'=>$sup,
        'ours'   => ['calls'=>(int)$ours->calls,  'sec'=>(int)$ours->sec,
                     'minutes'=>round($ours->sec/60,2),  'revenue'=>round($ours->rev,4)],
        'theirs' => ['calls'=>(int)$theirs->calls,'sec'=>(int)$theirs->sec,
                     'minutes'=>round($theirs->sec/60,2),'revenue'=>round($theirs->rev,4)],
        'diff'   => ['calls'=>(int)$ours->calls-(int)$theirs->calls,
                     'sec'=>$secDiff, 'minutes'=>round($secDiff/60,2),
                     'revenue'=>round($ours->rev-$theirs->rev,4),
                     'pct'=>$theirs->sec>0?round($secDiff/$theirs->sec*100,2):0],
    ]);
});

Route::get('/v1/reconciliation/calls', function(Request $r) {
    $from = $r->from ?? date('Y-m-d', strtotime('-7 days'));
    $to   = $r->to   ?? date('Y-m-d');
    $sup  = $r->supplier ?? 'WTP';

    $rows = DB::select("
      SELECT s.call_date, s.prn, s.cli, s.operator,
             c.billsec our_sec, s.billsec sup_sec,
             (c.billsec - s.billsec) sec_diff,
             c.revenue our_rev, s.payout sup_rev,
             s.currency, s.payout_per_min
      FROM supplier_cdrs s
      LEFT JOIN cdrs c
        ON REPLACE(c.did,'+','') = s.prn
       AND ABS(TIMESTAMPDIFF(SECOND,
             DATE_ADD(c.call_start, INTERVAL c.billsec SECOND),
             DATE_ADD(s.call_date,  INTERVAL s.billsec SECOND))) <= 45
      WHERE s.supplier_name = ?
        AND DATE(s.call_date) BETWEEN ? AND ?
      ORDER BY s.call_date DESC
      LIMIT 500", [$sup,$from,$to]);

    return response()->json(['data'=>$rows,'count'=>count($rows)]);
});

Route::post('/v1/reconciliation/sync', function(Request $r) {
    $from = escapeshellarg(($r->from ?? date('Y-m-d',strtotime('-1 day'))).'T00:00:00');
    $to   = escapeshellarg(($r->to   ?? date('Y-m-d')).'T23:59:59');
    exec("/usr/bin/php /usr/local/bin/wtp_cdr_sync.php $from $to 2>&1", $out, $rc);
    return response()->json([
        'success'=>$rc===0, 'exit_code'=>$rc, 'output'=>array_slice($out,-10),
    ]);
});

// ── Access List ────────────────────────────────────────────────
Route::get('/v1/access-list', function() {
    $rows = DB::table('access_list')->where('status','active')
              ->orderBy('operator')->orderBy('country')->orderBy('prefix')->get();
    $grouped = [];
    foreach($rows as $r){
        $grouped[$r->operator]['operator'] = $r->operator;
        $grouped[$r->operator]['countries'][$r->country][] = $r;
    }
    $out = [];
    foreach($grouped as $op=>$g){
        $countries = [];
        foreach($g['countries'] as $cn=>$items){
            $countries[] = ['country'=>$cn,'entries'=>array_values($items)];
        }
        $out[] = ['operator'=>$op,'countries'=>$countries,
                  'total'=>array_sum(array_map(fn($c)=>count($c['entries']),$countries))];
    }
    return response()->json(['data'=>$out,'count'=>count($rows)]);
});

Route::post('/v1/access-list', function(Request $r) {
    if(!$r->operator || !$r->country || !$r->prefix)
        return response()->json(['error'=>'operator, country and prefix are required'],422);
    try {
        $id = DB::table('access_list')->insertGetId([
            'operator'=>$r->operator, 'country'=>$r->country, 'prefix'=>$r->prefix,
            'supplier'=>$r->supplier, 'price'=>(float)($r->price??0),
            'currency'=>$r->currency??'EUR', 'test_number'=>$r->test_number,
            'note'=>$r->note, 'status'=>'active',
            'created_at'=>now(), 'updated_at'=>now(),
        ]);
        return response()->json(['success'=>true,'id'=>$id]);
    } catch(\Exception $e){
        return response()->json(['error'=>str_contains($e->getMessage(),'uniq_op_prefix')
            ? 'This prefix already exists for that operator' : 'Insert failed'],409);
    }
});

Route::delete('/v1/access-list/{id}', function($id) {
    DB::table('access_list')->delete($id);
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
