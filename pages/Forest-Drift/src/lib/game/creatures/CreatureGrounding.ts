import { Matrix4, Quaternion, Vector3 } from 'three';
import type {
	CreatureCompilation,
	CreatureIntent,
	CreatureLod,
	LimbRigDefinition,
	TerrainLocomotion
} from './CreatureTypes';
import { jointWorldPositions } from './SkeletonGenerator';
import { resolveTerrainLocomotion } from './CreatureTerrainProfile';
import { sectionAt } from './SweptBodyVolume';

/**
 * Terrain conformation for procedural creatures.
 *
 *   terrain samples → planted foot contacts → weighted best-fit support plane
 *     → desired body orientation/height (slope-follow, tilt limits, leg reach, clearance)
 *     → frame-rate-independent smoothing → per-leg IK to each foot's own contact
 *
 * The BODY follows the overall support trend; each FOOT keeps its exact local contact. Planted feet
 * stay fixed in world space until their gait phase (or a step trigger) lifts them, which removes
 * foot skating. Serpents conform locally along their spine instead of tilting as one body.
 * Everything is analytic, reuses scratch objects, and samples the authoritative world surface
 * (never rendered meshes) through a small per-update cache.
 */

export type LegGroundState = 'planted' | 'swing' | 'seeking' | 'recovering';
export type SurfaceSampler = (x: number, z: number) => number;

/** Module-wide counters for benchmarks/debug; reset by callers. */
export const groundingStats = { surfaceCalls: 0, planeFits: 0, ikSolves: 0, updates: 0 };

export interface SupportPlaneFit {
	a: number;
	b: number;
	c: number;
	normal: Vector3;
	/** Contacts with non-negligible weight. */
	count: number;
	weightSum: number;
	/** Largest |residual| after the fit. */
	maxResidual: number;
	/** Fewer than three non-collinear contacts: slope is undefined in at least one direction. */
	degenerate: boolean;
}
export const createPlaneFit = (): SupportPlaneFit => ({
	a: 0,
	b: 0,
	c: 0,
	normal: new Vector3(0, 1, 0),
	count: 0,
	weightSum: 0,
	maxResidual: 0,
	degenerate: true
});

function solvePlane(
	x: ArrayLike<number>,
	y: ArrayLike<number>,
	z: ArrayLike<number>,
	w: ArrayLike<number>,
	n: number,
	out: SupportPlaneFit
) {
	let W = 0,
		mx = 0,
		my = 0,
		mz = 0,
		count = 0;
	for (let i = 0; i < n; i++) {
		const wi = w[i];
		if (!(wi > 1e-6)) continue;
		W += wi;
		mx += wi * x[i];
		my += wi * y[i];
		mz += wi * z[i];
		count++;
	}
	out.count = count;
	out.weightSum = W;
	if (W <= 1e-9) {
		out.a = out.b = 0;
		out.c = 0;
		out.degenerate = true;
		return;
	}
	mx /= W;
	my /= W;
	mz /= W;
	let sxx = 0,
		sxz = 0,
		szz = 0,
		sxy = 0,
		szy = 0;
	for (let i = 0; i < n; i++) {
		const wi = w[i];
		if (!(wi > 1e-6)) continue;
		const dx = x[i] - mx,
			dz = z[i] - mz,
			dy = y[i] - my;
		sxx += wi * dx * dx;
		sxz += wi * dx * dz;
		szz += wi * dz * dz;
		sxy += wi * dx * dy;
		szy += wi * dz * dy;
	}
	const det = sxx * szz - sxz * sxz,
		scale = sxx + szz;
	if (count < 3 || det <= 1e-9 * scale * scale || scale <= 1e-12) {
		out.a = out.b = 0;
		out.c = my;
		out.degenerate = true;
		return;
	}
	out.a = (sxy * szz - szy * sxz) / det;
	out.b = (szy * sxx - sxy * sxz) / det;
	out.c = my - out.a * mx - out.b * mz;
	out.degenerate = false;
}

/**
 * Weighted least-squares plane y = a·x + b·z + c through every supporting contact (any N ≥ 3),
 * then one robust pass: contacts further than `outlierThreshold` from the plane are down-weighted by
 * (threshold/residual)⁴ and the plane is refit once. `scratch` must hold at least `n` weights.
 */
export function fitSupportPlane(
	x: ArrayLike<number>,
	y: ArrayLike<number>,
	z: ArrayLike<number>,
	weights: ArrayLike<number>,
	n: number,
	out: SupportPlaneFit,
	outlierThreshold = Infinity,
	scratch: Float64Array = new Float64Array(n)
): SupportPlaneFit {
	groundingStats.planeFits++;
	solvePlane(x, y, z, weights, n, out);
	const residual = (i: number) => y[i] - (out.a * x[i] + out.b * z[i] + out.c);
	if (!out.degenerate && out.count >= 4 && Number.isFinite(outlierThreshold)) {
		let rejected = false;
		for (let i = 0; i < n; i++) {
			const r = Math.abs(residual(i));
			scratch[i] = weights[i];
			if (weights[i] > 1e-6 && r > outlierThreshold) {
				scratch[i] = weights[i] * (outlierThreshold / r) ** 4;
				rejected = true;
			}
		}
		if (rejected) solvePlane(x, y, z, scratch, n, out);
	}
	out.maxResidual = 0;
	for (let i = 0; i < n; i++)
		if (weights[i] > 1e-6) out.maxResidual = Math.max(out.maxResidual, Math.abs(residual(i)));
	out.normal.set(-out.a, 1, -out.b).normalize();
	return out;
}

