<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('asterisk_config_history')) {
            return;
        }

        Schema::create('asterisk_config_history', function (Blueprint $table) {
            $table->id();
            $table->string('user_name')->nullable();
            $table->string('user_email')->nullable();
            $table->string('action'); // apply | reload_pjsip | reload_dialplan | reload_all | rollback | test
            $table->text('summary')->nullable(); // +/~/- change bullets
            $table->string('status'); // success | failed | rolled_back
            $table->string('pjsip_backup_path')->nullable();
            $table->string('extensions_backup_path')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('asterisk_config_history');
    }
};
