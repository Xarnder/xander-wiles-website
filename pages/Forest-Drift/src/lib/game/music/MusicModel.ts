import { compiledTimeline, type MusicTimelineDefinition } from './MusicTimeline';
export interface MusicLoopSettings {
	/** If present this is authoritative; the scalar fields describe the legacy/manual editor. */
	timeline?: MusicTimelineDefinition;
	bpm: number;
	beatsPerBar: number;
	barsPerLoop: number;
	subdivisionsPerBeat: number;
	firstRingRadius: number;
	ringSpacing: number;
}
export interface MusicScaleSettings {
	rootMidi: number;
	scale: 'major-pentatonic' | 'minor-pentatonic' | 'major' | 'minor';
	octaves: number;
}
export interface MusicTreeDefinition {
	id: string;
	position: { x: number; y: number; z: number };
	loop: MusicLoopSettings;
	scale: MusicScaleSettings;
}
export interface MusicPlantDefinition {
	id: string;
	musicTreeId: string;
	speciesId: string;
	angle: number;
	ringIndex: number;
	/** How many timing subdivisions the note sustains for, starting at `ringIndex` — always >= 1. The sustain trail's outward length is derived from this, never stored as seconds (see `noteDurationSeconds`) so it stays exact across BPM changes. */
	durationSteps: number;
	/** Accepted only by legacy math helpers; migrated out of persisted v4 plants. */
	growth?: number;
	pitchMidi?: number;
	instrumentId?: string;
	percussionNote?: number;
	visualProfile?: { referenceMidi: number; referenceScale: number };
	vibrancy: number;
}
export interface MusicPlantSpeciesDefinition {
	id: string;
	name: string;
	instrumentId: string;
	pitchRange: { minMidi: number; maxMidi: number };
	hue: number;
}
export const species: MusicPlantSpeciesDefinition[] = [
	{
		id: 'flower',
		name: 'Flower — Bell',
		instrumentId: 'bell',
		pitchRange: { minMidi: 60, maxMidi: 96 },
		hue: 0.92
	},
	{
		id: 'mushroom',
		name: 'Mushroom — Marimba',
		instrumentId: 'bass',
		pitchRange: { minMidi: 36, maxMidi: 72 },
		hue: 0.07
	},
	{
		id: 'fern',
		name: 'Fern — Warm pad',
		instrumentId: 'pad',
		pitchRange: { minMidi: 48, maxMidi: 84 },
		hue: 0.35
	},
	{
		id: 'reed',
		name: 'Reed — Flute',
		instrumentId: 'flute',
		pitchRange: { minMidi: 60, maxMidi: 96 },
		hue: 0.15
	},
	{
		id: 'crystal',
		name: 'Crystal Flower — Glass',
		instrumentId: 'glass',
		pitchRange: { minMidi: 60, maxMidi: 96 },
		hue: 0.53
	}
];
export const scales = {
	'major-pentatonic': [0, 2, 4, 7, 9],
	'minor-pentatonic': [0, 3, 5, 7, 10],
	major: [0, 2, 4, 5, 7, 9, 11],
	minor: [0, 2, 3, 5, 7, 8, 10]
};
export const clamp = (n: number) => Math.max(0, Math.min(1, n));
export const totalSteps = (s: MusicLoopSettings) =>
	s.timeline?.totalSteps ?? s.beatsPerBar * s.barsPerLoop * s.subdivisionsPerBeat;
export const stepDuration = (s: MusicLoopSettings) => 60 / s.bpm / s.subdivisionsPerBeat;
export const loopDuration = (s: MusicLoopSettings) =>
	s.timeline ? compiledTimeline(s.timeline).duration : totalSteps(s) * stepDuration(s);
export const secondsAtStep = (s: MusicLoopSettings, step: number) =>
	s.timeline ? compiledTimeline(s.timeline).secondsAt(step) : step * stepDuration(s);
export const stepAtSeconds = (s: MusicLoopSettings, seconds: number) =>
	s.timeline ? compiledTimeline(s.timeline).stepAt(seconds) : seconds / stepDuration(s);
