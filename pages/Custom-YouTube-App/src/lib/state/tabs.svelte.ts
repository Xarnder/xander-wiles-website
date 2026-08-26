export type AppTab = 'playlists' | 'subscriptions' | 'featured';

const TAB_KEY = 'playlist-deck-tab';

function readTab(): AppTab {
	if (typeof localStorage === 'undefined') return 'playlists';
	try {
		const stored = localStorage.getItem(TAB_KEY);
		if (stored === 'playlists' || stored === 'subscriptions' || stored === 'featured') {
			return stored;
		}
	} catch {
		// ignore
	}
	return 'playlists';
}

class TabsStore {
	current = $state<AppTab>('playlists');
	loaded = $state({ playlists: false, subscriptions: false, featured: false });

	hydrate(): void {
		this.current = readTab();
	}

	select(tab: AppTab): void {
		this.current = tab;
		try {
			localStorage.setItem(TAB_KEY, tab);
		} catch {
			// ignore
		}
	}

	markLoaded(tab: AppTab): void {
		this.loaded = { ...this.loaded, [tab]: true };
	}

	resetLoaded(): void {
		this.loaded = { playlists: false, subscriptions: false, featured: false };
	}
}

export const tabs = new TabsStore();
