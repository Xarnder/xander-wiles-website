/**
 * Compare two Gaussian splats from one shared camera.
 * Dual: both splats are on the GPU, drawn in two viewports with the same pose.
 * Single: only the visible splat is uploaded and drawn. Switching reloads the
 * other splat and puts the camera back on the exact same position and target.
 *
 * Files stay as File references until a splat is actually uploaded. The parsed
 * CPU buffer is dropped after the GPU upload, and the hidden splat in single
 * view is never left on the GPU.
 */

import * as THREE from 'three';
import * as GaussianSplats3D from '@mkkellogg/gaussian-splats-3d';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createSampleSplatFile } from './sample-generator.js';
import { parseCameraPose, poseToJSON, poseToString, readCameraPose, writeCameraPose } from './camera-pose.js';

const SPLAT_EXTS = new Set(['ply', 'splat', 'ksplat', 'spz']);
const DUAL_SPLAT_WARN = 400000;

let deps = {};
let dom = {};

const state = {
    session: false,
    setupOpen: false,
    mode: 'dual',
    activeSlot: 'a',
    busy: false,
    capturing: false,
    framed: false,
    stacked: false,
    opId: 0,
    frameId: 0,
    poseOpen: false
};

const slots = {
    a: makeSlot('a'),
    b: makeSlot('b')
};

let renderer = null;
let camera = null;
let controls = null;
let sceneA = null;
let sceneB = null;
let resizeObserver = null;
let captureSize = null;
const drawSize = new THREE.Vector2();

function makeSlot(id) {
    return {
        id,
        name: '',
        file: null,
        buffer: null,
        bounds: null,
        splatCount: 0,
        sizeBytes: 0,
        status: 'empty',
        error: '',
        viewer: null,
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
    deps = options;
    cacheDom();
    bindUi();
    window.addEventListener('keydown', onKeyDown);
}

function cacheDom() {
    dom.root = document.getElementById('compare-root');
    dom.stage = document.getElementById('compare-stage');
    dom.setup = document.getElementById('compare-setup');
    dom.setupCard = document.getElementById('compare-setup-card');
    dom.uploadBoth = document.getElementById('compare-upload-both');
    dom.filesBoth = document.getElementById('compare-files-both');
    dom.startBtn = document.getElementById('compare-start-btn');
    dom.swapBtn = document.getElementById('compare-swap-btn');
    dom.closeSetupBtn = document.getElementById('compare-setup-close-btn');
    dom.setupError = document.getElementById('compare-setup-error');
    dom.hint = document.getElementById('compare-hint');
    dom.labelA = document.getElementById('compare-label-a');
    dom.labelB = document.getElementById('compare-label-b');
    dom.modeDualBtn = document.getElementById('compare-mode-dual-btn');
    dom.modeSingleBtn = document.getElementById('compare-mode-single-btn');
    dom.showABtn = document.getElementById('compare-show-a-btn');
    dom.showBBtn = document.getElementById('compare-show-b-btn');
    dom.recenterBtn = document.getElementById('compare-recenter-btn');
    dom.poseBtn = document.getElementById('compare-pose-btn');
    dom.posePanel = document.getElementById('compare-pose-panel');
    dom.poseInput = document.getElementById('compare-pose-input');
    dom.poseCopyString = document.getElementById('compare-pose-copy-string');
    dom.poseCopyJSON = document.getElementById('compare-pose-copy-json');
    dom.poseSaveJSON = document.getElementById('compare-pose-save-json');
    dom.poseLoadJSON = document.getElementById('compare-pose-load-json');
    dom.poseApply = document.getElementById('compare-pose-apply');
    dom.poseFile = document.getElementById('compare-pose-file');
    dom.snapshotBtn = document.getElementById('compare-snapshot-btn');
    dom.exitBtn = document.getElementById('compare-exit-btn');
    dom.changeBtn = document.getElementById('compare-change-btn');
    ['a', 'b'].forEach((id) => {
        dom[`card${id}`] = document.getElementById(`compare-slot-${id}`);
        dom[`name${id}`] = document.getElementById(`compare-slot-name-${id}`);
        dom[`meta${id}`] = document.getElementById(`compare-slot-meta-${id}`);
        dom[`status${id}`] = document.getElementById(`compare-slot-status-${id}`);
        dom[`source${id}`] = document.getElementById(`compare-source-${id}`);
        dom[`file${id}`] = document.getElementById(`compare-file-${id}`);
        dom[`upload${id}`] = document.getElementById(`compare-upload-${id}`);
    });
}

function bindUi() {
    document.getElementById('compare-open-btn')?.addEventListener('click', openSetup);
    document.getElementById('hud-compare-btn')?.addEventListener('click', openSetup);
    dom.closeSetupBtn?.addEventListener('click', () => closeSetup());
    dom.setup?.addEventListener('click', (event) => {
        if (event.target === dom.setup) closeSetup();
    });
    dom.startBtn?.addEventListener('click', () => {
        startCompare().catch((err) => {
            console.error(err);
            deps.showToast(err.message || 'Could not start compare', 'error');
        });
    });
    dom.swapBtn?.addEventListener('click', () => {
        swapSlots().catch((err) => deps.showToast(err.message || 'Could not swap splats', 'error'));
    });
    dom.modeDualBtn?.addEventListener('click', () => setMode('dual'));
    dom.modeSingleBtn?.addEventListener('click', () => setMode('single'));
    dom.showABtn?.addEventListener('click', () => showSlot('a'));
    dom.showBBtn?.addEventListener('click', () => showSlot('b'));
    dom.recenterBtn?.addEventListener('click', () => {
        if (!state.session || state.busy) return;
        frameCamera();
        deps.showToast('Framed both splats with the shared camera', 'info');
    });
    dom.poseBtn?.addEventListener('click', () => {
        if (!state.session || state.busy) return;
        setPosePanelOpen(!state.poseOpen);
    });
    dom.poseCopyString?.addEventListener('click', () => shareComparePose('string'));
    dom.poseCopyJSON?.addEventListener('click', () => shareComparePose('json'));
    dom.poseSaveJSON?.addEventListener('click', () => {
        try {
            const pose = readCameraPose(camera, controls);
            downloadText(poseToJSON(pose), 'camera-pose.json', 'application/json');
            if (dom.poseInput) dom.poseInput.value = poseToJSON(pose);
            deps.showToast('Saved camera pose JSON', 'success');
        } catch (err) {
            deps.showToast(err.message || 'Could not save the camera pose', 'error');
        }
    });
    dom.poseLoadJSON?.addEventListener('click', () => dom.poseFile?.click());
    dom.poseFile?.addEventListener('change', async (event) => {
        const file = event.target.files && event.target.files[0];
        event.target.value = '';
        if (!file) return;
        try {
            const text = await file.text();
            if (dom.poseInput) dom.poseInput.value = text.trim();
            applyComparePoseText(text);
        } catch (err) {
            deps.showToast(err.message || 'Could not read that file', 'error');
        }
    });
    dom.poseApply?.addEventListener('click', () => {
        applyComparePoseText(dom.poseInput ? dom.poseInput.value : '');
    });
    dom.snapshotBtn?.addEventListener('click', () => {
        exportSnapshots().catch((err) => deps.showToast(err.message || 'Could not save snapshots', 'error'));
    });
    dom.changeBtn?.addEventListener('click', openSetup);
    dom.exitBtn?.addEventListener('click', () => {
        exitCompare().catch((err) => console.error(err));
    });

    document.querySelectorAll('input[name="compare-mode"]').forEach((input) => {
        input.addEventListener('change', () => {
            if (input.checked && !state.session) state.mode = input.value;
        });
    });

    dom.uploadBoth?.addEventListener('click', () => dom.filesBoth?.click());
    dom.filesBoth?.addEventListener('change', (event) => {
        const files = splatFilesFromList(event.target.files);
        event.target.value = '';
        assignFilePair(files);
    });
    if (dom.setupCard) {
        dom.setupCard.addEventListener('dragover', (event) => {
            event.preventDefault();
            dom.setupCard.classList.add('is-drop-target');
        });
        dom.setupCard.addEventListener('dragleave', (event) => {
            if (!dom.setupCard.contains(event.relatedTarget)) dom.setupCard.classList.remove('is-drop-target');
        });
        dom.setupCard.addEventListener('drop', (event) => {
            event.preventDefault();
            dom.setupCard.classList.remove('is-drop-target');
            if (event.target.closest && event.target.closest('.compare-slot')) return;
            assignFilePair(splatFilesFromList(event.dataTransfer && event.dataTransfer.files));
        });
    }

    ['a', 'b'].forEach((id) => {
        dom[`upload${id}`]?.addEventListener('click', () => dom[`file${id}`]?.click());
        dom[`file${id}`]?.addEventListener('change', (event) => {
            const file = event.target.files && event.target.files[0];
            event.target.value = '';
            if (file) loadSlotFromFile(id, file);
        });
        dom[`source${id}`]?.addEventListener('change', (event) => {
            const value = event.target.value;
            if (!value) return;
            if (value === '__current__') loadSlotFromCurrent(id);
            else if (value.startsWith('demo:')) loadSlotFromDemo(id, value.slice(5));
        });
        const card = dom[`card${id}`];
        if (!card) return;
        card.addEventListener('dragover', (event) => {
            event.preventDefault();
            card.classList.add('is-drop-target');
        });
        card.addEventListener('dragleave', () => card.classList.remove('is-drop-target'));
        card.addEventListener('drop', (event) => {
            event.preventDefault();
            event.stopPropagation();
            card.classList.remove('is-drop-target');
            const files = splatFilesFromList(event.dataTransfer && event.dataTransfer.files);
            if (files.length >= 2) assignFilePair(files);
            else if (files.length === 1) loadSlotFromFile(id, files[0]);
            else deps.showToast('Use .ply, .splat, .ksplat, or .spz files', 'error');
        });
    });
}

function onKeyDown(event) {
    if (!state.session && !state.setupOpen) return;
    const tag = event.target && event.target.tagName;
    if (event.code === 'Escape') {
        event.preventDefault();
        if (state.setupOpen) closeSetup();
        else exitCompare().catch((err) => console.error(err));
        return;
    }
    if (event.code === 'KeyP' && state.session && !state.busy && !state.setupOpen && tag !== 'INPUT' && tag !== 'SELECT' && tag !== 'TEXTAREA') {
        event.preventDefault();
        exportSnapshots().catch((err) => deps.showToast(err.message || 'Could not save snapshots', 'error'));
        return;
    }
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'BUTTON') return;
    if (!state.session || state.busy || state.setupOpen || state.mode !== 'single') return;

    if (event.code === 'Digit1') {
        event.preventDefault();
        showSlot('a');
    } else if (event.code === 'Digit2') {
        event.preventDefault();
        showSlot('b');
    } else if (event.code === 'Space') {
        event.preventDefault();
        showSlot(state.activeSlot === 'a' ? 'b' : 'a');
    }
}

