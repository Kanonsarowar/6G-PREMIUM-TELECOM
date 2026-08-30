<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
class Did extends Model {
    protected $fillable=['number','customer_id','trunk_id','forward_to','status'];
}
