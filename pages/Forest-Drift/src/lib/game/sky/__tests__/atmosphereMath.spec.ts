import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { resolveFogColor, sunDirectionFromAngles } from '../atmosphereMath';

describe('sunDirectionFromAngles', () => {
	it('is deterministic — same angles always produce the same direction', () => {
		const a = sunDirectionFromAngles(45, 130);
		const b = sunDirectionFromAngles(45, 130);
		expect(a.x).toBe(b.x);
		expect(a.y).toBe(b.y);
		expect(a.z).toBe(b.z);
	});

	it('returns a unit vector', () => {
		for (const [elevation, azimuth] of [
			[0, 0],
			[45, 90],
			[89, 270],
			[-10, 45]
		]) {
			const direction = sunDirectionFromAngles(elevation, azimuth);
			expect(direction.length()).toBeCloseTo(1, 5);
		}
	});

	it('points straight up at 90 degrees elevation, regardless of azimuth', () => {
		const a = sunDirectionFromAngles(90, 0);
		const b = sunDirectionFromAngles(90, 200);
		expect(a.y).toBeCloseTo(1, 5);
		expect(b.y).toBeCloseTo(1, 5);
	});

	it('lies exactly on the horizon plane (y = 0) at 0 degrees elevation', () => {
		const direction = sunDirectionFromAngles(0, 60);
		expect(direction.y).toBeCloseTo(0, 5);
	});

	it('writes into a provided output vector instead of always allocating', () => {
		const out = new THREE.Vector3();
		const returned = sunDirectionFromAngles(30, 45, out);
		expect(returned).toBe(out);
	});
});

describe('resolveFogColor', () => {
	it('uses the horizon colour when matchHorizon is enabled, deterministically', () => {
		const a = resolveFogColor('#cfe9f2', '#ff0000', true);
		const b = resolveFogColor('#cfe9f2', '#ff0000', true);
		expect(a.getHexString()).toBe(new THREE.Color('#cfe9f2').getHexString());
		expect(a.getHexString()).toBe(b.getHexString());
	});

	it('uses the explicit fog colour when matchHorizon is disabled', () => {
		const color = resolveFogColor('#cfe9f2', '#ff0000', false);
		expect(color.getHexString()).toBe(new THREE.Color('#ff0000').getHexString());
	});

	it('changing the horizon colour only affects the result when matching is enabled', () => {
		const matched = resolveFogColor('#112233', '#ff0000', true);
		const unmatched = resolveFogColor('#112233', '#ff0000', false);
		expect(matched.getHexString()).not.toBe(unmatched.getHexString());
	});
});
