@extends("layouts.admin")
@section("title","CDR Reports")
@section("content")
<h1>CDR Report</h1>

<form method="GET" action="{{ route('cdr.index') }}">
    <label>From:</label>
    <input type="date" name="from" value="{{ request('from') }}">

    <label>To:</label>
    <input type="date" name="to" value="{{ request('to') }}">

    <label>Caller:</label>
    <input type="text" name="caller" value="{{ request('caller') }}">

    <label>Callee:</label>
    <input type="text" name="callee" value="{{ request('callee') }}">

    <label>Status:</label>
    <select name="status">
        <option value="">All</option>
        <option value="ANSWERED" {{ request('status')=='ANSWERED'?'selected':'' }}>ANSWERED</option>
        <option value="NO ANSWER" {{ request('status')=='NO ANSWER'?'selected':'' }}>NO ANSWER</option>
        <option value="BUSY" {{ request('status')=='BUSY'?'selected':'' }}>BUSY</option>
        <option value="FAILED" {{ request('status')=='FAILED'?'selected':'' }}>FAILED</option>
    </select>

    <button type="submit">Filter</button>
</form>

<br>

<table border="1" cellpadding="10">
    <tr>
        <th>ID</th>
        <th>Caller</th>
        <th>Callee</th>
        <th>Duration</th>
        <th>Status</th>
        <th>Date</th>
        <th>Details</th>
    </tr>

    @foreach($cdrs as $cdr)
    <tr>
        <td>{{ $cdr->id }}</td>
        <td>{{ $cdr->caller }}</td>
        <td>{{ $cdr->callee }}</td>
        <td>{{ $cdr->duration }}</td>
        <td>{{ $cdr->status }}</td>
        <td>{{ $cdr->created_at }}</td>
        <td><a href="{{ route('cdr.show', $cdr->id) }}">View</a></td>
    </tr>
    @endforeach
</table>
@endsection
