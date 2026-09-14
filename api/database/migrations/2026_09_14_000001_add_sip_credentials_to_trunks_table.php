<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Production's `trunks` table has drifted from the tracked migration
     * history (columns were added directly, e.g. pjsip_name/auth_type/qualify),
     * so every column add here is guarded with hasColumn() rather than assumed.
     */
    public function up(): void
    {
        Schema::table('trunks', function (Blueprint $table) {
            if (!Schema::hasColumn('trunks', 'sip_username')) {
                $table->string('sip_username')->nullable();
            }
            if (!Schema::hasColumn('trunks', 'sip_password')) {
                $table->text('sip_password')->nullable();
            }
        });
    }

    public function down(): void
    {
        Schema::table('trunks', function (Blueprint $table) {
            if (Schema::hasColumn('trunks', 'sip_password')) {
                $table->dropColumn('sip_password');
            }
            if (Schema::hasColumn('trunks', 'sip_username')) {
                $table->dropColumn('sip_username');
            }
        });
    }
};
