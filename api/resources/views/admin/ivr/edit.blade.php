@extends('layouts.app')

@section('content')
<h2>Edit IVR</h2>

<form method="POST" action="/admin/ivr/update/{{ $ivr->id }}">
    @csrf

    <label>Name</label>
    <input type="text" name="name" class="form-control" value="{{ $ivr->name }}">

    <label>Audio File</label>
    <input type="text" name="audio_file" class="form-control" value="{{ $ivr->audio_file }}">

    <label>Options (JSON)</label>
    <textarea name="options" class="form-control">{{ $ivr->options }}</textarea>

    <button class="btn btn-success mt-3">Update</button>
</form>
@endsection
