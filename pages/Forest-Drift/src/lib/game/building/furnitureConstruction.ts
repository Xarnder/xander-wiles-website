/**
 * Procedural furniture construction. Pure (no Three.js): each kind is a list of local-space
 * primitives whose structural sizes stay nearly constant while width/depth/height change the
 * layout. FurnitureGeometry turns this into BufferGeometry.
 *
 * Local frame: origin on the floor at the footprint centre, +Y up, +X width, +Z toward the front.
 */
import type { FurnitureBuildInput } from './furnitureCatalogue';
import type { FurnitureCollisionType } from './furnitureCatalogue';

export type FurnitureMaterialSlot = 'primary' | 'secondary' | 'accent' | 'emissive';

export type FurniturePrimitiveRole =
	| 'leg'
	| 'top'
	| 'shelf'
	| 'panel'
	| 'body'
	| 'mattress'
	| 'trim'
	| 'flame';

interface PrimitiveBase {
	material: FurnitureMaterialSlot;
	role: FurniturePrimitiveRole;
}

export interface FurnitureBoxPrimitive extends PrimitiveBase {
	shape: 'box';
	cx: number;
	cy: number;
	cz: number;
	sx: number;
	sy: number;
	sz: number;
}

export interface FurnitureCylinderPrimitive extends PrimitiveBase {
	shape: 'cylinder';
	cx: number;
	cy: number;
	cz: number;
	radiusTop: number;
	radiusBottom: number;
	height: number;
	radialSegments: number;
}

export interface FurnitureSpherePrimitive extends PrimitiveBase {
	shape: 'sphere';
	cx: number;
	cy: number;
	cz: number;
	radius: number;
	scaleY: number;
}

export interface FurnitureTorusPrimitive extends PrimitiveBase {
	shape: 'torus';
	cx: number;
	cy: number;
	cz: number;
	radius: number;
	tube: number;
	rotateX: number;
}

export interface FurnitureLathePrimitive extends PrimitiveBase {
	shape: 'lathe';
	cx: number;
	cy: number;
	cz: number;
	/** Local profile: x = radius, y = height from the lathe origin. */
	points: { x: number; y: number }[];
	segments: number;
}

export type FurniturePrimitive =
	| FurnitureBoxPrimitive
	| FurnitureCylinderPrimitive
	| FurnitureSpherePrimitive
	| FurnitureTorusPrimitive
	| FurnitureLathePrimitive;

export interface FurnitureMetrics {
	minX: number;
	maxX: number;
	minY: number;
	maxY: number;
	minZ: number;
	maxZ: number;
	footprintWidth: number;
	footprintDepth: number;
	collisionType: FurnitureCollisionType;
	collisionHeight: number;
	legThickness: number;
	topThickness: number;
}

export interface FurnitureConstruction {
	primitives: FurniturePrimitive[];
	metrics: FurnitureMetrics;
}

const LEG = 0.048;
const TOP = 0.04;
const INSET = 0.055;

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function box(
	cx: number,
	cy: number,
	cz: number,
	sx: number,
	sy: number,
	sz: number,
	material: FurnitureMaterialSlot,
	role: FurniturePrimitiveRole
): FurnitureBoxPrimitive {
	return { shape: 'box', cx, cy, cz, sx, sy, sz, material, role };
}

function cylinder(
	cx: number,
	cy: number,
	cz: number,
	radiusTop: number,
	radiusBottom: number,
	height: number,
	material: FurnitureMaterialSlot,
	role: FurniturePrimitiveRole,
	radialSegments = 10
): FurnitureCylinderPrimitive {
	return {
		shape: 'cylinder',
		cx,
		cy,
		cz,
		radiusTop,
		radiusBottom,
		height,
		radialSegments,
		material,
		role
	};
}

function sphere(
	cx: number,
	cy: number,
	cz: number,
	radius: number,
	material: FurnitureMaterialSlot,
	role: FurniturePrimitiveRole,
	scaleY = 1
): FurnitureSpherePrimitive {
	return { shape: 'sphere', cx, cy, cz, radius, scaleY, material, role };
}

