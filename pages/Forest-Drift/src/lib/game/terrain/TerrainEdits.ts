import type { EarthBounds } from '../building/EarthFoundationField';

export interface TerrainEditData {
	version: 1;
	spacing: number;
	points: [number, number, number][];
}
export interface TerrainPatch {
	x: number;
	z: number;
	before?: number;
	after?: number;
}
export interface TerrainStroke {
	patches: TerrainPatch[];
	bounds: EarthBounds;
}
const LIMIT = 100_000;
const QUANTUM = 1 / 32;
export function validTerrainEditData(value: unknown): value is TerrainEditData {
	if (!value || typeof value !== 'object') return false;
	const d = value as TerrainEditData;
	if (
		d.version !== 1 ||
		!Number.isFinite(d.spacing) ||
		d.spacing < 0.25 ||
		d.spacing > 16 ||
		!Array.isArray(d.points) ||
		d.points.length > LIMIT
	)
		return false;
	const seen = new Set<string>();
	return d.points.every((p) => {
		if (
			!Array.isArray(p) ||
			p.length !== 3 ||
			!p.every(Number.isFinite) ||
			!Number.isSafeInteger(p[0]) ||
			!Number.isSafeInteger(p[1]) ||
			Math.abs(p[0]) > 1e6 ||
			Math.abs(p[1]) > 1e6 ||
			Math.abs(p[2]) > 10000
		)
			return false;
		const key = `${p[0]},${p[1]}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}
/** Sparse absolute targets; four O(1) lookups, no history scans in surface queries. */
export class TerrainEdits {
	private rows = new Map<number, Map<number, number>>();
	private count = 0;
	revision = 0;
	private pending = new Map<string, TerrainPatch>();
	private strokeBounds: EarthBounds | null = null;
	begin(): void {
		this.pending.clear();
		this.strokeBounds = null;
	}
	finish(): TerrainStroke | null {
		if (!this.strokeBounds) return null;
		const stroke = { patches: [...this.pending.values()], bounds: this.strokeBounds };
		this.pending.clear();
		this.strokeBounds = null;
		this.revision++;
		return stroke;
	}
	get hasEdits(): boolean {
		return this.count > 0;
	}
	constructor(public spacing: number) {}
	get(x: number, z: number): number | undefined {
		return this.rows.get(z)?.get(x);
	}
	private set(x: number, z: number, value: number | undefined): void {
		let row = this.rows.get(z);
		const had = row?.has(x) ?? false;
		if (value === undefined) {
			if (had) {
				row!.delete(x);
				this.count--;
				if (!row!.size) this.rows.delete(z);
			}
		} else {
			if (!row) this.rows.set(z, (row = new Map()));
			row.set(x, value);
			if (!had) this.count++;
		}
	}
	sample(x: number, z: number, base: number, underlying: (x: number, z: number) => number): number {
		if (!this.count) return base;
		const s = this.spacing,
			gx = Math.floor(x / s),
			gz = Math.floor(z / s);
		const a = this.get(gx, gz),
			b = this.get(gx + 1, gz),
			c = this.get(gx, gz + 1),
			d = this.get(gx + 1, gz + 1);
		if (a === undefined && b === undefined && c === undefined && d === undefined) return base;
		const tx = x / s - gx,
			tz = z / s - gz;
		if (tx === 0 && tz === 0) return a ?? base;
		// Interpolate displacement; unedited corners retain their procedural surface.
		// Skip zero-weight corners (especially lattice vertices and normal samples).
		const wa = (1 - tx) * (1 - tz),
			wb = tx * (1 - tz),
			wc = (1 - tx) * tz,
			wd = tx * tz;
		return (
			base +
			(a === undefined || wa === 0 ? 0 : (a - underlying(gx * s, gz * s)) * wa) +
			(b === undefined || wb === 0 ? 0 : (b - underlying((gx + 1) * s, gz * s)) * wb) +
			(c === undefined || wc === 0 ? 0 : (c - underlying(gx * s, (gz + 1) * s)) * wc) +
			(d === undefined || wd === 0 ? 0 : (d - underlying((gx + 1) * s, (gz + 1) * s)) * wd)
		);
	}
	/** Pure bounded proposal. Protected neighbours lock the complete interpolation footprint. */
	propose(
		x: number,
		z: number,
		radius: number,
		step: number,
		point: boolean,
		sample: (x: number, z: number) => number,
		allowed: (x: number, z: number, height: number, footprintOnly?: boolean) => string | null
	): { stroke: TerrainStroke; reason: string } {
		const s = this.spacing;
		if (
			![x, z, radius, step, s].every(Number.isFinite) ||
			s < 0.25 ||
			s > 16 ||
			Math.abs(x / s) > 1e6 ||
			Math.abs(z / s) > 1e6
		)
			return {
				stroke: { patches: [], bounds: { minX: 0, maxX: 0, minZ: 0, maxZ: 0 } },
				reason: 'Shovel requires terrain grid spacing between 0.25 and 16 metres.'
			};
		x = Math.round(x / s) * s;
		z = Math.round(z / s) * s;
		radius = point ? 0 : Math.min(4, Math.max(s, radius));
		const patches: TerrainPatch[] = [];
		const heights = new Map<string, number>();
		const originalSample = sample;
		sample = (px, pz) => {
			const key = `${px},${pz}`;
			let h = heights.get(key);
			if (h === undefined) {
				h = originalSample(px, pz);
				heights.set(key, h);
			}
			return h;
		};
		let reason = '';
		const bounds = {
			minX: x - radius - s,
			maxX: x + radius + s,
			minZ: z - radius - s,
			maxZ: z + radius + s
		};
		if (this.pending.size >= 2048)
			return {
				stroke: { patches, bounds },
				reason: 'Release to finish this stroke before continuing.'
			};
		if (this.count >= LIMIT)
			return {
				stroke: { patches, bounds },
				reason: 'Terrain edit limit reached. Undo an edit to free space.'
			};
		for (let iz = Math.ceil((z - radius) / s); iz <= Math.floor((z + radius) / s); iz++)
			for (let ix = Math.ceil((x - radius) / s); ix <= Math.floor((x + radius) / s); ix++) {
				const px = ix * s,
					pz = iz * s,
					distance = Math.hypot(px - x, pz - z);
				if (!point && distance > radius) continue;
				const old = sample(px, pz);
				const weight = point ? 1 : Math.pow(Math.max(0, 1 - distance / (radius + s * 0.5)), 2);
				const next =
					Math.round((old + Math.max(-0.5, Math.min(0.5, step)) * weight) / QUANTUM) * QUANTUM;
				if (Math.abs(next - old) < QUANTUM * 0.49 || (next - old) * step <= 0) continue;
				let blocked = allowed(px, pz, next);
				// Changes interpolate out one cell: protect water, objects and pad edges there too.
				for (let dz = -1; dz <= 1 && !blocked; dz++)
					for (let dx = -1; dx <= 1 && !blocked; dx++) {
						const neighbour = sample(px + dx * s, pz + dz * s);
						blocked = allowed(px + dx * s, pz + dz * s, neighbour + (next - old), true);
						if (
							(dx || dz) &&
							Math.abs(next - neighbour) >
								Math.max(0.65 * s * Math.hypot(dx, dz), Math.abs(old - neighbour)) + 1e-6
						)
							blocked = 'Maximum safe bank slope reached.';
					}
				if (blocked) {
					reason = blocked;
					continue;
				}
				if (this.count + patches.length >= LIMIT || this.pending.size + patches.length >= 2048) {
					reason = 'Release to finish this stroke; terrain edit capacity reached.';
					continue;
				}
				patches.push({ x: ix, z: iz, before: this.get(ix, iz), after: next });
			}
		// Validate the combined brush, not just each point against yesterday's neighbours.
		const accepted = new Map(patches.map((p) => [`${p.x},${p.z}`, p]));
		for (let pass = 0; pass <= patches.length; pass++) {
			const rejected: string[] = [];
			for (const [key, p] of accepted) {
				const old = sample(p.x * s, p.z * s);
				for (let dz = -1; dz <= 1; dz++)
					for (let dx = -1; dx <= 1; dx++) {
						if (!dx && !dz) continue;
						const before = sample((p.x + dx) * s, (p.z + dz) * s);
						const after = accepted.get(`${p.x + dx},${p.z + dz}`)?.after ?? before;
						if (
							Math.abs(p.after! - after) >
							Math.max(0.65 * s * Math.hypot(dx, dz), Math.abs(old - before)) + 1e-6
						) {
							rejected.push(key);
							break;
						}
					}
			}
			if (!rejected.length) break;
			reason = 'Maximum safe bank slope reached.';
			for (const key of rejected) accepted.delete(key);
		}
		return { stroke: { patches: [...accepted.values()], bounds }, reason };
	}
	apply(stroke: TerrainStroke, reverse = false, pending = false): void {
		if (pending && stroke.patches.length) {
			for (const p of stroke.patches) {
				const key = `${p.x},${p.z}`,
					old = this.pending.get(key);
				this.pending.set(key, { ...p, before: old ? old.before : p.before });
			}
			const b = this.strokeBounds,
				n = stroke.bounds;
			this.strokeBounds = b
				? {
						minX: Math.min(b.minX, n.minX),
						maxX: Math.max(b.maxX, n.maxX),
						minZ: Math.min(b.minZ, n.minZ),
						maxZ: Math.max(b.maxZ, n.maxZ)
					}
				: { ...n };
		}

		for (const p of stroke.patches) this.set(p.x, p.z, reverse ? p.before : p.after);
		if (stroke.patches.length && !pending) this.revision++;
	}
	serialize(): TerrainEditData {
		const points: TerrainEditData['points'] = [];
		for (const [z, row] of this.rows)
			for (const [x, h] of row) {
				const pending = this.pending.get(`${x},${z}`);
				const saved = pending ? pending.before : h;
				if (saved !== undefined) points.push([x, z, saved]);
			}
		return { version: 1, spacing: this.spacing, points };
	}
	load(data?: TerrainEditData): void {
		if (data && !validTerrainEditData(data)) throw new Error('Invalid terrain edit data');
		this.rows.clear();
		this.count = 0;
		this.begin();
		if (data) {
			this.spacing = data.spacing;
			for (const [x, z, h] of data.points) this.set(x, z, h);
		}
		this.revision++;
	}
	/** Existing exclusion pipeline clears blades only around actually authored points. */
	getFootprints(): (EarthBounds & { id: string })[] {
		const result: (EarthBounds & { id: string })[] = [],
			s = this.spacing;
		for (const [z, row] of this.rows)
			for (const x of row.keys())
				result.push({
					id: `terrain:${x}:${z}`,
					minX: (x - 1) * s,
					maxX: (x + 1) * s,
					minZ: (z - 1) * s,
					maxZ: (z + 1) * s
				});
		return result;
	}
}
