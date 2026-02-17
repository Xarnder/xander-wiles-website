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
let isGeneratingThumbnails = false;
let isMotionEnabled = false; 

// --- A-Frame Elements ---
const sceneEl = document.querySelector('a-scene');
const skyEl = document.querySelector('#image-360');
const cameraEl = document.querySelector('#camera');
const loader2d = document.getElementById('loader-2d');
const loaderVr = document.getElementById('loader-vr');

// --- DOM Elements ---
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

// --- Initialization ---
window.addEventListener('DOMContentLoaded', async () => {
    log('System Initializing...');

    // Load Manifest
    const demoFolder = 'assets/360-images/';
    const manifestFile = 'manifest.json';
    try {
        const response = await fetch(demoFolder + manifestFile);
        if (response.ok) {
            const fileList = await response.json();
            const demoFiles = fileList.map(filename => ({
                name: filename,
                path: demoFolder + filename, 
                file: null 
            }));
            if (demoFiles.length > 0) {
                loadImagesIntoSystem(demoFiles);
            }
        }
    } catch (e) {
        log(`Manifest Error: ${e.message}`, 'error');
    }
});

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
dirInput.addEventListener('change', (e) => {
    const files = Array.from(e.target.files).filter(f => f.name.match(/\.(jpg|jpeg|png)$/i));
    files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    if (files.length > 0) loadImagesIntoSystem(files.map(f => ({ name: f.name, file: f, path: null })));
});

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
function loadPanorama(index) {
    if (!imageItems[index]) return;
    const item = imageItems[index];
    currentNameLabel.textContent = `${index + 1}/${imageItems.length}: ${item.name}`;
    
    // 1. Show Loaders
    loader2d.classList.remove('hidden');
    loaderVr.setAttribute('visible', true);
    
    const imageSource = item.file ? URL.createObjectURL(item.file) : item.path;

    // Reset Sky to trigger load event cleanly
    skyEl.setAttribute('src', '');
    setTimeout(() => {
        skyEl.setAttribute('src', imageSource);
    }, 50);

    updateActiveThumbnail();
}

// --- Loading Event Listener (The key for the loading bar) ---
skyEl.addEventListener('materialtextureloaded', () => {
    // Hide Loaders when texture is ready
    loader2d.classList.add('hidden');
    loaderVr.setAttribute('visible', false);
    log('Image loaded.');
});


// --- Slider & Nav ---
fovSlider.addEventListener('input', (e) => {
    fovVal.textContent = e.target.value;
    cameraEl.setAttribute('camera', 'fov', e.target.value);
});

nextBtn.addEventListener('click', () => { if(currentIndex < imageItems.length - 1) loadPanorama(++currentIndex); });
prevBtn.addEventListener('click', () => { if(currentIndex > 0) loadPanorama(--currentIndex); });
clearBtn.addEventListener('click', () => { if(confirm('Clear?')) location.reload(); });

// --- Thumbnails (Simplified for space) ---
async function startThumbnailGeneration() {
    if (isGeneratingThumbnails) return;
    isGeneratingThumbnails = true;
    galleryGrid.innerHTML = ''; 
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 200; canvas.height = 100;

    for (let i = 0; i < imageItems.length; i++) {
        const item = imageItems[i];
        const div = document.createElement('div');
        div.className = 'thumb-card';
        div.id = `thumb-${i}`;
        div.onclick = () => loadPanorama(i);
        
        const img = new Image();
        img.src = item.file ? URL.createObjectURL(item.file) : item.path;
        div.appendChild(img); // Simple append for speed
        
        const label = document.createElement('div');
        label.className = 'thumb-label';
        label.textContent = item.name;
        div.appendChild(label);
        
        galleryGrid.appendChild(div);
        await new Promise(r => setTimeout(r, 10)); 
    }
    isGeneratingThumbnails = false;
}

function updateActiveThumbnail() {
    document.querySelectorAll('.thumb-card').forEach(el => el.classList.remove('active'));
    const current = document.getElementById(`thumb-${currentIndex}`);
    if (current) current.classList.add('active');
}