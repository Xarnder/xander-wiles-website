<script lang="ts">
	import { fade, fly } from 'svelte/transition'
	import { formatRgbCss, formatHslCss, formatOklchCss, copyText } from './colourFormat'
	import {
		extractPalette,
		buildFlatPalette,
		FALLBACK_VIEWBOX,
		type PaletteColour,
		type SvgViewBox,
	} from './svgPalette'
	import { isEyeDropperSupported, pickColourWithEyeDropper } from './colourPick'
	import { exportPalettePdf } from './exportPalettePdf'
	import type { Logo } from './logos'

	let {
		open = $bindable(false),
		logo,
		companyName,
		fontName = '',
		fontFamily = '',
		logoScale = 1,
		textScale = 1,
		textColorOnLight = '#121212',
		textColorOnDark = '#ffffff',
		onclose,
	}: {
		open: boolean
		logo: Logo | null | undefined
		companyName: string
		fontName?: string
		fontFamily?: string
		logoScale?: number
		textScale?: number
		textColorOnLight?: string
		textColorOnDark?: string
		onclose?: () => void
	} = $props()

	type Status = 'idle' | 'loading' | 'ready' | 'error'

	let status = $state<Status>('idle')
	let errorMessage = $state('')
	let autoColours = $state.raw<PaletteColour[]>([])
	let customs = $state.raw<PaletteColour[]>([])
	let paletteViewBox = $state.raw<SvgViewBox>({ ...FALLBACK_VIEWBOX })
	let copyLive = $state('')
	let refreshToken = $state(0)
	let closeBtn: HTMLButtonElement | undefined = $state()
	let previousFocus: HTMLElement | null = null

	const eyeDropperSupported = isEyeDropperSupported()
	const flatColours = $derived(buildFlatPalette(autoColours, customs))

	let trackedLogoId: string | null | undefined = undefined

	// Clear customs only when logo identity changes (not on refresh / re-open).
	$effect(() => {
		const id = logo?.id ?? null
		if (trackedLogoId === undefined) {
			trackedLogoId = id
			return
		}
		if (id !== trackedLogoId) {
			trackedLogoId = id
			customs = []
		}
	})

	// Focus close on open; remember prior focus for restore on close.
	$effect(() => {
		if (!open) return
		previousFocus =
			document.activeElement instanceof HTMLElement ? document.activeElement : null
		queueMicrotask(() => closeBtn?.focus())
	})

	// Lazy extract while open; cancel in-flight work on close / logo change / refresh.
	$effect(() => {
		if (!open) return

		void logo?.id
		void refreshToken

		const src = logo?.src
		let cancelled = false

		if (!src) {
			status = 'ready'
			autoColours = []
			paletteViewBox = { ...FALLBACK_VIEWBOX }
			errorMessage = ''
			return () => {
				cancelled = true
			}
		}

		status = 'loading'
		errorMessage = ''

		extractPalette(src)
			.then((result) => {
				if (cancelled) return
				autoColours = result.auto
				paletteViewBox = result.viewBox
				status = 'ready'
			})
			.catch((err: unknown) => {
				if (cancelled) return
				autoColours = []
				paletteViewBox = { ...FALLBACK_VIEWBOX }
				status = 'error'
				errorMessage = err instanceof Error ? err.message : 'Failed to extract colours'
			})

		return () => {
			cancelled = true
		}
	})

	function closePanel() {
		open = false
		onclose?.()
		const restore = previousFocus
		previousFocus = null
		queueMicrotask(() => restore?.focus())
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

	function refresh() {
		refreshToken += 1
	}

	async function pickColour() {
		if (!eyeDropperSupported) return
		const colour = await pickColourWithEyeDropper()
		if (!colour) return
		if (flatColours.some((c) => c.hex === colour.hex)) return
		customs = [...customs, colour]
	}

	function removeCustom(id: string) {
		customs = customs.filter((c) => c.id !== id)
	}

	async function copyHex(hex: string) {
		const ok = await copyText(hex)
		copyLive = ok ? `Copied ${hex}` : 'Copy failed'
	}

	export async function exportBrandPdf(): Promise<void> {
		if (!logo?.src) throw new Error('No logo selected')

		let colours = flatColours
		let viewBox = paletteViewBox

		// Use a ready palette when available; otherwise extract on demand (keep customs).
		if (status !== 'ready' || colours.length === 0) {
			const result = await extractPalette(logo.src)
			colours = buildFlatPalette(result.auto, customs)
			viewBox = result.viewBox
			autoColours = result.auto
			paletteViewBox = result.viewBox
			status = 'ready'
		}

		if (colours.length === 0) throw new Error('No colours found for this logo')

		await exportPalettePdf({
			colours,
			logoLabel: logo.label,
			companyName,
			logoSrc: logo.src,
			viewBox,
			fontName,
			fontFamily,
			logoScale,
			textScale,
			textColorOnLight,
			textColorOnDark,
		})
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
			id="colour-panel"
			class="sheet"
			role="dialog"
			aria-modal="true"
			aria-labelledby="colours-title"
			tabindex="-1"
			transition:fly={{ x: 40, duration: 220 }}
			onpointerdown={(e) => e.stopPropagation()}
		>
			<header class="sheet-header">
				<h2 id="colours-title" class="sheet-title">Colours</h2>
				<button
					type="button"
					class="btn btn-text"
					bind:this={closeBtn}
					onclick={closePanel}
				>
					Close
				</button>
			</header>

			<div class="toolbar">
				<button
					type="button"
					class="btn btn-text"
					onclick={refresh}
					disabled={status === 'loading' || !logo?.src}
				>
					Refresh
				</button>
				<button
					type="button"
					class="btn btn-text"
					onclick={pickColour}
					disabled={!eyeDropperSupported}
					title="Sample a colour with the system eyedropper (may sample outside the page)"
				>
					Pick colour
				</button>
			</div>

			{#if !eyeDropperSupported}
				<p class="hint">EyeDropper is not supported in this browser.</p>
			{/if}

			<div class="body">
				{#if status === 'loading'}
					<p class="status">Loading colours…</p>
				{:else if status === 'error'}
					<p class="error" role="alert">{errorMessage || 'Failed to extract colours'}</p>
				{:else if flatColours.length === 0}
					<p class="status">No colours found for this logo.</p>
				{:else}
					<ul class="list">
						{#each flatColours as colour (colour.id)}
							<li class="row">
								<span
									class="swatch"
									style:background={colour.hex}
									aria-hidden="true"
								></span>
								<div class="meta">
									<span class="label">{colour.label}</span>
									<span class="hex">{colour.hex}</span>
									<span class="space">{formatRgbCss(colour.rgb)}</span>
									<span class="space">{formatHslCss(colour.rgb)}</span>
									<span class="space">{formatOklchCss(colour.rgb)}</span>
								</div>
								<div class="row-actions">
									<button
										type="button"
										class="btn btn-text"
										onclick={() => copyHex(colour.hex)}
										aria-label="Copy {colour.hex}"
									>
										Copy HEX
									</button>
									{#if colour.removable}
										<button
											type="button"
											class="btn btn-text"
											onclick={() => removeCustom(colour.id)}
											aria-label="Remove {colour.hex}"
										>
											Remove
										</button>
									{/if}
								</div>
							</li>
						{/each}
					</ul>
				{/if}
			</div>

			<div class="live" aria-live="polite">{copyLive}</div>
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
		justify-content: flex-end;
		background: rgba(0, 0, 0, 0.55);
		padding: 0;
	}

	.sheet {
		position: relative;
		width: min(380px, 100%);
		height: 100%;
		max-height: 100%;
		display: flex;
		flex-direction: column;
		background: #1a1a1a;
		border: 1px solid #2a2a2a;
		border-right: none;
		border-radius: 12px 0 0 12px;
		box-shadow: -8px 0 32px rgba(0, 0, 0, 0.45);
		outline: none;
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

	.toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem;
		padding: 0.65rem 1rem;
		border-bottom: 1px solid #2a2a2a;
		flex-shrink: 0;
	}

	.hint,
	.status,
	.error {
		margin: 0;
		padding: 0.65rem 1rem 0;
		font-size: 0.8125rem;
		line-height: 1.4;
	}

	.hint,
	.status {
		color: #999;
	}

	.error {
		color: #e88;
	}

	.body {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: 0.5rem;
	}

	.list {
		list-style: none;
		margin: 0;
		padding: 0;
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
	}

	.row:last-child {
		margin-bottom: 0;
	}

	.swatch {
		width: 2rem;
		height: 2rem;
		border-radius: 6px;
		border: 1px solid #3a3a3a;
		flex-shrink: 0;
	}

	.meta {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}

	.label {
		color: #ddd;
		font-size: 0.8125rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.hex,
	.space {
		color: #999;
		font-size: 0.75rem;
		font-variant-numeric: tabular-nums;
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.hex {
		color: #ccc;
	}

	.row-actions {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: 0.25rem;
		flex-shrink: 0;
	}

	.live {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
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
		white-space: nowrap;
	}

	@media (max-width: 720px) {
		.sheet {
			width: min(100%, 100vw);
			border-radius: 0;
		}

		.row {
			flex-wrap: wrap;
		}

		.row-actions {
			flex-direction: row;
			width: 100%;
			justify-content: flex-end;
		}
	}
</style>
