import * as THREE from 'three';
import { ARButton } from 'three/addons/webxr/ARButton.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// IMPORT YOUR CONFIG FILE
import { modelList } from './config.js';

// --- GLOBALS ---
let camera, scene, renderer;
let controller1, controller2;
let reticle;
let currentModel = null;
let modelName = null;

// UI Groups (HUD)
let hudGroup;       
let statusMesh;     
let loadingGroup;   
let loadingFill;
let menuMesh; // Single 2D Plane for the menu

// Menu State
let isMenuOpen = false; 
let isDragging = false; 
let isLoading = false;
let selectedIndex = 0;
let scoreValue = 0;

// Timing
let lastScrollTime = 0; 
let lastButtonState = {}; 

init();
animate();

function init() {
    try {
        const container = document.getElementById('ar-button-container');
        if (!container) throw new Error("Missing #ar-button-container");

        scene = new THREE.Scene();
        camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);

        // Lights
        const dirLight = new THREE.DirectionalLight(0xffffff, 3);
        dirLight.position.set(0, 5, 2);
        scene.add(dirLight);
        scene.add(new THREE.AmbientLight(0xffffff, 0.5));

        // Renderer
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.xr.enabled = true;
        renderer.xr.setReferenceSpaceType('local-floor');
        document.body.appendChild(renderer.domElement);

        // AR Button
        const arBtn = ARButton.createButton(renderer, { 
            requiredFeatures: ['hit-test', 'local-floor'], 
            optionalFeatures: ['bounded-floor']
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

        const factory = new XRControllerModelFactory();
        const grip1 = renderer.xr.getControllerGrip(0);
        grip1.add(factory.createControllerModel(grip1));
        scene.add(grip1);
        const grip2 = renderer.xr.getControllerGrip(1);
        grip2.add(factory.createControllerModel(grip2));
        scene.add(grip2);

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

        // --- SETUP HUD ---
        createHUD();

        window.addEventListener('resize', onWindowResize);
    } catch (e) {
        console.error(e);
        document.body.innerHTML += `<div style="color:red; background:black; padding:20px;">${e.message}</div>`;
    }
}

function createHUD() {
    hudGroup = new THREE.Group();
    scene.add(hudGroup);

    // 1. STATUS TEXT (Top Left)
    statusMesh = createTextLabel("Ready - Press 'B' for Menu", 40, '#000000', '#00ff00');
    statusMesh.position.set(-0.4, 0.3, -1.0);
    hudGroup.add(statusMesh);

    // 2. LOADING BAR (Center, Hidden)
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

    // 3. MAIN MENU (2D Plane)
    createMenuMesh();
}

function createMenuMesh() {
    // Initial creation of the menu mesh using a placeholder texture
    // We will redraw the texture whenever the user interacts
    const geometry = new THREE.PlaneGeometry(0.6, 0.6); // Square-ish menu
    const material = new THREE.MeshBasicMaterial({ 
        transparent: true,
        opacity: 0.95,
        depthTest: false // Ensures it renders on top of models if they clip
    });
    
    menuMesh = new THREE.Mesh(geometry, material);
    menuMesh.position.set(0, 0, -0.8); // Directly in front
    menuMesh.visible = false;
    hudGroup.add(menuMesh);

    // Render initial state
    redrawMenuCanvas();
}

function redrawMenuCanvas() {
    const width = 512;
    const height = 512;
    
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    // 1. Background (Rounded corners effect)
    ctx.fillStyle = 'rgba(20, 20, 20, 0.9)';
    ctx.roundRect(10, 10, width - 20, height - 20, 30);
    ctx.fill();
    
    // Border
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 4;
    ctx.stroke();

    // 2. Header
    ctx.font = 'bold 50px Arial';
    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';
    ctx.fillText("Model Library", width / 2, 70);

    // Line separator
    ctx.beginPath();
    ctx.moveTo(30, 90);
    ctx.lineTo(width - 30, 90);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#555';
    ctx.stroke();

    // 3. List Items
    const startY = 150;
    const itemHeight = 60;
    
    modelList.forEach((name, i) => {
        const yPos = startY + (i * itemHeight);

        // Highlight Box
        if (i === selectedIndex) {
            ctx.fillStyle = '#4a90e2'; // Active Blue
            ctx.roundRect(40, yPos - 35, width - 80, 50, 10);
            ctx.fill();
            
            ctx.fillStyle = 'white'; // Active Text
            ctx.font = 'bold 35px Arial';
        } else {
            ctx.fillStyle = '#aaaaaa'; // Inactive Text
            ctx.font = '35px Arial';
        }

        ctx.fillText(name, width / 2, yPos);
    });

    // 4. Update Texture
    if (menuMesh.material.map) menuMesh.material.map.dispose();
    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter; // Smooth text
    menuMesh.material.map = tex;
    menuMesh.material.needsUpdate = true;
}

// --- VISUAL UTILS ---

function updateStatusText(text, isError = false) {
    const color = isError ? '#ff0000' : '#00ff00';
    console.log(`[Status]: ${text}`);
    if(statusMesh.material.map) statusMesh.material.map.dispose();
    statusMesh.material.map = createTexture(text, 40, '#000000', color);
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
    if (bgColor) {
        ctx.fillStyle = bgColor;
        ctx.fillRect(0,0, 512, 128);
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 5; ctx.strokeRect(0,0, 512, 128);
    }
    ctx.font = `Bold ${fontSize}px Arial`;
    ctx.fillStyle = textColor || 'white';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
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

    if(currentModel) { scene.remove(currentModel); currentModel = null; }

    const assetPath = `assets/${name}`;
    const onProgress = (xhr) => {
        if (xhr.lengthComputable) updateLoadingBar(xhr.loaded / xhr.total);
    };
    const onError = (e) => {
        isLoading = false;
        loadingGroup.visible = false;
        console.error(e);
        updateStatusText("Load Error: Check File", true);
    };
    const onLoad = (obj) => {
        currentModel = obj;
        currentModel.position.setFromMatrixPosition(positionMatrix);
        const box = new THREE.Box3().setFromObject(currentModel);
        const size = box.getSize(new THREE.Vector3()).length();
        const scalar = size > 0 ? (0.5 / size) : 1;
        currentModel.scale.set(scalar, scalar, scalar);
        scene.add(currentModel);
        
        isLoading = false;
        isMenuOpen = false; 
        menuMesh.visible = false;
        loadingGroup.visible = false;
        scoreValue += 10;
        updateStatusText(`Loaded! Score: ${scoreValue}`);
    };

    const ext = name.split('.').pop().toLowerCase();
    if(ext === 'glb' || ext === 'gltf') {
        new GLTFLoader().load(assetPath, (g) => onLoad(g.scene), onProgress, onError);
    } else if (ext === 'obj') {
        const mtl = name.replace('.obj', '.mtl');
        new MTLLoader().load(`assets/${mtl}`, 
            (m) => { 
                m.preload(); 
                new OBJLoader().setMaterials(m).load(assetPath, onLoad, onProgress, onError);
            },
            () => {}, 
            () => {
                new OBJLoader().load(assetPath, (o) => {
                    o.traverse(c=>{if(c.isMesh)c.material=new THREE.MeshStandardMaterial({color:0xffffff})});
                    onLoad(o);
                }, onProgress, onError);
            }
        );
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

function render(timestamp, frame) {
    if (frame) {
        const session = renderer.xr.getSession();
        
        // HUD LERP (Smooth Follow)
        if (hudGroup) {
            const targetPos = camera.position.clone();
            const targetQuat = camera.quaternion.clone();
            hudGroup.position.lerp(targetPos, 0.1);
            hudGroup.quaternion.slerp(targetQuat, 0.1);
        }

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
                    
                    // Reticle Drag Logic
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

    // TOGGLE MENU (Button B/Y)
    const bPressed = (gp.buttons.length > 5 && gp.buttons[5].pressed);
    if (bPressed && !lastButtonState[hand + 'B']) {
        isMenuOpen = !isMenuOpen;
        menuMesh.visible = isMenuOpen;
        updateStatusText(isMenuOpen ? "Menu Open" : "Menu Closed");
    }
    lastButtonState[hand + 'B'] = bPressed;

    if (isMenuOpen) {
        // --- MENU NAVIGATION ---
        const dy = gp.axes[3];
        
        // Scroll with delay
        if (Math.abs(dy) > 0.6 && now - lastScrollTime > 300) { 
            if (dy > 0) selectedIndex++; else selectedIndex--;
            
            // Loop navigation
            if (selectedIndex < 0) selectedIndex = modelList.length - 1;
            if (selectedIndex >= modelList.length) selectedIndex = 0;
            
            // Redraw 2D Canvas
            redrawMenuCanvas();
            lastScrollTime = now; 
        }

        // Select (Button A/X)
        const aPressed = (gp.buttons.length > 4 && gp.buttons[4].pressed);
        if (aPressed && !lastButtonState[hand + 'A']) {
            modelName = modelList[selectedIndex];
            updateStatusText(`Selected: ${modelName}`);
            
            // Close menu after slight delay
            setTimeout(() => { 
                isMenuOpen = false; 
                menuMesh.visible = false; 
            }, 200);
        }
        lastButtonState[hand + 'A'] = aPressed;

    } else {
        // --- MODEL MANIPULATION ---
        isDragging = (gp.buttons.length > 4 && gp.buttons[4].pressed);
        
        if (currentModel && gp.axes.length >= 4) {
            const dx = gp.axes[2]; 
            const dy = gp.axes[3];
            
            // LEFT HAND: Height (Up/Down)
            if (hand === 'left') {
                if (Math.abs(dy) > 0.1) currentModel.position.y -= dy * 0.02;
            }
            
            // RIGHT HAND: Rotation & Scale
            if (hand === 'right') {
                // Stick Left/Right -> Rotate
                if (Math.abs(dx) > 0.1) currentModel.rotation.y -= dx * 0.05;
                // Stick Up/Down -> Scale
                if (Math.abs(dy) > 0.1) {
                    const s = 1 - (dy * 0.02);
                    currentModel.scale.multiplyScalar(s).clampScalar(0.1, 5);
                }
            }
        }
    }
}