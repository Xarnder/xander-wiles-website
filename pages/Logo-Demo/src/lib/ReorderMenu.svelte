<script lang="ts">
	import { flip } from 'svelte/animate'
	import { fly, fade } from 'svelte/transition'
	import type { Logo } from './logos'
	import { moveItem } from './logoOrder'

	let {
		open = $bindable(false),
		logos,
		onapply,
		onclose,
	}: {
		open: boolean
		logos: Logo[]
		onapply: (ordered: Logo[]) => void
		onclose?: () => void
	} = $props()

	let draft = $state.raw<Logo[]>([])
	let draggingId = $state<string | null>(null)
	let dropTargetId = $state<string | null>(null)
	let applyBtn: HTMLButtonElement | undefined = $state()
	let listEl: HTMLElement | undefined = $state()

	// Copy applied order into a local draft whenever the sheet opens.
	$effect(() => {
		if (open) {
			draft = [...logos]
			queueMicrotask(() => applyBtn?.focus())
		}
	})

	function discardAndClose() {
		draggingId = null
		dropTargetId = null
		open = false
		onclose?.()
	}

	function applyAndClose() {
		onapply([...draft])
		draggingId = null
		dropTargetId = null
		open = false
		onclose?.()
	}

	function moveBy(index: number, delta: number) {
		const to = index + delta
		if (to < 0 || to >= draft.length) return
		draft = moveItem(draft, index, to)
	}

	function indexOfId(id: string) {
		return draft.findIndex((logo) => logo.id === id)
	}

	/**
	 * Resolve drop index using row midpoints, ignoring the dragged row.
	 * Only crosses a neighbor when the pointer passes its midpoint — avoids
	 * flip/reorder oscillation under the cursor.
	 */
	function targetIndexFromPoint(clientY: number): number | null {
		if (!draggingId || !listEl) return null

		const from = indexOfId(draggingId)
		if (from < 0) return null

		const rows = listEl.querySelectorAll<HTMLElement>('[data-logo-id]')
		if (rows.length === 0) return null

		let to = from

		for (let i = 0; i < rows.length; i++) {
			const id = rows[i].getAttribute('data-logo-id')
			if (!id || id === draggingId) continue

			const other = indexOfId(id)
			if (other < 0) continue

			const rect = rows[i].getBoundingClientRect()
			const mid = rect.top + rect.height / 2

			// Dragging down: claim this slot only after passing its midpoint
			if (from < other && clientY > mid) to = other
			// Dragging up: claim this slot only after passing its midpoint
			if (from > other && clientY < mid) to = other
		}

		return to
	}

	/** Keep the dragged row visible while near list edges. */
	function autoScrollList(clientY: number) {
		if (!listEl) return
		const rect = listEl.getBoundingClientRect()
		const edge = 40
		const maxStep = 18

		if (clientY < rect.top + edge) {
			const intensity = (rect.top + edge - clientY) / edge
			listEl.scrollTop -= Math.ceil(maxStep * Math.min(1, intensity))
		} else if (clientY > rect.bottom - edge) {
			const intensity = (clientY - (rect.bottom - edge)) / edge
			listEl.scrollTop += Math.ceil(maxStep * Math.min(1, intensity))
		}
	}

	function onHandlePointerDown(event: PointerEvent, logoId: string) {
		if (!open || event.button !== 0) return

		event.preventDefault()
		event.stopPropagation()
		draggingId = logoId
		dropTargetId = null

		const handle = event.currentTarget
		if (handle instanceof HTMLElement) {
			handle.setPointerCapture(event.pointerId)
		}
	}

	function onHandlePointerMove(event: PointerEvent) {
		if (!draggingId || !open) return

		autoScrollList(event.clientY)

		const from = indexOfId(draggingId)
		const to = targetIndexFromPoint(event.clientY)
		if (from < 0 || to == null) {
			dropTargetId = null
			return
		}

		if (from === to) {
			dropTargetId = null
			return
		}

		dropTargetId = draft[to]?.id ?? null
		draft = moveItem(draft, from, to)
	}

	function endDrag(event: PointerEvent) {
		if (!draggingId) return

		const handle = event.currentTarget
		if (handle instanceof HTMLElement && handle.hasPointerCapture(event.pointerId)) {
			handle.releasePointerCapture(event.pointerId)
		}

		draggingId = null
		dropTargetId = null
	}

	function onKeydown(event: KeyboardEvent) {
		if (!open) return
		if (event.key === 'Escape') {
			event.preventDefault()
			event.stopPropagation()
			discardAndClose()
		}
	}

	function onBackdropClick(event: MouseEvent) {
		if (event.target === event.currentTarget) {
			discardAndClose()
		}
	}
</script>

<svelte:window onkeydown={onKeydown} />

