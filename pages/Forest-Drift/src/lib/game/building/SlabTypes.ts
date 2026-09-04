import type { BuildingGridPoint } from './FoundationLocalMath';

export type SlabType = 'ceiling' | 'floor' | 'flat-roof';

/**
 * A horizontal, filled polygon slab — the shared representation behind ceilings, upper floors, and
 * flat roofs (see SlabGeometryBuilder.ts; all three use exactly the same triangulation/extrusion).
 * `type` only affects material and HUD text, never geometry — see the README's "Ceiling/floor
 * sharing" section for why a single physical slab can legitimately serve as both a room's ceiling
 * and the floor above it, without needing a separate "usages" flag: creating a ceiling and a floor
 * at the same `localY` over an overlapping polygon is simply rejected by the same-level overlap
 * rule every other slab placement already goes through.
 *
 * `localY` is the slab's TOP surface (the walkable one) — preferred over a bottom/centre convention
 * because player grounding and future object placement only ever care about the top. Points are
 * foundation-local building-grid integers, exactly like a wall's endpoints — never world-space.
 */
export interface SlabDefinition {
	id: string;
	foundationId: string;
	type: SlabType;
	levelIndex: number;
	localY: number;
	thickness: number;
	points: BuildingGridPoint[];
}

/** `slab.localY - slab.thickness`, i.e. the slab's underside — see SlabDefinition's doc comment. */
export function slabBottomY(slab: Pick<SlabDefinition, 'localY' | 'thickness'>): number {
	return slab.localY - slab.thickness;
}