function openSetup() {
    if (!dom.setup) return;
    refreshSourceSelects();
    document.querySelectorAll('input[name="compare-mode"]').forEach((input) => {
        input.checked = input.value === state.mode;
    });
    if (dom.startBtn) {
        dom.startBtn.textContent = state.session ? 'Update compare' : 'Start compare';
    }
    state.setupOpen = true;
    document.body.classList.add('compare-setup-open');
    dom.setup.classList.add('active');
    setSetupError('');
    syncSlotCards();
}

function closeSetup() {
    state.setupOpen = false;
    document.body.classList.remove('compare-setup-open');
    dom.setup?.classList.remove('active');
    document.querySelectorAll('input[name="compare-mode"]').forEach((input) => {
        input.checked = input.value === state.mode;
    });
}

function refreshSourceSelects() {
    const current = deps.getCurrentSplatSource ? deps.getCurrentSplatSource() : null;
    ['a', 'b'].forEach((id) => {
        const select = dom[`source${id}`];
        if (!select) return;
        const option = select.querySelector('option[value="__current__"]');
        if (!option) return;
        if (current && current.file) {
            option.disabled = false;
            option.textContent = `Current scene (${current.name})`;
        } else {
            option.disabled = true;
            option.textContent = 'Current scene (none loaded yet)';
            if (select.value === '__current__') select.value = '';
        }
    });
}

async function loadSlotFromCurrent(id) {
    const current = deps.getCurrentSplatSource ? deps.getCurrentSplatSource() : null;
    if (!current || !current.file) {
        setSlotError(id, 'Load a splat in the viewer first, or upload one here');
        return;
    }
    await loadSlotFromFile(id, current.file);
}

async function loadSlotFromDemo(id, preset) {
    try {
        await loadSlotFromFile(id, createSampleSplatFile(preset));
    } catch (err) {
        setSlotError(id, err.message || 'Could not build that demo');
    }
}

