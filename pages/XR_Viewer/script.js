import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import * as GaussianSplats3D from '@mkkellogg/gaussian-splats-3d';

// IMPORT CONFIG
let models = [];
const FALLBACK_MODELS = [
    { name: 'Fighter Jet', path: '/assets/models/Fighter_Jet.glb' },
    { name: 'Mercedes 300SL', path: '/assets/models/Mercedes_300sl.glb' },
    { name: 'Cute Robot', path: '/assets/models/Cute_Robot.glb' },
    { name: 'Space Fighter Large', path: '/assets/models/Space_Fighter_Large.glb' },
    { name: 'Space Fighter', path: '/assets/models/Space_Fighter.glb' },
    { name: 'Guildford Plaza', path: '/assets/models/Guildford-Plaza.glb' },
    { name: 'Guildford Plaza Flipped', path: '/assets/models/Guildford-Plaza-Flipped.glb' },
    { name: 'Guildford Plaza V10', path: '/assets/models/Guildford-Plaza-V10.glb' },
    { name: 'Bedroom', path: '/assets/models/Bedroom.glb' },
    { name: 'Ford Fiesta', path: '/assets/models/Ford_Fiesta.glb' }
];

// --- GLOBALS ---
let camera, scene, renderer;
let controller1, controller2;
let reticle;
let gridHelper;
let currentModel = null;
let dropInViewer = null;
let modelName = 'Fighter Jet'; // Default selected model
let xrMode = 'none'; // 'none', 'ar', 'vr'
let isPlaced = false; // Tracks if the current model/splat has been placed in the room

// Custom uploaded assets (stored for 3D in-game menu selection & spawning)
const customModelsMap = new Map();
const customSplatsMap = new Map();
const splatUploadJobs = new Map();

// Quest Browser misses XR frames (~11ms at 72Hz) if the full 127MB splat
// is rebuilt or drawn at native stereo resolution. Cap splat count and
// drop shadows/resolution while a splat is visible in XR so the compositor
// does not freeze the scene to the headset (ASW / reprojection).
const MAX_HEADSET_SPLATS = 160000;
const XR_SPLAT_FRAMEBUFFER_SCALE = 0.5;
let directionalLight = null;
let splatBudgetActive = false;
let splatShownAt = 0;
let splatRevealAt = 0;
let roomGeomFrame = 0;

// Diegetic Floating UI in 3D AR Space
let hudGroup, statusMesh, loadingGroup, loadingFill, menuMesh, controlsMesh;

// Room Mesh State (Quest 3 Space Setup / depth mesh — real-world occlusion, floor, placement)
const roomMeshes = new Map();
const roomPlanes = new Map();
let roomGroup;
let arFloorMarker;
let meshMode = 0; // 0 = Occlusion+Shadow, 1 = Wireframe, 2 = Off
let sceneUnderstandingEnabled = false;
let meshFeatureGranted = null; // true | false | null (unknown)
let planeFeatureGranted = null;
let hasRoomGeometry = false;
let isMeshAvailable = false;
let detectedFloorY = null;
let detectedFloorX = 0;
let detectedFloorZ = 0;
let floorSource = '';
let floorLocked = false;
let roomCaptureAttempted = false;
let roomCaptureTimer = null;
let lastGeometryStatus = '';
let lastHudStatus = '';
let lastReticleHit = null;
let hitTestSource = null;
let hitTestSourceRequested = false;
let xrSessionStartedAt = 0;
let lastFloorLockNotice = '';

const roomRaycaster = new THREE.Raycaster();
roomRaycaster.far = 12;

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _m4 = new THREE.Matrix4();
const _box = new THREE.Box3();
const _hitPoint = new THREE.Vector3();
const _hitNormal = new THREE.Vector3();

// Materials for Real Room Integration
const matOcclusion = new THREE.MeshBasicMaterial({
    colorWrite: false,
    depthWrite: true,
    side: THREE.DoubleSide
});

const matShadow = new THREE.ShadowMaterial({
    opacity: 0.5,
    depthWrite: false,
    side: THREE.DoubleSide
});

const matWireframe = new THREE.MeshBasicMaterial({
    color: 0x00f3ff,
    wireframe: true,
    transparent: true,
    opacity: 0.35
});

const matCollision = new THREE.MeshBasicMaterial({
    visible: false,
    side: THREE.DoubleSide
});

const matPlaneShadow = new THREE.ShadowMaterial({
    opacity: 0.4,
    depthWrite: false,
    side: THREE.DoubleSide
});

const matPlaneWire = new THREE.MeshBasicMaterial({
    color: 0x22d3ee,
    wireframe: true,
    transparent: true,
    opacity: 0.45,
    side: THREE.DoubleSide
});

// Menu State
let menuItems = [];
let isMenuOpen = false;
let isDragging = false;
let isLoading = false;
let selectedIndex = 2; // Defaults to 'Fighter Jet'
let scoreValue = 0;
let lastScrollTime = 0;
let lastButtonState = {};
let isScalingEnabled = true;

// Desktop controls
let orbitControls;

// Cached DOM Elements
const dom = {};

boot();

async function boot() {
    try {
        const mod = await import(new URL('../../assets/models_config.js', import.meta.url).href);
        models = Array.isArray(mod.models) && mod.models.length ? mod.models : FALLBACK_MODELS;
    } catch (err) {
        console.warn('[XR] models_config missing; using built-in list', err);
        models = FALLBACK_MODELS;
    }
    init();
    animate();
}

function init() {
    try {
        cacheDomElements();
        buildMenuItems();

        scene = new THREE.Scene();
        camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 120);
        camera.position.set(0, 1.2, 2.0);

        // --- LIGHTING & REALISTIC PASSTHROUGH SHADOWS ---
        directionalLight = new THREE.DirectionalLight(0xffffff, 2.5);
        directionalLight.position.set(0, 5, 0); // Overhead sun/room light
        directionalLight.castShadow = true;

        directionalLight.shadow.mapSize.width = 1024;
        directionalLight.shadow.mapSize.height = 1024;
        directionalLight.shadow.camera.near = 0.1;
        directionalLight.shadow.camera.far = 10;
        directionalLight.shadow.camera.left = -5;
        directionalLight.shadow.camera.right = 5;
        directionalLight.shadow.camera.top = 5;
        directionalLight.shadow.camera.bottom = -5;
        directionalLight.shadow.bias = -0.0005;

        scene.add(directionalLight);
        scene.add(directionalLight.target);
        scene.add(new THREE.AmbientLight(0xffffff, 0.8));

        // Renderer (alpha: true is critical for Quest 3 Passthrough AR)
        renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.xr.enabled = true;
        renderer.xr.setReferenceSpaceType('local');
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        dom.canvasContainer.appendChild(renderer.domElement);

        // PBR Room Environment
        const pmremGenerator = new THREE.PMREMGenerator(renderer);
        scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;

        // --- FLOOR GRID (Visible in VR Mode & Desktop Inspection) ---
        gridHelper = new THREE.GridHelper(20, 20, 0x00f3ff, 0x1e293b);
        gridHelper.position.y = 0;
        scene.add(gridHelper);

        // --- AR & VR BUTTONS (Mount into modern header toolbar) ---
        setupWebXRButtons();

        // --- CONTROLLERS ---
        setupControllers();

        // --- SURFACE RETICLE ---
        reticle = new THREE.Mesh(
            new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2),
            new THREE.MeshBasicMaterial({ color: 0x00f3ff, side: THREE.DoubleSide })
        );
        reticle.matrixAutoUpdate = false;
        reticle.visible = false;
        scene.add(reticle);

        // --- ROOM GROUP + AR FLOOR MARKER (positioned from Quest scan, never assumed at Y=0) ---
        roomGroup = new THREE.Group();
        scene.add(roomGroup);
        arFloorMarker = createArFloorMarker();
        scene.add(arFloorMarker);

        // --- FLOATING IN-AR DIEGETIC HUD ---
        createDiegeticHUD();

        // --- DESKTOP CONTROLS & 2D LISTENERS ---
        setupDesktopControls();
        setup2DEventListeners();

        window.addEventListener('resize', onWindowResize);

    } catch (e) {
        console.error('Initialization error:', e);
    }
}

function cacheDomElements() {
    dom.canvasContainer = document.getElementById('canvas-container');
    dom.loadDefaultBtn = document.getElementById('load-default-btn');
    dom.loadDefaultSplatBtn = document.getElementById('load-default-splat-btn');
    dom.uploadBtn = document.getElementById('upload-btn');
    dom.fileInput = document.getElementById('file-input');
    dom.helpToggleBtn = document.getElementById('help-toggle-btn');
    dom.arButtonMount = document.getElementById('ar-button-mount');
    dom.vrButtonMount = document.getElementById('vr-button-mount');

    dom.dropOverlay = document.getElementById('drop-overlay');
    dom.modelFilename = document.getElementById('model-filename');
    dom.statusDot = document.getElementById('status-dot');
    dom.statSplatCount = document.getElementById('stat-splat-count');
    dom.statFileSize = document.getElementById('stat-file-size');
    dom.statFps = document.getElementById('stat-fps');
    dom.statScale = document.getElementById('stat-scale');

    dom.recenterBtn = document.getElementById('recenter-btn');
    dom.resetScaleBtn = document.getElementById('reset-scale-btn');
    dom.flipYBtn = document.getElementById('flip-y-btn');
    dom.xrStartStatus = document.getElementById('xr-start-status');

    dom.loadingDialog = document.getElementById('loading-dialog');
    dom.loadingTitle = document.getElementById('loading-title');
    dom.loadingPercent = document.getElementById('loading-percent');
    dom.loadingBarFill = document.getElementById('loading-bar-fill');
    dom.loadingSubtitle = document.getElementById('loading-subtitle');

    dom.controlsModal = document.getElementById('controls-modal');
    dom.closeModalBtn = document.getElementById('close-modal-btn');
    dom.toast = document.getElementById('toast');
}

function buildMenuItems() {
    const customNames = [...customModelsMap.keys(), ...customSplatsMap.keys()];
    menuItems = [
        'Room Mode',
        'Scaling: On',
        'Fighter Jet',
        ...customNames,
        ...models.filter(m => m.name !== 'Fighter Jet').map(m => m.name)
    ];
}

function setupWebXRButtons() {
    window.__attachXRSession = attachPendingXRSession;
    if (window.__xrSession && !renderer.xr.getSession()) {
        attachPendingXRSession(window.__xrSession, window.__xrMode || 'immersive-ar');
    }
}

function setXrAttachStatus(message) {
    const nodes = document.querySelectorAll('#xr-start-status, #xr-bar-status');
    nodes.forEach((el) => { el.textContent = message || ''; });
}

async function attachPendingXRSession(session, mode) {
    if (!renderer || !renderer.xr || !session) return;
    if (renderer.xr.getSession() === session) return;

    const spaces = mode === 'immersive-vr' ? ['local-floor', 'local'] : ['local'];
    let lastErr = null;

    for (const space of spaces) {
        try {
            renderer.xr.setReferenceSpaceType(space);
            await renderer.xr.setSession(session);
            if (mode === 'immersive-ar') {
                session.requestReferenceSpace('local-floor').then((floorSpace) => {
                    renderer.xr.setReferenceSpace(floorSpace);
                }).catch(function () {
                    console.info('[XR] local-floor unavailable; placing from room mesh instead');
                });
            }
            setXrAttachStatus('');
            console.info('[XR] Renderer attached to', mode, 'using', space);
            return;
        } catch (err) {
            lastErr = err;
            console.warn('[XR] setSession failed with', space, err);
        }
    }

    console.error('[XR] Failed to attach renderer', lastErr);
    setXrAttachStatus('XR started but 3D engine failed: ' + ((lastErr && lastErr.message) ? lastErr.message : lastErr));
}

