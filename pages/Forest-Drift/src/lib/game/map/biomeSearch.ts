/**
 * Find a biome (technical plan §3): a coarse scan of the biomes round the player, and the patches
 * of one biome found from it. Pure: no DOM and no worker globals. It takes a `classify` function,
 * so tests can use made-up layouts; the map worker passes the world's `BiomeField.classifyPoint`.
 */

/** Metres between scanned points. */
export const SCAN_SPACING = 64;
/** How far the scan reaches, in metres (Q3). */
export const SCAN_RANGE = 16_000;
/** Rings (cells from the centre to the edge). */
export const SCAN_RINGS = Math.ceil(SCAN_RANGE / SCAN_SPACING);
/** Cells along a side of the grid. */
export const SCAN_SIDE = 2 * SCAN_RINGS + 1;
/** Patches `find` returns at most (Q4). */
export const PATCH_COUNT = 5;
/** Least distance between two patches' pins, in metres (Q4). */
export const PATCH_SEPARATION = 1000;
/**
 * How far in from another biome's cells a pin aims to be, in cells (Q6). Three cells is 192 m from
 * the nearest other-biome cell; the border lies somewhere in the last 64 m, so the pin is at least
 * 128 m inside, which meets "at least 100 m in".
 */
export const PATCH_INSET_CELLS = 3;
/**
 * A patch whose most-inside cell is fewer cells in than this (under about 190 m across) is a speck,
 * usually on a border between two other biomes; `patches` passes over specks unless a biome has
 * nothing bigger in range.
 */
export const PATCH_MIN_INSET_CELLS = 2;

/** Biome index at a point, or -1 for none. */
export type Classify = (x: number, z: number) => number;

/** A patch's pin: a spot well inside it, and how far it is from the scan's centre. */
export interface BiomePatch {
	x: number;
	z: number;
	/** Metres from the scan's centre. */
	distance: number;
	/** Cells in the patch (within the scan). */
	cells: number;
	/** Metres from the pin to the nearest other-biome cell (or the edge of the scan). */
	inset: number;
}

/** Cells in ring `r` (the square of cells `r` from the centre in x or z). */
const ringLength = (r: number) => (r === 0 ? 1 : 8 * r);

/** The `k`th cell of ring `r`, as offsets from the centre, written to `out`. */
function ringCell(r: number, k: number, out: { di: number; dj: number }) {
	if (r === 0) {
		out.di = 0;
		out.dj = 0;
		return;
	}
	const side = Math.floor(k / (2 * r));
	const t = k - side * 2 * r;
	if (side === 0) {
		out.di = -r + t;
		out.dj = -r;
	} else if (side === 1) {
		out.di = r;
		out.dj = -r + t;
	} else if (side === 2) {
		out.di = r - t;
		out.dj = r;
	} else {
		out.di = -r;
		out.dj = r - t;
	}
}

const CHECK_EVERY = 64;

/**
 * A scan of the biomes round a point: a square grid of cells `SCAN_SPACING` apart, `SCAN_RANGE`
 * each way, filled ring by ring (nearest first) so it can run in slices. Cells beyond `SCAN_RANGE`
 * in a straight line (the corners) are skipped. A byte per cell: about 245 KB.
 */
export class BiomeScan {
	/** Biome index per cell, -1 where not scanned (yet) or no biome. Row-major, `j * SCAN_SIDE + i`. */
	readonly cells = new Int8Array(SCAN_SIDE * SCAN_SIDE).fill(-1);
	/** Biome under the centre, or -1. */
	here = -1;
	/** Points classified so far. */
	sampled = 0;
	/** Time spent in `step`, in milliseconds. */
	ms = 0;
	private ring = 0;
	private k = 0;
	/** Biomes seen at least once. */
	private readonly present: Uint8Array;
	/** Distance to each biome's nearest pin, filled in after the rings (null: none). */
	private readonly summary: (number | null)[] = [];
	private readonly cell = { di: 0, dj: 0 };

	constructor(
		readonly x: number,
		readonly z: number,
		private readonly classify: Classify,
		readonly biomeCount: number
	) {
		this.present = new Uint8Array(biomeCount);
	}

	/** Every cell is classified and every biome's nearest pin is found. */
	get done(): boolean {
		return this.summary.length === this.biomeCount;
	}

	/** Share of the work done, 0–1 (the rings; the pins after them are quick). */
	get progress(): number {
		return this.done ? 1 : Math.min(0.99, this.ring / (SCAN_RINGS + 1));
	}

