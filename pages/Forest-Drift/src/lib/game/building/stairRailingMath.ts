import { layoutBarrier, type BarrierLayout } from './barrierLayout';
import {
	cloneBarrierStyle,
	createDefaultBarrierDraftSettings,
	sanitizeBarrierStyle,
	type BarrierStyleDefinition
} from './BarrierTypes';
import type { StairMetrics } from './stairMath';

/**
 * Stair railings are fences: the same generator, the same style — whatever Fence / Railing style
 * was current when the stair was placed (or restyled with `R`) — so a staircase and the balustrade
 * around its landing match. Pure, in canonical stair space (run along +X from the bottom, width
 * along +Z, rise along +Y), like the rest of stairMath; StairRailingBuilder places the result.
 *
 * Each side of the flight is one barrier path from a newel on the floor at the foot to a newel on
 * the top tread:
 * - posts stay vertical on those two bases (`linear-slope`), no run posts mid-flight;
 * - the rail runs parallel to the nosing line — one step above the floor-to-landing line the newels
 *   stand on (`railLift`), so its height above every tread nosing is the style's height;
 * - balusters stand on the treads themselves (`balusterBase`), each its own length, unless the
 *   style has a bottom rail, which then runs parallel to the pitch just above the nosings.
 */

/** How far a railing's posts stay in from each side of the flight. */
export const STAIR_RAILING_EDGE_INSET = 0.02;

/** Railing style for stairs built before stair railings followed the Fence / Railing style. */
export function defaultStairRailingStyle(): BarrierStyleDefinition {
	return createDefaultBarrierDraftSettings().style;
}

/** The style as used on a flight: sanitized, and without intermediate run posts. */
export function stairRailingStyle(style: BarrierStyleDefinition): BarrierStyleDefinition {
	const s = sanitizeBarrierStyle(cloneBarrierStyle(style));
	s.structuralPost.enabled = false;
	return s;
}

/** Walkable height at `run` along the flight: the floor at the foot, then each tread's top. */
export function stairTreadTopAt(
	metrics: Pick<StairMetrics, 'stepRun' | 'stepRise' | 'totalRise'>,
	run: number,
	footRun: number
): number {
	if (run <= footRun + 1e-6) return 0;
	const step = Math.floor(run / metrics.stepRun);
	return Math.min(metrics.totalRise, Math.max(0, (step + 1) * metrics.stepRise));
}

/** One layout per side of the flight — none when it is too narrow for two. */
export function layoutStairRailings(
	metrics: Pick<
		StairMetrics,
		'stepCount' | 'stepRise' | 'stepRun' | 'widthMeters' | 'runMeters' | 'totalRise'
	>,
	railingStyle: BarrierStyleDefinition
): BarrierLayout[] {
	const style = stairRailingStyle(railingStyle);
	const post = style.endPost.width;
	const half = post / 2;
	if (metrics.stepCount <= 0 || metrics.runMeters < post * 2 + 0.2) return [];

	// Caps and newel plinths overhang the post by up to a quarter of its width; keep those inside too.
	const reach = half * 1.25;
	const left = STAIR_RAILING_EDGE_INSET + reach;
	const right = metrics.widthMeters - STAIR_RAILING_EDGE_INSET - reach;
	// Too narrow for two railings and a person between them: no railing (never one down the middle).
	const sides = right - left >= post + 0.3 ? [left, right] : [];

	const footRun = half;
	const topRun = metrics.runMeters - half;
	return sides.map((z) =>
		layoutBarrier({
			points: [
				{ x: footRun, y: 0, z },
				{ x: topRun, y: metrics.totalRise, z }
			],
			closed: false,
			baseMode: 'linear-slope',
			style,
			railLift: metrics.stepRise,
			balusterBase: (run) => stairTreadTopAt(metrics, run, footRun)
		})
	);
}
