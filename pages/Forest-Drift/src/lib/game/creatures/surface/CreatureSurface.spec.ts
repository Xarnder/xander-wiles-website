import { describe, expect, it } from 'vitest';
import { compileCreatureGeometry } from '../CreatureCompiler';
import { generateSpecies } from '../SpeciesGenerator';
import { generateIndividual } from '../IndividualGenerator';
import { validateSpecies } from '../CreatureValidation';
import { jointWorldPositions } from '../SkeletonGenerator';
import { ringPoint, sampleVolume } from '../SweptBodyVolume';
import { createMulberry32 } from '../../terrain/seededRandom';
import type { BodyPlanId, CreatureDefinition, SpeciesGenome } from '../CreatureTypes';
import {
	deriveSurfaceGenome,
	legacySurfaceGenome,
	NOISE_FEATURE_TEXELS,
	PATTERN_MAX_DETAIL,
	PATTERN_REFERENCE_SCALE,
	patternDetail,
	patternFor,
	patternMask,
	sizedPattern,
	resolveCreatureSurface,
	validateSurfaceGenome,
	type IndividualPattern
} from './CreaturePatternGenerator';
import {
	generateCreaturePalette,
	paletteIssues,
	resolveCreaturePalette
} from './CreaturePaletteGenerator';
import { SURFACE_REGION } from './CreatureSurfaceClassifier';
import { sampleCreatureNoise } from './CreatureSurfaceNoise';
import { creatureSurfaceTable } from './CreatureSurfaceTable';

const PLANS: BodyPlanId[] = ['quadruped', 'biped', 'hexapod', 'serpentine'];
const definition = (
	seed: number,
	plan: BodyPlanId,
	individualSeed = seed + 700
): CreatureDefinition => {
	const species = generateSpecies(seed, plan);
	return { species, individual: generateIndividual(species, individualSeed) };
};
const withPattern = (
	species: SpeciesGenome,
	primary: IndividualPattern['type'],
	secondary: IndividualPattern['type'] = 'solid'
) => {
	const mid = (a: number, b: number) => (a + b) / 2;
	const surface = structuredClone(species.appearance.surface!);
	surface.primaryPattern = patternFor(primary, species.bodyPlan.id, mid, 'light');
	surface.secondaryPattern = patternFor(secondary, species.bodyPlan.id, mid, 'dark');
	return { ...species, appearance: { ...species.appearance, surface } };
};
const individualPattern = (
	type: IndividualPattern['type'],
	extra: Partial<IndividualPattern> = {}
): IndividualPattern => ({
	...patternFor(type, 'quadruped', (a, b) => (a + b) / 2, 'light'),
	offset: [3.1, 7.7, 1.3],
	phase: 0.2,
	...extra
});
const HEX = /^#[0-9a-f]{6}$/;
/** Connected spots of `pattern` over the torso surface (rings × 32 sides, wrapping around). */
function torsoSpots(c: ReturnType<typeof compileCreatureGeometry>, pattern: IndividualPattern) {
	const torso = sampleVolume(
		c.skeleton.volumes.find((v) => v.id === 'torso')!,
		jointWorldPositions(c.skeleton)
	);
	const rings = torso.body,
		sides = 32,
		S = c.surfaceScale!;
	const grid = rings.map((ring) =>
		Array.from({ length: sides }, (_, k) => {
			const p = ringPoint(ring, (k / sides) * Math.PI * 2);
			return patternMask(pattern, { x: p.x / S, y: p.y / S, z: p.z / S }, 0, 0) > 0.5;
		})
	);
	const seen = grid.map((r) => r.map(() => false));
	let spots = 0;
	for (let r = 0; r < grid.length; r++)
		for (let k = 0; k < sides; k++) {
			if (!grid[r][k] || seen[r][k]) continue;
			spots++;
			const stack = [[r, k]];
			seen[r][k] = true;
			while (stack.length) {
				const [a, b] = stack.pop()!;
				for (const [da, db] of [
					[1, 0],
					[-1, 0],
					[0, 1],
					[0, -1]
				]) {
					const na = a + da,
						nb = (b + db + sides) % sides;
					if (na < 0 || na >= grid.length || !grid[na][nb] || seen[na][nb]) continue;
					seen[na][nb] = true;
					stack.push([na, nb]);
				}
			}
		}
	return spots;
}

