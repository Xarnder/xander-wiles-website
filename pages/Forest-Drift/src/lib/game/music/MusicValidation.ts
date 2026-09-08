import { instruments } from './InstrumentLibrary';
import {
	species,
	scales,
	scaleNotes,
	totalSteps,
	endRingIndex,
	type MusicTreeDefinition,
	type MusicPlantDefinition
} from './MusicModel';
/** Validate before allocating rendering/audio resources. Reject corrupt songs rather than retuning silently. */
export function validateMusic(trees: unknown, plants: unknown): string | null {
	if (!Array.isArray(trees) || !Array.isArray(plants))
		return 'Music trees and plants must be arrays';
	if (trees.length > 64 || plants.length > 100000) return 'Too many music trees or plants';
	const ids = new Set<string>();
	const map = new Map<string, MusicTreeDefinition>();
	const number = (n: unknown, min: number, max: number) =>
		typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
	for (const raw of trees) {
		const t = raw as MusicTreeDefinition;
		if (
			!t ||
			typeof t.id !== 'string' ||
			!t.id ||
			ids.has(t.id) ||
			!t.position ||
			!t.loop ||
			!t.scale
		)
			return 'Invalid Music Tree';
		if (
			!Object.values(t.position).every((n) => number(n, -1e6, 1e6)) ||
			!['x', 'y', 'z'].every((k) => number(t.position[k as keyof typeof t.position], -1e6, 1e6))
		)
			return 'Invalid Music Tree position';
		const s = t.loop;
		if (
			!number(s.bpm, 1, 1000) ||
			!number(s.firstRingRadius, 2, 1e7) ||
			!number(s.ringSpacing, 0.5, 1e6)
		)
			return 'Invalid music loop settings';
		for (const n of [s.beatsPerBar, s.barsPerLoop, s.subdivisionsPerBeat])
			if (!number(n, 1, 100000) || !Number.isInteger(n)) return 'Invalid music subdivisions';
		if (!number(totalSteps(s), 1, 2000000) || !Number.isInteger(totalSteps(s)))
			return 'Too many music subdivisions';
		if (s.timeline) {
			const t = s.timeline;
			if (
				!t.grid ||
				!number(t.grid.stepsPerQuarter, 1, 96) ||
				!Number.isInteger(t.grid.stepsPerQuarter) ||
				!Array.isArray(t.tempoMap) ||
				!Array.isArray(t.meterMap) ||
				!t.tempoMap.length ||
				!t.meterMap.length ||
				t.tempoMap.length > 10000 ||
				t.meterMap.length > 10000
			)
				return 'Invalid music timeline';
			for (const map of [t.tempoMap, t.meterMap]) {
				let previous = -1;
				for (const e of map) {
					if (
						!e ||
						!number(e.step, 0, t.totalSteps) ||
						e.step >= t.totalSteps ||
						e.step <= previous
					)
						return 'Invalid timeline event position';
					previous = e.step;
				}
				if (map[0].step !== 0) return 'Timeline must begin at step zero';
			}
			if (
				t.tempoMap.some((e) => !number(e.bpm, 1, 1000)) ||
				t.meterMap.some(
					(e) =>
						!Number.isInteger(e.numerator) ||
						!number(e.numerator, 1, 64) ||
						![1, 2, 4, 8, 16, 32, 64].includes(e.denominator)
				)
			)
				return 'Invalid tempo or meter';
		}
		if (
			!number(t.scale.rootMidi, 36, 84) ||
			!Number.isInteger(t.scale.rootMidi) ||
			!number(t.scale.octaves, 1, 4) ||
			!Number.isInteger(t.scale.octaves) ||
			!Object.hasOwn(scales, t.scale.scale) ||
			species.some((sp) => scaleNotes(t.scale, sp).length < 2)
		)
			return 'Invalid music scale';
		ids.add(t.id);
		map.set(t.id, t);
	}
	for (const raw of plants) {
		const p = raw as MusicPlantDefinition;
		const t = map.get(p?.musicTreeId);
		if (
			!p ||
			!t ||
			typeof p.id !== 'string' ||
			!p.id ||
			ids.has(p.id) ||
			!species.some((s) => s.id === p.speciesId) ||
			!number(p.angle, -Math.PI, Math.PI) ||
			!number(p.ringIndex, 0, totalSteps(t.loop) - 1) ||
			!Number.isInteger(p.ringIndex) ||
			!number(p.durationSteps, 1, totalSteps(t.loop)) ||
			!Number.isInteger(p.durationSteps) ||
			endRingIndex(p) > totalSteps(t.loop) ||
			(p.pitchMidi === undefined
				? !number(p.growth, 0, 1)
				: !number(p.pitchMidi, 0, 127) ||
					!Number.isInteger(p.pitchMidi) ||
					!instruments.some((i) => i.id === p.instrumentId)) ||
			(p.percussionNote !== undefined &&
				(!number(p.percussionNote, 0, 127) || !Number.isInteger(p.percussionNote))) ||
			(p.visualProfile !== undefined &&
				(!number(p.visualProfile.referenceMidi, 0, 127) ||
					!number(p.visualProfile.referenceScale, 0.01, 100))) ||
			!number(p.vibrancy, 0, 1)
		)
			return 'Invalid music plant';
		ids.add(p.id);
	}
	return null;
}
