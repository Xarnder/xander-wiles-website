export const QUOTA = {
	list: 1,
	playlistItemsUpdate: 50,
	pageSize: 50,
	firstLoadPlaylistPages: 2,
	maxSubscriptions: 15,
	uploadsPerChannel: 5,
	featuredCount: 20,
	channelIdBatch: 50,
	uploadFetchConcurrency: 5
} as const;

export function canFetchNextPage(
	pagesFetched: number,
	hasNextToken: boolean,
	maxPages: number = Number.POSITIVE_INFINITY
): boolean {
	return hasNextToken && pagesFetched < maxPages;
}

export function firstLoadPageCap(): number {
	return QUOTA.firstLoadPlaylistPages;
}

export function estimateSubscriptionRefreshUnits(
	channelCount: number = QUOTA.maxSubscriptions,
	uploadsPerChannel: number = QUOTA.uploadsPerChannel
): number {
	void uploadsPerChannel;
	return QUOTA.list + QUOTA.list + Math.min(channelCount, QUOTA.maxSubscriptions) * QUOTA.list;
}
