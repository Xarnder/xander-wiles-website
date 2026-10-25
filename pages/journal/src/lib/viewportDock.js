// iOS shrinks and pans the visual viewport when the keyboard opens, while
// position:fixed still uses the layout viewport. Follow its visible bottom.
export function trackViewportDock(element, host = window) {
    const viewport = host.visualViewport;
    if (!viewport || !element) return () => {};

    let frame;
    let settleTimer;
    const update = () => {
        const bottom = Math.max(0, host.innerHeight - viewport.height - viewport.offsetTop);
        element.style.bottom = `${bottom}px`;
        element.style.paddingBottom = bottom > 0
            ? '0.75rem'
            : 'max(0.75rem, env(safe-area-inset-bottom))';
    };
    const schedule = () => {
        host.cancelAnimationFrame(frame);
        host.clearTimeout(settleTimer);
        frame = host.requestAnimationFrame(update);
        // Safari may report the new height before the final panning offset.
        settleTimer = host.setTimeout(update, 350);
    };
    const events = [
        [viewport, 'resize'], [viewport, 'scroll'],
        [host, 'resize'], [host, 'scroll'], [host, 'pageshow'],
        [host, 'focusin'], [host, 'focusout'],
        [host.document, 'visibilitychange'],
    ];
    update();
    events.forEach(([target, event]) => target.addEventListener(event, schedule));
    return () => {
        host.cancelAnimationFrame(frame);
        host.clearTimeout(settleTimer);
        events.forEach(([target, event]) => target.removeEventListener(event, schedule));
    };
}
