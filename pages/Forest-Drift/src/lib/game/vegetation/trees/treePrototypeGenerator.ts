import { createMulberry32, hashStringToUint32 } from '../../terrain/seededRandom';
import {
	addBlob,
	addLathe,
	addTier,
	addTube,
	hexToLinear,
	mixRgb,
	smooth01,
	TreeMeshBuilder,
	type Rgb,
	type TubePoint,
	type Vec3,
	type VertexShade
} from './treeMeshKit';
import type {
	BlobCanopyRules,
	Range,
	SpindleCanopyRules,
	TieredCanopyRules,
	TreeLod,
	TreeMeshData,
	TreeSpeciesDefinition
} from './TreeSpeciesTypes';
import { TREE_SURFACE_CODES } from './TreeSpeciesTypes';

/** How far trunks extend below y = 0, so a tree on a slope never shows a floating base. */
export const TRUNK_SINK = 0.35;

/**
 * A prototype DESIGN: every random choice for one (species, variant), made once. Each LOD is then
 * a tessellation of the same design, so LODs share a silhouette and switching between them barely
 * pops.
 */
export interface TreeDesign {
	trunkHeight: number;
	trunkRadius: number;
	trunkTop: Vec3;
	/** Bend control point (quadratic) for the trunk centre line. */
	trunkBend: Vec3;
	canopyCenter: Vec3;
	canopyRadii: Vec3;
	clusters: { center: Vec3; radii: Vec3; seed: number }[];
	branches: { from: number; to: Vec3 }[];
	tiers: { baseY: number; apexY: number; radius: number; droop: number; rotation: number }[];
	spindle: { profile: { y: number; radius: number }[]; apexY: number } | null;
	palette: { dark: Rgb; base: Rgb; light: Rgb; trunkDark: Rgb; trunk: Rgb };
	seed: number;
	totalHeight: number;
}

function pick(random: () => number, range: Range): number {
	return range[0] + random() * (range[1] - range[0]);
}

function pickInt(random: () => number, range: Range): number {
	return Math.round(pick(random, range));
}

/** Deterministic seed for one prototype design. Depends only on world seed, species and variant. */
export function prototypeSeed(worldSeed: string, speciesId: string, variant: number): number {
	return hashStringToUint32(`${worldSeed}::tree-prototype::${speciesId}::${variant}`) >>> 0;
}

export function designTree(
	species: TreeSpeciesDefinition,
	variant: number,
	worldSeed: string
): TreeDesign {
	const seed = prototypeSeed(worldSeed, species.id, variant);
	const random = createMulberry32(seed);
	const trunkRules = species.trunk;
	const trunkHeight = pick(random, trunkRules.height);
	const trunkRadius = pick(random, trunkRules.radius);
	const bendAmount = pick(random, trunkRules.bend);
	const bendAngle = random() * Math.PI * 2;

	const style = species.style;
	const alternates = style.alternateFoliage ?? [];
	// The last variant of a species with alternate palettes uses one (e.g. an autumn ornamental).
	const alternate =
		alternates.length > 0 && variant === species.prototypeCount - 1 ? alternates[0] : null;
	const palette = {
		dark: hexToLinear(alternate?.dark ?? style.foliageDark),
		base: hexToLinear(alternate?.base ?? style.foliage),
		light: hexToLinear(alternate?.light ?? style.foliageLight),
		trunkDark: hexToLinear(style.trunkDark),
		trunk: hexToLinear(style.trunk)
	};

	const design: TreeDesign = {
		trunkHeight,
		trunkRadius,
		trunkTop: [0, trunkHeight, 0],
		trunkBend: [0, trunkHeight * 0.5, 0],
		canopyCenter: [0, 0, 0],
		canopyRadii: [1, 1, 1],
		clusters: [],
		branches: [],
		tiers: [],
		spindle: null,
		palette,
		seed,
		totalHeight: trunkHeight
	};

	const canopy = species.canopy;
	const canopyHeight =
		canopy.kind === 'blobs'
			? designBlobs(design, canopy, random)
			: canopy.kind === 'tiers'
				? designTiers(design, canopy, random)
				: designSpindle(design, canopy, random);

	// The trunk leans gently toward the canopy and continues partway into it.
	const lean = bendAmount * trunkHeight;
	const topY = trunkHeight + canopyHeight * trunkRules.extendIntoCanopy * 0.5;
	design.trunkTop = [Math.cos(bendAngle) * lean, topY, Math.sin(bendAngle) * lean];
	design.trunkBend = [
		Math.cos(bendAngle) * lean * 0.15,
		topY * 0.5,
		Math.sin(bendAngle) * lean * 0.15
	];
	const shift = (p: Vec3, amount: number): Vec3 => [
		p[0] + design.trunkTop[0] * amount,
		p[1],
		p[2] + design.trunkTop[2] * amount
	];
	design.canopyCenter = shift(design.canopyCenter, 1);
	design.clusters = design.clusters.map((c) => ({ ...c, center: shift(c.center, 1) }));

	const branchCount = pickInt(random, trunkRules.branches);
	for (let b = 0; b < branchCount && design.clusters.length > 1; b++) {
		const target = design.clusters[1 + (b % (design.clusters.length - 1))];
		design.branches.push({
			from: 0.55 + random() * 0.3,
			to: [
				design.trunkTop[0] + (target.center[0] - design.trunkTop[0]) * 0.75,
				target.center[1] - target.radii[1] * 0.25,
				design.trunkTop[2] + (target.center[2] - design.trunkTop[2]) * 0.75
			]
		});
	}
	return design;
}

