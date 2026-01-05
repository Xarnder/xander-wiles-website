import * as THREE from 'three';
import { ARButton } from 'three/addons/webxr/ARButton.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// IMPORT CONFIG
import { models } from '../../assets/models_config.js';

// --- GLOBALS ---
let camera, scene, renderer;
let controller1, controller2;
let reticle;
let currentModel = null;
let modelName = null;

// UI Groups
let hudGroup, statusMesh, loadingGroup, loadingFill, menuMesh, controlsMesh;

// Room Mesh State
// We now map xrMesh -> THREE.Group (containing occlusion, shadow, and wireframe meshes)
const roomMeshes = new Map();
let roomGroup;
let meshMode = 0; // 0 = Occlusion+Shadow, 1 = Wireframe, 2 = Off
let isMeshAvailable = true;

// --- MATERIALS ---

// 1. Occlusion Material (The "Invisible Wall")
// Writes to depth buffer so objects behind it are hidden.
const matOcclusion = new THREE.MeshBasicMaterial({
    colorWrite: false,
    depthWrite: true,
    side: THREE.DoubleSide
});

// 2. Shadow Material (The "Projected Shadow")
// Transparent, receives shadows, does NOT write depth (avoids z-fighting with occlusion)
const matShadow = new THREE.ShadowMaterial({
    opacity: 0.5,
    depthWrite: false, // Let occlusion mesh handle depth
    side: THREE.DoubleSide
});

// 3. Wireframe Material (Debug)
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
let selectedIndex = 0;
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

        // 1. Prepare Menu Items
        menuItems = ['Room Mode', 'Scaling: On', ...models.map(m => m.name)];

        scene = new THREE.Scene();
        camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);

        // --- LIGHTING & SHADOWS ---
        const dirLight = new THREE.DirectionalLight(0xffffff, 2);
        dirLight.position.set(0, 5, 0); // Overhead light
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
        scene.add(new THREE.AmbientLight(0xffffff, 0.6));

        // Renderer
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.xr.enabled = true;
        renderer.xr.setReferenceSpaceType('local-floor');

        // ENABLE SHADOWS
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        document.body.appendChild(renderer.domElement);

        // --- AR BUTTON ---
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

        // Reticle
        reticle = new THREE.Mesh(
            new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2),
            new THREE.MeshBasicMaterial({ color: 0xffffff })
        );
        reticle.matrixAutoUpdate = false;
        reticle.visible = false;
        scene.add(reticle);

        // Environment
        const pmremGenerator = new THREE.PMREMGenerator(renderer);
        scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;

        // --- ROOM GROUP ---
        roomGroup = new THREE.Group();
        scene.add(roomGroup);

        // --- SETUP HUD ---
        createHUD();

        window.addEventListener('resize', onWindowResize);
    } catch (e) {
        console.error(e);
    }
}

function createHUD() {
    hudGroup = new THREE.Group();
    scene.add(hudGroup);

    // 1. Status Text
    statusMesh = createTextLabel("Ready - Press 'B' for Menu", 40, null, '#00ff00');
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
    const canvasHeight = totalContentHeight;

    const planeWidth = 0.6;
    const planeHeight = planeWidth * (canvasHeight / canvasWidth);

    const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
    const material = new THREE.MeshBasicMaterial({
        transparent: true, opacity: 0.95, depthTest: false
    });

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
        transparent: true, opacity: 0.90, depthTest: false
    });
    controlsMesh = new THREE.Mesh(geometry, material);
    controlsMesh.position.set(-0.7, 0, -1.8);
    controlsMesh.rotation.y = 0.2;
    controlsMesh.visible = false;
    hudGroup.add(controlsMesh);
    redrawControlsCanvas();
}

function redrawControlsCanvas() {
    const width = 512; const height = 750;
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = 'rgba(10, 10, 10, 0.85)';
    ctx.beginPath(); ctx.roundRect(10, 10, width - 20, height - 20, 30); ctx.fill();
    ctx.strokeStyle = '#4a90e2'; ctx.lineWidth = 4; ctx.stroke();

    ctx.font = 'bold 50px Arial'; ctx.fillStyle = '#4a90e2'; ctx.textAlign = 'center';
    ctx.fillText("Controls", width / 2, 70);
    ctx.strokeStyle = '#555'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(40, 90); ctx.lineTo(width - 40, 90); ctx.stroke();

    const lines = [
        { label: "Trigger (Click)", val: "Spawn Model" },
        { label: "Hold Button A", val: "Drag Model" },
        { label: "Left Stick ↕", val: "Lift / Lower" },
        { label: "Right Stick ↔", val: "Rotate" },
        { label: "Right Stick ↕", val: "Scale Size" },
        { label: "Button B", val: "Close Menu" }
    ];

    ctx.textAlign = 'left';
    let y = 140;
    lines.forEach(line => {
        ctx.font = 'bold 32px Arial'; ctx.fillStyle = '#ffcc00'; ctx.fillText(line.label, 40, y);
        y += 40;
        ctx.font = '28px Arial'; ctx.fillStyle = '#ffffff'; ctx.fillText(line.val, 60, y);
        y += 45;
    });

    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    controlsMesh.material.map = tex;
    controlsMesh.material.needsUpdate = true;
}

