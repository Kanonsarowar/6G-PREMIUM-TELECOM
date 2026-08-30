@extends("layouts.admin")
@section("title","System Health")
@section("content")
<h1>System Health Dashboard</h1>

<table border="1" cellpadding="10">
    <tr>
        <th>Metric</th>
        <th>Value</th>
    </tr>

    <tr>
        <td>CPU Load</td>
        <td>{{ $cpu }}%</td>
    </tr>

    <tr>
        <td>Memory Usage</td>
        <td>{{ $memory_used }} MB / {{ $memory_total }} MB</td>
    </tr>

    <tr>
        <td>Disk Usage</td>
        <td>{{ $disk_used }} GB / {{ $disk_total }} GB</td>
    </tr>

    <tr>
        <td>PHP Version</td>
        <td>{{ $php_version }}</td>
    </tr>

    <tr>
        <td>Laravel Version</td>
        <td>{{ $laravel_version }}</td>
    </tr>

    <tr>
        <td>Server Uptime</td>
        <td>{{ $uptime }}</td>
    </tr>
</table>
@endsection
