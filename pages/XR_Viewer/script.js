/**
 * script.js — Unified Quest 3 XR Studio
 * 
 * Combines:
 *   1. Full Diegetic in-VR UI (Floating HUD, 3D Menu Mesh, 3D Controls Guide, 3D Loading Bar)
 *   2. Standard 3D Models Library (GLB / GLTF / OBJ: Mercedes, Cute Robot, Fighter Jet, etc.)
 *   3. 3D Gaussian Splats (.ply / .splat / .ksplat / .spz)
 *   4. Default Gaussian Splat (Default Gaussian.ply — 535,144 splats)
 *   5. Room Mesh Detection (Occlusion, Projected Shadows, Wireframe) & Hit-Test Reticle
 *   6. 6-DoF Quest 3 Controller Manipulation (Dual-hand pinch, Drag, Sticks, Snap turns)
 *   7. 2D Desktop Fallback & Control Deck
 */

import * as THREE from 'three';
import { ARButton } from 'three/addons/webxr/ARButton.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as GaussianSplats3D from '@mkkellogg/gaussian-splats-3d';

// IMPORT CONFIG
import { models } from '../../assets/models_config.js';

// --- APPLICATION STATE ---
let camera, scene, renderer;
let controller1, controller2;
let reticle;
let orbitControls;

// Active Models
let currentModel = null;     // Active standard GLTF/GLB/OBJ model
let splatViewer = null;      // GaussianSplats3D Viewer instance
let currentSplatScene = null;
let currentModelName = 'Default Gaussian.ply';
let customSplatBuffer = null;
let customSplatFileName = '';

// Diegetic VR HUD & UI Elements
let hudGroup, statusMesh, loadingGroup, loadingFill, menuMesh, controlsMesh;
let menuItems = [];
let isMenuOpen = false;
let isDragging = false;
let isLoading = false;
let selectedIndex = 2; // Default to Default Gaussian
let scoreValue = 0;
let lastScrollTime = 0;
let lastButtonState = {};
let isScalingEnabled = true;

// Two-Handed Manipulation
let twoHandActive = false;
let twoHandStartDist = 0;
let twoHandStartScale = 1.0;
let twoHandStartPos = new THREE.Vector3();
let twoHandStartMidpoint = new THREE.Vector3();
let twoHandStartAngle = 0;
let twoHandStartRotY = 0;
let lastSnapTurnTime = 0;

// Room Mesh State (Occlusion, Shadow, Wireframe)
const roomMeshes = new Map();
let roomGroup;
let meshMode = 0; // 0 = Occlusion+Shadow, 1 = Wireframe, 2 = Off
let isMeshAvailable = true;

// Materials for Room Mesh
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
    color: 0x00ffff,
    wireframe: true,
    transparent: true,
    opacity: 0.3
});

// Floor Reference Grid
let floorGrid = null;
let showFloorGrid = true;

// Telemetry
let lastFrameTime = performance.now();
let frameCount = 0;
let fpsLastTime = performance.now();
let dragCounter = 0;

// DOM Cache
const dom = {};

// Initialize App
window.addEventListener('DOMContentLoaded', init);

function init() {
    try {
        cacheDomElements();
        buildMenuItems();
        setup2DUIEventListeners();
        setupDragAndDrop();

        scene = new THREE.Scene();
        camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 30);
        camera.position.set(0, 1.6, 2.5);

        // --- LIGHTING & SHADOWS ---
        const dirLight = new THREE.DirectionalLight(0xffffff, 2);
        dirLight.position.set(0, 5, 0);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 2048;
        dirLight.shadow.mapSize.height = 2048;
        dirLight.shadow.camera.near = 0.1;
        dirLight.shadow.camera.far = 10;
        dirLight.shadow.camera.left = -5;
        dirLight.shadow.camera.right = 5;
        dirLight.shadow.camera.top = 5;
        dirLight.shadow.camera.bottom = -5;
        dirLight.shadow.bias = -0.0005;

        scene.add(dirLight);
        scene.add(dirLight.target);
        scene.add(new THREE.AmbientLight(0xffffff, 0.8));

        // Renderer
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.xr.enabled = true;
        renderer.xr.setReferenceSpaceType('local-floor');
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        dom.canvasContainer.appendChild(renderer.domElement);

        // Environment
        const pmremGenerator = new THREE.PMREMGenerator(renderer);
        scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;

        // --- WEBXR BUTTONS (AR & VR) ---
        setupWebXRButtons();

        // --- CONTROLLERS ---
        setupControllers();

        // --- RETICLE ---
        reticle = new THREE.Mesh(
            new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2),
            new THREE.MeshBasicMaterial({ color: 0x00f3ff })
        );
        reticle.matrixAutoUpdate = false;
        reticle.visible = false;
        scene.add(reticle);

        // --- ROOM GROUP ---
        roomGroup = new THREE.Group();
        scene.add(roomGroup);

        // --- FLOOR GRID ---
        floorGrid = new THREE.GridHelper(20, 40, 0x00f3ff, 0x1e293b);
        floorGrid.material.transparent = true;
        floorGrid.material.opacity = 0.45;
        floorGrid.visible = showFloorGrid;
        scene.add(floorGrid);

        // --- DIEGETIC IN-VR HUD ---
        createDiegeticHUD();

        // --- DESKTOP ORBIT CONTROLS ---
        setupDesktopControls();

        // --- INITIALIZE GAUSSIAN SPLATS VIEWER ---
        initGaussianSplatEngine();

        // Start Animation Loop
        renderer.setAnimationLoop(render);

        // Auto-load default Gaussian Splat
        setTimeout(() => {
            loadDefaultGaussianSplat();
        }, 300);

    } catch (e) {
        console.error('Initialization error:', e);
    }
}