function torus(
	cx: number,
	cy: number,
	cz: number,
	radius: number,
	tube: number,
	material: FurnitureMaterialSlot,
	role: FurniturePrimitiveRole,
	rotateX = Math.PI / 2
): FurnitureTorusPrimitive {
	return { shape: 'torus', cx, cy, cz, radius, tube, rotateX, material, role };
}

class Assembler {
	readonly primitives: FurniturePrimitive[] = [];

	box(
		cx: number,
		cy: number,
		cz: number,
		sx: number,
		sy: number,
		sz: number,
		material: FurnitureMaterialSlot = 'primary',
		role: FurniturePrimitiveRole = 'body'
	): this {
		this.primitives.push(box(cx, cy, cz, sx, sy, sz, material, role));
		return this;
	}

	cyl(
		cx: number,
		cy: number,
		cz: number,
		rTop: number,
		rBot: number,
		height: number,
		material: FurnitureMaterialSlot = 'primary',
		role: FurniturePrimitiveRole = 'body',
		segments = 10
	): this {
		this.primitives.push(cylinder(cx, cy, cz, rTop, rBot, height, material, role, segments));
		return this;
	}

	sphere(
		cx: number,
		cy: number,
		cz: number,
		radius: number,
		material: FurnitureMaterialSlot = 'emissive',
		role: FurniturePrimitiveRole = 'flame',
		scaleY = 1
	): this {
		this.primitives.push(sphere(cx, cy, cz, radius, material, role, scaleY));
		return this;
	}

	torus(
		cx: number,
		cy: number,
		cz: number,
		radius: number,
		tube: number,
		material: FurnitureMaterialSlot = 'accent',
		role: FurniturePrimitiveRole = 'trim',
		rotateX = Math.PI / 2
	): this {
		this.primitives.push(torus(cx, cy, cz, radius, tube, material, role, rotateX));
		return this;
	}

	lathe(
		cx: number,
		cy: number,
		cz: number,
		points: { x: number; y: number }[],
		material: FurnitureMaterialSlot,
		role: FurniturePrimitiveRole,
		segments = 16
	): this {
		this.primitives.push({ shape: 'lathe', cx, cy, cz, points, segments, material, role });
		return this;
	}

	fourLegs(width: number, depth: number, legHeight: number, thickness = LEG, inset = INSET): this {
		const hx = width / 2 - inset - thickness / 2;
		const hz = depth / 2 - inset - thickness / 2;
		const cy = legHeight / 2;
		for (const x of [-hx, hx]) {
			for (const z of [-hz, hz]) {
				this.box(x, cy, z, thickness, legHeight, thickness, 'primary', 'leg');
			}
		}
		return this;
	}

	roundLegs(width: number, depth: number, legHeight: number, radius = 0.022, inset = INSET): this {
		const hx = width / 2 - inset - radius;
		const hz = depth / 2 - inset - radius;
		const cy = legHeight / 2;
		for (const x of [-hx, hx]) {
			for (const z of [-hz, hz]) {
				this.cyl(x, cy, z, radius, radius * 1.15, legHeight, 'primary', 'leg', 8);
			}
		}
		return this;
	}

	apron(width: number, depth: number, topY: number, thickness = 0.028): this {
		const h = 0.055;
		const cy = topY - h / 2;
		const inset = INSET + LEG * 0.2;
		this.box(0, cy, depth / 2 - inset, width - inset * 2, h, thickness, 'primary', 'trim');
		this.box(0, cy, -(depth / 2 - inset), width - inset * 2, h, thickness, 'primary', 'trim');
		this.box(width / 2 - inset, cy, 0, thickness, h, depth - inset * 2, 'primary', 'trim');
		this.box(-(width / 2 - inset), cy, 0, thickness, h, depth - inset * 2, 'primary', 'trim');
		return this;
	}

	finish(input: FurnitureBuildInput, collision: FurnitureCollisionType): FurnitureConstruction {
		return {
			primitives: this.primitives,
			metrics: metricsFrom(this.primitives, input, collision)
		};
	}
}

