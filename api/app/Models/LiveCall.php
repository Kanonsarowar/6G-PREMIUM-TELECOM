<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class LiveCall extends Model
{
    protected $fillable = [
        'caller', 'callee', 'duration', 'status', 'start_time'
    ];
}
