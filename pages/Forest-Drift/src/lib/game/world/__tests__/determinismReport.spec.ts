import { describe, expect, it } from 'vitest';
import golden from './determinism-golden.json';
import { computeDeterminismReport, DETERMINISM_SEEDS } from '../determinismReport';

/**
 * Multiplayer depends on every player generating the same world from the same seed. This pins what
 * the generators produce: if it fails after an intentional generator change, regenerate the golden
 * file and bump GENERATOR_VERSION so mixed-version players are refused rather than desynchronised.
 * The Playwright test `tests/determinism.e2e.ts` checks the same golden in Chromium, WebKit and Firefox.
 */
describe('world generation determinism', () => {
	it.each(DETERMINISM_SEEDS)('matches the golden fingerprint for "%s"', (seed) => {
		const expected = golden.reports.find((report) => report.seed === seed);
		expect(expected).toBeDefined();
		expect(computeDeterminismReport(seed)).toEqual(expected);
	});

	it('is stable when computed twice in one run', () => {
		expect(computeDeterminismReport('repeat-check')).toEqual(
			computeDeterminismReport('repeat-check')
		);
	});
});
