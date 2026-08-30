<h1>IPRN Dashboard</h1>

<p>Total Customers: {{ $total_customers }}</p>
<p>Total Trunks: {{ $total_trunks }}</p>
<p>Total DIDs: {{ $total_dids }}</p>
<p>Active Calls: {{ $active_calls }}</p>
<p>Today's Calls: {{ $today_calls }}</p>
<p>Today's Minutes: {{ $today_minutes }}</p>
<li>
    <a href="/admin/ivr">IVR Module</a>
</li>
<p>System Load: {{ $system_load }}</p>
<p>Disk Free: {{ number_format($disk_free, 2) }} GB</p>
<p>Disk Total: {{ number_format($disk_total, 2) }} GB</p>
