import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { openWorldsScreen } from './worldHelpers';

/**
 * Ranged weapons Phase 2, end to end in two browsers against a real room server (`wrangler dev`):
 * the room grants a creature to one player, the other sees it leave their herd and appear under
 * the carrier's arm, can't take it, sees it put down, and the owner's rule puts it down for them.
 */

const MP_PORT = 8792;
const MP_URL = `http://127.0.0.1:${MP_PORT}`;
const ADMIN_KEY = 'e2e-throwaway-admin-key';
const SERVER_DIR = fileURLToPath(new URL('../server/', import.meta.url));
const SHOTS = process.env.RANGED_SHOTS_DIR;

let server: ChildProcess | null = null;
let stateDir = '';
const runtimeErrors: string[] = [];

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
	test.setTimeout(120_000);
	stateDir = mkdtempSync(join(tmpdir(), 'forest-drift-ranged-e2e-'));
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
	const context = await browser.newContext({ viewport: { width: 1100, height: 700 } });
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
interface SceneHandle {
	setTouchActive(active: boolean): void;
	toggleBuildMode(): void;
	toggleCarry(): boolean;
	setCreatureProjectilesRule(enabled: boolean): void;
	setCarryTrigger(held: boolean): void;
	getHealth(): { current: number };
	getCarryState(): { carrying: boolean; charges: number };
	projectiles: { launched: number; playerHits: number };
	buildToolManager: { isNormalMode(): boolean };
	carry: { carriedId: string | null; pending: boolean };
	controller: {
		worldPosition: Vec;
		restoreState(p: Vec, yaw: number, pitch: number): void;
	};
	worldSurfaceSampler: { getSupportingSurfaceY(x: number, z: number, ref: number): number };
	scene: { getObjectsByProperty(key: string, value: string): { visible: boolean }[] };
	creatures: {
		live: Map<
			string,
			{ compiled: { object: { position: Vec }; compilation: { collision: { height: number } } } }
		>;
		logical: Map<
			string,
			{
				position: Vec;
				spawn: {
					species: { bodyPlan: { id: string }; proportions: Record<string, number> };
					individual: { sizeFactor: number };
					persistent: boolean;
				};
			}
		>;
		carrierOf(id: string): 'local' | number | null;
		state: { individuals: { id: string; position: Vec }[] };
	};
	placeCreature(definition: unknown): string;
}
type GameWindow = {
	__forestSession: { scene: SceneHandle };
	__forestMultiplayer: { claimCarry(id: string): Promise<{ ok: boolean; reason?: string }> };
};

async function walking(page: Page) {
	await page.evaluate(() => {
		const s = (window as unknown as GameWindow).__forestSession.scene;
		s.setTouchActive(true);
		if (!s.buildToolManager.isNormalMode()) s.toggleBuildMode();
	});
}

/** Stands 1.3 m from the nearest small creature, looking at it; returns its id. */
async function aimAtSmall(page: Page): Promise<string> {
	let id: string | null = null;
	await expect
		.poll(
			async () =>
				(id = await page.evaluate(() => {
					const s = (window as unknown as GameWindow).__forestSession.scene;
					const me = s.controller.worldPosition;
					let best: { d: number; id: string } | null = null;
					for (const [key] of s.creatures.live) {
						const r = s.creatures.logical.get(key);
						if (!r) continue;
						const p = r.spawn.species.proportions;
						const h =
							(p.legLength + p.bodyDepth + p.neckLength + p.headSize) *
							r.spawn.individual.sizeFactor;
						if (h > 0.9 || r.spawn.species.bodyPlan.id !== 'quadruped') continue;
						const d = Math.hypot(r.position.x - me.x, r.position.z - me.z);
						if (!best || d < best.d) best = { d, id: key };
					}
					if (!best) return null;
					const live = s.creatures.live.get(best.id)!;
					const p = live.compiled.object.position;
					const mid = p.y + live.compiled.compilation.collision.height / 2;
					const from = { x: p.x + 1.3, z: p.z };
					const eyeY = s.worldSurfaceSampler.getSupportingSurfaceY(from.x, from.z, Infinity) + 1.7;
					s.controller.restoreState(
						{ x: from.x, y: eyeY, z: from.z },
						Math.atan2(-(p.x - from.x), -(p.z - from.z)),
						Math.atan2(mid - eyeY, 1.3)
					);
					return best.id;
				})),
			{ timeout: 60_000 }
		)
		.not.toBeNull();
	return id!;
}

