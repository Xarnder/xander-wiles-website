import { Bone, Quaternion, Vector3 } from 'three';

/** Scratch belongs to one solver; no allocations or assumptions about imported local bone axes. */
export class TwoBoneIK {
	private hipPosition = new Vector3();
	private kneePosition = new Vector3();
	private footPosition = new Vector3();
	private direction = new Vector3();
	private bend = new Vector3();
	private desiredKnee = new Vector3();
	private from = new Vector3();
	private to = new Vector3();
	private rotation = new Quaternion();
	private parentRotation = new Quaternion();
	private worldRotation = new Quaternion();
	solve(hip: Bone, knee: Bone, foot: Bone, target: Vector3, pole: Vector3): void {
		hip.getWorldPosition(this.hipPosition);
		knee.getWorldPosition(this.kneePosition);
		foot.getWorldPosition(this.footPosition);
		const upper = this.hipPosition.distanceTo(this.kneePosition);
		const lower = this.kneePosition.distanceTo(this.footPosition);
		if (upper < 1e-6 || lower < 1e-6) return;
		this.direction.subVectors(target, this.hipPosition);
		const distance = Math.max(
			Math.abs(upper - lower) + 1e-5,
			Math.min(upper + lower - 1e-5, this.direction.length())
		);
		if (this.direction.lengthSq() < 1e-10) this.direction.set(0, -1, 0);
		this.direction.normalize();
		this.bend.copy(pole).addScaledVector(this.direction, -pole.dot(this.direction));
		if (this.bend.lengthSq() < 1e-8) {
			this.bend.set(1, 0, 0).addScaledVector(this.direction, -this.direction.x);
			if (this.bend.lengthSq() < 1e-8) this.bend.set(0, 0, 1);
		}
		this.bend.normalize();
		const along = (upper * upper + distance * distance - lower * lower) / (2 * distance);
		this.desiredKnee
			.copy(this.hipPosition)
			.addScaledVector(this.direction, along)
			.addScaledVector(this.bend, Math.sqrt(Math.max(0, upper * upper - along * along)));
		this.rotate(hip, this.kneePosition, this.desiredKnee);
		knee.updateWorldMatrix(true, true);
		foot.getWorldPosition(this.footPosition);
		// Use the reachable endpoint; an unreachable input must not bend the second joint backwards.
		this.to.copy(this.hipPosition).addScaledVector(this.direction, distance);
		this.rotate(knee, this.footPosition, this.to);
	}
	private rotate(bone: Bone, currentEnd: Vector3, desiredEnd: Vector3): void {
		bone.getWorldPosition(this.from);
		this.worldRotation.copy(bone.getWorldQuaternion(this.worldRotation));
		// Preserve the existing twist, rotating its current world-space axis toward the target.
		this.to.subVectors(desiredEnd, this.from).normalize();
		this.from.subVectors(currentEnd, this.from).normalize();
		this.rotation.setFromUnitVectors(this.from, this.to).multiply(this.worldRotation);
		bone.parent!.getWorldQuaternion(this.parentRotation).invert();
		bone.quaternion.copy(this.parentRotation.multiply(this.rotation));
		bone.updateWorldMatrix(false, true);
	}
}
