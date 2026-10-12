import { describe, expect, it } from 'vitest';
import { Matrix4, Quaternion, Vector3 } from 'three';
import { compileCreature } from './CreatureCompiler';
import { animateCreature } from './CreatureAnimationSystem';
import {
	CreatureGroundingController,
	createPlaneFit,
	fitSupportPlane,
	orientationFromUp,
	responseAlpha,
	tiltedUp,
	type SurfaceSampler
} from './CreatureGrounding';
import { labSurface } from './CreatureLabTerrain';
import { generateSpecies } from './SpeciesGenerator';
import { generateIndividual } from './IndividualGenerator';
import { deriveTerrainLocomotion } from './CreatureTerrainProfile';
import { jointWorldPositions } from './SkeletonGenerator';
import { validateSpecies } from './CreatureValidation';
import type { BodyPlanId, CreatureIntent } from './CreatureTypes';

const DEG = Math.PI / 180;
const fit = (points: number[][], weights?: number[], threshold = Infinity) => {
	const n = points.length;
	return fitSupportPlane(
		points.map((p) => p[0]),
		points.map((p) => p[1]),
		points.map((p) => p[2]),
		weights ?? points.map(() => 1),
		n,
		createPlaneFit(),
		threshold
	);
};
const angle = (a: Vector3, b: Vector3) => Math.acos(Math.min(1, Math.max(-1, a.dot(b))));
const make = (seed: number, plan: BodyPlanId) => {
	const species = generateSpecies(seed, plan);
	const creature = compileCreature({
		species,
		individual: generateIndividual(species, seed + 700)
	});
	return { species, creature, grounding: new CreatureGroundingController(creature.compilation) };
};
/** Walks a creature along `heading` over `surface` at a fixed step; returns per-frame callbacks. */
function walk(
	setup: ReturnType<typeof make>,
	surface: SurfaceSampler,
	options: {
		seconds: number;
		hz?: number;
		heading?: number;
		gait?: CreatureIntent['gait'];
		each?: (frame: number) => void;
	}
) {
	const { creature, grounding, species } = setup;
	const hz = options.hz ?? 60,
		heading = options.heading ?? 0,
		gait = options.gait ?? 'walk';
	const speed = gait === 'idle' ? 0 : species.behaviour.wanderSpeed;
	const frames = Math.round(options.seconds * hz);
	for (let f = 0; f < frames; f++) {
		const d = (f / hz) * speed;
		creature.object.position.set(Math.sin(heading) * d, 0, Math.cos(heading) * d);
		animateCreature(
			creature,
			{
				velocity: { x: Math.sin(heading) * speed, y: 0, z: Math.cos(heading) * speed },
				heading,
				angularVelocity: 0,
				gait
			},
			f / hz,
			1 / hz,
			surface,
			{ grounding }
		);
		options.each?.(f);
	}
}
const ramp = (degrees: number): SurfaceSampler => {
	const t = Math.tan(degrees * DEG);
	return (_x, z) => z * t;
};

