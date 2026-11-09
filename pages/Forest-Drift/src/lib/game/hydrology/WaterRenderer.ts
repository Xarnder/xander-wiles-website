import * as THREE from 'three';
import {
	lakeRadiusAt,
	LAKE_SURFACE_LIFT,
	RIVER_SURFACE_LIFT,
	riverWaterEdge
} from './HydrologyMath';
import type { HydrologySystem } from './HydrologySystem';
import {
	createHydrologySample,
	type HydrologySample,
	type HydrologyVisualSettings,
	type LakeDefinition,
	type RiverDefinition,
	type RiverSample
} from './HydrologyTypes';
import { applyWaterLook, createWaterMaterial, waterQualityFor } from './WaterMaterial';

export interface WaterRenderStats {
	triangles: number;
	drawCalls: number;
	riverSections: number;
	lakes: number;
}

const SECTION = 12;

/**
 * Streamed river ribbons and lake polygons. Logical rivers stay one feature; only the sections
 * near the player exist as meshes, and those meshes are not rebuilt every frame.
 */
export class WaterRenderer {
	readonly group = new THREE.Group();
	readonly material: THREE.ShaderMaterial;

	private readonly sections = new Map<string, THREE.Mesh>();
	private readonly lakes = new Map<string, THREE.Mesh>();
	private quality = 2;
	private revision = -1;
	private anchorX = Number.NaN;
	private anchorZ = Number.NaN;
	private time = 0;

	constructor() {
		this.group.name = 'water';
		this.material = createWaterMaterial();
	}

	setQuality(quality: 'low' | 'medium' | 'high' | 'ultra'): void {
		const next = waterQualityFor(quality);
		if (next === this.quality) return;
		this.quality = next;
		this.clear();
	}

	applyLook(visual: HydrologyVisualSettings): void {
		applyWaterLook(this.material, visual, this.quality);
	}

	clear(): void {
		for (const mesh of this.sections.values()) this.disposeMesh(mesh);
		for (const mesh of this.lakes.values()) this.disposeMesh(mesh);
		this.sections.clear();
		this.lakes.clear();
		this.anchorX = Number.NaN;
	}

	getStats(): WaterRenderStats {
		let triangles = 0;
		for (const mesh of this.sections.values()) triangles += mesh.geometry.index?.count ?? 0;
		for (const mesh of this.lakes.values()) triangles += mesh.geometry.index?.count ?? 0;
		return {
			triangles: Math.floor(triangles / 3),
			drawCalls: this.sections.size + this.lakes.size,
			riverSections: this.sections.size,
			lakes: this.lakes.size
		};
	}

	update(
		hydrology: HydrologySystem,
		playerX: number,
		playerZ: number,
		deltaSeconds: number,
		camera: THREE.Vector3,
		sunDirection: THREE.Vector3,
		sunColor: THREE.Color,
		skyColor: THREE.Color,
		radius: number
	): void {
		this.time += deltaSeconds;
		const uniforms = this.material.uniforms;
		uniforms.uTime.value = this.time;
		(uniforms.uCameraPosition.value as THREE.Vector3).copy(camera);
		(uniforms.uSunDirection.value as THREE.Vector3).copy(sunDirection);
		(uniforms.uSunColor.value as THREE.Color).copy(sunColor);
		(uniforms.uSkyColor.value as THREE.Color).copy(skyColor);
		uniforms.uQuality.value = this.quality;

		if (!hydrology.settings.enabled) {
			if (this.sections.size > 0 || this.lakes.size > 0) this.clear();
			return;
		}

		const revision = hydrology.getRevision();
		const moved =
			!Number.isFinite(this.anchorX) ||
			Math.hypot(playerX - this.anchorX, playerZ - this.anchorZ) > 32 ||
			revision !== this.revision;
		if (!moved) return;
		if (revision !== this.revision) {
			for (const mesh of this.sections.values()) this.disposeMesh(mesh);
			this.sections.clear();
		}
		this.anchorX = playerX;
		this.anchorZ = playerZ;
		this.revision = revision;
		this.sync(hydrology, playerX, playerZ, radius);
	}

