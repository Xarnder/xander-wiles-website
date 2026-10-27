/** Map audio output timestamps to the current display time without counting latency twice. */
export function audibleTime(
	contextTime: number,
	now: number,
	timestamp?: { contextTime?: number; performanceTime?: number },
	latency = 0
): number {
	if (
		timestamp &&
		typeof timestamp.contextTime === 'number' &&
		typeof timestamp.performanceTime === 'number' &&
		Number.isFinite(timestamp.contextTime) &&
		timestamp.contextTime > 0 &&
		Number.isFinite(timestamp.performanceTime) &&
		timestamp.performanceTime > 0 &&
		now >= timestamp.performanceTime &&
		now - timestamp.performanceTime < 1000
	) {
		return Math.min(contextTime, timestamp.contextTime + (now - timestamp.performanceTime) / 1000);
	}
	return Math.max(0, contextTime - (Number.isFinite(latency) ? Math.max(0, latency) : 0));
}
