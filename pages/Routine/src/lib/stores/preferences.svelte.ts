/** User prefs that survive reloads (library / run chrome). */

const FORCE_LANDSCAPE_KEY = 'routine-force-landscape';

/** Default on — task run view prefers landscape. Library stays free to rotate. */
let forceLandscape = $state(true);
let ready = $state(false);

export function isForceLandscape(): boolean {
	return forceLandscape;
}

export function isPreferencesReady(): boolean {
	return ready;
}

export function initPreferences(): void {
	if (typeof window === 'undefined') return;
	forceLandscape = readForceLandscape();
	ready = true;
}

export function setForceLandscape(next: boolean): void {
	forceLandscape = next;
	try {
		localStorage.setItem(FORCE_LANDSCAPE_KEY, next ? '1' : '0');
	} catch {
		/* ignore quota / private mode */
	}
}

export function toggleForceLandscape(): void {
	setForceLandscape(!forceLandscape);
}

function readForceLandscape(): boolean {
	try {
		const value = localStorage.getItem(FORCE_LANDSCAPE_KEY);
		if (value === '0') return false;
		if (value === '1') return true;
	} catch {
		/* ignore */
	}
	return true;
}
