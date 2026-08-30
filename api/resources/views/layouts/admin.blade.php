<!DOCTYPE html>
<html>
<head>
    <title>Admin Panel</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">

    <style>
        body { background: #f5f5f5; }
        .sidebar {
            width: 220px;
            height: 100vh;
            background: #222;
            color: white;
            position: fixed;
            padding-top: 20px;
        }
        .sidebar a {
            color: #ddd;
            display: block;
            padding: 12px 20px;
            text-decoration: none;
        }
        .sidebar a:hover {
            background: #444;
        }
        .content {
            margin-left: 240px;
            padding: 25px;
        }
        .header {
            background: #fff;
            padding: 15px;
            margin-bottom: 20px;
            border-bottom: 1px solid #ddd;
        }
    </style>
</head>

<body>

<div class="sidebar">
    <h4 class="text-center">Admin Panel</h4>
    <a href="/admin/dashboard">Dashboard</a>
    <a href="/admin/customers">Customers</a>
    <a href="/admin/trunks">Trunks</a>
    <a href="/admin/dids">DID Routing</a>
    <a href="/admin/sip-invites">SIP Invites</a>
    <a href="/admin/live-calls">Live Calls</a>
    <a href="/admin/cdr">CDR Reports</a>
    <a href="/admin/system-health">System Health</a>
</div>

<div class="content">
    <div class="header">
        <h3>@yield('title')</h3>
    </div>

    @yield('content')
</div>

</body>
</html>
