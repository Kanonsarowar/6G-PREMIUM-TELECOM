<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        Schema::create('sip_invites', function (Blueprint $table) {
            $table->id();
            $table->string('call_id')->nullable();
            $table->string('from_user')->nullable();
            $table->string('to_user')->nullable();
            $table->string('source_ip')->nullable();
            $table->string('destination_ip')->nullable();
            $table->string('user_agent')->nullable();
            $table->timestamp('received_at')->nullable();
            $table->timestamps();
        });
    }

    public function down()
    {
        Schema::dropIfExists('sip_invites');
    }
};