{#if open}
	<div
		class="overlay"
		role="presentation"
		onclick={onBackdropClick}
		transition:fade={{ duration: 160 }}
	>
		<div
			class="sheet"
			role="dialog"
			aria-modal="true"
			aria-labelledby="reorder-title"
			tabindex="-1"
			transition:fly={{ y: 48, duration: 220 }}
			onpointerdown={(e) => e.stopPropagation()}
		>
			<header class="sheet-header">
				<h2 id="reorder-title" class="sheet-title">Reorder logos</h2>
				<div class="sheet-actions">
					<button type="button" class="btn btn-text" onclick={discardAndClose}>
						Cancel
					</button>
					<button
						type="button"
						class="btn btn-primary"
						bind:this={applyBtn}
						onclick={applyAndClose}
					>
						Apply
					</button>
				</div>
			</header>

			<ul class="list" bind:this={listEl} class:dragging={draggingId !== null}>
				{#each draft as logo, index (logo.id)}
					<li
						class="row"
						class:dragging={draggingId === logo.id}
						class:drop-target={dropTargetId === logo.id && draggingId !== logo.id}
						data-logo-id={logo.id}
						animate:flip={{ duration: 180 }}
					>
						<span class="pos" aria-hidden="true">{index + 1}</span>

						<img
							class="thumb"
							src={logo.src}
							alt=""
							width="44"
							height="44"
							draggable="false"
						/>

						<span class="label">{logo.label}</span>

						<div class="row-actions">
							<button
								type="button"
								class="btn btn-icon"
								onclick={() => moveBy(index, -1)}
								disabled={index === 0}
								aria-label="Move {logo.label} up"
							>
								↑
							</button>
							<button
								type="button"
								class="btn btn-icon"
								onclick={() => moveBy(index, 1)}
								disabled={index === draft.length - 1}
								aria-label="Move {logo.label} down"
							>
								↓
							</button>
							<button
								type="button"
								class="btn btn-icon handle"
								aria-label="Drag to reorder {logo.label}"
								onpointerdown={(e) => onHandlePointerDown(e, logo.id)}
								onpointermove={onHandlePointerMove}
								onpointerup={endDrag}
								onpointercancel={endDrag}
							>
								⠿
							</button>
						</div>
					</li>
				{/each}
			</ul>
		</div>
	</div>
{/if}

<style>
	.overlay {
		position: fixed;
		inset: 0;
		z-index: 40;
		display: flex;
		align-items: flex-end;
		justify-content: center;
		background: rgba(0, 0, 0, 0.55);
		padding: 0;
	}

	.sheet {
		width: min(560px, 100%);
		max-height: 70vh;
		display: flex;
		flex-direction: column;
		background: #1a1a1a;
		border: 1px solid #2a2a2a;
		border-bottom: none;
		border-radius: 12px 12px 0 0;
		box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.45);
		outline: none;
		margin-bottom: 0;
		/* Sit above the edit bar visually; bar stays usable behind if needed */
		z-index: 41;
	}

	.sheet-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.85rem 1rem;
		border-bottom: 1px solid #2a2a2a;
		flex-shrink: 0;
	}

	.sheet-title {
		margin: 0;
		font-size: 0.95rem;
		font-weight: 600;
		letter-spacing: 0.01em;
		color: #eee;
	}

	.sheet-actions {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}

	.list {
		list-style: none;
		margin: 0;
		padding: 0.5rem;
		overflow-y: auto;
		overscroll-behavior: contain;
		flex: 1;
		min-height: 0;
	}

	.list.dragging {
		user-select: none;
		cursor: grabbing;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 0.65rem;
		padding: 0.45rem 0.55rem;
		margin-bottom: 0.35rem;
		background: #141414;
		border: 1px solid #2a2a2a;
		border-radius: 8px;
		transition:
			background 0.12s ease,
			border-color 0.12s ease,
			opacity 0.12s ease,
			box-shadow 0.12s ease;
	}

	.row:last-child {
		margin-bottom: 0;
	}

	.row.dragging {
		opacity: 0.92;
		background: #222;
		border-color: #555;
		box-shadow: 0 6px 18px rgba(0, 0, 0, 0.4);
		z-index: 1;
		position: relative;
	}

	.row.drop-target {
		border-color: #666;
		background: #1c1c1c;
	}

	.pos {
		width: 1.5rem;
		text-align: center;
		color: #777;
		font-variant-numeric: tabular-nums;
		font-size: 0.75rem;
		flex-shrink: 0;
	}

	.thumb {
		width: 44px;
		height: 44px;
		object-fit: contain;
		flex-shrink: 0;
		background: #0d0d0d;
		border-radius: 6px;
		border: 1px solid #2a2a2a;
		pointer-events: none;
		user-select: none;
		-webkit-user-drag: none;
	}

	.label {
		flex: 1;
		min-width: 0;
		color: #ddd;
		font-size: 0.875rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.row-actions {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		flex-shrink: 0;
	}

	.btn {
		appearance: none;
		background: #2a2a2a;
		color: #eee;
		border: 1px solid #3a3a3a;
		border-radius: 6px;
		font-size: 0.8125rem;
		line-height: 1;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		transition:
			background 0.15s ease,
			border-color 0.15s ease;
	}

	.btn:hover:not(:disabled) {
		background: #333;
		border-color: #555;
	}

	.btn:active:not(:disabled) {
		background: #222;
	}

	.btn:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}

	.btn-text {
		height: 2.1rem;
		padding: 0 0.75rem;
		width: auto;
	}

	.btn-primary {
		height: 2.1rem;
		padding: 0 0.9rem;
		width: auto;
		background: #3a3a3a;
		border-color: #5a5a5a;
		font-weight: 600;
	}

	.btn-primary:hover:not(:disabled) {
		background: #454545;
		border-color: #6a6a6a;
	}

	.btn-icon {
		width: 2rem;
		height: 2rem;
		font-size: 0.9rem;
	}

	.handle {
		cursor: grab;
		touch-action: none;
		user-select: none;
		font-size: 1rem;
		letter-spacing: -0.05em;
		color: #aaa;
	}

	.handle:active {
		cursor: grabbing;
	}

	@media (max-width: 720px) {
		.sheet {
			width: 100%;
			max-height: 75vh;
			border-radius: 14px 14px 0 0;
		}

		.thumb {
			width: 40px;
			height: 40px;
		}

		.label {
			font-size: 0.8125rem;
		}
	}
</style>
