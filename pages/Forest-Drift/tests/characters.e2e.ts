import { expect, test } from '@playwright/test';
import { writeFileSync } from 'node:fs';

// An isolated render benchmark, not a substitute for whole-world performance measurements.
if (process.platform === 'darwin')
	test.use({ launchOptions: { args: ['--use-angle=metal', '--enable-gpu'] } });

test('real character renders, animates, and scales to a room of independent rigs', async ({
	page
}, info) => {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.goto('/characters');
	await expect(page.getByTestId('character-status')).toHaveText('Ready');
	await page.locator('select').nth(0).selectOption('walk');
	await page.locator('select').nth(1).selectOption('19');
	await expect
		.poll(() =>
			page.evaluate(
				() => (window as unknown as { __characterLab: { count: number } }).__characterLab.count
			)
		)
		.toBe(19);
	// Gather an actual render sample after cloning and shader warmup.
	await page.waitForTimeout(3000);
	const result = await page.evaluate(() => {
		const lab = (
			window as unknown as {
				__characterLab: {
					count: number;
					cpuSamples: number[];
					drawCalls: number;
					triangles: number;
					characters: { object: import('three').Object3D }[];
				};
			}
		).__characterLab;
		const samples = lab.cpuSamples.slice(-120).sort((a, b) => a - b);
		return {
			count: lab.count,
			cpuP95: samples[Math.floor(samples.length * 0.95)],
			drawCalls: lab.drawCalls,
			triangles: lab.triangles,
			states: lab.characters.map((c) => c.object.userData.animation),
			colours: lab.characters.map((c) => {
				let colour = '';
				c.object.traverse((object) => {
					const material = (object as import('three').Mesh)
						.material as import('three').MeshStandardMaterial;
					if (material?.name === 'Clothing') colour = material.color.getHexString();
				});
				return colour;
			})
		};
	});
	expect(result.count).toBe(19);
	expect(new Set(result.colours).size).toBe(19);
	expect(result.colours.every(Boolean)).toBe(true);
	expect(result.drawCalls).toBe(39); // Two primitives/character plus grid.
	expect(result.triangles).toBe(19 * 5848);
	expect(result.states.every((s) => s === 'moving')).toBe(true);
	writeFileSync(info.outputPath('character-benchmark.json'), JSON.stringify(result, null, 2));
	await info.attach('character-benchmark', {
		body: JSON.stringify(result, null, 2),
		contentType: 'application/json'
	});
	await page.locator('select').nth(1).selectOption('1');
	await expect
		.poll(() =>
			page.evaluate(
				() => (window as unknown as { __characterLab: { count: number } }).__characterLab.count
			)
		)
		.toBe(1);
	await page.locator('select').nth(0).selectOption('idle');
	await page.screenshot({ path: info.outputPath('character.png') });
	expect(errors).toEqual([]);
});
