import { describe, expect, it } from 'vitest';
import {
	CarryController,
	type CarryHost,
	type CarryPrompt,
	type CarryState
} from '../CarryController';
import {
	CHARGES_MAX,
	CHARGE_REGEN_MS,
	MIN_SHOT_GAP_MS,
	type Vec3Like
} from '../creatureProjectile';
import { regionSpecies } from '../../creatures/CreaturePopulationSystem';
import { generateIndividual } from '../../creatures/IndividualGenerator';

const species = regionSpecies('forest', 0, 0)[0];
const definition = { species, individual: generateIndividual(species, 1) };

function setup() {
	const world = {
		now: 0,
		input: true,
		stowed: false,
		mustRelease: false,
		other: false,
		target: true as boolean,
		herd: new Set(['c1']),
		carried: new Set<string>(),
		muzzle: { x: 0, y: 1, z: 0 } as Vec3Like | null,
		launches: [] as { origin: Vec3Like; dir: Vec3Like; colour: string }[],
		released: [] as { id: string; at: Vec3Like }[],
		attached: 0,
		detached: 0,
		dry: 0
	};
	const host: CarryHost = {
		now: () => world.now,
		eye: () => ({ x: 0, y: 1.7, z: 0 }),
		aim: () => ({ x: 0, y: 0, z: -1 }),
		feet: () => ({ x: 0, y: 0, z: -0.8 }),
		yaw: () => 0,
		inputAllowed: () => world.input,
		stowed: () => world.stowed,
		mustRelease: () => world.mustRelease,
		otherInteractionTargeted: () => world.other,
		pick: () => (world.target && world.herd.has('c1') ? { id: 'c1', definition } : null),
		carry: (id) => {
			if (!world.herd.delete(id)) return null;
			world.carried.add(id);
			return definition;
		},
		release: (id, at) => {
			world.carried.delete(id);
			world.herd.add(id);
			world.released.push({ id, at });
		},
		isCarried: (id) => world.carried.has(id),
		attach: () => world.attached++,
		detach: () => world.detached++,
		muzzle: () => world.muzzle,
		launch: (origin, dir, colour) => world.launches.push({ origin, dir, colour }),
		dryFire: () => world.dry++
	};
	const log = {
		states: [] as CarryState[],
		prompts: [] as (CarryPrompt | null)[],
		events: [] as string[]
	};
	const controller = new CarryController(host, {
		change: (s) => log.states.push(s),
		prompt: (p) => log.prompts.push(p),
		pickedUp: (s) => log.events.push(`up:${s}`),
		putDown: (s) => log.events.push(`down:${s}`)
	});
	return { world, controller, log };
}

describe('CarryController', () => {
	it('prompts for the creature under the crosshair and picks it up with K', () => {
		const { world, controller, log } = setup();
		controller.update(0.2);
		expect(log.prompts.at(-1)).toEqual({ label: `Pick up ${species.name}`, carrying: false });
		expect(controller.toggle()).toBe(true);
		expect(controller.carrying).toBe(true);
		expect(world.carried.has('c1')).toBe(true);
		expect(world.attached).toBe(1);
		expect(log.events).toEqual([`up:${species.name}`]);
		expect(log.states.at(-1)).toMatchObject({ carrying: true, charges: CHARGES_MAX });
		expect(log.prompts.at(-1)).toEqual({ label: 'Put down', carrying: true });
	});

	it('leaves K to a seat or door under the crosshair, and to nothing when there is no target', () => {
		const { world, controller } = setup();
		world.other = true;
		expect(controller.toggle()).toBe(false);
		world.other = false;
		world.target = false;
		expect(controller.toggle()).toBe(false);
		expect(controller.carrying).toBe(false);
	});

	it('does nothing without input (menus, no pointer lock) or while stowed', () => {
		const { world, controller } = setup();
		world.input = false;
		expect(controller.toggle()).toBe(false);
		world.input = true;
		world.stowed = true;
		expect(controller.toggle()).toBe(false);
	});

	it('fires toward the crosshair until the charges run out, then dry-fires', () => {
		const { world, controller } = setup();
		controller.toggle();
		for (let i = 0; i < CHARGES_MAX; i++) {
			expect(controller.fire()).toBe(true);
			world.now += MIN_SHOT_GAP_MS;
		}
		// Just after the fifth shot: empty, and the first charge hasn't come back yet.
		world.now -= MIN_SHOT_GAP_MS - 50;
		expect(world.now).toBeLessThan(CHARGE_REGEN_MS);
		expect(controller.fire()).toBe(false);
		expect(world.dry).toBe(1);
		expect(world.launches).toHaveLength(CHARGES_MAX);
		const { dir, colour } = world.launches[0];
		expect(Math.hypot(dir.x, dir.y, dir.z)).toBeCloseTo(1);
		expect(dir.z).toBeLessThan(-0.99); // converges on the crosshair 20 m ahead
		expect(colour).toBe(species.appearance.palette.accent);
	});

	it('respects the minimum gap between shots', () => {
		const { world, controller } = setup();
		controller.toggle();
		expect(controller.fire()).toBe(true);
		world.now += MIN_SHOT_GAP_MS - 1;
		expect(controller.fire()).toBe(false);
		expect(world.dry).toBe(0);
	});

	it('repeats while the trigger is held, and stops when input is lost', () => {
		const { world, controller } = setup();
		controller.toggle();
		controller.setTrigger(true);
		expect(world.launches).toHaveLength(1);
		world.now += MIN_SHOT_GAP_MS;
		controller.update(0.016);
		expect(world.launches).toHaveLength(2);
		world.input = false;
		world.now += MIN_SHOT_GAP_MS;
		controller.update(0.016);
		world.input = true;
		world.now += MIN_SHOT_GAP_MS;
		controller.update(0.016);
		expect(world.launches).toHaveLength(2);
	});

	it("won't fire while stowed or before the creature is drawn", () => {
		const { world, controller } = setup();
		controller.toggle();
		world.stowed = true;
		expect(controller.fire()).toBe(false);
		world.stowed = false;
		world.muzzle = null;
		expect(controller.fire()).toBe(false);
		expect(world.launches).toHaveLength(0);
	});

	it('puts the creature down at the feet with K, and automatically when sitting or knocked out', () => {
		const { world, controller, log } = setup();
		controller.toggle();
		expect(controller.toggle()).toBe(true);
		expect(controller.carrying).toBe(false);
		expect(world.released).toEqual([{ id: 'c1', at: { x: 0, y: 0, z: -0.8 } }]);
		expect(world.detached).toBe(1);
		controller.toggle();
		world.mustRelease = true;
		controller.update(0.016);
		expect(controller.carrying).toBe(false);
		expect(world.released).toHaveLength(2);
		expect(log.events.filter((e) => e.startsWith('down:'))).toHaveLength(2);
	});

	it('lets go without putting anything down when the world forgets the creature', () => {
		const { world, controller } = setup();
		controller.toggle();
		world.carried.clear(); // e.g. the world's seed changed
		controller.update(0.016);
		expect(controller.carrying).toBe(false);
		expect(world.released).toHaveLength(0);
		expect(world.detached).toBe(1);
	});
});

