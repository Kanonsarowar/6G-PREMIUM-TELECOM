<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * IVR is assigned at the Prefix level (matching how price/payment term
     * already work) rather than per individual number - new numbers/ranges
     * created under a prefix inherit it, and changing it here re-applies
     * to every existing number under that prefix.
     */
    public function up(): void
    {
        Schema::table('supplier_prefixes', function (Blueprint $table) {
            $table->string('ivr_context')->nullable()->after('operator');
        });
    }

    public function down(): void
    {
        Schema::table('supplier_prefixes', function (Blueprint $table) {
            $table->dropColumn('ivr_context');
        });
    }
};