	private sync(hydrology: HydrologySystem, playerX: number, playerZ: number, radius: number): void {
		const keep = new Set<string>();
		const stride = this.quality <= 0 ? 2 : 1;
		const columns = this.quality <= 0 ? 3 : this.quality === 1 ? 5 : 7;
		const scratch = createHydrologySample();
		const readAt = (x: number, z: number) => {
			hydrology.sampleWaterInto(x, z, scratch);
			return scratch;
		};
		const inLake = (x: number, z: number) => readAt(x, z).waterType === 'lake';
		const bankScale = hydrology.settings.riverBankScale;
		for (const river of hydrology.riversNear(playerX, playerZ, radius)) {
			const end = Math.max(2, river.endIndex);
			let blend: Float32Array | null = null;
			for (let start = 0; start < end - 1; start += SECTION) {
				const key = `${river.id}:${start}`;
				keep.add(key);
				if (this.sections.has(key)) continue;
				const stop = Math.min(end, start + SECTION + 1);
				const slice = river.samples.slice(start, stop);
				blend ??= lakeKinds(river, end, inLake);
				const geometry = ribbonGeometry(
					slice,
					river.id,
					stride,
					columns,
					bankScale,
					readAt,
					blend.subarray(start, stop)
				);
				if (!geometry) continue;
				const mesh = new THREE.Mesh(geometry, this.material);
				mesh.frustumCulled = true;
				mesh.renderOrder = 2;
				this.group.add(mesh);
				this.sections.set(key, mesh);
			}
		}
		for (const [key, mesh] of this.sections) {
			if (keep.has(key)) continue;
			this.disposeMesh(mesh);
			this.sections.delete(key);
		}

		const lakeKeep = new Set<string>();
		const segments =
			this.quality <= 0 ? 28 : this.quality === 1 ? 40 : this.quality === 2 ? 52 : 64;
		for (const lake of hydrology.lakesNear(playerX, playerZ, radius)) {
			lakeKeep.add(lake.id);
			const existing = this.lakes.get(lake.id);
			// A lake settles lower when a river is found arriving below it; rebuild at the new level.
			if (existing && existing.userData.waterLevel === lake.waterLevel) continue;
			if (existing) this.disposeMesh(existing);
			const geometry = lakeGeometry(lake, segments, readAt);
			const mesh = new THREE.Mesh(geometry, this.material);
			mesh.userData.waterLevel = lake.waterLevel;
			mesh.frustumCulled = true;
			mesh.renderOrder = 2;
			this.group.add(mesh);
			this.lakes.set(lake.id, mesh);
		}
		for (const [key, mesh] of this.lakes) {
			if (lakeKeep.has(key)) continue;
			this.disposeMesh(mesh);
			this.lakes.delete(key);
		}
	}

	private disposeMesh(mesh: THREE.Mesh): void {
		this.group.remove(mesh);
		mesh.geometry.dispose();
	}

	dispose(): void {
		this.clear();
		this.material.dispose();
	}
}

type WaterRead = (x: number, z: number) => HydrologySample;
/** True where a point lies on a lake's surface (rivers that enter or leave a lake stop drawing there). */
type InLake = (x: number, z: number) => boolean;

/**
 * How far the ribbon may extend on one side. The full width is kept when that edge already
 * clears the water. Otherwise it stops at the shoreline, or before another river's channel,
 * so the sheet cannot hang over lower ground. A lake at the river's own level is not a shoreline:
 * the ribbon runs out onto it, so mouth and lake join without a gap.
 */
