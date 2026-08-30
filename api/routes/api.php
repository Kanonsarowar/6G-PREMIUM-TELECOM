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
        $q = DB::table('dids');
        if($r->number) $q->where('number',$r->number);
        $dids = $q->get();
        return response()->json(['data'=>$dids,'total'=>$dids->count()]);
    });

    // ── DID Ranges ────────────────────────────────────────────
    Route::get('/v1/did-ranges', function() {
        $ranges = DB::table('did_ranges')->paginate(50);
        return response()->json($ranges);
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
            'default_ivr'  => $r->default_ivr ?? 'custom/telephone-convo',
            'total_count'  => $count,
            'is_active'    => 1,
            'created_at'   => now(),
            'updated_at'   => now(),
        ]);
        return response()->json(['success'=>true,'id'=>$id,'total'=>$count,'message'=>"Range imported — $count numbers"]);
    });

    // ── Revenue ───────────────────────────────────────────────
    Route::get('/v1/billing/current-revenue', function() {
        $data = DB::table('cdrs')
            ->selectRaw('COUNT(*) as calls, SUM(billsec/60) as minutes, SUM(revenue) as revenue')
            ->first();
        return response()->json(['data'=>$data]);
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
        return response()->json(['data'=>DB::table('trunks')->find($id),'success'=>true]);
    });

    Route::put('/v1/suppliers/{id}', function(Request $r, $id) {
        DB::table('trunks')->where('id',$id)->update([
            'name'      => $r->name,
            'host'      => $r->host,
            'port'      => $r->port ?? 5060,
            'transport' => $r->transport ?? 'udp',
            'is_active' => $r->is_active ?? 1,
            'notes'     => $r->notes,
            'updated_at'=> now(),
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
        'payment_terms' => $r->payment_terms ?? 'Daily',
        'supplier_name' => $r->supplier,
        'trunk_id'      => $r->trunk_id ?? 1,
        'default_ivr'   => $r->default_ivr ?? 'custom/telephone-convo',
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
            'payment_terms'    => $r->payment_terms ?? 'Daily',
            'lifecycle_status' => 'available',
            'status'           => 'active',
            'ivr_context'      => $r->default_ivr ?? 'custom/telephone-convo',
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

    DB::table('did_ranges')->where('id',$rangeId)->update(['imported_count'=>$imported]);

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
        'payment_terms'   => $r->payment_terms ?? 'Daily',
        'lifecycle_status'=> 'available',
        'status'          => 'active',
        'ivr_context'     => 'custom/telephone-convo',
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
    $weekStart = $now->copy()->subWeek()->startOfWeek(\Carbon\Carbon::SUNDAY);
    $weekEnd   = $weekStart->copy()->endOfWeek(\Carbon\Carbon::SATURDAY);

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
    $weekStart = $now->copy()->subWeek()->startOfWeek(\Carbon\Carbon::SUNDAY);
    $weekEnd   = $weekStart->copy()->endOfWeek(\Carbon\Carbon::SATURDAY);
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
        'ivr_context'  => $r->ivr_context ?? 'custom/telephone-convo',
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
    $path = '/var/lib/asterisk/sounds/custom/';
    if(!is_dir($path)) mkdir($path,0755,true);
    
    $filename = $name.'.'.$file->getClientOriginalExtension();
    $file->move($path,$filename);
    
    // Convert to slin if needed
    $slinFile = $path.$name.'.slin';
    if($file->getClientOriginalExtension() !== 'slin'){
        exec("sox {$path}{$filename} -r 8000 -c 1 -e signed-integer -b 16 {$slinFile} 2>&1");
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
        $state    = $parts[6] ?? '';
        $duration = $parts[7] ?? 0;
        $appname  = $parts[4] ?? '';
        
        // Only show from-carrier context
        if($context !== 'from-carrier' && !str_contains($channel,'from-carrier')) continue;
        
        // Get DID info from DB
        $did = \Illuminate\Support\Facades\DB::table('dids')
            ->where('number', $exten)
            ->orWhere('number', '+'.$exten)
            ->first();

        // Detect supplier from channel
        $trunk_name = 'Unknown';
        if(str_contains($channel,'STANDARD')) $trunk_name = 'WTP';
        elseif(str_contains($channel,'MEDIATEL')) $trunk_name = 'Mediatel';

        // Calculate start time from duration
        $start_time = date('H:i:s', time() - (int)$duration);

        $calls[] = [
            'channel'     => $channel,
            'src'         => $parts[8] ?? 'Unknown',
            'did'         => $exten,
            'dst'         => $exten,
            'context'     => $context,
            'state'       => $state,
            'billsec'     => (int)$duration,
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
        ->where('number','>=',$range->range_start)
        ->where('number','<=',$range->range_end)
        ->update(['ivr_context'=>$ivr,'updated_at'=>now()]);
    
    DB::table('did_ranges')->where('id',$id)->update(['default_ivr'=>$ivr,'updated_at'=>now()]);
    return response()->json(['success'=>true,'message'=>"IVR applied to {$count} numbers",'count'=>$count]);
});

// Live calls from Asterisk AMI - override existing
