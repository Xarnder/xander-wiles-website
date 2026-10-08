import { fbm, fbm01, gradientNoise, hash01, smoothstep } from '../noise/tileableNoise';
import type { ResolvedMaterialRecipe } from '../ProceduralMaterialTypes';
import { mixRgb, type SurfaceCanvas } from '../SurfaceCanvas';
import { layerSeeds, paletteColor, periodFor } from './generatorUtils';

const LAYER = { slate: 1, edge: 2, cleavage: 3, lichen: 4, lichenMask: 5, dirt: 6, stagger: 7 };

/** Exposed course height (the "gauge") — the visible depth of each row of slates, in metres. */
const COURSE_GAUGE = 0.2;
/** Nominal slate width, in metres. */
const SLATE_WIDTH = 0.3;
/** How much each course's lower edge stands proud of the slates it overlaps, in metres. */
const OVERLAP_STEP = 0.007;
/** Half-width of the dark vertical gap between neighbouring slates, in metres. */
const GAP_HALF_WIDTH = 0.0045;

/**
 * Overlapping slate roof tiles. V runs UP the slope with V = 0 at the eave — `surfaceMapping.ts`'s
 * `roof` mode guarantees that — so whole courses start at the eave and stay parallel to it on any
 * roof size or pitch. Each course is offset by half a slate from the one below (broken bond), with
 * a little per-joint jitter so the bond isn't mechanical.
 *
 * Height is a sawtooth per course: a slate's lower edge sits on top of the course beneath it, so it
 * is highest at its bottom edge and drops toward the top, where the next course's edge steps up over
 * it. That step is what reads as "rows of overlapping slates" from a distance, through the normal
 * map and cavity AO, rather than through painted lines.
 */
