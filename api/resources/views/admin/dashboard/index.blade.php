@extends("layouts.admin")
@section("title","Admin Dashboard (Real Time)")
@section("content")

<h2>System Overview (Real Time)</h2>

<div class="row">

    <div class="col-md-3">
        <div class="card p-3 text-center">
            <h4>Total Customers</h4>
            <h2 id="stat-customers">0</h2>
        </div>
    </div>

    <div class="col-md-3">
        <div class="card p-3 text-center">
            <h4>Total Trunks</h4>
            <h2 id="stat-trunks">0</h2>
        </div>
    </div>

    <div class="col-md-3">
        <div class="card p-3 text-center">
            <h4>Total DIDs</h4>
            <h2 id="stat-dids">0</h2>
        </div>
    </div>

    <div class="col-md-3">
        <div class="card p-3 text-center">
            <h4>Live Calls</h4>
            <h2 id="stat-livecalls">0</h2>
        </div>
    </div>

</div>

<br>

<div class="row">

    <div class="col-md-4">
        <div class="card p-3 text-center">
            <h5>CPU Load</h5>
            <h3 id="stat-cpu">0%</h3>
        </div>
    </div>

    <div class="col-md-4">
        <div class="card p-3 text-center">
            <h5>Memory Usage</h5>
            <h3 id="stat-memory">0 / 0 MB</h3>
        </div>
    </div>

    <div class="col-md-4">
        <div class="card p-3 text-center">
            <h5>Disk Usage</h5>
            <h3 id="stat-disk">0 / 0 GB</h3>
        </div>
    </div>

</div>

<br>

<h3>Call Traffic (Last 7 Days)</h3>
<canvas id="trafficChart" height="120"></canvas>

<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>

<script>
let trafficChart = null;

async function loadDashboardData() {
    try {
        const response = await fetch('/admin/dashboard/live');
        const data = await response.json();

        // Stats
        document.getElementById('stat-customers').innerText = data.customers;
        document.getElementById('stat-trunks').innerText = data.trunks;
        document.getElementById('stat-dids').innerText = data.dids;
        document.getElementById('stat-livecalls').innerText = data.livecalls;

        document.getElementById('stat-cpu').innerText = data.cpu + '%';
        document.getElementById('stat-memory').innerText = data.memory_used + ' / ' + data.memory_total + ' MB';
        document.getElementById('stat-disk').innerText = data.disk_used + ' / ' + data.disk_total + ' GB';

        // Chart
        const ctx = document.getElementById('trafficChart').getContext('2d');

        if (trafficChart) {
            trafficChart.data.labels = data.chart_labels;
            trafficChart.data.datasets[0].data = data.chart_data;
            trafficChart.update();
        } else {
            trafficChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: data.chart_labels,
                    datasets: [{
                        label: 'Calls Per Day',
                        data: data.chart_data,
                        borderColor: 'blue',
                        backgroundColor: 'rgba(0,0,255,0.2)',
                        borderWidth: 2,
                        tension: 0.3,
                        fill: true
                    }]
                }
            });
        }

    } catch (e) {
        console.error('Dashboard load error', e);
    }
}

// Initial load
loadDashboardData();

// Auto refresh every 5 seconds
setInterval(loadDashboardData, 5000);
</script>

@endsection
