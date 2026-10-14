import { describe, expect, it } from 'vitest';
import {
	distributeBalusters,
	layoutBarrier,
	structuralPostCount,
	type BarrierLayout
} from '../barrierLayout';
import {
	BARRIER_LIMITS,
	BARRIER_MAX_BALUSTERS_PER_BAY,
	cloneBarrierStyle,
	getBarrierPreset,
	sanitizeBarrierStyle,
	type BarrierPathPoint,
	type BarrierPresetId,
	type BarrierStyleDefinition
} from '../BarrierTypes';

function style(id: BarrierPresetId, edit?: (s: BarrierStyleDefinition) => void) {
	const s = cloneBarrierStyle(getBarrierPreset(id).style);
	edit?.(s);
	return sanitizeBarrierStyle(s);
}

const flat = (...xz: [number, number][]): BarrierPathPoint[] =>
	xz.map(([x, z]) => ({ x, y: 0, z }));

function postsAt(layout: BarrierLayout, x: number, z: number) {
	return layout.posts.filter((p) => Math.hypot(p.x - x, p.z - z) < 1e-6);
}

describe('baluster distribution', () => {
	it('balances spacing so both ends get the same margin', () => {
		const { count, spacing } = distributeBalusters(1.8, 0.12, 0.04);
		expect(count).toBe(14);
		expect(spacing * (count + 1)).toBeCloseTo(1.8, 9);
	});

	it('never crams or leaves huge gaps, whatever it is asked for', () => {
		const tight = distributeBalusters(2, 0.001, 0.04);
		expect(2 / (tight.count + 1)).toBeGreaterThanOrEqual(0.04 + 0.025 - 1e-9);
		expect(tight.count).toBeLessThan(40);
		const loose = distributeBalusters(3, 5, 0.04);
		expect(loose.spacing).toBeLessThanOrEqual(BARRIER_LIMITS.balusterSpacing.max + 1e-9);
		expect(distributeBalusters(500, 0.06, 0.02).count).toBeLessThanOrEqual(
			BARRIER_MAX_BALUSTERS_PER_BAY
		);
		expect(distributeBalusters(0.03, 0.12, 0.04).count).toBe(0);
	});

	it('sanitizes styles so a save cannot ask for 500 balusters on 2 m', () => {
		const s = style('classic-interior', (x) => {
			x.balusterSpacing = 0.0001;
			x.height = 40;
		});
		expect(s.balusterSpacing).toBe(BARRIER_LIMITS.balusterSpacing.min);
		expect(s.height).toBe(BARRIER_LIMITS.height.max);
		const layout = layoutBarrier({
			points: flat([0, 0], [2, 0]),
			closed: false,
			baseMode: 'flat',
			style: s
		});
		expect(layout.balusters.length).toBeLessThan(30);
	});
});

describe('straight railing', () => {
	const s = style('simple-interior', (x) => (x.structuralPost.enabled = false));
	const layout = layoutBarrier({
		points: flat([0, 0], [2, 0]),
		closed: false,
		baseMode: 'flat',
		style: s
	});

	it('has two end posts, a top rail and a bottom rail', () => {
		expect(layout.posts.map((p) => p.role)).toEqual(['end-post', 'end-post']);
		expect(layout.rails.filter((r) => r.role === 'top-rail')).toHaveLength(1);
		expect(layout.rails.filter((r) => r.role === 'bottom-rail')).toHaveLength(1);
		const top = layout.rails.find((r) => r.role === 'top-rail')!;
		expect(top.yA).toBeCloseTo(s.height, 9);
		expect(top.slope).toBe(0);
	});

	it('distributes balusters evenly between the post faces', () => {
		const half = s.endPost.width / 2;
		const xs = layout.balusters.map((b) => b.x).sort((a, b) => a - b);
		const available = 2 - 2 * half;
		const expected = distributeBalusters(available, s.balusterSpacing, s.baluster.width);
		expect(xs).toHaveLength(expected.count);
		expect(xs[0] - half).toBeCloseTo(expected.spacing, 9);
		expect(2 - half - xs[xs.length - 1]).toBeCloseTo(expected.spacing, 9);
		for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeCloseTo(expected.spacing, 9);
	});

	it('runs every baluster from the bottom rail to the top rail', () => {
		for (const b of layout.balusters) {
			expect(b.baseY).toBeLessThanOrEqual(s.bottomRail.height + 1e-9);
			expect(b.topY).toBeGreaterThanOrEqual(s.height - s.topRail.height);
			expect(b.topY).toBeLessThan(s.height);
		}
	});
});

