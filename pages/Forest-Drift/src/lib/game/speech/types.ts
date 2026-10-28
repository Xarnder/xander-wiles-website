/** Versioned identities are deliberately independent of character/gameplay code. */
export const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
export const REVISION = '1939ad2a8e416c0acfeecc08a694d14ef25f2231';
export const ASSET_CACHE = `forest-drift.speech.assets.${REVISION}`;
export const VOICE_CACHE = `forest-drift.speech.voices.${REVISION}`;
export const LIMITS = {
	clipSeconds: 18,
	phraseCharacters: 48,
	requestCharacters: 1200,
	memoryBytes: 4 * 1024 * 1024,
	memoryClips: 64,
	diskClips: 256,
	diskBytes: 64 * 1024 * 1024,
	preparationPhrases: 192
};
export interface VoiceProfile {
	id: string;
	version: number;
	voice: string;
	language: string;
	speed: number;
}
export interface Speaker {
	id: string;
	name: string;
	profile: VoiceProfile;
	showLabel?: boolean;
}
export const NARRATOR: Speaker = {
	id: 'tutorial-narrator',
	name: 'Narrator',
	profile: {
		id: 'narrator-en',
		version: 2,
		voice: 'bm_george',
		language: 'en-GB',
		speed: 1
	}
};
interface RequestBase {
	id: string;
	speaker: Speaker;
	text: string;
	session: string;
}
export type SpeechRequest = RequestBase &
	(
		| { mode: 'scripted'; contentId: string; version: number }
		| { mode: 'dynamic'; conversationId: string; turn: number; expiresAt: number }
	);
export interface Clip {
	key: string;
	text: string;
	pcm: Float32Array;
	sampleRate: number;
	duration: number;
	bytes: number;
	usedAt: number;
	schema: 1;
}
export interface Caption {
	requestId: string;
	speakerId: string;
	label: string;
	text: string;
}
export type SpeechResult = 'ended' | 'text' | 'cancelled';
export function phrases(text: string): string[] {
	const normalized = text.replace(/\s+/g, ' ').trim();
	if (!normalized || normalized.length > LIMITS.requestCharacters)
		throw new Error('Speech text is empty or too long.');
	const result: string[] = [];
	for (const sentence of normalized.match(/[^.!?]+[.!?]*/g) ?? []) {
		let phrase = '';
		for (const word of sentence.trim().split(' ')) {
			if (word.length > LIMITS.phraseCharacters) throw new Error('Speech word is too long.');
			if ((phrase + ' ' + word).trim().length > LIMITS.phraseCharacters) {
				result.push(phrase);
				phrase = '';
			}
			phrase = phrase ? `${phrase} ${word}` : word;
		}
		if (phrase) result.push(phrase);
	}
	if (!result.length) throw new Error('Speech text contains no words.');
	return result;
}
export function clipKey(text: string, profile: VoiceProfile): string {
	// Complete canonical identity, including segmentation and runtime revisions; no hash collision risk.
	return JSON.stringify([
		1,
		'segments-2',
		'kokoro-js-1.2.1',
		'transformers-3.8.1',
		REVISION,
		'q8-wasm',
		profile,
		text
	]);
}
export function validClip(value: unknown, key: string): value is Clip {
	const c = value as Clip | null;
	let expectedText: unknown;
	try {
		expectedText = JSON.parse(key).at(-1);
	} catch {
		return false;
	}
	return (
		!!c &&
		c.schema === 1 &&
		c.key === key &&
		typeof c.text === 'string' &&
		c.text === expectedText &&
		c.text.length <= LIMITS.phraseCharacters &&
		c.pcm instanceof Float32Array &&
		c.sampleRate === 24000 &&
		c.pcm.length > 0 &&
		c.pcm.length <= c.sampleRate * LIMITS.clipSeconds &&
		c.bytes === c.pcm.byteLength &&
		c.duration === c.pcm.length / c.sampleRate &&
		Number.isFinite(c.usedAt)
	);
}
