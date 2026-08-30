@extends('layouts.admin')

@section('content')
<link rel="stylesheet" href="/css/live-interrogation.css">

<div id="live-interrogation" class="interrogation-container">

    <!-- LEFT SIDE: ACTIVE CALLS -->
    <div class="active-calls">
        <h2>Active Calls</h2>

        <div v-for="call in calls"
             :key="call.uniqueid"
             class="call-item"
             @click="selectCall(call.uniqueid)">

            <div class="caller">@{{ call.caller }} → @{{ call.callee }}</div>
            <div class="status">@{{ call.status }} @{{ call.duration }}</div>
            <div class="trunk">Trunk: @{{ call.trunk }}</div>
        </div>
    </div>

    <!-- RIGHT SIDE: INTERROGATION PANEL -->
    <div class="interrogation-panel" v-if="selected">
        <h2>Call Interrogation</h2>

        <div class="section">
            <strong>Caller:</strong> @{{ selected.caller }}<br>
            <strong>Callee:</strong> @{{ selected.callee }}<br>
            <strong>Trunk:</strong> @{{ selected.trunk }}<br>
            <strong>Codec:</strong> @{{ selected.codec }}<br>
            <strong>PDD:</strong> @{{ selected.pdd }} sec<br>
            <strong>Duration:</strong> @{{ selected.duration }}
        </div>

        <div class="section">
            <h3>SIP INVITE</h3>
            <pre>@{{ selected.sip_invite }}</pre>
        </div>

        <div class="section">
            <h3>AMI Events (Live)</h3>
            <ul>
                <li v-for="e in selected.events">@{{ e }}</li>
            </ul>
        </div>
    </div>

</div>
@endsection
