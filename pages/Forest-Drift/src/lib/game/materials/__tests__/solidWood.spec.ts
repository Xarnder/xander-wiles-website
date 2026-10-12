import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
	buildFloorDetailGeometry,
	FLOOR_DETAIL_STONE_GROUP,
	FLOOR_DETAIL_WOOD_GROUP
} from '../../building/FloorDetailGeometryBuilder';
import {
	buildFloorDetailBoxes,
	buildFloorDetailStrips,
	rectanglePointsFromCorners
} from '../../building/floorDetailMath';
import type { FloorDetailDefinition } from '../../building/FloorDetailTypes';
import { BUILDING_SURFACE_STYLES } from '../buildingSurfaceStyles';
import { InlineMaterialMapSource } from '../MaterialMapSource';
import { ProceduralMaterialLibrary } from '../ProceduralMaterialLibrary';
import { PROCEDURAL_VARIANTS } from '../ProceduralMaterialTypes';
import { hasOwnShaderHook, setBaseShaderHook } from '../shader/shaderHooks';
import {
	applySolidWoodShader,
	createWoodUniforms,
	GAME_WOOD_PRESETS,
	setWoodUniforms,
	WOOD_GENERA,
	WOOD_GENUS_PRESETS
} from '../shader/woodShader';
import { SurfaceMappingBinder } from '../SurfaceMappingBinder';
import {
	computeWoodCoordinates,
	findWoodPieces,
	pieceFrameFromPoints,
	woodLogFor,
	type Vec3
} from '../woodCoords';

type Shader = Parameters<THREE.Material['onBeforeCompile']>[0];

function fakeShader(): Shader {
	const lib = THREE.ShaderLib.standard;
	return {
		uniforms: THREE.UniformsUtils.clone(lib.uniforms),
		vertexShader: lib.vertexShader,
		fragmentShader: lib.fragmentShader
	} as unknown as Shader;
}

/** Non-indexed triangle positions of a box, optionally rotated, then translated. */
function boxTriangles(
	size: Vec3,
	at: Vec3,
	rotate?: (g: THREE.BufferGeometry) => void
): Float32Array {
	const g = new THREE.BoxGeometry(...size);
	rotate?.(g);
	g.translate(...at);
	const flat = g.toNonIndexed();
	return flat.getAttribute('position').array as Float32Array;
}

function concat(...arrays: Float32Array[]): Float32Array {
	const out = new Float32Array(arrays.reduce((n, a) => n + a.length, 0));
	let o = 0;
	for (const a of arrays) {
		out.set(a, o);
		o += a.length;
	}
	return out;
}

describe('wood pieces', () => {
	it('separates boxes that only touch at a corner, and keeps each box whole', () => {
		const post = boxTriangles([0.2, 2, 0.2], [0, 1, 0]);
		// Beam whose bottom-front-left corner coincides with the post's top-front-left corner.
		const beam = boxTriangles([3, 0.2, 0.2], [1.4, 2.1, 0]);
		const { pieceOf, count } = findWoodPieces(concat(post, beam));
		expect(count).toBe(2);
		const postTriangles = post.length / 9;
		expect(new Set(pieceOf.slice(0, postTriangles))).toEqual(new Set([pieceOf[0]]));
		expect(new Set(pieceOf.slice(postTriangles))).toEqual(new Set([pieceOf[postTriangles]]));
	});

	it('frames a rotated brace along its length, thin axis across its smallest side', () => {
		const angle = 0.4;
		const positions = boxTriangles([2, 0.14, 0.08], [0, 1, 0], (g) => g.rotateZ(angle));
		const points: Vec3[] = [];
		for (let i = 0; i < positions.length; i += 3)
			points.push([positions[i], positions[i + 1], positions[i + 2]]);
		const frame = pieceFrameFromPoints(points);
		expect(
			Math.abs(frame.grain[0] * Math.cos(angle) + frame.grain[1] * Math.sin(angle))
		).toBeCloseTo(1, 4);
		expect(Math.abs(frame.thin[2])).toBeCloseTo(1, 4);
		expect(frame.halfThin).toBeCloseTo(0.04, 4);
	});

	it('cuts every piece from a log whose pith lies outside the piece', () => {
		for (let i = 0; i < 50; i++) {
			const h = (k: number) => (((i * 0.618 + k * 0.371) % 1) + 1) % 1;
			const log = woodLogFor(0.1, h(1), h(2), h(3));
			expect(Math.hypot(log.x, log.y)).toBeGreaterThan(0.1);
		}
	});

	it('gives a beam log coordinates: z spans its length, cross-section stays clear of the pith', () => {
		const positions = boxTriangles([3, 0.2, 0.24], [5, 2, -3]);
		const coords = computeWoodCoordinates(positions, 1234);
		let minZ = Infinity;
		let maxZ = -Infinity;
		for (let i = 0; i < coords.length; i += 3) {
			minZ = Math.min(minZ, coords[i + 2]);
			maxZ = Math.max(maxZ, coords[i + 2]);
			// Never through the pith (the ring centre): distance > 0 everywhere on the piece.
			expect(Math.hypot(coords[i], coords[i + 1])).toBeGreaterThan(0.004);
		}
		expect(maxZ - minZ).toBeCloseTo(3, 4);
		// Deterministic per seed, different between seeds.
		expect(computeWoodCoordinates(positions, 1234)).toEqual(coords);
		expect(computeWoodCoordinates(positions, 99)).not.toEqual(coords);
	});

	it('gives neighbouring identical pieces different logs', () => {
		const a = computeWoodCoordinates(boxTriangles([0.2, 2, 0.2], [0, 1, 0]), 7);
		const b = computeWoodCoordinates(boxTriangles([0.2, 2, 0.2], [1.5, 1, 0]), 7);
		expect(a).not.toEqual(b);
	});
});