function cacheDomElements() {
    dom.canvasContainer = document.getElementById('canvas-container');
    dom.loadDefaultBtn = document.getElementById('load-default-btn');
    dom.uploadBtn = document.getElementById('upload-btn');
    dom.fileInput = document.getElementById('file-input');
    dom.helpToggleBtn = document.getElementById('help-toggle-btn');
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
    dom.gridToggleBtn = document.getElementById('grid-toggle-btn');

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
    menuItems = [
        'Room Mode',
        'Scaling: On',
        'Default Gaussian.ply',
        ...(customSplatFileName ? [customSplatFileName] : []),
        ...models.map(m => m.name)
    ];
}

function setupWebXRButtons() {
    // 1. AR Button (supports Quest 3 passthrough, hit-test, and room mesh)
    const sessionInit = {
        requiredFeatures: ['hit-test', 'local-floor'],
        optionalFeatures: ['bounded-floor', 'mesh-detection', 'plane-detection', 'hand-tracking']
    };

    const arBtn = ARButton.createButton(renderer, sessionInit);
    arBtn.id = 'ARButton';
    arBtn.title = 'Enter Quest 3 Passthrough AR';

    // 2. VR Button (supports immersive VR)
    const vrBtn = VRButton.createButton(renderer, {
        requiredFeatures: ['local-floor'],
        optionalFeatures: ['bounded-floor', 'hand-tracking']
    });
    vrBtn.id = 'VRButton';
    vrBtn.title = 'Enter Quest 3 Immersive VR';

    if (dom.vrButtonMount) {
        dom.vrButtonMount.appendChild(arBtn);
        dom.vrButtonMount.appendChild(vrBtn);
    }
}

function setupControllers() {
    controller1 = renderer.xr.getController(0);
    controller1.addEventListener('select', onSelect);
    controller1.addEventListener('connected', (e) => {
        controller1.userData.handedness = e.data.handedness;
        controller1.userData.inputSource = e.data;
    });
    scene.add(controller1);

    controller2 = renderer.xr.getController(1);
    controller2.addEventListener('select', onSelect);
    controller2.addEventListener('connected', (e) => {
        controller2.userData.handedness = e.data.handedness;
        controller2.userData.inputSource = e.data;
    });
    scene.add(controller2);

    // Attach laser pointers
    controller1.add(createLaser());
    controller2.add(createLaser());
}

function createLaser() {
    const geo = new THREE.CylinderGeometry(0.0015, 0.003, 3, 8);
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, 0, -1.5);
    const mat = new THREE.MeshBasicMaterial({ color: 0x00f3ff, transparent: true, opacity: 0.6 });
    return new THREE.Mesh(geo, mat);
}

function setupDesktopControls() {
    orbitControls = new OrbitControls(camera, renderer.domElement);
    orbitControls.enableDamping = true;
    orbitControls.dampingFactor = 0.08;
    orbitControls.rotateSpeed = 0.7;
    orbitControls.panSpeed = 0.8;
    orbitControls.zoomSpeed = 1.2;
    orbitControls.target.set(0, 1.2, 0);

    renderer.xr.addEventListener('sessionstart', () => {
        if (orbitControls) orbitControls.enabled = false;
        showToast('XR Session Active');
    });

    renderer.xr.addEventListener('sessionend', () => {
        if (orbitControls) orbitControls.enabled = true;
        showToast('XR Session Ended');
    });
}

function setup2DUIEventListeners() {
    dom.loadDefaultBtn.addEventListener('click', () => {
        loadDefaultGaussianSplat();
    });

    dom.uploadBtn.addEventListener('click', () => {
        dom.fileInput.click();
    });

    dom.fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            handleFileUpload(file);
            dom.fileInput.value = '';
        }
    });

    dom.helpToggleBtn.addEventListener('click', () => {
        dom.controlsModal.classList.add('active');
    });

    dom.closeModalBtn.addEventListener('click', () => {
        dom.controlsModal.classList.remove('active');
    });

    dom.controlsModal.addEventListener('click', (e) => {
        if (e.target === dom.controlsModal) dom.controlsModal.classList.remove('active');
    });

    dom.recenterBtn.addEventListener('click', () => {
        recenterActiveObject();
        showToast('Model recentered');
    });

    dom.resetScaleBtn.addEventListener('click', () => {
        resetActiveObjectScale();
        showToast('Scale reset to 1.0x');
    });

    dom.flipYBtn.addEventListener('click', () => {
        flipActiveObjectY();
    });

    dom.gridToggleBtn.addEventListener('click', () => {
        showFloorGrid = !showFloorGrid;
        if (floorGrid) floorGrid.visible = showFloorGrid;
        dom.gridToggleBtn.classList.toggle('active', showFloorGrid);
        showToast(`Ground Grid ${showFloorGrid ? 'On' : 'Off'}`);
    });

    window.addEventListener('resize', onWindowResize);
}

