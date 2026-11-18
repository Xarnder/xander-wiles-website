<script lang="ts">
	import { dev } from '$app/environment';
	import { onMount } from 'svelte';
	import { BasementPreviewScene } from '#lib/game/building/BasementPreviewScene';
	import { runBasementBench, type BasementBenchReport } from '#lib/game/building/basementBench';
	import type { FoundationDefinition } from '#lib/game/building/FoundationTypes';
	import {
		footprintRect,
		joinedBuildings,
		segmentInRects,
		unionOutline
	} from '#lib/game/building/foundationJoinMath';

	// Development tool for Basements and Joined Foundations Phase 0: terrain cut under a basement,
	// joined outlines, and the Phase 0 numbers. Under `vite dev`, or with `?dev`.
	const params = new URLSearchParams(location.search);
	const enabled = dev || params.has('dev');

	let viewport: HTMLDivElement | undefined = $state();
	let preview: BasementPreviewScene | null = null;
	let cut = $state(true);
	let deck = $state(true);
	let wireframe = $state(false);
	let holedCells = $state(0);
	let report = $state<BasementBenchReport | null>(null);

	const f = (
		id: string,
		minGridX: number,
		minGridZ: number,
		maxGridX: number,
		maxGridZ: number,
		extra: Partial<FoundationDefinition> = {}
	): FoundationDefinition => ({
		id,
		minGridX,
		maxGridX,
		minGridZ,
		maxGridZ,
		topY: 0,
		bottomY: -1,
		...extra
	});

	/** Join examples, in terrain cells. Segments show the inside test (green inside, red not). */
	const examples: {
		title: string;
		foundations: FoundationDefinition[];
		segments: [number, number, number, number][];
	}[] = [
		{
			title: 'L: cottage + barn',
			foundations: [
				f('cottage', 0, 0, 4, 4, { joinId: 'cottage' }),
				f('barn', 4, 0, 9, 2, { joinId: 'cottage' })
			],
			segments: [
				[0.5, 1, 8.5, 1],
				[1, 3.5, 7, 1.5]
			]
		},
		{
			title: 'T, three joined',
			foundations: [
				f('a', 0, 0, 3, 3, { joinId: 'b' }),
				f('b', 3, 0, 6, 3, { joinId: 'b' }),
				f('c', 6, 0, 9, 3, { joinId: 'b' }),
				f('d', 3, 3, 6, 7, { joinId: 'b' })
			],
			segments: [[4.5, 6.5, 4.5, 0.5]]
		},
		{
			title: 'Ring round a courtyard',
			foundations: [
				f('n', 0, 0, 8, 2, { joinId: 'n' }),
				f('s', 0, 6, 8, 8, { joinId: 'n' }),
				f('w', 0, 2, 2, 6, { joinId: 'n' }),
				f('e', 6, 2, 8, 6, { joinId: 'n' })
			],
			segments: [
				[1, 1, 7, 1],
				[1, 4, 7, 4]
			]
		},
		{
			title: 'q (corner) and r (0.6 m up) stay apart',
			foundations: [
				f('p', 0, 0, 3, 3, { joinId: 'p' }),
				f('q', 3, 3, 6, 6, { joinId: 'p' }),
				f('r', 6, 0, 9, 3, { joinId: 'p', topY: 0.6 }),
				f('s', 3, 0, 5, 2, { joinId: 'p' })
			],
			segments: []
		}
	];

	const colours = ['#d98b4a', '#5b9bd5', '#7bbf6a', '#c77dcb', '#e0c341', '#58c4bd'];

	const drawn = examples.map((example) => {
		const buildings = joinedBuildings(example.foundations);
		const byId = new Map(example.foundations.map((x) => [x.id, x]));
		return {
			...example,
			buildings: buildings.map((b, i) => {
				const members = b.memberIds.map((id) => byId.get(id)!);
				const rects = members.map(footprintRect);
				return {
					...b,
					colour: colours[i % colours.length],
					rects,
					outline: unionOutline(rects)
				};
			}),
			tests: example.segments.map(([ax, az, bx, bz]) => ({
				ax,
				az,
				bx,
				bz,
				inside: segmentInRects(ax, az, bx, bz, example.foundations.map(footprintRect))
			}))
		};
	});

	const path = (loop: { x: number; z: number }[]) =>
		loop.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.z}`).join(' ') + ' Z';

	onMount(() => {
		if (!enabled || !viewport) return;
		preview = new BasementPreviewScene(viewport);
		holedCells = preview.holedCells();
		const api = {
			foundation: preview.foundation,
			holedCells: () => preview?.holedCells() ?? 0,
			setCut: (on: boolean) => preview?.setCut(on),
			bench: (options?: { rounds?: number; calls?: number }) => runBasementBench(options),
			report: null as BasementBenchReport | null,
			examples: drawn.map((d) => ({
				title: d.title,
				buildings: d.buildings.map((b) => ({
					anchorId: b.anchorId,
					memberIds: b.memberIds,
					loops: b.outline.length
				}))
			}))
		};
		(window as unknown as { basementsPreview?: typeof api }).basementsPreview = api;
		// Let the scene paint first; the measurements take a second or two.
		const timer = setTimeout(() => {
			report = runBasementBench();
			api.report = report;
		}, 200);
		return () => {
			clearTimeout(timer);
			preview?.dispose();
		};
	});

	const fmt = (n: number, digits = 2) => n.toFixed(digits);
</script>

<svelte:head><title>Forest Drift · Basements</title></svelte:head>

{#if !enabled}
	<p class="off">Development page. Add <code>?dev</code> to the address.</p>
{:else}
	<main data-testid="basements-preview" data-ready={report !== null}>
		<section class="view">
			<div class="viewport" bind:this={viewport}></div>
			<div class="controls">
				<label
					><input
						type="checkbox"
						bind:checked={cut}
						onchange={() => {
							preview?.setCut(cut);
							holedCells = preview?.holedCells() ?? 0;
						}}
					/> Cut terrain</label
				>
				<label
					><input
						type="checkbox"
						bind:checked={deck}
						onchange={() => preview?.setDeckVisible(deck)}
					/> Deck</label
				>
				<label
					><input
						type="checkbox"
						bind:checked={wireframe}
						onchange={() => preview?.setWireframe(wireframe)}
					/> Wireframe</label
				>
				<span data-testid="holed-cells">{holedCells} terrain cells cut</span>
			</div>
		</section>
		<aside>
			<h1>Basements and joins · Phase 0</h1>
			<p>
				A two-storey basement (2 × 3 m) on the default world. Drag to orbit. Its 6 × 5 terrain cells
				are left out of the mesh; the boxes are the derived stone walls, footing, the floor between
				storeys and the deck.
			</p>
			<h2>Joined outlines</h2>
			<div class="joins">
				{#each drawn as example (example.title)}
					<figure>
						<svg viewBox="-0.5 -0.5 10 9" role="img" aria-label={example.title}>
							{#each example.buildings as building (building.anchorId)}
								{#each building.rects as r, i (i)}
									<rect
										x={r.minX}
										y={r.minZ}
										width={r.maxX - r.minX}
										height={r.maxZ - r.minZ}
										fill={building.colour}
										fill-opacity="0.35"
										stroke={building.colour}
										stroke-width="0.04"
										stroke-dasharray="0.15 0.1"
									/>
								{/each}
								{#each building.outline as loop, i (i)}
									<path d={path(loop)} fill="none" stroke={building.colour} stroke-width="0.12" />
								{/each}
							{/each}
							{#each example.foundations as foundation (foundation.id)}
								<text
									x={(foundation.minGridX + foundation.maxGridX) / 2}
									y={(foundation.minGridZ + foundation.maxGridZ) / 2 + 0.15}
									font-size="0.55"
									text-anchor="middle"
									fill="#f4f1e8"
									>{foundation.id}{example.buildings.some(
										(b) => b.anchorId === foundation.id && b.memberIds.length > 1
									)
										? ' ★'
										: ''}</text
								>
							{/each}
							{#each example.tests as t, i (i)}
								<line
									x1={t.ax}
									y1={t.az}
									x2={t.bx}
									y2={t.bz}
									stroke={t.inside ? '#5fe07a' : '#ff5a4f'}
									stroke-width="0.1"
								/>
							{/each}
						</svg>
						<figcaption>
							{example.title} — {example.buildings.length}
							{example.buildings.length === 1 ? 'building' : 'buildings'}
						</figcaption>
					</figure>
				{/each}
			</div>
			<p class="key">
				★ anchor (whose storeys the building uses) · thick line: the building's outline · green /
				red: a wall inside / not
			</p>
			<h2>Numbers</h2>
			{#if report}
				<table data-testid="basements-report">
					<tbody>
						<tr
							><th colspan="2"
								>Terrain (one {report.terrain.resolution} × {report.terrain.resolution} chunk, 20 basements)</th
							></tr
						>
						<tr><td>Populate, no holes</td><td>{fmt(report.terrain.populateMs)} ms</td></tr>
						<tr><td>Populate, holes cut</td><td>{fmt(report.terrain.populateHoledMs)} ms</td></tr>
						<tr><td>Cutting alone</td><td>{fmt(report.terrain.cutMs, 3)} ms</td></tr>
						<tr><th colspan="2">Walking (per call, 20 foundations)</th></tr>
						<tr><td>Solid foundations</td><td>{fmt(report.walking.solidUs)} µs</td></tr>
						<tr><td>Two-storey basements</td><td>{fmt(report.walking.basementUs)} µs</td></tr>
						<tr><td>Extra</td><td>{fmt(report.walking.extraUs)} µs (≤ 2)</td></tr>
						<tr><th colspan="2">Joins</th></tr>
						<tr
							><td>200 foundations → {report.joins.buildings} buildings</td><td
								>{fmt(report.joins.buildingsMs, 3)} ms</td
							></tr
						>
						<tr><td>Outline of a U of 8</td><td>{fmt(report.joins.outlineUs, 1)} µs</td></tr>
						<tr><td>Slab inside test</td><td>{fmt(report.joins.polygonInsideUs, 1)} µs</td></tr>
						<tr><td>Wall inside test</td><td>{fmt(report.joins.segmentInsideUs, 2)} µs</td></tr>
					</tbody>
				</table>
			{:else}
				<p>Measuring…</p>
			{/if}
		</aside>
	</main>
{/if}

<style>
	main {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 420px;
		height: 100vh;
		background: #101814;
		color: #eaf6ff;
		font-family: system-ui, sans-serif;
		font-size: 0.85rem;
	}
	.view {
		position: relative;
		min-height: 0;
	}
	.viewport {
		position: absolute;
		inset: 0;
	}
	.controls {
		position: absolute;
		left: 12px;
		top: 12px;
		display: flex;
		gap: 12px;
		padding: 6px 10px;
		background: rgb(16 24 20 / 80%);
		border-radius: 6px;
	}
	aside {
		overflow-y: auto;
		padding: 16px;
		border-left: 1px solid #2a3a32;
	}
	h1 {
		font-size: 1.1rem;
		margin: 0 0 8px;
	}
	h2 {
		font-size: 0.95rem;
		margin: 16px 0 8px;
	}
	.joins {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
	}
	figure {
		margin: 0;
		background: #18241e;
		border-radius: 6px;
		padding: 6px;
	}
	figcaption {
		font-size: 0.75rem;
		color: #b9cbc0;
	}
	.key {
		font-size: 0.75rem;
		color: #b9cbc0;
	}
	table {
		width: 100%;
		border-collapse: collapse;
	}
	th {
		text-align: left;
		padding-top: 8px;
		color: #b9cbc0;
		font-weight: 600;
	}
	td:last-child {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
	.off {
		padding: 1rem;
	}
	@media (max-width: 800px) {
		main {
			grid-template-columns: 1fr;
			grid-template-rows: 50vh auto;
			height: auto;
		}
	}
</style>
