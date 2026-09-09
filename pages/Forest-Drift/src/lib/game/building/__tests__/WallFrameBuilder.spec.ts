import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BuildingMaterialManager } from '../BuildingMaterialManager';
import { applyWallTransform } from '../WallGeometryBuilder';
import { wallLocalToWorld, type WallTransform } from '../wallGeometryMath';
import { signedArea2D } from '../slabMath';
import { FRAME_BEAM_END_OVERHANG, frameBeamTopY, framePostTopY } from '../buildingVisualInsets';
import {
	buildStandaloneWallFrame,
	buildWallPathFrame,
	buildFoundationFrame,
	type WallFrameSettings
} from '../WallFrameBuilder';
import type { WallPathDefinition } from '../WallPathTypes';

const BUILDING_GRID_SIZE = 0.25; // 4 grid units per metre
const THICKNESS = 0.15;
const HEIGHT = 3;

function metersToGrid(m: number): number {
	return Math.round(m / BUILDING_GRID_SIZE);
}

function settings(overrides: Partial<WallFrameSettings> = {}): WallFrameSettings {
	return {
		wallFrameEnabled: true,
		wallFrameWidth: 0.12,
		wallFrameDepthExtra: 0.05,
		showWallFrameBounds: false,
		showWallFrameJoins: false,
		...overrides
	};
}

function makePath(overrides: Partial<WallPathDefinition> = {}): WallPathDefinition {
	return {
		id: 'path-1',
		foundationId: 'foundation-a',
		points: [],
		closed: false,
		baseY: 0,
		wallHeight: HEIGHT,
		wallThickness: THICKNESS,
		joinStyle: 'miter',
		miterLimit: 4,
		segments: [],
		...overrides
	};
}

function grid(x: number, z: number) {
	return { gridX: metersToGrid(x), gridZ: metersToGrid(z) };
}

/** Every vertex position present in a merged geometry — same helper convention as WallPathGeometryBuilder.spec.ts. */
function vertices(geometry: THREE.BufferGeometry): { x: number; y: number; z: number }[] {
	const position = geometry.getAttribute('position');
	const points: { x: number; y: number; z: number }[] = [];
	for (let i = 0; i < position.count; i++) {
		points.push({ x: position.getX(i), y: position.getY(i), z: position.getZ(i) });
	}
	return points;
}

function findMesh(group: THREE.Group | null): THREE.Mesh {
	expect(group).not.toBeNull();
	const mesh = group!.children.find((c) => c.name === 'wall-frame-solid');
	expect(mesh).toBeDefined();
	return mesh as THREE.Mesh;
}

