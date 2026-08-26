import { describe, expect, it } from 'vitest';
import { createConfettiBurst, pieceOpacity, stepConfetti } from './confetti';

function cycleRandom(): () => number {
	let i = 0;
	return () => {
		i = (i + 1) % 10;
		return i / 10;
	};
}

describe('createConfettiBurst', () => {
	it('spawns side cannons plus a delayed center fountain', () => {
		const pieces = createConfettiBurst({
			width: 400,
			height: 800,
			colors: ['#2bb39a'],
			now: 1000,
			random: cycleRandom()
		});
		expect(pieces).toHaveLength(140);
		expect(pieces.every((piece) => piece.color === '#2bb39a')).toBe(true);

		const delayed = pieces.filter((piece) => piece.born > 1000);
		expect(delayed).toHaveLength(36);
		expect(delayed.every((piece) => piece.y < 800)).toBe(true);
	});

	it('falls back when colors are empty', () => {
		const pieces = createConfettiBurst({
			width: 200,
			height: 200,
			colors: [],
			random: cycleRandom()
		});
		expect(pieces.length).toBeGreaterThan(0);
		expect(pieces.every((piece) => piece.color.startsWith('#'))).toBe(true);
	});
});

describe('stepConfetti', () => {
	it('leaves delayed pieces still until they are born', () => {
		const pieces = createConfettiBurst({
			width: 400,
			height: 800,
			colors: ['#fff'],
			now: 0,
			random: cycleRandom()
		});
		const delayed = pieces.find((piece) => piece.born > 0);
		expect(delayed).toBeTruthy();
		const y = delayed!.y;
		const x = delayed!.x;
		stepConfetti(pieces, 0.016, 0, 800);
		expect(delayed!.x).toBe(x);
		expect(delayed!.y).toBe(y);
	});

	it('applies gravity after birth and culls finished pieces', () => {
		const pieces = createConfettiBurst({
			width: 400,
			height: 200,
			colors: ['#fff'],
			now: 0,
			random: cycleRandom()
		});
		const first = pieces[0]!;
		const startVy = first.vy;
		let next = pieces;
		for (let i = 0; i < 24; i += 1) {
			next = stepConfetti(next, 0.05, 40 + i * 50, 200);
		}
		expect(first.vy).toBeGreaterThan(startVy);
		expect(stepConfetti(next, 0.05, 20_000, 200)).toHaveLength(0);
	});
});

describe('pieceOpacity', () => {
	it('is hidden before birth and fades at the end of life', () => {
		const piece = createConfettiBurst({
			width: 100,
			height: 100,
			colors: ['#fff'],
			now: 50,
			random: cycleRandom()
		})[0]!;
		expect(pieceOpacity(piece, 0)).toBe(0);
		expect(pieceOpacity(piece, piece.born + 10)).toBe(1);
		expect(pieceOpacity(piece, piece.born + piece.life)).toBe(0);
	});
});
