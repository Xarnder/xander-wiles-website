/**
 * Where a rider sits on a biped, measured from the creature's own skin and rig at its rest pose, in
 * creature space (+Z forward, +Y up, the creature's right is -X). Pure numeric work, done once when
 * the rider climbs on; the scene moves the result with the creature every frame.
 *
 * - `neck` (small bipeds, Q4): astride the neck, the pelvis on top of the shoulders just behind it.
 * - `right-shoulder` (large bipeds, Q5): on top of the right shoulder, far enough out to clear the
 *   neck (and, while carrying, the carried creature under the rider's left arm, Q12 C).
 *
 * Either way the seat moves (back, or out) until nothing of the creature — a big head, a crest —
 * overhangs the space the rider's body takes up above it.
 *
 * Plan: docs/2026/11-07/bipedal-speed-creature/feature-plan/02-technical-plan.md §4.4.
 */
import type { CreatureCompilation, ProceduralJoint, Vec3 } from './CreatureTypes';
import type { RideSeatKind } from './creatureRiding';

export interface RideSeatLayout {
	kind: RideSeatKind;
	/** The pelvis support point (what a chair's seat is to a sitting player). */
	pelvis: Vec3;
	/** Highest point of the head, so the first-person camera can look over it on a neck seat. */
	headTop: number;
	/** Where the rider's hands hold on; null leaves that hand on the thigh. */
	hands: { left: Vec3 | null; right: Vec3 | null };
	/** The head hung over every seat on the shoulders, so the rider sits on top of it instead. */
	onHead: boolean;
}

/** Half the rider's hip width plus a little room, metres. */
const RIDER_HALF_WIDTH = 0.24;
/** Seated rider: pelvis to the top of the head, metres. */
const RIDER_SEATED_HEIGHT = 0.95;
/** On a shoulder seat, the room kept clear round the rider (beyond the contact) and above them. */
const RIDER_SHOULDER_ROOM = 0.3;
const RIDER_SHOULDER_HEADROOM = 1.8;
/** On top of a large creature's head, the rider sits this far right of its middle, metres. */
const HEAD_SEAT_ACROSS = 0.35;
/** A seat never settles lower than this fraction of the height below where the search began. */
const SEAT_MAX_DROP = 0.12;
/** The pelvis sits this far above the skin it rests on, metres. */
const SEAT_GAP = 0.02;
/** How far round the seat point the rider rests on the skin, at least (metres) and per metre tall. */
const CONTACT_MIN = 0.08;
const CONTACT_PER_HEIGHT = 0.02;
/** A vertical gap this big (at least, and per metre tall) separates two parts of the body. */
const PART_GAP_MIN = 0.12;
const PART_GAP_PER_HEIGHT = 0.045;
/** Steps the seat may move to clear an overhang. */
const CLEAR_STEPS = 12;

/** Rest-pose positions of every joint in creature space (rest rotations are identity). */
export function restJointPositions(joints: readonly ProceduralJoint[]): Map<string, Vec3> {
	const byId = new Map(joints.map((j) => [j.id, j] as const));
	const out = new Map<string, Vec3>();
	const resolve = (joint: ProceduralJoint): Vec3 => {
		const known = out.get(joint.id);
		if (known) return known;
		const parent = joint.parentId ? byId.get(joint.parentId) : undefined;
		const base = parent ? resolve(parent) : { x: 0, y: 0, z: 0 };
		const p = {
			x: base.x + joint.localPosition.x,
			y: base.y + joint.localPosition.y,
			z: base.z + joint.localPosition.z
		};
		out.set(joint.id, p);
		return p;
	};
	for (const joint of joints) resolve(joint);
	return out;
}

/** Highest skin point within `radius` (horizontally) of (x, z) and below `maxY`, or null. */
export function skinTop(
	positions: ArrayLike<number>,
	x: number,
	z: number,
	radius: number,
	maxY = Number.POSITIVE_INFINITY
): number | null {
	let top: number | null = null;
	const r2 = radius * radius;
	for (let i = 0; i < positions.length; i += 3) {
		const dx = positions[i] - x,
			y = positions[i + 1],
			dz = positions[i + 2] - z;
		if (dx * dx + dz * dz > r2 || y > maxY) continue;
		if (top === null || y > top) top = y;
	}
	return top;
}

/** The space the seated rider needs above the seat. */
interface RiderRoom {
	/** Horizontal radius round the seat point. */
	radius: number;
	/** Height above the seat. */
	height: number;
}

/**
 * The skin in the column round (x, z) (within `contact`), split into parts wherever there's a
 * vertical gap (a hanging arm and the shoulder above it are one part; a head overhanging the back
 * is another). The surface to sit on is the top of the highest part below `maxY` (never the head
 * itself). `overhang` says some skin within `room` sits above that surface (beyond the surface's
 * own undulation, `gap`), where the rider's body would be.
 */
