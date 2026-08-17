// --- A-FRAME COMPONENT: Drag to Rotate World (Right Controller) ---
AFRAME.registerComponent('drag-rotate-world', {
    init: function () {
        this.isDragging = false;
        this.prevX = 0;
        this.rig = document.querySelector('#rig');
        
        // Listen for Trigger Press
        this.el.addEventListener('triggerdown', (e) => {
            this.isDragging = true;
            // Get current controller horizontal rotation
            this.prevX = this.el.object3D.rotation.y;
        });

        // Listen for Trigger Release
        this.el.addEventListener('triggerup', (e) => {
            this.isDragging = false;
        });
        
        // Also listen for Thumbstick for easier turning
        this.el.addEventListener('axismove', (e) => {
            // axis[2] is usually left/right on Quest thumbstick
            if (e.detail.axis[2] !== 0) {
                const rotation = this.rig.getAttribute('rotation');
                this.rig.setAttribute('rotation', {
                    x: 0, 
                    y: rotation.y - (e.detail.axis[2] * 2), // Speed multiplier
                    z: 0
                });
            }
        });
    },

    tick: function () {
        if (!this.isDragging) return;

        // Calculate delta
        const currentX = this.el.object3D.rotation.y;
        const delta = (currentX - this.prevX) * 100; // Sensitivity
        
        // Apply rotation to the RIG (not the camera)
        const currentRot = this.rig.getAttribute('rotation');
        this.rig.setAttribute('rotation', {
            x: 0,
            y: currentRot.y + delta,
            z: 0
        });

        this.prevX = currentX;
    }
});

// --- Global State ---
let imageItems = []; 
let thumbnails = []; 
let currentIndex = 0;
const SLIM_MOBILE_MQ = window.matchMedia('(max-width: 600px) and (orientation: portrait)');
let isUiVisible = !SLIM_MOBILE_MQ.matches;
let isMotionEnabled = false; 
let demoLoadActive = true;
let demoLoadController = null;
let mediaController = null;
let panoramaLoadToken = 0;
let thumbGenId = 0;
let activeSkyBitmap = null;
let activeSkyTexture = null;
const IMAGE_NAME_RE = /\.(jpe?g|png|webp)$/i;
const PREVIEW_MAX_WIDTH = 1920;

// --- A-Frame Elements ---
const sceneEl = document.querySelector('a-scene');
const skyEl = document.querySelector('#image-360');
const cameraEl = document.querySelector('#camera');
const loader2d = document.getElementById('loader-2d');
const loaderVr = document.getElementById('loader-vr');
const hiresChip = document.getElementById('hiresChip');

// --- DOM Elements ---
const fileInput = document.getElementById('fileInput');
const dirInput = document.getElementById('dirInput');
const fileCountLabel = document.getElementById('fileCount');
const currentNameLabel = document.getElementById('currentFileName');
const debugLog = document.getElementById('debugLog');

// Controls
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const galleryBtn = document.getElementById('galleryBtn');
const clearBtn = document.getElementById('clearBtn');
const fovSlider = document.getElementById('fovSlider');
const fovVal = document.getElementById('fovVal');
const fovBox = document.getElementById('fovBox');
const lensSlider = document.getElementById('lensSlider');
const lensVal = document.getElementById('lensVal');
const lensBox = document.getElementById('lensBox');
const vrBtn = document.getElementById('vrBtn');
const gyroBtn = document.getElementById('gyroBtn');
const panBtn = document.getElementById('panBtn');
const autoPanBtn = document.getElementById('autoPanBtn');
const autoSpeedSlider = document.getElementById('autoSpeedSlider');
const autoSpeedVal = document.getElementById('autoSpeedVal');
const autoSpeedBox = document.getElementById('autoSpeedBox');
const autoDirBtn = document.getElementById('autoDirBtn');
const autoSpeedLabel = document.getElementById('autoSpeedLabel');
const flatBtn = document.getElementById('flatBtn');
const wanderBtn = document.getElementById('wanderBtn');
const flatView = document.getElementById('flatView');
const flatCanvas = document.getElementById('flatCanvas');
const flipBtn = document.getElementById('flipBtn');
const lookHudBtn = document.getElementById('lookHudBtn');
const helpBtn = document.getElementById('helpBtn');
const helpMenuBtn = document.getElementById('helpMenuBtn');
const helpPanel = document.getElementById('helpPanel');
const sceneHud = document.getElementById('sceneHud');
const sceneHudIndex = document.getElementById('sceneHudIndex');
const sceneHudName = document.getElementById('sceneHudName');
const sceneHudPaused = document.getElementById('sceneHudPaused');
const edgePrev = document.getElementById('edgePrev');
const edgeNext = document.getElementById('edgeNext');
const hintToast = document.getElementById('hintToast');
const dropOverlay = document.getElementById('dropOverlay');
const debugDetails = document.getElementById('debugDetails');
const lookHud = document.getElementById('lookHud');
const lookMap = document.getElementById('lookMap');
const lookHeading = document.getElementById('lookHeading');
const lookPitch = document.getElementById('lookPitch');
const lookZoom = document.getElementById('lookZoom');
const FOV_MIN = 20;
const FOV_MAX = 100;
const DEFAULT_FOV = 80;
const LOOK_HUD_STORAGE_KEY = 'xw-360-look-hud-hidden';
const HINT_STORAGE_KEY = 'xw-360-hint-dismissed';
let isLookHudVisible = true;
try {
    isLookHudVisible = localStorage.getItem(LOOK_HUD_STORAGE_KEY) !== '1';
} catch (err) { /* ignore */ }
// look-controls pitch.x: positive looks up, negative looks down
const WANDER_PITCH_UP = 20 * Math.PI / 180;
const WANDER_PITCH_DOWN = 60 * Math.PI / 180;
const WANDER_PITCH_MIN = -WANDER_PITCH_DOWN;
const WANDER_PITCH_MAX = WANDER_PITCH_UP;
const WANDER_FOV_MIN = 38;
const WANDER_FOV_MAX = 88;
let lookMode = 'pan';
let autoPanRaf = 0;
let autoPanLast = 0;
let autoPanDir = 1;
let wanderRaf = 0;
let wanderFrom = null;
let wanderTo = null;
let wanderStart = 0;
let wanderDuration = 8000;
let wanderLast = 0;
let playbackPaused = false;
let thumbObjectUrls = [];
let lookHudRaf = 0;
let lookMapCache = null;
let lastLookLabel = '';
const lookScratch = { vec: null, quat: null, inv: null };
let lensAmount = 0;
let lensPass = null;

// Containers
const mainUi = document.getElementById('mainUi');
const galleryModal = document.getElementById('galleryModal');
const galleryGrid = document.getElementById('galleryGrid');
const galleryProgress = document.getElementById('galleryProgress');
const toggleUiBtn = document.getElementById('toggleUiBtn');
const fullscreenBtn = document.getElementById('fullscreenBtn');
const closeUiBtn = document.getElementById('closeUiBtn');
const closeGalleryBtn = document.getElementById('closeGalleryBtn');
const motionPermissionModal = document.getElementById('motionPermissionModal');
const motionPermTitle = document.getElementById('motionPermTitle');
const motionPermCopy = document.getElementById('motionPermCopy');
const motionPermAllow = document.getElementById('motionPermAllow');
const motionPermDeny = document.getElementById('motionPermDeny');

// --- Logger ---
function log(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const entry = document.createElement('div');
    entry.textContent = `[${timestamp}] ${message}`;
    if (type === 'error') entry.style.color = '#ff6b6b';
    if (type === 'success') entry.style.color = '#4ade80';
    debugLog.appendChild(entry);
    debugLog.scrollTop = debugLog.scrollHeight;
    if (type === 'error' && debugDetails) debugDetails.open = true;
}

function displayName(item) {
    const raw = (item && (item.name || '')) || '';
    return raw.replace(/\.(jpe?g|png|webp)$/i, '') || raw || 'Untitled';
}

function zoomPercentFromFov(fov) {
    return ((FOV_MAX - fov) / (FOV_MAX - FOV_MIN)) * 100;
}

