<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

class AdminDashboardController extends Controller
{
    public function index()
    {
        // View only, data comes via AJAX from live()
        return view('admin.dashboard.index');
    }

    public function live(): JsonResponse
    {
        // ---- ASTERISK DB CONNECTION ----
        $ast = DB::connection('asterisk');

        // ---- LIVE CALLS (channels table) ----
        // Adjust table/columns if your schema differs
        $livecalls = $ast->table('channels')
            ->where('state', '!=', 'Down')
            ->count();

        // ---- BASIC STATS FROM CDR ----
        // Assuming standard asterisk cdr table: cdr
        $today = now()->format('Y-m-d');

        $totalCallsToday = $ast->table('cdr')
            ->whereDate('calldate', $today)
            ->count();

        $answeredToday = $ast->table('cdr')
            ->whereDate('calldate', $today)
            ->where('disposition', 'ANSWERED')
            ->count();

        $failedToday = $ast->table('cdr')
            ->whereDate('calldate', $today)
            ->whereIn('disposition', ['BUSY', 'FAILED', 'NO ANSWER'])
            ->count();

        // You can map these to "customers/trunks/dids" cards if you want,
        // but for now we keep the same keys the frontend expects:
        $customers = $totalCallsToday; // repurposed
        $trunks    = $answeredToday;   // repurposed
        $dids      = $failedToday;     // repurposed

        // ---- SYSTEM HEALTH (SERVER) ----
        $cpu = sys_getloadavg()[0];
        $memory_total = round(memory_get_usage(true) / 1024 / 1024, 2);
        $memory_used = round(memory_get_usage() / 1024 / 1024, 2);
        $disk_total = round(disk_total_space("/") / 1024 / 1024 / 1024, 2);
        $disk_used = round(($disk_total - (disk_free_space("/") / 1024 / 1024 / 1024)), 2);

        // ---- CHART DATA (LAST 7 DAYS FROM CDR) ----
        $chart_labels = [];
        $chart_data = [];

        for ($i = 6; $i >= 0; $i--) {
            $date = now()->subDays($i)->format('Y-m-d');
            $chart_labels[] = $date;

            $count = $ast->table('cdr')
                ->whereDate('calldate', $date)
                ->count();

            $chart_data[] = $count;
        }

        return response()->json([
            'customers'     => $customers,
            'trunks'        => $trunks,
            'dids'          => $dids,
            'livecalls'     => $livecalls,
            'cpu'           => $cpu,
            'memory_total'  => $memory_total,
            'memory_used'   => $memory_used,
            'disk_total'    => $disk_total,
            'disk_used'     => $disk_used,
            'chart_labels'  => $chart_labels,
            'chart_data'    => $chart_data,
        ]);
    }
}
