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
let controllerGrip1, controllerGrip2;

let reticle;
let currentModel = null;
let modelName = null;

let hitTestSource = null;
let hitTestSourceRequested = false;
let directionalLight;

// State
let isDragging = false; // Now controlled by 'A' button

// UI Elements
const debugOutput = document.getElementById('console-output');
const loaderUI = document.getElementById('loader');
const loadingText = document.getElementById('loading-text');

init();
animate();

function log(msg) {
    const time = new Date().toLocaleTimeString();
    if(debugOutput) {
        debugOutput.innerText = `[${time}] ${msg}\n` + debugOutput.innerText;
    }
    console.log(msg);
}

function init() {
    // 1. Scene
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);

    // 2. Lighting
    directionalLight = new THREE.DirectionalLight(0xffffff, 4);
    directionalLight.position.set(0, 5, 5);
    scene.add(directionalLight);
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));

    // 3. Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    
    // Append Renderer
    document.body.appendChild(renderer.domElement);

    // 4. Environment
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;

    // 5. AR Button
    const overlay = document.getElementById('overlay');
    const arBtn = ARButton.createButton(renderer, { 
        requiredFeatures: ['hit-test'], 
        optionalFeatures: ['dom-overlay'], 
        domOverlay: { root: overlay } 
    });
    document.body.appendChild(arBtn);

    // 6. Controllers
    controller1 = renderer.xr.getController(0);
    controller1.addEventListener('select', onSelect); 
    scene.add(controller1);

    controller2 = renderer.xr.getController(1);
    controller2.addEventListener('select', onSelect);
    scene.add(controller2);

    const controllerModelFactory = new XRControllerModelFactory();
    
    controllerGrip1 = renderer.xr.getControllerGrip(0);
    controllerGrip1.add(controllerModelFactory.createControllerModel(controllerGrip1));
    scene.add(controllerGrip1);

    controllerGrip2 = renderer.xr.getControllerGrip(1);
    controllerGrip2.add(controllerModelFactory.createControllerModel(controllerGrip2));
    scene.add(controllerGrip2);

    // 7. Reticle
    reticle = new THREE.Mesh(
        new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial()
    );
    reticle.matrixAutoUpdate = false;
    reticle.visible = false;
    scene.add(reticle);

    setupUI();
    window.addEventListener('resize', onWindowResize);
    log("Ready. Hold 'A' or 'X' button to Drag.");
}

function setupUI() {
    const listContainer = document.getElementById('asset-list');
    listContainer.innerHTML = ''; 

    if (!modelList || modelList.length === 0) {
        log("No models in config.js");
        return;
    }

    modelList.forEach((name) => {
        const btn = document.createElement('button');
        btn.className = 'asset-btn';
        btn.innerText = name;
        btn.addEventListener('click', () => {
            document.querySelectorAll('.asset-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            modelName = name;
            log(`Selected: ${modelName}`);
        });
        listContainer.appendChild(btn);
    });
}

function onProgress(xhr) {
    if (xhr.lengthComputable) {
        const percent = Math.round((xhr.loaded / xhr.total) * 100);
        loadingText.innerText = `Loading ${percent}%`;
    }
}

function showLoader(visible) {
    if(visible) loaderUI.classList.remove('hidden');
    else loaderUI.classList.add('hidden');
}

function normalizeAndCenter(object) {
    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3()).length();
    const scalar = 0.5 / size; 
    object.scale.set(scalar, scalar, scalar);
}

function loadModel(name, positionMatrix) {
    if (!name) return;

    if(currentModel) {
        scene.remove(currentModel);
        currentModel = null;
    }

    log(`Downloading ${name}...`);
    showLoader(true);
    
    const extension = name.split('.').pop().toLowerCase();

    if (extension === 'glb' || extension === 'gltf') {
        const loader = new GLTFLoader();
        loader.load(`assets/${name}`, (gltf) => {
            currentModel = gltf.scene;
            currentModel.position.setFromMatrixPosition(positionMatrix);
            normalizeAndCenter(currentModel);
            scene.add(currentModel);
            directionalLight.target = currentModel;
            showLoader(false);
            log("Loaded.");
        }, onProgress, (err) => { showLoader(false); log("Error: " + err.message); });

    } else if (extension === 'obj') {
        const mtlFileName = name.replace('.obj', '.mtl');
        const mtlLoader = new MTLLoader();
        mtlLoader.load(`assets/${mtlFileName}`, 
            (materials) => {
                materials.preload();
                loadObjFile(name, materials, positionMatrix);
            }, 
            undefined, 
            () => {
                loadObjFile(name, null, positionMatrix);
            }
        );
    }
}

