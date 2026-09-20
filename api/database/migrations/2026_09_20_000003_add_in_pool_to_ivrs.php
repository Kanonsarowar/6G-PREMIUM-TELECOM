<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Default-IVR pool: an IVR with in_pool=1 (and is_active=1) is a candidate for the
 * per-call random pick made whenever a number/route is on the default IVR.
 * Opt-in, so existing IVRs are unaffected until someone selects them.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasColumn('ivrs', 'in_pool')) {
            Schema::table('ivrs', function (Blueprint $table) {
                $table->boolean('in_pool')->default(0)->after('is_active');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('ivrs', 'in_pool')) {
            Schema::table('ivrs', function (Blueprint $table) {
                $table->dropColumn('in_pool');
            });
        }
    }
};
