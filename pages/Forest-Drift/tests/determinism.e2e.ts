import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type {
	DeterminismReport,
	DeterminismSection
} from '../src/lib/game/world/determinismReport';

/**
 * Multiplayer requirement (plan §8.7, decision Q29-B): every browser engine must generate the same
 * world from the same seed. Runs in the chromium, webkit and firefox projects and compares the
 * in-browser fingerprints with the golden report Vitest pins in Node.
 *
 * Only what players see is compared: heights to the millimetre, water type and level, lake and river
 * counts, and every tree's cell, species and variant. The `exact` (full float64 bit pattern) hashes
 * differ between Node and every browser, and between browsers, because `Math.tanh`/`Math.pow` and
 * friends aren't required to round identically. That last-bit noise never changes the world, so it's
 * attached to the test report rather than asserted.
 */
const golden = JSON.parse(
	readFileSync(
		new URL('../src/lib/game/world/__tests__/determinism-golden.json', import.meta.url),
		'utf8'
	)
) as { reports: DeterminismReport[] };

function visible(reports: DeterminismReport[]) {
	const section = ({ coarse, count }: DeterminismSection) => ({ coarse, count });
	return reports.map((report) => ({
		seed: report.seed,
		terrain: section(report.terrain),
		hydrology: {
			...section(report.hydrology),
			lakes: report.hydrology.lakes,
			rivers: report.hydrology.rivers
		},
		trees: section(report.trees)
	}));
}

test('generated world matches the golden fingerprints in this browser engine', async ({
	page
}, info) => {
	await page.goto('/determinism/?dev');
	const report = page.getByTestId('determinism-report');
	await expect(report).toBeVisible({ timeout: 30_000 });
	const reports = JSON.parse((await report.textContent()) ?? '[]') as DeterminismReport[];

	const exactDifferences = reports.flatMap((browserReport, i) =>
		(['terrain', 'hydrology', 'trees'] as const)
			.filter((key) => browserReport[key].exact !== golden.reports[i]?.[key].exact)
			.map((key) => `${browserReport.seed} ${key}`)
	);
	await info.attach('exact-hash-differences', {
		body: exactDifferences.length ? exactDifferences.join('\n') : 'none',
		contentType: 'text/plain'
	});

	expect(visible(reports)).toEqual(visible(golden.reports));
});
