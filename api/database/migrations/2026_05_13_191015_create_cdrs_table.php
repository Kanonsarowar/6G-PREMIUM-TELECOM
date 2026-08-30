<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void {
        Schema::create('cdrs', function (Blueprint $table) {
            $table->id();
            $table->string('caller');
            $table->string('callee');
            $table->integer('duration')->default(0);
            $table->timestamps();
        });
    }
    public function down(): void {
        Schema::dropIfExists('cdrs');
    }
};
