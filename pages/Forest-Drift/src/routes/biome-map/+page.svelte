<script lang="ts">
	import { dev } from '$app/environment';
	import { onDestroy, onMount } from 'svelte';
	import { BiomeField } from '#lib/game/biomes/BiomeField';
	import { BIOME_IDS, createDefaultBiomeSettings } from '#lib/game/biomes/BiomeTypes';
	import { createDefaultHydrologySettings } from '#lib/game/hydrology/HydrologyTypes';
	import { BiomeMapClient } from '#lib/game/map/BiomeMapClient';
	import { biomeMapHex } from '#lib/game/map/biomeMapPalette';
	import { MAP_LEVELS, metresPerPixel, tileMetres } from '#lib/game/map/biomeMapTiles';
	import { mapWorldSettingsOf, type MapWorldSettings } from '#lib/game/map/mapWorld';
	import { paintView, wantedTiles, type MapViewport } from '#lib/game/map/mapView';
	import { TerrainHeightSampler } from '#lib/game/terrain/TerrainHeightSampler';
	import { createDefaultTerrainSettings } from '#lib/game/terrain/TerrainSettings';
	import { getDefaultWorldDefinition } from '#lib/game/world/DefaultWorld';

	/**
	 * Biome minimap Phase 0: a developer preview of the map tiles (`/biome-map/?dev`). Drag to pan,
	 * scroll or use the level buttons to zoom. `?seed=…` previews a new world with that seed instead
	 * of the Main World. Exposes `window.biomeMapPreview` for tests and measurements.
	 */
	const params = new URLSearchParams(location.search);
	const enabled = dev || params.has('dev');
	const SIZE = 768;

	let canvas = $state<HTMLCanvasElement>();
	let seed = $state(params.get('seed') ?? '');
	let biomesOn = $state(params.get('biomes') !== 'off');
	let waterOn = $state(params.get('water') !== 'off');
	let level = $state(Number(params.get('level') ?? 3));
	let centre = { x: 0, z: 0 };
	let stats = $state('');
	let client: BiomeMapClient | null = null;
	let dirty = true;
	let raf = 0;

	function worldSettings(): { settings: MapWorldSettings; start: { x: number; z: number } } {
		if (!seed) {
			const world = getDefaultWorldDefinition();
			const settings = mapWorldSettingsOf(world);
			return {
				settings: {
					...settings,
					biomes: { ...settings.biomes, enabled: biomesOn },
					hydrology: { ...settings.hydrology, enabled: waterOn && settings.hydrology.enabled }
				},
				start: { x: world.player.position.x, z: world.player.position.z }
			};
		}
		const terrain = { ...createDefaultTerrainSettings(), seed };
		const biomes = { ...createDefaultBiomeSettings(), enabled: biomesOn };
		let start = { x: 0, z: 0 };
		if (biomesOn) {
			const field = new BiomeField(new TerrainHeightSampler(terrain), biomes);
			field.setSeed(seed);
			start = field.getSpawnOffset();
		}
		return {
			settings: {
				seed,
				terrain,
				biomes,
				hydrology: { ...createDefaultHydrologySettings(), enabled: waterOn }
			},
			start
		};
	}

	function load() {
		const { settings, start } = worldSettings();
		centre = { ...start };
		client ??= new BiomeMapClient();
		client.onTile = () => (dirty = true);
		client.init(settings);
		dirty = true;
	}

	const view = (): MapViewport => ({
		level,
		centreX: centre.x,
		centreZ: centre.z,
		width: SIZE,
		height: SIZE,
		scale: 1
	});

	function frame() {
		raf = requestAnimationFrame(frame);
		if (!client || !canvas) return;
		client.want(wantedTiles(client, view()));
		if (!dirty) return;
		dirty = false;
		const ctx = canvas.getContext('2d')!;
		const dpr = window.devicePixelRatio || 1;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.fillStyle = '#1a1f1c';
		ctx.fillRect(0, 0, SIZE, SIZE);
		ctx.imageSmoothingEnabled = true;
		const blank = paintView(ctx, client, view());
		ctx.strokeStyle = '#fff';
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.moveTo(SIZE / 2 - 8, SIZE / 2);
		ctx.lineTo(SIZE / 2 + 8, SIZE / 2);
		ctx.moveTo(SIZE / 2, SIZE / 2 - 8);
		ctx.lineTo(SIZE / 2, SIZE / 2 + 8);
		ctx.stroke();
		const t = client.timings
			.map((v, l) =>
				v && v.tiles
					? `L${l} ${(v.landMs / v.tiles).toFixed(0)} ms` +
						(v.waterTiles ? ` + water ${(v.waterMs / v.waterTiles).toFixed(0)} ms` : '')
					: ''
			)
			.filter(Boolean)
			.join(' · ');
		stats = `${client.cachedCount} cached · ${client.pendingCount} pending · ${blank} blank · ${t}`;
	}

	let drag: { x: number; y: number } | null = null;
	function pointerDown(e: PointerEvent) {
		drag = { x: e.clientX, y: e.clientY };
		canvas?.setPointerCapture(e.pointerId);
	}
	function pointerMove(e: PointerEvent) {
		if (!drag) return;
		const mpp = metresPerPixel(level);
		centre.x -= (e.clientX - drag.x) * mpp;
		centre.z -= (e.clientY - drag.y) * mpp;
		drag = { x: e.clientX, y: e.clientY };
		dirty = true;
	}
	function wheel(e: WheelEvent) {
		e.preventDefault();
		setLevel(level + Math.sign(e.deltaY));
	}
	function setLevel(next: number) {
		level = Math.max(0, Math.min(MAP_LEVELS - 1, next));
		dirty = true;
	}

	onMount(() => {
		if (!enabled || !canvas) return;
		const dpr = window.devicePixelRatio || 1;
		canvas.width = SIZE * dpr;
		canvas.height = SIZE * dpr;
		load();
		raf = requestAnimationFrame(frame);
		(window as unknown as { biomeMapPreview: unknown }).biomeMapPreview = {
			get client() {
				return client;
			},
			setView(l: number, x?: number, z?: number) {
				setLevel(l);
				if (x !== undefined && z !== undefined) centre = { x, z };
				dirty = true;
			},
			centre: () => ({ ...centre }),
			/** Every tile in view is final (water included) and nothing is pending. */
			settled: () =>
				!!client &&
				client.pendingCount === 0 &&
				paintView({ drawImage() {} }, client, view()) === 0 &&
				wantedTiles(client, view()).every((t) => client!.get(t.level, t.tx, t.tz)?.final)
		};
	});
	onDestroy(() => {
		cancelAnimationFrame(raf);
		client?.dispose();
	});