function setupControllers() {
    controller1 = renderer.xr.getController(0);
    controller1.addEventListener('select', onSelect);
    controller1.add(createControllerLaser());
    scene.add(controller1);

    controller2 = renderer.xr.getController(1);
    controller2.addEventListener('select', onSelect);
    controller2.add(createControllerLaser());
    scene.add(controller2);
}

function createControllerLaser() {
    const geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, -1)
    ]);
    const laser = new THREE.Line(geometry, new THREE.LineBasicMaterial({
        color: 0x00f3ff,
        transparent: true,
        opacity: 0.85
    }));
    laser.name = 'aimLaser';
    laser.scale.z = 1.5;
    laser.visible = false;
    return laser;
}

function setupDesktopControls() {
    orbitControls = new OrbitControls(camera, renderer.domElement);
    orbitControls.enableDamping = true;
    orbitControls.dampingFactor = 0.08;
    orbitControls.target.set(0, 0.8, 0);

    renderer.xr.addEventListener('sessionstart', () => {
        if (orbitControls) orbitControls.enabled = false;
        const session = renderer.xr.getSession();
        const isAR = isArSession(session);
        xrMode = isAR ? 'ar' : 'vr';

        isPlaced = false;

        // Ensure splat/model is NOT rendered or stuck to view before placing
        if (dropInViewer) {
            dropInViewer.visible = false;
        }
        if (currentModel && currentModel !== dropInViewer) {
            currentModel.visible = false;
        }

        if (isAR) {
            gridHelper.visible = false;
            scene.background = null;
            resetRoomGeometryState();
            inspectSessionFeatures(session);
            scheduleRoomCaptureIfEmpty(session);
            showToast('Quest 3 AR: waiting for room scan');
            updateStatusText('AR Mode: Checking Quest room scan (mesh / planes)...');
        } else {
            gridHelper.visible = true;
            scene.background = new THREE.Color(0x0a0c16);
            showToast('Quest 3 VR Mode Active');
            updateStatusText(`VR Mode: Pull Trigger to Place ${modelName} (B for Menu)`);
        }

        setSplatXRBudget(false);
        renderer.setPixelRatio(1);
        if (typeof renderer.xr.setFoveation === 'function') {
            renderer.xr.setFoveation(1);
        }

        if (dropInViewer) {
            patchSplatViewerForXR(dropInViewer);
            if (dropInViewer.viewer) {
                dropInViewer.viewer.webXRActive = false;
                dropInViewer.viewer.updateForDropInMode(renderer, camera);
            }
        }
    });

    renderer.xr.addEventListener('sessionend', () => {
        xrMode = 'none';
        setSplatXRBudget(false);
        renderer.setPixelRatio(window.devicePixelRatio || 1);
        if (orbitControls) orbitControls.enabled = true;
        resetRoomGeometryState();
        if (gridHelper) {
            gridHelper.visible = true;
            gridHelper.position.set(0, 0, 0);
        }
        scene.background = null;
        if (dropInViewer && dropInViewer.viewer) {
            dropInViewer.viewer.webXRActive = false;
            dropInViewer.viewer.devicePixelRatio = 1;
            dropInViewer.viewer.updateForDropInMode(renderer, camera);
            // Restore visibility in 2D desktop preview if splat was loaded
            if (customSplatsMap.has(modelName)) {
                const buf = customSplatsMap.get(modelName);
                const origin = new THREE.Matrix4().setPosition(0, 0, 0);
                placeSplatGroup(dropInViewer, buf, origin);
                dropInViewer.visible = true;
                if (orbitControls) {
                    orbitControls.target.set(0, 0.85, 0);
                    camera.position.set(0, 1.0, 2.2);
                    orbitControls.update();
                }
            }
        }
        if (currentModel && currentModel !== dropInViewer) {
            currentModel.visible = true;
        }
        updateStatusText("Ready (Desktop Preview)");
        showToast('Returned to Desktop 2D Preview');
    });
}

/* =========================================================
   Diegetic In-Game 3D Floating Menu & HUD
   ========================================================= */

function createDiegeticHUD() {
    hudGroup = new THREE.Group();
    scene.add(hudGroup);

    // 1. Floating Status Text - centered in upper vision
    statusMesh = createTextLabel("Ready — Pull Trigger to Place (B for Menu)", 36, 'rgba(10, 14, 24, 0.90)', '#00f3ff');
    statusMesh.position.set(0, 0.38, -1.1);
    hudGroup.add(statusMesh);

    // 2. 3D Loading Bar
    loadingGroup = new THREE.Group();
    loadingGroup.position.set(0, 0.26, -1.1);
    loadingGroup.visible = false;
    hudGroup.add(loadingGroup);

    const barBg = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.05), new THREE.MeshBasicMaterial({ color: 0x222222 }));
    loadingGroup.add(barBg);

    const fillGeo = new THREE.PlaneGeometry(0.7, 0.05);
    fillGeo.translate(0.35, 0, 0);
    loadingFill = new THREE.Mesh(fillGeo, new THREE.MeshBasicMaterial({ color: 0x00f3ff }));
    loadingFill.position.x = -0.35;
    loadingFill.position.z = 0.001;
    loadingFill.scale.x = 0;
    loadingGroup.add(loadingFill);

    // 3. 3D Model Library Menu Mesh
    createMenuMesh();

    // 4. 3D Controls Guide Mesh
    createControlsMesh();
}

function createMenuMesh() {
    const headerHeight = 150;
    const itemHeight = 60;
    const footerPadding = 40;
    const totalContentHeight = headerHeight + (menuItems.length * itemHeight) + footerPadding;

    const canvasWidth = 512;
    const canvasHeight = Math.max(totalContentHeight, 512);

    const planeWidth = 0.62;
    const planeHeight = planeWidth * (canvasHeight / canvasWidth);

    const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
    const material = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0.95,
        depthTest: false,
        side: THREE.DoubleSide
    });

    if (menuMesh) {
        hudGroup.remove(menuMesh);
        if (menuMesh.geometry) menuMesh.geometry.dispose();
        if (menuMesh.material) menuMesh.material.dispose();
    }

    menuMesh = new THREE.Mesh(geometry, material);
    menuMesh.position.set(0, 0, -1.8);
    menuMesh.userData = { canvasWidth, canvasHeight };
    menuMesh.visible = false;
    hudGroup.add(menuMesh);

    redrawMenuCanvas();
}

function createControlsMesh() {
    const geometry = new THREE.PlaneGeometry(0.55, 0.75);
    const material = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0.92,
        depthTest: false,
        side: THREE.DoubleSide
    });
    controlsMesh = new THREE.Mesh(geometry, material);
    controlsMesh.position.set(-0.72, 0, -1.8);
    controlsMesh.rotation.y = 0.22;
    controlsMesh.visible = false;
    hudGroup.add(controlsMesh);
    redrawControlsCanvas();
}

function redrawControlsCanvas() {
    const width = 512;
    const height = 750;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = 'rgba(12, 14, 22, 0.92)';
    ctx.beginPath();
    ctx.roundRect(10, 10, width - 20, height - 20, 28);
    ctx.fill();
    ctx.strokeStyle = '#00f3ff';
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.font = 'bold 46px Arial';
    ctx.fillStyle = '#00f3ff';
    ctx.textAlign = 'center';
    ctx.fillText("XR Controls", width / 2, 70);
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(40, 92);
    ctx.lineTo(width - 40, 92);
    ctx.stroke();

    const lines = [
        { label: "Trigger", val: "Place on scanned floor / mesh" },
        { label: "Hold Button A / Grip", val: "Drag along room surfaces" },
        { label: "Left Stick ↕", val: "Lift / Lower Height" },
        { label: "Right Stick ↔", val: "Rotate Model" },
        { label: "Right Stick ↕", val: "Scale Size" },
        { label: "Button B / Y", val: "Open / Close 3D Menu" }
    ];

    ctx.textAlign = 'left';
    let y = 145;
    lines.forEach(line => {
        ctx.font = 'bold 30px Arial';
        ctx.fillStyle = '#f59e0b';
        ctx.fillText(line.label, 40, y);
        y += 38;
        ctx.font = '26px Arial';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(line.val, 55, y);
        y += 48;
    });

    if (controlsMesh.material.map) controlsMesh.material.map.dispose();
    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    controlsMesh.material.map = tex;
    controlsMesh.material.needsUpdate = true;
}

function redrawMenuCanvas() {
    if (!menuMesh) return;
    const width = menuMesh.userData.canvasWidth;
    const height = menuMesh.userData.canvasHeight;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = 'rgba(16, 18, 28, 0.94)';
    ctx.beginPath();
    ctx.roundRect(10, 10, width - 20, height - 20, 28);
    ctx.fill();
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.font = 'bold 46px Arial';
    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';
    ctx.fillText("Model Library", width / 2, 70);

    ctx.strokeStyle = '#444';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(40, 92);
    ctx.lineTo(width - 40, 92);
    ctx.stroke();

    const startY = 150;
    const itemHeight = 60;
    menuItems.forEach((itemText, i) => {
        const yPos = startY + (i * itemHeight);
        let displayLabel = itemText;
        let textColor = '#cbd5e1';

        if (i === 0) {
            if (!sceneUnderstandingEnabled) {
                displayLabel = "Mesh: Unavailable";
                textColor = '#f43f5e';
            } else if (!hasRoomGeometry) {
                displayLabel = "Mesh: Waiting for scan";
                textColor = '#f59e0b';
            } else {
                if (meshMode === 0) displayLabel = "Room: Shadows & Occlusion";
                else if (meshMode === 1) displayLabel = "Room: Wireframe Mesh";
                else if (meshMode === 2) displayLabel = "Room: Off";
                textColor = '#f59e0b';
            }
        } else if (i === 1) {
            displayLabel = isScalingEnabled ? "Scaling: On" : "Scaling: Off";
            textColor = isScalingEnabled ? '#10b981' : '#f59e0b';
        } else {
            if (customModelsMap.has(itemText)) displayLabel = `[3D] ${itemText}`;
            else if (customSplatsMap.has(itemText)) displayLabel = `[Splat] ${itemText}`;
        }

        if (i === selectedIndex) {
            ctx.fillStyle = '#0284c7';
            ctx.beginPath();
            ctx.roundRect(40, yPos - 36, width - 80, 52, 12);
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 34px Arial';
        } else {
            ctx.fillStyle = textColor;
            ctx.font = '33px Arial';
        }
        ctx.fillText(displayLabel, width / 2, yPos);
    });

    if (menuMesh.material.map) menuMesh.material.map.dispose();
    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    menuMesh.material.map = tex;
    menuMesh.material.needsUpdate = true;
}

