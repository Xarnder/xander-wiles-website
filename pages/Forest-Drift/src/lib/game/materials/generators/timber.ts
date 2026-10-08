import { fbm, fbm01, fract, gradientNoise, hash01, smoothstep } from '../noise/tileableNoise';
import type { ResolvedMaterialRecipe } from '../ProceduralMaterialTypes';
import type { SurfaceCanvas } from '../SurfaceCanvas';
import { layerSeeds, layoutRandom, paletteColor, periodFor } from './generatorUtils';

const LAYER = {
	ringWarp: 1,
	ringSweep: 2,
	fibre: 3,
	fibreFine: 4,
	streak: 5,
	checks: 6,
	checkMask: 7,
	weather: 8,
	dirt: 9,
	board: 10
};

interface Knot {
	u: number;
	v: number;
	radiusU: number;
	radiusV: number;
}

/** Shortest wrapped difference on a tile of length `period`. */
function wrappedDelta(a: number, b: number, period: number): number {
	let d = a - b;
	if (d > period * 0.5) d -= period;
	else if (d < -period * 0.5) d += period;
	return d;
}

/**
 * Structural timber. U is ALWAYS along the grain — `surfaceMapping.ts`'s `grain` mode orients U along
 * each beam's long axis — so every feature here is stretched along U: growth-ring lines that wander
 * slowly along the board, long fibre streaks, longitudinal colour streaks, knots elongated along the
 * grain with rings swirling around them, and seasoning checks (splits) running with the grain.
 *
 * `recipe.planks` lays the tile out as separate boards (floors, door leaves): each board gets its own
 * grain phase and tone, with grooved seams between boards and staggered end joints.
 */
