import { chooseImageExport, isExportDialogOpen, renderExportImage, saveExportImage } from './export-image.js';
/**
 * Compare up to four Gaussian splats from one shared camera.
 * Dual: all selected splats are on the GPU, drawn in two viewports with the same pose.
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

const SLOT_IDS = ['a', 'b', 'c', 'd'];
const slots = Object.fromEntries(SLOT_IDS.map(id => [id, makeSlot(id)]));
const scenes = {};
const selectedIds = () => SLOT_IDS.filter(id => slots[id].file && slots[id].status === 'ready');

let renderer = null;
let camera = null;
let controls = null;
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
    dom.bar = dom.root?.querySelector('.compare-bar');
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
    SLOT_IDS.forEach((id) => {
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
    SLOT_IDS.forEach(id => {
        document.getElementById(`compare-show-${id}-btn`)?.addEventListener('click', () => showSlot(id));
        document.getElementById(`compare-remove-${id}`)?.addEventListener('click', () => {
            if (state.busy) return;
            Object.assign(slots[id], { file: null, name: '', status: 'empty', bounds: null, buffer: null, splatCount: 0 });
            syncSlotCards();
        });
    });
    dom.recenterBtn?.addEventListener('click', () => {
        if (!state.session || state.busy) return;
        frameCamera();
        deps.showToast('Framed all selected splats with the shared camera', 'info');
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

    SLOT_IDS.forEach((id) => {
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
    if (isExportDialogOpen()) return;
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

    const ids = selectedIds();
    const id = SLOT_IDS[Number(event.code.replace('Digit', '')) - 1];
    if (ids.includes(id)) {
        event.preventDefault();
        showSlot(id);
    } else if (event.code === 'Space') {
        event.preventDefault();
        showSlot(ids[(ids.indexOf(state.activeSlot) + 1) % ids.length]);
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
    SLOT_IDS.forEach((id) => {
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
        loadSlotFromFile(SLOT_IDS.find(id => !slots[id].file) || 'a', files[0]);
        return;
    }
    files.slice(0, 4).forEach((file, i) => loadSlotFromFile(SLOT_IDS[i], file, { silent: true }));
    deps.showToast(`Selected ${Math.min(4, files.length)} files.${files.length > 4 ? ' Using the first four.' : ''}`, 'success');
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
            for (const slot of Object.values(slots)) await destroyViewer(slot);
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
    if (selectedIds().length < 2) throw new Error('Choose at least two splats before starting');
    if (!selectedIds().includes(state.activeSlot)) state.activeSlot = selectedIds()[0];
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
        state.mode === 'dual' ? 'Loading all selected splats…' : `Loading splat ${state.activeSlot.toUpperCase()}…`,
        'One shared camera for all views'
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
            for (const slot of Object.values(slots)) await destroyViewer(slot);
            if (!stillRunning(opId)) return;
            state.mode = 'single';
            selectModeRadio('single');
            await loadActiveViewers(opId);
        }
        if (!stillRunning(opId)) return;
        if (pose) applyPose(pose);
        else if (!state.framed) frameCamera();
        syncSession();
        const count = selectedIds().reduce((sum, id) => sum + slots[id].splatCount, 0);
        if (fellBack) {
            deps.showToast('The selected splats did not fit on the GPU. Showing one at a time with the same camera.', 'error');
        } else if (state.mode === 'dual' && count > DUAL_SPLAT_WARN) {
            deps.showToast('Large splats. Grid keeps all selected splats on the GPU — switch to Single if it stalls.', 'info');
        } else {
            deps.showToast(
                state.mode === 'dual'
                    ? 'All windows are locked to the same camera'
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
        mode === 'dual' ? 'Loading all selected splats…' : 'Unloading the hidden splat…',
        'Camera stays locked'
    );
    let fellBack = false;
    try {
        if (mode === 'single') {
            await loadActiveViewers(opId);
        } else {
            try {
                await loadActiveViewers(opId);
            } catch (err) {
                if (!stillRunning(opId)) throw err;
                console.warn(err);
                fellBack = true;
                for (const slot of Object.values(slots)) await destroyViewer(slot);
                if (!stillRunning(opId)) return;
                state.mode = 'single';
                selectModeRadio('single');
                await loadActiveViewers(opId);
            }
        }
        if (!stillRunning(opId)) return;
        applyPose(pose);
        if (fellBack) {
            deps.showToast('The selected splats did not fit on the GPU. Showing one at a time with the same camera.', 'error');
        } else {
            deps.showToast(
                state.mode === 'dual'
                    ? 'Grid — same camera in every pane'
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
    if (!state.session || state.busy || state.mode !== 'single' || !selectedIds().includes(id)) return;
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
        await ensureViewer(slots[id], scenes[id], opId);
        if (!stillRunning(opId)) return;
        applyPose(pose);
        deps.showToast(`Showing ${slots[id].name}. Camera unchanged.`, 'info');
    } catch (err) {
        console.error(err);
        deps.showToast(err.message || `Could not load splat ${id.toUpperCase()}`, 'error');
        if (stillRunning(opId) && previous !== id && slots[previous].file) {
            try {
                state.activeSlot = previous;
                await ensureViewer(slots[previous], scenes[previous], opId);
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
    const ids = selectedIds();
    for (const id of SLOT_IDS) {
        if (!ids.includes(id) || (state.mode === 'single' && id !== state.activeSlot)) {
            await destroyViewer(slots[id]);
            if (!stillRunning(opId)) return;
        }
    }
    for (const id of ids) {
        if (!stillRunning(opId)) return;
        if (state.mode === 'dual' || id === state.activeSlot) await ensureViewer(slots[id], scenes[id], opId);
        else { await ensureBounds(slots[id], opId); releaseCpuBuffer(slots[id]); }
        await yieldToBrowser();
    }
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

    for (const id of SLOT_IDS) {
        await destroyViewer(slots[id]);
        releaseCpuBuffer(slots[id]);
        disposeScene(scenes[id]);
        delete scenes[id];
    }
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
    SLOT_IDS.forEach(id => { scenes[id] = createScene(); });
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
    if (dom.bar) resizeObserver.observe(dom.bar);
    if (dom.posePanel) resizeObserver.observe(dom.posePanel);
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
    deps.showLoading(`Reading ${slot.name || slot.id.toUpperCase()}…`, 'One shared camera for all views');
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
    state.stacked = selectedIds().length === 2 && window.matchMedia('(max-width: 860px)').matches;
    const width = Math.max(1, dom.stage.clientWidth || window.innerWidth);
    const height = Math.max(1, dom.stage.clientHeight || window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, pixelRatioCap()));
    renderer.setSize(width, height, false);
    applyAspect();
    if (dom.root) dom.root.classList.toggle('is-stacked', state.stacked);
    positionCompareLabels();
}

function positionCompareLabels() {
    if (!dom.root || !dom.bar) return;
    const rootTop = dom.root.getBoundingClientRect().top;
    const toolbarBottom = dom.bar.getBoundingClientRect().bottom - rootTop;
    dom.root.style.setProperty('--compare-toolbar-bottom', `${toolbarBottom}px`);
    const panelBottom = state.poseOpen && dom.posePanel && !dom.posePanel.hidden
        ? dom.posePanel.getBoundingClientRect().bottom - rootTop : 0;
    const safeTop = Math.max(toolbarBottom, panelBottom) + 12;
    const ids = selectedIds();
    SLOT_IDS.forEach(id => {
        const label = document.getElementById(`compare-label-${id}`);
        if (!label) return;
        const index = ids.indexOf(id);
        const lowerRow = state.mode !== 'single' && index >= (state.stacked ? 1 : 2);
        label.style.left = state.mode === 'single' || state.stacked ? '16px' : `calc(${(index % 2) * 50}% + 16px)`;
        label.style.top = lowerRow ? `max(${safeTop}px, calc(50% + 16px))` : `${safeTop}px`;
    });
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
    if (selectedIds().length > 2) return { x: Math.max(1, Math.floor(size.width / 2)), y: Math.max(1, Math.floor(size.height / 2)) };
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
    const { width, height } = rendererCssSize();
    if (state.mode !== 'dual') return [{ x: 0, y: 0, w: width, h: height, scene: scenes[state.activeSlot] }];
    const ids = selectedIds();
    const cols = state.stacked ? 1 : 2;
    const rows = Math.ceil(ids.length / cols);
    const w = Math.max(1, Math.floor(width / cols));
    const h = Math.max(1, Math.floor(height / rows));
    return ids.map((id, i) => ({ x: (i % cols) * w, y: height - (Math.floor(i / cols) + 1) * h, w, h, scene: scenes[id] }));
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
    renderer.setScissorTest(false);
    renderer.clear(true, true, true);
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
    applyAspect();
    const verticalFov = THREE.MathUtils.degToRad(camera.fov);
    const fov = Math.min(verticalFov, 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect));
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
    if (!state.session || state.busy || state.setupOpen || !camera || !renderer) return;
    const options = await chooseImageExport(camera.aspect, paneDrawSize().x);
    if (!options || !state.session || state.busy) return;
    const ids = selectedIds();
    const pose = freezePose();
    const mode = state.mode;
    const activeSlot = state.activeSlot;
    const opId = ++state.opId;
    const images = [];
    let combined = null;
    state.busy = true;
    state.capturing = true;
    controls.enabled = false;
    syncSession();
    deps.showLoading('Saving all views…', 'Every image uses the same camera pose');
    try {
        for (const id of ids) {
            if (mode === 'single') {
                for (const other of SLOT_IDS) if (other !== id) await destroyViewer(slots[other]);
            }
            if (!stillRunning(opId)) return;
            await ensureViewer(slots[id], scenes[id], opId);
            if (!stillRunning(opId)) return;
            images.push(await captureSceneFrame(scenes[id], pose, options, slots[id].viewer.viewer));
        }
        if (!stillRunning(opId)) return;
        combined = composeGrid(images, ids, options);
        const stamp = fileStamp();
        flashCapture();
        await saveExportImage(combined, `splat-compare-${stamp}`, options.format);
        for (let i = 0; i < ids.length; i++) {
            await delay(160);
            await saveExportImage(images[i], `splat-compare-${stamp}-${ids[i].toUpperCase()}-${safeFileStem(slots[ids[i]].name)}`, options.format);
        }
        deps.showToast(`Saved ${ids.length} splats from the same camera, plus a comparison grid`, 'success');
    } finally {
        images.forEach(releaseCanvas);
        releaseCanvas(combined);
        captureSize = null;
        if (stillRunning(opId)) {
            try {
                state.mode = mode;
                state.activeSlot = activeSlot;
                await loadActiveViewers(opId);
                applyPose(pose);
            } finally {
                state.capturing = false;
                state.busy = false;
                deps.hideLoading();
                syncSession();
            }
        }
    }
}

async function captureSceneFrame(scene, pose, options, splatViewer) {
    applyPose(pose);
    // Let the newly loaded splat sort from the frozen camera before capture.
    const view = rendererCssSize();
    for (let i = 0; i < 3; i++) {
        renderer.setScissorTest(false);
        renderer.setViewport(0, 0, view.width, view.height);
        renderer.clear(true, true, true);
        renderer.render(scene, camera);
        await waitFrames(1);
    }
    return renderExportImage(renderer, [splatViewer], options, () => renderer.render(scene, camera));
}

function composeGrid(images, ids, options) {
    const { width, height } = images[0];
    const pad = 16, header = 40, cols = 2, rows = Math.ceil(images.length / cols);
    const out = document.createElement('canvas');
    out.width = cols * (width + pad) + pad;
    out.height = rows * (height + header + pad) + pad;
    const ctx = out.getContext('2d');
    if (options.background !== 'alpha') {
        ctx.fillStyle = options.background === 'white' ? '#ffffff' : '#000000';
        ctx.fillRect(0, 0, out.width, out.height);
    }
    ctx.font = '600 16px sans-serif';
    ctx.textBaseline = 'middle';
    images.forEach((image, i) => {
        const x = pad + (i % cols) * (width + pad);
        const y = pad + Math.floor(i / cols) * (height + header + pad);
        ctx.fillStyle = options.background === 'white' ? '#18181b' : ['#38bdf8', '#c084fc', '#34d399', '#fbbf24'][i];
        ctx.fillText(fitLabel(ctx, `${ids[i].toUpperCase()}  ${slots[ids[i]].name}`, width), x, y + header / 2);
        ctx.drawImage(image, x, y + header);
    });
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
    SLOT_IDS.forEach((id) => {
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
    SLOT_IDS.forEach((id) => {
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
        dom.startBtn.disabled = selectedIds().length < 2 || state.busy;
    }
    if (dom.swapBtn) dom.swapBtn.disabled = state.busy;
}

function syncSession() {
    if (!dom.root) return;
    dom.root.classList.toggle('mode-dual', state.mode === 'dual');
    dom.root.classList.toggle('mode-single', state.mode === 'single');
    dom.root.classList.toggle('is-stacked', state.stacked);
    dom.root.dataset.active = state.activeSlot;

    const ids = selectedIds();
    resize();
    dom.root.classList.toggle('is-grid', ids.length > 2);
    SLOT_IDS.forEach(id => {
        const label = document.getElementById(`compare-label-${id}`);
        const index = ids.indexOf(id);
        label.innerHTML = labelHtml(id.toUpperCase(), slots[id]);
        label.hidden = index < 0 || (state.mode === 'single' && state.activeSlot !== id);
        const button = document.getElementById(`compare-show-${id}-btn`);
        button.hidden = index < 0;
        button.disabled = state.busy || state.mode === 'dual';
        button.classList.toggle('active', state.activeSlot === id);
    });
    if (dom.hint) {
        if (state.capturing) dom.hint.textContent = 'Saving all selected splats from this camera…';
        else if (state.busy) dom.hint.textContent = 'Loading splat onto the GPU. The camera is frozen.';
        else if (state.mode === 'dual') dom.hint.textContent = 'Orbit anywhere. Snapshot saves all selected splats from this camera.';
        else dom.hint.textContent = `Showing ${state.activeSlot.toUpperCase()} only. 1–4 or Space switches without moving the camera. Snapshot saves all.`;
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
    positionCompareLabels();
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