function fovFromZoomPercent(percent) {
    return FOV_MAX - (percent / 100) * (FOV_MAX - FOV_MIN);
}

function formatZoom(fov) {
    const zoom = DEFAULT_FOV / fov;
    return `${zoom.toFixed(zoom >= 10 ? 0 : 1)}×`;
}

function abortMediaLoads() {
    if (mediaController) {
        mediaController.abort();
        mediaController = null;
    }
}

function cancelDemoLoads() {
    if (!demoLoadActive && !demoLoadController && !mediaController) return;
    demoLoadActive = false;
    if (demoLoadController) {
        demoLoadController.abort();
        demoLoadController = null;
    }
    abortMediaLoads();
    panoramaLoadToken++;
    hideLoaders();
    hideHiresChip();
    log('Stopped loading default 360 images.');
}

function showPreviewLoader() {
    loader2d.classList.add('hidden');
    loaderVr.setAttribute('visible', true);
}

function hideLoaders() {
    loader2d.classList.add('hidden');
    loaderVr.setAttribute('visible', false);
}

function showHiresChip(message) {
    if (message) hiresChip.textContent = message;
    hiresChip.classList.remove('hidden');
}

function hideHiresChip() {
    hiresChip.classList.add('hidden');
}

function assetUrl(folder, filename) {
    return encodeURI(folder + filename);
}

function isAbortError(err) {
    return err && (err.name === 'AbortError' || err.message === 'Aborted');
}

function throwIfAborted(token, signal) {
    if (signal?.aborted || token !== panoramaLoadToken) {
        throw new DOMException('Aborted', 'AbortError');
    }
}

function yieldToMain() {
    if (typeof scheduler !== 'undefined' && typeof scheduler.yield === 'function') {
        return scheduler.yield();
    }
    return new Promise(resolve => setTimeout(resolve, 0));
}

async function safeCreateImageBitmap(source, options) {
    try {
        return await createImageBitmap(source, options);
    } catch (err) {
        if (options && options.imageOrientation) {
            const fallback = { ...options };
            delete fallback.imageOrientation;
            return createImageBitmap(source, fallback);
        }
        throw err;
    }
}

async function fetchBlob(url, signal) {
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
    const blob = await response.blob();
    throwIfAborted(panoramaLoadToken, signal);
    return blob;
}

async function decodeBitmap(blob, maxWidth, signal, token) {
    await yieldToMain();
    throwIfAborted(token, signal);

    const decodeFull = async () => safeCreateImageBitmap(blob, { imageOrientation: 'flipY' });
    const decodeResized = async (width, height) => safeCreateImageBitmap(blob, {
        imageOrientation: 'flipY',
        resizeWidth: width,
        resizeHeight: height,
        resizeQuality: 'high'
    });

    let bitmap;
    try {
        bitmap = await decodeFull();
    } catch (err) {
        const fallbackWidth = Math.max(1, Math.min(maxWidth, 8192));
        bitmap = await decodeResized(fallbackWidth, Math.max(1, Math.round(fallbackWidth / 2)));
    }

    if (bitmap.width > maxWidth || bitmap.height > maxWidth) {
        const scale = Math.min(maxWidth / bitmap.width, maxWidth / bitmap.height);
        const resizeWidth = Math.max(1, Math.round(bitmap.width * scale));
        const resizeHeight = Math.max(1, Math.round(bitmap.height * scale));
        const resized = await safeCreateImageBitmap(bitmap, {
            resizeWidth,
            resizeHeight,
            resizeQuality: 'high'
        });
        bitmap.close();
        bitmap = resized;
    }

    if (signal?.aborted || token !== panoramaLoadToken) {
        bitmap.close();
        throw new DOMException('Aborted', 'AbortError');
    }
    return bitmap;
}

function getMaxTextureSize() {
    try {
        const renderer = sceneEl && sceneEl.renderer;
        if (renderer && renderer.capabilities && renderer.capabilities.maxTextureSize) {
            return renderer.capabilities.maxTextureSize;
        }
        const gl = renderer && typeof renderer.getContext === 'function' ? renderer.getContext() : null;
        if (gl) return gl.getParameter(gl.MAX_TEXTURE_SIZE);
    } catch (err) { /* ignore */ }
    return 8192;
}

function getHiResMaxWidth() {
    return Math.max(2048, getMaxTextureSize());
}

async function waitForSkyMesh(signal, token) {
    const existing = skyEl.getObject3D('mesh');
    if (existing) return existing;

    if (!sceneEl.hasLoaded) {
        await new Promise((resolve, reject) => {
            const onAbort = () => {
                sceneEl.removeEventListener('loaded', onLoaded);
                reject(new DOMException('Aborted', 'AbortError'));
            };
            const onLoaded = () => {
                signal?.removeEventListener('abort', onAbort);
                resolve();
            };
            if (signal?.aborted) {
                reject(new DOMException('Aborted', 'AbortError'));
                return;
            }
            sceneEl.addEventListener('loaded', onLoaded, { once: true });
            signal?.addEventListener('abort', onAbort, { once: true });
        });
    }

    return new Promise((resolve, reject) => {
        const tick = () => {
            if (signal?.aborted || token !== panoramaLoadToken) {
                reject(new DOMException('Aborted', 'AbortError'));
                return;
            }
            const mesh = skyEl.getObject3D('mesh');
            if (mesh) {
                resolve(mesh);
                return;
            }
            requestAnimationFrame(tick);
        };
        tick();
    });
}

async function applyBitmapToSky(bitmap, token, signal) {
    throwIfAborted(token, signal);
    const mesh = await waitForSkyMesh(signal, token);
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    throwIfAborted(token, signal);

    const THREE = AFRAME.THREE;
    const texture = new THREE.Texture(bitmap);
    if ('SRGBColorSpace' in THREE) {
        texture.colorSpace = THREE.SRGBColorSpace;
    }
    texture.flipY = false;
    const renderer = sceneEl.renderer;
    const gl = renderer && typeof renderer.getContext === 'function' ? renderer.getContext() : null;
    const webgl2 = !!(gl && typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext);
    const huge = bitmap.width > 8192 || bitmap.height > 8192;
    if (webgl2 && !huge) {
        texture.generateMipmaps = true;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
    } else {
        texture.generateMipmaps = false;
        texture.minFilter = THREE.LinearFilter;
    }
    texture.magFilter = THREE.LinearFilter;
    if (renderer && renderer.capabilities && typeof renderer.capabilities.getMaxAnisotropy === 'function') {
        texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    }
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.needsUpdate = true;

    const prevTexture = activeSkyTexture || mesh.material.map;
    const prevBitmap = activeSkyBitmap;
    mesh.material.map = texture;
    mesh.material.needsUpdate = true;
    activeSkyTexture = texture;
    activeSkyBitmap = bitmap;

    if (prevTexture && prevTexture !== texture) prevTexture.dispose();
    if (prevBitmap && prevBitmap !== bitmap) prevBitmap.close();
    refreshLookMapCache();
    updateFlatView();
}

function normalizeManifestEntry(entry, folder) {
    if (typeof entry === 'string') {
        return { name: entry, preview: assetUrl(folder, entry), full: null, file: null, flipped: false };
    }
    return {
        name: entry.name || entry.full || entry.preview,
        preview: entry.preview ? assetUrl(folder, entry.preview) : null,
        full: entry.full ? assetUrl(folder, entry.full) : null,
        file: null,
        flipped: false
    };
}

function isSlimVerticalLayout() {
    return SLIM_MOBILE_MQ.matches;
}

function updateSlimUiLayout(opts) {
    const slim = isSlimVerticalLayout();
    const initial = !!(opts && opts.initial);
    document.documentElement.classList.toggle('is-slim-mobile', slim);
    document.body.classList.toggle('is-slim-mobile', slim);

    if (slim) {
        const viewportH = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
        const scale = Math.max(0.75, Math.min(1, viewportH / 860));
        mainUi.style.setProperty('--ui-scale', scale.toFixed(3));
    } else {
        mainUi.style.removeProperty('--ui-scale');
    }

    if (initial && slim) setUiVisible(false);
    document.documentElement.classList.add('ui-ready');
}