function setupDragAndDrop() {
    window.addEventListener('dragenter', (e) => {
        e.preventDefault();
        dragCounter++;
        dom.dropOverlay.classList.add('active');
    });

    window.addEventListener('dragover', (e) => {
        e.preventDefault();
    });

    window.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dragCounter--;
        if (dragCounter <= 0) {
            dragCounter = 0;
            dom.dropOverlay.classList.remove('active');
        }
    });

    window.addEventListener('drop', (e) => {
        e.preventDefault();
        dragCounter = 0;
        dom.dropOverlay.classList.remove('active');

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFileUpload(e.dataTransfer.files[0]);
        }
    });
}

/* =========================================================
   Diegetic In-VR UI (Floating HUD, Menu Mesh, Controls)
   ========================================================= */

function createDiegeticHUD() {
    hudGroup = new THREE.Group();
    scene.add(hudGroup);

    // 1. Status Text
    statusMesh = createTextLabel("Ready — Press 'B' for Menu", 40, null, '#00ff00');
    statusMesh.position.set(-0.4, 0.3, -1.0);
    hudGroup.add(statusMesh);

    // 2. Loading Bar
    loadingGroup = new THREE.Group();
    loadingGroup.position.set(0, 0.1, -1.0);
    loadingGroup.visible = false;
    hudGroup.add(loadingGroup);

    const barBg = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.05), new THREE.MeshBasicMaterial({ color: 0x222222 }));
    loadingGroup.add(barBg);

    const fillGeo = new THREE.PlaneGeometry(0.6, 0.05);
    fillGeo.translate(0.3, 0, 0);
    loadingFill = new THREE.Mesh(fillGeo, new THREE.MeshBasicMaterial({ color: 0x00f3ff }));
    loadingFill.position.x = -0.3;
    loadingFill.position.z = 0.001;
    loadingFill.scale.x = 0;
    loadingGroup.add(loadingFill);

    // 3. Main Menu Mesh
    createMenuMesh();

    // 4. Controls Guide Mesh
    createControlsMesh();
}

function createMenuMesh() {
    const headerHeight = 150;
    const itemHeight = 58;
    const footerPadding = 40;
    const totalContentHeight = headerHeight + (menuItems.length * itemHeight) + footerPadding;

    const canvasWidth = 512;
    const canvasHeight = Math.max(totalContentHeight, 512);

    const planeWidth = 0.65;
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
        menuMesh.geometry.dispose();
        menuMesh.material.dispose();
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
    controlsMesh.position.set(-0.75, 0, -1.8);
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

    ctx.fillStyle = 'rgba(10, 12, 20, 0.9)';
    ctx.beginPath();
    ctx.roundRect(10, 10, width - 20, height - 20, 30);
    ctx.fill();
    ctx.strokeStyle = '#00f3ff';
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.font = 'bold 46px Outfit, sans-serif';
    ctx.fillStyle = '#00f3ff';
    ctx.textAlign = 'center';
    ctx.fillText("Quest 3 Controls", width / 2, 70);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(40, 90);
    ctx.lineTo(width - 40, 90);
    ctx.stroke();

    const lines = [
        { label: "Trigger (Click)", val: "Spawn / Place Model" },
        { label: "Hold Button 'A' / Grip", val: "Drag Model / Splat" },
        { label: "Dual Grips (Hold Both)", val: "Pinch-to-Scale & Rotate" },
        { label: "Left Stick ↕", val: "Lift / Lower" },
        { label: "Right Stick ↔", val: "Snap Turn 45°" },
        { label: "Right Stick ↕", val: "Scale Size" },
        { label: "Button 'B' / 'Y'", val: "Toggle Menu" }
    ];

    ctx.textAlign = 'left';
    let y = 140;
    lines.forEach(line => {
        ctx.font = 'bold 30px Outfit, sans-serif';
        ctx.fillStyle = '#ffcc00';
        ctx.fillText(line.label, 40, y);
        y += 38;
        ctx.font = '26px Outfit, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(line.val, 55, y);
        y += 44;
    });

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

    ctx.fillStyle = 'rgba(12, 14, 24, 0.94)';
    ctx.beginPath();
    ctx.roundRect(10, 10, width - 20, height - 20, 30);
    ctx.fill();
    ctx.strokeStyle = '#00f3ff';
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.font = 'bold 46px Outfit, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText("Model & Splat Library", width / 2, 70);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(40, 90);
    ctx.lineTo(width - 40, 90);
    ctx.stroke();

    const startY = 150;
    const itemHeight = 58;

    menuItems.forEach((itemText, i) => {
        const yPos = startY + (i * itemHeight);
        let displayLabel = itemText;
        let textColor = '#aaaaaa';

        if (i === 0) {
            if (!isMeshAvailable) {
                displayLabel = "Mesh Unavailable";
                textColor = '#ff4444';
            } else {
                if (meshMode === 0) displayLabel = "Mode: Shadow/Occlusion";
                else if (meshMode === 1) displayLabel = "Mode: Wireframe";
                else if (meshMode === 2) displayLabel = "Mode: Off";
                textColor = '#ffff00';
            }
        } else if (i === 1) {
            displayLabel = isScalingEnabled ? "Scaling: On" : "Scaling: Off";
            textColor = isScalingEnabled ? '#00ff00' : '#ffaa00';
        } else if (itemText.includes('Gaussian') || itemText.includes('.ply') || itemText.includes('.splat')) {
            textColor = '#00f3ff'; // Highlight splats in cyan
        }

        if (i === selectedIndex) {
            ctx.fillStyle = '#00f3ff';
            ctx.beginPath();
            ctx.roundRect(40, yPos - 35, width - 80, 50, 10);
            ctx.fill();
            ctx.fillStyle = '#000000';
            ctx.font = 'bold 32px Outfit, sans-serif';
        } else {
            ctx.fillStyle = textColor;
            ctx.font = '32px Outfit, sans-serif';
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
    const color = isError ? '#ff4444' : '#00ff00';
    if (statusMesh.material.map) statusMesh.material.map.dispose();
    statusMesh.material.map = createTexture(text, 40, null, color);
    statusMesh.material.needsUpdate = true;
}

function updateLoadingBar(percent) {
    loadingGroup.visible = true;
    loadingFill.scale.x = Math.min(Math.max(percent, 0.01), 1);
    updateStatusText(`Loading: ${(percent * 100).toFixed(0)}%`);

    // Sync 2D Loading Dialog
    dom.loadingDialog.classList.add('active');
    dom.loadingPercent.textContent = `${(percent * 100).toFixed(0)}%`;
    dom.loadingBarFill.style.width = `${(percent * 100).toFixed(0)}%`;
}

function hideLoadingBar() {
    loadingGroup.visible = false;
    dom.loadingDialog.classList.remove('active');
}

function createTexture(text, fontSize, bgColor, textColor) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, 512, 128);
    if (bgColor) {
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, 512, 128);
    }

    ctx.font = `Bold ${fontSize}px Outfit, sans-serif`;
    ctx.fillStyle = textColor || 'white';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = "black";
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;
    ctx.fillText(text, 256, 64);
    return new THREE.CanvasTexture(canvas);
}