describe('solid wood shader', () => {
	it('injects the woodCoord attribute and the wood function into a standard material', () => {
		const material = new THREE.MeshStandardMaterial();
		const uniforms = createWoodUniforms();
		setWoodUniforms(uniforms, WOOD_GENUS_PRESETS.walnut);
		applySolidWoodShader(material, uniforms, 2);
		expect(hasOwnShaderHook(material)).toBe(true);
		const shader = fakeShader();
		material.onBeforeCompile(shader, null as never);
		expect(shader.vertexShader).toContain('attribute vec3 woodCoord');
		expect(shader.vertexShader).toContain('vWoodCoord = woodCoord * uWoodScale');
		expect(shader.fragmentShader).toContain('vec3 wood = woodColor(vWoodCoord');
		expect(shader.fragmentShader).toContain('#define WOOD_QUALITY 2');
		expect(shader.uniforms.uWoodDark).toBe(uniforms.uWoodDark);
		expect(material.customProgramCacheKey()).toContain('wood:2');
		applySolidWoodShader(material, null);
		expect(hasOwnShaderHook(material)).toBe(false);
	});

	it('keeps its uniforms when three reuses an already-compiled program (toggled off and on)', () => {
		// three only calls onBeforeCompile for a NEW program; switching back to a cached one keeps
		// the uniforms object of whichever program compiled last.
		const material = new THREE.MeshStandardMaterial();
		setBaseShaderHook(material, () => {}); // CSM is always installed in-game
		const uniforms = createWoodUniforms();
		applySolidWoodShader(material, uniforms, 1);
		material.onBeforeCompile(fakeShader(), null as never); // wood program
		applySolidWoodShader(material, null);
		const flatCompile = fakeShader();
		material.onBeforeCompile(flatCompile, null as never); // flat program: its uniforms are now current
		expect(flatCompile.uniforms.uWoodDarken).toBeUndefined();
		applySolidWoodShader(material, uniforms, 1); // back to the (cached) wood program
		expect(flatCompile.uniforms.uWoodDarken).toBe(uniforms.uWoodDarken);
	});

	it('ports all ten genus presets of the three.js example and covers every game timber variant', () => {
		expect(WOOD_GENERA).toHaveLength(10);
		for (const variant of PROCEDURAL_VARIANTS.timber)
			expect(GAME_WOOD_PRESETS[variant]).toBeDefined();
	});

	it('stores ring frequency (1 / thickness) and sRGB colours converted to linear', () => {
		const uniforms = createWoodUniforms();
		setWoodUniforms(uniforms, WOOD_GENUS_PRESETS.pine);
		expect(uniforms.uWoodB.value.w).toBeCloseTo(24, 5);
		expect(uniforms.uWoodLight.value.r).toBeLessThan(0xd1 / 255); // linear < sRGB
	});
});

describe('solid wood in the building materials', () => {
	it('dresses structural framing as solid wood, but keeps floors and door leaves planked', () => {
		for (const kind of [
			'wall-frame',
			'wall-beam',
			'window-frame',
			'door-frame',
			'stair-frame',
			'slab-opening-frame'
		] as const) {
			expect(BUILDING_SURFACE_STYLES[kind]?.mapping).toBe('wood');
		}
		expect(BUILDING_SURFACE_STYLES['slab-floor']?.options?.planks).toBe(true);
		expect(BUILDING_SURFACE_STYLES['door-leaf']?.options?.planks).toBe(true);
	});

	it('maps solid-wood meshes with a woodCoord attribute and never subdivides them', async () => {
		const binder = new SurfaceMappingBinder({
			getFoundationOrigin: () => null,
			getWorldSeed: () => 'seed',
			subdivide: true
		});
		const library = new ProceduralMaterialLibrary({
			binder,
			source: new InlineMaterialMapSource()
		});
		const material = new THREE.MeshStandardMaterial();
		library.bindMaterial(material, BUILDING_SURFACE_STYLES['wall-frame']!);
		await library.whenIdle();
		expect(material.map).toBeNull();
		const geometry = new THREE.BoxGeometry(0.2, 8, 0.2);
		const root = new THREE.Group();
		root.add(new THREE.Mesh(geometry, material));
		binder.mapNow(root);
		expect(geometry.getAttribute('woodCoord').count).toBe(36);
		expect(geometry.getAttribute('position').count).toBe(36);
		library.dispose();
	});
});

