/** Keep browser zoom gestures out of the touchscreen game without consuming game input. */
export function preventTouchPageZoom(node: HTMLElement, enabled: boolean) {
	let active = enabled;
	const preventZoom = (event: Event) => {
		if (active && event.cancelable) event.preventDefault();
	};
	const preventPinch = (event: TouchEvent) => {
		if (event.touches.length > 1) preventZoom(event);
	};
	const options = { capture: true, passive: false };

	// Cancelling touchstart/touchend would also suppress button clicks while the
	// other thumb holds the joystick. Only cancel native multi-finger movement.
	node.addEventListener('touchmove', preventPinch, options);
	// Safari's native pinch recognizer also emits these non-standard events.
	const gestures = ['gesturestart', 'gesturechange', 'gestureend', 'dblclick'];
	for (const name of gestures) node.addEventListener(name, preventZoom, options);

	return {
		update(next: boolean) {
			active = next;
		},
		destroy() {
			node.removeEventListener('touchmove', preventPinch, options);
			for (const name of gestures) node.removeEventListener(name, preventZoom, options);
		}
	};
}
