import * as THREE from 'three';
import { ARButton } from 'three/addons/webxr/ARButton.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
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
let modelName = 'Fighter Jet'; // Default to Fighter Jet

// Custom uploaded assets
const customModelsMap = new Map();
const customSplatsMap = new Map();

// UI Groups (Floating in 3D AR Space)
let hudGroup, statusMesh, loadingGroup, loadingFill, menuMesh, controlsMesh;

// Room Mesh State (Mapping xrMesh -> THREE.Group containing occlusion, shadow, and wireframe)
const roomMeshes = new Map();
let roomGroup;
let meshMode = 0; // 0 = Occlusion+Shadow, 1 = Wireframe, 2 = Off
let isMeshAvailable = true;

// --- MATERIALS ---

// 1. Occlusion Material (The "Invisible Wall" for real walls/furniture)
const matOcclusion = new THREE.MeshBasicMaterial({
    colorWrite: false,
    depthWrite: true,
    side: THREE.DoubleSide
});

// 2. Shadow Material (The "Projected Shadow" on real floor/desks)
const matShadow = new THREE.ShadowMaterial({
    opacity: 0.5,
    depthWrite: false,
    side: THREE.DoubleSide
});

// 3. Wireframe Material (Debug room boundaries)
const matWireframe = new THREE.MeshBasicMaterial({
    color: 0x00ffff,
    wireframe: true,
    transparent: true,
    opacity: 0.3
});

// Menu State
let menuItems = [];
let isMenuOpen = false;
let isDragging = false;
let isLoading = false;
let selectedIndex = 2; // Default to 'Fighter Jet'
let scoreValue = 0;
let lastScrollTime = 0;
let lastButtonState = {};
let isScalingEnabled = true;

init();
animate();

function init() {
    try {
        const container = document.getElementById('ar-button-container');
        if (!container) throw new Error("Missing #ar-button-container");

        // 1. Prepare Menu Items (Fighter Jet first among models)
        buildMenuItems();

        scene = new THREE.Scene();
        camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);

        // --- LIGHTING & SHADOWS ---
        const dirLight = new THREE.DirectionalLight(0xffffff, 2.5);
        dirLight.position.set(0, 5, 0); // Overhead light for passthrough realism
        dirLight.castShadow = true;

        // High Quality Shadows
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
        scene.add(new THREE.AmbientLight(0xffffff, 0.7));

        // Renderer (alpha: true is critical for Quest 3 Passthrough AR)
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.xr.enabled = true;
        renderer.xr.setReferenceSpaceType('local-floor');

        // ENABLE SHADOWS
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        document.body.appendChild(renderer.domElement);

        // --- AR BUTTON ONLY (Pure Quest 3 Passthrough AR) ---
        const arBtn = ARButton.createButton(renderer, {
            requiredFeatures: ['hit-test', 'local-floor', 'mesh-detection'],
            optionalFeatures: ['bounded-floor', 'plane-detection']
        });
        arBtn.style.position = 'static';
        container.appendChild(arBtn);

        // Controllers
        controller1 = renderer.xr.getController(0);
        controller1.addEventListener('select', onSelect);
        scene.add(controller1);

        controller2 = renderer.xr.getController(1);
        controller2.addEventListener('select', onSelect);
        scene.add(controller2);

        // Reticle (Surface marker on floor/table)
        reticle = new THREE.Mesh(
            new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2),
            new THREE.MeshBasicMaterial({ color: 0xffffff })
        );
        reticle.matrixAutoUpdate = false;
        reticle.visible = false;
        scene.add(reticle);

        // Environment reflections
        const pmremGenerator = new THREE.PMREMGenerator(renderer);
        scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;

        // --- ROOM GROUP ---
        roomGroup = new THREE.Group();
        scene.add(roomGroup);

        // --- SETUP FLOATING IN-GAME HUD ---
        createHUD();

        // --- SETUP FILE UPLOADER (GLB / PLY / SPLAT) ---
        setupUploadListeners();

        window.addEventListener('resize', onWindowResize);
    } catch (e) {
        console.error(e);
    }
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

