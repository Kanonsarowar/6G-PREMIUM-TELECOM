<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

class CreateDidRoutesTable extends Migration
{
    public function up()
    {
        Schema::create('did_routes', function (Blueprint $table) {
            $table->id();
            $table->string('did_number');
            $table->string('destination');
            $table->enum('status', ['active', 'inactive'])->default('active');
            $table->timestamps();
        });
    }

    public function down()
    {
        Schema::dropIfExists('did_routes');
    }
}
