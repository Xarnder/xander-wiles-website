import * as THREE from 'three';
import {
	DOOR_INTERACT_AIM_RADIUS,
	DOOR_INTERACT_MAX_DISTANCE,
	DOOR_SWING_SPEED,
	doorCollisionRect,
	doorTargetAngle,
	pickDoorAlongRay,
	stepAngleToward,
	type Vec3
} from './doorInteractionMath';
import type { HingeSide } from './openingVisualMath';
import type { WallCollisionRect } from './wallCollision';

export interface DoorInteractionControllerOptions {
	camera: THREE.Camera;
	getHingePivots: () => Iterable<readonly [string, THREE.Object3D]>;
	maxDistance?: number;
	aimRadius?: number;
	/** Fires when the door under the crosshair changes, including to `null` when you look away. */
	onLookedAtDoorChange?: (openingId: string | null) => void;
}

/**
 * Look-at door toggle — `K` swings the door under the crosshair open or closed. Open state is
 * keyed by opening id (not the Three.js pivot), so painting a wall or tweaking frame settings
 * rebuilds the leaf without slamming every door shut. `getCollisionRects()` exposes the leaf as a
 * live wall-style collider so a closed door blocks the doorway and an open one does not.
 */
export class DoorInteractionController {
	private readonly camera: THREE.Camera;
	private readonly getHingePivots: () => Iterable<readonly [string, THREE.Object3D]>;
	private readonly maxDistance: number;
	private readonly aimRadius: number;
	private readonly onLookedAtDoorChange?: (openingId: string | null) => void;
	private lookedAtDoorId: string | null = null;
	private readonly openById = new Set<string>();
	private readonly lookOrigin = new THREE.Vector3();
	private readonly lookDirection = new THREE.Vector3();
	private readonly aimWorld = new THREE.Vector3();
	private readonly leafDirection = new THREE.Vector3();

	private readonly handleKeyDown = (event: KeyboardEvent) => {
		if (event.code !== 'KeyK' || event.repeat || event.metaKey || event.ctrlKey || event.altKey) {
			return;
		}
		if (isTypingTarget(event.target)) return;
		this.toggleLookedAtDoor();
	};

	constructor(options: DoorInteractionControllerOptions) {
		this.camera = options.camera;
		this.getHingePivots = options.getHingePivots;
		this.maxDistance = options.maxDistance ?? DOOR_INTERACT_MAX_DISTANCE;
		this.aimRadius = options.aimRadius ?? DOOR_INTERACT_AIM_RADIUS;
		this.onLookedAtDoorChange = options.onLookedAtDoorChange;
		window.addEventListener('keydown', this.handleKeyDown);
	}

	isOpen(openingId: string): boolean {
		return this.openById.has(openingId);
	}

	/** The door currently under the crosshair, or `null` if none is in range. */
	getLookedAtDoor(): string | null {
		return this.lookedAtDoorId;
	}

	/** One oriented box per live door leaf — closed fills the doorway; open sits beside it. */
	getCollisionRects(): WallCollisionRect[] {
		const rects: WallCollisionRect[] = [];
		for (const [, pivot] of this.getHingePivots()) {
			const rect = this.collisionRectFor(pivot);
			if (rect) rects.push(rect);
		}
		return rects;
	}

	/** Returns the opening id that toggled, or `null` if nothing was under the crosshair. */
	toggleLookedAtDoor(): string | null {
		const id = this.pickLookedAtDoor();
		if (!id) return null;
		if (this.openById.has(id)) this.openById.delete(id);
		else this.openById.add(id);
		return id;
	}

	update(deltaSeconds: number): void {
		const maxStep = DOOR_SWING_SPEED * Math.max(0, deltaSeconds);
		const liveIds = new Set<string>();
		for (const [id, pivot] of this.getHingePivots()) {
			liveIds.add(id);
			const hingeSide = (pivot.userData.hingeSide as HingeSide | undefined) ?? 'left';
			const target = doorTargetAngle(hingeSide, this.openById.has(id));
			pivot.rotation.y = stepAngleToward(pivot.rotation.y, target, maxStep);
		}
		for (const id of Array.from(this.openById)) {
			if (!liveIds.has(id)) this.openById.delete(id);
		}
		this.refreshLookedAtDoor();
	}

	dispose(): void {
		window.removeEventListener('keydown', this.handleKeyDown);
		this.openById.clear();
		this.setLookedAtDoor(null);
	}

	private refreshLookedAtDoor(): void {
		this.setLookedAtDoor(this.pickLookedAtDoor());
	}

	private setLookedAtDoor(openingId: string | null): void {
		if (openingId === this.lookedAtDoorId) return;
		this.lookedAtDoorId = openingId;
		this.onLookedAtDoorChange?.(openingId);
	}