function loadSlotFromFile(id, file, options = {}) {
    const ext = extensionOf(file.name);
    if (!SPLAT_EXTS.has(ext)) {
        deps.showToast(`Unsupported format .${ext}. Use .ply, .splat, .ksplat, or .spz`, 'error');
        return;
    }

    const slot = slots[id];
    slot.loadGen += 1;
    slot.file = file;
    releaseCpuBuffer(slot);
    slot.bounds = null;
    slot.splatCount = 0;
    slot.sizeBytes = file.size || 0;
    slot.name = file.name;
    slot.status = 'ready';
    slot.error = '';
    if (dom[`source${id}`]) dom[`source${id}`].value = '';
    syncSlotCards();
    if (!options.silent) deps.showToast(`Selected ${file.name}`, 'success');
}

function splatFilesFromList(fileList) {
    if (!fileList || !fileList.length) return [];
    return Array.from(fileList).filter((file) => SPLAT_EXTS.has(extensionOf(file.name)));
}

function assignFilePair(files) {
    if (!files.length) {
        deps.showToast('Use .ply, .splat, .ksplat, or .spz files', 'error');
        return;
    }
    if (files.length === 1) {
        const target = slots.a.status === 'ready' && slots.b.status !== 'ready' ? 'b' : 'a';
        loadSlotFromFile(target, files[0]);
        return;
    }
    loadSlotFromFile('a', files[0], { silent: true });
    loadSlotFromFile('b', files[1], { silent: true });
    const extra = files.length > 2 ? ' Using the first two.' : '';
    deps.showToast(`Selected ${files[0].name} and ${files[1].name}.${extra}`, 'success');
}

function fileKey(slot) {
    const file = slot.file;
    if (!file) return '';
    return `${slot.loadGen}:${file.name}:${file.size}:${file.lastModified || 0}`;
}

function releaseCpuBuffer(slot) {
    slot.buffer = null;
}

