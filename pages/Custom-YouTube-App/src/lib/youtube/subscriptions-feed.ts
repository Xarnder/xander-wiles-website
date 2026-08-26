import type { FeedItem } from '$lib/types/youtube';
import { QUOTA } from './quota';

export function takeTopSubscriptions<T>(items: T[], limit = QUOTA.maxSubscriptions): T[] {
	return items.slice(0, limit);
}

export function mergeSubscriptionFeed(items: FeedItem[]): FeedItem[] {
	return [...items].sort((a, b) => {
		if (a.publishedAt === b.publishedAt) {
			return a.videoId.localeCompare(b.videoId);
		}
		return a.publishedAt < b.publishedAt ? 1 : -1;
	});
}

export async function mapWithConcurrency<T, R>(
	items: T[],
	limit: number,
	mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
	const results: R[] = new Array(items.length);
	let cursor = 0;

	async function worker() {
		while (cursor < items.length) {
			const index = cursor;
			cursor += 1;
			results[index] = await mapper(items[index], index);
		}
	}

	const pool = Math.max(1, Math.min(limit, items.length));
	await Promise.all(Array.from({ length: pool }, () => worker()));
	return results;
}
