<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AsteriskSetting extends Model
{
    protected $fillable = [
        'sip_port', 'rtp_start', 'rtp_end', 'codecs',
        'inbound_context', 'public_ip_override', 'updated_by',
    ];

    /**
     * Singleton accessor — the module only ever needs one settings row.
     */
    public static function current(): self
    {
        return static::query()->firstOrCreate([], [
            'sip_port' => 5060,
            'rtp_start' => 10000,
            'rtp_end' => 20000,
            'codecs' => 'ulaw,alaw',
            'inbound_context' => 'from-suppliers',
        ]);
    }
}