// --- Initialization ---
window.addEventListener('DOMContentLoaded', () => {
    log('System Initializing...');
    log('Pan mode: drag to look, pinch or scroll to zoom.');
    setFov(DEFAULT_FOV);
    setLens(0);
    updateNavButtons();
    updateSlimUiLayout({ initial: true });
    setLookHudVisible(isLookHudVisible);
    syncChrome();
    startLookHud();
    if (sceneEl.hasLoaded) ensureLensPass();
    else sceneEl.addEventListener('loaded', () => ensureLensPass(), { once: true });
    showHintIfNeeded();
    setTimeout(startDemoLoad, 0);
});

async function startDemoLoad() {
    if (!demoLoadActive) return;

    const demoFolder = 'assets/360-images/';
    demoLoadController = new AbortController();
    const { signal } = demoLoadController;

    try {
        const response = await fetch(demoFolder + 'manifest.json', { signal });
        if (!response.ok || !demoLoadActive) return;
        const fileList = await response.json();
        if (!demoLoadActive) return;
        const demoFiles = fileList.map(entry => normalizeManifestEntry(entry, demoFolder));
        if (demoFiles.length > 0 && demoLoadActive) {
            log(`Loading ${demoFiles.length} preview images in the background…`);
            loadImagesIntoSystem(demoFiles);
        }
    } catch (e) {
        if (isAbortError(e)) return;
        log(`Manifest Error: ${e.message}`, 'error');
    }
}

// --- UI Logic ---
function syncTogglePosition() {
    const vv = window.visualViewport;
    if (!vv) {
        document.documentElement.style.setProperty('--vv-top', '0px');
        document.documentElement.style.setProperty('--vv-right', '0px');
        return;
    }
    const top = Math.max(0, vv.offsetTop);
    const right = Math.max(0, window.innerWidth - vv.offsetLeft - vv.width);
    document.documentElement.style.setProperty('--vv-top', `${top}px`);
    document.documentElement.style.setProperty('--vv-right', `${right}px`);
}

function setUiVisible(visible) {
    isUiVisible = !!visible;
    mainUi.classList.toggle('hidden', !isUiVisible);
    if (!isUiVisible) galleryModal.classList.add('hidden');
    toggleUiBtn.classList.toggle('is-ui-hidden', !isUiVisible);
    toggleUiBtn.setAttribute('aria-pressed', isUiVisible ? 'true' : 'false');
    toggleUiBtn.setAttribute('aria-label', isUiVisible ? 'Hide controls' : 'Show controls');
    toggleUiBtn.title = isUiVisible ? 'Hide controls' : 'Show controls';
    document.body.classList.toggle('is-ui-hidden', !isUiVisible);
    if (!isUiVisible && isSlimVerticalLayout()) setHelpOpen(false);
    syncChrome();
}

function toggleUI(event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    setUiVisible(!isUiVisible);
}

toggleUiBtn.addEventListener('click', toggleUI);
toggleUiBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
closeUiBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    setUiVisible(false);
});

function isTypingTarget(el) {
    const tag = (el && el.tagName) || '';
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!(el && el.isContentEditable);
}

function isGalleryOpen() {
    return galleryModal && !galleryModal.classList.contains('hidden');
}

function setGalleryOpen(open) {
    galleryModal.classList.toggle('hidden', !open);
    if (open) {
        if (window.innerWidth < 600) mainUi.classList.add('hidden');
        const current = document.getElementById(`thumb-${currentIndex}`);
        if (current && current.scrollIntoView) {
            current.scrollIntoView({ block: 'nearest' });
        }
    } else if (isUiVisible) {
        mainUi.classList.remove('hidden');
    }
}

function setHelpOpen(open) {
    helpPanel.classList.toggle('hidden', !open);
    helpPanel.setAttribute('aria-hidden', open ? 'false' : 'true');
    [helpBtn, helpMenuBtn].forEach((btn) => {
        if (!btn) return;
        btn.classList.toggle('active', open);
        btn.setAttribute('aria-pressed', open ? 'true' : 'false');
        btn.setAttribute('aria-label', open ? 'Hide shortcuts' : 'Show shortcuts');
        btn.title = open ? 'Hide shortcuts' : 'Shortcuts';
    });
}

function closeOverlays() {
    setHelpOpen(false);
    if (isGalleryOpen()) setGalleryOpen(false);
    setMotionPermissionOpen(false);
}

function syncChrome() {
    const hasImages = imageItems.length > 0;
    const multi = imageItems.length > 1;
    const showEdges = hasImages && multi && !isUiVisible && !sceneEl.is('vr-mode');
    edgePrev.classList.toggle('hidden', !showEdges);
    edgeNext.classList.toggle('hidden', !showEdges);
    const hideSceneHud = !hasImages || sceneEl.is('vr-mode') || (isUiVisible && !isSlimVerticalLayout());
    sceneHud.classList.toggle('hidden', hideSceneHud);
    if (sceneHudPaused) sceneHudPaused.classList.toggle('hidden', !playbackPaused);
    syncLookHudVisibility();
}

function updateSceneHud() {
    const item = imageItems[currentIndex];
    if (!item) {
        sceneHudIndex.textContent = '0 / 0';
        sceneHudName.textContent = '';
        return;
    }
    sceneHudIndex.textContent = `${currentIndex + 1} / ${imageItems.length}`;
    sceneHudName.textContent = displayName(item);
    syncChrome();
}

function updateNavButtons() {
    const multi = imageItems.length > 1;
    prevBtn.disabled = !multi;
    nextBtn.disabled = !multi;
    edgePrev.disabled = !multi;
    edgeNext.disabled = !multi;
    galleryBtn.disabled = imageItems.length === 0;
}

function stepPanorama(delta) {
    if (imageItems.length < 2) return;
    const next = (currentIndex + delta + imageItems.length) % imageItems.length;
    loadPanorama(next);
}

function setPlaybackPaused(paused, options = {}) {
    const canPause = lookMode === 'auto' || lookMode === 'wander';
    const next = !!paused && canPause;
    const changed = next !== playbackPaused;
    playbackPaused = next;
    if (sceneHudPaused) sceneHudPaused.classList.toggle('hidden', !playbackPaused);
    autoPanLast = 0;
    wanderLast = 0;
    if (changed && canPause && !options.silent) {
        log(playbackPaused ? 'Paused.' : 'Resumed.');
    }
}

function resetView() {
    const lookControls = getLookControls();
    if (lookControls) {
        lookControls.yawObject.rotation.y = 0;
        lookControls.pitchObject.rotation.x = 0;
    }
    if (lookMode !== 'wander') setFov(DEFAULT_FOV);
    if (lookMode === 'wander') {
        wanderFrom = getWanderPose();
        wanderFrom.pitch = 0;
        wanderFrom.fov = DEFAULT_FOV;
        setFov(DEFAULT_FOV);
        wanderTo = pickWanderTarget(wanderFrom);
        wanderStart = 0;
    }
    log('View reset.');
}

helpBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    setHelpOpen(helpPanel.classList.contains('hidden'));
});
helpBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
if (helpMenuBtn) {
    helpMenuBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        setHelpOpen(helpPanel.classList.contains('hidden'));
    });
    helpMenuBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
}

edgePrev.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    stepPanorama(-1);
});
edgeNext.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    stepPanorama(1);
});
edgePrev.addEventListener('pointerdown', (e) => e.stopPropagation());
edgeNext.addEventListener('pointerdown', (e) => e.stopPropagation());

window.addEventListener('keydown', (e) => {
    if (isTypingTarget(e.target)) return;
    const key = e.key;

    if (key === 'Escape') {
        e.preventDefault();
        closeOverlays();
        return;
    }

    if (key === '?' || (key === '/' && e.shiftKey)) {
        e.preventDefault();
        setHelpOpen(helpPanel.classList.contains('hidden'));
        return;
    }

    if (key === 'h' || key === 'H') {
        e.preventDefault();
        toggleUI();
        return;
    }

    if (key === 'f' || key === 'F') {
        e.preventDefault();
        toggleFullscreen();
        return;
    }

    if (key === ' ' || key === 'Spacebar') {
        if (lookMode === 'auto' || lookMode === 'wander') {
            e.preventDefault();
            setPlaybackPaused(!playbackPaused);
        }
        return;
    }

    if (key === 'r' || key === 'R') {
        e.preventDefault();
        resetView();
        return;
    }

    if (key === 'ArrowLeft') {
        e.preventDefault();
        stepPanorama(-1);
        return;
    }

    if (key === 'ArrowRight') {
        e.preventDefault();
        stepPanorama(1);
    }
});

