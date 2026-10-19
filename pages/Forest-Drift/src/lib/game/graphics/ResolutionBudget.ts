/** Called once per dynamic-resolution check (currently one second), using smoothed FPS.
 * Reduce load before missed refreshes become sustained. Require five healthy checks before
 * restoring one quality step, so a borderline scene does not alternate resolution every second.
 */
export class ResolutionBudget {
	private healthyChecks = 0;
	reset(): void {
		this.healthyChecks = 0;
	}
	nextScale(fps: number, target: number, current: number, floor: number): number {
		if (fps < target * 0.99) {
			this.healthyChecks = 0;
			return Math.max(floor, current - 0.08);
		}
		if (fps > target * 0.995) {
			this.healthyChecks = Math.min(5, this.healthyChecks + 1);
			if (this.healthyChecks >= 5 && current < 1) {
				this.healthyChecks = 0;
				return Math.min(1, current + 0.08);
			}
		} else this.healthyChecks = 0;
		return current;
	}
}