function column(
	positions: ArrayLike<number>,
	x: number,
	z: number,
	contact: number,
	gap: number,
	room: RiderRoom,
	maxY: number
): { top: number; overhang: boolean } | null {
	const heights: number[] = [];
	const contact2 = contact * contact;
	for (let i = 0; i < positions.length; i += 3) {
		const dx = positions[i] - x,
			dz = positions[i + 2] - z;
		if (dx * dx + dz * dz <= contact2) heights.push(positions[i + 1]);
	}
	if (heights.length === 0) return null;
	heights.sort((a, b) => a - b);
	const parts: { bottom: number; top: number }[] = [];
	for (const y of heights) {
		const last = parts[parts.length - 1];
		if (last && y - last.top <= gap) last.top = y;
		else parts.push({ bottom: y, top: y });
	}
	for (let i = parts.length - 1; i >= 0; i--) {
		const top = parts[i].top;
		if (top > maxY) continue;
		const room2 = room.radius * room.radius;
		for (let j = 0; j < positions.length; j += 3) {
			const y = positions[j + 1];
			if (y <= top + gap || y >= top + room.height) continue;
			const dx = positions[j] - x,
				dz = positions[j + 2] - z;
			if (dx * dx + dz * dz <= room2) return { top, overhang: true };
		}
		return { top, overhang: false };
	}
	return null;
}

/** Widest |x| of skin within `band` of height `y` and closer to the midline than `maxAbsX`. */
function halfWidthAt(
	positions: ArrayLike<number>,
	y: number,
	band: number,
	maxAbsX: number
): number {
	let half = 0;
	for (let i = 0; i < positions.length; i += 3) {
		const ax = Math.abs(positions[i]);
		if (Math.abs(positions[i + 1] - y) <= band && ax < maxAbsX && ax > half) half = ax;
	}
	return half;
}

function highest(positions: ArrayLike<number>): number {
	let top = 0;
	for (let i = 1; i < positions.length; i += 3) if (positions[i] > top) top = positions[i];
	return top;
}

/**
 * The first spot with room for the rider, walking from `start` along each of `steps` in turn, or
 * null. A walk stops where the skin ends (never into the air) or drops more than `maxDrop` below
 * where it started (sliding off the shoulders onto the back).
 */
function clearSeat(
	positions: ArrayLike<number>,
	start: { x: number; z: number },
	steps: readonly { x: number; z: number }[],
	size: { contact: number; gap: number; maxY: number },
	room: RiderRoom,
	maxDrop: number
): Vec3 | null {
	const origin = column(positions, start.x, start.z, size.contact, size.gap, room, size.maxY);
	if (!origin) return null;
	const floor = origin.top - maxDrop;
	for (const step of steps)
		for (let i = 0; i <= CLEAR_STEPS; i++) {
			const x = start.x + step.x * i,
				z = start.z + step.z * i;
			const found = column(positions, x, z, size.contact, size.gap, room, size.maxY);
			if (!found || found.top < floor) break;
			if (!found.overhang) return { x, y: found.top + SEAT_GAP, z };
		}
	return null;
}

/**
 * The seat on `compilation` (a biped). `carryClearance` widens the gap beside the neck on a
 * shoulder seat, for a creature carried under the rider's left arm.
 *
 * Some species' heads are so big they hang over the whole of the shoulders (no seat there has room
 * for a rider's body). Then the rider sits on top of the head instead, on its right side for a
 * large creature, rather than half inside it.
 */