describe('weighted best-fit support plane', () => {
	it('is world up for four flat feet', () => {
		const f = fit([
			[-1, 2, 1],
			[1, 2, 1],
			[-1, 2, -1],
			[1, 2, -1]
		]);
		expect(f.degenerate).toBe(false);
		expect(angle(f.normal, new Vector3(0, 1, 0))).toBeLessThan(1e-9);
		expect(f.c).toBeCloseTo(2, 9);
	});
	it('recovers an uphill plane exactly from four feet', () => {
		const plane = (x: number, z: number) => -0.1 * x + 0.3 * z + 2;
		const f = fit([
			[-1, plane(-1, 1.5), 1.5],
			[1, plane(1, 1.5), 1.5],
			[-1, plane(-1, -1.5), -1.5],
			[1, plane(1, -1.5), -1.5]
		]);
		expect(f.a).toBeCloseTo(-0.1, 9);
		expect(f.b).toBeCloseTo(0.3, 9);
		expect(angle(f.normal, new Vector3(0.1, 1, -0.3).normalize())).toBeLessThan(1e-6);
	});
	it('fits six slightly non-coplanar feet stably (all contribute)', () => {
		const truth = new Vector3(-0.2, 1, -0.15).normalize();
		const base = [
			[-0.6, 1.2],
			[0.6, 1.2],
			[-0.7, 0],
			[0.7, 0],
			[-0.6, -1.2],
			[0.6, -1.2]
		];
		for (let trial = 0; trial < 20; trial++) {
			const noise = (i: number) => Math.sin(trial * 7.1 + i * 3.7) * 0.02;
			const f = fit(base.map(([x, z], i) => [x, 0.2 * x + 0.15 * z + noise(i), z]));
			expect(f.count).toBe(6);
			expect(angle(f.normal, truth)).toBeLessThan(2 * DEG);
		}
	});
	it('limits the influence of one outlier contact with a single refit', () => {
		const feet = [
			[-0.6, 0, 1.2],
			[0.6, 0, 1.2],
			[-0.7, 0, 0],
			[0.7, 0, 0],
			[-0.6, 0, -1.2],
			[0.6, 0.8, -1.2] // standing on a rock
		];
		const naive = fit(feet);
		const robust = fit(feet, undefined, 0.15);
		const up = new Vector3(0, 1, 0);
		expect(angle(robust.normal, up)).toBeLessThan(angle(naive.normal, up) * 0.35);
		expect(angle(robust.normal, up)).toBeLessThan(5 * DEG);
	});
	it('lets higher-weight contacts dominate and ignores zero-weight (swing) feet', () => {
		const flat = [
			[-1, 0, 1],
			[1, 0, 1],
			[-1, 0, -1],
			[1, 0, -1]
		];
		const swingHigh = [...flat, [0, 3, 0]];
		const ignored = fit(swingHigh, [1, 1, 1, 1, 0]);
		expect(angle(ignored.normal, new Vector3(0, 1, 0))).toBeLessThan(1e-9);
		const tilted = [
			[-1, 0, 1],
			[1, 0, 1],
			[-1, 0, -1],
			[1, 0, -1],
			[-1, 1, 1],
			[1, 1, 1]
		];
		const strong = fit(tilted, [1, 1, 1, 1, 0.1, 0.1]);
		const weak = fit(tilted, [0.1, 0.1, 1, 1, 1, 1]);
		expect(strong.b).toBeLessThan(weak.b);
	});
	it('reports degenerate support for two contacts or collinear feet', () => {
		expect(
			fit([
				[0, 0, 0],
				[0, 1, 1]
			]).degenerate
		).toBe(true);
		expect(
			fit([
				[0, 0, 0],
				[0, 1, 1],
				[0, 2, 2]
			]).degenerate
		).toBe(true);
	});
});

describe('body orientation from support', () => {
	const terrain = deriveTerrainLocomotion(generateSpecies(1, 'quadruped'));
	const full = {
		...terrain,
		bodyPitchFollowStrength: 1,
		bodyRollFollowStrength: 1,
		maxBodyPitch: 1.4,
		maxBodyRoll: 1.4
	};
	it('keeps heading, projects forward along the slope and stays orthonormal', () => {
		for (const heading of [0, 0.7, 2, -2.5]) {
			const normal = new Vector3(0.25, 1, -0.4).normalize();
			const up = tiltedUp(normal, heading, full, new Vector3());
			expect(angle(up, normal)).toBeLessThan(1e-6);
			const q = orientationFromUp(up, heading, new Quaternion());
			const m = new Matrix4().makeRotationFromQuaternion(q);
			const right = new Vector3(),
				u = new Vector3(),
				fwd = new Vector3();
			m.extractBasis(right, u, fwd);
			expect(fwd.dot(normal)).toBeCloseTo(0, 6);
			expect(Math.atan2(fwd.x, fwd.z)).toBeCloseTo(
				Math.atan2(Math.sin(heading), Math.cos(heading)),
				6
			);
			expect(m.determinant()).toBeCloseTo(1, 6);
			expect(right.dot(u)).toBeCloseTo(0, 6);
			expect(q.toArray().every(Number.isFinite)).toBe(true);
		}
	});
	it('clamps pitch and roll to species limits, never NaN on near-vertical normals', () => {
		const limited = { ...full, maxBodyPitch: 30 * DEG, maxBodyRoll: 10 * DEG };
		const steep = new Vector3(0, Math.cos(60 * DEG), -Math.sin(60 * DEG)); // 60° uphill along +Z
		const up = tiltedUp(steep, 0, limited, new Vector3());
		const fwd = new Vector3(0, 0, 1).applyQuaternion(orientationFromUp(up, 0, new Quaternion()));
		expect(Math.asin(fwd.y)).toBeCloseTo(30 * DEG, 5);
		const side = tiltedUp(
			new Vector3(-Math.sin(40 * DEG), Math.cos(40 * DEG), 0),
			0,
			limited,
			new Vector3()
		);
		const right = new Vector3(1, 0, 0).applyQuaternion(
			orientationFromUp(side, 0, new Quaternion())
		);
		expect(Math.abs(Math.asin(right.y))).toBeCloseTo(10 * DEG, 5);
		const wild = tiltedUp(new Vector3(1, 1e-6, 0).normalize(), 0.3, terrain, new Vector3());
		expect(wild.toArray().every(Number.isFinite)).toBe(true);
	});
	it('smooths at the same rate at 30, 60 and 120 fps (frame-rate-independent response)', () => {
		const results = [30, 60, 120].map((hz) => {
			const setup = make(42, 'quadruped');
			let surface: SurfaceSampler = () => 0;
			walk(setup, (x, z) => surface(x, z), { seconds: 0.1, hz, gait: 'idle' });
			surface = ramp(20);
			walk(setup, (x, z) => surface(x, z), { seconds: 0.4, hz, gait: 'idle' });
			return { up: setup.grounding.up.clone(), y: setup.grounding.position.y };
		});
		expect(angle(results[0].up, results[2].up)).toBeLessThan(1 * DEG);
		expect(angle(results[1].up, results[2].up)).toBeLessThan(0.5 * DEG);
		expect(responseAlpha(6, 1 / 30)).toBeCloseTo(1 - (1 - responseAlpha(6, 1 / 60)) ** 2, 12);
	});
});

