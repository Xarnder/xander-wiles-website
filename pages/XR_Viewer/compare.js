/**
 * Side-by-side / A-B Gaussian splat compare.
 * Both modes share one camera so the two splats are seen from the same pose.
 * Dual: both GPU-resident, two viewports.
 * Single: one splat on the GPU at a time; switching does not move the camera.
 */

const DEFAULT_SPLAT_URL = '/assets/Gaussian-Splats/Default Gaussian.ply';
const DEFAULT_SPLAT_NAME = 'Default Gaussian.ply';
const DEFAULT_LIBRARY_VALUE = '__default__';
const SPLAT_EXTS = new Set(['ply', 'splat', 'ksplat', 'spz']);
const MAX_CAPTURE_EDGE = 1600;
const DUAL_SPLAT_WARN = 500000;

let THREE;
let GaussianSplats3D;
let deps = {};
let dom = {};

const state = {
    session: false,
    setupOpen: false,
    mode: 'dual',
    activeSlot: 'a',
    busy: false,
    capturing: false,
    cameraFramed: false,
    stacked: false,
    opId: 0
};

const slots = {
    a: makeSlot('a'),
    b: makeSlot('b')
};

let sceneA = null;
let sceneB = null;
let savedCamera = null;
let lastSwitchError = '';

function makeSlot(id) {
    return {
        id,
        name: '',
        buffer: null,
        sizeBytes: 0,
        status: 'empty',
        error: '',
        viewer: null,
        owned: false,
        loadGen: 0
    };
}

function stillRunning(opId) {
    return state.session && state.opId === opId;
}

export function isCompareActive() {
    return state.session;
}

export function isCompareSetupOpen() {
    return state.setupOpen;
}

export function initSplatCompare(options) {
    THREE = options.THREE;
    GaussianSplats3D = options.GaussianSplats3D;
    deps = options;
    cacheDom();
    bindUi();
    window.addEventListener('keydown', onKeyDown);
}

export function handleCompareResize() {
    if (!state.session) return;
    state.stacked = isStackedSplit();
    applyCameraAspect();
    syncSessionLayout();
}

export function renderCompare() {
    if (!state.session || state.capturing) return;

    const renderer = deps.getRenderer();
    const camera = deps.getCamera();
    const controls = deps.getOrbitControls();
    if (!renderer || !camera) return;
    if (controls) controls.update();

    camera.updateMatrixWorld();
    applyCameraAspect();

    const canvas = renderer.domElement;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    if (state.mode === 'dual' && sceneA && sceneB) {
        renderer.setScissorTest(true);
        renderer.autoClear = false;
        renderer.setClearColor(0x0a0b10, 1);

        if (state.stacked) {
            const halfH = Math.max(1, Math.floor(height / 2));
            renderer.setViewport(0, halfH, width, height - halfH);
            renderer.setScissor(0, halfH, width, height - halfH);
            renderer.clear();
            renderer.render(sceneA, camera);

            renderer.setViewport(0, 0, width, halfH);
            renderer.setScissor(0, 0, width, halfH);
            renderer.clear();
            renderer.render(sceneB, camera);
        } else {
            const halfW = Math.max(1, Math.floor(width / 2));
            renderer.setViewport(0, 0, halfW, height);
            renderer.setScissor(0, 0, halfW, height);
            renderer.clear();
            renderer.render(sceneA, camera);

            renderer.setViewport(halfW, 0, width - halfW, height);
            renderer.setScissor(halfW, 0, width - halfW, height);
            renderer.clear();
            renderer.render(sceneB, camera);
        }

        renderer.setScissorTest(false);
        renderer.setViewport(0, 0, width, height);
        renderer.autoClear = true;
        return;
    }

    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, width, height);
    renderer.autoClear = true;
    const scene = state.activeSlot === 'b' ? sceneB : sceneA;
    if (scene) renderer.render(scene, camera);
}

export async function exitCompare() {
    if (!state.session && !state.busy && !state.capturing) return;
    state.opId += 1;
    state.session = false;
    state.busy = false;
    state.capturing = false;
    document.body.classList.remove('compare-active');
    if (dom.session) dom.session.classList.remove('active');

    const renderer = deps.getRenderer();
    if (renderer) {
        renderer.setScissorTest(false);
        renderer.autoClear = true;
        renderer.setViewport(0, 0, renderer.domElement.clientWidth, renderer.domElement.clientHeight);
    }

    await destroyViewer(slots.a);
    await destroyViewer(slots.b);
    disposeScene(sceneA);
    disposeScene(sceneB);
    sceneA = null;
    sceneB = null;

    releaseOwnedSlot(slots.a);
    releaseOwnedSlot(slots.b);
    syncSlotCards();

    restoreCamera();
    if (typeof deps.onExitCompare === 'function') deps.onExitCompare();
    deps.updateStatusText('Ready (Desktop Preview)');
    deps.showToast('Exited splat compare');
}

function cacheDom() {
    dom.setup = document.getElementById('compare-setup-modal');
    dom.openBtn = document.getElementById('compare-splats-btn');
    dom.closeSetupBtn = document.getElementById('compare-setup-close-btn');
    dom.startBtn = document.getElementById('compare-start-btn');
    dom.swapBtn = document.getElementById('compare-swap-btn');
    dom.session = document.getElementById('compare-session');
    dom.labelA = document.getElementById('compare-label-a');
    dom.labelB = document.getElementById('compare-label-b');
    dom.hint = document.getElementById('compare-session-hint');
    dom.modeDualBtn = document.getElementById('compare-mode-dual-btn');
    dom.modeSingleBtn = document.getElementById('compare-mode-single-btn');
    dom.showABtn = document.getElementById('compare-show-a-btn');
    dom.showBBtn = document.getElementById('compare-show-b-btn');
    dom.recenterBtn = document.getElementById('compare-recenter-btn');
    dom.snapshotBtn = document.getElementById('compare-snapshot-btn');
    dom.changeBtn = document.getElementById('compare-change-btn');
    dom.exitBtn = document.getElementById('compare-exit-btn');
    dom.setupError = document.getElementById('compare-setup-error');

    ['a', 'b'].forEach((id) => {
        dom[`file${id}`] = document.getElementById(`compare-file-${id}`);
        dom[`library${id}`] = document.getElementById(`compare-library-${id}`);
        dom[`upload${id}`] = document.getElementById(`compare-upload-${id}`);
        dom[`status${id}`] = document.getElementById(`compare-slot-status-${id}`);
        dom[`card${id}`] = document.getElementById(`compare-slot-${id}`);
        dom[`name${id}`] = document.getElementById(`compare-slot-name-${id}`);
        dom[`meta${id}`] = document.getElementById(`compare-slot-meta-${id}`);
        dom[`default${id}`] = document.getElementById(`compare-default-${id}`);
    });

    document.querySelectorAll('input[name="compare-mode"]').forEach((input) => {
        if (input.checked) state.mode = input.value;
    });
}