function designBlobs(design: TreeDesign, rules: BlobCanopyRules, random: () => number): number {
	const width = pick(random, rules.width);
	const height = pick(random, rules.height);
	const centerY = design.trunkHeight + height * pick(random, rules.verticalOffset);
	design.canopyCenter = [0, centerY, 0];
	design.canopyRadii = [width / 2, height / 2, width / 2];
	const count = pickInt(random, rules.clusterCount);
	// One crown cluster on top, the rest in a jittered ring — reads as a rounded, slightly irregular crown.
	const ringStart = random() * Math.PI * 2;
	for (let i = 0; i < count; i++) {
		const scale = pick(random, rules.clusterScale) * width;
		const squash = pick(random, rules.squash);
		let center: Vec3;
		if (i === 0) {
			center = [
				(random() - 0.5) * width * 0.1,
				centerY + height * 0.18,
				(random() - 0.5) * width * 0.1
			];
		} else {
			const angle =
				ringStart + ((i - 1) / Math.max(1, count - 1)) * Math.PI * 2 + (random() - 0.5) * 0.5;
			const ring = width * (0.22 + random() * 0.1);
			center = [
				Math.cos(angle) * ring,
				centerY - height * (0.02 + random() * 0.14),
				Math.sin(angle) * ring
			];
		}
		design.clusters.push({
			center,
			radii: [scale * (0.95 + random() * 0.1), scale * squash, scale * (0.95 + random() * 0.1)],
			seed: (design.seed + i * 7919) >>> 0
		});
	}
	// The canopy volume is the clusters' real extent (they can bulge past the nominal width), so
	// shading normals and the far-LOD hull match what LOD0 actually looks like.
	const min = [Infinity, Infinity, Infinity];
	const max = [-Infinity, -Infinity, -Infinity];
	for (const cluster of design.clusters) {
		for (let k = 0; k < 3; k++) {
			min[k] = Math.min(min[k], cluster.center[k] - cluster.radii[k]);
			max[k] = Math.max(max[k], cluster.center[k] + cluster.radii[k]);
		}
	}
	design.canopyCenter = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
	design.canopyRadii = [(max[0] - min[0]) / 2, (max[1] - min[1]) / 2, (max[2] - min[2]) / 2];
	design.totalHeight = max[1];
	return height;
}