export function rideSeatLayout(
	compilation: CreatureCompilation,
	kind: RideSeatKind,
	carryClearance = 0
): RideSeatLayout {
	const positions = compilation.geometry.positions;
	const joints = restJointPositions(compilation.skeleton.joints);
	const height = compilation.bounds.height;
	const chest = joints.get('chest') ?? { x: 0, y: height * 0.6, z: 0 };
	const neck = joints.get('neck') ?? { ...chest, y: chest.y + height * 0.1 };
	const head = joints.get('head') ?? { ...neck, y: neck.y + height * 0.1 };
	const headTop = highest(positions);
	const torsoDepth =
		compilation.definition.species.proportions.bodyDepth *
		compilation.definition.individual.sizeFactor;
	const neckHalf = halfWidthAt(
		positions,
		neck.y,
		Math.max(0.02, (head.y - neck.y) * 0.25),
		torsoDepth
	);
	const size = {
		contact: Math.max(CONTACT_MIN, height * CONTACT_PER_HEIGHT),
		gap: Math.max(PART_GAP_MIN, height * PART_GAP_PER_HEIGHT),
		// Never sit on the head itself (except as the last resort below).
		maxY: head.y
	};
	const stride = size.contact * 0.75;
	const maxDrop = height * SEAT_MAX_DROP;

	if (kind === 'neck') {
		// Just behind the neck, on top of the shoulders; the neck rises between the rider's legs.
		const z = Math.min(neck.z, chest.z) - Math.max(neckHalf, torsoDepth * 0.15) - size.contact;
		// Straddling: only the space straight above the seat must be clear (the neck is between the legs).
		const room = { radius: size.contact, height: RIDER_SEATED_HEIGHT };
		const pelvis = clearSeat(positions, { x: 0, z }, [{ x: 0, z: -stride }], size, room, maxDrop);
		if (!pelvis) return onHead(positions, kind, head, headTop, 0, size.contact);
		const grip = Math.max(0.06, neckHalf);
		return {
			kind,
			pelvis,
			headTop,
			hands: {
				left: { x: head.x + grip, y: head.y, z: head.z },
				right: { x: head.x - grip, y: head.y, z: head.z }
			},
			onHead: false
		};
	}

	// The right arm's root (the creature's right is -X).
	const shoulder = rightShoulder(compilation, joints) ?? {
		x: -torsoDepth * 0.5,
		y: chest.y,
		z: chest.z
	};
	const x = -Math.max(Math.abs(shoulder.x) * 0.85, neckHalf + RIDER_HALF_WIDTH + carryClearance);
	// Beside the neck: the rider's whole upper body and head need room, so a big head or a crest
	// doesn't hang over them.
	const room = { radius: size.contact + RIDER_SHOULDER_ROOM, height: RIDER_SHOULDER_HEADROOM };
	const pelvis = clearSeat(
		positions,
		{ x, z: shoulder.z },
		// Out along the shoulder, then back along it, then back and out.
		[
			{ x: -stride, z: 0 },
			{ x: 0, z: -stride },
			{ x: -stride * 0.7, z: -stride * 0.7 }
		],
		size,
		room,
		maxDrop
	);
	if (!pelvis) return onHead(positions, kind, head, headTop, HEAD_SEAT_ACROSS, size.contact);
	return {
		kind,
		pelvis,
		headTop,
		hands: {
			// Holding the neck at its near side; the right hand rests on the thigh.
			left: { x: -neckHalf, y: Math.min(neck.y, pelvis.y + 0.45), z: neck.z },
			right: null
		},
		onHead: false
	};
}

/**
 * The last resort: sitting on top of the head, above the head joint (not on an ear or antenna tip),
 * `across` metres to the creature's right where there's skin there; hands on the thighs.
 */
function onHead(
	positions: ArrayLike<number>,
	kind: RideSeatKind,
	head: Vec3,
	headTop: number,
	across: number,
	contact: number
): RideSeatLayout {
	const x = head.x - across;
	const side = skinTop(positions, x, head.z, contact);
	const middle = skinTop(positions, head.x, head.z, contact) ?? head.y;
	const pelvis =
		side !== null && middle - side < RIDER_SEATED_HEIGHT * 0.5
			? { x, y: side + SEAT_GAP, z: head.z }
			: { x: head.x, y: middle + SEAT_GAP, z: head.z };
	return { kind, pelvis, headTop, hands: { left: null, right: null }, onHead: true };
}

function rightShoulder(compilation: CreatureCompilation, joints: Map<string, Vec3>): Vec3 | null {
	let best: Vec3 | null = null;
	for (const limb of compilation.skeleton.limbs) {
		if (!limb.arm) continue;
		const root = joints.get(limb.hipId);
		if (root && root.x < 0 && (!best || root.x < best.x)) best = root;
	}
	return best;
}

/** A point fixed to one bone of the creature: it moves with that bone's bob, sway and tilt. */
export interface BoneAnchor {
	bone: string;
	/** The point in the bone's own space (rest rotations are identity, so it's a plain offset). */
	offset: Vec3;
}

/** The seat's points, each on the bone that carries it. */
export interface RideSeatAnchors {
	pelvis: BoneAnchor;
	hands: { left: BoneAnchor | null; right: BoneAnchor | null };
	headTop: BoneAnchor;
}

/**
 * Pins a seat layout to the creature's bones, so the rider rides the body's own motion rather than
 * a fixed point over its feet: the pelvis on the chest (the shoulders and the base of the neck move
 * with it), or on the head when sitting on it; hands on the head (astride) or the neck (beside it).
 */
export function rideSeatAnchors(
	compilation: CreatureCompilation,
	layout: RideSeatLayout
): RideSeatAnchors {
	const joints = restJointPositions(compilation.skeleton.joints);
	const anchor = (bone: string, point: Vec3): BoneAnchor => {
		// A rig without that bone keeps the point on its root (where everything starts).
		const rest = joints.get(bone);
		const id = rest ? bone : 'root';
		const base = rest ?? joints.get('root') ?? { x: 0, y: 0, z: 0 };
		return { bone: id, offset: { x: point.x - base.x, y: point.y - base.y, z: point.z - base.z } };
	};
	const handBone = layout.kind === 'neck' ? 'head' : 'neck';
	const head = joints.get('head') ?? { x: 0, y: layout.headTop, z: 0 };
	return {
		pelvis: anchor(layout.onHead ? 'head' : 'chest', layout.pelvis),
		hands: {
			left: layout.hands.left ? anchor(handBone, layout.hands.left) : null,
			right: layout.hands.right ? anchor(handBone, layout.hands.right) : null
		},
		headTop: anchor('head', { ...head, y: layout.headTop })
	};
}