syncTogglePosition();
window.addEventListener('resize', syncTogglePosition);
window.addEventListener('orientationchange', () => setTimeout(syncTogglePosition, 150));
if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', syncTogglePosition);
    window.visualViewport.addEventListener('scroll', syncTogglePosition);
}

function onSlimLayoutChange() {
    updateSlimUiLayout();
}
if (typeof SLIM_MOBILE_MQ.addEventListener === 'function') {
    SLIM_MOBILE_MQ.addEventListener('change', onSlimLayoutChange);
} else if (typeof SLIM_MOBILE_MQ.addListener === 'function') {
    SLIM_MOBILE_MQ.addListener(onSlimLayoutChange);
}
window.addEventListener('resize', onSlimLayoutChange);
window.addEventListener('orientationchange', () => setTimeout(onSlimLayoutChange, 150));
if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', onSlimLayoutChange);
}

// --- Gallery Logic ---
galleryBtn.addEventListener('click', () => setGalleryOpen(true));
closeGalleryBtn.addEventListener('click', () => setGalleryOpen(false));

function needsMotionPermission() {
    return typeof DeviceOrientationEvent !== 'undefined'
        && typeof DeviceOrientationEvent.requestPermission === 'function';
}

function setMotionPermissionOpen(open, opts) {
    if (!motionPermissionModal) return;
    const denied = !!(opts && opts.denied);
    motionPermissionModal.classList.toggle('hidden', !open);
    motionPermissionModal.setAttribute('aria-hidden', open ? 'false' : 'true');
    if (!open) return;
    if (motionPermTitle) motionPermTitle.textContent = denied ? 'Tilt permission blocked' : 'Allow tilt sensors';
    if (motionPermCopy) {
        motionPermCopy.textContent = denied
            ? 'Motion control needs access to your phone’s tilt sensors. You can enable this in Safari settings, then try Motion again.'
            : 'Motion mode uses your phone’s gyroscope so you can look around by tilting the device. Your browser will ask for permission next.';
    }
    if (motionPermAllow) {
        motionPermAllow.textContent = denied ? 'OK' : 'Allow';
        motionPermAllow.hidden = false;
    }
    if (motionPermDeny) motionPermDeny.hidden = denied;
}

async function requestMotionPermission() {
    const root = document.documentElement;
    const previousScheme = root.style.colorScheme;
    root.style.colorScheme = 'light';
    try {
        return await DeviceOrientationEvent.requestPermission();
    } finally {
        root.style.colorScheme = previousScheme;
    }
}

// --- Look modes: Pan (default), Auto, Motion, Flat, Wander; VR is a same-sized action ---
gyroBtn.addEventListener('click', () => {
    if (lookMode === 'motion') {
        setLookMode('pan');
        return;
    }
    if (needsMotionPermission()) {
        setMotionPermissionOpen(true);
        return;
    }
    setLookMode('motion');
});

if (motionPermDeny) {
    motionPermDeny.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        setMotionPermissionOpen(false);
    });
}

if (motionPermAllow) {
    motionPermAllow.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (motionPermDeny && motionPermDeny.hidden) {
            setMotionPermissionOpen(false);
            return;
        }
        if (!needsMotionPermission()) {
            setMotionPermissionOpen(false);
            setLookMode('motion');
            return;
        }
        motionPermAllow.disabled = true;
        try {
            const response = await requestMotionPermission();
            setMotionPermissionOpen(false);
            if (response === 'granted') {
                setLookMode('motion');
            } else {
                setMotionPermissionOpen(true, { denied: true });
            }
        } catch (err) {
            console.error(err);
            setMotionPermissionOpen(true, { denied: true });
        } finally {
            motionPermAllow.disabled = false;
        }
    });
}

if (motionPermissionModal) {
    motionPermissionModal.addEventListener('click', (e) => {
        if (e.target === motionPermissionModal) setMotionPermissionOpen(false);
    });
}

panBtn.addEventListener('click', () => setLookMode('pan'));
autoPanBtn.addEventListener('click', () => {
    if (lookMode === 'auto') setLookMode('pan');
    else setLookMode('auto');
});
flatBtn.addEventListener('click', () => {
    if (lookMode === 'flat') setLookMode('pan');
    else setLookMode('flat');
});
wanderBtn.addEventListener('click', () => {
    if (lookMode === 'wander') setLookMode('pan');
    else setLookMode('wander');
});

function stopAutoPan() {
    if (autoPanRaf) cancelAnimationFrame(autoPanRaf);
    autoPanRaf = 0;
    autoPanLast = 0;
}

