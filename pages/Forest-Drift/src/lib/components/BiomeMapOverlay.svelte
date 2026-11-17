<script lang="ts">
	import { onMount, tick } from 'svelte';
	import {
		compassDirection,
		formatDistance,
		formatMapCoordinates,
		formatMapWidth,
		fullMapViewport,
		FULL_MAP_ZOOM_METRES,
		gridSpacing,
		type FullMapHost,
		type MapMarker
	} from '#lib/game/map/BiomeMapSystem';
	import { BIOME_IDS } from '#lib/game/biomes/BiomeTypes';
	import type { BiomeScanResult } from '#lib/game/map/BiomeMapClient';
	import { BIOME_LIST_GROUPS } from '#lib/game/map/biomeGroups';
	import { biomeMapHex } from '#lib/game/map/biomeMapPalette';
	import type { BiomePatch } from '#lib/game/map/biomeSearch';
	import { metresPerPixel } from '#lib/game/map/biomeMapTiles';
	import {
		biomeRows,
		findBiomeAvailable,
		foundLabel,
		foundTitle,
		noMoreText,
		nothingFoundText
	} from '#lib/game/map/findBiome';
	import { paintView, wantedTiles, type MapPainter } from '#lib/game/map/mapView';
	import { landingNote, TRAVEL_REFUSAL_TEXT, type Landing } from '#lib/game/travel/FastTravel';

	/**
	 * The full-screen biome map (biome minimap Phase 2, decisions Q11–Q15). North up. Drag, scroll or
	 * pinch to pan and zoom, or use the arrow keys and + / −; point at a place to read its biome,
	 * distance, direction and coordinates. The page pauses single-player games while it's open and
	 * closes it on Esc. Tiles come from the same worker as the minimap.
	 *
	 * Fast travel (fast travel Phase 1, Q8): a click or tap that doesn't drag drops a pin (Enter pins
	 * the crosshair); the readout then describes the pin, and Travel here (or T) jumps there and
	 * closes the map. Go back returns from the last trip. Esc clears the pin before it closes.
	 *
	 * Find a biome (its Phase 1, Q1–Q7): **Biomes** (or B) opens a list of every biome with the
	 * distance to its nearest patch, from a scan in the map worker. Picking one centres the map on
	 * that patch and pins a spot well inside it; **Next nearest** (or N) steps to the next patch.
	 * Esc closes the list first, then clears the pin, then closes the map.
	 */

	let {
		host,
		biomes,
		grid,
		startZoom,
		onClose
	}: {
		host: FullMapHost;
		biomes: boolean;
		grid: boolean;
		/** The zoom step to open at (the minimap's step: twice as far across). */
		startZoom: number;
		onClose: () => void;
	} = $props();

	let canvas = $state<HTMLCanvasElement>();
	let frame = $state<HTMLDivElement>();
	let zoom = $state(0);
	let readout = $state({
		biome: '',
		distance: '',
		direction: '',
		coordinates: '',
		centre: true,
		note: ''
	});
	let announcement = $state('');
	/** The pinned destination and where it would land (fast travel). */
	let pin = $state<{ x: number; z: number; landing: Landing; note: string | null } | null>(null);
	let travelBlocked = $state<string | null>(null);
	let canGoBack = $state(false);
	let travelling = $state(false);
	let travelError = $state<string | null>(null);
	// The host is fixed for the overlay's life (the page remounts it per opening).
	const travel = $derived(host.travel);

	// Find a biome.
	const canFind = $derived(biomes && findBiomeAvailable());
	let listOpen = $state(false);
	let listEl = $state<HTMLElement>();
	let biomesButton = $state<HTMLButtonElement>();
	/** The scan the list shows: the latest progress, or an earlier finished scan while a new one runs. */
	let scanShown = $state<BiomeScanResult | null>(null);
	let scanning = $state(false);
	/** The biome picked and its patches; `index` is the one pinned. */
	let found = $state<{ biome: number; patches: BiomePatch[]; index: number } | null>(null);
	/** A biome picked before the scan finished (edge case E2). */
	let searching = $state<number | null>(null);
	/** "No Desert within 16 km", "No more Desert within 16 km". */
	let findMessage = $state<string | null>(null);
	let scanToken = 0;
	let pickToken = 0;
	let destroyed = false;
	/** Below this width the list is a sheet over the map, closed after picking. */
	const NARROW = '(max-width: 900px)';

	let width = 0,
		height = 0;
	let centre = { x: 0, z: 0 };
	let pointer: { x: number; y: number } | null = null;
	let dirty = true;
	let raf = 0;
	let lastMarkers = 0;
	let markers: MapMarker[] = [];
	let lastReadoutKey = '';
	let lastAnnounce = 0;
	/** Touches and mouse buttons down, by pointer id (not reactive: read by the handlers only). */
	const pointers: Record<number, { x: number; y: number }> = {};
	const pointerCount = () => Object.keys(pointers).length;
	let pinchStart = 0;
	let wheel = 0;

	const view = () => fullMapViewport(zoom, width, height, centre.x, centre.z);
	/** World metres per CSS pixel. */
	const metresPerCss = () => {
		const v = view();
		return metresPerPixel(v.level) / v.scale;
	};
	const toWorld = (sx: number, sy: number) => {
		const m = metresPerCss();
		return { x: centre.x + (sx - width / 2) * m, z: centre.z + (sy - height / 2) * m };
	};

	function setZoom(next: number, about?: { x: number; y: number }) {
		const clamped = Math.max(0, Math.min(FULL_MAP_ZOOM_METRES.length - 1, next));
		if (clamped === zoom) return;
		const anchor = about ? toWorld(about.x, about.y) : null;
		const ratio = FULL_MAP_ZOOM_METRES[clamped] / FULL_MAP_ZOOM_METRES[zoom];
		zoom = clamped;
		// Keep the point under the pointer (or pinch) where it is.
		if (anchor) {
			centre = {
				x: anchor.x + (centre.x - anchor.x) * ratio,
				z: anchor.z + (centre.z - anchor.z) * ratio
			};
		}
		dirty = true;
	}

	function centreOnMe() {
		const p = host.pose();
		centre = { x: p.x, z: p.z };
		dirty = true;
	}

	function pan(dx: number, dy: number) {
		const m = metresPerCss();
		centre = { x: centre.x - dx * m, z: centre.z - dy * m };
		dirty = true;
	}

	function updateReadout() {
		const target = pin ?? (pointer ? toWorld(pointer.x, pointer.y) : { ...centre });
		const key = `${pin ? 'pin:' : ''}${Math.round(target.x)}:${Math.round(target.z)}`;
		if (key === lastReadoutKey) return;
		lastReadoutKey = key;
		const me = host.pose();
		const distance = Math.hypot(target.x - me.x, target.z - me.z);
		const biome = biomes ? (host.biomeNameAt(target.x, target.z) ?? '') : 'Biomes are off';
		readout = {
			biome,
			distance: distance < 5 ? 'You are here' : formatDistance(distance),
			direction: distance < 5 ? '' : compassDirection(me.x, me.z, target.x, target.z),
			coordinates: formatMapCoordinates(target.x, target.z),
			centre: !pointer && !pin,
			note: pin?.note ?? ''
		};
		const now = performance.now();
		if (found && (pin || !pointer)) {
			// A found patch: "Nearest Desert: 2.4 km north-east".
			lastAnnounce = now;
			announcement = `${foundLabel(found.biome, found.index, found.patches.length)}: ${readout.distance}${readout.direction ? ` ${readout.direction}` : ''}${readout.note ? `. ${readout.note}` : ''}`;
		} else if (pin) {
			// A pin is a choice: say it at once.
			lastAnnounce = now;
			announcement = `Pinned: ${readout.biome}${readout.direction ? `, ${readout.distance} ${readout.direction}` : ''}${readout.note ? `. ${readout.note}` : ''}`;
		} else if (now - lastAnnounce > 1000) {
			lastAnnounce = now;
			announcement = `${readout.biome}${readout.direction ? `, ${readout.distance} ${readout.direction}` : ''}`;
		}
	}

	function paint() {
		const ctx = canvas?.getContext('2d');
		if (!ctx || !canvas || width === 0) return;
		const dpr = Math.min(2, window.devicePixelRatio || 1);
		if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
			canvas.width = Math.round(width * dpr);
			canvas.height = Math.round(height * dpr);
		}
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.fillStyle = '#1b231e';
		ctx.fillRect(0, 0, width, height);
		const v = view();
		host.client.want(wantedTiles(host.client, v));
		ctx.imageSmoothingEnabled = true;
		paintView(ctx as unknown as MapPainter<ImageBitmap>, host.client, v);
		const m = metresPerCss();
		const toScreen = (x: number, z: number) => [
			(x - centre.x) / m + width / 2,
			(z - centre.z) / m + height / 2
		];
		if (grid) {
			const step = gridSpacing(FULL_MAP_ZOOM_METRES[zoom]);
			const left = centre.x - (width / 2) * m,
				top = centre.z - (height / 2) * m;
			ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
			ctx.lineWidth = 1;
			ctx.beginPath();
			const xs: number[] = [],
				zs: number[] = [];
			for (let gx = Math.ceil(left / step) * step; gx <= left + width * m; gx += step) {
				const sx = Math.round((gx - left) / m) + 0.5;
				ctx.moveTo(sx, 0);
				ctx.lineTo(sx, height);
				xs.push(gx);
			}
			for (let gz = Math.ceil(top / step) * step; gz <= top + height * m; gz += step) {
				const sy = Math.round((gz - top) / m) + 0.5;
				ctx.moveTo(0, sy);
				ctx.lineTo(width, sy);
				zs.push(gz);
			}
			ctx.stroke();
			// Labels: x along the top, z down the left edge.
			ctx.font = '600 11px system-ui, sans-serif';
			ctx.fillStyle = 'rgba(234, 246, 255, 0.85)';
			ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
			ctx.shadowBlur = 3;
			const label = (n: number) => formatMapCoordinates(n, 0).split(' · ')[0].slice(2);
			ctx.textAlign = 'left';
			for (const gx of xs) ctx.fillText(label(gx), Math.round((gx - left) / m) + 4, 84);
			for (const gz of zs) ctx.fillText(label(gz), 10, Math.round((gz - top) / m) - 4);
			ctx.shadowBlur = 0;
		}
		for (const marker of markers) {
			const [sx, sy] = toScreen(marker.x, marker.z);
			if (sx < -10 || sy < -10 || sx > width + 10 || sy > height + 10) continue;
			ctx.globalAlpha = marker.dim ? 0.45 : 1;
			ctx.fillStyle = marker.colour;
			ctx.strokeStyle = 'rgba(8, 14, 10, 0.85)';
			ctx.lineWidth = 1.5;
			ctx.beginPath();
			if (marker.kind === 'waypoint') {
				ctx.moveTo(sx, sy - 7);
				ctx.lineTo(sx + 7, sy);
				ctx.lineTo(sx, sy + 7);
				ctx.lineTo(sx - 7, sy);
				ctx.closePath();
			} else ctx.arc(sx, sy, 5, 0, Math.PI * 2);
			ctx.fill();
			ctx.stroke();
		}
		ctx.globalAlpha = 1;
		// You: an arrow pointing where you face (yaw 0 faces north, positive turns left).
		const me = host.pose();
		const [px, py] = toScreen(me.x, me.z);
		ctx.save();
		ctx.translate(px, py);
		ctx.rotate(-me.yaw);
		ctx.beginPath();
		ctx.moveTo(0, -11);
		ctx.lineTo(7, 8);
		ctx.lineTo(0, 4);
		ctx.lineTo(-7, 8);
		ctx.closePath();
		ctx.fillStyle = '#ffffff';
		ctx.strokeStyle = 'rgba(8, 14, 10, 0.9)';
		ctx.lineWidth = 2;
		ctx.stroke();
		ctx.fill();
		ctx.restore();
		if (pin) {
			// The pin, and a dotted line to the shore when it would land somewhere else.
			const [sx, sy] = toScreen(pin.x, pin.z);
			if (pin.landing.moved) {
				const [lx, ly] = toScreen(pin.landing.x, pin.landing.z);
				ctx.setLineDash([3, 3]);
				ctx.strokeStyle = 'rgba(237, 207, 133, 0.9)';
				ctx.lineWidth = 1.5;
				ctx.beginPath();
				ctx.moveTo(sx, sy);
				ctx.lineTo(lx, ly);
				ctx.stroke();
				ctx.setLineDash([]);
				ctx.beginPath();
				ctx.arc(lx, ly, 3.5, 0, Math.PI * 2);
				ctx.fillStyle = '#edcf85';
				ctx.fill();
			}
			ctx.beginPath();
			ctx.moveTo(sx, sy);
			ctx.bezierCurveTo(sx - 9, sy - 12, sx - 8, sy - 24, sx, sy - 24);
			ctx.bezierCurveTo(sx + 8, sy - 24, sx + 9, sy - 12, sx, sy);
			ctx.closePath();
			ctx.fillStyle = '#edcf85';
			ctx.strokeStyle = 'rgba(8, 14, 10, 0.9)';
			ctx.lineWidth = 2;
			ctx.stroke();
			ctx.fill();
			ctx.beginPath();
			ctx.arc(sx, sy - 16, 3, 0, Math.PI * 2);
			ctx.fillStyle = '#1b231e';
			ctx.fill();
		}
		if (!pointer && !pin) {
			// The centre crosshair the readout describes (keyboard users).
			ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
			ctx.lineWidth = 1.5;
			ctx.beginPath();
			ctx.moveTo(width / 2 - 9, height / 2);
			ctx.lineTo(width / 2 + 9, height / 2);
			ctx.moveTo(width / 2, height / 2 - 9);
			ctx.lineTo(width / 2, height / 2 + 9);
			ctx.stroke();
		}
	}

	function loop(now: number) {
		raf = requestAnimationFrame(loop);
		if (now - lastMarkers > 100) {
			lastMarkers = now;
			markers = host.markers();
			if (markers.length) dirty = true;
			if (travel) {
				const permission = travel.permission();
				travelBlocked = permission.ok ? null : TRAVEL_REFUSAL_TEXT[permission.reason];
				canGoBack = travel.origin() !== null;
			}
		}
		if (!dirty) return;
		dirty = false;
		paint();
		updateReadout();
	}

	/**
	 * Drops the pin at a world point and works out (and prepares) where it lands. A pin the player
	 * places themselves ends a Find (`keepFound` is for Find's own pins).
	 */
	function dropPin(at: { x: number; z: number }, keepFound = false) {
		if (!keepFound) {
			found = null;
			findMessage = null;
		}
		if (!travel) return;
		const landing = travel.landing(at.x, at.z);
		pin = { x: at.x, z: at.z, landing, note: landingNote(at, landing) };
		travelError = null;
		lastReadoutKey = '';
		dirty = true;
	}

	function clearPin() {
		pin = null;
		found = null;
		findMessage = null;
		travelError = null;
		lastReadoutKey = '';
		dirty = true;
	}

	async function finish(trip: Promise<{ ok: boolean; reason?: string }>) {
		if (travelling) return;
		travelling = true;
		try {
			const outcome = await trip;
			if (outcome.ok) onClose();
			else
				travelError =
					TRAVEL_REFUSAL_TEXT[outcome.reason as keyof typeof TRAVEL_REFUSAL_TEXT] ??
					'Could not travel';
		} finally {
			travelling = false;
		}
	}

	function travelToPin() {
		if (!travel || !pin || travelBlocked) return;
		void finish(travel.go(pin.x, pin.z));
	}

	function goBack() {
		if (!travel || !canGoBack || travelBlocked) return;
		void finish(travel.back());
	}

	/**
	 * Esc closes the Biomes list, then clears the pin, before it closes the map (capture: before the
	 * page's own Esc).
	 */
	function escape(event: KeyboardEvent) {
		if (event.key !== 'Escape' || (!listOpen && !pin && !found)) return;
		event.preventDefault();
		event.stopImmediatePropagation();
		if (listOpen) closeList();
		else clearPin();
	}

	/** Scans round you (reusing the last scan within 250 m, Q9); keeps the old one up meanwhile. */
	async function startScan() {
		const token = ++scanToken;
		const me = host.pose();
		scanning = true;
		const result = await host.client.scan(me.x, me.z);
		if (destroyed || token !== scanToken) return;
		scanning = false;
		if (result) showScan(result);
		// Null: the world changed (E4) or the scan was dropped. Scan again while the list is open.
		else if (listOpen) void startScan();
	}

	/**
	 * Shows a scan in the list. Its rows re-sort when distances arrive, and moving a focused row can
	 * drop focus in some browsers, so focus follows the same biome.
	 */
	function showScan(result: BiomeScanResult) {
		const active = document.activeElement as HTMLElement | null;
		const focused = listEl?.contains(active) ? active?.dataset.biome : undefined;
		scanShown = result;
		if (focused === undefined) return;
		void tick().then(() => {
			const row = listEl?.querySelector<HTMLButtonElement>(`button[data-biome="${focused}"]`);
			if (row && document.activeElement !== row) row.focus();
		});
	}

	function openList() {
		if (!canFind || listOpen) return;
		listOpen = true;
		void startScan();
		// Focus the first row once it's drawn.
		requestAnimationFrame(() =>
			listEl?.querySelector<HTMLButtonElement>('button[data-biome]')?.focus()
		);
	}

	function closeList() {
		if (!listOpen) return;
		const hadFocus = !!listEl?.contains(document.activeElement);
		listOpen = false;
		if (hadFocus) biomesButton?.focus();
	}

	/** Shows the found patch at `found.index`: centres the map on it and pins it. */
	function showFound() {
		if (!found) return;
		const patch = found.patches[found.index];
		centre = { x: patch.x, z: patch.z };
		pointer = null;
		findMessage = null;
		if (travel) dropPin(patch, true);
		else {
			lastReadoutKey = '';
			dirty = true;
		}
	}

	/** Picking a biome (Q2): the nearest patch, pinned well inside (Q6). */
	async function pick(biome: number) {
		const token = ++pickToken;
		searching = biome;
		findMessage = null;
		const me = host.pose();
		// The scan the list is showing (or a fresh one); `find` waits for it in the worker.
		const result = await host.client.scan(me.x, me.z);
		const patches = result ? await host.client.find(biome) : [];
		if (destroyed || token !== pickToken) return;
		searching = null;
		if (!result) return;
		if (patches.length === 0) {
			found = null;
			if (pin) clearPin();
			findMessage = nothingFoundText(biome, result.here === biome);
			announcement = findMessage;
			return;
		}
		found = { biome, patches, index: 0 };
		showFound();
		if (window.matchMedia(NARROW).matches) closeList();
	}

	/** Next nearest (Q4): the next separate patch, up to five. */
	function nextNearest() {
		if (!found) return;
		if (found.index + 1 >= found.patches.length) {
			findMessage = noMoreText(found.biome);
			announcement = findMessage;
			return;
		}
		found = { ...found, index: found.index + 1 };
		showFound();
	}

	/** Up and down (and Home, End) move between the list's rows. */
	function listKey(event: KeyboardEvent): boolean {
		if (!listEl?.contains(document.activeElement)) return false;
		const rows = [...listEl.querySelectorAll<HTMLButtonElement>('button[data-biome]')];
		const at = rows.indexOf(document.activeElement as HTMLButtonElement);
		const next =
			event.key === 'ArrowDown'
				? Math.min(rows.length - 1, at + 1)
				: event.key === 'ArrowUp'
					? Math.max(0, at - 1)
					: event.key === 'Home'
						? 0
						: event.key === 'End'
							? rows.length - 1
							: -1;
		if (next < 0) return event.key === 'ArrowLeft' || event.key === 'ArrowRight';
		event.preventDefault();
		rows[next]?.focus();
		return true;
	}

	function keydown(event: KeyboardEvent) {
		const step = 0.15 * Math.min(width, height);
		// Dialog keys by `event.key` (arrows, + and −, C), like the tab lists in other dialogs.
		const actions: Record<string, () => void> = {
			ArrowLeft: () => pan(step, 0),
			ArrowRight: () => pan(-step, 0),
			ArrowUp: () => pan(0, step),
			ArrowDown: () => pan(0, -step),
			'+': () => setZoom(zoom - 1),
			'=': () => setZoom(zoom - 1),
			'-': () => setZoom(zoom + 1),
			_: () => setZoom(zoom + 1),
			c: centreOnMe,
			C: centreOnMe
		};
		if (listOpen && listKey(event)) return;
		if (canFind && !event.ctrlKey && !event.metaKey && !event.altKey) {
			if (event.key === 'b' || event.key === 'B') {
				event.preventDefault();
				if (listOpen) closeList();
				else openList();
				return;
			}
			if ((event.key === 'n' || event.key === 'N') && found) {
				event.preventDefault();
				nextNearest();
				return;
			}
		}
		// Enter pins the crosshair, only on the map itself (on a button, Enter presses it).
		if (event.key === 'Enter' && travel && document.activeElement === frame) {
			event.preventDefault();
			pointer = null;
			dropPin({ ...centre });
			return;
		}
		if ((event.key === 't' || event.key === 'T') && pin) {
			event.preventDefault();
			travelToPin();
			return;
		}
		const action = actions[event.key];
		if (!action) return;
		event.preventDefault();
		action();
		pointer = null;
		dirty = true;
	}

	/** A press that might be a click (pin) rather than a drag; null once it moves or pinches. */
	let press: { id: number; x: number; y: number; travelled: number } | null = null;
	/** A click (or tap) drops a pin; anything past this many CSS pixels is a drag. */
	const CLICK_SLOP = 6;

	function pointerdown(event: PointerEvent) {
		frame?.setPointerCapture(event.pointerId);
		pointers[event.pointerId] = { x: event.offsetX, y: event.offsetY };
		press =
			pointerCount() === 1 && event.button === 0
				? { id: event.pointerId, x: event.offsetX, y: event.offsetY, travelled: 0 }
				: null;
		if (pointerCount() === 2) {
			press = null;
			const [a, b] = Object.values(pointers);
			pinchStart = Math.hypot(a.x - b.x, a.y - b.y);
		}
	}
	function pointermove(event: PointerEvent) {
		const prev = pointers[event.pointerId];
		const here = { x: event.offsetX, y: event.offsetY };
		if (event.pointerType === 'mouse') pointer = here;
		if (prev) {
			pointers[event.pointerId] = here;
			if (press?.id === event.pointerId)
				press.travelled = Math.max(press.travelled, Math.hypot(here.x - press.x, here.y - press.y));
			if (pointerCount() === 1) pan(here.x - prev.x, here.y - prev.y);
			else if (pointerCount() === 2 && pinchStart > 0) {
				const [a, b] = Object.values(pointers);
				const distance = Math.hypot(a.x - b.x, a.y - b.y);
				const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
				if (distance / pinchStart > 1.5) {
					setZoom(zoom - 1, mid);
					pinchStart = distance;
				} else if (distance / pinchStart < 0.67) {
					setZoom(zoom + 1, mid);
					pinchStart = distance;
				}
			}
		}
		dirty = true;
	}
	function pointerup(event: PointerEvent) {
		if (
			event.type === 'pointerup' &&
			press?.id === event.pointerId &&
			press.travelled <= CLICK_SLOP &&
			pointerCount() === 1
		)
			dropPin(toWorld(press.x, press.y));
		if (press?.id === event.pointerId) press = null;
		delete pointers[event.pointerId];
		if (pointerCount() < 2) pinchStart = 0;
	}
	function onwheel(event: WheelEvent) {
		event.preventDefault();
		wheel += event.deltaY;
		if (Math.abs(wheel) < 60) return;
		setZoom(zoom + Math.sign(wheel), { x: event.offsetX, y: event.offsetY });
		wheel = 0;
	}

	onMount(() => {
		zoom = Math.max(0, Math.min(FULL_MAP_ZOOM_METRES.length - 1, startZoom));
		centreOnMe();
		host.setTileListener(() => (dirty = true));
		host.client.onScan = (result) => {
			// Keep an earlier finished scan up until the new one is done (E1).
			if (result.done || !scanShown?.done) showScan(result);
		};
		const resize = new ResizeObserver(() => {
			if (!frame) return;
			width = frame.clientWidth;
			height = frame.clientHeight;
			dirty = true;
		});
		if (frame) resize.observe(frame);
		window.addEventListener('keydown', keydown);
		window.addEventListener('keydown', escape, true);
		raf = requestAnimationFrame(loop);
		frame?.focus();
		return () => {
			cancelAnimationFrame(raf);
			resize.disconnect();
			window.removeEventListener('keydown', keydown);
			window.removeEventListener('keydown', escape, true);
			host.setTileListener(null);
			host.client.onScan = null;
			destroyed = true;
		};
	});
