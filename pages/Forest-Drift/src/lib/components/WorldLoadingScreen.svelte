<script lang="ts">
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	import preview from '#lib/assets/menu/countryside-preview.webp';
	import fullImage from '#lib/assets/menu/countryside.png';
	import ForestDriftLogo from './ForestDriftLogo.svelte';
	let { progress = 0, label = 'Opening your world…' }: { progress: number; label: string } =
		$props();
	let fullReady = $state(false);
	let reducedMotion = $state(false);
	onMount(() => {
		let alive = true;
		const blockGameKeys = (event: KeyboardEvent) => {
			if (event.metaKey || event.ctrlKey) return;
			event.preventDefault();
			event.stopImmediatePropagation();
		};
		window.addEventListener('keydown', blockGameKeys, true);
		reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
		const image = new Image();
		image.src = fullImage;
		void image
			.decode()
			.then(() => {
				if (alive) fullReady = true;
			})
			.catch(() => {});
		return () => {
			alive = false;
			window.removeEventListener('keydown', blockGameKeys, true);
		};
	});
</script>

<div
	class="loading-screen"
	data-ui-loading
	data-testid="loading-screen"
	out:fade={{ duration: reducedMotion ? 0 : 450 }}
>
	<div class="landscape" aria-hidden="true">
		<img src={preview} alt="" fetchpriority="high" />
		{#if fullReady}<img class="full" src={fullImage} alt="" />{/if}
	</div>
	<div class="shade" aria-hidden="true"></div>
	<header class="brand">
		<h1><ForestDriftLogo eager /></h1>
	</header>
	<section class="loading-status" aria-label="World loading">
		<div class="bar-frame">
			<span class="leaf left" aria-hidden="true">❧</span><span class="leaf right" aria-hidden="true"
				>❧</span
			>
			<div
				class="track"
				role="progressbar"
				aria-label="Loading world"
				aria-valuemin="0"
				aria-valuemax="100"
				aria-valuenow={Math.round(progress * 100)}
				aria-valuetext={label}
			>
				<div class="fill" style:transform={`scaleX(${Math.max(0.02, Math.min(1, progress))})`}>
					<span></span>
				</div>
			</div>
		</div>
		<p class="loading-word">
			{progress >= 1 ? 'Welcome home' : 'Loading'}<span aria-hidden="true"
				>{progress >= 1 ? '' : '…'}</span
			>
		</p>
		<p class="stage" role="status">{label}</p>
		<div class="ornament" aria-hidden="true"><span></span>◇<span></span></div>
	</section>
</div>

<style>
	.loading-screen {
		position: fixed;
		inset: 0;
		z-index: 1000;
		overflow: hidden;
		color: #fff2d0;
		background: #263726;
		font-family: Georgia, 'Times New Roman', serif;
		isolation: isolate;
	}
	.landscape,
	.shade {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}
	.landscape {
		animation: arrive 12s ease-out both;
	}
	.landscape img {
		position: absolute;
		width: 100%;
		height: 100%;
		object-fit: cover;
		object-position: 53% 55%;
	}
	.full {
		animation: reveal 0.8s ease-out both;
	}
	.shade {
		background:
			linear-gradient(180deg, #071c2d22, transparent 44%, #13211220 62%, #101b0bd9),
			radial-gradient(ellipse at center, transparent 40%, #111b1433);
	}
	.brand {
		position: absolute;
		top: clamp(22px, 5vh, 70px);
		left: 50%;
		transform: translateX(-50%);
		/* The woodland emblem; short screens shrink it so the loading bar keeps its room. */
		width: min(520px, 60vw, 63vh);
	}
	h1 {
		margin: 0;
		line-height: 0;
	}
	.loading-status {
		position: absolute;
		bottom: max(5vh, env(safe-area-inset-bottom, 0px) + 22px);
		left: 50%;
		transform: translateX(-50%);
		width: min(620px, 76vw);
		text-align: center;
	}
	.bar-frame {
		position: relative;
		padding: 8px;
		border: 1px solid #d7a54a;
		border-radius: 36px;
		background-image: linear-gradient(#51371c88, #231409bb), var(--fd-wood-image);
		background-size:
			auto,
			512px 110px;
		box-shadow:
			0 3px 0 #26170c,
			0 0 0 4px #392615,
			0 0 0 5px #a07a3c,
			0 9px 24px #0009,
			inset 0 2px 2px #f4c86b66;
	}
	.track {
		height: clamp(20px, 3.3vh, 32px);
		border-radius: 24px;
		background: #20150dc7;
		overflow: hidden;
		box-shadow: inset 0 2px 7px #000c;
	}
	.fill {
		height: 100%;
		box-sizing: border-box;
		position: relative;
		overflow: hidden;
		border-radius: 24px;
		border: 1px solid #fff0a0;
		background-image:
			linear-gradient(180deg, #fff09de8, #ffd754e0 42%, #d69a25ed 95%), var(--fd-wood-image);
		background-size:
			auto,
			420px 80px;
		box-shadow:
			inset 0 2px 2px #fff6bd,
			0 0 16px #ffcb4e77;
		width: 100%;
		transform-origin: left;
		will-change: transform;
		transition: transform 0.65s cubic-bezier(0.2, 0.7, 0.25, 1);
	}
	.fill span {
		position: absolute;
		inset: 0;
		background: linear-gradient(105deg, transparent 25%, #fff4b677 50%, transparent 75%);
		transform: translateX(-100%);
		animation: gleam 2.6s ease-in-out infinite;
	}
	.leaf {
		position: absolute;
		color: #a1a84d;
		font-size: 62px;
		top: 50%;
		line-height: 1;
		text-shadow: 1px 2px 3px #15200a;
		z-index: -1;
	}
	.left {
		left: -39px;
		transform: translateY(-50%) rotate(-30deg);
	}
	.right {
		right: -39px;
		transform: translateY(-50%) scaleX(-1) rotate(-30deg);
	}
	.loading-word {
		margin: 20px 0 8px;
		font-size: clamp(16px, 2vw, 23px);
		text-transform: uppercase;
		letter-spacing: 0.25em;
		text-shadow: 0 2px 6px #000;
	}
	.stage {
		margin: 0;
		min-height: 1.4em;
		font:
			13px/1.4 system-ui,
			sans-serif;
		color: #f0e3c6;
		text-shadow: 0 1px 5px #000;
		overflow-wrap: anywhere;
	}
	.ornament {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 10px;
		color: #edc565;
		margin-top: 12px;
	}
	.ornament span {
		width: 80px;
		height: 1px;
		background: linear-gradient(90deg, transparent, #d4ab53);
	}
	.ornament span:last-child {
		transform: rotate(180deg);
	}
	@keyframes gleam {
		to {
			transform: translateX(100%);
		}
	}
	@keyframes arrive {
		from {
			transform: scale(1.035);
		}
		to {
			transform: scale(1);
		}
	}
	@keyframes reveal {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}
	@media (max-width: 600px) {
		.brand {
			top: 8vh;
			width: min(86vw, 420px);
		}
		.loading-status {
			width: 80vw;
			bottom: max(7vh, env(safe-area-inset-bottom, 0px) + 20px);
		}
		.landscape img {
			object-position: 56% center;
		}
		.leaf {
			font-size: 48px;
		}
		.left {
			left: -28px;
		}
		.right {
			right: -28px;
		}
	}
	@media (max-height: 500px) {
		.brand {
			top: 14px;
			width: 260px;
		}
		.loading-status {
			bottom: 16px;
			width: min(520px, 70vw);
		}
		.loading-word {
			margin: 12px 0 4px;
			font-size: 15px;
		}
		.ornament {
			margin-top: 5px;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.landscape,
		.full,
		.fill span {
			animation: none;
		}
		.fill {
			transition: none;
		}
	}
</style>