function yieldToBrowser() {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

function selectModeRadio(mode) {
    document.querySelectorAll('input[name="compare-mode"]').forEach((input) => {
        input.checked = input.value === mode;
    });
}

function pixelRatioCap() {
    if (typeof navigator.deviceMemory === 'number' && navigator.deviceMemory <= 4) return 1;
    return 1.25;
}

async function parseSplatFile(file) {
    const ext = extensionOf(file.name);
    const arrayBuffer = await file.arrayBuffer();
    let buffer;
    if (ext === 'ply') buffer = await GaussianSplats3D.PlyLoader.loadFromFileData(arrayBuffer, 0, 0, false);
    else if (ext === 'splat') buffer = await GaussianSplats3D.SplatLoader.loadFromFileData(arrayBuffer, 0, 0, false);
    else if (ext === 'ksplat') buffer = await GaussianSplats3D.KSplatLoader.loadFromFileData(arrayBuffer);
    else if (ext === 'spz') buffer = await GaussianSplats3D.SpzLoader.loadFromFileData(arrayBuffer, 0, 0, false);
    else throw new Error(`Unsupported format .${ext}`);

    if (!buffer || typeof buffer.getSplatCount !== 'function' || buffer.getSplatCount() < 1) {
        throw new Error(`${file.name} did not contain any splats`);
    }
    return { buffer, bounds: measureBounds(buffer) };
}

async function swapSlots() {
    if (state.busy) return;
    const pose = state.session ? freezePose() : null;
    const opId = state.session ? ++state.opId : 0;
    if (state.session) state.busy = true;

    const snapshot = ['name', 'file', 'buffer', 'bounds', 'splatCount', 'sizeBytes', 'status', 'error'].reduce((copy, key) => {
        copy[key] = slots.a[key];
        return copy;
    }, {});
    ['name', 'file', 'buffer', 'bounds', 'splatCount', 'sizeBytes', 'status', 'error'].forEach((key) => {
        slots.a[key] = slots.b[key];
        slots.b[key] = snapshot[key];
    });

    try {
        if (state.session) {
            deps.showLoading('Swapping splats…', 'Camera stays locked');
            await destroyViewer(slots.a);
            await destroyViewer(slots.b);
            if (!stillRunning(opId)) return;
            await loadActiveViewers(opId);
            if (!stillRunning(opId)) return;
            if (pose) applyPose(pose);
            deps.showToast('Swapped A and B. Camera unchanged.', 'info');
        }
    } catch (err) {
        deps.showToast(err.message || 'Could not swap splats', 'error');
    } finally {
        if (!state.session || state.opId === opId) {
            state.busy = false;
            deps.hideLoading();
        }
        syncSlotCards();
        syncSession();
    }
}

async function startCompare() {
    if (slots.a.status !== 'ready' || !slots.a.file) throw new Error('Choose splat A before starting');
    if (slots.b.status !== 'ready' || !slots.b.file) throw new Error('Choose splat B before starting');
    if (state.busy) return;

    const selected = document.querySelector('input[name="compare-mode"]:checked');
    if (selected) state.mode = selected.value;

    const continuing = state.session;
    const pose = continuing ? freezePose() : null;
    const opId = ++state.opId;
    state.busy = true;
    setSetupError('');
    closeSetup();
    deps.showLoading(
        state.mode === 'dual' ? 'Loading both splats…' : `Loading splat ${state.activeSlot.toUpperCase()}…`,
        'One shared camera for both'
    );

    try {
        if (!continuing) {
            if (deps.onEnter) await deps.onEnter();
            if (state.opId !== opId) return;
            state.session = true;
            state.framed = false;
            document.body.classList.add('compare-active');
            if (dom.root) dom.root.hidden = false;
            ensureStage();
            resize();
        }

        if (!stillRunning(opId)) return;
        let fellBack = false;
        try {
            await loadActiveViewers(opId);
        } catch (err) {
            if (state.mode !== 'dual' || !stillRunning(opId)) throw err;
            console.warn(err);
            fellBack = true;
            await destroyViewer(slots.a);
            await destroyViewer(slots.b);
            if (!stillRunning(opId)) return;
            state.mode = 'single';
            selectModeRadio('single');
            await loadActiveViewers(opId);
        }
        if (!stillRunning(opId)) return;
        if (pose) applyPose(pose);
        else if (!state.framed) frameCamera();
        syncSession();
        const count = (slots.a.splatCount || 0) + (slots.b.splatCount || 0);
        if (fellBack) {
            deps.showToast('Both splats did not fit on the GPU. Showing one at a time with the same camera.', 'error');
        } else if (state.mode === 'dual' && count > DUAL_SPLAT_WARN) {
            deps.showToast('Large splats. Dual keeps both on the GPU — switch to Single if it stalls.', 'info');
        } else {
            deps.showToast(
                state.mode === 'dual'
                    ? 'Both windows are locked to the same camera'
                    : 'Single view. Only one splat is loaded. The camera stays put when you switch.',
                'success'
            );
        }
    } catch (err) {
        if (!continuing) await exitCompare({ silent: true });
        setSetupError(err.message || 'Could not start compare');
        openSetup();
        throw err;
    } finally {
        if (state.opId === opId) {
            state.busy = false;
            deps.hideLoading();
            if (state.session) syncSession();
        }
    }
}

async function setMode(mode) {
    if (!state.session || state.busy || state.mode === mode) {
        syncSession();
        return;
    }
    const pose = freezePose();
    const opId = ++state.opId;
    state.mode = mode;
    state.busy = true;
    syncSession();
    deps.showLoading(
        mode === 'dual' ? 'Loading both splats…' : 'Unloading the hidden splat…',
        'Camera stays locked'
    );
    let fellBack = false;
    try {
        if (mode === 'single') {
            const hideId = state.activeSlot === 'a' ? 'b' : 'a';
            await destroyViewer(slots[hideId]);
            if (!stillRunning(opId)) return;
            releaseCpuBuffer(slots[hideId]);
            await ensureViewer(slots[state.activeSlot], state.activeSlot === 'b' ? sceneB : sceneA, opId);
        } else {
            try {
                await loadActiveViewers(opId);
            } catch (err) {
                if (!stillRunning(opId)) throw err;
                console.warn(err);
                fellBack = true;
                await destroyViewer(slots.a);
                await destroyViewer(slots.b);
                if (!stillRunning(opId)) return;
                state.mode = 'single';
                selectModeRadio('single');
                await loadActiveViewers(opId);
            }
        }
        if (!stillRunning(opId)) return;
        applyPose(pose);
        if (fellBack) {
            deps.showToast('Both splats did not fit on the GPU. Showing one at a time with the same camera.', 'error');
        } else {
            deps.showToast(
                state.mode === 'dual'
                    ? 'Dual windows — same camera on both'
                    : 'Single view — only one splat is on the GPU',
                'info'
            );
        }
    } catch (err) {
        deps.showToast(err.message || 'Could not switch view mode', 'error');
    } finally {
        if (state.opId === opId) {
            state.busy = false;
            deps.hideLoading();
            syncSession();
        }
    }
}

async function showSlot(id) {
    if (!state.session || state.busy || state.mode !== 'single') return;
    if (state.activeSlot === id && slots[id].viewer) return;

    const pose = freezePose();
    const previous = state.activeSlot;
    const opId = ++state.opId;
    state.activeSlot = id;
    state.busy = true;
    syncSession();
    deps.showLoading(`Loading splat ${id.toUpperCase()}…`, slots[id].name || '');

    try {
        await destroyViewer(slots[previous]);
        if (!stillRunning(opId)) return;
        await ensureViewer(slots[id], id === 'b' ? sceneB : sceneA, opId);
        if (!stillRunning(opId)) return;
        applyPose(pose);
        deps.showToast(`Showing ${slots[id].name}. Camera unchanged.`, 'info');
    } catch (err) {
        console.error(err);
        deps.showToast(err.message || `Could not load splat ${id.toUpperCase()}`, 'error');
        if (stillRunning(opId) && previous !== id && slots[previous].file) {
            try {
                state.activeSlot = previous;
                await ensureViewer(slots[previous], previous === 'b' ? sceneB : sceneA, opId);
                applyPose(pose);
            } catch (restoreErr) {
                console.warn(restoreErr);
            }
        }
    } finally {
        if (state.opId === opId) {
            state.busy = false;
            deps.hideLoading();
            syncSession();
        }
    }
}

async function loadActiveViewers(opId) {
    if (state.mode === 'dual') {
        await ensureViewer(slots.a, sceneA, opId);
        if (!stillRunning(opId)) return;
        await yieldToBrowser();
        await ensureViewer(slots.b, sceneB, opId);
        return;
    }
    const hideId = state.activeSlot === 'a' ? 'b' : 'a';
    await destroyViewer(slots[hideId]);
    if (!stillRunning(opId)) return;
    await ensureBounds(slots[hideId], opId);
    releaseCpuBuffer(slots[hideId]);
    await yieldToBrowser();
    if (!stillRunning(opId)) return;
    await ensureViewer(slots[state.activeSlot], state.activeSlot === 'b' ? sceneB : sceneA, opId);
}

export async function exitCompare(options = {}) {
    const wasSession = state.session || !!renderer;
    state.opId += 1;
    state.session = false;
    state.busy = false;
    state.setupOpen = false;
    if (state.frameId) cancelAnimationFrame(state.frameId);
    state.frameId = 0;
    document.body.classList.remove('compare-active', 'compare-setup-open');
    if (dom.root) dom.root.hidden = true;
    if (dom.posePanel) dom.posePanel.hidden = true;
    if (dom.poseBtn) dom.poseBtn.classList.remove('active');
    if (dom.root) dom.root.classList.remove('pose-open');
    if (dom.setup) dom.setup.classList.remove('active');

    await destroyViewer(slots.a);
    await destroyViewer(slots.b);
    releaseCpuBuffer(slots.a);
    releaseCpuBuffer(slots.b);
    disposeScene(sceneA);
    disposeScene(sceneB);
    sceneA = null;
    sceneB = null;
    if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
    }
    if (controls) {
        controls.dispose();
        controls = null;
    }
    camera = null;
    if (renderer) {
        const canvas = renderer.domElement;
        canvas.removeEventListener('webglcontextlost', onContextLost, false);
        renderer.dispose();
        renderer.forceContextLoss();
        canvas.remove();
        renderer = null;
    }
    state.framed = false;
    state.capturing = false;
    state.poseOpen = false;
    captureSize = null;
    deps.hideLoading();
    if (wasSession && deps.onExit) await deps.onExit();
    if (wasSession && !options.silent) deps.showToast('Exited splat compare', 'info');
}

