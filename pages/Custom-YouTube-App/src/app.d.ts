/// <reference types="@sveltejs/kit" />

declare namespace App {
	// interface Error {}
	// interface Locals {}
	// interface PageData {}
	interface PageState {
		videoId?: string | null;
		title?: string;
	}
	// interface Platform {}
}

interface ImportMetaEnv {
	readonly PUBLIC_GOOGLE_CLIENT_ID?: string;
	readonly PUBLIC_ALLOWED_GOOGLE_EMAILS?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}

type GoogleTokenClient = {
	requestAccessToken: (overrideCfg?: { prompt?: string }) => void;
};

type GoogleTokenResponse = {
	access_token?: string;
	expires_in?: number;
	error?: string;
	error_description?: string;
};

interface Window {
	google?: {
		accounts: {
			oauth2: {
				initTokenClient: (config: {
					client_id: string;
					scope: string;
					callback: (response: GoogleTokenResponse) => void;
					error_callback?: (error: { type?: string; message?: string }) => void;
				}) => GoogleTokenClient;
				revoke: (token: string, done?: () => void) => void;
			};
		};
	};
	YT?: {
		Player: new (
			elementId: string,
			options: {
				videoId: string;
				host?: string;
				playerVars?: Record<string, string | number | boolean>;
				events?: {
					onReady?: (event: { target: YtIframePlayer }) => void;
					onError?: (event: { data: number }) => void;
				};
			}
		) => YtIframePlayer;
	};
	onYouTubeIframeAPIReady?: () => void;
}

type YtIframePlayer = {
	destroy: () => void;
	loadVideoById: (videoId: string) => void;
};
