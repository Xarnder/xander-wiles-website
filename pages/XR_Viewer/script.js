import * as THREE from 'three';
import { ARButton } from 'three/addons/webxr/ARButton.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import * as GaussianSplats3D from '@mkkellogg/gaussian-splats-3d';

// IMPORT CONFIG
import { models } from '../../assets/models_config.js';

// --- GLOBALS ---
let camera, scene, renderer;
let controller1, controller2;
let reticle;
let gridHelper;
let currentModel = null;
let dropInViewer = null;
let modelName = 'Fighter Jet'; // Default selected model
let xrMode = 'none'; // 'none', 'ar', 'vr'

// Custom uploaded assets (stored for 3D in-game menu selection & spawning)
const customModelsMap = new Map();
const customSplatsMap = new Map();

// Diegetic Floating UI in 3D AR Space
let hudGroup, statusMesh, loadingGroup, loadingFill, menuMesh, controlsMesh;

// Room Mesh State (Quest 3 real-world occlusion & shadows)
const roomMeshes = new Map();
let roomGroup;
let meshMode = 0; // 0 = Occlusion+Shadow, 1 = Wireframe, 2 = Off
let isMeshAvailable = true;

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

init();
animate();

function init() {
    try {
        cacheDomElements();
        buildMenuItems();

        scene = new THREE.Scene();
        camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);
        camera.position.set(0, 1.2, 2.0);

        // --- LIGHTING & REALISTIC PASSTHROUGH SHADOWS ---
        const dirLight = new THREE.DirectionalLight(0xffffff, 2.5);
        dirLight.position.set(0, 5, 0); // Overhead sun/room light
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

        // Renderer (alpha: true is critical for Quest 3 Passthrough AR)
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.xr.enabled = true;
        renderer.xr.setReferenceSpaceType('local-floor');
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

        // --- ROOM GROUP ---
        roomGroup = new THREE.Group();
        scene.add(roomGroup);

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
    // 1. WebXR 'immersive-ar' Session for Meta Quest 3 Passthrough
    const arSessionInit = {
        requiredFeatures: ['hit-test', 'local-floor'],
        optionalFeatures: ['mesh-detection', 'plane-detection', 'hand-tracking']
    };

    const arBtn = ARButton.createButton(renderer, arSessionInit);
    arBtn.id = 'ARButton';
    arBtn.title = 'Enter Quest 3 Passthrough AR';

    if (dom.arButtonMount) {
        dom.arButtonMount.innerHTML = '';
        dom.arButtonMount.appendChild(arBtn);
    }

    // 2. WebXR 'immersive-vr' Session for Meta Quest 3 Virtual Reality
    const vrSessionInit = {
        optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking']
    };

    const vrBtn = VRButton.createButton(renderer, vrSessionInit);
    vrBtn.id = 'VRButton';
    vrBtn.title = 'Enter Quest 3 Virtual Reality';

    if (dom.vrButtonMount) {
        dom.vrButtonMount.innerHTML = '';
        dom.vrButtonMount.appendChild(vrBtn);
    }
}

function setupControllers() {
    controller1 = renderer.xr.getController(0);
    controller1.addEventListener('select', onSelect);
    scene.add(controller1);

    controller2 = renderer.xr.getController(1);
    controller2.addEventListener('select', onSelect);
    scene.add(controller2);
}