function startAutoPan() {
    stopAutoPan();
    const tick = (time) => {
        if (lookMode !== 'auto') return;
        const dt = autoPanLast ? Math.min(0.05, (time - autoPanLast) / 1000) : 0;
        autoPanLast = time;
        const lookControls = getLookControls();
        if (playbackPaused) {
            autoPanLast = time;
            autoPanRaf = requestAnimationFrame(tick);
            return;
        }
        if (lookControls && !sceneEl.is('vr-mode')) {
            lookControls.yawObject.rotation.y -= getAutoPanRadPerSec() * autoPanDir * dt;
        }
        autoPanRaf = requestAnimationFrame(tick);
    };
    autoPanRaf = requestAnimationFrame(tick);
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function lerpAngle(a, b, t) {
    let delta = b - a;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    return a + delta * t;
}

function easeInOut(t) {
    return t * t * (3 - 2 * t);
}

function getWanderDuration() {
    const speed = Math.max(1, Math.min(100, Number(autoSpeedSlider.value || 30)));
    const t = (speed - 1) / 99;
    const base = 18000 - t * 14000;
    return base * (0.82 + Math.random() * 0.36);
}

function getWanderPose() {
    const lookControls = getLookControls();
    return {
        yaw: lookControls ? lookControls.yawObject.rotation.y : 0,
        pitch: lookControls ? lookControls.pitchObject.rotation.x : 0,
        fov: getFov()
    };
}

function pickWanderTarget(from) {
    let target = from;
    for (let i = 0; i < 8; i++) {
        const yawDelta = (Math.random() * 2 - 1) * (140 * Math.PI / 180);
        const pitch = WANDER_PITCH_MIN + Math.random() * (WANDER_PITCH_MAX - WANDER_PITCH_MIN);
        const fov = WANDER_FOV_MIN + Math.random() * (WANDER_FOV_MAX - WANDER_FOV_MIN);
        const next = { yaw: from.yaw + yawDelta, pitch, fov };
        const pitchGap = Math.abs(next.pitch - from.pitch);
        const fovGap = Math.abs(next.fov - from.fov);
        if (Math.abs(yawDelta) > 0.35 || pitchGap > 0.12 || fovGap > 8) {
            target = next;
            break;
        }
        target = next;
    }
    target.pitch = Math.max(WANDER_PITCH_MIN, Math.min(WANDER_PITCH_MAX, target.pitch));
    return target;
}

function stopWander() {
    if (wanderRaf) cancelAnimationFrame(wanderRaf);
    wanderRaf = 0;
    wanderFrom = null;
    wanderTo = null;
    wanderStart = 0;
}

function startWander() {
    stopWander();
    wanderFrom = getWanderPose();
    wanderFrom.pitch = Math.max(WANDER_PITCH_MIN, Math.min(WANDER_PITCH_MAX, wanderFrom.pitch));
    wanderTo = pickWanderTarget(wanderFrom);
    wanderStart = 0;
    wanderDuration = getWanderDuration();
    const tick = (time) => {
        if (lookMode !== 'wander') return;
        if (!wanderStart) wanderStart = time;
        if (playbackPaused) {
            if (wanderLast) wanderStart += time - wanderLast;
            wanderLast = time;
            wanderRaf = requestAnimationFrame(tick);
            return;
        }
        wanderLast = time;
        const u = Math.min(1, (time - wanderStart) / wanderDuration);
        const e = easeInOut(u);
        const lookControls = getLookControls();
        if (lookControls && !sceneEl.is('vr-mode')) {
            lookControls.yawObject.rotation.y = lerpAngle(wanderFrom.yaw, wanderTo.yaw, e);
            lookControls.pitchObject.rotation.x = lerp(wanderFrom.pitch, wanderTo.pitch, e);
            setFov(lerp(wanderFrom.fov, wanderTo.fov, e));
        }
        if (u >= 1) {
            wanderFrom = getWanderPose();
            wanderTo = pickWanderTarget(wanderFrom);
            wanderStart = time;
            wanderDuration = getWanderDuration();
        }
        wanderRaf = requestAnimationFrame(tick);
    };
    wanderRaf = requestAnimationFrame(tick);
}

function setFlatViewVisible(on) {
    if (!flatView) return;
    flatView.classList.toggle('hidden', !on);
    flatView.setAttribute('aria-hidden', on ? 'false' : 'true');
    if (on) updateFlatView();
}

function updateFlatView() {
    if (!flatCanvas || !flatView || flatView.classList.contains('hidden')) return;
    const bitmap = activeSkyBitmap;
    const ctx = flatCanvas.getContext('2d');
    if (!ctx) return;
    const viewW = Math.max(1, flatView.clientWidth);
    const viewH = Math.max(1, flatView.clientHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const canvasW = Math.max(1, Math.round(viewW * dpr));
    const canvasH = Math.max(1, Math.round(viewH * dpr));
    if (flatCanvas.width !== canvasW) flatCanvas.width = canvasW;
    if (flatCanvas.height !== canvasH) flatCanvas.height = canvasH;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvasW, canvasH);
    if (!bitmap) return;
    const scale = Math.min(canvasW / bitmap.width, canvasH / bitmap.height);
    const dw = bitmap.width * scale;
    const dh = bitmap.height * scale;
    const item = imageItems[currentIndex];
    const flipped = !!(item && item.flipped);
    ctx.save();
    ctx.translate(canvasW / 2, canvasH / 2);
    // Bitmaps are decoded with flipY for the WebGL sky. Canvas Y is opposite,
    // so invert by default; a user Flip already matches the stored bitmap.
    ctx.scale(1, flipped ? 1 : -1);
    try {
        ctx.drawImage(bitmap, -dw / 2, -dh / 2, dw, dh);
    } catch (err) {
        /* Bitmap may already be closed during a reload. */
    }
    ctx.restore();
}

function setLookMode(mode) {
    lookMode = mode;
    isMotionEnabled = mode === 'motion';
    stopAutoPan();
    stopWander();
    setPlaybackPaused(false, { silent: true });
    setFlatViewVisible(mode === 'flat');

    cameraEl.setAttribute('look-controls', {
        magicWindowTrackingEnabled: mode === 'motion',
        touchEnabled: false,
        mouseEnabled: false,
        reverseMouseDrag: true
    });

    panBtn.classList.toggle('active', mode === 'pan');
    autoPanBtn.classList.toggle('active', mode === 'auto');
    gyroBtn.classList.toggle('active', mode === 'motion');
    flatBtn.classList.toggle('active', mode === 'flat');
    wanderBtn.classList.toggle('active', mode === 'wander');
    setAutoSpeedEnabled(mode === 'auto' || mode === 'wander');
    autoDirBtn.disabled = mode !== 'auto';
    if (autoSpeedLabel) autoSpeedLabel.textContent = mode === 'wander' ? 'Wander speed' : 'Auto speed';
    const zoomLocked = mode === 'flat' || mode === 'wander';
    fovSlider.disabled = zoomLocked;
    if (fovBox) fovBox.classList.toggle('is-disabled', zoomLocked);
    if (lensSlider) lensSlider.disabled = mode === 'flat';
    if (lensBox) lensBox.classList.toggle('is-disabled', mode === 'flat');
    syncLookHudVisibility();

    if (mode === 'auto') {
        startAutoPan();
        log('Auto pan: slow rotation.');
    } else if (mode === 'wander') {
        startWander();
        log('Wander: random smooth look and zoom.');
    } else if (mode === 'flat') {
        log('Flat view: full rectangular image.');
    } else if (mode === 'motion') {
        log('Motion mode enabled.');
    } else {
        log('Pan mode: drag to look, pinch to zoom.');
    }
}

function getAutoPanRadPerSec() {
    return 0.0025 * Number(autoSpeedSlider.value || 30);
}

function setAutoSpeedEnabled(on) {
    autoSpeedSlider.disabled = !on;
    autoSpeedBox.classList.toggle('is-disabled', !on);
    autoDirBtn.disabled = !on || lookMode !== 'auto';
}

function syncAutoDirButton() {
    autoDirBtn.classList.toggle('is-reversed', autoPanDir < 0);
    autoDirBtn.setAttribute('aria-pressed', autoPanDir < 0 ? 'true' : 'false');
    autoDirBtn.title = autoPanDir < 0 ? 'Auto pan left. Tap to reverse.' : 'Auto pan right. Tap to reverse.';
}

autoSpeedSlider.addEventListener('input', () => {
    autoSpeedVal.textContent = autoSpeedSlider.value;
});

autoDirBtn.addEventListener('click', () => {
    autoPanDir *= -1;
    syncAutoDirButton();
    log(autoPanDir < 0 ? 'Auto pan: left.' : 'Auto pan: right.');
});

setAutoSpeedEnabled(false);
syncAutoDirButton();

function getFov() {
    const cam = cameraEl.getAttribute('camera');
    const fov = cam && cam.fov != null ? Number(cam.fov) : DEFAULT_FOV;
    return Number.isFinite(fov) ? fov : DEFAULT_FOV;
}

function setFov(fov) {
    const next = Math.max(FOV_MIN, Math.min(FOV_MAX, fov));
    cameraEl.setAttribute('camera', 'fov', next);
    fovSlider.value = String(Math.round(zoomPercentFromFov(next)));
    fovVal.textContent = formatZoom(next);
}

function formatLens(amount) {
    if (amount <= 0.01) return 'Rectilinear';
    if (amount >= 0.99) return 'Panini';
    return String(Math.round(amount * 100));
}

function getLens() {
    return lensAmount;
}

function setLens(amount) {
    lensAmount = Math.max(0, Math.min(1, Number(amount) || 0));
    if (lensSlider) lensSlider.value = String(Math.round(lensAmount * 100));
    if (lensVal) lensVal.textContent = formatLens(lensAmount);
    ensureLensPass();
}

function shouldLensPass() {
    if (lensAmount <= 0.01) return false;
    if (lookMode === 'flat') return false;
    const renderer = sceneEl && sceneEl.renderer;
    if (renderer && renderer.xr && renderer.xr.isPresenting) return false;
    if (sceneEl.is && sceneEl.is('vr-mode')) return false;
    return true;
}

function ensureLensPass() {
    if (lensPass || !sceneEl || !AFRAME || !AFRAME.THREE) return;
    const renderer = sceneEl.renderer;
    if (!renderer || typeof renderer.render !== 'function') {
        if (sceneEl.hasLoaded) return;
        sceneEl.addEventListener('loaded', () => ensureLensPass(), { once: true });
        return;
    }

    const THREE = AFRAME.THREE;
    const size = new THREE.Vector2();
    const rt = new THREE.WebGLRenderTarget(1, 1, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        depthBuffer: true,
        stencilBuffer: false
    });
    if (rt.texture) {
        rt.texture.generateMipmaps = false;
        if ('LinearSRGBColorSpace' in THREE) {
            rt.texture.colorSpace = THREE.LinearSRGBColorSpace;
        } else if ('NoColorSpace' in THREE) {
            rt.texture.colorSpace = THREE.NoColorSpace;
        }
    }

    const uniforms = {
        tDiffuse: { value: null },
        uLens: { value: 0 },
        uTanHalf: { value: 1 },
        uAspect: { value: 1 }
    };

    const material = new THREE.ShaderMaterial({
        uniforms,
        vertexShader: `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = vec4(position.xy, 0.0, 1.0);
            }
        `,
        fragmentShader: `
            uniform sampler2D tDiffuse;
            uniform float uLens;
            uniform float uTanHalf;
            uniform float uAspect;
            varying vec2 vUv;

            vec2 paniniGeneric(vec2 viewPos, float d) {
                float viewDist = 1.0 + d;
                float viewHypSq = viewPos.x * viewPos.x + viewDist * viewDist;
                float isectD = viewPos.x * d;
                float isectDiscrim = max(viewHypSq - isectD * isectD, 0.0);
                float cylDistMinusD = (-isectD * viewPos.x + viewDist * sqrt(isectDiscrim)) / max(viewHypSq, 1e-6);
                float cylDist = cylDistMinusD + d;
                vec2 cylPos = viewPos * (cylDist / viewDist);
                return cylPos / max(cylDist - d, 1e-5);
            }

            vec3 linearToSRGB(vec3 value) {
                vec3 cutoff = step(vec3(0.0031308), value);
                vec3 low = value * 12.92;
                vec3 high = 1.055 * pow(max(value, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055;
                return mix(low, high, cutoff);
            }

            void main() {
                vec2 ndc = vUv * 2.0 - 1.0;
                vec2 extents = vec2(uTanHalf * uAspect, uTanHalf);
                float crop = mix(1.0, 0.86, uLens);
                vec2 viewPos = ndc * extents * crop;
                vec2 projNdc = paniniGeneric(viewPos, 1.0) / extents;
                vec2 warpedUv = projNdc * 0.5 + 0.5;
                vec2 srcUv = mix(vUv, warpedUv, uLens);
                if (srcUv.x < 0.0 || srcUv.x > 1.0 || srcUv.y < 0.0 || srcUv.y > 1.0) {
                    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
                    return;
                }
                vec4 color = texture2D(tDiffuse, srcUv);
                gl_FragColor = vec4(linearToSRGB(color.rgb), 1.0);
            }
        `,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
        fog: false,
        lights: false
    });

    const blitScene = new THREE.Scene();
    const blitCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const blitMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    blitMesh.frustumCulled = false;
    blitScene.add(blitMesh);

    const origRender = renderer.render.bind(renderer);
    let inside = false;

    renderer.render = function (sceneObj, camera) {
        if (inside || sceneObj === blitScene || !shouldLensPass()) {
            origRender(sceneObj, camera);
            return;
        }

        renderer.getDrawingBufferSize(size);
        if (rt.width !== size.x || rt.height !== size.y) {
            rt.setSize(Math.max(1, size.x), Math.max(1, size.y));
        }

        inside = true;
        renderer.setRenderTarget(rt);
        origRender(sceneObj, camera);
        renderer.setRenderTarget(null);
        uniforms.tDiffuse.value = rt.texture;
        uniforms.uLens.value = lensAmount;
        uniforms.uTanHalf.value = Math.tan((getFov() * Math.PI / 180) * 0.5);
        uniforms.uAspect.value = size.x / Math.max(1, size.y);
        origRender(blitScene, blitCamera);
        inside = false;
    };

    lensPass = { rt, blitScene, blitCamera, material };
}

