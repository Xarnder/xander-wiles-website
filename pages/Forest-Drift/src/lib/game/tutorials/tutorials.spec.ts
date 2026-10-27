import { expect, it } from 'vitest';
import { lessons } from './tutorials';
import { LIMITS, phrases } from '../speech/types';
it('keeps both scripts within the bounded preparation and cache budgets', () => {
	for (const touch of [false, true]) {
		const script = lessons(touch);
		const clips = script.flatMap((lesson) => phrases(lesson.text));
		expect(clips.length).toBeLessThanOrEqual(LIMITS.preparationPhrases);
		expect(clips.length).toBeLessThanOrEqual(LIMITS.diskClips);
		expect(new Set(script.map((lesson) => lesson.id)).size).toBe(script.length);
		expect(script.slice(0, 3).map((lesson) => lesson.id)).toEqual(['look', 'move', 'hotbar']);
		for (const id of [
			'foundation',
			'walls',
			'doors',
			'windows',
			'beams',
			'ceiling',
			'floor',
			'roof',
			'stairs',
			'planks',
			'tiles',
			'carpet',
			'path',
			'shovel',
			'objects'
		]) {
			expect(script.find((lesson) => lesson.id === id)?.action).toBe('continue');
		}
	}
});
