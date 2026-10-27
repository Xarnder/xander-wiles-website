export interface TutorialPreferences {
	enabled: boolean;
	narration: boolean;
	deviceVoice: boolean;
	subtitles: boolean;
	size: number;
	finished: string[];
}
const KEY = 'forest-drift.tutorials.v1';
const defaults: TutorialPreferences = {
	enabled: true,
	narration: true,
	deviceVoice: false,
	subtitles: true,
	size: 20,
	finished: []
};
let current: TutorialPreferences | undefined;
const listeners = new Set<(p: TutorialPreferences) => void>();
export function getTutorialPreferences(): TutorialPreferences {
	if (!current) {
		let saved: Partial<TutorialPreferences> = {};
		try {
			saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {};
		} catch {
			/* optional */
		}
		current = {
			enabled: saved.enabled !== false,
			narration: saved.narration !== false,
			deviceVoice: saved.deviceVoice === true,
			subtitles: saved.subtitles !== false,
			size:
				typeof saved.size === 'number' && Number.isFinite(saved.size)
					? Math.min(24, Math.max(16, saved.size))
					: defaults.size,
			finished: Array.isArray(saved.finished)
				? saved.finished.filter((s): s is string => typeof s === 'string').slice(0, 100)
				: []
		};
	}
	return { ...current, finished: [...current.finished] };
}
export function setTutorialPreferences(patch: Partial<TutorialPreferences>) {
	current = { ...getTutorialPreferences(), ...patch };
	try {
		localStorage.setItem(KEY, JSON.stringify(current));
	} catch {
		/* session only */
	}
	for (const listener of listeners) listener(getTutorialPreferences());
}
export function subscribeTutorialPreferences(listener: (p: TutorialPreferences) => void) {
	listeners.add(listener);
	listener(getTutorialPreferences());
	return () => {
		listeners.delete(listener);
	};
}
