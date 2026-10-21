<script lang="ts">
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	import preview from '$lib/assets/menu/countryside-preview.webp';
	import fullImage from '$lib/assets/menu/countryside.png';
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
		<svg class="sprig" viewBox="0 0 90 55" aria-hidden="true"
			><path
				d="M43 53Q45 23 69 3Q78 29 43 53M43 48Q13 41 15 14Q42 18 43 48"
				fill="#85943d"
				stroke="#d0bf67"
			/><path d="M43 52L68 6M43 48L18 18" fill="none" stroke="#daca7a" /></svg
		>
		<h1 aria-label="Forest Drift"><span>Forest</span><span>Drift</span></h1>
		<svg class="crest" viewBox="0 0 300 100" aria-hidden="true"
			><path
				d="M30 82L100 25 125 48 160 5 225 75 245 52 280 84Z"
				fill="#b9a17b"
				stroke="#f6e3ac"
			/><path
				d="M100 25L87 64 110 49 125 76 160 5 151 45 168 33 194 67 179 24 225 75"
				fill="#f4e5c3"
			/>{#each [30, 55, 80, 118, 205, 235, 265] as x, i (x)}<path
					d="M0 0L-10 17H-5L-15 30H-8L-20 44H-3V50H3V44H20L8 30H15L5 17H10Z"
					transform={`translate(${x} ${42 + (i % 3) * 6}) scale(.65)`}
					fill="#ddc89d"
				/>{/each}<path
				d="M5 91H135L150 98 165 91H295"
				fill="none"
				stroke="#e5b955"
				stroke-width="2"
			/></svg
		>
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
		width: min(430px, 60vw);
		text-align: center;
		filter: drop-shadow(0 5px 5px #101c22aa);
	}
	.sprig {
		width: 68px;
		height: 42px;
		margin-bottom: -18px;
		transform: translateX(38px);
	}
	h1 {
		margin: 0;
		font-weight: 700;
		text-transform: uppercase;
		line-height: 0.82;
		letter-spacing: -0.045em;
		text-shadow:
			0 2px #876435,
			0 4px #513b23,
			0 7px 14px #14212c;
	}
	h1 span {
		display: block;
		font-size: clamp(48px, 7.8vw, 108px);
	}
	h1 span + span {
		font-size: clamp(44px, 7vw, 96px);
		color: #f9c653;
		margin-top: 10px;
		text-shadow:
			0 2px #b47a21,
			0 4px #684115,
			0 7px 14px #14212c;
	}
	.crest {
		display: block;
		width: 67%;
		height: auto;
		margin: 20px auto 0;
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
			width: 80vw;
		}
		.brand h1 span {
			font-size: clamp(48px, 15vw, 84px);
		}
		.brand h1 span + span {
			font-size: clamp(44px, 13vw, 76px);
		}
		.loading-status {
			width: 80vw;
			bottom: max(7vh, env(safe-area-inset-bottom, 0px) + 20px);
		}
		.landscape img {
			object-position: 56% center;
		}
		.crest {
			margin-top: 18px;
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
			width: 230px;
		}
		.sprig {
			height: 25px;
			margin-bottom: -12px;
		}
		.brand h1 span {
			font-size: 52px;
		}
		.brand h1 span + span {
			font-size: 46px;
			margin-top: 5px;
		}
		.crest {
			width: 50%;
			margin-top: 10px;
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
