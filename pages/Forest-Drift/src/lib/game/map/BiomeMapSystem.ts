import { BiomeMapClient } from './BiomeMapClient';
import { MAP_LEVELS, metresPerPixel } from './biomeMapTiles';
import type { MapWorldSettings } from './mapWorld';
import { paintView, wantedTiles, type MapPainter, type MapViewport } from './mapView';

/**
 * The corner minimap (biome minimap Phase 1, technical plan §5). No Svelte, no Three.js: the scene
 * hands it the player's pose and the markers, and it paints straight onto the minimap's canvas, as
 * the locator bar does, so a moving player never re-renders a component.
 *
 * Costs nothing while hidden: the worker exists only while the minimap is attached.
 */

/** Metres across the minimap at each zoom step (Q4). */
export const MINIMAP_ZOOM_METRES = [250, 500, 1000, 2000, 4000, 8000] as const;
export const DEFAULT_MINIMAP_ZOOM = 2;
/** CSS pixels across the minimap (Q10). */
export const MINIMAP_SIZES = { small: 140, medium: 180, large: 240 } as const;
export type MinimapSize = keyof typeof MINIMAP_SIZES;
/** Below this window width the minimap is always Small (edge case E9). */
export const SMALL_SCREEN_WIDTH = 700;

/** Repaint at most this often (ms): about 15 a second. */
const PAINT_INTERVAL_MS = 66;
/** Markers (players, waypoints) are re-read this often (ms). */
const MARKER_INTERVAL_MS = 100;
/** The labels (coordinates, zoom) are rewritten this often (ms). */
const LABEL_INTERVAL_MS = 250;
/** The world's settings are compared this often (ms), to notice a changed world. */
const WORLD_CHECK_MS = 1000;

/**
 * Metres across the full map's shorter side at each zoom step (Q4: out to 16 km). It starts at
 * 500 m: a whole screen of 250 m would stretch the finest tiles about 6×. Step n is twice the
 * minimap's step n, so the full map opens one step further out than the minimap.
 */
export const FULL_MAP_ZOOM_METRES = [500, 1000, 2000, 4000, 8000, 16000] as const;

export const clampZoom = (zoom: number) =>
	Math.max(0, Math.min(MINIMAP_ZOOM_METRES.length - 1, Math.round(zoom)));

/**
 * The tile level and scale for a minimap: the coarsest level whose pixels are no larger than the
 * screen's (or level 0), so the map is never blurrier than the screen. Tiles are drawn at 0.5–1×,
 * or up to 2× at the closest zoom on a large map (§4.1).
 */
export function minimapViewport(
	zoom: number,
	sizePx: number,
	centreX: number,
	centreZ: number
): MapViewport {
	const metres = MINIMAP_ZOOM_METRES[clampZoom(zoom)];
	const wanted = metres / sizePx;
	let level = 0;
	while (level + 1 < MAP_LEVELS && metresPerPixel(level + 1) <= wanted) level++;
	return {
		level,
		centreX,
		centreZ,
		width: sizePx,
		height: sizePx,
		scale: (sizePx * metresPerPixel(level)) / metres
	};
}

/**
 * The full map's tile level and scale. Its view is much larger than the minimap's, so tiles may be
 * enlarged up to 2.5×, which keeps a full screen to about 40 tiles (the cache holds 120). The
 * closest step can enlarge the finest tiles up to ~4.3× on a tall screen: soft, not pixelated.
 */
export function fullMapViewport(
	zoom: number,
	width: number,
	height: number,
	centreX: number,
	centreZ: number
): MapViewport {
	const step = Math.max(0, Math.min(FULL_MAP_ZOOM_METRES.length - 1, Math.round(zoom)));
	const wanted = FULL_MAP_ZOOM_METRES[step] / Math.max(1, Math.min(width, height));
	let level = 0;
	while (level + 1 < MAP_LEVELS && metresPerPixel(level + 1) <= wanted * 2.5) level++;
	return { level, centreX, centreZ, width, height, scale: metresPerPixel(level) / wanted };
}

/** Compass direction (8 points) from one point to another; north is −Z. */
export function compassDirection(fromX: number, fromZ: number, toX: number, toZ: number): string {
	const bearing = (Math.atan2(toX - fromX, fromZ - toZ) * 180) / Math.PI;
	const points = [
		'north',
		'north-east',
		'east',
		'south-east',
		'south',
		'south-west',
		'west',
		'north-west'
	];
	return points[Math.round(((bearing + 360) % 360) / 45) % 8];
}

export const formatDistance = (metres: number) =>
	metres < 1000
		? `${Math.round(metres)} m`
		: `${(metres / 1000).toFixed(metres < 10_000 ? 1 : 0)} km`;

/** Grid spacing (m): about four or five lines across, at a round number (Q2). */
export function gridSpacing(metresAcross: number): number {
	for (const step of [50, 100, 250, 500, 1000, 2000]) if (step >= metresAcross / 5) return step;
	return 2000;
}

