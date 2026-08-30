@extends('layouts.app')

@section('content')
<h2>IVR List</h2>

<a href="/admin/ivr/create" class="btn btn-primary mb-3">Add IVR</a>

<table class="table table-bordered">
    <tr>
        <th>ID</th>
        <th>Name</th>
        <th>Audio File</th>
        <th>Options</th>
        <th>Actions</th>
    </tr>

    @foreach($ivrs as $ivr)
    <tr>
        <td>{{ $ivr->id }}</td>
        <td>{{ $ivr->name }}</td>
        <td>{{ $ivr->audio_file }}</td>
        <td>{{ $ivr->options }}</td>
        <td>
            <a href="/admin/ivr/edit/{{ $ivr->id }}" class="btn btn-warning btn-sm">Edit</a>
            <a href="/admin/ivr/delete/{{ $ivr->id }}" class="btn btn-danger btn-sm">Delete</a>
        </td>
    </tr>
    @endforeach
</table>
@endsection