/** Frame-rate-independent exponential response: identical convergence at 30, 60 or 120 Hz. */
export const responseAlpha = (response: number, dt: number) =>
	1 - Math.exp(-Math.max(0, response) * Math.max(0, dt));

const UP = new Vector3(0, 1, 0);
const _f = new Vector3(),
	_r = new Vector3(),
	_u = new Vector3(),
	_m = new Matrix4();
/**
 * Body "up" from a support normal: decomposed into slope along the heading and across it, scaled by
 * the species' pitch/roll follow strengths and clamped to its tilt limits. Heading is preserved.
 */
export function tiltedUp(
	normal: Vector3,
	heading: number,
	terrain: Pick<
		TerrainLocomotion,
		'bodyPitchFollowStrength' | 'bodyRollFollowStrength' | 'maxBodyPitch' | 'maxBodyRoll'
	>,
	out: Vector3
): Vector3 {
	const ny = Math.max(normal.y, 0.05);
	const fx = Math.sin(heading),
		fz = Math.cos(heading);
	// Slope (dy per metre) along the heading and along creature-right.
	const slopeF = -(normal.x * fx + normal.z * fz) / ny;
	const slopeR = -(normal.x * fz - normal.z * fx) / ny;
	const pitch = clampAbs(Math.atan(slopeF) * terrain.bodyPitchFollowStrength, terrain.maxBodyPitch);
	const roll = clampAbs(Math.atan(slopeR) * terrain.bodyRollFollowStrength, terrain.maxBodyRoll);
	const tp = Math.tan(pitch),
		tr = Math.tan(roll);
	out.set(-tp * fx - tr * fz, 1, -tp * fz + tr * fx).normalize();
	return Number.isFinite(out.x) ? out : out.copy(UP);
}
const clampAbs = (v: number, limit: number) => Math.max(-limit, Math.min(limit, v));
/** Orthonormal right/up/forward orientation: forward is the heading lifted onto the support plane. */
export function orientationFromUp(up: Vector3, heading: number, out: Quaternion): Quaternion {
	// Lift the horizontal heading vertically onto the plane ⟂ up: yaw is preserved exactly.
	const sx = Math.sin(heading),
		cz = Math.cos(heading);
	_f.set(sx, -(up.x * sx + up.z * cz) / Math.max(0.05, up.y), cz).normalize();
	_r.crossVectors(up, _f).normalize();
	_u.crossVectors(_f, _r).normalize();
	_f.crossVectors(_r, _u).normalize();
	_m.makeBasis(_r, _u, _f);
	return out.setFromRotationMatrix(_m);
}

/** Per-update memo of surface samples: body, clearance and foot queries reuse nearby results. */
export class SurfaceProbe {
	private xs = new Float64Array(24);
	private zs = new Float64Array(24);
	private ys = new Float64Array(24);
	private size = 0;
	private next = 0;
	calls = 0;
	constructor(
		public sample: SurfaceSampler,
		/** Cache radius in metres. */
		public epsilon = 0.01
	) {}
	reset() {
		this.size = 0;
		this.next = 0;
	}
	height(x: number, z: number): number {
		for (let i = 0; i < this.size; i++)
			if (Math.abs(this.xs[i] - x) < this.epsilon && Math.abs(this.zs[i] - z) < this.epsilon)
				return this.ys[i];
		const y = this.sample(x, z);
		this.calls++;
		groundingStats.surfaceCalls++;
		const slot = this.next;
		this.xs[slot] = x;
		this.zs[slot] = z;
		this.ys[slot] = y;
		this.next = (slot + 1) % this.xs.length;
		this.size = Math.min(this.xs.length, this.size + 1);
		return y;
	}
	/** Finite-difference surface normal (two extra samples), from the sampler not rendered triangles. */
	normal(x: number, z: number, step: number, out: Vector3): Vector3 {
		const h = this.height(x, z),
			hx = this.height(x + step, z),
			hz = this.height(x, z + step);
		out.set(-(hx - h) / step, 1, -(hz - h) / step).normalize();
		if (!Number.isFinite(out.x)) out.copy(UP);
		return out;
	}
}

/** ProceduralLegState: created once per runtime creature, mutated in place. */
export interface GroundingLeg {
	legId: string;
	limb: LimbRigDefinition;
	state: LegGroundState;
	/** Planted contact (sole on the surface), world space. */
	plantedPosition: Vector3;
	swingStart: Vector3;
	swingTarget: Vector3;
	/** Current sole position, world space (planted, or along the swing arc). */
	contact: Vector3;
	contactNormal: Vector3;
	swingProgress: number;
	swingDuration: number;
	supportWeight: number;
	recoverTime: number;
	lastLocalPhase: number;
	retargeted: boolean;
	reachable: boolean;
	invalid: boolean;
	/** Bind data, creature space. */
	hipBind: Vector3;
	restX: number;
	restZ: number;
	sole: number;
	minReach: number;
	maxReach: number;
}
export interface CreatureSupportPlane {
	point: Vector3;
	normal: Vector3;
	forward: Vector3;
	right: Vector3;
	confidence: number;
	supportLegCount: number;
	/** Angle between the support normal and world up, radians. */
	slope: number;
	source: 'feet' | 'two-feet' | 'fallback' | 'previous';
}
export interface GroundingInput {
	x: number;
	z: number;
	heading: number;
	velocityX: number;
	velocityZ: number;
	gait: CreatureIntent['gait'];
	dt: number;
	/** 0 near: full planting/IK/foot alignment; 1 medium: no mid-swing retarget or foot alignment; 2 far: body alignment only. */
	lod: CreatureLod;
}
interface ClearanceSample {
	jointId: string;
	bind: Vector3;
	minHeight: number;
	world: Vector3;
	ground: number;
}