function metricsFrom(
	primitives: FurniturePrimitive[],
	input: FurnitureBuildInput,
	collision: FurnitureCollisionType
): FurnitureMetrics {
	let minX = Infinity;
	let maxX = -Infinity;
	let minY = Infinity;
	let maxY = -Infinity;
	let minZ = Infinity;
	let maxZ = -Infinity;
	let legThickness = LEG;
	let topThickness = TOP;
	for (const primitive of primitives) {
		const ext = primitiveExtents(primitive);
		minX = Math.min(minX, ext.minX);
		maxX = Math.max(maxX, ext.maxX);
		minY = Math.min(minY, ext.minY);
		maxY = Math.max(maxY, ext.maxY);
		minZ = Math.min(minZ, ext.minZ);
		maxZ = Math.max(maxZ, ext.maxZ);
		if (primitive.role === 'leg') {
			if (primitive.shape === 'box') {
				legThickness = Math.min(primitive.sx, primitive.sz);
			} else if (primitive.shape === 'cylinder') {
				legThickness = primitive.radiusTop * 2;
			}
		}
		if (primitive.role === 'top' && primitive.shape === 'box') {
			topThickness = primitive.sy;
		}
	}
	if (!Number.isFinite(minX)) {
		minX = -input.width / 2;
		maxX = input.width / 2;
		minY = 0;
		maxY = input.height;
		minZ = -input.depth / 2;
		maxZ = input.depth / 2;
	}
	return {
		minX,
		maxX,
		minY,
		maxY,
		minZ,
		maxZ,
		footprintWidth: input.width,
		footprintDepth: input.depth,
		collisionType: collision,
		collisionHeight: collision === 'none' ? 0 : input.height,
		legThickness,
		topThickness
	};
}

function primitiveExtents(primitive: FurniturePrimitive): {
	minX: number;
	maxX: number;
	minY: number;
	maxY: number;
	minZ: number;
	maxZ: number;
} {
	if (primitive.shape === 'box') {
		return {
			minX: primitive.cx - primitive.sx / 2,
			maxX: primitive.cx + primitive.sx / 2,
			minY: primitive.cy - primitive.sy / 2,
			maxY: primitive.cy + primitive.sy / 2,
			minZ: primitive.cz - primitive.sz / 2,
			maxZ: primitive.cz + primitive.sz / 2
		};
	}
	if (primitive.shape === 'cylinder') {
		const r = Math.max(primitive.radiusTop, primitive.radiusBottom);
		return {
			minX: primitive.cx - r,
			maxX: primitive.cx + r,
			minY: primitive.cy - primitive.height / 2,
			maxY: primitive.cy + primitive.height / 2,
			minZ: primitive.cz - r,
			maxZ: primitive.cz + r
		};
	}
	if (primitive.shape === 'sphere') {
		return {
			minX: primitive.cx - primitive.radius,
			maxX: primitive.cx + primitive.radius,
			minY: primitive.cy - primitive.radius * primitive.scaleY,
			maxY: primitive.cy + primitive.radius * primitive.scaleY,
			minZ: primitive.cz - primitive.radius,
			maxZ: primitive.cz + primitive.radius
		};
	}
	if (primitive.shape === 'torus') {
		const r = primitive.radius + primitive.tube;
		return {
			minX: primitive.cx - r,
			maxX: primitive.cx + r,
			minY: primitive.cy - primitive.tube,
			maxY: primitive.cy + primitive.tube,
			minZ: primitive.cz - r,
			maxZ: primitive.cz + r
		};
	}
	let maxR = 0;
	let minY = Infinity;
	let maxY = -Infinity;
	for (const point of primitive.points) {
		maxR = Math.max(maxR, point.x);
		minY = Math.min(minY, primitive.cy + point.y);
		maxY = Math.max(maxY, primitive.cy + point.y);
	}
	return {
		minX: primitive.cx - maxR,
		maxX: primitive.cx + maxR,
		minY,
		maxY,
		minZ: primitive.cz - maxR,
		maxZ: primitive.cz + maxR
	};
}

