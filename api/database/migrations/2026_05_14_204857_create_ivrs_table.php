<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up() {
        Schema::create('ivrs', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('title');
            $table->string('audio_file');
            $table->boolean('is_active')->default(1);
            $table->timestamps();
        });
    }
    public function down() {
        Schema::dropIfExists('ivrs');
    }
};
