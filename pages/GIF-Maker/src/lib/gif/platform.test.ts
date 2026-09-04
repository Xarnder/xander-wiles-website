import { describe, expect, it } from 'vitest';
import {
	canShareFiles,
	prefersNativeShareSave,
	shouldUseMultiThreadFfmpeg,
	type NavigatorLike
} from './platform';

function nav(partial: Partial<NavigatorLike>): NavigatorLike {
	return {
		userAgent: '',
		platform: 'MacIntel',
		maxTouchPoints: 0,
		...partial
	};
}

describe('prefersNativeShareSave', () => {
	it('detects iPhone Safari and Chrome on iOS', () => {
		expect(
			prefersNativeShareSave(
				nav({
					userAgent:
						'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
				})
			)
		).toBe(true);
		expect(
			prefersNativeShareSave(
				nav({
					userAgent:
						'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.153 Mobile/15E148 Safari/604.1'
				})
			)
		).toBe(true);
	});

	it('detects iPadOS that reports as Macintosh', () => {
		expect(
			prefersNativeShareSave(
				nav({
					userAgent:
						'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
					platform: 'MacIntel',
					maxTouchPoints: 5
				})
			)
		).toBe(true);
	});

	it('does not treat desktop Mac Safari or Chrome as iOS', () => {
		expect(
			prefersNativeShareSave(
				nav({
					userAgent:
						'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
					platform: 'MacIntel',
					maxTouchPoints: 0
				})
			)
		).toBe(false);
		expect(
			prefersNativeShareSave(
				nav({
					userAgent:
						'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
					platform: 'MacIntel',
					maxTouchPoints: 0
				})
			)
		).toBe(false);
	});
});

describe('shouldUseMultiThreadFfmpeg', () => {
	it('uses the single-thread core on iOS even when isolated', () => {
		expect(shouldUseMultiThreadFfmpeg(true, true)).toBe(false);
		expect(shouldUseMultiThreadFfmpeg(true, false)).toBe(true);
		expect(shouldUseMultiThreadFfmpeg(false, false)).toBe(false);
	});
});

describe('canShareFiles', () => {
	it('requires a working canShare(files) implementation', () => {
		const file = new File([new Uint8Array([71, 73, 70])], 'clip.gif', { type: 'image/gif' });
		expect(canShareFiles(file, nav({}))).toBe(false);
		expect(
			canShareFiles(
				file,
				nav({
					canShare: (data) => Array.isArray(data.files) && data.files.length === 1
				})
			)
		).toBe(true);
		expect(
			canShareFiles(
				file,
				nav({
					canShare: () => {
						throw new Error('unsupported');
					}
				})
			)
		).toBe(false);
	});
});
