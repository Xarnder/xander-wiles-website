import { pushState, replaceState } from '$app/navigation';
import { resolve } from '$app/paths';
import { page } from '$app/state';

class PlayerStore {
	videoId = $state<string | null>(null);
	title = $state('');
	#pushed = false;

	syncFromUrl(): void {
		const next = page.url.searchParams.get('v') ?? page.state.videoId ?? null;
		if (next !== this.videoId) {
			this.videoId = next;
			if (!next) {
				this.title = '';
				this.#pushed = false;
			} else {
				const state = page.state as { title?: string } | undefined;
				if (state?.title) this.title = state.title;
			}
		}
	}

	#query(videoId: string | null): string {
		const parts: string[] = [];
		for (const [key, value] of page.url.searchParams) {
			if (key === 'v') continue;
			parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
		}
		if (videoId) parts.push(`v=${encodeURIComponent(videoId)}`);
		return parts.join('&');
	}

	open(videoId: string, title = ''): void {
		this.videoId = videoId;
		this.title = title;
		this.#pushed = true;
		const query = this.#query(videoId);
		// Query must be appended after resolve(); the lint rule only accepts a bare resolve() call.
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- keep ?v= on the shallow URL
		pushState(query ? `${resolve('/')}?${query}` : resolve('/'), { videoId, title });
	}

	close(): void {
		this.videoId = null;
		this.title = '';
		if (this.#pushed) {
			this.#pushed = false;
			history.back();
			return;
		}
		const query = this.#query(null);
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- keep the path resolved when clearing ?v=
		replaceState(query ? `${resolve('/')}?${query}` : resolve('/'), {});
	}
}

export const player = new PlayerStore();