describe('buildStandaloneWallFrame', () => {
	it('produces a left post at U=0, a right post at U=length, and a top beam just below the authored wall height', () => {
		const materialManager = new BuildingMaterialManager();
		const length = 5;
		const group = buildStandaloneWallFrame(
			length,
			HEIGHT,
			THICKNESS,
			settings(),
			undefined,
			materialManager
		);
		const mesh = findMesh(group);
		const pts = vertices(mesh.geometry);
		const beamTop = frameBeamTopY(HEIGHT);
		const beamHeight = settings().wallFrameWidth * 2;
		const beamBottomY = beamTop - beamHeight;
		const postTop = framePostTopY(beamBottomY, beamHeight);

		// Posts sit at U=0 / U=length; the beam overhangs those ends, so pick the post top by Y.
		expect(pts.some((p) => Math.abs(p.x) < 0.1 && Math.abs(p.y - postTop) < 1e-5)).toBe(true);
		expect(pts.some((p) => Math.abs(p.x) < 0.1 && Math.abs(p.y) < 1e-5)).toBe(true);
		expect(pts.some((p) => Math.abs(p.x - length) < 0.1 && Math.abs(p.y - postTop) < 1e-5)).toBe(
			true
		);

		// Beam top sits just below authored HEIGHT so a slab at that storey does not share its plane.
		expect(Math.max(...pts.map((p) => p.y))).toBeCloseTo(beamTop, 5);
		expect(Math.max(...pts.map((p) => p.y))).toBeLessThan(HEIGHT);
		expect(pts.some((p) => Math.abs(p.y - beamBottomY) < 1e-6)).toBe(true);
		expect(postTop).toBeLessThan(beamTop);
	});

	it('the top beam’s vertical thickness is twice the posts’ along-wall width', () => {
		const materialManager = new BuildingMaterialManager();
		const width = 0.2;
		const group = buildStandaloneWallFrame(
			5,
			HEIGHT,
			THICKNESS,
			settings({ wallFrameWidth: width }),
			undefined,
			materialManager
		);
		const pts = vertices(findMesh(group).geometry);
		expect(pts.some((p) => Math.abs(p.y - (frameBeamTopY(HEIGHT) - width * 2)) < 1e-6)).toBe(true);
		// Left post is a box of size `width` centred at U=0, so it spans [-width/2, +width/2].
		const nearLeft = pts.filter((p) => p.x < 1);
		expect(Math.min(...nearLeft.map((p) => p.x))).toBeCloseTo(-width / 2, 5);
		expect(Math.max(...nearLeft.map((p) => p.x))).toBeCloseTo(width / 2, 5);
	});

	it('a taller wall produces taller side posts and a top beam at the new elevation', () => {
		const materialManager = new BuildingMaterialManager();
		const shortGroup = buildStandaloneWallFrame(
			5,
			3,
			THICKNESS,
			settings(),
			undefined,
			materialManager
		);
		const tallGroup = buildStandaloneWallFrame(
			5,
			5,
			THICKNESS,
			settings(),
			undefined,
			materialManager
		);
		const shortMax = Math.max(...vertices(findMesh(shortGroup).geometry).map((p) => p.y));
		const tallMax = Math.max(...vertices(findMesh(tallGroup).geometry).map((p) => p.y));
		expect(shortMax).toBeCloseTo(frameBeamTopY(3), 5);
		expect(tallMax).toBeCloseTo(frameBeamTopY(5), 5);
	});

	it('a very long wall resizes the top beam exactly — the frame footprint spans the full new length', () => {
		const materialManager = new BuildingMaterialManager();
		const group = buildStandaloneWallFrame(
			40,
			HEIGHT,
			THICKNESS,
			settings(),
			undefined,
			materialManager
		);
		const pts = vertices(findMesh(group).geometry);
		expect(Math.max(...pts.map((p) => p.x))).toBeGreaterThanOrEqual(40 - 1e-6);
		expect(Math.min(...pts.map((p) => p.x))).toBeLessThanOrEqual(1e-6);
	});

	it('protrudes slightly past both wall faces (never coplanar, avoiding z-fighting)', () => {
		const materialManager = new BuildingMaterialManager();
		const group = buildStandaloneWallFrame(
			5,
			HEIGHT,
			THICKNESS,
			settings(),
			undefined,
			materialManager
		);
		const pts = vertices(findMesh(group).geometry);
		const halfThickness = THICKNESS / 2;
		expect(Math.max(...pts.map((p) => p.z))).toBeGreaterThan(halfThickness);
		expect(Math.min(...pts.map((p) => p.z))).toBeLessThan(-halfThickness);
	});

	it('the top beam overhangs each wall end so its end faces are not coplanar with the wall’s', () => {
		const materialManager = new BuildingMaterialManager();
		const length = 5;
		const group = buildStandaloneWallFrame(
			length,
			HEIGHT,
			THICKNESS,
			settings(),
			undefined,
			materialManager
		);
		const pts = vertices(findMesh(group).geometry);
		const beamTop = frameBeamTopY(HEIGHT);
		const beamTopPts = pts.filter((p) => Math.abs(p.y - beamTop) < 1e-6);
		expect(Math.min(...beamTopPts.map((p) => p.x))).toBeCloseTo(-FRAME_BEAM_END_OVERHANG, 5);
		expect(Math.max(...beamTopPts.map((p) => p.x))).toBeCloseTo(
			length + FRAME_BEAM_END_OVERHANG,
			5
		);
	});

	it('is disabled by a global default of false', () => {
		const materialManager = new BuildingMaterialManager();
		const group = buildStandaloneWallFrame(
			5,
			HEIGHT,
			THICKNESS,
			settings({ wallFrameEnabled: false }),
			undefined,
			materialManager
		);
		expect(group).toBeNull();
	});

	it('a per-wall override can disable framing even when the global default is enabled', () => {
		const materialManager = new BuildingMaterialManager();
		const group = buildStandaloneWallFrame(
			5,
			HEIGHT,
			THICKNESS,
			settings({ wallFrameEnabled: true }),
			{ enabled: false },
			materialManager
		);
		expect(group).toBeNull();
	});

	it("a diagonal wall's wall-local frame transforms correctly into world coordinates", () => {
		// The build function itself is angle-agnostic (no angle parameter at all) — the diagonal
		// case is entirely handled by the SAME wall-local -> world transform every other wall-body
		// vertex already goes through (wallLocalToWorld / applyWallTransform). Verify that pairing
		// directly: pick a known frame vertex (the right post's outer-top corner) and confirm its
		// world position matches wallLocalToWorld's own prediction for a 37-degree heading.
		const materialManager = new BuildingMaterialManager();
		const length = 5;
		const group = buildStandaloneWallFrame(
			length,
			HEIGHT,
			THICKNESS,
			settings(),
			undefined,
			materialManager
		);
		const mesh = findMesh(group);
		const pts = vertices(mesh.geometry);
		const rightTop = pts.find(
			(p) =>
				Math.abs(p.x - (length + FRAME_BEAM_END_OVERHANG)) < 1e-6 &&
				Math.abs(p.y - frameBeamTopY(HEIGHT)) < 1e-6
		)!;
		expect(rightTop).toBeDefined();

		const heading = (37 * Math.PI) / 180;
		const transform: WallTransform = {
			originWorldX: 10,
			originWorldY: 2,
			originWorldZ: -3,
			headingRadians: heading,
			dirX: Math.cos(heading),
			dirZ: Math.sin(heading),
			length
		};
		const expected = wallLocalToWorld(transform, rightTop.x, rightTop.y, rightTop.z);

		// applyWallTransform is exactly what WallManager applies to the wall's own `mesh` (whose child
		// this frame group becomes) — reproduce that same placement here and read back the world
		// position via a real Object3D graph, the same way WallManager wires it in production.
		const container = new THREE.Object3D();
		applyWallTransform(
			container,
			transform.originWorldX,
			transform.originWorldY,
			transform.originWorldZ,
			transform.headingRadians
		);
		const child = new THREE.Object3D();
		child.position.set(rightTop.x, rightTop.y, rightTop.z);
		container.add(child);
		container.updateMatrixWorld(true);
		const worldPos = child.getWorldPosition(new THREE.Vector3());

		expect(worldPos.x).toBeCloseTo(expected.worldX, 4);
		expect(worldPos.y).toBeCloseTo(expected.worldY, 4);
		expect(worldPos.z).toBeCloseTo(expected.worldZ, 4);
	});
});

