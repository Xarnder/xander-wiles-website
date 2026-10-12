import * as THREE from 'three';
import type { CompiledCreature } from './CreatureCompiler';
import type { CreatureGroundingController, LegGroundState } from './CreatureGrounding';

/**
 * Creature Lab test grounds and grounding debug overlays. Terrain is defined in units of the
 * creature's height so a 0.2 m critter and a 20 m giant see the same relative slope and bumps.
 */
export type LabTerrainKind = 'flat' | 'ramp' | 'uneven' | 'platform';
export type LabWalkDirection = 'uphill' | 'downhill' | 'across';
export interface LabTerrainSettings {
	kind: LabTerrainKind;
	/** Ramp angle in degrees. */
	angle: number;
	direction: LabWalkDirection;
}
export const DEFAULT_LAB_TERRAIN: LabTerrainSettings = {
	kind: 'flat',
	angle: 15,
	direction: 'uphill'
};

/** Height function for a test ground scaled to `size` (creature height). Rises toward +Z. */
export function labSurface(settings: LabTerrainSettings, size: number) {
	const slope = Math.tan((Math.max(0, Math.min(60, settings.angle)) * Math.PI) / 180);
	const s = Math.max(1e-3, size);
	switch (settings.kind) {
		case 'flat':
			return () => 0;
		case 'ramp':
			return (_x: number, z: number) => z * slope;
		case 'uneven':
			// Gentle ramp plus feet-scale bumps: one foot high, another low, left/right differences.
			return (x: number, z: number) =>
				z * slope * 0.5 +
				s * 0.12 * Math.sin((x / s) * 2.1 + 0.4) * Math.cos((z / s) * 1.7) +
				s * 0.06 * Math.sin((x / s) * 5.3 - (z / s) * 3.1);
		case 'platform':
			// A ramp with a flat foundation-like slab across it: the body must level out on top.
			return (_x: number, z: number) => {
				const ramp = z * slope;
				const top = s * 1.2 * slope;
				return z > -s * 0.6 && z < s * 1.2 ? Math.max(ramp, top) : ramp;
			};
	}
}
/** Heading for the chosen walk direction across a +Z ramp. */
export const labHeading = (direction: LabWalkDirection) =>
	direction === 'uphill' ? 0 : direction === 'downhill' ? Math.PI : Math.PI / 2;

export function buildLabTerrainMesh(surface: (x: number, z: number) => number, size: number) {
	const extent = size * 14;
	const geometry = new THREE.PlaneGeometry(extent, extent, 112, 112);
	geometry.rotateX(-Math.PI / 2);
	const position = geometry.getAttribute('position');
	for (let i = 0; i < position.count; i++)
		position.setY(i, surface(position.getX(i), position.getZ(i)) - size * 0.002);
	geometry.computeVertexNormals();
	const mesh = new THREE.Mesh(
		geometry,
		new THREE.MeshStandardMaterial({ color: 0x9fb08a, roughness: 0.95, metalness: 0 })
	);
	mesh.name = 'LabTerrain';
	return mesh;
}

export interface GroundingDebugFlags {
	footTargets: boolean;
	supportPlane: boolean;
	fallbackPlane: boolean;
	ikChains: boolean;
	legReach: boolean;
	bodyClearance: boolean;
}
export const DEFAULT_GROUNDING_DEBUG: GroundingDebugFlags = {
	footTargets: false,
	supportPlane: false,
	fallbackPlane: false,
	ikChains: false,
	legReach: false,
	bodyClearance: false
};
/** Foot-state colours: planted green, recovering yellow, swing blue, unreachable/invalid red. */
export const FOOT_STATE_COLORS: Record<LegGroundState | 'invalid', number> = {
	planted: 0x35c25a,
	recovering: 0xf2c230,
	swing: 0x3d7bf2,
	seeking: 0xe0443a,
	invalid: 0xe0443a
};

const overlay = (color: number, opacity = 1) =>
	new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity });
/**
 * Pooled grounding overlays, updated in place every frame (no per-frame allocation): foot targets
 * by state, support points/plane/normal/forward, fallback footprint plane, IK chains, leg reach and
 * body-clearance samples. The support plane turns red past the species' walkable slope.
 */
