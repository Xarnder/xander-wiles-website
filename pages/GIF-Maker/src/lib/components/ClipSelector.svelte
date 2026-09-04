<script lang="ts">
	import { formatDuration } from '$lib/gif/format';

	let {
		duration,
		startSeconds = $bindable(0),
		endSeconds = $bindable(0)
	}: {
		duration: number;
		startSeconds: number;
		endSeconds: number;
	} = $props();

	const max = $derived(Math.max(0.05, duration));
	const selected = $derived(Math.max(0.05, endSeconds - startSeconds));

	function useFull() {
		startSeconds = 0;
		endSeconds = duration;
	}

	function onStart(value: number) {
		startSeconds = Math.min(Math.max(0, value), endSeconds - 0.05);
	}

	function onEnd(value: number) {
		endSeconds = Math.max(startSeconds + 0.05, Math.min(max, value));
	}
</script>

<section class="stack-tight">
	<div class="row">
		<span class="section-label">Clip</span>
		<button class="ghost" type="button" onclick={useFull}>Use full video</button>
	</div>

	<label class="field">
		<span>Start {formatDuration(startSeconds)}</span>
		<input
			type="range"
			min="0"
			{max}
			step="0.05"
			value={startSeconds}
			oninput={(event) => onStart(Number(event.currentTarget.value))}
		/>
	</label>
	<label class="field">
		<span>End {formatDuration(endSeconds)}</span>
		<input
			type="range"
			min="0"
			{max}
			step="0.05"
			value={endSeconds}
			oninput={(event) => onEnd(Number(event.currentTarget.value))}
		/>
	</label>
	<p class="hint">Using {formatDuration(selected)} of {formatDuration(duration)}</p>
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
</style>
