import { describe, expect, it } from 'vitest';
import { runBasementBench } from '../basementBench';

describe('basement and join budgets (plan §9), in Node', () => {
	it('stays inside the Phase 0 budgets', () => {
		const report = runBasementBench({ rounds: 9, calls: 10_000 });
		// 20 footprints of 5 × 4 cells, all inside one chunk.
		expect(report.terrain.cutCells).toBe(400);
		expect(report.terrain.cutMs).toBeLessThan(0.5);
		expect(report.terrain.populateHoledMs - report.terrain.populateMs).toBeLessThan(0.5);
		expect(report.walking.extraUs).toBeLessThan(2);
		expect(report.joins.buildings).toBe(25);
		expect(report.joins.buildingsMs).toBeLessThan(2);
		expect(report.joins.polygonInsideUs).toBeLessThan(100);
	});
});
