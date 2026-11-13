import type { FFmpeg } from '@ffmpeg/ffmpeg';

/** Abort must stop the worker, not just reject the message waiting on it. */
export async function encoderOperation<T>(
	ffmpeg: FFmpeg,
	operation: () => Promise<T>,
	signal?: AbortSignal,
	timeoutMs = 180_000,
	message = 'The encoder stopped responding. Please try again or use a shorter clip.'
): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	let onAbort: () => void = () => {};
	try {
		return await new Promise<T>((resolve, reject) => {
			const stop = (error: Error) => {
				reject(error);
				ffmpeg.terminate();
			};
			onAbort = () => stop(new DOMException('Conversion cancelled.', 'AbortError'));
			if (signal?.aborted) {
				onAbort();
				return;
			}
			signal?.addEventListener('abort', onAbort, { once: true });
			timer = setTimeout(() => stop(new Error(message)), timeoutMs);
			Promise.resolve()
				.then(() => {
					signal?.throwIfAborted();
					return operation();
				})
				.then(resolve, reject);
		});
	} finally {
		clearTimeout(timer);
		signal?.removeEventListener('abort', onAbort);
	}
}
