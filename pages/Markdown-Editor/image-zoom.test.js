/**
 * Run: node --test pages/Markdown-Editor/image-zoom.test.js
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { clampPan, clampScale, fitSize, wantsMoreDetail, zoomAround } from './image-zoom.js';

test('fits images inside the stage without stretching small ones', () => {
    assert.deepEqual(fitSize(400, 800, 4000, 3000), { w: 400, h: 300 });
    assert.deepEqual(fitSize(1000, 500, 4000, 4000), { w: 500, h: 500 });
    assert.deepEqual(fitSize(400, 800, 200, 100), { w: 200, h: 100 });
    assert.deepEqual(fitSize(0, 800, 200, 100), { w: 0, h: 0 });
});

test('zooming keeps the pinch point still', () => {
    const view = zoomAround({ scale: 1, x: 0, y: 0 }, 2, 100, -50);
    assert.deepEqual(view, { scale: 2, x: -100, y: 50 });
    // The image point under (100, -50) before is still under it after.
    const before = (100 - 0) / 1;
    const after = (100 - view.x) / view.scale;
    assert.equal(before, after);
});

test('panning is clamped so the image keeps covering the stage', () => {
    const fit = { w: 400, h: 300 };
    assert.deepEqual(clampPan({ scale: 1, x: 50, y: -40 }, fit, 400, 800), { scale: 1, x: 0, y: 0 });
    assert.deepEqual(clampPan({ scale: 3, x: 900, y: -900 }, fit, 400, 800), { scale: 3, x: 400, y: -50 });
    assert.equal(clampScale(0.5), 1);
    assert.equal(clampScale(20), 8);
});

test('asks for detail only when the bitmap is too coarse and the original is bigger', () => {
    assert.equal(wantsMoreDetail(1170, 2048, 4032), false); // fitted on a phone
    assert.equal(wantsMoreDetail(3000, 2048, 4032), true); // zoomed in
    assert.equal(wantsMoreDetail(3000, 2048, 2048), false); // copy already is full size
    assert.equal(wantsMoreDetail(3000, 2048, 0), true); // unknown original size
    assert.equal(wantsMoreDetail(0, 2048, 4032), false);
});
