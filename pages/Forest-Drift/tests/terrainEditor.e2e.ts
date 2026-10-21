import { expect, test } from '@playwright/test';
import { createAndEnterWorld, openWorldNamed, waitForSaved } from './worldHelpers';
import type { ThreeScene } from '../src/lib/game/ThreeScene';
import type { FoundationManager } from '../src/lib/game/building/FoundationManager';
import type { TerrainManager } from '../src/lib/game/terrain/TerrainManager';
import type { TerrainEdits } from '../src/lib/game/terrain/TerrainEdits';
import type { ShovelOptions } from '../src/lib/game/terrain/ShovelTool';
type Scene = Omit<ThreeScene, 'controller' | 'terrainManager' | 'terrainEdits' | 'shovelTool'> & {
	controller: {
		worldPosition: { x: number; y: number; z: number };
		restoreState(p: { x: number; y: number; z: number }, yaw: number, pitch: number): void;
	};
	foundationManager: FoundationManager;
	terrainManager: TerrainManager;
	terrainEdits: TerrainEdits;
	shovelTool: Omit<ThreeScene['shovelTool'], 'options' | 'target'> & {
		options: ShovelOptions;
		target: { x: number; y: number; z: number } | null;
	};
};
type GameWindow = Window & {
	__forestSession: { scene: Scene; saveNow(): Promise<{ ok: boolean }> };
};
test('shovel edits local buffers, protects foundations, undoes/redoes and survives saving', async ({
	page
}) => {
	test.setTimeout(120000);
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await page.goto('/');
	await createAndEnterWorld(page, { name: 'Shovel world', seed: 'earth-pad' });
	await page.keyboard.press('7');
	await page.keyboard.press('e');
	await expect(page.getByRole('heading', { name: 'Shape your clearing' })).toBeVisible();
	await page.getByLabel('Single terrain point').check();
	await page.getByRole('button', { name: 'Return to the landscape' }).click();
	const spot = await page.evaluate(() => {
		const s = (window as unknown as GameWindow).__forestSession.scene;
		const tool = s.shovelTool,
			sp = s.terrainEdits.spacing;
		tool.options.prepare();
		const px = Math.round(s.controller.worldPosition.x / sp) * sp,
			pz = Math.round(s.controller.worldPosition.z / sp) * sp;
		for (let z = pz - 20; z <= pz + 20; z += sp)
			for (let x = px - 20; x <= px + 20; x += sp) {
				const r = s.terrainEdits.propose(
					x,
					z,
					2,
					0.125,
					true,
					tool.options.sample,
					tool.options.allowed
				);
				if (!r.stroke.patches.length) continue;
				const height = tool.options.sample(x, z);
				s.controller.restoreState({ x, y: height + 8, z }, 0, -Math.PI / 2);
				s.setTouchActive(true);
				return { x, z, height };
			}
		throw new Error('No editable point near spawn');
	});
	await expect
		.poll(() =>
			page.evaluate(
				() => !!(window as unknown as GameWindow).__forestSession.scene.shovelTool.target
			)
		)
		.toBe(true);
	await page.evaluate(() =>
		(window as unknown as GameWindow).__forestSession.scene.triggerPrimaryAction()
	);
	const getHeight = () =>
		page.evaluate(
			({ x, z }) =>
				(window as unknown as GameWindow).__forestSession.scene.terrainManager.sampleHeight(x, z),
			spot
		);
	await expect.poll(getHeight).toBeGreaterThan(spot.height + 0.05);
	const raised = await getHeight();
	const stats = await page.evaluate(({ x, z }) => {
		const s = (window as unknown as GameWindow).__forestSession.scene;
		const times: number[] = [];
		for (let n = 0; n < 10; n++) {
			const t = performance.now();
			s.terrainManager.notifyTerrainEdited({ minX: x - 2, maxX: x + 2, minZ: z - 2, maxZ: z + 2 });
			times.push(performance.now() - t);
		}
		let meshHeight: number | undefined;
		for (const mesh of s.terrainManager.getActiveMeshes()) {
			const p = mesh.geometry.getAttribute('position');
			for (let i = 0; i < p.count; i++)
				if (Math.abs(p.getX(i) - x) < 0.01 && Math.abs(p.getZ(i) - z) < 0.01)
					meshHeight = p.getY(i);
		}
		return { times, meshHeight };
	}, spot);
	expect(stats.meshHeight).toBeCloseTo(raised, 4);
	console.log('Local terrain buffer update ms:', stats.times);
	await page.keyboard.press('-');
	expect(await getHeight()).toBeCloseTo(spot.height, 5);
	await page.keyboard.press('=');
	expect(await getHeight()).toBeCloseTo(raised, 5);
	await page.screenshot({ path: test.info().outputPath('shovel.png') });
	expect(
		await page.evaluate(
			async () => (await (window as unknown as GameWindow).__forestSession.saveNow()).ok
		)
	).toBe(true);
	await waitForSaved(page);
	await page.reload();
	await openWorldNamed(page, 'Shovel world');
	expect(await getHeight()).toBeCloseTo(raised, 5);
	expect(errors).toEqual([]);
});

