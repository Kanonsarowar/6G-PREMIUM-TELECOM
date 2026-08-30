<?php
// app/Models/Customer.php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class Customer extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'company_name',
        'address',
        'phone'
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function didRoutes()
    {
        return $this->hasMany(DidRoute::class);
    }

    public function liveCalls()
    {
        return $this->hasMany(LiveCall::class);
    }

    public function cdr()
    {
        return $this->hasMany(Cdr::class);
    }
}
