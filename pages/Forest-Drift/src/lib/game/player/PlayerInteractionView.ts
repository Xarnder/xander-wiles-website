import { PLAYER_BODY } from './PlayerBodyDimensions';
import * as THREE from 'three';
import { CharacterAssetCache } from '../characters/CharacterAssetCache';
import { CharacterInstance } from '../characters/CharacterInstance';
import type { FirstPersonController } from './FirstPersonController';
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
	update(player: FirstPersonController): void {
		const pose = player.interactionPose;
		this.root.visible = !!pose && player.interactionThirdPerson;
		if (!pose) {
			this.wasActive = false;
			return;
		}
		if (!this.wasActive) {
			this.entry.copy(player.worldPosition);
			this.entry.y -= PLAYER_BODY.eyeHeight - PLAYER_BODY.pelvisHeight;
			this.wasActive = true;
		}
		if (!this.character && !this.loading) {
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
		this.root.position
			.copy(this.entry)
			.lerp(
				new THREE.Vector3(pose.anchor.x, pose.anchor.y, pose.anchor.z),
				player.interactionBlend
			);
		this.root.rotation.y = pose.yaw;
		this.character?.poseInteraction(pose, player.interactionBlend);
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
