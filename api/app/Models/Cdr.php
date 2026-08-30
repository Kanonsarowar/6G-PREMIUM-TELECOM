<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Cdr extends Model
{
    protected $fillable = [
        'caller', 'callee', 'duration', 'status',
        'start_time', 'end_time'
    ];
}
