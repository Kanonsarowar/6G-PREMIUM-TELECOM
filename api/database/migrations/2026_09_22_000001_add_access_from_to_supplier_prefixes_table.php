<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Access From replaces the old single-value Operator field: a Prefix
     * can now be reachable from several networks at once (STC, Mobily,
     * Zain, Virgin, Lebara, Salam), stored here as a comma-separated list.
     * The old `operator` column is left in place, unused, rather than
     * dropped/renamed - renaming would need doctrine/dbal, which this app
     * doesn't have installed.
     */
    public function up(): void
    {
        Schema::table('supplier_prefixes', function (Blueprint $table) {
            $table->string('access_from')->nullable()->after('operator');
        });
    }

    public function down(): void
    {
        Schema::table('supplier_prefixes', function (Blueprint $table) {
            $table->dropColumn('access_from');
        });
    }
};