</script>

<div
	class="full-map"
	role="dialog"
	aria-modal="true"
	aria-label="Biome map"
	data-testid="biome-full-map"
	data-ui-surface="menu"
>
	<div
		class="surface"
		bind:this={frame}
		tabindex="-1"
		role="application"
		aria-label={`Map. Arrow keys pan, plus and minus zoom, C centres on you, ${travel ? 'Enter pins the centre, T travels to the pin, ' : ''}${canFind ? 'B lists biomes, ' : ''}Escape closes.`}
		onpointerdown={pointerdown}
		onpointermove={pointermove}
		onpointerup={pointerup}
		onpointercancel={pointerup}
		onpointerleave={() => {
			pointer = null;
			dirty = true;
		}}
		{onwheel}
	>
		<canvas bind:this={canvas} data-testid="biome-full-map-canvas"></canvas>
	</div>
	<header>
		<h2>Biome map</h2>
		<span class="scale" data-testid="biome-full-map-scale"
			>{formatMapWidth(FULL_MAP_ZOOM_METRES[zoom])} across</span
		>
		<div class="buttons">
			{#if canFind}
				<button
					type="button"
					bind:this={biomesButton}
					aria-expanded={listOpen}
					aria-controls="biome-list"
					data-testid="biome-full-map-biomes"
					onclick={() => (listOpen ? closeList() : openList())}>Biomes</button
				>
			{/if}
			<button type="button" data-testid="biome-full-map-zoom-in" onclick={() => setZoom(zoom - 1)}
				>Zoom in</button
			>
			<button type="button" data-testid="biome-full-map-zoom-out" onclick={() => setZoom(zoom + 1)}
				>Zoom out</button
			>
			<button type="button" data-testid="biome-full-map-centre" onclick={centreOnMe}
				>Centre on me</button
			>
			{#if travel && canGoBack}
				<button
					type="button"
					data-testid="biome-full-map-go-back"
					disabled={travelling || travelBlocked !== null}
					onclick={goBack}>Go back</button
				>
			{/if}
			<button type="button" class="close" data-testid="biome-full-map-close" onclick={onClose}
				>Close</button
			>
		</div>
	</header>
	{#if canFind && listOpen}
		<section
			class="biome-list"
			id="biome-list"
			aria-label="Biomes"
			data-testid="biome-list"
			bind:this={listEl}
		>
			<div class="list-head">
				<h3>Biomes</h3>
				<span class="list-status" data-testid="biome-list-status"
					>{scanning && !scanShown?.done
						? 'Searching…'
						: scanning
							? 'Updating…'
							: 'Nearest within 16 km'}</span
				>
				<button type="button" class="list-close" onclick={closeList}>Close list</button>
			</div>
			{#each BIOME_LIST_GROUPS as group (group.group)}
				<h4>{group.label}</h4>
				<ul>
					{#each biomeRows(group, scanShown) as row (row.biome)}
						<li>
							<button
								type="button"
								data-biome={row.biome}
								data-testid="biome-row-{BIOME_IDS[row.biome]}"
								class:none={row.state === 'none'}
								class:here={row.state === 'here'}
								class:stale={scanning && !!scanShown?.done}
								aria-current={found?.biome === row.biome ? 'true' : undefined}
								aria-label={searching === row.biome ? `${row.name}, searching` : row.label}
								onclick={() => pick(row.biome)}
								><i class="swatch" style:background={biomeMapHex(row.biome)}></i><span class="name"
									>{row.name}</span
								><span class="distance">{searching === row.biome ? 'Searching…' : row.text}</span
								></button
							>
						</li>
					{/each}
				</ul>
			{/each}
		</section>
	{/if}
	<footer data-testid="biome-full-map-readout">
		{#if found}<strong class="found" data-testid="biome-full-map-found"
				>{foundTitle(found.biome, found.index, found.patches.length)}</strong
			>{:else}<strong data-testid="biome-full-map-biome">{readout.biome || '—'}</strong>{/if}
		<span data-testid="biome-full-map-distance"
			>{readout.distance}{readout.direction ? ` ${readout.direction}` : ''}</span
		>
		<span data-testid="biome-full-map-coordinates">{readout.coordinates}</span>
		{#if pin}
			{#if readout.note}<span class="note" data-testid="biome-full-map-note">{readout.note}</span
				>{/if}
			<button
				type="button"
				class="travel"
				data-testid="biome-full-map-travel"
				disabled={travelling || travelBlocked !== null}
				onclick={travelToPin}
				>{travelling ? 'Travelling…' : (travelBlocked ?? 'Travel here')}</button
			>
			<button type="button" data-testid="biome-full-map-clear-pin" onclick={clearPin}
				>Clear pin</button
			>
			{#if travelError}<span class="note" role="alert">{travelError}</span>{/if}
		{/if}
		{#if found}
			<button type="button" data-testid="biome-full-map-next" onclick={nextNearest}
				>Next nearest</button
			>
		{/if}
		{#if findMessage}<span class="note" data-testid="biome-full-map-find-message"
				>{findMessage}</span
			>{/if}
		{#if !pin && !found}
			<span class="hint"
				>{travel ? 'Click to pin · ' : ''}Drag to pan · scroll or pinch to zoom · Esc to close</span
			>
		{/if}
	</footer>
	<div class="visually-hidden" role="status" aria-live="polite">{announcement}</div>
</div>

<style>
	.full-map {
		position: fixed;
		inset: 0;
		z-index: 60;
		background: #1b231e;
		color: #eaf6ff;
		font:
			14px system-ui,
			sans-serif;
	}
	.surface {
		position: absolute;
		inset: 0;
		touch-action: none;
		cursor: grab;
		outline: none;
	}
	.surface:active {
		cursor: grabbing;
	}
	canvas {
		display: block;
		width: 100%;
		height: 100%;
	}
	header,
	footer {
		position: absolute;
		left: max(0.75rem, env(safe-area-inset-left));
		right: max(0.75rem, env(safe-area-inset-right));
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem 0.9rem;
		padding: 0.5rem 0.75rem;
		border-radius: 10px;
		background: rgba(10, 20, 15, 0.78);
		pointer-events: auto;
	}
	header {
		top: max(0.75rem, env(safe-area-inset-top));
		left: auto;
	}
	footer {
		bottom: max(0.75rem, env(safe-area-inset-bottom));
		right: auto;
		max-width: calc(100vw - 1.5rem);
		font-variant-numeric: tabular-nums;
	}
	h2 {
		margin: 0;
		font-size: 1rem;
	}
	.scale {
		opacity: 0.85;
	}
	.buttons {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}
	button {
		min-height: 2.1rem;
		padding: 0.3rem 0.75rem;
		border-radius: 8px;
		border: 1px solid rgba(234, 246, 255, 0.3);
		background: rgba(234, 246, 255, 0.08);
		color: inherit;
		font: inherit;
		cursor: pointer;
	}
	button:hover {
		background: rgba(234, 246, 255, 0.16);
	}
	button:focus-visible {
		outline: 2px solid #edcf85;
		outline-offset: 2px;
	}
	.close {
		background: #edcf85;
		color: #1b231e;
		border-color: transparent;
		font-weight: 600;
	}
	footer strong {
		font-size: 1rem;
	}
	.note {
		color: #edcf85;
		font-size: 0.85rem;
	}
	.travel {
		background: #edcf85;
		color: #1b231e;
		border-color: transparent;
		font-weight: 600;
	}
	button:disabled {
		opacity: 0.55;
		cursor: default;
	}
	.hint {
		opacity: 0.7;
		font-size: 0.8rem;
	}
	@media (hover: none) {
		.hint {
			display: none;
		}
	}
	.found {
		color: #edcf85;
		font-weight: 600;
	}
	.biome-list {
		position: absolute;
		top: max(0.75rem, env(safe-area-inset-top));
		bottom: 6rem;
		left: max(0.75rem, env(safe-area-inset-left));
		width: min(320px, calc(100vw - 1.5rem));
		overflow-y: auto;
		padding: 0.5rem 0.6rem 0.75rem;
		border-radius: 10px;
		background: rgba(10, 20, 15, 0.9);
		overscroll-behavior: contain;
	}
	.list-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.25rem 0.6rem;
		padding: 0 0.15rem 0.25rem;
	}
	.list-head h3 {
		margin: 0;
		font-size: 1rem;
	}
	.list-status {
		flex: 1;
		font-size: 0.8rem;
		opacity: 0.75;
	}
	.list-close {
		min-height: 1.8rem;
		padding: 0.15rem 0.6rem;
		font-size: 0.8rem;
	}
	.biome-list h4 {
		margin: 0.6rem 0.15rem 0.2rem;
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		opacity: 0.7;
	}
	.biome-list ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.biome-list li button {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		min-height: 2.1rem;
		padding: 0.2rem 0.45rem;
		border: 1px solid transparent;
		background: none;
		text-align: left;
	}
	.biome-list li button:hover {
		background: rgba(234, 246, 255, 0.1);
	}
	.biome-list li button[aria-current='true'] {
		border-color: rgba(237, 207, 133, 0.7);
		background: rgba(237, 207, 133, 0.12);
	}
	.swatch {
		flex: none;
		width: 0.95rem;
		height: 0.95rem;
		border-radius: 3px;
		box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.35);
	}
	.name {
		flex: 1;
	}
	.distance {
		font-variant-numeric: tabular-nums;
		font-size: 0.85rem;
		opacity: 0.85;
		white-space: nowrap;
	}
	.here .distance {
		color: #edcf85;
		opacity: 1;
	}
	.none {
		opacity: 0.5;
	}
	.stale .distance {
		opacity: 0.45;
	}
	@media (max-width: 900px) {
		.biome-list {
			top: auto;
			bottom: 0;
			left: 0;
			right: 0;
			width: auto;
			max-height: 58vh;
			padding-bottom: max(0.75rem, env(safe-area-inset-bottom));
			border-radius: 14px 14px 0 0;
			background: #101a14;
			z-index: 1;
		}
	}
	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
</style>
