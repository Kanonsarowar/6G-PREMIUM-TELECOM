<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    // Links a CDR to the supplier invoice (invoices.invoice_number) that billed it.
    // NULL = not yet on any invoice ("current revenue").
    public function up(): void
    {
        if (Schema::hasColumn('cdrs', 'invoice_ref')) {
            return;
        }
        Schema::table('cdrs', function (Blueprint $table) {
            $table->string('invoice_ref', 60)->nullable()->index();
        });
    }

    public function down(): void
    {
        Schema::table('cdrs', function (Blueprint $table) {
            $table->dropColumn('invoice_ref');
        });
    }
};