function buildBed(input: FurnitureBuildInput): FurnitureConstruction {
	const { width: w, depth: d, height: h, headboard } = input;
	const a = new Assembler();
	const frameH = Math.min(0.16, h * 0.32);
	const mattressH = Math.min(0.16, h * 0.38);
	const rail = 0.055;
	a.fourLegs(w, d, frameH * 0.85, LEG, 0.06);
	a.box(0, frameH / 2, 0, w, frameH, d, 'primary', 'body');
	a.box(0, frameH + mattressH / 2, 0, w - rail * 1.4, mattressH, d - rail * 1.4, 'secondary', 'mattress');
	a.box(0, frameH * 0.7, d / 2 - rail / 2, w, frameH * 0.7, rail, 'primary', 'trim');
	a.box(0, frameH * 0.7, -(d / 2 - rail / 2), w, frameH * 0.7, rail, 'primary', 'trim');
	a.box(w / 2 - rail / 2, frameH * 0.7, 0, rail, frameH * 0.7, d - rail * 2, 'primary', 'trim');
	a.box(-(w / 2 - rail / 2), frameH * 0.7, 0, rail, frameH * 0.7, d - rail * 2, 'primary', 'trim');
	if (headboard) {
		const boardH = Math.max(0.28, h - frameH);
		a.box(0, frameH + boardH / 2, -(d / 2) + 0.03, w, boardH, 0.06, 'primary', 'panel');
	}
	a.box(-w * 0.18, frameH + mattressH + 0.05, -d * 0.28, w * 0.28, 0.08, 0.22, 'secondary', 'trim');
	a.box(w * 0.18, frameH + mattressH + 0.05, -d * 0.28, w * 0.28, 0.08, 0.22, 'secondary', 'trim');
	return a.finish(input, 'box');
}

function buildSmallTable(input: FurnitureBuildInput): FurnitureConstruction {
	const { width: w, depth: d, height: h } = input;
	const a = new Assembler();
	const top = TOP;
	a.roundLegs(w, d, h - top);
	a.box(0, h - top / 2, 0, w, top, d, 'primary', 'top');
	a.box(0, (h - top) * 0.38, 0, w - INSET * 2, 0.025, d - INSET * 2, 'primary', 'shelf');
	return a.finish(input, 'box');
}

function addCabinetDoors(
	a: Assembler,
	w: number,
	d: number,
	bodyBottom: number,
	bodyTop: number,
	frontZ: number
): void {
	const doorH = bodyTop - bodyBottom - 0.08;
	const cy = (bodyBottom + bodyTop) / 2;
	const doorW = w / 2 - 0.05;
	const gap = 0.012;
	a.box(-doorW / 2 - gap / 2, cy, frontZ, doorW, doorH, 0.02, 'secondary', 'panel');
	a.box(doorW / 2 + gap / 2, cy, frontZ, doorW, doorH, 0.02, 'secondary', 'panel');
	const handleY = cy + doorH * 0.05;
	a.cyl(-gap * 4, handleY, frontZ + 0.02, 0.012, 0.012, 0.07, 'accent', 'trim', 6);
	a.cyl(gap * 4, handleY, frontZ + 0.02, 0.012, 0.012, 0.07, 'accent', 'trim', 6);
}

function buildWardrobe(input: FurnitureBuildInput): FurnitureConstruction {
	const { width: w, depth: d, height: h } = input;
	const a = new Assembler();
	const plinth = 0.06;
	const wall = 0.028;
	a.box(0, plinth / 2, 0, w, plinth, d, 'primary', 'body');
	a.box(0, (h + plinth) / 2, 0, w - 0.02, h - plinth, d - 0.02, 'primary', 'body');
	a.box(0, h - wall / 2, 0, w, wall, d, 'primary', 'top');
	addCabinetDoors(a, w - 0.04, d, plinth + 0.04, h - 0.08, d / 2 - 0.01);
	a.fourLegs(w, d, plinth * 0.7, 0.04, 0.04);
	return a.finish(input, 'box');
}

