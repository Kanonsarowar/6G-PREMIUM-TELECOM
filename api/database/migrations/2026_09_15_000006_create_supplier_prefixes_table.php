<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * The Prefix is the master inventory record under each Supplier:
     * Numbers/Ranges and Test Numbers both belong to a Prefix, and the
     * Prefix carries the manually-configured USDT rate + payment term
     * that supplier payments are calculated from. This is intentionally
     * separate from route_prefixes, which is an unrelated Asterisk
     * dialplan-routing concept.
     */
    public function up(): void
    {
        Schema::create('supplier_prefixes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('supplier_id')->constrained('suppliers')->cascadeOnDelete();
            $table->string('prefix');
            $table->string('country')->nullable();
            $table->decimal('price', 10, 6); // USDT/min - platform is USDT-only, no currency column
            $table->string('payment_term')->nullable(); // Net 0/7/15/30/45/60/Custom
            $table->string('test_number')->nullable();
            $table->string('operator')->nullable();
            $table->string('status')->default('active');
            $table->timestamps();
            $table->unique(['supplier_id', 'prefix']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('supplier_prefixes');
    }
};
