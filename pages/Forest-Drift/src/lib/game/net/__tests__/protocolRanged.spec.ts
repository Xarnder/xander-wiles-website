import { describe, expect, it } from 'vitest';
import {
	PROTOCOL_VERSION,
	parseClientMessage,
	parseServerMessage,
	parseSharedEnvironment
} from '../protocol';

/** Ranged weapons: protocol v6 messages. */
const parse = (value: unknown) => parseClientMessage(JSON.stringify(value));

describe('protocol v6 — carrying and pellets', () => {
	it('is version 6', () => {
		expect(PROTOCOL_VERSION).toBe(6);
	});

	it('parses carry and drop, rejecting bad ids, creatures and positions', () => {
		expect(parse({ t: 'carry', id: 3, creature: 'group:forest:1:2:0:0' })).toEqual({
			t: 'carry',
			id: 3,
			creature: 'group:forest:1:2:0:0'
		});
		expect(parse({ t: 'carry', id: -1, creature: 'x' })).toBeNull();
		expect(parse({ t: 'carry', id: 1.5, creature: 'x' })).toBeNull();
		expect(parse({ t: 'carry', id: 1, creature: '' })).toBeNull();
		expect(parse({ t: 'carry', id: 1, creature: 'x'.repeat(161) })).toBeNull();
		expect(parse({ t: 'carry', id: 1, creature: 7 })).toBeNull();
		expect(parse({ t: 'drop', id: 4, at: [1, 2, 3, 0.5] })).toEqual({
			t: 'drop',
			id: 4,
			at: [1, 2, 3, 0.5]
		});
		expect(parse({ t: 'drop', id: 4, at: [1, 2, 3] })).toBeNull();
		expect(parse({ t: 'drop', id: 4, at: [1, 2, 'x', 0] })).toBeNull();
		expect(parse({ t: 'drop', id: 4, at: [1e9, 2, 3, 0] })).toBeNull();
		// JSON can't carry NaN, but a hand-written message can say null.
		expect(parse({ t: 'drop', id: 4, at: [null, 2, 3, 0] })).toBeNull();
	});

	it('parses shoot and shotHit, requiring a unit direction and a valid target', () => {
		const shoot = { t: 'shoot', shot: 1, origin: [0, 1, 0], dir: [0, 0, -1], at: 5 };
		expect(parse(shoot)).toEqual(shoot);
		expect(parse({ ...shoot, dir: [0, 0, -2] })).toBeNull();
		expect(parse({ ...shoot, dir: [0, 0] })).toBeNull();
		expect(parse({ ...shoot, at: 'now' })).toBeNull();
		const hit = { t: 'shotHit', shot: 1, target: 2, at: 6, point: [0, 1, -10] };
		expect(parse(hit)).toEqual(hit);
		expect(parse({ ...hit, target: 256 })).toBeNull();
		expect(parse({ ...hit, target: -1 })).toBeNull();
	});

	it('accepts the new server messages', () => {
		for (const t of ['carryResult', 'carried', 'shot', 'shotResult'])
			expect(parseServerMessage(JSON.stringify({ t }))?.t).toBe(t);
	});

	it("keeps the owner's creature-projectiles rule in the shared environment", () => {
		const env = parseSharedEnvironment({
			anchor: { roomSeconds: 0, timeOfDay: 0.5, weatherTime: 0 },
			sky: {},
			weather: {},
			rules: { creatureProjectiles: false, junk: 1 }
		});
		expect(env?.rules).toEqual({ creatureProjectiles: false });
	});
});
