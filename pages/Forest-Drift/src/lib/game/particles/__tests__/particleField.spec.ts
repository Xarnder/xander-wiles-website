import { describe, expect, it } from 'vitest';
import { ParticleEffectManager } from '../ParticleEffectManager';
import {
	createFieldSeeds,
	createFieldWrapOffsets,
	createParticleFieldFrame,
	FIELD_LAYER_RADII,
	fieldLayerOf,
	fieldCyclesFor,
	fieldFallSpeed,
	fieldParticleLocal,
	fieldWrapOffsets,
	type ParticleFieldFrame
} from '../ParticleFieldMath';
import { getParticleAtlas } from '../ParticleTextureGenerator';
import { PARTICLE_QUALITY, type ParticleFieldDefinition } from '../ParticleTypes';

const FIELD: ParticleFieldDefinition = {
	id: 'test-field',
	textureId: 'rain-streak',
	shape: 'streak',
	blending: 'normal',
	lighting: 1,
	color: [1, 1, 1]
};

function frameAt(x: number, y: number, z: number, phase = 0): ParticleFieldFrame {
	const frame = createParticleFieldFrame();
	frame.anchorX = x;
	frame.anchorY = y;
	frame.anchorZ = z;
	frame.radius = 15;
	frame.height = 18;
	frame.phase = phase;
	Object.assign(frame, fieldCyclesFor(8.5, 11.5, frame.height, 64));
	return frame;
}

function worldOf(
	seed: [number, number, number, number],
	frame: ParticleFieldFrame,
	index = 0
): { x: number; y: number; z: number } {
	const offsets = fieldWrapOffsets(frame, createFieldWrapOffsets());
	const local = fieldParticleLocal(seed, frame, offsets, { x: 0, y: 0, z: 0 }, index);
	return { x: frame.anchorX + local.x, y: frame.anchorY + local.y, z: frame.anchorZ + local.z };
}

