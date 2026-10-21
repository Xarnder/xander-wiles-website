import * as THREE from 'three';
import type { MiniBuildSystem } from './MiniBuildSystem';
import {
	MINI_BUILD_INTERACTION_RANGE,
	resolveMiniBuildInteraction,
	type ResolvedMiniBuildInteraction
} from './MiniBuildInteractions';
import { obbAabb, obbCorners, obbsOverlap, type WorldObb } from './miniBuildGrid';
import { obbOverlapsWallRect } from './MiniBuildPlacement';
import type { WallCollisionRect } from '../building/wallCollision';
import type { WorldSurfaceSampler } from '../building/WorldSurfaceSampler';
import type { FirstPersonController } from '../player/FirstPersonController';
import {
	PlayerInteractionController,
	chooseInteraction,
	type InteractionPrompt
} from '../player/PlayerInteractionController';
import { PlayerInteractionView } from '../player/PlayerInteractionView';
import { PLAYER_BODY } from '../player/PlayerBodyDimensions';
import type { GridVec3 } from './MiniBuildTypes';
import {
	interactionHelper,
	disposeInteractionHelpers,
	addInteractionDebugLabel
} from './MiniBuildInteractionHelpers';

interface Options {
	system: MiniBuildSystem;
	camera: THREE.PerspectiveCamera;
	scene: THREE.Scene;
	player: FirstPersonController;
	surfaces: WorldSurfaceSampler;
	getWalls: () => WallCollisionRect[];
	getOccluders: () => THREE.Object3D[];
	inputAllowed: () => boolean;
	waterBlocked: (x: number, z: number) => boolean;
	eyeHeight: () => number;
	onPrompt: (prompt: InteractionPrompt | null) => void;
	registerMaterial: (material: THREE.Material) => void;
}
/** Bounded look-at queries through the existing instanced-mesh picker. */
export class MiniBuildInteractionRuntime {
	readonly controller: PlayerInteractionController;
	private readonly ray = new THREE.Raycaster();
	private readonly direction = new THREE.Vector3();
	private readonly view: PlayerInteractionView;
	private readonly debug = new THREE.Group();
	showDebug = false;
	private debugKey = '';
	constructor(private o: Options) {
		this.ray.far = MINI_BUILD_INTERACTION_RANGE;
		this.controller = new PlayerInteractionController({
			player: o.player,
			inputAllowed: o.inputAllowed,
			onPrompt: o.onPrompt,
			pick: () => this.pick(),
			resolve: (id, loc) => this.resolve(id, loc),
			blocked: (l) => this.blocked(l.box, l.instanceId),
			exitPosition: (l, e) => this.exitPosition(l, e)
		});
		this.view = new PlayerInteractionView(o.scene, o.registerMaterial);
		this.debug.name = 'mini-build-interaction-debug';
		o.scene.add(this.debug);
		window.addEventListener('keydown', this.key, true);
	}
	private readonly key = (event: KeyboardEvent) => {
		if (event.code !== 'KeyK' || event.repeat || event.ctrlKey || event.altKey || event.metaKey)
			return;
		const target = event.target as HTMLElement | null;
		if (target?.closest('input,textarea,select,[contenteditable="true"]')) return;
		if (this.controller.toggle()) {
			event.preventDefault();
			event.stopImmediatePropagation();
		}
	};
	resolve(id: string, locationId: string): ResolvedMiniBuildInteraction | null {
		const instance = this.o.system.instances.get(id),
			chunk = this.o.system.instances.getChunkOf(id);
		if (!instance || !chunk || !this.o.system.instances.isChunkActive(chunk)) return null;
		const definition = this.o.system.getDesign(instance.designId);
		const location = definition?.interactionLocations?.find(
			(l) => l.id === locationId && l.enabled
		);
		return definition && location
			? resolveMiniBuildInteraction(definition, instance, location)
			: null;
	}
	private pick(): ResolvedMiniBuildInteraction | null {
		this.ray.far = MINI_BUILD_INTERACTION_RANGE;
		this.o.camera.getWorldDirection(this.direction);
		this.ray.set(this.o.camera.position, this.direction);
		const hit = this.o.system.instances.raycast(this.ray);
		if (!hit) {
			if (this.debugKey) {
				disposeInteractionHelpers(this.debug);
				this.debugKey = '';
			}
			return null;
		}
		const obstruction = this.ray.intersectObjects(this.o.getOccluders(), false)[0];
		if (obstruction && obstruction.distance < hit.distance - 0.02) return null;
		const instance = this.o.system.instances.get(hit.id);
		if (!instance) return null;
		const design = this.o.system.getDesign(instance.designId);
		if (!design) return null;
		const locations = (design.interactionLocations ?? [])
			.filter((l) => l.enabled)
			.map((l) => resolveMiniBuildInteraction(design, instance, l));
		this.updateDebug(instance.id, locations);
		return chooseInteraction(
			locations,
			this.o.player.worldPosition,
			hit.point,
			(l) =>
				this.controller.occupancy.available(l.instanceId, l.locationId) &&
				!this.blocked(l.box, l.instanceId)
		);
	}
	blocked(box: WorldObb, ignoreInstance?: string): boolean {
		for (const ref of this.controller.occupancy.otherLocations()) {
			const other = this.resolve(ref.instanceId, ref.locationId);
			if (other && obbsOverlap(box, other.box, -0.015)) return true;
		}
		if (this.o.getWalls().some((w) => obbOverlapsWallRect(box, w, 0.015))) return true;
		if (
			this.o.system.instances
				.queryCollisionBoxes(obbAabb(box), ignoreInstance)
				.some((other) => obbsOverlap(box, other.box, -0.015))
		)
			return true;
		// Sample the box's centre and corners against terrain, slabs and roofs. The
		// owning furniture is deliberately excluded; it must remain solid to everyone else.
		for (const [x, z] of [[box.centerX, box.centerZ], ...obbCorners(box, 0.02)]) {
			if (this.o.surfaces.getSupportingSurfaceY(x, z, box.maxY) > box.minY + 0.08) return true;
			if (this.o.surfaces.getCeilingBlockY(x, z, box.minY + 0.03, box.maxY) !== null) return true;
		}
		return false;
	}
	private exitPosition(location: ResolvedMiniBuildInteraction, entry: GridVec3): GridVec3 {
		const radius = PLAYER_BODY.collisionRadius;
		const valid = (x: number, z: number, reference: number): GridVec3 | null => {
			const y = this.o.surfaces.getSupportingSurfaceY(x, z, reference);
			if (!Number.isFinite(y) || Math.abs(y - reference) > 1.5 || this.o.waterBlocked(x, z))
				return null;
			const box: WorldObb = {
				centerX: x,
				centerZ: z,
				halfX: radius,
				halfZ: radius,
				cos: 1,
				sin: 0,
				minY: y + 0.04,
				maxY: y + PLAYER_BODY.standingHeight
			};
			return this.blocked(box) ? null : { x, y: y + this.o.eyeHeight(), z };
		};
		// Front, left, right, rear; then wider rings. Include the owner's collision on exit.
		for (const distance of [
			Math.max(location.box.halfX, location.box.halfZ) + radius + 0.2,
			1.5,
			2.25
		]) {
			for (const offset of [0, Math.PI / 2, -Math.PI / 2, Math.PI]) {
				const angle = location.yaw + offset;
				const found = valid(
					location.position.x - Math.sin(angle) * distance,
					location.position.z - Math.cos(angle) * distance,
					location.position.y
				);
				if (found) return found;
			}
		}
		const reference = entry.y - this.o.eyeHeight();
		for (const distance of [0, 0.5, 1, 2, 3])
			for (let i = 0; i < 8; i++) {
				const found = valid(
					entry.x + Math.cos((i * Math.PI) / 4) * distance,
					entry.z + Math.sin((i * Math.PI) / 4) * distance,
					reference
				);
				if (found) return found;
			}
		// Last known pre-interaction pose: never restore the standing collider inside the seat.
		return { ...entry };
	}
	update(dt: number): void {
		this.controller.update(dt);
		if (!this.showDebug) {
			this.debug.visible = false;
			this.debugKey = '';
		} else this.debug.visible = true;
	}
	toggleView(): void {
		if (this.o.inputAllowed() && this.o.player.interactionPose)
			this.o.player.interactionThirdPerson = !this.o.player.interactionThirdPerson;
	}
	afterPlayerUpdate(): void {
		this.view.update(this.o.player);
		if (!this.o.player.interactionPose || !this.o.player.interactionThirdPerson) return;
		const eye = this.o.player.worldPosition;
		this.direction.copy(this.o.camera.position).sub(eye);
		const distance = this.direction.length();
		if (distance < 0.001) return;
		this.direction.divideScalar(distance);
		this.ray.set(eye, this.direction);
		this.ray.far = distance;
		const wall = this.ray.intersectObjects(this.o.getOccluders(), false)[0];
		const object = this.o.system.instances.raycast(this.ray);
		const limit = Math.min(distance, wall?.distance ?? distance, object?.distance ?? distance);
		if (limit < distance)
			this.o.camera.position
				.copy(eye)
				.addScaledVector(this.direction, Math.max(0.12, limit - 0.15));
		const camera = this.o.camera.position;
		camera.y = Math.max(
			camera.y,
			this.o.surfaces.getSupportingSurfaceY(camera.x, camera.z, camera.y) + 0.15
		);
		this.o.camera.lookAt(eye);
	}

