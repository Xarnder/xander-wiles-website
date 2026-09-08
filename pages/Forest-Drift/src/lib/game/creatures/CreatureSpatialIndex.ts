import type { Vec3 } from './CreatureTypes';
/** Renderer-independent spatial hash; upsert moving entries after their movement tick. */
export class CreatureSpatialIndex<T extends { position: Vec3 }> {
	private cells = new Map<string, Map<string, T>>();
	private entries = new Map<string, { key: string; value: T }>();
	constructor(readonly cellSize = 24) {
		if (!Number.isFinite(cellSize) || cellSize <= 0) throw new Error('Invalid spatial cell size');
	}
	private key(x: number, z: number) {
		return `${Math.floor(x / this.cellSize)},${Math.floor(z / this.cellSize)}`;
	}
	set(id: string, value: T) {
		this.remove(id);
		const key = this.key(value.position.x, value.position.z);
		let cell = this.cells.get(key);
		if (!cell) this.cells.set(key, (cell = new Map()));
		cell.set(id, value);
		this.entries.set(id, { key, value });
	}
	upsert(id: string, value: T) {
		this.set(id, value);
	}
	remove(id: string) {
		const item = this.entries.get(id);
		if (!item) return;
		const cell = this.cells.get(item.key)!;
		cell.delete(id);
		if (!cell.size) this.cells.delete(item.key);
		this.entries.delete(id);
	}
	nearby(x: number, z: number, radius: number): T[] {
		if (!Number.isFinite(radius) || radius < 0) return [];
		const result: T[] = [];
		for (
			let cx = Math.floor((x - radius) / this.cellSize);
			cx <= Math.floor((x + radius) / this.cellSize);
			cx++
		)
			for (
				let cz = Math.floor((z - radius) / this.cellSize);
				cz <= Math.floor((z + radius) / this.cellSize);
				cz++
			)
				for (const value of this.cells.get(`${cx},${cz}`)?.values() ?? [])
					if (Math.hypot(value.position.x - x, value.position.z - z) <= radius) result.push(value);
		return result;
	}
	query(position: Vec3, radius: number) {
		return this.nearby(position.x, position.z, radius);
	}
	clear() {
		this.cells.clear();
		this.entries.clear();
	}
	get size() {
		return this.entries.size;
	}
}
