import { describe, expect, it } from 'vitest';
import { ResolutionBudget } from '../ResolutionBudget';
describe('60 fps resolution budget', () => {
	it('responds to the measured 58.5 fps crowd dip instead of tolerating it until 54 fps', () => {
		const budget = new ResolutionBudget();
		expect(budget.nextScale(58.5, 60, 1, 0.7)).toBe(1);
		expect(budget.nextScale(58.5, 60, 1, 0.7)).toBeCloseTo(0.92);
	});
	it('ignores isolated mild stalls but responds immediately to severe pressure', () => {
		const budget = new ResolutionBudget();
		for (let i = 0; i < 10; i++) {
			expect(budget.nextScale(58, 60, 1, 0.7)).toBe(1);
			expect(budget.nextScale(60, 60, 1, 0.7)).toBe(1);
		}
		expect(budget.nextScale(40, 60, 1, 0.7)).toBeCloseTo(0.92);
	});
	it('keeps a stable 60 fps scene at native resolution', () => {
		const budget = new ResolutionBudget();
		for (let i = 0; i < 20; i++) expect(budget.nextScale(59.9, 60, 1, 0.7)).toBe(1);
	});
	it('requires sustained headroom to recover and resets recovery after another dip', () => {
		const budget = new ResolutionBudget();
		for (let i = 0; i < 4; i++) expect(budget.nextScale(60, 60, 0.8, 0.7)).toBe(0.8);
		expect(budget.nextScale(58, 60, 0.8, 0.7)).toBe(0.8);
		expect(budget.nextScale(58, 60, 0.8, 0.7)).toBeCloseTo(0.72);
		for (let i = 0; i < 4; i++) expect(budget.nextScale(60, 60, 0.72, 0.7)).toBe(0.72);
		expect(budget.nextScale(60, 60, 0.72, 0.7)).toBeCloseTo(0.8);
	});
	it('respects the quality floor and discards recovery history on preset changes', () => {
		const budget = new ResolutionBudget();
		expect(budget.nextScale(30, 60, 0.72, 0.7)).toBe(0.7);
		for (let i = 0; i < 4; i++) budget.nextScale(60, 60, 0.8, 0.7);
		budget.reset();
		expect(budget.nextScale(60, 60, 0.8, 0.7)).toBe(0.8);
	});
});
