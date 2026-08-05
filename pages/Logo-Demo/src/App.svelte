<script lang="ts">
	import { fade } from 'svelte/transition'
	import type { Logo } from './lib/logos'
	import { fonts, googleFontsHref } from './lib/fonts'
	import { extractSvgColors, type SvgColorPair } from './lib/svgColors'
	import { loadOrderFromStorage, saveOrderToStorage } from './lib/logoOrder'
	import {
		filterSvgFiles,
		logosFromSvgFiles,
		revokeLogoUrls,
		selectionLooksLikeFolder,
	} from './lib/customLogos'
	import ReorderMenu from './lib/ReorderMenu.svelte'

	const SCALE_MIN = 0.5
	const SCALE_MAX = 2
	const SCALE_STEP = 0.05

	let orderedLogos = $state<Logo[]>(loadOrderFromStorage())
	let currentIndex = $state(0)
	let reorderOpen = $state(false)
	let companyName = $state('Sylenze')
	let selectedFont = $state(fonts[0].id)
	let swapped = $state(false)
	let logoScale = $state(1)
	let textScale = $state(1)
	let useSvgColors = $state(true)
	let svgColors = $state<SvgColorPair | null>(null)
	let usingCustomLogos = $state(false)
	let customStatus = $state('')
	let folderInput: HTMLInputElement | undefined = $state()
	let filesInput: HTMLInputElement | undefined = $state()

	type ScaleTarget = 'logo' | 'text'

	const currentLogo = $derived(orderedLogos[currentIndex] ?? orderedLogos[0])
	const fontFamily = $derived(
		fonts.find((f) => f.id === selectedFont)?.family ?? fonts[0].family,
	)
	const counterLabel = $derived(
		orderedLogos.length === 0 ? '0 / 0' : `${currentIndex + 1} / ${orderedLogos.length}`,
	)
	const logoScalePercent = $derived(`${Math.round(logoScale * 100)}%`)
	const textScalePercent = $derived(`${Math.round(textScale * 100)}%`)
	const blackNameColor = $derived(
		useSvgColors && svgColors ? svgColors.lightest : undefined,
	)
	const whiteNameColor = $derived(
		useSvgColors && svgColors ? svgColors.darkest : undefined,
	)

	$effect(() => {
		if (!useSvgColors) {
			svgColors = null
			return
		}

		const src = currentLogo?.src
		if (!src) {
			svgColors = null
			return
		}

		let cancelled = false

		extractSvgColors(src).then((colors) => {
			if (!cancelled) svgColors = colors
		})

		return () => {
			cancelled = true
		}
	})

	function applyOrder(next: Logo[]) {
		const currentId = currentLogo?.id
		const resolved =
			next.length > 0
				? next
				: usingCustomLogos
					? []
					: loadOrderFromStorage()
		orderedLogos = resolved
		// Blob URLs are session-only — never persist custom logo order.
		if (!usingCustomLogos) {
			saveOrderToStorage(resolved)
		}
		const idx = currentId ? resolved.findIndex((l) => l.id === currentId) : 0
		currentIndex = idx >= 0 ? idx : 0
	}

	function applyCustomLogos(files: FileList | null) {
		if (!files || files.length === 0) return

		const svgFiles = filterSvgFiles(files)
		if (svgFiles.length === 0) return

		revokeLogoUrls(orderedLogos)
		orderedLogos = logosFromSvgFiles(svgFiles)
		currentIndex = 0
		usingCustomLogos = true
		const n = svgFiles.length
		const countLabel = `${n} SVG${n === 1 ? '' : 's'}`
		customStatus = selectionLooksLikeFolder(svgFiles)
			? `Folder · ${countLabel}`
			: countLabel
	}

	function handleUpload(event: Event) {
		const target = event.currentTarget
		if (!(target instanceof HTMLInputElement)) return
		applyCustomLogos(target.files)
		target.value = ''
	}

	function resetDemos() {
		revokeLogoUrls(orderedLogos)
		orderedLogos = loadOrderFromStorage()
		currentIndex = 0
		usingCustomLogos = false
		customStatus = ''
	}

	function prev() {
		if (orderedLogos.length === 0) return
		currentIndex = (currentIndex - 1 + orderedLogos.length) % orderedLogos.length
	}

	function next() {
		if (orderedLogos.length === 0) return
		currentIndex = (currentIndex + 1) % orderedLogos.length
	}

	function toggleSwap() {
		swapped = !swapped
	}

	function clampScale(value: number) {
		const stepped = Math.round(value / SCALE_STEP) * SCALE_STEP
		return Math.min(SCALE_MAX, Math.max(SCALE_MIN, Math.round(stepped * 100) / 100))
	}

	function setScale(which: ScaleTarget, value: number) {
		const next = clampScale(value)
		if (which === 'logo') logoScale = next
		else textScale = next
	}

	function adjustScale(which: ScaleTarget, delta: number) {
		setScale(which, (which === 'logo' ? logoScale : textScale) + delta)
	}

	function onScaleInput(which: ScaleTarget, event: Event) {
		const target = event.currentTarget
		if (target instanceof HTMLInputElement) {
			setScale(which, Number(target.value))
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (reorderOpen) return

		const target = event.target
		if (
			target instanceof HTMLInputElement ||
			target instanceof HTMLTextAreaElement ||
			target instanceof HTMLSelectElement
		) {
			return
		}

		if (event.key === 'ArrowLeft') {
			event.preventDefault()
			prev()
		} else if (event.key === 'ArrowRight') {
			event.preventDefault()
			next()
		}
	}
</script>

<svelte:head>
	<link rel="stylesheet" href={googleFontsHref} />
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

<div class="app" style:--logo-scale={logoScale} style:--text-scale={textScale}>
	<div class="panels">
		{#if currentLogo}
			{#key currentLogo.id}
				<div class="panels-inner" class:swapped transition:fade={{ duration: 220 }}>
					<div class="panel panel-black">
						<div class="mark">
							<img
								class="logo"
								src={currentLogo.src}
								alt={currentLogo.label}
								height="140"
							/>
							{#if companyName.trim()}
								<span
									class="name"
									style:font-family={fontFamily}
									style:color={blackNameColor}
								>
									{companyName}
								</span>
							{/if}
						</div>
					</div>
					<div class="panel panel-white">
						<div class="mark">
							<img
								class="logo"
								src={currentLogo.src}
								alt={currentLogo.label}
								height="140"
							/>
							{#if companyName.trim()}
								<span
									class="name"
									style:font-family={fontFamily}
									style:color={whiteNameColor}
								>
									{companyName}
								</span>
							{/if}
						</div>
					</div>
				</div>
			{/key}
		{/if}
	</div>

	<footer class="bar">
		<div class="bar-group nav">
			<button type="button" class="btn" onclick={prev} aria-label="Previous logo">←</button>
			<button type="button" class="btn" onclick={next} aria-label="Next logo">→</button>
			<span class="counter">{counterLabel}</span>
			<button
				type="button"
				class="btn btn-swap"
				onclick={toggleSwap}
				aria-label="Swap backgrounds"
				aria-pressed={swapped}
				title="Swap backgrounds"
			>
				⇄
			</button>
			<button
				type="button"
				class="btn btn-text"
				onclick={() => (reorderOpen = true)}
				aria-haspopup="dialog"
				aria-expanded={reorderOpen}
			>
				Reorder
			</button>
			<button
				type="button"
				class="btn btn-text"
				onclick={() => folderInput?.click()}
				title="Upload a folder of SVG files"
			>
				Upload folder
			</button>
			<button
				type="button"
				class="btn btn-text"
				onclick={() => filesInput?.click()}
				title="Select SVG files"
			>
				Upload SVGs
			</button>
			{#if usingCustomLogos}
				<button type="button" class="btn btn-text" onclick={resetDemos}>
					Reset demos
				</button>
				<span class="custom-status" aria-live="polite">{customStatus}</span>
			{/if}
			<input
				bind:this={folderInput}
				class="file-input"
				type="file"
				multiple
				webkitdirectory
				onchange={handleUpload}
				aria-hidden="true"
				tabindex="-1"
			/>
			<input
				bind:this={filesInput}
				class="file-input"
				type="file"
				accept=".svg,image/svg+xml"
				multiple
				onchange={handleUpload}
				aria-hidden="true"
				tabindex="-1"
			/>
		</div>

		<div class="bar-group fields">
			<label class="field">
				<span class="field-label">Name</span>
				<input type="text" bind:value={companyName} placeholder="Company name" />
			</label>

			<label class="field">
				<span class="field-label">Font</span>
				<select bind:value={selectedFont} style:font-family={fontFamily}>
					{#each fonts as font (font.id)}
						<option value={font.id} style="font-family: {font.family}">{font.name}</option>
					{/each}
				</select>
			</label>

			<div class="field scale-field">
				<span class="field-label">Logo</span>
				<button
					type="button"
					class="btn"
					onclick={() => adjustScale('logo', -SCALE_STEP)}
					aria-label="Decrease logo scale"
				>
					−
				</button>
				<input
					class="scale-slider"
					type="range"
					min={SCALE_MIN}
					max={SCALE_MAX}
					step={SCALE_STEP}
					value={logoScale}
					oninput={(e) => onScaleInput('logo', e)}
					aria-label="Logo scale"
				/>
				<button
					type="button"
					class="btn"
					onclick={() => adjustScale('logo', SCALE_STEP)}
					aria-label="Increase logo scale"
				>
					+
				</button>
				<span class="scale-readout">{logoScalePercent}</span>
			</div>

			<div class="field scale-field">
				<span class="field-label">Text</span>
				<button
					type="button"
					class="btn"
					onclick={() => adjustScale('text', -SCALE_STEP)}
					aria-label="Decrease text scale"
				>
					−
				</button>
				<input
					class="scale-slider"
					type="range"
					min={SCALE_MIN}
					max={SCALE_MAX}
					step={SCALE_STEP}
					value={textScale}
					oninput={(e) => onScaleInput('text', e)}
					aria-label="Text scale"
				/>
				<button
					type="button"
					class="btn"
					onclick={() => adjustScale('text', SCALE_STEP)}
					aria-label="Increase text scale"
				>
					+
				</button>
				<span class="scale-readout">{textScalePercent}</span>
			</div>

			<label
				class="field toggle-field"
				title="Use darkest SVG color on white, lightest on black"
			>
				<input type="checkbox" bind:checked={useSvgColors} />
				<span class="field-label">SVG colors</span>
			</label>
		</div>

		<p class="hint">← → to switch logos</p>
	</footer>

	<ReorderMenu bind:open={reorderOpen} logos={orderedLogos} onapply={applyOrder} />
</div>

<style>
	.app {
		--bar-h: auto;
		--logo-scale: 1;
		--text-scale: 1;
		display: flex;
		flex-direction: column;
		height: 100%;
		width: 100%;
		background: #111;
		color: #e8e8e8;
	}

	.panels {
		flex: 1;
		min-height: 0;
		position: relative;
		overflow: hidden;
	}

	.panels-inner {
		position: absolute;
		inset: 0;
		display: flex;
		width: 100%;
		height: 100%;
	}

	.panels-inner.swapped {
		flex-direction: row-reverse;
	}

	.panel {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1.5rem;
		min-width: 0;
	}

	.panel-black {
		background: #000;
		color: #fff;
	}

	.panel-white {
		background: #fff;
		color: #000;
	}

	.mark {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 1.25rem;
		max-width: 100%;
	}

	.logo {
		height: calc(140px * var(--logo-scale));
		width: auto;
		max-width: min(calc(220px * var(--logo-scale)), 40vw);
		object-fit: contain;
		flex-shrink: 0;
	}

	.name {
		font-size: calc(3rem * var(--text-scale));
		font-weight: 500;
		letter-spacing: -0.03em;
		line-height: 1.1;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: min(calc(420px * var(--text-scale)), 45vw);
	}

	.bar {
		min-height: 80px;
		flex-shrink: 0;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.85rem 1.25rem;
		padding: 0.65rem 1.25rem;
		background: #1a1a1a;
		border-top: 1px solid #2a2a2a;
		font-size: 0.875rem;
	}

	.bar-group {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.fields {
		flex: 1;
		min-width: 0;
		flex-wrap: wrap;
		gap: 0.75rem 1rem;
	}

	.field {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-width: 0;
	}

	.field-label {
		color: #888;
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		flex-shrink: 0;
	}

	.scale-field {
		gap: 0.35rem;
	}

	.scale-slider {
		width: 6.5rem;
		accent-color: #888;
		cursor: pointer;
		padding: 0;
		border: none;
		background: transparent;
		height: 1.25rem;
	}

	.scale-readout {
		color: #aaa;
		font-variant-numeric: tabular-nums;
		font-size: 0.75rem;
		min-width: 2.75rem;
	}

	.toggle-field {
		cursor: pointer;
		user-select: none;
		gap: 0.4rem;
	}

	.toggle-field input {
		width: auto;
		accent-color: #888;
		cursor: pointer;
	}

	input,
	select {
		appearance: none;
		background: #111;
		color: #eee;
		border: 1px solid #333;
		border-radius: 6px;
		padding: 0.45rem 0.7rem;
		font-size: 0.875rem;
		font-family: inherit;
		min-width: 0;
		outline: none;
	}

	input:not([type='checkbox']):not([type='range']):not([type='file']) {
		width: 10rem;
	}

	select {
		width: 12rem;
		cursor: pointer;
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='%23888' d='M1 1l5 5 5-5'/%3E%3C/svg%3E");
		background-repeat: no-repeat;
		background-position: right 0.65rem center;
		padding-right: 1.75rem;
	}

	input:focus,
	select:focus {
		border-color: #666;
	}

	.btn {
		appearance: none;
		background: #2a2a2a;
		color: #eee;
		border: 1px solid #3a3a3a;
		border-radius: 6px;
		width: 2.25rem;
		height: 2.25rem;
		font-size: 1rem;
		line-height: 1;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		transition: background 0.15s ease, border-color 0.15s ease;
	}

	.btn:hover {
		background: #333;
		border-color: #555;
	}

	.btn:active {
		background: #222;
	}

	.btn-swap[aria-pressed='true'] {
		background: #3a3a3a;
		border-color: #666;
	}

	.btn-text {
		width: auto;
		padding: 0 0.75rem;
		font-size: 0.8125rem;
	}

	.counter {
		margin-left: 0.35rem;
		color: #aaa;
		font-variant-numeric: tabular-nums;
		min-width: 3.5rem;
	}

	.custom-status {
		color: #888;
		font-size: 0.75rem;
		white-space: nowrap;
	}

	.file-input {
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

	.hint {
		margin: 0;
		color: #666;
		font-size: 0.75rem;
		white-space: nowrap;
		flex-shrink: 0;
	}

	@media (max-width: 720px) {
		.panels-inner {
			flex-direction: column;
		}

		.panels-inner.swapped {
			flex-direction: column-reverse;
		}

		.bar {
			padding: 0.75rem 1rem;
			gap: 0.75rem;
		}

		.nav {
			flex-wrap: wrap;
		}

		.fields {
			flex: 1 1 100%;
			order: 3;
		}

		.hint {
			margin-left: auto;
		}

		input:not([type='checkbox']):not([type='range']):not([type='file']),
		select {
			flex: 1;
			width: auto;
		}

		.scale-slider {
			flex: 1;
			width: auto;
			min-width: 5rem;
		}

		.name {
			font-size: calc(2rem * var(--text-scale));
			max-width: 50vw;
		}
	}
</style>
