import type { FoundationDefinition } from './FoundationTypes';

export interface EarthBounds {
	minX: number;
	maxX: number;
	minZ: number;
	maxZ: number;
}
interface Pad extends EarthBounds {
	topY: number;
	blend: number;
	stone: boolean;
}
const BUCKET_SIZE = 32;
export function earthFoundationBounds(d: FoundationDefinition, spacing: number): EarthBounds {
	const blend = d.blendWidth ?? Math.max(6, spacing * 3, (d.topY - d.bottomY) * 2);
	return {
		minX: d.minGridX * spacing - blend,
		maxX: d.maxGridX * spacing + blend,
		minZ: d.minGridZ * spacing - blend,
		maxZ: d.maxGridZ * spacing + blend
	};
}
/** Spatially indexed, deterministic terrain edit. Only recipes are saved, never baked meshes. */
export class EarthFoundationField {
	private readonly oversized: Pad[] = [];
	private readonly empty: Pad[] = [];
	private buckets = new Map<number, Map<number, Pad[]>>();
	rebuild(definitions: readonly FoundationDefinition[], spacing: number): void {
		this.buckets.clear();
		this.oversized.length = 0;
		for (const d of definitions) {
			const outer = earthFoundationBounds(d, spacing);
			const pad: Pad = {
				minX: d.minGridX * spacing,
				maxX: d.maxGridX * spacing,
				minZ: d.minGridZ * spacing,
				maxZ: d.maxGridZ * spacing,
				topY: d.topY,
				stone: d.style !== 'earth',
				blend: d.minGridX * spacing - outer.minX
			};
			const cellsX =
				Math.floor(outer.maxX / BUCKET_SIZE) - Math.floor(outer.minX / BUCKET_SIZE) + 1;
			const cellsZ =
				Math.floor(outer.maxZ / BUCKET_SIZE) - Math.floor(outer.minZ / BUCKET_SIZE) + 1;
			// Keep index memory bounded even for unusually large imported pads.
			if (
				cellsX * cellsZ > 4096 ||
				!Number.isSafeInteger(Math.floor(outer.maxX / BUCKET_SIZE)) ||
				!Number.isSafeInteger(Math.floor(outer.maxZ / BUCKET_SIZE))
			) {
				this.oversized.push(pad);
				continue;
			}
			for (
				let z = Math.floor(outer.minZ / BUCKET_SIZE);
				z <= Math.floor(outer.maxZ / BUCKET_SIZE);
				z++
			)
				for (
					let x = Math.floor(outer.minX / BUCKET_SIZE);
					x <= Math.floor(outer.maxX / BUCKET_SIZE);
					x++
				) {
					let row = this.buckets.get(z);
					if (!row) this.buckets.set(z, (row = new Map()));
					let list = row.get(x);
					if (!list) row.set(x, (list = []));
					list.push(pad);
				}
		}
	}
	constrainManual(x: number, z: number, base: number, height: number): number {
		const pads =
			this.buckets.get(Math.floor(z / BUCKET_SIZE))?.get(Math.floor(x / BUCKET_SIZE)) ?? this.empty;
		let core = -Infinity;
		for (let i = 0; i < pads.length + this.oversized.length; i++) {
			const p = i < pads.length ? pads[i] : this.oversized[i - pads.length];
			const distance = Math.hypot(
				Math.max(p.minX - x, 0, x - p.maxX),
				Math.max(p.minZ - z, 0, z - p.maxZ)
			);
			if (distance === 0) {
				if (!p.stone) {
					core = Math.max(core, p.topY);
					continue;
				} else if (x > p.minX && x < p.maxX && z > p.minZ && z < p.maxZ) {
					height = base;
					continue;
				}
			}
			const upper = p.topY - (p.stone ? 0.05 : 0) + distance * 0.65;
			const lower = p.topY - (p.stone ? 4 : 0) - distance * 0.65;
			height = Math.max(Math.min(base, lower), Math.min(height, Math.max(base, upper)));
		}
		return core === -Infinity ? height : core;
	}

	sample = (x: number, z: number, base: number): number => {
		const pads =
			this.buckets.get(Math.floor(z / BUCKET_SIZE))?.get(Math.floor(x / BUCKET_SIZE)) ?? this.empty;
		if (!pads.length && !this.oversized.length) return base;
		let height = base,
			inside = -Infinity;
		for (let i = 0; i < pads.length + this.oversized.length; i++) {
			const p = i < pads.length ? pads[i] : this.oversized[i - pads.length];
			const dx = Math.max(p.minX - x, 0, x - p.maxX),
				dz = Math.max(p.minZ - z, 0, z - p.maxZ);
			if (dx === 0 && dz === 0) {
				if (!p.stone) inside = Math.max(inside, p.topY);
				continue;
			}
			if (p.stone) continue;
			const distance = Math.hypot(dx, dz);
			if (distance >= p.blend) continue;
			const t = distance / p.blend;
			const weight = 1 - t * t * (3 - 2 * t);
			height = Math.max(height, base + (p.topY - base) * weight);
		}
		if (inside !== -Infinity) return inside;
		// A higher neighbour's bank must fade back to a lower pad's exact edge, not form a step.
		const raised = height;
		for (let i = 0; i < pads.length + this.oversized.length; i++) {
			const p = i < pads.length ? pads[i] : this.oversized[i - pads.length];
			if (p.stone) {
				const distance = Math.hypot(
					Math.max(p.minX - x, 0, x - p.maxX),
					Math.max(p.minZ - z, 0, z - p.maxZ)
				);
				// A retaining wall caps fill with a bounded, walkable approach. Preserve legacy terrain.
				height = Math.min(height, Math.max(base, p.topY - 0.05 + distance * 0.65));
				continue;
			}
			if (raised <= p.topY) continue;
			const dx = Math.max(p.minX - x, 0, x - p.maxX),
				dz = Math.max(p.minZ - z, 0, z - p.maxZ);
			const t = Math.min(1, Math.hypot(dx, dz) / p.blend);
			height = Math.min(height, Math.max(base, p.topY + (raised - p.topY) * t * t * (3 - 2 * t)));
		}
		return height;
	};
}
