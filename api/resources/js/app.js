import './bootstrap';

import Echo from "laravel-echo";
window.Echo = new Echo({ broadcaster: "pusher", key: "local", wsHost: window.location.hostname, wsPort: 6001, forceTLS: false, disableStats: true });
window.Echo.channel("live-calls").listen("LiveCallUpdated", (e) => { console.log("Live call updated", e); });