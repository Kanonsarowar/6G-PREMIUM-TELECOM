@extends("layouts.admin")
@section("title","SIP Invites")
@section("content")
<h1>SIP Invite Logs</h1>

<table border="1" cellpadding="10">
    <tr>
        <th>ID</th>
        <th>Caller</th>
        <th>Callee</th>
        <th>Method</th>
        <th>Status</th>
        <th>Timestamp</th>
    </tr>

    @foreach($invites as $invite)
    <tr>
        <td>{{ $invite->id }}</td>
        <td>{{ $invite->caller }}</td>
        <td>{{ $invite->callee }}</td>
        <td>{{ $invite->method }}</td>
        <td>{{ $invite->status }}</td>
        <td>{{ $invite->created_at }}</td>
    </tr>
    @endforeach
</table>
@endsection
