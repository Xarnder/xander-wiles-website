import type { Bounds2D, HydrologySettings, LakeDefinition } from './HydrologyTypes';

const CELL_BIAS = 1_048_576;
const CELL_SPAN = 4_194_304;

export function clamp(value: number, min: number, max: number): number {
	return value < min ? min : value > max ? max : value;
}

export function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * t;
}

export function smooth01(t: number): number {
	const x = t < 0 ? 0 : t > 1 ? 1 : t;
	return x * x * (3 - 2 * x);
}

/** Floor division that stays correct for negative world coordinates. */
export function floorDiv(value: number, size: number): number {
	return Math.floor(value / size);
}

/** Packs two integer cell coordinates into one safe JS number key. */
export function packCell(cx: number, cz: number): number {
	return (cx + CELL_BIAS) * CELL_SPAN + (cz + CELL_BIAS);
}

export function unpackCell(key: number): { cx: number; cz: number } {
	return {
		cx: Math.floor(key / CELL_SPAN) - CELL_BIAS,
		cz: (key % CELL_SPAN) - CELL_BIAS
	};
}

export function regionKey(rx: number, rz: number): string {
	return `${rx},${rz}`;
}

export function emptyBounds(): Bounds2D {
	return {
		minX: Number.POSITIVE_INFINITY,
		minZ: Number.POSITIVE_INFINITY,
		maxX: Number.NEGATIVE_INFINITY,
		maxZ: Number.NEGATIVE_INFINITY
	};
}

export function includePoint(bounds: Bounds2D, x: number, z: number): void {
	if (x < bounds.minX) bounds.minX = x;
	if (z < bounds.minZ) bounds.minZ = z;
	if (x > bounds.maxX) bounds.maxX = x;
	if (z > bounds.maxZ) bounds.maxZ = z;
}

export function boundsOverlap(a: Bounds2D, b: Bounds2D, margin: number): boolean {
	return (
		a.minX - margin <= b.maxX &&
		a.maxX + margin >= b.minX &&
		a.minZ - margin <= b.maxZ &&
		a.maxZ + margin >= b.minZ
	);
}

export function lakeRadiusAt(lake: LakeDefinition, angle: number): number {
	const wave =
		1 +
		lake.a1 * Math.sin(angle * 2 + lake.p1) +
		lake.a2 * Math.sin(angle * 3 + lake.p2) +
		lake.a3 * Math.sin(angle * 5 + lake.p3);
	return lake.baseRadius * Math.max(0.62, wave);
}

/** Largest radius the harmonics can produce. Used to insert the lake into every cell it can affect. */
export function lakeMaxRadius(lake: LakeDefinition): number {
	return lake.baseRadius * (1 + lake.a1 + lake.a2 + lake.a3);
}

export function pointInLake(lake: LakeDefinition, x: number, z: number): number {
	const dx = x - lake.x;
	const dz = z - lake.z;
	const radial = Math.hypot(dx, dz);
	const radius = lakeRadiusAt(lake, Math.atan2(dz, dx));
	return radius > 1e-4 ? radial / radius : 99;
}

/** Metres outside a lake's shoreline along its radius (negative inside the lake). */
export function distanceOutsideLake(lake: LakeDefinition, x: number, z: number): number {
	const dx = x - lake.x;
	const dz = z - lake.z;
	return Math.hypot(dx, dz) - lakeRadiusAt(lake, Math.atan2(dz, dx));
}

/**
 * A river sample this close (m) outside its lake's shore is the river mouth: it sits on the lake
 * level, so the ribbon's last stretch before the shoreline is flat with the lake surface.
 */
export const LAKE_MOUTH_REACH = 10;
/** Samples over which a river arriving above its lake eases down onto it. */
export const LAKE_APPROACH_SAMPLES = 5;

/**
 * Leading samples of an outlet that sit on its lake: every sample inside the shore, plus the mouth
 * sample just outside it. 0 when the river does not start on the lake.
 */
export function outletLakeSpan(
	points: readonly { x: number; z: number }[],
	lake: LakeDefinition
): number {
	let i = 0;
	while (i < points.length && distanceOutsideLake(lake, points[i].x, points[i].z) <= 0) i++;
	if (i < points.length && distanceOutsideLake(lake, points[i].x, points[i].z) <= LAKE_MOUTH_REACH)
		i++;
	return i;
}

/**
 * First sample of a river's final stretch on its sink lake: the run of samples inside the shore,
 * plus the mouth sample just outside it. `points.length` when the river never reaches the lake.
 */
export function sinkLakeStart(
	points: readonly { x: number; z: number }[],
	lake: LakeDefinition
): number {
	let i = points.length;
	while (i > 0 && distanceOutsideLake(lake, points[i - 1].x, points[i - 1].z) <= 0) i--;
	if (i === points.length) return i;
	if (i > 0 && distanceOutsideLake(lake, points[i - 1].x, points[i - 1].z) <= LAKE_MOUTH_REACH) i--;
	return i;
}

/**
 * Puts a river's mouth on its lake so the two surfaces meet at one height. Samples from `lockStart`
 * on sit exactly on the lake level, and a river arriving above the lake eases down over the last
 * few samples rather than stepping onto it. (A river arriving below cannot climb: the lake is
 * lowered to it instead — see `HydrologySystem`.)
 */
export function meetSinkLake(
	samples: { waterY: number }[],
	lockStart: number,
	level: number
): void {
	if (lockStart >= samples.length) return;
	for (let i = lockStart; i < samples.length; i++) samples[i].waterY = level;
	const start = lockStart;
	const from = Math.max(0, start - LAKE_APPROACH_SAMPLES);
	const top = samples[from].waterY;
	if (top > level) {
		for (let i = from + 1; i < start; i++) {
			const s = smooth01((i - from) / (start - from));
			samples[i].waterY = Math.min(samples[i].waterY, top + (level - top) * s);
		}
	}
}

