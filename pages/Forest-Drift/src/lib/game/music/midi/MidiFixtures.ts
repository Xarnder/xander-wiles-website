import { writeMidi, type MidiEvent, type MidiData } from 'midi-file';
export function midiBytes(data: MidiData) {
	return new Uint8Array(writeMidi(data)).buffer;
}
export function fixtureMidi(count = 16, format: 0 | 1 = 1): ArrayBuffer {
	const ppq = 480;
	const end = Math.ceil(count / 16) * 4;
	const conductor: { q: number; e: MidiEvent }[] = [
		{ q: 0, e: { deltaTime: 0, type: 'setTempo', microsecondsPerBeat: 600000 } },
		{
			q: 0,
			e: {
				deltaTime: 0,
				type: 'timeSignature',
				numerator: 4,
				denominator: 4,
				metronome: 24,
				thirtyseconds: 8
			}
		},
		{ q: 0, e: { deltaTime: 0, type: 'trackName', text: 'Tempo' } }
	];
	if (end > 8)
		conductor.push(
			{ q: 4, e: { deltaTime: 0, type: 'setTempo', microsecondsPerBeat: 428571 } },
			{ q: 8, e: { deltaTime: 0, type: 'setTempo', microsecondsPerBeat: 750000 } }
		);
	const notes: { q: number; e: MidiEvent }[] = [
		{ q: 0, e: { deltaTime: 0, type: 'trackName', text: 'Piano' } },
		{ q: 0, e: { deltaTime: 0, type: 'programChange', channel: 0, programNumber: 0 } }
	];
	for (let i = 0; i < count; i++) {
		const pitch = [36, 60, 61, 72, 84][i % 5];
		notes.push(
			{
				q: i / 4,
				e: { deltaTime: 0, type: 'noteOn', channel: 0, noteNumber: pitch, velocity: 50 + (i % 77) }
			},
			{
				q: i / 4 + 0.25,
				e: { deltaTime: 0, type: 'noteOff', channel: 0, noteNumber: pitch, velocity: 0 }
			}
		);
	}
	const delta = (list: typeof notes) => {
		let prev = 0;
		return [...list, { q: end, e: { deltaTime: 0, type: 'endOfTrack' } as MidiEvent }]
			.sort((a, b) => a.q - b.q)
			.map(({ q, e }) => {
				const ticks = Math.round(q * ppq);
				const event = { ...e, deltaTime: ticks - prev };
				prev = ticks;
				return event;
			});
	};
	return midiBytes({
		header: { format, numTracks: format === 0 ? 1 : 2, ticksPerBeat: ppq },
		tracks: format === 0 ? [delta([...conductor, ...notes])] : [delta(conductor), delta(notes)]
	});
}