function createTextLabel(text, fontSize, bgColor, textColor) {
    const texture = createTexture(text, fontSize, bgColor, textColor);
    const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide });
    return new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.1), mat);
}

/* =========================================================
   Gaussian Splat Engine Setup
   ========================================================= */

function initGaussianSplatEngine() {
    splatViewer = new GaussianSplats3D.Viewer({
        camera: camera,
        renderer: renderer,
        threeScene: scene,
        dynamicScene: true,
        gpuAcceleratedSort: false, // WASM sort is most stable on Quest 3
        sharedMemoryForWorkers: false,
        useBuiltInControls: false,
        selfDrivenMode: false,     // Driven by renderer.setAnimationLoop
        renderMode: GaussianSplats3D.RenderMode.Always,
        sceneRevealMode: GaussianSplats3D.SceneRevealMode.Instant,
        logLevel: GaussianSplats3D.LogLevel.None
    });

    splatViewer.init();
}

/* =========================================================
   Model & Splat Loading Logic
   ========================================================= */

function onSelect() {
    if (!isMenuOpen && !isLoading && reticle.visible && currentModelName && !isDragging) {
        loadSelectedModel(currentModelName, reticle.matrix);
    }
}

function loadSelectedModel(name, positionMatrix) {
    if (!name || isLoading) return;

    if (name === 'Default Gaussian.ply') {
        loadDefaultGaussianSplat(positionMatrix);
    } else if (name === customSplatFileName && customSplatBuffer) {
        loadUploadedSplatBuffer(customSplatBuffer, customSplatFileName, positionMatrix);
    } else {
        loadStandard3DModel(name, positionMatrix);
    }
}