test('stone contact excavation extends support; grass cores and steep neighbours stay protected', async ({
	page
}) => {
	test.setTimeout(120000);
	await page.goto('/');
	await createAndEnterWorld(page, { name: 'Terrain protections', seed: 'earth-pad' });
	const result = await page.evaluate(() => {
		const s = (window as unknown as GameWindow).__forestSession.scene,
			tool = s.shovelTool,
			edits = s.terrainEdits;
		const sp = edits.spacing,
			px = Math.round(s.controller.worldPosition.x / sp) * sp,
			pz = Math.round(s.controller.worldPosition.z / sp) * sp;
		tool.options.prepare();
		let target: { x: number; z: number } | undefined;
		for (let z = pz - 18; z <= pz + 18 && !target; z += sp)
			for (let x = px - 18; x <= px + 18 && !target; x += sp) {
				if (
					edits.propose(x, z, sp, -0.125, true, tool.options.sample, tool.options.allowed).stroke
						.patches.length
				)
					target = { x, z };
			}
		if (!target) throw new Error('No safe point');
		const { x, z } = target,
			h = tool.options.sample(x, z);
		const manager = s.foundationManager;
		manager.addFoundation({
			id: 'retaining-test',
			minGridX: x / sp,
			maxGridX: x / sp + 2,
			minGridZ: z / sp - 1,
			maxGridZ: z / sp + 1,
			topY: h + 1,
			bottomY: h - 0.5
		});
		tool.options.prepare();
		const core = edits.propose(
			x + sp,
			z,
			sp,
			-0.125,
			true,
			tool.options.sample,
			tool.options.allowed
		);
		let strokes = 0;
		const timings: number[] = [];
		for (let i = 0; i < 5; i++) {
			const t = performance.now(),
				proposal = edits.propose(x, z, sp, -0.125, true, tool.options.sample, tool.options.allowed);
			if (proposal.stroke.patches.length) {
				edits.apply(proposal.stroke);
				tool.options.changed(proposal.stroke);
				strokes++;
			}
			timings.push(performance.now() - t);
		}
		const mesh = manager.getMeshForFoundation('retaining-test')!;
		const lowered = tool.options.sample(x, z),
			definition = manager.getFoundation('retaining-test')!;
		manager.addFoundation({
			id: 'grass-test',
			style: 'earth',
			minGridX: x / sp - 8,
			maxGridX: x / sp - 6,
			minGridZ: z / sp - 1,
			maxGridZ: z / sp + 1,
			topY: h,
			bottomY: h - 1,
			blendWidth: 6
		});
		tool.options.prepare();
		const grass = edits.propose(
			x - 7 * sp,
			z,
			sp,
			-0.125,
			true,
			tool.options.sample,
			tool.options.allowed
		);
		const conflict = manager.placementConflict({
			id: 'too-high',
			style: 'earth',
			minGridX: x / sp - 2,
			maxGridX: x / sp - 1,
			minGridZ: z / sp - 1,
			maxGridZ: z / sp + 1,
			topY: h + 10,
			bottomY: h - 1
		});
		return {
			strokes,
			core: core.stroke.patches.length,
			coreReason: core.reason,
			grass: grass.stroke.patches.length,
			grassHeight: tool.options.sample(x - 7 * sp, z),
			grassTop: h,
			lowered,
			initial: h,
			top: definition.topY,
			bottom: definition.bottomY,
			scale: mesh.scale.y,
			conflict,
			timings
		};
	});
	expect(result.core).toBe(0);
	expect(result.grass).toBe(0);
	expect(result.grassHeight).toBeCloseTo(result.grassTop, 5);
	expect(result.strokes).toBeGreaterThan(0);
	expect(result.lowered).toBeLessThan(result.initial);
	expect(result.top).toBeCloseTo(result.initial + 1, 5);
	expect(result.bottom).toBeCloseTo(result.initial - 0.5, 5);
	expect(result.scale).toBeGreaterThan(1);
	expect(result.conflict).toContain('bank');
	console.log('Full protected brush + render update ms:', result.timings);
});
