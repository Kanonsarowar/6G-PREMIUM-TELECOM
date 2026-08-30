@extends("layouts.admin")
@section("title","Add Trunk")
@section("content")
<h1>Add New Trunk</h1>

<form method="POST" action="{{ route('trunks.store') }}">
    @csrf

    <label>Name:</label>
    <input type="text" name="name" required><br><br>

    <label>IP:</label>
    <input type="text" name="ip"><br><br>

    <label>Prefix:</label>
    <input type="text" name="prefix"><br><br>

    <label>Status:</label>
    <select name="status">
        <option value="active">Active</option>
        <option value="inactive">Inactive</option>
    </select><br><br>

    <button type="submit">Save</button>
</form>
@endsection
