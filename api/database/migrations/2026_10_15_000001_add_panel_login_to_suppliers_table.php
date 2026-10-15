<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// The supplier's own web panel: login link, username and password
// (encrypted with Crypt, revealed only to a superadmin).
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('suppliers', function (Blueprint $table) {
            $table->string('panel_url', 500)->nullable()->after('phone');
            $table->string('panel_username')->nullable()->after('panel_url');
            $table->text('panel_password')->nullable()->after('panel_username');
        });
    }

    public function down(): void
    {
        Schema::table('suppliers', function (Blueprint $table) {
            $table->dropColumn(['panel_url', 'panel_username', 'panel_password']);
        });
    }
};
