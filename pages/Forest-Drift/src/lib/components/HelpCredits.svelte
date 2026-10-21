<script lang="ts">
	import { onMount } from 'svelte';
	import ControlsGuide from './ControlsGuide.svelte';
	import portrait from '$lib/assets/menu/xanderwiles.jpg';
	let { onClose }: { onClose: () => void } = $props();
	let dialog: HTMLDialogElement;
	let selected = $state<'help' | 'credits'>('help');
	onMount(() => {
		dialog.showModal();
	});
	function tabKey(event: KeyboardEvent) {
		if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
		event.preventDefault();
		selected =
			event.key === 'Home'
				? 'help'
				: event.key === 'End'
					? 'credits'
					: selected === 'help'
						? 'credits'
						: 'help';
		dialog.querySelector<HTMLButtonElement>(`#about-tab-${selected}`)?.focus();
	}
</script>

<dialog bind:this={dialog} class="about-dialog" aria-labelledby="about-title" onclose={onClose}>
	<header>
		<div>
			<p class="eyebrow">FOREST DRIFT</p>
			<h2 id="about-title">Help &amp; Credits</h2>
		</div>
		<button class="close" aria-label="Close help and credits" onclick={() => dialog.close()}
			>×</button
		>
	</header>
	<div class="tabs" role="tablist" tabindex="-1" aria-label="Help and credits" onkeydown={tabKey}>
		{#each ['help', 'credits'] as tab}
			<button
				id={`about-tab-${tab}`}
				role="tab"
				aria-selected={selected === tab}
				aria-controls={`about-panel-${tab}`}
				tabindex={selected === tab ? 0 : -1}
				class:active={selected === tab}
				onclick={() => (selected = tab as 'help' | 'credits')}
				>{tab === 'help' ? 'Help' : 'Credits'}</button
			>
		{/each}
	</div>
	<div
		class="tab-panel"
		id="about-panel-help"
		role="tabpanel"
		aria-labelledby="about-tab-help"
		tabindex="0"
		hidden={selected !== 'help'}
	>
		<p class="eyebrow">A LITTLE WONDER. A WORLD OF YOUR OWN.</p>
		<h3>Find your place in the forest.</h3>
		<p>
			Forest Drift is a creative exploration game about making a home in a living, procedural
			landscape. Wander through forests, follow rivers, build something that feels like yours, and
			turn a garden into music.
		</p>
		<p>
			Start with a quiet corner and a little curiosity. Shape a house with foundations, walls,
			windows, stairs and roofs; add furniture and your own creations; then arrange musical plants
			around a Music Tree to compose a garden you can hear.
		</p>
		<div class="guide">
			<h4>Your first adventure</h4>
			<ol>
				<li><strong>Play</strong> opens the Main World, a ready-made forest outpost to explore.</li>
				<li>
					<strong>Worlds</strong> lets you create a world from a seed, revisit your builds, or import
					and export saved worlds.
				</li>
				<li>
					<strong>Explore and create.</strong> Use the in-game controls guide to learn movement, building
					and the music garden. Touch controls are available on mobile.
				</li>
				<li>
					<strong>Make yourself comfortable.</strong> Settings lets you choose graphics quality, field
					of view and audio levels. Online lets you join shared adventures when available.
				</li>
			</ol>
		</div>
		<ControlsGuide />
		<div class="vision">
			<h4>A forest still growing</h4>
			<p>
				The longer-term vision connects exploration, musical plants, creature friendships and a home
				that becomes part of the forest. Seed collecting, cultivation, performances that attract
				listeners, gifts and trading are planned directions—not features to expect in the current
				creative sandbox.
			</p>
		</div>
	</div>
	<div
		class="tab-panel"
		id="about-panel-credits"
		role="tabpanel"
		aria-labelledby="about-tab-credits"
		tabindex="0"
		hidden={selected !== 'credits'}
	>
		<div class="credits-card">
			<div class="portrait-frame">
				<img src={portrait} alt="Xander Wiles" width="2604" height="2604" />
			</div>
			<div>
				<p class="eyebrow">CREATED BY</p>
				<h3>Xander Wiles</h3>
				<p class="role">Creator of Forest Drift</p>
				<div class="ornament" aria-hidden="true">◆</div>
				<p>A world for exploring, building, and finding music in unexpected places.</p>
				<p class="thanks">Thank you for spending a little time in the forest.</p>
			</div>
		</div>
	</div>
	<footer>
		<span>Explore. Build. Make it yours.</span><button onclick={() => dialog.close()}
			>Back to the forest</button
		>
	</footer>
</dialog>

<style>
	.about-dialog {
		width: min(800px, calc(100vw - 32px));
		max-height: calc(100dvh - 32px);
		padding: 0;
		overflow: auto;
		color: #f4e3bd;
		font:
			16px/1.7 Georgia,
			serif;
		border: 4px double #bd9454;
		border-radius: 28px;
		background-color: #2a2016;
		background-image:
			linear-gradient(100deg, #130f0bce, #24190ee0 60%, #100d09ee), var(--fd-wood-image);
		background-size:
			100% 100%,
			100% 320px;
		box-shadow:
			0 0 0 4px #20180fcc,
			inset 0 0 0 4px #110e0b99,
			0 24px 70px #000a;
		scrollbar-color: #a57b3d #21180e;
	}
	.about-dialog::backdrop {
		background: #10190bc4;
		backdrop-filter: blur(5px);
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		padding: 24px 32px 16px;
	}
	.eyebrow {
		color: #d8b368;
		font:
			10px/1.6 system-ui,
			sans-serif;
		letter-spacing: 0.18em;
		margin: 0 0 8px;
	}
	h2 {
		margin: 0;
		font-size: clamp(26px, 4vw, 36px);
		line-height: 1.2;
		text-shadow: 0 3px 2px #0008;
	}
	button {
		cursor: pointer;
		min-height: 44px;
		border: 1px solid #ad813d;
		border-radius: 10px;
		color: #f4e3bd;
		background: linear-gradient(#63492f55, #100b08ac), var(--fd-wood-image);
		background-size: 100% 100%;
		box-shadow:
			inset 0 0 0 2px #1b130d,
			inset 0 3px #dbb87933,
			0 3px 4px #0008;
		font:
			bold 16px Georgia,
			serif;
		padding: 10px 18px;
	}
	button:hover {
		filter: brightness(1.18);
	}
	button:focus-visible,
	.tab-panel:focus-visible {
		outline: 3px solid #ffdb83;
		outline-offset: -3px;
	}
	.close {
		min-width: 44px;
		padding: 0;
		font:
			28px Georgia,
			serif;
	}
	.tabs {
		display: flex;
		gap: 12px;
		padding: 0 32px 20px;
		border-bottom: 1px solid #b58c4b55;
	}
	.tabs button {
		flex: 1;
	}
	.tabs .active {
		background: linear-gradient(#ffe084e6, #efb13bd9 55%, #bd7d25ee), var(--fd-wood-image);
		color: #33200b;
		border-color: #ffcf6b;
	}
	.tab-panel {
		padding: 28px 32px;
	}
	h3 {
		font-size: clamp(26px, 4vw, 34px);
		line-height: 1.2;
		margin: 0 0 18px;
	}
	h4 {
		font-size: 19px;
		margin: 0 0 12px;
		color: #e8bf70;
	}
	p {
		margin: 0 0 16px;
		color: #dfccaa;
	}
	.guide {
		border: 1px solid #ac824244;
		border-radius: 16px;
		background: #100c0855;
		padding: 22px;
		margin: 24px 0;
	}
	ol {
		padding-left: 20px;
		margin: 0;
		color: #dfccaa;
	}
	li + li {
		margin-top: 12px;
	}
	strong {
		color: #f6dfac;
	}
	.vision p {
		font-size: 14px;
		margin-bottom: 0;
	}
	.credits-card {
		display: grid;
		grid-template-columns: minmax(0, 240px) minmax(0, 1fr);
		align-items: center;
		gap: 32px;
		min-height: 340px;
	}
	.portrait-frame {
		padding: 7px;
		border: 3px double #c09a58;
		border-radius: 20px;
		background: #15100b;
		box-shadow: 0 8px 24px #0008;
	}
	img {
		display: block;
		width: 100%;
		height: auto;
		aspect-ratio: 1;
		object-fit: cover;
		border-radius: 12px;
	}
	.role {
		color: #e9c47e;
	}
	.ornament {
		color: #aa803e;
		margin: 20px 0;
	}
	.thanks {
		font-style: italic;
	}
	footer {
		display: flex;
		gap: 16px;
		align-items: center;
		justify-content: space-between;
		padding: 18px 32px 24px;
		border-top: 1px solid #b58c4b55;
	}
	footer span {
		font-size: 12px;
		color: #bca47c;
	}
	@media (max-width: 600px) {
		.about-dialog {
			width: calc(100vw - 20px);
			max-height: calc(100dvh - 20px);
			border-radius: 20px;
			font-size: 15px;
		}
		header {
			padding: 20px 18px 16px;
		}
		.tabs {
			padding: 0 18px 16px;
		}
		.tab-panel {
			padding: 24px 18px;
		}
		.guide {
			padding: 16px;
		}
		.credits-card {
			grid-template-columns: minmax(0, 1fr);
			gap: 24px;
			text-align: center;
		}
		.portrait-frame {
			width: min(200px, 100%);
			margin: auto;
		}
		footer {
			padding: 18px;
			justify-content: center;
		}
		footer span {
			display: none;
		}
		footer button {
			width: 100%;
		}
	}
</style>
