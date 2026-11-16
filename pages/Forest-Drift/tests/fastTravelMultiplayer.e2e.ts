import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { climbOn } from './creatureHelpers';
import { openSettingsMenu, openWorldsScreen } from './worldHelpers';

/**
 * Fast travel Phase 2, end to end in two browsers against a real room server (`wrangler dev`):
 * the room hears every trip and tells the other player, who sees the traveller snap (never slide)
 * to the new spot; the owner's "Fast travel for others" switch stops the visitor but not the
 * owner; and a ride arrives with its rider.
 */

const MP_PORT = 8794;
const MP_URL = `http://127.0.0.1:${MP_PORT}`;
const ADMIN_KEY = 'e2e-throwaway-admin-key';
const SERVER_DIR = fileURLToPath(new URL('../server/', import.meta.url));
const SHOTS = process.env.FAST_TRAVEL_SHOTS;

let server: ChildProcess | null = null;
let stateDir = '';
const runtimeErrors: string[] = [];

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
	test.setTimeout(120_000);
	stateDir = mkdtempSync(join(tmpdir(), 'forest-drift-travel-e2e-'));
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Scene = any;
async function sceneValue<R, A = undefined>(
	page: Page,
	read: (s: Scene, arg: A) => R,
	arg?: A
): Promise<Awaited<R>> {
	return page.evaluate(
		({ source, arg }) =>
			new Function('s', 'arg', `return (${source})(s, arg)`)(
				(window as unknown as { __forestSession: { scene: Scene } }).__forestSession.scene,
				arg
			),
		{ source: read.toString(), arg }
	) as Promise<Awaited<R>>;
}

const feet = (page: Page) =>
	sceneValue(page, (s) => ({ x: s.controller.worldPosition.x, z: s.controller.worldPosition.z }));

async function walking(page: Page) {
	await sceneValue(page, (s) => {
		s.setTouchActive(true);
		if (!s.buildToolManager.isNormalMode()) s.toggleBuildMode();
	});
}

/** The owner publishes the Main World and joins; a visitor joins with a viewer invite. */
async function ownerAndVisitor(browser: Browser) {
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
	await expect(owner.getByTestId('biome-minimap')).toBeVisible({ timeout: 15_000 });
	await expect(visitor.getByTestId('biome-minimap')).toBeVisible({ timeout: 15_000 });
	return { owner, visitor };
}

/** Records, every frame, where `page` draws the other players, until `stopSampling`. */
async function startSampling(page: Page) {
	await page.evaluate(() => {
		const w = window as unknown as {
			__forestSession: { scene: { mapMarkers(): { kind: string; x: number; z: number }[] } };
			__samples: { x: number; z: number }[][];
			__sampling: boolean;
		};
		w.__samples = [];
		w.__sampling = true;
		const tick = () => {
			w.__samples.push(
				w.__forestSession.scene
					.mapMarkers()
					.filter((m) => m.kind === 'player')
					.map(({ x, z }) => ({ x, z }))
			);
			if (w.__sampling) requestAnimationFrame(tick);
		};
		tick();
	});
}
async function stopSampling(page: Page) {
	return page.evaluate(() => {
		const w = window as unknown as { __samples: { x: number; z: number }[][]; __sampling: boolean };
		w.__sampling = false;
		return w.__samples;
	});
}

