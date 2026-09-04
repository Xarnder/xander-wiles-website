import * as THREE from 'three';
import type { PlayerSettings } from '../terrain/TerrainSettings';

const GRAVITY = 18;
const MOUSE_SENSITIVITY = 0.0022;
const MAX_PITCH = Math.PI / 2 - 0.01;

export interface FirstPersonControllerOptions {
	domElement: HTMLElement;
	camera: THREE.PerspectiveCamera;
	getTerrainHeight: (worldX: number, worldZ: number) => number;
	settings: PlayerSettings;
	onPointerLockChange?: (locked: boolean) => void;
	/**
	 * Optional horizontal-collision resolver (e.g. against building walls) — given a proposed
	 * (x, z) and the player's current vertical span [feetY, headY], returns the position after
	 * pushing out of any solid obstacle. Left undefined, movement is unconstrained horizontally
	 * exactly as before buildings existed. Decoupled the same way getTerrainHeight is: the
	 * controller has no idea what "walls" are, it just calls this if provided.
	 */
	resolveHorizontalCollision?: (
		x: number,
		z: number,
		feetY: number,
		headY: number
	) => { x: number; z: number };
}

/**
 * FPS-style camera controller: pointer-lock mouse look + WASD movement, with the player's
 * vertical position always derived from the same TerrainHeightSampler-backed height function
 * the terrain mesh itself uses (via getTerrainHeight), so the player never clips into or floats
 * above the ground the mesh actually shows.
 */
export class FirstPersonController {
	readonly worldPosition = new THREE.Vector3();

	private readonly domElement: HTMLElement;
	private readonly camera: THREE.PerspectiveCamera;
	private readonly getTerrainHeight: (worldX: number, worldZ: number) => number;
	private readonly settings: PlayerSettings;
	private readonly onPointerLockChange?: (locked: boolean) => void;
	private readonly resolveHorizontalCollision?: (
		x: number,
		z: number,
		feetY: number,
		headY: number
	) => { x: number; z: number };

	private yaw = 0;
	private pitch = 0;
	private verticalVelocity = 0;
	private grounded = true;

	private readonly keys = new Set<string>();
	private pointerLocked = false;

	private readonly handlePointerLockChange = () => {
		this.pointerLocked = document.pointerLockElement === this.domElement;
		this.onPointerLockChange?.(this.pointerLocked);
	};

	private readonly handleMouseMove = (event: MouseEvent) => {
		if (!this.pointerLocked) return;
		this.yaw -= event.movementX * MOUSE_SENSITIVITY;
		this.pitch -= event.movementY * MOUSE_SENSITIVITY;
		this.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, this.pitch));
	};

	private readonly handleKeyDown = (event: KeyboardEvent) => {
		this.keys.add(event.code);
		if (event.code === 'Escape' && this.pointerLocked) {
			document.exitPointerLock();
		}
	};

	private readonly handleKeyUp = (event: KeyboardEvent) => {
		this.keys.delete(event.code);
	};

	private readonly handleClick = () => {
		if (!this.pointerLocked) {
			// requestPointerLock() can reject (e.g. permission denied, or an unsupported embedding
			// context) — swallow it here so it doesn't surface as an unhandled promise rejection.
			this.domElement.requestPointerLock()?.catch(() => {});
		}
	};

	constructor(options: FirstPersonControllerOptions) {
		this.domElement = options.domElement;
		this.camera = options.camera;
		this.getTerrainHeight = options.getTerrainHeight;
		this.settings = options.settings;
		this.onPointerLockChange = options.onPointerLockChange;
		this.resolveHorizontalCollision = options.resolveHorizontalCollision;

		document.addEventListener('pointerlockchange', this.handlePointerLockChange);
		document.addEventListener('mousemove', this.handleMouseMove);
		window.addEventListener('keydown', this.handleKeyDown);
		window.addEventListener('keyup', this.handleKeyUp);
		this.domElement.addEventListener('click', this.handleClick);
	}

	/** Places the player at (x, z), snapped to the terrain surface plus eye height. */
	spawn(worldX: number, worldZ: number): void {
		const groundHeight = this.getTerrainHeight(worldX, worldZ);
		this.worldPosition.set(worldX, groundHeight + this.settings.eyeHeight, worldZ);
		this.grounded = true;
		this.verticalVelocity = 0;
		this.syncCamera();
	}

	update(deltaSeconds: number): void {
		const forward = this.keys.has('KeyW') ? 1 : 0;
		const backward = this.keys.has('KeyS') ? 1 : 0;
		const left = this.keys.has('KeyA') ? 1 : 0;
		const right = this.keys.has('KeyD') ? 1 : 0;
		const running = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
		const jumpPressed = this.keys.has('Space');

		const moveX = right - left;
		const moveZ = forward - backward;

		let worldX = this.worldPosition.x;
		let worldZ = this.worldPosition.z;

		if (moveX !== 0 || moveZ !== 0) {
			const length = Math.hypot(moveX, moveZ) || 1;
			const normalizedX = moveX / length;
			const normalizedZ = moveZ / length;

			const sinYaw = Math.sin(this.yaw);
			const cosYaw = Math.cos(this.yaw);

			// Camera-relative movement: forward is -Z in Three.js view space, rotated by yaw.
			const dirX = normalizedX * cosYaw - normalizedZ * sinYaw;
			const dirZ = -normalizedX * sinYaw - normalizedZ * cosYaw;

			const speed = running ? this.settings.runSpeed : this.settings.walkSpeed;
			worldX += dirX * speed * deltaSeconds;
			worldZ += dirZ * speed * deltaSeconds;
		}

		if (this.resolveHorizontalCollision) {
			const feetY = this.worldPosition.y - this.settings.eyeHeight;
			const headY = feetY + this.settings.eyeHeight;
			const resolved = this.resolveHorizontalCollision(worldX, worldZ, feetY, headY);
			worldX = resolved.x;
			worldZ = resolved.z;
		}

		const groundHeight = this.getTerrainHeight(worldX, worldZ) + this.settings.eyeHeight;

		let worldY: number;
		if (!this.settings.gravityEnabled) {
			worldY = groundHeight;
			this.grounded = true;
			this.verticalVelocity = 0;
		} else {
			if (this.grounded && jumpPressed) {
				this.verticalVelocity = this.settings.jumpSpeed;
				this.grounded = false;
			}

			this.verticalVelocity -= GRAVITY * deltaSeconds;
			const proposedY = this.worldPosition.y + this.verticalVelocity * deltaSeconds;

			if (proposedY <= groundHeight) {
				worldY = groundHeight;
				this.verticalVelocity = 0;
				this.grounded = true;
			} else {
				worldY = proposedY;
				this.grounded = false;
			}
		}

		this.worldPosition.set(worldX, worldY, worldZ);
		this.syncCamera();
	}

	private syncCamera(): void {
		this.camera.position.copy(this.worldPosition);
		this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
	}

	isPointerLocked(): boolean {
		return this.pointerLocked;
	}

	dispose(): void {
		document.removeEventListener('pointerlockchange', this.handlePointerLockChange);
		document.removeEventListener('mousemove', this.handleMouseMove);
		window.removeEventListener('keydown', this.handleKeyDown);
		window.removeEventListener('keyup', this.handleKeyUp);
		this.domElement.removeEventListener('click', this.handleClick);
		if (this.pointerLocked) document.exitPointerLock();
	}
}
