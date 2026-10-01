<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * When a DID was given to its current reseller (dids.customer_id), so the
     * reseller portal only shows calls - and earnings - from that moment on,
     * not the number's earlier traffic.
     */
    public function up(): void
    {
        Schema::table('dids', function (Blueprint $table) {
            $table->timestamp('customer_assigned_at')->nullable()->after('customer_id');
        });
    }

    public function down(): void
    {
        Schema::table('dids', function (Blueprint $table) {
            $table->dropColumn('customer_assigned_at');
        });
    }
};