async function pickUp(page: Page): Promise<string> {
	// Creatures wander (and shy away from a player close by), so re-aim a few times.
	for (let attempt = 0; attempt < 12; attempt++) {
		const id = await aimAtSmall(page);
		// A moment for the room to see where we stand (poses go out every 100 ms), but not so long
		// that the creature has walked off.
		await page.waitForTimeout(150);
		await page.keyboard.press('k');
		await expect
			.poll(() =>
				page.evaluate(() => (window as unknown as GameWindow).__forestSession.scene.carry.pending)
			)
			.toBe(false);
		const carried = await page.evaluate(
			() => (window as unknown as GameWindow).__forestSession.scene.carry.carriedId
		);
		if (carried) return carried;
		void id;
	}
	const said = await page.getByTestId('carry-announcement').textContent();
	const diag = await page.evaluate(async () => {
		const w = window as unknown as GameWindow;
		const s = w.__forestSession.scene;
		const id = [...s.creatures.live.keys()][0];
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const host = (s.carry as any).host;
		const gates = {
			input: host.inputAllowed(),
			stowed: host.stowed(),
			mustRelease: host.mustRelease(),
			other: host.otherInteractionTargeted(),
			pick: host.pick(host.eye(), host.aim(), 2)?.id ?? null
		};
		const direct = id ? await w.__forestMultiplayer.claimCarry(id) : null;
		return { id, direct, gates, pos: s.controller.worldPosition };
	});
	throw new Error(`could not pick up a creature: "${said}" ${JSON.stringify(diag)}`);
}

const carrierOf = (page: Page, id: string) =>
	page.evaluate(
		(id) => (window as unknown as GameWindow).__forestSession.scene.creatures.carrierOf(id),
		id
	);

