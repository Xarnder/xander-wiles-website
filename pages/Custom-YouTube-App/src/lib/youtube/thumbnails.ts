type ThumbnailBag = {
	medium?: { url?: string };
	high?: { url?: string };
	default?: { url?: string };
	standard?: { url?: string };
};

export function pickThumbnail(thumbnails?: ThumbnailBag): string | undefined {
	return (
		thumbnails?.medium?.url ??
		thumbnails?.high?.url ??
		thumbnails?.standard?.url ??
		thumbnails?.default?.url
	);
}