const RECOVER_SECONDS = 0.12;

export class CreatureGroundingController {
	readonly terrain: TerrainLocomotion;
	readonly legs: GroundingLeg[] = [];
	readonly serpentine: boolean;
	/** Smoothed root (ground point under the body) and orientation. */
	readonly position = new Vector3();
	readonly quaternion = new Quaternion();
	/** Smoothed body up; heading is applied fresh every update so yaw never lags. */
	readonly up = new Vector3(0, 1, 0);
	readonly plane: CreatureSupportPlane = {
		point: new Vector3(),
		normal: new Vector3(0, 1, 0),
		forward: new Vector3(0, 0, 1),
		right: new Vector3(1, 0, 0),
		confidence: 0,
		supportLegCount: 0,
		slope: 0,
		source: 'previous'
	};
	readonly fallback = createPlaneFit();
	readonly fit = createPlaneFit();
	readonly clearance: ClearanceSample[] = [];
	/** Gait phase in cycles; drives stepping and body bob. */
	phase = 0;
	cycleFrequency = 0;
	bodyPitch = 0;
	bodyRoll = 0;
	canStand = true;
	strained = false;
	initialized = false;
	readonly probe: SurfaceProbe;
	/** Serpent support curve: smoothed ground heights at evenly spaced body stations. */
	readonly serpentStations: Float64Array;
	readonly serpentHeights: Float64Array;
	readonly serpentJointIds: string[] = [];
	readonly serpentJointZ: number[] = [];
	readonly serpentOffsets: Float64Array;
	private fallbackAt = new Vector3(Infinity, 0, Infinity);
	private fallbackAge = Infinity;
	private readonly footprint = { front: 0, back: 0, half: 0 };
	private readonly legLength: number;
	private readonly px: Float64Array;
	private readonly py: Float64Array;
	private readonly pz: Float64Array;
	private readonly pw: Float64Array;
	private readonly weightScratch: Float64Array;
	private readonly desiredUp = new Vector3();
	private readonly desiredQ = new Quaternion();
	private readonly t1 = new Vector3();
	private readonly t2 = new Vector3();
	private readonly t3 = new Vector3();
	private readonly hip = new Vector3();
	private readonly lastNormal = new Vector3(0, 1, 0);
	private readonly lastPoint = new Vector3();

	constructor(readonly compilation: CreatureCompilation) {
		const species = compilation.definition.species;
		this.terrain = resolveTerrainLocomotion(species);
		this.serpentine = species.bodyPlan.id === 'serpentine';
		const skeleton = compilation.skeleton;
		const world = jointWorldPositions(skeleton);
		const root = world.get(skeleton.joints[0].id)!;
		let lengths = 0,
			counted = 0;
		for (const limb of skeleton.limbs) {
			if (limb.arm) continue;
			const hip = world.get(limb.hipId)!;
			const hipBind = new Vector3(hip.x - root.x, hip.y - root.y, hip.z - root.z);
			const rest = new Vector3(
				limb.restFoot.x - root.x,
				limb.restFoot.y - root.y,
				limb.restFoot.z - root.z
			);
			const reach = limb.upperLength + limb.lowerLength;
			const bind = hipBind.distanceTo(rest);
			lengths += reach;
			counted++;
			this.legs.push({
				legId: limb.id,
				limb,
				state: 'planted',
				plantedPosition: new Vector3(),
				swingStart: new Vector3(),
				swingTarget: new Vector3(),
				contact: new Vector3(),
				contactNormal: new Vector3(0, 1, 0),
				swingProgress: 0,
				swingDuration: 0,
				supportWeight: 1,
				recoverTime: 0,
				lastLocalPhase: 0,
				retargeted: false,
				reachable: true,
				invalid: false,
				hipBind,
				restX: rest.x,
				restZ: rest.z,
				sole: rest.y,
				minReach: Math.max(Math.abs(limb.upperLength - limb.lowerLength) + 1e-4, bind * 0.55),
				maxReach: reach * 0.97
			});
			this.footprint.front = Math.max(this.footprint.front, rest.z);
			this.footprint.back = Math.min(this.footprint.back, rest.z);
			this.footprint.half = Math.max(this.footprint.half, Math.abs(rest.x));
		}
		const b = compilation.bounds;
		this.legLength = counted ? lengths / counted : Math.max(0.05, b.height * 0.5);
		if (!counted) {
			this.footprint.front = b.max.z * 0.8;
			this.footprint.back = b.min.z * 0.8;
			this.footprint.half = Math.max(b.max.x, -b.min.x, b.height * 0.25);
		}
		this.probe = new SurfaceProbe(() => 0, Math.max(0.004, this.legLength * 0.02));
		const n = Math.max(3, this.legs.length);
		this.px = new Float64Array(n);
		this.py = new Float64Array(n);
		this.pz = new Float64Array(n);
		this.pw = new Float64Array(n);
		this.weightScratch = new Float64Array(n);
		// Belly/chest/pelvis clearance from the torso's own lower radius.
		const torso = skeleton.volumes.find((v) => v.id === 'torso');
		if (torso && !this.serpentine)
			for (const [jointId, t] of [
				['pelvis', 0.25],
				['spine', 0.5],
				['chest', 0.75]
			] as const) {
				const p = world.get(jointId);
				if (!p) continue;
				const section = sectionAt(torso.sections, t);
				const bindHeight = p.y - root.y;
				const lower =
					species.bodyPlan.id === 'biped' ? bindHeight * 0.35 : section.ryl - section.oy;
				this.clearance.push({
					jointId,
					bind: new Vector3(p.x - root.x, bindHeight, p.z - root.z),
					// Allow a crouch, never the belly in the ground.
					minHeight: Math.max(lower + bindHeight * 0.04, bindHeight * 0.45),
					world: new Vector3(),
					ground: 0
				});
			}
		const spine = skeleton.joints.filter((j) => j.semantic === 'spine');
		if (this.serpentine)
			for (const j of spine) {
				this.serpentJointIds.push(j.id);
				this.serpentJointZ.push(world.get(j.id)!.z - root.z);
			}
		this.serpentStations = new Float64Array(12);
		this.serpentHeights = new Float64Array(12);
		this.serpentOffsets = new Float64Array(Math.max(1, this.serpentJointIds.length));
	}

