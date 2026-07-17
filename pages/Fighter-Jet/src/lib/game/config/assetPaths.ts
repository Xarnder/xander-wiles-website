/**
 * Resolve static-folder assets so they work both in local Vite (`/`) and when the
 * built app is hosted under `/pages/Fighter-Jet/` on the main site.
 */
function resolveStaticAsset(relativePath: string): string {
	const clean = relativePath.replace(/^\//, '');
	if (typeof window === 'undefined') {
		return `/${clean}`;
	}
	return new URL(clean, new URL('./', window.location.href)).pathname;
}

export const ASSET_PATHS = {
	get fighterJet(): string {
		return resolveStaticAsset('models/fighter-jet.glb');
	},
	get missile(): string {
		return resolveStaticAsset('models/missile.glb');
	}
} as const;

/** Optional MP3/OGG files in `static/audio/`. Missing files keep procedural sounds. */
export const AUDIO_PATHS = {
	missileLaunch: resolveStaticAsset('audio/missile-launch.mp3'),
	explosion: resolveStaticAsset('audio/explosion.mp3'),
	lockTone: resolveStaticAsset('audio/lock-tone.mp3'),
	lockConfirmed: resolveStaticAsset('audio/lock-confirmed.mp3'),
	warning: resolveStaticAsset('audio/warning.mp3'),
	radioStatic: resolveStaticAsset('audio/radio-static.mp3'),
	uiClick: resolveStaticAsset('audio/ui-click.mp3'),
	missionSuccess: resolveStaticAsset('audio/mission-success.mp3'),
	missionFailure: resolveStaticAsset('audio/mission-failure.mp3'),
	engineLoop: resolveStaticAsset('audio/engine-loop.mp3')
} as const;

export type AudioSampleKey = keyof typeof AUDIO_PATHS;
