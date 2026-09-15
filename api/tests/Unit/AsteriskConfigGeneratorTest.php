<?php

namespace Tests\Unit;

use App\Services\AsteriskConfigGenerator;
use PHPUnit\Framework\TestCase;

class AsteriskConfigGeneratorTest extends TestCase
{
    private function generator(): AsteriskConfigGenerator
    {
        return new AsteriskConfigGenerator();
    }

    public function test_pjsip_block_generates_one_endpoint_per_ip_supplier_via_shared_template(): void
    {
        $trunks = [
            (object) ['id' => 1, 'nickname' => 'WTP', 'name' => 'WTP', 'host' => '1.2.3.4,1.2.3.5', 'port' => 5060, 'codecs' => 'ulaw,alaw', 'is_active' => 1, 'pjsip_name' => 'WTP', 'auth_type' => 'ip', 'qualify' => 60],
            (object) ['id' => 2, 'nickname' => 'Mediatel', 'name' => 'Mediatel', 'host' => '5.6.7.8', 'port' => 5060, 'codecs' => 'ulaw,alaw', 'is_active' => 1, 'pjsip_name' => 'MEDIATEL', 'auth_type' => 'ip', 'qualify' => 60],
        ];

        $result = $this->generator()->pjsipManagedBlock($trunks, 'from-suppliers', 'ulaw,alaw');

        $this->assertStringContainsString('[supplier-template](!)', $result['text']);
        $this->assertStringContainsString('[WTP](supplier-template)', $result['text']);
        $this->assertStringContainsString('[MEDIATEL](supplier-template)', $result['text']);
        $this->assertStringContainsString('match=1.2.3.4', $result['text']);
        $this->assertStringContainsString('match=1.2.3.5', $result['text']);
        $this->assertSame(['WTP', 'MEDIATEL'], $result['names']);
        $this->assertSame(2, $result['identify_count']);
        $this->assertEmpty($result['skipped']);
    }

    public function test_pjsip_block_skips_supplier_with_no_valid_ip(): void
    {
        $trunks = [
            (object) ['id' => 1, 'nickname' => 'BadHost', 'name' => 'BadHost', 'host' => 'not-an-ip', 'port' => 5060, 'codecs' => 'ulaw', 'is_active' => 1, 'pjsip_name' => 'BADHOST', 'auth_type' => 'ip', 'qualify' => 60],
        ];

        $result = $this->generator()->pjsipManagedBlock($trunks, 'from-suppliers', 'ulaw,alaw');

        $this->assertEmpty($result['names']);
        $this->assertCount(1, $result['skipped']);
    }

    public function test_dialplan_generates_pattern_per_active_prefix_and_catch_all_hangup(): void
    {
        $prefixes = [
            (object) ['id' => 1, 'prefix' => '947579', 'country_code' => 'LK', 'country_name' => 'Sri Lanka', 'ivr_context' => 'custom/srilanka-ivr', 'priority' => 1, 'is_active' => 1],
            (object) ['id' => 2, 'prefix' => '88335095', 'country_code' => 'AF', 'country_name' => 'Afghanistan', 'ivr_context' => 'custom/afghanistan-ivr', 'priority' => 2, 'is_active' => 1],
            (object) ['id' => 3, 'prefix' => '99999', 'country_code' => 'ZZ', 'country_name' => 'Disabled', 'ivr_context' => 'custom/disabled-ivr', 'priority' => 3, 'is_active' => 0],
        ];
        $ivrs = [
            (object) ['name' => 'srilanka-ivr', 'title' => 'Sri Lanka IVR', 'audio_file' => 'sri-lanka-welcome.wav', 'is_active' => 1],
            (object) ['name' => 'afghanistan-ivr', 'title' => 'Afghanistan IVR', 'audio_file' => 'afghanistan-welcome.wav', 'is_active' => 1],
        ];

        $result = $this->generator()->dialplanManagedBlock($prefixes, $ivrs, 'from-suppliers');

        $this->assertStringContainsString('exten => _947579.,1,', $result['text']);
        $this->assertStringContainsString('Goto(custom/srilanka-ivr,s,1)', $result['text']);
        $this->assertStringContainsString('exten => _88335095.,1,', $result['text']);
        $this->assertStringNotContainsString('99999', $result['text']);
        $this->assertStringContainsString('exten => _X.,1,NoOp(UNKNOWN DID', $result['text']);
        $this->assertStringContainsString('[custom/srilanka-ivr]', $result['text']);
        $this->assertStringContainsString('Playback(custom/srilanka-ivr)', $result['text']);
        $this->assertCount(2, $result['routes']);
        $this->assertEmpty($result['errors']);
        $this->assertEmpty($result['warnings']);
    }

    public function test_validate_prefixes_flags_exact_duplicate_as_error_and_overlap_as_warning(): void
    {
        $prefixes = [
            (object) ['id' => 1, 'prefix' => '947579', 'priority' => 1, 'is_active' => 1],
            (object) ['id' => 2, 'prefix' => '947579', 'priority' => 2, 'is_active' => 1],
            (object) ['id' => 3, 'prefix' => '9475790123', 'priority' => 3, 'is_active' => 1],
        ];

        $result = $this->generator()->validatePrefixes($prefixes);

        $this->assertNotEmpty($result['errors']);
        $this->assertStringContainsString('Duplicate active prefix', $result['errors'][0]);
        $this->assertNotEmpty($result['warnings']);
    }

    public function test_validate_rtp_rejects_bad_ranges(): void
    {
        $g = $this->generator();

        $this->assertEmpty($g->validateRtp(10000, 20000));
        $this->assertNotEmpty($g->validateRtp(20000, 10000));
        $this->assertNotEmpty($g->validateRtp(0, 20000));
        $this->assertNotEmpty($g->validateRtp(10000, 70000));
    }
}