function updateStatusText(text, isError = false) {
    const color = isError ? '#f43f5e' : '#00f3ff';
    if (statusMesh && statusMesh.material.map) statusMesh.material.map.dispose();
    if (statusMesh) {
        statusMesh.material.map = createTexture(text, 36, 'rgba(10, 14, 24, 0.90)', color);
        statusMesh.material.needsUpdate = true;
    }
}

function updateLoadingBar(percent) {
    if (!loadingGroup) return;
    loadingGroup.visible = true;
    loadingFill.scale.x = Math.min(Math.max(percent, 0.01), 1);
    updateStatusText(`Loading: ${(percent * 100).toFixed(0)}%`);

    if (dom.loadingDialog) {
        dom.loadingDialog.classList.add('active');
        const pctText = `${Math.round(percent * 100)}%`;
        if (dom.loadingPercent) dom.loadingPercent.textContent = pctText;
        if (dom.loadingBarFill) dom.loadingBarFill.style.width = pctText;
    }
}

function hideLoadingBar() {
    if (loadingGroup) loadingGroup.visible = false;
    if (dom.loadingDialog) dom.loadingDialog.classList.remove('active');
}

function createTexture(text, fontSize = 36, bgColor = null, textColor = '#00f3ff') {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 160;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, 1024, 160);

    // Pill background
    ctx.fillStyle = bgColor || 'rgba(10, 14, 24, 0.90)';
    ctx.beginPath();
    ctx.roundRect(8, 8, 1024 - 16, 160 - 16, 28);
    ctx.fill();

    // Glowing border
    ctx.strokeStyle = textColor || '#00f3ff';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Auto-scale font size to prevent any clipping of long text
    let size = fontSize;
    ctx.font = `bold ${size}px Arial, sans-serif`;
    while (ctx.measureText(text).width > 960 && size > 16) {
        size -= 2;
        ctx.font = `bold ${size}px Arial, sans-serif`;
    }

    ctx.fillStyle = textColor || '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 512, 80);

    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    return tex;
}

function createTextLabel(text, fontSize, bgColor, textColor) {
    const texture = createTexture(text, fontSize, bgColor, textColor);
    const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthTest: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 0.12), mat);
    mesh.renderOrder = 999;
    return mesh;
}

/* =========================================================
   Model & Splat Placement and Loading Logic
   ========================================================= */

function onSelect(event) {
    // Spawns the selected model onto scanned room geometry in AR, or the VR floor grid
    if (isMenuOpen || isLoading || isDragging || !modelName) return;

    const spawnMatrix = new THREE.Matrix4();

    if (xrMode === 'ar') {
        const controller = event && event.target;
        const hit = (controller && raycastFromController(controller)) || lastReticleHit;
        if (hit && hit.point) {
            spawnMatrix.identity();
            spawnMatrix.setPosition(hit.point);
        } else if (reticle.visible) {
            spawnMatrix.copy(reticle.matrix);
            const pos = new THREE.Vector3().setFromMatrixPosition(spawnMatrix);
            const xrCam = renderer.xr.getCamera();
            if (xrCam && !isPlausibleFloorY(pos.y, xrCam.position.y) && Number.isFinite(detectedFloorY)) {
                pos.y = detectedFloorY;
                spawnMatrix.setPosition(pos);
            } else if (xrCam && !isPlausibleFloorY(pos.y, xrCam.position.y) && !Number.isFinite(detectedFloorY)) {
                updateStatusText('No real floor yet — wait for Quest room scan', true);
                return;
            }
        } else if (Number.isFinite(detectedFloorY)) {
            const activeCam = renderer.xr.getCamera();
            const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(activeCam.quaternion);
            forward.y = 0;
            if (forward.lengthSq() < 0.001) forward.set(0, 0, -1);
            forward.normalize();
            const spawnPos = new THREE.Vector3().copy(activeCam.position).addScaledVector(forward, 1.5);
            spawnPos.y = detectedFloorY;
            spawnMatrix.setPosition(spawnPos);
        } else {
            updateStatusText('Point at the scanned floor — no room mesh hit yet', true);
            return;
        }
    } else {
        if (reticle.visible) {
            spawnMatrix.copy(reticle.matrix);
        } else {
            const activeCam = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera;
            const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(activeCam.quaternion);
            forward.y = 0;
            if (forward.lengthSq() < 0.001) forward.set(0, 0, -1);
            forward.normalize();

            const spawnPos = new THREE.Vector3().copy(activeCam.position).addScaledVector(forward, 1.5);
            spawnPos.y = 0;
            spawnMatrix.setPosition(spawnPos);
        }
    }

    loadModel(modelName, spawnMatrix);
}

function setSplatXRBudget(enabled) {
    if (!renderer) return;
    const wantOn = !!(enabled && renderer.xr.isPresenting);
    if (wantOn === splatBudgetActive) {
        if (wantOn && typeof renderer.xr.setFramebufferScaleFactor === 'function') {
            renderer.xr.setFramebufferScaleFactor(XR_SPLAT_FRAMEBUFFER_SCALE);
        }
        return;
    }
    splatBudgetActive = wantOn;
    if (wantOn) {
        renderer.shadowMap.enabled = false;
        if (directionalLight) directionalLight.castShadow = false;
        if (typeof renderer.xr.setFramebufferScaleFactor === 'function') {
            renderer.xr.setFramebufferScaleFactor(XR_SPLAT_FRAMEBUFFER_SCALE);
        }
        if (typeof renderer.xr.setFoveation === 'function') {
            renderer.xr.setFoveation(1);
        }
    } else {
        renderer.shadowMap.enabled = true;
        if (directionalLight) directionalLight.castShadow = true;
        if (typeof renderer.xr.setFramebufferScaleFactor === 'function') {
            renderer.xr.setFramebufferScaleFactor(1);
        }
    }
}

function splatAlreadyOnGpu(name) {
    return !!(
        dropInViewer &&
        dropInViewer.__uploadedName === name &&
        dropInViewer.viewer &&
        dropInViewer.viewer.splatRenderReady
    );
}

function showPlacedSplat(viewerGroup, splatBuffer, positionMatrix) {
    placeSplatGroup(viewerGroup, splatBuffer, positionMatrix);
    splatShownAt = performance.now();
    setSplatXRBudget(renderer.xr.isPresenting);
    if (renderer.xr.isPresenting) {
        viewerGroup.visible = false;
        splatRevealAt = performance.now() + 80;
    } else {
        viewerGroup.visible = true;
        splatRevealAt = 0;
    }
    isPlaced = true;
    currentModel = viewerGroup;

    if (!renderer.xr.isPresenting && orbitControls) {
        orbitControls.target.set(0, 0.85, 0);
        camera.position.set(0, 1.0, 2.2);
        orbitControls.update();
    }

    const count = splatBuffer.getSplatCount();
    const sourceCount = splatBuffer.__sourceCount || count;
    dom.statSplatCount.textContent = sourceCount !== count
        ? `${count.toLocaleString()} / ${sourceCount.toLocaleString()} splats`
        : `${count.toLocaleString()} splats`;
    dom.statFileSize.textContent = 'Gaussian Splat';
}

async function downsampleSplatBuffer(sourceBuffer, maxSplats = MAX_HEADSET_SPLATS) {
    if (!sourceBuffer || typeof sourceBuffer.getSplatCount !== 'function') return sourceBuffer;
    if (sourceBuffer.__headsetReady) return sourceBuffer;

    const count = sourceBuffer.getSplatCount();
    if (count <= maxSplats) {
        sourceBuffer.__headsetReady = true;
        return sourceBuffer;
    }

    const generate = GaussianSplats3D.SplatBuffer && GaussianSplats3D.SplatBuffer.generateFromUncompressedSplatArrays;
    if (typeof generate !== 'function') {
        console.warn('[XR] Splat downsample API missing; using original buffer');
        sourceBuffer.__headsetReady = true;
        return sourceBuffer;
    }

    updateStatusText(`Thinning splat for Quest (${count.toLocaleString()} → ${maxSplats.toLocaleString()})...`);

    const step = Math.ceil(count / maxSplats);
    const splats = [];
    const center = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const rot = new THREE.Quaternion();
    const color = new THREE.Vector4();
    const min = new THREE.Vector3(Infinity, Infinity, Infinity);
    const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);

    let extracted = 0;
    for (let i = 0; i < count; i += step) {
        sourceBuffer.getSplatCenter(i, center, undefined);
        sourceBuffer.getSplatScaleAndRotation(i, scale, rot, undefined);
        sourceBuffer.getSplatColor(i, color);
        min.min(center);
        max.max(center);
        splats.push([
            center.x, center.y, center.z,
            scale.x, scale.y, scale.z,
            rot.x, rot.y, rot.z, rot.w,
            color.x, color.y, color.z, color.w
        ]);
        extracted++;
        if (extracted % 20000 === 0) {
            await new Promise((resolve) => setTimeout(resolve, 0));
        }
    }

    const duck = {
        splats,
        splatCount: splats.length,
        sphericalHarmonicsDegree: 0
    };
    const thin = generate(
        [duck],
        1,
        1,
        new THREE.Vector3()
    );
    const size = max.clone().sub(min);
    const mid = min.clone().add(max).multiplyScalar(0.5);
    const bounds = { min, max, size, center: mid };
    sourceBuffer.__bounds = bounds;
    thin.__bounds = bounds;
    thin.__headsetReady = true;
    thin.__sourceCount = count;
    return thin;
}

async function prepareSplatForGpu(name, splatBuffer) {
    let gpuBuffer = splatBuffer;
    try {
        gpuBuffer = await downsampleSplatBuffer(splatBuffer);
    } catch (err) {
        console.warn('[XR] Splat downsample failed; using original buffer', err);
        gpuBuffer = splatBuffer;
        gpuBuffer.__headsetReady = true;
    }
    customSplatsMap.set(name, gpuBuffer);
    if (dropInViewer && dropInViewer.__uploadedName === name) {
        dropInViewer.__uploadedName = null;
    }
    splatUploadJobs.delete(name);
    return gpuBuffer;
}

async function ensureSplatGpuReady(name) {
    if (splatAlreadyOnGpu(name)) return dropInViewer;
    if (splatUploadJobs.has(name)) return splatUploadJobs.get(name);

    const job = (async () => {
        const splatBuffer = customSplatsMap.get(name);
        if (!splatBuffer) throw new Error('Splat not in memory');

        const viewerGroup = getDropInViewer();
        viewerGroup.visible = false;
        patchSplatViewerForXR(viewerGroup);
        viewerGroup.viewer.webXRActive = false;
        viewerGroup.viewer.updateForDropInMode(renderer, camera);

        if (splatAlreadyOnGpu(name)) return viewerGroup;

        const prevCount = typeof viewerGroup.getSceneCount === 'function'
            ? viewerGroup.getSceneCount()
            : (viewerGroup.viewer && typeof viewerGroup.viewer.getSceneCount === 'function'
                ? viewerGroup.viewer.getSceneCount()
                : 0);
        if (prevCount > 0) {
            const indices = Array.from({ length: prevCount }, (_, i) => i);
            await viewerGroup.removeSplatScenes(indices, false);
            viewerGroup.__uploadedName = null;
        }

        const splatCount = splatBuffer.getSplatCount();
        const alphaCut = splatCount > 400000 ? 8 : 1;

        await viewerGroup.viewer.addSplatBuffers(
            [splatBuffer],
            [{ splatAlphaRemovalThreshold: alphaCut }],
            true,
            false,
            false,
            true,
            true,
            false
        );
        viewerGroup.__uploadedName = name;
        return viewerGroup;
    })();

    splatUploadJobs.set(name, job);
    job.catch(() => {
        if (splatUploadJobs.get(name) === job) splatUploadJobs.delete(name);
    });
    return job;
}

