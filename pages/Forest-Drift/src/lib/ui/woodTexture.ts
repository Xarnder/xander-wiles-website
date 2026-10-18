let initialization: Promise<void> | undefined;

/** One worker, one 512² colour image, one shared CSS image for this document's lifetime.
 * Remounting menus, resizing, changing worlds or graphics settings never rebakes it.
 * The plain colour/gradient theme is immediately usable while the worker runs, or if it fails.
 */
export function initializeUiWood(): Promise<void> {
	if (initialization) return initialization;
	initialization = new Promise<void>((resolve) => {
		const root = document.documentElement;
		root.dataset.uiWood = 'loading';
		let worker: Worker | undefined;
		let settled = false;
		const finish = (state: 'ready' | 'fallback') => {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			worker?.terminate();
			root.dataset.uiWood = state;
			resolve();
		};
		const timeout = setTimeout(() => finish('fallback'), 10_000);
		try {
			worker = new Worker(new URL('./woodTexture.worker.ts', import.meta.url), { type: 'module' });
			worker.onerror = () => finish('fallback');
			worker.onmessage = (
				event: MessageEvent<{ size: number; pixels: Uint8ClampedArray; bakeMs: number }>
			) => {
				if (settled) return;
				worker?.terminate();
				try {
					const { size, pixels, bakeMs } = event.data;
					const canvas = document.createElement('canvas');
					canvas.width = canvas.height = size;
					const context = canvas.getContext('2d');
					if (!context) {
						finish('fallback');
						return;
					}
					context.putImageData(new ImageData(new Uint8ClampedArray(pixels), size, size), 0, 0);
					canvas.toBlob((blob) => {
						if (settled) return;
						if (!blob) {
							finish('fallback');
							return;
						}
						// Retained until document unload, including back/forward cache restores.
						root.style.setProperty('--fd-wood-image', `url("${URL.createObjectURL(blob)}")`);
						performance.measure('forest-ui-wood-bake', { start: 0, duration: bakeMs });
						finish('ready');
					}, 'image/png');
				} catch {
					finish('fallback');
				}
			};
			worker.postMessage(null);
		} catch {
			finish('fallback');
		}
	});
	return initialization;
}