export function paintTimber(canvas: SurfaceCanvas, recipe: ResolvedMaterialRecipe): void {
	const { size, tileWidth, tileHeight } = canvas;
	const seeds = layerSeeds(recipe.seed, LAYER);
	const variation = recipe.variation;
	const weathering = recipe.weathering;
	const fresh = recipe.variant === 'fresh';

	const base = paletteColor(recipe, 'base');
	const dark = paletteColor(recipe, 'dark');
	const light = paletteColor(recipe, 'light');
	const weatheredColor = paletteColor(recipe, 'weathered');
	const knotColor = paletteColor(recipe, 'knot');

	const random = layoutRandom(recipe.seed, 1);
	const knotCount = Math.max(1, Math.round((tileWidth * tileHeight) / 0.5));
	const knots: Knot[] = [];
	for (let k = 0; k < knotCount; k++) {
		if (random() > 0.6) continue;
		const radiusV = 0.009 + random() * 0.016;
		knots.push({
			u: random() * tileWidth,
			v: random() * tileHeight,
			radiusV,
			radiusU: radiusV * (1.3 + random() * 0.8)
		});
	}

	// Plank layout: boards across V, staggered end joints along U.
	const boardCount = recipe.planks ? Math.max(2, Math.round(tileHeight / 0.17)) : 1;
	const boardWidth = tileHeight / boardCount;
	const boardLength = tileWidth / 2;
	const boards = Array.from({ length: boardCount }, (_, b) => ({
		jointOffset: hash01(b, 1, seeds.board) * boardLength,
		tone: (hash01(b, 2, seeds.board) - 0.5) * 2,
		phase: hash01(b, 3, seeds.board) * 10
	}));

	const ringSpacing = fresh ? 0.009 : 0.012;
	const ringWarpPu = periodFor(tileWidth, 0.9);
	const ringWarpPv = periodFor(tileHeight, 0.12);
	const sweepPu = periodFor(tileWidth, 2);
	const fibrePu = periodFor(tileWidth, 0.25);
	const fibrePv = periodFor(tileHeight, 0.0035);
	const fibreFinePu = periodFor(tileWidth, 0.08);
	const fibreFinePv = periodFor(tileHeight, 0.0015);
	const streakPu = periodFor(tileWidth, 0.7);
	const streakPv = periodFor(tileHeight, 0.035);
	const checksPu = periodFor(tileWidth, 0.5);
	const checksPv = periodFor(tileHeight, 0.02);
	const checkMaskPu = periodFor(tileWidth, 0.6);
	const checkMaskPv = periodFor(tileHeight, 0.12);
	const weatherPu = periodFor(tileWidth, 0.6);
	const weatherPv = periodFor(tileHeight, 0.15);

	for (let y = 0; y < size; y++) {
		const t = (y + 0.5) / size;
		const v = t * tileHeight;
		const boardIndex = Math.min(boardCount - 1, Math.floor(v / boardWidth));
		const board = boards[boardIndex];
		const vInBoard = v - boardIndex * boardWidth;
		const seamDistance = recipe.planks ? Math.min(vInBoard, boardWidth - vInBoard) : Infinity;

		for (let x = 0; x < size; x++) {
			const s = (x + 0.5) / size;
			const u = s * tileWidth;
			const i = y * size + x;

			// Growth rings: lines along U whose position wanders slowly with U (flat-sawn figure).
			const ringWarp = fbm(s, t, ringWarpPu, ringWarpPv, 3, seeds.ringWarp) * 0.012;
			const sweep = fbm(s, t, sweepPu, 1, 2, seeds.ringSweep) * 0.02;
			let ringCoord = v + ringWarp + sweep + board.phase;

			// Knots: elongated dark cores with rings swirling around them.
			let knotCore = 0;
			let knotHalo = 0;
			for (const knot of knots) {
				const du = wrappedDelta(u, knot.u, tileWidth) / knot.radiusU;
				const dv = wrappedDelta(v, knot.v, tileHeight) / knot.radiusV;
				const d = Math.sqrt(du * du + dv * dv);
				if (d < 4) {
					const influence = 1 - d / 4;
					// Bend rings away from the knot centre (continuous everywhere outside the dark core).
					ringCoord += influence * influence * knot.radiusV * 2.5 * (dv / Math.max(d, 0.25));
					knotHalo = Math.max(knotHalo, influence * influence);
					knotCore = Math.max(knotCore, 1 - smoothstep(0.7, 1.05, d));
				}
			}

			const ringPhase = fract(ringCoord / ringSpacing);
			const latewood = smoothstep(0.62, 0.92, ringPhase) * (1 - smoothstep(0.92, 1, ringPhase));
			const fibre =
				gradientNoise(s * fibrePu, t * fibrePv, fibrePu, fibrePv, seeds.fibre) * 0.65 +
				gradientNoise(s * fibreFinePu, t * fibreFinePv, fibreFinePu, fibreFinePv, seeds.fibreFine) *
					0.35;
			const streak = fbm(s, t, streakPu, streakPv, 3, seeds.streak);
			const weatherField = fbm01(s, t, weatherPu, weatherPv, 3, seeds.weather);

			canvas.setColor(i, base);
			const tone = streak * 0.75 + board.tone * 0.35 * variation;
			if (tone > 0) canvas.mixColor(i, light, tone * (0.3 + variation * 0.5));
			else canvas.mixColor(i, dark, -tone * (0.3 + variation * 0.5));
			canvas.mixColor(i, dark, latewood * 0.6);
			canvas.scaleColor(i, 1 + fibre * 0.13);

			// Sun-bleached, greyed patches on exposed timber.
			const weatherAmount = smoothstep(0.45, 0.85, weatherField) * weathering;
			canvas.mixColor(i, weatheredColor, weatherAmount * 0.45);
			canvas.mixColor(i, dark, smoothstep(0.7, 0.95, 1 - weatherField) * recipe.dirt * 0.35);

			canvas.mixColor(i, dark, knotHalo * 0.25);
			canvas.mixColor(i, knotColor, knotCore * 0.85);

			// Seasoning checks: thin splits along the grain, only in some regions.
			const checkMask = smoothstep(
				0.55,
				0.8,
				fbm01(s, t, checkMaskPu, checkMaskPv, 2, seeds.checkMask)
			);
			let check = 0;
			if (checkMask > 0) {
				const n = gradientNoise(s * checksPu, t * checksPv, checksPu, checksPv, seeds.checks);
				check = (1 - smoothstep(0.02, 0.07, Math.abs(n))) * checkMask * (0.3 + weathering * 0.7);
				canvas.mixColor(i, knotColor, check * 0.7);
			}

			// Plank seams and staggered butt joints.
			let seam = 0;
			if (recipe.planks) {
				const jointPhase = fract((u - board.jointOffset) / boardLength);
				const jointToEdge = Math.min(jointPhase, 1 - jointPhase) * boardLength;
				seam = Math.max(
					1 - smoothstep(0.0015, 0.004, seamDistance),
					1 - smoothstep(0.0015, 0.004, jointToEdge)
				);
				canvas.mixColor(i, knotColor, seam * 0.8);
			}

			const earlywoodErosion = weathering * 0.0004;
			canvas.height[i] =
				fibre * 0.0005 -
				(1 - latewood) * earlywoodErosion +
				latewood * 0.00025 +
				knotCore * 0.0003 -
				check * 0.0016 -
				seam * 0.003 +
				(recipe.planks ? Math.min(seamDistance, 0.006) * 0.15 : 0);
			canvas.roughness[i] = Math.min(
				1,
				recipe.roughness + fibre * 0.04 + weatherAmount * 0.12 + check * 0.1 - knotCore * 0.15
			);
		}
	}
}
