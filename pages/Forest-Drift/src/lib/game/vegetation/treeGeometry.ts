import * as THREE from 'three';

/** Simple placeholder trees: a trunk cylinder plus cone/sphere foliage, low-poly for instancing at scale. */
interface TreeVariantSpec {
	trunkHeight: number;
	trunkRadiusTop: number;
	trunkRadiusBottom: number;
	trunkColor: number;
	foliageShape: 'cone' | 'sphere';
	foliageHeight: number;
	foliageRadius: number;
	foliageColor: number;
}

const SINK_INTO_GROUND = 0.12;

const TREE_VARIANT_SPECS: readonly TreeVariantSpec[] = [
	{
		trunkHeight: 3.4,
		trunkRadiusTop: 0.14,
		trunkRadiusBottom: 0.24,
		trunkColor: 0x5b4530,
		foliageShape: 'cone',
		foliageHeight: 4.6,
		foliageRadius: 1.6,
		foliageColor: 0x2f6b34
	},
	{
		trunkHeight: 2.7,
		trunkRadiusTop: 0.12,
		trunkRadiusBottom: 0.2,
		trunkColor: 0x4d3b28,
		foliageShape: 'sphere',
		foliageHeight: 0,
		foliageRadius: 1.9,
		foliageColor: 0x3d7f3f
	},
	{
		trunkHeight: 4.3,
		trunkRadiusTop: 0.16,
		trunkRadiusBottom: 0.28,
		trunkColor: 0x63492f,
		foliageShape: 'cone',
		foliageHeight: 5.6,
		foliageRadius: 1.3,
		foliageColor: 0x275c2b
	}
];

export interface TreeVariantAssets {
	trunkGeometry: THREE.BufferGeometry;
	trunkMaterial: THREE.Material;
	foliageGeometry: THREE.BufferGeometry;
	foliageMaterial: THREE.Material;
}

/** Builds the trunk/foliage geometry+material for every tree variant, once. Geometries are pre-translated so a single shared instance matrix (ground position, yaw, uniform scale) places both parts correctly relative to each other. */
export function createTreeVariantAssets(): TreeVariantAssets[] {
	return TREE_VARIANT_SPECS.map((spec) => {
		const trunkGeometry = new THREE.CylinderGeometry(
			spec.trunkRadiusTop,
			spec.trunkRadiusBottom,
			spec.trunkHeight,
			6
		);
		trunkGeometry.translate(0, spec.trunkHeight / 2 - SINK_INTO_GROUND, 0);

		const foliageGeometry =
			spec.foliageShape === 'cone'
				? new THREE.ConeGeometry(spec.foliageRadius, spec.foliageHeight, 7)
				: new THREE.SphereGeometry(spec.foliageRadius, 8, 6);
		const foliageBaseY =
			spec.foliageShape === 'cone'
				? spec.trunkHeight + spec.foliageHeight / 2 - spec.foliageHeight * 0.15
				: spec.trunkHeight + spec.foliageRadius * 0.55;
		foliageGeometry.translate(0, foliageBaseY - SINK_INTO_GROUND, 0);

		return {
			trunkGeometry,
			trunkMaterial: new THREE.MeshStandardMaterial({
				color: spec.trunkColor,
				roughness: 0.95,
				metalness: 0
			}),
			foliageGeometry,
			foliageMaterial: new THREE.MeshStandardMaterial({
				color: spec.foliageColor,
				roughness: 0.85,
				metalness: 0
			})
		};
	});
}