function redrawMenuCanvas() {
    const width = menuMesh.userData.canvasWidth;
    const height = menuMesh.userData.canvasHeight;
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = 'rgba(20, 20, 20, 0.9)';
    ctx.beginPath(); ctx.roundRect(10, 10, width - 20, height - 20, 30); ctx.fill();
    ctx.strokeStyle = 'white'; ctx.lineWidth = 4; ctx.stroke();

    ctx.font = 'bold 50px Arial'; ctx.fillStyle = 'white'; ctx.textAlign = 'center';
    ctx.fillText("Library", width / 2, 70);

    ctx.strokeStyle = '#555'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(40, 90); ctx.lineTo(width - 40, 90); ctx.stroke();

    const startY = 150; const itemHeight = 60;
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
        }

        if (i === selectedIndex) {
            ctx.fillStyle = '#4a90e2';
            ctx.beginPath(); ctx.roundRect(40, yPos - 35, width - 80, 50, 10); ctx.fill();
            ctx.fillStyle = 'white'; ctx.font = 'bold 35px Arial';
        } else {
            ctx.fillStyle = textColor; ctx.font = '35px Arial';
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
    if (statusMesh.material.map) statusMesh.material.map.dispose();
    statusMesh.material.map = createTexture(text, 40, null, color);
    statusMesh.material.needsUpdate = true;
}

function updateLoadingBar(percent) {
    loadingGroup.visible = true;
    loadingFill.scale.x = Math.min(Math.max(percent, 0.01), 1);
    updateStatusText(`Loading: ${(percent * 100).toFixed(0)}%`);
}

function createTexture(text, fontSize, bgColor, textColor) {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 128;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, 512, 128);
    if (bgColor) { ctx.fillStyle = bgColor; ctx.fillRect(0, 0, 512, 128); }

    ctx.font = `Bold ${fontSize}px Arial`; ctx.fillStyle = textColor || 'white';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = "black"; ctx.shadowBlur = 4; ctx.shadowOffsetX = 2; ctx.shadowOffsetY = 2;
    ctx.fillText(text, 256, 64);
    return new THREE.CanvasTexture(canvas);
}

function createTextLabel(text, fontSize, bgColor, textColor) {
    const texture = createTexture(text, fontSize, bgColor, textColor);
    const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide });
    return new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.1), mat);
}

// --- LOGIC ---

function onSelect() {
    if (!isMenuOpen && !isLoading && reticle.visible && modelName && !isDragging) {
        loadModel(modelName, reticle.matrix);
    }
}

