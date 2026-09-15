<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Numbers/ranges (dids/did_ranges - reused, not duplicated) and test
     * numbers (dids rows with is_test=1) now belong to a supplier_prefixes
     * record. CASCADE here is intentional and scoped to live inventory
     * only: deleting a Prefix removes its child numbers/ranges/test
     * numbers, but cdrs and invoices (payment history) have no FK to
     * supplier_prefixes at all, so historical financial/telecom records
     * can never be touched by a prefix deletion.
     */
    public function up(): void
    {
        Schema::table('dids', function (Blueprint $table) {
            if (!Schema::hasColumn('dids', 'prefix_id')) {
                $table->foreignId('prefix_id')->nullable()->after('supplier_id')
                    ->constrained('supplier_prefixes')->cascadeOnDelete();
            }
        });
        Schema::table('did_ranges', function (Blueprint $table) {
            if (!Schema::hasColumn('did_ranges', 'prefix_id')) {
                $table->foreignId('prefix_id')->nullable()->after('supplier_id')
                    ->constrained('supplier_prefixes')->cascadeOnDelete();
            }
        });
    }

    public function down(): void
    {
        Schema::table('did_ranges', function (Blueprint $table) {
            if (Schema::hasColumn('did_ranges', 'prefix_id')) $table->dropConstrainedForeignId('prefix_id');
        });
        Schema::table('dids', function (Blueprint $table) {
            if (Schema::hasColumn('dids', 'prefix_id')) $table->dropConstrainedForeignId('prefix_id');
        });
    }
};