function ensureStage() {
    if (renderer) return;
    sceneA = createScene();
    sceneB = createScene();
    renderer = new THREE.WebGLRenderer({
        antialias: false,
        alpha: false,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: true
    });
    renderer.setClearColor(0x111115, 1);
    renderer.autoClear = false;
    renderer.domElement.className = 'compare-canvas';
    renderer.domElement.addEventListener('webglcontextlost', onContextLost, false);
    dom.stage.appendChild(renderer.domElement);

    camera = new THREE.PerspectiveCamera(65, 1, 0.05, 500);
    camera.position.set(0, 2.2, 5.5);
    camera.up.set(0, 1, 0);
    camera.lookAt(0, 0, 0);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.7;
    controls.panSpeed = 0.8;
    controls.zoomSpeed = 1.2;
    controls.target.set(0, 0, 0);
    controls.update();

    resizeObserver = new ResizeObserver(() => {
        if (!state.session) return;
        resize();
    });
    resizeObserver.observe(dom.stage);
    if (!state.frameId) state.frameId = requestAnimationFrame(renderLoop);
}

function createScene() {
    const scene = new THREE.Scene();
    const grid = new THREE.GridHelper(30, 30, 0x38bdf8, 0x334155);
    const materials = Array.isArray(grid.material) ? grid.material : [grid.material];
    materials.forEach((material) => {
        material.transparent = true;
        material.opacity = 0.35;
    });
    scene.add(grid);
    return scene;
}

function disposeScene(scene) {
    if (!scene) return;
    scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
            const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
            materials.forEach((material) => material.dispose && material.dispose());
        }
    });
    while (scene.children.length) scene.remove(scene.children[0]);
}

function onContextLost(event) {
    event.preventDefault();
    if (!state.session) return;
    deps.showToast('The GPU ran out of memory. Leaving compare so the viewer can recover.', 'error');
    exitCompare({ silent: true }).catch((err) => console.error(err));
}

function createDropIn() {
    const group = new GaussianSplats3D.DropInViewer({
        gpuAcceleratedSort: false,
        sharedMemoryForWorkers: false,
        integerBasedSort: true,
        halfPrecisionCovariancesOnGPU: true,
        freeIntermediateSplatData: true,
        sphericalHarmonicsDegree: 0,
        dynamicScene: false,
        sceneRevealMode: GaussianSplats3D.SceneRevealMode.Instant,
        logLevel: GaussianSplats3D.LogLevel.None
    });
    group.viewer.getRenderDimensions = (out) => {
        const pane = paneDrawSize();
        out.x = pane.x;
        out.y = pane.y;
    };
    group.viewer.updateForDropInMode(renderer, camera);
    return group;
}

async function bufferForUpload(slot) {
    try {
        if (slot.buffer && slot.buffer.getSplatCount() > 0) return slot.buffer;
    } catch (err) {
        slot.buffer = null;
    }
    if (!slot.file) throw new Error(`Choose a file for splat ${slot.id.toUpperCase()}`);
    deps.showLoading(`Reading ${slot.name || slot.id.toUpperCase()}…`, 'One shared camera for both');
    const parsed = await parseSplatFile(slot.file);
    slot.buffer = parsed.buffer;
    slot.bounds = parsed.bounds;
    slot.splatCount = parsed.buffer.getSplatCount();
    return slot.buffer;
}

async function ensureBounds(slot, opId) {
    if (slot.bounds && slot.splatCount) return;
    await bufferForUpload(slot);
    if (!stillRunning(opId)) releaseCpuBuffer(slot);
}

async function ensureViewer(slot, scene, opId) {
    if (slot.viewer && slot.viewer.__key === fileKey(slot)) {
        if (slot.viewer.parent !== scene) scene.add(slot.viewer);
        slot.viewer.visible = true;
        return;
    }

    await destroyViewer(slot);
    if (!stillRunning(opId)) return;
    const buffer = await bufferForUpload(slot);
    if (!stillRunning(opId)) {
        releaseCpuBuffer(slot);
        return;
    }

    const group = createDropIn();
    scene.add(group);
    group.visible = false;
    const alpha = buffer.getSplatCount() > 400000 ? 8 : 1;
    try {
        await group.viewer.addSplatBuffers(
            [buffer],
            [{ splatAlphaRemovalThreshold: alpha }],
            true,
            false,
            false,
            true,
            true,
            false
        );
    } catch (err) {
        if (group.parent) group.parent.remove(group);
        try { await group.dispose(); } catch (disposeErr) { console.warn(disposeErr); }
        releaseCpuBuffer(slot);
        throw err;
    }

    if (!stillRunning(opId)) {
        if (group.parent) group.parent.remove(group);
        try { await group.dispose(); } catch (disposeErr) { console.warn(disposeErr); }
        releaseCpuBuffer(slot);
        return;
    }

    group.__key = fileKey(slot);
    group.__name = slot.name;
    group.visible = true;
    slot.splatCount = buffer.getSplatCount();
    slot.viewer = group;
    releaseCpuBuffer(slot);
}

async function destroyViewer(slot) {
    const group = slot.viewer;
    if (!group) return;
    slot.viewer = null;
    group.visible = false;
    if (group.parent) group.parent.remove(group);
    try {
        await group.dispose();
    } catch (err) {
        console.warn('Compare viewer dispose failed', err);
    }
    releaseCpuBuffer(slot);
}

function resize() {
    if (!renderer || !dom.stage) return;
    state.stacked = window.matchMedia('(max-width: 860px)').matches;
    const width = Math.max(1, dom.stage.clientWidth || window.innerWidth);
    const height = Math.max(1, dom.stage.clientHeight || window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, pixelRatioCap()));
    renderer.setSize(width, height, false);
    applyAspect();
    if (dom.root) dom.root.classList.toggle('is-stacked', state.stacked);
}

function rendererCssSize() {
    renderer.getSize(drawSize);
    return {
        width: Math.max(1, Math.round(drawSize.x)),
        height: Math.max(1, Math.round(drawSize.y))
    };
}

function paneDrawSize() {
    if (captureSize) return captureSize;
    const size = rendererCssSize();
    if (state.mode !== 'dual') return { x: size.width, y: size.height };
    if (state.stacked) return { x: size.width, y: Math.max(1, Math.floor(size.height / 2)) };
    return { x: Math.max(1, Math.floor(size.width / 2)), y: size.height };
}

function applyAspect() {
    if (!camera) return;
    const pane = paneDrawSize();
    const aspect = pane.x / pane.y;
    if (Math.abs(camera.aspect - aspect) > 0.0001) {
        camera.aspect = aspect;
        camera.updateProjectionMatrix();
    }
}