describe('camera-local particle fields (rain, snow)', () => {
	const seeds = createFieldSeeds(400, 7);
	const seedAt = (i: number): [number, number, number, number] => [
		seeds[i * 4],
		seeds[i * 4 + 1],
		seeds[i * 4 + 2],
		seeds[i * 4 + 3]
	];

	it('keeps every particle inside the volume around the camera, wherever the camera is', () => {
		for (const [x, y, z] of [
			[0, 0, 0],
			[123456.7, 80, -98765.4],
			[-5, 300, 12]
		]) {
			const frame = frameAt(x, y, z, 0.37);
			for (let i = 0; i < 400; i++) {
				const p = worldOf(seedAt(i), frame, i);
				expect(Math.abs(p.x - x)).toBeLessThanOrEqual(frame.radius + 1e-6);
				expect(Math.abs(p.z - z)).toBeLessThanOrEqual(frame.radius + 1e-6);
				expect(Math.abs(p.y - y)).toBeLessThanOrEqual(frame.height / 2 + 1e-6);
			}
		}
	});

	it('is world-anchored: moving the camera does not drag the rain along (it recycles at the edges)', () => {
		const before = frameAt(0, 0, 0, 0.2);
		const after = frameAt(3, 0, 1, 0.2);
		let unchanged = 0;
		let wrapped = 0;
		for (let i = 0; i < 400; i++) {
			const a = worldOf(seedAt(i), before, i);
			const b = worldOf(seedAt(i), after, i);
			const same = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < 1e-6;
			if (same) unchanged++;
			else {
				// Re-entered on the far side: moved by exactly its layer's box width on some axis.
				const width = 2 * before.radius * FIELD_LAYER_RADII[fieldLayerOf(i)];
				const dx = Math.abs(a.x - b.x);
				const dz = Math.abs(a.z - b.z);
				expect(Math.abs(dx - width) < 1e-4 || Math.abs(dz - width) < 1e-4).toBe(true);
				wrapped++;
			}
		}
		expect(unchanged).toBeGreaterThan(250);
		expect(wrapped).toBeGreaterThan(0);
	});

	it('falls downward with phase and wraps from the bottom back to the top (recycling)', () => {
		let fell = 0;
		let recycled = 0;
		for (let i = 0; i < 400; i++) {
			const a = worldOf(seedAt(i), frameAt(0, 0, 0, 0.1), i);
			const b = worldOf(seedAt(i), frameAt(0, 0, 0, 0.1 + 0.002), i);
			if (b.y < a.y) fell++;
			else recycled++;
		}
		// 0.128 s of 9–12 m/s rain (~1.3 m of an 18 m box): almost all fall, a few (~7%) cross the
		// bottom and reappear at the top.
		expect(fell).toBeGreaterThan(340);
		expect(recycled).toBeGreaterThan(0);
	});

	it('puts most particles close to the camera and few far away, with the same count', () => {
		const frame = frameAt(0, 0, 0, 0.3);
		const n = 4000;
		const many = createFieldSeeds(n, 11);
		let near = 0;
		let far = 0;
		for (let i = 0; i < n; i++) {
			const seed: [number, number, number, number] = [
				many[i * 4],
				many[i * 4 + 1],
				many[i * 4 + 2],
				many[i * 4 + 3]
			];
			const p = worldOf(seed, frame, i);
			const r = Math.hypot(p.x, p.z);
			if (r < 4) near++;
			else if (r > 11 && r < 15) far++;
		}
		// Per unit area: near disc (r < 4) vs the outer ring (11..15 m).
		const nearDensity = near / (Math.PI * 16);
		const farDensity = far / (Math.PI * (15 * 15 - 11 * 11));
		const uniform = n / (30 * 30);
		expect(nearDensity).toBeGreaterThan(uniform * 3);
		expect(farDensity).toBeLessThan(uniform * 0.5);
		// Shares hold for any live count (a prefix of instances).
		const prefix = Array.from({ length: 333 }, (_, i) => fieldLayerOf(i));
		expect(prefix.filter((l) => l === 0).length / 333).toBeCloseTo(0.45, 1);
	});

	it('maps whole falls per period onto the requested speed range', () => {
		const { cycleMin, cycleRange } = fieldCyclesFor(8.5, 11.5, 18, 64);
		expect(Number.isInteger(cycleMin) && Number.isInteger(cycleRange)).toBe(true);
		expect(fieldFallSpeed(cycleMin, 18, 64)).toBeCloseTo(8.5, 0);
		expect(fieldFallSpeed(cycleMin + cycleRange - 1, 18, 64)).toBeCloseTo(11.5, 0);
		const snow = fieldCyclesFor(0.7, 1.45, 12, 256);
		expect(fieldFallSpeed(snow.cycleMin + snow.cycleRange - 1, 12, 256)).toBeLessThan(2);
	});

	it('counts field particles against the shared budget and never grows its buffers', () => {
		const manager = new ParticleEffectManager({ renderers: false });
		const q = PARTICLE_QUALITY.low;
		manager.setQuality(q);
		manager.registerField(FIELD, 1000);
		const share = Math.floor(q.budget * q.fieldShare);
		expect(manager.setFieldCount(FIELD.id, 100_000)).toBe(Math.min(1000, share));
		const bytes = manager.getStats().bufferBytes;
		for (let i = 0; i < 200; i++) manager.setFieldCount(FIELD.id, (i * 37) % 1200);
		expect(manager.getStats().bufferBytes).toBe(bytes);
		manager.setFieldCount(FIELD.id, 800);
		expect(manager.activeParticles).toBe(800);
		// Pooled effects only get what the field leaves.
		expect(manager.headroom(0)).toBeLessThanOrEqual(Math.floor((q.budget - 800) * q.ambientShare));
		// Disabling particles empties the field.
		manager.setEnabled(false);
		expect(manager.getFieldCount(FIELD.id)).toBe(0);
	});

	it('packs the rain, snow and ripple sprites into the one shared atlas', () => {
		const atlas = getParticleAtlas();
		expect(atlas.cells.get('rain-streak')?.length).toBe(1);
		expect(atlas.cells.get('snowflake')?.length).toBe(3);
		expect(atlas.cells.get('rain-ripple')?.length).toBe(1);
		expect(atlas.pixels.byteLength).toBe(256 * 256 * 4);
	});
});