export const fractionalLoopStep = (s: MusicLoopSettings, elapsed: number) =>
	stepAtSeconds(s, ((elapsed % loopDuration(s)) + loopDuration(s)) % loopDuration(s));
export function timelineDefinition(s: MusicLoopSettings): MusicTimelineDefinition {
	return (
		s.timeline ?? {
			totalSteps: totalSteps(s),
			grid: { stepsPerQuarter: s.subdivisionsPerBeat },
			tempoMap: [{ step: 0, bpm: s.bpm }],
			meterMap: [{ step: 0, numerator: s.beatsPerBar, denominator: 4 }]
		}
	);
}
export const ringRadius = (s: MusicLoopSettings, i: number) =>
	s.firstRingRadius + i * s.ringSpacing;
export const ringIndex = (s: MusicLoopSettings, r: number) =>
	Math.round((r - s.firstRingRadius) / s.ringSpacing);
export function positionOf(
	t: MusicTreeDefinition,
	p: Pick<MusicPlantDefinition, 'angle' | 'ringIndex'>
) {
	const r = ringRadius(t.loop, p.ringIndex);
	return { x: t.position.x + Math.cos(p.angle) * r, z: t.position.z + Math.sin(p.angle) * r };
}
export function radialSnap(t: MusicTreeDefinition, x: number, z: number) {
	const dx = x - t.position.x,
		dz = z - t.position.z,
		r = Math.hypot(dx, dz);
	const i = ringIndex(t.loop, r);
	if (r < t.loop.firstRingRadius - 0.5 * t.loop.ringSpacing || i < 0 || i >= totalSteps(t.loop))
		return null;
	const p = { angle: Math.atan2(dz, dx), ringIndex: i };
	return { ...p, ...positionOf(t, p) };
}
/**
 * The largest `durationSteps` a note starting at `startRing` can have without sustaining past the
 * loop's own final subdivision — sustained notes may NOT wrap across the loop boundary (v1
 * simplification, avoids the ambiguity of a note that's simultaneously "ending" and "about to
 * retrigger"). `totalSteps(s)` itself (not `totalSteps(s) - 1`) is a valid end ring — it's the same
 * one-ring-of-headroom the expanding wave itself sweeps through before wrapping (see `waveRadius`).
 */
export const maxDurationSteps = (s: MusicLoopSettings, startRing: number) =>
	Math.max(1, totalSteps(s) - startRing);
/** Quantizes and clamps a candidate duration to `[1, maxDurationSteps]` — the only path a `durationSteps` value should ever go through before being stored. */
export const clampDurationSteps = (s: MusicLoopSettings, startRing: number, steps: number) =>
	Math.max(1, Math.min(Math.round(steps), maxDurationSteps(s, startRing)));
/** Note-off timing position, in ring units — `ringIndex + durationSteps`, never re-derived any other way (see the README's "Sustained notes" section). */
export const endRingIndex = (p: Pick<MusicPlantDefinition, 'ringIndex' | 'durationSteps'>) =>
	p.ringIndex + p.durationSteps;
/** Real seconds a note lasts, derived from the current tempo — NEVER the primary representation (see `MusicPlantDefinition.durationSteps`'s doc comment). Changing BPM changes this without touching `durationSteps` or any world-space geometry. */
export const noteDurationSeconds = (s: MusicLoopSettings, durationSteps: number, startStep = 0) =>
	secondsAtStep(s, startStep + durationSteps) - secondsAtStep(s, startStep);