describe('structural posts', () => {
	const s = style('simple-wood-fence');
	const layout = layoutBarrier({
		points: flat([0, 0], [10, 0]),
		closed: false,
		baseMode: 'flat',
		style: s
	});

	it('spaces intermediate posts evenly at no more than the post spacing', () => {
		const structural = layout.posts.filter((p) => p.role === 'structural-post');
		expect(structural).toHaveLength(structuralPostCount(10, s.structuralPostSpacing));
		const xs = [0, ...structural.map((p) => p.x).sort((a, b) => a - b), 10];
		for (let i = 1; i < xs.length; i++) {
			expect(xs[i] - xs[i - 1]).toBeLessThanOrEqual(s.structuralPostSpacing + 1e-9);
			expect(xs[i] - xs[i - 1]).toBeCloseTo(10 / (structural.length + 1), 9);
		}
	});

	it('never puts a baluster inside a post', () => {
		for (const b of layout.balusters) {
			for (const p of layout.posts) {
				expect(Math.abs(b.x - p.x)).toBeGreaterThan(
					p.style.width / 2 + s.baluster.width / 2 - 1e-9
				);
			}
		}
	});

	it('breaks rails at posts that rise above them', () => {
		const tops = layout.rails.filter((r) => r.role === 'top-rail');
		const structural = layout.posts.filter((p) => p.role === 'structural-post');
		expect(tops).toHaveLength(structural.length + 1);
	});
});

describe('corners', () => {
	const points = flat([0, 0], [3, 0], [3, 2]);

	it('puts exactly one post at the shared vertex', () => {
		const layout = layoutBarrier({
			points,
			closed: false,
			baseMode: 'flat',
			style: style('classic-interior')
		});
		const atB = postsAt(layout, 3, 0);
		expect(atB).toHaveLength(1);
		expect(atB[0].role).toBe('corner-post');
		expect(atB[0].style.profile).toBe('classic-newel');
	});

	it('keeps balusters inside their own segment', () => {
		const layout = layoutBarrier({
			points,
			closed: false,
			baseMode: 'flat',
			style: style('classic-interior')
		});
		for (const b of layout.balusters) {
			if (b.segmentIndex === 0) {
				expect(b.z).toBeCloseTo(0, 9);
				expect(b.x).toBeLessThan(3);
			} else {
				expect(b.x).toBeCloseTo(3, 9);
				expect(b.z).toBeGreaterThan(0);
			}
		}
		expect(layout.balusters.some((b) => b.segmentIndex === 0)).toBe(true);
		expect(layout.balusters.some((b) => b.segmentIndex === 1)).toBe(true);
	});

	it('mitres a rail that runs over the corner post (no gap, no double thickness)', () => {
		const layout = layoutBarrier({
			points,
			closed: false,
			baseMode: 'flat',
			style: style('deck-railing')
		});
		const tops = layout.rails.filter((r) => r.role === 'top-rail');
		const incoming = tops.filter((r) => r.segmentIndex === 0).at(-1)!;
		const outgoing = tops.find((r) => r.segmentIndex === 1)!;
		expect(incoming.bx).toBeCloseTo(3, 9);
		expect(outgoing.ax).toBeCloseTo(3, 9);
		// Both rails cut along the same mitre line through the corner.
		expect(incoming.endCut.x).toBeCloseTo(outgoing.startCut.x, 9);
		expect(incoming.endCut.z).toBeCloseTo(outgoing.startCut.z, 9);
		// 90° corner: the mitre runs diagonally, √2 × the half width.
		expect(Math.hypot(incoming.endCut.x, incoming.endCut.z)).toBeCloseTo(Math.SQRT2, 6);
		expect(layout.joints).toHaveLength(0);
	});

	it('handles 45° and obtuse corners, and bevels a very sharp one', () => {
		for (const [x, z] of [
			[5, 2],
			[2, 2],
			[4.5, 0.4]
		] as const) {
			const layout = layoutBarrier({
				points: flat([0, 0], [3, 0], [x, z]),
				closed: false,
				baseMode: 'flat',
				style: style('deck-railing')
			});
			expect(postsAt(layout, 3, 0)).toHaveLength(1);
			for (const r of layout.rails)
				expect([r.ax, r.az, r.bx, r.bz, r.yA].every(Number.isFinite)).toBe(true);
		}
		const sharp = layoutBarrier({
			points: flat([0, 0], [3, 0], [0.2, 0.3]),
			closed: false,
			baseMode: 'flat',
			style: style('deck-railing')
		});
		expect(sharp.joints).toHaveLength(1);
		expect(sharp.joints[0].polygon.length).toBeGreaterThanOrEqual(3);
	});
});

describe('closed loops', () => {
	it('has one post per corner and no duplicate start/end post', () => {
		const points = flat([0, 0], [4, 0], [4, 3], [0, 3]);
		const layout = layoutBarrier({
			points,
			closed: true,
			baseMode: 'flat',
			style: style('garden-fence')
		});
		const vertexPosts = layout.posts.filter((p) => p.vertexIndex >= 0);
		expect(vertexPosts).toHaveLength(4);
		expect(vertexPosts.every((p) => p.role === 'corner-post')).toBe(true);
		for (const [x, z] of [
			[0, 0],
			[4, 0],
			[4, 3],
			[0, 3]
		] as const)
			expect(postsAt(layout, x, z)).toHaveLength(1);
		expect(layout.segments).toHaveLength(4);
	});
});

