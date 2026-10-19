import * as THREE from 'three';
import type { RemotePlayerView } from './NetSession';
import { POSE_FLAGS } from './protocol';
import { CharacterAssetCache } from '../characters/CharacterAssetCache';
import { CharacterInstance, type CharacterSurface } from '../characters/CharacterInstance';

/** Stride length of the walk cycle, m: one full bob cycle covers two steps. */
const STRIDE = 1.5;
const BOB_HEIGHT = 0.06;
const MAX_LEAN = 0.12;
const LABEL_HEIGHT = 2.12;
const LABEL_WORLD_HEIGHT = 0.3;
/** Avatars beyond this distance from the camera are not drawn at all. */
const DRAW_DISTANCE = 600;

interface Avatar {
	character: CharacterInstance | null;
	detailed: boolean;
	root: THREE.Group;
	body: THREE.Group;
	head: THREE.Group;
	label: THREE.Sprite;
	labelTexture: THREE.CanvasTexture;
	labelMaterial: THREE.SpriteMaterial;
	releaseLabelAo: () => void;
	bodyMaterial: THREE.MeshStandardMaterial;
	headMaterial: THREE.MeshStandardMaterial;
	name: string;
	colour: string;
	walkPhase: number;
	seenThisFrame: boolean;
}

/** Network adapter: owns identity labels, a shared asset cache and independent character rigs.
 * The existing capsule remains the loading/failure fallback and distant proxy.
 */
export class RemoteAvatarRenderer {
	readonly group = new THREE.Group();

	private readonly avatars = new Map<string, Avatar>();
	private readonly bodyGeometry = new THREE.CapsuleGeometry(0.3, 0.78, 6, 16);
	private readonly headGeometry = new THREE.SphereGeometry(0.22, 20, 14);
	private readonly visorGeometry = new THREE.BoxGeometry(0.3, 0.08, 0.08);
	private readonly visorMaterial = new THREE.MeshStandardMaterial({
		color: 0x1b1f24,
		roughness: 0.35,
		metalness: 0.1
	});
	private readonly assetCache = new CharacterAssetCache();
	private template: THREE.Group | null = null;
	private loading = false;
	private disposed = false;
	private readonly cameraPosition = new THREE.Vector3();

	constructor(
		private readonly registerMaterial: (material: THREE.Material) => void,
		private readonly excludeFromAo: (object: THREE.Object3D) => () => void,
		private readonly surface?: CharacterSurface
	) {
		this.group.name = 'remote-players';
		this.registerMaterial(this.visorMaterial);
	}

	get count(): number {
		return this.avatars.size;
	}

	update(views: RemotePlayerView[], deltaSeconds: number, camera: THREE.Camera): void {
		camera.getWorldPosition(this.cameraPosition);
		if (views.length && !this.loading) {
			this.loading = true;
			void this.assetCache
				.load()
				.then((template) => {
					if (!this.disposed) this.template = template;
				})
				.catch((error) => {
					if (!this.disposed)
						console.warn('Character asset unavailable; using fallback avatar.', error);
				});
		}
		let created = false; // Spread joins over frames rather than cloning all rigs in one frame.
		for (const avatar of this.avatars.values()) avatar.seenThisFrame = false;

		for (const { info, frame } of views) {
			let avatar = this.avatars.get(info.playerId);
			if (!avatar) {
				avatar = this.createAvatar(info.name, info.colour);
				this.avatars.set(info.playerId, avatar);
				this.group.add(avatar.root);
			} else if (avatar.name !== info.name || avatar.colour !== info.colour) {
				this.applyIdentity(avatar, info.name, info.colour);
			}
			avatar.seenThisFrame = true;
			if (this.template && !avatar.character && !created) {
				avatar.character = new CharacterInstance(this.template, info.colour, this.registerMaterial);
				avatar.root.add(avatar.character.object);
				created = true;
			}

			const away = (frame.flags & POSE_FLAGS.away) !== 0;
			const walking = Math.min(1, frame.speed / 4);
			avatar.walkPhase =
				(avatar.walkPhase + (frame.speed * deltaSeconds * Math.PI) / STRIDE) % (Math.PI * 2);
			const bob = Math.abs(Math.sin(avatar.walkPhase)) * BOB_HEIGHT * walking;

			avatar.root.position.set(frame.x, frame.y + (avatar.character ? 0 : bob), frame.z);
			avatar.root.rotation.y = frame.yaw;
			// Leaning into the direction of travel (−Z is forward, so a forward lean is a negative tilt).
			avatar.body.rotation.x = -Math.min(MAX_LEAN, frame.speed / 60);
			avatar.head.rotation.x = frame.pitch * 0.6;
			avatar.labelMaterial.opacity = away || frame.stale ? 0.45 : 1;
			const distance = avatar.root.position.distanceTo(this.cameraPosition);
			const detailed = !!avatar.character && distance < (avatar.detailed ? 110 : 90);
			avatar.detailed = detailed;
			avatar.body.visible = !detailed;
			if (avatar.character) {
				avatar.character.object.visible = detailed;
				if (detailed) avatar.character.update(frame, deltaSeconds, distance, this.surface);
			}
			avatar.root.visible =
				avatar.root.position.distanceToSquared(this.cameraPosition) < DRAW_DISTANCE * DRAW_DISTANCE;
		}

		for (const [playerId, avatar] of this.avatars) {
			if (avatar.seenThisFrame) continue;
			this.disposeAvatar(avatar);
			this.avatars.delete(playerId);
		}
	}

