<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Friendly device name (e.g. "Samsung SM-S918B", "iPhone", "Windows 11 PC")
     * reported by the NOC in the X-Device-Name header, since the User-Agent
     * alone often hides the model.
     */
    public function up(): void
    {
        Schema::table('personal_access_tokens', function (Blueprint $table) {
            $table->string('device_name', 100)->nullable()->after('user_agent');
        });
    }

    public function down(): void
    {
        Schema::table('personal_access_tokens', function (Blueprint $table) {
            $table->dropColumn('device_name');
        });
    }
};
