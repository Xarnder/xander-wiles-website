import type { PlaylistItemsPage, YtPlaylist, YtPlaylistItem } from '$lib/types/youtube';
import { youtubeRequest } from './client';
import { isSpecialPlaylist } from './playlist-reorder';
import { canFetchNextPage, QUOTA } from './quota';
import { pickThumbnail } from './thumbnails';

type PlaylistListResponse = {
	nextPageToken?: string;
	pageInfo?: { totalResults?: number };
	items?: {
		id?: string;
		snippet?: { title?: string; thumbnails?: Parameters<typeof pickThumbnail>[0] };
		contentDetails?: { itemCount?: number };
	}[];
};

type PlaylistItemListResponse = {
	nextPageToken?: string;
	pageInfo?: { totalResults?: number };
	items?: {
		id?: string;
		snippet?: {
			title?: string;
			channelTitle?: string;
			publishedAt?: string;
			position?: number;
			resourceId?: { videoId?: string };
			thumbnails?: Parameters<typeof pickThumbnail>[0];
		};
		contentDetails?: { videoId?: string };
	}[];
};

function mapPlaylistItem(
	raw: NonNullable<PlaylistItemListResponse['items']>[number]
): YtPlaylistItem | null {
	const videoId = raw.snippet?.resourceId?.videoId ?? raw.contentDetails?.videoId;
	if (!raw.id || !videoId) return null;
	return {
		id: raw.id,
		videoId,
		title: raw.snippet?.title || 'Untitled video',
		thumbnailUrl: pickThumbnail(raw.snippet?.thumbnails),
		channelTitle: raw.snippet?.channelTitle,
		position: raw.snippet?.position ?? 0,
		publishedAt: raw.snippet?.publishedAt
	};
}

export async function listMyPlaylists(
	token: string,
	pageToken?: string
): Promise<{ items: YtPlaylist[]; nextPageToken?: string }> {
	const data = await youtubeRequest<PlaylistListResponse>('playlists', {
		token,
		searchParams: {
			part: 'snippet,contentDetails',
			mine: 'true',
			maxResults: QUOTA.pageSize,
			pageToken
		}
	});

	const items: YtPlaylist[] = [];
	for (const item of data.items ?? []) {
		if (!item.id) continue;
		const title = item.snippet?.title || 'Untitled playlist';
		items.push({
			id: item.id,
			title,
			itemCount: item.contentDetails?.itemCount,
			thumbnailUrl: pickThumbnail(item.snippet?.thumbnails),
			reorderable: !isSpecialPlaylist(item.id, title)
		});
	}

	return { items, nextPageToken: data.nextPageToken };
}

export async function listPlaylistItems(
	token: string,
	playlistId: string,
	pageToken?: string,
	maxPages: number = QUOTA.firstLoadPlaylistPages
): Promise<PlaylistItemsPage> {
	const items: YtPlaylistItem[] = [];
	let next = pageToken;
	let pagesLoaded = 0;
	let total: number | undefined;
	let lastNext: string | undefined;

	do {
		const data = await youtubeRequest<PlaylistItemListResponse>('playlistItems', {
			token,
			searchParams: {
				part: 'snippet,contentDetails',
				playlistId,
				maxResults: QUOTA.pageSize,
				pageToken: next
			}
		});
		pagesLoaded += 1;
		total = data.pageInfo?.totalResults ?? total;
		for (const raw of data.items ?? []) {
			const mapped = mapPlaylistItem(raw);
			if (mapped) items.push(mapped);
		}
		lastNext = data.nextPageToken;
		next = data.nextPageToken;
	} while (canFetchNextPage(pagesLoaded, Boolean(next), maxPages));

	return { items, nextPageToken: lastNext, pagesLoaded, total };
}

export async function updatePlaylistItemPosition(
	token: string,
	item: YtPlaylistItem,
	playlistId: string,
	position: number
): Promise<void> {
	await youtubeRequest('playlistItems', {
		method: 'PUT',
		token,
		searchParams: { part: 'snippet' },
		body: {
			id: item.id,
			snippet: {
				playlistId,
				resourceId: {
					kind: 'youtube#video',
					videoId: item.videoId
				},
				position
			}
		}
	});
}