function loadModel(name, positionMatrix) {
    if (!name || isLoading) return;
    isLoading = true;
    updateLoadingBar(0.01);
    if (currentModel) { scene.remove(currentModel); currentModel = null; }

    const selectedModel = models.find(m => m.name === name);
    if (!selectedModel) {
        console.error("Model not found in config:", name);
        isLoading = false;
        return;
    }
    const assetPath = selectedModel.path;

    const onProgress = (xhr) => { if (xhr.lengthComputable) updateLoadingBar(xhr.loaded / xhr.total); };
    const onError = (e) => {
        isLoading = false; loadingGroup.visible = false;
        console.error(e); updateStatusText("Load Error", true);
    };
    const onLoad = (obj) => {
        currentModel = obj;
        currentModel.position.setFromMatrixPosition(positionMatrix);
        const box = new THREE.Box3().setFromObject(currentModel);
        const size = box.getSize(new THREE.Vector3()).length();
        const scalar = size > 0 ? (10.0 / size) : 1;
        currentModel.scale.set(scalar, scalar, scalar);

        // Shadow Casting for Models
        currentModel.traverse((node) => {
            if (node.isMesh) {
                node.castShadow = true;
                node.receiveShadow = true;
            }
        });

        scene.add(currentModel);

        isLoading = false;
        isMenuOpen = false;
        menuMesh.visible = false;
        controlsMesh.visible = false;
        loadingGroup.visible = false;

        scoreValue += 10; updateStatusText(`Loaded! Score: ${scoreValue}`);
    };

    const ext = assetPath.split('.').pop().toLowerCase();
    if (ext === 'glb' || ext === 'gltf') {
        new GLTFLoader().load(assetPath, (g) => onLoad(g.scene), onProgress, onError);
    } else if (ext === 'obj') {
        // Assume MTL is same base name if Obj, but current config only has GLBs. 
        // Keeping basic logic if needed or just error.
        // For now, assuming GLB primarily as per task.
        new OBJLoader().load(assetPath, (o) => {
            o.traverse(c => { if (c.isMesh) c.material = new THREE.MeshStandardMaterial({ color: 0xffffff }) });
            onLoad(o);
        }, onProgress, onError);
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    renderer.setAnimationLoop(render);
}

// --- RENDER & MESH HANDLING ---

function render(timestamp, frame) {
    if (frame) {
        if (hudGroup) {
            hudGroup.position.lerp(camera.position, 0.1);
            hudGroup.quaternion.slerp(camera.quaternion, 0.1);
        }

        if (!frame.detectedMeshes && isMeshAvailable) {
        } else if (frame.detectedMeshes) {
            isMeshAvailable = true;
            for (const [xrMesh, threeGroup] of roomMeshes) {
                if (!frame.detectedMeshes.has(xrMesh)) {
                    roomGroup.remove(threeGroup);
                    // Dispose geometry and materials
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
                    meshOcclusion.renderOrder = -2; // Render FIRST
                    threeGroup.add(meshOcclusion);

                    // 2. Shadow Mesh
                    meshShadow = new THREE.Mesh(geometry, matShadow);
                    meshShadow.receiveShadow = true;
                    meshShadow.renderOrder = -1; // Render SECOND
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

                // --- VISIBILITY LOGIC ---
                if (meshMode === 2) {
                    // OFF
                    threeGroup.visible = false;
                } else {
                    threeGroup.visible = true;
                    if (meshMode === 0) {
                        // MODE: OCCLUSION + SHADOW
                        meshOcclusion.visible = true;
                        meshShadow.visible = true;
                        meshWireframe.visible = false;
                    } else if (meshMode === 1) {
                        // MODE: WIREFRAME
                        meshOcclusion.visible = false;
                        meshShadow.visible = false;
                        meshWireframe.visible = true;
                    }
                }

                // Update shared geometry
                const geometry = meshOcclusion.geometry;
                geometry.setAttribute('position', new THREE.BufferAttribute(xrMesh.vertices, 3));
                geometry.setIndex(new THREE.BufferAttribute(xrMesh.indices, 1));

                // CRITICAL: Compute Normals for Shadows
                geometry.computeVertexNormals();

                const pose = frame.getPose(xrMesh.meshSpace, renderer.xr.getReferenceSpace());
                if (pose) {
                    threeGroup.matrix.fromArray(pose.transform.matrix);
                    threeGroup.matrix.decompose(threeGroup.position, threeGroup.quaternion, threeGroup.scale);
                }
            }
        } else {
            if (isMeshAvailable) { isMeshAvailable = false; redrawMenuCanvas(); }
        }

        const session = renderer.xr.getSession();
        for (const source of session.inputSources) {
            if (source.gamepad) handleInput(source);
        }

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
                    }
                } else reticle.visible = false;
            }
        } else reticle.visible = false;
    }
    renderer.render(scene, camera);
}

function handleInput(source) {
    if (isLoading) return;
    const gp = source.gamepad;
    const hand = source.handedness;
    const now = Date.now();

    // MENU TOGGLE
    const bPressed = (gp.buttons.length > 5 && gp.buttons[5].pressed);
    if (bPressed && !lastButtonState[hand + 'B']) {
        isMenuOpen = !isMenuOpen;

        menuMesh.visible = isMenuOpen;
        controlsMesh.visible = isMenuOpen;

        updateStatusText(isMenuOpen ? "Menu Open" : "Menu Closed");
    }
    lastButtonState[hand + 'B'] = bPressed;

    if (isMenuOpen) {
        // MENU NAV
        const dy = gp.axes[3];
        if (Math.abs(dy) > 0.6 && now - lastScrollTime > 300) {
            selectedIndex = (dy > 0) ? selectedIndex + 1 : selectedIndex - 1;
            if (selectedIndex < 0) selectedIndex = menuItems.length - 1;
            if (selectedIndex >= menuItems.length) selectedIndex = 0;
            redrawMenuCanvas();
            lastScrollTime = now;
        }

        // MENU SELECT
        const aPressed = (gp.buttons.length > 4 && gp.buttons[4].pressed);
        if (aPressed && !lastButtonState[hand + 'A']) {
            if (selectedIndex === 0) {
                // TOGGLE MODE (0 -> 1 -> 2 -> 0)
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
                // LOAD MODEL
                modelName = menuItems[selectedIndex];
                updateStatusText(`Selected: ${modelName}`);
                setTimeout(() => {
                    isMenuOpen = false;
                    menuMesh.visible = false;
                    controlsMesh.visible = false;
                }, 200);
            }
        }
        lastButtonState[hand + 'A'] = aPressed;
    } else {
        // MODEL CONTROLS
        isDragging = (gp.buttons.length > 4 && gp.buttons[4].pressed);
        if (currentModel && gp.axes.length >= 4) {
            const dx = gp.axes[2];
            const dy = gp.axes[3];
            if (hand === 'left' && Math.abs(dy) > 0.1) currentModel.position.y -= dy * 0.02;
            if (hand === 'right') {
                if (Math.abs(dx) > 0.1) currentModel.rotation.y -= dx * 0.05;
                if (Math.abs(dy) > 0.1 && isScalingEnabled) {
                    const s = 1 - (dy * 0.02);
                    currentModel.scale.multiplyScalar(s).clampScalar(0.01, 50);
                    // Update Status to show Scale
                    const scaleVal = currentModel.scale.x.toFixed(2);
                    updateStatusText(`Scale: ${scaleVal}x`);
                }
            }
        }
    }
}