function designTiers(design: TreeDesign, rules: TieredCanopyRules, random: () => number): number {
	const count = pickInt(random, rules.tierCount);
	const baseRadius = pick(random, rules.baseRadius);
	const height = pick(random, rules.height);
	const base = design.trunkHeight;
	const step = height / count;
	for (let i = 0; i < count; i++) {
		const t = i / count;
		const radius = baseRadius * Math.pow(1 - t, 0.85) * (0.92 + random() * 0.16) + 0.15;
		const baseY = base + i * step;
		const apexY = Math.min(base + height, baseY + step * (1 + rules.overlap) + radius * 0.35);
		design.tiers.push({
			baseY,
			apexY,
			radius,
			droop: pick(random, rules.droop) * (1 - t * 0.6),
			rotation: random() * Math.PI
		});
	}
	design.canopyCenter = [0, base + height * 0.4, 0];
	design.canopyRadii = [baseRadius, height / 2, baseRadius];
	design.totalHeight = base + height;
	return height;
}

function designSpindle(
	design: TreeDesign,
	rules: SpindleCanopyRules,
	random: () => number
): number {
	const height = pick(random, rules.height);
	const radius = pick(random, rules.radius);
	const widestAt = pick(random, rules.widestAt);
	const bulges = pickInt(random, rules.bulges);
	const bulgePhase = random() * Math.PI * 2;
	const base = design.trunkHeight * 0.6;
	const samples = 32;
	const profile: { y: number; radius: number }[] = [];
	for (let i = 0; i <= samples; i++) {
		const t = i / samples;
		const envelope =
			t < widestAt
				? 0.55 + 0.45 * Math.sin((t / widestAt) * (Math.PI / 2))
				: Math.pow(Math.cos(((t - widestAt) / (1 - widestAt)) * (Math.PI / 2)), 0.85);
		const bulge = 1 + 0.07 * Math.sin(t * bulges * Math.PI * 2 + bulgePhase);
		profile.push({
			y: base + t * height * 0.97,
			radius: Math.max(0.05, radius * envelope * bulge)
		});
	}
	design.spindle = { profile, apexY: base + height };
	design.canopyCenter = [0, base + height * 0.4, 0];
	design.canopyRadii = [radius, height / 2, radius];
	design.totalHeight = base + height;
	return height;
}

/** Tessellation choices per LOD — the only thing that differs between a prototype's LODs. */
interface LodTessellation {
	trunkSides: number;
	trunkSegments: number;
	/** Root buttresses flaring out of the trunk base (near LOD only). */
	roots: boolean;
	/** Limbs from the trunk into the crown: sides per limb (0 = none). */
	branchSides: number;
	/** Cluster core subdivision (icosphere detail). */
	blobDetail: number;
	/** Smaller clumps bulging from each cluster (0 = plain clusters) and their subdivision. */
	clumps: number;
	clumpDetail: number;
	/** Second, finer octave of lumps on clusters and spindles (fraction of the lumpiness). */
	fineLumps: number;
	/** The silhouette LOD replaces the clusters with one lumpy hull blob of this subdivision. */
	hull: boolean;
	hullDetail: number;
	tierPoints: number;
	/** Profile rings of each conifer tier between apex and rim. */
	tierRings: readonly { fraction: number; height: number }[];
	tierUnderRing: boolean;
	tierJitter: number;
	maxTiers: number;
	latheSides: number;
	latheRings: number;
	/** Scales crown clusters and clumps about their centres (shadow proxies sit just inside). */
	crownScale: number;
}

/**
 * Near trees carry real detail — smooth clustered crowns, ragged conifer tiers, buttressed trunks
 * and limbs — and each farther LOD drops roughly 3–4× of it while keeping the same silhouette, so
 * the forest reads as the same trees at every distance (a far pine is still a stack of tiers, a far
 * oak a lumpy crown) instead of collapsing to cones and balls.
 */
