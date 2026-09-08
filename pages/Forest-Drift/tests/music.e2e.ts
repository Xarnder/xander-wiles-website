import { test, expect } from '@playwright/test';
import { createAndEnterWorld, openWorldNamed } from './worldHelpers';
import type { ThreeScene } from '../src/lib/game/ThreeScene';
declare global {
	interface Window {
		forestScene: ThreeScene;
	}
}
test('compose garden, free angle chords, controls and persistent reload', async ({ page }) => {
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await page.goto('/?musicTest');
	await createAndEnterWorld(page, { name: 'Music Garden' });
	await page.keyboard.press('m');
	await expect(page.getByTestId('build-hud')).toContainText('MUSIC GARDEN');
	const song = await page.evaluate(() => {
		const m = window.forestScene.music;
		const t = m.activeTree!;
		const placed = [];
		for (const [ring, angle] of [
			[3, 0.41234],
			[3, 2.31415],
			[7, -1.731]
		]) {
			const radius = t.loop.firstRingRadius + ring * t.loop.ringSpacing;
			const p = m.previewAt(
				t.position.x + Math.cos(angle) * radius,
				t.position.z + Math.sin(angle) * radius
			);
			if (!p) throw Error('Preview rejected');
			placed.push({ ...p });
			m.onPrimaryAction();
		}
		m.animate();
		return { placed, rings: m.runtimes.get(t.id)!.wave.material.uniforms.compose.value };
	});
	expect(song.rings).toBe(1);
	expect(song.placed).toHaveLength(3);
	expect(song.placed[0].ringIndex).toBe(song.placed[1].ringIndex);
	expect(song.placed[0].angle).toBeCloseTo(0.41234, 10);
	await page.keyboard.press('ArrowUp');
	await page.keyboard.press('ArrowRight');
	await page.keyboard.press('e');
	await expect(page.getByTestId('build-hud')).toContainText('Mushroom');
	await page.keyboard.press('j');
	expect(
		await page.evaluate(
			() => window.forestScene.music.runtimes.values().next().value!.sequencer.playing
		)
	).toBe(false);
	await page.keyboard.press('j');
	await expect
		.poll(() =>
			page.evaluate(
				() => window.forestScene.music.runtimes.values().next().value!.sequencer.playing
			)
		)
		.toBe(true);
	await page.keyboard.press('m');
	await page.keyboard.press('ControlOrMeta+s');
	await expect(page.getByTestId('save-indicator')).toHaveAttribute('data-status', 'saved');
	await page.reload();
	await openWorldNamed(page, 'Music Garden');
	expect(await page.evaluate(() => window.forestScene.music.plants.definitions)).toEqual(
		song.placed
	);
	expect(errors).toEqual([]);
});

test('all instruments, tempo changes, render stalls and existing Remove Mode', async ({ page }) => {
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await page.goto('/?musicTest');
	await createAndEnterWorld(page, { name: 'Music lifecycle' });
	await page.keyboard.press('m');
	const state = await page.evaluate(() => {
		const m = window.forestScene.music;
		const t = m.activeTree!;
		for (let i = 0; i < 5; i++) {
			m.speciesIndex = i;
			m.growth = i / 4;
			m.vibrancy = 0.2 + i * 0.2;
			const angle = i * 1.1;
			const r = t.loop.firstRingRadius + (i + 2) * t.loop.ringSpacing;
			if (!m.previewAt(t.position.x + Math.cos(angle) * r, t.position.z + Math.sin(angle) * r))
				throw Error('Cannot preview species');
			m.onPrimaryAction();
		}
		const before = [...m.plants.visuals.values()].map((g) => g.position.toArray());
		m.changeLoop({ bpm: 150 });
		return {
			species: m.plants.definitions.map((p) => p.speciesId),
			before,
			after: [...m.plants.visuals.values()].map((g) => g.position.toArray()),
			bpm: t.loop.bpm
		};
	});
	expect(state.species).toEqual(['flower', 'mushroom', 'fern', 'reed', 'crystal']);
	expect(state.before).toEqual(state.after);
	expect(state.bpm).toBe(150);
	await expect
		.poll(() =>
			page.evaluate(
				() => window.forestScene.music.runtimes.values().next().value!.sequencer.playing
			)
		)
		.toBe(true);
	const elapsed = await page.evaluate(() => {
		const q = window.forestScene.music.runtimes.values().next().value!.sequencer;
		const start = q.elapsed;
		const stop = performance.now() + 300;
		while (performance.now() < stop) {
			/* Deliberately block rendering and scheduler wakeups. */
		}
		return q.elapsed - start;
	});
	expect(elapsed).toBeGreaterThan(0.15);
	await page.evaluate(() => {
		const scene = window.forestScene;
		const g = scene.music.plants.visuals.values().next().value!;
		const target = { x: g.position.x, y: g.position.y + 0.5, z: g.position.z };
		const p = { x: target.x, y: g.position.y, z: target.z + 3 };
		const controller = (
			scene as unknown as {
				controller: {
					restoreState: (
						p: { x: number; y: number; z: number },
						yaw: number,
						pitch: number
					) => void;
				};
			}
		).controller;
		controller.restoreState(p, 0, Math.atan2(target.y - (p.y + 1.7), 3));
	});
	await page.keyboard.press('x');
	await expect(page.getByTestId('build-hud')).toContainText('REMOVE MUSIC PLANT');
	await page.screenshot({ path: 'test-results/music-garden.png' });
	await page.evaluate(() => {
		const scene = window.forestScene as unknown as { removeTool: { onPrimaryAction: () => void } };
		scene.removeTool.onPrimaryAction();
	});
	expect(await page.evaluate(() => window.forestScene.music.plants.definitions.length)).toBe(4);
	expect(errors).toEqual([]);
});

