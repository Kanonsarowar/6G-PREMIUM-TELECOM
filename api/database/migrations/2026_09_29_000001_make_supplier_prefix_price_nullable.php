<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

// Prefixes auto-created from call data (supplier:auto-prefixes) have no
// known price yet; NULL means "price not set" and payable/stats code falls
// back or shows it as unpriced instead of silently treating it as 0.
return new class extends Migration
{
    public function up(): void
    {
        DB::statement('ALTER TABLE supplier_prefixes MODIFY price DECIMAL(10,6) NULL');
    }

    public function down(): void
    {
        DB::statement('UPDATE supplier_prefixes SET price = 0 WHERE price IS NULL');
        DB::statement('ALTER TABLE supplier_prefixes MODIFY price DECIMAL(10,6) NOT NULL');
    }
};
