/** Only aggregate usage crosses the Worker boundary; never the analytics credential. */
export interface UsageMetric {
	id: string;
	label: string;
	used: number | null;
	limit: number;
	unit: string;
	period: 'day' | 'storage';
	estimate?: boolean;
}
export interface CloudflareUsage {
	status: 'ok' | 'unavailable';
	asOf: string | null;
	periodStart: string;
	resetsAt: string;
	stale: boolean;
	message?: string;
	metrics: UsageMetric[];
}
export interface UsageAccess {
	server: string;
	worldId: string;
	invite: string;
	owner: boolean;
}

export function usagePercent(metric: UsageMetric): number | null {
	return metric.used === null ? null : (metric.used / metric.limit) * 100;
}
export function usageLevel(percent: number | null): 'unknown' | 'normal' | 'warning' | 'critical' {
	return percent === null
		? 'unknown'
		: percent >= 90
			? 'critical'
			: percent >= 75
				? 'warning'
				: 'normal';
}
