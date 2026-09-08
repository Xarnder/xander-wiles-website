import { parseMidi, type MidiEvent } from 'midi-file';
export interface SourceNote {
	trackId: string;
	channel: number;
	program: number;
	pitch: number;
	velocity: number;
	start: number;
	end: number;
}
export interface SourceTrack {
	id: string;
	name: string;
	channel: number;
	program: number;
	noteCount: number;
	percussion: boolean;
}
export interface MidiAnalysis {
	fileName: string;
	hash: number;
	ppq: number;
	format: number;
	notes: SourceNote[];
	tracks: SourceTrack[];
	tempos: { quarter: number; bpm: number }[];
	meters: { quarter: number; numerator: number; denominator: number }[];
	barStarts: number[];
	endQuarter: number;
	maxSimultaneous: number;
	warnings: string[];
}
export const MIDI_LIMITS = {
	bytes: 16 * 1024 * 1024,
	tracks: 256,
	events: 1000000,
	notes: 100000,
	bars: 100000
};
export function parseLocalMidi(buffer: ArrayBuffer, fileName: string): MidiAnalysis {
	if (buffer.byteLength < 14 || buffer.byteLength > MIDI_LIMITS.bytes)
		throw Error('Choose a MIDI file between 14 bytes and 16 MB.');
	const bytes = new Uint8Array(buffer),
		view = new DataView(buffer);
	const tag = (i: number) => String.fromCharCode(...bytes.slice(i, i + 4));
	if (tag(0) !== 'MThd' || view.getUint32(4) !== 6)
		throw Error('This file has no valid Standard MIDI header.');
	const format = view.getUint16(8),
		tracks = view.getUint16(10),
		division = view.getUint16(12);
	if (format === 2)
		throw Error('Format 2 MIDI contains independent songs. Export it as format 0 or 1 first.');
	if (format > 1 || tracks < 1 || tracks > MIDI_LIMITS.tracks || (format === 0 && tracks !== 1))
		throw Error('Invalid MIDI format or track count.');
	if (!division || division & 0x8000)
		throw Error('SMPTE timing is not supported. Export a MIDI with quarter-note timing (PPQ).');
	let offset = 14;
	for (let i = 0; i < tracks; i++) {
		if (offset + 8 > bytes.length || tag(offset) !== 'MTrk')
			throw Error('A MIDI track is missing or truncated.');
		const length = view.getUint32(offset + 4);
		offset += 8 + length;
		if (offset > bytes.length) throw Error('A MIDI track is truncated.');
	}
	if (offset !== bytes.length) throw Error('Unexpected bytes after the MIDI tracks.');
	const midi = parseMidi(bytes);
	let count = 0,
		endTick = 0,
		hash = 2166136261;
	for (const byte of bytes) hash = Math.imul(hash ^ byte, 16777619) >>> 0;
	const events: { tick: number; track: number; order: number; event: MidiEvent }[] = [];
	const names = new Map<number, string>();
	midi.tracks.forEach((track, i) => {
		let tick = 0;
		for (const event of track) {
			if (++count > MIDI_LIMITS.events)
				throw Error('This MIDI exceeds the one-million-event safety limit.');
			if (!Number.isSafeInteger(event.deltaTime) || event.deltaTime < 0)
				throw Error('Invalid MIDI event timing.');
			tick += event.deltaTime;
			if (tick > 2 ** 40) throw Error('MIDI timing exceeds browser safety limits.');
			if (event.type === 'trackName') names.set(i, event.text.slice(0, 120));
			events.push({ tick, track: i, order: count, event });
		}
		endTick = Math.max(endTick, tick);
	});
	events.sort((a, b) => a.tick - b.tick || a.order - b.order);
	const notes: SourceNote[] = [],
		trackMap = new Map<string, SourceTrack>();
	const programs = new Map<number, number>();
	const held = new Map<string, SourceNote[]>(),
		deferred = new Map<number, SourceNote[]>(),
		pedal = new Set<number>();
	const warnings = new Set<string>();
	const tempos: MidiAnalysis['tempos'] = [{ quarter: 0, bpm: 120 }],
		meters: MidiAnalysis['meters'] = [{ quarter: 0, numerator: 4, denominator: 4 }];
	const finish = (n: SourceNote, tick: number) => {
		n.end = Math.max(n.start + 1 / division, tick / division);
	};
	for (const { tick, track, event: e } of events) {
		if ('channel' in e && (!Number.isInteger(e.channel) || e.channel < 0 || e.channel > 15))
			throw Error('Invalid MIDI channel.');
		if (e.type === 'setTempo') {
			const bpm = 60000000 / e.microsecondsPerBeat;
			if (!Number.isFinite(bpm) || bpm < 1 || bpm > 1000) throw Error('Invalid MIDI tempo.');
			const t = { quarter: tick / division, bpm };
			if (tempos.at(-1)!.quarter === t.quarter) tempos[tempos.length - 1] = t;
			else tempos.push(t);
		} else if (e.type === 'timeSignature') {
			if (
				!Number.isInteger(e.numerator) ||
				e.numerator < 1 ||
				e.numerator > 64 ||
				![1, 2, 4, 8, 16, 32, 64].includes(e.denominator)
			)
				throw Error('Invalid MIDI time signature.');
			const m = { quarter: tick / division, numerator: e.numerator, denominator: e.denominator };
			if (meters.at(-1)!.quarter === m.quarter) meters[meters.length - 1] = m;
			else meters.push(m);
		} else if (e.type === 'programChange') {
			if (!Number.isInteger(e.programNumber) || e.programNumber < 0 || e.programNumber > 127)
				throw Error('Invalid MIDI instrument.');
			programs.set(e.channel, e.programNumber);
		} else if (e.type === 'noteOn' || e.type === 'noteOff') {
			if (
				!Number.isInteger(e.noteNumber) ||
				e.noteNumber < 0 ||
				e.noteNumber > 127 ||
				!Number.isInteger(e.velocity) ||
				e.velocity < 0 ||
				e.velocity > 127
			)
				throw Error('Invalid MIDI note or velocity.');
			const key = `${e.channel}:${e.noteNumber}`;
			if (e.type === 'noteOn' && e.velocity > 0) {
				const program = programs.get(e.channel) ?? 0,
					id = `${track}:${e.channel}:${program}`;
				const n: SourceNote = {
					trackId: id,
					channel: e.channel,
					program,
					pitch: e.noteNumber,
					velocity: e.velocity,
					start: tick / division,
					end: tick / division
				};
				notes.push(n);
				if (notes.length > MIDI_LIMITS.notes)
					throw Error('This MIDI exceeds the 100,000-note safety limit.');
				const q = held.get(key) ?? [];
				q.push(n);
				held.set(key, q);
				const t = trackMap.get(id) ?? {
					id,
					name: names.get(track) ?? `Track ${track + 1}`,
					channel: e.channel,
					program,
					noteCount: 0,
					percussion: e.channel === 9
				};
				t.noteCount++;
				trackMap.set(id, t);
			} else {
				const n = held.get(key)?.shift();
				if (n) {
					if (pedal.has(e.channel) && e.channel !== 9) {
						const q = deferred.get(e.channel) ?? [];
						q.push(n);
						deferred.set(e.channel, q);
					} else finish(n, tick);
				}
			}
		} else if (e.type === 'controller') {
			if (
				!Number.isInteger(e.controllerType) ||
				e.controllerType < 0 ||
				e.controllerType > 127 ||
				!Number.isInteger(e.value) ||
				e.value < 0 ||
				e.value > 127
			)
				throw Error('Invalid MIDI controller.');
			if (e.controllerType === 64) {
				if (e.value >= 64) pedal.add(e.channel);
				else {
					pedal.delete(e.channel);
					for (const n of deferred.get(e.channel) ?? []) finish(n, tick);
					deferred.delete(e.channel);
				}
			} else if (![0, 32].includes(e.controllerType))
				warnings.add(`Controller ${e.controllerType} is unsupported and was ignored.`);
		} else if (e.type === 'pitchBend') warnings.add('Pitch bend is unsupported and was ignored.');
		else if (e.type === 'noteAftertouch' || e.type === 'channelAftertouch')
			warnings.add('Aftertouch is unsupported and was ignored.');
	}
	for (const q of held.values())
		for (const n of q) {
			finish(n, endTick);
			warnings.add('Unreleased notes were ended at the end of the file.');
		}
	for (const q of deferred.values()) for (const n of q) finish(n, endTick);
	if (!notes.length) throw Error('This MIDI contains no playable notes.');
	const endQuarter = Math.max(endTick / division, ...notes.slice(0, 50000).map((n) => n.end));
	const barStarts = [0];
	let q = 0,
		mi = 0;
	while (q < endQuarter - 1e-8) {
		while (mi + 1 < meters.length && meters[mi + 1].quarter <= q + 1e-8) mi++;
		const m = meters[mi];
		q = Math.min(q + (m.numerator * 4) / m.denominator, meters[mi + 1]?.quarter ?? Infinity);
		barStarts.push(q);
		if (barStarts.length > MIDI_LIMITS.bars)
			throw Error('This MIDI exceeds the bar-count safety limit.');
	}
	const edges = notes
		.flatMap((n) => [
			{ q: n.start, d: 1 },
			{ q: n.end, d: -1 }
		])
		.sort((a, b) => a.q - b.q || a.d - b.d);
	let voices = 0,
		maxSimultaneous = 0;
	for (const e of edges) {
		voices += e.d;
		maxSimultaneous = Math.max(maxSimultaneous, voices);
	}
	return {
		fileName,
		hash,
		ppq: division,
		format,
		notes,
		tracks: [...trackMap.values()],
		tempos,
		meters,
		barStarts,
		endQuarter,
		maxSimultaneous,
		warnings: [...warnings]
	};
}