	/** Swing-leg arc height for a step between two contacts. */
	private stepHeight(from: Vector3, to: Vector3, running: boolean) {
		const base = this.terrain.stepHeight * this.legLength * (running ? 1.25 : 1);
		return base + Math.min(this.legLength * 0.25, Math.max(0, to.y - from.y) * 0.6);
	}
	/** Where a leg would stand for a body at (x, z, heading): rest stance offset, surface-sampled. */
	private ideal(
		leg: GroundingLeg,
		x: number,
		z: number,
		heading: number,
		out: Vector3,
		sample: boolean
	) {
		const s = Math.sin(heading),
			c = Math.cos(heading);
		out.set(x + leg.restX * c + leg.restZ * s, 0, z - leg.restX * s + leg.restZ * c);
		if (sample) out.y = this.probe.height(out.x, out.z);
		return out;
	}
	private standable(x: number, z: number, y: number, access?: (x: number, z: number) => boolean) {
		return Number.isFinite(y) && (!access || access(x, z));
	}

	private startSwing(
		leg: GroundingLeg,
		input: GroundingInput,
		duration: number,
		lead: number,
		standable?: (x: number, z: number) => boolean
	) {
		const target = this.ideal(
			leg,
			input.x + input.velocityX * lead,
			input.z + input.velocityZ * lead,
			input.heading,
			this.t1,
			true
		);
		if (!this.standable(target.x, target.z, target.y, standable)) {
			// Shorter step toward the planted foot; otherwise keep searching from where it is.
			target.lerp(leg.plantedPosition, 0.5);
			target.y = this.probe.height(target.x, target.z);
			if (!this.standable(target.x, target.z, target.y, standable)) {
				leg.state = 'seeking';
				leg.invalid = true;
				leg.supportWeight = 0.5;
				leg.swingStart.copy(leg.plantedPosition);
				leg.swingTarget.copy(leg.plantedPosition);
				leg.swingProgress = 0;
				leg.swingDuration = duration;
				return;
			}
		}
		leg.invalid = false;
		leg.state = 'swing';
		leg.retargeted = false;
		leg.swingStart.copy(leg.contact);
		leg.swingTarget.copy(target);
		leg.swingProgress = 0;
		leg.swingDuration = Math.max(1e-3, duration);
		leg.supportWeight = 0;
	}

	private plant(leg: GroundingLeg, lod: CreatureLod) {
		leg.plantedPosition.copy(leg.swingTarget);
		leg.contact.copy(leg.swingTarget);
		if (lod === 0)
			this.probe.normal(
				leg.contact.x,
				leg.contact.z,
				Math.max(0.02, this.legLength * 0.12),
				leg.contactNormal
			);
		else leg.contactNormal.copy(this.plane.normal);
		leg.state = 'recovering';
		leg.recoverTime = 0;
		leg.supportWeight = 0.4;
	}

	/** Snap every foot to its rest stance and the body to the resulting support (spawn, teleport). */
	private initialise(input: GroundingInput, standable?: (x: number, z: number) => boolean) {
		for (const leg of this.legs) {
			this.ideal(leg, input.x, input.z, input.heading, leg.plantedPosition, true);
			if (
				!this.standable(
					leg.plantedPosition.x,
					leg.plantedPosition.z,
					leg.plantedPosition.y,
					standable
				)
			)
				leg.plantedPosition.y = this.probe.height(input.x, input.z);
			leg.contact.copy(leg.plantedPosition);
			this.probe.normal(
				leg.contact.x,
				leg.contact.z,
				Math.max(0.02, this.legLength * 0.12),
				leg.contactNormal
			);
			leg.state = 'planted';
			leg.supportWeight = 1;
			leg.invalid = false;
		}
		this.position.set(input.x, this.probe.height(input.x, input.z), input.z);
		this.initialized = true;
	}

