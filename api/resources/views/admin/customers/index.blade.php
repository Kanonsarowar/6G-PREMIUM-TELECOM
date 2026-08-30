@extends('layouts.admin')
@section('title', 'Customers')

@section('content')
<h1>Customers</h1>

<table border="1" cellpadding="10">
    <tr>
        <th>ID</th>
        <th>Name</th>
        <th>Email</th>
    </tr>

    @foreach($customers as $c)
    <tr>
        <td>{{ $c->id }}</td>
        <td>{{ $c->name }}</td>
        <td>{{ $c->email }}</td>
    </tr>
    @endforeach
</table>

@endsection
