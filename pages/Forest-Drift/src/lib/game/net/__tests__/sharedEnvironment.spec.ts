import { describe, expect, it } from 'vitest';
import { applyKnownFields, omitKeys, pickKeys } from '../sharedEnvironment';

describe('applyKnownFields', () => {
	it('copies only keys the target already has, with matching types', () => {
		const target = {
			enabled: true,
			intensity: 0.5,
			selection: 'schedule',
			nested: { colour: '#ffffff', size: 2 }
		};
		const changed = applyKnownFields(target, {
			enabled: false,
			intensity: 'loud',
			selection: 'rain',
			nested: { colour: '#000000', size: Number.NaN, extra: 1 },
			unknown: 42
		});
		expect(changed).toBe(3);
		expect(target).toEqual({
			enabled: false,
			intensity: 0.5,
			selection: 'rain',
			nested: { colour: '#000000', size: 2 }
		});
	});

	it('skips listed keys, and never touches the prototype chain', () => {
		const target = { debug: { show: false }, value: 1 };
		applyKnownFields(target, JSON.parse('{"debug":{"show":true},"__proto__":{"polluted":true}}'), [
			'debug'
		]);
		expect(target.debug.show).toBe(false);
		expect(({} as Record<string, unknown>).polluted).toBeUndefined();
	});
});

describe('pickKeys / omitKeys', () => {
	it('deep-copy the chosen part', () => {
		const source = { a: { b: 1 }, c: 2, d: 3 };
		const picked = pickKeys(source, ['a', 'c']);
		expect(picked).toEqual({ a: { b: 1 }, c: 2 });
		(picked.a as { b: number }).b = 9;
		expect(source.a.b).toBe(1);
		expect(omitKeys(source, ['a'])).toEqual({ c: 2, d: 3 });
	});
});
