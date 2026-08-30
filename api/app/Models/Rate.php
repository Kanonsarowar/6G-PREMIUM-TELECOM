<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
class Rate extends Model {
    protected $fillable=['name','prefix','country','rate_per_minute','currency','billing_increment','min_duration','active'];
}
