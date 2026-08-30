<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DidRoute extends Model
{
    protected $fillable = ['did_number', 'destination', 'status'];
}