	/** Cheap 5-sample footprint plane (centre, front, rear, left, right) for low-support fallback. */
	private updateFallback(input: GroundingInput, force: boolean) {
		const moved = Math.hypot(input.x - this.fallbackAt.x, input.z - this.fallbackAt.z);
		this.fallbackAge += input.dt;
		if (!force && moved < this.legLength * 0.25 && this.fallbackAge < 0.5) return;
		this.fallbackAge = 0;
		this.fallbackAt.set(input.x, 0, input.z);
		const s = Math.sin(input.heading),
			c = Math.cos(input.heading);
		const f = this.footprint,
			reach = Math.max(f.front, -f.back, f.half, this.legLength * 0.3);
		const local = [
			[0, 0],
			[0, Math.max(f.front, reach * 0.5)],
			[0, Math.min(f.back, -reach * 0.5)],
			[Math.max(f.half, reach * 0.35), 0],
			[-Math.max(f.half, reach * 0.35), 0]
		];
		for (let i = 0; i < 5; i++) {
			const [lx, lz] = local[i];
			const x = input.x + lx * c + lz * s,
				z = input.z - lx * s + lz * c;
			this.fallbackX[i] = x;
			this.fallbackZ[i] = z;
			const y = this.probe.height(x, z);
			this.fallbackY[i] = Number.isFinite(y) ? y : this.position.y;
			this.fallbackW[i] = Number.isFinite(y) ? 1 : 0;
		}
		fitSupportPlane(
			this.fallbackX,
			this.fallbackY,
			this.fallbackZ,
			this.fallbackW,
			5,
			this.fallback,
			Infinity,
			this.fallbackScratch
		);
	}
	private readonly fallbackX = new Float64Array(5);
	private readonly fallbackY = new Float64Array(5);
	private readonly fallbackZ = new Float64Array(5);
	private readonly fallbackW = new Float64Array(5);
	private readonly fallbackScratch = new Float64Array(5);

	/**
	 * One grounding step. `sample` is the authoritative walkable surface; `standable` (optional)
	 * rejects foot targets such as deep water.
	 */
	update(
		input: GroundingInput,
		sample: SurfaceSampler,
		standable?: (x: number, z: number) => boolean
	) {
		groundingStats.updates++;
		const dt = Math.max(0, Math.min(0.5, Number.isFinite(input.dt) ? input.dt : 0));
		this.probe.sample = sample;
		this.probe.reset();
		const teleported =
			this.initialized &&
			Math.hypot(input.x - this.position.x, input.z - this.position.z) > this.legLength * 4 + 1;
		const first = !this.initialized || teleported;
		if (first) this.initialise(input, standable);
		if (this.serpentine) return this.updateSerpent(input, dt, first);
		const species = this.compilation.definition.species;
		const gait = species.locomotion.gait;
		const running = input.gait === 'run';
		const speed = Math.hypot(input.velocityX, input.velocityZ);
		const moving = input.gait !== 'idle' && speed > 1e-4;
		const duty = this.terrain.dutyFactor;
		// Cadence rises when the stride the body demands would exceed what the legs can reach.
		const base = running ? gait.runFrequency : gait.walkFrequency;
		const maxStride = this.legLength * 0.7;
		const frequency = Math.max(base, (speed * duty) / Math.max(1e-4, maxStride));
		this.cycleFrequency = moving ? frequency : 0;
		if (moving) this.phase += frequency * dt;

		if (input.lod < 2) this.stepLegs(input, dt, moving, frequency, duty, running, standable);
		else
			for (const leg of this.legs) {
				leg.state = 'planted';
				leg.supportWeight = 1;
			}

		// Support contacts → plane.
		let n = 0;
		for (const leg of this.legs) {
			if (leg.supportWeight <= 0.05) continue;
			this.px[n] = leg.plantedPosition.x;
			this.py[n] = leg.plantedPosition.y;
			this.pz[n] = leg.plantedPosition.z;
			this.pw[n] = leg.supportWeight;
			n++;
		}
		const plane = this.plane;
		const useFeet = input.lod < 2 && n >= 3;
		if (useFeet)
			fitSupportPlane(
				this.px,
				this.py,
				this.pz,
				this.pw,
				n,
				this.fit,
				this.legLength * 0.22,
				this.weightScratch
			);
		const needFallback = input.lod === 2 || !useFeet || this.fit.degenerate;
		this.updateFallback(input, first || (needFallback && this.fallbackAge > 0.25));
		const normal = this.t2;
		if (useFeet && !this.fit.degenerate) {
			normal.copy(this.fit.normal);
			plane.confidence = Math.min(1, Math.max(0.6, (this.fit.weightSum - 1.5) / 1.5));
			plane.source = 'feet';
			plane.point.set(input.x, this.fit.a * input.x + this.fit.b * input.z + this.fit.c, input.z);
		} else if (input.lod < 2 && n >= 2) {
			// Two contacts fix the slope along their line; the footprint plane supplies the rest.
			const line = this.t3.set(
				this.px[1] - this.px[0],
				this.py[1] - this.py[0],
				this.pz[1] - this.pz[0]
			);
			normal.copy(this.fallback.normal);
			if (line.lengthSq() > 1e-10) {
				line.normalize();
				normal.addScaledVector(line, -normal.dot(line)).normalize();
				if (normal.y < 0.2) normal.copy(this.fallback.normal);
			}
			plane.confidence = 0.5;
			plane.source = 'two-feet';
			const mx = (this.px[0] + this.px[1]) / 2,
				my = (this.py[0] + this.py[1]) / 2,
				mz = (this.pz[0] + this.pz[1]) / 2;
			plane.point.set(
				input.x,
				my - (normal.x * (input.x - mx) + normal.z * (input.z - mz)) / normal.y,
				input.z
			);
		} else if (input.lod === 2 || n >= 1 || this.legs.length === 0) {
			normal.copy(this.fallback.normal);
			plane.confidence = input.lod === 2 ? 0.7 : 0.25;
			plane.source = 'fallback';
			plane.point.set(
				input.x,
				this.fallback.a * input.x + this.fallback.b * input.z + this.fallback.c,
				input.z
			);
		} else {
			// Nothing on the ground (future jumps): keep the previous orientation and height.
			normal.copy(this.up);
			plane.confidence = 0;
			plane.source = 'previous';
			plane.point.copy(this.position);
		}
		plane.normal.copy(normal);
		plane.supportLegCount = n;
		plane.slope = Math.acos(Math.min(1, Math.max(-1, normal.y)));

		tiltedUp(normal, input.heading, this.terrain, this.desiredUp);
		orientationFromUp(this.desiredUp, input.heading, this.desiredQ);
		const desiredY =
			plane.point.y + (input.lod === 2 ? 0 : this.heightCorrection(input, plane.point));

		// Smooth: torso follows the support trend slower than the feet follow the ground.
		const response = this.terrain.bodyGroundResponse * (0.3 + 0.7 * plane.confidence);
		const a = first ? 1 : responseAlpha(response, dt),
			ah = first ? 1 : responseAlpha(response * 1.6, dt);
		this.up.lerp(this.desiredUp, a).normalize();
		orientationFromUp(this.up, input.heading, this.quaternion);
		// Feed-forward: moving along the previous support plane is not lag-filtered (a plain filter
		// trails a climbing body by rate/response — enough to crush a small animal's legs); only
		// changes of the plane itself are smoothed.
		const ln = this.lastNormal,
			lp = this.lastPoint;
		const predicted = first
			? desiredY
			: this.position.y -
				(ln.x * (input.x - this.position.x) + ln.z * (input.z - this.position.z)) /
					Math.max(0.05, ln.y);
		this.position.set(input.x, predicted + (desiredY - predicted) * ah, input.z);
		ln.copy(normal);
		lp.copy(plane.point);
		if (!Number.isFinite(this.position.y)) this.position.y = plane.point.y;
		plane.forward.set(0, 0, 1).applyQuaternion(this.quaternion);
		plane.right.set(1, 0, 0).applyQuaternion(this.quaternion);
		this.bodyPitch = Math.asin(Math.max(-1, Math.min(1, plane.forward.y)));
		this.bodyRoll = Math.asin(Math.max(-1, Math.min(1, plane.right.y)));
		this.canStand = plane.slope <= this.terrain.maxWalkSlope + 1e-6 && !this.strained;
	}

