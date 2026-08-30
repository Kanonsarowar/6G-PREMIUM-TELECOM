@extends("layouts.admin")
@section("title","Edit Trunk")
@section("content")
<h1>Edit Trunk</h1>

<form method="POST" action="{{ route('trunks.update', $trunk->id) }}">
    @csrf
    @method('PUT')

    <label>Name:</label>
    <input type="text" name="name" value="{{ $trunk->name }}" required><br><br>

    <label>IP:</label>
    <input type="text" name="ip" value="{{ $trunk->ip }}"><br><br>

    <label>Prefix:</label>
    <input type="text" name="prefix" value="{{ $trunk->prefix }}"><br><br>

    <label>Status:</label>
    <select name="status">
        <option value="active" {{ $trunk->status == 'active' ? 'selected' : '' }}>Active</option>
        <option value="inactive" {{ $trunk->status == 'inactive' ? 'selected' : '' }}>Inactive</option>
    </select><br><br>

    <button type="submit">Update</button>
</form>
@endsection
