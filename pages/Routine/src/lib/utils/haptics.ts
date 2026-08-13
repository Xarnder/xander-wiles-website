/** Light tactile feedback when the Vibration API is available. */
export function haptic(pattern: number | number[] = 12): void {
	try {
		if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
		navigator.vibrate(pattern);
	} catch {
		/* ignore unsupported / denied */
	}
}

export function hapticComplete(): void {
	haptic(16);
}

export function hapticLater(): void {
	haptic(8);
}

export function hapticNotToday(): void {
	haptic(10);
}

export function hapticCelebrate(): void {
	haptic([18, 40, 18]);
}