const groupThousands = (n: number) => {
	const s = Math.abs(Math.round(n)).toString();
	return (n < -0.5 ? '−' : '') + s.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
};
/** "x 1 240 · z −3 450": whole metres, thin-space thousands. */
export const formatMapCoordinates = (x: number, z: number) =>
	`x ${groupThousands(x)} · z ${groupThousands(z)}`;
export const formatMapWidth = (metres: number) =>
	metres >= 1000 ? `${metres / 1000} km` : `${metres} m`;

/** Something to show on the map: another player, or a waypoint. */
export interface MapMarker {
	x: number;
	z: number;
	colour: string;
	kind: 'player' | 'waypoint';
	/** Away, offline or out of date: drawn faded. */
	dim?: boolean;
}

/** What the full-screen map (`BiomeMapOverlay.svelte`) needs from the game. */
export interface FullMapHost {
	client: BiomeMapClient;
	pose(): { x: number; z: number; yaw: number };
	markers(): MapMarker[];
	biomeNameAt(x: number, z: number): string | null;
	/** Called when a tile arrives (to repaint); null to stop. */
	setTileListener(listener: (() => void) | null): void;
}

/** The minimap's DOM, from `BiomeMinimap.svelte`. */
export interface MinimapElements {
	canvas: HTMLCanvasElement;
	arrow: HTMLElement;
	coordinates: HTMLElement;
	scaleLabel: HTMLElement;
}

/** Main-thread cost, for the performance record (technical plan §12). */
export interface MinimapCost {
	frames: number;
	totalMs: number;
	maxMs: number;
	paints: number;
}

export class BiomeMapSystem {
	private client: BiomeMapClient | null = null;
	private elements: MinimapElements | null = null;
	/** The full map is open: it shares this client, so the worker stays while either map is. */
	private fullOpen = false;
	private worldKey = '';
	private lastWorldCheck = -Infinity;
	private zoom = DEFAULT_MINIMAP_ZOOM;
	private sizePx: number = MINIMAP_SIZES.medium;
	private grid = true;
	private dirty = true;
	private lastPaint = -Infinity;
	private lastMarkers = -Infinity;
	private lastLabels = -Infinity;
	private paintedX = NaN;
	private paintedZ = NaN;
	private arrowYaw = NaN;
	private markers: MapMarker[] = [];
	readonly cost: MinimapCost = { frames: 0, totalMs: 0, maxMs: 0, paints: 0 };

	constructor(private readonly createClient: () => BiomeMapClient = () => new BiomeMapClient()) {}

	/** Whether a minimap is on screen (and the worker running). */
	get attached(): boolean {
		return this.elements !== null;
	}
	get workerRunning(): boolean {
		return this.client !== null;
	}
	get tileClient(): BiomeMapClient | null {
		return this.client;
	}

	/** Attach the minimap's elements (shown) or null (hidden: the worker and tiles are freed). */
	attach(elements: MinimapElements | null): void {
		this.elements = elements;
		if (!elements) {
			if (!this.fullOpen) this.release();
			return;
		}
		this.dirty = true;
		this.arrowYaw = NaN;
		this.lastLabels = -Infinity;
		this.lastWorldCheck = -Infinity;
	}

	configure(options: { zoom: number; sizePx: number; grid: boolean }): void {
		const zoom = clampZoom(options.zoom);
		if (zoom !== this.zoom || options.sizePx !== this.sizePx || options.grid !== this.grid) {
			this.zoom = zoom;
			this.sizePx = options.sizePx;
			this.grid = options.grid;
			this.dirty = true;
			this.lastLabels = -Infinity;
		}
	}

	/**
	 * Called every frame while attached. `world` gives the world's map settings (read once a
	 * second to notice a changed world); `markers` is read ten times a second.
	 */
	update(
		now: number,
		x: number,
		z: number,
		yaw: number,
		world: () => MapWorldSettings,
		markers: () => MapMarker[]
	): void {
		const elements = this.elements;
		if (!elements) return;
		const start = performance.now();
		if (now - this.lastWorldCheck >= WORLD_CHECK_MS) {
			this.lastWorldCheck = now;
			this.ensureClient(world());
		}
		const view = minimapViewport(this.zoom, this.sizePx, x, z);
		const pxPerMetre = view.scale / metresPerPixel(view.level);
		if (
			Number.isNaN(this.paintedX) ||
			Math.abs(x - this.paintedX) * pxPerMetre >= 0.5 ||
			Math.abs(z - this.paintedZ) * pxPerMetre >= 0.5
		)
			this.dirty = true;
		if (now - this.lastMarkers >= MARKER_INTERVAL_MS) {
			this.lastMarkers = now;
			const next = markers();
			if (next.length || this.markers.length) this.dirty = true;
			this.markers = next;
		}
		if (this.dirty && now - this.lastPaint >= PAINT_INTERVAL_MS && this.client) {
			this.client.want(wantedTiles(this.client, view));
			this.paint(elements.canvas, view, x, z);
			this.dirty = false;
			this.lastPaint = now;
			this.paintedX = x;
			this.paintedZ = z;
			this.cost.paints++;
		}
		// North up: the arrow turns with the player (yaw 0 faces −Z, up; positive yaw turns left).
		if (Number.isNaN(this.arrowYaw) || Math.abs(yaw - this.arrowYaw) > 0.004) {
			this.arrowYaw = yaw;
			elements.arrow.style.transform = `translate(-50%, -50%) rotate(${(-yaw * 180) / Math.PI}deg)`;
		}
		if (now - this.lastLabels >= LABEL_INTERVAL_MS) {
			this.lastLabels = now;
			elements.coordinates.textContent = formatMapCoordinates(x, z);
			elements.scaleLabel.textContent = formatMapWidth(MINIMAP_ZOOM_METRES[this.zoom]);
		}
		const ms = performance.now() - start;
		this.cost.frames++;
		this.cost.totalMs += ms;
		this.cost.maxMs = Math.max(this.cost.maxMs, ms);
	}

