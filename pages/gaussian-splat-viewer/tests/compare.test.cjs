const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../compare.js'), 'utf8')
    .replace(/^import .*;$/gm, '').replace(/^export /gm, '');
function run(code) {
    const context = vm.createContext({ assert, console, setTimeout, THREE: { Vector2: class {} }, chooseImageExport: async () => ({ width: 1920, height: 1280, format: 'png', background: 'alpha' }), saveExportImage: async () => {} });
    return vm.runInContext(source + '\n' + code, context);
}
test('two, three and four panes use equal dimensions and distinct scenes', () => run(`
    renderer = { getSize(out) { out.x = 1201; out.y = 801; } };
    for (const count of [2, 3, 4]) {
        SLOT_IDS.forEach((id, i) => { slots[id].file = i < count ? {} : null; slots[id].status = 'ready'; scenes[id] = id; });
        const panes = paneRects();
        assert.equal(panes.length, count);
        assert.equal(new Set(panes.map(p => p.scene)).size, count);
        assert.equal(new Set(panes.map(p => p.w + ':' + p.h)).size, 1);
        assert.equal(panes[0].w, 600);
        assert.equal(panes[0].h, count > 2 ? 400 : 801);
        assert.equal(paneDrawSize().x / paneDrawSize().y, panes[0].w / panes[0].h);
        if (count > 2) assert.ok(panes[2].y < panes[0].y);
    }
    state.mode = 'single'; state.activeSlot = 'd';
    assert.equal(paneRects()[0].scene, 'd');
`));
test('single mode disposes every hidden viewer; grid reloads every selected slot', () => run(`
    state.session = true; state.opId = 1; state.mode = 'single'; state.activeSlot = 'c';
    SLOT_IDS.forEach(id => { slots[id].file = {}; slots[id].status = 'ready'; });
    const disposed = [], loaded = [];
    destroyViewer = async slot => disposed.push(slot.id);
    ensureViewer = async slot => loaded.push(slot.id);
    ensureBounds = async () => {};
    yieldToBrowser = async () => {};
    (async () => {
        await loadActiveViewers(1);
        assert.equal(disposed.join(','), 'a,b,d'); assert.equal(loaded.join(','), 'c');
        loaded.length = 0; state.mode = 'dual';
        await loadActiveViewers(1);
        assert.equal(loaded.join(','), 'a,b,c,d');
    })();
`));
test('export captures all four with one frozen pose and restores the active slot', () => run(`
    state.session = true; state.mode = 'single'; state.activeSlot = 'd';
    SLOT_IDS.forEach(id => { slots[id].file = {}; slots[id].status = 'ready'; scenes[id] = id; });
    camera = { aspect: 1.5 }; renderer = {}; controls = {};
    paneDrawSize = () => ({ x: 1200, y: 800 });
    SLOT_IDS.forEach(id => { slots[id].viewer = { viewer: {} }; });
    const pose = { aspect: 1.5 }, captures = [], downloads = [];
    freezePose = () => pose; syncSession = () => {}; flashCapture = () => {};
    deps = { showLoading() {}, hideLoading() {}, showToast() {} };
    destroyViewer = async () => {}; ensureViewer = async () => {};
    captureSceneFrame = async (scene, p, options) => { assert.equal(options.background, "alpha"); assert.equal(options.width, 1920); assert.equal(p, pose); captures.push(scene); return {}; };
    composeGrid = (images, ids) => { assert.equal(images.length, 4); assert.equal(ids.join(''), 'abcd'); return {}; };
    saveExportImage = async (_, name, format) => { assert.equal(format, "png"); downloads.push(name); }; delay = async () => {};
    loadActiveViewers = async () => {}; applyPose = p => assert.equal(p, pose);
    (async () => {
        await exportSnapshots();
        assert.equal(captures.join(''), 'abcd'); assert.equal(downloads.length, 5);
        assert.equal(state.activeSlot, 'd'); assert.equal(state.busy, false); assert.equal(state.capturing, false);
    })();
`));
