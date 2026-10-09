/**
 * Fixed-capacity particle storage — framework-free, no per-particle objects.
 *
 * Live particles are kept DENSE in `[0, count)` of one interleaved Float32Array: a particle that
 * expires is overwritten by the last live one (swap-remove), so spawning is O(1), nothing is ever
 * allocated after construction, and the render buffers can be written as one contiguous range and
 * drawn with `instanceCount = count`. When the pool is full, `spawn` refuses (returns false) — it
 * never grows.
 *
 * Each `update` integrates motion (gravity, drag), ages particles, retires the expired, and writes
 * the three per-instance render streams the renderer reads directly:
 *   positionSize: x, y, z, size
 *   params:       opacity, rotation, atlas cell, lighting
 *   color:        r, g, b, orientation (0 = camera-facing, 1 = flat on the ground)
 */

const STRIDE = 24;
// Interleaved simulation layout.
const PX = 0;
const PY = 1;
const PZ = 2;
const VX = 3;
const VY = 4;
const VZ = 5;
const AGE = 6;
const LIFE = 7;
const SIZE0 = 8;
const SIZE1 = 9;
const ALPHA0 = 10;
const ALPHA1 = 11;
const FADE_IN = 12;
const ROT = 13;
const SPIN = 14;
const GRAVITY = 15;
const DRAG = 16;
const KILL_Y = 17;
const CELL = 18;
const LIGHTING = 19;
const R = 20;
const G = 21;
const B = 22;
const FLAT = 23;

/** Everything needed to start one particle. Reuse one instance; `spawn` copies out of it. */
export interface ParticleSpawn {
	effect: number;
	x: number;
	y: number;
	z: number;
	vx: number;
	vy: number;
	vz: number;
	life: number;
	size0: number;
	size1: number;
	alpha0: number;
	alpha1: number;
	fadeIn: number;
	rotation: number;
	spin: number;
	gravity: number;
	drag: number;
	killY: number;
	cell: number;
	lighting: number;
	r: number;
	g: number;
	b: number;
	/** 1 = lies flat on the XZ plane (a ripple), 0 = faces the camera. */
	flat: number;
}

export function createParticleSpawn(): ParticleSpawn {
	return {
		effect: 0,
		x: 0,
		y: 0,
		z: 0,
		vx: 0,
		vy: 0,
		vz: 0,
		life: 1,
		size0: 0.1,
		size1: 0.1,
		alpha0: 1,
		alpha1: 0,
		fadeIn: 0,
		rotation: 0,
		spin: 0,
		gravity: 0,
		drag: 0,
		killY: -Infinity,
		cell: 0,
		lighting: 1,
		r: 1,
		g: 1,
		b: 1,
		flat: 0
	};
}

export const MAX_PARTICLE_EFFECTS = 64;

export class ParticlePool {
	private sim: Float32Array;
	private effectOf: Uint16Array;
	/** Live particles per effect index — lets effects enforce their own caps cheaply. */
	readonly perEffect = new Int32Array(MAX_PARTICLE_EFFECTS);
	positionSize: Float32Array;
	params: Float32Array;
	color: Float32Array;
	private live = 0;
	private cap: number;

	constructor(capacity: number) {
		this.cap = Math.max(0, Math.floor(capacity));
		this.sim = new Float32Array(this.cap * STRIDE);
		this.effectOf = new Uint16Array(this.cap);
		this.positionSize = new Float32Array(this.cap * 4);
		this.params = new Float32Array(this.cap * 4);
		this.color = new Float32Array(this.cap * 4);
	}

	get count(): number {
		return this.live;
	}

	get capacity(): number {
		return this.cap;
	}

	/** CPU bytes held (simulation + render streams). */
	get bytes(): number {
		return (
			this.sim.byteLength +
			this.effectOf.byteLength +
			this.positionSize.byteLength +
			this.params.byteLength +
			this.color.byteLength
		);
	}

	/**
	 * Changes capacity (graphics quality changed). Reallocates only when it actually changes;
	 * particles beyond the new capacity are dropped.
	 */
	resize(capacity: number): boolean {
		const next = Math.max(0, Math.floor(capacity));
		if (next === this.cap) return false;
		const keep = Math.min(this.live, next);
		const sim = new Float32Array(next * STRIDE);
		sim.set(this.sim.subarray(0, keep * STRIDE));
		const effectOf = new Uint16Array(next);
		effectOf.set(this.effectOf.subarray(0, keep));
		this.perEffect.fill(0);
		for (let i = 0; i < keep; i++) this.perEffect[effectOf[i]]++;
		this.sim = sim;
		this.effectOf = effectOf;
		this.positionSize = new Float32Array(next * 4);
		this.params = new Float32Array(next * 4);
		this.color = new Float32Array(next * 4);
		this.cap = next;
		this.live = keep;
		return true;
	}

