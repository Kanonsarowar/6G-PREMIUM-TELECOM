<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * New trunks should land in the generated, static from-suppliers routing
 * (from-suppliers -> number-routing -> IVR) rather than the legacy hand-written
 * from-carrier. This only changes the column DEFAULT used by future INSERTs:
 * every existing trunk row keeps its current dialplan_context, so no working
 * supplier (and not Purple) changes context. Metadata-only, fully reversible.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement("ALTER TABLE trunks ALTER COLUMN dialplan_context SET DEFAULT 'from-suppliers'");
    }

    public function down(): void
    {
        DB::statement("ALTER TABLE trunks ALTER COLUMN dialplan_context SET DEFAULT 'from-carrier'");
    }
};