const TESSELLATION: Readonly<Record<TreeLod, LodTessellation>> = {
	0: {
		trunkSides: 10,
		trunkSegments: 8,
		roots: true,
		branchSides: 6,
		blobDetail: 2,
		clumps: 4,
		clumpDetail: 2,
		fineLumps: 0.7,
		hull: false,
		hullDetail: 0,
		tierPoints: 13,
		tierRings: [
			{ fraction: 0.3, height: 0.72 },
			{ fraction: 0.64, height: 0.38 }
		],
		tierUnderRing: true,
		tierJitter: 0.14,
		maxTiers: 99,
		latheSides: 16,
		latheRings: 24,
		crownScale: 1
	},
	1: {
		trunkSides: 7,
		trunkSegments: 4,
		roots: false,
		branchSides: 4,
		blobDetail: 1,
		clumps: 4,
		clumpDetail: 1,
		fineLumps: 0,
		hull: false,
		hullDetail: 0,
		tierPoints: 9,
		tierRings: [{ fraction: 0.55, height: 0.42 }],
		tierUnderRing: false,
		tierJitter: 0.12,
		maxTiers: 6,
		latheSides: 11,
		latheRings: 12,
		crownScale: 1
	},
	2: {
		trunkSides: 5,
		trunkSegments: 2,
		roots: false,
		branchSides: 0,
		blobDetail: 1,
		clumps: 0,
		clumpDetail: 0,
		fineLumps: 0,
		hull: false,
		hullDetail: 0,
		tierPoints: 7,
		tierRings: [],
		tierUnderRing: false,
		tierJitter: 0.1,
		maxTiers: 5,
		latheSides: 8,
		latheRings: 6,
		crownScale: 1
	},
	3: {
		trunkSides: 4,
		trunkSegments: 1,
		roots: false,
		branchSides: 0,
		blobDetail: 0,
		clumps: 0,
		clumpDetail: 0,
		fineLumps: 0,
		hull: true,
		hullDetail: 1,
		tierPoints: 6,
		tierRings: [],
		tierUnderRing: false,
		tierJitter: 0,
		maxTiers: 4,
		latheSides: 6,
		latheRings: 4,
		crownScale: 1
	}
};

/**
 * Builds one LOD of a prototype as a single merged mesh: trunk + branches + foliage, with baked
 * stylised shading in vertex colours (bark gradient, canopy top-light / underside-dark gradient,
 * interior occlusion) and a wind weight per vertex. Pure and deterministic.
 */
export function buildTreeMesh(
	species: TreeSpeciesDefinition,
	design: TreeDesign,
	lod: TreeLod
): TreeMeshData {
	return buildWith(species, design, TESSELLATION[lod]);
}

/**
 * The shadow caster for a LOD: the same crown one subdivision coarser, with a plain trunk and no
 * limbs, at about a quarter of the triangles. A coarser icosphere's vertices are a subset of the
 * finer one's (same lumps), and its facets lie inside, so — shrunk a little more — the proxy stays
 * just inside the visible crown: it never shadows the crown's own lit side, and its ground shadow
 * is indistinguishable. Only clustered (broadleaf) crowns get one: conifer tiers merge differently
 * per LOD, so a coarser stack would poke out of the visible one, and conifers are cheap already.
 * Returns null when the LOD casts with its own geometry (or never casts).
 */
export function buildTreeShadowProxy(
	species: TreeSpeciesDefinition,
	design: TreeDesign,
	lod: TreeLod
): TreeMeshData | null {
	// LOD2+ never cast (`lodCastsShadow`), so they need no proxy.
	const tess = TESSELLATION[lod];
	if (species.canopy.kind !== 'blobs' || lod >= 2 || tess.blobDetail === 0) return null;
	return buildWith(species, design, {
		...tess,
		trunkSides: 5,
		trunkSegments: 2,
		roots: false,
		branchSides: 0,
		blobDetail: tess.blobDetail - 1,
		clumpDetail: Math.max(0, tess.clumpDetail - 1),
		crownScale: 0.95
	});
}

