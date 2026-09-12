<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Trunk extends Model
{
    // NOTE: production code (routes/api.php) manages this table almost
    // entirely through DB::table('trunks') query-builder calls, not this
    // model, so $hidden below does not by itself protect those responses —
    // see redactTrunk() in routes/api.php for the actual enforcement.
    // This model is kept in sync with the real schema for any future
    // Eloquent usage and so it fails safe (hides secrets) by default.
    protected $fillable = [
        'name', 'ip', 'prefix', 'status',
        'nickname', 'host', 'port', 'transport', 'codecs',
        'is_active', 'notes',
        'panel_url', 'panel_user', 'panel_password',
        'team_link', 'sales_person', 'whatsapp',
        'api_url', 'api_key', 'api_secret',
        'api_did', 'api_livecalls', 'api_cdr', 'api_balance',
        'api_did_path', 'api_livecalls_path',
    ];

    protected $hidden = ['panel_password', 'api_key', 'api_secret'];
}
