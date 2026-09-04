<script lang="ts">
	import { SPEED_PRESETS } from '$lib/gif/constants';
	import {
		clampTargetDuration,
		contentDuration,
		formatDuration,
		formatSpeed,
		outputDuration,
		resolvedPlaybackSpeed,
		snapSpeedPreset
	} from '$lib/gif/format';
	import type { PlaybackMode } from '$lib/gif/types';

	let {
		clipSeconds,
		bounce,
		mode = $bindable('speed'),
		speed = $bindable(1),
		targetSeconds = $bindable(1)
	}: {
		clipSeconds: number;
		bounce: boolean;
		mode: PlaybackMode;
		speed: number;
		targetSeconds: number;
	} = $props();

	const content = $derived(contentDuration(clipSeconds, bounce));
	const maxTarget = $derived(Math.max(0.05, clipSeconds - 0.05));
	const playbackRate = $derived(
		resolvedPlaybackSpeed({
			clipSeconds,
			bounce,
			mode,
			speed,
			targetSeconds
		})
	);
	const gifSeconds = $derived(outputDuration(clipSeconds, bounce, playbackRate));

	function setMode(next: PlaybackMode) {
		if (next === mode) return;
		if (next === 'duration') {
			targetSeconds = clampTargetDuration(content / Math.max(1, speed), clipSeconds);
		} else {
			speed = snapSpeedPreset(playbackRate);
		}
		mode = next;
	}

	function onTarget(value: number) {
		targetSeconds = clampTargetDuration(value, clipSeconds);
	}
</script>

<section class="stack-tight">
	<div class="row">
		<span class="section-label">Playback</span>
	</div>

	<div class="chips" role="group" aria-label="Playback method">
		<button
			class="chip"
			type="button"
			aria-pressed={mode === 'speed'}
			onclick={() => setMode('speed')}
		>
			Speed
		</button>
		<button
			class="chip"
			type="button"
			aria-pressed={mode === 'duration'}
			onclick={() => setMode('duration')}
		>
			Target duration
		</button>
	</div>

	{#if mode === 'speed'}
		<div class="chips" role="group" aria-label="Playback speed">
			{#each SPEED_PRESETS as preset (preset)}
				<button
					class="chip"
					type="button"
					aria-pressed={speed === preset}
					onclick={() => {
						speed = preset;
					}}
				>
					{formatSpeed(preset)}
				</button>
			{/each}
		</div>
	{:else}
		<label class="field">
			<span>GIF length {formatDuration(clampTargetDuration(targetSeconds, clipSeconds))}</span>
			<input
				type="range"
				min="0.05"
				max={maxTarget}
				step="0.05"
				value={clampTargetDuration(targetSeconds, clipSeconds)}
				oninput={(event) => onTarget(Number(event.currentTarget.value))}
			/>
		</label>
		<div class="custom">
			<input
				aria-label="Target duration in seconds"
				inputmode="decimal"
				value={clampTargetDuration(targetSeconds, clipSeconds)}
				oninput={(event) => onTarget(Number(event.currentTarget.value))}
			/>
			<span class="unit">seconds</span>
		</div>
	{/if}

	<p class="hint">
		{#if playbackRate > 1.001}
			GIF plays in {formatDuration(gifSeconds)} at {formatSpeed(playbackRate)}
		{:else}
			GIF plays at the original pace for {formatDuration(gifSeconds)}
		{/if}
		{#if mode === 'duration'}
			· shorter than the {formatDuration(clipSeconds)} clip
		{/if}
	</p>
</section>

<style>
	.stack-tight {
		display: grid;
		gap: 10px;
	}

	.row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}

	.row .section-label {
		margin: 0;
	}

	input[type='range'] {
		width: 100%;
		accent-color: var(--accent);
	}

	.custom {
		display: grid;
		grid-template-columns: 1fr 88px;
		gap: 8px;
		align-items: center;
	}

	.custom input {
		border: 1px solid var(--line);
		background: transparent;
		border-radius: 10px;
		padding: 8px 10px;
	}

	.unit {
		color: var(--muted);
		font-size: 0.86rem;
	}
</style>