describe('palettes', () => {
	it('are deterministic and validated for 100 species per plan', () => {
		for (const plan of PLANS)
			for (let seed = 0; seed < 100; seed++) {
				const d = definition(seed, plan);
				const a = resolveCreatureSurface(d.species, d.individual);
				const b = resolveCreatureSurface(JSON.parse(JSON.stringify(d.species)), d.individual);
				expect(b).toEqual(a);
				for (const colour of Object.values(a.palette)) expect(colour).toMatch(HEX);
				expect(paletteIssues(a.palette), `${plan} ${seed}`).toEqual([]);
			}
		const r = () => createMulberry32(99);
		expect(generateCreaturePalette(r())).toEqual(generateCreaturePalette(r()));
	});
	it('keeps a species coherent while individuals vary slightly', () => {
		const species = generateSpecies(42, 'quadruped');
		const hues = Array.from({ length: 20 }, (_, i) => {
			const p = resolveCreatureSurface(species, generateIndividual(species, i)).palette.primary;
			return parseInt(p.slice(1), 16);
		});
		// Same palette family: every individual within a small RGB distance of the first.
		const rgb = (v: number) => [(v >> 16) & 255, (v >> 8) & 255, v & 255];
		for (const h of hues) {
			const [r0, g0, b0] = rgb(hues[0]),
				[r, g, b] = rgb(h);
			expect(Math.hypot(r - r0, g - g0, b - b0)).toBeLessThan(40);
		}
		expect(new Set(hues).size).toBeGreaterThan(1);
		const other = resolveCreatureSurface(
			generateSpecies(43, 'quadruped'),
			generateIndividual(species, 0)
		);
		expect(other.palette.primary).not.toBe(
			resolveCreatureSurface(species, generateIndividual(species, 0)).palette.primary
		);
	});
	it('clamps unsafe colour combinations', () => {
		const species = generateSpecies(7, 'quadruped');
		species.appearance.palette = {
			...species.appearance.palette,
			primary: '#00ff00',
			secondary: '#004400',
			accent: '#00ee00',
			eye: '#ffffff'
		};
		const palette = resolveCreaturePalette(
			species,
			{ paletteVariation: { hue: 0, lightness: 0 } },
			'light'
		);
		expect(paletteIssues(palette)).toEqual([]);
	});
});

describe('pattern recipes', () => {
	it('derive deterministically with one signature pattern, plan-biased, valid and persisted', () => {
		for (const plan of PLANS) {
			const types = new Set<string>();
			for (let seed = 0; seed < 60; seed++) {
				const species = generateSpecies(seed, plan);
				const surface = species.appearance.surface!;
				expect(validateSurfaceGenome(surface)).toBeNull();
				expect(validateSpecies(species)).toBeNull();
				expect(deriveSurfaceGenome(species)).toEqual(surface);
				expect(surface.secondaryPattern.type).not.toBe(
					surface.primaryPattern.type === 'solid' ? 'x' : surface.primaryPattern.type
				);
				types.add(surface.primaryPattern.type);
			}
			expect(types.size).toBeGreaterThanOrEqual(4);
		}
		const serpents = Array.from(
			{ length: 60 },
			(_, s) => generateSpecies(s, 'serpentine').appearance.surface!
		);
		expect(serpents.filter((s) => s.primaryPattern.type === 'bands').length).toBeGreaterThan(8);
	});
	it('gives individuals their own placement but the same species pattern', () => {
		const species = generateSpecies(5, 'quadruped');
		const a = resolveCreatureSurface(species, generateIndividual(species, 1)),
			b = resolveCreatureSurface(species, generateIndividual(species, 2));
		expect(a.primaryPattern.type).toBe(b.primaryPattern.type);
		expect(a.primaryPattern.offset).not.toEqual(b.primaryPattern.offset);
		expect(Math.abs(a.primaryPattern.scale / b.primaryPattern.scale - 1)).toBeLessThan(0.2);
		expect(resolveCreatureSurface(species, generateIndividual(species, 1))).toEqual(a);
	});
	it('keeps recipes saved before surfaces existed on their old pattern', () => {
		const species = generateSpecies(9, 'quadruped');
		const legacy: SpeciesGenome = {
			...species,
			appearance: { palette: { ...species.appearance.palette, pattern: 'bands' } }
		};
		expect(legacySurfaceGenome(legacy).primaryPattern.type).toBe('bands');
		expect(validateSpecies(legacy)).toBeNull();
		const d = { species: legacy, individual: generateIndividual(legacy, 1) };
		expect(compileCreatureGeometry(d).fingerprint).toBe(
			compileCreatureGeometry(JSON.parse(JSON.stringify(d))).fingerprint
		);
	});
	it('rejects malformed surface recipes', () => {
		const surface = generateSpecies(1, 'quadruped').appearance.surface!;
		for (const bad of [
			{ ...surface, version: 2 },
			{ ...surface, accents: ['wings'] },
			{ ...surface, primaryPattern: { ...surface.primaryPattern, type: 'plaid' } },
			{ ...surface, primaryPattern: { ...surface.primaryPattern, scale: Number.NaN } },
			{ ...surface, underbelly: { ...surface.underbelly, width: 2 } }
		])
			expect(validateSurfaceGenome(bad)).not.toBeNull();
	});
});