function bindUi() {
    if (dom.openBtn) {
        dom.openBtn.addEventListener('click', () => {
            if (deps.isXrPresenting && deps.isXrPresenting()) {
                deps.showToast('Exit AR/VR first — splat compare is a desktop tool');
                return;
            }
            openSetup();
        });
    }

    if (dom.closeSetupBtn) {
        dom.closeSetupBtn.addEventListener('click', closeSetup);
    }

    if (dom.setup) {
        dom.setup.addEventListener('click', (event) => {
            if (event.target === dom.setup) closeSetup();
        });
        dom.setup.addEventListener('dragover', (event) => event.preventDefault());
        dom.setup.addEventListener('drop', (event) => event.preventDefault());
    }

    if (dom.startBtn) {
        dom.startBtn.addEventListener('click', () => {
            if (state.busy || state.capturing) return;
            startCompare().catch((err) => {
                console.error('[Compare] start failed', err);
                setSetupError(err.message || String(err));
            });
        });
    }

    if (dom.swapBtn) {
        dom.swapBtn.addEventListener('click', swapSlots);
    }

    ['a', 'b'].forEach((id) => {
        const fileInput = dom[`file${id}`];
        const uploadBtn = dom[`upload${id}`];
        const library = dom[`library${id}`];
        const defaultBtn = dom[`default${id}`];
        const card = dom[`card${id}`];

        if (uploadBtn && fileInput) {
            uploadBtn.addEventListener('click', () => fileInput.click());
        }
        if (fileInput) {
            fileInput.addEventListener('change', (event) => {
                const file = event.target.files && event.target.files[0];
                event.target.value = '';
                if (file) loadSlotFromFile(id, file).catch((err) => {
                    setSlotError(id, err.message || String(err));
                });
            });
        }
        if (library) {
            library.addEventListener('change', () => {
                loadSlotFromLibrary(id, library.value).catch((err) => {
                    setSlotError(id, err.message || String(err));
                });
            });
        }
        if (defaultBtn) {
            defaultBtn.addEventListener('click', () => {
                loadSlotFromLibrary(id, DEFAULT_LIBRARY_VALUE).catch((err) => {
                    setSlotError(id, err.message || String(err));
                });
            });
        }
        if (card) {
            card.addEventListener('dragover', (event) => {
                event.preventDefault();
                event.stopPropagation();
                card.classList.add('is-drop-target');
            });
            card.addEventListener('dragleave', () => card.classList.remove('is-drop-target'));
            card.addEventListener('drop', (event) => {
                event.preventDefault();
                event.stopPropagation();
                card.classList.remove('is-drop-target');
                const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
                if (file) {
                    loadSlotFromFile(id, file).catch((err) => {
                        setSlotError(id, err.message || String(err));
                    });
                }
            });
        }
    });

    document.querySelectorAll('input[name="compare-mode"]').forEach((input) => {
        input.addEventListener('change', () => {
            if (input.checked) state.mode = input.value;
        });
    });

    if (dom.modeDualBtn) {
        dom.modeDualBtn.addEventListener('click', () => setMode('dual'));
    }
    if (dom.modeSingleBtn) {
        dom.modeSingleBtn.addEventListener('click', () => setMode('single'));
    }
    if (dom.showABtn) {
        dom.showABtn.addEventListener('click', () => showSlot('a'));
    }
    if (dom.showBBtn) {
        dom.showBBtn.addEventListener('click', () => showSlot('b'));
    }
    if (dom.recenterBtn) {
        dom.recenterBtn.addEventListener('click', () => {
            if (state.capturing) return;
            state.cameraFramed = false;
            frameSharedCamera();
            deps.showToast('Recentered shared camera');
        });
    }
    if (dom.snapshotBtn) {
        dom.snapshotBtn.addEventListener('click', () => {
            exportCompareSnapshots().catch((err) => {
                console.error('[Compare] snapshot failed', err);
                deps.showToast(err.message || 'Could not save snapshot');
            });
        });
    }
    if (dom.changeBtn) {
        dom.changeBtn.addEventListener('click', () => openSetup());
    }
    if (dom.exitBtn) {
        dom.exitBtn.addEventListener('click', () => {
            exitCompare().catch((err) => console.warn('[Compare] exit failed', err));
        });
    }
}

function onKeyDown(event) {
    if (event.target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(event.target.tagName)) return;

    if (event.key === 'Escape') {
        if (state.setupOpen) {
            closeSetup();
            event.preventDefault();
            return;
        }
        if (state.session) {
            exitCompare();
            event.preventDefault();
        }
        return;
    }

    if (!state.session) return;

    if (event.key === 'p' || event.key === 'P') {
        exportCompareSnapshots().catch((err) => {
            console.error('[Compare] snapshot failed', err);
            deps.showToast(err.message || 'Could not save snapshot');
        });
        event.preventDefault();
        return;
    }

    if (state.mode !== 'single') return;

    if (event.key === '1' || event.key === 'a' || event.key === 'A') {
        showSlot('a');
        event.preventDefault();
    } else if (event.key === '2' || event.key === 'b' || event.key === 'B') {
        showSlot('b');
        event.preventDefault();
    } else if (event.key === ' ') {
        showSlot(state.activeSlot === 'a' ? 'b' : 'a');
        event.preventDefault();
    }
}

