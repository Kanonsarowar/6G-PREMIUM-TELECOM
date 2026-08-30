<?php

namespace App\Http\Controllers;

use Inertia\Inertia;
use Illuminate\Http\Request;
use App\Models\Cdr;
use App\Models\LiveCall;

class CustomerDashboardController extends Controller
{
    public function __invoke(Request $request)
    {
        $user = $request->user();

        $stats = [
            'total_cdrs'  => Cdr::where('customer_id', $user->customer_id)->count(),
            'live_calls'  => LiveCall::where('customer_id', $user->customer_id)->count(),
            'today_calls' => Cdr::where('customer_id', $user->customer_id)
                                ->whereDate('start_time', today())
                                ->count(),
        ];

        return Inertia::render('Customer/Dashboard', [
            'stats' => $stats,
        ]);
    }
}
