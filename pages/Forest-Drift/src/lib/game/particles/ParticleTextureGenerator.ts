import { createParticleRandom } from './ParticleTypes';

/**
 * Procedural particle sprites — no image files. Every registered texture is generated ONCE (a few
 * variants each) into one shared RGBA atlas, so every particle effect uses one texture and one
 * material regardless of how many sprite kinds exist. Framework-free: produces plain pixels; the
 * renderer wraps them in a `THREE.DataTexture`.
 *
 * Future effects register more generators (`registerParticleTexture`) before the atlas is built.
 */

/** Atlas: 4 × 4 cells of 64 px. Small sprites, one 256 KB texture. */
export const ATLAS_CELLS_PER_SIDE = 4;
export const ATLAS_CELL_SIZE = 64;
export const ATLAS_SIZE = ATLAS_CELLS_PER_SIDE * ATLAS_CELL_SIZE;
export const ATLAS_MAX_CELLS = ATLAS_CELLS_PER_SIDE * ATLAS_CELLS_PER_SIDE;

/**
 * Writes one sprite (straight, non-premultiplied RGBA, `size × size`, row 0 = top) into `out`.
 * `variant` and `random` make each variant different but deterministic.
 */
export type ParticleTextureGenerator = (
	out: Uint8Array,
	size: number,
	variant: number,
	random: () => number
) => void;

interface TextureRegistration {
	id: string;
	variants: number;
	generate: ParticleTextureGenerator;
}

export interface ParticleAtlas {
	pixels: Uint8Array;
	size: number;
	cellsPerSide: number;
	/** Atlas cell indices for each texture id (one per variant). */
	cells: ReadonlyMap<string, readonly number[]>;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
	const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
	return t * t * (3 - 2 * t);
}

/** Periodic 1D value noise around a circle, for irregular outlines. */
function angularNoise(angle: number, seeds: readonly number[]): number {
	const n = seeds.length;
	const t = ((((angle / (Math.PI * 2)) % 1) + 1) % 1) * n;
	const i = Math.floor(t);
	const f = t - i;
	const u = f * f * (3 - 2 * f);
	return seeds[i % n] + (seeds[(i + 1) % n] - seeds[i % n]) * u;
}

/**
 * Water droplet / spray: a soft, slightly irregular, asymmetric blob — elongated toward one end
 * like a flung drop — with a bright off-centre highlight, a cooler rim, a faded edge and one to
 * three tiny satellite droplets. Reads as water, not as a glow or a spark.
 */
export const generateSplashDroplet: ParticleTextureGenerator = (out, size, _variant, random) => {
	const wobble = Array.from({ length: 7 }, () => random());
	const tilt = (random() - 0.5) * 0.6;
	const elongation = 0.25 + random() * 0.25;
	const satellites = Array.from({ length: 1 + Math.floor(random() * 3) }, () => {
		const a = random() * Math.PI * 2;
		const d = 0.66 + random() * 0.18;
		return { x: Math.cos(a) * d, y: Math.sin(a) * d, r: 0.06 + random() * 0.07 };
	});
	const cos = Math.cos(tilt);
	const sin = Math.sin(tilt);
	for (let py = 0; py < size; py++) {
		for (let px = 0; px < size; px++) {
			const x0 = ((px + 0.5) / size) * 2 - 1;
			const y0 = 1 - ((py + 0.5) / size) * 2;
			// Rotate slightly, then squash the upper half: a teardrop pointing up.
			const x = x0 * cos - y0 * sin;
			const y = x0 * sin + y0 * cos;
			const taper = 1 + elongation * smoothstep(0, 0.6, y);
			const ex = x * taper;
			const ey = y / (1 + elongation * 0.6);
			const d = Math.hypot(ex, ey);
			const angle = Math.atan2(ey, ex);
			const radius = 0.5 * (0.86 + 0.28 * angularNoise(angle, wobble));
			let alpha = 1 - smoothstep(radius * 0.45, radius, d);
			// Satellite droplets.
			let satellite = 0;
			for (const s of satellites) {
				const sd = Math.hypot(x0 - s.x, y0 - s.y);
				satellite = Math.max(satellite, 1 - smoothstep(s.r * 0.35, s.r, sd));
			}
			alpha = Math.max(alpha, satellite * 0.85);
			// Body: cool, slightly darker rim; bright highlight up and to one side.
			const rim = smoothstep(radius * 0.25, radius, d);
			const highlight = 1 - smoothstep(0, 0.32, Math.hypot(ex + 0.14, ey - 0.16));
			const r = 0.74 + 0.26 * highlight - 0.1 * rim;
			const g = 0.84 + 0.16 * highlight - 0.06 * rim;
			const b = 0.92 + 0.08 * highlight - 0.02 * rim;
			const o = (py * size + px) * 4;
			out[o] = Math.round(Math.min(1, r) * 255);
			out[o + 1] = Math.round(Math.min(1, g) * 255);
			out[o + 2] = Math.round(Math.min(1, b) * 255);
			out[o + 3] = Math.round(Math.min(1, Math.max(0, alpha)) * 255);
		}
	}
};

