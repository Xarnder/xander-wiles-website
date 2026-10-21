export interface AudioPreferences {
	master: number;
	music: number;
	ambience: number;
	muted: boolean;
}
const KEY = 'forest-drift.audio.v1';
const defaults: AudioPreferences = { master: 1, music: 1, ambience: 1, muted: false };
let current: AudioPreferences | undefined;
const listeners = new Set<(value: AudioPreferences) => void>();
function normalize(value: Partial<AudioPreferences>): AudioPreferences {
	const result = { ...defaults };
	for (const key of ['master', 'music', 'ambience'] as const) {
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
export function audioLevel(channel: 'music' | 'ambience', value = getAudioPreferences()): number {
	return value.muted ? 0 : value.master * value[channel];
}
/** One shared output per channel/context, after each world's own mix controls. */
const outputs = new WeakMap<AudioContext, Partial<Record<'music' | 'ambience', GainNode>>>();
export function audioOutput(context: AudioContext, channel: 'music' | 'ambience'): GainNode {
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
	channels[channel] = node;
	return node;
}