	/** Starts a particle. Returns false (and does nothing) when the pool is full. */
	spawn(p: ParticleSpawn): boolean {
		if (this.live >= this.cap) return false;
		const i = this.live++;
		const o = i * STRIDE;
		const s = this.sim;
		s[o + PX] = p.x;
		s[o + PY] = p.y;
		s[o + PZ] = p.z;
		s[o + VX] = p.vx;
		s[o + VY] = p.vy;
		s[o + VZ] = p.vz;
		s[o + AGE] = 0;
		s[o + LIFE] = Math.max(1e-3, p.life);
		s[o + SIZE0] = p.size0;
		s[o + SIZE1] = p.size1;
		s[o + ALPHA0] = p.alpha0;
		s[o + ALPHA1] = p.alpha1;
		s[o + FADE_IN] = p.fadeIn;
		s[o + ROT] = p.rotation;
		s[o + SPIN] = p.spin;
		s[o + GRAVITY] = p.gravity;
		s[o + DRAG] = p.drag;
		s[o + KILL_Y] = p.killY;
		s[o + CELL] = p.cell;
		s[o + LIGHTING] = p.lighting;
		s[o + R] = p.r;
		s[o + G] = p.g;
		s[o + B] = p.b;
		s[o + FLAT] = p.flat;
		this.effectOf[i] = p.effect;
		this.perEffect[p.effect]++;
		return true;
	}

	/** Advances every particle by `dt` seconds, retires the dead, and rewrites the render streams. */
	update(dt: number): number {
		const s = this.sim;
		let i = 0;
		while (i < this.live) {
			const o = i * STRIDE;
			const age = s[o + AGE] + dt;
			const drag = Math.max(0, 1 - s[o + DRAG] * dt);
			const vy = (s[o + VY] - s[o + GRAVITY] * dt) * drag;
			const y = s[o + PY] + vy * dt;
			if (age >= s[o + LIFE] || (vy < 0 && y < s[o + KILL_Y])) {
				this.retire(i);
				continue; // the last particle now sits at i; process it next
			}
			const vx = s[o + VX] * drag;
			const vz = s[o + VZ] * drag;
			s[o + VX] = vx;
			s[o + VY] = vy;
			s[o + VZ] = vz;
			s[o + PX] += vx * dt;
			s[o + PY] = y;
			s[o + PZ] += vz * dt;
			s[o + AGE] = age;
			s[o + ROT] += s[o + SPIN] * dt;
			i++;
		}
		this.writeRender();
		return this.live;
	}

	/** Rewrites the render streams from the simulation state (also used while paused). */
	writeRender(): void {
		const s = this.sim;
		const ps = this.positionSize;
		const pr = this.params;
		const col = this.color;
		for (let i = 0; i < this.live; i++) {
			const o = i * STRIDE;
			const t = s[o + AGE] / s[o + LIFE];
			const fadeIn = s[o + FADE_IN];
			const fade = fadeIn > 0 ? Math.min(1, t / fadeIn) : 1;
			const r = i * 4;
			ps[r] = s[o + PX];
			ps[r + 1] = s[o + PY];
			ps[r + 2] = s[o + PZ];
			ps[r + 3] = s[o + SIZE0] + (s[o + SIZE1] - s[o + SIZE0]) * t;
			pr[r] = (s[o + ALPHA0] + (s[o + ALPHA1] - s[o + ALPHA0]) * t) * fade;
			pr[r + 1] = s[o + ROT];
			pr[r + 2] = s[o + CELL];
			pr[r + 3] = s[o + LIGHTING];
			col[r] = s[o + R];
			col[r + 1] = s[o + G];
			col[r + 2] = s[o + B];
			col[r + 3] = s[o + FLAT];
		}
	}

	clear(): void {
		this.live = 0;
		this.perEffect.fill(0);
	}

	private retire(i: number): void {
		const last = this.live - 1;
		this.perEffect[this.effectOf[i]]--;
		if (i !== last) {
			this.sim.copyWithin(i * STRIDE, last * STRIDE, last * STRIDE + STRIDE);
			this.effectOf[i] = this.effectOf[last];
		}
		this.live = last;
	}
}
