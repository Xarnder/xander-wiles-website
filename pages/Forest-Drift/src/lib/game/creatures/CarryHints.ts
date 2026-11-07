import * as THREE from 'three';
import type { CreatureRuntimeManager } from './CreatureRuntimeManager';

/** Badges show on carryable creatures within this many metres, fading out over the last 8 m. */
export const CARRY_HINT_RANGE = 25;
const FADE_FROM = CARRY_HINT_RANGE - 8;
const MAX_HINTS = 24;
/** On-screen badge size (fraction of the view height); the one under the crosshair is larger. */
const SIZE = 0.03;
const TARGET_SIZE = 0.042;

/** Which badges to show this frame. */
export interface CreatureHintOptions {
	/** Paw badges over creatures that can be picked up. */
	carry: boolean;
	/** Saddle badges over creatures that can be ridden (riding Q20). */
	ride: boolean;
	/** Never badged: the creature being ridden. */
	riddenId: string | null;
}

/**
 * Makes it easy to see which creatures can be picked up (and used as a weapon) or ridden: a small
 * badge floats above each within reach of a short walk — a gold paw disc over small four-legged
 * creatures, a teal saddle square over two-legged ones — bigger on the one under the crosshair
 * (and on the one a "nearest" waypoint follows). Badges are hidden behind terrain and walls
 * (depth-tested), shape not just colour carries the meaning, and nothing is allocated per frame
 * once the pool is warm.
 */
export class CarryHints {
	readonly group = new THREE.Group();
	private readonly sprites: THREE.Sprite[] = [];
	private readonly texture: THREE.CanvasTexture;
	private readonly rideTexture: THREE.CanvasTexture;
	private readonly cameraPosition = new THREE.Vector3();
	private time = 0;
	/** How many badges were shown last frame (tests and diagnostics). */
	shown = 0;

	constructor() {
		this.group.name = 'carry-hints';
		this.texture = pawBadge();
		this.rideTexture = saddleBadge();
	}

	/**
	 * `show`: which kinds of badge are wanted now. `targetId`: the creature under the crosshair;
	 * `followedIds`: the creatures waypoints follow.
	 */
	update(
		creatures: CreatureRuntimeManager,
		camera: THREE.Camera,
		dt: number,
		show: CreatureHintOptions,
		targetId: string | null,
		followedIds: readonly string[],
		reducedMotion: boolean
	): void {
		this.time += Math.min(dt, 0.1);
		let used = 0;
		if (show.carry || show.ride) {
			camera.getWorldPosition(this.cameraPosition);
			for (const [id, live] of creatures.live) {
				if (used >= MAX_HINTS) break;
				const texture =
					show.carry && creatures.isCarryable(id)
						? this.texture
						: show.ride && id !== show.riddenId && creatures.isRideable(id)
							? this.rideTexture
							: null;
				if (!texture) continue;
				const p = live.compiled.object.position;
				const distance = Math.hypot(p.x - this.cameraPosition.x, p.z - this.cameraPosition.z);
				if (distance > CARRY_HINT_RANGE) continue;
				const sprite = this.sprites[used] ?? this.createSprite();
				used++;
				if (sprite.material.map !== texture) {
					sprite.material.map = texture;
					sprite.material.needsUpdate = true;
				}
				const emphasised = id === targetId || followedIds.includes(id);
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
		this.rideTexture.dispose();
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

/**
 * A teal rounded square with a dark rim and a saddle over a stirrup: "you can ride this one". A
 * different shape from the paw disc, so the two read apart without colour.
 */
function saddleBadge(): THREE.CanvasTexture {
	const canvas = document.createElement('canvas');
	canvas.width = 64;
	canvas.height = 64;
	const ctx = canvas.getContext('2d')!;
	ctx.beginPath();
	ctx.roundRect(5, 5, 54, 54, 12);
	ctx.fillStyle = '#5fd0c2';
	ctx.fill();
	ctx.lineWidth = 4;
	ctx.strokeStyle = 'rgba(4, 18, 31, 0.85)';
	ctx.stroke();
	ctx.fillStyle = '#123a36';
	ctx.strokeStyle = '#123a36';
	// Saddle: a seat curving up at both ends.
	ctx.beginPath();
	ctx.moveTo(14, 26);
	ctx.quadraticCurveTo(32, 14, 50, 26);
	ctx.lineTo(44, 34);
	ctx.lineTo(20, 34);
	ctx.closePath();
	ctx.fill();
	// Stirrup strap and loop.
	ctx.lineWidth = 3.5;
	ctx.beginPath();
	ctx.moveTo(32, 34);
	ctx.lineTo(32, 42);
	ctx.stroke();
	ctx.beginPath();
	ctx.moveTo(25, 48);
	ctx.lineTo(39, 48);
	ctx.lineTo(36, 42);
	ctx.lineTo(28, 42);
	ctx.closePath();
	ctx.stroke();
	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	return texture;
}
