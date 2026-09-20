<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The Numbers screen marks numbers that have received a call by looking each
 * DID up in cdrs. Index cdrs.did so that stays a key lookup as the CDR table grows.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('cdrs', function (Blueprint $table) {
            $table->index('did', 'cdrs_did_index');
        });
    }

    public function down(): void
    {
        Schema::table('cdrs', function (Blueprint $table) {
            $table->dropIndex('cdrs_did_index');
        });
    }
};
