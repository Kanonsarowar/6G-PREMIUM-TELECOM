<?php

namespace App\Http\Controllers;

class SystemHealthController extends Controller
{
    public function index()
    {
        // CPU Load
        $cpu = sys_getloadavg()[0];

        // Memory
        $memory_total = round(memory_get_usage(true) / 1024 / 1024, 2);
        $memory_used = round(memory_get_usage() / 1024 / 1024, 2);

        // Disk
        $disk_total = round(disk_total_space("/") / 1024 / 1024 / 1024, 2);
        $disk_used = round(($disk_total - (disk_free_space("/") / 1024 / 1024 / 1024)), 2);

        // Versions
        $php_version = phpversion();
        $laravel_version = app()->version();

        // Uptime
        $uptime = @shell_exec("uptime -p");

        return view('admin.systemhealth.index', compact(
            'cpu', 'memory_total', 'memory_used',
            'disk_total', 'disk_used',
            'php_version', 'laravel_version', 'uptime'
        ));
    }
}
