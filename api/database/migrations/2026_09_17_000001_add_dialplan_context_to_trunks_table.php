<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Which Asterisk dialplan context the trunk's inbound calls enter
     * (pjsip_generate.php writes this into the endpoint's context= line).
     * Lets one supplier get different call-progress signaling (e.g.
     * Ringing() vs Progress()) without changing it for everyone.
     */
    public function up(): void
    {
        Schema::table('trunks', function (Blueprint $table) {
            $table->string('dialplan_context', 100)->default('from-carrier')->after('host');
        });
    }

    public function down(): void
    {
        Schema::table('trunks', function (Blueprint $table) {
            $table->dropColumn('dialplan_context');
        });
    }
};