describe('pattern functions (CPU mirror of the shader)', () => {
	it('spots cover roughly their density, with soft edges', () => {
		const spots = individualPattern('spots', { density: 0.3 });
		let covered = 0,
			soft = 0;
		const N = 4000;
		for (let i = 0; i < N; i++) {
			const p = {
				x: Math.sin(i * 1.7) * 0.6,
				y: Math.cos(i * 2.3) * 0.4,
				z: ((i * 0.37) % 1) - 0.5
			};
			const m = patternMask(spots, p, 0, 0.5);
			if (m > 0.5) covered++;
			if (m > 0.02 && m < 0.98) soft++;
		}
		expect(covered / N).toBeGreaterThan(0.18);
		expect(covered / N).toBeLessThan(0.42);
		expect(soft).toBeGreaterThan(0);
	});
	it('produces 4–30 meaningful spots on a torso, for many species (as authored)', () => {
		for (let seed = 0; seed < 25; seed++) {
			const d = definition(seed, 'quadruped');
			d.species = withPattern(d.species, 'spots');
			const c = compileCreatureGeometry(d);
			const spots = torsoSpots(c, c.surface!.primaryPattern);
			expect(spots, `seed ${seed}`).toBeGreaterThanOrEqual(4);
			expect(spots, `seed ${seed}`).toBeLessThanOrEqual(30);
		}
	});
	it('gives bigger bodies more, finer features — never fewer', () => {
		expect(patternDetail(0.07)).toBe(1);
		expect(patternDetail(PATTERN_REFERENCE_SCALE)).toBe(1);
		expect(patternDetail(4)).toBeCloseTo(2, 9);
		expect(patternDetail(1000)).toBe(PATTERN_MAX_DETAIL);
		expect(patternDetail(Number.NaN)).toBe(1);
		for (let s = 0.1; s < 60; s *= 1.3)
			expect(patternDetail(s * 1.3)).toBeGreaterThanOrEqual(patternDetail(s));
		const spots = individualPattern('spots');
		expect(sizedPattern(spots, 0.5)).toBe(spots);
		expect(sizedPattern(spots, 9)).toMatchObject({
			scale: spots.scale * 3,
			frequency: spots.frequency,
			density: spots.density
		});
		const stripes = individualPattern('stripes');
		expect(sizedPattern(stripes, 9).frequency).toBeCloseTo(stripes.frequency * 3, 9);
		// Features still grow with the animal, just slower than it does (√ of the body scale).
		const featureMetres = (S: number) => S / sizedPattern(spots, S).scale;
		expect(featureMetres(16)).toBeGreaterThan(featureMetres(4));
		expect(featureMetres(16) / featureMetres(4)).toBeCloseTo(2, 9);

		let giants = 0;
		for (let seed = 0; seed < 40; seed++) {
			const d = definition(seed, 'quadruped');
			d.species = withPattern(d.species, 'spots');
			const c = compileCreatureGeometry(d, 2);
			const S = c.surfaceScale!;
			const authored = torsoSpots(c, c.surface!.primaryPattern);
			const drawn = torsoSpots(c, sizedPattern(c.surface!.primaryPattern, S));
			if (S <= PATTERN_REFERENCE_SCALE) expect(drawn, `seed ${seed}`).toBe(authored);
			else if (S >= 6) {
				giants++;
				expect(drawn, `seed ${seed} S ${S.toFixed(1)}`).toBeGreaterThan(authored * 2);
			}
		}
		expect(giants).toBeGreaterThanOrEqual(3);
	});
	it('the shader table carries the sized pattern, the CPU bake the same', () => {
		const d = definition(1, 'quadruped');
		d.species = withPattern(d.species, 'spots', 'stripes');
		const giant = compileCreatureGeometry(d);
		expect(giant.surfaceScale).toBeGreaterThan(9);
		const table = creatureSurfaceTable();
		const slot = table.allocate();
		try {
			table.write(slot, giant.surface!, 0, giant.surfaceScale!);
			const texel = (i: number) =>
				Array.from(table.data.subarray((slot * 8 + i) * 4, (slot * 8 + i + 1) * 4));
			const A = sizedPattern(giant.surface!.primaryPattern, giant.surfaceScale!);
			const B = sizedPattern(giant.surface!.secondaryPattern!, giant.surfaceScale!);
			expect(texel(1)[0]).toBeCloseTo(A.scale * NOISE_FEATURE_TEXELS, 3);
			expect(texel(5)[0]).toBeCloseTo(B.scale * NOISE_FEATURE_TEXELS, 3);
			expect(texel(6)[0]).toBeCloseTo(B.frequency, 3);
			expect(A.scale).toBeGreaterThan(giant.surface!.primaryPattern.scale * 2.5);
		} finally {
			table.release(slot);
		}
	});
	it('bands follow the longitudinal coordinate at the requested frequency', () => {
		for (const frequency of [2, 5, 9]) {
			const bands = individualPattern('bands', { frequency, phase: 0, density: 0.45 });
			let edges = 0,
				previous = patternMask(bands, { x: 0, y: 0, z: 0 }, 0, 0) > 0.5;
			for (let i = 1; i <= 2000; i++) {
				const on = patternMask(bands, { x: 0, y: 0, z: 0 }, i / 2000, 0) > 0.5;
				if (on && !previous) edges++;
				previous = on;
			}
			expect(Math.abs(edges - frequency)).toBeLessThanOrEqual(1);
		}
	});
	it('mottling is broad and stable (no static), dorsal patterns stay on the back', () => {
		const mottled = individualPattern('mottled');
		let jump = 0;
		for (let i = 0; i < 500; i++) {
			const p = { x: i * 0.002, y: 0.1, z: 0.2 };
			const q = { ...p, x: p.x + 0.002 };
			jump = Math.max(
				jump,
				Math.abs(patternMask(mottled, p, 0, 0) - patternMask(mottled, q, 0, 0))
			);
			expect(patternMask(mottled, p, 0, 0)).toBe(patternMask(mottled, p, 0, 0));
		}
		expect(jump).toBeLessThan(0.15);
		const dorsal = individualPattern('dorsal-spots', { density: 0.8 });
		for (let i = 0; i < 50; i++)
			expect(patternMask(dorsal, { x: i * 0.03, y: 0, z: 0 }, 0, -0.5)).toBe(0);
		const stripe = individualPattern('back-stripe');
		expect(patternMask(stripe, { x: 0, y: 0, z: 0 }, 0, 1)).toBeGreaterThan(0.9);
		expect(patternMask(stripe, { x: 0, y: 0, z: 0 }, 0, -0.5)).toBe(0);
	});
	it('samples the shared noise volume continuously and tileably', () => {
		expect(sampleCreatureNoise(0.25, 0.5, 0.75)).toBeCloseTo(
			sampleCreatureNoise(1.25, -0.5, 1.75),
			6
		);
		for (let i = 0; i < 100; i++) {
			const v = sampleCreatureNoise(i * 0.013, i * 0.007, i * 0.011);
			expect(v).toBeGreaterThanOrEqual(0);
			expect(v).toBeLessThanOrEqual(1);
		}
	});
});