function openSetup() {
    if (state.capturing) return;
    state.setupOpen = true;
    document.body.classList.add('compare-setup-open');
    refreshLibrarySelects();
    syncSlotCards();
    setSetupError('');
    if (dom.setup) dom.setup.classList.add('active');
}

function closeSetup() {
    state.setupOpen = false;
    document.body.classList.remove('compare-setup-open');
    if (dom.setup) dom.setup.classList.remove('active');
}

function refreshLibrarySelects() {
    const map = deps.getCustomSplats ? deps.getCustomSplats() : new Map();
    const names = [...map.keys()];
    ['a', 'b'].forEach((id) => {
        const select = dom[`library${id}`];
        if (!select) return;
        const previous = select.value;
        select.innerHTML = '';
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = 'Choose a loaded splat…';
        select.appendChild(placeholder);

        const defaultOpt = document.createElement('option');
        defaultOpt.value = DEFAULT_LIBRARY_VALUE;
        defaultOpt.textContent = DEFAULT_SPLAT_NAME;
        select.appendChild(defaultOpt);

        names.forEach((name) => {
            if (name === DEFAULT_SPLAT_NAME) return;
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            select.appendChild(option);
        });

        if ([...select.options].some((opt) => opt.value === previous)) {
            select.value = previous;
        } else if (slots[id].name && [...select.options].some((opt) => opt.value === slots[id].name)) {
            select.value = slots[id].name;
        }
    });
}

async function loadSlotFromFile(id, file) {
    const ext = extensionOf(file.name);
    if (!SPLAT_EXTS.has(ext)) {
        setSlotError(id, `Unsupported format .${ext}. Use .ply, .splat, .ksplat, or .spz`);
        return;
    }
    const slot = slots[id];
    const loadGen = ++slot.loadGen;
    const previous = slot.buffer;
    const previousName = slot.name;
    const previousSize = slot.sizeBytes;
    const previousOwned = slot.owned;
    slot.status = 'loading';
    slot.error = '';
    slot.name = file.name;
    syncSlotCards();
    try {
        deps.updateLoadingBar(0.15);
        deps.updateStatusText(`Reading ${file.name} for compare…`);
        const arrayBuffer = await file.arrayBuffer();
        if (slot.loadGen !== loadGen) return;
        deps.updateLoadingBar(0.55);
        const parsed = await parseSplatBuffer(arrayBuffer, ext);
        if (slot.loadGen !== loadGen) return;
        slot.buffer = parsed;
        slot.sizeBytes = file.size;
        slot.status = 'ready';
        slot.owned = true;
        slot.error = '';
        releaseOrphanBuffer(previous);
        deps.hideLoadingBar();
        deps.showToast(`Ready: ${file.name}`);
        syncSlotCards();
    } catch (err) {
        if (slot.loadGen !== loadGen) return;
        deps.hideLoadingBar();
        if (previous) {
            slot.buffer = previous;
            slot.name = previousName;
            slot.sizeBytes = previousSize;
            slot.owned = previousOwned;
            slot.status = 'ready';
            slot.error = '';
            deps.showToast(err.message || String(err));
            syncSlotCards();
            return;
        }
        setSlotError(id, err.message || String(err));
    }
}

async function loadSlotFromLibrary(id, value) {
    if (!value) return;
    const slot = slots[id];
    const loadGen = ++slot.loadGen;
    const previous = slot.buffer;
    const previousName = slot.name;
    const previousSize = slot.sizeBytes;
    const previousOwned = slot.owned;
    slot.status = 'loading';
    slot.error = '';
    syncSlotCards();

    try {
        if (value === DEFAULT_LIBRARY_VALUE) {
            const buffer = await ensureDefaultSplat();
            if (slot.loadGen !== loadGen) return;
            slot.buffer = buffer;
            slot.name = DEFAULT_SPLAT_NAME;
            slot.sizeBytes = buffer.__sourceBytes || 0;
            slot.status = 'ready';
            slot.owned = false;
            slot.error = '';
            releaseOrphanBuffer(previous);
            const select = dom[`library${id}`];
            if (select) select.value = DEFAULT_LIBRARY_VALUE;
            deps.showToast(`Ready: ${DEFAULT_SPLAT_NAME}`);
            syncSlotCards();
            return;
        }

        const map = deps.getCustomSplats ? deps.getCustomSplats() : new Map();
        const buffer = map.get(value);
        if (!buffer) throw new Error(`${value} is not in memory yet`);
        if (slot.loadGen !== loadGen) return;
        slot.buffer = buffer;
        slot.name = value;
        slot.sizeBytes = 0;
        slot.status = 'ready';
        slot.owned = false;
        slot.error = '';
        releaseOrphanBuffer(previous);
        syncSlotCards();
    } catch (err) {
        if (slot.loadGen !== loadGen) return;
        if (previous) {
            slot.buffer = previous;
            slot.name = previousName;
            slot.sizeBytes = previousSize;
            slot.owned = previousOwned;
            slot.status = 'ready';
            slot.error = '';
            deps.showToast(err.message || String(err));
            syncSlotCards();
            return;
        }
        setSlotError(id, err.message || String(err));
    }
}

