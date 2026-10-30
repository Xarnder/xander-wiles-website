import type { FoundationBuildingDefinition } from '../src/lib/game/building/WallTypes';
import { openWorldsScreen } from './worldHelpers';
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
const runtimeErrors: string[] = [];

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
	test.setTimeout(120_000);
	stateDir = mkdtempSync(join(tmpdir(), 'forest-drift-mp-e2e-'));
	const envFile = join(stateDir, 'e2e.env');
	writeFileSync(envFile, `ADMIN_SECRET=${ADMIN_KEY}\n`);
	await startRoomServer();
});

async function startRoomServer(): Promise<void> {
	const envFile = join(stateDir, 'e2e.env');
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
}

async function stopRoomServer(): Promise<void> {
	const child = server;
	server = null;
	if (!child || child.exitCode !== null || child.signalCode !== null) return;
	await new Promise<void>((resolve) => {
		child.once('exit', () => resolve());
		child.kill();
	});
}

test.afterAll(async () => {
	await stopRoomServer();
	if (stateDir) rmSync(stateDir, { recursive: true, force: true });
});

test.afterEach(async ({ browser }) => {
	// These contexts are created manually, so Playwright's page fixture does not dispose them.
	// Leaving earlier worlds rendering starves the three-client co-building test of GPU time.
	await Promise.all(browser.contexts().map((context) => context.close()));
	expect(runtimeErrors.splice(0), 'Uncaught browser errors').toEqual([]);
});

