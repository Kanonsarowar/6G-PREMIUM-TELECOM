<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Reuses the existing invoices table for supplier payment settlements
     * (invoice_type = 'supplier_payment') instead of a parallel table.
     * All columns are nullable additions — existing invoice types
     * ('weekly', 'weekly_supplier') and the cron jobs that create them are
     * completely unaffected.
     */
    public function up(): void
    {
        Schema::table('invoices', function (Blueprint $table) {
            if (!Schema::hasColumn('invoices', 'supplier_id')) {
                $table->foreignId('supplier_id')->nullable()->after('client_id')
                    ->constrained('suppliers')->nullOnDelete();
            }
            if (!Schema::hasColumn('invoices', 'payment_method_id')) {
                $table->foreignId('payment_method_id')->nullable()->after('status')
                    ->constrained('payment_methods')->nullOnDelete();
            }
            if (!Schema::hasColumn('invoices', 'rate')) {
                $table->decimal('rate', 10, 6)->nullable()->after('total_amount');
            }
            if (!Schema::hasColumn('invoices', 'paid_at')) {
                $table->timestamp('paid_at')->nullable()->after('payment_method_id');
            }
            if (!Schema::hasColumn('invoices', 'reference')) {
                $table->string('reference')->nullable()->after('paid_at');
            }
        });
    }

    public function down(): void
    {
        Schema::table('invoices', function (Blueprint $table) {
            foreach (['reference', 'paid_at', 'rate'] as $col) {
                if (Schema::hasColumn('invoices', $col)) $table->dropColumn($col);
            }
            if (Schema::hasColumn('invoices', 'payment_method_id')) $table->dropConstrainedForeignId('payment_method_id');
            if (Schema::hasColumn('invoices', 'supplier_id')) $table->dropConstrainedForeignId('supplier_id');
        });
    }
};
