<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Trunk extends Model
{
    protected $fillable = ['name', 'ip', 'prefix', 'status'];
}
