import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { createAndEnterWorld, openCreatureLab, openWorldNamed } from './worldHelpers';
import type { CreatureLab } from '../src/lib/game/creatures/CreatureLab';
import type { ThreeScene } from '../src/lib/game/ThreeScene';
declare global {
	interface Window {
		forestScene: ThreeScene;
		creatureLab: CreatureLab;
	}
}

test('Creature Lab four grammars, hundred-seed validation, placement and persistent reload', async ({
	page
}) => {
	test.setTimeout(180000);
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await page.goto('/?musicTest');
	await createAndEnterWorld(page, { name: 'Creature recipe test' });
	await openCreatureLab(page);
	await expect(page.getByTestId('creature-viewport').locator('canvas')).toBeVisible();
	for (const plan of ['quadruped', 'biped', 'hexapod', 'serpentine']) {
		await page.getByTestId('creature-plan').selectOption(plan);
		await page.evaluate(async () => {
			window.creatureLab.view('side');
			await new Promise(requestAnimationFrame);
			await new Promise(requestAnimationFrame);
		});
		await expect(page.getByTestId('creature-stats')).toContainText('vertices');
		await page.screenshot({ path: `test-results/creature-${plan}.png` });
		const state = await page.evaluate(() => {
			const c = window.creatureLab.creature!;
			return {
				plan: c.compilation.definition.species.bodyPlan.id,
				vertices: c.compilation.geometry.positions.length,
				limbs: c.compilation.skeleton.limbs.length
			};
		});
		expect(state.plan).toBe(plan);
		expect(state.vertices).toBeGreaterThan(300);
	}
	await page.getByTestId('creature-plan').selectOption('quadruped');
	await page.getByRole('button', { name: 'GENERATE 100', exact: true }).click();
	await expect(page.getByTestId('creature-sample-report')).toContainText('"successes": 100', {
		timeout: 30000
	});
	await expect(page.getByTestId('creature-sample-report')).toContainText('"failures": 0');
	await page.getByTestId('species-seed').fill('42');
	await page.getByRole('button', { name: 'Regenerate Species', exact: true }).click();
	const definition = await page.evaluate(() => window.creatureLab.definition!);
	await page.getByRole('button', { name: 'Place in world', exact: true }).click();
	await expect(page.getByTestId('creature-lab')).toBeHidden();
	expect(
		await page.evaluate(() => window.forestScene.getCreatureState().individuals[0].species)
	).toEqual(definition.species);
	await page.keyboard.press('ControlOrMeta+s');
	await expect(page.getByTestId('save-indicator')).toHaveAttribute('data-status', 'saved', {
		timeout: 15000
	});
	await page.reload();
	await openWorldNamed(page, 'Creature recipe test');
	expect(
		await page.evaluate(() => window.forestScene.getCreatureState().individuals[0].species)
	).toEqual(definition.species);
	expect(errors).toEqual([]);
});

test('Creature Lab 10/25/50/100 stress measurements', async ({ page }, info) => {
	test.setTimeout(300000);
	await page.goto('/?musicTest');
	await createAndEnterWorld(page, { name: 'Fauna benchmark' });
	await openCreatureLab(page);
	await expect(page.getByTestId('creature-viewport').locator('canvas')).toBeVisible();
	const results = [];
	for (const count of [10, 25, 50, 100]) {
		const result = await page.evaluate((count) => window.creatureLab.benchmark(count), count);
		expect(result.triangles).toBeLessThan(count * 8000);
		expect(result.fps).toBeGreaterThan(0);
		results.push(result);
	}
	await writeFile(info.outputPath('creature-performance.json'), JSON.stringify(results, null, 2));
});

test('World ecology streams bounded resources, regenerates identity and follows quality budgets', async ({
	page
}) => {
	test.setTimeout(150000);
	await page.goto('/?musicTest');
	await createAndEnterWorld(page, { name: 'Fauna streaming' });
	const original = await page.evaluate(() => {
		const c = window.forestScene.creatures;
		return [...c.logical.values()].map((r) => r.spawn.id).sort();
	});
	expect(original.length).toBeGreaterThan(0);
	const result = await page.evaluate(async () => {
		const scene = window.forestScene;
		const c = scene.creatures;
		const player = scene.getPlayerState();
		const access = scene as unknown as {
			controller: {
				restoreState: (p: { x: number; y: number; z: number }, yaw: number, pitch: number) => void;
			};
		};
		access.controller.restoreState({ x: 3000, y: 0, z: 3000 }, 0, 0);
		await new Promise((r) => setTimeout(r, 2000));
		const away = [...c.logical.values()].map((r) => r.spawn.id);
		access.controller.restoreState(player.position, player.yaw, player.pitch);
		await new Promise((r) => setTimeout(r, 2000));
		return {
			away,
			returned: [...c.logical.values()].map((r) => r.spawn.id).sort(),
			live: c.live.size,
			max: c.state.settings.maxActiveCreatures
		};
	});
	expect(result.returned).toEqual(original);
	expect(result.away.some((id) => original.includes(id))).toBe(false);
	expect(result.live).toBeLessThanOrEqual(result.max);
	for (let i = 0; i < 4; i++) {
		const state = await page.evaluate(() => {
			const s = window.forestScene;
			s.cycleGraphicsQuality();
			s.creatures.update(s.getPlayerState().position, 1, s.getGraphicsQuality());
			return { quality: s.getGraphicsQuality(), live: s.creatures.live.size };
		});
		expect(state.live).toBeLessThanOrEqual(state.quality === 'low' ? 16 : 50);
	}
});
