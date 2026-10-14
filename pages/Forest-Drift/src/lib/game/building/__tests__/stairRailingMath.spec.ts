import { describe, expect, it } from 'vitest';
import { cloneBarrierStyle, getBarrierPreset, type BarrierPresetId } from '../BarrierTypes';
import { computeStairMetrics } from '../stairMath';
import {
	layoutStairRailings,
	stairTreadTopAt,
	STAIR_RAILING_EDGE_INSET
} from '../stairRailingMath';

function metrics(widthCells = 4, runCells = 12) {
	return computeStairMetrics({
		minGridX: 0,
		maxGridX: runCells,
		minGridZ: 0,
		maxGridZ: widthCells,
		direction: '+x',
		gridSizeAtCreation: 0.25,
		baseY: 0
	});
}

function style(id: BarrierPresetId, edit?: (s: ReturnType<typeof cloneBarrierStyle>) => void) {
	const s = cloneBarrierStyle(getBarrierPreset(id).style);
	edit?.(s);
	return s;
}

describe('stair railings are fences', () => {
	const m = metrics();

	it('puts one railing on each side, inside the flight', () => {
		const layouts = layoutStairRailings(m, style('classic-interior'));
		expect(layouts).toHaveLength(2);
		const zs = layouts.map((l) => l.posts[0].z).sort((a, b) => a - b);
		const post = getBarrierPreset('classic-interior').style.endPost.width;
		expect(zs[0] - (post / 2) * 1.25).toBeGreaterThanOrEqual(STAIR_RAILING_EDGE_INSET - 1e-9);
		expect(zs[1] + (post / 2) * 1.25).toBeLessThanOrEqual(
			m.widthMeters - STAIR_RAILING_EDGE_INSET + 1e-9
		);
	});

	it('stands a newel on the floor at the foot and one on the top tread, both in the fence style', () => {
		for (const layout of layoutStairRailings(m, style('fancy-newel'))) {
			expect(layout.posts).toHaveLength(2);
			const [foot, top] = [...layout.posts].sort((a, b) => a.x - b.x);
			expect(foot.baseY).toBeCloseTo(0, 9);
			expect(top.baseY).toBeCloseTo(m.totalRise, 9);
			expect(foot.style.profile).toBe('classic-newel');
			expect(foot.cap).toBe('ball');
		}
	});

	it('runs the handrail parallel to the nosings at the style height', () => {
		const s = style('classic-interior');
		const nosingLine = (x: number) => m.stepRise + (x * m.stepRise) / m.stepRun;
		for (const layout of layoutStairRailings(m, s)) {
			const rail = layout.rails.find((r) => r.role === 'top-rail')!;
			for (const x of [rail.ax + 0.2, (rail.ax + rail.bx) / 2, rail.bx - 0.2]) {
				const top = rail.yA + rail.slope * (x - rail.ax);
				expect(Math.abs(top - (nosingLine(x) + s.height))).toBeLessThan(0.06);
			}
		}
	});

	it('stands balusters on the treads, each its own length', () => {
		const s = style('simple-interior', (x) => (x.bottomRail.enabled = false));
		const [layout] = layoutStairRailings(m, s);
		const footRun = s.endPost.width / 2;
		expect(layout.balusters.length).toBeGreaterThan(10);
		for (const b of layout.balusters) {
			expect(b.baseY).toBeCloseTo(stairTreadTopAt(m, b.x, footRun) - 0.03, 9);
			expect(b.topY).toBeGreaterThan(b.baseY + 0.5);
		}
		expect(
			new Set(layout.balusters.map((b) => (b.topY - b.baseY).toFixed(3))).size
		).toBeGreaterThan(2);
	});

	it('runs a bottom rail just above the nosings when the style has one', () => {
		const s = style('classic-interior');
		const nosingLine = (x: number) => m.stepRise + (x * m.stepRise) / m.stepRun;
		const [layout] = layoutStairRailings(m, s);
		const bottom = layout.rails.find((r) => r.role === 'bottom-rail')!;
		const mid = (bottom.ax + bottom.bx) / 2;
		expect(bottom.yA + bottom.slope * (mid - bottom.ax) - bottom.height).toBeGreaterThan(
			nosingLine(mid) - 0.04
		);
	});

	it('never adds run posts mid-flight, and skips flights too narrow for two railings', () => {
		const long = metrics(4, 40);
		for (const layout of layoutStairRailings(long, style('simple-wood-fence')))
			expect(layout.posts.filter((p) => p.role === 'structural-post')).toHaveLength(0);
		expect(layoutStairRailings(metrics(1, 12), style('classic-interior'))).toEqual([]);
	});
});
