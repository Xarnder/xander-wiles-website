import { describe, expect, it } from 'vitest';
import { MAX_SCORE_ENTRIES, ScoreBoard, scoreRows } from '../playerScores';
import { parseClientMessage, parseServerMessage } from '../protocol';

const sam = { playerId: 'sam', name: 'Sam' };
const alex = { playerId: 'alex', name: 'Alex' };

describe('ScoreBoard', () => {
	it('counts a hit for the attacker, and a knockout for them and against the target', () => {
		const board = new ScoreBoard();
		expect(board.hit(sam, alex, false)).toEqual([
			{ playerId: 'sam', name: 'Sam', hits: 1, knockouts: 0, knockedOut: 0 }
		]);
		expect(board.hit(sam, alex, true)).toEqual([
			{ playerId: 'sam', name: 'Sam', hits: 2, knockouts: 1, knockedOut: 0 },
			{ playerId: 'alex', name: 'Alex', hits: 0, knockouts: 0, knockedOut: 1 }
		]);
	});

	it('counts a knockout by a fall against the player only', () => {
		const board = new ScoreBoard();
		expect(board.knockedOut(alex)).toEqual([
			{ playerId: 'alex', name: 'Alex', hits: 0, knockouts: 0, knockedOut: 1 }
		]);
	});

	it('keeps the latest name, round-trips through JSON and survives damage', () => {
		const board = new ScoreBoard();
		board.hit(sam, alex, true);
		board.hit({ playerId: 'sam', name: 'Samuel' }, alex, false);
		const again = new ScoreBoard(board.toJson());
		expect(again.list()).toEqual(board.list());
		expect(again.list().find((e) => e.playerId === 'sam')?.name).toBe('Samuel');
		expect(new ScoreBoard('{nope').size).toBe(0);
		expect(new ScoreBoard('[{"playerId":"x","hits":-3,"knockouts":"7"}]').list()).toEqual([
			{ playerId: 'x', name: '', hits: 0, knockouts: 0, knockedOut: 0 }
		]);
	});

	it(`keeps at most ${MAX_SCORE_ENTRIES} players, dropping the least recently active`, () => {
		const board = new ScoreBoard();
		board.hit(sam, alex, false);
		for (let i = 0; i < MAX_SCORE_ENTRIES; i++)
			board.knockedOut({ playerId: `p${i}`, name: `P${i}` });
		expect(board.size).toBe(MAX_SCORE_ENTRIES);
		expect(board.list().some((e) => e.playerId === 'sam')).toBe(false);
	});

	it('resets', () => {
		const board = new ScoreBoard();
		board.hit(sam, alex, true);
		board.reset();
		expect(board.list()).toEqual([]);
	});
});

describe('scoreRows', () => {
	it('lists records and everyone online, best first, marking you and who is here', () => {
		const rows = scoreRows(
			[
				{ playerId: 'sam', name: 'Sam', hits: 9, knockouts: 1, knockedOut: 2 },
				{ playerId: 'alex', name: 'Alex', hits: 3, knockouts: 2, knockedOut: 0 },
				{ playerId: 'gone', name: 'Gone', hits: 9, knockouts: 1, knockedOut: 0 }
			],
			[
				{ playerId: 'sam', name: 'Sammy', colour: '#e6194b', offline: false },
				{ playerId: 'new', name: 'Newbie', colour: '#4363d8', offline: false }
			],
			'sam'
		);
		expect(rows.map((r) => [r.name, r.online, r.self, r.colour])).toEqual([
			['Alex', false, false, null],
			// Same knockouts and hits: fewer times knocked out ranks higher.
			['Gone', false, false, null],
			['Sammy', true, true, '#e6194b'],
			['Newbie', true, false, '#4363d8']
		]);
		expect(rows[3]).toMatchObject({ hits: 0, knockouts: 0, knockedOut: 0 });
	});
});

describe('stats messages', () => {
	it('parse on both sides', () => {
		expect(parseClientMessage('{"t":"resetScores"}')).toEqual({ t: 'resetScores' });
		expect(parseServerMessage('{"t":"scores","entries":[]}')).toEqual({ t: 'scores', entries: [] });
	});
});
