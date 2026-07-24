import { Object3D, Points, PointsMaterial, Vector3 } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BALANCE } from '../config/balance';
import { JetTrailSystem } from './JetTrailSystem';

describe('JetTrailSystem', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('spawns particles after travelling past the spacing distance', () => {
		const trails = new JetTrailSystem('high');
		const jet = new Object3D();
		jet.position.set(0, 100, 0);

		trails.update(1 / 60, [{ object: jet, intensity: 1, afterburner: 0, active: true }]);
		expect(trails.particleCount).toBe(0);

		jet.position.z -= BALANCE.trails.spacing * 2.2;
		trails.update(1 / 60, [{ object: jet, intensity: 1, afterburner: 0, active: true }]);
		expect(trails.particleCount).toBeGreaterThan(0);
		trails.dispose();
	});

	it('fades particles out after their lifetime', () => {
		vi.spyOn(Math, 'random').mockReturnValue(0.5);
		const trails = new JetTrailSystem('low');
		const jet = new Object3D();
		jet.position.set(0, 200, 0);
		trails.update(0, [{ object: jet, intensity: 1, afterburner: 0, active: true }]);

		for (let step = 0; step < 8; step += 1) {
			jet.position.add(new Vector3(0, 0, -BALANCE.trails.spacing));
			trails.update(1 / 60, [{ object: jet, intensity: 1, afterburner: 0, active: true }]);
		}
		expect(trails.particleCount).toBeGreaterThan(0);

		trails.update(BALANCE.trails.lifetime + 0.5, [
			{ object: jet, intensity: 1, afterburner: 0, active: true }
		]);
		expect(trails.particleCount).toBe(0);
		trails.dispose();
	});

	it('clears particles on reset', () => {
		const trails = new JetTrailSystem('medium');
		const jet = new Object3D();
		jet.position.set(10, 120, -20);
		trails.update(0, [{ object: jet, intensity: 1, afterburner: 0, active: true }]);
		jet.position.z -= BALANCE.trails.spacing * 3;
		trails.update(1 / 60, [{ object: jet, intensity: 1, afterburner: 1, active: true }]);
		expect(trails.particleCount).toBeGreaterThan(0);

		trails.reset();
		expect(trails.particleCount).toBe(0);
		trails.dispose();
	});

	it('scales particle lifetime with trail length', () => {
		vi.spyOn(Math, 'random').mockReturnValue(0.5);
		const shortTrails = new JetTrailSystem('high', 0.5);
		const longTrails = new JetTrailSystem('high', 4);
		const jet = new Object3D();
		jet.position.set(0, 200, 0);

		shortTrails.update(0, [{ object: jet, intensity: 1, afterburner: 0, active: true }]);
		longTrails.update(0, [{ object: jet, intensity: 1, afterburner: 0, active: true }]);
		jet.position.z -= BALANCE.trails.spacing * 2;
		shortTrails.update(1 / 60, [{ object: jet, intensity: 1, afterburner: 0, active: true }]);
		longTrails.update(1 / 60, [{ object: jet, intensity: 1, afterburner: 0, active: true }]);

		expect(shortTrails.particleCount).toBeGreaterThan(0);
		expect(longTrails.particleCount).toBeGreaterThan(0);

		shortTrails.update(BALANCE.trails.lifetime * 0.5 + 0.4, [
			{ object: jet, intensity: 1, afterburner: 0, active: true }
		]);
		expect(shortTrails.particleCount).toBe(0);
		expect(longTrails.particleCount).toBeGreaterThan(0);

		shortTrails.dispose();
		longTrails.dispose();
	});

	it('raises particle budget when trail length increases', () => {
		vi.spyOn(Math, 'random').mockReturnValue(0.5);
		const trails = new JetTrailSystem('low', 1);
		const jet = new Object3D();
		jet.position.set(0, 150, 0);
		trails.update(0, [{ object: jet, intensity: 1, afterburner: 1, active: true }]);

		for (let step = 0; step < 400; step += 1) {
			jet.position.z -= BALANCE.trails.minSpacing;
			trails.update(1 / 120, [{ object: jet, intensity: 1.2, afterburner: 1, active: true }]);
		}
		const baseCount = trails.particleCount;
		expect(baseCount).toBeLessThanOrEqual(BALANCE.trails.maxParticlesLow);

		trails.setTrailLength(6);
		for (let step = 0; step < 800; step += 1) {
			jet.position.z -= BALANCE.trails.minSpacing;
			trails.update(1 / 120, [{ object: jet, intensity: 1.2, afterburner: 1, active: true }]);
		}
		expect(trails.particleCount).toBeGreaterThan(baseCount);
		expect(trails.particleCount).toBeLessThanOrEqual(
			Math.min(BALANCE.trails.maxParticlesAbsolute, BALANCE.trails.maxParticlesLow * 6)
		);
		trails.dispose();
	});

	it('dims trail brightness on small viewports', () => {
		const trails = new JetTrailSystem('high', 1);
		const points = trails.children[0] as Points;
		const material = points.material as PointsMaterial;
		const largeOpacity = material.opacity;
		const largeSize = material.size;

		trails.setViewportSize(360, 640);
		expect(material.opacity).toBeLessThan(largeOpacity);
		expect(material.size).toBeLessThanOrEqual(largeSize);

		trails.setViewportSize(1920, 1080);
		expect(material.opacity).toBeCloseTo(BALANCE.trails.opacity, 5);
		trails.dispose();
	});

	it('scales material opacity with trail brightness setting', () => {
		const trails = new JetTrailSystem('high', 1, 1);
		const material = (trails.children[0] as Points).material as PointsMaterial;
		trails.setViewportSize(1920, 1080);
		const base = material.opacity;
		trails.setTrailBrightness(0.5);
		expect(material.opacity).toBeCloseTo(base * 0.5, 5);
		trails.setTrailBrightness(1.5);
		expect(material.opacity).toBeCloseTo(base * 1.5, 5);
		trails.dispose();
	});
});