describe('floor-detail wood', () => {
	const base = (overrides: Partial<FloorDetailDefinition>): FloorDetailDefinition => ({
		id: 'd1',
		foundationId: 'f1',
		levelIndex: 0,
		kind: 'planks',
		hostY: 0,
		renderMode: '3d',
		points: rectanglePointsFromCorners({ gridX: 0, gridZ: 0 }, { gridX: 8, gridZ: 8 }),
		colors: ['#3A2418', '#432A1C'],
		plankWidth: 0.2,
		plankDirection: 'z',
		tileSize: 0.4,
		tilePattern: 'checker',
		pathWidth: 1,
		pathFraming: true,
		...overrides
	});

	it('makes every plank a solid wood board with grain along the plank direction', () => {
		const boxes = buildFloorDetailBoxes(base({}), 0.25);
		expect(boxes.length).toBeGreaterThan(5);
		for (const box of boxes) expect(box.wood?.grain).toBe('z');
		expect(new Set(boxes.map((b) => b.wood?.seed)).size).toBe(boxes.length);
	});

	it('gives the path centre stone and each rail one continuous length of wood', () => {
		const path = buildFloorDetailStrips(
			base({
				kind: 'path',
				points: [
					{ gridX: 0, gridZ: 0 },
					{ gridX: 8, gridZ: 0 },
					{ gridX: 8, gridZ: 8 }
				]
			}),
			0.25
		);
		const stone = path.filter((strip) => strip.role === 'stone');
		const rails = path.filter((strip) => strip.role === 'wood');
		expect(stone).toHaveLength(1);
		expect(rails).toHaveLength(2);
		expect(new Set(rails.map((rail) => rail.woodSeed)).size).toBe(2);
		for (const rail of rails) {
			expect(rail.along).toEqual([...rail.along].sort((a, b) => a - b));
			expect(rail.along[rail.along.length - 1]).toBeGreaterThan(rail.along[0]);
		}
		for (const kind of ['carpet', 'tiles'] as const) {
			const boxes = buildFloorDetailBoxes(base({ kind }), 0.25);
			expect(boxes.some((b) => b.wood || b.stone)).toBe(false);
			expect(buildFloorDetailStrips(base({ kind }), 0.25)).toHaveLength(0);
		}
	});

	it('puts wood rails and the stone centre in their own draw groups', () => {
		const definition = base({
			kind: 'path',
			points: [
				{ gridX: 0, gridZ: 0 },
				{ gridX: 8, gridZ: 0 }
			]
		});
		const strips = buildFloorDetailStrips(definition, 0.25);
		const geometry = buildFloorDetailGeometry([], strips);
		const stone = strips.filter((strip) => strip.role === 'stone').length;
		const wood = strips.filter((strip) => strip.role === 'wood').length;
		expect(geometry.groups[0]).toMatchObject({ start: 0, count: 0 });
		expect(geometry.groups[FLOOR_DETAIL_WOOD_GROUP]).toMatchObject({
			start: 0,
			count: wood * 36
		});
		expect(geometry.groups[FLOOR_DETAIL_STONE_GROUP]).toMatchObject({
			start: wood * 36,
			count: stone * 36
		});
		const position = geometry.getAttribute('position');
		const uv = geometry.getAttribute('uv');
		const index = geometry.getIndex();
		expect(geometry.getAttribute('woodCoord').count).toBe(position.count);
		const stoneGroup = geometry.groups[FLOOR_DETAIL_STONE_GROUP];
		expect(index).toBeTruthy();
		for (let i = stoneGroup.start; i < stoneGroup.start + stoneGroup.count; i++) {
			const vertex = index!.getX(i);
			expect(uv.getX(vertex)).toBeCloseTo(position.getX(vertex), 5);
			expect(uv.getY(vertex)).toBeCloseTo(position.getZ(vertex), 5);
			expect(position.getY(vertex)).toBeGreaterThan(0);
		}
		let upward = 0;
		for (let i = stoneGroup.start; i < stoneGroup.start + stoneGroup.count; i += 3) {
			const a = index!.getX(i);
			const b = index!.getX(i + 1);
			const c = index!.getX(i + 2);
			const abx = position.getX(b) - position.getX(a);
			const abz = position.getZ(b) - position.getZ(a);
			const acx = position.getX(c) - position.getX(a);
			const acz = position.getZ(c) - position.getZ(a);
			const ny = abz * acx - abx * acz;
			if (Math.abs(position.getY(a) - position.getY(b)) < 1e-6 && position.getY(a) > 0.02) {
				upward += ny;
			}
		}
		expect(upward).toBeGreaterThan(0);
	});
});