describe('compiled surface attributes', () => {
	it('classifies underbelly, accents, regions and masks from anatomy, not world space', () => {
		const d = definition(42, 'quadruped');
		d.species = withPattern(d.species, 'spots', 'limb-bands');
		const c = compileCreatureGeometry(d, 0, { surfaceDebug: true });
		const g = c.geometry,
			debug = c.surfaceDebug!;
		const count = g.positions.length / 3;
		let bellyTorso = 0,
			bellyBack = 0,
			footAccent = 0,
			footPattern = 0,
			limbBandLower = 0;
		for (let v = 0; v < count; v++) {
			const region = g.surface[v * 4 + 3],
				radial = (g.surfacePattern[v * 4 + 1] / 65535) * 2 - 1;
			const maskA = g.surfacePattern[v * 4 + 2] / 65535,
				maskB = g.surfacePattern[v * 4 + 3] / 65535;
			if (region === SURFACE_REGION.TORSO && radial < -0.9)
				bellyTorso += debug.underbelly[v] > 0.5 ? 1 : 0;
			if (region === SURFACE_REGION.TORSO && radial > 0.3)
				bellyBack += debug.underbelly[v] > 0.05 ? 1 : 0;
			if (region === SURFACE_REGION.FOOT) {
				footAccent += debug.accent[v] > 0.3 ? 1 : 0;
				footPattern += maskA + maskB;
			}
			if (
				region >= SURFACE_REGION.LIMB_FRONT_LEFT &&
				region <= SURFACE_REGION.LIMB_REAR_RIGHT &&
				maskB > 0.5
			)
				limbBandLower++;
			for (let k = 0; k < 4; k++) expect(Number.isFinite(g.surfacePattern[v * 4 + k])).toBe(true);
			expect(region).toBeLessThanOrEqual(SURFACE_REGION.SERPENT_BODY);
		}
		expect(bellyTorso).toBeGreaterThan(0);
		expect(bellyBack).toBe(0);
		expect(footAccent).toBeGreaterThan(0);
		expect(footPattern).toBe(0);
		expect(limbBandLower).toBeGreaterThan(0);
		// Removing the feet accent removes it from the feet.
		d.species.appearance.surface!.accents = d.species.appearance.surface!.accents.filter(
			(a) => a !== 'feet'
		);
		const plain = compileCreatureGeometry(d, 0, { surfaceDebug: true });
		for (let v = 0; v < plain.geometry.positions.length / 3; v++)
			if (plain.geometry.surface[v * 4 + 3] === SURFACE_REGION.FOOT)
				expect(plain.surfaceDebug!.accent[v]).toBeLessThan(0.3);
	});
	it('is identical for the same genome, finite for every plan, and simplifies by LOD', () => {
		for (const plan of PLANS)
			for (let seed = 0; seed < 10; seed++) {
				const d = definition(seed, plan);
				const [l0, l1, l2] = ([0, 1, 2] as const).map((lod) => compileCreatureGeometry(d, lod));
				expect(compileCreatureGeometry(JSON.parse(JSON.stringify(d))).fingerprint).toBe(
					l0.fingerprint
				);
				expect(l1.surface).toEqual(l0.surface);
				expect(l2.surface).toEqual(l0.surface);
				expect(l1.surfaceScale).toBe(l0.surfaceScale);
				for (const c of [l0, l1, l2]) {
					expect(c.geometry.colors.every(Number.isFinite)).toBe(true);
					expect(c.geometry.surface.length).toBe((c.geometry.positions.length / 3) * 4);
				}
				// LOD1 drops the secondary pattern from the shader; LOD2 bakes everything.
				for (let v = 3; v < l1.geometry.surfacePattern.length; v += 4)
					expect(l1.geometry.surfacePattern[v]).toBe(0);
				for (let v = 0; v < l2.geometry.surfacePattern.length; v += 4) {
					expect(l2.geometry.surfacePattern[v + 2]).toBe(0);
					expect(l2.geometry.surfacePattern[v + 3]).toBe(0);
				}
			}
	});
});