test('online carrying: the room arbitrates and everyone sees who holds what', async ({
	browser
}) => {
	test.setTimeout(600_000);
	const owner = await newPlayer(browser);
	await owner.getByRole('button', { name: '← Main menu', exact: true }).click();
	await owner.getByRole('button', { name: 'Online', exact: true }).click();
	await owner.getByRole('tab', { name: 'Owner', exact: true }).click();
	await owner.getByTestId('owner-password').fill(ADMIN_KEY);
	await owner.getByTestId('owner-create-invites').click();
	await expect(owner.getByTestId('owner-publish-success')).toBeVisible({ timeout: 30_000 });
	await owner.getByTestId('owner-invite-role').selectOption('editor');
	const editorLink = await owner.getByTestId('invite-link-editor').locator('input').inputValue();
	await owner.getByRole('button', { name: 'Join as owner', exact: true }).click();
	await joinWorld(owner, 'Carrier');

	const watcher = await newPlayer(browser);
	await watcher.goto(editorLink);
	await joinWorld(watcher, 'Watcher');
	await walking(owner);
	await walking(watcher);
	await owner.waitForTimeout(3000);

	// The owner picks a creature up; the room grants it.
	const id = await pickUp(owner);
	expect(await carrierOf(owner, id)).toBe('local');
	await expect(owner.getByTestId('carry-hud')).toBeVisible();

	// The watcher sees it leave their herd and held by a remote slot, drawn under the arm.
	await expect.poll(() => carrierOf(watcher, id), { timeout: 15_000 }).toEqual(expect.any(Number));
	expect(
		await watcher.evaluate(
			(id) => (window as unknown as GameWindow).__forestSession.scene.creatures.logical.has(id),
			id
		)
	).toBe(false);
	// Stand next to the carrier, facing them, so their avatar (and the creature) is drawn.
	await watcher.evaluate(
		({ p }) => {
			const s = (window as unknown as GameWindow).__forestSession.scene;
			s.controller.restoreState({ x: p.x - 2.5, y: p.y, z: p.z - 2.5 }, Math.PI * 1.25, -0.15);
		},
		{
			p: await owner.evaluate(
				() => (window as unknown as GameWindow).__forestSession.scene.controller.worldPosition
			)
		}
	);
	await expect
		.poll(
			() =>
				watcher.evaluate(
					() =>
						(window as unknown as GameWindow).__forestSession.scene.scene
							.getObjectsByProperty('name', 'held-creature')
							.filter((o) => o.visible).length
				),
			{ timeout: 20_000 }
		)
		.toBeGreaterThanOrEqual(1);
	if (SHOTS) await watcher.screenshot({ path: `${SHOTS}/online-remote-carry.png` });

	// Nobody else can take it.
	const stolen = await watcher.evaluate(
		(id) => (window as unknown as GameWindow).__forestMultiplayer.claimCarry(id),
		id
	);
	expect(stolen).toEqual({ ok: false, reason: 'taken' });

	// Put down: back in the watcher's herd, near the carrier.
	await owner.keyboard.press('k');
	await expect.poll(() => carrierOf(watcher, id), { timeout: 15_000 }).toBeNull();
	await expect
		.poll(() =>
			watcher.evaluate(
				(id) => (window as unknown as GameWindow).__forestSession.scene.creatures.logical.has(id),
				id
			)
		)
		.toBe(true);
	expect(await carrierOf(owner, id)).toBeNull();

	// Phase 3: a pellet at the watcher costs them 3 points; the owner sees the hit marker.
	await pickUp(owner);
	const ownerFeet = await owner.evaluate(() => {
		const s = (window as unknown as GameWindow).__forestSession.scene;
		const p = s.controller.worldPosition;
		return { x: p.x, y: s.worldSurfaceSampler.getSupportingSurfaceY(p.x, p.z, p.y), z: p.z };
	});
	const targetFeet = await watcher.evaluate(
		({ x, z }) => {
			const s = (window as unknown as GameWindow).__forestSession.scene;
			const y = s.worldSurfaceSampler.getSupportingSurfaceY(x, z, Infinity);
			s.controller.restoreState({ x, y: y + 1.7, z }, 0, 0);
			return { x, y, z };
		},
		{ x: ownerFeet.x, z: ownerFeet.z - 8 }
	);
	// Stand still long enough for both the room and the owner's view to agree where they are.
	await watcher.waitForTimeout(2000);
	const before = await watcher.evaluate(
		() => (window as unknown as GameWindow).__forestSession.scene.getHealth().current
	);
	await owner.evaluate(
		({ ownerFeet, targetFeet }) => {
			const s = (window as unknown as GameWindow).__forestSession.scene;
			const eyeY = ownerFeet.y + 1.7;
			s.controller.restoreState(
				{ x: ownerFeet.x, y: eyeY, z: ownerFeet.z },
				0,
				Math.atan2(targetFeet.y + 1.1 - eyeY, 8)
			);
		},
		{ ownerFeet, targetFeet }
	);
	await owner.waitForTimeout(300);
	await owner.evaluate(() => {
		const s = (window as unknown as GameWindow).__forestSession.scene;
		s.setCarryTrigger(true);
		s.setCarryTrigger(false);
	});
	if (SHOTS) await owner.screenshot({ path: `${SHOTS}/online-pellet.png` });
	await expect(owner.getByTestId('punch-hit-marker')).toBeAttached({ timeout: 10_000 });
	await expect
		.poll(
			() =>
				watcher.evaluate(
					() => (window as unknown as GameWindow).__forestSession.scene.getHealth().current
				),
			{ timeout: 10_000 }
		)
		.toBe(before - 3);
	expect(
		await owner.evaluate(
			() => (window as unknown as GameWindow).__forestSession.scene.getHealth().current
		)
	).toBe(36);
	// The watcher saw the pellet too.
	await expect
		.poll(() =>
			watcher.evaluate(
				() => (window as unknown as GameWindow).__forestSession.scene.projectiles.launched
			)
		)
		.toBeGreaterThanOrEqual(1);
	await owner.keyboard.press('k');
	await expect
		.poll(() =>
			owner.evaluate(() => (window as unknown as GameWindow).__forestSession.scene.carry.carriedId)
		)
		.toBeNull();

	// The owner switches creature projectiles off: their new carry is put down by the room.
	const again = await pickUp(owner);
	await expect
		.poll(() => carrierOf(watcher, again), { timeout: 15_000 })
		.toEqual(expect.any(Number));
	await owner.evaluate(() =>
		(window as unknown as GameWindow).__forestSession.scene.setCreatureProjectilesRule(false)
	);
	await expect
		.poll(
			() =>
				owner.evaluate(
					() => (window as unknown as GameWindow).__forestSession.scene.getCarryState().carrying
				),
			{ timeout: 15_000 }
		)
		.toBe(false);
	await expect.poll(() => carrierOf(watcher, again), { timeout: 15_000 }).toBeNull();
	// And the watcher's pick-up is now refused, with a message.
	const refused = await watcher.evaluate(
		(id) => (window as unknown as GameWindow).__forestMultiplayer.claimCarry(id),
		again
	);
	expect(refused).toEqual({ ok: false, reason: 'rule' });
});