function buildChair(input: FurnitureBuildInput): FurnitureConstruction {
	const { width: w, depth: d, height: h, backrest } = input;
	const a = new Assembler();
	const seatH = clamp(h * 0.48, 0.36, 0.48);
	const seatT = 0.045;
	a.fourLegs(w, d, seatH - seatT * 0.3, LEG, 0.045);
	a.box(0, seatH - seatT / 2, 0, w, seatT, d, 'secondary', 'top');
	a.apron(w, d, seatH - seatT, 0.022);
	if (backrest) {
		const backH = h - seatH;
		const backZ = -(d / 2) + 0.03;
		a.box(-w / 2 + LEG / 2, seatH + backH / 2, backZ, LEG, backH, LEG, 'primary', 'leg');
		a.box(w / 2 - LEG / 2, seatH + backH / 2, backZ, LEG, backH, LEG, 'primary', 'leg');
		a.box(0, seatH + backH * 0.55, backZ, w - LEG, backH * 0.7, 0.03, 'primary', 'panel');
	}
	return a.finish(input, 'box');
}

function buildStool(input: FurnitureBuildInput): FurnitureConstruction {
	const { width: w, depth: d, height: h } = input;
	const a = new Assembler();
	const seatT = 0.04;
	a.roundLegs(w, d, h - seatT, 0.02, 0.05);
	a.cyl(0, h - seatT / 2, 0, w * 0.42, w * 0.42, seatT, 'secondary', 'top', 12);
	a.box(0, h * 0.38, 0, w * 0.55, 0.018, d * 0.55, 'primary', 'trim');
	return a.finish(input, 'box');
}

function buildBench(input: FurnitureBuildInput): FurnitureConstruction {
	const { width: w, depth: d, height: h, backrest } = input;
	const a = new Assembler();
	const seatH = clamp(h * 0.52, 0.38, 0.5);
	const seatT = 0.05;
	const legW = LEG;
	const supportCount = Math.max(2, Math.round(w / 1.2) + 1);
	for (let i = 0; i < supportCount; i++) {
		const t = supportCount === 1 ? 0.5 : i / (supportCount - 1);
		const x = -w / 2 + INSET + t * (w - INSET * 2);
		a.box(x, (seatH - seatT) / 2, -d / 2 + INSET + legW / 2, legW, seatH - seatT, legW, 'primary', 'leg');
		a.box(x, (seatH - seatT) / 2, d / 2 - INSET - legW / 2, legW, seatH - seatT, legW, 'primary', 'leg');
	}
	a.box(0, seatH - seatT / 2, 0, w, seatT, d, 'primary', 'top');
	a.box(0, (seatH - seatT) * 0.45, 0, w - INSET * 2, 0.03, 0.03, 'primary', 'trim');
	if (backrest) {
		const backH = h - seatH;
		a.box(0, seatH + backH / 2, -(d / 2) + 0.025, w, backH, 0.04, 'primary', 'panel');
	}
	return a.finish(input, 'box');
}

function buildTable(input: FurnitureBuildInput): FurnitureConstruction {
	const { width: w, depth: d, height: h } = input;
	const a = new Assembler();
	const top = TOP;
	a.fourLegs(w, d, h - top);
	a.box(0, h - top / 2, 0, w, top, d, 'primary', 'top');
	a.apron(w, d, h - top);
	return a.finish(input, 'box');
}

function buildWorkbench(input: FurnitureBuildInput): FurnitureConstruction {
	const { width: w, depth: d, height: h } = input;
	const a = new Assembler();
	const top = 0.07;
	const thick = 0.07;
	a.fourLegs(w, d, h - top, thick, 0.06);
	a.box(0, h - top / 2, 0, w, top, d, 'primary', 'top');
	a.apron(w, d, h - top, 0.04);
	a.box(0, (h - top) * 0.32, 0, w - 0.16, 0.03, d - 0.16, 'secondary', 'shelf');
	a.box(0, (h - top) * 0.5, 0, 0.04, (h - top) * 0.55, d - 0.18, 'primary', 'trim');
	return a.finish(input, 'box');
}

