import { describe, expect, it } from 'vitest';
import {
	createDefaultGraphicsSettings,
	GRAPHICS_PRESETS,
	graphicsQualityLabel,
	nextGraphicsQuality,
	type GraphicsQuality
} from '../GraphicsTypes';

const QUALITIES: GraphicsQuality[] = ['low', 'medium', 'high', 'ultra'];

describe('nextGraphicsQuality', () => {
	it('cycles LOW → MEDIUM → HIGH → ULTRA → LOW', () => {
		expect(nextGraphicsQuality('low')).toBe('medium');
		expect(nextGraphicsQuality('medium')).toBe('high');
		expect(nextGraphicsQuality('high')).toBe('ultra');
		expect(nextGraphicsQuality('ultra')).toBe('low');
	});

	it('visits all four levels exactly once before returning to the start', () => {
		let quality: GraphicsQuality = 'low';
		const visited: GraphicsQuality[] = [quality];
		for (let i = 0; i < 3; i++) {
			quality = nextGraphicsQuality(quality);
			visited.push(quality);
		}
		expect(new Set(visited).size).toBe(4);
		expect(nextGraphicsQuality(quality)).toBe('low');
	});
});

describe('GRAPHICS_PRESETS', () => {
	it('defines exactly the four quality levels', () => {
		expect(Object.keys(GRAPHICS_PRESETS).sort()).toEqual([...QUALITIES].sort());
	});

	it('increases pixel ratio cap monotonically from LOW to ULTRA', () => {
		const caps = QUALITIES.map((q) => GRAPHICS_PRESETS[q].pixelRatioCap);
		for (let i = 1; i < caps.length; i++) expect(caps[i]).toBeGreaterThanOrEqual(caps[i - 1]);
	});

	it('never turns shadows on for LOW (the "none/very cheap" tier)', () => {
		expect(GRAPHICS_PRESETS.low.shadowsEnabled).toBe(false);
		expect(GRAPHICS_PRESETS.low.shadowCascades).toBe(0);
	});

	it('every shadow-enabled preset supplies one shadow map size per cascade', () => {
		for (const quality of QUALITIES) {
			const preset = GRAPHICS_PRESETS[quality];
			if (!preset.shadowsEnabled) continue;
			expect(preset.shadowMapSizes).toHaveLength(preset.shadowCascades);
		}
	});

	it('never uses TAA — the brief explicitly warns against ghosting on a moving first-person camera', () => {
		for (const quality of QUALITIES) {
			expect(GRAPHICS_PRESETS[quality].antialiasing).not.toBe('taa');
		}
	});

	it('keeps bloom subtle where enabled — never a strength that would visibly glow the whole scene', () => {
		for (const quality of QUALITIES) {
			const preset = GRAPHICS_PRESETS[quality];
			if (preset.bloomEnabled) expect(preset.bloomStrength).toBeLessThan(0.3);
		}
	});

	it('never lets AO intensity fully crush the scene to black', () => {
		for (const quality of QUALITIES) {
			expect(GRAPHICS_PRESETS[quality].aoIntensity).toBeLessThanOrEqual(1.5);
		}
	});
});

describe('graphicsQualityLabel', () => {
	it("returns each preset's own display label", () => {
		expect(graphicsQualityLabel('low')).toBe('Low');
		expect(graphicsQualityLabel('ultra')).toBe('Ultra');
	});
});

describe('createDefaultGraphicsSettings', () => {
	it('defaults to HIGH — capable-desktop-first, no aggressive user-agent detection', () => {
		expect(createDefaultGraphicsSettings().quality).toBe('high');
	});

	it('returns a fresh object each call (no shared mutable default)', () => {
		const a = createDefaultGraphicsSettings();
		const b = createDefaultGraphicsSettings();
		a.quality = 'low';
		expect(b.quality).toBe('high');
	});
});