async function ensureDefaultSplat() {
    const map = deps.getCustomSplats ? deps.getCustomSplats() : null;
    if (map && map.has(DEFAULT_SPLAT_NAME)) return map.get(DEFAULT_SPLAT_NAME);

    deps.updateStatusText('Fetching Default Gaussian Splat…');
    deps.showToast('Fetching Default Gaussian Splat…');
    deps.updateLoadingBar(0.05);

    const response = await fetch(DEFAULT_SPLAT_URL);
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: default splat not found. Upload a local .ply instead.`);
    }

    const contentLength = response.headers.get('content-length');
    const total = contentLength ? parseInt(contentLength, 10) : 133200000;
    let loaded = 0;
    const reader = response.body.getReader();
    const chunks = [];
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded += value.byteLength;
        if (total > 0) deps.updateLoadingBar((loaded / total) * 0.55);
    }

    const combined = new Uint8Array(loaded);
    let offset = 0;
    for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.byteLength;
    }

    deps.updateStatusText('Parsing default splat…');
    deps.updateLoadingBar(0.7);
    const splatBuffer = await GaussianSplats3D.PlyLoader.loadFromFileData(combined.buffer, 0, 0, false);
    splatBuffer.__sourceBytes = loaded;
    chunks.length = 0;
    if (map) map.set(DEFAULT_SPLAT_NAME, splatBuffer);
    deps.hideLoadingBar();
    return splatBuffer;
}

async function parseSplatBuffer(arrayBuffer, ext) {
    if (ext === 'ply') return GaussianSplats3D.PlyLoader.loadFromFileData(arrayBuffer, 0, 0, false);
    if (ext === 'splat') return GaussianSplats3D.SplatLoader.loadFromFileData(arrayBuffer, 0, 0, false);
    if (ext === 'ksplat') return GaussianSplats3D.KSplatLoader.loadFromFileData(arrayBuffer);
    if (ext === 'spz') return GaussianSplats3D.SpzLoader.loadFromFileData(arrayBuffer, 0, 0, false);
    throw new Error(`Unsupported splat format: .${ext}`);
}

function swapSlots() {
    const temp = {
        name: slots.a.name,
        buffer: slots.a.buffer,
        sizeBytes: slots.a.sizeBytes,
        status: slots.a.status,
        error: slots.a.error,
        viewer: slots.a.viewer,
        owned: slots.a.owned
    };
    slots.a.name = slots.b.name;
    slots.a.buffer = slots.b.buffer;
    slots.a.sizeBytes = slots.b.sizeBytes;
    slots.a.status = slots.b.status;
    slots.a.error = slots.b.error;
    slots.a.viewer = slots.b.viewer;
    slots.a.owned = slots.b.owned;
    slots.b.name = temp.name;
    slots.b.buffer = temp.buffer;
    slots.b.sizeBytes = temp.sizeBytes;
    slots.b.status = temp.status;
    slots.b.error = temp.error;
    slots.b.viewer = temp.viewer;
    slots.b.owned = temp.owned;
    if (sceneA && slots.a.viewer) sceneA.add(slots.a.viewer);
    if (sceneB && slots.b.viewer) sceneB.add(slots.b.viewer);
    refreshSharedPlacement();
    refreshLibrarySelects();
    syncSlotCards();
    if (state.session) syncSessionLayout();
}

async function startCompare() {
    if (deps.isXrPresenting && deps.isXrPresenting()) {
        throw new Error('Exit AR/VR first — splat compare is a desktop tool');
    }
    if (slots.a.status !== 'ready' || !slots.a.buffer) {
        throw new Error('Choose splat A before starting');
    }
    if (slots.b.status !== 'ready' || !slots.b.buffer) {
        throw new Error('Choose splat B before starting');
    }
    if (state.busy || state.capturing) return;

    const modeInput = document.querySelector('input[name="compare-mode"]:checked');
    if (modeInput) state.mode = modeInput.value;

    const opId = ++state.opId;
    const newSession = !state.session;
    state.busy = true;
    setSetupError('');
    closeSetup();

    try {
        if (newSession) {
            saveCamera();
            if (typeof deps.onEnterCompare === 'function') deps.onEnterCompare();
            document.body.classList.add('compare-active');
            sceneA = createCompareScene();
            sceneB = createCompareScene();
            state.session = true;
            state.cameraFramed = false;
        }

        state.stacked = isStackedSplit();
        applyCameraAspect();

        const countA = slots.a.buffer.getSplatCount();
        const countB = slots.b.buffer.getSplatCount();
        if (state.mode === 'dual' && countA + countB > DUAL_SPLAT_WARN) {
            deps.showToast('Large splats — Dual uses more GPU. Switch to Single if it stutters.');
        }

        if (state.mode === 'dual') {
            deps.updateStatusText('Loading both splats onto the GPU…');
            deps.updateLoadingBar(0.2);
            await ensureViewerLoaded(slots.a, sceneA);
            if (!stillRunning(opId)) return;
            deps.updateLoadingBar(0.6);
            await ensureViewerLoaded(slots.b, sceneB);
        } else {
            const hideId = state.activeSlot === 'a' ? 'b' : 'a';
            await destroyViewer(slots[hideId]);
            if (!stillRunning(opId)) return;
            deps.updateStatusText(`Loading splat ${state.activeSlot.toUpperCase()}…`);
            deps.updateLoadingBar(0.35);
            await ensureViewerLoaded(slots[state.activeSlot], state.activeSlot === 'b' ? sceneB : sceneA);
        }
        if (!stillRunning(opId)) return;

        refreshSharedPlacement();
        if (!state.cameraFramed) frameSharedCamera();
        deps.updateStatusText(state.mode === 'dual'
            ? 'Compare: dual windows — shared camera'
            : `Compare: ${state.activeSlot.toUpperCase()} — camera locked`);
        deps.showToast(state.mode === 'dual'
            ? 'Dual windows locked to one camera'
            : 'Single view — press Space to switch, camera stays put');
    } catch (err) {
        if (newSession && state.opId === opId) {
            await exitCompare();
        }
        throw err;
    } finally {
        if (state.opId === opId) {
            state.busy = false;
            deps.hideLoadingBar();
            if (state.session) syncSessionLayout();
        }
    }
}

async function setMode(mode) {
    if (!state.session || state.busy || state.capturing) return;
    if (state.mode === mode) {
        syncSessionLayout();
        return;
    }
    const pose = freezeComparePose();
    state.mode = mode;
    const modeInput = document.querySelector(`input[name="compare-mode"][value="${mode}"]`);
    if (modeInput) modeInput.checked = true;

    const opId = ++state.opId;
    state.busy = true;
    try {
        if (mode === 'dual') {
            deps.updateStatusText('Loading both splats for dual windows…');
            deps.updateLoadingBar(0.25);
            await ensureViewerLoaded(slots.a, sceneA);
            if (!stillRunning(opId)) return;
            deps.updateLoadingBar(0.7);
            await ensureViewerLoaded(slots.b, sceneB);
            deps.showToast('Dual windows — same camera on both');
        } else {
            const hideId = state.activeSlot === 'a' ? 'b' : 'a';
            await destroyViewer(slots[hideId]);
            if (!stillRunning(opId)) return;
            await ensureViewerLoaded(slots[state.activeSlot], state.activeSlot === 'b' ? sceneB : sceneA);
            deps.showToast('Single view — only one splat on the GPU');
        }
        if (!stillRunning(opId)) return;
        refreshSharedPlacement();
        applyComparePose(pose);
        applyCameraAspect();
        deps.hideLoadingBar();
    } catch (err) {
        console.error('[Compare] mode switch failed', err);
        deps.showToast(err.message || 'Could not switch compare mode');
        deps.hideLoadingBar();
    } finally {
        if (state.opId === opId) {
            state.busy = false;
            if (state.session) syncSessionLayout();
        }
    }
}

async function showSlot(id) {
    if (!state.session || state.busy || state.capturing) return;
    if (state.mode === 'dual') {
        state.activeSlot = id;
        syncSessionLayout();
        return;
    }
    if (state.activeSlot === id && slots[id].viewer) {
        syncSessionLayout();
        return;
    }

    const pose = freezeComparePose();
    const opId = ++state.opId;
    state.busy = true;
    const previous = state.activeSlot;
    state.activeSlot = id;
    syncSessionLayout();
    try {
        deps.updateStatusText(`Switching to splat ${id.toUpperCase()}…`);
        deps.updateLoadingBar(0.2);
        await destroyViewer(slots[previous]);
        if (!stillRunning(opId)) return;
        await ensureViewerLoaded(slots[id], id === 'b' ? sceneB : sceneA);
        if (!stillRunning(opId)) return;
        refreshSharedPlacement();
        applyComparePose(pose);
        deps.hideLoadingBar();
        deps.updateStatusText(`Showing ${slots[id].name} — camera unchanged`);
        lastSwitchError = '';
    } catch (err) {
        lastSwitchError = err.message || String(err);
        console.error('[Compare] switch failed', err);
        deps.showToast(`Could not load splat ${id.toUpperCase()}: ${lastSwitchError}`);
        deps.hideLoadingBar();
        if (stillRunning(opId) && previous !== id && slots[previous].buffer) {
            try {
                await ensureViewerLoaded(slots[previous], previous === 'b' ? sceneB : sceneA);
                state.activeSlot = previous;
                applyComparePose(pose);
            } catch (restoreErr) {
                console.warn('[Compare] could not restore previous splat', restoreErr);
            }
        }
    } finally {
        if (state.opId === opId) {
            state.busy = false;
            syncSessionLayout();
        }
    }
}

async function exportCompareSnapshots() {
    if (!state.session || state.busy || state.capturing) return;
    if (slots.a.status !== 'ready' || slots.b.status !== 'ready') {
        deps.showToast('Both splats need to be ready before taking a snapshot');
        return;
    }

    const mode = state.mode;
    const activeSlot = state.activeSlot;
    const pose = freezeComparePose();
    const controls = deps.getOrbitControls();
    const controlsWereEnabled = !!(controls && controls.enabled);
    if (controls) controls.enabled = false;

    const opId = ++state.opId;
    state.busy = true;
    state.capturing = true;
    syncSessionLayout();
    deps.updateStatusText('Capturing both splats from this camera…');

    let canvasA = null;
    let canvasB = null;
    let composite = null;

    try {
        canvasA = await captureSlotFrame('a', pose, mode === 'dual');
        if (!stillRunning(opId)) return;
        canvasB = await captureSlotFrame('b', pose, mode === 'dual');
        if (!stillRunning(opId)) return;

        await restoreAfterCapture(mode, activeSlot, pose, controls, controlsWereEnabled);
        if (!stillRunning(opId)) return;

        flashCapture();
        composite = composeSideBySide(canvasA, canvasB, slots.a.name, slots.b.name);
        const stamp = fileStamp();

        const blobPair = await canvasToBlob(composite);
        releaseCanvas(composite);
        composite = null;
        downloadBlob(blobPair, `xr-compare-${stamp}-side-by-side.png`);
        await delay(120);

        const blobA = await canvasToBlob(canvasA);
        releaseCanvas(canvasA);
        canvasA = null;
        downloadBlob(blobA, `xr-compare-${stamp}-A-${safeFileStem(slots.a.name)}.png`);
        await delay(120);

        const blobB = await canvasToBlob(canvasB);
        releaseCanvas(canvasB);
        canvasB = null;
        downloadBlob(blobB, `xr-compare-${stamp}-B-${safeFileStem(slots.b.name)}.png`);

        if (stillRunning(opId)) {
            deps.showToast('Saved A, B, and side-by-side PNGs from this camera');
        }
    } catch (err) {
        console.error('[Compare] snapshot failed', err);
        deps.showToast(err.message || 'Could not save snapshot');
        if (stillRunning(opId) && state.capturing) {
            await restoreAfterCapture(mode, activeSlot, pose, controls, controlsWereEnabled);
        }
    } finally {
        releaseCanvas(canvasA);
        releaseCanvas(canvasB);
        releaseCanvas(composite);
        if (state.opId === opId) {
            state.capturing = false;
            state.busy = false;
            if (controls && controlsWereEnabled && !controls.enabled) controls.enabled = true;
            applyComparePose(pose);
            applyCameraAspect();
            deps.hideLoadingBar();
            if (state.session) {
                deps.updateStatusText(state.mode === 'dual'
                    ? 'Compare: dual windows — shared camera'
                    : `Compare: ${state.activeSlot.toUpperCase()} — camera locked`);
                syncSessionLayout();
            }
        }
    }
}

async function captureSlotFrame(id, pose, keepOtherLoaded) {
    const slot = slots[id];
    const other = slots[id === 'a' ? 'b' : 'a'];
    const scene = id === 'b' ? sceneB : sceneA;
    if (!keepOtherLoaded) await destroyViewer(other);
    await ensureViewerLoaded(slot, scene);
    refreshSharedPlacement();
    if (other.viewer) other.viewer.visible = false;
    if (slot.viewer) slot.viewer.visible = true;
    prepareViewerForCapture(slot);
    applyComparePose(pose);
    applyCameraAspect();
    await waitFrames(1);
    applyComparePose(pose);
    return captureSceneFrame(scene);
}

async function restoreAfterCapture(mode, activeSlot, pose, controls, controlsWereEnabled) {
    try {
        if (mode === 'single') {
            const hideId = activeSlot === 'a' ? 'b' : 'a';
            await destroyViewer(slots[hideId]);
            await ensureViewerLoaded(slots[activeSlot], activeSlot === 'b' ? sceneB : sceneA);
            if (slots[activeSlot].viewer) slots[activeSlot].viewer.visible = true;
        } else {
            await ensureViewerLoaded(slots.a, sceneA);
            await ensureViewerLoaded(slots.b, sceneB);
            if (slots.a.viewer) slots.a.viewer.visible = true;
            if (slots.b.viewer) slots.b.viewer.visible = true;
        }
        refreshSharedPlacement();
    } catch (err) {
        console.warn('[Compare] snapshot restore failed', err);
    }
    state.capturing = false;
    if (controls) controls.enabled = controlsWereEnabled;
    applyComparePose(pose);
    applyCameraAspect();
}

function prepareViewerForCapture(slot) {
    if (!slot.viewer || !slot.viewer.viewer) return;
    slot.viewer.viewer.updateForDropInMode(deps.getRenderer(), deps.getCamera());
}

function captureSceneFrame(scene) {
    const renderer = deps.getRenderer();
    const camera = deps.getCamera();
    const canvas = renderer.domElement;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, width, height);
    renderer.autoClear = true;
    renderer.setClearColor(0x0a0b10, 1);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.render(scene, camera);
    return copyWebglCanvas(canvas);
}

function copyWebglCanvas(glCanvas) {
    const srcW = glCanvas.width || glCanvas.clientWidth;
    const srcH = glCanvas.height || glCanvas.clientHeight;
    const scale = Math.min(1, MAX_CAPTURE_EDGE / Math.max(srcW, srcH, 1));
    const w = Math.max(1, Math.round(srcW * scale));
    const h = Math.max(1, Math.round(srcH * scale));
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    const ctx = out.getContext('2d', { alpha: false });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(glCanvas, 0, 0, w, h);
    return out;
}

function composeSideBySide(canvasA, canvasB, nameA, nameB) {
    const pad = Math.max(10, Math.round(canvasA.height * 0.018));
    const header = Math.max(36, Math.round(canvasA.height * 0.06));
    const gap = Math.max(4, Math.round(canvasA.width * 0.004));
    const out = document.createElement('canvas');
    out.width = canvasA.width + canvasB.width + gap + pad * 2;
    out.height = header + Math.max(canvasA.height, canvasB.height) + pad * 2;
    const ctx = out.getContext('2d');

    ctx.fillStyle = '#07080c';
    ctx.fillRect(0, 0, out.width, out.height);

    ctx.drawImage(canvasA, pad, header);
    ctx.drawImage(canvasB, pad + canvasA.width + gap, header);

    ctx.fillStyle = 'rgba(0, 243, 255, 0.5)';
    ctx.fillRect(pad + canvasA.width, header, gap, Math.max(canvasA.height, canvasB.height));

    const fontSize = Math.max(14, Math.round(header * 0.38));
    ctx.font = `600 ${fontSize}px Outfit, Inter, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#00f3ff';
    ctx.fillText(`A  ${nameA || 'Splat A'}`, pad + 10, header * 0.52);
    ctx.fillStyle = '#e9d5ff';
    ctx.fillText(`B  ${nameB || 'Splat B'}`, pad + canvasA.width + gap + 10, header * 0.52);
    return out;
}

