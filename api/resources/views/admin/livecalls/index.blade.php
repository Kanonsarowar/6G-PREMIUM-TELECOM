@extends("layouts.admin")
@section("title","Live Calls")
@section("content")
<h1>Live Calls Monitor</h1>

<p>Auto-refreshing every 5 seconds...</p>

<script>
    setTimeout(function() {
        window.location.reload();
    }, 5000);
</script>

<table border="1" cellpadding="10">
    <tr>
        <th>ID</th>
        <th>Caller</th>
        <th>Callee</th>
        <th>Duration</th>
        <th>Status</th>
        <th>Start Time</th>
    </tr>

    @foreach($calls as $call)
    <tr>
        <td>{{ $call->id }}</td>
        <td>{{ $call->caller }}</td>
        <td>{{ $call->callee }}</td>
        <td>{{ $call->duration }}</td>
        <td>{{ $call->status }}</td>
        <td>{{ $call->start_time }}</td>
    </tr>
    @endforeach
</table>
@endsection