/**
 * Channel, beach shelf, grass bank, and valley distances from the centreline.
 * The beach sits inside the bank, so the valley reach — and the spatial index — stay the same.
 */
export function riverBands(
	width: number,
	bankScale: number
): { half: number; beachEnd: number; bank: number; valley: number } {
	const half = Math.max(0.8, width * 0.5);
	const bank = half + (2.4 + width * 0.5) * bankScale;
	const valley = bank + (4 + width * 2.1) * bankScale;
	const room = Math.max(0, bank - half);
	const span = Math.min(room * 0.55, 1.7, Math.max(0.9, room * 0.42));
	return { half, beachEnd: half + Math.min(span, room), bank, valley };
}

/**
 * How far from the centreline a river of this width still changes terrain.
 * Indexing and carving must use the same reach or a vertex could miss a river that still shapes it.
 */
export function riverReach(width: number, bankScale: number): number {
	return riverBands(width, bankScale).valley;
}

/** Water mesh sits this far above the logical surface so it does not z-fight the bed. */
export const RIVER_SURFACE_LIFT = 0.08;
/**
 * Lake surface lift. The same as the river's, so where a river runs onto its lake the two sheets
 * are one level instead of showing a step.
 */
export const LAKE_SURFACE_LIFT = RIVER_SURFACE_LIFT;

/**
 * Minimum height of the dry bank above the logical water level. Must clear `RIVER_SURFACE_LIFT`,
 * or the ribbon draws over ground that is still below it.
 */
export const RIVER_BANK_CLEARANCE = 0.55;

/**
 * Lateral reach of the river ribbon: far enough to meet the bank lip, and no further, so the
 * sheet does not hang over the next dip. Indexing still uses the wider valley.
 */
export function riverWaterEdge(width: number, bankScale: number): number {
	const { half, beachEnd } = riverBands(width, bankScale);
	return Math.min(beachEnd, half + 0.85);
}

function shoreHash(ix: number, iz: number): number {
	let h = Math.imul(ix | 0, 0x27d4eb2d) ^ Math.imul(iz | 0, 0x165667b1);
	h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
	h ^= h >>> 13;
	return (h >>> 0) / 4294967296;
}

/** Smooth value noise in [0, 1]. Sampled on the centreline so both banks of a stretch agree. */
function shoreNoise(x: number, z: number): number {
	const x0 = Math.floor(x);
	const z0 = Math.floor(z);
	const tx = smooth01(x - x0);
	const tz = smooth01(z - z0);
	const a = shoreHash(x0, z0);
	const b = shoreHash(x0 + 1, z0);
	const c = shoreHash(x0, z0 + 1);
	const d = shoreHash(x0 + 1, z0 + 1);
	return lerp(lerp(a, b, tx), lerp(c, d, tz), tz);
}

/**
 * 0 = mud, 1 = stone. Broad patches follow the river, with a shorter octave so a stretch is not
 * one flat material. Steep grades lean stone; wide, slow rivers lean mud.
 */
export function riverEdgeStone(
	centerX: number,
	centerZ: number,
	grade: number,
	width: number
): number {
	const broad = shoreNoise(centerX / 34, centerZ / 34);
	const detail = shoreNoise(centerX / 11 + 4.2, centerZ / 11 - 2.7);
	const steep = smooth01((grade - 0.012) / 0.06);
	const wide = smooth01((width - 2.2) / 8);
	const stone = clamp((broad * 0.8 + detail * 0.2) * 0.86 + steep * 0.28 - wide * 0.22, 0, 1);
	return smooth01((stone - 0.2) / 0.6);
}

/** How much of the beach material shows. Peaks on the shelf, fades into the shallows and the grass. */
export function riverBeachCover(signed: number, span: number): number {
	if (span < 0.05) return 0;
	const inner = -0.4;
	const fade = Math.min(0.85, Math.max(0.35, span * 0.65));
	if (signed < inner - 0.15 || signed > span + fade) return 0;
	const onto = smooth01((signed - inner) / 0.5);
	const off = 1 - smooth01((signed - span) / fade);
	return onto * off;
}

export function widthForFlow(flow: number, settings: HydrologySettings): number {
	const t = 1 - Math.exp(-Math.max(0, flow) * 0.28);
	return lerp(settings.minRiverWidth, settings.maxRiverWidth, t);
}

export function depthForFlow(flow: number, settings: HydrologySettings): number {
	const t = 1 - Math.exp(-Math.max(0, flow) * 0.28);
	return (0.75 + 1.6 * t) * settings.riverDepthScale;
}

export function clampedHydrology(settings: HydrologySettings): {
	regionSize: number;
	gridSpacing: number;
	sourceSpacing: number;
	maxTravel: number;
} {
	const regionSize = clamp(settings.regionSize, 768, 4096);
	const gridSpacing = clamp(settings.gridSpacing, 32, 96);
	const sourceSpacing = clamp(settings.sourceSpacing, 160, 800);
	return { regionSize, gridSpacing, sourceSpacing, maxTravel: regionSize * 0.92 };
}

/** Catmull-Rom component. Endpoints are duplicated by the caller so the curve stays on the path. */
export function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
	const t2 = t * t;
	const t3 = t2 * t;
	return (
		0.5 *
		(2 * p1 +
			(-p0 + p2) * t +
			(2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
			(-p0 + 3 * p1 - 3 * p2 + p3) * t3)
	);
}