function buildCounter(input: FurnitureBuildInput, sink: boolean): FurnitureConstruction {
	const { width: w, depth: d, height: h } = input;
	const a = new Assembler();
	const plinth = 0.08;
	const top = 0.045;
	const bodyH = h - plinth - top;
	a.box(0, plinth / 2, 0, w, plinth, d, 'primary', 'body');
	a.box(0, plinth + bodyH / 2, 0, w, bodyH, d, 'primary', 'body');
	a.box(0, h - top / 2, 0, w + 0.02, top, d + 0.04, 'secondary', 'top');
	const doors = Math.max(1, Math.round(w / 0.55));
	const doorW = (w - 0.08) / doors;
	const frontZ = d / 2 - 0.012;
	for (let i = 0; i < doors; i++) {
		const x = -w / 2 + 0.04 + doorW * (i + 0.5);
		a.box(x, plinth + bodyH / 2, frontZ, doorW - 0.02, bodyH - 0.08, 0.018, 'secondary', 'panel');
		a.cyl(x + doorW * 0.28, plinth + bodyH * 0.55, frontZ + 0.02, 0.01, 0.01, 0.05, 'accent', 'trim', 6);
	}
	if (sink) {
		const basinW = clamp(w * 0.38, 0.32, 0.55);
		const basinD = d * 0.45;
		a.box(0, h - top - 0.04, d * 0.05, basinW, 0.08, basinD, 'accent', 'body');
		a.cyl(0, h - 0.02, d * 0.05, basinW * 0.22, basinW * 0.18, 0.04, 'accent', 'body', 12);
		a.cyl(0, h + 0.08, -d * 0.08, 0.012, 0.012, 0.16, 'accent', 'trim', 6);
		a.box(0, h + 0.15, -d * 0.02, 0.09, 0.02, 0.04, 'accent', 'trim');
	}
	return a.finish(input, 'box');
}

function buildFurnace(input: FurnitureBuildInput): FurnitureConstruction {
	const { width: w, depth: d, height: h } = input;
	const a = new Assembler();
	a.box(0, h * 0.42, 0, w, h * 0.84, d, 'primary', 'body');
	a.box(0, h * 0.86, 0, w * 0.92, 0.06, d * 0.92, 'secondary', 'top');
	a.box(0, h * 0.38, d / 2 - 0.01, w * 0.55, h * 0.42, 0.03, 'secondary', 'panel');
	a.box(0, h * 0.38, d / 2, w * 0.28, h * 0.22, 0.02, 'emissive', 'flame');
	a.cyl(0, h * 0.96, -d * 0.1, w * 0.12, w * 0.14, h * 0.18, 'primary', 'trim', 8);
	return a.finish(input, 'box');
}

function buildCupboard(input: FurnitureBuildInput): FurnitureConstruction {
	const { width: w, depth: d, height: h } = input;
	const a = new Assembler();
	const plinth = 0.05;
	a.box(0, plinth / 2, 0, w, plinth, d, 'primary', 'body');
	a.box(0, (h + plinth) / 2, 0, w, h - plinth, d, 'primary', 'body');
	addCabinetDoors(a, w, d, plinth + 0.04, h - 0.06, d / 2 - 0.01);
	a.box(0, h * 0.5, 0, w - 0.06, 0.02, d - 0.06, 'primary', 'shelf');
	return a.finish(input, 'box');
}

function buildChest(input: FurnitureBuildInput): FurnitureConstruction {
	const { width: w, depth: d, height: h } = input;
	const a = new Assembler();
	const lid = Math.min(0.08, h * 0.22);
	const bodyH = h - lid;
	a.box(0, bodyH / 2, 0, w, bodyH, d, 'primary', 'body');
	a.box(0, bodyH + lid / 2 + 0.01, -0.01, w + 0.02, lid, d + 0.02, 'primary', 'top');
	a.box(0, bodyH * 0.55, d / 2 + 0.01, w * 0.18, 0.04, 0.03, 'accent', 'trim');
	a.box(-w / 2, bodyH / 2, 0, 0.03, bodyH * 0.7, d * 0.7, 'accent', 'trim');
	a.box(w / 2, bodyH / 2, 0, 0.03, bodyH * 0.7, d * 0.7, 'accent', 'trim');
	a.fourLegs(w, d, 0.04, 0.04, 0.04);
	return a.finish(input, 'box');
}