describe('legs: planting and analytic IK', () => {
	it('keeps planted feet fixed in the world while the torso moves (no skating)', () => {
		const setup = make(42, 'quadruped');
		const previous = new Map<string, Vector3>();
		let checked = 0;
		walk(setup, ramp(15), {
			seconds: 3,
			each: (frame) => {
				for (const leg of setup.grounding.legs) {
					const last = previous.get(leg.legId);
					if (frame > 0 && last && leg.state === 'planted') {
						expect(leg.plantedPosition.distanceTo(last)).toBe(0);
						checked++;
					}
					if (leg.state === 'planted') previous.set(leg.legId, leg.plantedPosition.clone());
					else previous.delete(leg.legId);
				}
			}
		});
		expect(checked).toBeGreaterThan(200);
	});
	it('reaches reachable targets, clamps unreachable ones, keeps bone lengths and knee sides', () => {
		for (const plan of ['quadruped', 'biped', 'hexapod'] as const) {
			const setup = make(9, plan);
			const { creature, grounding } = setup;
			let reached = 0;
			walk(
				setup,
				labSurface(
					{ kind: 'uneven', angle: 15, direction: 'uphill' },
					creature.compilation.bounds.height
				),
				{
					seconds: 2,
					each: () => {
						for (const leg of grounding.legs) {
							const hip = creature.bonesById.get(leg.limb.hipId)!.getWorldPosition(new Vector3());
							const knee = creature.bonesById.get(leg.limb.kneeId)!.getWorldPosition(new Vector3());
							const foot = creature.bonesById.get(leg.limb.footId)!.getWorldPosition(new Vector3());
							expect(hip.distanceTo(knee)).toBeCloseTo(leg.limb.upperLength, 6);
							expect(knee.distanceTo(foot)).toBeCloseTo(leg.limb.lowerLength, 6);
							const target = grounding.footTarget(leg, new Vector3());
							const span = hip.distanceTo(target);
							const shortest = Math.abs(leg.limb.upperLength - leg.limb.lowerLength);
							if (span < leg.maxReach * 0.98 && span > shortest * 1.05 + 1e-6) {
								expect(foot.distanceTo(target)).toBeLessThan(
									1e-4 * creature.compilation.bounds.height + 1e-7
								);
								reached++;
							}
							// The knee stays on its bind-pose side of the hip→foot line.
							const axis = foot.clone().sub(hip).normalize();
							const offset = knee.clone().sub(hip);
							offset.addScaledVector(axis, -offset.dot(axis));
							const hint = new Vector3()
								.copy(leg.limb.bendHint!)
								.applyQuaternion(creature.object.quaternion);
							if (offset.length() > 1e-6 * creature.compilation.bounds.height)
								expect(offset.normalize().dot(hint)).toBeGreaterThan(0);
						}
					}
				}
			);
			expect(reached).toBeGreaterThan(50);
			creature.dispose();
		}
		// Far beyond reach: clamped, finite, lengths intact.
		const setup = make(4, 'quadruped');
		walk(setup, () => 0, { seconds: 0.2, gait: 'idle' });
		for (const leg of setup.grounding.legs) leg.contact.set(50, -50, 50);
		animateCreature(
			setup.creature,
			{ velocity: { x: 0, y: 0, z: 0 }, heading: 0, angularVelocity: 0, gait: 'idle' },
			1,
			1 / 60,
			() => 0,
			{ grounding: setup.grounding, skipGroundingUpdate: true }
		);
		for (const bone of setup.creature.skeleton.bones)
			expect(bone.quaternion.toArray().every(Number.isFinite)).toBe(true);
		for (const leg of setup.grounding.legs) {
			const knee = setup.creature.bonesById.get(leg.limb.kneeId)!.getWorldPosition(new Vector3());
			const foot = setup.creature.bonesById.get(leg.limb.footId)!.getWorldPosition(new Vector3());
			expect(knee.distanceTo(foot)).toBeCloseTo(leg.limb.lowerLength, 6);
		}
	});
});

