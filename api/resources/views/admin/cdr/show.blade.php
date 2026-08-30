@extends("layouts.admin")
@section("title","CDR Details")
@section("content")
<h1>CDR Details</h1>

<p><strong>ID:</strong> {{ $cdr->id }}</p>
<p><strong>Caller:</strong> {{ $cdr->caller }}</p>
<p><strong>Callee:</strong> {{ $cdr->callee }}</p>
<p><strong>Duration:</strong> {{ $cdr->duration }}</p>
<p><strong>Status:</strong> {{ $cdr->status }}</p>
<p><strong>Call Start:</strong> {{ $cdr->start_time }}</p>
<p><strong>Call End:</strong> {{ $cdr->end_time }}</p>

<a href="{{ route('cdr.index') }}">Back to CDR List</a>
@endsection