function getDropInViewer() {
    if (!dropInViewer) {
        dropInViewer = new GaussianSplats3D.DropInViewer({
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
            maxScreenSpaceSplatSize: 160,
            sceneRevealMode: GaussianSplats3D.SceneRevealMode.Instant,
            logLevel: GaussianSplats3D.LogLevel.None
        });
        scene.add(dropInViewer);
        patchSplatViewerForXR(dropInViewer);
        // Always bind the real PerspectiveCamera, never the XR ArrayCamera.
        dropInViewer.viewer.updateForDropInMode(renderer, camera);
        dropInViewer.viewer.webXRActive = false;
    }
    return dropInViewer;
}

let lastSplatSortAt = 0;

function patchSplatViewerForXR(viewerGroup) {
    const viewer = viewerGroup && viewerGroup.viewer;
    if (!viewer || viewer.__xrPatched) return;
    viewer.__xrPatched = true;
    viewer.webXRActive = false;

    const originalGetRenderDimensions = viewer.getRenderDimensions.bind(viewer);
    viewer.getRenderDimensions = function (out) {
        if (renderer.xr.isPresenting) {
            const xrCam = renderer.xr.getCamera();
            const eye = xrCam && xrCam.cameras && xrCam.cameras[0];
            if (eye && eye.viewport && eye.viewport.z > 1) {
                out.x = eye.viewport.z;
                out.y = eye.viewport.w;
                return;
            }
            renderer.getDrawingBufferSize(out);
            if (xrCam && xrCam.cameras && xrCam.cameras.length > 1) {
                out.x = Math.max(1, out.x * 0.5);
            }
            return;
        }
        originalGetRenderDimensions(out);
    };

    if (viewerGroup.callbackMesh) {
        viewerGroup.callbackMesh.onBeforeRender = function (rendererArg, sceneArg, cam) {
            updateSplatForCurrentEye(viewer, cam);
        };
    }

    const originalUpdate = viewer.update.bind(viewer);
    viewer.update = function (rendererArg, cam) {
        if (cam && cam.isArrayCamera) {
            cam = (cam.cameras && cam.cameras[0]) || camera;
        }
        updateSplatForCurrentEye(viewer, cam);
    };
    viewer.__originalUpdate = originalUpdate;
}

function updateSplatForCurrentEye(viewer, cam) {
    if (!viewer || !cam || cam.isArrayCamera) return;
    if (!dropInViewer || !dropInViewer.visible) return;
    viewer.renderer = renderer;
    if (viewer.splatMesh) viewer.splatMesh.setRenderer(renderer);
    viewer.camera = cam;
    if (!viewer.initialized) viewer.init();
    if (!viewer.initialized || !viewer.splatRenderReady) return;
    if (typeof viewer.isDisposingOrDisposed === 'function' && viewer.isDisposingOrDisposed()) return;

    const now = performance.now();
    const inXR = renderer.xr.isPresenting;
    const inGrace = inXR && (now - splatShownAt) < 1200;
    const minSortMs = inXR ? 280 : 16;
    if (!inGrace && now - lastSplatSortAt >= minSortMs) {
        lastSplatSortAt = now;
        viewer.runSplatSort();
    }
    viewer.updateSplatMesh();
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

function placeSplatGroup(viewerGroup, splatBuffer, positionMatrix) {
    const place = new THREE.Vector3().setFromMatrixPosition(positionMatrix);
    let scale = 1;
    let bounds = null;
    try {
        bounds = computeSplatBounds(splatBuffer);
    } catch (err) {
        console.warn('[XR] Could not measure splat bounds', err);
    }

    if (bounds && bounds.size && bounds.size.y > 1e-5) {
        const personLike = bounds.size.y >= bounds.size.x * 0.4 && bounds.size.y >= bounds.size.z * 0.4;
        const ref = personLike ? bounds.size.y : Math.max(bounds.size.x, bounds.size.z, bounds.size.y);
        const target = personLike ? 1.7 : 3.0;
        scale = THREE.MathUtils.clamp(target / ref, 0.02, 12);
        viewerGroup.scale.setScalar(scale);
        viewerGroup.quaternion.identity();
        viewerGroup.position.set(
            place.x - bounds.center.x * scale,
            place.y - bounds.min.y * scale,
            place.z - bounds.center.z * scale
        );
    } else {
        viewerGroup.scale.set(1, 1, 1);
        viewerGroup.quaternion.identity();
        viewerGroup.position.copy(place);
    }
    viewerGroup.updateMatrixWorld(true);
}

async function loadModel(name, positionMatrix) {
    if (!name || isLoading) return;

    // Fast path: splat already on the GPU — place is a transform, not a rebuild.
    if (customSplatsMap.has(name) && splatAlreadyOnGpu(name)) {
        if (currentModel && currentModel !== dropInViewer) {
            scene.remove(currentModel);
            currentModel = null;
        }
        showPlacedSplat(dropInViewer, customSplatsMap.get(name), positionMatrix);
        updateLoadingBar(1.0);
        finishLoading(name);
        return;
    }

    isLoading = true;
    updateLoadingBar(0.2);
    dom.modelFilename.textContent = name;

    // Remove existing regular 3D model
    if (currentModel && currentModel !== dropInViewer) {
        scene.remove(currentModel);
        currentModel = null;
    }

    // --- CASE 1: Uploaded Custom 3D Model (GLB/GLTF) ---
    if (customModelsMap.has(name)) {
        if (dropInViewer) dropInViewer.visible = false;
        setSplatXRBudget(false);
        const customObj = customModelsMap.get(name);
        currentModel = customObj.clone(true);
        currentModel.position.setFromMatrixPosition(positionMatrix);

        const box = new THREE.Box3().setFromObject(currentModel);
        const size = box.getSize(new THREE.Vector3()).length();
        const scalar = size > 0 ? (1.5 / size) : 1;
        currentModel.scale.set(scalar, scalar, scalar);

        let polyCount = 0;
        currentModel.traverse((node) => {
            if (node.isMesh) {
                node.castShadow = true;
                node.receiveShadow = true;
                if (node.geometry && node.geometry.attributes && node.geometry.attributes.position) {
                    polyCount += (node.geometry.index ? node.geometry.index.count / 3 : node.geometry.attributes.position.count / 3);
                }
            }
        });

        currentModel.visible = true;
        isPlaced = true;
        scene.add(currentModel);
        dom.statSplatCount.textContent = `${Math.round(polyCount).toLocaleString()} polys`;
        dom.statFileSize.textContent = 'Custom 3D';
        updateLoadingBar(1.0);
        finishLoading(name);
        return;
    }

    // --- CASE 2: Uploaded Custom Gaussian Splat ---
    if (customSplatsMap.has(name)) {
        try {
            updateStatusText(`Preparing ${name} for Quest...`);
            updateLoadingBar(0.4);
            const viewerGroup = await ensureSplatGpuReady(name);
            const splatBuffer = customSplatsMap.get(name);
            updateLoadingBar(0.9);
            showPlacedSplat(viewerGroup, splatBuffer, positionMatrix);
            updateLoadingBar(1.0);
            finishLoading(name);
        } catch (err) {
            console.error('Error adding splat buffer:', err);
            isLoading = false;
            hideLoadingBar();
            updateStatusText("Load Error: " + err.message, true);
            showToast(`Failed: ${err.message}`);
        }
        return;
    }

    // --- CASE 3: Standard Model from models_config.js ---
    if (dropInViewer) dropInViewer.visible = false;
    setSplatXRBudget(false);
    const selectedModel = models.find(m => m.name === name);
    if (!selectedModel) {
        console.error("Model not found in config:", name);
        isLoading = false;
        hideLoadingBar();
        return;
    }

    const rawPath = selectedModel.path;
    const assetPath = new URL(rawPath.startsWith('/') ? '../../' + rawPath.slice(1) : rawPath, import.meta.url).href;

    const onProgress = (xhr) => {
        if (xhr.lengthComputable) updateLoadingBar(xhr.loaded / xhr.total);
    };

    const onError = (e) => {
        isLoading = false;
        hideLoadingBar();
        console.error(e);
        updateStatusText("Load Error", true);
        showToast(`Failed loading ${name}`);
    };

    const onLoad = (obj) => {
        currentModel = obj;
        currentModel.position.setFromMatrixPosition(positionMatrix);

        const box = new THREE.Box3().setFromObject(currentModel);
        const size = box.getSize(new THREE.Vector3()).length();
        const scalar = size > 0 ? (1.5 / size) : 1;
        currentModel.scale.set(scalar, scalar, scalar);

        let polyCount = 0;
        currentModel.traverse((node) => {
            if (node.isMesh) {
                node.castShadow = true;
                node.receiveShadow = true;
                if (node.geometry && node.geometry.attributes && node.geometry.attributes.position) {
                    polyCount += (node.geometry.index ? node.geometry.index.count / 3 : node.geometry.attributes.position.count / 3);
                }
            }
        });

        currentModel.visible = true;
        isPlaced = true;
        scene.add(currentModel);
        dom.statSplatCount.textContent = `${Math.round(polyCount).toLocaleString()} polys`;
        dom.statFileSize.textContent = name === 'Fighter Jet' ? '2.1 MB' : '3D Mesh';
        updateLoadingBar(1.0);
        finishLoading(name);
    };

    const ext = rawPath.split('.').pop().toLowerCase();
    if (ext === 'glb' || ext === 'gltf') {
        new GLTFLoader().load(assetPath, (g) => onLoad(g.scene), onProgress, onError);
    } else if (ext === 'obj') {
        new OBJLoader().load(assetPath, (o) => {
            o.traverse(c => { if (c.isMesh) c.material = new THREE.MeshStandardMaterial({ color: 0xffffff }); });
            onLoad(o);
        }, onProgress, onError);
    }
}

function finishLoading(name) {
    isLoading = false;
    isMenuOpen = false;
    if (menuMesh) menuMesh.visible = false;
    if (controlsMesh) controlsMesh.visible = false;
    hideLoadingBar();

    scoreValue += 10;
    updateStatusText(`Loaded ${name}! Score: ${scoreValue}`);
    showToast(`Loaded ${name} into scene`);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    renderer.setAnimationLoop(render);
}

/* =========================================================
   Quest 3 room scan (mesh / plane detection) & real floor
   ========================================================= */

function isArSession(session) {
    if (!session) return false;
    if (session.mode === 'immersive-ar') return true;
    if (session.mode === 'immersive-vr') return false;
    const blend = session.environmentBlendMode;
    return blend === 'alpha-blend' || blend === 'additive';
}

function createArFloorMarker() {
    const group = new THREE.Group();
    group.name = 'arFloorMarker';
    group.visible = false;

    const shadow = new THREE.Mesh(
        new THREE.CircleGeometry(2.4, 48),
        new THREE.ShadowMaterial({ opacity: 0.38, depthWrite: false })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.002;
    shadow.receiveShadow = true;
    shadow.renderOrder = -1;
    group.add(shadow);

    const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.42, 0.5, 48).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({
            color: 0x00f3ff,
            transparent: true,
            opacity: 0.8,
            side: THREE.DoubleSide,
            depthWrite: false
        })
    );
    ring.position.y = 0.006;
    ring.renderOrder = 1;
    group.add(ring);

    const grid = new THREE.GridHelper(4, 8, 0x00f3ff, 0x1e293b);
    grid.position.y = 0.004;
    if (Array.isArray(grid.material)) {
        grid.material.forEach((m) => { m.transparent = true; m.opacity = 0.28; });
    } else {
        grid.material.transparent = true;
        grid.material.opacity = 0.28;
    }
    grid.visible = false;
    grid.name = 'floorGrid';
    group.add(grid);

    group.userData.shadow = shadow;
    group.userData.ring = ring;
    group.userData.grid = grid;
    return group;
}