/* =========================================================
   Diegetic In-Game 3D HUD & Controls
   ========================================================= */

function createHUD() {
    hudGroup = new THREE.Group();
    scene.add(hudGroup);

    // 1. Status Text
    statusMesh = createTextLabel("Ready - Aim & Pull Trigger to Spawn", 40, null, '#00ff00');
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
    loadingFill = new THREE.Mesh(fillGeo, new THREE.MeshBasicMaterial({ color: 0x4a90e2 }));
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
    const itemHeight = 60;
    const footerPadding = 40;
    const totalContentHeight = headerHeight + (menuItems.length * itemHeight) + footerPadding;

    const canvasWidth = 512;
    const canvasHeight = Math.max(totalContentHeight, 512);

    const planeWidth = 0.6;
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
    const geometry = new THREE.PlaneGeometry(0.5, 0.7);
    const material = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0.90,
        depthTest: false,
        side: THREE.DoubleSide
    });
    controlsMesh = new THREE.Mesh(geometry, material);
    controlsMesh.position.set(-0.7, 0, -1.8);
    controlsMesh.rotation.y = 0.2;
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

    ctx.fillStyle = 'rgba(10, 10, 10, 0.88)';
    ctx.beginPath();
    ctx.roundRect(10, 10, width - 20, height - 20, 30);
    ctx.fill();
    ctx.strokeStyle = '#4a90e2';
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.font = 'bold 50px Arial';
    ctx.fillStyle = '#4a90e2';
    ctx.textAlign = 'center';
    ctx.fillText("AR Controls", width / 2, 70);
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(40, 90);
    ctx.lineTo(width - 40, 90);
    ctx.stroke();

    const lines = [
        { label: "Trigger", val: "Spawn Model on Surface" },
        { label: "Hold Button A", val: "Drag Model" },
        { label: "Left Stick ↕", val: "Lift / Lower" },
        { label: "Right Stick ↔", val: "Rotate" },
        { label: "Right Stick ↕", val: "Scale Size" },
        { label: "Button B", val: "Open / Close Menu" }
    ];

    ctx.textAlign = 'left';
    let y = 140;
    lines.forEach(line => {
        ctx.font = 'bold 32px Arial';
        ctx.fillStyle = '#ffcc00';
        ctx.fillText(line.label, 40, y);
        y += 40;
        ctx.font = '28px Arial';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(line.val, 60, y);
        y += 45;
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

    ctx.fillStyle = 'rgba(20, 20, 20, 0.92)';
    ctx.beginPath();
    ctx.roundRect(10, 10, width - 20, height - 20, 30);
    ctx.fill();
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.font = 'bold 50px Arial';
    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';
    ctx.fillText("Model Library", width / 2, 70);

    ctx.strokeStyle = '#555';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(40, 90);
    ctx.lineTo(width - 40, 90);
    ctx.stroke();

    const startY = 150;
    const itemHeight = 60;
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
        } else {
            if (customModelsMap.has(itemText)) displayLabel = `[3D] ${itemText}`;
            else if (customSplatsMap.has(itemText)) displayLabel = `[Splat] ${itemText}`;
        }

        if (i === selectedIndex) {
            ctx.fillStyle = '#4a90e2';
            ctx.beginPath();
            ctx.roundRect(40, yPos - 35, width - 80, 50, 10);
            ctx.fill();
            ctx.fillStyle = 'white';
            ctx.font = 'bold 34px Arial';
        } else {
            ctx.fillStyle = textColor;
            ctx.font = '34px Arial';
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
    const color = isError ? '#ff0000' : '#00ff00';
    if (statusMesh && statusMesh.material.map) statusMesh.material.map.dispose();
    if (statusMesh) {
        statusMesh.material.map = createTexture(text, 40, null, color);
        statusMesh.material.needsUpdate = true;
    }
}

function updateLoadingBar(percent) {
    if (!loadingGroup) return;
    loadingGroup.visible = true;
    loadingFill.scale.x = Math.min(Math.max(percent, 0.01), 1);
    updateStatusText(`Loading: ${(percent * 100).toFixed(0)}%`);
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

    // Remove existing 3D model
    if (currentModel) {
        scene.remove(currentModel);
        currentModel = null;
    }

    // Hide splat viewer mesh if switching
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

        currentModel.traverse((node) => {
            if (node.isMesh) {
                node.castShadow = true;
                node.receiveShadow = true;
            }
        });

        scene.add(currentModel);
        finishLoading(name);
        return;
    }

    // --- CASE 2: Uploaded Custom Gaussian Splat ---
    if (customSplatsMap.has(name)) {
        const splatBuffer = customSplatsMap.get(name);
        try {
            initSplatEngineIfNeeded();
            splatViewer.splatMesh.visible = true;

            // Remove previous splat scenes
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

            finishLoading(name);
        } catch (err) {
            console.error('Error adding splat buffer:', err);
            isLoading = false;
            if (loadingGroup) loadingGroup.visible = false;
            updateStatusText("Load Error", true);
        }
        return;
    }

    // --- CASE 3: Standard Model from models_config.js ---
    const selectedModel = models.find(m => m.name === name);
    if (!selectedModel) {
        console.error("Model not found in config:", name);
        isLoading = false;
        if (loadingGroup) loadingGroup.visible = false;
        return;
    }

    const rawPath = selectedModel.path;
    // Resolve relative to module so it works across root, subpaths, ngrok, and local
    const assetPath = new URL(rawPath.startsWith('/') ? '../../' + rawPath.slice(1) : rawPath, import.meta.url).href;

    const onProgress = (xhr) => {
        if (xhr.lengthComputable) updateLoadingBar(xhr.loaded / xhr.total);
    };

    const onError = (e) => {
        isLoading = false;
        if (loadingGroup) loadingGroup.visible = false;
        console.error(e);
        updateStatusText("Load Error", true);
    };

    const onLoad = (obj) => {
        currentModel = obj;
        currentModel.position.setFromMatrixPosition(positionMatrix);

        const box = new THREE.Box3().setFromObject(currentModel);
        const size = box.getSize(new THREE.Vector3()).length();
        const scalar = size > 0 ? (1.5 / size) : 1;
        currentModel.scale.set(scalar, scalar, scalar);

        // Shadow Casting for Models on Room Mesh
        currentModel.traverse((node) => {
            if (node.isMesh) {
                node.castShadow = true;
                node.receiveShadow = true;
            }
        });

        scene.add(currentModel);
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
    if (loadingGroup) loadingGroup.visible = false;

    scoreValue += 10;
    updateStatusText(`Loaded ${name}! Score: ${scoreValue}`);
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
   Render Loop & Room Meshing (Occlusion & Shadows)
   ========================================================= */

function render(timestamp, frame) {
    if (frame) {
        // Follow camera with diegetic HUD
        if (hudGroup) {
            hudGroup.position.lerp(camera.position, 0.1);
            hudGroup.quaternion.slerp(camera.quaternion, 0.1);
        }

        // Room Mesh Detection
        if (!frame.detectedMeshes && isMeshAvailable) {
            // No meshes
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

                    // 1. Occlusion Mesh
                    meshOcclusion = new THREE.Mesh(geometry, matOcclusion);
                    meshOcclusion.renderOrder = -2;
                    threeGroup.add(meshOcclusion);

                    // 2. Shadow Mesh
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
            if (source.gamepad) handleInput(source);
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
    }

    // Update splats if active
    if (splatViewer && currentSplatScene && splatViewer.splatMesh?.visible) {
        splatViewer.update(renderer, camera);
    }

    renderer.render(scene, camera);
}

/* =========================================================
   Quest 3 Controller Input Handling (AR Mode)
   ========================================================= */

function handleInput(source) {
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
        // MENU NAV: Right stick Y (or Left stick Y)
        const dy = gp.axes.length >= 4 ? gp.axes[3] : (gp.axes.length >= 2 ? gp.axes[1] : 0);
        if (Math.abs(dy) > 0.6 && now - lastScrollTime > 280) {
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
                // TOGGLE MODE (0 = Occlusion/Shadow -> 1 = Wireframe -> 2 = Off)
                if (isMeshAvailable) {
                    meshMode = (meshMode + 1) % 3;
                    redrawMenuCanvas();

                    let statusMsg = "Mode: Shadow/Occlusion";
                    if (meshMode === 1) statusMsg = "Mode: Wireframe";
                    if (meshMode === 2) statusMsg = "Mode: Off";
                    updateStatusText(statusMsg);
                } else {
                    updateStatusText("Error: No Mesh Data", true);
                }
            } else if (selectedIndex === 1) {
                // TOGGLE SCALING
                isScalingEnabled = !isScalingEnabled;
                redrawMenuCanvas();
                updateStatusText(isScalingEnabled ? "Scaling Enabled" : "Scaling Disabled");
            } else {
                // SELECT MODEL / SPLAT TO SPAWN
                modelName = menuItems[selectedIndex];
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
                }
            }
        }
    }
}