function ribbonReach(
	sample: RiverSample,
	side: number,
	riverId: string,
	bankScale: number,
	read: WaterRead
): number {
	const maxEdge = riverWaterEdge(sample.width, bankScale);
	const half = Math.max(0.8, sample.width * 0.5);
	const y = sample.waterY + RIVER_SURFACE_LIFT;
	const px = -sample.tangentZ;
	const pz = sample.tangentX;
	const holds = (dist: number): boolean => {
		const hit = read(sample.x + px * dist * side, sample.z + pz * dist * side);
		if (hit.waterType === 'lake') return Math.abs(hit.waterSurfaceY - sample.waterY) < 0.05;
		if (hit.waterType === 'river' && hit.riverId !== '' && hit.riverId !== riverId) return false;
		// Inside the carved bed the bank has not started. Past it, ground has to clear the skin.
		if (dist > half + 0.2 && hit.terrainY < y - 0.02) return false;
		return true;
	};
	if (holds(maxEdge)) return maxEdge;
	let lo = Math.min(half * 0.35, maxEdge);
	let hi = maxEdge;
	if (!holds(lo)) return Math.max(0.35, lo);
	for (let n = 0; n < 5; n++) {
		const mid = (lo + hi) * 0.5;
		if (holds(mid)) lo = mid;
		else hi = mid;
	}
	return lo;
}

/**
 * Flow speed (m/s-ish) of a river stretch from its water-surface gradient and size — drives how
 * fast the waves travel and how much foam streaks show.
 */
function flowSpeed(samples: RiverSample[], i: number): number {
	const a = samples[Math.max(0, i - 1)];
	const b = samples[Math.min(samples.length - 1, i + 1)];
	const run = Math.hypot(b.x - a.x, b.z - a.z);
	const grade = run > 1e-3 ? Math.abs(a.waterY - b.waterY) / run : 0;
	return Math.min(1.8, Math.max(0.3, 0.35 + grade * 22 + samples[i].width * 0.015));
}

/**
 * A river section as a ribbon `columns` vertices across, spanning the channel and the wet shelf so
 * the surface always reaches the bank (the terrain hides what is above it). Every vertex carries the
 * real water depth under it — the shader uses it for clarity, colour, foam and the soft waterline.
 */
function ribbonGeometry(
	samples: RiverSample[],
	riverId: string,
	stride: number,
	columns: number,
	bankScale: number,
	read: WaterRead,
	/** Per sample, how it's drawn near a lake (`lakeKinds`): from 2 on, not at all. */
	kindsAt: ArrayLike<number>
): THREE.BufferGeometry | null {
	const usedIndex: number[] = [];
	for (let i = 0; i < samples.length; i += stride) usedIndex.push(i);
	if (usedIndex[usedIndex.length - 1] !== samples.length - 1) usedIndex.push(samples.length - 1);
	if (usedIndex.length < 2) return null;

	const count = usedIndex.length * columns;
	const positions = new Float32Array(count * 3);
	const normals = new Float32Array(count * 3);
	const flows = new Float32Array(count * 2);
	const depths = new Float32Array(count);
	const kinds = new Float32Array(count);
	const indices: number[] = [];
	// Rows fully faded out on a lake: the lake surface is drawn there, not a second river skin.
	const hidden = usedIndex.map((index) => (kindsAt[index] ?? 0) >= 2);

	for (let row = 0; row < usedIndex.length; row++) {
		const index = usedIndex[row];
		const sample = samples[index];
		const px = -sample.tangentZ;
		const pz = sample.tangentX;
		const left = ribbonReach(sample, -1, riverId, bankScale, read);
		const right = ribbonReach(sample, 1, riverId, bankScale, read);
		const y = sample.waterY + RIVER_SURFACE_LIFT;
		const speed = flowSpeed(samples, index);
		for (let c = 0; c < columns; c++) {
			const t = columns === 1 ? 0.5 : c / (columns - 1);
			const lateral = -left + (left + right) * t;
			const x = sample.x + px * lateral;
			const z = sample.z + pz * lateral;
			const v = row * columns + c;
			positions[v * 3] = x;
			positions[v * 3 + 1] = y;
			positions[v * 3 + 2] = z;
			normals[v * 3 + 1] = 1;
			flows[v * 2] = sample.tangentX * speed;
			flows[v * 2 + 1] = sample.tangentZ * speed;
			depths[v] = y - read(x, z).terrainY;
			kinds[v] = kindsAt[index] ?? 0;
		}
		if (row + 1 < usedIndex.length && !(hidden[row] && hidden[row + 1])) {
			for (let c = 0; c < columns - 1; c++) {
				const a = row * columns + c;
				const b = a + 1;
				const d = a + columns;
				const e = d + 1;
				indices.push(a, d, b, b, d, e);
			}
		}
	}
	if (indices.length === 0) return null;
	return waterGeometry(positions, normals, flows, depths, kinds, indices);
}

