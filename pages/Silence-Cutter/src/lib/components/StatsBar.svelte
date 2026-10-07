<script lang="ts">
	import { formatDuration, type EditStats } from '../core/stats';
	let { stats }: { stats: EditStats | null } = $props();

	const items = $derived(
		stats
			? [
					['Original', formatDuration(stats.originalDuration)],
					['Speech detected', formatDuration(stats.speechDetected)],
					['Silence detected', formatDuration(stats.silenceDetected)],
					['Silence removed', formatDuration(stats.silenceRemoved)],
					['Edited', formatDuration(stats.editedDuration)],
					['Time saved', formatDuration(stats.timeSaved)],
					['Cuts', stats.cuts.toLocaleString()],
					['Words', stats.transcriptWords.toLocaleString()]
				]
			: []
	);
</script>

<dl class="stats" data-testid="stats">
	{#each items as [k, v] (k)}
		<div class="stat" class:hl={k === 'Time saved'}>
			<dt>{k}</dt>
			<dd class="mono" data-testid="stat-{k.toLowerCase().replace(/\s+/g, '-')}">{v}</dd>
		</div>
	{/each}
</dl>

<style>
	.stats {
		display: flex;
		gap: 4px;
		margin: 0;
		flex-wrap: wrap;
	}
	.stat {
		background: var(--panel);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		padding: 3px 10px;
		min-width: 92px;
	}
	.stat.hl {
		border-color: var(--keep);
	}
	dt {
		font-size: 10px;
		color: var(--text-faint);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	dd {
		margin: 0;
		font-size: 14px;
		font-weight: 600;
	}
	.hl dd {
		color: var(--keep);
	}
</style>
