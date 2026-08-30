<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void {
        Schema::create('dids', function (Blueprint $table) {
            $table->id();
            $table->string('number');
            $table->unsignedBigInteger('trunk_id');
            $table->string('route')->nullable();
            $table->timestamps();
            $table->foreign('trunk_id')->references('id')->on('trunks')->onDelete('cascade');
        });
    }
    public function down(): void {
        Schema::dropIfExists('dids');
    }
};
