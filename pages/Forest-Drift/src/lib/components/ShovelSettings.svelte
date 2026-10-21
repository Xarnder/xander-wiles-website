<script lang="ts">
	import { untrack } from 'svelte';
	import type { ShovelSettings } from '$lib/game/terrain/ShovelTool';
	let { settings, onClose }: { settings: ShovelSettings; onClose: () => void } = $props();
	let radius = $state(untrack(() => settings.radius));
	let strength = $state(untrack(() => settings.strength));
	let point = $state(untrack(() => settings.point));
	$effect(() => {
		settings.radius = radius;
		settings.strength = strength;
		settings.point = point;
	});
</script>

<div class="shovel-backdrop" role="presentation">
	<div
		class="shovel-panel"
		data-ui-surface="panel"
		role="dialog"
		aria-modal="true"
		aria-labelledby="shovel-title"
		tabindex="-1"
	>
		<header>
			<div>
				<p>LANDSCAPING · SHOVEL</p>
				<h2 id="shovel-title">Shape your clearing</h2>
			</div>
			<button onclick={onClose} aria-label="Close shovel settings">×</button>
		</header>
		<p>
			Raise a gentle bank or lower a patch of ground. Building surfaces, tree roots and water stay
			protected.
		</p>
		<label><input type="checkbox" bind:checked={point} /> Single terrain point</label>
		<label for="shovel-radius">Brush radius <strong>{radius} m</strong></label>
		<input
			id="shovel-radius"
			type="range"
			min="1"
			max="4"
			step=".5"
			bind:value={radius}
			disabled={point}
		/>
		<label for="shovel-strength">Height per step <strong>{strength} m</strong></label>
		<input
			id="shovel-strength"
			type="range"
			min=".125"
			max=".5"
			step=".125"
			bind:value={strength}
		/>
		<div class="instructions">
			<p>Left mouse raises · Right mouse lowers</p>
			<p>Hold to sculpt · Release to save the stroke</p>
			<p>− Undo · + Redo · Escape cancels a stroke</p>
			<p>On touch screens, tap Raise or Lower.</p>
		</div>
		<button class="done" onclick={onClose}>Return to the landscape</button>
	</div>
</div>

<style>
	.shovel-backdrop {
		position: fixed;
		inset: 0;
		z-index: 120;
		pointer-events: none;
	}
	.shovel-panel {
		pointer-events: auto;
		position: absolute;
		left: clamp(8px, 2vw, 28px);
		top: clamp(8px, 3vh, 28px);
		bottom: clamp(8px, 3vh, 28px);
		width: min(420px, calc(100vw - 16px));
		overflow: auto;
		padding: clamp(18px, 3vw, 30px);
		box-sizing: border-box;
		border: 1px solid #a77c3d;
		border-radius: 22px;
		background: linear-gradient(#24180fe8, #130e08f5), var(--fd-wood-image);
		color: #f6e3bb;
		box-shadow: 0 18px 65px #0009;
		font-family: Georgia, serif;
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}
	h2 {
		font-size: 1.8rem;
		margin: 8px 0 20px;
	}
	header p {
		font-size: 0.7rem;
		letter-spacing: 0.15em;
		color: #d6aa60;
	}
	p {
		line-height: 1.6;
	}
	label {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		margin-top: 24px;
	}
	input[type='range'] {
		width: 100%;
		accent-color: #e7b449;
		margin: 16px 0;
	}
	input[type='checkbox'] {
		accent-color: #e7b449;
	}
	.instructions {
		font-size: 0.85rem;
		opacity: 0.8;
		margin: 25px 0;
	}
	button {
		cursor: pointer;
		border: 1px solid #a77c3d;
		border-radius: 9px;
		background: #4b301a;
		color: #ffe9bd;
		padding: 10px 16px;
		font: inherit;
	}
	.done {
		width: 100%;
		background: linear-gradient(#f4cb69, #c49136);
		color: #271809;
		font-weight: bold;
	}
</style>