	private stepLegs(
		input: GroundingInput,
		dt: number,
		moving: boolean,
		frequency: number,
		duty: number,
		running: boolean,
		standable?: (x: number, z: number) => boolean
	) {
		const swingTime = moving
			? (1 - duty) / frequency
			: Math.min(
					0.45,
					(0.6 / Math.max(0.2, this.compilation.definition.species.locomotion.gait.walkFrequency)) *
						0.5
				);
		const stanceLead = moving ? duty / frequency / 2 : 0;
		const trigger = this.terrain.stepTriggerDistance * this.legLength * (moving ? 1.6 : 1);
		let swinging = 0;
		for (const leg of this.legs) if (leg.state === 'swing' || leg.state === 'seeking') swinging++;
		const concurrent = Math.max(1, Math.floor(this.legs.length / 3));
		for (const leg of this.legs) {
			if (leg.state === 'swing' || leg.state === 'seeking') {
				leg.swingProgress += dt / leg.swingDuration;
				// Near creatures re-aim once mid-swing so turns and speed changes land correctly.
				if (
					input.lod === 0 &&
					leg.state === 'swing' &&
					!leg.retargeted &&
					leg.swingProgress >= 0.5
				) {
					leg.retargeted = true;
					const remaining = (1 - leg.swingProgress) * leg.swingDuration + stanceLead;
					const t = this.ideal(
						leg,
						input.x + input.velocityX * remaining,
						input.z + input.velocityZ * remaining,
						input.heading,
						this.t1,
						true
					);
					if (this.standable(t.x, t.z, t.y, standable)) leg.swingTarget.copy(t);
				}
				if (leg.swingProgress >= 1) {
					if (leg.state === 'seeking') {
						leg.state = 'planted';
						leg.supportWeight = 1;
					} else this.plant(leg, input.lod);
					swinging--;
				} else if (leg.state === 'swing') {
					const s = leg.swingProgress,
						e = s * s * (3 - 2 * s);
					leg.contact.lerpVectors(leg.swingStart, leg.swingTarget, e);
					leg.contact.y +=
						Math.sin(Math.PI * s) * this.stepHeight(leg.swingStart, leg.swingTarget, running);
				}
				continue;
			}
			if (leg.state === 'recovering') {
				leg.recoverTime += dt;
				leg.supportWeight = 0.4 + 0.6 * Math.min(1, leg.recoverTime / RECOVER_SECONDS);
				if (leg.recoverTime >= RECOVER_SECONDS) leg.state = 'planted';
			} else leg.supportWeight = 1;
			leg.contact.copy(leg.plantedPosition);
			let lift = false;
			// Entering the swing window of this foot's gait phase (tracked while idle too, so resuming a
			// walk does not lift several feet at once).
			const local = (((this.phase + leg.limb.phase) % 1) + 1) % 1;
			if (moving && local >= duty && (leg.lastLocalPhase < duty || local < leg.lastLocalPhase))
				lift = true;
			leg.lastLocalPhase = local;
			// Step trigger: the planted foot has fallen too far from where the stance wants it.
			const ideal = this.ideal(leg, input.x, input.z, input.heading, this.t1, false);
			const drift = Math.hypot(ideal.x - leg.plantedPosition.x, ideal.z - leg.plantedPosition.z);
			// A sharp or fast turn swings the hips away from feet planted for the old heading. Such a
			// foot steps at once — regardless of gait phase, step concurrency or its partner — rather
			// than leaving the leg stretched flat along the ground while the body sags toward it.
			const urgent = drift > leg.maxReach * 0.5;
			if (!lift) {
				const partner = this.legs.find(
					(o) =>
						o !== leg &&
						o.limb.pair === leg.limb.pair &&
						(o.state === 'swing' || o.state === 'seeking')
				);
				lift = urgent || (drift > trigger && swinging < concurrent && !partner);
			}
			if (lift) {
				const duration = urgent ? swingTime * 0.7 : swingTime;
				this.startSwing(leg, input, duration, duration + stanceLead, standable);
				swinging++;
			}
		}
	}