function paneRects() {
    const size = rendererCssSize();
    const width = size.width;
    const height = size.height;
    if (state.mode !== 'dual') {
        return [{
            x: 0,
            y: 0,
            w: width,
            h: height,
            scene: state.activeSlot === 'b' ? sceneB : sceneA
        }];
    }
    if (state.stacked) {
        const half = Math.max(1, Math.floor(height / 2));
        return [
            { x: 0, y: half, w: width, h: height - half, scene: sceneA },
            { x: 0, y: 0, w: width, h: half, scene: sceneB }
        ];
    }
    const half = Math.max(1, Math.floor(width / 2));
    return [
        { x: 0, y: 0, w: half, h: height, scene: sceneA },
        { x: half, y: 0, w: width - half, h: height, scene: sceneB }
    ];
}

function renderLoop() {
    state.frameId = requestAnimationFrame(renderLoop);
    if (!state.session || !renderer || !camera || state.capturing || document.hidden) return;
    if (controls) controls.enabled = !state.busy;
    if (controls && !state.busy) controls.update();
    applyAspect();

    const panes = paneRects();
    renderer.setClearColor(0x111115, 1);
    renderer.autoClear = false;
    renderer.setScissorTest(state.mode === 'dual');
    panes.forEach((pane) => {
        if (!pane.scene) return;
        renderer.setViewport(pane.x, pane.y, pane.w, pane.h);
        if (state.mode === 'dual') renderer.setScissor(pane.x, pane.y, pane.w, pane.h);
        renderer.clear(true, true, true);
        renderer.render(pane.scene, camera);
    });
    renderer.setScissorTest(false);
    const size = rendererCssSize();
    renderer.setViewport(0, 0, size.width, size.height);
}

function flushControlInertia() {
    if (!controls) return;
    const damping = controls.enableDamping;
    controls.enableDamping = false;
    controls.update();
    controls.enableDamping = damping;
}

function freezePose() {
    applyAspect();
    return {
        position: camera.position.clone(),
        target: controls.target.clone(),
        up: camera.up.clone(),
        fov: camera.fov,
        zoom: camera.zoom,
        near: camera.near,
        far: camera.far,
        aspect: camera.aspect
    };
}

function applyPose(pose) {
    if (!pose || !camera || !controls) return;
    flushControlInertia();
    camera.fov = pose.fov;
    camera.zoom = pose.zoom;
    camera.near = pose.near;
    camera.far = pose.far;
    camera.up.copy(pose.up);
    camera.position.copy(pose.position);
    controls.target.copy(pose.target);
    if (pose.aspect) camera.aspect = pose.aspect;
    camera.updateProjectionMatrix();
    controls.update();
}

function setPosePanelOpen(open) {
    state.poseOpen = open;
    syncSession();
}

async function shareComparePose(kind) {
    try {
        if (!state.session || !camera) throw new Error('Start a compare before copying the camera');
        const pose = readCameraPose(camera, controls);
        const text = kind === 'json' ? poseToJSON(pose) : poseToString(pose);
        if (dom.poseInput) dom.poseInput.value = text;
        let copied = false;
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(text);
                copied = true;
            }
        } catch (err) {
            console.warn(err);
        }
        deps.showToast(copied ? `Copied camera ${kind === 'json' ? 'JSON' : 'string'}` : 'Camera pose is in the box', 'success');
    } catch (err) {
        deps.showToast(err.message || 'Could not copy the camera pose', 'error');
    }
}

function applyComparePoseText(text) {
    try {
        if (!state.session || state.busy || !camera) throw new Error('The compare camera is not ready');
        const pose = parseCameraPose(text);
        writeCameraPose(camera, controls, pose);
        applyAspect();
        deps.showToast('Shared camera restored', 'success');
    } catch (err) {
        deps.showToast(err.message || 'Could not apply that camera pose', 'error');
    }
}