describe('slopes', () => {
	const slope = 0.2;
	const ground = (x: number) => 1 + x * slope;

	it('follow-surface: vertical posts on the ground, rail between post tops, balusters to the rail', () => {
		const s = style('simple-wood-fence', (x) => (x.bottomRail.enabled = false));
		const layout = layoutBarrier({
			points: [
				{ x: 0, y: ground(0), z: 0 },
				{ x: 8, y: ground(8), z: 0 }
			],
			closed: false,
			baseMode: 'follow-surface',
			style: s,
			sampleBase: (x) => ground(x)
		});
		for (const post of layout.posts) {
			// Sunk slightly so no post floats on the slope, top at ground + height (+ the post above rail).
			expect(post.baseY).toBeLessThan(ground(post.x));
			expect(post.baseY).toBeGreaterThan(ground(post.x) - 0.2);
			expect(post.topY).toBeCloseTo(ground(post.x) + s.height + s.endPost.extendAbove, 9);
		}
		for (const rail of layout.rails.filter((r) => r.role === 'top-rail')) {
			expect(rail.slope).toBeCloseTo(slope, 9);
			expect(rail.yA).toBeCloseTo(ground(rail.ax) + s.height, 9);
		}
		const lengths = new Set<string>();
		for (const b of layout.balusters) {
			expect(b.baseY).toBeCloseTo(ground(b.x) + s.baluster.clearance - 0.03, 9);
			expect(b.topY).toBeCloseTo(ground(b.x) + s.height - s.topRail.height + 0.006, 9);
			lengths.add((b.topY - b.baseY).toFixed(4));
		}
		expect(layout.balusters.length).toBeGreaterThan(20);
	});

	it('follow-surface: balusters over a dip stand on the real ground', () => {
		const s = style('simple-wood-fence', (x) => (x.bottomRail.enabled = false));
		const dip = (x: number) => (x > 0.8 && x < 1.2 ? -0.3 : 0);
		const layout = layoutBarrier({
			points: flat([0, 0], [2, 0]),
			closed: false,
			baseMode: 'follow-surface',
			style: s,
			sampleBase: (x) => dip(x)
		});
		const inDip = layout.balusters.filter((b) => b.x > 0.8 && b.x < 1.2);
		expect(inDip.length).toBeGreaterThan(0);
		for (const b of inDip) expect(b.baseY).toBeLessThan(0);
		// Different heights over uneven ground.
		expect(
			new Set(layout.balusters.map((b) => (b.topY - b.baseY).toFixed(3))).size
		).toBeGreaterThan(1);
	});

	it('linear-slope (stairs): rail runs straight between the end points, posts stay vertical', () => {
		const s = style('classic-interior');
		const layout = layoutBarrier({
			points: [
				{ x: 0, y: 0, z: 0 },
				{ x: 4, y: 3, z: 0 }
			],
			closed: false,
			baseMode: 'linear-slope',
			style: s
		});
		const [a, b] = layout.posts.filter((p) => p.vertexIndex >= 0);
		expect(a.baseY).toBeCloseTo(0, 9);
		expect(b.baseY).toBeCloseTo(3, 9);
		for (const rail of layout.rails.filter((r) => r.role === 'top-rail'))
			expect(rail.slope).toBeCloseTo(0.75, 9);
		for (const baluster of layout.balusters) {
			const line = (baluster.x / 4) * 3;
			expect(baluster.baseY).toBeCloseTo(line + s.bottomRail.height - 0.006, 9);
			expect(baluster.topY).toBeCloseTo(line + s.height - s.topRail.height + 0.006, 9);
		}
	});
});

describe('upper floors', () => {
	it('keeps a railing drawn at baseY 6 at that elevation', () => {
		const s = style('classic-interior');
		const points = [
			{ x: 0, y: 6, z: 0 },
			{ x: 3, y: 6, z: 0 },
			{ x: 3, y: 6, z: 3 }
		];
		const layout = layoutBarrier({ points, closed: false, baseMode: 'flat', style: s });
		for (const post of layout.posts) expect(post.baseY).toBeCloseTo(6, 9);
		for (const rail of layout.rails.filter((r) => r.role === 'top-rail'))
			expect(rail.yA).toBeCloseTo(6 + s.height, 9);
		for (const b of layout.balusters) expect(b.baseY).toBeGreaterThan(6);
		for (const segment of layout.segments) expect(segment.minY).toBeGreaterThanOrEqual(6 - 1e-9);
	});
});