async function publishAndJoin(browser: Browser) {
	const owner = await newPlayer(browser);
	await owner.getByRole('button', { name: '← Main menu', exact: true }).click();
	await owner.getByRole('button', { name: 'Online', exact: true }).click();
	await owner.getByRole('tab', { name: 'Owner', exact: true }).click();
	await owner.getByTestId('owner-password').fill(ADMIN_KEY);
	await owner.getByTestId('owner-create-invites').click();
	await expect(owner.getByTestId('owner-publish-success')).toBeVisible({ timeout: 30_000 });
	await owner.getByTestId('owner-invite-role').selectOption('editor');
	const editorLink = await owner.getByTestId('invite-link-editor').locator('input').inputValue();
	await owner.getByRole('button', { name: 'Join as owner', exact: true }).click();
	await joinWorld(owner, 'Owner');
	const editor = await newPlayer(browser);
	await editor.goto(editorLink);
	await joinWorld(editor, 'Editor');
	await walking(owner);
	await walking(editor);
	return { owner, editor };
}

test('Lab-placed creatures are shared online: placed, carried and put down for everyone', async ({
	browser
}) => {
	test.setTimeout(600_000);
	const { owner, editor } = await publishAndJoin(browser);
	await owner.waitForTimeout(3000);

	// The owner places a copy of a small creature from their herd with the Creature Lab's call.
	let placedId = '';
	await expect
		.poll(
			async () =>
				(placedId = await owner.evaluate(() => {
					const s = (window as unknown as GameWindow).__forestSession.scene;
					for (const [id] of s.creatures.live) {
						const r = s.creatures.logical.get(id);
						if (!r || r.spawn.persistent) continue;
						const p = r.spawn.species.proportions;
						const h =
							(p.legLength + p.bodyDepth + p.neckLength + p.headSize) *
							r.spawn.individual.sizeFactor;
						if (h > 0.9 || r.spawn.species.bodyPlan.id !== 'quadruped') continue;
						return s.placeCreature({ species: r.spawn.species, individual: r.spawn.individual });
					}
					return '';
				})),
			{ timeout: 60_000 }
		)
		.not.toBe('');

	// It reaches the editor through the shared world.
	const placedAt = async (page: Page) =>
		page.evaluate(
			(id) =>
				(window as unknown as GameWindow).__forestSession.scene.creatures.state.individuals.find(
					(c) => c.id === id
				)?.position ?? null,
			placedId
		);
	await expect.poll(() => placedAt(editor), { timeout: 20_000 }).not.toBeNull();
	const spot = (await placedAt(editor))!;

	// The editor walks up to it and picks it up.
	let carried = false;
	for (let attempt = 0; attempt < 8 && !carried; attempt++) {
		await editor.evaluate((id) => {
			const s = (window as unknown as GameWindow).__forestSession.scene;
			const live = s.creatures.live.get(id);
			const r = s.creatures.logical.get(id);
			if (!live || !r) return;
			const p = live.compiled.object.position;
			const mid = p.y + live.compiled.compilation.collision.height / 2;
			const from = { x: p.x + 1.3, z: p.z };
			const eyeY = s.worldSurfaceSampler.getSupportingSurfaceY(from.x, from.z, Infinity) + 1.7;
			s.controller.restoreState(
				{ x: from.x, y: eyeY, z: from.z },
				Math.atan2(-(p.x - from.x), -(p.z - from.z)),
				Math.atan2(mid - eyeY, 1.3)
			);
		}, placedId);
		await editor.waitForTimeout(150);
		await editor.keyboard.press('k');
		await expect
			.poll(() =>
				editor.evaluate(() => (window as unknown as GameWindow).__forestSession.scene.carry.pending)
			)
			.toBe(false);
		carried =
			(await editor.evaluate(
				() => (window as unknown as GameWindow).__forestSession.scene.carry.carriedId
			)) === placedId;
		if (!carried) await editor.waitForTimeout(800);
	}
	expect(carried).toBe(true);
	await expect
		.poll(() => carrierOf(owner, placedId), { timeout: 15_000 })
		.toEqual(expect.any(Number));

	// Carried 8 m away and put down: the owner's saved world moves it there.
	const target = await editor.evaluate(
		({ spot }) => {
			const s = (window as unknown as GameWindow).__forestSession.scene;
			const x = spot.x + 8,
				z = spot.z;
			const y = s.worldSurfaceSampler.getSupportingSurfaceY(x, z, Infinity);
			s.controller.restoreState({ x, y: y + 1.7, z }, 0, 0);
			return { x, z };
		},
		{ spot }
	);
	await editor.waitForTimeout(600);
	await editor.keyboard.press('k');
	await expect.poll(() => carrierOf(owner, placedId), { timeout: 15_000 }).toBeNull();
	await expect
		.poll(
			async () => {
				const at = await placedAt(owner);
				return at ? Math.hypot(at.x - target.x, at.z - target.z) : Infinity;
			},
			{ timeout: 20_000 }
		)
		.toBeLessThan(2);
	expect(Math.hypot(spot.x - target.x, spot.z - target.z)).toBeGreaterThan(6);
});
