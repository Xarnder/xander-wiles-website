import test from 'node:test';
import assert from 'node:assert/strict';
import { DRIVE_SCOPE, DRIVE_APPDATA_SCOPE, OAUTH_SESSION_KEY } from './config.js';

test('sign-in requests both file access and private settings access', () => {
    assert.ok(DRIVE_SCOPE.split(' ').includes('https://www.googleapis.com/auth/drive'));
    assert.ok(DRIVE_SCOPE.split(' ').includes(DRIVE_APPDATA_SCOPE));
});

for (const [label, scope, allowed] of [
    ['legacy cached token', undefined, false],
    ['Drive-only token', 'https://www.googleapis.com/auth/drive', false],
    ['settings permission granted', DRIVE_SCOPE, true],
]) {
    test(label, async (t) => {
        const previous = globalThis.localStorage;
        globalThis.localStorage = { getItem: key => key === OAUTH_SESSION_KEY
            ? JSON.stringify({ accessToken: 'fixture', expiresAt: Date.now() + 3600000, scope }) : null };
        t.after(() => { globalThis.localStorage = previous; });
        const auth = await import(`./auth.js?test=${encodeURIComponent(label)}`);
        assert.equal(auth.getAccessToken(), 'fixture', 'ordinary Drive access stays available');
        assert.equal(auth.hasCloudSettingsScope(), allowed);
    });
}