async function newPlayer(browser: Browser): Promise<Page> {
	const context = await browser.newContext({ viewport: { width: 1100, height: 700 } });
	// Functional multiplayer checks need several worlds on one GPU; graphics benchmarks separately
	// exercise the higher presets. Use the real low preset rather than changing world generation.
	await context.addInitScript(() => localStorage.setItem('forest-drift.graphics.v1', 'low'));
	const page = await context.newPage();
	page.on('pageerror', (error) => runtimeErrors.push(error.message));
	// `?mpServer=` is remembered in this context, so invite links (which don't carry it) work too.
	await page.goto(`/?mpServer=${encodeURIComponent(MP_URL)}`);
	await openWorldsScreen(page);
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
	// The socket connects before scene loading finishes. Wait for playable state: the
	// loading transition resets input/debug controls and can cancel a test action.
	await expect(page.getByTestId('loading-screen')).toBeHidden({ timeout: 180_000 });
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

async function openOwnerTab(page: Page) {
	await page.getByRole('button', { name: '← Main menu', exact: true }).click();
	await page.getByRole('button', { name: 'Online', exact: true }).click();
	await page.getByRole('tab', { name: 'Owner', exact: true }).click();
}

async function ownerLinks(page: Page) {
	await page.getByTestId('owner-invite-role').selectOption('viewer');
	const viewerLink = await page.getByTestId('invite-link-viewer').locator('input').inputValue();
	await page.getByTestId('owner-invite-role').selectOption('editor');
	const editorLink = await page.getByTestId('invite-link-editor').locator('input').inputValue();
	await page.getByText('Private owner link · keep for yourself', { exact: true }).click();
	const ownerLink = await page.getByTestId('invite-link-owner').locator('input').inputValue();
	return { viewerLink, editorLink, ownerLink };
}

test('Owner tab publishes to the real server and manages invites, offline copies and restore points', async ({
	browser,
	browserName
}) => {
	test.setTimeout(120_000);
	const owner = await newPlayer(browser);
	await openOwnerTab(owner);
	// The Owner tab also provides the real local world creation/management screen.
	await owner.getByTestId('owner-manage-worlds').click();
	await expect(owner.getByTestId('worlds-screen')).toBeVisible();
	await owner.getByTestId('new-world-button').click();
	await expect(owner.getByTestId('create-world-dialog')).toBeVisible();
	await owner
		.getByTestId('create-world-dialog')
		.getByRole('button', { name: 'Cancel', exact: true })
		.click();
	await openOwnerTab(owner);
	await owner.getByTestId('owner-password').fill('incorrect-test-password');
	await owner.getByTestId('owner-create-invites').click();
	await expect(owner.getByTestId('online-owner-panel').getByRole('alert')).toContainText(
		'owner password'
	);
	await owner.getByTestId('owner-password').fill(ADMIN_KEY);
	await owner.getByTestId('owner-create-invites').click();
	await expect(owner.getByTestId('owner-publish-success')).toBeVisible({ timeout: 30_000 });
	const { viewerLink, editorLink, ownerLink } = await ownerLinks(owner);
	const worldId = new URL(ownerLink).searchParams.get('mp')!;
	const token = (url: string) => new URLSearchParams(new URL(url).hash.slice(1)).get('invite')!;
	const auth = { Authorization: `Bearer ${token(ownerLink)}` };
	if (browserName === 'chromium') {
		await owner.context().grantPermissions(['clipboard-read', 'clipboard-write']);
		await owner
			.getByTestId('invite-link-editor')
			.getByRole('button', { name: 'Copy', exact: true })
			.click();
		expect(await owner.evaluate(() => navigator.clipboard.readText())).toBe(editorLink);
	}
	for (const guestLink of [viewerLink, editorLink]) {
		for (const action of ['export', 'restore-points']) {
			const refused = await fetch(`${MP_URL}/w/${worldId}/${action}`, {
				headers: { Authorization: `Bearer ${token(guestLink)}` }
			});
			expect(refused.status).toBe(403);
		}
		const restore = await fetch(`${MP_URL}/w/${worldId}/restore`, {
			method: 'POST',
			headers: { Authorization: `Bearer ${token(guestLink)}`, 'Content-Type': 'application/json' },
			body: JSON.stringify({ pointId: 1 })
		});
		expect(restore.status).toBe(403);
	}
	await owner.getByTestId('owner-manage-worlds').click();
	const card = owner.getByTestId(`online-world-${worldId}`);
	await expect(card).toBeVisible();
	await expect(owner.getByTestId('join-world-dialog')).toHaveCount(0);
	await card.getByRole('button', { name: 'Invite links', exact: true }).click();
	await expect(
		owner.getByTestId('invite-links-dialog').getByTestId('invite-link-editor').locator('input')
	).toHaveValue(editorLink);
	await owner
		.getByTestId('invite-links-dialog')
		.getByRole('button', { name: 'Close', exact: true })
		.click();
	await card.getByTestId('online-world-save-copy').click();
	await expect(owner.getByTestId('world-card').filter({ hasText: '(Online copy)' })).toHaveCount(1);
	// A returning owner on another device has the private owner link, not all publisher links.
	const returning = await newPlayer(browser);
	await returning.evaluate(
		({ worldId, invite, serverUrl }) =>
			localStorage.setItem(
				'forest-drift-mp-worlds',
				JSON.stringify([
					{ worldId, name: 'Returning owner world', invite, role: 'owner', serverUrl }
				])
			),
		{ worldId, invite: token(ownerLink), serverUrl: MP_URL }
	);
	await returning.reload();
	await openWorldsScreen(returning);
	const returningCard = returning.getByTestId(`online-world-${worldId}`);
	await returningCard.getByRole('button', { name: 'Invite links', exact: true }).click();
	const returningInvites = returning.getByTestId('invite-links-dialog');
	await expect(returningInvites.getByTestId('invite-link-owner').locator('input')).toHaveValue(
		ownerLink
	);
	await expect(returningInvites.getByTestId('invite-link-editor')).toHaveCount(0);
	await returningInvites.getByRole('button', { name: 'Close', exact: true }).click();
	await returningCard.getByTestId('online-world-save-copy').click();
	await expect(
		returning.getByTestId('world-card').filter({ hasText: '(Online copy)' })
	).toHaveCount(1);
	await returningCard.getByTestId('online-world-restore').click();
	await expect(returning.getByTestId('restore-dialog').getByRole('radio').first()).toBeVisible();
	await returning
		.getByTestId('restore-dialog')
		.getByRole('button', { name: 'Cancel', exact: true })
		.click();
	await card.getByTestId('online-world-restore').click();
	const restoreDialog = owner.getByTestId('restore-dialog');
	await expect(restoreDialog.getByRole('radio').first()).toBeVisible();
	await restoreDialog.getByRole('radio').first().check();
	const restored = owner.waitForResponse(
		(response) =>
			response.url().endsWith(`/w/${worldId}/restore`) && response.request().method() === 'POST'
	);
	await restoreDialog.getByTestId('restore-confirm').click();
	expect((await restored).ok()).toBe(true);
	await expect(restoreDialog).toHaveCount(0);
	const snapshot = await fetch(`${MP_URL}/w/${worldId}/snapshot`, { headers: auth });
	expect(snapshot.ok).toBe(true);
	expect(((await snapshot.json()) as { epoch: number }).epoch).toBe(2);
	await returningCard.getByTestId('online-world-restore').click();
	const returningRestore = returning.getByTestId('restore-dialog');
	await returningRestore.getByRole('radio').first().check();
	const returningRestored = returning.waitForResponse(
		(response) =>
			response.url().endsWith(`/w/${worldId}/restore`) && response.request().method() === 'POST'
	);
	await returningRestore.getByTestId('restore-confirm').click();
	expect((await returningRestored).ok()).toBe(true);
	await expect(returningRestore).toHaveCount(0);
	// Known older generators keep their world content and invite access on the new server.
	const exported = await fetch(`${MP_URL}/w/${worldId}/export`, { headers: auth });
	const legacyWorld = await exported.json();
	for (const generatorVersion of [1, 2]) {
		const published = await fetch(`${MP_URL}/w`, {
			method: 'POST',
			headers: { Authorization: `Bearer ${ADMIN_KEY}`, 'Content-Type': 'application/json' },
			body: JSON.stringify({ world: legacyWorld, generatorVersion })
		});
		expect(published.status).toBe(201);
		const legacy = (await published.json()) as {
			worldId: string;
			invites: { owner: string; viewer: string };
		};
		const snapshot = await fetch(`${MP_URL}/w/${legacy.worldId}/snapshot`, {
			headers: { Authorization: `Bearer ${legacy.invites.viewer}` }
		});
		expect(snapshot.ok).toBe(true);
		const upgraded = (await snapshot.json()) as {
			manifest: { generatorVersion: number };
			rows: unknown[];
		};
		expect(upgraded.manifest.generatorVersion).toBe(3);
		const roundTrip = await fetch(`${MP_URL}/w/${legacy.worldId}/export`, {
			headers: { Authorization: `Bearer ${legacy.invites.owner}` }
		});
		expect(await roundTrip.json()).toEqual(legacyWorld);
	}
	await card.getByRole('button', { name: 'Forget', exact: true }).click();
	await expect(card).toHaveCount(0);
	// Forget removes a browser bookmark; the online world remains intact on the backend.
	expect((await fetch(`${MP_URL}/w/${worldId}/snapshot`, { headers: auth })).ok).toBe(true);
});

test('publish, join with roles, share the sky, survive a dropped connection, leave cleanly', async ({
	browser
}) => {
	test.setTimeout(600_000);
	const owner = await newPlayer(browser);

	// Publish through the landing-screen Owner tab and exercise its Join as owner control.
	await openOwnerTab(owner);
	await owner.getByTestId('owner-password').fill(ADMIN_KEY);
	await owner.getByTestId('owner-create-invites').click();
	await expect(owner.getByTestId('owner-publish-success')).toBeVisible({ timeout: 30_000 });
	const { viewerLink, editorLink } = await ownerLinks(owner);
	expect(viewerLink).toMatch(/\?mp=[\w-]+#invite=[\w-]+$/);
	expect(editorLink).not.toBe(viewerLink);

	await owner.getByRole('button', { name: 'Join as owner', exact: true }).click();
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
	await owner.getByRole('button', { name: 'Track Visitor', exact: true }).click();
	await expect(
		owner
			.getByTestId('multiplayer-menu')
			.getByRole('button', { name: 'Stop tracking Visitor', exact: true })
	).toHaveAttribute('aria-pressed', 'true');
	await owner
		.getByTestId('multiplayer-menu')
		.screenshot({ path: test.info().outputPath('people-desktop.png') });
	await owner.setViewportSize({ width: 390, height: 844 });
	await owner
		.getByTestId('multiplayer-menu')
		.screenshot({ path: test.info().outputPath('people-phone.png') });
	const overflow = await owner
		.getByTestId('multiplayer-menu')
		.evaluate((el) => el.scrollWidth > el.clientWidth);
	expect(overflow).toBe(false);
	await owner.setViewportSize({ width: 1100, height: 700 });

	await owner
		.getByTestId('multiplayer-menu')
		.getByRole('button', { name: 'Back', exact: true })
		.click();
	await owner.getByTestId('pause-resume').click();
	await expect(owner.locator('.locator-marker.tracked .locator-label')).toBeVisible({
		timeout: 15_000
	});
	await expect(owner.getByTestId('stop-tracking')).toContainText('Tracking Visitor');
	await owner.keyboard.press('u');
	await expect(owner.getByTestId('stop-tracking')).toBeHidden();
	await expect(owner.locator('.locator-marker.tracked')).toHaveCount(0);
	await owner.getByTestId('pause-toggle').click();
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
	await openWorldsScreen(visitor);
	await expect.poll(() => playerCount(owner), { timeout: 10_000 }).toBe('1 player');

	// The world is remembered for the visitor, with its role.
	await expect(visitor.getByTestId('online-worlds')).toContainText('Visitor');

	// Coming back later, the landing page's Online button lists it, and one click rejoins with the
	// same name and role: no invite link to find again.
	await visitor.getByRole('button', { name: 'Main menu' }).click();
	await visitor.getByRole('button', { name: 'Online', exact: true }).click();
	const recent = visitor.getByTestId('recent-worlds');
	await expect(recent).toContainText('Visitor');
	await recent.getByTestId('recent-world-join').click();
	await expect(
		visitor.locator('[data-testid="online-status"][data-status="connected"]')
	).toBeVisible({ timeout: 180_000 });
	await expect(visitor.getByTestId('online-status')).toHaveAttribute('data-role', 'viewer');
	await expect.poll(() => playerCount(owner), { timeout: 15_000 }).toBe('2 players');
});

/** The scene's internals, for driving builds the way the tools do (pointer lock can't be automated). */
type SceneHandle = {
	getFurniture(): { id: string }[];
	levelManager: {
		getOrCreateLevel(foundationId: string, index: number): { baseY: number; wallHeight: number };
	};
	getBuildings(): FoundationBuildingDefinition[];
	buildingManager: {
		addWall(params: object): { valid: boolean; value?: { id: string }; reason?: string };
	};
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

	// Both players build on the SAME foundation through the real wall-placement manager.
	const sharedPad = await pads(owner);
	const addWall = (page: Page, z: number) =>
		scene(
			page,
			(s, json) => {
				const { foundationId, z } = JSON.parse(json);
				const level = s.levelManager.getOrCreateLevel(foundationId, 0);
				return s.buildingManager.addWall({
					start: { foundationId, gridX: 1, gridZ: z },
					end: { foundationId, gridX: 6, gridZ: z },
					baseY: level.baseY,
					height: level.wallHeight,
					thickness: 0.2,
					minimumWallLength: 0.1
				});
			},
			JSON.stringify({ foundationId: sharedPad, z })
		);
	const built = await Promise.all([addWall(owner, 1), addWall(builder, 3)]);
	for (const result of built) expect(result.valid, result.reason).toBe(true);
	const wallIds = built.map((result) => result.value!.id).sort();
	const sharedWalls = (page: Page) =>
		scene(
			page,
			(s, id) =>
				s
					.getBuildings()
					.find((b) => b.foundationId === id)
					?.walls.map((w) => w.id)
					.sort() ?? [],
			sharedPad
		);
	for (const page of [owner, builder]) {
		await expect.poll(() => sharedWalls(page), { timeout: 20_000 }).toEqual(wallIds);
	}

	// Saved on the server: someone joining fresh gets all of it.
	const latecomer = await newPlayer(browser);
	await latecomer.goto(editorLink);
	await joinWorld(latecomer, 'Latecomer');
	expect(await scene(latecomer, (s) => s.getFurniture().some((f) => f.id === 'owner-bed'))).toBe(
		true
	);
	expect(await pads(latecomer)).toBe(await pads(owner));
	expect(await sharedWalls(latecomer)).toEqual(wallIds);
	await expect
		.poll(
			async () => {
				const states = await Promise.all(
					[owner, builder, latecomer].map((page) =>
						page.evaluate(() => {
							const mp = (
								window as unknown as {
									__forestMultiplayer: {
										pendingBatches: number;
										worldVersion: { seq: number; epoch: number; checksum: string };
									};
								}
							).__forestMultiplayer;
							return { pending: mp.pendingBatches, version: mp.worldVersion };
						})
					)
				);
				return states.every(
					(state) =>
						state.pending === 0 &&
						JSON.stringify(state.version) === JSON.stringify(states[0]!.version)
				);
			},
			{ timeout: 20_000 }
		)
		.toBe(true);

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

test('open doors persist through a real room-server restart and reach a late joiner', async ({
	browser
}) => {
	test.setTimeout(180_000);
	const owner = await newPlayer(browser);
	await owner.getByTestId('default-world-menu-button').click();
	await owner.getByTestId('default-world-menu-publish').click();
	await owner.getByTestId('publish-admin-key').fill(ADMIN_KEY);
	await owner.getByTestId('publish-world-confirm').click();
	await expect(owner.getByTestId('publish-world-done')).toBeVisible({ timeout: 30_000 });
	const viewerLink = await owner.getByTestId('invite-link-viewer').locator('input').inputValue();
	await owner.getByTestId('publish-join-now').click();
	await joinWorld(owner, 'Owner');
	const visitor = await newPlayer(browser);
	await visitor.goto(viewerLink);
	await joinWorld(visitor, 'Visitor');
	const door = await scene(
		owner,
		(s) =>
			s
				.getBuildings()
				.flatMap((b) => [...b.walls, ...b.wallPaths.flatMap((path) => path.segments)])
				.flatMap((w) => w.openings ?? [])
				.find((o) => o.type === 'door')?.id
	);
	expect(door).toBeTruthy();
	const hasDoor = (page: Page) =>
		page.evaluate(
			(id) =>
				(
					window as unknown as { __forestMultiplayer: { sharedDoors: Set<string> } }
				).__forestMultiplayer.sharedDoors.has(id),
			door!
		);
	await owner.evaluate(
		(id) =>
			(
				window as unknown as {
					__forestMultiplayer: { doorToggled(id: string, open: boolean): void };
				}
			).__forestMultiplayer.doorToggled(id, true),
		door!
	);
	await expect.poll(() => hasDoor(visitor)).toBe(true);
	await stopRoomServer();
	await expect
		.poll(
			async () => {
				try {
					await fetch(`${MP_URL}/health`);
					return false;
				} catch {
					return true;
				}
			},
			{ timeout: 15_000 }
		)
		.toBe(true);
	await startRoomServer();
	for (const page of [owner, visitor]) {
		await expect(page.getByTestId('online-status')).toHaveAttribute('data-status', 'connected', {
			timeout: 30_000
		});
		await expect.poll(() => hasDoor(page)).toBe(true);
	}
	const late = await newPlayer(browser);
	await late.goto(viewerLink);
	await joinWorld(late, 'Late joiner');
	expect(await hasDoor(late)).toBe(true);
	// A returning client must close a door that changed while its socket was gone.
	await visitor.context().setOffline(true);
	await visitor.evaluate(() =>
		(
			window as unknown as { __forestMultiplayer: { simulateNetworkDrop(): void } }
		).__forestMultiplayer.simulateNetworkDrop()
	);
	await owner.evaluate(
		(id) =>
			(
				window as unknown as {
					__forestMultiplayer: { doorToggled(id: string, open: boolean): void };
				}
			).__forestMultiplayer.doorToggled(id, false),
		door!
	);
	await expect.poll(() => hasDoor(late)).toBe(false);
	await visitor.context().setOffline(false);
	await expect(visitor.getByTestId('online-status')).toHaveAttribute('data-status', 'connected', {
		timeout: 30_000
	});
	await expect.poll(() => hasDoor(visitor)).toBe(false);
});

test('punching: a punch in normal mode costs the other player health, privately', async ({
	browser
}) => {
	test.setTimeout(600_000);
	const owner = await newPlayer(browser);
	await openOwnerTab(owner);
	await owner.getByTestId('owner-password').fill(ADMIN_KEY);
	await owner.getByTestId('owner-create-invites').click();
	await expect(owner.getByTestId('owner-publish-success')).toBeVisible({ timeout: 30_000 });
	const { editorLink } = await ownerLinks(owner);
	await owner.getByRole('button', { name: 'Join as owner', exact: true }).click();
	await joinWorld(owner, 'Puncher');

	const target = await newPlayer(browser);
	await target.goto(editorLink);
	await joinWorld(target, 'Target');
	await expect.poll(() => playerCount(owner), { timeout: 15_000 }).toBe('2 players');

	type Scene = {
		controller: { spawn(x: number, z: number): void; yaw: number };
		toggleBuildMode(): void;
		canPunch(): boolean;
		punch(): boolean;
		getHealth(): { current: number; dead: boolean };
	};
	const scene = (page: Page) =>
		page.evaluateHandle(
			() => (window as unknown as { __forestSession: { scene: Scene } }).__forestSession.scene
		);
	/** The value on screen must always match the game's own health (it once showed 33 for 34). */
	const expectHealth = async (page: Page, value: number) => {
		await expect(page.getByTestId('health-bar')).toHaveAttribute('aria-valuenow', String(value), {
			timeout: 10_000
		});
		await expect(page.getByTestId('health-count')).toHaveText(`${value}/36`);
		expect(await (await scene(page)).evaluate((s) => s.getHealth().current)).toBe(value);
	};

	// Stand 1.5 m apart, the puncher facing the target (yaw 0 faces −Z), then stand still long
	// enough for the room to fall asleep: punches must still land on players who aren't moving.
	// Settle first: the room's speed check treats a jump of tens of metres within a second of the
	// last pose as impossible running and keeps the old position (real players walk there).
	await owner.waitForTimeout(3000);
	await (await scene(target)).evaluate((s) => s.controller.spawn(6, 4.5));
	await (
		await scene(owner)
	).evaluate((s) => {
		s.controller.spawn(6, 6);
		s.controller.yaw = 0;
	});
	await owner.waitForTimeout(5000);

	// Building: a click builds, it doesn't punch.
	expect(await (await scene(owner)).evaluate((s) => s.canPunch())).toBe(false);
	await (await scene(owner)).evaluate((s) => s.toggleBuildMode());
	await expect.poll(async () => (await scene(owner)).evaluate((s) => s.canPunch())).toBe(true);

	// Two punches back to back: the cooldown lets only the first through.
	const thrown = await (await scene(owner)).evaluate((s) => [s.punch(), s.punch()]);
	expect(thrown).toEqual([true, false]);
	await expectHealth(target, 34);
	// The puncher sees the hit, and its own health is untouched.
	await expect(owner.getByTestId('punch-hit-marker')).toBeAttached();
	await expectHealth(owner, 36);

	// After the cooldown, the next punch lands: exactly 2 points off what the target's health was
	// worth at that moment on the room clock (regeneration may have given one back by then, and the
	// room can count it a moment before this browser's clock does).
	type Stored = { base: number; lastDamageAt: number; dead: boolean };
	const stored = () =>
		target.evaluate(
			() =>
				({
					...(window as unknown as { __forestMultiplayer: { health: { state: Stored } } })
						.__forestMultiplayer.health.state
				}) as Stored
		);
	await owner.waitForTimeout(600);
	const before = await stored();
	await (await scene(owner)).evaluate((s) => s.punch());
	await expect.poll(async () => (await stored()).lastDamageAt).not.toBe(before.lastDamageAt);
	const after = await stored();
	const regained = Math.max(
		0,
		Math.floor((after.lastDamageAt - before.lastDamageAt - 8000) / 3000)
	);
	expect(after.base).toBe(Math.min(36, before.base + regained) - 2);
	// …and the screen shows what the game holds.
	const shown = await (await scene(target)).evaluate((s) => s.getHealth().current);
	await expectHealth(target, shown);

	// Knock them out: they lie on the floor for everyone, and can respawn after 3 s.
	for (
		let i = 0;
		i < 25 && !(await (await scene(target)).evaluate((s) => s.getHealth().dead));
		i++
	) {
		await (await scene(owner)).evaluate((s) => s.punch());
		await owner.waitForTimeout(550);
	}
	await expect(target.getByTestId('death-card')).toBeVisible();
	// Respawn waits 3 s on the room clock. Two software-rendered browsers can take that long just to
	// notice the knockout, so only require the button to be off while it still shows a countdown (the
	// delay itself is covered by the unit tests and playerHealth.e2e.ts).
	const respawn = target.getByTestId('death-respawn');
	if (/Respawn in/.test((await respawn.textContent()) ?? '')) await expect(respawn).toBeDisabled();
	await expect(target.getByTestId('death-card')).toContainText('You were knocked out');
	await expect(target.getByTestId('death-card')).toContainText('by Puncher');
	const targetDown = () =>
		owner.evaluate(() => {
			const mp = (
				window as unknown as {
					__forestMultiplayer: {
						roster: { slot: number; down?: boolean; playerId: string }[];
						knockedOutPose(id: string): { action: string } | null;
					};
				}
			).__forestMultiplayer;
			const player = mp.roster.find((p) => p.slot === 1)!;
			return {
				down: player.down === true,
				pose: mp.knockedOutPose(player.playerId)?.action ?? null
			};
		});
	await expect.poll(targetDown, { timeout: 10_000 }).toEqual({ down: true, pose: 'lie' });
	await expect(respawn).toBeEnabled({ timeout: 5_000 });
	await respawn.click();
	await expect(target.getByTestId('death-card')).toBeHidden();
	await expectHealth(target, 36);
	await expect.poll(targetDown, { timeout: 10_000 }).toEqual({ down: false, pose: null });
});