function updateLensView() {
    ensureLensPass();
    if (skyEl.object3D) skyEl.object3D.visible = lookMode !== 'flat';
}

function getLookControls() {
    return cameraEl.components && cameraEl.components['look-controls'];
}

function syncLookHudVisibility() {
    if (!lookHud) return;
    const show = isLookHudVisible && imageItems.length > 0 && lookMode !== 'flat' && !sceneEl.is('vr-mode');
    lookHud.classList.toggle('hidden', !show);
    lookHud.setAttribute('aria-hidden', show ? 'false' : 'true');
    lookHud.classList.toggle('is-wander', lookMode === 'wander');
}

function setLookHudVisible(visible) {
    isLookHudVisible = !!visible;
    document.body.classList.toggle('is-look-hud-hidden', !isLookHudVisible);
    if (lookHudBtn) {
        lookHudBtn.classList.toggle('active', isLookHudVisible);
        lookHudBtn.setAttribute('aria-pressed', isLookHudVisible ? 'true' : 'false');
        const label = isLookHudVisible ? 'Hide location preview' : 'Show location preview';
        lookHudBtn.title = label;
        lookHudBtn.setAttribute('aria-label', label);
    }
    try {
        localStorage.setItem(LOOK_HUD_STORAGE_KEY, isLookHudVisible ? '0' : '1');
    } catch (err) { /* ignore */ }
    syncLookHudVisibility();
}

function refreshLookMapCache() {
    const bitmap = activeSkyBitmap;
    if (!bitmap) {
        lookMapCache = null;
        return;
    }
    if (!lookMapCache) lookMapCache = document.createElement('canvas');
    const w = 512;
    const h = 256;
    if (lookMapCache.width !== w) lookMapCache.width = w;
    if (lookMapCache.height !== h) lookMapCache.height = h;
    const ctx = lookMapCache.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    try {
        ctx.drawImage(bitmap, 0, 0, w, h);
    } catch (err) {
        lookMapCache = null;
    }
}

function getViewOnImage() {
    if (!cameraEl.object3D || !skyEl.object3D || !AFRAME || !AFRAME.THREE) return null;
    const THREE = AFRAME.THREE;
    if (!lookScratch.vec) {
        lookScratch.vec = new THREE.Vector3();
        lookScratch.quat = new THREE.Quaternion();
        lookScratch.inv = new THREE.Matrix4();
    }
    cameraEl.object3D.updateMatrixWorld(true);
    skyEl.object3D.updateMatrixWorld(true);
    cameraEl.object3D.getWorldQuaternion(lookScratch.quat);
    lookScratch.vec.set(0, 0, -1).applyQuaternion(lookScratch.quat);
    const elev = Math.asin(Math.max(-1, Math.min(1, lookScratch.vec.y))) * 180 / Math.PI;
    lookScratch.inv.copy(skyEl.object3D.matrixWorld).invert();
    lookScratch.vec.transformDirection(lookScratch.inv).normalize();
    const y = Math.max(-1, Math.min(1, lookScratch.vec.y));
    const phi = Math.acos(y);
    let theta = Math.atan2(lookScratch.vec.z, -lookScratch.vec.x);
    if (theta < 0) theta += Math.PI * 2;
    const u = theta / (Math.PI * 2);
    const v = phi / Math.PI;
    return { u, v, elev };
}

function drawLookMap(view) {
    if (!lookMap || !view) return;
    const wrap = lookHud;
    const cssW = Math.max(2, lookMap.clientWidth || (wrap ? wrap.clientWidth - 16 : 240));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(2, Math.round(cssW * dpr));
    const h = Math.max(1, Math.round((cssW / 2) * dpr));
    if (lookMap.width !== w) lookMap.width = w;
    if (lookMap.height !== h) lookMap.height = h;
    const ctx = lookMap.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);

    const item = imageItems[currentIndex];
    const flipped = !!(item && item.flipped);
    const source = lookMapCache;
    if (source) {
        ctx.save();
        ctx.translate(w / 2, h / 2);
        ctx.scale(1, flipped ? 1 : -1);
        try {
            ctx.drawImage(source, -w / 2, -h / 2, w, h);
        } catch (err) { /* cache may be stale during reload */ }
        ctx.restore();
    }

    const canvas = sceneEl.canvas;
    const aspect = ((canvas && canvas.clientWidth) || window.innerWidth) /
        Math.max(1, (canvas && canvas.clientHeight) || window.innerHeight);
    const vfov = getFov();
    const hfov = 2 * Math.atan(Math.tan((vfov * Math.PI / 180) / 2) * aspect) * 180 / Math.PI;
    const boxW = Math.max(10, (hfov / 360) * w);
    const boxH = Math.max(8, (vfov / 180) * h);
    const cx = view.u * w;
    const cy = Math.max(boxH / 2, Math.min(h - boxH / 2, view.v * h));
    ctx.strokeStyle = lookMode === 'wander' ? 'rgba(74, 222, 128, 0.95)' : 'rgba(147, 197, 253, 0.95)';
    ctx.lineWidth = Math.max(2, dpr);
    for (const ox of [cx - w, cx, cx + w]) {
        if (ox + boxW / 2 < 0 || ox - boxW / 2 > w) continue;
        ctx.strokeRect(ox - boxW / 2, cy - boxH / 2, boxW, boxH);
    }
    ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath();
    ctx.arc(((cx % w) + w) % w, cy, Math.max(2.5, 3 * dpr * 0.5), 0, Math.PI * 2);
    ctx.fill();
}

