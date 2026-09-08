import { parseLocalMidi } from './MidiParser';
import { planMidiImport } from './MidiPlanner';
import type { MidiAnalysis } from './MidiParser';
import type { MidiImportOptions } from './MidiImportPlan';
let analysis: MidiAnalysis | undefined;
self.onmessage = (
	event: MessageEvent<{
		id: number;
		kind: 'parse' | 'plan';
		buffer?: ArrayBuffer;
		fileName?: string;
		options?: MidiImportOptions;
	}>
) => {
	const { id, kind } = event.data;
	try {
		self.postMessage({
			id,
			stage:
				kind === 'parse'
					? 'Reading tracks and processing sustain'
					: 'Quantizing notes and arranging the garden'
		});
		if (kind === 'parse') {
			analysis = parseLocalMidi(event.data.buffer!, event.data.fileName!);
			self.postMessage({ id, result: { ...analysis, notes: [] } });
		} else {
			if (!analysis) throw Error('Choose a MIDI file first.');
			self.postMessage({ id, result: planMidiImport(analysis, event.data.options!) });
		}
	} catch (error) {
		self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
	}
};
