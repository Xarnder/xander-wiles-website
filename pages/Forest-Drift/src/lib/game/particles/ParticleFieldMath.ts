/**
 * Camera-local particle fields (rain, snow) — the maths, framework-free.
 *
 * A field is N fixed random seeds. Every frame the GPU derives each particle's position from its
 * seed, the field's phase and the camera; nothing per particle runs on the CPU and nothing is ever
 * allocated after the capacity is set. `ParticleFieldRenderer`'s vertex shader implements exactly
 * `fieldParticleLocal` below — this copy exists so the behaviour can be unit-tested.
 *
 * World anchoring: positions are wrapped through a box centred on the camera (the "anchor"), but the
 * wrap is computed in WORLD space, so a drop keeps its world position while the camera moves — the
 * player walks through the rain, the rain does not travel with the player — and a drop leaving one
 * side of the box reappears on the other. That wrap is the recycling: no particle is ever retired or
 * respawned.
 *
 * Fall: each particle completes a whole number of falls through the box per `period`, so the phase
 * can wrap every period without a visible jump; different integers give different fall speeds.
 *
 * Density falls off with distance: the particles are split (by instance index, so the split holds
 * for any live count) into nested layers, each wrapped through its own box — most in a small box
 * round the camera, fewer in the full volume. The same particle count therefore puts several times
 * more drops close to the player, where they are seen, and fewer far away, where they are sub-pixel.
 * Each layer's soft cylinder edge hides where its density stops.
 */

/** Radius of each layer as a fraction of the field radius (innermost first). */
export const FIELD_LAYER_RADII: readonly number[] = [0.35, 0.65, 1];
/** Out of every 20 instances, how many go in each layer: 45%, 30%, 25%. */
export const FIELD_LAYER_COUNTS: readonly number[] = [9, 6, 5];

/** The layer instance `index` belongs to. */
export function fieldLayerOf(index: number): number {
	const slot = index % 20;
	return slot < FIELD_LAYER_COUNTS[0] ? 0 : slot < FIELD_LAYER_COUNTS[0] + FIELD_LAYER_COUNTS[1] ? 1 : 2;
}

export interface ParticleFieldFrame {
	/** Volume centre in world space (the camera, raised a little). */
	anchorX: number;
	anchorY: number;
	anchorZ: number;
	/** Horizontal radius (m): the box is 2r × 2r, faded to a cylinder. */
	radius: number;
	/** Box height (m). */
	height: number;
	/** 0..1 position within the field's period. */
	phase: number;
	/** Falls through the box per period: `cycleMin + floor(seed * cycleRange)`. Integers. */
	cycleMin: number;
	cycleRange: number;
	/** Accumulated horizontal wind drift (m). Any value; the wrap absorbs it. */
	driftX: number;
	driftZ: number;
	/** Quad width and length (m). Flakes use `width` for both. */
	width: number;
	length: number;
	/** ± size variation as a fraction. */
	sizeJitter: number;
	opacity: number;
	/** Particles closer than `nearFadeStart` to the camera are invisible, fully visible past `nearFadeEnd`. */
	nearFadeStart: number;
	nearFadeEnd: number;
	/** Streaks: unit axis they are stretched along (the fall direction, pointing down). */
	dirX: number;
	dirY: number;
	dirZ: number;
	/** Flakes: sideways flutter amplitude (m) and base cycles per period (integer). */
	flutterAmplitude: number;
	flutterCycles: number;
	/** Flakes: max spin turns per period (integer). */
	spinCycles: number;
	/** Shelter: particles inside this world-space XZ box and below `shelterTopY` are hidden. */
	shelterEnabled: boolean;
	shelterMinX: number;
	shelterMinZ: number;
	shelterMaxX: number;
	shelterMaxZ: number;
	shelterTopY: number;
	/** Radians per screen pixel — streaks never get thinner than about one pixel (they fade instead). */
	pixelAngle: number;
}

export function createParticleFieldFrame(): ParticleFieldFrame {
	return {
		anchorX: 0,
		anchorY: 0,
		anchorZ: 0,
		radius: 20,
		height: 24,
		phase: 0,
		cycleMin: 1,
		cycleRange: 1,
		driftX: 0,
		driftZ: 0,
		width: 0.01,
		length: 0.6,
		sizeJitter: 0.25,
		opacity: 1,
		nearFadeStart: 0.5,
		nearFadeEnd: 2,
		dirX: 0,
		dirY: -1,
		dirZ: 0,
		flutterAmplitude: 0,
		flutterCycles: 0,
		spinCycles: 0,
		shelterEnabled: false,
		shelterMinX: 0,
		shelterMinZ: 0,
		shelterMaxX: 0,
		shelterMaxZ: 0,
		shelterTopY: 0,
		pixelAngle: 0.001
	};
}

