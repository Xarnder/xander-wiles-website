import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Browser, type Page } from '@playwright/test';

/**
 * Multiplayer Phase 2 acceptance, end to end (plan §10): publish, invite roles, joining, the shared
 * clock and sky, away while paused, a dropped connection resuming without a duplicate, flight off,
 * locked settings and building for visitors, and a clean leave.
 *
 * Starts its own room server (`wrangler dev`) on a spare port with a throwaway admin key and an empty
 * state folder, so it never touches the developer's `.dev.vars` or local worlds. Runs in Chromium,
 * WebKit and Firefox (see playwright.config.ts).
 */

const MP_PORT = 8791;
const MP_URL = `http://127.0.0.1:${MP_PORT}`;
const ADMIN_KEY = 'e2e-throwaway-admin-key';
const SERVER_DIR = fileURLToPath(new URL('../server/', import.meta.url));

let server: ChildProcess | null = null;
let stateDir = '';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
	test.setTimeout(120_000);
	stateDir = mkdtempSync(join(tmpdir(), 'forest-drift-mp-e2e-'));
	const envFile = join(stateDir, 'e2e.env');
	writeFileSync(envFile, `ADMIN_SECRET=${ADMIN_KEY}\n`);
	server = spawn(
		'npx',
		[
			'wrangler',
			'dev',
			'--port',
			String(MP_PORT),
			'--ip',
			'127.0.0.1',
			'--persist-to',
			join(stateDir, 'state'),
			'--env-file',
			envFile
		],
		{ cwd: SERVER_DIR, stdio: 'ignore' }
	);
	const deadline = Date.now() + 90_000;
	while (Date.now() < deadline) {
		try {
			if ((await fetch(`${MP_URL}/health`)).ok) return;
		} catch {
			// Not up yet.
		}
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
	throw new Error('The room server did not start');
});

test.afterAll(() => {
	server?.kill();
	server = null;
	if (stateDir) rmSync(stateDir, { recursive: true, force: true });
});

test.afterEach(async ({ browser }) => {
	// These contexts are created manually, so Playwright's page fixture does not dispose them.
	// Leaving earlier worlds rendering starves the three-client co-building test of GPU time.
	await Promise.all(browser.contexts().map((context) => context.close()));
});

async function newPlayer(browser: Browser): Promise<Page> {
	const context = await browser.newContext({ viewport: { width: 1100, height: 700 } });
	// Functional multiplayer checks need several worlds on one GPU; graphics benchmarks separately
	// exercise the higher presets. Use the real low preset rather than changing world generation.
	await context.addInitScript(() => localStorage.setItem('forest-drift.graphics.v1', 'low'));
	const page = await context.newPage();
	// `?mpServer=` is remembered in this context, so invite links (which don't carry it) work too.
	await page.goto(`/?mpServer=${encodeURIComponent(MP_URL)}`);
	await expect(page.getByTestId('worlds-screen')).toBeVisible({ timeout: 30_000 });
	return page;
}

async function joinWorld(page: Page, name: string): Promise<void> {
	await expect(page.getByTestId('join-world-dialog')).toBeVisible({ timeout: 15_000 });
	await page.getByTestId('join-world-name').fill(name);
	await page.getByTestId('join-world-confirm').click();
	await expect(page.locator('[data-testid="online-status"][data-status="connected"]')).toBeVisible({
		timeout: 180_000
	});
}

async function playerCount(page: Page): Promise<string> {
	return (await page.getByTestId('online-player-count').textContent())?.trim() ?? '';
}

/** Time of day (0..1) and day length, read from the running scene. */
async function skyTime(page: Page): Promise<{ timeOfDay: number; duration: number }> {
	return page.evaluate(() => {
		const scene = (
			window as unknown as {
				__forestSession: {
					scene: {
						settingsHost: { sky: { dayCycle: { timeOfDay: number; durationSeconds: number } } };
					};
				};
			}
		).__forestSession.scene;
		const cycle = scene.settingsHost.sky.dayCycle;
		return { timeOfDay: cycle.timeOfDay, duration: cycle.durationSeconds };
	});
}

