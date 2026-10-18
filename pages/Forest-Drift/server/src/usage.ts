import type { CloudflareUsage, UsageMetric } from '../../src/lib/game/net/CloudflareUsage';
import type { Env } from './env';

// Account totals, deliberately not filtered to this room or Worker: free quotas are shared.
export const USAGE_QUERY = `query($account: string!, $start: Time!, $end: Time!, $storageStart: Time!) {
 viewer { accounts(filter: {accountTag: $account}) {
  workers: workersInvocationsAdaptive(limit: 1, filter: {datetime_geq: $start, datetime_leq: $end}) { sum { requests } }
  invocations: durableObjectsInvocationsAdaptiveGroups(limit: 100, filter: {datetime_geq: $start, datetime_leq: $end}) { dimensions { type } sum { requests } }
  periodic: durableObjectsPeriodicGroups(limit: 1, filter: {datetime_geq: $start, datetime_leq: $end}) { sum { duration rowsRead rowsWritten inboundWebsocketMsgCount } }
  storage: durableObjectsSqlStorageGroups(limit: 1000, filter: {datetime_geq: $storageStart, datetime_leq: $end}) { dimensions { namespaceId } max { storedBytes } }
 } }
}`;
const CACHE_MS = 5 * 60_000;
const RETRY_MS = 60_000;
interface Cache {
	value?: CloudflareUsage;
	expires: number;
	pending?: Promise<CloudflareUsage>;
}
// One entry per configured Env; no persistent writes or extra paid services for monitoring.
const cache = new WeakMap<Env, Cache>();

export function usageWindow(now: Date): { periodStart: string; resetsAt: string } {
	const start = new Date(now);
	start.setUTCHours(0, 0, 0, 0);
	return {
		periodStart: start.toISOString(),
		resetsAt: new Date(start.getTime() + 86_400_000).toISOString()
	};
}
function unavailable(now: Date, message: string): CloudflareUsage {
	return {
		status: 'unavailable',
		asOf: null,
		...usageWindow(now),
		stale: false,
		metrics: [],
		message
	};
}

/** Coalesce viewers and cache account queries for five minutes per Worker isolate. */
export async function getUsage(env: Env, now = new Date()): Promise<CloudflareUsage> {
	if (!env.CLOUDFLARE_ANALYTICS_TOKEN || !env.CLOUDFLARE_ACCOUNT_ID) {
		return unavailable(now, 'Cloudflare usage reporting has not been connected yet.');
	}
	let entry = cache.get(env);
	if (!entry) {
		entry = { expires: 0 };
		cache.set(env, entry);
	}
	if (entry.pending) return entry.pending;
	if (
		entry.value &&
		now.getTime() < entry.expires &&
		entry.value.periodStart === usageWindow(now).periodStart
	)
		return entry.value;
	const current = entry;
	current.pending = (async () => {
		try {
			const response = await fetch('https://api.cloudflare.com/client/v4/graphql', {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${env.CLOUDFLARE_ANALYTICS_TOKEN}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					query: USAGE_QUERY,
					variables: {
						account: env.CLOUDFLARE_ACCOUNT_ID,
						start: usageWindow(now).periodStart,
						end: now.toISOString(),
						storageStart: new Date(now.getTime() - 86_400_000).toISOString()
					}
				}),
				signal: AbortSignal.timeout(10_000)
			});
			if (!response.ok) throw new Error('Analytics request failed');
			const value = parseUsage(await response.json(), now);
			current.value = value;
			current.expires = now.getTime() + CACHE_MS;
			return value;
		} catch {
			const previous = current.value;
			// Never reuse yesterday's daily totals after midnight, or label a failure as zero usage.
			const value: CloudflareUsage =
				previous?.status === 'ok' && previous.periodStart === usageWindow(now).periodStart
					? {
							...previous,
							stale: true,
							message: 'Cloudflare could not refresh usage. Showing the last successful reading.'
						}
					: unavailable(
							now,
							'Cloudflare usage is temporarily unavailable. Check the Cloudflare dashboard.'
						);
			current.value = value;
			current.expires = now.getTime() + RETRY_MS;
			return value;
		} finally {
			current.pending = undefined;
		}
	})();
	return current.pending;
}

type Group = {
	sum?: Record<string, unknown>;
	max?: Record<string, unknown>;
	dimensions?: Record<string, string>;
};
function number(value: unknown): number {
	if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
		throw new Error('Invalid analytics number');
	return value;
}
function total(groups: Group[], field: string): number {
	return groups.reduce((sum, group) => sum + number(group.sum?.[field]), 0);
}

/** Dataset names and units verified using Cloudflare's GraphQL introspection schema. */
export function parseUsage(body: unknown, now: Date): CloudflareUsage {
	const result = body as {
		errors?: unknown[];
		data?: { viewer?: { accounts?: Record<string, Group[]>[] } };
	};
	const account = result?.data?.viewer?.accounts?.[0];
	if (result?.errors?.length || !account) throw new Error('Analytics unavailable');
	for (const name of ['workers', 'invocations', 'periodic', 'storage']) {
		if (!Array.isArray(account[name])) throw new Error('Missing analytics dataset');
	}
	if (account.invocations!.length >= 100 || account.storage!.length >= 1000)
		throw new Error('Analytics results truncated');
	// Use raw events as a conservative indicator: Cloudflare applies a 20:1 WebSocket billing
	// ratio, but documents it as billing-only, so do not assume it matches free quota enforcement.
	const roomEvents =
		total(account.invocations!, 'requests') + total(account.periodic!, 'inboundWebsocketMsgCount');
	const metric = (
		id: string,
		label: string,
		used: number | null,
		limit: number,
		unit: string,
		period: UsageMetric['period'] = 'day',
		estimate = false
	): UsageMetric => ({ id, label, used, limit, unit, period, estimate });
	return {
		status: 'ok',
		asOf: now.toISOString(),
		...usageWindow(now),
		stale: false,
		metrics: [
			metric(
				'workerRequests',
				'Worker requests',
				total(account.workers!, 'requests'),
				100_000,
				'requests',
				'day',
				true
			),
			metric(
				'objectRequests',
				'Room events (conservative)',
				roomEvents,
				100_000,
				'events',
				'day',
				true
			),
			metric(
				'duration',
				'Room active duration',
				total(account.periodic!, 'duration'),
				13_000,
				'GB·s'
			),
			metric(
				'rowsRead',
				'Database rows read',
				total(account.periodic!, 'rowsRead'),
				5_000_000,
				'rows'
			),
			metric(
				'rowsWritten',
				'Database rows written',
				total(account.periodic!, 'rowsWritten'),
				100_000,
				'rows'
			),
			// Storage is a recent peak per namespace, summed account-wide, not a daily allowance.
			metric(
				'storage',
				'Stored world data (recent peak)',
				account.storage!.length
					? account.storage!.reduce((sum, group) => sum + number(group.max?.storedBytes), 0)
					: null,
				5_000_000_000,
				'bytes',
				'storage',
				true
			)
		]
	};
}
