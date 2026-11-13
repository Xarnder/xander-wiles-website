import test from 'node:test';
import assert from 'node:assert/strict';
import { scrollAiReviewIntoView } from './ai-panel.js';

for (const reducedMotion of [false, true]) {
    test(`review scrolls its own pane after layout (reduced motion: ${reducedMotion})`, (t) => {
        const frames = [];
        const oldWindow = globalThis.window;
        const oldRaf = globalThis.requestAnimationFrame;
        globalThis.window = { matchMedia: () => ({ matches: reducedMotion }) };
        globalThis.requestAnimationFrame = fn => frames.push(fn);
        t.after(() => { globalThis.window = oldWindow; globalThis.requestAnimationFrame = oldRaf; });
        let scroll;
        const pane = { scrollTop: 120, clientTop: 0, getBoundingClientRect: () => ({ top: 60 }), scrollTo: options => { scroll = options; } };
        const review = { isConnected: true, closest: selector => selector === '.ai-content-scroll' ? pane : null, getBoundingClientRect: () => ({ top: 360 }) };
        scrollAiReviewIntoView(review);
        assert.equal(scroll, undefined);
        frames.shift()();
        assert.equal(scroll, undefined);
        frames.shift()();
        assert.deepEqual(scroll, { top: 412, behavior: reducedMotion ? 'auto' : 'smooth' });
        scroll = undefined;
        scrollAiReviewIntoView(review);
        review.isConnected = false;
        frames.shift()();
        frames.shift()();
        assert.equal(scroll, undefined);
    });
}
