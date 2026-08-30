@extends('layouts.app')

@section('content')
<h2>Create IVR</h2>

<form method="POST" action="/admin/ivr/store">
    @csrf

    <label>Name</label>
    <input type="text" name="name" class="form-control">

    <label>Audio File</label>
    <input type="text" name="audio_file" class="form-control">

    <label>Options (JSON)</label>
    <textarea name="options" class="form-control"></textarea>

    <button class="btn btn-success mt-3">Save</button>
</form>
@endsection