describe('CarryController online (the room decides)', () => {
	function online(answer: { ok: boolean; reason?: string } | 'never') {
		const ctx = setup();
		const claims: string[] = [];
		let settle: ((r: { ok: boolean; reason?: string }) => void) | null = null;
		const controller = ctx.controller as unknown as { host: CarryHost };
		controller.host.claim = (id) => {
			claims.push(id);
			return new Promise((resolve) => {
				settle = resolve;
				if (answer !== 'never') resolve(answer);
			});
		};
		return { ...ctx, claims, settle: (r: { ok: boolean; reason?: string }) => settle?.(r) };
	}
	const flush = () => new Promise((r) => setTimeout(r, 0));

	it('waits for the room before carrying, and swallows repeat presses meanwhile', async () => {
		const { world, controller, claims, log, settle } = online('never');
		expect(controller.toggle()).toBe(true);
		expect(controller.pending).toBe(true);
		expect(controller.carrying).toBe(false);
		expect(log.prompts.at(-1)?.label).toBe(`Picking up ${species.name}…`);
		expect(controller.toggle()).toBe(true);
		expect(claims).toEqual(['c1']);
		settle({ ok: true });
		await flush();
		expect(controller.carrying).toBe(true);
		expect(world.carried.has('c1')).toBe(true);
	});

	it('reports a refusal and carries nothing', async () => {
		const { world, controller, log } = online({ ok: false, reason: 'taken' });
		const refused: string[] = [];
		(controller as unknown as { events: { refused?: (r: string) => void } }).events.refused = (r) =>
			refused.push(r);
		controller.toggle();
		await flush();
		expect(controller.carrying).toBe(false);
		expect(controller.pending).toBe(false);
		expect(world.carried.size).toBe(0);
		expect(refused).toEqual(['taken']);
		expect(log.events).toEqual([]);
	});

	it('hands a granted creature straight back when this world cannot hold it', async () => {
		const { world, controller } = online({ ok: true });
		world.herd.clear(); // gone from this herd, and the host refuses to build it
		const host = (controller as unknown as { host: CarryHost }).host;
		host.carry = () => null;
		world.target = true;
		host.pick = () => ({ id: 'c1', definition });
		controller.toggle();
		await flush();
		expect(controller.carrying).toBe(false);
		expect(world.released).toEqual([{ id: 'c1', at: { x: 0, y: 0, z: -0.8 } }]);
	});

	it('puts the creature down where the room says when the room ends the carry', async () => {
		const { world, controller, log } = online({ ok: true });
		controller.toggle();
		await flush();
		controller.forceRelease('c1', { x: 5, y: 0, z: 6 }, 1);
		expect(controller.carrying).toBe(false);
		expect(world.released.at(-1)).toEqual({ id: 'c1', at: { x: 5, y: 0, z: 6 } });
		expect(log.events.at(-1)).toBe(`down:${species.name}`);
		// A stale release for something else changes nothing.
		controller.forceRelease('other', null, null);
		expect(world.released).toHaveLength(1);
	});
});