test('others see a trip as a snap, and the owner can switch fast travel off for others', async ({
	browser
}) => {
	test.setTimeout(600_000);
	const { owner, visitor } = await ownerAndVisitor(browser);
	const visitorSlot = await sceneValue(visitor, (s) =>
		s.multiplayer?.selfSlot !== undefined ? s.multiplayer.selfSlot : null
	);
	// The visitor stands 8 m east of the owner, who faces them (for the shimmer screenshot).
	const ownerAt = await feet(owner);
	await sceneValue(
		visitor,
		(s, at) => {
			const y = s.worldSurfaceSampler.getSupportingSurfaceY(at.x + 8, at.z, Infinity);
			s.controller.restoreState({ x: at.x + 8, y: y + 1.7, z: at.z }, 0, 0);
		},
		ownerAt
	);
	await sceneValue(
		owner,
		(s, at) => {
			const y = s.worldSurfaceSampler.getSupportingSurfaceY(at.x, at.z, Infinity);
			s.controller.restoreState({ x: at.x, y: y + 1.7, z: at.z }, -Math.PI / 2, -0.15);
		},
		ownerAt
	);
	const start = await feet(visitor);
	// The owner sees the visitor where they are first.
	await expect
		.poll(
			async () =>
				(await sceneValue(owner, (s) => s.mapMarkers())).some(
					(m: { kind: string; x: number; z: number }) =>
						m.kind === 'player' && Math.hypot(m.x - start.x, m.z - start.z) < 10
				),
			{ timeout: 30_000 }
		)
		.toBe(true);

	// The visitor travels from the full map, 300 px east.
	await visitor.keyboard.press('Backquote');
	await expect(visitor.getByTestId('biome-full-map-biome')).not.toHaveText('—', {
		timeout: 20_000
	});
	const box = (await visitor.getByTestId('biome-full-map-canvas').boundingBox())!;
	await visitor.mouse.click(box.x + box.width / 2 + 300, box.y + box.height / 2);
	await expect(visitor.getByTestId('biome-full-map-travel')).toHaveText('Travel here');
	await startSampling(owner);
	await visitor.getByTestId('biome-full-map-travel').click();
	await expect(visitor.getByTestId('biome-full-map')).toBeHidden();
	const landed = await feet(visitor);
	expect(Math.hypot(landed.x - start.x, landed.z - start.z)).toBeGreaterThan(400);

	// The room told the owner: from where to where, by whom.
	await expect
		.poll(() => sceneValue(owner, (s) => s.remoteTravels.length), { timeout: 10_000 })
		.toBeGreaterThan(0);
	if (SHOTS) {
		await owner.waitForTimeout(250);
		await owner.screenshot({ path: `${SHOTS}/shimmer-departure.jpg`, quality: 85 });
	}
	const heard = await sceneValue(owner, (s) => s.remoteTravels.at(-1));
	// The owner saw the shimmer where the visitor left (8 m away; the landing is out of range).
	expect(heard.particles).toBeGreaterThan(10);
	if (visitorSlot !== null) expect(heard.slot).toBe(visitorSlot);
	expect(Math.hypot(heard.to[0] - landed.x, heard.to[2] - landed.z)).toBeLessThan(2);
	expect(Math.hypot(heard.from[0] - start.x, heard.from[2] - start.z)).toBeLessThan(2);
	// The owner draws the visitor at the new spot, having jumped there: no frame in between.
	await expect
		.poll(
			async () =>
				(await sceneValue(owner, (s) => s.mapMarkers())).some(
					(m: { kind: string; x: number; z: number }) =>
						m.kind === 'player' && Math.hypot(m.x - landed.x, m.z - landed.z) < 10
				),
			{ timeout: 15_000 }
		)
		.toBe(true);
	await owner.waitForTimeout(500);
	const samples = await stopSampling(owner);
	const between = samples
		.flat()
		.filter(
			(p) =>
				Math.hypot(p.x - start.x, p.z - start.z) > 25 &&
				Math.hypot(p.x - landed.x, p.z - landed.z) > 25
		);
	expect(samples.length).toBeGreaterThan(10);
	expect(between).toEqual([]);

	// The owner turns fast travel off for others (Settings → Rules).
	await openSettingsMenu(owner);
	await owner.getByTestId('settings-search').fill('fast travel');
	const rule = owner
		.getByTestId('settings-field-rules.fastTravel')
		.locator('input[type="checkbox"]');
	await expect(rule).toBeChecked();
	await rule.click();
	await owner.getByTestId('settings-close').click();
	await owner.getByTestId('pause-resume').click();
	await expect
		.poll(() => sceneValue(visitor, (s) => s.canFastTravel()), { timeout: 15_000 })
		.toEqual({ ok: false, reason: 'ruleOff' });
	// The visitor's map says why.
	await visitor.keyboard.press('Backquote');
	await expect(visitor.getByTestId('biome-full-map-biome')).not.toHaveText('—', {
		timeout: 20_000
	});
	await visitor.mouse.click(box.x + box.width / 2 - 200, box.y + box.height / 2);
	const travel = visitor.getByTestId('biome-full-map-travel');
	await expect(travel).toHaveText('The owner has turned off fast travel');
	await expect(travel).toBeDisabled();
	if (SHOTS) await visitor.screenshot({ path: `${SHOTS}/rule-off.jpg`, quality: 80 });
	await visitor.keyboard.press('Escape');
	await visitor.keyboard.press('Escape');
	// The room refuses it too, even past the client's own check.
	const asked = await sceneValue(visitor, (s) => {
		const p = s.controller.worldPosition;
		return s.multiplayer.requestTravel([p.x, p.y - 1.7, p.z], [p.x + 500, 0, p.z]);
	});
	expect(asked).toEqual({ ok: false, reason: 'rule' });
	// The owner still can.
	const ownerTrip = await sceneValue(owner, (s) => {
		const p = s.controller.worldPosition;
		return s.fastTravel(p.x + 600, p.z - 300);
	});
	expect(ownerTrip.ok).toBe(true);
});

test('a ride arrives with its rider', async ({ browser }) => {
	test.setTimeout(600_000);
	const { owner, visitor } = await ownerAndVisitor(browser);
	const ownerSlot = await sceneValue(owner, (s) => s.multiplayer?.selfSlot ?? null);
	await climbOn(owner);
	await expect
		.poll(() => sceneValue(owner, (s) => s.canFastTravel().ok), { timeout: 10_000 })
		.toBe(true);
	const ridden = await sceneValue(owner, (s) => s.ride.riddenId);
	// The visitor knows who rides it.
	await expect
		.poll(() => sceneValue(visitor, (s, id) => s.creatures.carrierOf(id), ridden), {
			timeout: 15_000
		})
		.toBe(ownerSlot);
	const trip = await sceneValue(owner, (s) => {
		const p = s.controller.worldPosition;
		return s.fastTravel(p.x - 2000, p.z + 1200);
	});
	expect(trip.ok && trip.riding).toBe(true);
	const landed = await feet(owner);
	// Two seconds on: still riding the same creature, and the room hasn't ended the ride.
	await owner.waitForTimeout(2000);
	expect(await sceneValue(owner, (s) => s.ride.riddenId)).toBe(ridden);
	expect(await sceneValue(visitor, (s, id) => s.creatures.carrierOf(id), ridden)).toBe(ownerSlot);
	// The visitor draws the rider at the new spot.
	await expect
		.poll(
			async () =>
				(await sceneValue(visitor, (s) => s.mapMarkers())).some(
					(m: { kind: string; x: number; z: number }) =>
						m.kind === 'player' && Math.hypot(m.x - landed.x, m.z - landed.z) < 10
				),
			{ timeout: 15_000 }
		)
		.toBe(true);
});
