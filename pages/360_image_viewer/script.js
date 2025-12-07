// --- Global State ---
let viewer = null;
let imageItems = []; 
let thumbnails = []; 
let currentIndex = 0;
let isUiVisible = true;
let isGeneratingThumbnails = false;
let isGyroEnabled = false;

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
const gyroBtn = document.getElementById('gyroBtn');
const vrBtn = document.getElementById('vrBtn');

// Containers
const mainUi = document.getElementById('mainUi');
const siteHeader = document.getElementById('site-header-container');
const galleryModal = document.getElementById('galleryModal');
const galleryGrid = document.getElementById('galleryGrid');
const galleryProgress = document.getElementById('galleryProgress');

// Buttons
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
    if (type === 'warn') entry.style.color = '#fbbf24';
    debugLog.appendChild(entry);
    debugLog.scrollTop = debugLog.scrollHeight; 
    console.log(`[${type.toUpperCase()}] ${message}`);
}

// --- Initialization: Load from Manifest ---
window.addEventListener('DOMContentLoaded', async () => {
    log('System Initializing...');
    
    // The folder path
    const demoFolder = 'assets/360-images/';
    // The manifest file that lists the images
    const manifestFile = 'manifest.json';

    try {
        // Fetch the JSON list instead of the folder folder
        const response = await fetch(demoFolder + manifestFile);
        
        if (response.ok) {
            const fileList = await response.json();
            
            // Map the JSON list to our system format
            const demoFiles = fileList.map(filename => {
                return {
                    name: filename,
                    path: demoFolder + filename, // e.g. assets/360-images/image1.jpg
                    file: null 
                };
            });

            if (demoFiles.length > 0) {
                log(`Loaded ${demoFiles.length} images from manifest.`, 'success');
                loadImagesIntoSystem(demoFiles);
            } else {
                log('Manifest is empty.', 'warn');
            }
        } else {
            log(`Could not find ${demoFolder}${manifestFile} (404).`, 'error');
        }
    } catch (e) {
        log(`Error loading manifest: ${e.message}`, 'error');
        console.error(e);
    }
});


// --- UI Toggle Logic ---
function toggleUI() {
    isUiVisible = !isUiVisible;
    if (isUiVisible) {
        mainUi.classList.remove('hidden');
        siteHeader.classList.remove('hidden');
    } else {
        mainUi.classList.add('hidden');
        siteHeader.classList.add('hidden');
        galleryModal.classList.add('hidden'); // Ensure gallery closes too
    }
}

toggleUiBtn.addEventListener('click', toggleUI);
closeUiBtn.addEventListener('click', toggleUI);

document.addEventListener('keydown', (e) => {
    if (e.target.tagName !== 'INPUT') {
        if (e.key.toLowerCase() === 'h') toggleUI();
        if (e.key === 'ArrowRight') nextImage();
        if (e.key === 'ArrowLeft') prevImage();
    }
});

// --- Gallery Logic ---
galleryBtn.addEventListener('click', () => {
    galleryModal.classList.remove('hidden');
    // Hide Main UI on mobile when gallery opens to prevent overlap issues
    if (window.innerWidth < 600) {
        mainUi.classList.add('hidden');
    }
    updateActiveThumbnail();
});

closeGalleryBtn.addEventListener('click', () => {
    galleryModal.classList.add('hidden');
    // Restore Main UI if it was hidden
    if (isUiVisible) mainUi.classList.remove('hidden');
});

// --- Motion & VR Logic ---

// 1. Gyroscope (Phone Motion)
gyroBtn.addEventListener('click', async () => {
    if (!viewer) return;

    if (isGyroEnabled) {
        // Turn off
        viewer.stopOrientation();
        isGyroEnabled = false;
        gyroBtn.classList.remove('active');
        log('Motion control disabled.');
    } else {
        // Turn on (requires permission on iOS 13+)
        try {
            if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
                log('Requesting iOS Motion Permission...');
                const response = await DeviceOrientationEvent.requestPermission();
                if (response === 'granted') {
                    viewer.startOrientation();
                    isGyroEnabled = true;
                    gyroBtn.classList.add('active');
                    log('Motion enabled (iOS).', 'success');
                } else {
                    log('Motion permission denied.', 'error');
                }
            } else {
                // Non-iOS / Android
                viewer.startOrientation();
                isGyroEnabled = true;
                gyroBtn.classList.add('active');
                log('Motion enabled.', 'success');
            }
        } catch (err) {
            log(`Motion Error: ${err.message}`, 'error');
        }
    }
});

// 2. VR / Fullscreen Toggle (Meta Quest)
vrBtn.addEventListener('click', () => {
    if (!viewer) return;
    
    // Toggle Fullscreen
    if (!document.fullscreenElement) {
        const elem = document.getElementById('panorama');
        if (elem.requestFullscreen) {
            elem.requestFullscreen().catch(err => {
                log(`Error enabling fullscreen: ${err.message}`, 'error');
            });
        }
        
        // On Quest/Mobile, entering VR usually implies tracking
        // Attempt to start orientation if not already on
        if (!isGyroEnabled) {
            viewer.startOrientation();
            isGyroEnabled = true;
        }
        log('Entering Immersive Mode.', 'success');
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        }
        // Optional: Stop orientation on exit? 
        // viewer.stopOrientation(); 
        log('Exiting Immersive Mode.');
    }
});


// --- File Input Handler ---
dirInput.addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    
    const validFiles = files
        .filter(f => {
            const name = f.name.toLowerCase();
            return name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.png');
        })
        .map(f => ({
            name: f.name,
            file: f,
            path: null
        }));

    // Natural Sort
    validFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

    if (validFiles.length > 0) {
        loadImagesIntoSystem(validFiles);
    } else {
        log('No valid images found.', 'warn');
    }
});

