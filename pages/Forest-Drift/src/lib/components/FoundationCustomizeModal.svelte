<script lang="ts">
	import { untrack } from 'svelte';
	import type { BuildingSettings } from '$lib/game/building/FoundationTypes';
	let { settings, onClose }: { settings: BuildingSettings; onClose: () => void } = $props();
	let selected = $state(untrack(() => settings.foundationStyle ?? 'stone'));
	function choose(style: 'stone' | 'earth') {
		selected = style;
		settings.foundationStyle = style;
	}
</script>

<div
	class="backdrop"
	role="presentation"
	onclick={(e) => {
		if (e.target === e.currentTarget) onClose();
	}}
	onkeydown={(e) => {
		if (e.key === 'Escape') onClose();
	}}
>
	<div
		class="panel"
		data-ui-surface="panel"
		role="dialog"
		aria-modal="true"
		aria-labelledby="foundation-title"
		tabindex="-1"
		data-testid="foundation-customize-modal"
	>
		<header>
			<div>
				<p class="eyebrow">BUILD MODE · FOUNDATION</p>
				<h2 id="foundation-title">A place to build</h2>
			</div>
			<button class="close" aria-label="Close foundation styles" onclick={onClose}>×</button>
		</header>
		<p class="intro">Choose the ground beneath your next home.</p>
		<div class="choices" role="group" aria-label="Foundation style">
			<button
				class:chosen={selected === 'stone'}
				aria-pressed={selected === 'stone'}
				data-testid="foundation-style-stone"
				onclick={() => choose('stone')}
			>
				<span class="illustration stone" aria-hidden="true"></span><span
					><strong>Stone foundation</strong><small
						>A sturdy, flat stone platform with exposed masonry sides.</small
					></span
				>
			</button>
			<button
				class:chosen={selected === 'earth'}
				aria-pressed={selected === 'earth'}
				data-testid="foundation-style-earth"
				onclick={() => choose('earth')}
			>
				<span class="illustration earth" aria-hidden="true"></span><span
					><strong>Grass & earth</strong><small
						>Raise a flat grass-covered clearing, with gently blended earth banks.</small
					></span
				>
			</button>
		</div>
		<p class="hint">
			Both use the same two-corner placement and support walls, floors and other building pieces.
			Grass blades are cleared from the footprint.
		</p>
		<button class="done" onclick={onClose} data-testid="foundation-style-done"
			>Continue building</button
		>
		<p class="footer">Applies to new foundations · E or Esc to close</p>
	</div>
</div>

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 120;
		display: flex;
		align-items: center;
		padding: clamp(0.75rem, 3vw, 2rem);
		background: #090d0b55;
	}
	.panel {
		width: min(100%, 28rem);
		max-height: calc(100dvh - 2rem);
		overflow: auto;
		box-sizing: border-box;
		padding: clamp(1rem, 3vw, 1.7rem);
		color: #f5e5c3;
		border: 1px solid #b88b43;
		border-radius: 18px;
		background: linear-gradient(#241b12e8, #17120deb), var(--fd-wood-image);
		box-shadow:
			0 18px 70px #0009,
			inset 0 0 0 4px #b88b431b;
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}
	h2 {
		font-family: Georgia, serif;
		font-size: 1.8rem;
		margin: 0.35rem 0;
	}
	.eyebrow {
		color: #e0b968;
		letter-spacing: 0.15em;
		font-size: 0.65rem;
		margin: 0;
	}
	.intro,
	.hint {
		font-size: 0.9rem;
		line-height: 1.6;
		color: #c9b99b;
	}
	.choices {
		display: grid;
		gap: 0.8rem;
		margin: 1.3rem 0;
	}
	button {
		cursor: pointer;
		color: inherit;
		font: inherit;
		border: 1px solid #896535;
		background: #15100b88;
		border-radius: 10px;
	}
	button:focus-visible {
		outline: 2px solid #ffdc83;
		outline-offset: 3px;
	}
	.choices button {
		display: flex;
		align-items: center;
		gap: 1rem;
		text-align: left;
		padding: 1rem;
	}
	.choices button:hover {
		background: #76552655;
	}
	.choices button.chosen {
		border-color: #efc466;
		background: #ad7c2430;
		box-shadow: inset 0 0 0 1px #efc46655;
	}
	.choices button strong {
		color: #f5e5c3 !important;
	}
	.choices button.chosen strong,
	.choices button.chosen small {
		color: #36250d !important;
	}
	strong,
	small {
		display: block;
	}
	strong {
		font-family: Georgia, serif;
		font-size: 1.1rem;
		margin-bottom: 0.4rem;
	}
	small {
		font-size: 0.8rem;
		line-height: 1.5;
		color: #ccbea4;
	}
	.illustration {
		display: block;
		flex-shrink: 0;
		width: 3.4rem;
		height: 2.6rem;
		transform: skewY(-8deg);
		border-radius: 4px;
		box-shadow: 0 8px 12px #0006;
	}
	.stone {
		background:
			repeating-linear-gradient(0deg, transparent 0 10px, #574e40 10px 12px),
			repeating-linear-gradient(90deg, #8c8371 0 17px, #5c5447 17px 19px);
		border-top: 7px solid #beb19a;
	}
	.earth {
		background: linear-gradient(#66803c 0 30%, #4e682e 30% 45%, #77603d 45%, #423423);
		border-radius: 40% 40% 10% 10%;
		border-top: 6px solid #89a455;
	}
	.close {
		font-size: 1.6rem;
		width: 2.3rem;
		height: 2.3rem;
	}
	.done {
		width: 100%;
		padding: 0.8rem;
		background: linear-gradient(#ebbf62, #b77a25);
		color: #281b0c;
		font-weight: 700;
	}
	.footer {
		text-align: center;
		font-size: 0.7rem;
		color: #ac9875;
		margin: 1rem 0 0;
	}
</style>
