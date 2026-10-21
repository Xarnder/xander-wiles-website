<script lang="ts">
	import { onMount, tick } from 'svelte';
	import preview from '$lib/assets/menu/countryside-preview.webp';
	import fullImage from '$lib/assets/menu/countryside.png';
	import SettingsMenu from './SettingsMenu.svelte';
	import HelpCredits from './HelpCredits.svelte';
	let helpOpen = $state(false);
	import { personalSettingsCatalog } from '$lib/game/settings/personalSettingsCatalog';

	let {
		onPlay,
		onWorlds,
		onOnline,
		busy = false,
		error = null
	}: {
		onPlay: () => void;
		onWorlds: () => void;
		onOnline?: () => void;
		busy?: boolean;
		error?: string | null;
	} = $props();
	let fullReady = $state(false);
	let settingsOpen = $state(false);
	let settingsButton: HTMLButtonElement;
	async function closePersonalSettings() {
		settingsOpen = false;
		await tick();
		settingsButton?.focus();
	}
	let onlineDialog: HTMLDialogElement;
	let upgradeStarted = false;
	let disposed = false;
	async function upgradeBackground() {
		if (upgradeStarted || disposed) return;
		upgradeStarted = true;
		const image = new Image();
		image.decoding = 'async';
		image.src = fullImage;
		try {
			await image.decode();
			if (!disposed) fullReady = true;
		} catch {
			/* The immediate WebP remains visible if the full image cannot load. */
		}
	}
	onMount(() => {
		return () => {
			disposed = true;
		};
	});
	const leaves = Array.from({ length: 26 }, (_, i) => ({
		x: 12 + Math.sin(i * 2.3) * 20,
		y: i * 35,
		angle: i % 2 ? -45 - (i % 4) * 12 : 40 + (i % 5) * 11,
		size: 0.7 + (i % 4) * 0.15
	}));
</script>

<svelte:head>
	<link rel="preload" as="image" href={preview} fetchpriority="high" />
</svelte:head>

