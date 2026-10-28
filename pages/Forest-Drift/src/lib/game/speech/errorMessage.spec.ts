import { expect, it } from 'vitest';
import { speechErrorMessage } from './errorMessage';
it.each([
	['NotAllowedError', 'permissions'],
	['IndexedDB blocked', 'storage'],
	['already running in another tab', 'Another tab'],
	['Voice timed out', 'too long'],
	['Failed to fetch https://secret.example/path', 'download was interrupted'],
	['out of memory', 'close unused tabs'],
	['WebAssembly unavailable', 'Device voice'],
	['Preparation cancelled', 'interrupted'],
	['playback', 'could not be played'],
	['unknown internal error', 'could not prepare']
])('explains %s without exposing implementation details', (message, expected) => {
	const result = speechErrorMessage(new Error(message));
	expect(result).toContain(expected);
	expect(result).not.toContain('https://');
});
it('explains offline and muted states', () => {
	expect(speechErrorMessage(null, { offline: true })).toContain('offline');
	expect(speechErrorMessage(null, { muted: true })).toContain('muted');
});
