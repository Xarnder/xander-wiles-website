import { writeFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import { createAndEnterWorld, openWorldNamed } from './worldHelpers';
import { fixtureMidi } from '../src/lib/game/music/midi/MidiFixtures';
import { parseLocalMidi } from '../src/lib/game/music/midi/MidiParser';
import { defaultImportOptions, planMidiImport } from '../src/lib/game/music/midi/MidiPlanner';
import type { ThreeScene } from '../src/lib/game/ThreeScene';
import type { WebGLRenderer } from 'three';
declare global {
	interface Window {
		forestScene: ThreeScene;
	}
}

test('local MIDI preview, cancel, new placement, replace confirmation and reload', async ({
	page
}) => {
	test.setTimeout(180000);
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await page.goto('/?musicTest');
	await createAndEnterWorld(page, { name: 'MIDI garden' });
	await page.keyboard.press('m');
	const original = await page.evaluate(() => window.forestScene.music.plants.definitions);
	await page.getByRole('button', { name: 'Import MIDI', exact: true }).click();
	await page.getByTestId('midi-file').setInputFiles({
		name: 'song.mid',
		mimeType: 'audio/midi',
		buffer: Buffer.from(fixtureMidi(160))
	});
	await expect(page.getByTestId('midi-confirm')).toBeEnabled();
	await expect(page.getByTestId('midi-end')).toHaveValue('8');
	await page.getByTestId('midi-end').fill('10');
	await page.getByTestId('midi-end').blur();
	await expect(page.getByTestId('midi-summary')).toContainText('160');
	await page.screenshot({ path: 'test-results/midi-import-preview.png' });
	await page.getByTestId('midi-track-mapping').first().selectOption('crystal');
	await page.getByTestId('midi-resolution').selectOption('triplet');
	await expect(page.getByTestId('midi-confirm')).toBeEnabled();
	await page.getByTestId('midi-spacing').selectOption('tight');
	await expect(page.getByTestId('midi-confirm')).toBeEnabled();
	const tight = await page.getByTestId('midi-size').textContent();
	await page.getByTestId('midi-spacing').selectOption('compact');
	await expect(page.getByTestId('midi-confirm')).toBeEnabled();
	const compact = await page.getByTestId('midi-size').textContent();
	expect(compact).not.toBe(tight);
	await page.getByTestId('midi-cluster').check();
	await expect(page.getByTestId('midi-confirm')).toBeEnabled();
	await page.getByTestId('midi-spacing').selectOption('epic');
	await expect(page.getByTestId('midi-confirm')).toBeEnabled();
	expect(await page.getByTestId('midi-size').textContent()).not.toBe(compact);
	await page.getByRole('button', { name: 'Cancel', exact: true }).click();
	expect(await page.evaluate(() => window.forestScene.music.plants.definitions)).toEqual(original);
	await page.getByRole('button', { name: 'Import MIDI', exact: true }).click();
	await page.getByTestId('midi-file').setInputFiles({
		name: 'song.mid',
		mimeType: 'audio/midi',
		buffer: Buffer.from(fixtureMidi(32))
	});
	await expect(page.getByTestId('midi-confirm')).toBeEnabled();
	await page.getByTestId('midi-confirm').click();
	const imported = await page.evaluate(async () => {
		const m = window.forestScene.music;
		const plan = m.pendingImport!;
		if (!plan) throw Error('No placement preview');
		await m.commitImport(plan, { x: 500, y: 0, z: 500 });
		return m.plants.definitions;
	});
	expect(imported).toHaveLength(32);
	expect(imported.some((p) => p.pitchMidi === 61)).toBe(true);
	const current = await page.evaluate(() => structuredClone(window.forestScene.music.activeTree!));
	const extra = parseLocalMidi(fixtureMidi(16), 'add.mid');
	const add = planMidiImport(extra, {
		...defaultImportOptions(extra),
		target: 'add',
		existingTree: current,
		existingPlants: imported
	});
	await page.evaluate(async (plan) => {
		await window.forestScene.music.commitImport(plan);
	}, add);
	const combined = await page.evaluate(() => ({
		tree: window.forestScene.music.activeTree!,
		plants: window.forestScene.music.plants.definitions
	}));
	expect(combined.tree.loop.timeline).toEqual(current.loop.timeline);
	expect(combined.plants.slice(0, 32)).toEqual(imported);
	expect(combined.plants).toHaveLength(48);
	const rejected = await page.evaluate(async (plan) => {
		const m = window.forestScene.music;
		const before = JSON.stringify(m.plants.definitions);
		plan.notes[0].pitchMidi = 500;
		try {
			await m.commitImport(plan);
			return false;
		} catch {
			return JSON.stringify(m.plants.definitions) === before;
		}
	}, add);
	expect(rejected).toBe(true);
	await page.getByRole('button', { name: 'Import MIDI', exact: true }).click();
	await page.getByTestId('midi-file').setInputFiles({
		name: 'replacement.mid',
		mimeType: 'audio/midi',
		buffer: Buffer.from(fixtureMidi(16))
	});
	await expect(page.getByTestId('midi-confirm')).toBeEnabled();
	await page.getByTestId('midi-target').selectOption('replace');
	await expect(page.getByTestId('midi-summary')).toBeVisible();
	await expect(page.getByTestId('midi-confirm')).toBeDisabled();
	await page.getByTestId('midi-replace-confirm').check();
	await page.getByTestId('midi-confirm').click();
	await expect(page.getByTestId('midi-modal')).toBeHidden();
	const saved = await page.evaluate(() => window.forestScene.music.plants.definitions);
	expect(saved).toHaveLength(16);
	await page.keyboard.press('ControlOrMeta+s');
	await expect(page.getByTestId('save-indicator')).toHaveAttribute('data-status', 'saved');
	await page.reload();
	await openWorldNamed(page, 'MIDI garden');
	expect(await page.evaluate(() => window.forestScene.music.plants.definitions)).toEqual(saved);
	expect(errors).toEqual([]);
});

for (const count of [100, 2000, 10000])
	test(`MIDI profile ${count} logical notes`, async ({ page }, testInfo) => {
		test.setTimeout(240000);
		const start = performance.now();
		const a = parseLocalMidi(fixtureMidi(count), 'profile.mid');
		const options = defaultImportOptions(a);
		options.endBar = a.barStarts.length - 1;
		const plan = planMidiImport(a, options);
		const planningMs = performance.now() - start;
		await page.goto('/?musicTest');
		await createAndEnterWorld(page, { name: `Profile ${count}` });
		const result = await page.evaluate(async (plan) => {
			const scene = window.forestScene;
			const m = scene.music;
			const baselineStart = performance.now();
			for (let i = 0; i < 20; i++) await new Promise(requestAnimationFrame);
			const baselineFps = 20000 / (performance.now() - baselineStart);
			const start = performance.now();
			await m.commitImport(plan, { x: 0, y: 0, z: 0 });
			const commitMs = performance.now() - start;
			await new Promise((r) => setTimeout(r, 1800));
			const frames: number[] = [];
			let last = performance.now();
			for (let i = 0; i < 40; i++) {
				await new Promise(requestAnimationFrame);
				const now = performance.now();
				frames.push(now - last);
				last = now;
			}
			const renderer = (scene as unknown as { renderer: WebGLRenderer }).renderer;
			const json = JSON.stringify({ trees: scene.getMusicTrees(), plants: scene.getMusicPlants() });
			let liveObjects = 0;
			m.plants.group.traverse(() => liveObjects++);
			const terrainChunks = (
				scene as unknown as { terrainManager: { getActiveMeshes: () => unknown[] } }
			).terrainManager.getActiveMeshes().length;
			const before = performance.now();
			JSON.parse(json);
			return {
				commitMs,
				baselineFps,
				liveObjects,
				terrainChunks,
				outerRadius: plan.layout.outerRadius,
				livePlants: m.plants.visuals.size,
				logicalNotes: m.plants.definitions.length,
				drawCalls: renderer.info.render.calls,
				geometries: renderer.info.memory.geometries,
				fps: 1000 / (frames.reduce((a, b) => a + b, 0) / frames.length),
				saveBytes: new TextEncoder().encode(json).length,
				jsonParseMs: performance.now() - before,
				scheduler: m.runtimes.get(m.activeTree!.id)!.sequencer.schedulerMetrics,
				heapBytes: (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory
					?.usedJSHeapSize
			};
		}, plan);
		expect(result.logicalNotes).toBe(count);
		expect(result.livePlants).toBeLessThanOrEqual(400);
		if (count === 10000) {
			const streamed = await page.evaluate(async () => {
				const scene = window.forestScene;
				const m = scene.music;
				const t = m.activeTree!;
				const p = m.plants.definitions.at(-1)!;
				const radius = t.loop.firstRingRadius + p.ringIndex * t.loop.ringSpacing;
				const x = t.position.x + Math.cos(p.angle) * radius,
					z = t.position.z + Math.sin(p.angle) * radius;
				const access = scene as unknown as {
					controller: {
						restoreState: (
							p: { x: number; y: number; z: number },
							yaw: number,
							pitch: number
						) => void;
					};
					worldSurfaceSampler: {
						getSupportingSurfaceY: (x: number, z: number, y: number) => number;
					};
				};
				access.controller.restoreState(
					{ x, y: access.worldSurfaceSampler.getSupportingSurfaceY(x, z, -Infinity) + 2, z },
					0,
					0
				);
				await new Promise((r) => setTimeout(r, 2500));
				return { visible: m.plants.visuals.has(p.id), count: m.plants.visuals.size };
			});
			expect(streamed.visible).toBe(true);
			expect(streamed.count).toBeLessThanOrEqual(400);
		}
		await page.keyboard.press('ControlOrMeta+s');
		await expect(page.getByTestId('save-indicator')).toHaveAttribute('data-status', 'saved', {
			timeout: 20000
		});
		const reloadStart = performance.now();
		await page.reload();
		await openWorldNamed(page, `Profile ${count}`);
		expect(await page.evaluate(() => window.forestScene.music.plants.definitions.length)).toBe(
			count
		);
		const reloadMs = performance.now() - reloadStart;
		await writeFile(
			testInfo.outputPath('midi-profile.json'),
			JSON.stringify({ count, planningMs, reloadMs, ...result }, null, 2)
		);
		await testInfo.attach('midi-profile.json', {
			body: JSON.stringify({ count, planningMs, reloadMs, ...result }, null, 2),
			contentType: 'application/json'
		});
	});
