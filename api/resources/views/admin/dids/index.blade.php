@extends("layouts.admin")
@section("title","DID Routing")
@section("content")
<a href="{{ route('dids.create') }}">Add New DID Route</a>
<br><br>

<h1>DID Routing List</h1>

<table border="1" cellpadding="10">
    <tr>
        <th>ID</th>
        <th>DID Number</th>
        <th>Destination</th>
        <th>Status</th>
        <th>Actions</th>
    </tr>

    @foreach($dids as $did)
    <tr>
        <td>{{ $did->id }}</td>
        <td>{{ $did->did_number }}</td>
        <td>{{ $did->destination }}</td>
        <td>{{ $did->status }}</td>
        <td>
            <a href="{{ route('dids.edit', $did->id) }}">Edit</a> |
            <form action="{{ route('dids.destroy', $did->id) }}" method="POST" style="display:inline;">
                @csrf
                @method('DELETE')
                <button type="submit" onclick="return confirm('Delete this DID route?')">Delete</button>
            </form>
        </td>
    </tr>
    @endforeach
</table>
@endsection