function canvasToBlob(canvas) {
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (blob) resolve(blob);
            else reject(new Error('Could not encode PNG'));
        }, 'image/png');
    });
}

function releaseCanvas(canvas) {
    if (!canvas) return;
    canvas.width = 0;
    canvas.height = 0;
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2500);
}

function flashCapture() {
    const flash = document.createElement('div');
    flash.className = 'compare-capture-flash';
    document.body.appendChild(flash);
    requestAnimationFrame(() => {
        flash.classList.add('is-fading');
        setTimeout(() => flash.remove(), 320);
    });
}

function fileStamp() {
    return new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
}

function safeFileStem(name) {
    const stem = String(name || 'splat').replace(/\.[^.]+$/, '');
    return stem.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'splat';
}

function waitFrames(count) {
    return new Promise((resolve) => {
        let left = Math.max(1, count);
        const tick = () => {
            left -= 1;
            if (left <= 0) resolve();
            else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    });
}

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureViewerLoaded(slot, scene) {
    if (slot.viewer && slot.viewer.__uploadedName === slot.name) {
        applySharedPlacement(slot.viewer);
        slot.viewer.visible = true;
        return;
    }
    if (!slot.buffer) throw new Error(`Splat ${slot.id.toUpperCase()} is not ready`);

    await destroyViewer(slot);
    const viewer = createDropInViewer();
    scene.add(viewer);
    viewer.visible = false;

    const splatCount = slot.buffer.getSplatCount();
    const alphaCut = splatCount > 400000 ? 8 : 1;
    await viewer.viewer.addSplatBuffers(
        [slot.buffer],
        [{ splatAlphaRemovalThreshold: alphaCut }],
        true,
        false,
        false,
        true,
        true,
        false
    );
    if (!state.session) {
        try { await viewer.dispose(); } catch (err) { /* leaving compare */ }
        if (viewer.parent) viewer.parent.remove(viewer);
        return;
    }
    viewer.__uploadedName = slot.name;
    applySharedPlacement(viewer);
    viewer.visible = true;
    slot.viewer = viewer;
}

function createDropInViewer() {
    const group = new GaussianSplats3D.DropInViewer({
        gpuAcceleratedSort: false,
        sharedMemoryForWorkers: false,
        integerBasedSort: true,
        halfPrecisionCovariancesOnGPU: true,
        ignoreDevicePixelRatio: true,
        inMemoryCompressionLevel: 1,
        freeIntermediateSplatData: true,
        sphericalHarmonicsDegree: 0,
        antialiased: false,
        dynamicScene: false,
        maxScreenSpaceSplatSize: 256,
        sceneRevealMode: GaussianSplats3D.SceneRevealMode.Instant,
        logLevel: GaussianSplats3D.LogLevel.None
    });
    const renderer = deps.getRenderer();
    const camera = deps.getCamera();
    group.viewer.updateForDropInMode(renderer, camera);
    group.viewer.webXRActive = false;
    group.viewer.getRenderDimensions = (out) => {
        const size = paneCssSize();
        out.x = Math.max(1, size.x);
        out.y = Math.max(1, size.y);
    };
    return group;
}

async function destroyViewer(slot) {
    if (!slot.viewer) return;
    const group = slot.viewer;
    slot.viewer = null;
    group.visible = false;
    if (group.parent) group.parent.remove(group);
    try {
        if (group.viewer) group.viewer.renderer = null;
        await group.dispose();
    } catch (err) {
        console.warn('[Compare] viewer dispose failed', err);
    }
}

function createCompareScene() {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0b10);
    scene.add(new THREE.AmbientLight(0xffffff, 0.85));
    const grid = new THREE.GridHelper(20, 20, 0x00f3ff, 0x1e293b);
    scene.add(grid);
    return scene;
}

