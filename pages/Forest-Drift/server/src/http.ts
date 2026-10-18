/** Read at most `limit` bytes, including bodies sent without Content-Length. */
export async function readLimitedBody(request: Request, limit: number): Promise<string | null> {
	const length = Number(request.headers.get('Content-Length'));
	if (Number.isFinite(length) && length > limit) return null;
	if (!request.body) return '';
	const reader = request.body.getReader();
	const decoder = new TextDecoder();
	let bytes = 0;
	let text = '';
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) return text + decoder.decode();
			bytes += value.byteLength;
			if (bytes > limit) {
				await reader.cancel();
				return null;
			}
			text += decoder.decode(value, { stream: true });
		}
	} finally {
		reader.releaseLock();
	}
}

export function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}
