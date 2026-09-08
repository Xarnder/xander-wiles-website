import { createWorldPackage, readWorldPackage } from '../../world/WorldImportExport';
import { describe, it, expect } from 'vitest';
import {
	createMusicTree,
	radialSnap,
	positionOf,
	ringRadius,
	ringIndex,
	totalSteps,
	stepDuration,
	loopDuration,
	waveRadius,
	scaleNotes,
	species,
	pitch,
	vibrancyGain,
	endRingIndex,
	maxDurationSteps,
	clampDurationSteps,
	noteDurationSeconds,
	trailRadii,
	trailEndpoints,
	sustainProgress,
	type MusicPlantDefinition
} from '../MusicModel';
import { AudioScheduler } from '../AudioScheduler';
import { validateMusic } from '../MusicValidation';
import { migrateWorld } from '../../world/WorldMigrationManager';
import { captureWorldContent, applyContentToWorld } from '../../world/WorldSerializer';
import { richWorld, runtimeFromWorld } from '../../world/__tests__/worldFixtures';
const tree = createMusicTree(7, 2, -8);
tree.loop.bpm = 120;
const plant: MusicPlantDefinition = {
	id: 'p1',
	musicTreeId: tree.id,
	speciesId: 'flower',
	ringIndex: 3,
	angle: 0.431234,
	durationSteps: 4,
	growth: 0.6,
	vibrancy: 0.72
};
describe('spatial music', () => {
	it('exports and imports the song without changing any musical data', async () => {
		const world = richWorld({ musicTrees: [tree], musicPlants: [plant] });
		const result = readWorldPackage(await createWorldPackage(world));
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.world.musicTrees).toEqual([tree]);
			expect(result.world.musicPlants).toEqual([plant]);
		}
	});
	it('preserves arbitrary angles while snapping radius, with no angular sectors', () => {
		for (const angle of [-2.781, 0.431234, 0.431235, 2.847]) {
			const p = radialSnap(
				tree,
				tree.position.x + Math.cos(angle) * 8.36,
				tree.position.z + Math.sin(angle) * 8.36
			)!;
			expect(p.angle).toBeCloseTo(angle, 12);
			expect(Math.hypot(p.x - tree.position.x, p.z - tree.position.z)).toBeCloseTo(8, 12);
		}
	});
	it('rejects the trunk and beyond the garden', () => {
		expect(radialSnap(tree, 7, -8)).toBeNull();
		expect(radialSnap(tree, 200, -8)).toBeNull();
	});
	it('inverts ring indexing and reconstructs positions', () => {
		for (let i = 0; i < totalSteps(tree.loop); i++) {
			const r = ringRadius(tree.loop, i);
			expect(ringIndex(tree.loop, r)).toBe(i);
			const p = positionOf(tree, { angle: plant.angle, ringIndex: i });
			expect(Math.hypot(p.x - 7, p.z + 8)).toBeCloseTo(r, 12);
		}
	});
	it('maps 120 BPM to quarter-second subdivisions and an eight-second loop', () => {
		expect(stepDuration(tree.loop)).toBe(0.25);
		expect(loopDuration(tree.loop)).toBe(8);
	});
	it('crosses every ring at its note time, including the final ring and loop wrap', () => {
		for (let i = 0; i < 32; i++)
			expect(waveRadius(tree.loop, i * 0.25)).toBe(ringRadius(tree.loop, i));
		expect(waveRadius(tree.loop, 8)).toBe(3);
	});
	it('tempo changes time without moving plants', () => {
		const before = positionOf(tree, plant);
		const faster = { ...tree, loop: { ...tree.loop, bpm: 180 } };
		expect(positionOf(faster, plant)).toEqual(before);
		expect(stepDuration(faster.loop)).toBeLessThan(stepDuration(tree.loop));
	});
	it('growth maps only to scale notes, monotonically across every species and scale', () => {
		for (const scale of ['major-pentatonic', 'minor-pentatonic', 'major', 'minor'] as const)
			for (const sp of species) {
				const t = { ...tree, scale: { ...tree.scale, scale } };
				const notes = scaleNotes(t.scale, sp);
				let previous = 0;
				for (let i = 0; i <= 100; i++) {
					const n = pitch(t, { speciesId: sp.id, growth: i / 100 });
					expect(notes).toContain(n);
					expect(n).toBeGreaterThanOrEqual(previous);
					previous = n;
				}
			}
	});
	it('bounds nonlinear vibrancy gain', () => {
		for (let i = -10; i <= 110; i++) expect(vibrancyGain(i / 100)).toBeGreaterThanOrEqual(0.015);
		expect(vibrancyGain(2)).toBeCloseTo(0.175);
		expect(vibrancyGain(0.5)).toBeLessThan((vibrancyGain(0) + vibrancyGain(1)) / 2);
	});
	it('persists exact composition through the actual snapshot/save/JSON path', () => {
		const world = richWorld({ musicTrees: [tree], musicPlants: [plant] });
		const runtime = Object.assign(runtimeFromWorld(world), {
			getMusicTrees: () => world.musicTrees,
			getMusicPlants: () => world.musicPlants
		});
		const loaded = JSON.parse(
			JSON.stringify(applyContentToWorld(world, captureWorldContent(runtime)))
		);
		expect(loaded.musicTrees).toEqual([tree]);
		expect(loaded.musicPlants).toEqual([plant]);
		expect(positionOf(loaded.musicTrees[0], loaded.musicPlants[0])).toEqual(
			positionOf(tree, plant)
		);
		expect(validateMusic(loaded.musicTrees, loaded.musicPlants)).toBeNull();
	});
	it('migrates v1 worlds to empty compositions', () => {
		const r = migrateWorld({
			...richWorld(),
			schemaVersion: 1,
			musicTrees: undefined,
			musicPlants: undefined
		});
		expect(r.ok && r.value.musicTrees).toEqual([]);
		expect(r.ok && r.value.musicPlants).toEqual([]);
	});
	it('rejects unsafe sizes, unknown species, invalid references and nonfinite values', () => {
		expect(validateMusic([{ ...tree, loop: { ...tree.loop, bpm: 0 } }], [plant])).toBeTruthy();
		for (const change of [
			{ speciesId: 'missing' },
			{ angle: NaN },
			{ ringIndex: 32 },
			{ musicTreeId: 'missing' },
			{ growth: 2 }
		])
			expect(validateMusic([tree], [{ ...plant, ...change }])).toBeTruthy();
	});
});
describe('sustained notes', () => {
	it('endRingIndex = ringIndex + durationSteps', () => {
		expect(endRingIndex(plant)).toBe(plant.ringIndex + plant.durationSteps);
		expect(endRingIndex({ ringIndex: 8, durationSteps: 4 })).toBe(12);
		expect(endRingIndex({ ringIndex: 0, durationSteps: 1 })).toBe(1);
	});
	it('trail start/end radii match the start and end ring exactly', () => {
		const { startRadius, endRadius } = trailRadii(tree, plant);
		expect(startRadius).toBeCloseTo(ringRadius(tree.loop, plant.ringIndex), 12);
		expect(endRadius).toBeCloseTo(ringRadius(tree.loop, endRingIndex(plant)), 12);
	});
	it('the trail stays on the plant angle at both ends — no angular drift along its length', () => {
		const { start, end } = trailEndpoints(tree, plant);
		const startAngle = Math.atan2(start.z - tree.position.z, start.x - tree.position.x);
		const endAngle = Math.atan2(end.z - tree.position.z, end.x - tree.position.x);
		expect(startAngle).toBeCloseTo(plant.angle, 10);
		expect(endAngle).toBeCloseTo(plant.angle, 10);
	});
	it('trail world length = durationSteps * ringSpacing', () => {
		const { start, end } = trailEndpoints(tree, plant);
		const length = Math.hypot(end.x - start.x, end.z - start.z);
		expect(length).toBeCloseTo(plant.durationSteps * tree.loop.ringSpacing, 10);
	});
	it('example from spec: firstRingRadius=3, ringSpacing=1, ringIndex=5, durationSteps=4 -> 8m to 12m', () => {
		const t = createMusicTree();
		t.loop.firstRingRadius = 3;
		t.loop.ringSpacing = 1;
		const p = { ringIndex: 5, durationSteps: 4 };
		const { startRadius, endRadius } = trailRadii(t, p);
		expect(startRadius).toBe(8);
		expect(endRadius).toBe(12);
	});
	it('BPM independence: changing tempo leaves the trail geometry (start/end radii, world length) exactly unchanged', () => {
		const before = trailRadii(tree, plant);
		const beforeEnds = trailEndpoints(tree, plant);
		const faster = { ...tree, loop: { ...tree.loop, bpm: 240 } };
		const after = trailRadii(faster, plant);
		const afterEnds = trailEndpoints(faster, plant);
		expect(after).toEqual(before);
		expect(afterEnds).toEqual(beforeEnds);
	});
	it('BPM changes the actual note duration in seconds correctly', () => {
		const slow = noteDurationSeconds(tree.loop, plant.durationSteps);
		const fast = noteDurationSeconds({ ...tree.loop, bpm: tree.loop.bpm * 2 }, plant.durationSteps);
		expect(slow).toBeCloseTo(plant.durationSteps * stepDuration(tree.loop), 12);
		expect(fast).toBeCloseTo(slow / 2, 12);
	});
	it('duration cannot exceed the loop: maxDurationSteps and clampDurationSteps enforce the boundary', () => {
		const last = totalSteps(tree.loop) - 1;
		expect(maxDurationSteps(tree.loop, last)).toBe(1);
		expect(maxDurationSteps(tree.loop, 0)).toBe(totalSteps(tree.loop));
		expect(clampDurationSteps(tree.loop, last, 99)).toBe(1);
		expect(clampDurationSteps(tree.loop, 0, 99)).toBe(totalSteps(tree.loop));
		expect(clampDurationSteps(tree.loop, 4, 0)).toBe(1); // never below the shortest playable note
		expect(
			endRingIndex({ ringIndex: 4, durationSteps: clampDurationSteps(tree.loop, 4, 99) })
		).toBe(totalSteps(tree.loop));
	});
	it('minimum duration is always 1 step, the shortest playable note', () => {
		expect(clampDurationSteps(tree.loop, 0, -5)).toBe(1);
		expect(clampDurationSteps(tree.loop, 0, 0)).toBe(1);
	});
	it('save/load round-trips durationSteps exactly, alongside every other plant field', () => {
		const world = richWorld({ musicTrees: [tree], musicPlants: [plant] });
		const runtime = Object.assign(runtimeFromWorld(world), {
			getMusicTrees: () => world.musicTrees,
			getMusicPlants: () => world.musicPlants
		});
		const loaded = JSON.parse(
			JSON.stringify(applyContentToWorld(world, captureWorldContent(runtime)))
		);
		expect(loaded.musicPlants[0].durationSteps).toBe(plant.durationSteps);
	});
	it('visual sustain progress derives purely from known audio-clock elapsed values, matching the audio timeline', () => {
		const noteStart = plant.ringIndex * stepDuration(tree.loop); // 3 * 0.25 = 0.75s
		const noteDuration = noteDurationSeconds(tree.loop, plant.durationSteps); // 4 * 0.25 = 1s

		expect(sustainProgress(tree.loop, noteStart, plant)).toEqual({ active: true, progress: 0 });
		expect(sustainProgress(tree.loop, noteStart + noteDuration / 2, plant)).toEqual({
			active: true,
			progress: 0.5
		});
		expect(sustainProgress(tree.loop, noteStart + noteDuration, plant).active).toBe(false);
		expect(sustainProgress(tree.loop, noteStart + noteDuration, plant).progress).toBe(1);
		expect(sustainProgress(tree.loop, noteStart - 0.1, plant).active).toBe(false);
		// Wraps correctly into the NEXT loop iteration too, same as the wave/scheduler themselves.
		const nextLoop = sustainProgress(
			tree.loop,
			loopDuration(tree.loop) + noteStart + noteDuration / 4,
			plant
		);
		expect(nextLoop).toEqual({ active: true, progress: 0.25 });
	});
});
describe('audio clock scheduler', () => {
	it('schedules same-ring chords at exactly the same timestamp without duplicate ticks', () => {
		const scheduler = new AudioScheduler(1, tree.loop);
		const notes: { id: string; time: number }[] = [];
		const chord = [plant, { ...plant, id: 'p2', angle: -2 }];
		const emit = (ring: number, time: number) => {
			for (const p of chord) if (p.ringIndex === ring) notes.push({ id: p.id, time });
		};
		for (let now = 0.95; now < 2; now += 0.025) scheduler.schedule(now, emit);
		expect(notes).toEqual([
			{ id: 'p1', time: 1.75 },
			{ id: 'p2', time: 1.75 }
		]);
	});
	it('wraps once with integer subdivision identity', () => {
		const scheduler = new AudioScheduler(0, tree.loop);
		const events: number[][] = [];
		for (let now = 0; now < 8.1; now += 0.025)
			scheduler.schedule(now, (i, t) => events.push([i, t]));
		expect(events.filter(([i]) => i === 0)).toEqual([
			[0, 0],
			[0, 8]
		]);
		expect(new Set(events.map(([, t]) => t)).size).toBe(events.length);
	});
	it('skips missed notes on a stall without bursting or replaying', () => {
		const scheduler = new AudioScheduler(0, tree.loop);
		scheduler.schedule(0, () => {});
		const times: number[] = [];
		scheduler.schedule(6, (i, t) => times.push(t));
		expect(times).toEqual([6]);
		scheduler.schedule(6, () => {
			throw Error('duplicate');
		});
	});
});
