import { expect, test, type Page } from '@playwright/test';
import { BIOME_IDS } from '../src/lib/game/biomes/BiomeTypes';
import { createAndEnterWorld, openWorldsScreen } from './worldHelpers';

/**
 * Biome-specific creatures Phase 1 (docs/2026/11-12/Biomes-Specfic-Creatures): herds wear the biome
 * at their group centre, biomes off means neutral coats, `?creatureCoats=off` the classic colours,
 * and the Main World ships with biomes on.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyScene = any;
type TestWindow = Window & { __forestSession: { scene: AnyScene } };

/** Each ambient herd's coat profile next to the biome at its group centre (null: biomes off). */
async function herdCoats(page: Page) {
	return page.evaluate(
		(ids) => {
			const s = (window as unknown as TestWindow).__forestSession.scene;
			const out: { coat: string | null; expected: string | null }[] = [];
			for (const record of s.creatures.logical.values()) {
				const spawn = record.spawn;
				if (spawn.persistent) continue;
				const c = spawn.groupCentre;
				out.push({
					coat: spawn.species.appearance.coat?.profile ?? null,
					expected: s.biomeField.isEnabled() ? ids[s.biomeField.dominantAt(c.x, c.z)] : 'neutral'
				});
			}
			return out;
		},
		BIOME_IDS as readonly string[]
	);
}

async function waitForHerds(page: Page) {
	await expect
		.poll(async () => (await herdCoats(page)).length, { timeout: 60_000 })
		.toBeGreaterThan(0);
}

test('herds wear the biome at their group centre, and neutral coats with biomes off', async ({
	page
}) => {
	test.setTimeout(180_000);
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.goto('/');
	await createAndEnterWorld(page, { name: 'Creature Biomes', seed: 'creature-biomes-e2e' });
	await waitForHerds(page);
	const coats = await herdCoats(page);
	expect(coats.every((c) => c.coat !== null && c.coat === c.expected)).toBe(true);

	await page.evaluate(() =>
		(window as unknown as TestWindow).__forestSession.scene.setBiomesEnabled(false)
	);
	await waitForHerds(page);
	expect((await herdCoats(page)).every((c) => c.coat === 'neutral')).toBe(true);
	expect(errors).toEqual([]);
});

test('?creatureCoats=off keeps the classic colours', async ({ page }) => {
	test.setTimeout(120_000);
	await page.goto('/?creatureCoats=off');
	await createAndEnterWorld(page, { name: 'Classic Creatures', seed: 'creature-biomes-e2e' });
	await waitForHerds(page);
	expect((await herdCoats(page)).every((c) => c.coat === null)).toBe(true);
});

test('the Main World opens with biomes on', async ({ page }) => {
	test.setTimeout(120_000);
	await page.goto('/');
	await openWorldsScreen(page);
	await page.getByTestId('play-default-world').click();
	await expect(page.getByTestId('save-indicator')).toBeVisible({ timeout: 30_000 });
	expect(
		await page.evaluate(() =>
			(window as unknown as TestWindow).__forestSession.scene.isBiomesEnabled()
		)
	).toBe(true);
	await waitForHerds(page);
	expect((await herdCoats(page)).every((c) => c.coat !== null && c.coat === c.expected)).toBe(true);
});