export class GroundingDebugView {
	readonly group = new THREE.Group();
	private feet: THREE.Mesh[] = [];
	private supports: THREE.Mesh[] = [];
	private reach: THREE.Mesh[] = [];
	private clearance: THREE.Mesh[] = [];
	private readonly plane: THREE.Mesh;
	private readonly fallback: THREE.Mesh;
	private readonly normal: THREE.ArrowHelper;
	private readonly forward: THREE.ArrowHelper;
	private readonly chains: THREE.LineSegments;
	private readonly v = new THREE.Vector3();
	private readonly w = new THREE.Vector3();
	constructor(
		private readonly creature: CompiledCreature,
		private readonly grounding: CreatureGroundingController
	) {
		this.group.renderOrder = 20;
		const size = Math.max(0.05, creature.compilation.bounds.height);
		const marker = size * 0.025;
		const sphere = new THREE.SphereGeometry(1, 10, 8);
		for (const leg of grounding.legs) {
			const foot = new THREE.Mesh(sphere, overlay(FOOT_STATE_COLORS.planted));
			foot.scale.setScalar(marker);
			this.feet.push(foot);
			const support = new THREE.Mesh(sphere, overlay(0xffffff, 0.9));
			support.scale.setScalar(marker * 0.6);
			this.supports.push(support);
			const reach = new THREE.Mesh(
				new THREE.SphereGeometry(1, 16, 10),
				new THREE.MeshBasicMaterial({
					color: 0x8a5cd6,
					wireframe: true,
					transparent: true,
					opacity: 0.25,
					depthTest: false
				})
			);
			reach.scale.setScalar(leg.maxReach);
			this.reach.push(reach);
		}
		for (let i = 0; i < grounding.clearance.length; i++) {
			const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), overlay(0xff8a3d));
			box.scale.setScalar(marker * 1.2);
			this.clearance.push(box);
		}
		const extent = Math.max(
			creature.compilation.bounds.max.z - creature.compilation.bounds.min.z,
			creature.compilation.bounds.max.x - creature.compilation.bounds.min.x
		);
		this.plane = new THREE.Mesh(
			new THREE.PlaneGeometry(extent * 0.9, extent * 0.9).rotateX(-Math.PI / 2),
			new THREE.MeshBasicMaterial({
				color: 0x2fa7d9,
				transparent: true,
				opacity: 0.28,
				side: THREE.DoubleSide,
				depthWrite: false
			})
		);
		this.fallback = new THREE.Mesh(
			new THREE.PlaneGeometry(extent * 1.1, extent * 1.1).rotateX(-Math.PI / 2),
			new THREE.MeshBasicMaterial({
				color: 0xff9b3d,
				transparent: true,
				opacity: 0.18,
				side: THREE.DoubleSide,
				depthWrite: false
			})
		);
		this.normal = new THREE.ArrowHelper(
			new THREE.Vector3(0, 1, 0),
			new THREE.Vector3(),
			size * 0.6,
			0x2fa7d9
		);
		this.forward = new THREE.ArrowHelper(
			new THREE.Vector3(0, 0, 1),
			new THREE.Vector3(),
			size * 0.6,
			0xe0443a
		);
		for (const arrow of [this.normal, this.forward]) {
			(arrow.line.material as THREE.Material).depthTest = false;
			(arrow.cone.material as THREE.Material).depthTest = false;
		}
		this.chains = new THREE.LineSegments(
			new THREE.BufferGeometry().setAttribute(
				'position',
				new THREE.BufferAttribute(new Float32Array(Math.max(1, grounding.legs.length) * 4 * 3), 3)
			),
			new THREE.LineBasicMaterial({ color: 0x29c4d6, depthTest: false })
		);
		this.chains.frustumCulled = false;
		this.group.add(
			...this.feet,
			...this.supports,
			...this.reach,
			...this.clearance,
			this.plane,
			this.fallback,
			this.normal,
			this.forward,
			this.chains
		);
	}
	update(flags: GroundingDebugFlags) {
		const g = this.grounding,
			p = g.plane;
		this.group.visible = Object.values(flags).some(Boolean);
		if (!this.group.visible) return;
		g.legs.forEach((leg, i) => {
			const foot = this.feet[i];
			foot.visible = flags.footTargets;
			g.footTarget(leg, foot.position);
			(foot.material as THREE.MeshBasicMaterial).color.setHex(
				leg.invalid || !leg.reachable ? FOOT_STATE_COLORS.invalid : FOOT_STATE_COLORS[leg.state]
			);
			const support = this.supports[i];
			support.visible = flags.supportPlane && leg.supportWeight > 0.05;
			support.position.copy(leg.plantedPosition);
			support.scale.setScalar(
				Math.max(1e-4, this.feet[i].scale.x * 0.4 * (0.5 + leg.supportWeight))
			);
			const reach = this.reach[i];
			reach.visible = flags.legReach;
			this.creature.bonesById.get(leg.limb.hipId)?.getWorldPosition(reach.position);
		});
		this.clearance.forEach((box, i) => {
			const c = g.clearance[i];
			box.visible = flags.bodyClearance;
			box.position.copy(c.world);
		});
		const tooSteep = p.slope > g.terrain.maxWalkSlope;
		this.plane.visible = flags.supportPlane;
		this.plane.position.copy(p.point);
		this.plane.quaternion.setFromUnitVectors(this.v.set(0, 1, 0), p.normal);
		(this.plane.material as THREE.MeshBasicMaterial).color.setHex(tooSteep ? 0xe0443a : 0x2fa7d9);
		this.normal.visible = this.forward.visible = flags.supportPlane;
		this.normal.position.copy(p.point);
		this.normal.setDirection(p.normal);
		this.forward.position.copy(p.point);
		this.forward.setDirection(p.forward);
		this.fallback.visible = flags.fallbackPlane;
		const fb = g.fallback;
		this.fallback.position.set(p.point.x, fb.a * p.point.x + fb.b * p.point.z + fb.c, p.point.z);
		this.fallback.quaternion.setFromUnitVectors(this.v.set(0, 1, 0), fb.normal);
		this.chains.visible = flags.ikChains;
		if (flags.ikChains) {
			const attribute = this.chains.geometry.getAttribute('position') as THREE.BufferAttribute;
			g.legs.forEach((leg, i) => {
				const ids = [leg.limb.hipId, leg.limb.kneeId, leg.limb.kneeId, leg.limb.footId];
				ids.forEach((id, k) => {
					this.creature.bonesById.get(id)?.getWorldPosition(this.w);
					attribute.setXYZ(i * 4 + k, this.w.x, this.w.y, this.w.z);
				});
			});
			attribute.needsUpdate = true;
		}
	}
	dispose() {
		this.group.traverse((o) => {
			const mesh = o as THREE.Mesh;
			mesh.geometry?.dispose();
			const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
			if (material) for (const m of Array.isArray(material) ? material : [material]) m.dispose();
		});
		this.group.removeFromParent();
	}
}
