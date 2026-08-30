<?php

namespace App\Services;

class PddCalculator
{
    public static function calculate($inviteTime, $ringTime)
    {
        if (!$inviteTime || !$ringTime) return 0;
        return round(strtotime($ringTime) - strtotime($inviteTime), 2);
    }
}