function disposeScene(scene) {
    if (!scene) return;
    scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
            if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose && m.dispose());
            else if (obj.material.dispose) obj.material.dispose();
        }
    });
    while (scene.children.length) scene.remove(scene.children[0]);
}

function paneCssSize() {
    const renderer = deps.getRenderer();
    const canvas = renderer.domElement;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (state.capturing) return { x: width, y: height };
    if (state.mode === 'dual') {
        if (state.stacked) return { x: width, y: Math.max(1, Math.floor(height / 2)) };
        return { x: Math.max(1, Math.floor(width / 2)), y: height };
    }
    return { x: width, y: height };
}

function isStackedSplit() {
    return window.matchMedia('(max-width: 860px)').matches;
}

function applyCameraAspect() {
    const camera = deps.getCamera();
    if (!camera) return;
    const size = paneCssSize();
    camera.aspect = size.x / Math.max(1, size.y);
    camera.updateProjectionMatrix();
}

function freezeComparePose() {
    const camera = deps.getCamera();
    const controls = deps.getOrbitControls();
    return {
        position: camera.position.clone(),
        quaternion: camera.quaternion.clone(),
        up: camera.up.clone(),
        target: controls ? controls.target.clone() : new THREE.Vector3(),
        zoom: camera.zoom
    };
}

