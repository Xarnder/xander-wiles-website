/** Observe only occupied HUD elements. Stats/weather DOM changes must not cause caption layout work. */
export function observeSubtitleLayout(update: (bottom: number) => void): () => void {
	const hud = document.querySelector('.game-hud');
	let frame = 0;
	const selector = '.hotbar, .subtool-panel, .utility-buttons';
	const measure = () => {
		if (frame) return;
		frame = requestAnimationFrame(() => {
			frame = 0;
			let top = innerHeight - 125;
			for (const element of document.querySelectorAll(selector)) {
				const bounds = element.getBoundingClientRect();
				if (bounds.height && bounds.top > innerHeight / 2) top = Math.min(top, bounds.top);
			}
			update(Math.max(125, innerHeight - top + 16));
		});
	};
	const resize = new ResizeObserver(measure);
	const hotbarChanges = new MutationObserver(() => {
		refresh();
		measure();
	});
	const observed = new Set<Element>();
	const refresh = () => {
		const next = new Set(document.querySelectorAll(selector));
		for (const element of observed)
			if (!next.has(element)) {
				resize.unobserve(element);
				observed.delete(element);
			}
		for (const element of next)
			if (!observed.has(element)) {
				resize.observe(element);
				observed.add(element);
			}
		hotbarChanges.disconnect();
		document.querySelectorAll('.hotbar, .utility-buttons').forEach((element) =>
			hotbarChanges.observe(element, {
				childList: true,
				subtree: true,
				attributes: true,
				attributeFilter: ['class']
			})
		);
	};
	// Only direct HUD children, so frequent nested FPS/stat updates are excluded.
	const root = new MutationObserver(() => {
		refresh();
		measure();
	});
	if (hud) root.observe(hud, { childList: true });
	refresh();
	measure();
	window.addEventListener('resize', measure);
	return () => {
		cancelAnimationFrame(frame);
		root.disconnect();
		hotbarChanges.disconnect();
		resize.disconnect();
		window.removeEventListener('resize', measure);
	};
}