function buildBarrel(input: FurnitureBuildInput): FurnitureConstruction {
	const radius = input.width / 2;
	const h = input.height;
	const a = new Assembler();
	const bulge = radius * 1.1;
	const points = [
		{ x: radius * 0.9, y: -h / 2 },
		{ x: radius * 0.98, y: -h * 0.32 },
		{ x: bulge, y: 0 },
		{ x: radius * 0.98, y: h * 0.32 },
		{ x: radius * 0.9, y: h / 2 }
	];
	a.lathe(0, h / 2, 0, points, 'primary', 'body', 18);
	a.cyl(0, 0.03, 0, radius * 0.88, radius * 0.88, 0.04, 'primary', 'top', 14);
	a.cyl(0, h - 0.03, 0, radius * 0.88, radius * 0.88, 0.04, 'primary', 'top', 14);
	for (const t of [0.18, 0.5, 0.82]) {
		const y = h * t;
		const local = t < 0.35 || t > 0.65 ? radius * 0.96 : bulge * 1.01;
		a.cyl(0, y, 0, local, local, 0.028, 'accent', 'trim', 14);
	}
	return a.finish(input, 'cylinder');
}

function buildShelfUnit(input: FurnitureBuildInput, enclosed: boolean): FurnitureConstruction {
	const { width: w, depth: d, height: h, shelfCount } = input;
	const a = new Assembler();
	const post = 0.04;
	const board = 0.03;
	const count = shelfCount;
	a.box(-w / 2 + post / 2, h / 2, -d / 2 + post / 2, post, h, post, 'primary', 'leg');
	a.box(w / 2 - post / 2, h / 2, -d / 2 + post / 2, post, h, post, 'primary', 'leg');
	a.box(-w / 2 + post / 2, h / 2, d / 2 - post / 2, post, h, post, 'primary', 'leg');
	a.box(w / 2 - post / 2, h / 2, d / 2 - post / 2, post, h, post, 'primary', 'leg');
	if (enclosed) {
		a.box(0, h / 2, -d / 2 + 0.012, w - post, h, 0.02, 'secondary', 'panel');
		a.box(-w / 2 + 0.012, h / 2, 0, 0.02, h, d - post, 'primary', 'panel');
		a.box(w / 2 - 0.012, h / 2, 0, 0.02, h, d - post, 'primary', 'panel');
		a.box(0, board / 2, 0, w, board, d, 'primary', 'top');
		a.box(0, h - board / 2, 0, w, board, d, 'primary', 'top');
	}
	for (let i = 0; i < count; i++) {
		const t = count === 1 ? 0.5 : i / (count - 1);
		const y = enclosed ? board + t * (h - board * 2) : 0.04 + t * (h - 0.08);
		a.box(0, y, 0, w - (enclosed ? post : 0.02), board, d - (enclosed ? 0.02 : 0), 'primary', 'shelf');
	}
	return a.finish(input, 'box');
}

function buildFireplace(input: FurnitureBuildInput): FurnitureConstruction {
	const { width: w, depth: d, height: h } = input;
	const a = new Assembler();
	const base = 0.12;
	const pillar = 0.16;
	a.box(0, base / 2, 0, w, base, d, 'primary', 'body');
	a.box(-w / 2 + pillar / 2, (h + base) / 2, 0, pillar, h - base, d * 0.92, 'primary', 'panel');
	a.box(w / 2 - pillar / 2, (h + base) / 2, 0, pillar, h - base, d * 0.92, 'primary', 'panel');
	a.box(0, h - 0.08, 0, w, 0.16, d, 'primary', 'top');
	a.box(0, h * 0.45, -d * 0.15, w - pillar * 2.1, h * 0.55, d * 0.35, 'secondary', 'body');
	a.box(0, base + 0.12, 0, w * 0.42, 0.08, d * 0.35, 'emissive', 'flame');
	a.sphere(0, base + 0.22, d * 0.05, 0.07, 'emissive', 'flame', 1.4);
	return a.finish(input, 'box');
}