function downloadText(text, filename, type) {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function frameCamera() {
    const { center, size } = unionBounds();
    const radius = Math.max(size.length() * 0.5, 0.4);
    const fov = THREE.MathUtils.degToRad(camera.fov);
    const dist = radius / Math.max(0.2, Math.sin(fov * 0.5));
    flushControlInertia();
    camera.near = Math.max(0.01, radius / 500);
    camera.far = Math.max(200, dist * 12);
    camera.zoom = 1;
    camera.up.set(0, 1, 0);
    controls.target.copy(center);
    camera.position.set(center.x + dist * 0.45, center.y + dist * 0.28, center.z + dist * 0.85);
    camera.updateProjectionMatrix();
    controls.update();
    state.framed = true;
}

async function exportSnapshots() {
    if (!state.session || state.busy || !camera || !renderer) return;
    if (slots.a.status !== 'ready' || slots.b.status !== 'ready') {
        deps.showToast('Both splats need to be ready before saving a snapshot', 'error');
        return;
    }

    const pose = freezePose();
    const mode = state.mode;
    const activeSlot = state.activeSlot;
    const opId = ++state.opId;
    state.busy = true;
    state.capturing = true;
    if (controls) controls.enabled = false;
    syncSession();
    deps.showLoading('Saving both views…', 'The camera stays on this pose');

    let imageA = null;
    let imageB = null;
    let sideBySide = null;

    try {
        if (mode === 'dual') {
            imageA = await captureSlotImage('a', pose, opId, true);
            if (!stillRunning(opId)) return;
            imageB = await captureSlotImage('b', pose, opId, true);
        } else {
            const first = activeSlot;
            const second = activeSlot === 'a' ? 'b' : 'a';
            const firstImage = await captureSlotImage(first, pose, opId, false);
            if (!stillRunning(opId)) return;
            const secondImage = await captureSlotImage(second, pose, opId, false);
            imageA = first === 'a' ? firstImage : secondImage;
            imageB = first === 'b' ? firstImage : secondImage;
        }
        if (!stillRunning(opId) || !imageA || !imageB) return;

        await restoreAfterCapture(mode, activeSlot, pose, opId);
        if (!stillRunning(opId)) return;
        applyPose(pose);
        captureSize = null;
        state.capturing = false;
        deps.hideLoading();

        sideBySide = composeSideBySide(imageA, imageB, slots.a.name, slots.b.name);
        const stamp = fileStamp();
        flashCapture();
        await downloadCanvas(sideBySide, `splat-compare-${stamp}.png`);
        releaseCanvas(sideBySide);
        sideBySide = null;
        await delay(160);
        await downloadCanvas(imageA, `splat-compare-${stamp}-A-${safeFileStem(slots.a.name)}.png`);
        releaseCanvas(imageA);
        imageA = null;
        await delay(160);
        await downloadCanvas(imageB, `splat-compare-${stamp}-B-${safeFileStem(slots.b.name)}.png`);
        releaseCanvas(imageB);
        imageB = null;
        if (stillRunning(opId)) {
            deps.showToast('Saved both splats from this camera, plus a side-by-side image', 'success');
        }
    } catch (err) {
        console.error(err);
        if (stillRunning(opId)) {
            try {
                await restoreAfterCapture(mode, activeSlot, pose, opId);
                applyPose(pose);
            } catch (restoreErr) {
                console.warn(restoreErr);
            }
        }
        deps.showToast(err.message || 'Could not save snapshots', 'error');
    } finally {
        captureSize = null;
        if (state.opId === opId && state.session) {
            try {
                await restoreAfterCapture(mode, activeSlot, pose, opId);
                applyPose(pose);
            } catch (restoreErr) {
                console.warn(restoreErr);
            }
        }
        releaseCanvas(imageA);
        releaseCanvas(imageB);
        releaseCanvas(sideBySide);
        if (state.opId === opId) {
            state.capturing = false;
            state.busy = false;
            deps.hideLoading();
            if (state.session) syncSession();
        }
    }
}

async function captureSlotImage(id, pose, opId, keepOtherLoaded) {
    const otherId = id === 'a' ? 'b' : 'a';
    if (!keepOtherLoaded) await destroyViewer(slots[otherId]);
    if (!stillRunning(opId)) return null;
    await ensureViewer(slots[id], id === 'b' ? sceneB : sceneA, opId);
    if (!stillRunning(opId)) return null;
    if (slots[otherId].viewer) slots[otherId].viewer.visible = false;
    if (slots[id].viewer) slots[id].viewer.visible = true;
    return captureSceneFrame(id === 'b' ? sceneB : sceneA, pose);
}

async function restoreAfterCapture(mode, activeSlot, pose, opId) {
    if (mode === 'single') {
        const hideId = activeSlot === 'a' ? 'b' : 'a';
        await destroyViewer(slots[hideId]);
        if (!stillRunning(opId)) return;
        await ensureViewer(slots[activeSlot], activeSlot === 'b' ? sceneB : sceneA, opId);
    } else {
        await ensureViewer(slots.a, sceneA, opId);
        if (!stillRunning(opId)) return;
        await ensureViewer(slots.b, sceneB, opId);
        if (slots.a.viewer) slots.a.viewer.visible = true;
        if (slots.b.viewer) slots.b.viewer.visible = true;
    }
    applyPose(pose);
}

async function captureSceneFrame(scene, pose) {
    applyPose(pose);
    const view = fitViewport(pose.aspect || camera.aspect);
    captureSize = { x: view.w, y: view.h };
    camera.aspect = view.w / view.h;
    camera.updateProjectionMatrix();
    for (let i = 0; i < 3; i++) {
        drawScene(scene, view);
        await waitFrames(1);
    }
    drawScene(scene, view);
    return copyViewport(view);
}

function fitViewport(aspect) {
    const size = rendererCssSize();
    const fullW = size.width;
    const fullH = size.height;
    const safeAspect = Math.max(0.05, aspect || (fullW / fullH));
    let w = fullW;
    let h = Math.max(1, Math.round(w / safeAspect));
    if (h > fullH) {
        h = fullH;
        w = Math.max(1, Math.round(h * safeAspect));
    }
    return {
        x: Math.floor((fullW - w) / 2),
        y: Math.floor((fullH - h) / 2),
        w,
        h,
        fullW,
        fullH
    };
}

function drawScene(scene, view) {
    renderer.setClearColor(0x111115, 1);
    renderer.autoClear = false;
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, view.fullW, view.fullH);
    renderer.clear(true, true, true);
    renderer.setScissorTest(true);
    renderer.setViewport(view.x, view.y, view.w, view.h);
    renderer.setScissor(view.x, view.y, view.w, view.h);
    renderer.clear(true, true, true);
    renderer.render(scene, camera);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, view.fullW, view.fullH);
}

function copyViewport(view) {
    const maxEdge = 2000;
    const scale = Math.min(1, maxEdge / Math.max(view.w, view.h));
    const outW = Math.max(1, Math.round(view.w * scale));
    const outH = Math.max(1, Math.round(view.h * scale));
    const out = document.createElement('canvas');
    out.width = outW;
    out.height = outH;
    const ctx = out.getContext('2d', { alpha: false });
    const ratio = renderer.getPixelRatio();
    const srcX = Math.round(view.x * ratio);
    const srcY = Math.round(view.y * ratio);
    const srcW = Math.max(1, Math.round(view.w * ratio));
    const srcH = Math.max(1, Math.round(view.h * ratio));
    const top = renderer.domElement.height - (srcY + srcH);
    ctx.drawImage(renderer.domElement, srcX, top, srcW, srcH, 0, 0, outW, outH);
    return out;
}

function composeSideBySide(canvasA, canvasB, nameA, nameB) {
    const pad = Math.max(12, Math.round(canvasA.height * 0.02));
    const header = Math.max(36, Math.round(Math.max(canvasA.height, canvasB.height) * 0.06));
    const gap = Math.max(4, Math.round(Math.min(canvasA.width, canvasB.width) * 0.008));
    const out = document.createElement('canvas');
    out.width = canvasA.width + canvasB.width + gap + pad * 2;
    out.height = header + Math.max(canvasA.height, canvasB.height) + pad;
    const ctx = out.getContext('2d');
    ctx.fillStyle = '#111115';
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(canvasA, pad, header);
    ctx.drawImage(canvasB, pad + canvasA.width + gap, header);
    ctx.fillStyle = 'rgba(56, 189, 248, 0.85)';
    ctx.fillRect(pad + canvasA.width, header, gap, Math.max(canvasA.height, canvasB.height));

    const fontSize = Math.max(14, Math.round(header * 0.38));
    ctx.font = `600 ${fontSize}px sans-serif`;
    ctx.textBaseline = 'middle';
    const labelY = header * 0.48;
    ctx.fillStyle = '#38bdf8';
    ctx.fillText(fitLabel(ctx, `A  ${nameA || 'Splat A'}`, canvasA.width - 8), pad, labelY);
    ctx.fillStyle = '#c084fc';
    ctx.fillText(fitLabel(ctx, `B  ${nameB || 'Splat B'}`, canvasB.width - 8), pad + canvasA.width + gap, labelY);
    return out;
}