	private updateDebug(instanceId: string, locations: ResolvedMiniBuildInteraction[]): void {
		if (!this.showDebug) return;
		const key = JSON.stringify(
			locations.map((l) => [
				l.instanceId,
				l.locationId,
				l.revision,
				l.position,
				l.yaw,
				this.blocked(l.box, instanceId),
				this.controller.occupancy.available(l.instanceId, l.locationId)
			])
		);
		if (key === this.debugKey) return;
		this.debugKey = key;
		disposeInteractionHelpers(this.debug);
		for (const l of locations) {
			const definition = this.o.system.getDesign(l.designId)!;
			const location = definition.interactionLocations!.find((a) => a.id === l.locationId)!;
			const status = !this.controller.occupancy.available(l.instanceId, l.locationId)
				? 'occupied'
				: this.blocked(l.box, instanceId)
					? 'blocked'
					: 'available';
			const color = status === 'available' ? 0x66ee99 : status === 'occupied' ? 0xffcc55 : 0xff5555;
			const helper = interactionHelper(location, true, color);
			addInteractionDebugLabel(
				helper,
				`${l.type.toUpperCase()} · ${l.locationId} · ${status}`,
				color
			);
			helper.position.set(l.position.x, l.position.y, l.position.z);
			helper.rotation.y = l.yaw;
			helper.name = `${l.type}: ${l.locationId}`;
			this.debug.add(helper);
		}
	}
	dispose(): void {
		window.removeEventListener('keydown', this.key, true);
		this.controller.dispose();
		this.view.dispose();
		disposeInteractionHelpers(this.debug);
		this.debug.removeFromParent();
	}
}