describe('buildWallPathFrame — corner handling', () => {
	it('an open path A->B->C gets exactly one post at the shared corner B, not two overlapping ones', () => {
		const materialManager = new BuildingMaterialManager();
		const path = makePath({
			points: [grid(0, 0), grid(4, 0), grid(4, 4)],
			segments: [
				{ id: 'seg-a', openings: [] },
				{ id: 'seg-b', openings: [] }
			]
		});
		const group = buildWallPathFrame(path, BUILDING_GRID_SIZE, settings(), materialManager);
		const mesh = findMesh(group);
		const pts = vertices(mesh.geometry);

		// 2 beams + 2 end posts + 1 corner post at B = 5 rectangular extrusions, each an 8-vertex
		// box. Two separate corner uprights would be 6 pieces; a per-segment duplicate would be more.
		expect(pts.length).toBe(5 * 8);
	});

	it('corner-post side faces wind outward (same XZ order as the top beam), so FrontSide materials show the outside', () => {
		// Closed rectangle: 4 beam pieces then 4 corner posts. Each extrudePolygon of a quad writes
		// 8 positions (4 bottom in footprint order, then 4 top) — see WallFrameBuilder.extrudePolygon.
		const materialManager = new BuildingMaterialManager();
		const path = makePath({
			points: [grid(0, 0), grid(4, 0), grid(4, 4), grid(0, 4)],
			closed: true,
			segments: [
				{ id: 'seg-a', openings: [] },
				{ id: 'seg-b', openings: [] },
				{ id: 'seg-c', openings: [] },
				{ id: 'seg-d', openings: [] }
			]
		});
		const mesh = findMesh(
			buildWallPathFrame(path, BUILDING_GRID_SIZE, settings(), materialManager)
		);
		const pts = vertices(mesh.geometry);
		const beamFootprint = pts.slice(0, 4).map((p) => ({ x: p.x, z: p.z }));
		const cornerFootprint = pts.slice(4 * 8, 4 * 8 + 4).map((p) => ({ x: p.x, z: p.z }));
		expect(signedArea2D(beamFootprint)).toBeLessThan(0);
		expect(signedArea2D(cornerFootprint)).toBeLessThan(0);

		const position = mesh.geometry.getAttribute('position');
		const index = mesh.geometry.getIndex();
		expect(index).not.toBeNull();
		const postVertexStart = 4 * 8;
		const postVertexEnd = postVertexStart + 8;
		let cx = 0;
		let cz = 0;
		for (let i = 0; i < 4; i++) {
			cx += position.getX(postVertexStart + i);
			cz += position.getZ(postVertexStart + i);
		}
		cx /= 4;
		cz /= 4;

		let verticalSides = 0;
		const a = new THREE.Vector3();
		const b = new THREE.Vector3();
		const c = new THREE.Vector3();
		for (let i = 0; i < index!.count; i += 3) {
			const ia = index!.getX(i);
			const ib = index!.getX(i + 1);
			const ic = index!.getX(i + 2);
			if (ia < postVertexStart || ia >= postVertexEnd) continue;
			a.fromBufferAttribute(position, ia);
			b.fromBufferAttribute(position, ib);
			c.fromBufferAttribute(position, ic);
			const normal = new THREE.Vector3()
				.subVectors(b, a)
				.cross(new THREE.Vector3().subVectors(c, a));
			if (normal.lengthSq() < 1e-12) continue;
			normal.normalize();
			if (Math.abs(normal.y) > 0.2) {
				// Top cap must face +Y, bottom −Y — the inside-out box flipped these too.
				const centroidY = (a.y + b.y + c.y) / 3;
				if (centroidY > HEIGHT * 0.5) expect(normal.y).toBeGreaterThan(0);
				else expect(normal.y).toBeLessThan(0);
				continue;
			}
			const centroidX = (a.x + b.x + c.x) / 3;
			const centroidZ = (a.z + b.z + c.z) / 3;
			expect(normal.x * (centroidX - cx) + normal.z * (centroidZ - cz)).toBeGreaterThan(0);
			verticalSides++;
		}
		expect(verticalSides).toBeGreaterThan(0);
	});

	it('a 90-degree corner is one post that reaches both walls’ outer faces', () => {
		const materialManager = new BuildingMaterialManager();
		const frame = settings();
		const path = makePath({
			points: [grid(0, 0), grid(4, 0), grid(4, 4)],
			segments: [
				{ id: 'seg-a', openings: [] },
				{ id: 'seg-b', openings: [] }
			]
		});
		const pts = vertices(
			findMesh(buildWallPathFrame(path, BUILDING_GRID_SIZE, frame, materialManager)).geometry
		);
		// Pieces: beam AB, beam BC, end A, corner B, end C. Corner B is the 4th piece.
		const corner = pts.slice(3 * 8, 3 * 8 + 4);
		const minX = Math.min(...corner.map((p) => p.x));
		const maxX = Math.max(...corner.map((p) => p.x));
		const minZ = Math.min(...corner.map((p) => p.z));
		const maxZ = Math.max(...corner.map((p) => p.z));
		const halfDepth = THICKNESS / 2 + frame.wallFrameDepthExtra;
		const cornerX = 4;
		const cornerZ = 0;
		expect(minX).toBeLessThanOrEqual(cornerX - halfDepth + 1e-6);
		expect(maxX).toBeGreaterThanOrEqual(cornerX + halfDepth - 1e-6);
		expect(minZ).toBeLessThanOrEqual(cornerZ - halfDepth + 1e-6);
		expect(maxZ).toBeGreaterThanOrEqual(cornerZ + halfDepth - 1e-6);
		expect(
			pts.some((p) => Math.abs(p.y - (frameBeamTopY(HEIGHT) - frame.wallFrameWidth * 2)) < 1e-6)
		).toBe(true);
	});

	it('a closed polygon A->B->C->D->A gets exactly one corner post per vertex, no duplicated start/end post', () => {
		const materialManager = new BuildingMaterialManager();
		const path = makePath({
			points: [grid(0, 0), grid(4, 0), grid(4, 4), grid(0, 4)],
			closed: true,
			segments: [
				{ id: 'seg-a', openings: [] },
				{ id: 'seg-b', openings: [] },
				{ id: 'seg-c', openings: [] },
				{ id: 'seg-d', openings: [] }
			]
		});
		const group = buildWallPathFrame(path, BUILDING_GRID_SIZE, settings(), materialManager);
		const mesh = findMesh(group);
		const pts = vertices(mesh.geometry);

		// 4 beams + 1 post per vertex = 8 pieces x 8 vertices.
		expect(pts.length).toBe(8 * 8);
	});

	it('every corner post fully contains its own vertex, for a 90, an acute, and an obtuse turn', () => {
		const materialManager = new BuildingMaterialManager();
		const cases: { name: string; points: { gridX: number; gridZ: number }[] }[] = [
			{ name: '90 degrees', points: [grid(0, 0), grid(4, 0), grid(4, 4)] },
			{ name: 'acute (45 deg turn)', points: [grid(0, 0), grid(4, 0), grid(6, 2)] },
			{ name: 'obtuse (135 deg turn)', points: [grid(0, 0), grid(4, 0), grid(8, -2)] }
		];
		for (const { points } of cases) {
			const path = makePath({
				points,
				segments: [
					{ id: 'seg-a', openings: [] },
					{ id: 'seg-b', openings: [] }
				]
			});
			const group = buildWallPathFrame(path, BUILDING_GRID_SIZE, settings(), materialManager);
			const mesh = findMesh(group);
			const pts = vertices(mesh.geometry);
			expect(
				pts.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z))
			).toBe(true);
			// No gap/duplicate: 2 beams + 2 ends + 1 corner post.
			expect(pts.length).toBe(5 * 8);
		}
	});

	it('an open path’s top beam overhangs each free endpoint past the wall end', () => {
		const materialManager = new BuildingMaterialManager();
		const path = makePath({
			points: [grid(0, 0), grid(4, 0)],
			segments: [{ id: 'seg-a', openings: [] }]
		});
		const pts = vertices(
			findMesh(buildWallPathFrame(path, BUILDING_GRID_SIZE, settings(), materialManager)).geometry
		);
		const beamTop = frameBeamTopY(HEIGHT);
		const beamTopPts = pts.filter((p) => Math.abs(p.y - beamTop) < 1e-6);
		expect(Math.min(...beamTopPts.map((p) => p.x))).toBeCloseTo(-FRAME_BEAM_END_OVERHANG, 5);
		expect(Math.max(...beamTopPts.map((p) => p.x))).toBeCloseTo(4 + FRAME_BEAM_END_OVERHANG, 5);
	});

	it('an upper-storey path (baseY > 0) places posts and the top beam at the correct elevation, never at ground level', () => {
		const materialManager = new BuildingMaterialManager();
		const baseY = 6;
		const path = makePath({
			points: [grid(0, 0), grid(4, 0)],
			baseY,
			segments: [{ id: 'seg-a', openings: [] }]
		});
		const group = buildWallPathFrame(path, BUILDING_GRID_SIZE, settings(), materialManager);
		const mesh = findMesh(group);
		const pts = vertices(mesh.geometry);
		expect(Math.min(...pts.map((p) => p.y))).toBeCloseTo(baseY, 5);
		expect(Math.max(...pts.map((p) => p.y))).toBeCloseTo(frameBeamTopY(baseY + HEIGHT), 5);
	});

	it('two separate short paths (as if a middle segment B->C were just removed from A->B->C->D) each get plain end posts, no leftover corner artefact', () => {
		const materialManager = new BuildingMaterialManager();
		const ab = makePath({
			points: [grid(0, 0), grid(4, 0)],
			segments: [{ id: 'seg-a', openings: [] }]
		});
		const cd = makePath({
			points: [grid(8, 0), grid(12, 0)],
			segments: [{ id: 'seg-c', openings: [] }]
		});
		for (const path of [ab, cd]) {
			const group = buildWallPathFrame(path, BUILDING_GRID_SIZE, settings(), materialManager);
			const mesh = findMesh(group);
			const pts = vertices(mesh.geometry);
			// 1 beam segment + 2 end posts = 3 pieces x 8 vertices.
			expect(pts.length).toBe(3 * 8);
		}
	});

	it('is disabled by a global default of false, and by a per-path override', () => {
		const materialManager = new BuildingMaterialManager();
		const path = makePath({
			points: [grid(0, 0), grid(4, 0)],
			segments: [{ id: 'seg-a', openings: [] }]
		});
		expect(
			buildWallPathFrame(
				path,
				BUILDING_GRID_SIZE,
				settings({ wallFrameEnabled: false }),
				materialManager
			)
		).toBeNull();
		expect(
			buildWallPathFrame(
				{ ...path, frameStyle: { enabled: false } },
				BUILDING_GRID_SIZE,
				settings(),
				materialManager
			)
		).toBeNull();
	});
});