function buildWith(
	species: TreeSpeciesDefinition,
	design: TreeDesign,
	tess: LodTessellation
): TreeMeshData {
	const builder = new TreeMeshBuilder();
	const total = design.totalHeight;
	const windResponse = species.windResponse;
	const barkCode = TREE_SURFACE_CODES[species.surface.bark];

	buildTrunk(builder, species, design, tess, total, barkCode);

	const canopy = species.canopy;
	const leafCode = TREE_SURFACE_CODES[species.surface.foliage];
	if (canopy.kind === 'blobs')
		buildBlobCanopy(builder, canopy, design, tess, total, windResponse, leafCode);
	else if (canopy.kind === 'tiers')
		buildTierCanopy(builder, canopy, design, tess, total, windResponse, leafCode);
	else buildSpindleCanopy(builder, canopy, design, tess, total, windResponse, leafCode);

	return builder.build();
}

/** Trunk (with root buttresses near) and the limbs reaching into the crown. */
function buildTrunk(
	builder: TreeMeshBuilder,
	species: TreeSpeciesDefinition,
	design: TreeDesign,
	tess: LodTessellation,
	total: number,
	barkCode: number
): void {
	const palette = design.palette;
	const windResponse = species.windResponse;
	const path: TubePoint[] = [];
	const segments = tess.trunkSegments;
	const top = design.trunkTop;
	const bend = design.trunkBend;
	for (let i = 0; i <= segments; i++) {
		const t = i / segments;
		// Quadratic Bézier from the sunk base through the bend point to the top.
		const a = (1 - t) * (1 - t);
		const b = 2 * (1 - t) * t;
		const c = t * t;
		const position: Vec3 = [
			b * bend[0] + c * top[0],
			a * -TRUNK_SINK + b * bend[1] + c * top[1],
			b * bend[2] + c * top[2]
		];
		// Root flare near the ground, then the species taper.
		const flare = 1 + 0.35 * (1 - smooth01(0, 0.18, t));
		const radius = design.trunkRadius * (1 - (1 - species.trunk.taper) * t) * flare;
		path.push({ position, radius });
	}
	// Five-ish buttresses spreading into the ground, fading out by a sixth of the way up.
	const rootCount = 4 + (design.seed % 3);
	const rootPhase = ((design.seed >>> 8) % 628) / 100;
	const roots = tess.roots
		? (t: number, angle: number) =>
				1 +
				0.32 *
					Math.pow(Math.max(0, Math.cos(angle * rootCount + rootPhase)), 3) *
					(1 - smooth01(0.02, 0.2, t))
		: undefined;
	addTube(
		builder,
		path,
		tess.trunkSides,
		(t, _angle, position) => trunkShade(palette, t, position, total, windResponse, barkCode),
		0,
		roots
	);

	if (tess.branchSides > 0) {
		for (const branch of design.branches) {
			const startY = design.trunkHeight * branch.from;
			const start: Vec3 = [
				design.trunkTop[0] * branch.from,
				startY,
				design.trunkTop[2] * branch.from
			];
			const mid: Vec3 = [
				(start[0] + branch.to[0]) / 2,
				(start[1] + branch.to[1]) / 2 + 0.25,
				(start[2] + branch.to[2]) / 2
			];
			const radius = design.trunkRadius * species.trunk.taper * 0.75;
			addTube(
				builder,
				[
					{ position: start, radius },
					{ position: mid, radius: radius * 0.75 },
					{ position: branch.to, radius: radius * 0.45 }
				],
				tess.branchSides,
				(t, _angle, position) =>
					trunkShade(palette, 0.5 + t * 0.5, position, total, windResponse, barkCode)
			);
		}
	}
}

function trunkShade(
	palette: TreeDesign['palette'],
	t: number,
	position: Vec3,
	total: number,
	windResponse: number,
	surface: number
): VertexShade {
	// Darker, damp base; lighter bark higher up. Below ground stays dark.
	const color = mixRgb(palette.trunkDark, palette.trunk, smooth01(-0.05, 0.6, t));
	const h = Math.max(0, position[1]) / total;
	return { color, wind: h * h * 0.35 * windResponse, surface };
}