function updateLookHud() {
    if (!lookHud || lookHud.classList.contains('hidden')) return;
    const view = getViewOnImage();
    if (!view) return;
    const heading = Math.round(view.u * 360) % 360;
    const elev = Math.round(view.elev);
    const zoom = formatZoom(getFov());
    const pitchText = elev > 0 ? `↑ ${elev}°` : elev < 0 ? `↓ ${Math.abs(elev)}°` : 'Level';
    const headingText = `${heading}°`;
    const label = `${headingText}|${pitchText}|${zoom}`;
    if (label !== lastLookLabel) {
        lastLookLabel = label;
        lookHeading.textContent = headingText;
        lookPitch.textContent = pitchText;
        lookZoom.textContent = zoom;
    }
    drawLookMap(view);
}

function startLookHud() {
    if (lookHudRaf) cancelAnimationFrame(lookHudRaf);
    const tick = () => {
        updateLookHud();
        updateLensView();
        lookHudRaf = requestAnimationFrame(tick);
    };
    lookHudRaf = requestAnimationFrame(tick);
}

function rotateLook(dx, dy) {
    const lookControls = getLookControls();
    if (!lookControls) return;
    const canvas = sceneEl.canvas;
    const width = (canvas && canvas.clientWidth) || window.innerWidth || 1;
    const height = (canvas && canvas.clientHeight) || window.innerHeight || 1;
    lookControls.yawObject.rotation.y += (dx / width) * Math.PI * 2;
    lookControls.pitchObject.rotation.x += (dy / height) * Math.PI;
    const limit = Math.PI / 2 - 0.01;
    lookControls.pitchObject.rotation.x = Math.max(-limit, Math.min(limit, lookControls.pitchObject.rotation.x));
}

function isHudTarget(el) {
    return !!(el && el.closest && el.closest('#hudControls, #mainUi, #galleryModal, #helpPanel, #motionPermissionModal, #edgePrev, #edgeNext, button, input, label, a, .floating-toggle, .glass-panel, .edge-nav, .help-panel, .app-modal'));
}

function bindPanZoom() {
    const pointers = new Map();
    let pinchStartDist = 0;
    let pinchStartFov = 80;
    let panPointerId = null;
    let lastPan = null;
    let suppressPan = false;

    function pointerDistance() {
        const pts = Array.from(pointers.values());
        if (pts.length < 2) return 0;
        return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    }

    window.addEventListener('pointerdown', (e) => {
        if (e.button != null && e.button !== 0) return;
        if (isHudTarget(e.target) || sceneEl.is('vr-mode')) return;
        if (isGalleryOpen()) {
            setGalleryOpen(false);
            return;
        }
        if (helpPanel && !helpPanel.classList.contains('hidden')) setHelpOpen(false);
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (sceneEl.canvas) {
            try { sceneEl.canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        }
        if (pointers.size >= 2) {
            suppressPan = true;
            panPointerId = null;
            lastPan = null;
            pinchStartDist = pointerDistance();
            pinchStartFov = getFov();
            return;
        }
        if (lookMode !== 'pan') return;
        panPointerId = e.pointerId;
        lastPan = { x: e.clientX, y: e.clientY };
    });

    window.addEventListener('pointermove', (e) => {
        if (!pointers.has(e.pointerId)) return;
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.size >= 2) {
            if (lookMode === 'flat' || lookMode === 'wander') return;
            if (e.cancelable) e.preventDefault();
            const dist = pointerDistance();
            if (pinchStartDist > 0) setFov(pinchStartFov * (pinchStartDist / dist));
            return;
        }
        if (lookMode !== 'pan' || suppressPan || panPointerId !== e.pointerId || sceneEl.is('vr-mode')) return;
        if (e.cancelable) e.preventDefault();
        if (lastPan) rotateLook(e.clientX - lastPan.x, e.clientY - lastPan.y);
        lastPan = { x: e.clientX, y: e.clientY };
    }, { passive: false });

    function endPointer(e) {
        pointers.delete(e.pointerId);
        if (e.pointerId === panPointerId) {
            panPointerId = null;
            lastPan = null;
        }
        if (pointers.size < 2) pinchStartDist = 0;
        if (pointers.size === 0) suppressPan = false;
    }
    window.addEventListener('pointerup', endPointer);
    window.addEventListener('pointercancel', endPointer);
    window.addEventListener('pointerleave', (e) => {
        if (pointers.has(e.pointerId) && e.buttons === 0) endPointer(e);
    });

    window.addEventListener('wheel', (e) => {
        if (isHudTarget(e.target) || sceneEl.is('vr-mode')) return;
        if (lookMode === 'flat' || lookMode === 'wander') return;
        e.preventDefault();
        setFov(getFov() + e.deltaY * 0.05);
    }, { passive: false });
}

bindPanZoom();

window.addEventListener('dblclick', (e) => {
    if (isHudTarget(e.target) || sceneEl.is('vr-mode')) return;
    if (lookMode === 'flat') return;
    resetView();
});

function getFullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement || null;
}

function requestFullscreen(el) {
    const fn = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
    if (!fn) return Promise.reject(new Error('Fullscreen is not supported'));
    return Promise.resolve(fn.call(el));
}

function exitFullscreen() {
    const fn = document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen;
    if (!fn) return Promise.resolve();
    return Promise.resolve(fn.call(document));
}

function refreshSceneAfterLayout() {
    syncTogglePosition();
    updateFlatView();
    if (sceneEl && typeof sceneEl.resize === 'function') {
        sceneEl.resize();
    } else if (sceneEl && sceneEl.renderer && sceneEl.canvas) {
        const canvas = sceneEl.canvas;
        sceneEl.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    }
}

function syncFullscreenButton() {
    const active = !!getFullscreenElement();
    fullscreenBtn.classList.toggle('is-fullscreen', active);
    fullscreenBtn.setAttribute('aria-pressed', active ? 'true' : 'false');
    fullscreenBtn.setAttribute('aria-label', active ? 'Exit fullscreen' : 'Enter fullscreen');
    fullscreenBtn.title = active ? 'Exit fullscreen' : 'Enter fullscreen';
    document.body.classList.toggle('is-fullscreen', active);
}

async function toggleFullscreen(event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    try {
        if (getFullscreenElement()) {
            await exitFullscreen();
        } else {
            await requestFullscreen(document.documentElement);
        }
    } catch (err) {
        log(`Fullscreen: ${err.message}`, 'error');
    }
}

fullscreenBtn.addEventListener('click', toggleFullscreen);
fullscreenBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
document.addEventListener('fullscreenchange', () => {
    syncFullscreenButton();
    setTimeout(refreshSceneAfterLayout, 50);
    setTimeout(refreshSceneAfterLayout, 250);
});
document.addEventListener('webkitfullscreenchange', () => {
    syncFullscreenButton();
    setTimeout(refreshSceneAfterLayout, 50);
    setTimeout(refreshSceneAfterLayout, 250);
});
window.addEventListener('resize', refreshSceneAfterLayout);


// --- 2. VR Button Logic (Quest Safe) ---
vrBtn.addEventListener('click', async () => {
    if (sceneEl.is('vr-mode')) {
        sceneEl.exitVR();
        return;
    }
    if (location.protocol !== 'https:') {
        alert('VR ERROR: You must use HTTPS (ngrok) for VR mode.');
        return;
    }
    try {
        sceneEl.enterVR();
    } catch (err) {
        alert('VR Error: ' + err.message);
    }
});

