import type * as THREE from 'three';
import type { CompiledCreature } from './CreatureCompiler';
import type { BoneAnchor } from './RideSeat';

/*
 * Points fixed to a compiled creature's bones, in world space: they move with the bone's bob,
 * sway and tilt (riding: the seat and the rider's hand holds).
 */

/** A point on one of a compiled creature's bones (in that bone's space), in world space. */
export function boneToWorld(
	compiled: CompiledCreature,
	bone: string,
	offset: { x: number; y: number; z: number },
	out: THREE.Vector3
): THREE.Vector3 {
	const node = compiled.bonesById.get(bone) ?? compiled.object;
	return out.set(offset.x, offset.y, offset.z).applyMatrix4(node.matrixWorld);
}

/** A bone-fixed point (see `RideSeat.rideSeatAnchors`), in world space. */
export function anchorToWorld(
	compiled: CompiledCreature,
	anchor: BoneAnchor,
	out: THREE.Vector3
): THREE.Vector3 {
	return boneToWorld(compiled, anchor.bone, anchor.offset, out);
}