export function paintSlate(canvas: SurfaceCanvas, recipe: ResolvedMaterialRecipe): void {
	const { size, tileWidth, tileHeight } = canvas;
	const seeds = layerSeeds(recipe.seed, LAYER);
	const irregular = recipe.variant === 'irregular';
	const variation = recipe.variation;
	const weathering = recipe.weathering;

	const base = paletteColor(recipe, 'base');
	const dark = paletteColor(recipe, 'dark');
	const light = paletteColor(recipe, 'light');
	const rust = paletteColor(recipe, 'rust');
	const lichen = paletteColor(recipe, 'lichen');
	const gapColor = paletteColor(recipe, 'gap');

	// Integer course/slate counts per tile so the pattern tiles exactly; the physical sizes stay
	// within a few percent of the nominal ones whatever the tile size.
	// Even, so the half-slate broken bond lines up across the tile seam.
	const courses = Math.max(2, 2 * Math.round(tileHeight / COURSE_GAUGE / 2));
	const gauge = tileHeight / courses;
	const slatesPerCourse = Math.max(2, Math.round(tileWidth / SLATE_WIDTH));
	const slateWidth = tileWidth / slatesPerCourse;
	const jointJitter = irregular ? 0.22 : 0.12;

	const cleavagePu = periodFor(tileWidth, 0.09);
	const cleavagePv = periodFor(tileHeight, 0.012);
	const edgeP = periodFor(tileWidth, 0.03);
	const lichenP = periodFor(tileWidth, 0.05);
	const lichenMaskP = periodFor(tileWidth, 0.5);
	const dirtP = periodFor(tileWidth, 0.8);

	/** Left boundary (metres, unwrapped) of slate `k` in `course`, jittered but monotonic. */
	const boundary = (course: number, k: number): number => {
		const wrapped = ((k % slatesPerCourse) + slatesPerCourse) % slatesPerCourse;
		const jitter = (hash01(course, wrapped, seeds.stagger) - 0.5) * jointJitter;
		const bond = course % 2 === 0 ? 0 : 0.5;
		return (k + bond + jitter) * slateWidth;
	};

	for (let y = 0; y < size; y++) {
		const t = (y + 0.5) / size;
		const v = t * tileHeight;
		for (let x = 0; x < size; x++) {
			const s = (x + 0.5) / size;
			const u = s * tileWidth;
			const i = y * size + x;

			// Irregular lower edge of the course this texel would belong to: per-slate offset + chips.
			let course = Math.floor(v / gauge);
			const edgeNoise = gradientNoise(s * edgeP, t * 3, edgeP, 3, seeds.edge);
			let slateIndex = 0;
			let slateU = 0;
			let width = slateWidth;
			let fv = 0;
			for (let attempt = 0; attempt < 2; attempt++) {
				const c = ((course % courses) + courses) % courses;
				let k = Math.floor(u / slateWidth - (c % 2 === 0 ? 0 : 0.5));
				while (boundary(c, k) > u) k--;
				while (boundary(c, k + 1) <= u) k++;
				const left = boundary(c, k);
				width = boundary(c, k + 1) - left;
				slateU = u - left;
				slateIndex = ((k % slatesPerCourse) + slatesPerCourse) % slatesPerCourse;
				const slateHash = hash01(c, slateIndex, seeds.slate);
				const tilt = (hash01(slateIndex, c, seeds.slate + 1) - 0.5) * (irregular ? 0.03 : 0.012);
				const edgeOffset =
					(slateHash - 0.5) * (irregular ? 0.016 : 0.008) +
					tilt * (slateU / width - 0.5) +
					edgeNoise * (irregular ? 0.004 : 0.0022);
				fv = (v - course * gauge - edgeOffset) / gauge;
				if (fv >= 0 || attempt === 1) break;
				// Below this slate's (irregular) lower edge: we are looking at the course beneath it.
				course -= 1;
			}
			if (fv < 0) fv = 0;
			if (fv > 1) fv = 1;
			const c = ((course % courses) + courses) % courses;
			const slateHash = hash01(c, slateIndex, seeds.slate);
			const slateHash2 = hash01(slateIndex, c, seeds.slate + 7);

			// Per-slate colour: spread between dark and light, a few rusty/bleached outliers.
			const tone = (slateHash - 0.5) * 2 * variation;
			const slateColor =
				tone > 0 ? mixRgb(base, light, tone * 0.7) : mixRgb(base, dark, -tone * 0.8);
			canvas.setColor(i, slateColor);
			if (slateHash2 > 0.93) canvas.mixColor(i, rust, 0.25 + weathering * 0.35);
			else if (slateHash2 < 0.05) canvas.mixColor(i, light, 0.25);

			const cleavage = fbm(s, t, cleavagePu, cleavagePv, 2, seeds.cleavage);
			canvas.scaleColor(i, 1 + cleavage * 0.06);

			// Lower slate edges catch a little light; the overlapped top of each slate is in shadow.
			canvas.scaleColor(i, 1.04 - fv * 0.1);

			// Lichen and dirt — patchy, favouring the sheltered upper part of each exposed slate.
			const lichenMask = fbm01(s, t, lichenMaskP, lichenMaskP, 2, seeds.lichenMask);
			const lichenSpots = fbm01(s, t, lichenP, lichenP, 2, seeds.lichen);
			const lichenAmount =
				smoothstep(0.62, 0.75, lichenSpots) * smoothstep(0.5, 0.8, lichenMask) * recipe.moss;
			canvas.mixColor(i, lichen, lichenAmount * 0.75);
			const dirtField = fbm01(s, t, dirtP, dirtP, 2, seeds.dirt);
			canvas.mixColor(i, dark, smoothstep(0.5, 0.9, dirtField) * recipe.dirt * 0.4 * (0.4 + fv));

			// Vertical gaps between neighbouring slates in a course.
			const gapDistance = Math.min(slateU, width - slateU);
			const gap = 1 - smoothstep(GAP_HALF_WIDTH * 0.4, GAP_HALF_WIDTH, gapDistance);
			// The step shadow just below the next course's edge.
			const stepShadow = smoothstep(0.82, 1, fv);
			canvas.mixColor(i, gapColor, gap * 0.9 + stepShadow * 0.35);

			const slateRoll = (slateHash2 - 0.5) * 0.002 * (slateU / width - 0.5);
			canvas.height[i] =
				(1 - fv) * OVERLAP_STEP +
				slateHash * 0.0012 +
				slateRoll +
				cleavage * 0.00025 +
				lichenAmount * 0.0003 -
				gap * 0.004;
			canvas.roughness[i] = Math.min(
				1,
				recipe.roughness + (slateHash - 0.5) * 0.12 + lichenAmount * 0.25 + gap * 0.2
			);
			canvas.ao[i] = 1 - stepShadow * 0.35;
		}
	}
}