/** Stylised foliage shading: vertical gradient, sunlit top, occluded interior and underside. */
function foliageShade(
	palette: TreeDesign['palette'],
	position: Vec3,
	outward: number,
	design: TreeDesign,
	total: number,
	windResponse: number,
	surface: number,
	underside = false
): VertexShade {
	const relativeHeight =
		(position[1] - (design.canopyCenter[1] - design.canopyRadii[1])) / (design.canopyRadii[1] * 2);
	let color = mixRgb(palette.dark, palette.base, smooth01(0.05, 0.55, relativeHeight));
	color = mixRgb(color, palette.light, smooth01(0.55, 1.05, relativeHeight) * 0.85);
	// Interior (near the canopy centre) and undersides are occluded.
	const occlusion = 0.55 + 0.45 * smooth01(0.35, 0.95, outward);
	// Undersides face the (blue) sky's opposite; keep them dark and green rather than pale.
	const under = underside ? 0.6 : 1;
	color = [
		color[0] * occlusion * under,
		color[1] * occlusion * under,
		color[2] * occlusion * under
	];
	const h = Math.max(0, position[1]) / total;
	return { color, wind: (0.35 + 0.65 * h * outward) * windResponse, surface };
}

/**
 * Smaller clumps bulging out of a cluster's outer, upper surface: they break a round cluster into
 * a cauliflower-like crown. Derived from the cluster's own seed (no design draws), so every LOD
 * that shows them places them identically. Clumps stay inside the cluster's envelope (core shrunk
 * to make room), so the crown's extent — and the far-LOD hull — is unchanged.
 */
function clumpsFor(
	design: TreeDesign,
	cluster: TreeDesign['clusters'][number],
	count: number
): { center: Vec3; radii: Vec3; seed: number }[] {
	const random = createMulberry32((cluster.seed ^ 0x9e3779b9) >>> 0);
	const c = design.canopyCenter;
	const away: Vec3 = [
		cluster.center[0] - c[0],
		(cluster.center[1] - c[1]) * 0.6 + design.canopyRadii[1] * 0.35,
		cluster.center[2] - c[2]
	];
	const awayLength = Math.hypot(away[0], away[1], away[2]) || 1;
	const clumps: { center: Vec3; radii: Vec3; seed: number }[] = [];
	const start = random() * Math.PI * 2;
	for (let k = 0; k < count; k++) {
		// Spread around the outward direction, tilted up: clumps crown the top and the outside.
		const angle = start + (k / count) * Math.PI * 2 + (random() - 0.5) * 0.8;
		const spread = 0.75 + random() * 0.35;
		const dir: Vec3 = [
			away[0] / awayLength + Math.cos(angle) * spread,
			away[1] / awayLength + 0.25 + (random() - 0.3) * 0.5,
			away[2] / awayLength + Math.sin(angle) * spread
		];
		const length = Math.hypot(dir[0], dir[1], dir[2]) || 1;
		const size = 0.4 + random() * 0.12;
		const reach = 0.98 - size;
		const r = cluster.radii;
		clumps.push({
			center: [
				cluster.center[0] + (dir[0] / length) * r[0] * reach,
				cluster.center[1] + (dir[1] / length) * r[1] * reach,
				cluster.center[2] + (dir[2] / length) * r[2] * reach
			],
			radii: [r[0] * size, r[1] * size, r[2] * size],
			seed: (cluster.seed + 104729 * (k + 1)) >>> 0
		});
	}
	return clumps;
}

