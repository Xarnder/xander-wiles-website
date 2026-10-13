/**
 * Run: node --test pages/Markdown-Editor/image-files.test.js
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import {
    DAILY_IMAGE_BYTES,
    HOURLY_LIMITS,
    ImageTooLargeError,
    checkImageUsage,
    formatBytes,
    isCachedImageFresh,
    localDayKey,
    normalizeImageUsage,
    readBodyCapped,
    recordImageUsage,
    screenCopyPx,
    isImageFile,
    needsConvertedImage,
    pickCacheEvictions,
    sizedThumbnailUrl,
} from './image-files.js';

test('detects image files and leaves folders, notes, and Google files alone', () => {
    assert.equal(isImageFile({ mimeType: 'image/jpeg', name: 'IMG_1.bin' }), true);
    assert.equal(isImageFile({ mimeType: 'image/png', name: 'x' }), true);
    assert.equal(isImageFile({ mimeType: 'application/octet-stream', name: 'photo.HEIC' }), true);
    assert.equal(isImageFile({ name: 'photo.webp' }), true);
    assert.equal(isImageFile({ mimeType: 'text/markdown', name: 'photo.png' }), false);
    assert.equal(isImageFile({ mimeType: 'application/vnd.google-apps.drawing', name: 'a.png' }), false);
    assert.equal(isImageFile({ mimeType: 'application/vnd.google-apps.folder', name: 'pics.png' }), false);
    assert.equal(isImageFile({ name: 'notes.md' }), false);
    assert.equal(isImageFile(null), false);
});

test('flags formats browsers usually cannot decode', () => {
    assert.equal(needsConvertedImage({ mimeType: 'image/heic' }), true);
    assert.equal(needsConvertedImage({ mimeType: 'application/octet-stream', name: 'a.tif' }), true);
    assert.equal(needsConvertedImage({ mimeType: 'image/jpeg', name: 'a.jpg' }), false);
});

test('resizes Drive thumbnail links and leaves unknown shapes alone', () => {
    assert.equal(
        sizedThumbnailUrl('https://lh3.googleusercontent.com/drive-storage/abc=s220', 320),
        'https://lh3.googleusercontent.com/drive-storage/abc=s320'
    );
    assert.equal(
        sizedThumbnailUrl('https://lh3.googleusercontent.com/abc=s220-c', 2048),
        'https://lh3.googleusercontent.com/abc=s2048'
    );
    assert.equal(sizedThumbnailUrl('https://example.com/thumb?id=1', 320), 'https://example.com/thumb?id=1');
    assert.equal(sizedThumbnailUrl('', 320), '');
});

test('formats byte counts for the hint line', () => {
    assert.equal(formatBytes(0), '');
    assert.equal(formatBytes(512), '512 B');
    assert.equal(formatBytes(20 * 1024), '20 KB');
    assert.equal(formatBytes(3.25 * 1024 * 1024), '3.3 MB');
    assert.equal(formatBytes(24 * 1024 * 1024), '24 MB');
});

test('cache freshness only fails on a known mismatch', () => {
    assert.equal(isCachedImageFresh('2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'), true);
    assert.equal(isCachedImageFresh('2026-01-01T00:00:00Z', '2026-02-01T00:00:00Z'), false);
    assert.equal(isCachedImageFresh('2026-01-01T00:00:00Z', undefined), true);
    assert.equal(isCachedImageFresh(null, '2026-01-01T00:00:00Z'), true);
});

test('evicts least recently used images until the new one fits', () => {
    const index = [
        { id: 'new', bytes: 10, at: 30 },
        { id: 'old', bytes: 40, at: 10 },
        { id: 'mid', bytes: 30, at: 20 },
    ];
    assert.deepEqual(pickCacheEvictions(index, 20, 100), []);
    assert.deepEqual(pickCacheEvictions(index, 30, 100), ['old']);
    assert.deepEqual(pickCacheEvictions(index, 80, 100), ['old', 'mid']);
    assert.deepEqual(pickCacheEvictions([], 10, 100), []);
});

test('screen copies fit the screen but never exceed 2048px', () => {
    assert.equal(screenCopyPx(390, 844, 3), 2048);
    assert.equal(screenCopyPx(390, 600, 2), 1200);
    assert.equal(screenCopyPx(200, 200, 1), 800);
    assert.equal(screenCopyPx(1920, 1080, 10), 2048);
});

test('usage ledger resets each day and forgets hour-old events', () => {
    const now = new Date(2026, 9, 13, 12, 0, 0).getTime();
    const fresh = normalizeImageUsage(null, now);
    assert.equal(fresh.bytes, 0);
    assert.equal(fresh.allowance, DAILY_IMAGE_BYTES);
    const kept = normalizeImageUsage(
        {
            day: localDayKey(now),
            bytes: 1000,
            allowance: DAILY_IMAGE_BYTES * 2,
            events: [
                { t: now - 2 * 60 * 60 * 1000, k: 'thumb' },
                { t: now - 1000, k: 'thumb' },
            ],
        },
        now
    );
    assert.equal(kept.bytes, 1000);
    assert.equal(kept.allowance, DAILY_IMAGE_BYTES * 2);
    assert.equal(kept.events.length, 1);
    const tomorrow = normalizeImageUsage(kept, now + 24 * 60 * 60 * 1000);
    assert.equal(tomorrow.bytes, 0);
    assert.equal(tomorrow.allowance, DAILY_IMAGE_BYTES);
});

test('usage checks enforce hourly counts and the daily byte budget', () => {
    const now = new Date(2026, 9, 13, 12, 0, 0).getTime();
    let usage = normalizeImageUsage(null, now);
    assert.deepEqual(checkImageUsage(usage, { kind: 'original', bytes: 1000 }, now), { ok: true });
    for (let i = 0; i < HOURLY_LIMITS.original; i += 1) {
        usage = recordImageUsage(usage, { kind: 'original', bytes: 10 }, now - 1000 * (i + 1));
    }
    const hourly = checkImageUsage(usage, { kind: 'original' }, now);
    assert.equal(hourly.ok, false);
    assert.equal(hourly.reason, 'hourly');
    assert.ok(hourly.retryInMs > 0 && hourly.retryInMs <= 60 * 60 * 1000);
    // Other kinds are still allowed.
    assert.equal(checkImageUsage(usage, { kind: 'thumb' }, now).ok, true);

    const full = { ...normalizeImageUsage(null, now), bytes: DAILY_IMAGE_BYTES - 100 };
    assert.equal(checkImageUsage(full, { kind: 'thumb', bytes: 50 }, now).ok, true);
    assert.deepEqual(checkImageUsage(full, { kind: 'screen', bytes: 500 }, now), { ok: false, reason: 'daily' });
    assert.equal(checkImageUsage({ ...full, bytes: DAILY_IMAGE_BYTES }, { kind: 'thumb' }, now).ok, false);
});

test('capped reads stop oversized bodies and report every byte', async () => {
    const body = (n) =>
        new ReadableStream({
            start(controller) {
                for (let i = 0; i < n; i += 1) controller.enqueue(new Uint8Array(100));
                controller.close();
            },
        });
    let seen = 0;
    const ok = await readBodyCapped(
        new Response(body(3), { headers: { 'Content-Type': 'image/png' } }),
        1000,
        (n) => (seen += n)
    );
    assert.equal(ok.size, 300);
    assert.equal(ok.type, 'image/png');
    assert.equal(seen, 300);

    seen = 0;
    await assert.rejects(
        readBodyCapped(new Response(body(20)), 1000, (n) => (seen += n)),
        ImageTooLargeError
    );
    assert.ok(seen > 1000 && seen <= 1100, `stopped right after the cap (saw ${seen})`);

    await assert.rejects(
        readBodyCapped(new Response(body(1), { headers: { 'Content-Length': '5000' } }), 1000),
        ImageTooLargeError
    );
});
