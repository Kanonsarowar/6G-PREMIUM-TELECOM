<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AsteriskConfigHistory extends Model
{
    protected $table = 'asterisk_config_history';

    protected $fillable = [
        'user_name', 'user_email', 'action', 'summary',
        'status', 'pjsip_backup_path', 'extensions_backup_path',
    ];
}
