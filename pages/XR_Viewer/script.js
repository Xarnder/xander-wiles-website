import * as THREE from 'three';
import { ARButton } from 'three/addons/webxr/ARButton.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

import { modelList } from './config.js';

// --- GLOBALS ---
let camera, scene, renderer;
let controller1, controller2;
let reticle;
let currentModel = null;
let modelName = null;

// UI Groups
let hudGroup;       
let menuGroup;      
let scoreMesh;      

// State
let uiButtons = []; 
let isMenuOpen = false; 
let isDragging = false; 
let selectedIndex = 0;
let scoreValue = 0;

// Timing Variables
let lastScrollTime = 0; // Tracks joystick scrolling
let lastButtonState = {}; // Tracks button presses

// Materials
const matNormal = new THREE.MeshBasicMaterial({ color: 0x444444 });
const matHighlight = new THREE.MeshBasicMaterial({ color: 0x00ff00 }); 
const matSelected = new THREE.MeshBasicMaterial({ color: 0x4a90e2 }); 

init();
animate();

function init() {
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
    const container = document.getElementById('ar-button-container');
    const arBtn = ARButton.createButton(renderer, { 
        requiredFeatures: ['hit-test', 'local-floor'], 
        optionalFeatures: ['bounded-floor']
    });
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
}

function createHUD() {
    // 1. Master Group (Locks to camera)
    hudGroup = new THREE.Group();
    scene.add(hudGroup);

    // 2. SCORE DISPLAY (Always On)
    // Position: Top Left (-0.5, 0.4, -1.0)
    scoreMesh = createTextLabel("Score: 0", 40, '#000000', '#00ff00');
    scoreMesh.position.set(-0.4, 0.3, -1.0);
    hudGroup.add(scoreMesh);

    // 3. MENU (Hidden by default)
    createMenuContent();
}

function createMenuContent() {
    menuGroup = new THREE.Group();
    // Position: Center, slightly down
    menuGroup.position.set(0, -0.1, -0.8); 
    menuGroup.visible = false; // Start hidden
    hudGroup.add(menuGroup);

    // Background
    const menuHeight = 0.2 + (modelList.length * 0.12);
    const bg = new THREE.Mesh(
        new THREE.PlaneGeometry(0.5, menuHeight),
        new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.8 })
    );
    bg.position.y = - (menuHeight / 2) + 0.15;
    menuGroup.add(bg);

    // Title
    const title = createTextLabel("Library", 50);
    title.position.set(0, 0.15, 0.01);
    menuGroup.add(title);

    // Buttons
    modelList.forEach((name, index) => {
        const btn = new THREE.Mesh(
            new THREE.BoxGeometry(0.4, 0.1, 0.02), 
            matNormal.clone()
        );
        btn.userData = { modelName: name };
        btn.position.set(0, - (index * 0.12), 0.02);
        
        const label = createTextLabel(name, 35);
        label.position.set(0, 0, 0.02);
        btn.add(label);

        menuGroup.add(btn);
        uiButtons.push(btn);
    });

    highlightButton(0);
}

// --- UTILS ---

function updateScore(points) {
    scoreValue += points;
    // Redraw the canvas texture to update text
    const newTexture = createTexture("Score: " + scoreValue, 40, '#000000', '#00ff00');
    scoreMesh.material.map = newTexture;
    scoreMesh.material.needsUpdate = true;
}

function highlightButton(index) {
    uiButtons.forEach((btn, i) => {
        if (i === index) btn.material.color.setHex(0x00ff00); // Green Highlight
        else btn.material.color.setHex(0x444444);
    });
}

function createTexture(text, fontSize, bgColor, textColor) {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    
    // Background
    if (bgColor) {
        ctx.fillStyle = bgColor;
        ctx.fillRect(0,0, 512, 128);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 5;
        ctx.strokeRect(0,0, 512, 128);
    } else {
        ctx.clearRect(0,0, 512, 128);
    }
    
    // Text
    ctx.font = `Bold ${fontSize}px Arial`;
    ctx.fillStyle = textColor || 'white';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 64);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    return texture;
}

function createTextLabel(text, fontSize, bgColor, textColor) {
    const texture = createTexture(text, fontSize, bgColor, textColor);
    const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide });
    return new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.1), mat);
}

// --- INTERACTION ---

function onSelect() {
    // Standard Trigger logic (only works if Menu is CLOSED)
    if (!isMenuOpen && reticle.visible && modelName && !isDragging) {
        loadModel(modelName, reticle.matrix);
        // Add 10 points to score when model placed
        updateScore(10);
    }
}

