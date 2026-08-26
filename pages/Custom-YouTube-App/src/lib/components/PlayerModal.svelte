<script lang="ts">
	import { player } from '$lib/state/player.svelte';

	const IFRAME_API = 'https://www.youtube.com/iframe_api';

	function loadIframeApi(): Promise<void> {
		if (window.YT?.Player) return Promise.resolve();

		return new Promise((resolve, reject) => {
			const existing = document.querySelector<HTMLScriptElement>(`script[src="${IFRAME_API}"]`);
			const finish = () => resolve();

			if (existing) {
				if (window.YT?.Player) {
					finish();
					return;
				}
				existing.addEventListener('load', finish, { once: true });
				existing.addEventListener(
					'error',
					() => reject(new Error('Could not load the YouTube player.')),
					{ once: true }
				);
				return;
			}

			const previous = window.onYouTubeIframeAPIReady;
			window.onYouTubeIframeAPIReady = () => {
				previous?.();
				finish();
			};

			const script = document.createElement('script');
			script.src = IFRAME_API;
			script.async = true;
			script.onerror = () => reject(new Error('Could not load the YouTube player.'));
			document.head.appendChild(script);
		});
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && player.videoId) {
			event.preventDefault();
			player.close();
		}
	}

	function attachDialog(node: HTMLElement) {
		const closeButton = node.querySelector<HTMLButtonElement>('[data-player-close]');
		const restore = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		closeButton?.focus();

		const videoId = player.videoId;
		if (!videoId) return;

		let cancelled = false;
		let instance: YtIframePlayer | null = null;

		void (async () => {
			try {
				await loadIframeApi();
				if (cancelled || !window.YT?.Player) return;
				instance = new window.YT.Player('yt-player', {
					videoId,
					host: 'https://www.youtube.com',
					playerVars: {
						origin: location.origin,
						rel: 0
					}
				});
			} catch {
				// Close button still works if the embed fails to load.
			}
		})();

		return () => {
			cancelled = true;
			instance?.destroy();
			restore?.focus();
		};
	}
</script>

<svelte:window onkeydown={onKeydown} />

{#if player.videoId}
	{#key player.videoId}
		<div
			class="fixed inset-0 z-50 flex flex-col bg-canvas text-ink"
			role="dialog"
			aria-modal="true"
			aria-labelledby="player-title"
			{@attach attachDialog}
		>
			<div
				class="flex items-center justify-between gap-3 border-b border-line px-4 py-3"
				style="padding-top: max(0.75rem, env(safe-area-inset-top))"
			>
				<h2 id="player-title" class="m-0 min-w-0 truncate text-base font-semibold">
					{player.title || 'Now playing'}
				</h2>
				<button
					type="button"
					class="min-h-11 shrink-0 touch-manipulation rounded-xl border border-line px-4 text-sm font-medium"
					data-player-close
					onclick={() => player.close()}
				>
					Close
				</button>
			</div>
			<div class="flex min-h-0 flex-1 flex-col justify-center px-4 py-4">
				<div class="aspect-video w-full overflow-hidden rounded-2xl bg-panel">
					<div id="yt-player" class="h-full w-full"></div>
				</div>
				<p class="mt-3 mb-0 text-xs leading-relaxed text-muted">
					Premium playback is best-effort in the home-screen PWA; Safari may keep YouTube cookies.
				</p>
			</div>
		</div>
	{/key}
{/if}