function applyComparePose(pose) {
    if (!pose) return;
    const camera = deps.getCamera();
    const controls = deps.getOrbitControls();
    camera.position.copy(pose.position);
    camera.quaternion.copy(pose.quaternion);
    camera.up.copy(pose.up);
    camera.zoom = pose.zoom;
    if (controls) controls.target.copy(pose.target);
    camera.lookAt(pose.target);
    camera.updateMatrixWorld();
}

function saveCamera() {
    const camera = deps.getCamera();
    const controls = deps.getOrbitControls();
    savedCamera = {
        position: camera.position.clone(),
        quaternion: camera.quaternion.clone(),
        target: controls ? controls.target.clone() : new THREE.Vector3(),
        aspect: camera.aspect
    };
}

function restoreCamera() {
    if (!savedCamera) return;
    const camera = deps.getCamera();
    const controls = deps.getOrbitControls();
    camera.position.copy(savedCamera.position);
    camera.quaternion.copy(savedCamera.quaternion);
    camera.aspect = savedCamera.aspect;
    camera.updateProjectionMatrix();
    if (controls) {
        controls.target.copy(savedCamera.target);
        controls.update();
    }
    savedCamera = null;
}

function unionBounds() {
    const min = new THREE.Vector3(Infinity, Infinity, Infinity);
    const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    let any = false;
    ['a', 'b'].forEach((id) => {
        if (!slots[id].buffer) return;
        try {
            const bounds = computeSplatBounds(slots[id].buffer);
            min.min(bounds.min);
            max.max(bounds.max);
            any = true;
        } catch (err) {
            console.warn('[Compare] bounds failed', err);
        }
    });
    if (!any) {
        min.set(-1, 0, -1);
        max.set(1, 1.7, 1);
    }
    const size = max.clone().sub(min);
    const center = min.clone().add(max).multiplyScalar(0.5);
    return { min, max, size, center };
}

function sharedPlacement() {
    const bounds = unionBounds();
    const personLike = bounds.size.y >= bounds.size.x * 0.4 && bounds.size.y >= bounds.size.z * 0.4;
    const ref = Math.max(personLike ? bounds.size.y : Math.max(bounds.size.x, bounds.size.z, bounds.size.y), 1e-5);
    const target = personLike ? 1.7 : 3.0;
    const scale = THREE.MathUtils.clamp(target / ref, 0.02, 12);
    return { scale, center: bounds.center, minY: bounds.min.y, size: bounds.size };
}

function applySharedPlacement(viewerGroup) {
    if (!viewerGroup) return;
    const { scale, center, minY } = sharedPlacement();
    viewerGroup.scale.setScalar(scale);
    viewerGroup.quaternion.identity();
    viewerGroup.position.set(-center.x * scale, -minY * scale, -center.z * scale);
    viewerGroup.updateMatrixWorld(true);
}

function refreshSharedPlacement() {
    if (slots.a.viewer) applySharedPlacement(slots.a.viewer);
    if (slots.b.viewer) applySharedPlacement(slots.b.viewer);
}

function frameSharedCamera() {
    const camera = deps.getCamera();
    const controls = deps.getOrbitControls();
    if (!camera || !controls) return;
    const { scale, size } = sharedPlacement();
    const height = Math.max(0.6, size.y * scale);
    controls.target.set(0, height * 0.48, 0);
    camera.position.set(0, Math.max(1.0, height * 0.62), Math.max(2.1, height * 1.55));
    camera.up.set(0, 1, 0);
    controls.update();
    state.cameraFramed = true;
}