function resetRoomGeometryState() {
    if (roomCaptureTimer) {
        clearTimeout(roomCaptureTimer);
        roomCaptureTimer = null;
    }
    if (hitTestSource && typeof hitTestSource.cancel === 'function') {
        try { hitTestSource.cancel(); } catch (e) { /* already ended */ }
    }
    hitTestSource = null;
    hitTestSourceRequested = false;

    for (const group of roomMeshes.values()) {
        disposeRoomGroup(group);
    }
    roomMeshes.clear();
    for (const group of roomPlanes.values()) {
        disposeRoomGroup(group);
    }
    roomPlanes.clear();

    sceneUnderstandingEnabled = false;
    meshFeatureGranted = null;
    planeFeatureGranted = null;
    hasRoomGeometry = false;
    isMeshAvailable = false;
    detectedFloorY = null;
    detectedFloorX = 0;
    detectedFloorZ = 0;
    floorSource = '';
    floorLocked = false;
    roomCaptureAttempted = false;
    lastGeometryStatus = '';
    lastHudStatus = '';
    lastReticleHit = null;
    lastFloorLockNotice = '';
    xrSessionStartedAt = performance.now();

    if (arFloorMarker) arFloorMarker.visible = false;
}

function disposeRoomGroup(group) {
    const geo = group.userData.parts && group.userData.parts.collision && group.userData.parts.collision.geometry;
    if (geo) geo.dispose();
    roomGroup.remove(group);
}

function inspectSessionFeatures(session) {
    const enabled = session && session.enabledFeatures ? Array.from(session.enabledFeatures) : null;
    if (enabled) {
        meshFeatureGranted = enabled.includes('mesh-detection');
        planeFeatureGranted = enabled.includes('plane-detection');
        sceneUnderstandingEnabled = meshFeatureGranted || planeFeatureGranted;
        isMeshAvailable = sceneUnderstandingEnabled;
        console.info('[XR] Enabled features:', enabled.join(', '));
    } else {
        console.info('[XR] session.enabledFeatures is not exposed; will probe detectedMeshes / detectedPlanes per frame.');
    }
    redrawMenuCanvas();
}

function scheduleRoomCaptureIfEmpty(session) {
    if (roomCaptureTimer) clearTimeout(roomCaptureTimer);
    roomCaptureTimer = setTimeout(() => {
        if (xrMode !== 'ar') return;
        if (hasRoomGeometry) return;
        maybeInitiateRoomCapture(session, 'no meshes or planes after 2.8s');
    }, 2800);
}

async function maybeInitiateRoomCapture(session, reason) {
    if (roomCaptureAttempted || xrMode !== 'ar') return;
    const activeSession = renderer.xr.getSession() || session;
    if (!activeSession) return;
    roomCaptureAttempted = true;
    console.warn('[XR] No Quest room geometry yet:', reason);

    if (typeof activeSession.initiateRoomCapture === 'function') {
        setHudStatus('No room scan yet — opening Quest Space Setup');
        showToast('Opening Quest Space Setup to scan the room');
        try {
            await activeSession.initiateRoomCapture();
            setHudStatus('Scan the room, then point at the floor to place');
        } catch (err) {
            console.warn('[XR] initiateRoomCapture failed:', err);
            setHudStatus('Complete Space Setup in Quest Settings (Boundary → Mixed Reality)', true);
        }
        return;
    }

    setHudStatus('No room mesh. Scan your room in Quest Settings → Boundary → Space Setup', true);
}

function getDetectedCollection(frame, session, frameKey, sessionKey) {
    if (frame && frame[frameKey] !== undefined && frame[frameKey] !== null) return frame[frameKey];
    if (session && session[sessionKey] !== undefined && session[sessionKey] !== null) return session[sessionKey];
    return null;
}

function collectionSize(collection) {
    if (!collection) return 0;
    if (typeof collection.size === 'number') return collection.size;
    if (typeof collection.length === 'number') return collection.length;
    return 0;
}

function collectionHas(collection, item) {
    if (!collection) return false;
    if (typeof collection.has === 'function') return collection.has(item);
    if (typeof collection.includes === 'function') return collection.includes(item);
    for (const value of collection) {
        if (value === item) return true;
    }
    return false;
}

function iterateCollection(collection, fn) {
    if (!collection) return;
    if (typeof collection.forEach === 'function') {
        collection.forEach(fn);
        return;
    }
    for (const item of collection) fn(item);
}

function normalizeSemanticLabel(label) {
    if (!label) return '';
    return String(label).toLowerCase().replace(/[\s_-]+/g, '');
}

function isFloorLabel(label) {
    const l = normalizeSemanticLabel(label);
    return l === 'floor' || l === 'globalmesh' || l === 'invisiblemesh';
}

function isCeilingLabel(label) {
    return normalizeSemanticLabel(label) === 'ceiling';
}

function isPlausibleFloorY(floorY, headsetY) {
    if (!Number.isFinite(floorY) || !Number.isFinite(headsetY)) return false;
    const depth = headsetY - floorY;
    return depth >= 0.5 && depth <= 2.5;
}

function applyXrMeshGeometry(geometry, xrMesh) {
    const verts = xrMesh.vertices;
    const indices = xrMesh.indices;
    if (!verts || !indices || verts.length < 9 || indices.length < 3) return false;
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
    geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return true;
}

function setRoomVisualMode(group) {
    const parts = group.userData.parts || {};
    const occlusion = parts.occlusion;
    const shadow = parts.shadow;
    const wireframe = parts.wireframe;
    const collision = parts.collision;

    if (collision) collision.visible = true;

    if (meshMode === 2) {
        if (occlusion) occlusion.visible = false;
        if (shadow) shadow.visible = false;
        if (wireframe) wireframe.visible = false;
        return;
    }

    if (meshMode === 0) {
        if (occlusion) occlusion.visible = true;
        if (shadow) shadow.visible = true;
        if (wireframe) wireframe.visible = false;
    } else {
        if (occlusion) occlusion.visible = false;
        if (shadow) shadow.visible = false;
        if (wireframe) wireframe.visible = true;
    }
}

function createRoomSurfaceGroup(sharedGeometry, kind) {
    const threeGroup = new THREE.Group();
    threeGroup.matrixAutoUpdate = false;

    const meshOcclusion = new THREE.Mesh(sharedGeometry, matOcclusion);
    meshOcclusion.renderOrder = -2;
    threeGroup.add(meshOcclusion);

    const meshShadow = new THREE.Mesh(sharedGeometry, kind === 'plane' ? matPlaneShadow : matShadow);
    meshShadow.receiveShadow = true;
    meshShadow.renderOrder = -1;
    threeGroup.add(meshShadow);

    const meshWireframe = new THREE.Mesh(sharedGeometry, kind === 'plane' ? matPlaneWire : matWireframe);
    meshWireframe.renderOrder = 0;
    threeGroup.add(meshWireframe);

    const meshCollision = new THREE.Mesh(sharedGeometry, matCollision);
    meshCollision.userData.roomCollision = true;
    meshCollision.renderOrder = -3;
    threeGroup.add(meshCollision);

    threeGroup.userData.parts = {
        occlusion: meshOcclusion,
        shadow: meshShadow,
        wireframe: meshWireframe,
        collision: meshCollision
    };
    threeGroup.userData.kind = kind;
    roomGroup.add(threeGroup);
    return threeGroup;
}

function polygonArea(polygon) {
    if (!polygon || polygon.length < 3) return 0;
    let area = 0;
    for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i];
        const b = polygon[(i + 1) % polygon.length];
        area += a.x * b.z - b.x * a.z;
    }
    return Math.abs(area) * 0.5;
}