	/**
	 * Scans for up to `budgetMs`, then stops between cells. After the rings, it finds each biome's
	 * nearest pin (`patches(b, 1)`, about a millisecond each), so the list's distances are where
	 * Find would put the pin. Returns true when the scan is complete. `now` is the clock (tests pass
	 * a fake one).
	 */
	step(budgetMs: number, now: () => number = () => performance.now()): boolean {
		const start = now();
		const limit = SCAN_RINGS * SCAN_RINGS;
		const cell = this.cell;
		let n = 0;
		while (this.ring <= SCAN_RINGS) {
			const r = this.ring;
			ringCell(r, this.k, cell);
			const d2 = cell.di * cell.di + cell.dj * cell.dj;
			if (d2 <= limit) {
				const biome = this.classify(
					this.x + cell.di * SCAN_SPACING,
					this.z + cell.dj * SCAN_SPACING
				);
				this.sampled++;
				if (biome >= 0 && biome < this.biomeCount) {
					this.cells[(cell.dj + SCAN_RINGS) * SCAN_SIDE + cell.di + SCAN_RINGS] = biome;
					this.present[biome] = 1;
					if (r === 0) this.here = biome;
				}
			}
			if (++this.k >= ringLength(r)) {
				this.ring++;
				this.k = 0;
			}
			if (++n % CHECK_EVERY === 0 && now() - start >= budgetMs) break;
		}
		if (this.ring > SCAN_RINGS)
			while (this.summary.length < this.biomeCount) {
				const b = this.summary.length;
				this.summary.push(this.present[b] ? (this.patches(b, 1)[0]?.distance ?? null) : null);
				if (now() - start >= budgetMs) break;
			}
		this.ms += now() - start;
		return this.done;
	}

	/** Runs the whole scan at once. */
	run(): this {
		while (!this.step(Infinity));
		return this;
	}

	/**
	 * Metres to each biome's nearest pin (what `patches(b)[0]` gives), or null for none within
	 * range. Empty until the scan is done. For the biome you're in, it's the nearest *other* patch.
	 */
	nearest(): (number | null)[] {
		return this.done ? [...this.summary] : [];
	}

	/** Biome of the cell at offsets (di, dj) from the centre, or -1 outside the grid. */
	at(di: number, dj: number): number {
		if (Math.abs(di) > SCAN_RINGS || Math.abs(dj) > SCAN_RINGS) return -1;
		return this.cells[(dj + SCAN_RINGS) * SCAN_SIDE + di + SCAN_RINGS];
	}

	/**
	 * The nearest separate patches of `biome` (technical plan §3.2), nearest first: up to `count`,
	 * whose pins are at least `separation` metres apart. The patch under the centre is left out
	 * when it's this biome (Q10). Each pin is the nearest cell at least `PATCH_INSET_CELLS` in from
	 * any other biome, or the most-inside cell of a thinner patch. Best run on a finished scan.
	 */
	patches(biome: number, count = PATCH_COUNT, separation = PATCH_SEPARATION): BiomePatch[] {
		const side = SCAN_SIDE;
		const cells = this.cells;
		const seen = new Uint8Array(cells.length);
		const candidates: BiomePatch[] = [];
		const specks: BiomePatch[] = [];
		let chosen: BiomePatch[] = [];
		let dirty = false;
		const cell = { di: 0, dj: 0 };
		const stack: number[] = [];
		const members: number[] = [];
		const centre = SCAN_RINGS * side + SCAN_RINGS;

		for (let r = 0; r <= SCAN_RINGS; r++) {
			// Every cell on ring r or later is at least r cells away, so no patch still to be found can
			// beat a pin nearer than that: once `count` are chosen within it, stop.
			if (dirty) {
				chosen = choose(candidates, count, separation);
				dirty = false;
			}
			if (chosen.length >= count && chosen[count - 1].distance <= r * SCAN_SPACING) break;
			const length = ringLength(r);
			for (let k = 0; k < length; k++) {
				ringCell(r, k, cell);
				const start = (cell.dj + SCAN_RINGS) * side + cell.di + SCAN_RINGS;
				if (cells[start] !== biome || seen[start]) continue;
				// Flood-fill the patch (8-connected).
				members.length = 0;
				stack.length = 0;
				stack.push(start);
				seen[start] = 1;
				let minI = side,
					maxI = -1,
					minJ = side,
					maxJ = -1;
				let underCentre = false;
				while (stack.length) {
					const index = stack.pop()!;
					members.push(index);
					if (index === centre) underCentre = true;
					const i = index % side,
						j = (index - i) / side;
					if (i < minI) minI = i;
					if (i > maxI) maxI = i;
					if (j < minJ) minJ = j;
					if (j > maxJ) maxJ = j;
					for (let dj = -1; dj <= 1; dj++) {
						const nj = j + dj;
						if (nj < 0 || nj >= side) continue;
						for (let di = -1; di <= 1; di++) {
							const ni = i + di;
							if ((di === 0 && dj === 0) || ni < 0 || ni >= side) continue;
							const next = nj * side + ni;
							if (cells[next] === biome && !seen[next]) {
								seen[next] = 1;
								stack.push(next);
							}
						}
					}
				}
				if (underCentre) continue;
				const patch = this.pin(members, minI, maxI, minJ, maxJ);
				if (patch.inset < PATCH_MIN_INSET_CELLS * SCAN_SPACING) specks.push(patch);
				else {
					candidates.push(patch);
					dirty = true;
				}
			}
		}
		if (dirty) chosen = choose(candidates, count, separation);
		return chosen.length ? chosen : choose(specks, count, separation);
	}

