<?php

namespace App\Services;

class SipInviteParser
{
    public static function parse($raw)
    {
        preg_match('/m=audio \\d+ RTP\\/AVP (\\d+)/', $raw, $codec);
        return [
            'codec' => $codec[1] ?? 'Unknown',
            'raw' => $raw
        ];
    }
}
