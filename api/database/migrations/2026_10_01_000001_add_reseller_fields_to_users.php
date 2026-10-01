<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Resellers are users with role 'reseller' (they log in like everyone
     * else). Their DIDs are dids.customer_id = users.id, and every balance
     * change is kept in reseller_transactions so the portal can show history.
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->decimal('balance', 14, 4)->default(0)->after('reseller_id');
            $table->decimal('credit_limit', 14, 4)->default(0)->after('balance');
            $table->decimal('markup', 8, 4)->default(0)->after('credit_limit');
            $table->text('notes')->nullable()->after('markup');
        });

        Schema::create('reseller_transactions', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('user_id')->index();
            $table->decimal('amount', 14, 4);
            $table->decimal('balance_after', 14, 4);
            $table->string('type', 20); // topup | deduct | adjust
            $table->string('note', 255)->nullable();
            $table->string('created_by', 255)->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('reseller_transactions');
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['balance', 'credit_limit', 'markup', 'notes']);
        });
    }
};