</script>

<svelte:head><title>Forest Drift · Biome Map</title></svelte:head>

{#if enabled}
	<main>
		<header>
			<h1>Biome map tiles (Phase 0)</h1>
			<label
				>Seed <input
					bind:value={seed}
					placeholder="Main World"
					onchange={load}
					data-testid="map-seed"
				/></label
			>
			<label><input type="checkbox" bind:checked={biomesOn} onchange={load} /> Biomes</label>
			<label><input type="checkbox" bind:checked={waterOn} onchange={load} /> Water</label>
			<span class="levels" role="group" aria-label="Zoom level">
				{#each Array.from({ length: MAP_LEVELS }, (_, i) => i) as l (l)}
					<button aria-pressed={l === level} onclick={() => setLevel(l)}
						>{metresPerPixel(l)} m/px</button
					>
				{/each}
			</span>
			<span
				>View {((SIZE * metresPerPixel(level)) / 1000).toFixed(1)} km · tile {tileMetres(level)} m</span
			>
		</header>
		<canvas
			bind:this={canvas}
			style:width="{SIZE}px"
			style:height="{SIZE}px"
			data-testid="biome-map-canvas"
			onpointerdown={pointerDown}
			onpointermove={pointerMove}
			onpointerup={() => (drag = null)}
			onwheel={wheel}
		></canvas>
		<p class="stats" data-testid="biome-map-stats">{stats}</p>
		<ul class="legend">
			{#each BIOME_IDS as id, i (id)}<li>
					<i style:background={biomeMapHex(i)}></i>{id}
				</li>{/each}
		</ul>
	</main>
{:else}
	<p class="note">The biome map preview is a development tool. Add <code>?dev</code> to open it.</p>
{/if}

<style>
	main {
		padding: 1rem;
		font:
			14px system-ui,
			sans-serif;
		color: #e8efe9;
		background: #101412;
		min-height: 100vh;
	}
	header {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		align-items: center;
		margin-bottom: 0.75rem;
	}
	h1 {
		font-size: 1rem;
		margin: 0;
	}
	button[aria-pressed='true'] {
		background: #e8efe9;
		color: #101412;
	}
	canvas {
		display: block;
		touch-action: none;
		cursor: grab;
		border-radius: 6px;
	}
	.stats {
		font-variant-numeric: tabular-nums;
	}
	.legend {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr));
		gap: 0.25rem 1rem;
		padding: 0;
		list-style: none;
		max-width: 768px;
	}
	.legend i {
		display: inline-block;
		width: 0.9rem;
		height: 0.9rem;
		margin-right: 0.4rem;
		vertical-align: -0.15rem;
		border-radius: 3px;
	}
	.note {
		padding: 2rem;
		font-family: system-ui, sans-serif;
	}
</style>
