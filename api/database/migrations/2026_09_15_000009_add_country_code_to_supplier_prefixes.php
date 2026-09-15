<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Dial code only (e.g. "966" for Saudi Arabia), digits with no leading
     * "+" - matches how the NOC now displays all numbers.
     */
    public function up(): void
    {
        Schema::table('supplier_prefixes', function (Blueprint $table) {
            $table->string('country_code', 8)->nullable()->after('country');
        });
    }

    public function down(): void
    {
        Schema::table('supplier_prefixes', function (Blueprint $table) {
            $table->dropColumn('country_code');
        });
    }
};
