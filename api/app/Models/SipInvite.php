<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SipInvite extends Model
{
    protected $fillable = [
        'caller', 'callee', 'method', 'status'
    ];
}
