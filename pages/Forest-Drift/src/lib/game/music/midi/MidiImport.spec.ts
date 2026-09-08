import { describe, it, expect } from 'vitest';
import { parseLocalMidi } from './MidiParser';
import { defaultImportOptions, planMidiImport, chooseGrid, mappedSpecies } from './MidiPlanner';
import { layoutGarden } from './GardenLayout';
import { fixtureMidi, midiBytes } from './MidiFixtures';
import { MusicTimeline } from '../MusicTimeline';
import { plantMetrics } from '../PlantVisualMetrics';
import { createMusicTree, pitch, positionOf, type MusicPlantDefinition } from '../MusicModel';
import { migrateMusicV3 } from '../MusicMigration';
import { createWorldPackage, readWorldPackage } from '../../world/WorldImportExport';
import { richWorld } from '../../world/__tests__/worldFixtures';
const note = (id: string, ringIndex = 0, pitchMidi = 60): MusicPlantDefinition => ({
	id,
	musicTreeId: 't',
	speciesId: 'flower',
	instrumentId: 'bell',
	pitchMidi,
	ringIndex,
	durationSteps: 1,
	angle: 0,
	vibrancy: 0.8
});
const circularSpan = (angles: number[]) => {
	const a = angles.map((x) => (x + Math.PI * 2) % (Math.PI * 2)).sort((x, y) => x - y);
	let gap = a[0] + Math.PI * 2 - a[a.length - 1];
	for (let i = 1; i < a.length; i++) gap = Math.max(gap, a[i] - a[i - 1]);
	return Math.PI * 2 - gap;
};
describe('local MIDI parsing and plans', () => {
	for (const format of [0, 1] as const)
		it(`reads format ${format} notes, tracks, PPQ, programs and velocity`, () => {
			const a = parseLocalMidi(fixtureMidi(32, format), 'fixture.mid');
			expect(a.notes).toHaveLength(32);
			expect(a.ppq).toBe(480);
			expect(a.tracks[0].program).toBe(0);
			expect(a.notes[2].pitch).toBe(61);
			expect(a.notes[0].velocity).toBe(50);
			expect(a.barStarts).toEqual([0, 4, 8]);
		});
	it('rejects truncated files, format 2, SMPTE timing and corrupt headers', () => {
		for (const transform of [
			(a: Uint8Array) => a.slice(0, 20),
			(a: Uint8Array) => {
				a[9] = 2;
				return a;
			},
			(a: Uint8Array) => {
				a[12] = 0x80;
				return a;
			},
			(a: Uint8Array) => {
				a[0] = 0;
				return a;
			}
		]) {
			expect(() =>
				parseLocalMidi(transform(new Uint8Array(fixtureMidi())).buffer as ArrayBuffer, 'bad.mid')
			).toThrow();
		}
	});
	it('extends repeated same-pitch voices independently under CC64, including velocity-zero release', () => {
		const bytes = midiBytes({
			header: { format: 0, numTracks: 1, ticksPerBeat: 480 },
			tracks: [
				[
					{ deltaTime: 0, type: 'controller', channel: 0, controllerType: 64, value: 127 },
					{ deltaTime: 0, type: 'noteOn', channel: 0, noteNumber: 60, velocity: 100 },
					{ deltaTime: 240, type: 'noteOn', channel: 0, noteNumber: 60, velocity: 0 },
					{ deltaTime: 0, type: 'noteOn', channel: 0, noteNumber: 60, velocity: 90 },
					{ deltaTime: 240, type: 'noteOff', channel: 0, noteNumber: 60, velocity: 0 },
					{ deltaTime: 480, type: 'controller', channel: 0, controllerType: 64, value: 0 },
					{ deltaTime: 0, type: 'endOfTrack' }
				]
			]
		});
		const a = parseLocalMidi(bytes, 'pedal.mid');
		expect(a.notes.map((n) => n.start)).toEqual([0, 0.5]);
		expect(a.notes.map((n) => n.end)).toEqual([2, 2]);
		const p = planMidiImport(a, defaultImportOptions(a));
		expect(p.notes.map((n) => n.durationSteps)).toEqual([4, 3]);
	});
	it('preserves chromatic pitches across the full MIDI range', () => {
		const a = parseLocalMidi(fixtureMidi(), 'pitches.mid');
		const pitches = [0, 36, 60, 61, 84, 108, 127];
		a.notes = a.notes.slice(0, 7).map((n, i) => ({ ...n, pitch: pitches[i] }));
		const p = planMidiImport(a, defaultImportOptions(a));
		expect(p.notes.map((n) => n.pitchMidi)).toEqual(pitches);
		expect(p.notes.map((n) => n.vibrancy)).toEqual(a.notes.map((n) => n.velocity / 127));
	});
	it('handles General MIDI families and drums as percussion identities', () => {
		expect(mappedSpecies(34)).toBe('mushroom');
		expect(mappedSpecies(48)).toBe('fern');
		expect(mappedSpecies(73)).toBe('reed');
		const a = parseLocalMidi(fixtureMidi(), 'drums.mid');
		a.notes = a.notes.slice(0, 3).map((n, i) => ({ ...n, channel: 9, pitch: [36, 38, 42][i] }));
		const p = planMidiImport(a, defaultImportOptions(a));
		expect(p.notes.map((n) => n.instrumentId)).toEqual(['drum-kick', 'drum-snare', 'drum-hat']);
		expect(p.notes.map((n) => n.percussionNote)).toEqual([36, 38, 42]);
	});
	it('normalizes bars 9–16, carrying tempo and clipped notes', () => {
		const a = parseLocalMidi(fixtureMidi(256), 'section.mid');
		a.notes.push({ ...a.notes[0], start: 31, end: 34 });
		const o = { ...defaultImportOptions(a), startBar: 9, endBar: 16 };
		const p = planMidiImport(a, o);
		expect(p.timeline.tempoMap[0].bpm).toBe(80);
		expect(p.notes.some((n) => n.ringIndex === 0 && n.durationSteps > 1)).toBe(true);
		expect(p.warnings.join(' ')).toContain('section start');
		expect(Math.min(...p.notes.map((n) => n.ringIndex))).toBe(0);
	});
	it('clips notes at the section end rather than wrapping', () => {
		const a = parseLocalMidi(fixtureMidi(64), 'clip.mid');
		a.notes[0].end = 12;
		const p = planMidiImport(a, { ...defaultImportOptions(a), endBar: 1 });
		expect(p.notes[0].durationSteps).toBe(p.timeline.totalSteps);
		expect(p.warnings.join(' ')).toContain('section end');
	});
	it('preserves changing meter at section boundaries', () => {
		const a = parseLocalMidi(fixtureMidi(128), 'meter.mid');
		a.meters = [
			{ quarter: 0, numerator: 4, denominator: 4 },
			{ quarter: 8, numerator: 6, denominator: 8 },
			{ quarter: 14, numerator: 7, denominator: 8 }
		];
		a.barStarts = [0, 4, 8, 11, 14, 17.5, 21];
		const p = planMidiImport(a, { ...defaultImportOptions(a), startBar: 3, endBar: 5 });
		expect(p.timeline.meterMap).toEqual([
			{ step: 0, numerator: 6, denominator: 8 },
			{ step: 24, numerator: 7, denominator: 8 }
		]);
		expect(p.timeline.totalSteps).toBe(38);
	});
	it('uses the existing timeline when adding and never shrinks its physical spacing', () => {
		const a = parseLocalMidi(fixtureMidi(32), 'add.mid'),
			t = createMusicTree();
		t.loop.bpm = 77;
		t.loop.firstRingRadius = 20;
		t.loop.ringSpacing = 10;
		const p = planMidiImport(a, {
			...defaultImportOptions(a),
			target: 'add',
			existingTree: t,
			existingPlants: []
		});
		expect(p.timeline.tempoMap[0].bpm).toBe(77);
		expect(p.layout.firstRingRadius).toBeGreaterThanOrEqual(20);
		expect(p.layout.ringSpacing).toBeGreaterThanOrEqual(10);
		expect(p.warnings.join(' ')).toContain('current Music Tree');
	});
	it('plans deterministically with arbitrary free angles and larger spacing presets', () => {
		const a = parseLocalMidi(fixtureMidi(100), 'same.mid'),
			o = defaultImportOptions(a);
		const p = planMidiImport(a, o),
			again = planMidiImport(a, o);
		expect(p).toEqual(again);
		expect(
			p.notes.some(
				(n) => Math.abs(n.angle / (Math.PI / 4) - Math.round(n.angle / (Math.PI / 4))) > 0.01
			)
		).toBe(true);
		expect(planMidiImport(a, { ...o, spacing: 'epic' }).layout.outerRadius).toBeGreaterThan(
			p.layout.outerRadius
		);
	});
	it('clusters notes into a shared garden sector and packs tight closer than compact', () => {
		const a = parseLocalMidi(fixtureMidi(32), 'cluster.mid'),
			o = defaultImportOptions(a);
		const spread = planMidiImport(a, o),
			clustered = planMidiImport(a, { ...o, cluster: true }),
			compact = planMidiImport(a, { ...o, spacing: 'compact' }),
			tight = planMidiImport(a, { ...o, spacing: 'tight' });
		expect(clustered).toEqual(planMidiImport(a, { ...o, cluster: true }));
		expect(circularSpan(clustered.notes.map((n) => n.angle))).toBeLessThan(1);
		expect(circularSpan(spread.notes.map((n) => n.angle))).toBeGreaterThan(3);
		expect(tight.layout.outerRadius).toBeLessThan(compact.layout.outerRadius);
		expect(tight.layout.ringSpacing).toBeLessThan(compact.layout.ringSpacing);
	});
	it('serializes imported notes and timelines without the source file', async () => {
		const a = parseLocalMidi(fixtureMidi(64), 'song.mid'),
			p = planMidiImport(a, defaultImportOptions(a)),
			t = createMusicTree();
		t.loop.timeline = p.timeline;
		t.loop.firstRingRadius = p.layout.firstRingRadius;
		t.loop.ringSpacing = p.layout.ringSpacing;
		const notes = p.notes.map((n) => ({ ...n, musicTreeId: t.id }));
		const world = richWorld({ musicTrees: [t], musicPlants: notes });
		const result = readWorldPackage(await createWorldPackage(world));
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.world.musicPlants).toEqual(notes);
			expect(result.world.musicTrees).toEqual([t]);
		}
	});
});
describe('rhythm, tempo and physical metrics', () => {
	for (const [resolution, grid] of [
		['eighth', 2],
		['sixteenth', 4],
		['thirtysecond', 8],
		['triplet', 12]
	] as const)
		it(`selects ${resolution}`, () => expect(chooseGrid([], resolution)).toBe(grid));
	it('Auto tolerates human timing while preserving triplets and mixed rhythms', () => {
		expect(
			chooseGrid(
				[0, 0.5, 1, 1.5].map((start) => ({ start: start + 0.02, end: start + 0.49 })),
				'auto'
			)
		).toBe(2);
		expect(
			chooseGrid(
				[0, 1 / 3, 2 / 3].map((start) => ({ start, end: start + 1 / 3 })),
				'auto'
			)
		).toBe(3);
		expect(
			chooseGrid(
				[0, 1 / 3, 0.5, 2 / 3].map((start) => ({ start, end: start + 1 / 6 })),
				'auto'
			)
		).toBe(6);
	});
	it('integrates 100 → 140 → 80 BPM and inverts audio time exactly', () => {
		const t = new MusicTimeline({
			totalSteps: 48,
			grid: { stepsPerQuarter: 4 },
			tempoMap: [
				{ step: 0, bpm: 100 },
				{ step: 16, bpm: 140 },
				{ step: 32, bpm: 80 }
			],
			meterMap: [{ step: 0, numerator: 4, denominator: 4 }]
		});
		expect(t.secondsAt(16)).toBeCloseTo(2.4);
		expect(t.secondsAt(32)).toBeCloseTo(2.4 + 12 / 7);
		expect(t.duration).toBeCloseTo(2.4 + 12 / 7 + 3);
		for (const step of [0, 3.25, 16, 23.5, 32, 48])
			expect(t.stepAt(t.secondsAt(step))).toBeCloseTo(step);
	});
	for (const [numerator, denominator] of [
		[3, 4],
		[4, 4],
		[5, 4],
		[6, 8],
		[7, 8],
		[9, 8],
		[12, 8]
	])
		it(`labels ${numerator}/${denominator} bars`, () => {
			const perBar = ((numerator * 4) / denominator) * 4;
			const t = new MusicTimeline({
				totalSteps: perBar * 4,
				grid: { stepsPerQuarter: 4 },
				tempoMap: [{ step: 0, bpm: 100 }],
				meterMap: [{ step: 0, numerator, denominator }]
			});
			expect(t.label(perBar)).toMatchObject({ bar: 2, beat: 1 });
			expect(t.label(perBar + (4 * 4) / denominator)).toMatchObject({ bar: 2, beat: 2 });
		});
	it('has finite, monotonic, octave-multiplicative sizes from MIDI 0 through 127', () => {
		let previous = Infinity;
		for (let pitchMidi = 0; pitchMidi < 128; pitchMidi++) {
			const m = plantMetrics({ speciesId: 'flower', pitchMidi });
			expect(Number.isFinite(m.height)).toBe(true);
			expect(m.height).toBeLessThanOrEqual(previous);
			previous = m.height;
		}
		expect(plantMetrics({ speciesId: 'flower', pitchMidi: 0 }).height).toBeGreaterThan(20);
		expect(previous).toBeLessThan(0.15);
	});
	it('expands rings for giants and fits a dense chord with true centre separation', () => {
		const tiny = [note('a', 0, 108), note('b', 1, 108)],
			giant = [note('a', 0, 36), note('b', 1, 36)];
		expect(layoutGarden(giant, 1, 1).ringSpacing).toBeGreaterThan(
			layoutGarden(tiny, 1, 1).ringSpacing
		);
		const chord = Array.from({ length: 80 }, (_, i) => note(`n${i}`, 0, 100));
		const l = layoutGarden(chord, 1, 42);
		const tightCluster = layoutGarden(chord, 1, 42, [], undefined, { cluster: true, tight: true });
		const t = createMusicTree();
		Object.assign(t.loop, l);
		for (let i = 0; i < chord.length; i++)
			for (let j = i + 1; j < chord.length; j++) {
				const a = positionOf(t, chord[i]),
					b = positionOf(t, chord[j]);
				expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(
					plantMetrics(chord[i]).placementClearanceRadius +
						plantMetrics(chord[j]).placementClearanceRadius
				);
			}
		Object.assign(t.loop, tightCluster);
		for (let i = 0; i < chord.length; i++)
			for (let j = i + 1; j < chord.length; j++) {
				const a = positionOf(t, chord[i]),
					b = positionOf(t, chord[j]);
				expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(
					plantMetrics(chord[i]).placementClearanceRadius +
						plantMetrics(chord[j]).placementClearanceRadius
				);
			}
	});
	it('migrates old growth to the exact old pitch and equivalent anchored visual size', () => {
		const t = createMusicTree();
		const old = {
			id: 'old',
			musicTreeId: t.id,
			speciesId: 'flower',
			ringIndex: 3,
			durationSteps: 1,
			angle: 0.7,
			growth: 0.6,
			vibrancy: 0.7
		};
		const expected = pitch(t, old);
		const result = migrateMusicV3({ musicTrees: [t], musicPlants: [old] });
		if (!('musicPlants' in result)) throw Error('Missing music');
		const p = (result.musicPlants as MusicPlantDefinition[])[0];
		expect(p.pitchMidi).toBe(expected);
		expect(p.growth).toBeUndefined();
		expect(plantMetrics(p).scale).toBeCloseTo(0.65 + 0.6 * 0.85);
		expect((result.musicTrees as (typeof t)[])[0].loop.timeline?.tempoMap).toEqual([
			{ step: 0, bpm: 90 }
		]);
	});
});
