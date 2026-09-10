<script lang="ts">
	import { phases, signedDistance, wrap } from '$lib/breathing';
	import { lineHeight, lineProgress, LineProgressTracker } from '$lib/line';
	import DragHint from './DragHint.svelte';
	import GuideHint from './GuideHint.svelte';
	let { user, guide, running, calibrated, cycles, atTarget = false, onmove, onbegin, onend } =
		$props<{
			user: number;
			guide: number;
			running: boolean;
			calibrated: boolean;
			cycles: number;
			atTarget?: boolean;
			onmove: (p: number) => void;
			onbegin: () => void;
			onend: () => void;
		}>();
	let svg: SVGSVGElement;
	let pointer: number | null = null;
	let inverse: DOMMatrix | null = null;
	let dragging = $state(false);
	let hasDraggedUp = $state(false);
	let hasReachedHalfway = $state(false);
	let guideCycles = $state(0);
	let prevGuide = 0;
	let userCycles = $state(0);
	let prevUser = 0;
	let strokeCycles = $state(0);
	let lastTrackerPhase: 'inhale' | 'exhale' = 'inhale';

	let tracker = new LineProgressTracker();
	const y = (p: number) => 390 - lineHeight(p) * 300;
	let uy = $derived(y(user)),
		gy = $derived(y(guide));
	let phase = $derived(Math.floor(guide * 4));
	let sync = $derived(Math.abs(signedDistance(user, guide)) < 0.055);

	const effectiveCycles = $derived(
		Math.max(cycles, guideCycles, userCycles, strokeCycles)
	);

	$effect(() => {
		if (!running && cycles === 0 && user === 0 && !dragging) {
			hasDraggedUp = false;
			hasReachedHalfway = false;
			guideCycles = 0;
			prevGuide = 0;
			userCycles = 0;
			prevUser = 0;
			strokeCycles = 0;
			lastTrackerPhase = 'inhale';
		}
	});

	$effect(() => {
		if (running) {
			if (prevGuide > 0.75 && guide < 0.25) {
				guideCycles++;
			}
			prevGuide = guide;
		}
	});

	$effect(() => {
		if (running) {
			if (prevUser > 0.75 && user < 0.25) {
				userCycles++;
			}
			prevUser = user;
		}
	});

	$effect(() => {
		if (effectiveCycles > 0 || lineHeight(user) >= 0.5 || (user >= 0.125 && user <= 0.875)) {
			hasReachedHalfway = true;
		}
	});

	function report(height: number) {
		const next = tracker.update(user, height);
		if (lineHeight(next) >= 0.05 || next >= 0.02) {
			hasDraggedUp = true;
		}
		if (height >= 0.5 || lineHeight(next) >= 0.5 || next >= 0.125) {
			hasReachedHalfway = true;
		}
		if (lastTrackerPhase === 'exhale' && tracker.phase === 'inhale') {
			strokeCycles++;
		}
		lastTrackerPhase = tracker.phase;
		// Holds have zero physical length. Advance their logical phase in small
		// steps, preserving the engine's shortcut protection for ordinary dragging.
		const delta = signedDistance(next, user),
			start = user;
		const steps = Math.max(1, Math.ceil(Math.abs(delta) / 0.06));
		for (let i = 1; i <= steps; i++) onmove(wrap(start + (delta * i) / steps));
	}
	function start(e: PointerEvent) {
		if (pointer !== null || (e.pointerType === 'mouse' && e.button !== 0))
			return;
		pointer = e.pointerId;
		dragging = true;
		inverse = svg.getScreenCTM()?.inverse() ?? null;
		if (e.currentTarget instanceof HTMLElement)
			e.currentTarget.setPointerCapture(pointer);
		onbegin();
		if (inverse) {
			const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(inverse);
			const h = (390 - p.y) / 300;
			tracker.reset(user, h);
			report(h);
		} else {
			tracker.reset(user, lineHeight(user));
		}
		e.preventDefault();
	}
	function move(e: PointerEvent) {
		if (!running || pointer !== e.pointerId || !inverse) return;
		const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(inverse);
		report((390 - p.y) / 300);
	}
	function end(e: PointerEvent) {
		if (pointer !== e.pointerId) return;
		pointer = null;
		dragging = false;
		onend();
	}
	function keyboard(e: KeyboardEvent) {
		if (!['ArrowUp', 'ArrowDown'].includes(e.key)) return;
		e.preventDefault();
		if (!running) onbegin();
		if (e.key === 'ArrowUp') hasDraggedUp = true;
		const nextHeight = lineHeight(user) + (e.key === 'ArrowUp' ? 0.04 : -0.04);
		if (nextHeight >= 0.5) hasReachedHalfway = true;
		report(nextHeight);
	}
