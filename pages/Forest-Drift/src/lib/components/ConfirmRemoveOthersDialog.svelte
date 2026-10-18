<script lang="ts">
	import type { DeletionItem } from '$lib/game/net/WorldOpFeed';

	interface Props {
		items: DeletionItem[];
		onConfirm: () => void;
		onCancel: () => void;
	}

	const { items, onConfirm, onCancel }: Props = $props();

	const NOUNS: Record<string, [string, string]> = {
		foundation: ['foundation', 'foundations'],
		buildingLevel: ['storey', 'storeys'],
		wall: ['wall', 'walls'],
		wallPath: ['wall', 'walls'],
		pathSegment: ['wall section', 'wall sections'],
		slab: ['floor', 'floors'],
		stair: ['staircase', 'staircases'],
		roof: ['roof', 'roofs'],
		floorDetail: ['floor pattern', 'floor patterns'],
		skirtingRun: ['skirting run', 'skirting runs'],
		barrier: ['fence', 'fences'],
		furniture: ['piece of furniture', 'pieces of furniture'],
		miniBuildInstance: ['placed object', 'placed objects'],
		miniBuildDefinition: ['design', 'designs'],
		musicTree: ['music tree', 'music trees'],
		musicPlant: ['music plant', 'music plants'],
		wallOpening: ['window or door', 'windows and doors'],
		pathOpening: ['window or door', 'windows and doors'],
		roofOpening: ['roof window', 'roof windows'],
		slabOpening: ['stairwell', 'stairwells'],
		wallBeam: ['beam', 'beams'],
		pathBeam: ['beam', 'beams']
	};

	/** "2 windows and doors Sam added", one line per person. */
	const lines = $derived.by(() => {
		const byPerson: Record<string, Record<string, number>> = {};
		for (const item of items) {
			const counts = (byPerson[item.byName] ??= {});
			counts[item.kind] = (counts[item.kind] ?? 0) + 1;
		}
		return Object.entries(byPerson).map(([name, counts]) => {
			const parts = Object.entries(counts).map(([kind, count]) => {
				const [one, many] = NOUNS[kind] ?? ['thing', 'things'];
				return count === 1 ? `a ${one}` : `${count} ${many}`;
			});
			return `${parts.join(', ')} ${name} added`;
		});
	});
</script>

<div data-ui-backdrop class="modal-backdrop" role="presentation">
	<div
		data-ui-surface="panel"
		class="modal"
		data-testid="confirm-remove-others"
		role="alertdialog"
		aria-labelledby="remove-others-title"
	>
		<h3 id="remove-others-title">Remove other people's work too?</h3>
		<p class="hint">This also removes:</p>
		<ul>
			{#each lines as line (line)}
				<li>{line}</li>
			{/each}
		</ul>
		<div class="buttons">
			<button type="button" data-testid="confirm-remove-cancel" onclick={onCancel}>
				Keep everything
			</button>
			<button type="button" class="danger" data-testid="confirm-remove-yes" onclick={onConfirm}>
				Remove anyway
			</button>
		</div>
	</div>
</div>

<style>
	.modal-backdrop {
		position: fixed;
		inset: 0;
		display: grid;
		place-items: center;
		background: rgba(4, 10, 8, 0.6);
		backdrop-filter: blur(3px);
		z-index: 45;
		font-family:
			system-ui,
			-apple-system,
			sans-serif;
		color: #eaf6ff;
	}

	.modal {
		width: min(26rem, 92vw);
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
		padding: 1.2rem;
		border-radius: 14px;
		background: rgba(14, 28, 22, 0.98);
		border: 1px solid rgba(234, 246, 255, 0.18);
		box-shadow: 0 16px 48px rgba(0, 0, 0, 0.6);
	}

	h3 {
		margin: 0;
		font-size: 1.05rem;
	}

	.hint {
		margin: 0;
		font-size: 0.82rem;
		opacity: 0.8;
	}

	ul {
		margin: 0;
		padding-left: 1.2rem;
		font-size: 0.86rem;
		line-height: 1.5;
	}

	.buttons {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
	}

	button {
		padding: 0.5rem 0.9rem;
		border-radius: 8px;
		border: 1px solid rgba(234, 246, 255, 0.25);
		background: rgba(10, 20, 15, 0.55);
		color: #eaf6ff;
		font-family: inherit;
		font-size: 0.85rem;
		font-weight: 600;
		cursor: pointer;
	}

	button.danger {
		background: rgba(214, 69, 65, 0.85);
		border-color: rgba(214, 69, 65, 0.95);
	}
</style>
