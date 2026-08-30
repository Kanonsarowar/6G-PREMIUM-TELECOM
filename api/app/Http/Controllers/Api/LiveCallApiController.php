<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\LiveCall;
use App\Models\SipInvite;
use App\Models\AmiEvent;

class LiveCallApiController extends Controller
{
    // GET /api/live-calls
    public function index()
    {
        return LiveCall::select(
            'uniqueid',
            'caller',
            'callee',
            'trunk',
            'status',
            'duration'
        )->get();
    }

    // GET /api/live-calls/{uniqueid}
    public function show($id)
    {
        $call = LiveCall::where('uniqueid', $id)->first();
        if (!$call) return response()->json(['error' => 'Not found'], 404);

        $invite = SipInvite::where('uniqueid', $id)->first();
        $events = AmiEvent::where('uniqueid', $id)->orderBy('id')->pluck('event');

        return [
            'caller' => $call->caller,
            'callee' => $call->callee,
            'trunk' => $call->trunk,
            'codec' => $invite->codec ?? 'Unknown',
            'pdd' => $invite->pdd ?? 0,
            'duration' => $call->duration,
            'sip_invite' => $invite->raw ?? '',
            'events' => $events
        ];
    }
}