	/** Vertical root correction from leg reach limits and torso clearance (analytic, one pass). */
	private heightCorrection(input: GroundingInput, point: Vector3) {
		let low = -Infinity,
			high = Infinity;
		for (const leg of this.legs) {
			leg.reachable = true;
			if (leg.supportWeight < 0.3) continue;
			this.hip.copy(leg.hipBind).applyQuaternion(this.desiredQ).add(point);
			const target = this.footTarget(leg, this.t1);
			const H2 = (target.x - this.hip.x) ** 2 + (target.z - this.hip.z) ** 2;
			// A foot left behind horizontally (e.g. mid-turn) cannot be reached by lowering the body —
			// only by crouching it to the ground. It is about to step; IK clamps it until then.
			if (H2 > (leg.maxReach * 0.9) ** 2) {
				leg.reachable = false;
				continue;
			}
			const h = this.hip.y - target.y;
			const maxV = Math.sqrt(Math.max(0, leg.maxReach ** 2 - H2));
			const minV = Math.sqrt(Math.max(0, leg.minReach ** 2 - H2));
			high = Math.min(high, maxV - h);
			low = Math.max(low, minV - h);
		}
		if (input.lod === 0)
			for (const c of this.clearance) {
				c.world.copy(c.bind).applyQuaternion(this.desiredQ).add(point);
				c.ground = this.probe.height(c.world.x, c.world.z);
				if (Number.isFinite(c.ground)) low = Math.max(low, c.ground + c.minHeight - c.world.y);
			}
		this.strained = low > high + this.legLength * 0.05;
		// The body may dip a little to help legs reach, never collapse; clearance always wins.
		high = Math.max(high, -this.legLength * 0.12);
		if (low > high) return low;
		return Math.min(Math.max(0, low), high);
	}

	/** IK goal for the foot joint: the sole sits on the contact; the joint is `sole` above it. */
	footTarget(leg: GroundingLeg, out: Vector3): Vector3 {
		const up = this.footUp(leg, this.t3);
		return out.copy(leg.contact).addScaledVector(up, leg.sole);
	}
	/** Foot up: body up blended toward the ground normal while planted. */
	footUp(leg: GroundingLeg, out: Vector3): Vector3 {
		out.copy(this.up);
		if (leg.state !== 'swing' && leg.state !== 'seeking')
			out.lerp(leg.contactNormal, this.terrain.footGroundAlignStrength).normalize();
		return out;
	}

