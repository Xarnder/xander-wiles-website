import { POSE_FLAGS } from '../net/protocol';
import { PLAYER_BODY } from './PlayerBodyDimensions';
import * as THREE from 'three';
import { CharacterAssetCache } from '../characters/CharacterAssetCache';
import { CharacterInstance, type CharacterRidePose } from '../characters/CharacterInstance';
import type { FirstPersonController } from './FirstPersonController';
import { SEATED_EYE_ABOVE_SUPPORT, SEATED_PELVIS_SUPPORT } from './PlayerInteractionPoseResolver';

/** The local player riding a creature: how they sit (the support point follows the eye). */
export interface LocalRidePose {
	kind: CharacterRidePose['kind'];
	hands: CharacterRidePose['hands'];
	/** Facing, in the player's yaw convention (the mesh faces -Z). */
	yaw: number;
	/** 0 standing … 1 seated. */
	blend: number;
}

/** The existing character asset and skeleton, attached only while a pose is in use. */
export class PlayerInteractionView {
	private readonly cache = new CharacterAssetCache();
	private readonly root = new THREE.Group();
	private character: CharacterInstance | null = null;
	private loading = false;
	private disposed = false;
	private readonly entry = new THREE.Vector3();
	private wasActive = false;
	constructor(
		private scene: THREE.Scene,
		private register: (m: THREE.Material) => void
	) {
		rootName(this.root);
	}
	/** The local character, once loaded (drawn in third person and during interactions). */
	get localCharacter(): CharacterInstance | null {
		return this.character;
	}
	update(
		player: FirstPersonController,
		dt = 1 / 60,
		building = false,
		ride: LocalRidePose | null = null
	): void {
		const pose = player.interactionPose;
		// Hide the avatar as the camera reaches the head in cramped rooms.
		this.root.visible = player.localAvatarVisible;
		if (!pose) this.wasActive = false;
		if (!pose && !player.thirdPerson) return;
		if (pose && !this.wasActive) {
			this.entry.copy(player.worldPosition);
			this.entry.y -= PLAYER_BODY.eyeHeight - PLAYER_BODY.pelvisHeight;
			this.wasActive = true;
		}
		this.ensureCharacter();
		if (ride) {
			// The seat's support point is a fixed height under the eye, at every blend: standing (blend
			// 0) that puts the feet on the ground, seated it puts the pelvis on the creature.
			this.root.position.copy(player.worldPosition);
			this.root.position.y -= SEATED_EYE_ABOVE_SUPPORT;
			this.root.rotation.y = ride.yaw;
			this.character?.poseRide(
				{
					kind: ride.kind,
					hands: ride.hands,
					blend: ride.blend,
					pelvisSupportOffset: SEATED_PELVIS_SUPPORT
				},
				dt
			);
			return;
		}
		if (!pose) {
			this.root.position.copy(player.worldPosition);
			this.root.position.y -= player.eyeHeight;
			this.root.rotation.y = player.getYaw();
			if (this.character) {
				this.character.object.position.set(0, 0, 0);
				this.character.object.rotation.set(0, 0, 0);
				this.character.update(
					{
						x: this.root.position.x,
						y: this.root.position.y,
						z: this.root.position.z,
						yaw: player.getYaw(),
						pitch: player.getPitch(),
						speed: 0,
						stale: false,
						flags:
							(player.isGrounded() ? POSE_FLAGS.grounded : 0) |
							(player.isFlying() ? POSE_FLAGS.flying : 0) |
							(player.isRunning() ? POSE_FLAGS.running : 0) |
							(building ? POSE_FLAGS.building : 0)
					},
					dt,
					0
				);
			}
			return;
		}
		this.root.position
			.copy(this.entry)
			.lerp(
				new THREE.Vector3(pose.anchor.x, pose.anchor.y, pose.anchor.z),
				player.interactionBlend
			);
		this.root.rotation.y = pose.yaw;
		this.character?.poseInteraction(pose, player.interactionBlend);
	}
	private ensureCharacter(): void {
		if (this.character || this.loading) return;
		this.loading = true;
		void this.cache
			.load()
			.then((template) => {
				if (this.disposed) return;
				this.character = new CharacterInstance(template, '#5b8e68', this.register);
				this.root.add(this.character.object);
				this.scene.add(this.root);
			})
			.catch((error) => {
				if (!this.disposed) console.warn('Interaction avatar unavailable', error);
			});
	}
	dispose(): void {
		this.disposed = true;
		this.character?.dispose();
		this.root.removeFromParent();
		this.cache.dispose();
	}
}
function rootName(root: THREE.Group) {
	root.name = 'local-interaction-avatar';
}
