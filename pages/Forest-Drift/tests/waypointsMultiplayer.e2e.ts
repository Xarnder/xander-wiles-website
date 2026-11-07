import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { openPauseMenu, openWorldsScreen } from './worldHelpers';

/**
 * Public waypoints, end to end in two browsers against a real room server (`wrangler dev`):
 * private by default; made public, a visitor sees it (beacon, locator bar, list) but can't change
 * it; once its creator lets others control it, the visitor turns it off for everyone and renames
 * it; taken private again, it disappears from the visitor's world.
 */

const MP_PORT = 8793;
const MP_URL = `http://127.0.0.1:${MP_PORT}`;
const ADMIN_KEY = 'e2e-throwaway-admin-key';
const SERVER_DIR = fileURLToPath(new URL('../server/', import.meta.url));
const SHOTS = process.env.WAYPOINT_SHOTS_DIR;

let server: ChildProcess | null = null;
let stateDir = '';
const runtimeErrors: string[] = [];

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
	test.setTimeout(120_000);
	stateDir = mkdtempSync(join(tmpdir(), 'forest-drift-waypoints-e2e-'));
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

test.afterAll(async () => {
	const child = server;
	server = null;
	if (child && child.exitCode === null && child.signalCode === null)
		await new Promise<void>((resolve) => {
			child.once('exit', () => resolve());
			child.kill();
		});
	if (stateDir) rmSync(stateDir, { recursive: true, force: true });
});

test.afterEach(async ({ browser }) => {
	await Promise.all(browser.contexts().map((context) => context.close()));
	expect(runtimeErrors.splice(0), 'Uncaught browser errors').toEqual([]);
});

async function newPlayer(browser: Browser): Promise<Page> {
	const context = await browser.newContext({ viewport: { width: 1100, height: 760 } });
	await context.addInitScript(() => localStorage.setItem('forest-drift.graphics.v1', 'low'));
	const page = await context.newPage();
	page.on('pageerror', (error) => runtimeErrors.push(error.message));
	await page.goto(`/?mpServer=${encodeURIComponent(MP_URL)}`);
	await openWorldsScreen(page);
	return page;
}

async function joinWorld(page: Page, name: string): Promise<void> {
	await expect(page.getByTestId('join-world-dialog')).toBeVisible({ timeout: 15_000 });
	await page.getByTestId('join-world-name').fill(name);
	await page.getByTestId('join-world-confirm').click();
	await expect(page.locator('[data-testid="online-status"][data-status="connected"]')).toBeVisible({
		timeout: 180_000
	});
	await expect(page.getByTestId('loading-screen')).toBeHidden({ timeout: 180_000 });
}

type Vec = { x: number; y: number; z: number };
interface WaypointRow {
	id: string;
	name: string;
	enabled: boolean;
	visibility: string;
	mine: boolean;
	ownerName: string | null;
	changedBy: string | null;
	canToggle: boolean;
	pending: boolean;
}
interface SceneHandle {
	setTouchActive(active: boolean): void;
	toggleBuildMode(): void;
	buildToolManager: { isNormalMode(): boolean };
	controller: { worldPosition: Vec; restoreState(p: Vec, yaw: number, pitch: number): void };
	scene: { getObjectsByProperty(key: string, value: string): { visible: boolean }[] };
	getWaypoints(): WaypointRow[];
}
type GameWindow = { __forestSession: { scene: SceneHandle } };

const rows = (page: Page) =>
	page.evaluate(() =>
		(window as unknown as GameWindow).__forestSession.scene
			.getWaypoints()
			.filter((w) => !w.id.startsWith('nearest'))
	);
const beams = (page: Page) =>
	page.evaluate(
		() =>
			(window as unknown as GameWindow).__forestSession.scene.scene
				.getObjectsByProperty('name', 'waypoint-beam')
				.filter((o) => o.visible).length
	);

async function walking(page: Page) {
	await page.evaluate(() => {
		const s = (window as unknown as GameWindow).__forestSession.scene;
		s.setTouchActive(true);
		if (!s.buildToolManager.isNormalMode()) s.toggleBuildMode();
	});
}

