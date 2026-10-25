import test from 'node:test';
import assert from 'node:assert/strict';
import { trackViewportDock } from '../lib/viewportDock.js';

test('dock follows keyboard opening, viewport panning, dismissal and resume; cleans up', () => {
    const viewport = Object.assign(new EventTarget(), { height: 800, offsetTop: 0 });
    const frames = new Map();
    const timers = new Map();
    let id = 0;
    const host = Object.assign(new EventTarget(), {
        innerHeight: 800,
        visualViewport: viewport,
        document: new EventTarget(),
        requestAnimationFrame: callback => { frames.set(++id, callback); return id; },
        cancelAnimationFrame: key => frames.delete(key),
        setTimeout: callback => { timers.set(++id, callback); return id; },
        clearTimeout: key => timers.delete(key),
    });
    const flush = () => {
        const callbacks = [...frames.values(), ...timers.values()];
        frames.clear();
        timers.clear();
        callbacks.forEach(callback => callback());
    };
    const dock = { style: {} };
    const cleanup = trackViewportDock(dock, host);
    assert.equal(dock.style.bottom, '0px');
    viewport.height = 450;
    viewport.dispatchEvent(new Event('resize'));
    flush();
    assert.equal(dock.style.bottom, '350px');
    assert.equal(dock.style.paddingBottom, '0.75rem');
    viewport.offsetTop = 90;
    viewport.dispatchEvent(new Event('scroll'));
    flush();
    assert.equal(dock.style.bottom, '260px');
    viewport.height = 800;
    viewport.offsetTop = 0;
    viewport.dispatchEvent(new Event('resize'));
    flush();
    assert.equal(dock.style.bottom, '0px');
    assert.match(dock.style.paddingBottom, /safe-area-inset-bottom/);
    host.innerHeight = 450;
    viewport.height = 300;
    host.dispatchEvent(new Event('pageshow'));
    flush();
    assert.equal(dock.style.bottom, '150px');
    viewport.dispatchEvent(new Event('resize'));
    cleanup();
    assert.equal(frames.size + timers.size, 0);
    viewport.dispatchEvent(new Event('resize'));
    host.dispatchEvent(new Event('focusin'));
    assert.equal(frames.size + timers.size, 0);
});

test('dock safely keeps CSS positioning without VisualViewport', () => {
    const dock = { style: {} };
    trackViewportDock(dock, {})();
    assert.deepEqual(dock.style, {});
});
