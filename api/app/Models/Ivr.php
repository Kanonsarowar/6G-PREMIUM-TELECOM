<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Ivr extends Model
{
    protected $fillable = ['name', 'title', 'audio_file', 'is_active'];

    public function options()
    {
        return $this->hasMany(IvrOption::class);
    }
}