	dispose(): void {
		this.disposed = true;
		for (const avatar of this.avatars.values()) this.disposeAvatar(avatar);
		this.avatars.clear();
		this.bodyGeometry.dispose();
		this.headGeometry.dispose();
		this.visorGeometry.dispose();
		this.visorMaterial.dispose();
		this.group.removeFromParent();
		this.assetCache.dispose();
		this.template = null;
	}

	private createAvatar(name: string, colour: string): Avatar {
		const root = new THREE.Group();
		root.name = `remote-player:${name}`;

		const bodyMaterial = new THREE.MeshStandardMaterial({ color: colour, roughness: 0.65 });
		const headMaterial = new THREE.MeshStandardMaterial({ roughness: 0.6 });
		this.registerMaterial(bodyMaterial);
		this.registerMaterial(headMaterial);

		const body = new THREE.Group();
		const torso = new THREE.Mesh(this.bodyGeometry, bodyMaterial);
		// Capsule spans 0.02–1.40 m: feet at the pose's y.
		torso.position.y = 0.71;
		torso.castShadow = true;
		body.add(torso);

		const head = new THREE.Group();
		head.position.y = 1.62;
		const skull = new THREE.Mesh(this.headGeometry, headMaterial);
		skull.castShadow = true;
		head.add(skull);
		// A dark visor band on the front (−Z) shows which way the player is facing.
		const visor = new THREE.Mesh(this.visorGeometry, this.visorMaterial);
		visor.position.set(0, 0.03, -0.18);
		head.add(visor);
		body.add(head);
		root.add(body);

		const labelTexture = new THREE.CanvasTexture(document.createElement('canvas'));
		labelTexture.colorSpace = THREE.SRGBColorSpace;
		const labelMaterial = new THREE.SpriteMaterial({
			map: labelTexture,
			transparent: true,
			depthWrite: false,
			// Names are UI: keep their white lettering independent of scene exposure and fog.
			toneMapped: false,
			fog: false
		});
		const label = new THREE.Sprite(labelMaterial);
		label.position.y = LABEL_HEIGHT;
		label.renderOrder = 10;
		root.add(label);
		// GTAO replaces sprite materials with a solid normal/depth material. That replacement
		// ignores the label texture and billboarding, darkening the whole card from behind.
		// Keep the label in the colour pass only; the avatar still receives normal scene shading.
		const releaseLabelAo = this.excludeFromAo(label);

		const avatar: Avatar = {
			character: null,
			detailed: false,
			root,
			body,
			head,
			label,
			labelTexture,
			labelMaterial,
			releaseLabelAo,
			bodyMaterial,
			headMaterial,
			name: '',
			colour: '',
			walkPhase: 0,
			seenThisFrame: true
		};
		this.applyIdentity(avatar, name, colour);
		return avatar;
	}

	private applyIdentity(avatar: Avatar, name: string, colour: string): void {
		avatar.name = name;
		avatar.colour = colour;
		avatar.character?.setColour(colour);
		avatar.bodyMaterial.color.set(colour);
		avatar.headMaterial.color.set(colour).lerp(new THREE.Color(0xffffff), 0.35);
		avatar.root.name = `remote-player:${name}`;

		const canvas = avatar.labelTexture.image as HTMLCanvasElement;
		const scale = 2;
		const fontSize = 26 * scale;
		const context = canvas.getContext('2d');
		if (!context) return;
		context.font = `600 ${fontSize}px system-ui, -apple-system, sans-serif`;
		const textWidth = Math.ceil(context.measureText(name).width);
		const padX = 18 * scale;
		const dot = 14 * scale;
		canvas.width = textWidth + padX * 2 + dot + 10 * scale;
		canvas.height = fontSize + 22 * scale;
		context.font = `600 ${fontSize}px system-ui, -apple-system, sans-serif`;
		context.textBaseline = 'middle';
		context.fillStyle = 'rgba(12, 18, 16, 0.72)';
		roundRect(context, 0, 0, canvas.width, canvas.height, canvas.height / 2);
		context.fill();
		context.fillStyle = colour;
		context.beginPath();
		context.arc(padX + dot / 2, canvas.height / 2, dot / 2, 0, Math.PI * 2);
		context.fill();
		context.fillStyle = '#ffffff';
		context.fillText(name, padX + dot + 10 * scale, canvas.height / 2 + scale);
		avatar.labelTexture.needsUpdate = true;
		avatar.label.scale.set(
			(LABEL_WORLD_HEIGHT * canvas.width) / canvas.height,
			LABEL_WORLD_HEIGHT,
			1
		);
	}

	private disposeAvatar(avatar: Avatar): void {
		avatar.character?.dispose();
		avatar.releaseLabelAo();
		avatar.root.removeFromParent();
		avatar.bodyMaterial.dispose();
		avatar.headMaterial.dispose();
		avatar.labelMaterial.dispose();
		avatar.labelTexture.dispose();
	}
}

function roundRect(
	context: CanvasRenderingContext2D,
	x: number,
	y: number,
	width: number,
	height: number,
	radius: number
): void {
	const r = Math.min(radius, width / 2, height / 2);
	context.beginPath();
	context.moveTo(x + r, y);
	context.arcTo(x + width, y, x + width, y + height, r);
	context.arcTo(x + width, y + height, x, y + height, r);
	context.arcTo(x, y + height, x, y, r);
	context.arcTo(x, y, x + width, y, r);
	context.closePath();
}
