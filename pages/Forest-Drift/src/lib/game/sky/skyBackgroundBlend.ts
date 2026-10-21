/** Cap the daytime HDRI contribution at 50%, keeping the procedural sky and clouds visible. */
export function skyBackgroundBlend(timeOfDay: number): number {
	if (!Number.isFinite(timeOfDay)) return 0;
	const hour = (((timeOfDay % 1) + 1) % 1) * 24;
	const smooth = (t: number) => {
		const x = Math.max(0, Math.min(1, t));
		return x * x * (3 - 2 * x);
	};
	return Math.min(0.5, smooth(hour - 8) * (1 - smooth(hour - 18)));
}