/** Fine mist: a faint, irregular, cloudy puff — the secondary droplets of a splash. */
export const generateWaterMist: ParticleTextureGenerator = (out, size, _variant, random) => {
	const wobble = Array.from({ length: 6 }, () => random());
	const grain = Array.from({ length: 16 }, () => random());
	for (let py = 0; py < size; py++) {
		for (let px = 0; px < size; px++) {
			const x = ((px + 0.5) / size) * 2 - 1;
			const y = 1 - ((py + 0.5) / size) * 2;
			const d = Math.hypot(x, y);
			const angle = Math.atan2(y, x);
			const radius = 0.62 * (0.8 + 0.4 * angularNoise(angle, wobble));
			const speckle = angularNoise(angle * 3 + d * 9, grain);
			const alpha = (1 - smoothstep(radius * 0.15, radius, d)) * (0.45 + 0.4 * speckle);
			const o = (py * size + px) * 4;
			out[o] = 236;
			out[o + 1] = 244;
			out[o + 2] = 250;
			out[o + 3] = Math.round(Math.min(1, Math.max(0, alpha)) * 255);
		}
	}
};

/**
 * Rain streak: a narrow, soft vertical line with faded ends and a slightly brighter core toward its
 * leading (lower) end. Drawn on a thin quad stretched along the fall direction, so the cell's whole
 * width maps onto a few pixels — the soft horizontal profile is what keeps it from aliasing.
 */
export const generateRainStreak: ParticleTextureGenerator = (out, size) => {
	for (let py = 0; py < size; py++) {
		const v = (py + 0.5) / size; // 0 = top (tail), 1 = bottom (head)
		const along = smoothstep(0, 0.45, v) * (1 - smoothstep(0.82, 1, v));
		const core = 0.75 + 0.25 * smoothstep(0.35, 0.8, v);
		for (let px = 0; px < size; px++) {
			const x = ((px + 0.5) / size) * 2 - 1;
			const across = Math.exp(-((x / 0.42) ** 2));
			const alpha = along * across * core;
			const o = (py * size + px) * 4;
			const highlight = Math.exp(-((x / 0.18) ** 2)) * 0.12;
			out[o] = Math.round((0.8 + highlight) * 255);
			out[o + 1] = Math.round((0.86 + highlight) * 255);
			out[o + 2] = Math.round(Math.min(1, 0.94 + highlight) * 255);
			out[o + 3] = Math.round(Math.min(1, alpha) * 255);
		}
	}
};

/**
 * Stylised snowflake: a soft, slightly irregular flake with a bright centre and a feathered edge.
 * Variant 0 is a round puff, 1 a faint six-armed flake, 2 a clump of two or three small flakes —
 * no microscopic crystal geometry, it reads as snow at a glance.
 */
export const generateSnowflake: ParticleTextureGenerator = (out, size, variant, random) => {
	const wobble = Array.from({ length: 6 }, () => random());
	const blobs =
		variant === 2
			? Array.from({ length: 2 + Math.floor(random() * 2) }, () => ({
					x: (random() - 0.5) * 0.7,
					y: (random() - 0.5) * 0.7,
					r: 0.32 + random() * 0.18
				}))
			: [{ x: 0, y: 0, r: variant === 1 ? 0.7 : 0.62 }];
	const armPhase = random() * Math.PI;
	for (let py = 0; py < size; py++) {
		for (let px = 0; px < size; px++) {
			const x = ((px + 0.5) / size) * 2 - 1;
			const y = 1 - ((py + 0.5) / size) * 2;
			let alpha = 0;
			let centre = 0;
			for (const blob of blobs) {
				const dx = x - blob.x;
				const dy = y - blob.y;
				const d = Math.hypot(dx, dy);
				const angle = Math.atan2(dy, dx);
				let radius = blob.r * (0.86 + 0.24 * angularNoise(angle, wobble));
				if (variant === 1) radius *= 0.55 + 0.45 * Math.abs(Math.cos(3 * angle + armPhase)) ** 3;
				alpha = Math.max(alpha, 1 - smoothstep(radius * 0.25, radius, d));
				centre = Math.max(centre, 1 - smoothstep(0, radius * 0.45, d));
			}
			const o = (py * size + px) * 4;
			const shade = 0.88 + 0.12 * centre;
			out[o] = Math.round(shade * 255);
			out[o + 1] = Math.round(shade * 255);
			out[o + 2] = Math.round(Math.min(1, shade + 0.04) * 255);
			out[o + 3] = Math.round(Math.min(1, alpha * (0.75 + 0.25 * centre)) * 255);
		}
	}
};

