import * as THREE from 'three';
import { ARButton } from 'three/addons/webxr/ARButton.js';
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
let currentModel = null;
let currentSplatScene = null;
let splatViewer = null;
let modelName = 'Fighter Jet'; // Default selected model

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

        // --- AR BUTTON (Mount into modern header toolbar) ---
        setupWebXRButton();

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
    dom.uploadBtn = document.getElementById('upload-btn');
    dom.fileInput = document.getElementById('file-input');
    dom.helpToggleBtn = document.getElementById('help-toggle-btn');
    dom.arButtonMount = document.getElementById('ar-button-mount') || document.getElementById('vr-button-mount');

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

function setupWebXRButton() {
    // WebXR 'immersive-ar' Session for Meta Quest 3 Passthrough
    const sessionInit = {
        requiredFeatures: ['hit-test', 'local-floor', 'mesh-detection'],
        optionalFeatures: ['bounded-floor', 'plane-detection', 'hand-tracking']
    };

    const arBtn = ARButton.createButton(renderer, sessionInit);
    arBtn.id = 'ARButton';
    arBtn.title = 'Enter Quest 3 Passthrough AR';

    if (dom.arButtonMount) {
        dom.arButtonMount.innerHTML = '';
        dom.arButtonMount.appendChild(arBtn);
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
        showToast('Quest 3 AR Passthrough Active');
        updateStatusText("Ready — Aim & Trigger to Place (B for Menu)");
    });

    renderer.xr.addEventListener('sessionend', () => {
        if (orbitControls) orbitControls.enabled = true;
        showToast('AR Session Ended');
    });
}

/* =========================================================
   Diegetic In-Game 3D Floating Menu & HUD
   ========================================================= */

function createDiegeticHUD() {
    hudGroup = new THREE.Group();
    scene.add(hudGroup);

    // 1. Floating Status Text
    statusMesh = createTextLabel("Ready — Aim & Trigger to Place (B for Menu)", 38, null, '#00ff00');
    statusMesh.position.set(-0.4, 0.32, -1.0);
    hudGroup.add(statusMesh);

    // 2. 3D Loading Bar
    loadingGroup = new THREE.Group();
    loadingGroup.position.set(0, 0.12, -1.0);
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
    ctx.fillText("AR Controls", width / 2, 70);
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(40, 92);
    ctx.lineTo(width - 40, 92);
    ctx.stroke();

    const lines = [
        { label: "Trigger", val: "Spawn Model on Surface" },
        { label: "Hold Button A / Grip", val: "Drag Model in Room" },
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
    const color = isError ? '#f43f5e' : '#10b981';
    if (statusMesh && statusMesh.material.map) statusMesh.material.map.dispose();
    if (statusMesh) {
        statusMesh.material.map = createTexture(text, 38, null, color);
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

    ctx.font = `Bold ${fontSize}px Arial`;
    ctx.fillStyle = textColor || 'white';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = "rgba(0,0,0,0.8)";
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;
    ctx.fillText(text, 256, 64);
    return new THREE.CanvasTexture(canvas);
}

function createTextLabel(text, fontSize, bgColor, textColor) {
    const texture = createTexture(text, fontSize, bgColor, textColor);
    const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide });
    return new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.11), mat);
}

/* =========================================================
   Model & Splat Placement and Loading Logic
   ========================================================= */

function onSelect() {
    // Spawns the selected model onto the hit-tested surface reticle
    if (!isMenuOpen && !isLoading && reticle.visible && modelName && !isDragging) {
        loadModel(modelName, reticle.matrix);
    }
}

async function loadModel(name, positionMatrix) {
    if (!name || isLoading) return;
    isLoading = true;
    updateLoadingBar(0.01);
    dom.modelFilename.textContent = name;

    // Remove existing 3D model
    if (currentModel) {
        scene.remove(currentModel);
        currentModel = null;
    }

    // Hide splat mesh if switching
    if (splatViewer && splatViewer.splatMesh) {
        splatViewer.splatMesh.visible = false;
    }

    // --- CASE 1: Uploaded Custom 3D Model (GLB/GLTF) ---
    if (customModelsMap.has(name)) {
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
        finishLoading(name);
        return;
    }

    // --- CASE 2: Uploaded Custom Gaussian Splat ---
    if (customSplatsMap.has(name)) {
        const splatBuffer = customSplatsMap.get(name);
        try {
            initSplatEngineIfNeeded();
            splatViewer.splatMesh.visible = true;

            const mesh = splatViewer.getSplatMesh();
            if (mesh && mesh.scenes && mesh.scenes.length > 0) {
                const count = mesh.scenes.length;
                await splatViewer.removeSplatScenes(Array.from({ length: count }, (_, i) => i), false);
            }

            await splatViewer.addSplatBuffers([splatBuffer], [{}], true, false, false, true, true);
            currentSplatScene = splatViewer.getSplatScene(0);
            if (currentSplatScene) {
                currentSplatScene.position.setFromMatrixPosition(positionMatrix);
                currentSplatScene.scale.set(1.0, 1.0, 1.0);
                currentSplatScene.updateTransform(true);
            }

            const count = splatBuffer.getSplatCount();
            dom.statSplatCount.textContent = `${count.toLocaleString()} splats`;
            dom.statFileSize.textContent = 'Custom Splat';
            finishLoading(name);
        } catch (err) {
            console.error('Error adding splat buffer:', err);
            isLoading = false;
            hideLoadingBar();
            updateStatusText("Load Error", true);
            showToast(`Failed: ${err.message}`);
        }
        return;
    }

    // --- CASE 3: Standard Model from models_config.js ---
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
    showToast(`Loaded ${name} into room`);
}

