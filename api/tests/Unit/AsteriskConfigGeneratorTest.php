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

    // ── Routing-architecture fix: per-trunk context, protected Purple, limits, IVR blocking ──

    private const LIVE_PURPLE = <<<'TXT'
; === BEGIN MANAGED TRUNKS - generated, do not edit ===

; ── Purple ──
[PURPLE]
type=endpoint
context=from-carrier-purple
disallow=all
allow=alaw
allow=ulaw
trust_id_inbound=yes
aors=PURPLE-aor

[PURPLE-aor]
type=aor
max_contacts=100
contact=sip:185.209.147.14:5060
contact=sip:185.209.147.6:5060

[PURPLE-identify]
type=identify
endpoint=PURPLE
match=185.209.147.14
match=185.209.147.6

; === END MANAGED TRUNKS ===
TXT;

    private function trunk(array $o): object
    {
        return (object) array_merge(['id' => 1, 'nickname' => 'X', 'name' => 'x', 'host' => '9.9.9.9', 'port' => 5060, 'codecs' => 'ulaw,alaw',
            'is_active' => 1, 'pjsip_name' => 'X', 'auth_type' => 'ip', 'qualify' => 60, 'dialplan_context' => 'from-suppliers',
            'max_channels' => 30, 'max_call_duration' => 1800], $o);
    }

    public function test_each_endpoint_gets_its_own_explicit_context_from_dialplan_context(): void
    {
        $r = $this->generator()->pjsipManagedBlock([
            $this->trunk(['id' => 1, 'pjsip_name' => 'NEWSUP', 'dialplan_context' => 'from-suppliers']),
            $this->trunk(['id' => 2, 'pjsip_name' => 'OLDSUP', 'host' => '8.8.8.8', 'dialplan_context' => 'from-carrier']),
        ], 'from-suppliers', 'ulaw,alaw');

        $sections = $this->generator()->parseSections($r['text']);
        $this->assertContains('context=from-suppliers', $sections['NEWSUP']);
        $this->assertContains('context=from-carrier', $sections['OLDSUP']);
        // limits are only baked in for endpoints that use the generated context
        $this->assertSame(['NEWSUP' => [30, 1800]], $r['limits']);
        $this->assertEmpty($r['errors']);
    }

    public function test_purple_is_preserved_verbatim_and_never_regenerated_from_db(): void
    {
        // DB row says from-carrier with different codecs/IPs: must be ignored.
        $purple = $this->trunk(['id' => 5, 'pjsip_name' => 'PURPLE', 'nickname' => 'PURNUM', 'host' => '1.1.1.1', 'codecs' => 'g711a,ulaw', 'dialplan_context' => 'from-carrier']);
        $r = $this->generator()->pjsipManagedBlock([$purple], 'from-suppliers', 'ulaw,alaw', self::LIVE_PURPLE);

        $live = $this->generator()->parseSections(self::LIVE_PURPLE);
        $gen = $this->generator()->parseSections($r['text']);
        foreach (['PURPLE', 'PURPLE-aor', 'PURPLE-identify'] as $sec) {
            $this->assertSame($live[$sec], $gen[$sec], "{$sec} must be byte-identical to live");
        }
        $this->assertStringNotContainsString('1.1.1.1', $r['text']);
        $this->assertEmpty($r['errors']);
        $this->assertSame('PROTECTED', $r['endpoints'][0]['status']);
        $this->assertSame('from-carrier-purple', $r['endpoints'][0]['context']);
        $this->assertNotEmpty(array_filter($r['warnings'], fn ($w) => str_contains($w, 'DB value is ignored')));
    }

    public function test_purple_missing_from_live_blocks_apply_with_protected_message(): void
    {
        $r = $this->generator()->pjsipManagedBlock([$this->trunk(['pjsip_name' => 'PURPLE'])], 'from-suppliers', 'ulaw,alaw', '');

        $this->assertCount(1, $r['errors']);
        $this->assertStringContainsString('Purple protected route detected. Manual migration required. No automatic change applied.', $r['errors'][0]);
    }

    public function test_purple_on_wrong_live_context_blocks_apply(): void
    {
        $live = str_replace('context=from-carrier-purple', 'context=from-carrier', self::LIVE_PURPLE);
        $r = $this->generator()->pjsipManagedBlock([$this->trunk(['pjsip_name' => 'PURPLE'])], 'from-suppliers', 'ulaw,alaw', $live);

        $this->assertNotEmpty($r['errors']);
    }

    public function test_deactivating_purple_in_db_does_not_remove_it_from_live(): void
    {
        $r = $this->generator()->pjsipManagedBlock([$this->trunk(['pjsip_name' => 'PURPLE', 'is_active' => 0])], 'from-suppliers', 'ulaw,alaw', self::LIVE_PURPLE);

        $this->assertStringContainsString('[PURPLE-identify]', $r['text']);
        $this->assertStringContainsString('match=185.209.147.14', $r['text']);
        $this->assertEmpty($r['errors']);
    }

    public function test_userpass_supplier_without_credentials_is_skipped_not_left_unauthenticated(): void
    {
        $r = $this->generator()->pjsipManagedBlock([$this->trunk(['pjsip_name' => 'UP', 'auth_type' => 'userpass', 'sip_username' => null, 'sip_password' => null])], 'from-suppliers');

        $this->assertEmpty($r['names']);
        $this->assertCount(1, $r['skipped']);
        $this->assertStringContainsString('invalid SIP authentication', implode(' ', $r['warnings']));
    }

    public function test_invalid_pjsip_name_and_unsupported_codec_are_reported(): void
    {
        $r = $this->generator()->pjsipManagedBlock([
            $this->trunk(['id' => 1, 'pjsip_name' => '_BAD']),
            $this->trunk(['id' => 2, 'pjsip_name' => 'OK', 'codecs' => 'g711a,ulaw']),
        ], 'from-suppliers');

        $this->assertNotEmpty($r['errors']);
        $this->assertSame(['OK'], $r['names']);
        $this->assertStringContainsString('g711a', implode(' ', $r['warnings']));
    }

    public function test_route_to_missing_or_inactive_ivr_is_a_blocking_error_and_is_not_emitted(): void
    {
        $prefixes = [
            (object) ['id' => 1, 'prefix' => '88233770', 'ivr_context' => 'custom/main-ivr', 'priority' => 1, 'is_active' => 1],
            (object) ['id' => 2, 'prefix' => '39319', 'ivr_context' => 'custom/off', 'priority' => 2, 'is_active' => 1],
            (object) ['id' => 3, 'prefix' => '9779', 'ivr_context' => 'custom/music', 'priority' => 3, 'is_active' => 1],
        ];
        $ivrs = [
            (object) ['name' => 'music', 'is_active' => 1],
            (object) ['name' => 'off', 'is_active' => 0],
        ];

        $r = $this->generator()->dialplanManagedBlock($prefixes, $ivrs, 'from-suppliers');

        $this->assertCount(2, $r['errors']);
        $this->assertStringContainsString('missing IVR', $r['errors'][0]);
        $this->assertStringNotContainsString('main-ivr', $r['text']);
        $this->assertStringNotContainsString('_39319.', $r['text']);
        $this->assertStringContainsString('exten => _9779.,1,', $r['text']);
        $this->assertStringNotContainsString('[custom/off]', $r['text']);
    }

    public function test_inbound_context_rejects_dids_flagged_in_the_blocked_dids_astdb_family(): void
    {
        $r = $this->generator()->dialplanManagedBlock([], [], 'from-suppliers');

        $this->assertStringContainsString('GotoIf($[${DB_EXISTS(blocked_dids/${EXTEN})}]?blocked)', $r['text']);
        $this->assertStringContainsString("(blocked),NoOp(DISABLED DID \${EXTEN})\n same => n,Hangup(21)", $r['text']);
        // the check happens before any channel accounting, so a blocked call never takes a supplier slot
        $this->assertLessThan(strpos($r['text'], 'GROUP_COUNT'), strpos($r['text'], 'blocked_dids'));
    }

    public function test_overlapping_prefixes_are_emitted_most_specific_first_with_a_warning(): void
    {
        $prefixes = [
            (object) ['id' => 1, 'prefix' => '393', 'ivr_context' => 'custom/a', 'priority' => 1, 'is_active' => 1],
            (object) ['id' => 2, 'prefix' => '39319', 'ivr_context' => 'custom/b', 'priority' => 2, 'is_active' => 1],
        ];
        $ivrs = [(object) ['name' => 'a', 'is_active' => 1], (object) ['name' => 'b', 'is_active' => 1]];

        $r = $this->generator()->dialplanManagedBlock($prefixes, $ivrs, 'from-suppliers');

        $this->assertLessThan(strpos($r['text'], '_393.,1'), strpos($r['text'], '_39319.,1'));
        $this->assertNotEmpty($r['warnings']);
        $this->assertEmpty($r['errors']);
    }

    public function test_generated_call_path_is_static_with_limits_unknown_hangup_and_cdr(): void
    {
        $prefixes = [(object) ['id' => 1, 'prefix' => '39319', 'ivr_context' => 'custom/it', 'priority' => 1, 'is_active' => 1]];
        $ivrs = [(object) ['name' => 'it', 'is_active' => 1]];

        $r = $this->generator()->dialplanManagedBlock($prefixes, $ivrs, 'from-suppliers', ['NEWSUP' => [30, 1800]]);
        $t = $r['text'];

        $this->assertStringContainsString('[from-suppliers]', $t);
        $this->assertStringContainsString('Goto(number-routing,${EXTEN},1)', $t);
        $this->assertStringContainsString('exten => NEWSUP,1,Set(SUP_MAXCH=30)', $t);
        $this->assertStringContainsString('Set(SUP_MAXDUR=1800)', $t);
        $this->assertStringContainsString('Set(TIMEOUT(absolute)=${SUP_MAXDUR})', $t);
        $this->assertStringContainsString('exten => _39319.,1,', $t);
        $this->assertStringContainsString('Set(IVR_CONTEXT=custom/it)', $t);
        $this->assertStringContainsString("exten => _X.,1,NoOp(UNKNOWN DID \${EXTEN})\n same => n,Hangup()", $t);
        $this->assertStringContainsString('AGI(save_cdr.php,${CDR(src)},${DID_NUMBER},', $t);
        // live call path must stay static: no DB/HTTP/AGI-lookup in setup
        $this->assertStringNotContainsString('did_router', $t);
        $this->assertStringNotContainsString('CURL(', $t);
        $this->assertStringNotContainsString('ODBC', $t);
    }

    public function test_generated_contexts_may_not_reuse_hand_written_context_names(): void
    {
        foreach (['from-carrier', 'from-carrier-purple'] as $bad) {
            $r = $this->generator()->dialplanManagedBlock([], [], $bad);
            $this->assertNotEmpty($r['errors'], "{$bad} must be rejected");
        }
    }

    public function test_default_ivr_route_picks_from_the_pool_per_call_and_is_not_a_missing_ivr_error(): void
    {
        $prefixes = [
            (object) ['id' => 1, 'prefix' => '9779', 'country_name' => 'Nepal', 'ivr_context' => 'custom/6g-premium-telecom', 'priority' => 1, 'is_active' => 1],
            (object) ['id' => 2, 'prefix' => '39319', 'country_name' => 'Italy', 'ivr_context' => 'custom/music', 'priority' => 2, 'is_active' => 1],
        ];
        $ivrs = [(object) ['name' => 'music', 'title' => 'Music', 'audio_file' => 'music.mp3', 'is_active' => 1]];

        $r = $this->generator()->dialplanManagedBlock($prefixes, $ivrs, 'from-suppliers');

        $this->assertSame([], $r['errors']);
        // random pick happens in the dialplan on every call, from the AstDB pool
        $this->assertStringContainsString('${DB(ivr_pool/${RAND(1,${POOL_N})})}', $r['text']);
        $this->assertStringContainsString('DB_EXISTS(ivr_pool/count)', $r['text']);
        // falls back to the default IVR, and the chosen IVR is what IVR_CONTEXT (=> CDR) holds
        $this->assertStringContainsString('Set(IVR_CONTEXT=custom/6g-premium-telecom)', $r['text']);
        $this->assertStringContainsString('ExecIf($[${DIALPLAN_EXISTS(${POOL_PICK},s,1)}]?Set(IVR_CONTEXT=${POOL_PICK}))', $r['text']);
        $this->assertStringNotContainsString('Goto(custom/6g-premium-telecom,s,1)', $r['text']);
        // a fixed-IVR route is untouched
        $this->assertStringContainsString('Goto(custom/music,s,1)', $r['text']);
    }
}
