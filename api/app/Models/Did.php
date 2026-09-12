<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
class Did extends Model {
    // forward_to left as-is (pre-existing, not confirmed used anywhere in
    // routes/api.php or the frontend) — not removing pre-existing fields
    // that aren't confirmed unused, only adding the fields confirmed live
    // via DB::table('dids') usage across routes/api.php.
    protected $fillable=[
        'number','customer_id','trunk_id','forward_to','status',
        'country_code','country_name','prefix',
        'tariff','selling_price','currency','payment_terms',
        'lifecycle_status','ivr_context','batch_id','e164_number',
    ];
}