<main inert={settingsOpen} class="landing" data-testid="landing-menu">
	<div class="landscape" aria-hidden="true">
		<img
			src={preview}
			alt=""
			fetchpriority="high"
			onload={upgradeBackground}
			onerror={upgradeBackground}
		/>
		{#if fullReady}<img
				class="full-image"
				src={fullImage}
				alt=""
				data-testid="full-background"
			/>{/if}
	</div>
	<div class="vignette" aria-hidden="true"></div>
	<section class="timber-panel" aria-label="Forest Drift main menu">
		<div class="frame" aria-hidden="true"></div>
		<div class="panel-content">
			<header class="brand">
				<svg class="sprig" viewBox="0 0 90 55" aria-hidden="true"
					><path
						d="M43 53Q45 23 69 3Q78 29 43 53M43 48Q13 41 15 14Q42 18 43 48"
						fill="#6e7e32"
						stroke="#a3a451"
					/><path d="M43 52L68 6M43 48L18 18" fill="none" stroke="#cfbf73" /></svg
				>
				<h1><span>Forest</span><span>Drift</span></h1>
				<svg class="crest" viewBox="0 0 300 100" aria-hidden="true">
					<path
						d="M43 82L102 27 125 48 160 5 219 70 240 50 271 84Z"
						fill="#67543b"
						stroke="#ac8650"
					/>
					<path
						d="M102 27L89 66 109 51 125 76 160 5 152 45 168 33 192 66 179 24 219 70"
						fill="#30281d"
					/>
					{#each [30, 52, 76, 115, 142, 202, 230, 259] as x, i}<path
							d="M0 0L-9 17H-5L-14 29H-8L-19 43H-3V49H3V43H19L8 29H14L5 17H9Z"
							transform={`translate(${x} ${38 + (i % 3) * 8}) scale(${0.65 + (i % 3) * 0.17})`}
							fill={i % 2 ? '#30291b' : '#8b7042'}
						/>{/each}
					<path d="M6 92Q80 84 145 94Q220 83 294 90" fill="none" stroke="#a67a37" />
				</svg>
			</header>
			<nav aria-label="Main menu">
				<button class="menu-button play" onclick={onPlay} disabled={busy}
					><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M7 3L28 16 7 29Z" /></svg><span
						>{busy ? 'Loading…' : 'Play'}</span
					></button
				>
				<button class="menu-button" onclick={onWorlds}
					><svg viewBox="0 0 32 32" aria-hidden="true"
						><path
							d="M3 7L11 3 21 7 29 3V25L21 29 11 25 3 29ZM11 3V25M21 7V29"
							fill="none"
							stroke="currentColor"
							stroke-width="3"
						/></svg
					><span>Worlds</span></button
				>
				<button bind:this={settingsButton} class="menu-button" onclick={() => (settingsOpen = true)}
					><svg viewBox="0 0 32 32" aria-hidden="true"
						><path
							d="M13 2H19L20 7 24 9 29 8 32 14 28 17 27 21 29 25 24 29 20 26 16 27 13 31 7 28 8 23 5 20 0 19V13L5 12 8 8 8 3 13 2Z"
						/><circle cx="16" cy="16" r="6" fill="#322416" /></svg
					><span>Settings</span></button
				>
				<button
					class="menu-button"
					onclick={() => (onOnline ? onOnline() : onlineDialog.showModal())}
					><svg viewBox="0 0 32 32" aria-hidden="true"
						><circle cx="16" cy="8" r="5" /><circle cx="5" cy="12" r="4" /><circle
							cx="27"
							cy="12"
							r="4"
						/><path
							d="M8 29V23Q8 15 16 15Q24 15 24 23V29ZM0 27V22Q0 17 6 17L8 18Q5 22 6 27ZM26 27Q27 22 24 18L26 17Q32 17 32 22V27Z"
						/></svg
					><span>Online</span></button
				>
			</nav>
			<div class="divider" aria-hidden="true"><span>◇</span></div>
			<button class="help-credits" onclick={() => (helpOpen = true)}
				><span aria-hidden="true">✧</span> Help &amp; Credits</button
			>
			{#if error}<p class="error" role="alert">{error}</p>{/if}
			<p class="footer">A little wonder. A world of your own.</p>
		</div>
		<svg class="ivy ivy-left" viewBox="-40 0 100 950" preserveAspectRatio="none" aria-hidden="true">
			<path d="M10 -20Q-20 180 14 340T0 620T12 950" fill="none" stroke="#554c22" stroke-width="5" />
			{#each leaves as leaf, i}<g
					transform={`translate(${leaf.x} ${leaf.y}) rotate(${leaf.angle}) scale(${leaf.size})`}
					><path
						d="M0 0Q-29 -18 0 -50Q29 -18 0 0"
						fill={['#455525', '#667433', '#303f1b', '#7a8038'][i % 4]}
						stroke="#8d8a3d"
						stroke-width="0.6"
					/><path
						d="M0 0V-43M0 -14L-10 -27M0 -24L10 -36"
						fill="none"
						stroke="#b0a453"
						stroke-opacity=".45"
					/></g
				>{/each}
		</svg>
		<svg class="ivy ivy-right" viewBox="-40 0 100 950" preserveAspectRatio="none" aria-hidden="true"
			><path
				d="M10 -20Q-20 180 14 340T0 620T12 950"
				fill="none"
				stroke="#554c22"
				stroke-width="4"
			/>{#each leaves.filter((_, i) => i < 5 || i > 19) as leaf, i}<g
					transform={`translate(${leaf.x} ${leaf.y}) rotate(${leaf.angle}) scale(${leaf.size})`}
					><path
						d="M0 0Q-29 -18 0 -50Q29 -18 0 0"
						fill={['#57652a', '#7a8038', '#38451e'][i % 3]}
						stroke="#a49b52"
						stroke-width=".6"
					/><path d="M0 0V-43" stroke="#b0a453" stroke-opacity=".5" /></g
				>{/each}</svg
		>
		<div class="lantern" aria-hidden="true">
			<div class="lantern-loop"></div>
			<div class="lantern-roof"></div>
			<div class="lantern-glass"><i></i></div>
			<div class="lantern-base"></div>
		</div>
	</section>
</main>

{#if settingsOpen}
	<SettingsMenu
		fullscreen
		categories={personalSettingsCatalog()}
		onClose={() => void closePersonalSettings()}
	/>
{/if}
{#if helpOpen}<HelpCredits onClose={() => (helpOpen = false)} />{/if}

<dialog bind:this={onlineDialog} class="menu-dialog">
	<form method="dialog">
		<button class="close" aria-label="Close online information">×</button>
	</form>
	<p class="eyebrow">BETTER TOGETHER</p>
	<h2>Online adventures</h2>
	<p>Online play isn’t available in this build. Your local worlds are ready to explore.</p>
	<form method="dialog"><button class="dialog-done">Back to the inn</button></form>
</dialog>

<style>
	.landing {
		position: fixed;
		inset: 0;
		overflow: auto;
		background: #526d39;
		color: #f4e3bd;
		font-family: Georgia, 'Times New Roman', serif;
	}
	.landscape,
	.vignette {
		position: fixed;
		inset: 0;
		pointer-events: none;
	}
	.landscape img {
		position: absolute;
		width: 100%;
		height: 100%;
		object-fit: cover;
		object-position: 57% center;
	}
	.full-image {
		animation: reveal 0.65s ease both;
	}
	.vignette {
		background:
			linear-gradient(90deg, #12170b30, transparent 48%),
			linear-gradient(0deg, #15200f44, transparent 22%);
	}
	.timber-panel {
		position: relative;
		isolation: isolate;
		width: min(100%, clamp(300px, 27vw, 455px));
		min-height: 100svh;
		padding: 5.5vh 30px 20px 48px;
		background-color: #2c2117;
		background-image:
			linear-gradient(90deg, #0d0b09aa, transparent 20%, #15100b40 85%, #080604cc),
			linear-gradient(0deg, #0c0a08c9, #1c140b33 65%, #19120a55), var(--fd-wood-image);
		background-size:
			100% 100%,
			100% 100%,
			100% 240px;
		background-repeat: no-repeat, no-repeat, repeat-y;
		border-right: 5px ridge #9b733c;
		box-shadow:
			8px 0 15px #16190e88,
			inset 14px 0 20px #000b;
	}
	.frame {
		position: absolute;
		inset: 16px 10px 20px 29px;
		border: 3px double #9b743c;
		border-radius: 42px 52px 58px 22px;
		box-shadow:
			0 0 0 5px #100d0999,
			inset 0 0 0 5px #100d0977,
			inset 0 0 30px #0007;
		z-index: -1;
	}
	.panel-content {
		position: relative;
		z-index: 2;
	}
	.brand {
		text-align: center;
		margin-bottom: 2.5vh;
	}
	.sprig {
		width: 62px;
		height: 42px;
		margin-bottom: -14px;
		position: relative;
		margin-left: 25px;
	}
	h1 {
		margin: 0;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: -4px;
		line-height: 0.86;
		text-shadow:
			0 3px 1px #080603,
			2px 0 #624321,
			0 7px 9px #0009;
	}
	h1 span {
		display: block;
		font-size: clamp(58px, 5.1vw, 88px);
	}
	h1 span:first-child::first-letter {
		font-size: 1.23em;
	}
	h1 span:last-child {
		color: #f1bc52;
		font-size: clamp(65px, 5.5vw, 96px);
		margin-top: 5px;
	}
	.crest {
		display: block;
		width: 86%;
		height: clamp(62px, 10vh, 105px);
		margin: 10px auto 0;
		filter: drop-shadow(0 3px 2px #0007);
	}
	nav {
		display: grid;
		gap: 13px;
	}
	.menu-button {
		position: relative;
		width: 100%;
		display: flex;
		align-items: center;
		gap: 30px;
		padding: 0 28px;
		min-height: clamp(58px, 8.4vh, 83px);
		border: 2px solid #a77131;
		border-radius: 18px;
		color: #f5e3bf;
		background-color: #4b3826;
		background-image: linear-gradient(180deg, #5c432933, #0b0906a8), var(--fd-wood-image);
		background-size: 100% 100%;
		box-shadow:
			inset 0 0 0 3px #18100a,
			inset 0 5px 2px #e2b66c55,
			0 4px 4px #000b;
		font:
			bold clamp(23px, 2vw, 33px)/1 Georgia,
			serif;
		text-align: left;
		cursor: pointer;
		transition:
			filter 0.18s,
			transform 0.18s;
	}
	.menu-button svg {
		width: 32px;
		height: 32px;
		flex-shrink: 0;
		fill: currentColor;
		color: #efb954;
		filter: drop-shadow(1px 2px 1px #0009);
	}
	.menu-button.play {
		color: #34200c;
		border-color: #ffce5e;
		background-color: #ecad35;
		background-image:
			linear-gradient(180deg, #ffe084d9, #f7bd44b8 48%, #c27b1cbb), var(--fd-wood-image);
		box-shadow:
			0 0 0 2px #211409,
			0 0 0 4px #e6a734,
			inset 0 0 0 3px #83551e,
			inset 0 5px 3px #fff5bb,
			0 7px 7px #000b;
		margin-bottom: 3px;
	}
	.play svg {
		color: #4f3314;
		filter: drop-shadow(1px 1px 0 #ffe195);
	}
	.menu-button:hover {
		filter: brightness(1.17);
		transform: translateX(3px);
	}
	.menu-button:active {
		transform: translateY(2px);
	}
	.menu-button:disabled {
		cursor: wait;
		opacity: 0.7;
	}
	button:focus-visible {
		outline: 3px solid #ffdf88;
		outline-offset: 5px;
	}
	.divider {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 22px 15px;
		color: #bc8739;
	}
	.divider::before,
	.divider::after {
		content: '';
		height: 1px;
		flex: 1;
		background: linear-gradient(90deg, transparent, #ac7a37);
	}
	.divider::after {
		transform: rotate(180deg);
	}
	.help-credits {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 12px;
		width: 73%;
		margin: auto;
		border: 1px solid #a47a40;
		border-radius: 10px;
		box-shadow:
			inset 0 0 0 3px #130f0b,
			0 3px 5px #0009;
		color: #cbb08a;
		background: #1b140b66;
		min-height: 42px;
		font:
			16px Georgia,
			serif;
		cursor: pointer;
		padding: 8px;
		width: 100%;
	}
	.help-credits:hover {
		color: #ffe3a5;
		background: #79572a44;
	}
	.footer {
		text-align: center;
		font-size: 10px;
		letter-spacing: 0.08em;
		color: #b39c72;
		margin: 24px 0 0;
	}
	.error {
		padding: 10px;
		color: #ffe0ac;
		font: 13px/1.5 system-ui;
		background: #331610;
		border-radius: 8px;
	}
	.ivy {
		position: absolute;
		pointer-events: none;
		width: 74px;
		height: 100%;
		top: 0;
		filter: drop-shadow(3px 5px 4px #0009);
		z-index: 3;
	}
	.ivy-left {
		left: -22px;
	}
	.ivy-right {
		right: -33px;
		width: 64px;
	}
	.lantern {
		position: absolute;
		top: 9%;
		left: -12px;
		width: 57px;
		z-index: 4;
		filter: drop-shadow(0 5px 5px #000a);
		transform: rotate(-3deg);
	}
	.lantern-loop {
		width: 17px;
		height: 28px;
		border: 4px solid #473322;
		border-radius: 50%;
		margin: auto;
	}
	.lantern-roof {
		height: 25px;
		background: linear-gradient(160deg, #a57a3e, #30251c 60%);
		clip-path: polygon(50% 0, 100% 85%, 100% 100%, 0 100%, 0 85%);
	}
	.lantern-glass {
		height: 88px;
		border: 5px ridge #9c7133;
		background: radial-gradient(ellipse, #fff9bb, #ffcf53 40%, #a85b18);
		position: relative;
		box-shadow:
			0 0 35px #ffc74277,
			0 0 70px #ffc74244;
	}
	.lantern-glass::before,
	.lantern-glass::after {
		content: '';
		position: absolute;
		inset: 0;
		background: linear-gradient(32deg, transparent 46%, #63431e 48%, #63431e 51%, transparent 53%);
	}
	.lantern-glass::after {
		transform: scaleX(-1);
	}
	.lantern-glass i {
		position: absolute;
		width: 6px;
		height: 100%;
		background: #725022;
		left: 45%;
	}
	.lantern-base {
		height: 16px;
		background: linear-gradient(#ad8344, #34251a);
		clip-path: polygon(0 0, 100% 0, 80% 80%, 58% 80%, 50% 100%, 40% 80%, 20% 80%);
	}
	.menu-dialog {
		width: min(440px, calc(100vw - 32px));
		border: 2px solid #b78a43;
		border-radius: 20px;
		padding: 32px;
		color: #f4e3bd;
		background: linear-gradient(#21190ce8, #16100def), var(--fd-wood-image);
		background-size: cover;
		box-shadow: 0 20px 80px #000b;
		font:
			16px/1.6 Georgia,
			serif;
	}
	.menu-dialog::backdrop {
		background: #0b130b99;
		backdrop-filter: blur(5px);
	}
	.menu-dialog h2 {
		font-size: 34px;
		margin: 0 0 22px;
	}
	.menu-dialog p {
		color: #c4b494;
		font-size: 14px;
	}
	.menu-dialog .eyebrow {
		color: #e7b85e;
		font: 10px system-ui;
		letter-spacing: 0.18em;
	}
	.close {
		position: absolute;
		top: 14px;
		right: 18px;
		background: none;
		border: 0;
		color: #e3c68e;
		font-size: 27px;
		cursor: pointer;
	}
	.dialog-done {
		width: 100%;
		padding: 10px;
		border: 1px solid #f2ce79;
		border-radius: 8px;
		background: linear-gradient(#f5cf79, #c58c32);
		color: #2a1a0c;
		font: bold 18px Georgia;
		cursor: pointer;
	}
	@keyframes reveal {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}
	@media (min-height: 1000px) {
		.timber-panel {
			padding-top: 9vh;
		}
	}
	/* A floating sign leaves the inn visible above the menu on narrow screens.
	   Content keeps its natural height and scrolls when zoom or a keyboard reduces space. */
	@media (max-width: 600px) {
		.landing {
			padding: max(12px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right))
				max(16px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left));
		}
		.timber-panel {
			width: min(100%, 380px);
			min-height: 0;
			margin: clamp(12px, calc(100svh - 560px), 32svh) auto 0;
			padding: clamp(18px, 3svh, 28px) clamp(22px, 7vw, 32px) 20px;
			border: 3px ridge #9b733c;
			border-radius: 30px;
			box-shadow:
				0 14px 45px #0b100cb3,
				inset 0 0 24px #0009;
		}
		.panel-content {
			container-type: inline-size;
		}
		.frame {
			inset: 7px;
			border-radius: 23px;
		}
		.landscape img {
			object-position: 54% 25%;
		}
		.vignette {
			background: linear-gradient(0deg, #101c1480, transparent 75%);
		}
		.sprig {
			width: 42px;
			height: 27px;
			margin-top: -8px;
			margin-bottom: -9px;
		}
		h1 {
			letter-spacing: -0.045em;
		}
		h1 span {
			font-size: clamp(32px, 19cqi, 58px);
		}
		h1 span:last-child {
			font-size: clamp(36px, 21cqi, 64px);
			margin-top: 3px;
		}
		.crest {
			height: clamp(28px, 5svh, 42px);
			width: 65%;
			margin-top: 6px;
		}
		.brand {
			margin-bottom: clamp(12px, 2svh, 18px);
		}
		nav {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: 10px;
		}
		.menu-button {
			min-height: clamp(48px, 7svh, 58px);
			padding: 10px 8px;
			gap: clamp(6px, 2vw, 12px);
			font-size: clamp(16px, 7.3cqi, 23px);
			justify-content: center;
			border-radius: 13px;
		}
		.menu-button.play,
		.menu-button:last-child {
			grid-column: 1 / -1;
		}
		.menu-button.play {
			font-size: clamp(23px, 9cqi, 28px);
		}
		.menu-button svg {
			width: clamp(19px, 8cqi, 25px);
			height: clamp(19px, 8cqi, 25px);
		}
		.divider {
			margin: 12px 16px;
			line-height: 12px;
		}
		.help-credits {
			min-height: 44px;
			width: 100%;
			font-size: 16px;
		}
		.footer {
			font-size: 10px;
			line-height: 1.5;
			letter-spacing: 0.03em;
			margin: 12px 0 0;
		}
		.ivy {
			width: 46px;
		}
		.ivy-left {
			left: -14px;
		}
		.ivy-right {
			right: -9px;
		}
		.lantern {
			top: 36px;
			left: -13px;
			transform: rotate(-3deg) scale(0.65);
			transform-origin: top left;
		}
		.menu-dialog {
			max-height: calc(100dvh - 32px);
			overflow-y: auto;
			padding: 24px;
		}
	}
	@media (max-height: 650px) and (min-width: 601px) {
		.timber-panel {
			width: 300px;
			padding-top: 15px;
		}
		.sprig {
			height: 28px;
		}
		h1 span {
			font-size: 49px;
		}
		h1 span:last-child {
			font-size: 55px;
		}
		.crest {
			height: 50px;
			margin-top: 6px;
		}
		.brand {
			margin-bottom: 12px;
		}
		nav {
			gap: 9px;
		}
		.menu-button {
			min-height: 48px;
			font-size: 23px;
		}
		.menu-button svg {
			width: 25px;
			height: 25px;
		}
		.divider {
			margin: 12px;
		}
		.footer {
			margin-top: 12px;
		}
	}
	@media (max-height: 450px) and (min-width: 601px) {
		.timber-panel {
			padding-top: 16px;
			padding-bottom: 14px;
		}
		.sprig,
		.crest,
		.footer {
			display: none;
		}
		h1 span {
			font-size: 37px;
		}
		h1 span:last-child {
			font-size: 40px;
		}
		.brand {
			margin-bottom: 14px;
		}
		nav {
			gap: 8px;
		}
		.menu-button {
			min-height: 44px;
		}
		.divider {
			margin: 8px 12px;
			line-height: 12px;
		}
		.help-credits {
			min-height: 44px;
		}
	}
	@media (hover: none) {
		.menu-button:hover {
			transform: none;
			filter: none;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.full-image {
			animation: none;
		}
		.menu-button {
			transition: none;
		}
	}
</style>