/** Positive modulo (GLSL `mod`). */
export function wrapMod(value: number, size: number): number {
	return value - size * Math.floor(value / size);
}

function fract(value: number): number {
	return value - Math.floor(value);
}

export interface FieldWrapOffsets {
	/** Per layer: x and z wrap offsets (6 numbers). */
	xz: Float64Array;
	y: number;
}

export function createFieldWrapOffsets(): FieldWrapOffsets {
	return { xz: new Float64Array(FIELD_LAYER_RADII.length * 2), y: 0 };
}

/**
 * The wrap offsets the shader adds to each seed, per layer and axis, computed on the CPU in double
 * precision so the GPU only ever sees small numbers however far the player has walked.
 */
export function fieldWrapOffsets(frame: ParticleFieldFrame, out: FieldWrapOffsets): FieldWrapOffsets {
	for (let layer = 0; layer < FIELD_LAYER_RADII.length; layer++) {
		const radius = frame.radius * FIELD_LAYER_RADII[layer];
		const size = radius * 2;
		out.xz[layer * 2] = wrapMod(frame.driftX - (frame.anchorX - radius), size);
		out.xz[layer * 2 + 1] = wrapMod(frame.driftZ - (frame.anchorZ - radius), size);
	}
	out.y = wrapMod(-(frame.anchorY - frame.height * 0.5), frame.height);
	return out;
}

/**
 * One particle's position relative to the anchor (before flutter), exactly as the vertex shader
 * computes it. `seed` components are 0..1.
 */
export function fieldParticleLocal(
	seed: readonly [number, number, number, number],
	frame: ParticleFieldFrame,
	offsets: FieldWrapOffsets,
	out: { x: number; y: number; z: number },
	index = 0
): { x: number; y: number; z: number } {
	const layer = fieldLayerOf(index);
	const radius = frame.radius * FIELD_LAYER_RADII[layer];
	const size = radius * 2;
	const cycles = frame.cycleMin + Math.floor(seed[3] * frame.cycleRange);
	const fall = fract(seed[1] - cycles * frame.phase);
	out.x = wrapMod(seed[0] * size + offsets.xz[layer * 2], size) - radius;
	out.y = wrapMod(fall * frame.height + offsets.y, frame.height) - frame.height * 0.5;
	out.z = wrapMod(seed[2] * size + offsets.xz[layer * 2 + 1], size) - radius;
	return out;
}

/** Fall speed (m/s) a field gets from `cycles` falls of `height` per `period` seconds. */
export function fieldFallSpeed(cycles: number, height: number, period: number): number {
	return (cycles * height) / period;
}

/** Whole falls per period that best match a target speed range. */
export function fieldCyclesFor(
	minSpeed: number,
	maxSpeed: number,
	height: number,
	period: number
): { cycleMin: number; cycleRange: number } {
	const cycleMin = Math.max(1, Math.round((minSpeed * period) / height));
	const cycleMax = Math.max(cycleMin, Math.round((maxSpeed * period) / height));
	return { cycleMin, cycleRange: cycleMax - cycleMin + 1 };
}

/** Deterministic 0..1 seeds for `capacity` particles (xyzw interleaved). */
export function createFieldSeeds(capacity: number, seed: number): Float32Array {
	const out = new Float32Array(Math.max(0, Math.floor(capacity)) * 4);
	let a = seed >>> 0;
	for (let i = 0; i < out.length; i++) {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		out[i] = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	}
	return out;
}

/** Visibility of a particle at `local` (relative to the anchor) — the shader's fades. */
export function fieldParticleFade(
	local: { x: number; y: number; z: number },
	frame: ParticleFieldFrame,
	cameraDistance: number,
	index = 0
): number {
	const r = Math.hypot(local.x, local.z);
	const radius = frame.radius * FIELD_LAYER_RADII[fieldLayerOf(index)];
	const edge = 1 - smoothstep(radius * 0.72, radius, r);
	const v = (local.y + frame.height * 0.5) / frame.height;
	const vertical = smoothstep(0, 0.08, v) * (1 - smoothstep(0.9, 1, v));
	const near = smoothstep(frame.nearFadeStart, frame.nearFadeEnd, cameraDistance);
	return edge * vertical * near;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
	const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
	return t * t * (3 - 2 * t);
}

export { fract as fieldFract };