	/**
	 * A patch's pin: a chamfer distance-to-edge over the patch's bounding box (one cell larger each
	 * way, so the box's border counts as "not this patch"), then the nearest cell at least
	 * `PATCH_INSET_CELLS` in, or as far in as the patch allows.
	 */
	private pin(
		members: readonly number[],
		minI: number,
		maxI: number,
		minJ: number,
		maxJ: number
	): BiomePatch {
		const side = SCAN_SIDE;
		const w = maxI - minI + 3,
			h = maxJ - minJ + 3;
		const field = new Float32Array(w * h);
		for (const index of members) {
			const i = index % side,
				j = (index - i) / side;
			field[(j - minJ + 1) * w + (i - minI + 1)] = Infinity;
		}
		// Two passes of the 3–4 chamfer, scaled to cells (1 and √2).
		const D = Math.SQRT2;
		for (let y = 1; y < h - 1; y++)
			for (let x = 1; x < w - 1; x++) {
				const at = y * w + x;
				if (field[at] === 0) continue;
				field[at] = Math.min(
					field[at],
					field[at - 1] + 1,
					field[at - w] + 1,
					field[at - w - 1] + D,
					field[at - w + 1] + D
				);
			}
		let deepest = 0;
		for (let y = h - 2; y >= 1; y--)
			for (let x = w - 2; x >= 1; x--) {
				const at = y * w + x;
				if (field[at] === 0) continue;
				field[at] = Math.min(
					field[at],
					field[at + 1] + 1,
					field[at + w] + 1,
					field[at + w + 1] + D,
					field[at + w - 1] + D
				);
				if (field[at] > deepest) deepest = field[at];
			}
		const want = Math.min(PATCH_INSET_CELLS, deepest);
		let bestD2 = Infinity,
			bestI = 0,
			bestJ = 0,
			bestInset = 0;
		for (const index of members) {
			const i = index % side,
				j = (index - i) / side;
			const inset = field[(j - minJ + 1) * w + (i - minI + 1)];
			if (inset < want - 1e-6) continue;
			const di = i - SCAN_RINGS,
				dj = j - SCAN_RINGS;
			const d2 = di * di + dj * dj;
			if (d2 < bestD2) {
				bestD2 = d2;
				bestI = di;
				bestJ = dj;
				bestInset = inset;
			}
		}
		return {
			x: this.x + bestI * SCAN_SPACING,
			z: this.z + bestJ * SCAN_SPACING,
			distance: Math.round(Math.sqrt(bestD2) * SCAN_SPACING),
			cells: members.length,
			inset: Math.round(bestInset * SCAN_SPACING)
		};
	}
}

/** Nearest first, skipping any within `separation` of one already chosen. */
function choose(candidates: readonly BiomePatch[], count: number, separation: number) {
	const sorted = [...candidates].sort((a, b) => a.distance - b.distance);
	const chosen: BiomePatch[] = [];
	for (const patch of sorted) {
		if (chosen.length >= count) break;
		if (chosen.some((p) => Math.hypot(p.x - patch.x, p.z - patch.z) < separation)) continue;
		chosen.push(patch);
	}
	return chosen;
}
