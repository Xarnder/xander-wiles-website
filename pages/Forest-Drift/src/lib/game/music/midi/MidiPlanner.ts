import { species, timelineDefinition } from '../MusicModel';
import { MusicTimeline } from '../MusicTimeline';
import { plantMetrics } from '../PlantVisualMetrics';
import { layoutGarden } from './GardenLayout';
import type { MidiAnalysis, SourceNote } from './MidiParser';
import type {
	MidiImportOptions,
	MidiImportPlan,
	TimingResolution,
	MidiImportedNotePlan
} from './MidiImportPlan';
export function mappedSpecies(program: number, percussion = false) {
	if (percussion) return 'mushroom';
	if (program >= 32 && program < 40) return 'mushroom';
	if (program >= 40 && program < 56) return 'fern';
	if (program >= 64 && program < 80) return 'reed';
	if (program >= 80)
		return program < 88
			? 'crystal'
			: program < 96
				? 'fern'
				: program < 112
					? 'crystal'
					: 'mushroom';
	return 'flower';
}
export function programFamily(program: number, percussion = false) {
	return percussion
		? 'Percussion'
		: ([
				'Piano',
				'Chromatic percussion',
				'Organ',
				'Guitar',
				'Bass',
				'Strings',
				'Ensemble',
				'Brass',
				'Reed',
				'Pipe',
				'Synth lead',
				'Synth pad',
				'Synth effects',
				'Ethnic',
				'Percussive',
				'Sound effects'
			][Math.floor(program / 8)] ?? 'Instrument') + ` (${program + 1})`;
}
export function drumInstrument(note: number) {
	return [35, 36].includes(note)
		? 'drum-kick'
		: [42, 44, 46, 49, 51, 52, 55, 57, 59].includes(note)
			? 'drum-hat'
			: [38, 39, 40].includes(note)
				? 'drum-snare'
				: 'drum-tom';
}
export function defaultImportOptions(a: MidiAnalysis): MidiImportOptions {
	return {
		startBar: 1,
		endBar: Math.min(8, a.barStarts.length - 1),
		resolution: 'auto',
		spacing: 'balanced',
		cluster: false,
		target: 'new',
		tracks: Object.fromEntries(
			a.tracks.map((t) => [
				t.id,
				{ enabled: true, speciesId: mappedSpecies(t.program, t.percussion) }
			])
		)
	};
}
export function chooseGrid(
	notes: Pick<SourceNote, 'start' | 'end'>[],
	resolution: TimingResolution
) {
	if (resolution !== 'auto')
		return { eighth: 2, sixteenth: 4, thirtysecond: 8, triplet: 12 }[resolution];
	const samples: number[] = [];
	const stride = Math.max(1, Math.floor(notes.length / 10000));
	for (let i = 0; i < notes.length; i += stride) samples.push(notes[i].start, notes[i].end);
	for (const grid of [2, 3, 4, 6, 8, 12]) {
		const errors = samples
			.map((q) => Math.abs(Math.round(q * grid) / grid - q))
			.sort((a, b) => a - b);
		const mean = errors.reduce((a, b) => a + b, 0) / Math.max(1, errors.length);
		if (mean <= 0.032 && (errors[Math.floor(errors.length * 0.95)] ?? 0) <= 0.065) return grid;
	}
	return 12;
}
export function planMidiImport(a: MidiAnalysis, o: MidiImportOptions): MidiImportPlan {
	if (
		!Number.isInteger(o.startBar) ||
		!Number.isInteger(o.endBar) ||
		o.startBar < 1 ||
		o.endBar < o.startBar ||
		o.endBar >= a.barStarts.length
	)
		throw Error('Choose a valid inclusive bar range.');
	if (o.target !== 'new' && !o.existingTree) throw Error('Select a Music Tree first.');
	const start = a.barStarts[o.startBar - 1],
		end = a.barStarts[o.endBar];
	const warnings = [...a.warnings];
	let clippedStart = 0,
		clippedEnd = 0;
	const selected = a.notes
		.filter((n) => o.tracks[n.trackId]?.enabled && n.start < end && n.end > start)
		.map((n) => {
			if (n.start < start) clippedStart++;
			if (n.end > end) clippedEnd++;
			return { ...n, start: Math.max(start, n.start) - start, end: Math.min(end, n.end) - start };
		});
	if (!selected.length) throw Error('No notes in the selected tracks and bars.');
	const grid =
		o.target === 'add'
			? timelineDefinition(o.existingTree!.loop).grid.stepsPerQuarter
			: chooseGrid(selected, o.resolution);
	const effective = <T extends { quarter: number }>(map: T[]) =>
		map.filter((e) => e.quarter <= start).at(-1)!;
	const tempos = [
		{ ...effective(a.tempos), quarter: start },
		...a.tempos.filter((t) => t.quarter > start && t.quarter < end)
	];
	const meters = [
		{ ...effective(a.meters), quarter: start },
		...a.meters.filter((t) => t.quarter > start && t.quarter < end)
	];
	const timeline =
		o.target === 'add'
			? structuredClone(timelineDefinition(o.existingTree!.loop))
			: {
					totalSteps: Math.ceil((end - start) * grid - 1e-8),
					grid: { stepsPerQuarter: grid },
					tempoMap: tempos.map((t) => ({ step: (t.quarter - start) * grid, bpm: t.bpm })),
					meterMap: meters.map((t) => ({
						step: (t.quarter - start) * grid,
						numerator: t.numerator,
						denominator: t.denominator
					}))
				};
	if (timeline.totalSteps > 2000000)
		throw Error('This import exceeds the two-million-step browser safety limit.');
	const timing = new MusicTimeline(timeline);
	let totalError = 0,
		maxError = 0,
		discarded = 0;
	let seed = a.hash;
	const seedText = JSON.stringify({ ...o, existingTree: undefined, existingPlants: undefined });
	for (const c of seedText) seed = Math.imul(seed ^ c.charCodeAt(0), 16777619) >>> 0;
	const notes: MidiImportedNotePlan[] = [];
	for (let i = 0; i < selected.length; i++) {
		const n = selected[i],
			mapping = o.tracks[n.trackId],
			sp = species.find((s) => s.id === mapping.speciesId);
		if (!sp) throw Error('Unknown plant mapping.');
		const ringIndex = Math.max(0, Math.round(n.start * grid));
		if (ringIndex >= timeline.totalSteps) {
			discarded++;
			continue;
		}
		const durationSteps = Math.max(
			1,
			Math.min(timeline.totalSteps - ringIndex, Math.round(n.end * grid) - ringIndex)
		);
		const error = Math.abs(timing.secondsAt(ringIndex) - timing.secondsAt(n.start * grid)) * 1000;
		totalError += error;
		maxError = Math.max(maxError, error);
		const p = {
			id: `midi-${seed.toString(16)}-${i}`,
			musicTreeId: 'plan',
			sourceTrackId: n.trackId,
			speciesId: sp.id,
			instrumentId: n.channel === 9 ? drumInstrument(n.pitch) : sp.instrumentId,
			pitchMidi: n.pitch,
			percussionNote: n.channel === 9 ? n.pitch : undefined,
			vibrancy: n.velocity / 127,
			ringIndex,
			durationSteps,
			angle: 0
		};
		notes.push({ ...p, visualMetrics: plantMetrics(p) });
	}
	if (!notes.length) throw Error('No selected notes fit this tree’s timeline.');
	const existing = o.target === 'add' ? (o.existingPlants ?? []) : [];
	const minimum =
		o.target === 'add'
			? {
					firstRingRadius: o.existingTree!.loop.firstRingRadius,
					ringSpacing: o.existingTree!.loop.ringSpacing
				}
			: o.spacing === 'tight'
				? { firstRingRadius: 1.6, ringSpacing: 0.28 }
				: undefined;
	const layout = layoutGarden(
		notes,
		{ tight: 1, compact: 1, balanced: 1.35, epic: 2.25 }[o.spacing],
		seed,
		existing,
		minimum,
		{ cluster: o.cluster, tight: o.spacing === 'tight' }
	);
	if (clippedStart) warnings.push(`${clippedStart} notes were clipped at the section start.`);
	if (clippedEnd) warnings.push(`${clippedEnd} notes were clipped at the section end.`);
	if (discarded)
		warnings.push(`${discarded} notes outside the current tree timeline were excluded.`);
	if (o.target === 'add')
		warnings.push(
			'Add uses the current Music Tree’s tempo, meter and grid. Source tempo/meter changes are not imported. Existing angles and timing are preserved; spacing may grow.'
		);
	if (notes.length >= 10000)
		warnings.push(
			`${notes.length.toLocaleString()} plants: large import. Visuals will stream near you.`
		);
	if (a.maxSimultaneous > 128)
		warnings.push(
			'Polyphony exceeds 128 voices. Dense passages may drop voices at the audio safety limit.'
		);
	const outerRadius = layout.firstRingRadius + timeline.totalSteps * layout.ringSpacing;
	if (outerRadius > 1000)
		warnings.push(`Estimated garden diameter is ${((outerRadius * 2) / 1000).toFixed(2)} km.`);
	const heights = notes.map((n) => n.visualMetrics.height);
	return {
		source: {
			fileName: a.fileName,
			ppq: a.ppq,
			startBar: o.startBar,
			endBar: o.endBar,
			hash: a.hash
		},
		timeline,
		notes,
		layout: { ...layout, outerRadius, spacing: o.spacing, cluster: o.cluster },
		statistics: {
			plants: notes.length,
			tracks: new Set(notes.map((n) => n.sourceTrackId)).size,
			smallestPlant: Math.min(...heights),
			largestPlant: Math.max(...heights),
			maxSimultaneous: a.maxSimultaneous,
			averageAdjustmentMs: totalError / notes.length,
			maxAdjustmentMs: maxError
		},
		warnings,
		target: o.target,
		targetTreeId: o.existingTree?.id
	};
}