function loadModel(name, positionMatrix) {
    if (!name) return;
    if(currentModel) { scene.remove(currentModel); currentModel = null; }

    const ext = name.split('.').pop().toLowerCase();
    const onLoad = (obj) => {
        currentModel = obj;
        currentModel.position.setFromMatrixPosition(positionMatrix);
        const box = new THREE.Box3().setFromObject(currentModel);
        const size = box.getSize(new THREE.Vector3()).length();
        const scalar = 0.5 / size; 
        currentModel.scale.set(scalar, scalar, scalar);
        scene.add(currentModel);
        
        // Auto-Close menu on load
        isMenuOpen = false; 
        menuGroup.visible = false;
    };

    if(ext === 'glb' || ext === 'gltf') {
        new GLTFLoader().load(`assets/${name}`, (gltf) => onLoad(gltf.scene));
    } else if (ext === 'obj') {
        const mtl = name.replace('.obj', '.mtl');
        new MTLLoader().load(`assets/${mtl}`, 
            (m) => { m.preload(); new OBJLoader().setMaterials(m).load(`assets/${name}`, onLoad); },
            null,
            () => { new OBJLoader().load(`assets/${name}`, (o) => {
                o.traverse(c=>{if(c.isMesh)c.material=new THREE.MeshStandardMaterial({color:0xffffff})});
                onLoad(o);
            })}
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

        // 1. HUD LOCKING (Keep it on your face)
        if (hudGroup) {
            hudGroup.position.copy(camera.position);
            hudGroup.quaternion.copy(camera.quaternion);
        }

        // 2. INPUT HANDLING
        for (const source of session.inputSources) {
            if (source.gamepad) handleInput(source);
        }

        // 3. RETICLE & SCENE
        if (!isMenuOpen) {
            const refSpace = renderer.xr.getReferenceSpace();
            if (!renderer.xr.hitTestSource && !renderer.xr.hitTestSourceRequested) {
                session.requestReferenceSpace('viewer').then(ref => {
                    session.requestHitTestSource({ space: ref }).then(source => renderer.xr.hitTestSource = source);
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
    }
    renderer.render(scene, camera);
}

function handleInput(source) {
    const gp = source.gamepad;
    const hand = source.handedness;
    const now = Date.now(); // Use real clock time

    // Toggle Menu (Button B/Y)
    // Index 5 is B (Right) or Y (Left)
    const bPressed = (gp.buttons.length > 5 && gp.buttons[5].pressed);
    if (bPressed && !lastButtonState[hand + 'B']) {
        isMenuOpen = !isMenuOpen;
        menuGroup.visible = isMenuOpen;
    }
    lastButtonState[hand + 'B'] = bPressed;

    if (isMenuOpen) {
        // --- MENU NAVIGATION ---
        
        // Joystick Logic
        const dy = gp.axes[3];
        
        // CRITICAL FIX: We do NOT reset lastScrollTime if stick is neutral.
        // We only check if enough time has passed since the last move.
        // 400ms Delay enforced here.
        if (Math.abs(dy) > 0.6) {
            if (now - lastScrollTime > 400) { 
                if (dy > 0) selectedIndex++;
                else selectedIndex--;
                
                // Clamp Loop
                if (selectedIndex < 0) selectedIndex = 0;
                if (selectedIndex >= uiButtons.length) selectedIndex = uiButtons.length - 1;
                
                highlightButton(selectedIndex);
                lastScrollTime = now; // Update timer
            }
        }

        // Select (A/X)
        const aPressed = (gp.buttons.length > 4 && gp.buttons[4].pressed);
        if (aPressed && !lastButtonState[hand + 'A']) {
            const btn = uiButtons[selectedIndex];
            modelName = btn.userData.modelName;
            
            // Visual Flash
            btn.material.color.setHex(0xffffff);
            setTimeout(() => {
                isMenuOpen = false;
                menuGroup.visible = false;
            }, 200);
        }
        lastButtonState[hand + 'A'] = aPressed;

    } else {
        // --- SCENE MODE ---
        isDragging = false;
        if (gp.buttons.length > 4 && gp.buttons[4].pressed) isDragging = true;

        if (currentModel && gp.axes.length >= 4) {
            const dx = gp.axes[2]; const dy = gp.axes[3];
            if (hand === 'left' && Math.abs(dy) > 0.1) currentModel.position.y -= dy * 0.02;
            if (hand === 'right') {
                if (Math.abs(dx) > 0.1) currentModel.rotation.y -= dx * 0.05;
                if (Math.abs(dy) > 0.1) {
                    const s = 1 - (dy * 0.02);
                    currentModel.scale.multiplyScalar(s).clampScalar(0.1, 5);
                }
            }
        }
    }
}