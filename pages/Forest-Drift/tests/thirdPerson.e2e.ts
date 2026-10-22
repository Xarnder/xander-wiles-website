import { test, expect } from '@playwright/test';
import { createAndEnterWorld } from './worldHelpers';
import type { ThreeScene } from '../src/lib/game/ThreeScene';
import type { FirstPersonController } from '../src/lib/game/player/FirstPersonController';
import type { PerspectiveCamera, Scene } from 'three';
type GameWindow = Window & {
	__forestSession: {
		scene: Omit<ThreeScene, 'controller' | 'camera' | 'scene'> & {
			controller: FirstPersonController;
			camera: PerspectiveCamera;
			scene: Scene;
		};
	};
};
test('third-person shows the local player, retracts at walls, and restores first-person', async ({
	page
}, info) => {
	test.setTimeout(120000);
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.goto('/');
	await createAndEnterWorld(page, { name: 'Camera test', seed: 'mini-build-seed' });
	await page.evaluate(() => {
		const s = (window as unknown as GameWindow).__forestSession.scene;
		s.setTouchActive(true);
		// Isolate camera behaviour from the spawn building; test uses real world controller/rendering.
		s.controller.setFlying(true);
		const p = s.controller.worldPosition;
		s.controller.restoreState({ x: p.x, y: p.y + 15, z: p.z }, 0, 0);
	});
	await page.keyboard.press('F5');
	await expect
		.poll(() =>
			page.evaluate(() => {
				const s = (window as unknown as GameWindow).__forestSession.scene;
				return s.controller.thirdPerson && s.controller.thirdPersonDistance > 3;
			})
		)
		.toBe(true);
	await expect
		.poll(() =>
			page.evaluate(() => {
				const s = (window as unknown as GameWindow).__forestSession.scene;
				return !!s.scene.getObjectByName('local-interaction-avatar')?.visible;
			})
		)
		.toBe(true);
	await page.screenshot({ path: info.outputPath('third-person.png') });
	const result = await page.evaluate(() => {
		const s = (window as unknown as GameWindow).__forestSession.scene;
		const p = s.controller.worldPosition;
		// Inject the same collision contract used by walls, doors and furniture.
		const controller = s.controller as unknown as {
			getCameraObstacles: () => import('../src/lib/game/player/ThirdPersonCamera').CameraObstacles;
		};
		const original = controller.getCameraObstacles;
		controller.getCameraObstacles = () => ({
			...original(),
			walls: [
				{
					centerX: p.x,
					centerZ: p.z + 1,
					halfLength: 3,
					halfThickness: 0.025,
					dirX: 1,
					dirZ: 0,
					minWorldY: p.y - 2,
					maxWorldY: p.y + 3
				}
			]
		});
		s.controller.update(1 / 60);
		const distance = s.camera.position.z - p.z;
		const rotation = s.camera.rotation.toArray();
		controller.getCameraObstacles = original;
		return { distance, rotation };
	});
	expect(result.distance).toBeLessThan(0.8);
	expect(result.rotation.slice(0, 3)).toEqual([0, 0, 0]);
	await page.keyboard.press('F5');
	await expect
		.poll(() =>
			page.evaluate(
				() => (window as unknown as GameWindow).__forestSession.scene.controller.thirdPerson
			)
		)
		.toBe(false);
	// Reproduce A-key movement down a gentle slope through the real controller and avatar.
	await page.evaluate(() => {
		const s = (window as unknown as GameWindow).__forestSession.scene;
		const c = s.controller as unknown as {
			getSupportingSurfaceY: (x: number, z: number) => number;
		};
		c.getSupportingSurfaceY = (x) => 40 + x * 0.15;
		s.controller.setFlying(false);
		s.controller.spawn(0, 0);
		s.controller.thirdPerson = true;
	});
	await page.keyboard.down('a');
	const gait = await page.evaluate(async () => {
		const s = (window as unknown as GameWindow).__forestSession.scene;
		const heights: number[] = [];
		let grounded = 0,
			moving = 0;
		for (let i = 0; i < 90; i++) {
			await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
			const avatar = s.scene.getObjectByName('local-interaction-avatar');
			const model = avatar?.getObjectByName('character-model');
			const foot = model?.getObjectByName('mixamorigLeftFoot');
			if (i < 15 || !foot) continue;
			if (s.controller.isGrounded()) grounded++;
			if (model?.userData.animation === 'moving') moving++;
			const position = s.controller.worldPosition.clone();
			foot.getWorldPosition(position);
			heights.push(position.y - (s.controller.worldPosition.y - s.controller.eyeHeight));
		}
		return { grounded, moving, swing: Math.max(...heights) - Math.min(...heights) };
	});
	await page.keyboard.up('a');
	expect(gait.grounded).toBe(75);
	expect(gait.moving).toBe(75);
	expect(gait.swing).toBeGreaterThan(0.06);
	expect(errors).toEqual([]);
});
