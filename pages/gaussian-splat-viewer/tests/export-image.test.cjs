const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../export-image.js'), 'utf8').replace(/^import .*;$/gm, '').replace(/^export /gm, '');

for (const fail of [false, true]) test(`RGBA export restores renderer and splat uniforms${fail ? ' after failure' : ''}`, () => {
    let disposed = false, image;
    const originalDimensions = () => {};
    const viewer = { getRenderDimensions: originalDimensions, devicePixelRatio: 2, splatMesh: { devicePixelRatio: 2 }, updateSplatMesh() {} };
    const renderer = {
        autoClear: true, target: null, alpha: 1, color: 'original',
        getContext: () => ({ MAX_TEXTURE_SIZE: 1, MAX_RENDERBUFFER_SIZE: 2, getParameter: () => 8192 }),
        getRenderTarget() { return this.target; }, setRenderTarget(v) { this.target = v; this.pixelViewport = v ? [v.width, v.height] : [200, 100]; },
        getClearColor() { return { clone: () => 'original' }; }, getClearAlpha() { return this.alpha; },
        setClearColor(c, a) { this.color = c; this.alpha = a; },
        getViewport: () => ({}), getScissor: () => ({}), getScissorTest: () => false,
        setViewport(x, y, width, height) { if (typeof x === "number") this.pixelViewport = [width * 2, height * 2]; }, setScissor() {}, setScissorTest() {}, clear() {},
        readRenderTargetPixels(t, x, y, w, h, out) { out.set([64, 0, 0, 128, 0, 255, 0, 255]); }
    };
    const context = vm.createContext({
        THREE: { WebGLRenderTarget: class { constructor(width, height) { this.width = width; this.height = height; } texture = {}; dispose() { disposed = true; } }, Color: class {}, Vector4: class {}, SRGBColorSpace: 'srgb' },
        document: { createElement: () => ({ getContext: () => ({ createImageData: () => ({ data: new Uint8ClampedArray(8) }), putImageData(v) { image = v; } }) }) },
        renderer, viewer, fail, assert
    });
    vm.runInContext(source + `
        const capture = () => renderExportImage(renderer, [viewer], { width: 1, height: 2, background: 'alpha' }, () => {
            assert.equal(renderer.alpha, 0);
            assert.equal(renderer.pixelViewport.join(","), "1,2", "export viewport must stay in physical pixels on a 2x display");
            assert.equal(viewer.devicePixelRatio, 1);
            if (fail) throw new Error('render failed');
        });
        if (fail) assert.throws(capture, /render failed/); else capture();
    `, context);
    assert.equal(renderer.target, null);
    assert.equal(renderer.color, 'original');
    assert.equal(renderer.alpha, 1);
    assert.equal(renderer.autoClear, true);
    assert.equal(viewer.devicePixelRatio, 2);
    assert.equal(viewer.splatMesh.devicePixelRatio, 2);
    assert.equal(viewer.getRenderDimensions, originalDimensions);
    assert.equal(disposed, true);
    if (!fail) assert.deepEqual(Array.from(image.data), [0, 255, 0, 255, 128, 0, 0, 128]);
});
