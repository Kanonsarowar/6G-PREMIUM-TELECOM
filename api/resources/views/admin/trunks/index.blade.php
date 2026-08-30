@extends("layouts.admin")
@section("title","Trunks")
@section("content")
<a href="{{ route('trunks.create') }}">Add New Trunk</a>
<br><br>

<h1>Trunks List</h1>

<table border="1" cellpadding="10">
    <tr>
        <th>ID</th>
        <th>Name</th>
        <th>IP</th>
        <th>Prefix</th>
        <th>Status</th>
        <th>Actions</th>
    </tr>

    @foreach($trunks as $trunk)
    <tr>
        <td>{{ $trunk->id }}</td>
        <td>{{ $trunk->name }}</td>
        <td>{{ $trunk->ip }}</td>
        <td>{{ $trunk->prefix }}</td>
        <td>{{ $trunk->status }}</td>
        <td>
            <a href="{{ route('trunks.edit', $trunk->id) }}">Edit</a> |
            <form action="{{ route('trunks.destroy', $trunk->id) }}" method="POST" style="display:inline;">
                @csrf
                @method('DELETE')
                <button type="submit" onclick="return confirm('Delete this trunk?')">Delete</button>
            </form>
        </td>
    </tr>
    @endforeach
</table>
@endsection
