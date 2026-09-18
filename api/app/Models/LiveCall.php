<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class LiveCall extends Model
{
    protected $fillable = [
        'caller', 'callee', 'duration', 'status', 'uniqueid',
        'src', 'dst', 'did', 'channel', 'trunk_name', 'country',
        'ivr_context', 'billsec', 'ended_at', 'hangup_cause',
    ];
}
