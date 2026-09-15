<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('supplier_cdrs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('supplier_id')->constrained('suppliers')->cascadeOnDelete();
            $table->string('cli')->nullable();
            $table->string('prn')->nullable();
            $table->string('operator')->nullable();
            $table->string('country')->nullable();
            $table->integer('billsec')->default(0);
            $table->dateTime('call_date')->nullable();
            $table->decimal('payout', 12, 6)->default(0);
            $table->decimal('payout_per_min', 12, 6)->default(0);
            $table->string('currency_code', 5)->default('EUR');
            $table->string('account')->nullable();
            $table->string('sub_account')->nullable();
            $table->timestamps();
            $table->unique(['supplier_id', 'cli', 'prn', 'call_date'], 'supplier_cdrs_dedup');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('supplier_cdrs');
    }
};
