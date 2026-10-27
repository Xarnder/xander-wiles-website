export interface AudioPreferences {
	master: number;
	music: number;
	ambience: number;
	narration: number;
	muted: boolean;
}
const KEY = 'forest-drift.audio.v1';
const defaults: AudioPreferences = { master: 1, music: 1, ambience: 1, narration: 1, muted: false };
let current: AudioPreferences | undefined;
const listeners = new Set<(value: AudioPreferences) => void>();
function normalize(value: Partial<AudioPreferences>): AudioPreferences {
	const result = { ...defaults };
	for (const key of ['master', 'music', 'ambience', 'narration'] as const) {
		const n = value[key];
		if (typeof n === 'number' && Number.isFinite(n)) result[key] = Math.max(0, Math.min(1, n));
	}
	result.muted = value.muted === true;
	return result;
}
export function getAudioPreferences(): AudioPreferences {
	if (!current) {
		try {
			current = normalize(JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {});
		} catch {
			current = { ...defaults };
		}
	}
	return { ...current };
}
export function setAudioPreferences(patch: Partial<AudioPreferences>): void {
	current = normalize({ ...getAudioPreferences(), ...patch });
	try {
		localStorage.setItem(KEY, JSON.stringify(current));
	} catch {
		/* Session preferences still work. */
	}
	for (const listener of listeners) listener({ ...current });
}
export function audioLevel(
	channel: 'music' | 'ambience' | 'narration',
	value = getAudioPreferences()
): number {
	return value.muted ? 0 : value.master * value[channel];
}
const outputCleanup = new WeakMap<AudioContext, (() => void)[]>();
/** One shared output per channel/context, after each world's own mix controls. */
const outputs = new WeakMap<
	AudioContext,
	Partial<Record<'music' | 'ambience' | 'narration', GainNode>>
>();
export function audioOutput(
	context: AudioContext,
	channel: 'music' | 'ambience' | 'narration'
): GainNode {
	let channels = outputs.get(context);
	if (!channels) {
		channels = {};
		outputs.set(context, channels);
	}
	if (channels[channel]) return channels[channel]!;
	const node = context.createGain();
	node.gain.value = audioLevel(channel);
	node.connect(context.destination);
	const update = (value: AudioPreferences) => {
		if (context.state === 'closed') {
			listeners.delete(update);
			return;
		}
		node.gain.setTargetAtTime(audioLevel(channel, value), context.currentTime, 0.03);
	};
	listeners.add(update);
	const cleanup = outputCleanup.get(context) ?? [];
	cleanup.push(() => {
		listeners.delete(update);
		node.disconnect();
	});
	outputCleanup.set(context, cleanup);
	channels[channel] = node;
	return node;
}

export function subscribeAudioPreferences(listener: (value: AudioPreferences) => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

export function releaseAudioOutputs(context: AudioContext): void {
	for (const cleanup of outputCleanup.get(context) ?? []) cleanup();
	outputCleanup.delete(context);
	outputs.delete(context);
}
