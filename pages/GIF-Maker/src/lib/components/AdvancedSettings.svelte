<script lang="ts">
	import { defaultConstraints } from '$lib/gif/candidate-generator';
	import type { AdvancedConstraints, DitherStrategy, OptimisationPreference } from '$lib/gif/types';

	let { constraints = $bindable() }: { constraints: AdvancedConstraints } = $props();

	let maxWidth = $state(constraints.maxWidth ? String(constraints.maxWidth) : '');
	let maxFps = $state(constraints.maxFps ? String(constraints.maxFps) : '');
	let minFps = $state(constraints.minFps ? String(constraints.minFps) : '');
	let colourCount = $state(constraints.colourCount ? String(constraints.colourCount) : '');

	function numberOrUndefined(value: string, min: number, max: number): number | undefined {
		if (!value.trim()) return undefined;
		const parsed = Number(value);
		if (!Number.isFinite(parsed)) return undefined;
		return Math.min(max, Math.max(min, parsed));
	}

	function sync() {
		constraints = {
			preference: constraints.preference,
			maxWidth: numberOrUndefined(maxWidth, 160, 960),
			maxFps: numberOrUndefined(maxFps, 3, 24),
			minFps: numberOrUndefined(minFps, 3, 24),
			colourCount: numberOrUndefined(colourCount, 16, 256),
			dither: constraints.dither
		};
	}

	function reset() {
		constraints = defaultConstraints();
		maxWidth = '';
		maxFps = '';
		minFps = '';
		colourCount = '';
	}
</script>

<details class="box">
	<summary>Advanced</summary>
	<div class="grid">
		<label class="field">
			<span>Maximum width</span>
			<input
				type="number"
				min="160"
				max="960"
				placeholder="Automatic"
				bind:value={maxWidth}
				oninput={sync}
			/>
		</label>
		<label class="field">
			<span>Maximum FPS</span>
			<input
				type="number"
				min="3"
				max="24"
				placeholder="Automatic"
				bind:value={maxFps}
				oninput={sync}
			/>
		</label>
		<label class="field">
			<span>Minimum FPS</span>
			<input
				type="number"
				min="3"
				max="24"
				placeholder="Automatic"
				bind:value={minFps}
				oninput={sync}
			/>
		</label>
		<label class="field">
			<span>Colour count</span>
			<input
				type="number"
				min="16"
				max="256"
				placeholder="Automatic"
				bind:value={colourCount}
				oninput={sync}
			/>
		</label>
		<label class="field">
			<span>Dithering</span>
			<select
				value={constraints.dither ?? ''}
				onchange={(event) => {
					const value = event.currentTarget.value;
					constraints = {
						...constraints,
						dither: value === '' ? undefined : (value as DitherStrategy)
					};
				}}
			>
				<option value="">Automatic</option>
				<option value="sierra2_4a">Sierra</option>
				<option value="floyd_steinberg">Floyd–Steinberg</option>
				<option value="bayer">Bayer</option>
				<option value="none">None</option>
			</select>
		</label>
		<label class="field">
			<span>Optimisation preference</span>
			<select
				value={constraints.preference}
				onchange={(event) => {
					constraints = {
						...constraints,
						preference: event.currentTarget.value as OptimisationPreference
					};
				}}
			>
				<option value="automatic">Automatic</option>
				<option value="sharper">Sharper image</option>
				<option value="smoother">Smoother motion</option>
				<option value="smaller">Smaller dimensions</option>
			</select>
		</label>
	</div>
	<button class="ghost reset" type="button" onclick={reset}>Reset to automatic</button>
</details>

<style>
	.grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
		margin-top: 12px;
	}

	.reset {
		margin-top: 12px;
	}

	@media (max-width: 560px) {
		.grid {
			grid-template-columns: 1fr;
		}
	}
</style>