sceneEl.addEventListener('enter-vr', () => {
    vrBtn.classList.add('active');
    if (lookMode === 'flat') setFlatViewVisible(false);
    setHelpOpen(false);
    setGalleryOpen(false);
    syncChrome();
});
sceneEl.addEventListener('exit-vr', () => {
    vrBtn.classList.remove('active');
    if (lookMode === 'flat') setFlatViewVisible(true);
    syncChrome();
});

// --- File Input ---
function filesFromInput(fileList) {
    const files = Array.from(fileList).filter(f => IMAGE_NAME_RE.test(f.name));
    files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    return files.map(f => ({ name: f.name, file: f, preview: null, full: null, flipped: false }));
}

function handleUserFiles(fileList) {
    const items = filesFromInput(fileList);
    if (items.length === 0) {
        log('No supported images found (jpg, png, webp).', 'error');
        return;
    }
    cancelDemoLoads();
    loadImagesIntoSystem(items);
    log(`Loaded ${items.length} local image${items.length === 1 ? '' : 's'}.`, 'success');
}

fileInput.addEventListener('change', (e) => handleUserFiles(e.target.files));
dirInput.addEventListener('change', (e) => handleUserFiles(e.target.files));

// --- System Core ---
function loadImagesIntoSystem(items) {
    imageItems = items;
    fileCountLabel.textContent = `${imageItems.length} image${imageItems.length === 1 ? '' : 's'}`;
    currentIndex = 0;
    
    clearBtn.disabled = false;
    flipBtn.disabled = false;
    updateNavButtons();
    
    loadPanorama(currentIndex);
    startThumbnailGeneration();
}

// --- Panorama Loader ---
async function loadPanorama(index) {
    if (!imageItems[index]) return;
    const item = imageItems[index];
    currentIndex = index;
    currentNameLabel.textContent = `${index + 1}/${imageItems.length}: ${displayName(item)}`;
    galleryProgress.textContent = `(${index + 1}/${imageItems.length})`;
    updateSceneHud();
    updateNavButtons();
    updateActiveThumbnail();
    applySkyFlip(!!item.flipped);

    const token = ++panoramaLoadToken;
    abortMediaLoads();
    mediaController = new AbortController();
    const { signal } = mediaController;

    hideLoaders();
    showHiresChip('Loading preview…');
    loaderVr.setAttribute('visible', true);

    let pendingBitmap = null;
    try {
        const previewBlob = item.file
            ? item.file
            : await fetchBlob(item.preview || item.full, signal);
        throwIfAborted(token, signal);

        pendingBitmap = await decodeBitmap(
            previewBlob,
            item.file ? getHiResMaxWidth() : PREVIEW_MAX_WIDTH,
            signal,
            token
        );
        throwIfAborted(token, signal);

        await applyBitmapToSky(pendingBitmap, token, signal);
        pendingBitmap = null;
        hideHiresChip();
        loaderVr.setAttribute('visible', false);
        log(`Preview ready: ${item.name}`);

        if (!item.full || item.file || !demoLoadActive) return;

        await yieldToMain();
        throwIfAborted(token, signal);

        showHiresChip('Enhancing to high-res…');
        const fullBlob = await fetchBlob(item.full, signal);
        throwIfAborted(token, signal);

        const hiResMax = getHiResMaxWidth();
        pendingBitmap = await decodeBitmap(fullBlob, hiResMax, signal, token);
        throwIfAborted(token, signal);

        await applyBitmapToSky(pendingBitmap, token, signal);
        const appliedW = pendingBitmap.width;
        const appliedH = pendingBitmap.height;
        pendingBitmap = null;
        hideHiresChip();
        log(`High-res ready: ${item.name} (${appliedW}×${appliedH})`, 'success');
    } catch (e) {
        if (pendingBitmap) pendingBitmap.close();
        if (isAbortError(e) || token !== panoramaLoadToken) return;
        hideHiresChip();
        loaderVr.setAttribute('visible', false);
        log(`Load failed: ${e.message}`, 'error');
    }
}


// --- Slider & Nav ---
fovSlider.addEventListener('input', (e) => {
    if (lookMode === 'wander' || lookMode === 'flat') return;
    setFov(fovFromZoomPercent(Number(e.target.value)));
});

lensSlider.addEventListener('input', (e) => {
    if (lookMode === 'flat') return;
    setLens(Number(e.target.value) / 100);
});

nextBtn.addEventListener('click', () => stepPanorama(1));
prevBtn.addEventListener('click', () => stepPanorama(-1));
clearBtn.addEventListener('click', () => {
    if (confirm('Clear all images and reload the viewer?')) location.reload();
});
flipBtn.addEventListener('click', toggleFlip);
if (lookHudBtn) {
    lookHudBtn.addEventListener('click', () => setLookHudVisible(!isLookHudVisible));
}

function applySkyFlip(flipped) {
    skyEl.setAttribute('scale', flipped ? '-1 -1 1' : '-1 1 1');
    flipBtn.classList.toggle('active', flipped);
    flipBtn.setAttribute('aria-pressed', flipped ? 'true' : 'false');
    updateFlatView();
}

function toggleFlip() {
    const item = imageItems[currentIndex];
    if (!item) return;
    item.flipped = !item.flipped;
    applySkyFlip(item.flipped);
    const thumbImg = document.querySelector(`#thumb-${currentIndex} img`);
    if (thumbImg) thumbImg.classList.toggle('flipped', item.flipped);
    log(item.flipped ? 'Image flipped.' : 'Flip removed.');
}

// --- Thumbnails ---
async function startThumbnailGeneration() {
    const genId = ++thumbGenId;
    galleryGrid.innerHTML = '';
    thumbObjectUrls.forEach(url => URL.revokeObjectURL(url));
    thumbObjectUrls = [];

    for (let i = 0; i < imageItems.length; i++) {
        if (genId !== thumbGenId) return;
        const item = imageItems[i];
        const div = document.createElement('div');
        div.className = 'thumb-card';
        div.id = `thumb-${i}`;
        div.tabIndex = 0;
        div.setAttribute('role', 'button');
        div.setAttribute('aria-label', displayName(item));
        const select = () => {
            if (i !== currentIndex) loadPanorama(i);
            if (window.innerWidth < 600) setGalleryOpen(false);
        };
        div.addEventListener('click', select);
        div.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                select();
            }
        });
        
        const img = document.createElement('img');
        img.alt = displayName(item);
        img.loading = 'lazy';
        img.decoding = 'async';
        if (item.flipped) img.classList.add('flipped');
        if (item.file) {
            const url = URL.createObjectURL(item.file);
            thumbObjectUrls.push(url);
            img.src = url;
        } else {
            img.src = item.preview || item.full || '';
        }
        div.appendChild(img);
        
        const label = document.createElement('div');
        label.className = 'thumb-label';
        label.textContent = displayName(item);
        div.appendChild(label);
        
        galleryGrid.appendChild(div);
        await new Promise(r => setTimeout(r, 10)); 
    }
    updateActiveThumbnail();
}

function updateActiveThumbnail() {
    document.querySelectorAll('.thumb-card').forEach(el => el.classList.remove('active'));
    const current = document.getElementById(`thumb-${currentIndex}`);
    if (current) {
        current.classList.add('active');
        if (isGalleryOpen()) current.scrollIntoView({ block: 'nearest' });
    }
}

function showHintIfNeeded() {
    if (!hintToast) return;
    try {
        if (localStorage.getItem(HINT_STORAGE_KEY)) return;
    } catch (err) { /* ignore */ }
    hintToast.classList.remove('hidden');
    setTimeout(() => {
        hintToast.classList.add('hidden');
        try { localStorage.setItem(HINT_STORAGE_KEY, '1'); } catch (err) { /* ignore */ }
    }, 5200);
}

(function bindDrop() {
    let dropTimer = 0;
    const hasFiles = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
    const showDrop = () => dropOverlay.classList.remove('hidden');
    const hideDrop = () => dropOverlay.classList.add('hidden');

    window.addEventListener('dragover', (e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        showDrop();
        clearTimeout(dropTimer);
        dropTimer = setTimeout(hideDrop, 180);
    });

    window.addEventListener('drop', (e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        clearTimeout(dropTimer);
        hideDrop();
        const files = e.dataTransfer.files;
        if (files && files.length) handleUserFiles(files);
    });
})();