// --- Core Image System ---
function loadImagesIntoSystem(items) {
    clearCache(); 
    imageItems = items;
    fileCountLabel.textContent = `${imageItems.length} loaded`;
    currentIndex = 0;
    
    enableControls();
    loadPanorama(currentIndex);
    startThumbnailGeneration();
}

// --- Thumbnail Generator ---
async function startThumbnailGeneration() {
    if (isGeneratingThumbnails) return;
    isGeneratingThumbnails = true;
    galleryGrid.innerHTML = ''; 
    thumbnails = new Array(imageItems.length).fill(null);

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 200; 
    canvas.height = 100; 

    for (let i = 0; i < imageItems.length; i++) {
        if (imageItems.length === 0) break;
        try {
            const thumbData = await generateSingleThumbnail(imageItems[i], canvas, ctx);
            thumbnails[i] = thumbData;
            addThumbnailToGrid(i, thumbData, imageItems[i].name);
            galleryProgress.textContent = `(${i+1}/${imageItems.length})`;
            await new Promise(r => setTimeout(r, 5)); // breathing room for UI
        } catch (err) {
            console.error(err);
        }
    }
    galleryProgress.textContent = "";
    isGeneratingThumbnails = false;
}

function generateSingleThumbnail(item, canvas, ctx) {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        let url = item.file ? URL.createObjectURL(item.file) : item.path;
        
        img.onload = () => {
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            if (item.file) URL.revokeObjectURL(url);
            resolve(canvas.toDataURL('image/jpeg', 0.5));
        };
        img.onerror = () => resolve(null);
        img.src = url;
    });
}

function addThumbnailToGrid(index, src, name) {
    const div = document.createElement('div');
    div.className = 'thumb-card';
    div.id = `thumb-${index}`;
    div.onclick = () => {
        currentIndex = index;
        loadPanorama(currentIndex);
        // On mobile, close gallery after selection
        if(window.innerWidth < 600) {
            galleryModal.classList.add('hidden');
            mainUi.classList.remove('hidden');
        }
    };

    const img = document.createElement('img');
    img.src = src || ''; 
    
    const label = document.createElement('div');
    label.className = 'thumb-label';
    label.textContent = name;

    div.appendChild(img);
    div.appendChild(label);
    galleryGrid.appendChild(div);
}

function updateActiveThumbnail() {
    document.querySelectorAll('.thumb-card').forEach(el => el.classList.remove('active'));
    const current = document.getElementById(`thumb-${currentIndex}`);
    if (current) {
        current.classList.add('active');
        current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

// --- Panorama Viewer ---
function loadPanorama(index) {
    if (!imageItems[index]) return;
    const item = imageItems[index];

    currentNameLabel.textContent = `${index + 1}/${imageItems.length}: ${item.name}`;
    let imageSource = item.file ? URL.createObjectURL(item.file) : item.path;

    // Preserve FOV across images
    const currentHFOV = viewer ? viewer.getHfov() : parseInt(fovSlider.value);
    
    // Check if motion was active
    const wasMotionActive = isGyroEnabled;

    if (viewer) {
        viewer.destroy();
    }

    try {
        viewer = pannellum.viewer('panorama', {
            "type": "equirectangular",
            "panorama": imageSource,
            "autoLoad": true,
            "hfov": currentHFOV,
            "minHfov": 40,  
            "maxHfov": 150,
            "compass": false,
            "showZoomCtrl": false,
            "showFullscreenCtrl": false,
            // Optimization for mobile
            "preview": null 
        });

        viewer.on('load', () => {
            syncSlider();
            updateActiveThumbnail();
            // Re-enable motion if it was on
            if(wasMotionActive) {
                viewer.startOrientation();
                log('Restored motion control.');
            }
        });
        
        viewer.on('zoomchange', syncSlider);
        viewer.on('error', (err) => log(`Load Error: ${err}`, 'error'));

    } catch (error) {
        log(`Viewer Crash: ${error.message}`, 'error');
    }
}

// --- Reset ---
clearBtn.addEventListener('click', () => {
    if(confirm('Clear all images?')) clearCache();
});

function clearCache() {
    if (viewer) viewer.destroy();
    viewer = null;
    imageItems = [];
    thumbnails = [];
    currentIndex = 0;
    dirInput.value = '';
    fileCountLabel.textContent = 'No files loaded';
    currentNameLabel.textContent = '...';
    galleryGrid.innerHTML = '';
    disableControls();
    isGyroEnabled = false;
    gyroBtn.classList.remove('active');
}

// --- Nav Helper ---
function nextImage() {
    if (currentIndex < imageItems.length - 1) {
        currentIndex++;
        loadPanorama(currentIndex);
    }
}

function prevImage() {
    if (currentIndex > 0) {
        currentIndex--;
        loadPanorama(currentIndex);
    }
}

function enableControls() {
    prevBtn.disabled = false;
    nextBtn.disabled = false;
    galleryBtn.disabled = false;
    clearBtn.disabled = false;
}

function disableControls() {
    prevBtn.disabled = true;
    nextBtn.disabled = true;
    galleryBtn.disabled = true;
    clearBtn.disabled = true;
}

fovSlider.addEventListener('input', (e) => {
    if (viewer) viewer.setHfov(parseInt(e.target.value));
    fovVal.textContent = e.target.value;
});

function syncSlider() {
    if(viewer) {
        const val = Math.round(viewer.getHfov());
        fovSlider.value = val;
        fovVal.textContent = val;
    }
}

// Events
nextBtn.addEventListener('click', nextImage);
prevBtn.addEventListener('click', prevImage);