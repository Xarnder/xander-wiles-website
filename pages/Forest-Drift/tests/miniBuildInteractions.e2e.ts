import { test, expect } from '@playwright/test';
import { createAndEnterWorld, waitForSaved, openWorldNamed } from './worldHelpers';
import type { FirstPersonController } from '../src/lib/game/player/FirstPersonController';
import type { Scene } from 'three';
import type { ThreeScene } from '../src/lib/game/ThreeScene';
type GameWindow = Window & {
	__forestSession: {
		scene: Omit<ThreeScene, 'controller' | 'scene'> & {
			controller: FirstPersonController;
			scene: Scene;
		};
	};
};
test('authors and persists Sit/Lie locations and uses real runtime poses', async ({
	page
}, info) => {
	test.setTimeout(180_000);
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.goto('/');
	await createAndEnterWorld(page, { name: 'Interaction workshop', seed: 'mini-build-seed' });
	await page.keyboard.press('8');
	await page.keyboard.press('e');
	await page.getByTestId('mini-build-create-new').click();
	await page.getByTestId('mini-build-add').click();
	const set = async (id: string, value: string) => {
		const input = page.getByTestId(id);
		await input.fill(value);
		await input.press('Enter');
	};
	await set('mini-build-size-x', '1');
	await set('mini-build-size-z', '2');
	await page.getByTestId('mini-build-add-sit').click();
	await set('mini-build-interaction-y', '0.5');
	await page.getByTestId('mini-build-add-lie').click();
	await set('mini-build-interaction-y', '0.5');
	await set('mini-build-interaction-z', '1');
	await expect(page.getByTestId('mini-build-block-count')).toHaveText('1 / 16');
	await page.screenshot({ path: info.outputPath('interaction-editor.png') });
	await page.getByTestId('mini-build-save').click();
	await page.getByTestId('mini-build-name-input').fill('Rest platform');
	await page.getByTestId('mini-build-name-confirm').click();
	await expect(page.getByTestId('mini-build-editor')).toBeHidden();
	const placed = await page.evaluate(() => {
		const scene = (window as unknown as GameWindow).__forestSession.scene;
		const design = scene.miniBuilds.library.list().find((d) => d.name === 'Rest platform')!;
		const y = scene.controller.worldPosition.y - 1.7;
		const result = scene.miniBuilds.placeInstance(design.id, { x: 0, y, z: -2 }, 0);
		if (!result.ok) throw new Error(result.error);
		return { id: result.value.id, designId: design.id, anchors: design.interactionLocations };
	});
	expect(placed.anchors).toHaveLength(2);
	await page.keyboard.press('g');
	// Use the production touch-input activation: headless Chromium cannot acquire OS pointer lock.
	await page.evaluate(() =>
		(window as unknown as GameWindow).__forestSession.scene.setTouchActive(true)
	);
	const aim = async (type: 'sit' | 'lie') =>
		page.evaluate(
			({ id, type }) => {
				const scene = (window as unknown as GameWindow).__forestSession.scene;
				const instance = scene.miniBuilds.instances.get(id)!;
				const design = scene.miniBuilds.getDesign(instance.designId)!;
				const location = design.interactionLocations!.find((l) => l.type === type)!;
				const resolved = scene.miniBuildInteraction.resolve(id, location.id)!;
				const p = resolved.position;
				scene.controller.restoreState(
					{ x: p.x, y: instance.position.y + 1.7, z: p.z + 2 },
					0,
					Math.atan2(p.y - (instance.position.y + 1.7), 2)
				);
			},
			{ id: placed.id, type }
		);
	await aim('sit');

	await expect(page.getByTestId('mini-build-interaction-prompt')).toContainText('Sit');
	await page.keyboard.press('k');
	await expect
		.poll(() =>
			page.evaluate(
				() =>
					(window as unknown as GameWindow).__forestSession.scene.controller.interactionPose?.action
			)
		)
		.toBe('sit');
	await page.keyboard.press('v');
	await expect
		.poll(
			() =>
				page.evaluate(
					() =>
						!!(window as unknown as GameWindow).__forestSession.scene.scene.getObjectByName(
							'local-interaction-avatar'
						)
				),
			{ timeout: 15000 }
		)
		.toBe(true);
	await expect
		.poll(() =>
			page.evaluate(
				() => (window as unknown as GameWindow).__forestSession.scene.controller.interactionBlend
			)
		)
		.toBe(1);
	await page.screenshot({ path: info.outputPath('sitting-third-person.png') });
	await page.keyboard.press('k');
	await expect
		.poll(() =>
			page.evaluate(
				() => (window as unknown as GameWindow).__forestSession.scene.controller.interactionPose
			)
		)
		.toBeNull();
	await aim('lie');
	await expect(page.getByTestId('mini-build-interaction-prompt')).toContainText('Lie Down');
	await page.keyboard.press('k');
	await expect
		.poll(() =>
			page.evaluate(
				() =>
					(window as unknown as GameWindow).__forestSession.scene.controller.interactionPose?.action
			)
		)
		.toBe('lie');
	await page.keyboard.press('v');
	await expect
		.poll(() =>
			page.evaluate(
				() => (window as unknown as GameWindow).__forestSession.scene.controller.interactionBlend
			)
		)
		.toBe(1);
	await page.screenshot({ path: info.outputPath('lying-third-person.png') });
	await page.keyboard.press('w');
	await expect
		.poll(() =>
			page.evaluate(
				() => (window as unknown as GameWindow).__forestSession.scene.controller.interactionPose
			)
		)
		.toBeNull();
	await waitForSaved(page);
	await page.reload();
	if (await page.getByTestId('landing-menu').isVisible())
		await page.getByRole('button', { name: 'Worlds', exact: true }).click();
	await openWorldNamed(page, 'Interaction workshop');
	const restored = await page.evaluate(
		(id) =>
			(window as unknown as GameWindow).__forestSession.scene.miniBuilds.getDesign(id)
				?.interactionLocations,
		placed.designId
	);
	expect(restored).toEqual(placed.anchors);
	expect(errors).toEqual([]);
});