test('public waypoints: seen by everyone, controlled only when allowed', async ({ browser }) => {
	test.setTimeout(600_000);
	const owner = await newPlayer(browser);
	await owner.getByRole('button', { name: '← Main menu', exact: true }).click();
	await owner.getByRole('button', { name: 'Online', exact: true }).click();
	await owner.getByRole('tab', { name: 'Owner', exact: true }).click();
	await owner.getByTestId('owner-password').fill(ADMIN_KEY);
	await owner.getByTestId('owner-create-invites').click();
	await expect(owner.getByTestId('owner-publish-success')).toBeVisible({ timeout: 30_000 });
	await owner.getByTestId('owner-invite-role').selectOption('viewer');
	const viewerLink = await owner.getByTestId('invite-link-viewer').locator('input').inputValue();
	await owner.getByRole('button', { name: 'Join as owner', exact: true }).click();
	await joinWorld(owner, 'Olive');

	const visitor = await newPlayer(browser);
	await visitor.goto(viewerLink);
	await joinWorld(visitor, 'Vince');
	await walking(owner);
	await walking(visitor);
	await owner.waitForTimeout(1500);

	// The owner adds a waypoint: private, so the visitor knows nothing about it.
	await openPauseMenu(owner);
	// Online, Multiplayer stats sits beside Multiplayer, the same size.
	const [mpBox, statsBox] = await Promise.all([
		owner.getByTestId('pause-multiplayer').boundingBox(),
		owner.getByTestId('pause-multiplayer-stats').boundingBox()
	]);
	expect(Math.abs(mpBox!.y - statsBox!.y)).toBeLessThan(2);
	expect(Math.abs(mpBox!.width - statsBox!.width)).toBeLessThan(2);
	if (SHOTS) await owner.screenshot({ path: `${SHOTS}/pause-online.png` });
	await owner.getByTestId('pause-waypoints').click();
	await owner.getByTestId('waypoint-name-input').fill('Camp');
	await owner.getByTestId('waypoint-add').click();
	const ownerRow = owner.locator('[data-testid="waypoint-row"][data-mine="true"]').filter({
		hasText: 'Camp'
	});
	await expect(ownerRow).toHaveAttribute('data-visibility', 'private');
	await expect(ownerRow.getByTestId('waypoint-sharing')).toHaveText('Only you can see it');
	// A clear Public switch, off; others' control only appears once it's public.
	await expect(ownerRow.getByTestId('waypoint-visibility')).toHaveAttribute(
		'aria-checked',
		'false'
	);
	await expect(ownerRow.getByTestId('waypoint-visibility')).toBeEnabled();
	await expect(ownerRow.getByTestId('waypoint-control')).toHaveCount(0);
	await visitor.waitForTimeout(1000);
	expect(await rows(visitor)).toEqual([]);

	// Public: the visitor sees it in their list, as a beacon and on the locator bar.
	await ownerRow.getByTestId('waypoint-visibility').click();
	await expect(ownerRow.getByTestId('waypoint-visibility')).toHaveAttribute('aria-checked', 'true');
	await expect(ownerRow).toHaveAttribute('data-visibility', 'public');
	await expect(ownerRow.getByTestId('waypoint-control')).toBeEnabled();
	await expect
		.poll(async () => (await rows(visitor)).map((w) => [w.name, w.mine, w.ownerName, w.canToggle]))
		.toEqual([['Camp', false, 'Olive', false]]);
	// Stand away from it so its beam and the locator pin are easy to see.
	await visitor.evaluate(() => {
		const s = (window as unknown as GameWindow).__forestSession.scene;
		const p = s.controller.worldPosition;
		s.controller.restoreState({ x: p.x + 30, y: p.y + 4, z: p.z + 30 }, Math.PI * 0.25, -0.05);
	});
	await expect.poll(() => beams(visitor)).toBe(1);
	await expect(
		visitor
			.getByTestId('locator-bar')
			.locator('.locator-marker.waypoint')
			.filter({ hasText: 'Camp' })
	).toHaveCount(1);
	if (SHOTS) await visitor.screenshot({ path: `${SHOTS}/public-waypoint-visitor.png` });

	// The visitor can see it, not change it: no switch, rename, remove or sharing controls.
	await openPauseMenu(visitor);
	await visitor.getByTestId('pause-waypoints').click();
	const visitorRow = visitor.locator('[data-testid="waypoint-row"]').filter({ hasText: 'Camp' });
	await expect(visitorRow.getByTestId('waypoint-toggle')).toBeDisabled();
	await expect(visitorRow.getByTestId('waypoint-rename')).toHaveCount(0);
	await expect(visitorRow.getByTestId('waypoint-remove')).toHaveCount(0);
	await expect(visitorRow.getByTestId('waypoint-visibility')).toHaveCount(0);
	await expect(visitorRow.getByTestId('waypoint-control')).toHaveCount(0);
	await expect(visitorRow.getByTestId('waypoint-sharing')).toHaveText(
		"Olive's · only they can change it"
	);

	// The owner lets others control it: now the visitor can turn it off for everyone…
	await ownerRow.getByTestId('waypoint-control').click();
	await expect(ownerRow.getByTestId('waypoint-control')).toHaveAttribute('aria-checked', 'true');
	await expect(visitorRow.getByTestId('waypoint-toggle')).toBeEnabled();
	await expect(visitorRow.getByTestId('waypoint-sharing')).toHaveText(
		"Olive's · anyone can change it"
	);
	if (SHOTS) await visitor.screenshot({ path: `${SHOTS}/public-waypoint-visitor-panel.png` });
	await visitorRow.getByTestId('waypoint-toggle').click();
	await expect
		.poll(async () => (await rows(owner)).map((w) => [w.enabled, w.changedBy]))
		.toEqual([[false, 'Vince']]);
	await expect(ownerRow.getByTestId('waypoint-detail')).toContainText('off for everyone');
	// …and rename it, but still not remove it or take it private.
	await visitorRow.getByTestId('waypoint-rename').click();
	await visitor.getByTestId('waypoint-rename-input').fill('Old oak');
	await visitor.getByTestId('waypoint-rename-save').click();
	await expect.poll(async () => (await rows(owner)).map((w) => w.name)).toEqual(['Old oak']);
	await expect(visitorRow).toHaveCount(0);
	const renamed = visitor.locator('[data-testid="waypoint-row"]').filter({ hasText: 'Old oak' });
	await expect(renamed.getByTestId('waypoint-remove')).toHaveCount(0);
	if (SHOTS) await owner.screenshot({ path: `${SHOTS}/public-waypoint-owner-panel.png` });

	// Private again: it leaves the room and the visitor's world; the owner keeps it.
	const ownerRenamed = owner.locator('[data-testid="waypoint-row"][data-mine="true"]').filter({
		hasText: 'Old oak'
	});
	await ownerRenamed.getByTestId('waypoint-visibility').click();
	await expect(ownerRenamed).toHaveAttribute('data-visibility', 'private');
	await expect.poll(async () => (await rows(visitor)).length).toBe(0);
	expect((await rows(owner)).map((w) => [w.name, w.visibility])).toEqual([['Old oak', 'private']]);
});
