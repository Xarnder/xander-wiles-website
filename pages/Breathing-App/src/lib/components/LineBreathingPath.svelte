<script lang="ts">
	import { phases, signedDistance, wrap } from '$lib/breathing';
	import { lineHeight, lineProgress } from '$lib/line';
	let { user, guide, running, calibrated, cycles, onmove, onbegin, onend } =
		$props<{
			user: number;
			guide: number;
			running: boolean;
			calibrated: boolean;
			cycles: number;
			onmove: (p: number) => void;
			onbegin: () => void;
			onend: () => void;
		}>();
	let svg: SVGSVGElement;
	let pointer: number | null = null;
	let inverse: DOMMatrix | null = null;
	let dragging = $state(false);
	const y = (p: number) => 390 - lineHeight(p) * 300;
	let uy = $derived(y(user)),
		gy = $derived(y(guide));
	let phase = $derived(Math.floor(guide * 4));
	let sync = $derived(Math.abs(signedDistance(user, guide)) < 0.055);
	function report(height: number) {
		const next = lineProgress(user, height);
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
		report(lineHeight(user) + (e.key === 'ArrowUp' ? 0.04 : -0.04));
	}
</script>

<div class="field" class:dragging>
	<svg bind:this={svg} viewBox="0 0 480 480" aria-hidden="true">
		<defs>
			<filter id="line-glow" x="-200%" y="-200%" width="500%" height="500%">
				<feGaussianBlur stdDeviation="7" />
			</filter>
		</defs>
		<!-- Outer rail borders: 36px wide with rounded capsule ends, centered at x=240 -->
		<path
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
		<!-- Subtle centerline rail guide -->
		<path
			data-breathing-line
			d="M 240 390 L 240 90"
			stroke="var(--track-center, #a0c5ad)"
			stroke-opacity="var(--track-center-opacity, 0.2)"
			stroke-width="1.5"
			stroke-dasharray="3 5"
		/>
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
			stroke="var(--ink-b3d9bc, #b3d9bc)"
			stroke-width="2"
			stroke-opacity={phase === 1 ? 1 : 0.45}
		/>
		<circle
			cx="240"
			cy="390"
			r="11"
			fill="var(--theme-node-fill, var(--ink-182a22, #182a22))"
			stroke="var(--ink-b3d9bc, #b3d9bc)"
			stroke-width="2"
			stroke-opacity={phase === 3 ? 1 : 0.45}
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
</div>

<style>
	.field {
		position: relative;
		width: min(100%, 420px);
		aspect-ratio: 1;
		margin: 0 auto;
		user-select: none;
		-webkit-user-select: none;
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
		background: var(--ink-e9c995, #e9c995);
		border: 3px solid var(--ink-26372c, #26372c);
		border-radius: 50%;
		box-shadow:
			0 0 0 1px var(--ink-e4c995, #e4c995),
			0 0 24px var(--ink-e4c99544, #e4c99544);
		pointer-events: none;
	}
	.dragging .user-point {
		cursor: grabbing;
	}
	.user-point:focus-visible {
		outline: 2px solid var(--ink-e9c995, #e9c995);
	}
</style>