/** Rain ripple on water: a thin, slightly broken ring with a faint inner ring. Drawn flat. */
export const generateRainRipple: ParticleTextureGenerator = (out, size, _variant, random) => {
	const breakup = Array.from({ length: 9 }, () => random());
	for (let py = 0; py < size; py++) {
		for (let px = 0; px < size; px++) {
			const x = ((px + 0.5) / size) * 2 - 1;
			const y = 1 - ((py + 0.5) / size) * 2;
			const d = Math.hypot(x, y);
			const angle = Math.atan2(y, x);
			const ring = Math.exp(-(((d - 0.78) / 0.07) ** 2));
			const inner = Math.exp(-(((d - 0.5) / 0.06) ** 2)) * 0.45;
			const alpha = (ring + inner) * (0.55 + 0.45 * angularNoise(angle, breakup));
			const o = (py * size + px) * 4;
			out[o] = 225;
			out[o + 1] = 236;
			out[o + 2] = 244;
			out[o + 3] = Math.round(Math.min(1, Math.max(0, alpha)) * 255);
		}
	}
};

const registrations: TextureRegistration[] = [
	{ id: 'water-droplet', variants: 4, generate: generateSplashDroplet },
	{ id: 'water-mist', variants: 2, generate: generateWaterMist },
	{ id: 'rain-streak', variants: 1, generate: generateRainStreak },
	{ id: 'snowflake', variants: 3, generate: generateSnowflake },
	{ id: 'rain-ripple', variants: 1, generate: generateRainRipple }
];

let cachedAtlas: ParticleAtlas | null = null;
let atlasBuilds = 0;

/**
 * Adds a procedural sprite. Must happen before the atlas is first built (effects register at
 * module load); registering an existing id replaces it.
 */
export function registerParticleTexture(
	id: string,
	variants: number,
	generate: ParticleTextureGenerator
): void {
	if (cachedAtlas) throw new Error(`particle atlas already built; register "${id}" earlier`);
	const existing = registrations.findIndex((r) => r.id === id);
	const entry = { id, variants: Math.max(1, Math.floor(variants)), generate };
	if (existing >= 0) registrations[existing] = entry;
	else registrations.push(entry);
}

/** The shared atlas — generated on first use, then returned from cache forever. */
export function getParticleAtlas(): ParticleAtlas {
	if (cachedAtlas) return cachedAtlas;
	const pixels = new Uint8Array(ATLAS_SIZE * ATLAS_SIZE * 4);
	const cells = new Map<string, number[]>();
	const sprite = new Uint8Array(ATLAS_CELL_SIZE * ATLAS_CELL_SIZE * 4);
	let next = 0;
	for (const reg of registrations) {
		const list: number[] = [];
		for (let v = 0; v < reg.variants; v++) {
			if (next >= ATLAS_MAX_CELLS) throw new Error('particle atlas is full');
			sprite.fill(0);
			reg.generate(sprite, ATLAS_CELL_SIZE, v, createParticleRandom(hashId(reg.id) + v * 977));
			const cx = (next % ATLAS_CELLS_PER_SIDE) * ATLAS_CELL_SIZE;
			const cy = Math.floor(next / ATLAS_CELLS_PER_SIDE) * ATLAS_CELL_SIZE;
			for (let row = 0; row < ATLAS_CELL_SIZE; row++) {
				pixels.set(
					sprite.subarray(row * ATLAS_CELL_SIZE * 4, (row + 1) * ATLAS_CELL_SIZE * 4),
					((cy + row) * ATLAS_SIZE + cx) * 4
				);
			}
			list.push(next++);
		}
		cells.set(reg.id, list);
	}
	atlasBuilds++;
	cachedAtlas = { pixels, size: ATLAS_SIZE, cellsPerSide: ATLAS_CELLS_PER_SIDE, cells };
	return cachedAtlas;
}

/** How many times the atlas has been generated (1 in a running game). For tests and stats. */
export function particleAtlasBuildCount(): number {
	return atlasBuilds;
}

function hashId(id: string): number {
	let h = 2166136261;
	for (let i = 0; i < id.length; i++) {
		h ^= id.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return h >>> 0;
}
