<script lang="ts">
	import { DEFAULT_TARGET_BYTES, PRESET_SIZES } from '$lib/gif/constants';
	import { parseSizeInput } from '$lib/gif/format';

	let { bytes = $bindable(DEFAULT_TARGET_BYTES) }: { bytes: number } = $props();

	let custom = $state(false);
	let customValue = $state('10');
	let customUnit = $state<'KB' | 'MB'>('MB');
	let customError = $state<string | null>(null);

	function selectPreset(next: number) {
		custom = false;
		customError = null;
		bytes = next;
	}

	function applyCustom() {
		try {
			bytes = parseSizeInput(customValue, customUnit);
			customError = null;
			custom = true;
		} catch (error) {
			customError = error instanceof Error ? error.message : 'Enter a valid size';
		}
	}

	function startCustom() {
		custom = true;
		applyCustom();
	}
</script>

<section>
	<span class="section-label" id="size-label">Maximum GIF size</span>
	<div class="chips" role="group" aria-labelledby="size-label">
		{#each PRESET_SIZES as preset (preset.label)}
			<button
				class="chip"
				type="button"
				aria-pressed={!custom && bytes === preset.bytes}
				onclick={() => selectPreset(preset.bytes)}
			>
				{preset.label}
			</button>
		{/each}
		<button class="chip" type="button" aria-pressed={custom} onclick={startCustom}>Custom</button>
	</div>

	{#if custom}
		<div class="custom">
			<input
				aria-label="Custom size"
				inputmode="decimal"
				bind:value={customValue}
				oninput={applyCustom}
			/>
			<select aria-label="Size unit" bind:value={customUnit} onchange={applyCustom}>
				<option value="MB">MB</option>
				<option value="KB">KB</option>
			</select>
		</div>
		{#if customError}
			<p class="hint">{customError}</p>
		{/if}
	{/if}
</section>

<style>
	.custom {
		display: grid;
		grid-template-columns: 1fr 88px;
		gap: 8px;
		margin-top: 10px;
	}

	input,
	select {
		border: 1px solid var(--line);
		background: transparent;
		border-radius: 10px;
		padding: 8px 10px;
	}
</style>