function buildPolygonGeometry(polygon) {
    const positions = [];
    for (const p of polygon) {
        positions.push(p.x, p.y, p.z);
    }
    const indices = [];
    for (let i = 1; i < polygon.length - 1; i++) {
        indices.push(0, i, i + 1);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
}

function applyPoseMatrix(threeGroup, pose) {
    if (!pose) return false;
    threeGroup.matrix.fromArray(pose.transform.matrix);
    threeGroup.updateMatrixWorld(true);
    return true;
}

function processRoomMeshes(frame, refSpace) {
    const session = frame.session;
    const meshes = getDetectedCollection(frame, session, 'detectedMeshes', 'detectedMeshes');
    if (meshes === null) {
        if (meshFeatureGranted === null && (performance.now() - xrSessionStartedAt) > 1000) {
            meshFeatureGranted = false;
        }
        return 0;
    }

    meshFeatureGranted = true;

    for (const [xrMesh, threeGroup] of roomMeshes) {
        if (!collectionHas(meshes, xrMesh)) {
            disposeRoomGroup(threeGroup);
            roomMeshes.delete(xrMesh);
        }
    }

    iterateCollection(meshes, (xrMesh) => {
        if (!xrMesh.vertices || !xrMesh.indices || xrMesh.vertices.length < 9) return;

        let threeGroup = roomMeshes.get(xrMesh);
        if (!threeGroup) {
            const geometry = new THREE.BufferGeometry();
            if (!applyXrMeshGeometry(geometry, xrMesh)) {
                geometry.dispose();
                return;
            }
            threeGroup = createRoomSurfaceGroup(geometry, 'mesh');
            threeGroup.userData.lastChangedTime = xrMesh.lastChangedTime;
            roomMeshes.set(xrMesh, threeGroup);
            console.info('[XR] Room mesh added', xrMesh.semanticLabel || '(unlabelled)', 'verts', xrMesh.vertices.length / 3);
        } else if (threeGroup.userData.lastChangedTime !== xrMesh.lastChangedTime) {
            const geometry = threeGroup.userData.parts.collision.geometry;
            applyXrMeshGeometry(geometry, xrMesh);
            threeGroup.userData.lastChangedTime = xrMesh.lastChangedTime;
        }

        threeGroup.userData.semanticLabel = xrMesh.semanticLabel || '';
        setRoomVisualMode(threeGroup);

        const pose = frame.getPose(xrMesh.meshSpace, refSpace);
        applyPoseMatrix(threeGroup, pose);
    });

    return collectionSize(meshes);
}

function processRoomPlanes(frame, refSpace) {
    const session = frame.session;
    const planes = getDetectedCollection(frame, session, 'detectedPlanes', 'detectedPlanes');
    if (planes === null) {
        if (planeFeatureGranted === null && (performance.now() - xrSessionStartedAt) > 1000) {
            planeFeatureGranted = false;
        }
        return 0;
    }

    planeFeatureGranted = true;

    for (const [xrPlane, threeGroup] of roomPlanes) {
        if (!collectionHas(planes, xrPlane)) {
            disposeRoomGroup(threeGroup);
            roomPlanes.delete(xrPlane);
        }
    }

    iterateCollection(planes, (xrPlane) => {
        let threeGroup = roomPlanes.get(xrPlane);
        const polygon = xrPlane.polygon;
        if (!polygon || polygon.length < 3) return;

        if (!threeGroup) {
            const geometry = buildPolygonGeometry(polygon);
            threeGroup = createRoomSurfaceGroup(geometry, 'plane');
            threeGroup.userData.lastChangedTime = xrPlane.lastChangedTime;
            roomPlanes.set(xrPlane, threeGroup);
            console.info('[XR] Room plane added', xrPlane.semanticLabel || xrPlane.orientation || '(plane)', 'points', polygon.length);
        } else if (threeGroup.userData.lastChangedTime !== xrPlane.lastChangedTime) {
            const parts = threeGroup.userData.parts;
            const oldGeo = parts.collision.geometry;
            const geometry = buildPolygonGeometry(polygon);
            parts.occlusion.geometry = geometry;
            parts.shadow.geometry = geometry;
            parts.wireframe.geometry = geometry;
            parts.collision.geometry = geometry;
            if (oldGeo && oldGeo !== geometry) oldGeo.dispose();
            threeGroup.userData.lastChangedTime = xrPlane.lastChangedTime;
        }

        threeGroup.userData.semanticLabel = xrPlane.semanticLabel || '';
        threeGroup.userData.orientation = xrPlane.orientation || '';
        threeGroup.userData.area = polygonArea(polygon);
        setRoomVisualMode(threeGroup);

        const pose = frame.getPose(xrPlane.planeSpace, refSpace);
        applyPoseMatrix(threeGroup, pose);
    });

    return collectionSize(planes);
}

function scoreFloorCandidate(candidate, headsetY) {
    let score = Math.log2(candidate.area + 1);
    if (candidate.label === 'floor') score += 100;
    if (candidate.label === 'globalmesh' || candidate.label === 'invisiblemesh') score += 70;
    if (candidate.kind === 'plane' && candidate.orientation === 'horizontal') score += 25;
    if (isPlausibleFloorY(candidate.y, headsetY)) score += 40;
    else score -= 90;
    const depth = headsetY - candidate.y;
    score -= Math.abs(depth - 1.55) * 6;
    return score;
}

function updateDetectedFloor(headsetY) {
    const candidates = [];

    for (const threeGroup of roomMeshes.values()) {
        const collision = threeGroup.userData.parts && threeGroup.userData.parts.collision;
        if (!collision || !collision.geometry) continue;
        const label = normalizeSemanticLabel(threeGroup.userData.semanticLabel);
        if (isCeilingLabel(label)) continue;

        collision.updateWorldMatrix(true, false);
        const geom = collision.geometry;
        if (!geom.boundingBox) geom.computeBoundingBox();
        _box.copy(geom.boundingBox).applyMatrix4(collision.matrixWorld);
        const minY = _box.min.y;
        const maxY = _box.max.y;
        const height = maxY - minY;
        const area = Math.max(0.01, (_box.max.x - _box.min.x) * (_box.max.z - _box.min.z));
        const x = (_box.min.x + _box.max.x) * 0.5;
        const z = (_box.min.z + _box.max.z) * 0.5;

        if (isFloorLabel(label) || height > 0.8) {
            candidates.push({ y: minY, x, z, area, label: label || 'mesh', kind: 'mesh', orientation: 'horizontal' });
        } else if (height < 0.25 && isPlausibleFloorY(minY, headsetY)) {
            candidates.push({ y: minY, x, z, area, label: label || 'surface', kind: 'mesh', orientation: 'horizontal' });
        }
    }

    for (const threeGroup of roomPlanes.values()) {
        const label = normalizeSemanticLabel(threeGroup.userData.semanticLabel);
        if (isCeilingLabel(label)) continue;
        if (label === 'table' || label === 'desk' || label === 'couch' || label === 'sofa') continue;
        const orientation = threeGroup.userData.orientation;
        if (orientation === 'vertical') continue;

        threeGroup.updateWorldMatrix(true, false);
        _v1.setFromMatrixPosition(threeGroup.matrixWorld);
        candidates.push({
            y: _v1.y,
            x: _v1.x,
            z: _v1.z,
            area: threeGroup.userData.area || 1,
            label: label || 'plane',
            kind: 'plane',
            orientation: orientation || 'horizontal'
        });
    }

    if (!candidates.length) {
        floorLocked = false;
        detectedFloorY = null;
        floorSource = '';
        if (arFloorMarker) arFloorMarker.visible = false;
        return false;
    }

    let best = null;
    let bestScore = -Infinity;
    for (const candidate of candidates) {
        const score = scoreFloorCandidate(candidate, headsetY);
        candidate.score = score;
        if (score > bestScore) {
            bestScore = score;
            best = candidate;
        }
    }

    if (!best || bestScore < 0) {
        floorLocked = false;
        if (arFloorMarker) arFloorMarker.visible = false;
        return false;
    }

    detectedFloorY = best.y;
    detectedFloorX = best.x;
    detectedFloorZ = best.z;
    floorSource = `${best.kind}:${best.label || 'unlabelled'}`;
    floorLocked = true;
    updateArFloorMarker();
    return true;
}

function updateArFloorMarker() {
    if (!arFloorMarker || !Number.isFinite(detectedFloorY) || xrMode !== 'ar') {
        if (arFloorMarker) arFloorMarker.visible = false;
        return;
    }

    arFloorMarker.visible = meshMode !== 2;
    arFloorMarker.position.set(detectedFloorX, detectedFloorY, detectedFloorZ);
    const grid = arFloorMarker.userData.grid;
    if (grid) grid.visible = meshMode === 1;
}

function getRoomCollisionList() {
    const list = [];
    roomGroup.traverse((obj) => {
        if (obj.isMesh && obj.userData.roomCollision) list.push(obj);
    });
    return list;
}

function getAimRayFromObject(obj) {
    obj.updateMatrixWorld();
    _v1.setFromMatrixPosition(obj.matrixWorld);
    _m4.identity().extractRotation(obj.matrixWorld);
    _v2.set(0, 0, -1).applyMatrix4(_m4);
    return { origin: _v1, direction: _v2 };
}

function raycastRoomGeometry(origin, direction) {
    const objects = getRoomCollisionList();
    if (!objects.length) return null;
    roomRaycaster.set(origin, direction);
    const hits = roomRaycaster.intersectObjects(objects, false);
    if (!hits.length) return null;
    const hit = hits[0];
    const normal = hit.face
        ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize()
        : new THREE.Vector3(0, 1, 0);
    return {
        point: hit.point.clone(),
        normal,
        distance: hit.distance,
        source: 'room-mesh'
    };
}

function raycastVirtualFloor(origin, direction) {
    if (!Number.isFinite(detectedFloorY) || Math.abs(direction.y) < 1e-4) return null;
    const t = (detectedFloorY - origin.y) / direction.y;
    if (t < 0.05 || t > 12) return null;
    const point = origin.clone().addScaledVector(direction, t);
    return {
        point,
        normal: new THREE.Vector3(0, 1, 0),
        distance: t,
        source: 'detected-floor'
    };
}

function raycastFromController(controller) {
    if (!controller) return null;
    const { origin, direction } = getAimRayFromObject(controller);
    return raycastRoomGeometry(origin, direction) || raycastVirtualFloor(origin, direction);
}

function isEyeLevelPhantomHit(pointY, headsetY) {
    return Math.abs(pointY - headsetY) < 0.35;
}

function setReticleFromHit(point, normal) {
    const yAxis = (normal && normal.lengthSq() > 0.0001)
        ? _v1.copy(normal).normalize()
        : _v1.set(0, 1, 0);

    if (Math.abs(yAxis.y) < 0.2) {
        yAxis.set(0, 1, 0);
    }

    const worldUp = _v3.set(0, 1, 0);
    const xAxis = _v2;
    if (Math.abs(yAxis.dot(worldUp)) > 0.99) {
        xAxis.set(1, 0, 0);
    } else {
        xAxis.crossVectors(worldUp, yAxis).normalize();
    }
    const zAxis = _v3.crossVectors(xAxis, yAxis).normalize();
    xAxis.crossVectors(yAxis, zAxis).normalize();

    _m4.makeBasis(xAxis, yAxis, zAxis);
    _m4.setPosition(point);
    reticle.matrix.copy(_m4);
    reticle.visible = true;

    lastReticleHit = {
        point: point.clone(),
        normal: yAxis.clone(),
        source: 'reticle'
    };
}

function setControllerLaserLength(controller, distance) {
    if (!controller) return;
    const laser = controller.getObjectByName('aimLaser');
    if (!laser) return;
    const length = Number.isFinite(distance) ? distance : 1.5;
    laser.scale.z = Math.max(0.15, Math.min(length, 8));
}

function requestMeshAwareHitTest(session, space) {
    const attempts = [
        { space, entityTypes: ['mesh', 'plane'] },
        { space, entityTypes: ['plane'] },
        { space }
    ];

    const tryNext = (index) => {
        if (index >= attempts.length) return;
        session.requestHitTestSource(attempts[index]).then((source) => {
            hitTestSource = source;
            console.info('[XR] Hit-test source ready', attempts[index].entityTypes || '(default plane)');
        }).catch((err) => {
            console.warn('[XR] Hit-test request failed', attempts[index], err);
            tryNext(index + 1);
        });
    };

    tryNext(0);
}

function ensureHitTestSource(session) {
    if (hitTestSourceRequested) return;
    hitTestSourceRequested = true;
    session.requestReferenceSpace('viewer').then((viewerSpace) => {
        requestMeshAwareHitTest(session, viewerSpace);
    }).catch((err) => {
        console.warn('[XR] viewer reference space failed', err);
        hitTestSourceRequested = false;
    });
}

function updateReticleFromWorld(frame, session, refSpace) {
    const xrCam = renderer.xr.getCamera();
    const headsetY = xrCam ? xrCam.position.y : 1.6;
    const controllerHit1 = raycastFromController(controller1);
    const controllerHit2 = raycastFromController(controller2);
    let hit = controllerHit1 || controllerHit2;

    if (!hit && xrCam) {
        const { origin, direction } = getAimRayFromObject(xrCam);
        hit = raycastRoomGeometry(origin, direction) || raycastVirtualFloor(origin, direction);
    }

    if (!hit && hitTestSource) {
        const hits = frame.getHitTestResults(hitTestSource);
        if (hits.length > 0) {
            const pose = hits[0].getPose(refSpace);
            if (pose) {
                const y = pose.transform.position.y;
                if (!isEyeLevelPhantomHit(y, headsetY) || isPlausibleFloorY(y, headsetY)) {
                    _hitPoint.set(pose.transform.position.x, y, pose.transform.position.z);
                    _hitNormal.set(0, 1, 0);
                    hit = {
                        point: _hitPoint.clone(),
                        normal: _hitNormal.clone(),
                        distance: xrCam ? xrCam.position.distanceTo(_hitPoint) : 1,
                        source: 'webxr-hittest'
                    };
                }
            }
        }
    }

    setControllerLaserLength(controller1, controllerHit1 ? controllerHit1.distance : 1.5);
    setControllerLaserLength(controller2, controllerHit2 ? controllerHit2.distance : 1.5);

    if (hit) {
        setReticleFromHit(hit.point, hit.normal);
        lastReticleHit.source = hit.source;

        if (isDragging && currentModel && isPlaced) {
            currentModel.position.x = THREE.MathUtils.lerp(currentModel.position.x, hit.point.x, 0.2);
            currentModel.position.y = THREE.MathUtils.lerp(currentModel.position.y, hit.point.y, 0.2);
            currentModel.position.z = THREE.MathUtils.lerp(currentModel.position.z, hit.point.z, 0.2);
        }
        return;
    }

    reticle.visible = false;
    lastReticleHit = null;
}

function describeGeometryStatus(meshCount, planeCount) {
    const meshState = meshFeatureGranted === true ? 'on' : (meshFeatureGranted === false ? 'off' : '?');
    const planeState = planeFeatureGranted === true ? 'on' : (planeFeatureGranted === false ? 'off' : '?');
    const floorText = floorLocked
        ? `floor ${detectedFloorY.toFixed(2)}m (${floorSource})`
        : 'floor not locked';
    return `Room scan: ${meshCount} meshes [${meshState}], ${planeCount} planes [${planeState}] · ${floorText}`;
}

function setHudStatus(text, isError = false) {
    if (text === lastHudStatus) return;
    lastHudStatus = text;
    updateStatusText(text, isError);
}

function syncGeometryStatus(meshCount, planeCount) {
    sceneUnderstandingEnabled = meshFeatureGranted === true || planeFeatureGranted === true;
    isMeshAvailable = sceneUnderstandingEnabled;
    hasRoomGeometry = meshCount > 0 || planeCount > 0;

    const status = describeGeometryStatus(meshCount, planeCount);
    if (status !== lastGeometryStatus) {
        lastGeometryStatus = status;
        console.info('[XR]', status);
        redrawMenuCanvas();
    }

    const elapsed = performance.now() - xrSessionStartedAt;
    if (!hasRoomGeometry && elapsed > 1500 && elapsed < 16000) {
        setHudStatus('Waiting for Quest room scan (look around, or Space Setup will open)...');
    }

    if (hasRoomGeometry && floorLocked) {
        const notice = `Floor locked at ${detectedFloorY.toFixed(2)}m from ${floorSource}`;
        if (notice !== lastFloorLockNotice) {
            lastFloorLockNotice = notice;
            showToast(notice);
            setHudStatus(`${notice} — point at floor & pull trigger to place ${modelName}`);
        }
    } else if (hasRoomGeometry && !floorLocked) {
        setHudStatus('Room mesh received — looking for the real floor surface...');
    }

    if (!hasRoomGeometry && elapsed > 5000 && meshFeatureGranted === false && planeFeatureGranted === false) {
        setHudStatus('Quest did not grant mesh/plane detection — cannot use the room scan', true);
    }
}

/* =========================================================
   Render Loop & Room Meshing (Occlusion & Soft Shadows)
   ========================================================= */

let lastTime = performance.now();
let frameCount = 0;

function render(timestamp, frame) {
    if (frame) {
        // Track Headset in AR Space for Diegetic 3D HUD
        const xrCam = renderer.xr.getCamera();
        if (xrCam && hudGroup) {
            hudGroup.position.lerp(xrCam.position, 0.15);
            hudGroup.quaternion.slerp(xrCam.quaternion, 0.15);
        }

        // Room Mesh / Plane Detection (Quest Space Setup geometry)
        const refSpace = renderer.xr.getReferenceSpace();
        const session = renderer.xr.getSession();
        if (refSpace && session) {
            const splatVisible = !!(dropInViewer && dropInViewer.visible && isPlaced);
            const skipRoomGeom = splatVisible && (roomGeomFrame++ % 12 !== 0);
            let meshCount = 0;
            let planeCount = 0;
            if (!skipRoomGeom) {
                meshCount = processRoomMeshes(frame, refSpace);
                planeCount = processRoomPlanes(frame, refSpace);
            } else {
                meshCount = roomMeshes.size;
                planeCount = roomPlanes.size;
            }
            updateDetectedFloor(xrCam ? xrCam.position.y : 1.6);
            if (!skipRoomGeom) syncGeometryStatus(meshCount, planeCount);

            for (const source of session.inputSources) {
                if (source.gamepad) handleGamepadInput(source);
            }

            const isARSession = isArSession(session);
            if (isARSession && !isMenuOpen && !isLoading) {
                ensureHitTestSource(session);
                updateReticleFromWorld(frame, session, refSpace);
            } else {
                reticle.visible = false;
            }
        }

        const lasersVisible = renderer.xr.isPresenting;
        const laser1 = controller1 && controller1.getObjectByName('aimLaser');
        const laser2 = controller2 && controller2.getObjectByName('aimLaser');
        if (laser1) laser1.visible = lasersVisible;
        if (laser2) laser2.visible = lasersVisible;
    } else {
        if (orbitControls) orbitControls.update();
        const laser1 = controller1 && controller1.getObjectByName('aimLaser');
        const laser2 = controller2 && controller2.getObjectByName('aimLaser');
        if (laser1) laser1.visible = false;
        if (laser2) laser2.visible = false;
    }

    renderer.render(scene, camera);

    if (splatRevealAt && dropInViewer && performance.now() >= splatRevealAt) {
        dropInViewer.visible = true;
        splatRevealAt = 0;
    }

    // FPS Telemetry
    frameCount++;
    const now = performance.now();
    if (now - lastTime >= 1000) {
        if (dom.statFps) dom.statFps.textContent = frameCount.toString();
        frameCount = 0;
        lastTime = now;
    }
}

/* =========================================================
   Quest 3 Controller Input Handling (In-XR Controls)
   ========================================================= */

function handleGamepadInput(source) {
    if (isLoading) return;
    const gp = source.gamepad;
    const hand = source.handedness;
    const now = Date.now();

    // MENU TOGGLE: Button 'B' on right controller, or Button 'Y' on left controller
    const bPressed = (gp.buttons.length > 5 && gp.buttons[5].pressed);
    if (bPressed && !lastButtonState[hand + 'B']) {
        isMenuOpen = !isMenuOpen;

        menuMesh.visible = isMenuOpen;
        controlsMesh.visible = isMenuOpen;

        updateStatusText(isMenuOpen ? "Menu Open - Stick ↕ to Scroll, A to Select" : "Menu Closed");
    }
    lastButtonState[hand + 'B'] = bPressed;

    if (isMenuOpen) {
        // MENU NAV: Thumbstick Y
        const dy = gp.axes.length >= 4 ? gp.axes[3] : (gp.axes.length >= 2 ? gp.axes[1] : 0);
        if (Math.abs(dy) > 0.5 && now - lastScrollTime > 260) {
            selectedIndex = (dy > 0) ? selectedIndex + 1 : selectedIndex - 1;
            if (selectedIndex < 0) selectedIndex = menuItems.length - 1;
            if (selectedIndex >= menuItems.length) selectedIndex = 0;
            redrawMenuCanvas();
            lastScrollTime = now;
        }

        // MENU SELECT: Button 'A' on right controller, or Button 'X' on left controller
        const aPressed = (gp.buttons.length > 4 && gp.buttons[4].pressed);
        if (aPressed && !lastButtonState[hand + 'A']) {
            if (selectedIndex === 0) {
                // TOGGLE ROOM MODE (0 = Occlusion/Shadow -> 1 = Wireframe -> 2 = Off)
                if (sceneUnderstandingEnabled) {
                    meshMode = (meshMode + 1) % 3;
                    updateArFloorMarker();
                    redrawMenuCanvas();

                    if (!hasRoomGeometry) {
                        updateStatusText("Waiting for Quest room scan...");
                    } else {
                        let statusMsg = "Room: Shadows & Occlusion";
                        if (meshMode === 1) statusMsg = "Room: Wireframe Mesh";
                        if (meshMode === 2) statusMsg = "Room: Off";
                        updateStatusText(statusMsg);
                    }
                } else {
                    updateStatusText("Room Mesh: Unavailable — mesh/plane detection was not granted", true);
                }
            } else if (selectedIndex === 1) {
                // TOGGLE SCALING
                isScalingEnabled = !isScalingEnabled;
                redrawMenuCanvas();
                updateStatusText(isScalingEnabled ? "Scaling Enabled" : "Scaling Disabled");
            } else {
                // SELECT MODEL / SPLAT TO SPAWN
                modelName = menuItems[selectedIndex];
                dom.modelFilename.textContent = modelName;
                isPlaced = false;
                if (dropInViewer) dropInViewer.visible = false;
                setSplatXRBudget(false);
                if (currentModel && currentModel !== dropInViewer) currentModel.visible = false;
                updateStatusText(`Selected: ${modelName} — Pull Trigger to Place`);
                if (customSplatsMap.has(modelName)) {
                    ensureSplatGpuReady(modelName).catch((err) => {
                        console.warn('[XR] Background splat upload failed', err);
                    });
                }
                setTimeout(() => {
                    isMenuOpen = false;
                    menuMesh.visible = false;
                    controlsMesh.visible = false;
                }, 200);
            }
        }
        lastButtonState[hand + 'A'] = aPressed;

    } else {
        // MODEL CONTROLS IN 3D SPACE (Only active if model is placed and visible)
        if (!isPlaced) return;

        const targetObj = currentModel;

        // DRAG: Hold Button 'A' or Grip
        const aPressed = (gp.buttons.length > 4 && gp.buttons[4].pressed);
        const gripPressed = (gp.buttons.length > 1 && gp.buttons[1].pressed);
        isDragging = aPressed || gripPressed;

        if (targetObj && gp.axes.length >= 4) {
            const dx = gp.axes[2];
            const dy = gp.axes[3];

            // Left Stick ↕: Adjust height
            if (hand === 'left' && Math.abs(dy) > 0.1) {
                targetObj.position.y -= dy * 0.02;
            }

            // Right Stick: Rotate and Scale
            if (hand === 'right') {
                // Right Stick ↔: Rotate
                if (Math.abs(dx) > 0.1) {
                    targetObj.rotation.y -= dx * 0.05;
                }

                // Right Stick ↕: Scale
                if (Math.abs(dy) > 0.1 && isScalingEnabled) {
                    const s = 1 - (dy * 0.02);
                    targetObj.scale.multiplyScalar(s).clampScalar(0.01, 50);
                    const scaleVal = targetObj.scale.x.toFixed(2);
                    updateStatusText(`Scale: ${scaleVal}x`);
                    if (dom.statScale) dom.statScale.textContent = `${scaleVal}x`;
                }
            }
        }
    }
}

/* =========================================================
   2D UI & Custom File Upload Listeners
   ========================================================= */

function setup2DEventListeners() {
    // Select default Fighter Jet
    dom.loadDefaultBtn.addEventListener('click', () => {
        modelName = 'Fighter Jet';
        dom.modelFilename.textContent = 'Fighter Jet';
        dom.statFileSize.textContent = '2.1 MB';
        selectedIndex = menuItems.indexOf('Fighter Jet');
        redrawMenuCanvas();
        if (!renderer.xr.isPresenting) {
            const m = new THREE.Matrix4().setPosition(0, 0.5, 0);
            loadModel('Fighter Jet', m);
        } else {
            isPlaced = false;
            if (dropInViewer) dropInViewer.visible = false;
            if (currentModel && currentModel !== dropInViewer) currentModel.visible = false;
            updateStatusText("Selected Fighter Jet — Pull Trigger to Place");
            showToast("Selected Fighter Jet (Pull Trigger in XR to place)");
        }
    });

    // Select / Load default Gaussian Splat
    if (dom.loadDefaultSplatBtn) {
        dom.loadDefaultSplatBtn.addEventListener('click', () => {
            loadDefaultGaussianSplat();
        });
    }

    // File input trigger
    dom.uploadBtn.addEventListener('click', () => {
        dom.fileInput.click();
    });

    dom.fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            handleUploadedFile(file);
            dom.fileInput.value = '';
        }
    });

    // Help modal
    dom.helpToggleBtn.addEventListener('click', () => {
        dom.controlsModal.classList.add('active');
    });

    dom.closeModalBtn.addEventListener('click', () => {
        dom.controlsModal.classList.remove('active');
    });

    // Quick actions on telemetry card
    dom.recenterBtn.addEventListener('click', () => {
        if (currentModel) {
            if (currentModel === dropInViewer) {
                const buf = customSplatsMap.get(modelName);
                if (buf) {
                    placeSplatGroup(currentModel, buf, new THREE.Matrix4().setPosition(0, 0, 0));
                } else {
                    currentModel.position.set(0, 0, 0);
                }
                if (orbitControls) {
                    orbitControls.target.set(0, 0.85, 0);
                    camera.position.set(0, 1.0, 2.2);
                    orbitControls.update();
                }
            } else {
                currentModel.position.set(0, 0.5, 0);
                if (orbitControls) {
                    orbitControls.target.set(0, 0.5, 0);
                    camera.position.set(0, 1.2, 2.0);
                    orbitControls.update();
                }
            }
            showToast('Recentered model');
        }
    });

    dom.resetScaleBtn.addEventListener('click', () => {
        if (currentModel) {
            currentModel.scale.set(1.0, 1.0, 1.0);
            dom.statScale.textContent = '1.0x';
            showToast('Reset scale to 1.0x');
        }
    });

    dom.flipYBtn.addEventListener('click', () => {
        if (currentModel) {
            currentModel.rotation.x += Math.PI;
            showToast('Flipped Y axis');
        }
    });

    // Drag & Drop
    window.addEventListener('dragenter', (e) => {
        e.preventDefault();
        dom.dropOverlay.classList.add('active');
    });

    dom.dropOverlay.addEventListener('dragover', (e) => e.preventDefault());

    dom.dropOverlay.addEventListener('dragleave', (e) => {
        if (e.relatedTarget === null) dom.dropOverlay.classList.remove('active');
    });

    dom.dropOverlay.addEventListener('drop', (e) => {
        e.preventDefault();
        dom.dropOverlay.classList.remove('active');
        if (e.dataTransfer.files.length > 0) {
            handleUploadedFile(e.dataTransfer.files[0]);
        }
    });
}

