type WakeLockSentinelLike = {
	released: boolean;
	release: () => Promise<void>;
	addEventListener: (type: 'release', listener: () => void) => void;
};

let sentinel: WakeLockSentinelLike | null = null;

/** Keep the screen awake during an active run (best-effort; not supported everywhere). */
export async function requestWakeLock(): Promise<void> {
	if (typeof navigator === 'undefined') return;
	const nav = navigator as Navigator & {
		wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> };
	};
	if (!nav.wakeLock) return;
	try {
		sentinel = await nav.wakeLock.request('screen');
		sentinel.addEventListener('release', () => {
			sentinel = null;
		});
	} catch {
		sentinel = null;
	}
}

export async function releaseWakeLock(): Promise<void> {
	if (!sentinel || sentinel.released) {
		sentinel = null;
		return;
	}
	try {
		await sentinel.release();
	} catch {
		/* ignore */
	} finally {
		sentinel = null;
	}
}
