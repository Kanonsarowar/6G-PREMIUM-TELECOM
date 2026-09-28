<?php

// Caller CLI -> originating operator, used by Supplier Access History.
// Keys are the caller number's leading digits in international format
// (no '+'); the longest matching key wins. Based on each operator's
// allocated mobile codes - a ported number keeps its original code, so
// it will show the operator it was first issued by.
return [
    // Saudi Arabia (+966 5X)
    '96650'  => 'STC',
    '96653'  => 'STC',
    '96655'  => 'STC',
    '966573' => 'STC',
    '96654'  => 'MOBILY',
    '96656'  => 'MOBILY',
    '96658'  => 'ZAIN',
    '96659'  => 'ZAIN',
    '96651'  => 'SALAM',
    '966570' => 'VIRGIN',
    '966571' => 'VIRGIN',
    '966572' => 'VIRGIN',
    '966574' => 'RED BULL',
    '966575' => 'RED BULL',
    '966576' => 'LEBARA',
    '966577' => 'LEBARA',
    '966578' => 'LEBARA',
    '966579' => 'LEBARA',
];
