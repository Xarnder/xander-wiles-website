export type YtPlaylist = {
	id: string;
	title: string;
	itemCount?: number;
	thumbnailUrl?: string;
	reorderable: boolean;
};

export type YtPlaylistItem = {
	id: string;
	videoId: string;
	title: string;
	thumbnailUrl?: string;
	channelTitle?: string;
	position: number;
	publishedAt?: string;
};

export type FeedItem = {
	videoId: string;
	title: string;
	channelId: string;
	channelTitle: string;
	publishedAt: string;
	thumbnailUrl?: string;
};

export type FeaturedVideo = {
	videoId: string;
	title: string;
	channelTitle: string;
	thumbnailUrl?: string;
	viewCount?: string;
};

export type PlaylistItemsPage = {
	items: YtPlaylistItem[];
	nextPageToken?: string;
	pagesLoaded: number;
	total?: number;
};

export type YouTubeErrorReason =
	'quota' | 'auth' | 'forbidden' | 'not-found' | 'network' | 'unknown';

export class YouTubeApiError extends Error {
	status: number;
	reason: YouTubeErrorReason;
	apiReason?: string;

	constructor(message: string, status: number, reason: YouTubeErrorReason, apiReason?: string) {
		super(message);
		this.name = 'YouTubeApiError';
		this.status = status;
		this.reason = reason;
		this.apiReason = apiReason;
	}

	get isQuota(): boolean {
		return this.reason === 'quota';
	}
}