async function loadDefaultGaussianSplat(positionMatrix) {
    if (isLoading) return;
    isLoading = true;
    currentModelName = 'Default Gaussian.ply';
    dom.modelFilename.textContent = 'Default Gaussian.ply';
    dom.statFileSize.textContent = '127 MB';

    updateStatusText("Streaming Default Gaussian...");
    updateLoadingBar(0.01);
    dom.loadingTitle.textContent = 'Loading Default Gaussian Splat...';
    dom.loadingSubtitle.textContent = 'Streaming 127 MB binary PLY data';

    // Clear existing standard model
    if (currentModel) {
        scene.remove(currentModel);
        currentModel = null;
    }

    try {
        const response = await fetch('/assets/Gaussian-Splats/Default Gaussian.ply');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const contentLength = response.headers.get('content-length');
        const total = contentLength ? parseInt(contentLength, 10) : 132717323;

        const combined = new Uint8Array(total);
        const reader = response.body.getReader();
        let offset = 0;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            combined.set(value, offset);
            offset += value.length;
            updateLoadingBar(offset / total);
        }

        updateStatusText("Parsing 535k Gaussians...");
        const arrayBuffer = combined.buffer.slice(0, offset);
        const splatBuffer = await GaussianSplats3D.PlyLoader.loadFromFileData(arrayBuffer, 0, 0, false);

        updateStatusText("Uploading to GPU...");
        await splatViewer.addSplatBuffers([splatBuffer], [{}], true, false, false, true, true);

        currentSplatScene = splatViewer.getSplatScene(0);
        if (currentSplatScene) {
            if (positionMatrix) {
                currentSplatScene.position.setFromMatrixPosition(positionMatrix);
            } else {
                currentSplatScene.position.set(0, 0.8, -1.8);
            }
            currentSplatScene.scale.set(1.0, 1.0, 1.0);
            currentSplatScene.updateTransform(true);
        }

        const count = splatBuffer.getSplatCount();
        dom.statSplatCount.textContent = count.toLocaleString();
        scoreValue += 15;
        updateStatusText(`Loaded! Score: ${scoreValue}`);
        showToast(`Loaded Default Gaussian (${count.toLocaleString()} splats)`);

        closeMenu();

    } catch (err) {
        console.error('Error loading default splat:', err);
        updateStatusText("Load Error", true);
        showToast(`Failed: ${err.message}`);
    } finally {
        isLoading = false;
        hideLoadingBar();
    }
}

async function loadUploadedSplatBuffer(splatBuffer, filename, positionMatrix) {
    if (isLoading) return;
    isLoading = true;
    currentModelName = filename;
    dom.modelFilename.textContent = filename;

    updateStatusText(`Building ${filename}...`);
    updateLoadingBar(0.5);

    if (currentModel) {
        scene.remove(currentModel);
        currentModel = null;
    }

    try {
        await splatViewer.addSplatBuffers([splatBuffer], [{}], true, false, false, true, true);

        currentSplatScene = splatViewer.getSplatScene(0);
        if (currentSplatScene) {
            if (positionMatrix) {
                currentSplatScene.position.setFromMatrixPosition(positionMatrix);
            } else {
                currentSplatScene.position.set(0, 0.8, -1.8);
            }
            currentSplatScene.scale.set(1.0, 1.0, 1.0);
            currentSplatScene.updateTransform(true);
        }

        const count = splatBuffer.getSplatCount();
        dom.statSplatCount.textContent = count.toLocaleString();
        scoreValue += 15;
        updateStatusText(`Loaded ${filename}!`);
        showToast(`Loaded ${filename} (${count.toLocaleString()} splats)`);

        closeMenu();

    } catch (err) {
        console.error('Error adding splat buffer:', err);
        updateStatusText("Load Error", true);
    } finally {
        isLoading = false;
        hideLoadingBar();
    }
}

function loadStandard3DModel(name, positionMatrix) {
    if (!name || isLoading) return;
    isLoading = true;
    updateLoadingBar(0.01);

    if (currentModel) {
        scene.remove(currentModel);
        currentModel = null;
    }

    // Hide splats when viewing standard models
    if (splatViewer && splatViewer.splatMesh) {
        splatViewer.splatMesh.visible = false;
    }

    const selectedModel = models.find(m => m.name === name);
    if (!selectedModel) {
        console.error("Model not found:", name);
        isLoading = false;
        return;
    }

    currentModelName = name;
    dom.modelFilename.textContent = name;
    const assetPath = selectedModel.path;

    const onProgress = (xhr) => {
        if (xhr.lengthComputable) updateLoadingBar(xhr.loaded / xhr.total);
    };

    const onError = (e) => {
        isLoading = false;
        hideLoadingBar();
        console.error(e);
        updateStatusText("Load Error", true);
    };

    const onLoad = (obj) => {
        currentModel = obj;
        if (positionMatrix) {
            currentModel.position.setFromMatrixPosition(positionMatrix);
        } else {
            currentModel.position.set(0, 0.8, -1.8);
        }

        const box = new THREE.Box3().setFromObject(currentModel);
        const size = box.getSize(new THREE.Vector3()).length();
        const scalar = size > 0 ? (1.5 / size) : 1;
        currentModel.scale.set(scalar, scalar, scalar);

        currentModel.traverse((node) => {
            if (node.isMesh) {
                node.castShadow = true;
                node.receiveShadow = true;
            }
        });

        scene.add(currentModel);

        isLoading = false;
        closeMenu();
        hideLoadingBar();

        scoreValue += 10;
        updateStatusText(`Loaded! Score: ${scoreValue}`);
        showToast(`Loaded ${name}`);

        dom.statSplatCount.textContent = 'Polygonal';
        dom.statFileSize.textContent = 'GLB Mesh';
    };

    const ext = assetPath.split('.').pop().toLowerCase();
    if (ext === 'glb' || ext === 'gltf') {
        new GLTFLoader().load(assetPath, (g) => onLoad(g.scene), onProgress, onError);
    } else if (ext === 'obj') {
        new OBJLoader().load(assetPath, (o) => onLoad(o), onProgress, onError);
    }
}

