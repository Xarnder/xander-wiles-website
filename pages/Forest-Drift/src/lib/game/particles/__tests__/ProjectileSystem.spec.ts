import { describe, expect, it } from 'vitest';
import { MAX_PROJECTILES, ProjectileSystem, type ProjectileImpact } from '../ProjectileSystem';
import type { Vec3Like } from '../../player/creatureProjectile';

/** A flat world at y = 0, optionally with a wall across −Z at `wallZ`. */
function system(wallZ: number | null = null) {
	const impacts: ProjectileImpact[] = [];
	const projectiles = new ProjectileSystem(
		{
			collide(from: Vec3Like, to: Vec3Like) {
				const steps = 40;
				for (let i = 1; i <= steps; i++) {
					const k = i / steps;
					const p = {
						x: from.x + (to.x - from.x) * k,
						y: from.y + (to.y - from.y) * k,
						z: from.z + (to.z - from.z) * k
					};
					if (p.y <= 0) return p;
					if (wallZ !== null && p.z <= wallZ && from.z > wallZ) return p;
				}
				return null;
			}
		},
		null,
		() => {}
	);
	projectiles.onImpact = (impact) => impacts.push(impact);
	return { projectiles, impacts };
}

const origin = { x: 0, y: 1.5, z: 0 };
const forward = { x: 0, y: 0, z: -1 };

function run(projectiles: ProjectileSystem, untilMs = 1500) {
	for (let t = 0; t <= untilMs; t += 1000 / 30) projectiles.update(t);
}

describe('ProjectileSystem', () => {
	it("reports this player's pellet meeting another player", () => {
		const { projectiles, impacts } = system();
		projectiles.targets = () => [{ slot: 4, x: 0, y: 0, z: -10 }];
		projectiles.spawn(origin, forward, '#ffcc00', 0, 7);
		run(projectiles);
		expect(impacts).toHaveLength(1);
		expect(impacts[0]).toMatchObject({ kind: 'player', slot: 4, shot: 7 });
		const hit = impacts[0] as Extract<ProjectileImpact, { kind: 'player' }>;
		expect(hit.flightMs).toBeGreaterThan(250);
		expect(hit.flightMs).toBeLessThan(300);
		expect(projectiles.playerHits).toBe(1);
	});

	it('lets a wall in front of the target stop the pellet first', () => {
		const { projectiles, impacts } = system(-5);
		projectiles.targets = () => [{ slot: 4, x: 0, y: 0, z: -10 }];
		projectiles.spawn(origin, forward, '#ffcc00', 0, 7);
		run(projectiles);
		expect(impacts.map((i) => i.kind)).toEqual(['world']);
	});

	it("never reports hits for other players' pellets (no shot id)", () => {
		const { projectiles, impacts } = system();
		projectiles.targets = () => [{ slot: 4, x: 0, y: 0, z: -10 }];
		projectiles.spawn(origin, forward, '#ffcc00', 0);
		run(projectiles);
		expect(impacts.every((i) => i.kind !== 'player')).toBe(true);
	});

	it('removes pellets that hit nothing at the end of their 30 m', () => {
		const { projectiles, impacts } = system();
		projectiles.spawn({ x: 0, y: 50, z: 0 }, forward, '#ffcc00', 0);
		run(projectiles);
		expect(impacts.map((i) => i.kind)).toEqual(['expired']);
		expect(projectiles.activeCount).toBe(0);
	});

	it("removes this player's pellet when the room refuses it", () => {
		const { projectiles, impacts } = system();
		projectiles.targets = () => [{ slot: 4, x: 0, y: 0, z: -10 }];
		projectiles.spawn(origin, forward, '#ffcc00', 0, 7);
		projectiles.update(50);
		expect(projectiles.cancelShot(7)).toBe(true);
		run(projectiles);
		expect(impacts).toEqual([]);
		expect(projectiles.cancelShot(7)).toBe(false);
	});

	it("keeps room for this player's own pellet when others' fill the pool", () => {
		const { projectiles, impacts } = system();
		projectiles.targets = () => [{ slot: 4, x: 0, y: 0, z: -10 }];
		for (let i = 0; i < MAX_PROJECTILES; i++)
			expect(projectiles.spawn({ x: 100, y: 50, z: 0 }, forward, '#ffffff', i)).toBe(true);
		expect(projectiles.spawn({ x: 100, y: 50, z: 0 }, forward, '#ffffff', 100)).toBe(false);
		expect(projectiles.spawn(origin, forward, '#ffcc00', 100, 9)).toBe(true);
		expect(projectiles.activeCount).toBe(MAX_PROJECTILES);
		run(projectiles, 1600);
		expect(impacts.filter((i) => i.kind === 'player')).toMatchObject([{ slot: 4, shot: 9 }]);
	});

	it("stops other players' pellets at bodies, this player's included, without reporting", () => {
		const { projectiles, impacts } = system();
		projectiles.bodies = () => [{ slot: -1, x: 0, y: 0, z: -10 }];
		projectiles.spawn(origin, forward, '#ffcc00', 0);
		run(projectiles);
		expect(impacts.map((i) => i.kind)).toEqual(['body']);
		expect(projectiles.playerHits).toBe(0);
	});
});