	private paint(canvas: HTMLCanvasElement, view: MapViewport, x: number, z: number): void {
		const dpr = Math.min(2, window.devicePixelRatio || 1);
		const backing = Math.round(view.width * dpr);
		if (canvas.width !== backing) {
			canvas.width = backing;
			canvas.height = backing;
		}
		const ctx = canvas.getContext('2d');
		if (!ctx || !this.client) return;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.fillStyle = '#26302a';
		ctx.fillRect(0, 0, view.width, view.height);
		ctx.imageSmoothingEnabled = true;
		paintView(ctx as unknown as MapPainter<ImageBitmap>, this.client, view);
		const metresAcross = MINIMAP_ZOOM_METRES[this.zoom];
		const pxPerMetre = view.width / metresAcross;
		const half = view.width / 2;
		const toScreen = (wx: number, wz: number) => [
			(wx - x) * pxPerMetre + half,
			(wz - z) * pxPerMetre + half
		];
		if (this.grid) {
			const step = gridSpacing(metresAcross);
			ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
			ctx.lineWidth = 1;
			ctx.beginPath();
			const left = x - metresAcross / 2,
				top = z - metresAcross / 2;
			for (let gx = Math.ceil(left / step) * step; gx <= left + metresAcross; gx += step) {
				const sx = Math.round((gx - x) * pxPerMetre + half) + 0.5;
				ctx.moveTo(sx, 0);
				ctx.lineTo(sx, view.height);
			}
			for (let gz = Math.ceil(top / step) * step; gz <= top + metresAcross; gz += step) {
				const sy = Math.round((gz - z) * pxPerMetre + half) + 0.5;
				ctx.moveTo(0, sy);
				ctx.lineTo(view.width, sy);
			}
			ctx.stroke();
		}
		// Markers: waypoints as diamonds, players as dots. Off-map ones sit on the rim.
		const rim = half - 6;
		for (const marker of this.markers) {
			let [sx, sy] = toScreen(marker.x, marker.z);
			const dx = sx - half,
				dy = sy - half;
			const d = Math.hypot(dx, dy);
			const outside = d > rim;
			if (outside) {
				sx = half + (dx / d) * rim;
				sy = half + (dy / d) * rim;
			}
			ctx.globalAlpha = marker.dim ? 0.45 : outside ? 0.8 : 1;
			ctx.fillStyle = marker.colour;
			ctx.strokeStyle = 'rgba(8, 14, 10, 0.85)';
			ctx.lineWidth = 1.5;
			ctx.beginPath();
			if (marker.kind === 'waypoint') {
				const r = outside ? 4 : 5;
				ctx.moveTo(sx, sy - r);
				ctx.lineTo(sx + r, sy);
				ctx.lineTo(sx, sy + r);
				ctx.lineTo(sx - r, sy);
				ctx.closePath();
			} else ctx.arc(sx, sy, outside ? 3 : 4, 0, Math.PI * 2);
			ctx.fill();
			ctx.stroke();
		}
		ctx.globalAlpha = 1;
	}

	/** Starts the worker for a world, or restarts it when the world's settings changed. */
	private ensureClient(settings: MapWorldSettings): BiomeMapClient {
		const key = JSON.stringify(settings);
		if (!this.client) {
			this.client = this.createClient();
			this.client.onTile = () => {
				this.dirty = true;
				this.onTile?.();
			};
		}
		if (key !== this.worldKey) {
			this.worldKey = key;
			this.client.init(settings);
			this.dirty = true;
		}
		return this.client;
	}

	/** Also told when a tile arrives (the full map repaints). */
	onTile: (() => void) | null = null;

	/** The full map opened: returns the shared tile client (started if the minimap is off). */
	openFull(settings: MapWorldSettings): BiomeMapClient {
		this.fullOpen = true;
		return this.ensureClient(settings);
	}

	/** The full map closed: the worker stops too unless the minimap is showing. */
	closeFull(): void {
		this.fullOpen = false;
		this.onTile = null;
		if (!this.elements) this.release();
	}

	private release(): void {
		this.client?.dispose();
		this.client = null;
		this.worldKey = '';
	}

	/** Frees the worker and tiles (the world closed). */
	dispose(): void {
		this.fullOpen = false;
		this.elements = null;
		this.release();
	}
}
