<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('ami_events')) {
            return;
        }
        Schema::create('ami_events', function (Blueprint $table) {
            $table->id();
            $table->string('uniqueid')->index();
            $table->string('event', 50);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ami_events');
    }
};
