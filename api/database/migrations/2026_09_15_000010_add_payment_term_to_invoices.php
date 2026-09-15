<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Tags a paid supplier_payment invoice with the settlement term (Daily/
     * Weekly/Monthly) it was paid under, so payment history can be grouped
     * and filtered by term. Not applicable to other invoice types.
     */
    public function up(): void
    {
        Schema::table('invoices', function (Blueprint $table) {
            if (!Schema::hasColumn('invoices', 'payment_term')) {
                $table->string('payment_term')->nullable()->after('reference');
            }
        });
    }

    public function down(): void
    {
        Schema::table('invoices', function (Blueprint $table) {
            if (Schema::hasColumn('invoices', 'payment_term')) $table->dropColumn('payment_term');
        });
    }
};
