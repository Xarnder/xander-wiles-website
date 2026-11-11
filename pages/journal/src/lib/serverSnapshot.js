// A cache event is useful offline, but cannot establish that a search page is
// complete. Keep listening through cache events and detach on success or abort.
// subscribe must include metadata changes: the server may confirm identical data.
export function waitForServerSnapshot(subscribe, signal) {
    return new Promise((resolve, reject) => {
        let unsubscribe;
        let settled = false;
        const finish = (settle, value) => {
            if (settled) return;
            settled = true;
            signal?.removeEventListener('abort', onAbort);
            unsubscribe?.();
            settle(value);
        };
        const onAbort = () => finish(reject, new Error('Search loading cancelled.'));
        signal?.addEventListener('abort', onAbort, { once: true });
        if (signal?.aborted) { onAbort(); return; }
        try {
            unsubscribe = subscribe(
                (snapshot) => {
                    if (snapshot.metadata?.fromCache === false) finish(resolve, snapshot);
                },
                (error) => finish(reject, error)
            );
            // Also support a synchronous callback from a transport/test adapter.
            if (settled) unsubscribe?.();
        } catch (error) {
            finish(reject, error);
        }
    });
}
