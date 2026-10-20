/** Activate buttons from secondary touches without relying on synthesized clicks. */
export function touchButton(node: HTMLButtonElement, callback: (() => void) | undefined) {
	let activate = callback;
	let suppressTouchClick = false;
	const pointers = new Map<number, { x: number; y: number; dragged: boolean }>();
	const onDown = (event: PointerEvent) => {
		if (event.pointerType === 'mouse') {
			suppressTouchClick = false;
			return;
		}
		if (node.disabled || (event.pointerType !== 'touch' && event.pointerType !== 'pen')) return;
		// Each finger owns its own press, including non-primary touches while moving.
		pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, dragged: false });
		suppressTouchClick = true;
	};
	const onMove = (event: PointerEvent) => {
		const press = pointers.get(event.pointerId);
		if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 12) {
			press.dragged = true;
		}
	};
	const onUp = (event: PointerEvent) => {
		const press = pointers.get(event.pointerId);
		if (!press) return;
		onMove(event);
		pointers.delete(event.pointerId);
		const bounds = node.getBoundingClientRect();
		const inside =
			event.clientX >= bounds.left &&
			event.clientX <= bounds.right &&
			event.clientY >= bounds.top &&
			event.clientY <= bounds.bottom;
		if (node.disabled || press.dragged || !inside) return;
		event.preventDefault();
		event.stopPropagation();
		activate?.();
	};
	const onCancel = (event: PointerEvent) => {
		pointers.delete(event.pointerId);
	};
	const onClick = (event: MouseEvent) => {
		// Native touch clicks may follow pointerup, or may never arrive at all.
		// Mouse presses reset this flag; keyboard/assistive activation has detail 0.
		const pointerType = (event as PointerEvent).pointerType;
		if (
			pointerType === 'touch' ||
			pointerType === 'pen' ||
			(suppressTouchClick && event.detail > 0)
		) {
			event.preventDefault();
			event.stopPropagation();
			return;
		}
		if (!node.disabled) activate?.();
	};
	node.addEventListener('pointerdown', onDown);
	node.addEventListener('pointermove', onMove);
	node.addEventListener('pointerup', onUp);
	node.addEventListener('pointercancel', onCancel);
	node.addEventListener('lostpointercapture', onCancel);
	node.addEventListener('click', onClick);
	return {
		update(next: (() => void) | undefined) {
			activate = next;
		},
		destroy() {
			node.removeEventListener('pointerdown', onDown);
			node.removeEventListener('pointermove', onMove);
			node.removeEventListener('pointerup', onUp);
			node.removeEventListener('pointercancel', onCancel);
			node.removeEventListener('lostpointercapture', onCancel);
			node.removeEventListener('click', onClick);
			pointers.clear();
		}
	};
}
