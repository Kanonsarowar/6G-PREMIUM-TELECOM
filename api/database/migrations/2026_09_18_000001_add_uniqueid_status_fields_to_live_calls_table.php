<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('live_calls', function (Blueprint $table) {
            if (!Schema::hasColumn('live_calls', 'uniqueid')) {
                $table->string('uniqueid')->nullable()->unique()->after('id');
            }
            if (!Schema::hasColumn('live_calls', 'ended_at')) {
                $table->timestamp('ended_at')->nullable()->after('status');
            }
            if (!Schema::hasColumn('live_calls', 'hangup_cause')) {
                $table->string('hangup_cause')->nullable()->after('ended_at');
            }
        });
    }

    public function down(): void
    {
        Schema::table('live_calls', function (Blueprint $table) {
            if (Schema::hasColumn('live_calls', 'hangup_cause')) {
                $table->dropColumn('hangup_cause');
            }
            if (Schema::hasColumn('live_calls', 'ended_at')) {
                $table->dropColumn('ended_at');
            }
            if (Schema::hasColumn('live_calls', 'uniqueid')) {
                $table->dropUnique(['uniqueid']);
                $table->dropColumn('uniqueid');
            }
        });
    }
};
