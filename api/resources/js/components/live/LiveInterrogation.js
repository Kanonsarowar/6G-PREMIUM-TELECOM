export default {
    data() {
        return {
            calls: [],
            selected: null,
        };
    },

    mounted() {
        this.loadCalls();

        window.Echo.channel("live-calls")
            .listen("LiveCallUpdated", (event) => {
                this.updateCall(event.call);
            });
    },

    methods: {
        loadCalls() {
            fetch("/api/live-calls")
                .then(r => r.json())
                .then(d => this.calls = d);
        },

        updateCall(call) {
            const i = this.calls.findIndex(c => c.uniqueid === call.uniqueid);

            if (call.status === "Hangup") {
                if (i !== -1) this.calls.splice(i, 1);
                return;
            }

            if (i === -1) this.calls.push(call);
            else this.calls[i] = call;
        },

        selectCall(id) {
            fetch(`/api/live-calls/${id}`)
                .then(r => r.json())
                .then(d => this.selected = d);
        }
    }
};