/* =========================================================
   Upload Custom 3D Models & Gaussian Splats
   ========================================================= */

function setupUploadListeners() {
    const fileInput = document.getElementById('file-input');
    const uploadBtn = document.getElementById('upload-btn');
    const uploadStatus = document.getElementById('upload-status');

    if (uploadBtn && fileInput) {
        uploadBtn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) handleUploadedFile(file, uploadStatus);
        });
    }

    // Drag & Drop
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => {
        e.preventDefault();
        if (e.dataTransfer.files.length > 0) {
            handleUploadedFile(e.dataTransfer.files[0], uploadStatus);
        }
    });
}

async function handleUploadedFile(file, uploadStatus) {
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();

    if (uploadStatus) uploadStatus.textContent = `Reading ${file.name}...`;

    if (['glb', 'gltf'].includes(ext)) {
        try {
            const arrayBuffer = await file.arrayBuffer();
            new GLTFLoader().parse(arrayBuffer, '', (gltf) => {
                customModelsMap.set(file.name, gltf.scene);
                modelName = file.name;
                buildMenuItems();
                selectedIndex = menuItems.indexOf(file.name);
                createMenuMesh();

                if (uploadStatus) uploadStatus.textContent = `Ready: ${file.name} (Enter AR, aim & Trigger to spawn)`;
                updateStatusText(`Loaded ${file.name} — Pull Trigger to Place`);
            }, (err) => {
                console.error(err);
                if (uploadStatus) uploadStatus.textContent = `Error parsing ${file.name}`;
            });
        } catch (e) {
            console.error(e);
            if (uploadStatus) uploadStatus.textContent = `Error reading ${file.name}`;
        }
    } else if (['ply', 'splat', 'ksplat', 'spz'].includes(ext)) {
        try {
            const arrayBuffer = await file.arrayBuffer();
            let splatBuffer;
            if (ext === 'ply') splatBuffer = await GaussianSplats3D.PlyLoader.loadFromFileData(arrayBuffer, 0, 0, false);
            else if (ext === 'splat') splatBuffer = await GaussianSplats3D.SplatLoader.loadFromFileData(arrayBuffer, 0, 0, false);
            else if (ext === 'ksplat') splatBuffer = await GaussianSplats3D.KSplatLoader.loadFromFileData(arrayBuffer);
            else if (ext === 'spz') splatBuffer = await GaussianSplats3D.SpzLoader.loadFromFileData(arrayBuffer, 0, 0, false);

            customSplatsMap.set(file.name, splatBuffer);
            modelName = file.name;
            buildMenuItems();
            selectedIndex = menuItems.indexOf(file.name);
            createMenuMesh();

            if (uploadStatus) uploadStatus.textContent = `Ready: ${file.name} (${splatBuffer.getSplatCount().toLocaleString()} splats)`;
            updateStatusText(`Loaded ${file.name} — Pull Trigger to Place`);
        } catch (e) {
            console.error(e);
            if (uploadStatus) uploadStatus.textContent = `Error loading splat: ${e.message}`;
        }
    } else {
        if (uploadStatus) uploadStatus.textContent = `Unsupported format: .${ext}`;
    }
}