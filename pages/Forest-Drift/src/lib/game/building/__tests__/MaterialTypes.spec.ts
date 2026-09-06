import { describe, expect, it } from 'vitest';
import { DEFAULT_MATERIAL_PALETTE, normalizeColorHex } from '../MaterialTypes';

describe('normalizeColorHex', () => {
	it('uppercases an already-6-digit hex colour', () => {
		expect(normalizeColorHex('#d9d1c3')).toBe('#D9D1C3');
	});

	it('leaves an already-normalized colour unchanged', () => {
		expect(normalizeColorHex('#D9D1C3')).toBe('#D9D1C3');
	});

	it('expands a 3-digit shorthand to 6 digits', () => {
		expect(normalizeColorHex('#fff')).toBe('#FFFFFF');
		expect(normalizeColorHex('#0a1')).toBe('#00AA11');
	});

	it('accepts a hex value with no leading #', () => {
		expect(normalizeColorHex('d9d1c3')).toBe('#D9D1C3');
	});

	it('throws for a malformed colour', () => {
		expect(() => normalizeColorHex('not-a-colour')).toThrow();
		expect(() => normalizeColorHex('#12345')).toThrow();
		expect(() => normalizeColorHex('')).toThrow();
	});
});

describe('DEFAULT_MATERIAL_PALETTE', () => {
	it('stores every preset colour already normalized to #RRGGBB', () => {
		for (const group of DEFAULT_MATERIAL_PALETTE) {
			for (const preset of group.presets) {
				expect(preset.definition.type).toBe('color');
				expect(preset.definition.color).toBe(normalizeColorHex(preset.definition.color));
				expect(preset.definition.color).toMatch(/^#[0-9A-F]{6}$/);
			}
		}
	});

	it('gives every preset a unique, stable id', () => {
		const ids = DEFAULT_MATERIAL_PALETTE.flatMap((group) => group.presets.map((p) => p.id));
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('includes the groups named in the spec', () => {
		const groupNames = DEFAULT_MATERIAL_PALETTE.map((g) => g.group);
		expect(groupNames).toEqual(['Neutrals', 'Warm', 'Cool', 'Accent']);
	});
});
