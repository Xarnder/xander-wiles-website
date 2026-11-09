import * as THREE from 'three';
import { compileCreature, type CompiledCreature } from './CreatureCompiler';
import { animateCreature } from './CreatureAnimationSystem';
import { CreatureGroundingController } from './CreatureGrounding';
import { rideFor, type RideProfile, type RideSeatKind } from './creatureRiding';
import {
	rideSeatAnchors,
	rideSeatLayout,
	type RideSeatAnchors,
	type RideSeatLayout
} from './RideSeat';
import { anchorToWorld } from './boneAnchors';
import type { CreatureDefinition, CreatureIntent } from './CreatureTypes';

/** Below this speed the mount stands (m/s); it only turns while moving, as a ridden one does. */
const MOVING_SPEED = 0.3;
/** How quickly the drawn heading follows the direction of travel, 1/s. */
const HEADING_EASE = 8;
/**
 * The rider's pose more than this far above the seat as drawn here means the mount is jumping
 * (`rideJump.ts`), metres: well over the gap a step's bob or sway can make.
 */
const JUMP_SLACK = 0.15;

/** Where the rider sits this frame, in world space. */
export interface RiddenSeat {
	kind: RideSeatKind;
	anchor: THREE.Vector3;
	/** The creature's heading (`atan2(x, z)`). */
	heading: number;
	hands: { left: THREE.Vector3 | null; right: THREE.Vector3 | null };
}

/**
 * Another player's mount (riding, Phase 3), drawn under their avatar from its recipe. The room only
 * sends the rider's pose, so the creature is placed where that pose puts its seat, faces the way it
 * has been travelling, steps at the pace of the rider's speed, and stands on this client's own
 * terrain. Its copy in this client's herd is held out while it's ridden.
 */
export class RiddenCreatureView {
	private creature: CompiledCreature | null = null;
	private grounding: CreatureGroundingController | null = null;
	private profile: RideProfile | null = null;
	private seat: RideSeatLayout | null = null;
	private anchors: RideSeatAnchors | null = null;
	private heading: number | null = null;
	private readonly last = new THREE.Vector3();
	private time = 0;
	private readonly seatWorld: RiddenSeat = {
		kind: 'neck',
		anchor: new THREE.Vector3(),
		heading: 0,
		hands: { left: null, right: null }
	};
	private readonly handScratch = [new THREE.Vector3(), new THREE.Vector3()] as const;
	private readonly offset = new THREE.Vector3();

	constructor(
		private readonly parent: THREE.Object3D,
		private readonly registerMaterial: (m: THREE.Material) => void
	) {}

	/** Shows `definition` as the mount (null when it can't be ridden). */
	attach(definition: CreatureDefinition): boolean {
		this.detach();
		const profile = rideFor(definition);
		if (!profile) return false;
		const compiled = compileCreature(definition, 1);
		for (const mesh of compiled.skinnedMeshes) {
			for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material])
				this.registerMaterial(m);
			mesh.castShadow = true;
			mesh.receiveShadow = true;
		}
		this.parent.add(compiled.object);
		this.creature = compiled;
		this.grounding = new CreatureGroundingController(compiled.compilation);
		this.profile = profile;
		this.seat = rideSeatLayout(compiled.compilation, profile.seat);
		this.anchors = rideSeatAnchors(compiled.compilation, this.seat);
		this.heading = null;
		return true;
	}

	detach(): void {
		this.creature?.object.removeFromParent();
		this.creature?.dispose();
		this.creature = null;
		this.grounding = null;
		this.profile = null;
		this.seat = null;
		this.anchors = null;
	}

	/**
	 * Places the mount so its seat is under `riderAnchor` (the support point the rider's pose puts
	 * them at), moving at `speed`, and returns where the rider sits on it this frame. `facing` (a
	 * creature heading) is used until it has moved enough to show which way it's going.
	 */
	update(
		riderAnchor: THREE.Vector3,
		facing: number,
		speed: number,
		dt: number,
		visible: boolean,
		surface: (x: number, z: number) => number
	): RiddenSeat | null {
		const creature = this.creature,
			seat = this.seat,
			anchors = this.anchors,
			profile = this.profile;
		if (!creature || !seat || !anchors || !profile) return null;
		creature.object.visible = visible;
		if (!visible) return null;
		this.time += Math.max(0, dt);
		// Face the way it's been travelling (the seat is near its centre, so the rider's path is its).
		const dx = riderAnchor.x - this.last.x,
			dz = riderAnchor.z - this.last.z;
		const moving = speed > MOVING_SPEED;
		if (this.heading === null) this.heading = facing;
		else if (moving && Math.hypot(dx, dz) > 1e-4) {
			const target = Math.atan2(dx, dz);
			const delta = Math.atan2(Math.sin(target - this.heading), Math.cos(target - this.heading));
			this.heading += delta * (1 - Math.exp(-HEADING_EASE * Math.max(0, dt)));
		}
		this.last.copy(riderAnchor);
		const heading = this.heading;
		// Root = anchor minus the seat's offset turned to the heading; height from the local terrain.
		this.offset.set(seat.pelvis.x, 0, seat.pelvis.z).applyAxisAngle(UP, heading);
		creature.object.position.set(riderAnchor.x - this.offset.x, 0, riderAnchor.z - this.offset.z);
		const ground = surface(creature.object.position.x, creature.object.position.z);
		creature.object.position.y = Number.isFinite(ground) ? ground : riderAnchor.y - seat.pelvis.y;
		const intent: CreatureIntent = {
			velocity: { x: Math.sin(heading) * speed, y: 0, z: Math.cos(heading) * speed },
			heading,
			angularVelocity: 0,
			gait: moving ? 'run' : 'idle'
		};
		animateCreature(creature, intent, this.time, Math.min(0.4, dt), surface, {
			grounding: this.grounding ?? undefined,
			lod: 1,
			maxCadence: profile.maxCadence
		});
		// The rider sits on the creature as drawn here, riding its bob and sway, so they never drift
		// apart.
		const out = this.seatWorld;
		out.kind = seat.kind;
		anchorToWorld(creature, anchors.pelvis, out.anchor);
		// Jumping: the room only has the rider's pose, so lift the whole mount (pose and all) to it.
		const lift = riderAnchor.y - out.anchor.y - JUMP_SLACK;
		if (lift > 0) {
			creature.object.position.y += lift;
			creature.object.updateMatrixWorld(true);
			anchorToWorld(creature, anchors.pelvis, out.anchor);
		}
		out.heading = heading;
		const { left, right } = anchors.hands;
		out.hands.left = left ? anchorToWorld(creature, left, this.handScratch[0]) : null;
		out.hands.right = right ? anchorToWorld(creature, right, this.handScratch[1]) : null;
		return out;
	}

	dispose(): void {
		this.detach();
	}
}

const UP = new THREE.Vector3(0, 1, 0);
