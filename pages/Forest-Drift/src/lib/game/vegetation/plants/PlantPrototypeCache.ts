import { buildPlantPrototype, type PlantPrototypeGeometry } from './plantPrototype';
import type { PlantSpeciesDefinition } from './PlantTypes';

export interface PlantPrototypeEntry {
	key: string;
	species: PlantSpeciesDefinition;
	variant: number;
	geometry: PlantPrototypeGeometry;
	lastUsedMs: number;
}

export function plantPrototypeKey(speciesId: string, variant: number): string {
	return `${speciesId}:${variant}`;
}

/**
 * Compile-once store of near (LOD0) prototype geometry, keyed by species × variant. Prototypes are
 * built LAZILY — only when a plant of that species and variant is actually inside the near ring —
 * so species seen only as distant cards never cost any geometry, and 1 000 plants of one species
 * share its 2–4 prototypes. Entries idle longer than `maxIdleMs` are pruned (most recently used
 * kept), so wandering the world never accumulates geometry.
 */
export class PlantPrototypeCache {
	private readonly entries = new Map<string, PlantPrototypeEntry>();
	compiles = 0;

	constructor(readonly maxEntries = 160) {}

	acquire(species: PlantSpeciesDefinition, variant: number, nowMs: number): PlantPrototypeEntry {
		const key = plantPrototypeKey(species.id, variant);
		let entry = this.entries.get(key);
		if (!entry) {
			entry = {
				key,
				species,
				variant,
				geometry: buildPlantPrototype(species, variant),
				lastUsedMs: nowMs
			};
			this.entries.set(key, entry);
			this.compiles++;
		}
		entry.lastUsedMs = nowMs;
		return entry;
	}

	get(key: string): PlantPrototypeEntry | undefined {
		return this.entries.get(key);
	}

	/** Drops entries unused for `maxIdleMs`, and the least recently used beyond the size cap. Returns dropped keys. */
	prune(nowMs: number, maxIdleMs: number, inUse: ReadonlySet<string>): string[] {
		const dropped: string[] = [];
		for (const [key, entry] of this.entries) {
			if (inUse.has(key)) continue;
			if (nowMs - entry.lastUsedMs > maxIdleMs) {
				this.entries.delete(key);
				dropped.push(key);
			}
		}
		if (this.entries.size > this.maxEntries) {
			const idle = [...this.entries.values()]
				.filter((entry) => !inUse.has(entry.key))
				.sort((a, b) => a.lastUsedMs - b.lastUsedMs);
			for (const entry of idle.slice(0, this.entries.size - this.maxEntries)) {
				this.entries.delete(entry.key);
				dropped.push(entry.key);
			}
		}
		return dropped;
	}

	get size(): number {
		return this.entries.size;
	}

	stats(): { prototypes: number; triangles: number; bytes: number; compiles: number } {
		let triangles = 0;
		let bytes = 0;
		for (const { geometry: g } of this.entries.values()) {
			triangles += g.triangles;
			bytes +=
				g.positions.byteLength +
				g.normals.byteLength +
				g.uvs.byteLength +
				g.colors.byteLength +
				g.colors2.byteLength +
				g.plant.byteLength +
				g.indices.byteLength;
		}
		return { prototypes: this.entries.size, triangles, bytes, compiles: this.compiles };
	}

	clear(): void {
		this.entries.clear();
	}
}
