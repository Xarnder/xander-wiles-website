import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FFmpeg } from '@ffmpeg/ffmpeg';
import { encoderOperation } from './encoder-operation';

function worker() {
	return { terminate: vi.fn() } as unknown as FFmpeg;
}

afterEach(() => vi.useRealTimers());

describe('encoder operation recovery', () => {
	it('terminates an unresponsive worker and rejects with an actionable error', async () => {
		vi.useFakeTimers();
		const ffmpeg = worker();
		const result = encoderOperation(ffmpeg, () => new Promise(() => {}), undefined, 100);
		const rejection = expect(result).rejects.toThrow('stopped responding');
		await vi.advanceTimersByTimeAsync(100);
		await rejection;
		expect(ffmpeg.terminate).toHaveBeenCalledOnce();
	});

	it('cancels a running operation instead of leaving the worker busy', async () => {
		const ffmpeg = worker();
		const controller = new AbortController();
		const result = encoderOperation(ffmpeg, () => new Promise(() => {}), controller.signal);
		controller.abort();
		await expect(result).rejects.toMatchObject({ name: 'AbortError' });
		expect(ffmpeg.terminate).toHaveBeenCalledOnce();
	});

	it('does not start work with an already aborted signal', async () => {
		const ffmpeg = worker();
		const operation = vi.fn();
		await expect(encoderOperation(ffmpeg, operation, AbortSignal.abort())).rejects.toMatchObject({
			name: 'AbortError'
		});
		expect(operation).not.toHaveBeenCalled();
	});

	it('removes timers and abort listeners after success', async () => {
		vi.useFakeTimers();
		const ffmpeg = worker();
		const controller = new AbortController();
		await expect(encoderOperation(ffmpeg, async () => 42, controller.signal, 100)).resolves.toBe(
			42
		);
		controller.abort();
		await vi.advanceTimersByTimeAsync(200);
		expect(ffmpeg.terminate).not.toHaveBeenCalled();
	});
});
