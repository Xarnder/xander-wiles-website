import { describe, expect, it } from 'vitest';
import { TransferProgress } from './progress';
describe('speech transfer estimates', () => {
	it('measures observed bytes over time and estimates only the current file', () => {
		const tracker = new TransferProgress();
		expect(tracker.update('model', 100, 1000, 0).etaSeconds).toBeUndefined();
		const progress = tracker.update('model', 500, 1000, 2000);
		expect(progress.bytesPerSecond).toBe(200);
		expect(progress.etaSeconds).toBe(2.5);
		expect(tracker.update('tokenizer', 100, 200, 2100).bytesPerSecond).toBeUndefined();
	});
	it('does not invent totals or an ETA for unknown sizes or instant cache reads', () => {
		const tracker = new TransferProgress();
		expect(tracker.update('cached', 1000, 1000, 0).etaSeconds).toBeUndefined();
		tracker.update('unknown', 100, 100, 0);
		expect(tracker.update('unknown', 300, 300, 1000).total).toBeUndefined();
		expect(tracker.update('unknown', 500, 0, 2000).etaSeconds).toBeUndefined();
		expect(tracker.update('unknown', 600, 100, 3000).total).toBeUndefined();
	});
	it('resets its estimate when a file transfer restarts', () => {
		const tracker = new TransferProgress();
		tracker.update('model', 500, 1000, 0);
		expect(tracker.update('model', 100, 1000, 2000).bytesPerSecond).toBeUndefined();
	});
});