async function handleFileUpload(file) {
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();

    if (['ply', 'splat', 'ksplat', 'spz'].includes(ext)) {
        showToast(`Parsing ${file.name}...`);
        updateStatusText(`Reading ${file.name}...`);
        updateLoadingBar(0.2);

        try {
            const arrayBuffer = await file.arrayBuffer();
            updateLoadingBar(0.6);

            let splatBuffer;
            if (ext === 'ply') splatBuffer = await GaussianSplats3D.PlyLoader.loadFromFileData(arrayBuffer, 0, 0, false);
            else if (ext === 'splat') splatBuffer = await GaussianSplats3D.SplatLoader.loadFromFileData(arrayBuffer, 0, 0, false);
            else if (ext === 'ksplat') splatBuffer = await GaussianSplats3D.KSplatLoader.loadFromFileData(arrayBuffer);
            else if (ext === 'spz') splatBuffer = await GaussianSplats3D.SpzLoader.loadFromFileData(arrayBuffer, 0, 0, false);

            customSplatBuffer = splatBuffer;
            customSplatFileName = file.name;

            // Rebuild menu to include uploaded splat
            buildMenuItems();
            createMenuMesh();

            await loadUploadedSplatBuffer(splatBuffer, file.name);

        } catch (err) {
            console.error('Failed to parse uploaded splat:', err);
            showToast(`Error: ${err.message}`);
        }
    } else if (['glb', 'gltf'].includes(ext)) {
        const url = URL.createObjectURL(file);
        new GLTFLoader().load(url, (g) => {
            if (currentModel) scene.remove(currentModel);
            if (splatViewer && splatViewer.splatMesh) splatViewer.splatMesh.visible = false;
            currentModel = g.scene;
            currentModel.position.set(0, 0.8, -1.8);
            scene.add(currentModel);
            showToast(`Loaded ${file.name}`);
        });
    }
}

function closeMenu() {
    isMenuOpen = false;
    menuMesh.visible = false;
    controlsMesh.visible = false;
}

/* =========================================================
   Render Loop & Room Meshing
   ========================================================= */

function render(timestamp, frame) {
    if (frame) {
        // 1. Follow camera with diegetic HUD
        if (hudGroup) {
            hudGroup.position.lerp(camera.position, 0.1);
            hudGroup.quaternion.slerp(camera.quaternion, 0.1);
        }

        // 2. Room Mesh Detection (Occlusion + Shadows)
        if (frame.detectedMeshes) {
            isMeshAvailable = true;
            for (const [xrMesh, threeGroup] of roomMeshes) {
                if (!frame.detectedMeshes.has(xrMesh)) {
                    roomGroup.remove(threeGroup);
                    threeGroup.children.forEach(c => { c.geometry.dispose(); });
                    roomMeshes.delete(xrMesh);
                }
            }

            for (const xrMesh of frame.detectedMeshes) {
                let threeGroup = roomMeshes.get(xrMesh);
                let meshOcclusion, meshShadow, meshWireframe;

                if (!threeGroup) {
                    threeGroup = new THREE.Group();
                    const geometry = new THREE.BufferGeometry();

                    meshOcclusion = new THREE.Mesh(geometry, matOcclusion);
                    meshOcclusion.renderOrder = -2;
                    threeGroup.add(meshOcclusion);

                    meshShadow = new THREE.Mesh(geometry, matShadow);
                    meshShadow.receiveShadow = true;
                    meshShadow.renderOrder = -1;
                    threeGroup.add(meshShadow);

                    meshWireframe = new THREE.Mesh(geometry, matWireframe);
                    meshWireframe.renderOrder = 0;
                    threeGroup.add(meshWireframe);

                    roomGroup.add(threeGroup);
                    roomMeshes.set(xrMesh, threeGroup);
                } else {
                    meshOcclusion = threeGroup.children[0];
                    meshShadow = threeGroup.children[1];
                    meshWireframe = threeGroup.children[2];
                }

                if (meshMode === 2) {
                    threeGroup.visible = false;
                } else {
                    threeGroup.visible = true;
                    if (meshMode === 0) {
                        meshOcclusion.visible = true;
                        meshShadow.visible = true;
                        meshWireframe.visible = false;
                    } else if (meshMode === 1) {
                        meshOcclusion.visible = false;
                        meshShadow.visible = false;
                        meshWireframe.visible = true;
                    }
                }

                const geometry = meshOcclusion.geometry;
                geometry.setAttribute('position', new THREE.BufferAttribute(xrMesh.vertices, 3));
                geometry.setIndex(new THREE.BufferAttribute(xrMesh.indices, 1));
                geometry.computeVertexNormals();

                const pose = frame.getPose(xrMesh.meshSpace, renderer.xr.getReferenceSpace());
                if (pose) {
                    threeGroup.matrix.fromArray(pose.transform.matrix);
                    threeGroup.matrix.decompose(threeGroup.position, threeGroup.quaternion, threeGroup.scale);
                }
            }
        } else {
            if (isMeshAvailable) {
                isMeshAvailable = false;
                redrawMenuCanvas();
            }
        }

        // 3. Process WebXR Gamepad Inputs
        const session = renderer.xr.getSession();
        for (const source of session.inputSources) {
            if (source.gamepad) handleGamepadInput(source);
        }

        // 4. Two-Handed Manipulation Check
        handleTwoHandedPinch();

        // 5. Hit Testing & Surface Reticle
        if (!isMenuOpen && !isLoading) {
            const refSpace = renderer.xr.getReferenceSpace();
            if (!renderer.xr.hitTestSourceRequested) {
                session.requestReferenceSpace('viewer').then(ref => {
                    session.requestHitTestSource({ space: ref }).then(s => renderer.xr.hitTestSource = s);
                });
                renderer.xr.hitTestSourceRequested = true;
            }

            if (renderer.xr.hitTestSource) {
                const hits = frame.getHitTestResults(renderer.xr.hitTestSource);
                if (hits.length > 0) {
                    const pose = hits[0].getPose(refSpace);
                    reticle.visible = true;
                    reticle.matrix.fromArray(pose.transform.matrix);

                    if (isDragging) {
                        const targetPos = new THREE.Vector3().setFromMatrixPosition(reticle.matrix);
                        if (currentModel) {
                            currentModel.position.x = THREE.MathUtils.lerp(currentModel.position.x, targetPos.x, 0.2);
                            currentModel.position.z = THREE.MathUtils.lerp(currentModel.position.z, targetPos.z, 0.2);
                        } else if (currentSplatScene) {
                            currentSplatScene.position.x = THREE.MathUtils.lerp(currentSplatScene.position.x, targetPos.x, 0.2);
                            currentSplatScene.position.z = THREE.MathUtils.lerp(currentSplatScene.position.z, targetPos.z, 0.2);
                            currentSplatScene.updateTransform(true);
                        }
                    }
                } else {
                    reticle.visible = false;
                }
            }
        } else {
            reticle.visible = false;
        }
    } else {
        if (orbitControls) orbitControls.update();
    }

    // 6. Update Gaussian Splat Viewer
    if (splatViewer) {
        splatViewer.update(renderer, camera);
    }

    // 7. Render Scene
    renderer.render(scene, camera);
    updateFPS();
}