describe('sharp and fast turns', () => {
	// Regression: feet planted for the old heading used to make the height solver lower the body
	// until stretched legs could reach them — the torso sagged to 30–60 % of its height, then rose.
	it('re-steps instead of crouching: torso stays near standing height through turns and flips', () => {
		for (const seed of [42, 7, 13, 21])
			for (const mode of ['turns', 'flip', 'spin'] as const)
				for (const gait of ['walk', 'run'] as const) {
					const { species, creature, grounding } = make(seed, 'quadruped');
					const bind = jointWorldPositions(creature.compilation.skeleton);
					const speed =
						gait === 'run' ? species.behaviour.fleeSpeed : species.behaviour.wanderSpeed;
					const dt = 1 / 60;
					let heading = 0,
						target = 0,
						x = 0,
						z = 0,
						lowest = Infinity;
					for (let f = 0; f < 300; f++) {
						if (mode === 'turns' && f % 40 === 39)
							target += (Math.PI / 2) * (f % 80 === 79 ? -1 : 1);
						if (mode === 'flip' && f % 60 === 59) heading = target += Math.PI;
						if (mode === 'spin') target += 4 * dt;
						// Same exponential turn response as the behaviour system's advance step.
						heading +=
							Math.atan2(Math.sin(target - heading), Math.cos(target - heading)) *
							Math.min(1, dt * 6);
						const v = mode === 'spin' ? 0 : speed;
						x += Math.sin(heading) * v * dt;
						z += Math.cos(heading) * v * dt;
						creature.object.position.set(x, 0, z);
						animateCreature(
							creature,
							{
								velocity: { x: Math.sin(heading) * v, y: 0, z: Math.cos(heading) * v },
								heading,
								angularVelocity: 0,
								gait: mode === 'spin' ? 'idle' : gait
							},
							f * dt,
							dt,
							() => 0,
							{ grounding }
						);
						if (f < 5) continue;
						for (const id of ['pelvis', 'chest'])
							lowest = Math.min(
								lowest,
								creature.bonesById.get(id)!.getWorldPosition(new Vector3()).y / bind.get(id)!.y
							);
					}
					expect(lowest, `seed ${seed} ${mode} ${gait}`).toBeGreaterThan(0.85);
					creature.dispose();
				}
	}, 30000);
});

