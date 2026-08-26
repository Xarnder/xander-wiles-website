import type { FeedItem } from '$lib/types/youtube';
import { youtubeRequest } from './client';
import { pickThumbnail } from './thumbnails';
import { QUOTA } from './quota';
import {
	mapWithConcurrency,
	mergeSubscriptionFeed,
	takeTopSubscriptions
} from './subscriptions-feed';

type SubscriptionListResponse = {
	items?: {
		snippet?: {
			resourceId?: { channelId?: string };
			title?: string;
			thumbnails?: Parameters<typeof pickThumbnail>[0];
		};
	}[];
};

type ChannelListResponse = {
	items?: {
		id?: string;
		snippet?: { title?: string };
		contentDetails?: { relatedPlaylists?: { uploads?: string } };
	}[];
};

type PlaylistItemListResponse = {
	items?: {
		snippet?: {
			title?: string;
			publishedAt?: string;
			videoOwnerChannelTitle?: string;
			channelTitle?: string;
			resourceId?: { videoId?: string };
			thumbnails?: Parameters<typeof pickThumbnail>[0];
		};
		contentDetails?: { videoId?: string };
	}[];
};

export async function loadSubscriptionsFeed(token: string): Promise<FeedItem[]> {
	const subscriptions = await youtubeRequest<SubscriptionListResponse>('subscriptions', {
		token,
		searchParams: {
			part: 'snippet,contentDetails',
			mine: 'true',
			maxResults: QUOTA.maxSubscriptions,
			order: 'relevance'
		}
	});

	const channelIds = takeTopSubscriptions(
		(subscriptions.items ?? [])
			.map((item) => item.snippet?.resourceId?.channelId)
			.filter((id): id is string => Boolean(id))
	);

	if (channelIds.length === 0) return [];

	const channels = await youtubeRequest<ChannelListResponse>('channels', {
		token,
		searchParams: {
			part: 'contentDetails,snippet',
			id: channelIds.join(',')
		}
	});

	const uploadJobs = (channels.items ?? [])
		.map((channel) => ({
			channelId: channel.id ?? '',
			channelTitle: channel.snippet?.title ?? 'Unknown channel',
			uploadsId: channel.contentDetails?.relatedPlaylists?.uploads
		}))
		.filter((job) => job.channelId && job.uploadsId);

	const pages = await mapWithConcurrency(uploadJobs, QUOTA.uploadFetchConcurrency, async (job) => {
		const data = await youtubeRequest<PlaylistItemListResponse>('playlistItems', {
			token,
			searchParams: {
				part: 'snippet,contentDetails',
				playlistId: job.uploadsId,
				maxResults: QUOTA.uploadsPerChannel
			}
		});
		return (data.items ?? [])
			.map((item): FeedItem | null => {
				const videoId = item.snippet?.resourceId?.videoId ?? item.contentDetails?.videoId;
				const publishedAt = item.snippet?.publishedAt;
				if (!videoId || !publishedAt) return null;
				return {
					videoId,
					title: item.snippet?.title || 'Untitled video',
					channelId: job.channelId,
					channelTitle:
						item.snippet?.videoOwnerChannelTitle ?? item.snippet?.channelTitle ?? job.channelTitle,
					publishedAt,
					thumbnailUrl: pickThumbnail(item.snippet?.thumbnails)
				};
			})
			.filter((item): item is FeedItem => item !== null);
	});

	return mergeSubscriptionFeed(pages.flat());
}
