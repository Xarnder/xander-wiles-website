/**
 * Best-effort landscape lock for the run screen.
 * Native lock often needs fullscreen / installed PWA; callers should also use CSS fallback.
 */

export async function lockLandscape(): Promise<boolean> {
	if (typeof screen === 'undefined') return false;
	const orientation = screen.orientation as ScreenOrientation & {
		lock?: (orientation: OrientationLockType) => Promise<void>;
	};
	if (typeof orientation?.lock !== 'function') return false;
	try {
		await orientation.lock('landscape');
		return true;
	} catch {
		return false;
	}
}

export function unlockOrientation(): void {
	if (typeof screen === 'undefined') return;
	const orientation = screen.orientation as ScreenOrientation & {
		unlock?: () => void;
	};
	try {
		orientation.unlock?.();
	} catch {
		/* ignore — not locked or unsupported */
	}
}