/* =========================================================
   Quest 3 Controller Input Handling
   ========================================================= */

function handleGamepadInput(source) {
    if (isLoading) return;
    const gp = source.gamepad;
    const hand = source.handedness;
    const now = Date.now();

    // MENU TOGGLE (Button 'B' on right hand, Button 'Y' on left hand)
    const bPressed = (gp.buttons.length > 5 && gp.buttons[5].pressed);
    if (bPressed && !lastButtonState[hand + 'B']) {
        isMenuOpen = !isMenuOpen;
        menuMesh.visible = isMenuOpen;
        controlsMesh.visible = isMenuOpen;
        updateStatusText(isMenuOpen ? "Menu Open" : "Menu Closed");
    }
    lastButtonState[hand + 'B'] = bPressed;

    if (isMenuOpen) {
        // MENU SCROLL (Thumbstick Y)
        const dy = gp.axes.length >= 4 ? gp.axes[3] : (gp.axes.length >= 2 ? gp.axes[1] : 0);
        if (Math.abs(dy) > 0.6 && now - lastScrollTime > 280) {
            selectedIndex = (dy > 0) ? selectedIndex + 1 : selectedIndex - 1;
            if (selectedIndex < 0) selectedIndex = menuItems.length - 1;
            if (selectedIndex >= menuItems.length) selectedIndex = 0;
            redrawMenuCanvas();
            lastScrollTime = now;
        }

        // MENU SELECT (Button 'A' on right hand, 'X' on left hand)
        const aPressed = (gp.buttons.length > 4 && gp.buttons[4].pressed);
        if (aPressed && !lastButtonState[hand + 'A']) {
            if (selectedIndex === 0) {
                // TOGGLE ROOM MODE (0 -> 1 -> 2 -> 0)
                if (isMeshAvailable) {
                    meshMode = (meshMode + 1) % 3;
                    redrawMenuCanvas();
                    let msg = "Mode: Shadow/Occlusion";
                    if (meshMode === 1) msg = "Mode: Wireframe";
                    if (meshMode === 2) msg = "Mode: Off";
                    updateStatusText(msg);
                } else {
                    updateStatusText("Error: No Mesh Data", true);
                }
            } else if (selectedIndex === 1) {
                // TOGGLE SCALING
                isScalingEnabled = !isScalingEnabled;
                redrawMenuCanvas();
                updateStatusText(isScalingEnabled ? "Scaling Enabled" : "Scaling Disabled");
            } else {
                // LOAD MODEL OR SPLAT
                const selected = menuItems[selectedIndex];
                updateStatusText(`Selected: ${selected}`);
                loadSelectedModel(selected);
            }
        }
        lastButtonState[hand + 'A'] = aPressed;

    } else {
        // DRAG HOLD (Button 'A' or Grip)
        const gripPressed = (gp.buttons.length > 1 && gp.buttons[1].pressed);
        const aPressed = (gp.buttons.length > 4 && gp.buttons[4].pressed);
        isDragging = gripPressed || aPressed;

        const targetObject = currentModel || currentSplatScene;

        // SINGLE-HAND STICK ADJUSTMENTS
        if (targetObject && gp.axes.length >= 2) {
            const dx = gp.axes.length >= 4 ? gp.axes[2] : gp.axes[0];
            const dy = gp.axes.length >= 4 ? gp.axes[3] : gp.axes[1];

            // Left Stick: Height Adjust
            if (hand === 'left' && Math.abs(dy) > 0.12) {
                targetObject.position.y -= dy * 0.02;
                if (targetObject.updateTransform) targetObject.updateTransform(true);
            }

            // Right Stick: Rotate & Scale
            if (hand === 'right') {
                if (Math.abs(dx) > 0.12) {
                    targetObject.rotation.y -= dx * 0.05;
                    if (targetObject.updateTransform) targetObject.updateTransform(true);
                }
                if (Math.abs(dy) > 0.12 && isScalingEnabled) {
                    const s = 1 - (dy * 0.02);
                    targetObject.scale.multiplyScalar(s).clampScalar(0.01, 50);
                    if (targetObject.updateTransform) targetObject.updateTransform(true);
                    const scaleVal = targetObject.scale.x.toFixed(2);
                    updateStatusText(`Scale: ${scaleVal}x`);
                    dom.statScale.textContent = `${scaleVal}x`;
                }
            }
        }
    }
}

