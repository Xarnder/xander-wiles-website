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
import type { HingeSide, UvRect } from './openingVisualMath';
import type { WallCollisionRect } from './wallCollision';
import { SHUTTER_SWING_DURATION, shutterSwingAngle } from './windowShutterMath';

export interface OpeningInteractionState {
	id: string;
	open: boolean;
	kind: 'door' | 'shutters';
}

export interface DoorInteractionControllerOptions {
	camera: THREE.Camera;
	getHingePivots: () => Iterable<readonly [string, THREE.Object3D]>;
	maxDistance?: number;
	aimRadius?: number;
	/** Fires when the interactive opening under the crosshair changes, including to `null` when you look away. */
	onLookedAtDoorChange?: (openingId: string | null) => void;
	/** Fires when this player opens or closes a door or window shutters. */
	onToggle?: (openingId: string, open: boolean) => void;
	/** Includes changes to the target’s open state, for desktop and touch prompts. */
	onInteractionChange?: (state: OpeningInteractionState | null) => void;
}

/**
 * Look-at opening toggle — `K` swings doors or window shutters open and closed. State is
 * keyed by opening id (not the Three.js pivot), so painting a wall or tweaking frame settings
 * rebuilds the visual without resetting its pose. Shutters use two outward-swinging hinge pivots. `getCollisionRects()` exposes the leaf as a
 * live wall-style collider so a closed door blocks the doorway and an open one does not.
 */
