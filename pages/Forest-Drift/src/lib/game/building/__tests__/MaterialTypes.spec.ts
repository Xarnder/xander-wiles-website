import { describe, expect, it } from 'vitest';
import { colorMaterialFromHex, DEFAULT_MATERIAL_PALETTE, normalizeColorHex } from '../MaterialTypes';

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

	it('builds a color material from a hex string', () => {
		expect(colorMaterialFromHex('#d9d1c3')).toEqual({ type: 'color', color: '#D9D1C3' });
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

	it('includes the original groups plus building-oriented palettes', () => {
		const groupNames = DEFAULT_MATERIAL_PALETTE.map((g) => g.group);
		expect(groupNames).toEqual([
			'Neutrals',
			'Warm',
			'Cool',
			'Wood',
			'Stone',
			'Metal',
			'Accent',
			'Pastels'
		]);
	});

	it('keeps the original swatch ids and hex values stable', () => {
		const byId = new Map(
			DEFAULT_MATERIAL_PALETTE.flatMap((group) =>
				group.presets.map((preset) => [preset.id, preset] as const)
			)
		);
		expect(byId.get('white')?.definition.color).toBe('#FFFFFF');
		expect(byId.get('light-grey')?.definition.color).toBe('#D8D8D8');
		expect(byId.get('grey')?.definition.color).toBe('#9A9A9A');
		expect(byId.get('dark-grey')?.definition.color).toBe('#5A5A5A');
		expect(byId.get('black')?.definition.color).toBe('#1C1C1C');
		expect(byId.get('cream')?.definition.color).toBe('#F1E7D0');
		expect(byId.get('sand')?.definition.color).toBe('#D9C9A3');
		expect(byId.get('terracotta')?.definition.color).toBe('#C1694F');
		expect(byId.get('brown')?.definition.color).toBe('#7A5230');
		expect(byId.get('blue')?.definition.color).toBe('#3E6FA6');
		expect(byId.get('teal')?.definition.color).toBe('#2E8B84');
		expect(byId.get('green')?.definition.color).toBe('#4F8F52');
		expect(byId.get('red')?.definition.color).toBe('#C1443C');
		expect(byId.get('orange')?.definition.color).toBe('#D97C33');
		expect(byId.get('yellow')?.definition.color).toBe('#E0B23A');
		expect(byId.get('purple')?.definition.color).toBe('#7B5AA6');
		expect(byId.get('pink')?.definition.color).toBe('#C97AA0');
	});

	it('offers enough swatches that paint mode is not limited to a handful of hues', () => {
		const count = DEFAULT_MATERIAL_PALETTE.reduce((sum, group) => sum + group.presets.length, 0);
		expect(count).toBeGreaterThanOrEqual(60);
	});
});
