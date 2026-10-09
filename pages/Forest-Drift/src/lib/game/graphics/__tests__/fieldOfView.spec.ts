import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	clampFieldOfView,
	createDefaultGraphicsSettings,
	DEFAULT_FIELD_OF_VIEW,
	FIELD_OF_VIEW_MAX,
	FIELD_OF_VIEW_MIN,
	ZOOM_MAGNIFICATION,
	zoomedFieldOfView
} from '../GraphicsTypes';
import { GraphicsSettingsStore } from '../GraphicsSettingsStore';

describe('field of view', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('defaults to 70° and clamps to the slider range', () => {
		expect(createDefaultGraphicsSettings().fieldOfView).toBe(DEFAULT_FIELD_OF_VIEW);
		expect(clampFieldOfView(10)).toBe(FIELD_OF_VIEW_MIN);
		expect(clampFieldOfView(170)).toBe(FIELD_OF_VIEW_MAX);
		expect(clampFieldOfView(Number.NaN)).toBe(DEFAULT_FIELD_OF_VIEW);
		expect(clampFieldOfView(90)).toBe(90);
	});

	it('zooms by magnifying the image (tangent of the half-angle), not by dividing the angle', () => {
		expect(zoomedFieldOfView(70, 1)).toBeCloseTo(70, 9);
		const zoomed = zoomedFieldOfView(70, ZOOM_MAGNIFICATION);
		const tan = (deg: number) => Math.tan((deg * Math.PI) / 360);
		expect(tan(70) / tan(zoomed)).toBeCloseTo(ZOOM_MAGNIFICATION, 6);
		expect(zoomed).toBeLessThan(70 / 3);
		expect(zoomed).toBeGreaterThan(10);
	});

	it('saves and restores the chosen field of view per browser', () => {
		const data = new Map<string, string>();
		vi.stubGlobal('localStorage', {
			getItem: (k: string) => data.get(k) ?? null,
			setItem: (k: string, v: string) => void data.set(k, v)
		});
		const store = new GraphicsSettingsStore();
		expect(store.getFieldOfView()).toBeNull();
		store.setFieldOfView(95);
		expect(new GraphicsSettingsStore().getFieldOfView()).toBe(95);
		data.set('forest-drift.fov.v1', 'garbage');
		expect(store.getFieldOfView()).toBeNull();
	});
});