function initSplatEngineIfNeeded() {
    if (splatViewer) return;
    splatViewer = new GaussianSplats3D.Viewer({
        camera: camera,
        renderer: renderer,
        threeScene: scene,
        dynamicScene: true,
        gpuAcceleratedSort: false,
        sharedMemoryForWorkers: false,
        useBuiltInControls: false,
        selfDrivenMode: false,
        renderMode: GaussianSplats3D.RenderMode.Always,
        sceneRevealMode: GaussianSplats3D.SceneRevealMode.Instant,
        logLevel: GaussianSplats3D.LogLevel.None
    });
    splatViewer.init();
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

        // Surface Hit-Testing & Reticle Placement
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
                    if (isDragging && currentModel) {
                        const pos = new THREE.Vector3().setFromMatrixPosition(reticle.matrix);
                        currentModel.position.x = THREE.MathUtils.lerp(currentModel.position.x, pos.x, 0.2);
                        currentModel.position.z = THREE.MathUtils.lerp(currentModel.position.z, pos.z, 0.2);
                    } else if (isDragging && currentSplatScene) {
                        const pos = new THREE.Vector3().setFromMatrixPosition(reticle.matrix);
                        currentSplatScene.position.x = THREE.MathUtils.lerp(currentSplatScene.position.x, pos.x, 0.2);
                        currentSplatScene.position.z = THREE.MathUtils.lerp(currentSplatScene.position.z, pos.z, 0.2);
                        currentSplatScene.updateTransform(true);
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

    // Update splats if active
    if (splatViewer && currentSplatScene && splatViewer.splatMesh?.visible) {
        splatViewer.update(renderer, camera);
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
   Quest 3 Controller Input Handling (In-AR Controls)
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
                    updateStatusText("Error: No Room Mesh Data", true);
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
                updateStatusText(`Selected: ${modelName} — Aim & Pull Trigger`);
                setTimeout(() => {
                    isMenuOpen = false;
                    menuMesh.visible = false;
                    controlsMesh.visible = false;
                }, 200);
            }
        }
        lastButtonState[hand + 'A'] = aPressed;

    } else {
        // MODEL CONTROLS IN AR SPACE
        const targetObj = currentModel || currentSplatScene;

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
                if (targetObj.updateTransform) targetObj.updateTransform(true);
            }

            // Right Stick: Rotate and Scale
            if (hand === 'right') {
                // Right Stick ↔: Rotate
                if (Math.abs(dx) > 0.1) {
                    targetObj.rotation.y -= dx * 0.05;
                    if (targetObj.updateTransform) targetObj.updateTransform(true);
                }

                // Right Stick ↕: Scale
                if (Math.abs(dy) > 0.1 && isScalingEnabled) {
                    const s = 1 - (dy * 0.02);
                    targetObj.scale.multiplyScalar(s).clampScalar(0.01, 50);
                    if (targetObj.updateTransform) targetObj.updateTransform(true);
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
        updateStatusText("Selected Fighter Jet — Aim & Trigger to Place");
        showToast("Selected Fighter Jet (Pull Trigger in AR to place)");
    });

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
        const target = currentModel || currentSplatScene;
        if (target) {
            target.position.set(0, 0.8, -1.8);
            if (target.updateTransform) target.updateTransform(true);
            showToast('Recentered model');
        }
    });

    dom.resetScaleBtn.addEventListener('click', () => {
        const target = currentModel || currentSplatScene;
        if (target) {
            target.scale.set(1.0, 1.0, 1.0);
            if (target.updateTransform) target.updateTransform(true);
            dom.statScale.textContent = '1.0x';
            showToast('Reset scale to 1.0x');
        }
    });

    dom.flipYBtn.addEventListener('click', () => {
        const target = currentModel || currentSplatScene;
        if (target) {
            target.rotation.x += Math.PI;
            if (target.updateTransform) target.updateTransform(true);
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
    updateLoadingBar(0.25);

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

                updateStatusText(`Ready: ${file.name} — Aim & Trigger to Place`);
                showToast(`Loaded ${file.name}! Enter AR & pull Trigger to place.`);
            }, (err) => {
                console.error(err);
                hideLoadingBar();
                showToast(`Error parsing ${file.name}`);
            });
        } catch (e) {
            console.error(e);
            hideLoadingBar();
            showToast(`Error reading ${file.name}`);
        }
    } else if (['ply', 'splat', 'ksplat', 'spz'].includes(ext)) {
        try {
            const arrayBuffer = await file.arrayBuffer();
            updateLoadingBar(0.6);

            let splatBuffer;
            if (ext === 'ply') splatBuffer = await GaussianSplats3D.PlyLoader.loadFromFileData(arrayBuffer, 0, 0, false);
            else if (ext === 'splat') splatBuffer = await GaussianSplats3D.SplatLoader.loadFromFileData(arrayBuffer, 0, 0, false);
            else if (ext === 'ksplat') splatBuffer = await GaussianSplats3D.KSplatLoader.loadFromFileData(arrayBuffer);
            else if (ext === 'spz') splatBuffer = await GaussianSplats3D.SpzLoader.loadFromFileData(arrayBuffer, 0, 0, false);

            customSplatsMap.set(file.name, splatBuffer);
            modelName = file.name;
            dom.modelFilename.textContent = file.name;
            dom.statFileSize.textContent = formatBytes(file.size);
            dom.statSplatCount.textContent = `${splatBuffer.getSplatCount().toLocaleString()} splats`;

            buildMenuItems();
            selectedIndex = menuItems.indexOf(file.name);
            createMenuMesh();
            hideLoadingBar();

            updateStatusText(`Ready: ${file.name} — Aim & Trigger to Place`);
            showToast(`Loaded ${file.name}! Enter AR & pull Trigger to place.`);
        } catch (e) {
            console.error(e);
            hideLoadingBar();
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