import * as THREE from 'three';
import type { CreatureRuntimeManager } from './CreatureRuntimeManager';

/** Badges show on carryable creatures within this many metres, fading out over the last 8 m. */
export const CARRY_HINT_RANGE = 25;
const FADE_FROM = CARRY_HINT_RANGE - 8;
const MAX_HINTS = 24;
/** On-screen badge size (fraction of the view height); the one under the crosshair is larger. */
const SIZE = 0.03;
const TARGET_SIZE = 0.042;

/**
 * Makes it easy to see which creatures can be picked up and used as a weapon: a small gold paw
 * badge floats above every small four-legged creature within reach of a short walk, bigger on the
 * one under the crosshair (and on the one the "nearest carryable" waypoint follows). Badges are
 * hidden behind terrain and walls (depth-tested), shape not just colour carries the meaning (a
 * paw), and nothing is allocated per frame once the pool is warm.
 */
export class CarryHints {
	readonly group = new THREE.Group();
	private readonly sprites: THREE.Sprite[] = [];
	private readonly texture: THREE.CanvasTexture;
	private readonly cameraPosition = new THREE.Vector3();
	private time = 0;
	/** How many badges were shown last frame (tests and diagnostics). */
	shown = 0;

	constructor() {
		this.group.name = 'carry-hints';
		this.texture = pawBadge();
	}

	/**
	 * `visible`: hints are on, and the player could pick something up (walking, not carrying).
	 * `targetId`: the creature under the crosshair; `followedId`: the waypoint's creature.
	 */
	update(
		creatures: CreatureRuntimeManager,
		camera: THREE.Camera,
		dt: number,
		visible: boolean,
		targetId: string | null,
		followedId: string | null,
		reducedMotion: boolean
	): void {
		this.time += Math.min(dt, 0.1);
		let used = 0;
		if (visible) {
			camera.getWorldPosition(this.cameraPosition);
			for (const [id, live] of creatures.live) {
				if (used >= MAX_HINTS) break;
				if (!creatures.isCarryable(id)) continue;
				const p = live.compiled.object.position;
				const distance = Math.hypot(p.x - this.cameraPosition.x, p.z - this.cameraPosition.z);
				if (distance > CARRY_HINT_RANGE) continue;
				const sprite = this.sprites[used] ?? this.createSprite();
				used++;
				const emphasised = id === targetId || id === followedId;
				const fade = Math.min(
					1,
					Math.max(0, (CARRY_HINT_RANGE - distance) / (CARRY_HINT_RANGE - FADE_FROM))
				);
				const bob = reducedMotion ? 0 : Math.sin(this.time * 2.2 + p.x * 0.7) * 0.06;
				sprite.position.set(
					p.x,
					p.y + live.compiled.compilation.collision.height + 0.35 + bob,
					p.z
				);
				const size = emphasised ? TARGET_SIZE : SIZE;
				sprite.scale.set(size, size, 1);
				sprite.material.opacity = emphasised ? 1 : 0.9 * fade;
				sprite.visible = true;
			}
		}
		for (let i = used; i < this.sprites.length; i++) this.sprites[i]!.visible = false;
		this.shown = used;
	}

	private createSprite(): THREE.Sprite {
		const sprite = new THREE.Sprite(
			new THREE.SpriteMaterial({
				map: this.texture,
				transparent: true,
				depthWrite: false,
				sizeAttenuation: false,
				fog: false,
				toneMapped: false
			})
		);
		sprite.name = 'carry-hint';
		sprite.center.set(0.5, 0);
		sprite.renderOrder = 15;
		this.group.add(sprite);
		this.sprites.push(sprite);
		return sprite;
	}

	dispose(): void {
		for (const sprite of this.sprites) sprite.material.dispose();
		this.texture.dispose();
		this.group.removeFromParent();
	}
}

/** A gold disc with a dark rim and a paw print: "you can pick this one up". */
function pawBadge(): THREE.CanvasTexture {
	const canvas = document.createElement('canvas');
	canvas.width = 64;
	canvas.height = 64;
	const ctx = canvas.getContext('2d')!;
	ctx.translate(32, 32);
	ctx.beginPath();
	ctx.arc(0, 0, 28, 0, Math.PI * 2);
	ctx.fillStyle = '#f2c14e';
	ctx.fill();
	ctx.lineWidth = 4;
	ctx.strokeStyle = 'rgba(4, 18, 31, 0.85)';
	ctx.stroke();
	ctx.fillStyle = '#3a2410';
	// Pad and four toes.
	ctx.beginPath();
	ctx.ellipse(0, 7, 10, 8.5, 0, 0, Math.PI * 2);
	ctx.fill();
	for (const [x, y, r] of [
		[-12, -4, 4.5],
		[-5, -11, 4.5],
		[5, -11, 4.5],
		[12, -4, 4.5]
	] as const) {
		ctx.beginPath();
		ctx.arc(x, y, r, 0, Math.PI * 2);
		ctx.fill();
	}
	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	return texture;
}