test('publish, join with roles, share the sky, survive a dropped connection, leave cleanly', async ({
	browser
}) => {
	test.setTimeout(600_000);
	const owner = await newPlayer(browser);

	// The admin publishes the default world and gets one link per role (Q2-A, Q3-A).
	await owner.getByTestId('default-world-menu-button').click();
	await owner.getByTestId('default-world-menu-publish').click();
	await owner.getByTestId('publish-admin-key').fill(ADMIN_KEY);
	await owner.getByTestId('publish-world-confirm').click();
	await expect(owner.getByTestId('publish-world-done')).toBeVisible({ timeout: 30_000 });
	const viewerLink = await owner.getByTestId('invite-link-viewer').locator('input').inputValue();
	const editorLink = await owner.getByTestId('invite-link-editor').locator('input').inputValue();
	expect(viewerLink).toMatch(/\?mp=[\w-]+#invite=[\w-]+$/);
	expect(editorLink).not.toBe(viewerLink);

	await owner.getByTestId('publish-join-now').click();
	await joinWorld(owner, 'Owner');
	await expect(owner.getByTestId('online-status')).toHaveAttribute('data-role', 'owner');
	// Invite tokens never stay in the address bar.
	expect(new URL(owner.url()).hash).toBe('');

	// A visitor joins with the viewer link (invite-only, Q7).
	const visitor = await newPlayer(browser);
	await visitor.goto(viewerLink);
	await joinWorld(visitor, 'Visitor');
	await expect(visitor.getByTestId('online-status')).toHaveAttribute('data-role', 'viewer');
	await expect.poll(() => playerCount(owner), { timeout: 15_000 }).toBe('2 players');

	// Both clients load real independently skinned characters through the production renderer.
	const characterState = (page: Page) =>
		page.evaluate(() => {
			const session = (
				window as unknown as { __forestSession: { scene: { scene: import('three').Scene } } }
			).__forestSession;
			const models: import('three').Object3D[] = [];
			session.scene.scene.traverse((object) => {
				if (object.name === 'character-model') models.push(object);
			});
			return models.map((model) => ({
				state: model.userData.animation as string,
				pose: model.userData.animationState as {
					bodyYaw: number;
					headYaw: number;
					pitch: number;
					reach: number;
					compression: number;
				},
				bones: (() => {
					let n = 0;
					model.traverse((o) => {
						if (o.type === 'Bone') n++;
					});
					return n;
				})(),
				leg: model.getObjectByName('mixamorigLeftUpLeg')?.quaternion.toArray()
			}));
		});
	await expect
		.poll(async () => (await characterState(owner))[0]?.bones, { timeout: 30000 })
		.toBeGreaterThan(20);
	await expect
		.poll(async () => (await characterState(visitor))[0]?.bones, { timeout: 30000 })
		.toBeGreaterThan(20);
	const idleLeg = (await characterState(visitor))[0].leg;
	await owner.evaluate(() => {
		(
			window as unknown as {
				__forestSession: { scene: { controller: { setExampleMovement(enabled: boolean): void } } };
			}
		).__forestSession.scene.controller.setExampleMovement(true);
	});
	await expect
		.poll(async () => (await characterState(visitor))[0]?.state, { timeout: 15000 })
		.toBe('moving');
	expect((await characterState(visitor))[0].leg).not.toEqual(idleLeg);
	await owner.evaluate(() => {
		(
			window as unknown as {
				__forestSession: { scene: { controller: { setExampleMovement(enabled: boolean): void } } };
			}
		).__forestSession.scene.controller.setExampleMovement(false);
	});
	await expect
		.poll(async () => (await characterState(visitor))[0]?.state, { timeout: 15000 })
		.toBe('idle');
	// Camera look remains networked at the existing pose rate; body following is cosmetic.
	await owner.evaluate(() => {
		const controller = (
			window as unknown as {
				__forestSession: {
					scene: {
						controller: import('../src/lib/game/player/FirstPersonController').FirstPersonController;
					};
				};
			}
		).__forestSession.scene.controller;
		const p = controller.worldPosition;
		controller.restoreState({ x: p.x, y: p.y, z: p.z }, controller.getYaw() + 0.35, 0.45);
	});
	await expect
		.poll(async () => Math.abs((await characterState(visitor))[0]?.pose.headYaw ?? 0), {
			timeout: 15000
		})
		.toBeGreaterThan(0.2);
	await expect
		.poll(async () => (await characterState(visitor))[0]?.pose.pitch, { timeout: 15000 })
		.toBeCloseTo(0.45, 1);
	await owner.evaluate(() => {
		const scene = (
			window as unknown as { __forestSession: { scene: { triggerPrimaryAction(): void } } }
		).__forestSession.scene;
		scene.triggerPrimaryAction();
	});
	await expect
		.poll(async () => (await characterState(visitor))[0]?.pose.reach, {
			timeout: 15000,
			intervals: [50]
		})
		.toBeGreaterThan(0.25);
	await expect
		.poll(async () => (await characterState(visitor))[0]?.pose.reach, { timeout: 15000 })
		.toBeLessThan(0.01);
	await owner.evaluate(() => {
		const controller = (
			window as unknown as {
				__forestSession: {
					scene: {
						controller: import('../src/lib/game/player/FirstPersonController').FirstPersonController;
					};
				};
			}
		).__forestSession.scene.controller;
		controller.setTouchActive(true);
		controller.triggerTouchJump();
	});
	await expect
		.poll(async () => (await characterState(visitor))[0]?.state, {
			timeout: 15000,
			intervals: [50]
		})
		.toBe('airborne');
	await expect
		.poll(async () => (await characterState(visitor))[0]?.pose.compression, {
			timeout: 15000,
			intervals: [50]
		})
		.toBeGreaterThan(0.01);
	await expect
		.poll(async () => (await characterState(visitor))[0]?.pose.compression, { timeout: 15000 })
		.toBe(0);
	await owner.evaluate(() => {
		(
			window as unknown as {
				__forestSession: {
					scene: {
						controller: import('../src/lib/game/player/FirstPersonController').FirstPersonController;
					};
				};
			}
		).__forestSession.scene.controller.setTouchActive(false);
	});
	// Leaving simulated touch control opens the normal pause menu; restore the prior UI state.
	await owner.getByTestId('pause-resume').click();
	await visitor.screenshot({ path: test.info().outputPath('remote-character.png') });

	if (process.env.FOREST_DRIFT_GPU === '1') {
		const report = await visitor.evaluate(async () => {
			type View = import('../src/lib/game/net/NetSession').RemotePlayerView;
			type Update = (views: View[], dt: number, camera: import('three').Camera) => void;
			const scene = (
				window as unknown as {
					__forestSession: {
						scene: {
							controller: { worldPosition: { x: number; y: number; z: number } };
							settings: { player: { eyeHeight: number } };
							multiplayer: { avatars: { update: Update } };
							measureFrames(ms: number): Promise<unknown>;
						};
					};
				}
			).__forestSession.scene;
			const baseline = await scene.measureFrames(2000);
			const renderer = scene.multiplayer.avatars;
			const original = renderer.update;
			const origin = { ...scene.controller.worldPosition };
			let time = 0;
			renderer.update = function (views, dt, camera) {
				time += dt;
				const seed = views[0];
				if (!seed) return original.call(this, views, dt, camera);
				const crowd = Array.from({ length: 18 }, (_, i) => ({
					info: { ...seed.info, playerId: `character-benchmark-${i}`, name: `Character ${i}` },
					frame: {
						...seed.frame,
						x: origin.x + ((i % 6) - 2.5) * 1.2 + Math.sin(time * 2) * 0.5,
						y: origin.y - scene.settings.player.eyeHeight,
						z: origin.z - 4 - Math.floor(i / 6) * 1.3,
						yaw: 0,
						flags: 9,
						stale: false
					}
				}));
				original.call(this, [...views, ...crowd], dt, camera);
			};
			try {
				await new Promise((resolve) => setTimeout(resolve, 1500));
				return { baseline, crowd19: await scene.measureFrames(4000) };
			} finally {
				renderer.update = original;
			}
		});
		const path = test.info().outputPath('character-world-performance.json');
		writeFileSync(path, JSON.stringify(report, null, 2));
		await test
			.info()
			.attach('character-world-performance', { path, contentType: 'application/json' });
	}

	// Visitors can look but not build (Q3-A), nobody flies online (F3-C).
	await expect(visitor.getByTestId('view-only-badge')).toContainText('Viewing only');
	await visitor.keyboard.press('KeyF');
	// Read the state rather than the 1.8 s toast, which a slow software-rendered frame can skip past.
	expect(
		await visitor.evaluate(() => {
			const scene = (
				window as unknown as {
					__forestSession: {
						scene: { isFlightDisabled(): boolean; controller: { isFlying(): boolean } };
					};
				}
			).__forestSession.scene;
			return { disabled: scene.isFlightDisabled(), flying: scene.controller.isFlying() };
		})
	).toEqual({ disabled: true, flying: false });

	// The day/night clock is shared: both see the same time of day (Phase 2: within 1 s).
	await expect
		.poll(
			async () => {
				const [a, b] = await Promise.all([skyTime(owner), skyTime(visitor)]);
				return Math.abs(a.timeOfDay - b.timeOfDay) * a.duration;
			},
			{ timeout: 15_000 }
		)
		.toBeLessThan(1);

	// The owner moves the sun; the visitor's sky follows (Q14-A).
	await owner.evaluate(() => {
		const scene = (
			window as unknown as {
				__forestSession: {
					scene: {
						settingsHost: {
							sky: { dayCycle: { timeOfDay: number } };
							actions: { sky: () => void };
						};
					};
				};
			}
		).__forestSession.scene;
		scene.settingsHost.sky.dayCycle.timeOfDay = 0.9;
		scene.settingsHost.actions.sky();
	});
	await expect
		.poll(async () => (await skyTime(visitor)).timeOfDay, { timeout: 10_000 })
		.toBeGreaterThan(0.89);

	// The visitor's settings: the land and the sky are locked for them.
	await visitor.keyboard.press('Escape');
	await expect(visitor.getByTestId('pause-menu')).toBeVisible();
	// Paused = away for everyone else, while the world carries on (Q12).
	await owner.getByTestId('online-status').locator('.pill').click();
	await expect(
		owner.getByTestId('online-player').filter({ hasText: 'Visitor' }).getByText('away')
	).toBeVisible({ timeout: 10_000 });
	await visitor.getByTestId('pause-settings').click();
	await visitor.getByTestId('settings-nav-sky').click();
	await expect(visitor.getByTestId('settings-locked-sky')).toBeVisible();
	await visitor.getByTestId('settings-nav-world').click();
	await expect(visitor.getByTestId('settings-locked-world')).toContainText('same land');
	await visitor.getByTestId('settings-close').click();
	await visitor.getByTestId('pause-resume').click();
	await expect(
		owner.getByTestId('online-player').filter({ hasText: 'Visitor' }).getByText('away')
	).toBeHidden({ timeout: 10_000 });

	// The visitor's network drops without a goodbye; it reconnects into the same slot, and the owner
	// never sees a duplicate avatar or a leave (Q21).
	await visitor.evaluate(() =>
		(
			window as unknown as { __forestMultiplayer: { simulateNetworkDrop(): void } }
		).__forestMultiplayer.simulateNetworkDrop()
	);
	await expect(visitor.getByTestId('online-status')).toHaveAttribute('data-status', 'reconnecting');
	await expect(visitor.getByTestId('online-status')).toHaveAttribute('data-status', 'connected', {
		timeout: 20_000
	});
	expect(await playerCount(owner)).toBe('2 players');
	await expect(owner.getByTestId('online-player')).toHaveCount(2);
	expect(
		await owner.evaluate(
			() =>
				(window as unknown as { __forestMultiplayer: { stats: { avatars: number } } })
					.__forestMultiplayer.stats.avatars
		)
	).toBeLessThanOrEqual(1);

	// Pause exposes live roles, then a sidebar that leaves rendering and network movement running.
	await owner.getByTestId('pause-toggle').click();
	await owner.route('**/w/*/usage', async (route) =>
		route.fulfill({
			json: {
				status: 'ok',
				asOf: '2026-10-18T12:00:00Z',
				periodStart: '2026-10-18T00:00:00Z',
				resetsAt: '2026-10-19T00:00:00Z',
				stale: false,
				metrics: [
					{
						id: 'rowsWritten',
						label: 'Database rows written',
						used: 95_000,
						limit: 100_000,
						unit: 'rows',
						period: 'day'
					}
				]
			}
		})
	);
	await owner.getByTestId('pause-multiplayer').click();
	await expect(owner.getByTestId('multiplayer-menu')).toBeVisible();
	await expect(owner.getByTestId('multiplayer-member')).toHaveCount(2);
	await expect(owner.getByTestId('usage-summary')).toContainText('Near the free allowance');
	await expect(owner.getByTestId('usage-rowsWritten')).toContainText('95.0%');
	await expect(owner.getByRole('progressbar', { name: 'Database rows written' })).toHaveAttribute(
		'value',
		'95'
	);

	await expect(
		owner.getByTestId('multiplayer-member').filter({ hasText: 'Visitor' })
	).toContainText('Cannot build');
	await owner
		.getByTestId('multiplayer-menu')
		.getByRole('button', { name: 'Back', exact: true })
		.click();
	await owner.getByTestId('pause-debug').click();
	await expect(owner.getByTestId('debug-panel')).toBeVisible();
	await expect(owner.getByTestId('pause-menu')).toBeHidden();
	const position = () =>
		owner.evaluate(() => {
			const scene = (
				window as unknown as {
					__forestSession: { scene: { controller: { worldPosition: { x: number; z: number } } } };
				}
			).__forestSession.scene;
			return { x: scene.controller.worldPosition.x, z: scene.controller.worldPosition.z };
		});
	const before = await position();
	await owner.getByTestId('example-movement').check();
	await expect
		.poll(
			async () => {
				const now = await position();
				return Math.hypot(now.x - before.x, now.z - before.z);
			},
			{ timeout: 15_000 }
		)
		.toBeGreaterThan(0.5);
	await expect(owner.getByTestId('online-status')).toHaveAttribute('data-status', 'connected');
	await owner
		.getByTestId('debug-panel')
		.getByRole('button', { name: 'Close Dev and Debug controls' })
		.click();
	const stopped = await position();
	await owner.waitForTimeout(300);
	const after = await position();
	expect(Math.hypot(after.x - stopped.x, after.z - stopped.z)).toBeLessThan(0.01);

	// A deliberate leave frees the slot at once (no grace period).
	await visitor.keyboard.press('Escape');
	await visitor.getByTestId('pause-quit').click();
	await expect(visitor.getByTestId('worlds-screen')).toBeVisible({ timeout: 30_000 });
	await expect.poll(() => playerCount(owner), { timeout: 10_000 }).toBe('1 player');

	// The world is remembered for the visitor, with its role.
	await expect(visitor.getByTestId('online-worlds')).toContainText('Visitor');
});

/** The scene's internals, for driving builds the way the tools do (pointer lock can't be automated). */
type SceneHandle = {
	getFurniture(): { id: string }[];
	getFoundations(): { id: string }[];
	furnitureManager: { add(definition: object): void; remove(id: string): boolean };
	foundationManager: { addFoundation(definition: object): void };
};

async function scene<T>(
	page: Page,
	run: (scene: SceneHandle, arg: string) => T,
	arg = ''
): Promise<T> {
	return page.evaluate(
		([source, value]) => {
			const handle = (window as unknown as { __forestSession: { scene: SceneHandle } })
				.__forestSession.scene;
			return new Function('scene', 'arg', `return (${source})(scene, arg);`)(handle, value);
		},
		[run.toString(), arg] as const
	) as Promise<T>;
}

test('co-building: shared, saved, permission-checked, and clashes resolved in order', async ({
	browser
}) => {
	test.setTimeout(600_000);
	const owner = await newPlayer(browser);
	await owner.getByTestId('default-world-menu-button').click();
	await owner.getByTestId('default-world-menu-publish').click();
	await owner.getByTestId('publish-admin-key').fill(ADMIN_KEY);
	await owner.getByTestId('publish-world-confirm').click();
	await expect(owner.getByTestId('publish-world-done')).toBeVisible({ timeout: 30_000 });
	const editorLink = await owner.getByTestId('invite-link-editor').locator('input').inputValue();
	const ownerLink = await owner.getByTestId('invite-link-owner').locator('input').inputValue();
	await owner.getByTestId('publish-join-now').click();
	await joinWorld(owner, 'Owner');

	const builder = await newPlayer(browser);
	await builder.goto(editorLink);
	await joinWorld(builder, 'Builder');
	await expect(builder.getByTestId('online-status')).toHaveAttribute('data-role', 'editor');

	// The owner places a bed; the builder sees it appear.
	const foundationId = await scene(owner, (s) => s.getFoundations()[0]!.id);
	await scene(
		owner,
		(s, f) =>
			s.furnitureManager.add({
				id: 'owner-bed',
				kind: 'bed',
				foundationId: f,
				x: 2,
				y: 1,
				z: 2,
				nx: 0,
				ny: 1,
				nz: 0
			}),
		foundationId
	);
	await expect
		.poll(() => scene(builder, (s) => s.getFurniture().some((f) => f.id === 'owner-bed')), {
			timeout: 20_000
		})
		.toBe(true);

	// The builder can't remove the owner's bed (Q4-C): it comes straight back (and the owner never
	// loses it). The notice itself is covered by the unit tests; a 1.8 s toast is too brief to catch
	// reliably at software-rendering frame rates.
	await scene(builder, (s) => s.furnitureManager.remove('owner-bed'));
	await expect
		.poll(() => scene(builder, (s) => s.getFurniture().some((f) => f.id === 'owner-bed')), {
			timeout: 10_000
		})
		.toBe(true);
	expect(await scene(owner, (s) => s.getFurniture().some((f) => f.id === 'owner-bed'))).toBe(true);

	// Both put a foundation on the same empty ground at the same moment: one wins, everywhere.
	const foundation = (id: string) => ({
		id,
		minGridX: 4000,
		maxGridX: 4010,
		minGridZ: 4000,
		maxGridZ: 4010,
		topY: 20,
		bottomY: 18
	});
	await Promise.all([
		scene(
			owner,
			(s, def) => s.foundationManager.addFoundation(JSON.parse(def)),
			JSON.stringify(foundation('owner-pad'))
		),
		scene(
			builder,
			(s, def) => s.foundationManager.addFoundation(JSON.parse(def)),
			JSON.stringify(foundation('builder-pad'))
		)
	]);
	const pads = (page: Page) =>
		scene(page, (s) =>
			s
				.getFoundations()
				.map((f) => f.id)
				.filter((id) => id.endsWith('-pad'))
				.join(',')
		);
	// Both replicas begin with optimistic local pads. Read both on every retry so the
	// expectation cannot capture the owner's losing pad before server reconciliation.
	await expect
		.poll(
			async () => {
				const [ownerPad, builderPad] = await Promise.all([pads(owner), pads(builder)]);
				return /^(owner-pad|builder-pad)$/.test(ownerPad) && ownerPad === builderPad;
			},
			{ timeout: 20_000 }
		)
		.toBe(true);

	// Saved on the server: someone joining fresh gets all of it.
	const latecomer = await newPlayer(browser);
	await latecomer.goto(editorLink);
	await joinWorld(latecomer, 'Latecomer');
	expect(await scene(latecomer, (s) => s.getFurniture().some((f) => f.id === 'owner-bed'))).toBe(
		true
	);
	expect(await pads(latecomer)).toBe(await pads(owner));

	// The owner restores the world as it was published: everyone in it is moved onto that version
	// (a new epoch, so every replica resyncs), and the bed and pad are gone for all.
	const link = new URL(ownerLink);
	const worldId = link.searchParams.get('mp')!;
	const ownerToken = new URLSearchParams(link.hash.slice(1)).get('invite')!;
	const auth = { Authorization: `Bearer ${ownerToken}` };
	const { points } = (await (
		await fetch(`${MP_URL}/w/${worldId}/restore-points`, { headers: auth })
	).json()) as { points: { id: number; seq: number }[] };
	const published = points.find((point) => point.seq === 1)!;
	const restored = await fetch(`${MP_URL}/w/${worldId}/restore`, {
		method: 'POST',
		headers: { ...auth, 'Content-Type': 'application/json' },
		body: JSON.stringify({ pointId: published.id })
	});
	expect(restored.ok).toBe(true);
	for (const page of [owner, builder, latecomer]) {
		await expect
			.poll(() => scene(page, (s) => s.getFurniture().some((f) => f.id === 'owner-bed')), {
				timeout: 30_000
			})
			.toBe(false);
		await expect.poll(() => pads(page), { timeout: 10_000 }).toBe('');
	}
	// Builders (and visitors) can't do that.
	const editorToken = new URLSearchParams(new URL(editorLink).hash.slice(1)).get('invite')!;
	const refused = await fetch(`${MP_URL}/w/${worldId}/restore-points`, {
		headers: { Authorization: `Bearer ${editorToken}` }
	});
	expect(refused.status).toBe(403);
});