describe('surface golden fingerprints', () => {
	const coords = [
		{ p: { x: 0, y: 0.4, z: 0 }, u: 0.1, r: 0.9 },
		{ p: { x: 0.2, y: 0.3, z: 0.3 }, u: 0.6, r: 0.2 },
		{ p: { x: -0.25, y: 0.35, z: -0.2 }, u: 1.3, r: -0.4 },
		{ p: { x: 0.1, y: 0.5, z: 0.45 }, u: 2.2, r: 0.6 }
	];
	for (const [plan, seed] of [
		['quadruped', 42],
		['biped', 3],
		['hexapod', 11],
		['serpentine', 5]
	] as const)
		it(`${plan} ${seed}`, () => {
			const d = definition(seed, plan, 7);
			const s = resolveCreatureSurface(d.species, d.individual);
			const sample = (p?: IndividualPattern) =>
				p ? coords.map((c) => Math.round(patternMask(p, c.p, c.u, c.r) * 1000) / 1000) : null;
			expect({
				palette: s.palette,
				primary: s.primaryPattern.type,
				secondary: s.secondaryPattern?.type ?? 'solid',
				seed: s.seed,
				underbelly: s.underbelly,
				accents: s.accents,
				samples: { primary: sample(s.primaryPattern), secondary: sample(s.secondaryPattern) }
			}).toMatchSnapshot();
		});
});