function handleTwoHandedPinch() {
    if (!controller1 || !controller2) return;

    const targetObject = currentModel || currentSplatScene;
    if (!targetObject || !isScalingEnabled) return;

    const gp1 = controller1.userData.inputSource?.gamepad;
    const gp2 = controller2.userData.inputSource?.gamepad;

    const grip1 = gp1 && gp1.buttons[1] && gp1.buttons[1].pressed;
    const grip2 = gp2 && gp2.buttons[1] && gp2.buttons[1].pressed;

    if (grip1 && grip2) {
        const p1 = controller1.position;
        const p2 = controller2.position;
        const currentDist = p1.distanceTo(p2);

        if (!twoHandActive) {
            twoHandActive = true;
            twoHandStartDist = Math.max(currentDist, 0.02);
            twoHandStartScale = targetObject.scale.x;
            twoHandStartPos.copy(targetObject.position);
            twoHandStartMidpoint.addVectors(p1, p2).multiplyScalar(0.5);
            twoHandStartAngle = Math.atan2(p2.z - p1.z, p2.x - p1.x);
            twoHandStartRotY = targetObject.rotation.y;
        } else {
            // Scale
            const scaleRatio = currentDist / twoHandStartDist;
            const newScale = THREE.MathUtils.clamp(twoHandStartScale * scaleRatio, 0.02, 50.0);
            targetObject.scale.set(newScale, newScale, newScale);

            // Translation
            const currMid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
            const midDelta = currMid.sub(twoHandStartMidpoint);
            targetObject.position.copy(twoHandStartPos).add(midDelta);

            // Twist Rotate
            const currAngle = Math.atan2(p2.z - p1.z, p2.x - p1.x);
            const angleDelta = currAngle - twoHandStartAngle;
            targetObject.rotation.y = twoHandStartRotY - angleDelta;

            if (targetObject.updateTransform) targetObject.updateTransform(true);
            dom.statScale.textContent = `${newScale.toFixed(2)}x`;
        }
    } else {
        twoHandActive = false;
    }
}

/* =========================================================
   Transform & Helper Operations
   ========================================================= */

function recenterActiveObject() {
    const target = currentModel || currentSplatScene;
    if (!target) return;

    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    dir.y = 0;
    dir.normalize();

    target.position.copy(camera.position).addScaledVector(dir, 1.8);
    target.position.y = Math.max(0.6, camera.position.y - 0.4);
    target.rotation.set(0, 0, 0);

    if (target.updateTransform) target.updateTransform(true);
}

function resetActiveObjectScale() {
    const target = currentModel || currentSplatScene;
    if (!target) return;
    target.scale.set(1, 1, 1);
    if (target.updateTransform) target.updateTransform(true);
    dom.statScale.textContent = '1.0x';
}

function flipActiveObjectY() {
    if (currentSplatScene) {
        currentSplatScene.scale.y *= -1;
        currentSplatScene.updateTransform(true);
        showToast(`Splat Y Axis ${currentSplatScene.scale.y > 0 ? 'Normal' : 'Inverted'}`);
    } else if (currentModel) {
        currentModel.scale.y *= -1;
        showToast('Model Y Inverted');
    }
}

function updateFPS() {
    frameCount++;
    const now = performance.now();
    if (now - fpsLastTime >= 1000) {
        const fps = Math.round((frameCount * 1000) / (now - fpsLastTime));
        dom.statFps.textContent = fps;
        frameCount = 0;
        fpsLastTime = now;
    }
}

function showToast(message, duration = 3000) {
    dom.toast.textContent = message;
    dom.toast.classList.add('active');
    setTimeout(() => {
        dom.toast.classList.remove('active');
    }, duration);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}