function loadObjFile(filename, materials, positionMatrix) {
    const objLoader = new OBJLoader();
    if (materials) objLoader.setMaterials(materials);

    objLoader.load(`assets/${filename}`, (object) => {
        currentModel = object;
        currentModel.position.setFromMatrixPosition(positionMatrix);
        
        if (!materials) {
            const defaultMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.2 });
            object.traverse((child) => { if (child.isMesh) child.material = defaultMat; });
        }

        normalizeAndCenter(currentModel);
        scene.add(currentModel);
        directionalLight.target = currentModel;
        showLoader(false);
        log("OBJ Loaded.");
    }, onProgress, (err) => { showLoader(false); log("Error: " + err.message); });
}

// --- TRIGGER EVENT (Spawn only) ---
function onSelect() {
    // Prevent spawn if we are currently dragging
    if (reticle.visible && modelName && !isDragging) {
        loadModel(modelName, reticle.matrix);
        log("Spawned model.");
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
        const referenceSpace = renderer.xr.getReferenceSpace();
        const session = renderer.xr.getSession();

        // 1. Check Input Sources for "A" Button
        isDragging = false; 
        
        for (const source of session.inputSources) {
            if (source.gamepad) {
                // Button 4 is usually 'A' on Right or 'X' on Left
                if (source.gamepad.buttons.length > 4 && source.gamepad.buttons[4].pressed) {
                    isDragging = true;
                }
                
                // Also handle Joystick Logic inside this loop
                handleJoystick(source);
            }
        }

        // 2. Hit Test
        if (hitTestSourceRequested === false) {
            session.requestReferenceSpace('viewer').then((refSpace) => {
                session.requestHitTestSource({ space: refSpace }).then((source) => {
                    hitTestSource = source;
                });
            });
            session.addEventListener('end', () => { hitTestSourceRequested = false; hitTestSource = null; });
            hitTestSourceRequested = true;
        }

        if (hitTestSource) {
            const hitTestResults = frame.getHitTestResults(hitTestSource);
            if (hitTestResults.length > 0) {
                const hit = hitTestResults[0];
                reticle.visible = true;
                reticle.matrix.fromArray(hit.getPose(referenceSpace).transform.matrix);
                
                // 3. DRAG LOGIC
                // If "A" is held, slide model to reticle X/Z
                if (isDragging && currentModel) {
                    const hitPos = new THREE.Vector3();
                    hitPos.setFromMatrixPosition(reticle.matrix);
                    
                    // Smooth lerp for visual effect
                    currentModel.position.x = THREE.MathUtils.lerp(currentModel.position.x, hitPos.x, 0.2);
                    currentModel.position.z = THREE.MathUtils.lerp(currentModel.position.z, hitPos.z, 0.2);
                    // Y stays controlled by joystick
                }

            } else {
                reticle.visible = false;
            }
        }
    }
    renderer.render(scene, camera);
}

// Separate function for readability
function handleJoystick(inputSource) {
    if (!currentModel) return;

    const gp = inputSource.gamepad;
    
    // Axes: [2]=Left/Right, [3]=Up/Down
    if (gp.axes.length >= 4) {
        const dx = gp.axes[2]; 
        const dy = gp.axes[3]; 

        // LEFT HAND: Vertical Lift
        if (inputSource.handedness === 'left') {
            if (Math.abs(dy) > 0.1) {
                currentModel.position.y -= dy * 0.02; 
            }
        }
        
        // RIGHT HAND: Rotate & Scale
        if (inputSource.handedness === 'right') {
            // Rotate (Left/Right)
            if (Math.abs(dx) > 0.1) {
                currentModel.rotation.y -= dx * 0.05;
            }
            // Scale (Up/Down)
            if (Math.abs(dy) > 0.1) {
                const scaleFactor = 1 - (dy * 0.02);
                currentModel.scale.multiplyScalar(scaleFactor);
                currentModel.scale.clampScalar(0.05, 5.0); 
            }
        }
    }
}