describe('body plans on slopes', () => {
	it('quadruped: level on flat, pitches up uphill and down downhill, rolls partly across', () => {
		const flat = make(42, 'quadruped');
		walk(flat, () => 0, { seconds: 1 });
		expect(Math.abs(flat.grounding.bodyPitch)).toBeLessThan(0.5 * DEG);
		const up = make(42, 'quadruped');
		walk(up, ramp(20), { seconds: 1.5 });
		const down = make(42, 'quadruped');
		walk(down, ramp(20), { seconds: 1.5, heading: Math.PI });
		const follow = up.grounding.terrain.bodyPitchFollowStrength;
		expect(up.grounding.bodyPitch).toBeGreaterThan(20 * DEG * follow * 0.8);
		expect(down.grounding.bodyPitch).toBeLessThan(-20 * DEG * follow * 0.8);
		const across = make(42, 'quadruped');
		walk(across, ramp(20), { seconds: 1, heading: Math.PI / 2, gait: 'idle' });
		const roll = Math.abs(across.grounding.bodyRoll);
		expect(roll).toBeGreaterThan(5 * DEG);
		expect(roll).toBeLessThan(20 * DEG); // partial, not rigid
		// Uphill-side legs compress, downhill-side legs extend.
		const { creature, grounding } = across;
		const extension = (side: number) =>
			grounding.legs
				.filter((l) => l.limb.side === side)
				.map((l) =>
					creature.bonesById
						.get(l.limb.hipId)!
						.getWorldPosition(new Vector3())
						.distanceTo(creature.bonesById.get(l.limb.footId)!.getWorldPosition(new Vector3()))
				)
				.reduce((a, b) => a + b, 0);
		// Heading +X: creature-left (−X side, side −1) faces +Z, which is uphill on this ramp.
		expect(extension(-1)).toBeLessThan(extension(1));
	});
	it('hexapod: every foot contributes over a tripod cycle and the body stays steady', () => {
		const setup = make(11, 'hexapod');
		const contributed = new Set<string>();
		const pitches: number[] = [];
		let sixPlanted = 0;
		walk(setup, ramp(15), {
			seconds: 0.5,
			gait: 'idle',
			each: () => {
				if (setup.grounding.plane.supportLegCount === 6) sixPlanted++;
			}
		});
		expect(sixPlanted).toBeGreaterThan(0);
		walk(setup, ramp(15), {
			seconds: 3,
			each: (frame) => {
				const g = setup.grounding;
				for (const leg of g.legs) if (leg.supportWeight >= 1) contributed.add(leg.legId);
				if (frame > 60) {
					pitches.push(g.bodyPitch);
					expect(g.plane.supportLegCount).toBeGreaterThanOrEqual(2);
				}
			}
		});
		expect(contributed.size).toBe(6);
		const mean = pitches.reduce((a, b) => a + b, 0) / pitches.length;
		const sd = Math.sqrt(pitches.reduce((a, b) => a + (b - mean) ** 2, 0) / pitches.length);
		expect(mean).toBeGreaterThan(15 * DEG * setup.grounding.terrain.bodyPitchFollowStrength * 0.8);
		expect(sd).toBeLessThan(2 * DEG);
	});
	it('biped: two feet plus terrain fallback, more upright than a quadruped, little roll', () => {
		const biped = make(3, 'biped');
		walk(biped, ramp(20), { seconds: 1.5 });
		const quad = make(42, 'quadruped');
		walk(quad, ramp(20), { seconds: 1.5 });
		expect(biped.grounding.bodyPitch).toBeGreaterThan(2 * DEG);
		expect(biped.grounding.bodyPitch).toBeLessThan(quad.grounding.bodyPitch * 0.7);
		const across = make(3, 'biped');
		walk(across, ramp(20), { seconds: 1.5, heading: Math.PI / 2 });
		expect(Math.abs(across.grounding.bodyRoll)).toBeLessThanOrEqual(
			across.grounding.terrain.maxBodyRoll + 1e-6
		);
	});
	it('serpent: follows large contours smoothly with clearance, without tracing tiny bumps', () => {
		const setup = make(5, 'serpentine');
		const { creature, grounding } = setup;
		const size = creature.compilation.bounds.max.z - creature.compilation.bounds.min.z;
		const hill = (_x: number, z: number) => Math.sin((z / size) * Math.PI) * size * 0.12;
		const bumpy = (x: number, z: number) => hill(x, z) + Math.sin(z * 97) * size * 0.003;
		walk(setup, bumpy, { seconds: 1, gait: 'idle' });
		const heights = grounding.serpentJointIds.map((id) =>
			creature.bonesById.get(id)!.getWorldPosition(new Vector3())
		);
		const above = heights.map((p) => p.y - hill(p.x, p.z));
		expect(Math.min(...above)).toBeGreaterThan(-creature.compilation.bounds.height * 0.25);
		// The body is no longer a rigid horizontal tube: its joints follow the hill.
		const spread = Math.max(...heights.map((p) => p.y)) - Math.min(...heights.map((p) => p.y));
		expect(spread).toBeGreaterThan(size * 0.05);
		for (const bone of creature.skeleton.bones)
			expect(bone.quaternion.toArray().every(Number.isFinite)).toBe(true);
	});
	it('stays finite and slope-aligned for 25 species of every plan on uneven ramps', () => {
		for (const plan of ['quadruped', 'biped', 'hexapod', 'serpentine'] as const)
			for (let seed = 0; seed < 25; seed++) {
				const setup = make(seed, plan);
				const size = setup.creature.compilation.bounds.height;
				walk(setup, labSurface({ kind: 'uneven', angle: 15, direction: 'uphill' }, size), {
					seconds: 0.8,
					hz: 30
				});
				const g = setup.grounding;
				expect(
					[g.position.x, g.position.y, g.position.z, ...g.quaternion.toArray()].every(
						Number.isFinite
					)
				).toBe(true);
				for (const bone of setup.creature.skeleton.bones)
					expect(bone.quaternion.toArray().every(Number.isFinite)).toBe(true);
				if (plan !== 'serpentine')
					expect(Math.abs(g.bodyPitch)).toBeLessThanOrEqual(g.terrain.maxBodyPitch + 1e-6);
				setup.creature.dispose();
			}
	}, 60000);
});

