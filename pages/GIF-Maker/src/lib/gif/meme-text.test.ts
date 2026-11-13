import { describe, expect, it } from 'vitest';
import { fitMemeText } from './meme-text';

const measure = (text: string, size: number) => Array.from(text).length * size * 0.65;

describe('automatic meme text sizing', () => {
	it('omits blank captions', () => {
		expect(fitMemeText(' \n ', 16 / 9, measure).lines).toEqual([]);
	});
	it('uppercases captions and honours explicit line breaks', () => {
		expect(fitMemeText('hello\nworld', 16 / 9, measure).lines).toEqual(['HELLO', 'WORLD']);
	});
	it.each([16 / 9, 9 / 16, 4, 1])(
		'fits long captions inside the top of a %s aspect ratio',
		(ratio) => {
			const text =
				'When you finally finish the project but somebody asks for just one more tiny change';
			const result = fitMemeText(text, ratio, measure);
			expect(result.lines.every((line) => measure(line, result.size) <= 930)).toBe(true);
			expect(result.lines.length * result.size * 1.15).toBeLessThanOrEqual(result.height * 0.3);
			expect(result.lines.join(' ')).toBe(text.toUpperCase());
		}
	);
	it('wraps a long unbroken word without losing characters', () => {
		const text = 'A'.repeat(180);
		const result = fitMemeText(text, 16 / 9, measure);
		expect(result.lines.join('')).toBe(text);
		expect(result.lines.every((line) => measure(line, result.size) <= 930)).toBe(true);
	});
});