/**
 * A row's sample. The first row on a lake after a stretch on land (or the last before one) is moved
 * back to where the centreline crosses the shoreline, so the ribbon stops exactly at the lake's edge
 * instead of running on under the lake surface.
 */
function waterGeometry(
	positions: Float32Array,
	normals: Float32Array,
	flows: Float32Array,
	depths: Float32Array,
	kinds: Float32Array,
	indices: number[]
): THREE.BufferGeometry {
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
	geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
	geometry.setAttribute('aFlow', new THREE.BufferAttribute(flows, 2));
	geometry.setAttribute('aDepth', new THREE.BufferAttribute(depths, 1));
	geometry.setAttribute('aKind', new THREE.BufferAttribute(kinds, 1));
	geometry.setIndex(indices);
	geometry.computeBoundingSphere();
	return geometry;
}

/**
 * Ring fractions of the shoreline radius, centre to just past the shore. Rings on or past the
 * shoreline get no depth, so the surface fades out there instead of flooding low land beyond it.
 */
const LAKE_RINGS = [0.3, 0.55, 0.75, 0.87, 0.95, 1.0, 1.03];
/** A river this close (m) to a lake's level where it crosses the shoreline runs into or out of it. */
const MOUTH_LEVEL_TOLERANCE = 0.2;
/** Over this far (m) along a river from where it meets a lake, its ripples fade into the lake's. */
const LAKE_BLEND_DISTANCE = 16;
/** How far (m) a river's surface carries on past the shore under the lake, fading out. */
const LAKE_OVERLAP = 6;

/**
 * The depth a lake surface vertex is drawn with at `fraction` of the shore radius. The shoreline
 * (1.0) fades the surface out and anything beyond it is hidden, except where a river at the lake's
 * own level runs in or out across the shoreline: there the lake stays at full depth to meet the
 * river's surface, with no seam and no foam line.
 */
export function lakeEdgeDepth(
	fraction: number,
	depth: number,
	water: Pick<HydrologySample, 'waterType' | 'waterSurfaceY'>,
	lakeLevel: number
): number {
	if (fraction > 1.0) return Math.min(depth, -0.05);
	if (fraction < 1.0) return depth;
	const riverMouth =
		water.waterType === 'river' &&
		Math.abs(water.waterSurfaceY - lakeLevel) <= MOUTH_LEVEL_TOLERANCE;
	return riverMouth ? depth : Math.min(depth, 0);
}

/**
 * Per sample (up to `end`), how a river's surface is drawn near a lake it runs out of or into:
 * - 0 on the river itself;
 * - rising smoothly to 1 over its last `LAKE_BLEND_DISTANCE` before the shore, where its flowing
 *   ripples fade into the lake's;
 * - past the shore, on the lake, from 1 to 2 over `LAKE_OVERLAP`: the surface carries on under the
 *   lake's look and fades out, so the river and lake always overlap whatever angle the shore crosses
 *   it at, and no strip of water is left undrawn between them. From 2 on it isn't drawn.
 * Distances are measured from where the centreline actually crosses the shore.
 */