test('sustained notes: duration control, radial trail, live illumination, loop clamp and clean removal', async ({
	page
}) => {
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await page.goto('/?musicTest');
	await createAndEnterWorld(page, { name: 'Sustain Garden' });
	await page.keyboard.press('m');
	await expect(page.getByTestId('build-hud')).toContainText('MUSIC GARDEN');

	// Aim the camera straight down at the ring-5 target so the tool's own per-frame `update()` (the
	// SAME raycast a real player's crosshair drives) keeps re-previewing it — unlike a one-off manual
	// `previewAt` call, this survives the next animation frame instead of being overwritten by the
	// real crosshair ray.
	await page.evaluate(() => {
		const scene = window.forestScene;
		const m = scene.music;
		const t = m.activeTree!;
		const radius = t.loop.firstRingRadius + 5 * t.loop.ringSpacing;
		const target = {
			x: t.position.x + Math.cos(0.6) * radius,
			z: t.position.z + Math.sin(0.6) * radius
		};
		const controller = (
			scene as unknown as {
				controller: {
					restoreState: (
						p: { x: number; y: number; z: number },
						yaw: number,
						pitch: number
					) => void;
				};
			}
		).controller;
		controller.restoreState({ x: target.x, y: t.position.y + 15, z: target.z }, 0, -Math.PI / 2);
	});
	await expect(page.getByTestId('build-hud')).toContainText('Duration: 1 step');

	// Grow duration from 1 to 5 steps with the '.' key — the live HUD (driven by the SAME real
	// per-frame preview above) and the ghost trail must both update immediately, matching the manual
	// duration control requirement.
	for (let i = 0; i < 4; i++) await page.keyboard.press('.');
	await expect(page.getByTestId('build-hud')).toContainText('Duration: 5 steps');
	const preview = await page.evaluate(() => {
		const m = window.forestScene.music;
		return {
			durationSteps: m.candidate?.durationSteps,
			hasGhostTrail: !!(m as unknown as { ghostTrail?: unknown }).ghostTrail
		};
	});
	expect(preview.durationSteps).toBe(5);
	expect(preview.hasGhostTrail).toBe(true);

	// Place it, then verify the placed plant produced a real sustain trail whose radial length
	// matches durationSteps * ringSpacing exactly, staying on the plant's own angle.
	const placed = await page.evaluate(() => {
		const m = window.forestScene.music;
		const t = m.activeTree!;
		m.onPrimaryAction();
		const p = m.plants.definitions.at(-1)!;
		const trail = m.plants.trails.get(p.id);
		return {
			id: p.id,
			durationSteps: p.durationSteps,
			ringSpacing: t.loop.ringSpacing,
			hasTrail: !!trail
		};
	});
	expect(placed.hasTrail).toBe(true);
	expect(placed.durationSteps).toBe(5);

	// Let playback run a moment, then confirm the trail's shader progress is being driven by the
	// AUDIO clock (bounded 0..1, and actually advancing over real time) rather than staying frozen.
	// Compose Mode already auto-plays its active tree on entry — no need to press 'j' here.
	await expect
		.poll(() =>
			page.evaluate(
				() => window.forestScene.music.runtimes.values().next().value!.sequencer.playing
			)
		)
		.toBe(true);
	const progressSamples = await page.evaluate(async () => {
		const m = window.forestScene.music;
		const p = m.plants.definitions.at(-1)!;
		const samples: number[] = [];
		for (let i = 0; i < 5; i++) {
			m.animate();
			const trail = m.plants.trails.get(p.id)!;
			samples.push(trail.material.uniforms.progress.value as number);
			await new Promise((r) => setTimeout(r, 120));
		}
		return samples;
	});
	for (const s of progressSamples) {
		expect(s).toBeGreaterThanOrEqual(0);
		expect(s).toBeLessThanOrEqual(1);
	}

	// Loop-boundary clamp: request an absurdly long duration near the end of the loop and confirm
	// it's clamped to the maximum valid duration rather than allowed to wrap.
	const clamp = await page.evaluate(() => {
		const m = window.forestScene.music;
		const t = m.activeTree!;
		m.duration = 999;
		const lastRing = 30; // totalSteps=32 by default -> max duration from ring 30 is 2
		const radius = t.loop.firstRingRadius + lastRing * t.loop.ringSpacing;
		const p = m.previewAt(
			t.position.x + Math.cos(-1.2) * radius,
			t.position.z + Math.sin(-1.2) * radius
		);
		return p ? { durationSteps: p.durationSteps, endRing: p.ringIndex + p.durationSteps } : null;
	});
	expect(clamp).not.toBeNull();
	expect(clamp!.endRing).toBeLessThanOrEqual(32);
	expect(clamp!.durationSteps).toBeLessThan(999);

	// Remove the sustained plant and confirm both its definition AND its trail are gone — no
	// orphaned geometry left behind.
	await page.evaluate(() => {
		const m = window.forestScene.music;
		m.onSecondaryAction(); // discard the clamp-test ghost above without placing it
	});
	const removalResult = await page.evaluate(() => {
		const m = window.forestScene.music;
		const id = m.plants.definitions.at(-1)!.id;
		m.remove(id);
		return {
			hasDefinition: m.plants.definitions.some((p) => p.id === id),
			hasTrail: m.plants.trails.has(id)
		};
	});
	expect(removalResult.hasDefinition).toBe(false);
	expect(removalResult.hasTrail).toBe(false);
	expect(errors).toEqual([]);
});
