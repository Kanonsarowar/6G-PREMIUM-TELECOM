<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Singleton settings row for the Asterisk Configuration module
     * (General / RTP tabs). Detected values (version, live status) are
     * never stored here — only admin-editable overrides/defaults.
     */
    public function up(): void
    {
        if (Schema::hasTable('asterisk_settings')) {
            return;
        }

        Schema::create('asterisk_settings', function (Blueprint $table) {
            $table->id();
            $table->unsignedInteger('sip_port')->default(5060);
            $table->unsignedInteger('rtp_start')->default(10000);
            $table->unsignedInteger('rtp_end')->default(20000);
            $table->string('codecs')->default('ulaw,alaw');
            $table->string('inbound_context')->default('from-suppliers');
            $table->string('public_ip_override')->nullable();
            $table->string('updated_by')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('asterisk_settings');
    }
};
