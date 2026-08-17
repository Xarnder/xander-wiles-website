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
let isUiVisible = true;
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
const HIRES_MAX_WIDTH = 4096;

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
const vrBtn = document.getElementById('vrBtn');
const gyroBtn = document.getElementById('gyroBtn'); // The new motion button

// Containers
const mainUi = document.getElementById('mainUi');
const siteHeader = document.getElementById('site-header-container');
const galleryModal = document.getElementById('galleryModal');
const galleryGrid = document.getElementById('galleryGrid');
const galleryProgress = document.getElementById('galleryProgress');
const toggleUiBtn = document.getElementById('toggleUiBtn');
const closeUiBtn = document.getElementById('closeUiBtn');
const closeGalleryBtn = document.getElementById('closeGalleryBtn');

// --- Logger ---
function log(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const entry = document.createElement('div');
    entry.textContent = `[${timestamp}] ${message}`;
    if (type === 'error') entry.style.color = '#ff6b6b';
    if (type === 'success') entry.style.color = '#4ade80';
    debugLog.appendChild(entry);
    debugLog.scrollTop = debugLog.scrollHeight; 
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

async function decodeBitmap(blob, maxWidth, signal, token, forceSize) {
    await yieldToMain();
    throwIfAborted(token, signal);

    let bitmap;
    if (forceSize) {
        bitmap = await safeCreateImageBitmap(blob, {
            imageOrientation: 'flipY',
            resizeWidth: forceSize.width,
            resizeHeight: forceSize.height,
            resizeQuality: 'high'
        });
    } else {
        bitmap = await safeCreateImageBitmap(blob, { imageOrientation: 'flipY' });
        if (bitmap.width > maxWidth) {
            const resizeHeight = Math.max(1, Math.round(bitmap.height * (maxWidth / bitmap.width)));
            const resized = await safeCreateImageBitmap(bitmap, {
                imageOrientation: 'flipY',
                resizeWidth: maxWidth,
                resizeHeight,
                resizeQuality: 'medium'
            });
            bitmap.close();
            bitmap = resized;
        }
    }

    if (signal?.aborted || token !== panoramaLoadToken) {
        bitmap.close();
        throw new DOMException('Aborted', 'AbortError');
    }
    return bitmap;
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
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.wrapS = THREE.ClampToEdgeWrapping;
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
}

function normalizeManifestEntry(entry, folder) {
    if (typeof entry === 'string') {
        return { name: entry, preview: assetUrl(folder, entry), full: null, file: null };
    }
    return {
        name: entry.name || entry.full || entry.preview,
        preview: entry.preview ? assetUrl(folder, entry.preview) : null,
        full: entry.full ? assetUrl(folder, entry.full) : null,
        file: null
    };
}

// --- Initialization ---
window.addEventListener('DOMContentLoaded', () => {
    log('System Initializing...');
    log('UI is ready — you can upload your own images while defaults load.');
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
function toggleUI() {
    isUiVisible = !isUiVisible;
    if (isUiVisible) {
        mainUi.classList.remove('hidden');
        siteHeader.classList.remove('hidden');
    } else {
        mainUi.classList.add('hidden');
        siteHeader.classList.add('hidden');
        galleryModal.classList.add('hidden');
    }
}
toggleUiBtn.addEventListener('click', toggleUI);
closeUiBtn.addEventListener('click', toggleUI);

// --- Gallery Logic ---
galleryBtn.addEventListener('click', () => {
    galleryModal.classList.remove('hidden');
    if (window.innerWidth < 600) mainUi.classList.add('hidden');
});
closeGalleryBtn.addEventListener('click', () => {
    galleryModal.classList.add('hidden');
    if (isUiVisible) mainUi.classList.remove('hidden');
});

// --- 1. Motion / Gyro Button Logic ---
gyroBtn.addEventListener('click', async () => {
    if (isMotionEnabled) {
        // Disable
        cameraEl.setAttribute('look-controls', 'magicWindowTrackingEnabled', false);
        isMotionEnabled = false;
        gyroBtn.classList.remove('active');
        log('Motion disabled.');
    } else {
        // Enable
        // iOS 13+ requires permission
        if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
            try {
                const response = await DeviceOrientationEvent.requestPermission();
                if (response === 'granted') {
                    activateMotion();
                } else {
                    alert('Permission denied. Motion control requires sensor access.');
                }
            } catch (err) { console.error(err); }
        } else {
            // Android / Non-iOS
            activateMotion();
        }
    }
});

function activateMotion() {
    cameraEl.setAttribute('look-controls', 'magicWindowTrackingEnabled', true);
    isMotionEnabled = true;
    gyroBtn.classList.add('active');
    log('Motion enabled.');
}


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

// --- File Input ---
function filesFromInput(fileList) {
    const files = Array.from(fileList).filter(f => IMAGE_NAME_RE.test(f.name));
    files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    return files.map(f => ({ name: f.name, file: f, preview: null, full: null }));
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
    fileCountLabel.textContent = `${imageItems.length} loaded`;
    currentIndex = 0;
    
    prevBtn.disabled = false;
    nextBtn.disabled = false;
    galleryBtn.disabled = false;
    clearBtn.disabled = false;
    
    loadPanorama(currentIndex);
    startThumbnailGeneration();
}

// --- Panorama Loader ---
async function loadPanorama(index) {
    if (!imageItems[index]) return;
    const item = imageItems[index];
    currentIndex = index;
    currentNameLabel.textContent = `${index + 1}/${imageItems.length}: ${item.name}`;
    updateActiveThumbnail();

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
            item.file ? HIRES_MAX_WIDTH : PREVIEW_MAX_WIDTH,
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

        pendingBitmap = await decodeBitmap(
            fullBlob,
            HIRES_MAX_WIDTH,
            signal,
            token,
            { width: HIRES_MAX_WIDTH, height: Math.round(HIRES_MAX_WIDTH / 2) }
        );
        throwIfAborted(token, signal);

        await applyBitmapToSky(pendingBitmap, token, signal);
        pendingBitmap = null;
        hideHiresChip();
        log(`High-res ready: ${item.name}`, 'success');
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
    fovVal.textContent = e.target.value;
    cameraEl.setAttribute('camera', 'fov', e.target.value);
});

nextBtn.addEventListener('click', () => { if(currentIndex < imageItems.length - 1) loadPanorama(currentIndex + 1); });
prevBtn.addEventListener('click', () => { if(currentIndex > 0) loadPanorama(currentIndex - 1); });
clearBtn.addEventListener('click', () => { if(confirm('Clear?')) location.reload(); });

// --- Thumbnails ---
async function startThumbnailGeneration() {
    const genId = ++thumbGenId;
    galleryGrid.innerHTML = ''; 

    for (let i = 0; i < imageItems.length; i++) {
        if (genId !== thumbGenId) return;
        const item = imageItems[i];
        const div = document.createElement('div');
        div.className = 'thumb-card';
        div.id = `thumb-${i}`;
        div.onclick = () => loadPanorama(i);
        
        const img = document.createElement('img');
        img.alt = item.name;
        img.loading = 'lazy';
        img.decoding = 'async';
        if (item.file) {
            img.src = URL.createObjectURL(item.file);
        } else {
            img.src = item.preview || item.full || '';
        }
        div.appendChild(img);
        
        const label = document.createElement('div');
        label.className = 'thumb-label';
        label.textContent = item.name;
        div.appendChild(label);
        
        galleryGrid.appendChild(div);
        await new Promise(r => setTimeout(r, 10)); 
    }
    updateActiveThumbnail();
}

function updateActiveThumbnail() {
    document.querySelectorAll('.thumb-card').forEach(el => el.classList.remove('active'));
    const current = document.getElementById(`thumb-${currentIndex}`);
    if (current) current.classList.add('active');
}