import * as THREE from 'three';
import {
	barrierWoodMaterials,
	buildBarrierRenderObject,
	disposeBarrierRenderObject,
	type BarrierRenderObject
} from './BarrierManager';
import type { BarrierStyleDefinition } from './BarrierTypes';
import type { BuildingMaterialManager } from './BuildingMaterialManager';
import { stairCanonicalToLocalXZ, type StairLocalBounds, type StairMetrics } from './stairMath';
import { layoutStairRailings, stairRailingStyle } from './stairRailingMath';
import type { StairDirection } from './StairTypes';

export interface StairRailing {
	group: THREE.Group;
	objects: BarrierRenderObject[];
}

/**
 * The stair's railings, built by the fence generator (`stairRailingMath.ts`) in canonical stair
 * space and placed with the same canonical → foundation-local mapping the stair solid uses — a
 * rotation (and, for some directions, a mirror) plus the stair's corner and `baseY` — set as each
 * root's matrix instead of rewriting vertices. Same materials, LODs and wood as a drawn fence.
 */
export function buildStairRailing(
	bounds: StairLocalBounds,
	direction: StairDirection,
	baseY: number,
	metrics: StairMetrics,
	railingStyle: BarrierStyleDefinition,
	materialManager: BuildingMaterialManager,
	seed = 0
): StairRailing | null {
	const layouts = layoutStairRailings(metrics, railingStyle);
	if (layouts.length === 0) return null;
	const style = stairRailingStyle(railingStyle);
	const { main, accent } = barrierWoodMaterials(materialManager, style);

	const origin = stairCanonicalToLocalXZ(bounds, direction, 0, 0);
	const alongRun = stairCanonicalToLocalXZ(bounds, direction, 1, 0);
	const alongWidth = stairCanonicalToLocalXZ(bounds, direction, 0, 1);
	const placement = new THREE.Matrix4()
		.makeBasis(
			new THREE.Vector3(alongRun.x - origin.x, 0, alongRun.z - origin.z),
			new THREE.Vector3(0, 1, 0),
			new THREE.Vector3(alongWidth.x - origin.x, 0, alongWidth.z - origin.z)
		)
		.setPosition(origin.x, baseY, origin.z);

	const group = new THREE.Group();
	group.name = 'stair-railing';
	const objects = layouts.map((layout, side) => {
		const object = buildBarrierRenderObject(layout, style, {
			origin: { x: 0, y: 0, z: 0 },
			seed: seed + side * 7919,
			main,
			accent,
			lodScale: 1,
			name: `stair-railing-${side}`
		});
		object.root.matrixAutoUpdate = false;
		object.root.matrix.copy(placement);
		object.root.matrixWorldNeedsUpdate = true;
		group.add(object.root);
		return object;
	});
	return { group, objects };
}

export function disposeStairRailing(railing: StairRailing): void {
	for (const object of railing.objects) disposeBarrierRenderObject(object);
	railing.group.removeFromParent();
}
