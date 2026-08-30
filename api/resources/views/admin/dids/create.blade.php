@extends("layouts.admin")
@section("title","Add DID")
@section("content")
<h1>Add New DID Route</h1>

<form method="POST" action="{{ route('dids.store') }}">
    @csrf

    <label>DID Number:</label>
    <input type="text" name="did_number" required><br><br>

    <label>Destination:</label>
    <input type="text" name="destination" required><br><br>

    <label>Status:</label>
    <select name="status">
        <option value="active">Active</option>
        <option value="inactive">Inactive</option>
    </select><br><br>

    <button type="submit">Save</button>
</form>
@endsection
