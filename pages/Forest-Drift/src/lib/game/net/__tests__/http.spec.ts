import { describe, expect, it } from 'vitest';
import { readLimitedBody } from '../../../../../server/src/http';

describe('Worker request limits', () => {
	it('counts UTF-8 bytes rather than JavaScript characters', async () => {
		const request = new Request('https://example.com', { method: 'POST', body: '🌲🌲' });
		expect(await readLimitedBody(request, 7)).toBeNull();
	});

	it('decodes characters split across chunks at the exact byte limit', async () => {
		const bytes = new TextEncoder().encode('🌲');
		const body = new ReadableStream({
			start(controller) {
				controller.enqueue(bytes.slice(0, 2));
				controller.enqueue(bytes.slice(2));
				controller.close();
			}
		});
		const request = new Request('https://example.com', {
			method: 'POST',
			body,
			duplex: 'half'
		} as RequestInit);
		expect(await readLimitedBody(request, 4)).toBe('🌲');
	});

	it('cancels an oversized stream without reading it all', async () => {
		let cancelled = false;
		const body = new ReadableStream({
			pull(controller) {
				controller.enqueue(new Uint8Array(8));
			},
			cancel() {
				cancelled = true;
			}
		});
		const request = new Request('https://example.com', {
			method: 'POST',
			body,
			duplex: 'half'
		} as RequestInit);
		expect(await readLimitedBody(request, 4)).toBeNull();
		expect(cancelled).toBe(true);
	});

	it('rejects an oversized declared body and accepts an empty body', async () => {
		expect(
			await readLimitedBody(
				new Request('https://example.com', {
					method: 'POST',
					headers: { 'Content-Length': '100' }
				}),
				4
			)
		).toBeNull();
		expect(await readLimitedBody(new Request('https://example.com'), 4)).toBe('');
	});
});