function fitLabel(ctx, text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let trimmed = text;
    while (trimmed.length > 1 && ctx.measureText(`${trimmed}…`).width > maxWidth) {
        trimmed = trimmed.slice(0, -1);
    }
    return `${trimmed}…`;
}

function downloadCanvas(canvas, filename) {
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (!blob) {
                reject(new Error('Could not encode PNG'));
                return;
            }
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            link.rel = 'noopener';
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 4000);
            resolve();
        }, 'image/png');
    });
}

function releaseCanvas(canvas) {
    if (!canvas) return;
    canvas.width = 0;
    canvas.height = 0;
}

function flashCapture() {
    const flash = document.createElement('div');
    flash.className = 'compare-capture-flash';
    document.body.appendChild(flash);
    requestAnimationFrame(() => {
        flash.classList.add('is-fading');
        setTimeout(() => flash.remove(), 360);
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

function unionBounds() {
    const min = new THREE.Vector3(Infinity, Infinity, Infinity);
    const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    let any = false;
    ['a', 'b'].forEach((id) => {
        const bounds = slots[id].bounds;
        if (!bounds) return;
        min.min(bounds.min);
        max.max(bounds.max);
        any = true;
    });
    if (!any) {
        min.set(-1, 0, -1);
        max.set(1, 2, 1);
    }
    return {
        min,
        max,
        size: max.clone().sub(min),
        center: min.clone().add(max).multiplyScalar(0.5)
    };
}

function measureBounds(splatBuffer) {
    const count = splatBuffer.getSplatCount();
    const center = new THREE.Vector3();
    const min = new THREE.Vector3(Infinity, Infinity, Infinity);
    const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    const identity = new THREE.Matrix4();
    const step = Math.max(1, Math.floor(count / 20000));
    for (let i = 0; i < count; i += step) {
        splatBuffer.getSplatCenter(i, center, identity);
        if (isFinite(center.x) && isFinite(center.y) && isFinite(center.z)) {
            min.min(center);
            max.max(center);
        }
    }
    if (!isFinite(min.x) || !isFinite(max.x)) {
        min.set(-1, -1, -1);
        max.set(1, 1, 1);
    }
    return {
        min: min.clone(),
        max: max.clone(),
        size: max.clone().sub(min),
        center: min.clone().add(max).multiplyScalar(0.5)
    };
}

function syncSlotCards() {
    ['a', 'b'].forEach((id) => {
        const slot = slots[id];
        const nameEl = dom[`name${id}`];
        const metaEl = dom[`meta${id}`];
        const statusEl = dom[`status${id}`];
        const card = dom[`card${id}`];
        if (nameEl) nameEl.textContent = slot.name || 'No splat selected';
        if (metaEl) {
            if (slot.status === 'ready') metaEl.textContent = splatMeta(slot);
            else if (slot.status === 'loading') metaEl.textContent = 'Reading splat data…';
            else metaEl.textContent = slot.error || 'Upload a file, drop one here, or pick a demo';
        }
        if (statusEl) {
            statusEl.textContent = slot.status === 'ready'
                ? (slot.splatCount ? 'Ready' : 'Selected')
                : (slot.status === 'loading' ? 'Loading' : (slot.status === 'error' ? 'Error' : 'Empty'));
            statusEl.dataset.state = slot.status;
        }
        if (card) card.dataset.state = slot.status;
    });
    if (dom.startBtn) {
        dom.startBtn.disabled = !(slots.a.status === 'ready' && slots.b.status === 'ready') || state.busy;
    }
    if (dom.swapBtn) dom.swapBtn.disabled = state.busy;
}

function syncSession() {
    if (!dom.root) return;
    dom.root.classList.toggle('mode-dual', state.mode === 'dual');
    dom.root.classList.toggle('mode-single', state.mode === 'single');
    dom.root.classList.toggle('is-stacked', state.stacked);
    dom.root.dataset.active = state.activeSlot;

    if (dom.labelA) dom.labelA.innerHTML = labelHtml('A', slots.a);
    if (dom.labelB) dom.labelB.innerHTML = labelHtml('B', slots.b);
    if (dom.hint) {
        if (state.capturing) dom.hint.textContent = 'Saving both splats from this camera…';
        else if (state.busy) dom.hint.textContent = 'Loading splat onto the GPU. The camera is frozen.';
        else if (state.mode === 'dual') dom.hint.textContent = 'Orbit anywhere. Snapshot saves both splats from this camera.';
        else dom.hint.textContent = `Showing ${state.activeSlot.toUpperCase()} only. 1, 2, or Space switches without moving the camera. Snapshot saves both.`;
    }

    const locked = state.busy;
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
    if (dom.poseBtn) {
        dom.poseBtn.disabled = locked;
        dom.poseBtn.classList.toggle('active', state.poseOpen);
    }
    if (dom.posePanel) dom.posePanel.hidden = !state.poseOpen;
    if (dom.root) dom.root.classList.toggle('pose-open', state.poseOpen);
    if (dom.snapshotBtn) dom.snapshotBtn.disabled = locked;
    if (dom.changeBtn) dom.changeBtn.disabled = locked;
    if (dom.exitBtn) dom.exitBtn.disabled = false;
}

function labelHtml(letter, slot) {
    const extra = slot.status === 'ready' ? splatMeta(slot) : '';
    return `<strong>${letter}</strong> ${escapeHtml(slot.name || `Splat ${letter}`)}${extra ? `<span>${escapeHtml(extra)}</span>` : ''}`;
}

function splatMeta(slot) {
    const parts = [];
    if (slot.splatCount) parts.push(`${slot.splatCount.toLocaleString()} splats`);
    if (slot.sizeBytes) parts.push(formatBytes(slot.sizeBytes));
    return parts.join(' · ');
}

function setSlotError(id, message) {
    const slot = slots[id];
    slot.status = 'error';
    slot.error = message;
    slot.buffer = null;
    slot.bounds = null;
    slot.splatCount = 0;
    slot.file = null;
    slot.name = '';
    syncSlotCards();
    deps.showToast(message, 'error');
}

function setSetupError(message) {
    if (!dom.setupError) return;
    dom.setupError.textContent = message || '';
    dom.setupError.hidden = !message;
}

function extensionOf(name) {
    const parts = String(name || '').toLowerCase().split('.');
    return parts.length > 1 ? parts.pop() : '';
}

function formatBytes(bytes) {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
    return `${(bytes / Math.pow(1024, index)).toFixed(index ? 1 : 0)} ${units[index]}`;
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