function buildLantern(input: FurnitureBuildInput): FurnitureConstruction {
	const { width: w, height: h } = input;
	const a = new Assembler();
	const r = w * 0.38;
	a.cyl(0, 0.03, 0, r * 1.1, r * 1.2, 0.05, 'primary', 'body', 8);
	a.cyl(0, h * 0.42, 0, r * 0.12, r * 0.12, h * 0.7, 'primary', 'leg', 6);
	a.box(-r, h * 0.45, 0, 0.018, h * 0.45, 0.018, 'primary', 'trim');
	a.box(r, h * 0.45, 0, 0.018, h * 0.45, 0.018, 'primary', 'trim');
	a.box(0, h * 0.45, -r, 0.018, h * 0.45, 0.018, 'primary', 'trim');
	a.box(0, h * 0.45, r, 0.018, h * 0.45, 0.018, 'primary', 'trim');
	a.sphere(0, h * 0.42, 0, r * 0.55, 'emissive', 'flame', 1.1);
	a.cyl(0, h * 0.78, 0, r * 0.7, r * 0.55, 0.05, 'primary', 'top', 8);
	a.torus(0, h * 0.92, 0, r * 0.28, 0.012, 'primary', 'trim', Math.PI / 2);
	return a.finish(input, 'none');
}

function buildTorch(input: FurnitureBuildInput): FurnitureConstruction {
	const a = new Assembler();
	a.cyl(0, 0.2, 0, 0.028, 0.034, 0.4, 'primary', 'body', 8);
	a.cyl(0, 0.42, 0, 0.055, 0.04, 0.07, 'primary', 'body', 8);
	a.torus(0, 0.36, 0, 0.05, 0.012, 'accent', 'trim', Math.PI / 2);
	a.sphere(0, 0.5, 0, 0.055, 'emissive', 'flame', 1.15);
	return a.finish(input, 'none');
}

export function buildFurnitureConstruction(input: FurnitureBuildInput): FurnitureConstruction {
	switch (input.kind) {
		case 'bed':
			return buildBed(input);
		case 'small-table':
			return buildSmallTable(input);
		case 'wardrobe':
			return buildWardrobe(input);
		case 'chair':
			return buildChair(input);
		case 'stool':
			return buildStool(input);
		case 'bench':
			return buildBench(input);
		case 'table':
			return buildTable(input);
		case 'workbench':
			return buildWorkbench(input);
		case 'kitchen-counter':
			return buildCounter(input, false);
		case 'kitchen-counter-sink':
			return buildCounter(input, true);
		case 'furnace':
			return buildFurnace(input);
		case 'cupboard':
			return buildCupboard(input);
		case 'chest':
			return buildChest(input);
		case 'barrel':
			return buildBarrel(input);
		case 'shelf':
			return buildShelfUnit(input, false);
		case 'bookcase':
			return buildShelfUnit(input, true);
		case 'fireplace':
			return buildFireplace(input);
		case 'lantern':
			return buildLantern(input);
		case 'torch':
			return buildTorch(input);
	}
}

export function furniturePrimitivesWithRole(
	construction: FurnitureConstruction,
	role: FurniturePrimitiveRole
): FurniturePrimitive[] {
	return construction.primitives.filter((primitive) => primitive.role === role);
}

export function furnitureConstructionIsFinite(construction: FurnitureConstruction): boolean {
	if (!Number.isFinite(construction.metrics.maxX - construction.metrics.minX)) return false;
	for (const primitive of construction.primitives) {
		for (const value of Object.values(primitive)) {
			if (typeof value === 'number' && !Number.isFinite(value)) return false;
			if (Array.isArray(value)) {
				for (const point of value) {
					if (typeof point === 'object' && point && 'x' in point) {
						const p = point as { x: number; y: number };
						if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return false;
					}
				}
			}
		}
	}
	return construction.primitives.length > 0;
}
