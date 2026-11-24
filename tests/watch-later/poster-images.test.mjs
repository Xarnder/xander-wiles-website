import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { POSTER_PLACEHOLDER, setPosterImage } from '../../pages/Watch-Later/poster-images.mjs';

const origin = 'https://example.test';
function setup() {
    const dom = new JSDOM('<img>', { url: origin + '/pages/Watch-Later/' });
    const image = dom.window.document.querySelector('img');
    const load = (width, height) => {
        Object.defineProperties(image, {
            naturalWidth: { configurable: true, value: width },
            naturalHeight: { configurable: true, value: height },
        });
        image.dispatchEvent(new dom.window.Event('load'));
    };
    return { dom, image, load, fail: () => image.dispatchEvent(new dom.window.Event('error')) };
}

test('missing, malformed, unsafe and old placeholder URLs use the bundled image', () => {
    const { dom, image } = setup();
    try {
        for (const source of [undefined, null, '', '   ', 'undefined', 'null', 'N/A', 42,
            'javascript:alert(1)', 'https://user:secret@example.test/poster.jpg', 'https://[broken',
            'https://via.placeholder.com/160x90?text=No+Preview']) {
            setPosterImage(image, source, 'Movie poster');
            assert.equal(image.src, origin + POSTER_PLACEHOLDER);
            assert.equal(image.hasAttribute('data-poster-fallback'), true);
            assert.equal(image.alt, 'Movie poster');
        }
        setPosterImage(image, '/assets/real-poster.webp');
        assert.equal(image.hasAttribute('data-poster-fallback'), false);
        assert.equal(image.src, origin + '/assets/real-poster.webp');
    } finally { dom.window.close(); }
});

test('failed image and failed placeholder fall back once each without an error loop', () => {
    const { dom, image, fail } = setup();
    try {
        image.srcset = 'https://example.test/broken-2x.jpg 2x';
        setPosterImage(image, 'https://example.test/broken.jpg');
        assert.equal(image.hasAttribute('srcset'), false);
        fail();
        assert.equal(image.src, origin + POSTER_PLACEHOLDER);
        fail();
        const finalImage = image.src;
        assert.ok(finalImage.startsWith('data:image/svg+xml'));
        for (let i = 0; i < 5; i++) fail();
        assert.equal(image.src, finalImage);
    } finally { dom.window.close(); }
});

test('zero-size, tracking-pixel and unavailable YouTube responses use the placeholder', () => {
    const { dom, image, load } = setup();
    try {
        for (const [source, width, height] of [
            ['https://example.test/corrupt.jpg', 0, 0],
            ['https://example.test/pixel.gif', 1, 1],
            ['https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg', 120, 90],
            ['https://img.youtube.com/vi/abcdefghijk/mqdefault.jpg', 120, 90],
        ]) {
            setPosterImage(image, source);
            load(width, height);
            assert.equal(image.src, origin + POSTER_PLACEHOLDER);
        }
        const valid = 'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg';
        setPosterImage(image, valid); load(480, 360);
        assert.equal(image.src, valid);
        const smallValid = 'https://i.ytimg.com/vi/abcdefghijk/default.jpg';
        setPosterImage(image, smallValid); load(120, 90);
        assert.equal(image.src, smallValid);
    } finally { dom.window.close(); }
});

test('cached failures are caught and rebinding does not reuse a previous title’s handlers', async () => {
    const { dom, image, fail } = setup();
    try {
        Object.defineProperty(image, 'complete', { configurable: true, value: true });
        setPosterImage(image, 'https://example.test/cached-broken.jpg');
        await Promise.resolve();
        assert.equal(image.src, origin + POSTER_PLACEHOLDER);
        Object.defineProperty(image, 'complete', { configurable: true, value: false });
        setPosterImage(image, 'https://example.test/new-title.jpg', 'New title poster');
        fail();
        assert.equal(image.src, origin + POSTER_PLACEHOLDER, 'One error should not also trigger the old fallback handler');
        assert.equal(image.alt, 'New title poster');
    } finally { dom.window.close(); }
});
