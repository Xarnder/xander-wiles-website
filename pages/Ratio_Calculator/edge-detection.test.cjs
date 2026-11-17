const { test } = require('node:test');
const assert = require('node:assert/strict');
const { detectEdges, snapPoint } = require('./edge-detection.js');
function rectangle(foreground, background, transparent = false) {
    const pixels = new Uint8ClampedArray(100 * 100 * 4);
    for (let y = 0; y < 100; y++) for (let x = 0; x < 100; x++) {
        const inside = x >= 25 && x < 75 && y >= 20 && y < 80;
        const value = inside ? foreground : background;
        pixels.set([value, value, value, transparent && !inside ? 0 : 255], (y * 100 + x) * 4);
    }
    return { ...detectEdges(pixels, 100, 100), width: 100, height: 100 };
}
for (const [name, fg, bg, alpha] of [['black', 0, 255, false], ['white', 255, 0, false], ['transparent black', 0, 0, true], ['transparent white', 255, 255, true], ['low contrast', 110, 130, false]]) {
    test(`Canny finds ${name} silhouette contours without filling interiors`, () => {
        const map = rectangle(fg, bg, alpha);
        assert.ok(map.count > 180 && map.count < 260, `${map.count} contour pixels`);
        assert.equal(map.edges[50 * 100 + 50], 0);
        for (const point of [{ x: 27, y: 50 }, { x: 72, y: 50 }, { x: 50, y: 22 }, { x: 50, y: 78 }]) {
            assert.equal(snapPoint(point, null, false, map, 5, 100, 100).edge, true);
        }
    });
}
test('blank and transparent images produce no false edges', () => {
    for (const alpha of [0, 255]) {
        const pixels = new Uint8ClampedArray(64 * 64 * 4).fill(255);
        for (let i = 3; i < pixels.length; i += 4) pixels[i] = alpha;
        assert.equal(detectEdges(pixels, 64, 64).count, 0);
    }
});
test('optional snaps, radius and exact axis constraints', () => {
    const map = rectangle(0, 255);
    assert.deepEqual(snapPoint({ x: 72, y: 53 }, null, false, null, 5, 100, 100), { x: 72, y: 53, axis: null, edge: false });
    const horizontal = snapPoint({ x: 72, y: 53 }, { x: 25, y: 50.2 }, true, map, 5, 100, 100);
    assert.equal(horizontal.y, 50.2); assert.equal(horizontal.edge, true);
    const vertical = snapPoint({ x: 52, y: 78 }, { x: 50.2, y: 20 }, true, map, 5, 100, 100);
    assert.equal(vertical.x, 50.2); assert.equal(vertical.edge, true);
    assert.equal(snapPoint({ x: 50, y: 50 }, null, false, map, 5, 100, 100).edge, false);
    const scaled = snapPoint({ x: 144, y: 100 }, null, false, map, 10, 200, 200);
    assert.equal(scaled.edge, true); assert.ok(Math.abs(scaled.x - 150) <= 2);
});
