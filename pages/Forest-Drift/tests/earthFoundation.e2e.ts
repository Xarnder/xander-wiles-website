import { expect, test, type Page } from '@playwright/test';
import { createAndEnterWorld, openWorldNamed, waitForSaved } from './worldHelpers';
import type { ThreeScene } from '../src/lib/game/ThreeScene';
import type { FoundationManager } from '../src/lib/game/building/FoundationManager';
import type { TerrainSettings } from '../src/lib/game/terrain/TerrainSettings';
import type { TerrainManager } from '../src/lib/game/terrain/TerrainManager';

type Scene = Omit<ThreeScene, 'controller' | 'terrainManager' | 'foundationTool'> & {
	controller: {
		worldPosition: { x: number; y: number; z: number };
		restoreState(p: { x: number; y: number; z: number }, yaw: number, pitch: number): void;
	};
	terrainManager: TerrainManager;
	foundationManager: FoundationManager;
	settings: TerrainSettings;
	foundationTool: { currentHoverPoint: { gridX: number; gridZ: number } | null };
};
type GameWindow = Window & { __forestSession: { scene: Scene } };
async function aim(page: Page, x: number, z: number) {
	const target = await page.evaluate(
		({ x, z }) => {
			const s = (window as unknown as GameWindow).__forestSession.scene;
			const spacing = s.settings.chunkSize / s.settings.chunkResolution;
			s.controller.restoreState(
				{ x, y: s.terrainManager.sampleHeight(x, z) + 8, z },
				0,
				-Math.PI / 2
			);
			return { gridX: Math.round(x / spacing), gridZ: Math.round(z / spacing) };
		},
		{ x, z }
	);
	await expect
		.poll(() =>
			page.evaluate(() => {
				const h = (window as unknown as GameWindow).__forestSession.scene.foundationTool
					.currentHoverPoint;
				return h ? { gridX: h.gridX, gridZ: h.gridZ } : null;
			})
		)
		.toEqual(target);
}

test('E selects earth; placement reshapes ground, remains buildable, and survives reload', async ({
	page
}) => {
	test.setTimeout(120_000);
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await page.goto('/');
	await createAndEnterWorld(page, { name: 'Earth foundation world', seed: 'earth-pad' });
	await page.keyboard.press('1');
	await page.keyboard.press('e');
	await expect(page.getByTestId('foundation-customize-modal')).toBeVisible();
	await expect(page.getByTestId('foundation-style-stone')).toHaveAttribute('aria-pressed', 'true');
	await page.getByTestId('foundation-style-earth').click();
	await page.screenshot({ path: test.info().outputPath('earth-style-menu.png') });
	await page.getByTestId('foundation-style-done').click();
	const origin = await page.evaluate(() => {
		const s = (window as unknown as GameWindow).__forestSession.scene;
		const spacing = s.settings.chunkSize / s.settings.chunkResolution;
		return {
			x: Math.round(s.controller.worldPosition.x / spacing) * spacing + 4 * spacing,
			z: Math.round(s.controller.worldPosition.z / spacing) * spacing,
			spacing
		};
	});
	await aim(page, origin.x, origin.z);
	await page.evaluate(() =>
		(window as unknown as GameWindow).__forestSession.scene.triggerPrimaryAction()
	);
	await aim(page, origin.x + 4 * origin.spacing, origin.z + 4 * origin.spacing);
	await page.evaluate(() =>
		(window as unknown as GameWindow).__forestSession.scene.triggerPrimaryAction()
	);
	await expect
		.poll(() =>
			page.evaluate(
				() =>
					(window as unknown as GameWindow).__forestSession.scene.foundationManager.getFoundations()
						.length
			)
		)
		.toBe(1);
	const check = () =>
		page.evaluate(() => {
			const s = (window as unknown as GameWindow).__forestSession.scene;
			const f = s.foundationManager.getFoundations()[0],
				spacing = s.settings.chunkSize / s.settings.chunkResolution;
			const x = ((f.minGridX + f.maxGridX) * spacing) / 2,
				z = ((f.minGridZ + f.maxGridZ) * spacing) / 2;
			return {
				style: f.style,
				top: f.topY,
				height: s.terrainManager.sampleHeight(x, z),
				support: s.foundationManager.getTopYAt(x, z),
				blend: f.blendWidth
			};
		});
	const meshHeights = await page.evaluate(() => {
		const s = (window as unknown as GameWindow).__forestSession.scene,
			f = s.foundationManager.getFoundations()[0];
		const spacing = s.settings.chunkSize / s.settings.chunkResolution;
		const heights: number[] = [];
		for (const mesh of s.terrainManager.getActiveMeshes()) {
			const p = mesh.geometry.getAttribute('position');
			for (let i = 0; i < p.count; i++)
				if (
					p.getX(i) >= f.minGridX * spacing &&
					p.getX(i) <= f.maxGridX * spacing &&
					p.getZ(i) >= f.minGridZ * spacing &&
					p.getZ(i) <= f.maxGridZ * spacing
				)
					heights.push(p.getY(i));
		}
		return { heights, top: f.topY };
	});
	expect(meshHeights.heights.length).toBeGreaterThan(0);
	for (const height of meshHeights.heights) expect(height).toBeCloseTo(meshHeights.top, 4);
	const before = await check();
	expect(before.style).toBe('earth');
	expect(before.height).toBe(before.top);
	expect(before.support).toBe(before.top);
	await page.evaluate(() => {
		const s = (window as unknown as GameWindow).__forestSession.scene;
		const f = s.foundationManager.getFoundations()[0],
			sp = s.settings.chunkSize / s.settings.chunkResolution;
		s.controller.restoreState(
			{ x: f.maxGridX * sp + 10, y: f.topY + 9, z: f.maxGridZ * sp + 10 },
			Math.PI / 4,
			-0.5
		);
	});
	await page.evaluate(() =>
		(window as unknown as GameWindow).__forestSession.scene.setTouchActive(true)
	);
	await waitForSaved(page);
	await page.screenshot({ path: test.info().outputPath('earth-foundation.png') });
	await waitForSaved(page);
	await page.reload();
	await openWorldNamed(page, 'Earth foundation world');
	expect(await check()).toEqual(before);
	expect(errors).toEqual([]);
});
