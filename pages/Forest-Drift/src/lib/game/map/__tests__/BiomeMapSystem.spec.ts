import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	BiomeMapSystem,
	formatMapCoordinates,
	formatMapWidth,
	gridSpacing,
	MINIMAP_SIZES,
	MINIMAP_ZOOM_METRES,
	minimapViewport,
	type MinimapElements
} from '../BiomeMapSystem';
import type { BiomeMapClient } from '../BiomeMapClient';
import { metresPerPixel } from '../biomeMapTiles';
import { loadBiomeMapPreferences, saveBiomeMapPreferences } from '../biomeMapPreferences';
import type { MapWorldSettings } from '../mapWorld';

describe('minimap maths', () => {
	it('picks the coarsest tile level at least as sharp as the screen (drawn at 0.5–2×) at every zoom and size', () => {
		for (const size of Object.values(MINIMAP_SIZES))
			for (let zoom = 0; zoom < MINIMAP_ZOOM_METRES.length; zoom++) {
				const view = minimapViewport(zoom, size, 0, 0);
				expect(view.scale).toBeGreaterThan(0.5);
				expect(view.scale).toBeLessThan(2.01);
				// The view spans exactly the zoom's metres.
				expect((size / view.scale) * metresPerPixel(view.level)).toBeCloseTo(
					MINIMAP_ZOOM_METRES[zoom]
				);
			}
	});

	it('spaces the grid at round numbers, four or five lines across', () => {
		expect(MINIMAP_ZOOM_METRES.map(gridSpacing)).toEqual([50, 100, 250, 500, 1000, 2000]);
	});

	it('writes coordinates in whole metres with a true minus and thin-space thousands', () => {
		expect(formatMapCoordinates(1240.4, -3450.6)).toBe('x 1 240 · z −3 451');
		expect(formatMapCoordinates(-0.2, 7)).toBe('x 0 · z 7');
		expect(formatMapWidth(500)).toBe('500 m');
		expect(formatMapWidth(2000)).toBe('2 km');
	});
});

describe('minimap preferences', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('follow the world until chosen, survive a reload, and ignore a corrupt store', () => {
		const store = new Map<string, string>();
		vi.stubGlobal('localStorage', {
			getItem: (k: string) => store.get(k) ?? null,
			setItem: (k: string, v: string) => store.set(k, v)
		});
		const fresh = loadBiomeMapPreferences();
		expect(fresh.chosen).toBe(false);
		saveBiomeMapPreferences({ ...fresh, show: false, chosen: true, zoom: 9, size: 'large' });
		const again = loadBiomeMapPreferences();
		expect(again).toMatchObject({ show: false, chosen: true, zoom: 5, size: 'large' });
		store.set('forest-drift.biome-map.v1', '{nope');
		expect(loadBiomeMapPreferences().chosen).toBe(false);
	});
});

describe('BiomeMapSystem', () => {
	function fakeElements() {
		const calls = { drawImage: 0, fillRect: 0 };
		const ctx = new Proxy(
			{},
			{
				get: (_t, key) =>
					key === 'drawImage'
						? () => calls.drawImage++
						: key === 'fillRect'
							? () => calls.fillRect++
							: () => {}
			}
		);
		const style = { transform: '' };
		const elements = {
			canvas: { width: 0, height: 0, getContext: () => ctx },
			arrow: { style },
			coordinates: { textContent: '' },
			scaleLabel: { textContent: '' }
		} as unknown as MinimapElements;
		return { elements, calls, style };
	}
	function fakeClient() {
		const inits: MapWorldSettings[] = [];
		const client = {
			onTile: null,
			init: (s: MapWorldSettings) => inits.push(s),
			want: vi.fn(),
			get: () => ({ image: {}, final: true }),
			dispose: vi.fn()
		};
		return { client: client as unknown as BiomeMapClient, inits, raw: client };
	}
	const world = (seed = 'a') => ({ seed }) as unknown as MapWorldSettings;
	beforeEach(() => vi.stubGlobal('window', { devicePixelRatio: 1 }));
	afterEach(() => vi.unstubAllGlobals());

	it('starts its worker only when shown, and frees it when hidden', () => {
		const { client, raw } = fakeClient();
		let created = 0;
		const map = new BiomeMapSystem(() => (created++, client));
		map.update(
			0,
			0,
			0,
			0,
			() => world(),
			() => []
		);
		expect(created).toBe(0);
		map.attach(fakeElements().elements);
		map.update(
			0,
			0,
			0,
			0,
			() => world(),
			() => []
		);
		expect(created).toBe(1);
		expect(map.workerRunning).toBe(true);
		map.attach(null);
		expect(raw.dispose).toHaveBeenCalled();
		expect(map.workerRunning).toBe(false);
	});

	it('repaints only when something changed, at most ~15 times a second', () => {
		const { client } = fakeClient();
		const map = new BiomeMapSystem(() => client);
		const { elements, calls } = fakeElements();
		map.attach(elements);
		map.configure({ zoom: 2, sizePx: 180, grid: false });
		map.update(
			0,
			0,
			0,
			0,
			() => world(),
			() => []
		);
		expect(map.cost.paints).toBe(1);
		// Standing still: no repaint.
		for (let t = 100; t < 1000; t += 16)
			map.update(
				t,
				0,
				0,
				0,
				() => world(),
				() => []
			);
		expect(map.cost.paints).toBe(1);
		// Moving fast every frame: about 15 a second, not 60.
		for (let t = 1000; t < 2000; t += 16)
			map.update(
				t,
				t,
				0,
				0,
				() => world(),
				() => []
			);
		expect(map.cost.paints).toBeGreaterThan(10);
		expect(map.cost.paints).toBeLessThan(18);
		expect(calls.drawImage).toBeGreaterThan(0);
	});

	it('turns the arrow without repainting, and re-initialises for a changed world', () => {
		const { client, inits } = fakeClient();
		const map = new BiomeMapSystem(() => client);
		const { elements, style } = fakeElements();
		map.attach(elements);
		map.update(
			0,
			0,
			0,
			Math.PI / 2,
			() => world(),
			() => []
		);
		expect(style.transform).toContain('rotate(-90deg)');
		expect(elements.scaleLabel.textContent).toBe('1 km');
		map.update(
			500,
			0,
			0,
			Math.PI / 2,
			() => world(),
			() => []
		);
		map.update(
			1500,
			0,
			0,
			Math.PI / 2,
			() => world('b'),
			() => []
		);
		expect(inits.map((s) => s.seed)).toEqual(['a', 'b']);
	});
});