describe('stance validity, sampling budget and recipes', () => {
	it('rejects poses on slopes beyond the species limit and on unstandable ground', () => {
		const { grounding } = make(42, 'quadruped');
		expect(grounding.canStandAtPose(0, 0, 0, () => 0)).toBe(true);
		expect(grounding.canStandAtPose(0, 0, 0, ramp(70))).toBe(false);
		expect(
			grounding.canStandAtPose(
				0,
				0,
				0,
				() => 0,
				() => false
			)
		).toBe(false);
		const serpent = make(5, 'serpentine').grounding;
		expect(serpent.canStandAtPose(0, 0, 0, ramp(70))).toBe(false);
	});
	it('levels on a flat foundation even when the terrain around it slopes', () => {
		const setup = make(42, 'quadruped');
		const size = setup.creature.compilation.bounds.height;
		walk(setup, labSurface({ kind: 'platform', angle: 20, direction: 'uphill' }, size), {
			seconds: 1,
			gait: 'idle'
		});
		expect(setup.grounding.plane.slope).toBeLessThan(1 * DEG);
	});
	it('samples the walkable surface only a handful of times per update', () => {
		for (const plan of ['quadruped', 'hexapod', 'biped', 'serpentine'] as const) {
			const setup = make(42, plan);
			let calls = 0,
				updates = 0;
			walk(setup, ramp(15), {
				seconds: 2,
				each: (frame) => {
					if (frame > 10) {
						calls += setup.grounding.probe.calls;
						updates++;
					}
					setup.grounding.probe.calls = 0;
				}
			});
			expect(calls / updates).toBeLessThan(plan === 'serpentine' ? 13 : 10);
		}
	});
	it('generates valid terrain locomotion; small animals climb steeper than giants', () => {
		for (const plan of ['quadruped', 'biped', 'hexapod', 'serpentine'] as const)
			for (let seed = 0; seed < 30; seed++)
				expect(validateSpecies(generateSpecies(seed, plan))).toBeNull();
		const species = generateSpecies(42, 'quadruped');
		const tiny = { ...species, proportions: { ...species.proportions } };
		const giant = { ...species, proportions: { ...species.proportions } };
		for (const key of ['legLength', 'bodyDepth', 'neckLength', 'headSize'] as const) {
			tiny.proportions[key] *= 0.05;
			giant.proportions[key] *= 10;
		}
		expect(deriveTerrainLocomotion(tiny).maxWalkSlope).toBeGreaterThan(
			deriveTerrainLocomotion(giant).maxWalkSlope
		);
		expect(
			validateSpecies({
				...species,
				locomotion: {
					...species.locomotion,
					terrain: { ...species.locomotion.terrain!, maxBodyPitch: Number.NaN }
				}
			})
		).not.toBeNull();
	});
});
