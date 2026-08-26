import type { FeaturedVideo } from '$lib/types/youtube';
import { youtubeRequest } from './client';
import { DEFAULT_REGION } from './featured';
import { QUOTA } from './quota';
import { pickThumbnail } from './thumbnails';

type VideosListResponse = {
	items?: {
		id?: string;
		snippet?: {
			title?: string;
			channelTitle?: string;
			thumbnails?: Parameters<typeof pickThumbnail>[0];
		};
		statistics?: { viewCount?: string };
	}[];
};

export async function listFeaturedVideos(
	token: string,
	regionCode = DEFAULT_REGION
): Promise<FeaturedVideo[]> {
	const data = await youtubeRequest<VideosListResponse>('videos', {
		token,
		searchParams: {
			part: 'snippet,statistics',
			chart: 'mostPopular',
			maxResults: QUOTA.featuredCount,
			regionCode
		}
	});

	return (data.items ?? [])
		.map((item): FeaturedVideo | null => {
			if (!item.id) return null;
			return {
				videoId: item.id,
				title: item.snippet?.title || 'Untitled video',
				channelTitle: item.snippet?.channelTitle ?? 'YouTube',
				thumbnailUrl: pickThumbnail(item.snippet?.thumbnails),
				viewCount: item.statistics?.viewCount
			};
		})
		.filter((item): item is FeaturedVideo => item !== null);
}
