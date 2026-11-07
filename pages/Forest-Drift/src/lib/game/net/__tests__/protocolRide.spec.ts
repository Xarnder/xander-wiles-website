import { describe, expect, it, vi } from 'vitest';
import { PROTOCOL_VERSION, parseClientMessage, parseServerMessage } from '../protocol';
import { CreatureClaims } from '../CreatureClaims';
import { riderPoseAt } from '../../player/creatureProjectile';

/** Riding: protocol v8 messages, the client's claim bookkeeping, and the room's rider lead. */
const parse = (value: unknown) => parseClientMessage(JSON.stringify(value));

describe('protocol v8 — riding', () => {
	it('is version 8 or later', () => {
		expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(8);
	});

	it('parses ride and dismount, rejecting bad ids, creatures and positions', () => {
		expect(parse({ t: 'ride', id: 3, creature: 'group:forest:1:2:0:0' })).toEqual({
			t: 'ride',
			id: 3,
			creature: 'group:forest:1:2:0:0'
		});
		expect(parse({ t: 'ride', id: -1, creature: 'x' })).toBeNull();
		expect(parse({ t: 'ride', id: 1, creature: '' })).toBeNull();
		expect(parse({ t: 'ride', id: 1, creature: 'x'.repeat(161) })).toBeNull();
		expect(parse({ t: 'dismount', id: 4, at: [1, 2, 3, 0.5] })).toEqual({
			t: 'dismount',
			id: 4,
			at: [1, 2, 3, 0.5]
		});
		expect(parse({ t: 'dismount', id: 4, at: [1, 2, 3] })).toBeNull();
		expect(parse({ t: 'dismount', id: 4, at: [1e9, 2, 3, 0] })).toBeNull();
	});

	it('accepts the room’s rideResult and ridden', () => {
		expect(parseServerMessage(JSON.stringify({ t: 'rideResult', id: 1, ok: true }))).toEqual({
			t: 'rideResult',
			id: 1,
			ok: true
		});
		expect(parseServerMessage(JSON.stringify({ t: 'ridden', slot: 2, creature: null }))).toEqual({
			t: 'ridden',
			slot: 2,
			creature: null
		});
	});
});

describe('CreatureClaims', () => {
	it('resolves a claim with the room’s answer and records the holder', async () => {
		const claims = new CreatureClaims(2000);
		const sent: number[] = [];
		const result = claims.claim('c1', (id) => (sent.push(id), true));
		expect(claims.answer(sent[0], true, undefined, 3)).toBe(true);
		await expect(result).resolves.toEqual({ ok: true, reason: undefined });
		expect(claims.held.get(3)).toBe('c1');
	});

	it('times out, and reports a late grant so it can be handed back', async () => {
		vi.useFakeTimers();
		try {
			const claims = new CreatureClaims(2000);
			let id = -1;
			const result = claims.claim('c1', (sent) => ((id = sent), true));
			vi.advanceTimersByTime(2001);
			await expect(result).resolves.toEqual({ ok: false, reason: 'timeout' });
			expect(claims.answer(id, true, undefined, 3)).toBe(false);
			expect(claims.held.size).toBe(0);
		} finally {
			vi.useRealTimers();
		}
	});

	it('fails at once when the message can’t be sent, and settles everything on a drop', async () => {
		const claims = new CreatureClaims(2000);
		await expect(claims.claim('c1', () => false)).resolves.toEqual({
			ok: false,
			reason: 'offline'
		});
		const waiting = claims.claim('c2', () => true);
		claims.settle({ ok: false, reason: 'offline' });
		await expect(waiting).resolves.toEqual({ ok: false, reason: 'offline' });
	});

	it('applies changes, skips its own release echoing back, and reconciles on rejoin', () => {
		const claims = new CreatureClaims(2000);
		const changes: unknown[] = [];
		const record = (...args: unknown[]) => changes.push(args);
		claims.apply(1, 'a', 0, record);
		claims.apply(1, null, 0, record);
		expect(changes).toEqual([
			[1, 'a', null, false],
			[1, null, 'a', false]
		]);
		changes.length = 0;
		claims.apply(0, null, 0, record);
		expect(changes).toEqual([]);
		claims.apply(2, 'b', 0, record);
		claims.apply(4, 'd', 0, record);
		changes.length = 0;
		claims.reconcile(
			[
				{ slot: 2, creature: 'b' },
				{ slot: 5, creature: 'e' }
			],
			0,
			record
		);
		expect(changes).toEqual([
			[4, null, 'd', false],
			[5, 'e', null, false]
		]);
	});
});

describe('riderPoseAt', () => {
	const at = (x: number, z: number, sampleTime: number) => ({ x, y: 0, z, sampleTime });

	it('carries a rider forward along their velocity, a little way only', () => {
		const moved = riderPoseAt(at(0, 0, 0), at(1.8, 0, 100), 350, 22);
		expect(moved.x).toBeCloseTo(1.8 + 18 * 0.25, 9);
		expect(riderPoseAt(at(0, 0, 0), at(1.8, 0, 100), 5000, 22).x).toBeCloseTo(1.8 + 18 * 0.3, 9);
	});

	it('never faster than the room allows, never backwards in time, and not without two poses', () => {
		expect(riderPoseAt(at(0, 0, 0), at(10, 0, 100), 200, 22).x).toBeCloseTo(10 + 2.2, 9);
		expect(riderPoseAt(at(0, 0, 0), at(1, 0, 100), 50, 22).x).toBe(1);
		expect(riderPoseAt(null, at(1, 0, 100), 300, 22).x).toBe(1);
	});
});