export class DoorInteractionController {
	private readonly camera: THREE.Camera;
	private readonly getHingePivots: () => Iterable<readonly [string, THREE.Object3D]>;
	private readonly maxDistance: number;
	private readonly aimRadius: number;
	private readonly onLookedAtDoorChange?: (openingId: string | null) => void;
	private readonly onToggle?: (openingId: string, open: boolean) => void;
	private lookedAtDoorId: string | null = null;
	// Active means an open door or closed shutters: both are deviations from their
	// default pose, so the existing multiplayer active-id list also works on late join.
	private readonly activeById = new Set<string>();
	private readonly shutterProgress = new Map<string, number>();
	private readonly shutterKinds = new Map<string, boolean>();
	private readonly onInteractionChange?: (state: OpeningInteractionState | null) => void;
	private interaction: OpeningInteractionState | null = null;
	private readonly inverseParent = new THREE.Matrix4();
	private readonly localOrigin = new THREE.Vector3();
	private readonly localDirection = new THREE.Vector3();
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
		this.onToggle = options.onToggle;
		this.onInteractionChange = options.onInteractionChange;
		window.addEventListener('keydown', this.handleKeyDown);
	}

	isOpen(openingId: string): boolean {
		return this.isShutter(openingId) !== this.activeById.has(openingId);
	}

	isShutter(openingId: string): boolean {
		const cached = this.shutterKinds.get(openingId);
		if (cached !== undefined) return cached;
		for (const [id, pivot] of this.getHingePivots()) {
			if (id === openingId) return pivot.userData.interactionKind === 'shutters';
		}
		return false;
	}

	/** The interactive opening under the crosshair, or `null` if none is in range. */
	getLookedAtDoor(): string | null {
		return this.lookedAtDoorId;
	}

	/** One oriented box per live door leaf — closed fills the doorway; open sits beside it. */
	getCollisionRects(): WallCollisionRect[] {
		const rects: WallCollisionRect[] = [];
		for (const [, pivot] of this.getHingePivots()) {
			this.appendArchCollisionRects(pivot, rects);
			const leaves = pivot.userData.interactionKind === 'double-door' ? pivot.children : [pivot];
			for (const leaf of leaves) {
				const rect = this.collisionRectFor(leaf);
				if (rect) rects.push(rect);
			}
		}
		return rects;
	}

	/** Returns the opening id that toggled, or `null` if nothing was under the crosshair. */
	toggleLookedAtDoor(): string | null {
		const id = this.pickLookedAtDoor();
		if (!id) return null;
		this.setActiveState(id, !this.activeById.has(id));
		this.onToggle?.(id, this.isOpen(id));
		this.setLookedAtDoor(id);
		return id;
	}

	/** Set a physical open/closed pose (shutters start open, doors start closed). */
	setOpen(openingId: string, open: boolean): void {
		this.setActiveState(openingId, this.isShutter(openingId) ? !open : open);
	}

	/** Shared session state records deviations from the default pose for both kinds. */
	setActiveState(openingId: string, active: boolean): void {
		if (active) this.activeById.add(openingId);
		else this.activeById.delete(openingId);
		if (openingId === this.lookedAtDoorId) this.setLookedAtDoor(openingId);
	}

	update(deltaSeconds: number): void {
		const maxStep = DOOR_SWING_SPEED * Math.max(0, deltaSeconds);
		const liveIds = new Set<string>();
		for (const [id, pivot] of this.getHingePivots()) {
			liveIds.add(id);
			const shutter = pivot.userData.interactionKind === 'shutters';
			this.shutterKinds.set(id, shutter);
			if (shutter) {
				const target = this.activeById.has(id) ? 0 : 1;
				const progress = stepAngleToward(
					this.shutterProgress.get(id) ?? 1,
					target,
					Math.max(0, deltaSeconds) / SHUTTER_SWING_DURATION
				);
				this.shutterProgress.set(id, progress);
				const side = pivot.userData.side === -1 ? -1 : 1;
				for (const leaf of pivot.children) {
					const hinge = leaf.userData.hingeSide;
					if (hinge === 'left' || hinge === 'right') {
						const angle = shutterSwingAngle(side, hinge, progress);
						if (leaf.rotation.y !== angle) leaf.rotation.y = angle;
					}
				}
				continue;
			}
			const leaves = pivot.userData.interactionKind === 'double-door' ? pivot.children : [pivot];
			for (const leaf of leaves) {
				const hingeSide = (leaf.userData.hingeSide as HingeSide | undefined) ?? 'left';
				const target = doorTargetAngle(hingeSide, this.activeById.has(id));
				leaf.rotation.y = stepAngleToward(leaf.rotation.y, target, maxStep);
			}
		}
		for (const id of Array.from(this.activeById)) {
			if (!liveIds.has(id)) this.activeById.delete(id);
		}
		for (const id of this.shutterKinds.keys()) {
			if (!liveIds.has(id)) {
				this.shutterKinds.delete(id);
				this.shutterProgress.delete(id);
			}
		}
		this.refreshLookedAtDoor();
	}

	dispose(): void {
		window.removeEventListener('keydown', this.handleKeyDown);
		this.activeById.clear();
		this.shutterProgress.clear();
		this.shutterKinds.clear();
		this.setLookedAtDoor(null);
	}

	private refreshLookedAtDoor(): void {
		this.setLookedAtDoor(this.pickLookedAtDoor());
	}

	private setLookedAtDoor(openingId: string | null): void {
		if (openingId !== this.lookedAtDoorId) {
			this.lookedAtDoorId = openingId;
			this.onLookedAtDoorChange?.(openingId);
		}
		const state: OpeningInteractionState | null = openingId
			? {
					id: openingId,
					open: this.isOpen(openingId),
					kind: this.isShutter(openingId) ? 'shutters' : 'door'
				}
			: null;
		if (
			state?.id !== this.interaction?.id ||
			state?.open !== this.interaction?.open ||
			state?.kind !== this.interaction?.kind
		) {
			this.interaction = state;
			this.onInteractionChange?.(state);
		}
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
			const aim =
				pivot.userData.interactionKind === 'shutters'
					? this.windowRayHit(pivot)
					: this.aimWorldOf(pivot);
			if (!aim) continue;
			candidates.push({ id, aim });
		}
		return pickDoorAlongRay(origin, direction, candidates, this.maxDistance, this.aimRadius);
	}

	private appendArchCollisionRects(pivot: THREE.Object3D, rects: WallCollisionRect[]): void {
		const corners = pivot.userData.archCorners as UvRect[] | undefined;
		const parent = pivot.parent;
		if (!corners || !parent) return;
		parent.updateWorldMatrix(true, false);
		this.leafDirection.set(1, 0, 0).transformDirection(parent.matrixWorld);
		for (const corner of corners) {
			this.aimWorld
				.set((corner.minU + corner.maxU) / 2, corner.minY, 0)
				.applyMatrix4(parent.matrixWorld);
			rects.push({
				centerX: this.aimWorld.x,
				centerZ: this.aimWorld.z,
				halfLength: (corner.maxU - corner.minU) / 2,
				halfThickness: pivot.userData.archWallThickness / 2,
				dirX: this.leafDirection.x,
				dirZ: this.leafDirection.z,
				minWorldY: this.aimWorld.y,
				maxWorldY: this.aimWorld.y + corner.maxY - corner.minY
			});
		}
	}

	private collisionRectFor(pivot: THREE.Object3D): WallCollisionRect | null {
		if (pivot.userData.interactionKind === 'shutters') return null;
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

	/** Hit the full window rectangle from either side, including wide windows' corners. */
	private windowRayHit(assembly: THREE.Object3D): Vec3 | null {
		const parent = assembly.parent;
		if (!parent) return null;
		parent.updateWorldMatrix(true, false);
		this.inverseParent.copy(parent.matrixWorld).invert();
		this.localOrigin.copy(this.lookOrigin).applyMatrix4(this.inverseParent);
		this.localDirection.copy(this.lookDirection).transformDirection(this.inverseParent);
		if (Math.abs(this.localDirection.z) < 1e-8) return null;
		const distance = -this.localOrigin.z / this.localDirection.z;
		if (distance < 0) return null;
		const u = this.localOrigin.x + this.localDirection.x * distance;
		const y = this.localOrigin.y + this.localDirection.y * distance;
		const { minU, maxU, minY, maxY } = assembly.userData;
		if (u < minU || u > maxU || y < minY || y > maxY) return null;
		this.aimWorld.set(u, y, 0).applyMatrix4(parent.matrixWorld);
		return { x: this.aimWorld.x, y: this.aimWorld.y, z: this.aimWorld.z };
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