/** The world-space radii the sustain trail spans between — always derived from `ringIndex`/`durationSteps`, never stored. */
export function trailRadii(
	t: MusicTreeDefinition,
	p: Pick<MusicPlantDefinition, 'ringIndex' | 'durationSteps'>
) {
	return {
		startRadius: ringRadius(t.loop, p.ringIndex),
		endRadius: ringRadius(t.loop, endRingIndex(p))
	};
}
/** The sustain trail's start/end world X/Z — always along the plant's OWN angle (radial-only, per the class doc comment's core rule), never a freeform direction. */
export function trailEndpoints(
	t: MusicTreeDefinition,
	p: Pick<MusicPlantDefinition, 'angle' | 'ringIndex' | 'durationSteps'>
) {
	const { startRadius, endRadius } = trailRadii(t, p);
	return {
		start: {
			x: t.position.x + Math.cos(p.angle) * startRadius,
			z: t.position.z + Math.sin(p.angle) * startRadius
		},
		end: {
			x: t.position.x + Math.cos(p.angle) * endRadius,
			z: t.position.z + Math.sin(p.angle) * endRadius
		}
	};
}
export interface SustainProgress {
	/** Whether the note is currently within its sustain window (true from note-on through note-off, false otherwise) — drives the trail's illumination and the plant's own trigger glow. */
	active: boolean;
	/** How far the sustain has advanced, `[0, 1]` — `0` at note-on, `1` at (or past) note-off. */
	progress: number;
}
/**
 * How far a note's sustain has advanced, derived ENTIRELY from the audio-clock `elapsed` time since
 * the sequencer started — never from render-frame timing (see the README's "most important technical
 * rule"). `elapsed` is the sequencer's own unwrapped elapsed time (can exceed one loop); this handles
 * the modulo/wrap itself, the same way the expanding wave's own `waveRadius` does.
 */
export function sustainProgress(
	s: MusicLoopSettings,
	elapsed: number,
	p: Pick<MusicPlantDefinition, 'ringIndex' | 'durationSteps'>
): SustainProgress {
	if (s.timeline) {
		const step = fractionalLoopStep(s, elapsed),
			age = step - p.ringIndex;
		return {
			active: age >= 0 && age < p.durationSteps,
			progress: age < 0 ? 1 : Math.min(1, age / p.durationSteps)
		};
	}
	const loop = loopDuration(s);
	const noteStart = secondsAtStep(s, p.ringIndex);
	const age = (((elapsed - noteStart) % loop) + loop) % loop;
	const duration = noteDurationSeconds(s, p.durationSteps, p.ringIndex);
	return { active: age < duration, progress: duration > 0 ? Math.min(1, age / duration) : 1 };
}
export function scaleNotes(s: MusicScaleSettings, sp: MusicPlantSpeciesDefinition) {
	const notes: number[] = [];
	for (let n = s.rootMidi - 24; n <= s.rootMidi + 12 * s.octaves; n++)
		if (
			n >= sp.pitchRange.minMidi &&
			n <= sp.pitchRange.maxMidi &&
			scales[s.scale].includes((((n - s.rootMidi) % 12) + 12) % 12)
		)
			notes.push(n);
	return notes;
}
export function pitch(
	t: MusicTreeDefinition,
	p: Pick<MusicPlantDefinition, 'speciesId' | 'growth' | 'pitchMidi'>
) {
	if (p.pitchMidi !== undefined) return p.pitchMidi;
	const notes = scaleNotes(
		t.scale,
		species.find((s) => s.id === p.speciesId)!
	);
	return notes[Math.round(clamp(p.growth ?? 0.5) * (notes.length - 1))];
}
export const noteName = (n: number) =>
	['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'][n % 12] +
	(Math.floor(n / 12) - 1);
export const vibrancyGain = (v: number) => 0.015 + Math.pow(clamp(v), 2) * 0.16;
// One extra spacing during the final subdivision: every playable ring is crossed at its exact note time.
export const waveRadius = (s: MusicLoopSettings, elapsed: number) =>
	s.firstRingRadius + fractionalLoopStep(s, elapsed) * s.ringSpacing;
export function createMusicTree(x = 0, y = 0, z = -10): MusicTreeDefinition {
	return {
		id: crypto.randomUUID(),
		position: { x, y, z },
		loop: {
			bpm: 90,
			beatsPerBar: 4,
			barsPerLoop: 4,
			subdivisionsPerBeat: 2,
			firstRingRadius: 3,
			ringSpacing: 1
		},
		scale: { rootMidi: 60, scale: 'major-pentatonic', octaves: 2 }
	};
}