async function handleUploadedFile(file) {
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();

    updateStatusText(`Reading ${file.name}...`);
    showToast(`Reading ${file.name}...`);
    updateLoadingBar(0.2);

    if (['glb', 'gltf'].includes(ext)) {
        try {
            const arrayBuffer = await file.arrayBuffer();
            updateLoadingBar(0.6);

            new GLTFLoader().parse(arrayBuffer, '', (gltf) => {
                customModelsMap.set(file.name, gltf.scene);
                modelName = file.name;
                dom.modelFilename.textContent = file.name;
                dom.statFileSize.textContent = formatBytes(file.size);

                buildMenuItems();
                selectedIndex = menuItems.indexOf(file.name);
                createMenuMesh();
                hideLoadingBar();

                if (!renderer.xr.isPresenting) {
                    const m = new THREE.Matrix4().setPosition(0, 0.5, 0);
                    loadModel(file.name, m);
                } else {
                    updateStatusText(`Ready: ${file.name} — Pull Trigger to Place`);
                    showToast(`Loaded ${file.name}! Pull Trigger in XR to place.`);
                }
            }, (err) => {
                console.error(err);
                hideLoadingBar();
                updateStatusText("GLTF Parse Error", true);
                showToast(`Error parsing ${file.name}`);
            });
        } catch (e) {
            console.error(e);
            hideLoadingBar();
            updateStatusText("File Read Error", true);
            showToast(`Error reading ${file.name}`);
        }
    } else if (['ply', 'splat', 'ksplat', 'spz'].includes(ext)) {
        try {
            updateStatusText(`Parsing Splat: ${file.name}...`);
            const arrayBuffer = await file.arrayBuffer();
            updateLoadingBar(0.5);

            let splatBuffer;
            if (ext === 'ply') splatBuffer = await GaussianSplats3D.PlyLoader.loadFromFileData(arrayBuffer, 0, 0, false);
            else if (ext === 'splat') splatBuffer = await GaussianSplats3D.SplatLoader.loadFromFileData(arrayBuffer, 0, 0, false);
            else if (ext === 'ksplat') splatBuffer = await GaussianSplats3D.KSplatLoader.loadFromFileData(arrayBuffer);
            else if (ext === 'spz') splatBuffer = await GaussianSplats3D.SpzLoader.loadFromFileData(arrayBuffer, 0, 0, false);

            updateLoadingBar(0.85);

            const gpuBuffer = await prepareSplatForGpu(file.name, splatBuffer);
            modelName = file.name;
            dom.modelFilename.textContent = file.name;
            dom.statFileSize.textContent = formatBytes(file.size);
            const count = gpuBuffer.getSplatCount();
            const sourceCount = gpuBuffer.__sourceCount || count;
            dom.statSplatCount.textContent = sourceCount !== count
                ? `${count.toLocaleString()} / ${sourceCount.toLocaleString()} splats`
                : `${count.toLocaleString()} splats`;

            buildMenuItems();
            selectedIndex = menuItems.indexOf(file.name);
            createMenuMesh();
            hideLoadingBar();

            if (!renderer.xr.isPresenting) {
                const m = new THREE.Matrix4().setPosition(0, 0, 0);
                loadModel(file.name, m);
            } else {
                isPlaced = false;
                if (dropInViewer) dropInViewer.visible = false;
                updateStatusText('Uploading Quest-safe splat to GPU...');
                showToast('Preparing splat for Quest — keep looking around');
                await ensureSplatGpuReady(file.name);
                hideLoadingBar();
                updateStatusText(`Ready: ${file.name} (${count.toLocaleString()} splats) — Pull Trigger to Place`);
                showToast(`Ready! Pull Trigger in XR to place ${file.name}.`);
            }
        } catch (e) {
            console.error(e);
            hideLoadingBar();
            updateStatusText(`Error: ${e.message}`, true);
            showToast(`Error reading splat: ${e.message}`);
        }
    } else {
        hideLoadingBar();
        showToast(`Unsupported format: .${ext}`);
    }
}

