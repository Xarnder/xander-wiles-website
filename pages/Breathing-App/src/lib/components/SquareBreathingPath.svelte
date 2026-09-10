<script lang="ts">
	import { onMount } from 'svelte';
	import { pathData, nearestPosition, type PathPoint } from '$lib/geometry';
	import { signedDistance } from '$lib/breathing';
	let { user, guide, running, calibrated, cycles, onmove, onbegin, onend } =
		$props<{
			user: number;
			guide: number;
			running: boolean;
			calibrated: boolean;
			cycles: number;
			onmove: (position: number) => void;
			onbegin: () => void;
			onend: () => void;
		}>();
	let svg: SVGSVGElement;
	let path: SVGPathElement;
	let points = $state<PathPoint[]>([]);
	let dragging = $state(false);
	let pointer: number | null = null;
	let matrix: DOMMatrix | null = null;
	onMount(() => {
		const length = path.getTotalLength();
		points = Array.from({ length: 1200 }, (_, i) => {
			const p = path.getPointAtLength((i / 1200) * length);
			return { x: p.x, y: p.y };
		});
	});
	const point = (p: number) =>
		points[Math.round(p * points.length) % points.length] ?? { x: 90, y: 390 };
	let u = $derived(point(user)),
		g = $derived(point(guide));
	let distance = $derived(signedDistance(user, guide));
	let sync = $derived(Math.abs(distance) < 0.055);
	function start(e: PointerEvent) {
		if (pointer !== null || (e.pointerType === 'mouse' && e.button !== 0))
			return;
		pointer = e.pointerId;
		dragging = true;
		matrix = svg.getScreenCTM()?.inverse() ?? null;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		onbegin();
		e.preventDefault();
	}
	function move(e: PointerEvent) {
		if (!dragging || pointer !== e.pointerId || !matrix || !running) return;
		const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix);
		onmove(nearestPosition(points, p.x, p.y));
	}
	function end(e: PointerEvent) {
		if (e.pointerId !== pointer) return;
		dragging = false;
		pointer = null;
		onend();
	}
	function keyboard(e: KeyboardEvent) {
		if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(e.key))
			return;
		e.preventDefault();
		if (!running) onbegin();
		onmove(
			(user +
				(['ArrowRight', 'ArrowDown'].includes(e.key) ? 0.0125 : -0.0125) +
				1) %
				1
		);
	}
</script>

<div class="field" class:sync class:dragging>
	<svg bind:this={svg} viewBox="0 0 480 480" aria-hidden="true">
		<defs>
			<radialGradient id="membrane"
				><stop
					stop-color="var(--ink-bddcc0, #bddcc0)"
					stop-opacity=".09"
				/><stop
					offset="1"
					stop-color="var(--ink-8ac5a8, #8ac5a8)"
					stop-opacity=".015"
				/></radialGradient
			>
			<filter id="soft" x="-100%" y="-100%" width="300%" height="300%"
				><feGaussianBlur stdDeviation="6" /></filter
			>
		</defs>
		<!-- Membrane center backdrop -->
		<path
			d={pathData}
			fill="url(#membrane)"
			stroke="none"
		/>
		<!-- Outer rail borders: 36px wide with smooth rounded joins -->
		<path
			d={pathData}
			fill="none"
			stroke="var(--track-rail, #a0c5ad)"
			stroke-opacity="var(--track-rail-opacity, 0.35)"
			stroke-width="36"
			stroke-linejoin="round"
		/>
		<!-- Track groove / bed: 30px wide recessed channel -->
		<path
			d={pathData}
			fill="none"
			stroke="var(--track-bed, #141a17)"
			stroke-opacity="var(--track-bed-opacity, 0.65)"
			stroke-width="30"
			stroke-linejoin="round"
		/>
		<!-- Subtle centerline rail guide with path measurement binding -->
		<path
			bind:this={path}
			data-breathing-path
			d={pathData}
			fill="none"
			stroke="var(--track-center, #a0c5ad)"
			stroke-opacity="var(--track-center-opacity, 0.2)"
			stroke-width="1.5"
			stroke-dasharray="3 6"
			stroke-linejoin="round"
		/>
		<!-- Active breathing segment between user and guide: 8px luminous beam -->
		<path
			d={pathData}
			fill="none"
			stroke="var(--track-active, #bfedd0)"
			stroke-width="8"
			stroke-linecap="round"
			stroke-linejoin="round"
			opacity={calibrated ? 0.8 : 0.45}
			pathLength="1"
			stroke-dasharray={`${Math.abs(distance)} ${1 - Math.abs(distance)}`}
			stroke-dashoffset={-(distance >= 0 ? guide : user)}
		/>
		<!-- Guide point -->
		<circle
			cx={g.x}
			cy={g.y}
			r="16"
			fill="var(--ink-b9f1d1, #b9f1d1)"
			opacity=".45"
			filter="url(#soft)"
		/>
		<circle cx={g.x} cy={g.y} r="6" fill="var(--ink-daffe5, #daffe5)" />
	</svg>
	<button
		type="button"
		class="user-point"
		style:left={`${u.x / 4.8}%`}
		style:top={`${u.y / 4.8}%`}
		aria-label="Your breathing point. Press to start or resume. Drag clockwise, or use arrow keys to move."
		onpointerdown={start}
		onpointermove={move}
		onpointerup={end}
		onpointercancel={end}
		onlostpointercapture={end}
		onkeydown={keyboard}
		onclick={() => {
			if (!running) onbegin();
		}}
	>
		<span></span>
	</button>
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
		width: 100%;
		height: 100%;
		display: block;
		overflow: visible;
	}
	.user-point {
		position: absolute;
		transform: translate(-50%, -50%);
		height: 56px;
		width: 56px;
		border: 0;
		background: transparent;
		display: grid;
		place-items: center;
		cursor: grab;
		touch-action: none;
		border-radius: 50%;
		padding: 0;
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
	.dragging .user-point span {
		box-shadow:
			0 0 0 7px var(--ink-e4c99515, #e4c99515),
			0 0 26px var(--ink-e4c99555, #e4c99555);
	}
	.user-point:focus-visible {
		outline: 2px solid var(--ink-e9c995, #e9c995);
		outline-offset: 0;
	}
	.sync svg {
		filter: drop-shadow(0 0 3px var(--ink-a8edbf15, #a8edbf15));
	}
</style>