export function lakeKinds(river: RiverDefinition, end: number, inLake: InLake): Float32Array {
	const count = Math.max(0, Math.min(end, river.samples.length));
	const kinds = new Float32Array(count);
	if (!river.outletOfLakeId && !river.sinkLakeId) return kinds;
	const samples = river.samples;
	const near = (i: number) =>
		i < (river.lakeLockEnd ?? 0) + 4 || i >= (river.lakeLockStart ?? Number.POSITIVE_INFINITY) - 4;
	const onLake = Array.from({ length: count }, (_, i) =>
		near(i) ? inLake(samples[i].x, samples[i].z) : false
	);
	// Signed distance from the shore along the river: negative on the river, positive on the lake.
	const shore = new Float32Array(count).fill(Number.NEGATIVE_INFINITY);
	const crossing = (a: number, b: number) => {
		// Fraction of the way from sample a (off the lake) to b (on it) where the shore is.
		let lo = 0,
			hi = 1;
		for (let n = 0; n < 10; n++) {
			const mid = (lo + hi) / 2;
			const x = samples[a].x + (samples[b].x - samples[a].x) * mid;
			const z = samples[a].z + (samples[b].z - samples[a].z) * mid;
			if (inLake(x, z)) hi = mid;
			else lo = mid;
		}
		return hi;
	};
	const gap = (a: number, b: number) =>
		Math.hypot(samples[b].x - samples[a].x, samples[b].z - samples[a].z);
	for (let i = 0; i + 1 < count; i++) {
		if (onLake[i] === onLake[i + 1]) continue;
		const [off, on] = onLake[i] ? [i + 1, i] : [i, i + 1];
		const f = crossing(off, on);
		const length = gap(i, i + 1);
		// Walk away from this crossing both ways, keeping the nearest crossing's distance.
		const mark = (from: number, dir: number, sign: number, first: number) => {
			let d = first;
			for (let j = from; j >= 0 && j < count && onLake[j] === sign > 0; j += dir) {
				if (Math.abs(d) < Math.abs(shore[j])) shore[j] = d;
				const next = j + dir;
				if (next >= 0 && next < count) d += sign * gap(Math.min(j, next), Math.max(j, next));
			}
		};
		mark(on, on > off ? 1 : -1, 1, (1 - f) * length);
		mark(off, off > on ? 1 : -1, -1, -f * length);
	}
	for (let i = 0; i < count; i++) {
		const d = shore[i];
		if (!Number.isFinite(d)) continue;
		if (d >= 0) kinds[i] = 1 + Math.min(1, d / LAKE_OVERLAP);
		else {
			const t = Math.min(1, -d / LAKE_BLEND_DISTANCE);
			kinds[i] = 1 - t * t * (3 - 2 * t);
		}
	}
	return kinds;
}

/** A lake as concentric rings around its centre, with the real depth sampled at every vertex. */
function lakeGeometry(
	lake: LakeDefinition,
	segments: number,
	read: WaterRead
): THREE.BufferGeometry {
	const terrainAt = (x: number, z: number) => read(x, z).terrainY;
	const count = 1 + LAKE_RINGS.length * segments;
	const positions = new Float32Array(count * 3);
	const normals = new Float32Array(count * 3);
	const flows = new Float32Array(count * 2);
	const depths = new Float32Array(count);
	const kinds = new Float32Array(count).fill(1);
	const y = lake.waterLevel + LAKE_SURFACE_LIFT;
	positions[0] = lake.x;
	positions[1] = y;
	positions[2] = lake.z;
	normals[1] = 1;
	depths[0] = y - terrainAt(lake.x, lake.z);
	for (let ring = 0; ring < LAKE_RINGS.length; ring++) {
		for (let i = 0; i < segments; i++) {
			const angle = (i / segments) * Math.PI * 2;
			const radius = lakeRadiusAt(lake, angle) * LAKE_RINGS[ring];
			const v = 1 + ring * segments + i;
			const x = lake.x + Math.cos(angle) * radius;
			const z = lake.z + Math.sin(angle) * radius;
			positions[v * 3] = x;
			positions[v * 3 + 1] = y;
			positions[v * 3 + 2] = z;
			normals[v * 3 + 1] = 1;
			const water = read(x, z);
			depths[v] = lakeEdgeDepth(LAKE_RINGS[ring], y - water.terrainY, water, lake.waterLevel);
		}
	}
	const indices: number[] = [];
	for (let i = 0; i < segments; i++) {
		indices.push(0, 1 + ((i + 1) % segments), 1 + i);
	}
	for (let ring = 0; ring + 1 < LAKE_RINGS.length; ring++) {
		for (let i = 0; i < segments; i++) {
			const a = 1 + ring * segments + i;
			const b = 1 + ring * segments + ((i + 1) % segments);
			const c = a + segments;
			const d = b + segments;
			indices.push(a, b, c, b, d, c);
		}
	}
	return waterGeometry(positions, normals, flows, depths, kinds, indices);
}
