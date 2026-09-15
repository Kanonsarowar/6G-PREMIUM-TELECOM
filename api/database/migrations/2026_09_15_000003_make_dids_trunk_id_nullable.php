<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Numbers can now be created under a supplier (supplier_id) before any
     * SIP trunk exists for it — trunk assignment is a separate, later step
     * owned by Asterisk Configuration -> Trunks. Raw SQL avoids requiring
     * doctrine/dbal just to relax one column's nullability; the existing
     * FK constraint is unaffected and still enforces referential integrity
     * for any non-null trunk_id.
     */
    public function up(): void
    {
        DB::statement('ALTER TABLE dids MODIFY trunk_id BIGINT UNSIGNED NULL');
    }

    public function down(): void
    {
        DB::statement('UPDATE dids SET trunk_id = (SELECT id FROM trunks LIMIT 1) WHERE trunk_id IS NULL');
        DB::statement('ALTER TABLE dids MODIFY trunk_id BIGINT UNSIGNED NOT NULL');
    }
};
