<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Links trunks/dids/did_ranges to the new suppliers table. All columns
     * are nullable and SET NULL on delete — trunk/DID technical management
     * is untouched, this only adds an optional reference to the business
     * supplier that owns them. dids.is_test separates test numbers from
     * production numbers so they can never be conflated.
     */
    public function up(): void
    {
        Schema::table('trunks', function (Blueprint $table) {
            if (!Schema::hasColumn('trunks', 'supplier_id')) {
                $table->foreignId('supplier_id')->nullable()->after('id')
                    ->constrained('suppliers')->nullOnDelete();
            }
        });

        Schema::table('dids', function (Blueprint $table) {
            if (!Schema::hasColumn('dids', 'supplier_id')) {
                $table->foreignId('supplier_id')->nullable()->after('trunk_id')
                    ->constrained('suppliers')->nullOnDelete();
            }
            if (!Schema::hasColumn('dids', 'is_test')) {
                $table->boolean('is_test')->default(false)->after('supplier_id');
            }
        });

        Schema::table('did_ranges', function (Blueprint $table) {
            if (!Schema::hasColumn('did_ranges', 'supplier_id')) {
                $table->foreignId('supplier_id')->nullable()->after('trunk_id')
                    ->constrained('suppliers')->nullOnDelete();
            }
        });
    }

    public function down(): void
    {
        Schema::table('did_ranges', function (Blueprint $table) {
            if (Schema::hasColumn('did_ranges', 'supplier_id')) {
                $table->dropConstrainedForeignId('supplier_id');
            }
        });
        Schema::table('dids', function (Blueprint $table) {
            if (Schema::hasColumn('dids', 'is_test')) {
                $table->dropColumn('is_test');
            }
            if (Schema::hasColumn('dids', 'supplier_id')) {
                $table->dropConstrainedForeignId('supplier_id');
            }
        });
        Schema::table('trunks', function (Blueprint $table) {
            if (Schema::hasColumn('trunks', 'supplier_id')) {
                $table->dropConstrainedForeignId('supplier_id');
            }
        });
    }
};
