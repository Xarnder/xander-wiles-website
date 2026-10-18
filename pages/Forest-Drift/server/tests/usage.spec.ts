import { afterEach, describe, expect, it, vi } from 'vitest';
import { getUsage, parseUsage, usageWindow } from '../src/usage';
import type { Env } from '../src/env';
import { usageLevel, usagePercent } from '../../src/lib/game/net/CloudflareUsage';

const now = new Date('2026-10-18T12:00:00Z');
function fixture() {
	return {
		data: {
			viewer: {
				accounts: [
					{
						workers: [{ sum: { requests: 90_000 } }],
						invocations: [
							{ dimensions: { type: 'http' }, sum: { requests: 40 } },
							{ dimensions: { type: 'hibernation' }, sum: { requests: 20_000 } }
						],
						periodic: [
							{
								sum: {
									duration: 6500,
									rowsRead: 50_000,
									rowsWritten: 80_000,
									inboundWebsocketMsgCount: 2000
								}
							}
						],
						storage: [
							{ dimensions: { namespaceId: 'a' }, max: { storedBytes: 1024 } },
							{ dimensions: { namespaceId: 'b' }, max: { storedBytes: 2048 } }
						]
					}
				]
			}
		}
	};
}
function env() {
	return {
		CLOUDFLARE_ANALYTICS_TOKEN: 'server-only-secret',
		CLOUDFLARE_ACCOUNT_ID: 'account'
	} as Env;
}
afterEach(() => vi.unstubAllGlobals());

describe('Cloudflare free usage reporting', () => {
	it('uses UTC midnight and next reset across month boundaries', () => {
		expect(usageWindow(new Date('2026-10-31T23:59:59Z'))).toEqual({
			periodStart: '2026-10-31T00:00:00.000Z',
			resetsAt: '2026-11-01T00:00:00.000Z'
		});
	});
	it('counts room events conservatively, preserves GB seconds, sums namespace storage, and flags thresholds', () => {
		const value = parseUsage(fixture(), now);
		expect(value.metrics.find((m) => m.id === 'objectRequests')?.used).toBe(22040);
		expect(value.metrics.find((m) => m.id === 'duration')?.used).toBe(6500);
		expect(value.metrics.find((m) => m.id === 'storage')?.used).toBe(3072);
		expect(usageLevel(usagePercent(value.metrics[0]!))).toBe('critical');
		expect(usageLevel(80)).toBe('warning');
		expect(usageLevel(null)).toBe('unknown');
	});
	it('keeps unreported storage unknown and refuses partial, invalid or truncated data', () => {
		const data = fixture();
		data.data.viewer.accounts[0]!.storage = [];
		expect(parseUsage(data, now).metrics.find((m) => m.id === 'storage')?.used).toBeNull();
		expect(() => parseUsage({ data: data.data, errors: [{ message: 'partial' }] }, now)).toThrow();
		data.data.viewer.accounts[0]!.workers[0]!.sum.requests = -1;
		expect(() => parseUsage(data, now)).toThrow();
		expect(() => parseUsage({}, now)).toThrow();
	});
	it('does not query Cloudflare without server configuration', async () => {
		const fetcher = vi.fn();
		vi.stubGlobal('fetch', fetcher);
		expect((await getUsage({} as Env, now)).status).toBe('unavailable');
		expect(fetcher).not.toHaveBeenCalled();
	});
	it('coalesces and caches queries, keeping credentials out of the returned data', async () => {
		const fetcher = vi.fn().mockResolvedValue(Response.json(fixture()));
		vi.stubGlobal('fetch', fetcher);
		const config = env();
		const [a, b] = await Promise.all([getUsage(config, now), getUsage(config, now)]);
		expect(a).toEqual(b);
		await getUsage(config, new Date(now.getTime() + 60_000));
		expect(fetcher).toHaveBeenCalledTimes(1);
		expect(JSON.stringify(a)).not.toContain('server-only-secret');
		const options = fetcher.mock.calls[0]![1] as RequestInit;
		expect(new Headers(options.headers).get('Authorization')).toBe('Bearer server-only-secret');
	});
	it('marks last good data stale on failure, and never carries daily totals into tomorrow', async () => {
		const fetcher = vi
			.fn()
			.mockResolvedValueOnce(Response.json(fixture()))
			.mockRejectedValue(new Error('network'));
		vi.stubGlobal('fetch', fetcher);
		const config = env();
		const first = await getUsage(config, now);
		const stale = await getUsage(config, new Date(now.getTime() + 360_000));
		expect(stale.stale).toBe(true);
		expect(stale.metrics).toEqual(first.metrics);
		const tomorrow = await getUsage(config, new Date('2026-10-19T00:00:01Z'));
		expect(tomorrow.status).toBe('unavailable');
		expect(tomorrow.metrics).toEqual([]);
	});
});