</script>

<div
	class="field"
	class:dragging
	class:at-target={atTarget}
	role="region"
	aria-label="Interactive breathing line"
	onpointerdown={start}
	onpointermove={move}
	onpointerup={end}
	onpointercancel={end}
	onlostpointercapture={end}
>
	<svg bind:this={svg} viewBox="0 0 480 480" aria-hidden="true">
		<defs>
			<filter id="line-glow" x="-200%" y="-200%" width="500%" height="500%">
				<feGaussianBlur stdDeviation="7" />
			</filter>
			<filter id="track-target-aura" x="-200%" y="-200%" width="500%" height="500%">
				<feGaussianBlur in="SourceGraphic" stdDeviation="16" result="blurWide" />
				<feGaussianBlur in="SourceGraphic" stdDeviation="7" result="blurTight" />
				<feMerge>
					<feMergeNode in="blurWide" />
					<feMergeNode in="blurTight" />
					<feMergeNode in="SourceGraphic" />
				</feMerge>
			</filter>
		</defs>
		<!-- Target pace pulse glow aura: shines behind the rails across the entire slider track -->
		{#if atTarget}
			<path
				class="track-glow-pulse-wide"
				d="M 240 390 L 240 90"
				stroke="var(--track-target-aura, var(--theme-guide, #38c8ff))"
				stroke-width="54"
				stroke-linecap="round"
				filter="url(#track-target-aura)"
			/>
			<path
				class="track-glow-pulse-core"
				d="M 240 390 L 240 90"
				stroke="var(--track-target-highlight, #7ae4ff)"
				stroke-width="38"
				stroke-linecap="round"
			/>
		{/if}
		<!-- Outer rail borders: 36px wide with rounded capsule ends, centered at x=240 -->
		<path
			class="track-rail-path"
			class:at-target={atTarget}
			d="M 240 390 L 240 90"
			stroke="var(--track-rail, #a0c5ad)"
			stroke-opacity="var(--track-rail-opacity, 0.35)"
			stroke-width="36"
			stroke-linecap="round"
		/>
		<!-- Track groove / bed: 30px wide recessed channel, centered at x=240 -->
		<path
			d="M 240 390 L 240 90"
			stroke="var(--track-bed, #141a17)"
			stroke-opacity="var(--track-bed-opacity, 0.65)"
			stroke-width="30"
			stroke-linecap="round"
		/>
		<!-- Target slider fill: fills up the slider at the same height as the target point -->
		{#if gy < 390}
			<path
				data-slider-fill
				d={`M 240 390 L 240 ${gy}`}
				stroke="var(--track-fill, rgba(56, 200, 255, 0.32))"
				stroke-width="26"
				stroke-linecap="round"
			/>
			<line
				x1="225"
				y1={gy}
				x2="255"
				y2={gy}
				stroke="var(--theme-guide, #4fe3ff)"
				stroke-width="2"
				stroke-linecap="round"
				opacity="0.85"
			/>
		{/if}
		<!-- Active breathing segment between user and guide: 8px luminous beam -->
		<path
			d={`M 240 ${uy} L 240 ${gy}`}
			stroke="var(--track-active, #d4eed1)"
			stroke-width="8"
			stroke-linecap="round"
			opacity={sync ? 0.8 : 0.45}
		/>
		<!-- Top and bottom hold stations nested inside the track ends -->
		<circle
			cx="240"
			cy="90"
			r="11"
			fill="var(--theme-node-fill, var(--ink-182a22, #182a22))"
			stroke="var(--theme-node-stroke, var(--ink-b3d9bc, #b3d9bc))"
			stroke-width="2"
			stroke-opacity={phase === 1 ? 1 : 0.45}
			class:at-target={atTarget}
		/>
		<circle
			cx="240"
			cy="390"
			r="11"
			fill="var(--theme-node-fill, var(--ink-182a22, #182a22))"
			stroke="var(--theme-node-stroke, var(--ink-b3d9bc, #b3d9bc))"
			stroke-width="2"
			stroke-opacity={phase === 3 ? 1 : 0.45}
			class:at-target={atTarget}
		/>
		<!-- Guide point -->
		<circle
			cx="240"
			cy={gy}
			r="16"
			fill="var(--ink-b9f1d1, #b9f1d1)"
			opacity=".45"
			filter="url(#line-glow)"
		/>
		<circle
			data-guide
			cx="240"
			cy={gy}
			r="6"
			fill="var(--ink-daffe5, #daffe5)"
		/>
	</svg>
	<button
		type="button"
		class="user-point"
		style:top={`${uy / 4.8}%`}
		aria-label="Your breathing point. Press to start or resume. Drag up to inhale and down to exhale. Hold at each end. Or use up and down arrow keys."
		onpointerdown={start}
		onpointermove={move}
		onpointerup={end}
		onpointercancel={end}
		onlostpointercapture={end}
		onkeydown={keyboard}
		onclick={() => {
			if (!running) onbegin();
		}}><span></span></button
	>
	<DragHint
		left="calc(50% + 36px)"
		top={`${uy / 4.8}%`}
		{dragging}
		hasDragged={hasDraggedUp}
		mode="line"
		onpointerdown={start}
		onpointermove={move}
		onpointerup={end}
		onpointercancel={end}
	/>
	<GuideHint
		cycles={effectiveCycles}
		active={hasReachedHalfway}
		{dragging}
		top={`${gy / 4.8}%`}
		right="calc(50% + 36px)"
	/>
</div>

<style>
	.field {
		position: relative;
		width: min(100%, 420px);
		aspect-ratio: 1;
		margin: 0 auto;
		user-select: none;
		-webkit-user-select: none;
		touch-action: none;
		cursor: grab;
	}
	.field.dragging {
		cursor: grabbing;
	}
	svg {
		display: block;
		width: 100%;
		height: 100%;
		overflow: visible;
	}
	.user-point {
		position: absolute;
		left: 50%;
		transform: translate(-50%, -50%);
		width: 56px;
		height: 56px;
		display: grid;
		place-items: center;
		padding: 0;
		border: 0;
		border-radius: 50%;
		background: transparent;
		cursor: grab;
		touch-action: none;
	}
	.user-point span {
		width: 18px;
		height: 18px;
		background: var(--theme-user, var(--ink-e9c995, #e9c995));
		border: 3px solid var(--theme-user-border, var(--ink-26372c, #26372c));
		border-radius: 50%;
		box-shadow:
			0 0 0 1px var(--theme-user, var(--ink-e4c995, #e4c995)),
			0 0 24px var(--theme-user-glow, var(--ink-e4c99544, #e4c99544));
		pointer-events: none;
	}
	.dragging .user-point {
		cursor: grabbing;
	}
	.dragging .user-point span {
		box-shadow:
			0 0 0 7px var(--theme-user-ring, var(--ink-e4c99515, #e4c99515)),
			0 0 26px var(--theme-user-glow-active, var(--ink-e4c99555, #e4c99555));
	}
	.user-point:focus-visible {
		outline: 2px solid var(--theme-user, var(--ink-e9c995, #e9c995));
	}

	/* Slow glowing pulse of the entire slider track when at target speed */
	.track-glow-pulse-wide {
		opacity: 0.55;
		animation: trackAuraSlowPulse 4.2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
		pointer-events: none;
	}

	.track-glow-pulse-core {
		opacity: 0.3;
		animation: trackCoreSlowPulse 4.2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
		pointer-events: none;
	}

	.track-rail-path.at-target {
		stroke: var(--track-target-aura, var(--theme-guide, #38c8ff));
		stroke-opacity: 0.55;
		filter: drop-shadow(0 0 14px var(--track-target-glow, rgba(56, 200, 255, 0.5)));
		transition: stroke 0.8s ease, stroke-opacity 0.8s ease, filter 0.8s ease;
	}

	.field.at-target svg {
		filter: drop-shadow(0 0 24px var(--track-target-glow, rgba(56, 200, 255, 0.4)));
		transition: filter 1s ease;
	}

	circle.at-target {
		stroke: var(--track-target-highlight, #7ae4ff);
		filter: drop-shadow(0 0 8px var(--track-target-glow, rgba(56, 200, 255, 0.6)));
		transition: stroke 0.8s ease, filter 0.8s ease;
	}

	@keyframes trackAuraSlowPulse {
		0%, 100% {
			opacity: 0.35;
			stroke-width: 48px;
		}
		50% {
			opacity: 0.85;
			stroke-width: 62px;
		}
	}

	@keyframes trackCoreSlowPulse {
		0%, 100% {
			opacity: 0.22;
			stroke-width: 34px;
		}
		50% {
			opacity: 0.62;
			stroke-width: 42px;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.track-glow-pulse-wide,
		.track-glow-pulse-core {
			animation: none !important;
			opacity: 0.45;
		}
	}
</style>
