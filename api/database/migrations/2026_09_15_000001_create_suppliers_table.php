<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Suppliers is the business entity (name, contact, commercial terms,
     * optional external API). It is intentionally separate from `trunks`,
     * which remains the technical SIP/PJSIP entity. Trunks reference a
     * supplier via trunks.supplier_id, never the other way around.
     */
    public function up(): void
    {
        Schema::create('suppliers', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('code')->nullable()->unique();
            $table->string('country')->nullable();
            $table->string('contact_name')->nullable();
            $table->string('email')->nullable();
            $table->string('phone')->nullable();
            $table->string('status')->default('active');
            $table->text('notes')->nullable();

            // Payment / commercial terms
            $table->decimal('tariff', 10, 6)->nullable();
            $table->string('currency', 5)->default('EUR');
            $table->string('payment_terms')->nullable();
            $table->string('settlement_period')->nullable();
            $table->string('payment_status')->nullable();

            // Optional external API (CDR/number interrogation, balance, sync)
            $table->boolean('api_enabled')->default(false);
            $table->string('api_type')->nullable();
            $table->string('api_endpoint')->nullable();
            $table->string('api_auth_method')->nullable();
            $table->text('api_secret')->nullable();
            $table->timestamp('api_last_sync')->nullable();
            $table->string('api_last_status')->nullable();

            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('suppliers');
    }
};
