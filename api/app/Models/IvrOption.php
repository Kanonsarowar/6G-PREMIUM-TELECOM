<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class IvrOption extends Model
{
    protected $fillable = ['ivr_id', 'dtmf_key', 'action_type', 'target_value'];

    public function ivr()
    {
        return $this->belongsTo(Ivr::class);
    }
}