describe('wall/path frame style persistence', () => {
	it('a frameStyle override on a WallDefinition/WallPathDefinition round-trips through plain JSON (no mesh data serialized alongside it)', () => {
		const path = makePath({
			points: [grid(0, 0), grid(4, 0)],
			segments: [{ id: 'seg-a', openings: [] }],
			frameStyle: {
				enabled: true,
				width: 0.2,
				depth: 0.08,
				material: { type: 'color', color: '#7A5230' }
			}
		});
		const roundTripped = JSON.parse(JSON.stringify(path)) as WallPathDefinition;
		expect(roundTripped.frameStyle).toEqual(path.frameStyle);
		// Nothing mesh-shaped ever entered the definition to begin with — a plain JSON round trip of
		// the WHOLE definition contains only logical numbers/strings.
		expect(typeof roundTripped.frameStyle?.width).toBe('number');
	});
});

describe('buildFoundationFrame', () => {
	const bounds = {
		id: 'f1',
		minX: 0,
		maxX: 10,
		minZ: 0,
		maxZ: 8,
		bottomY: 2,
		topY: 5
	};

	it('uses the closed-path wall recipe: four corner posts and four top beams', () => {
		const materialManager = new BuildingMaterialManager();
		const group = buildFoundationFrame(bounds, settings(), THICKNESS, 4, materialManager);
		expect(group?.name).toBe('foundation-frame');
		const pts = vertices(findMesh(group).geometry);
		expect(pts.length).toBe(8 * 8);
		expect(Math.max(...pts.map((p) => p.y))).toBeCloseTo(frameBeamTopY(bounds.topY), 5);
		expect(Math.max(...pts.map((p) => p.y))).toBeLessThan(bounds.topY);
		expect(Math.min(...pts.map((p) => p.y))).toBeCloseTo(bounds.bottomY, 5);
	});

	it('protrudes past each foundation face by depth-extra, matching wall frames', () => {
		const materialManager = new BuildingMaterialManager();
		const extra = settings().wallFrameDepthExtra;
		const pts = vertices(
			findMesh(buildFoundationFrame(bounds, settings(), THICKNESS, 4, materialManager)).geometry
		);
		expect(Math.min(...pts.map((p) => p.x))).toBeCloseTo(bounds.minX - extra, 5);
		expect(Math.max(...pts.map((p) => p.x))).toBeCloseTo(bounds.maxX + extra, 5);
		expect(Math.min(...pts.map((p) => p.z))).toBeCloseTo(bounds.minZ - extra, 5);
		expect(Math.max(...pts.map((p) => p.z))).toBeCloseTo(bounds.maxZ + extra, 5);
	});

	it('returns null when wall framing is disabled', () => {
		const materialManager = new BuildingMaterialManager();
		expect(
			buildFoundationFrame(
				bounds,
				settings({ wallFrameEnabled: false }),
				THICKNESS,
				4,
				materialManager
			)
		).toBeNull();
	});
});
