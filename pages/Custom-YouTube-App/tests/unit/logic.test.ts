import { isEmailAllowed, parseAllowlist } from '$lib/auth/allowlist';
import type { FeedItem, YtPlaylistItem } from '$lib/types/youtube';
import {
	buildPlaylistItemUpdateBody,
	isSpecialPlaylist,
	movedItemAfterReorder,
	moveItem
} from '$lib/youtube/playlist-reorder';
import {
	canFetchNextPage,
	estimateSubscriptionRefreshUnits,
	firstLoadPageCap,
	QUOTA
} from '$lib/youtube/quota';
import { mergeSubscriptionFeed, takeTopSubscriptions } from '$lib/youtube/subscriptions-feed';
import { describe, expect, it } from 'vitest';

describe('allowlist', () => {
	it('parses emails, trimming case and whitespace', () => {
		expect(parseAllowlist('  Alpha@Example.com, beta@example.com ; GAMMA@EXAMPLE.COM\n')).toEqual([
			'alpha@example.com',
			'beta@example.com',
			'gamma@example.com'
		]);
	});

	it('returns an empty list when unset', () => {
		expect(parseAllowlist(undefined)).toEqual([]);
		expect(parseAllowlist('')).toEqual([]);
	});

	it('matches emails case-insensitively', () => {
		const list = parseAllowlist('me@example.com');
		expect(isEmailAllowed('ME@example.com', list)).toBe(true);
		expect(isEmailAllowed(' other@example.com ', list)).toBe(false);
		expect(isEmailAllowed(undefined, list)).toBe(false);
		expect(isEmailAllowed('me@example.com', [])).toBe(false);
	});
});

describe('quota helpers', () => {
	it('caps first playlist load at two pages', () => {
		expect(firstLoadPageCap()).toBe(2);
		expect(canFetchNextPage(2, true, firstLoadPageCap())).toBe(false);
		expect(canFetchNextPage(1, true, firstLoadPageCap())).toBe(true);
		expect(canFetchNextPage(1, false, firstLoadPageCap())).toBe(false);
	});

	it('rejects unbounded pagination when a page cap is set', () => {
		expect(canFetchNextPage(50, true, 2)).toBe(false);
	});

	it('estimates a subscriptions refresh as 17 units for 15 channels', () => {
		expect(estimateSubscriptionRefreshUnits()).toBe(17);
		expect(estimateSubscriptionRefreshUnits(3)).toBe(5);
		expect(QUOTA.playlistItemsUpdate).toBe(50);
		expect(QUOTA.uploadsPerChannel).toBe(5);
		expect(QUOTA.maxSubscriptions).toBe(15);
	});
});

describe('subscription feed merge', () => {
	it('keeps only the first 15 channels', () => {
		const ids = Array.from({ length: 20 }, (_, i) => `c${i}`);
		expect(takeTopSubscriptions(ids)).toHaveLength(15);
		expect(takeTopSubscriptions(ids)[0]).toBe('c0');
	});

	it('sorts by publishedAt descending', () => {
		const items: FeedItem[] = [
			{
				videoId: 'older',
				title: 'Older',
				channelId: 'a',
				channelTitle: 'A',
				publishedAt: '2026-01-01T00:00:00Z'
			},
			{
				videoId: 'newer',
				title: 'Newer',
				channelId: 'b',
				channelTitle: 'B',
				publishedAt: '2026-08-01T00:00:00Z'
			},
			{
				videoId: 'mid',
				title: 'Mid',
				channelId: 'c',
				channelTitle: 'C',
				publishedAt: '2026-04-01T00:00:00Z'
			}
		];
		expect(mergeSubscriptionFeed(items).map((item) => item.videoId)).toEqual([
			'newer',
			'mid',
			'older'
		]);
	});
});

describe('playlist reorder payload', () => {
	const items: YtPlaylistItem[] = [
		{ id: 'pli-a', videoId: 'vid-a', title: 'A', position: 0 },
		{ id: 'pli-b', videoId: 'vid-b', title: 'B', position: 1 },
		{ id: 'pli-c', videoId: 'vid-c', title: 'C', position: 2 }
	];

	it('moves a single item in memory', () => {
		expect(moveItem(items, 2, 0).map((item) => item.id)).toEqual(['pli-c', 'pli-a', 'pli-b']);
	});

	it('identifies only the dragged item after a drop', () => {
		const next = moveItem(items, 0, 2);
		const moved = movedItemAfterReorder(items, next, 'pli-a');
		expect(moved).toEqual({ item: next[2], from: 0, to: 2 });
	});

	it('builds a snippet update for the moved item only', () => {
		expect(buildPlaylistItemUpdateBody(items[0], 'PLtest', 4)).toEqual({
			id: 'pli-a',
			snippet: {
				playlistId: 'PLtest',
				resourceId: { kind: 'youtube#video', videoId: 'vid-a' },
				position: 4
			}
		});
	});

	it('treats Watch Later and Liked as special', () => {
		expect(isSpecialPlaylist('WL')).toBe(true);
		expect(isSpecialPlaylist('LL')).toBe(true);
		expect(isSpecialPlaylist('PLabc', 'Watch Later')).toBe(true);
		expect(isSpecialPlaylist('PLabc', 'Mix')).toBe(false);
	});
});