function formatBytes(bytes) {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

let toastTimer = null;
function showToast(message, duration = 3500) {
    if (!dom.toast) return;
    dom.toast.textContent = message;
    dom.toast.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        dom.toast.classList.remove('show');
    }, duration);
}

async function loadDefaultGaussianSplat() {
    const splatUrl = '/assets/Gaussian-Splats/Default Gaussian.ply';
    const splatName = 'Default Gaussian.ply';

    // If already in memory:
    if (customSplatsMap.has(splatName)) {
        modelName = splatName;
        dom.modelFilename.textContent = splatName;
        selectedIndex = menuItems.indexOf(splatName);
        redrawMenuCanvas();
        if (!renderer.xr.isPresenting) {
            const m = new THREE.Matrix4().setPosition(0, 0, 0);
            loadModel(splatName, m);
        } else {
            isPlaced = false;
            if (dropInViewer) dropInViewer.visible = false;
            if (currentModel && currentModel !== dropInViewer) currentModel.visible = false;
            updateStatusText(`Selected ${splatName} — Pull Trigger to Place`);
            showToast(`Selected ${splatName} (Pull Trigger in XR to place)`);
            ensureSplatGpuReady(splatName).catch((err) => {
                console.warn('[XR] Background splat upload failed', err);
            });
        }
        return;
    }

    if (isLoading) return;
    isLoading = true;
    updateStatusText('Fetching Default Gaussian Splat (127 MB)...');
    showToast('Fetching Default Gaussian Splat...');
    updateLoadingBar(0.05);

    try {
        const response = await fetch(splatUrl);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: Splat file not found on server. Use 'Upload Model / Splat' to select your local .ply file.`);
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
            if (total > 0) {
                const pct = (loaded / total) * 0.55; // 0% to 55% during download
                updateLoadingBar(pct);
                const mb = (loaded / (1024 * 1024)).toFixed(1);
                const totalMb = (total / (1024 * 1024)).toFixed(1);
                updateStatusText(`Downloading Splat: ${mb} / ${totalMb} MB`);
            }
        }

        updateStatusText('Parsing PLY binary data...');
        updateLoadingBar(0.65);

        // Combine chunks into single ArrayBuffer
        const combined = new Uint8Array(loaded);
        let offset = 0;
        for (const chunk of chunks) {
            combined.set(chunk, offset);
            offset += chunk.byteLength;
        }

        updateLoadingBar(0.75);
        const splatBuffer = await GaussianSplats3D.PlyLoader.loadFromFileData(combined.buffer, 0, 0, false);
        updateLoadingBar(0.85);

        customSplatsMap.set(splatName, splatBuffer);
        const gpuBuffer = await prepareSplatForGpu(splatName, splatBuffer);
        modelName = splatName;
        dom.modelFilename.textContent = splatName;
        dom.statFileSize.textContent = formatBytes(loaded);
        const count = gpuBuffer.getSplatCount();
        const sourceCount = gpuBuffer.__sourceCount || count;
        dom.statSplatCount.textContent = sourceCount !== count
            ? `${count.toLocaleString()} / ${sourceCount.toLocaleString()} splats`
            : `${count.toLocaleString()} splats`;

        buildMenuItems();
        selectedIndex = menuItems.indexOf(splatName);
        createMenuMesh();

        // Release loading lock before calling loadModel
        if (!renderer.xr.isPresenting) {
            isLoading = false;
            const m = new THREE.Matrix4().setPosition(0, 0, 0);
            loadModel(splatName, m);
        } else {
            isPlaced = false;
            if (dropInViewer) dropInViewer.visible = false;
            updateStatusText('Uploading Quest-safe splat to GPU...');
            showToast('Preparing splat for Quest — keep looking around');
            await ensureSplatGpuReady(splatName);
            isLoading = false;
            hideLoadingBar();
            updateStatusText(`Ready: ${splatName} — Pull Trigger to Place`);
            showToast(`Ready! Pull Trigger in XR to place ${splatName}.`);
        }
    } catch (e) {
        console.error('Failed to load default splat:', e);
        isLoading = false;
        hideLoadingBar();
        updateStatusText(`Splat Error: ${e.message}`, true);
        showToast(`Error: ${e.message}`, 5000);
    }
}