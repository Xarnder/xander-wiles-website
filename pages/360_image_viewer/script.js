// --- Global State ---
let viewer = null;
let imageItems = []; // Unified array: { name, file (optional), path (optional) }
let thumbnails = []; 
let currentIndex = 0;
let isUiVisible = true;
let isGeneratingThumbnails = false;

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
    debugLog.appendChild(entry);
    debugLog.scrollTop = debugLog.scrollHeight; 
    console.log(`[${type.toUpperCase()}] ${message}`);
}

// --- Initialization: Check for Demo Images ---
window.addEventListener('DOMContentLoaded', async () => {
    log('System Initializing...');
    
    // Ensure this folder exists in your project structure
    const demoFolder = 'assets/360-images/';
    
    try {
        const response = await fetch(demoFolder);
        
        if (response.ok) {
            const text = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(text, 'text/html');
            const links = Array.from(doc.querySelectorAll('a'));
            
            // Filter for JPG, JPEG, and PNG
            const demoFiles = links
                .map(link => link.getAttribute('href'))
                .filter(href => {
                    if (!href) return false;
                    const lower = href.toLowerCase();
                    return lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png');
                })
                .map(href => {
                    // Clean the path provided by Live Server
                    const cleanName = href.split('/').pop(); 
                    return {
                        name: decodeURIComponent(cleanName),
                        path: demoFolder + cleanName,
                        file: null 
                    };
                });

            if (demoFiles.length > 0) {
                log(`Found ${demoFiles.length} demo images in ${demoFolder}`, 'success');
                loadImagesIntoSystem(demoFiles);
            } else {
                log(`Connected to ${demoFolder}, but no images found.`, 'info');
            }
        } else {
            log(`Demo folder not found (${demoFolder}). (404)`, 'info');
        }
    } catch (e) {
        // Silent fail for network errors (normal if folder doesn't exist)
        log('Skipping demo load (network/path error).', 'info');
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
        galleryModal.classList.add('hidden');
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
    updateActiveThumbnail();
});
closeGalleryBtn.addEventListener('click', () => {
    galleryModal.classList.add('hidden');
});

// --- File Input Handler (User Upload) ---
dirInput.addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    
    // Updated Filter: Allows JPG, JPEG, and PNG
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
        log('No JPG or PNG files found in selection.', 'error');
    }
});

// --- Core Image Loading System ---
function loadImagesIntoSystem(items) {
    clearCache(); // Clear previous
    
    imageItems = items;
    fileCountLabel.textContent = `${imageItems.length} images loaded`;
    currentIndex = 0;
    
    enableControls();
    loadPanorama(currentIndex);
    startThumbnailGeneration();
}

// --- Thumbnail Generation ---
async function startThumbnailGeneration() {
    if (isGeneratingThumbnails) return;
    isGeneratingThumbnails = true;
    galleryGrid.innerHTML = ''; 
    thumbnails = new Array(imageItems.length).fill(null);

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 240; 
    canvas.height = 135; 

    for (let i = 0; i < imageItems.length; i++) {
        if (imageItems.length === 0) break;

        try {
            const thumbData = await generateSingleThumbnail(imageItems[i], canvas, ctx);
            thumbnails[i] = thumbData;
            addThumbnailToGrid(i, thumbData, imageItems[i].name);
            galleryProgress.textContent = `${i+1}/${imageItems.length}`;
            await new Promise(r => setTimeout(r, 10)); 
        } catch (err) {
            console.error("Thumb error", err);
        }
    }
    galleryProgress.textContent = "";
    isGeneratingThumbnails = false;
}

function generateSingleThumbnail(item, canvas, ctx) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        
        let url = "";
        
        if (item.file) {
            url = URL.createObjectURL(item.file);
        } else {
            url = item.path;
        }
        
        img.onload = () => {
            // Draw image to canvas
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            if (item.file) URL.revokeObjectURL(url);
            // Export as Low Quality JPEG (faster/smaller than PNG for thumbs)
            resolve(canvas.toDataURL('image/jpeg', 0.5));
        };
        img.onerror = () => {
            console.warn(`Failed to load thumb for ${item.name}`);
            resolve(null);
        };
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
    };

    const img = document.createElement('img');
    img.src = src || ''; 
    img.loading = "lazy"; 
    
    const label = document.createElement('div');
    label.className = 'thumb-label';
    label.textContent = name;

    div.appendChild(img);
    div.appendChild(label);
    galleryGrid.appendChild(div);
}

function updateActiveThumbnail() {
    const old = document.querySelector('.thumb-card.active');
    if (old) old.classList.remove('active');
    
    const current = document.getElementById(`thumb-${currentIndex}`);
    if (current) {
        current.classList.add('active');
        current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

// --- Panorama Viewer Logic ---
function loadPanorama(index) {
    if (!imageItems[index]) return;
    const item = imageItems[index];

    currentNameLabel.textContent = `${index + 1}/${imageItems.length}: ${item.name}`;
    
    let imageSource = "";
    if (item.file) {
        imageSource = URL.createObjectURL(item.file);
    } else {
        imageSource = item.path;
    }

    const currentHFOV = viewer ? viewer.getHfov() : parseInt(fovSlider.value);

    if (viewer) viewer.destroy();

    try {
        viewer = pannellum.viewer('panorama', {
            "type": "equirectangular",
            "panorama": imageSource,
            "autoLoad": true,
            "hfov": currentHFOV,
            "minHfov": 40,  
            "maxHfov": 179,
            "compass": false,
            "showZoomCtrl": false,
            "showFullscreenCtrl": false
        });

        viewer.on('load', () => {
            syncSlider();
            updateActiveThumbnail();
        });
        viewer.on('zoomchange', syncSlider);
        viewer.on('error', (err) => {
            log(`Image Load Error: ${err}`, 'error');
        });

    } catch (error) {
        log(`Error: ${error.message}`, 'error');
    }
}

// --- Reset / Clear ---
clearBtn.addEventListener('click', () => {
    if(confirm('Clear all images and reset?')) clearCache();
});

function clearCache() {
    if (viewer) viewer.destroy();
    viewer = null;
    imageItems = [];
    thumbnails = [];
    currentIndex = 0;
    isGeneratingThumbnails = false;

    dirInput.value = '';
    fileCountLabel.textContent = 'No files loaded';
    currentNameLabel.textContent = '...';
    galleryGrid.innerHTML = '';
    galleryProgress.textContent = '';
    
    disableControls();
}

// --- Navigation & Slider ---
function nextImage() {
    if (!imageItems.length) return;
    if (currentIndex < imageItems.length - 1) {
        currentIndex++;
        loadPanorama(currentIndex);
    }
}

function prevImage() {
    if (!imageItems.length) return;
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