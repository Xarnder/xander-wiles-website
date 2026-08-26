import type { YtPlaylistItem } from '$lib/types/youtube';

export function isSpecialPlaylist(id: string, title?: string): boolean {
	if (id === 'WL' || id === 'LL') return true;
	const normalized = (title ?? '').trim().toLowerCase();
	return normalized === 'watch later' || normalized === 'liked videos';
}

export function moveItem<T>(items: T[], from: number, to: number): T[] {
	if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) {
		return items;
	}
	const next = [...items];
	const [row] = next.splice(from, 1);
	next.splice(to, 0, row);
	return next;
}

export function movedItemAfterReorder<T extends { id: string }>(
	previous: T[],
	next: T[],
	draggedId: string
): { item: T; from: number; to: number } | null {
	const from = previous.findIndex((item) => item.id === draggedId);
	const to = next.findIndex((item) => item.id === draggedId);
	if (from < 0 || to < 0 || from === to) return null;
	return { item: next[to], from, to };
}

export function buildPlaylistItemUpdateBody(
	item: YtPlaylistItem,
	playlistId: string,
	position: number
): {
	id: string;
	snippet: {
		playlistId: string;
		resourceId: { kind: 'youtube#video'; videoId: string };
		position: number;
	};
} {
	return {
		id: item.id,
		snippet: {
			playlistId,
			resourceId: {
				kind: 'youtube#video',
				videoId: item.videoId
			},
			position
		}
	};
}