	/** Serpents: ground heights at 3–12 body stations, spatially and temporally smoothed. */
	private updateSerpent(input: GroundingInput, dt: number, first: boolean) {
		const ids = this.serpentJointZ;
		const z0 = Math.min(...ids),
			z1 = Math.max(...ids);
		const span = Math.max(1e-4, z1 - z0);
		const radius = Math.max(1e-3, this.compilation.bounds.max.x);
		const count =
			input.lod === 0
				? Math.max(5, Math.min(12, Math.round(span / (radius * 2))))
				: input.lod === 1
					? 5
					: 3;
		const s = Math.sin(input.heading),
			c = Math.cos(input.heading);
		const raw = this.serpentStations;
		for (let k = 0; k < count; k++) {
			const lz = z0 + (span * k) / (count - 1);
			const y = this.probe.height(input.x + lz * s, input.z + lz * c);
			raw[k] = Number.isFinite(y) ? y : k > 0 ? raw[k - 1] : this.position.y;
		}
		// [1,2,1] low-pass so the body bridges small bumps instead of tracing them.
		let previous = raw[0];
		for (let k = 0; k < count; k++) {
			const current = raw[k];
			const next = raw[Math.min(count - 1, k + 1)];
			raw[k] = (previous + 2 * current + next) / 4;
			previous = current;
		}
		const a =
			first || this.serpentCount !== count ? 1 : responseAlpha(this.terrain.bodyGroundResponse, dt);
		this.serpentCount = count;
		for (let k = 0; k < count; k++) this.serpentHeights[k] += (raw[k] - this.serpentHeights[k]) * a;
		const heightAt = (lz: number) => {
			const f = Math.max(0, Math.min(count - 1, ((lz - z0) / span) * (count - 1)));
			const i = Math.min(count - 2, Math.floor(f));
			return (
				this.serpentHeights[i] + (this.serpentHeights[i + 1] - this.serpentHeights[i]) * (f - i)
			);
		};
		const centre = heightAt(0);
		this.position.set(input.x, centre, input.z);
		for (let j = 0; j < ids.length; j++) this.serpentOffsets[j] = heightAt(ids[j]) - centre;
		orientationFromUp(UP, input.heading, this.quaternion);
		this.up.copy(UP);
		// Pitch of the front of the body, for head stabilisation.
		const front = ids.length - 1;
		const dz = Math.max(1e-4, ids[front] - ids[Math.max(0, front - 2)]);
		this.bodyPitch = Math.atan2(
			this.serpentOffsets[front] - this.serpentOffsets[Math.max(0, front - 2)],
			dz
		);
		this.bodyRoll = 0;
		const plane = this.plane;
		plane.point.copy(this.position);
		plane.normal.copy(UP);
		plane.forward.set(s, 0, c);
		plane.right.set(c, 0, -s);
		plane.confidence = 1;
		plane.supportLegCount = 0;
		plane.source = 'fallback';
		plane.slope = Math.atan(
			Math.abs(this.serpentHeights[count - 1] - this.serpentHeights[0]) / span
		);
		this.canStand = plane.slope <= this.terrain.maxWalkSlope;
	}
	private serpentCount = 0;

	/**
	 * Navigation hook: could this creature stand at (x, z, heading)? Fits its rest footprint to the
	 * surface and checks walkable slope, standability and leg reach. Does not mutate gait state.
	 */
	canStandAtPose(
		x: number,
		z: number,
		heading: number,
		sample: SurfaceSampler,
		standable?: (x: number, z: number) => boolean
	): boolean {
		const probe = new SurfaceProbe(sample, this.probe.epsilon);
		const count = Math.max(this.legs.length, 0);
		if (!count) {
			const y = probe.height(x, z);
			const ahead = probe.height(
				x + Math.sin(heading) * this.footprint.front,
				z + Math.cos(heading) * this.footprint.front
			);
			return (
				this.standable(x, z, y, standable) &&
				Math.atan(Math.abs(ahead - y) / Math.max(1e-4, this.footprint.front)) <=
					this.terrain.maxWalkSlope
			);
		}
		const s = Math.sin(heading),
			c = Math.cos(heading);
		for (let i = 0; i < count; i++) {
			const leg = this.legs[i];
			const fx = x + leg.restX * c + leg.restZ * s,
				fz = z - leg.restX * s + leg.restZ * c;
			const y = probe.height(fx, fz);
			if (!this.standable(fx, fz, y, standable)) return false;
			this.px[i] = fx;
			this.py[i] = y;
			this.pz[i] = fz;
			this.pw[i] = 1;
		}
		const fit = createPlaneFit();
		fitSupportPlane(
			this.px,
			this.py,
			this.pz,
			this.pw,
			count,
			fit,
			this.legLength * 0.22,
			this.weightScratch
		);
		const normal = fit.degenerate ? UP : fit.normal;
		if (Math.acos(Math.min(1, normal.y)) > this.terrain.maxWalkSlope) return false;
		const up = tiltedUp(normal, heading, this.terrain, new Vector3());
		const q = orientationFromUp(up, heading, new Quaternion());
		const point = new Vector3(x, fit.degenerate ? fit.c : fit.a * x + fit.b * z + fit.c, z);
		for (let i = 0; i < count; i++) {
			const leg = this.legs[i];
			const hip = leg.hipBind.clone().applyQuaternion(q).add(point);
			const d = hip.distanceTo(new Vector3(this.px[i], this.py[i] + leg.sole, this.pz[i]));
			if (d > leg.maxReach * 1.15 || d < leg.minReach * 0.6) return false;
		}
		return true;
	}

	/** Planted contacts projected to X/Z, as a convex hull (debug, stance validity, future balance). */
	supportPolygon(out: { x: number; z: number }[] = []): { x: number; z: number }[] {
		const points = this.legs
			.filter((l) => l.supportWeight > 0.3)
			.map((l) => ({ x: l.plantedPosition.x, z: l.plantedPosition.z }))
			.sort((a, b) => a.x - b.x || a.z - b.z);
		out.length = 0;
		if (points.length < 3) {
			out.push(...points);
			return out;
		}
		const cross = (
			o: { x: number; z: number },
			a: { x: number; z: number },
			b: { x: number; z: number }
		) => (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);
		const hull: { x: number; z: number }[] = [];
		for (const pass of [points, [...points].reverse()]) {
			const start = hull.length;
			for (const p of pass) {
				while (
					hull.length >= start + 2 &&
					cross(hull[hull.length - 2], hull[hull.length - 1], p) <= 0
				)
					hull.pop();
				hull.push(p);
			}
			hull.pop();
		}
		out.push(...hull);
		return out;
	}
}