function buildBlobCanopy(
	builder: TreeMeshBuilder,
	rules: BlobCanopyRules,
	design: TreeDesign,
	tess: LodTessellation,
	total: number,
	windResponse: number,
	leafCode: number
): void {
	const shade = (position: Vec3, outward: number) =>
		foliageShade(design.palette, position, outward, design, total, windResponse, leafCode);
	if (tess.hull) {
		// Silhouette LOD: the canopy hull as one lumpy blob with the same overall extent.
		const r = design.canopyRadii;
		const c = design.canopyCenter;
		addBlob(builder, {
			center: [c[0], c[1] + r[1] * 0.05, c[2]],
			radii: [r[0] * 0.98, r[1] * 0.95, r[2] * 0.98],
			detail: tess.hullDetail,
			lumpiness: rules.lumpiness * 1.6,
			seed: design.seed,
			canopyCenter: c,
			canopyRadii: r,
			normalBlend: 1,
			shade
		});
		return;
	}
	for (const cluster of design.clusters) {
		const core = (tess.clumps > 0 ? 0.86 : 1) * tess.crownScale;
		addBlob(builder, {
			center: cluster.center,
			radii: [cluster.radii[0] * core, cluster.radii[1] * core, cluster.radii[2] * core],
			detail: tess.blobDetail,
			lumpiness: rules.lumpiness,
			fineLumps: tess.fineLumps,
			seed: cluster.seed,
			canopyCenter: design.canopyCenter,
			canopyRadii: design.canopyRadii,
			normalBlend: 0.6,
			shade
		});
		for (const clump of clumpsFor(design, cluster, tess.clumps)) {
			addBlob(builder, {
				center: clump.center,
				radii: [
					clump.radii[0] * tess.crownScale,
					clump.radii[1] * tess.crownScale,
					clump.radii[2] * tess.crownScale
				],
				detail: tess.clumpDetail,
				lumpiness: rules.lumpiness * 1.4,
				seed: clump.seed,
				canopyCenter: design.canopyCenter,
				canopyRadii: design.canopyRadii,
				normalBlend: 0.45,
				shade
			});
		}
	}
}

function buildTierCanopy(
	builder: TreeMeshBuilder,
	rules: TieredCanopyRules,
	design: TreeDesign,
	tess: LodTessellation,
	total: number,
	windResponse: number,
	leafCode: number
): void {
	const tiers = design.tiers;
	const offset: [number, number] = [design.trunkTop[0] * 0.5, design.trunkTop[2] * 0.5];
	const shade = (position: Vec3, outward: number, underside: boolean) =>
		foliageShade(
			design.palette,
			position,
			0.45 + outward * 0.55,
			design,
			total,
			windResponse,
			leafCode,
			underside
		);
	// Fewer tiers at lower LODs: merge evenly across the same height span.
	const count = Math.min(tess.maxTiers, tiers.length);
	for (let i = 0; i < count; i++) {
		const startIndex = Math.floor((i * tiers.length) / count);
		const endIndex = Math.floor(((i + 1) * tiers.length) / count) - 1;
		const start = tiers[startIndex];
		const end = tiers[endIndex];
		addTier(builder, {
			baseY: start.baseY,
			apexY: end.apexY,
			radius: start.radius,
			points: tess.tierPoints,
			rimNotch: rules.rimNotch,
			droop: start.droop,
			rings: tess.tierRings,
			underRing: tess.tierUnderRing,
			tipJitter: tess.tierJitter,
			valleyShade: tess.tierRings.length > 0 ? 0.7 : 0.82,
			seed: (design.seed + startIndex * 7907) >>> 0,
			rotation: start.rotation,
			offset,
			shade
		});
	}
}

function buildSpindleCanopy(
	builder: TreeMeshBuilder,
	rules: SpindleCanopyRules,
	design: TreeDesign,
	tess: LodTessellation,
	total: number,
	windResponse: number,
	leafCode: number
): void {
	if (!design.spindle) return;
	const source = design.spindle.profile;
	const rings = tess.latheRings;
	const profile: { y: number; radius: number }[] = [];
	for (let i = 0; i < rings; i++) {
		const sourceIndex = Math.round((i / (rings - 1)) * (source.length - 2));
		profile.push(source[sourceIndex]);
	}
	addLathe(builder, {
		profile,
		sides: tess.latheSides,
		lumpiness: rules.lumpiness,
		fineLumps: tess.fineLumps,
		seed: design.seed,
		offset: [design.trunkTop[0] * 0.5, design.trunkTop[2] * 0.5],
		apexY: design.spindle.apexY,
		shade: (position, _t, normal) => {
			const outward = 0.55 + 0.45 * Math.max(0, Math.hypot(normal[0], normal[2]));
			return foliageShade(
				design.palette,
				position,
				outward,
				design,
				total,
				windResponse,
				leafCode,
				normal[1] < -0.5
			);
		}
	});
}