	private pickLookedAtDoor(): string | null {
		this.camera.getWorldPosition(this.lookOrigin);
		this.camera.getWorldDirection(this.lookDirection);
		const origin: Vec3 = {
			x: this.lookOrigin.x,
			y: this.lookOrigin.y,
			z: this.lookOrigin.z
		};
		const direction: Vec3 = {
			x: this.lookDirection.x,
			y: this.lookDirection.y,
			z: this.lookDirection.z
		};
		const candidates: { id: string; aim: Vec3 }[] = [];
		for (const [id, pivot] of this.getHingePivots()) {
			const aim = this.aimWorldOf(pivot);
			if (!aim) continue;
			candidates.push({ id, aim });
		}
		return pickDoorAlongRay(origin, direction, candidates, this.maxDistance, this.aimRadius);
	}

	private collisionRectFor(pivot: THREE.Object3D): WallCollisionRect | null {
		const minU = pivot.userData.minU;
		const maxU = pivot.userData.maxU;
		const minY = pivot.userData.minY;
		const maxY = pivot.userData.maxY;
		if (
			typeof minU !== 'number' ||
			typeof maxU !== 'number' ||
			typeof minY !== 'number' ||
			typeof maxY !== 'number'
		) {
			return null;
		}
		const hingeSide = (pivot.userData.hingeSide as HingeSide | undefined) ?? 'left';
		const wallThickness =
			typeof pivot.userData.wallThickness === 'number' ? pivot.userData.wallThickness : 0.2;
		const doorThickness =
			typeof pivot.userData.doorThickness === 'number' ? pivot.userData.doorThickness : 0.04;
		const leafWidth =
			typeof pivot.userData.leafWidth === 'number' ? pivot.userData.leafWidth : maxU - minU;
		const leafHeight =
			typeof pivot.userData.leafHeight === 'number' ? pivot.userData.leafHeight : maxY - minY;

		pivot.updateWorldMatrix(true, false);
		pivot.getWorldPosition(this.aimWorld);
		const hingeX = this.aimWorld.x;
		const hingeY = this.aimWorld.y;
		const hingeZ = this.aimWorld.z;

		this.leafDirection.set(hingeSide === 'left' ? 1 : -1, 0, 0);
		this.leafDirection.transformDirection(pivot.matrixWorld);
		this.leafDirection.y = 0;
		if (this.leafDirection.lengthSq() < 1e-10) return null;
		this.leafDirection.normalize();

		const parent = pivot.parent;
		let openingCenterX = hingeX;
		let openingCenterZ = hingeZ;
		let openingMinY = hingeY;
		let wallDirX = this.leafDirection.x;
		let wallDirZ = this.leafDirection.z;
		if (parent) {
			this.aimWorld.set((minU + maxU) / 2, minY, 0);
			parent.localToWorld(this.aimWorld);
			openingCenterX = this.aimWorld.x;
			openingCenterZ = this.aimWorld.z;
			openingMinY = this.aimWorld.y;
			this.aimWorld.set(1, 0, 0);
			this.aimWorld.transformDirection(parent.matrixWorld);
			this.aimWorld.y = 0;
			if (this.aimWorld.lengthSq() > 1e-10) {
				this.aimWorld.normalize();
				wallDirX = this.aimWorld.x;
				wallDirZ = this.aimWorld.z;
			}
		}

		return doorCollisionRect({
			angle: pivot.rotation.y,
			hingeX,
			hingeY,
			hingeZ,
			leafDirX: this.leafDirection.x,
			leafDirZ: this.leafDirection.z,
			openingCenterX,
			openingCenterZ,
			openingMinY,
			wallDirX,
			wallDirZ,
			openingWidth: maxU - minU,
			openingHeight: maxY - minY,
			leafWidth,
			leafHeight,
			wallHalfThickness: wallThickness / 2,
			leafHalfThickness: doorThickness / 2
		});
	}

	private aimWorldOf(pivot: THREE.Object3D): Vec3 | null {
		const parent = pivot.parent;
		const aimU = pivot.userData.aimU;
		const aimY = pivot.userData.aimY;
		if (parent && typeof aimU === 'number' && typeof aimY === 'number') {
			this.aimWorld.set(aimU, aimY, 0);
			parent.localToWorld(this.aimWorld);
			return { x: this.aimWorld.x, y: this.aimWorld.y, z: this.aimWorld.z };
		}
		pivot.getWorldPosition(this.aimWorld);
		return { x: this.aimWorld.x, y: this.aimWorld.y, z: this.aimWorld.z };
	}
}

function isTypingTarget(target: EventTarget | null): boolean {
	if (!target || typeof target !== 'object') return false;
	const element = target as { tagName?: string; isContentEditable?: boolean };
	const tag = element.tagName;
	return (
		tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || element.isContentEditable === true
	);
}