function computeSplatBounds(splatBuffer) {
    if (splatBuffer.__bounds) return splatBuffer.__bounds;
    const count = splatBuffer.getSplatCount();
    const center = new THREE.Vector3();
    const min = new THREE.Vector3(Infinity, Infinity, Infinity);
    const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    const identity = new THREE.Matrix4();
    const step = Math.max(1, Math.floor(count / 25000));
    for (let i = 0; i < count; i += step) {
        splatBuffer.getSplatCenter(i, center, identity);
        min.min(center);
        max.max(center);
    }
    const size = max.clone().sub(min);
    const mid = min.clone().add(max).multiplyScalar(0.5);
    splatBuffer.__bounds = { min, max, size, center: mid };
    return splatBuffer.__bounds;
}

function bufferInLibrary(buffer) {
    if (!buffer || !deps.getCustomSplats) return false;
    const map = deps.getCustomSplats();
    if (!map) return false;
    for (const value of map.values()) {
        if (value === buffer) return true;
    }
    return false;
}

function releaseOrphanBuffer(buffer) {
    if (!buffer) return;
    if (slots.a.buffer === buffer || slots.b.buffer === buffer) return;
    if (bufferInLibrary(buffer)) return;
}

function releaseOwnedSlot(slot) {
    const buffer = slot.buffer;
    const owned = slot.owned;
    slot.viewer = null;
    if (owned) {
        slot.buffer = null;
        slot.name = '';
        slot.sizeBytes = 0;
        slot.status = 'empty';
        slot.error = '';
        slot.owned = false;
        releaseOrphanBuffer(buffer);
    }
}

function splatMeta(slot) {
    if (!slot.buffer || typeof slot.buffer.getSplatCount !== 'function') return '';
    const count = slot.buffer.getSplatCount();
    const sourceCount = slot.buffer.__sourceCount || count;
    const countText = sourceCount !== count
        ? `${count.toLocaleString()} / ${sourceCount.toLocaleString()} splats`
        : `${count.toLocaleString()} splats`;
    const sizeText = slot.sizeBytes ? ` · ${formatBytes(slot.sizeBytes)}` : '';
    return countText + sizeText;
}

function syncSlotCards() {
    ['a', 'b'].forEach((id) => {
        const slot = slots[id];
        const nameEl = dom[`name${id}`];
        const metaEl = dom[`meta${id}`];
        const statusEl = dom[`status${id}`];
        const card = dom[`card${id}`];
        if (nameEl) nameEl.textContent = slot.name || 'No splat selected';
        if (metaEl) metaEl.textContent = slot.status === 'ready' ? splatMeta(slot) : (slot.error || 'Upload a file or pick one already loaded in XR Studio');
        if (statusEl) {
            statusEl.textContent = slot.status === 'ready' ? 'Ready' : (slot.status === 'loading' ? 'Loading' : (slot.status === 'error' ? 'Error' : 'Empty'));
            statusEl.dataset.state = slot.status;
        }
        if (card) card.dataset.state = slot.status;
    });
    if (dom.startBtn) {
        dom.startBtn.disabled = !(slots.a.status === 'ready' && slots.b.status === 'ready');
    }
}

function syncSessionLayout() {
    if (!dom.session) return;
    if (state.session) dom.session.classList.add('active');
    else dom.session.classList.remove('active');

    dom.session.classList.toggle('mode-dual', state.mode === 'dual');
    dom.session.classList.toggle('mode-single', state.mode === 'single');
    dom.session.classList.toggle('is-stacked', state.stacked);
    dom.session.dataset.active = state.activeSlot;

    if (dom.labelA) {
        const extra = state.mode === 'single' && state.activeSlot !== 'a' ? '' : splatMeta(slots.a);
        dom.labelA.innerHTML = `<strong>A</strong> ${escapeHtml(slots.a.name || 'Splat A')}${extra ? `<span>${escapeHtml(extra)}</span>` : ''}`;
    }
    if (dom.labelB) {
        const extra = state.mode === 'single' && state.activeSlot !== 'b' ? '' : splatMeta(slots.b);
        dom.labelB.innerHTML = `<strong>B</strong> ${escapeHtml(slots.b.name || 'Splat B')}${extra ? `<span>${escapeHtml(extra)}</span>` : ''}`;
    }
    if (dom.hint) {
        if (state.capturing) {
            dom.hint.textContent = 'Saving snapshots of A and B from this camera…';
        } else if (state.busy) {
            dom.hint.textContent = 'Loading splat onto the GPU… camera is frozen';
        } else if (state.mode === 'dual') {
            dom.hint.textContent = 'Orbit anywhere — both windows share this camera pose · P saves a snapshot';
        } else {
            dom.hint.textContent = `Showing ${state.activeSlot.toUpperCase()} · Space / 1 / 2 to switch · P saves a snapshot`;
        }
    }

    const locked = state.busy || state.capturing;

    if (dom.modeDualBtn) {
        dom.modeDualBtn.classList.toggle('active', state.mode === 'dual');
        dom.modeDualBtn.disabled = locked;
    }
    if (dom.modeSingleBtn) {
        dom.modeSingleBtn.classList.toggle('active', state.mode === 'single');
        dom.modeSingleBtn.disabled = locked;
    }
    if (dom.showABtn) {
        dom.showABtn.classList.toggle('active', state.activeSlot === 'a');
        dom.showABtn.disabled = locked || state.mode === 'dual';
    }
    if (dom.showBBtn) {
        dom.showBBtn.classList.toggle('active', state.activeSlot === 'b');
        dom.showBBtn.disabled = locked || state.mode === 'dual';
    }
    if (dom.recenterBtn) dom.recenterBtn.disabled = locked;
    if (dom.changeBtn) dom.changeBtn.disabled = locked;
    if (dom.snapshotBtn) {
        dom.snapshotBtn.disabled = !state.session || locked;
    }
}

function setSlotError(id, message) {
    const slot = slots[id];
    const previous = slot.buffer;
    slot.status = 'error';
    slot.error = message;
    slot.buffer = null;
    slot.owned = false;
    releaseOrphanBuffer(previous);
    syncSlotCards();
    deps.showToast(message);
}

function setSetupError(message) {
    if (!dom.setupError) return;
    dom.setupError.textContent = message || '';
    dom.setupError.hidden = !message;
}

function extensionOf(name) {
    const parts = String(name || '').split('.');
    return (parts.length > 1 ? parts.pop() : '').toLowerCase();
}

function formatBytes(bytes) {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
