import * as THREE from 'three';
import { BuildingMaterialManager } from './BuildingMaterialManager';
import { buildingGridToLocal } from './FoundationLocalMath';
import { FoundationRootRegistry } from './FoundationRootRegistry';
import type { FoundationDefinition } from './FoundationTypes';
import type { BuildingMaterialDefinition } from './MaterialTypes';
import { skirtingRunFootprints, type SkirtingRunDefinition } from './skirtingRunMath';
import type { Point2D } from './wallPathMath';

interface SkirtingRunEntry {
	definition: SkirtingRunDefinition;
	mesh: THREE.Mesh;
}

export interface SkirtingRunManagerOptions {
	getFoundation: (foundationId: string) => FoundationDefinition | undefined;
	getVertexSpacing: () => number;
	getBuildingGridSize: () => number;
	materialManager?: BuildingMaterialManager;
}

/** The drawn line in foundation-local metres. */
export function skirtingRunLocalPoints(
	definition: Pick<SkirtingRunDefinition, 'points'>,
	buildingGridSize: number
): Point2D[] {
	return definition.points.map((p) => {
		const local = buildingGridToLocal(p, buildingGridSize);
		return { x: local.localX, z: local.localZ };
	});
}

/**
 * Board footprints extruded from `baseY` to `baseY + height` — one closed prism per segment,
 * non-indexed so the procedural material binder can lay solid wood over each board as its own
 * piece (the same skirting timber the automatic skirting uses).
 */
export function buildSkirtingRunGeometry(
	definition: SkirtingRunDefinition,
	buildingGridSize: number
): THREE.BufferGeometry {
	const quads = skirtingRunFootprints(
		skirtingRunLocalPoints(definition, buildingGridSize),
		definition.closed,
		definition.segments,
		definition.depth
	);
	const y0 = definition.baseY;
	const y1 = definition.baseY + definition.height;
	const positions: number[] = [];
	const normals: number[] = [];
	const triangle = (a: number[], b: number[], c: number[], outward: number[]) => {
		const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
		const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
		let n = [
			e1[1] * e2[2] - e1[2] * e2[1],
			e1[2] * e2[0] - e1[0] * e2[2],
			e1[0] * e2[1] - e1[1] * e2[0]
		];
		const len = Math.hypot(n[0], n[1], n[2]);
		if (len < 1e-12) return;
		let order = [a, b, c];
		if (n[0] * outward[0] + n[1] * outward[1] + n[2] * outward[2] < 0) {
			order = [a, c, b];
			n = [-n[0], -n[1], -n[2]];
		}
		for (const p of order) {
			positions.push(p[0], p[1], p[2]);
			normals.push(n[0] / len, n[1] / len, n[2] / len);
		}
	};
	for (const quad of quads) {
		const cx = quad.reduce((s, p) => s + p.x, 0) / quad.length;
		const cz = quad.reduce((s, p) => s + p.z, 0) / quad.length;
		for (let i = 0; i < quad.length; i++) {
			const a = quad[i];
			const b = quad[(i + 1) % quad.length];
			const out = [(a.x + b.x) / 2 - cx, 0, (a.z + b.z) / 2 - cz];
			const p00 = [a.x, y0, a.z];
			const p10 = [b.x, y0, b.z];
			const p11 = [b.x, y1, b.z];
			const p01 = [a.x, y1, a.z];
			triangle(p00, p10, p11, out);
			triangle(p00, p11, p01, out);
		}
		const top = quad.map((p) => [p.x, y1, p.z]);
		const bottom = quad.map((p) => [p.x, y0, p.z]);
		triangle(top[0], top[1], top[2], [0, 1, 0]);
		triangle(top[0], top[2], top[3], [0, 1, 0]);
		triangle(bottom[0], bottom[1], bottom[2], [0, -1, 0]);
		triangle(bottom[0], bottom[2], bottom[3], [0, -1, 0]);
	}
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
	geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
	geometry.computeBoundingBox();
	geometry.computeBoundingSphere();
	return geometry;
}

/**
 * Every hand-drawn skirting run (hotbar 2 → Skirting). One mesh per run on its foundation's
 * BuildingRoot (foundation-local, like walls and floor detailing), using the shared `skirting`
 * material so paint and the procedural timber work exactly as on automatic skirting. Visual only:
 * no collision — a 2 cm board never blocks a player that the wall behind it doesn't.
 */
export class SkirtingRunManager {
	readonly group: THREE.Group;

	private readonly options: SkirtingRunManagerOptions;
	private readonly materialManager: BuildingMaterialManager;
	private readonly roots: FoundationRootRegistry;
	private readonly runs = new Map<string, SkirtingRunEntry>();

	constructor(options: SkirtingRunManagerOptions) {
		this.options = options;
		this.materialManager = options.materialManager ?? new BuildingMaterialManager();
		this.roots = new FoundationRootRegistry(options.getFoundation, options.getVertexSpacing);
		this.group = this.roots.group;
		this.group.name = 'skirting-runs';
	}

	add(definition: SkirtingRunDefinition): boolean {
		this.remove(definition.id);
		const root = this.roots.getOrCreate(definition.foundationId);
		if (!root) return false;
		const mesh = new THREE.Mesh(
			buildSkirtingRunGeometry(definition, this.options.getBuildingGridSize()),
			this.materialManager.getMaterial('skirting', definition.material)
		);
		mesh.name = 'skirting-run';
		mesh.userData.foundationId = definition.foundationId;
		mesh.userData.skirtingRunId = definition.id;
		mesh.castShadow = true;
		mesh.receiveShadow = true;
		root.add(mesh);
		this.runs.set(definition.id, { definition, mesh });
		return true;
	}

	remove(id: string): boolean {
		const entry = this.runs.get(id);
		if (!entry) return false;
		entry.mesh.geometry.dispose();
		entry.mesh.removeFromParent();
		this.runs.delete(id);
		return true;
	}

	removeForFoundation(foundationId: string): void {
		for (const [id, entry] of this.runs) {
			if (entry.definition.foundationId === foundationId) this.remove(id);
		}
		this.roots.remove(foundationId);
	}

	setMaterial(id: string, material: BuildingMaterialDefinition | undefined): boolean {
		const entry = this.runs.get(id);
		if (!entry) return false;
		entry.definition.material = material;
		entry.mesh.material = this.materialManager.getMaterial('skirting', material);
		return true;
	}

	get(id: string): SkirtingRunDefinition | undefined {
		return this.runs.get(id)?.definition;
	}

	getMesh(id: string): THREE.Mesh | undefined {
		return this.runs.get(id)?.mesh;
	}

	getAll(): SkirtingRunDefinition[] {
		return Array.from(this.runs.values(), (entry) => entry.definition);
	}

	getForFoundation(foundationId: string): SkirtingRunDefinition[] {
		return this.getAll().filter((run) => run.foundationId === foundationId);
	}

	getMeshesForRaycast(): THREE.Object3D[] {
		return Array.from(this.runs.values(), (entry) => entry.mesh);
	}

	/** Grid size changed: every run is re-derived from its grid points. */
	rebuildAll(): void {
		for (const definition of this.getAll()) this.add(definition);
	}

	dispose(): void {
		for (const id of [...this.runs.keys()]) this.remove(id);
		this.roots.dispose();
	}
}
