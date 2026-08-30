@extends("layouts.admin")
@section("title","Edit DID")
@section("content")
<h1>Edit DID Route</h1>

<form method="POST" action="{{ route('dids.update', $did->id) }}">
    @csrf
    @method('PUT')

    <label>DID Number:</label>
    <input type="text" name="did_number" value="{{ $did->did_number }}" required><br><br>

    <label>Destination:</label>
    <input type="text" name="destination" value="{{ $did->destination }}" required><br><br>

    <label>Status:</label>
    <select name="status">
        <option value="active" {{ $did->status == 'active' ? 'selected' : '' }}>Active</option>
        <option value="inactive" {{ $did->status == 'inactive' ? 'selected' : '' }}>Inactive</option>
    </select><br><br>

    <button type="submit">Update</button>
</form>
@endsection
