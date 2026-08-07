<script lang="ts">
	import { fade, fly } from 'svelte/transition'
	import type { Logo } from './logos'

	let {
		open = $bindable(false),
		logos,
		currentId,
		onselect,
		onclose,
	}: {
		open: boolean
		logos: Logo[]
		currentId?: string
		onselect: (logoId: string) => void
		onclose?: () => void
	} = $props()

	let closeBtn: HTMLButtonElement | undefined = $state()
	let previousFocus: HTMLElement | null = null

	const countLabel = $derived(
		logos.length === 1 ? '1 logo' : `${logos.length} logos`,
	)

	// Focus Close on open; remember prior focus for restore on close.
	$effect(() => {
		if (!open) return
		previousFocus =
			document.activeElement instanceof HTMLElement ? document.activeElement : null
		queueMicrotask(() => closeBtn?.focus())
	})

	function closePanel() {
		open = false
		onclose?.()
		const restore = previousFocus
		previousFocus = null
		queueMicrotask(() => restore?.focus())
	}

	function selectLogo(logoId: string) {
		onselect(logoId)
		closePanel()
	}

	function onKeydown(event: KeyboardEvent) {
		if (!open) return
		if (event.key === 'Escape') {
			event.preventDefault()
			event.stopPropagation()
			closePanel()
		}
	}

	function onBackdropClick(event: MouseEvent) {
		if (event.target === event.currentTarget) {
			closePanel()
		}
	}

	function refId(index: number) {
		return String(index + 1).padStart(2, '0')
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
			id="catalog-panel"
			class="sheet"
			role="dialog"
			aria-modal="true"
			aria-labelledby="catalog-title"
			tabindex="-1"
			transition:fly={{ y: 24, duration: 200 }}
			onpointerdown={(e) => e.stopPropagation()}
		>
			<header class="sheet-header">
				<div class="sheet-heading">
					<h2 id="catalog-title" class="sheet-title">Catalog</h2>
					<p class="sheet-subtitle">{countLabel}</p>
				</div>
				<button
					type="button"
					class="btn btn-text"
					bind:this={closeBtn}
					onclick={closePanel}
				>
					Close
				</button>
			</header>

			<div class="body">
				{#if logos.length === 0}
					<p class="empty">No logos loaded.</p>
				{:else}
					<ul class="grid">
						{#each logos as logo, index (logo.id)}
							<li>
								<button
									type="button"
									class="tile"
									class:selected={currentId === logo.id}
									onclick={() => selectLogo(logo.id)}
									aria-current={currentId === logo.id ? 'true' : undefined}
									aria-label="Select {logo.label}, reference {refId(index)}"
								>
									<span class="ref" aria-hidden="true">{refId(index)}</span>
									<img
										class="thumb"
										src={logo.src}
										alt={logo.label}
										draggable="false"
									/>
									<span class="label">{logo.label}</span>
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.overlay {
		position: fixed;
		inset: 0;
		z-index: 40;
		display: flex;
		align-items: stretch;
		justify-content: stretch;
		background: #111;
		padding: 0;
	}

	.sheet {
		width: 100%;
		height: 100%;
		max-height: none;
		display: flex;
		flex-direction: column;
		background: #1a1a1a;
		border: none;
		border-radius: 0;
		box-shadow: none;
		outline: none;
		margin: 0;
		z-index: 41;
	}

	.sheet-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 1rem 1.5rem;
		border-bottom: 1px solid #2a2a2a;
		flex-shrink: 0;
	}

	.sheet-heading {
		min-width: 0;
	}

	.sheet-title {
		margin: 0;
		font-size: 1.15rem;
		font-weight: 600;
		letter-spacing: 0.01em;
		color: #eee;
	}

	.sheet-subtitle {
		margin: 0.25rem 0 0;
		font-size: 0.8rem;
		color: #888;
		font-variant-numeric: tabular-nums;
	}

	.body {
		overflow-y: auto;
		overscroll-behavior: contain;
		flex: 1;
		min-height: 0;
		padding: 1.5rem;
	}

	.empty {
		margin: 3rem 0;
		text-align: center;
		color: #888;
		font-size: 0.95rem;
	}

	.grid {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
		gap: 1.25rem;
	}

	.tile {
		appearance: none;
		width: 100%;
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: 0.75rem;
		padding: 1rem;
		background: #141414;
		border: 1px solid #2a2a2a;
		border-radius: 12px;
		cursor: pointer;
		text-align: left;
		color: inherit;
		transition:
			background 0.12s ease,
			border-color 0.12s ease,
			box-shadow 0.12s ease;
	}

	.tile:hover {
		background: #1c1c1c;
		border-color: #444;
	}

	.tile:focus-visible {
		outline: 2px solid #888;
		outline-offset: 2px;
	}

	.tile.selected {
		border-color: #888;
		border-width: 2px;
		padding: calc(1rem - 1px);
		background: #1c1c1c;
		box-shadow: 0 0 0 1px rgba(136, 136, 136, 0.25);
	}

	.ref {
		font-size: 1.5rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		letter-spacing: 0.02em;
		color: #ccc;
		line-height: 1;
	}

	.thumb {
		width: 100%;
		aspect-ratio: 1;
		object-fit: contain;
		object-position: center;
		box-sizing: border-box;
		padding: 1.75rem;
		background: #0d0d0d;
		border-radius: 10px;
		border: 1px solid #2a2a2a;
		pointer-events: none;
		user-select: none;
		-webkit-user-drag: none;
	}

	.label {
		color: #ddd;
		font-size: 0.875rem;
		line-height: 1.3;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
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

	.btn-text {
		height: 2.1rem;
		padding: 0 0.75rem;
		width: auto;
		flex-shrink: 0;
	}

	@media (max-width: 720px) {
		.sheet-header {
			padding: 0.9rem 1rem;
		}

		.body {
			padding: 1rem;
		}

		.grid {
			grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
			gap: 0.85rem;
		}

		.tile {
			padding: 0.85rem;
			gap: 0.65rem;
		}

		.tile.selected {
			padding: calc(0.85rem - 1px);
		}

		.thumb {
			padding: 1.25rem;
		}

		.ref {
			font-size: 1.25rem;
		}

		.label {
			font-size: 0.8rem;
		}
	}

	@media (min-width: 1100px) {
		.grid {
			grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
			gap: 1.5rem;
		}

		.thumb {
			padding: 2.25rem;
		}
	}
</style>