function setupDesktopControls() {
    orbitControls = new OrbitControls(camera, renderer.domElement);
    orbitControls.enableDamping = true;
    orbitControls.dampingFactor = 0.08;
    orbitControls.target.set(0, 0.8, 0);

    renderer.xr.addEventListener('sessionstart', () => {
        if (orbitControls) orbitControls.enabled = false;
        const session = renderer.xr.getSession();
        const isAR = session && session.mode === 'immersive-ar';
        xrMode = isAR ? 'ar' : 'vr';

        if (isAR) {
            gridHelper.visible = false;
            scene.background = null;
            showToast('Quest 3 AR Passthrough Active');
            updateStatusText("AR Mode: Point at floor/table & Pull Trigger (B for Menu)");
        } else {
            gridHelper.visible = true;
            scene.background = new THREE.Color(0x0a0c16);
            showToast('Quest 3 VR Mode Active');
            updateStatusText("VR Mode: Pull Trigger to Place Model (B for Menu)");
        }

        if (dropInViewer && dropInViewer.viewer) {
            dropInViewer.viewer.webXRActive = true;
            const xrCam = renderer.xr.getCamera();
            dropInViewer.viewer.updateForDropInMode(renderer, xrCam);
        }
    });

    renderer.xr.addEventListener('sessionend', () => {
        xrMode = 'none';
        if (orbitControls) orbitControls.enabled = true;
        if (gridHelper) gridHelper.visible = true;
        scene.background = null;
        if (dropInViewer && dropInViewer.viewer) {
            dropInViewer.viewer.webXRActive = false;
            dropInViewer.viewer.updateForDropInMode(renderer, camera);
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
        { label: "Trigger", val: "Spawn Model / Splat" },
        { label: "Hold Button A / Grip", val: "Drag Model in Space" },
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
            if (!isMeshAvailable) {
                displayLabel = "Mesh: Unavailable";
                textColor = '#f43f5e';
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

function onSelect() {
    // Spawns the selected model onto hit surface in AR, or 1.5m in front of camera in VR
    if (isMenuOpen || isLoading || isDragging || !modelName) return;

    const spawnMatrix = new THREE.Matrix4();
    if (reticle.visible) {
        spawnMatrix.copy(reticle.matrix);
    } else {
        // VR Mode or non-surface fallback: 1.5m in front of the active camera
        const activeCam = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera;
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(activeCam.quaternion);
        forward.y = 0;
        if (forward.lengthSq() < 0.001) forward.set(0, 0, -1);
        forward.normalize();

        const spawnPos = new THREE.Vector3().copy(activeCam.position).addScaledVector(forward, 1.5);
        spawnPos.y = Math.max(0, activeCam.position.y - 1.2);
        spawnMatrix.setPosition(spawnPos);
    }

    loadModel(modelName, spawnMatrix);
}

function getDropInViewer() {
    if (!dropInViewer) {
        dropInViewer = new GaussianSplats3D.DropInViewer({
            gpuAcceleratedSort: false,
            sharedMemoryForWorkers: false,
            dynamicMode: false,
            sceneRevealMode: GaussianSplats3D.SceneRevealMode.Instant,
            logLevel: GaussianSplats3D.LogLevel.None
        });
        scene.add(dropInViewer);
        // Bind renderer & camera immediately so DropInViewer initializes and primes WebGL structures
        const activeCam = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera;
        dropInViewer.viewer.updateForDropInMode(renderer, activeCam);
        if (renderer.xr.isPresenting && dropInViewer.viewer) {
            dropInViewer.viewer.webXRActive = true;
        }
    }
    return dropInViewer;
}

async function loadModel(name, positionMatrix) {
    if (!name || isLoading) return;
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

        scene.add(currentModel);
        dom.statSplatCount.textContent = `${Math.round(polyCount).toLocaleString()} polys`;
        dom.statFileSize.textContent = 'Custom 3D';
        updateLoadingBar(1.0);
        finishLoading(name);
        return;
    }

    // --- CASE 2: Uploaded Custom Gaussian Splat ---
    if (customSplatsMap.has(name)) {
        const splatBuffer = customSplatsMap.get(name);
        try {
            updateStatusText(`Adding ${name} to scene...`);
            updateLoadingBar(0.4);

            const viewerGroup = getDropInViewer();
            viewerGroup.visible = true;

            const activeCam = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera;
            viewerGroup.viewer.updateForDropInMode(renderer, activeCam);

            const prevCount = viewerGroup.getSceneCount();
            if (prevCount > 0) {
                const indices = Array.from({ length: prevCount }, (_, i) => i);
                await viewerGroup.removeSplatScenes(indices, false);
            }

            updateLoadingBar(0.7);

            await viewerGroup.viewer.addSplatBuffers(
                [splatBuffer],
                [{}],
                true,  // finalBuild
                false, // showLoadingUI
                false, // showLoadingUIForSplatTreeBuild
                true,  // replaceExisting
                true,  // enableRenderBeforeFirstSort
                true   // preserveVisibleRegion
            );

            updateLoadingBar(0.9);

            // Set DropInViewer position, rotation and scale
            viewerGroup.position.setFromMatrixPosition(positionMatrix);
            viewerGroup.quaternion.set(0, 0, 0, 1);
            viewerGroup.scale.set(1.0, 1.0, 1.0);

            // Force initial splat sort so GPU index buffer is populated immediately
            await viewerGroup.viewer.runSplatSort(true, true);

            // currentModel now points directly to DropInViewer
            currentModel = viewerGroup;

            // In 2D desktop preview, position camera and orbitControls to frame the scan center
            if (!renderer.xr.isPresenting && orbitControls) {
                orbitControls.target.set(0, 0.85, 0);
                camera.position.set(0, 1.0, 2.2);
                orbitControls.update();
            }

            const count = splatBuffer.getSplatCount();
            dom.statSplatCount.textContent = `${count.toLocaleString()} splats`;
            dom.statFileSize.textContent = 'Gaussian Splat';
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

        // Room Mesh Detection (Real walls occlusion & real floor shadows)
        if (!frame.detectedMeshes && isMeshAvailable) {
            // No meshes detected yet
        } else if (frame.detectedMeshes) {
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

                    // 1. Occlusion Mesh (Invisible barrier behind walls)
                    meshOcclusion = new THREE.Mesh(geometry, matOcclusion);
                    meshOcclusion.renderOrder = -2;
                    threeGroup.add(meshOcclusion);

                    // 2. Shadow Mesh (Projects shadow onto real desk/floor)
                    meshShadow = new THREE.Mesh(geometry, matShadow);
                    meshShadow.receiveShadow = true;
                    meshShadow.renderOrder = -1;
                    threeGroup.add(meshShadow);

                    // 3. Wireframe Mesh
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

                // Visibility logic
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

        // WebXR Controllers Input
        const session = renderer.xr.getSession();
        for (const source of session.inputSources) {
            if (source.gamepad) handleGamepadInput(source);
        }

        // Surface Hit-Testing & Reticle Placement (AR Mode only)
        const isARSession = session && session.mode === 'immersive-ar';
        if (isARSession && !isMenuOpen && !isLoading) {
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
                    if (isDragging && currentModel) {
                        const pos = new THREE.Vector3().setFromMatrixPosition(reticle.matrix);
                        currentModel.position.x = THREE.MathUtils.lerp(currentModel.position.x, pos.x, 0.2);
                        currentModel.position.z = THREE.MathUtils.lerp(currentModel.position.z, pos.z, 0.2);
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

    // Explicitly update Gaussian Splat viewer before render pass
    if (dropInViewer && dropInViewer.visible && dropInViewer.viewer && dropInViewer.viewer.initialized) {
        const activeCam = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera;
        dropInViewer.viewer.update(renderer, activeCam);
    }

    renderer.render(scene, camera);

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
                if (isMeshAvailable) {
                    meshMode = (meshMode + 1) % 3;
                    redrawMenuCanvas();

                    let statusMsg = "Room: Shadows & Occlusion";
                    if (meshMode === 1) statusMsg = "Room: Wireframe Mesh";
                    if (meshMode === 2) statusMsg = "Room: Off";
                    updateStatusText(statusMsg);
                } else {
                    updateStatusText("Room Mesh: Unavailable", true);
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
                updateStatusText(`Selected: ${modelName} — Pull Trigger to Place`);
                setTimeout(() => {
                    isMenuOpen = false;
                    menuMesh.visible = false;
                    controlsMesh.visible = false;
                }, 200);
            }
        }
        lastButtonState[hand + 'A'] = aPressed;

    } else {
        // MODEL CONTROLS IN 3D SPACE
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
                currentModel.position.set(0, 0, 0);
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

            customSplatsMap.set(file.name, splatBuffer);
            modelName = file.name;
            dom.modelFilename.textContent = file.name;
            dom.statFileSize.textContent = formatBytes(file.size);
            const count = splatBuffer.getSplatCount();
            dom.statSplatCount.textContent = `${count.toLocaleString()} splats`;

            buildMenuItems();
            selectedIndex = menuItems.indexOf(file.name);
            createMenuMesh();
            hideLoadingBar();

            if (!renderer.xr.isPresenting) {
                const m = new THREE.Matrix4().setPosition(0, 0, 0);
                loadModel(file.name, m);
            } else {
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
            updateStatusText(`Selected ${splatName} — Pull Trigger to Place`);
            showToast(`Selected ${splatName} (Pull Trigger in XR to place)`);
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
        modelName = splatName;
        dom.modelFilename.textContent = splatName;
        dom.statFileSize.textContent = formatBytes(loaded);
        const count = splatBuffer.getSplatCount();
        dom.statSplatCount.textContent = `${count.toLocaleString()} splats`;

        buildMenuItems();
        selectedIndex = menuItems.indexOf(splatName);
        createMenuMesh();

        // Release loading lock before calling loadModel
        isLoading = false;

        if (!renderer.xr.isPresenting) {
            const m = new THREE.Matrix4().setPosition(0, 0, 0);
            loadModel(splatName, m);
        } else {
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