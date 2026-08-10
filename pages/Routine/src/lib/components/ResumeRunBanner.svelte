<script lang="ts">
	let {
		routineName,
		taskIndex,
		taskTotal,
		oncontinue,
		ondiscard
	}: {
		routineName: string;
		taskIndex: number;
		taskTotal: number;
		oncontinue: () => void;
		ondiscard: () => void;
	} = $props();
</script>

<aside class="banner card" data-testid="resume-run-banner">
	<div class="copy">
		<p class="eyebrow">Unfinished run</p>
		<h2>{routineName}</h2>
		<p>Task {taskIndex + 1} of {taskTotal}</p>
	</div>
	<div class="actions">
		<button type="button" class="btn btn-primary" onclick={oncontinue} data-testid="resume-run">
			Continue
		</button>
		<button type="button" class="btn btn-ghost" onclick={ondiscard} data-testid="discard-run">
			Discard
		</button>
	</div>
</aside>

<style>
	.banner {
		padding: 1rem 1.05rem;
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
		margin-bottom: 1rem;
		border-color: color-mix(in srgb, var(--accent) 35%, var(--line));
		background: color-mix(in srgb, var(--accent-soft) 55%, var(--surface));
	}

	.copy {
		min-width: 0;
	}

	.eyebrow {
		margin: 0;
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--accent-strong);
	}

	h2 {
		margin: 0.25rem 0 0.15rem;
		font-family: var(--font-display);
		font-size: 1.25rem;
		color: var(--ink);
	}

	p {
		margin: 0;
		color: var(--ink-soft);
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.actions .btn {
		min-height: 2.6rem;
		padding: 0.55rem 1rem;
	}
</style>
