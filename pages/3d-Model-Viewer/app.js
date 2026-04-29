import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';

// Post-Processing Imports
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { SSRPass } from 'three/addons/postprocessing/SSRPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { models } from '../../assets/models_config.js';

// --- Global Variables ---
let camera, scene, renderer, controls;
let composer; // EffectComposer
let renderPass, ssaoPass, gtaoPass, ssrPass, outputPass;
let loadedModels = []; // Array of { name, object }
let dirLight, ambientLight;
let transformControl;
let selectionHelper;
let outlineObjects = [];
let undoHistory = [];
const MAX_UNDO = 10;
let lastStateBeforeDrag = null;
const container = document.getElementById('canvas-container');

// --- Money Mode Globals ---
let moneyGroup, floorGrid;
let moneyLabels = []; // Array to track denomination tags
const loadedMoneyModels = new Map(); // cache for GLTFs
const moneyDenominations = [
    { value: 1000000000, path: '/assets/models/Money Models/9 One Billion Pounds.glb' },
    { value: 100000000, path: '/assets/models/Money Models/8 One Hundred Million Pounds.glb' },
    { value: 10000000, path: '/assets/models/Money Models/7 Ten Million Pounds.glb' },
    { value: 1000000, path: '/assets/models/Money Models/6 One Million Pounds.glb' },
    { value: 100000, path: '/assets/models/Money Models/5 One Hundred Thousand Pounds.glb' },
    { value: 10000, path: '/assets/models/Money Models/4 Ten Thousand Pounds.glb' },
    { value: 1000, path: '/assets/models/Money Models/3 One Thousand Pounds.glb' },
    { value: 100, path: '/assets/models/Money Models/2 One Hundred Pounds.glb' },
    { value: 20, path: '/assets/models/Money Models/1 Twenty Pounds.glb' }
];

// --- Interaction Globals ---
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let selectedLightHandle = null; // The mesh sphere we click on
const selectableObjects = []; // Array of light handles to raycast against


// --- Debug Helper ---
function logToScreen(message, type = 'info') {
    const consoleDiv = document.getElementById('console-output');
    if (consoleDiv) {
        const msgDiv = document.createElement('div');
        msgDiv.className = 'debug-entry';
        msgDiv.textContent = `> ${message}`;

        if (type === 'error') msgDiv.classList.add('debug-error');
        if (type === 'success') msgDiv.classList.add('debug-success');

        consoleDiv.prepend(msgDiv); // Newest at top
    }
    console.log(`[${type.toUpperCase()}] ${message}`);
}

// --- Initialization ---
function init() {
    try {
        logToScreen('Initializing 3D Engine...');

        // 1. Scene Setup
        scene = new THREE.Scene();
        scene.background = new THREE.Color('#1a1a1a');
        // Add some fog for depth integration
        scene.fog = new THREE.FogExp2(0x1a1a1a, 0.02);

        // Money Group
        moneyGroup = new THREE.Group();
        scene.add(moneyGroup);

        // Grid Helper
        floorGrid = new THREE.GridHelper(100, 100, 0x444444, 0x222222);
        floorGrid.visible = false;
        scene.add(floorGrid);

        // Physical Ground Plane
        const planeGeo = new THREE.PlaneGeometry(200, 200);
        const planeMat = new THREE.MeshStandardMaterial({ 
            color: 0x151515,
            roughness: 0.8,
            metalness: 0.1
        });
        const groundPlane = new THREE.Mesh(planeGeo, planeMat);
        groundPlane.rotation.x = -Math.PI / 2;
        groundPlane.position.y = -0.01; // Slightly below grid to avoid Z-fighting
        groundPlane.receiveShadow = true;
        scene.add(groundPlane);

        // 2. Camera Setup
        camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.set(2, 2, 5);

        // 3. Renderer Setup (Realistic settings)
        renderer = new THREE.WebGLRenderer({ 
            antialias: true, 
            alpha: true,
            preserveDrawingBuffer: true // Required for screenshots
        });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        container.appendChild(renderer.domElement);

        // 4. Controls (Orbit - works on Mouse & Touch)
        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true; // Smooth motion
        controls.dampingFactor = 0.05;
        controls.screenSpacePanning = true;

        // 4.5 Transform Controls
        transformControl = new TransformControls(camera, renderer.domElement);
        transformControl.addEventListener('dragging-changed', function (event) {
            controls.enabled = !event.value;

            if (event.value) {
                // Dragging started - record state
                if (transformControl.object) {
                    lastStateBeforeDrag = {
                        object: transformControl.object,
                        position: transformControl.object.position.clone(),
                        rotation: transformControl.object.rotation.clone(),
                        scale: transformControl.object.scale.clone()
                    };
                }
            } else {
                // Dragging ended - check for change
                if (lastStateBeforeDrag && lastStateBeforeDrag.object === transformControl.object) {
                    const obj = transformControl.object;
                    const posChanged = !obj.position.equals(lastStateBeforeDrag.position);
                    const rotChanged = !obj.rotation.equals(lastStateBeforeDrag.rotation);
                    const scaleChanged = !obj.scale.equals(lastStateBeforeDrag.scale);

                    if (posChanged || rotChanged || scaleChanged) {
                        undoHistory.push(lastStateBeforeDrag);
                        if (undoHistory.length > MAX_UNDO) undoHistory.shift();
                        updateUndoButtonVisibility();
                    }
                }
            }
        });
        transformControl.addEventListener('change', function () {
            // Sync light handles if a light is being transformed
            if (transformControl.object && transformControl.object.isLight) {
                const light = transformControl.object;
                const handle = selectableObjects.find(h => h.userData.light === light);
                if (handle) {
                    handle.position.copy(light.position);
                    handle.userData.helper.update();
                }
            }
        });
        scene.add(transformControl.getHelper());

        // 4.6 Selection Highlight
        selectionHelper = new THREE.BoxHelper(undefined, 0x00ff00);
        selectionHelper.visible = false;
        scene.add(selectionHelper);

        // 5. Lighting Setup
        setupLighting();

        // 6. Environment Map (HDRI for reflections)
        loadEnvironment();

        // 7. Post-Processing Setup
        setupPostProcessing();

        // 8. Event Listeners
        window.addEventListener('resize', onWindowResize);
        window.addEventListener('pointerdown', onPointerDown); // Selection
        window.addEventListener('keydown', onKeyDown); // Movement
        setupUI();
        
        // 9. Load Default Model
        setTimeout(() => {
            loadGLBFromUrl('/assets/models/Ford_Fiesta.glb', 'Ford Fiesta');
        }, 500);

        // Start Loop
        animate();
        logToScreen('Engine Ready.', 'success');

    } catch (e) {
        logToScreen(`Init Error: ${e.message}`, 'error');
        console.error(e);
    }
}

function setupLighting() {
    // Ambient Light (Base fill)
    ambientLight = new THREE.AmbientLight(0xffffff, 0);
    scene.add(ambientLight);

    // Directional Light (The Sun)
    dirLight = new THREE.DirectionalLight(0xffffff, 0);
    dirLight.position.set(5, 10, 7.5);
    dirLight.castShadow = true;

    // Optimize shadow map
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.1;
    dirLight.shadow.camera.far = 500;
    dirLight.shadow.bias = -0.0001;

    scene.add(dirLight);
}

function loadEnvironment() {
    // UPDATED: Using a stable direct link from Polyhaven
    const hdriUrl = 'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/royal_esplanade_1k.hdr';

    new RGBELoader()
        .load(hdriUrl, function (texture) {
            texture.mapping = THREE.EquirectangularReflectionMapping;
            scene.environment = texture;
            scene.environmentIntensity = 0.2; // Default to 0.2
            // scene.background = texture; // Uncomment if you want to see the background image
            logToScreen('Environment HDRI Loaded', 'success');
        }, undefined, function (err) {
            logToScreen('Failed to load HDRI: ' + err, 'error');
        });
}

function setupPostProcessing() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    composer = new EffectComposer(renderer);

    // 1. Render Pass (Base Scene)
    renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    // 2. SSAO Pass (Ambient Occlusion) - Disabled by default
    ssaoPass = new SSAOPass(scene, camera, width, height);
    ssaoPass.kernelRadius = 16; // Larger radius for softer shadows
    ssaoPass.minDistance = 0.005;
    ssaoPass.maxDistance = 0.1;
    ssaoPass.enabled = false;
    composer.addPass(ssaoPass);

    // 3. GTAO Pass (Cavity / Ground Truth AO) - Disabled by default
    gtaoPass = new GTAOPass(scene, camera, width, height);
    gtaoPass.output = GTAOPass.OUTPUT.Default;
    gtaoPass.enabled = true;
    composer.addPass(gtaoPass);

    // 4. SSR Pass (Screen Space Reflections / Ray Tracing approximation) - Disabled by default
    // Note: SSR is computationally expensive and complex
    ssrPass = new SSRPass({
        renderer,
        scene,
        camera,
        width,
        height,
        groundReflector: null,
        selects: null
    });
    ssrPass.thickness = 0.018;
    ssrPass.infiniteThick = false;
    ssrPass.maxDistance = 0.1;
    ssrPass.opacity = 0.5; // Reflection only?
    // Optimization: SSR renders the scene internally, so having it alongside other passes can be tricky.
    // Usually it sits near the end.
    ssrPass.enabled = false;
    composer.addPass(ssrPass);

    // 5. Output Pass (Tone Mapping & sRGB Correction)
    outputPass = new OutputPass();
    composer.addPass(outputPass);

    logToScreen('Post-Processing Initialized');
}

// --- Loading Logic ---

// Shared success handler
function onModelLoaded(gltf, name = 'Standard Model') {
    const loadingContainer = document.getElementById('loading-bar-container');
    const keepExisting = document.getElementById('keep-existing-check')?.checked || false;

    if (!keepExisting) {
        // Detach transform controls before removing objects
        if (transformControl.object) transformControl.detach();
        if (selectionHelper) selectionHelper.visible = false;

        // Clear previous models
        loadedModels.forEach(m => scene.remove(m.object));
        loadedModels = [];
    }

    const modelObj = gltf.scene;
    modelObj.name = name;

    // Enable shadows for meshes
    modelObj.traverse((node) => {
        if (node.isMesh) {
            node.castShadow = true;
            node.receiveShadow = true;
            
            if (!node.geometry.attributes.normal) {
                node.geometry.computeVertexNormals();
            }
        }
    });

    scene.add(modelObj);
    loadedModels.push({ name: name, object: modelObj });

    // Auto-center camera
    fitCameraToSelection(camera, controls, [modelObj]);

    // Measure model and place light above center
    const box = new THREE.Box3().setFromObject(modelObj);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const topY = box.max.y;
    const targetY = topY + (size.y / 2);
    const lightPos = new THREE.Vector3(center.x, targetY, center.z);
    addInteractableLight(lightPos);

    if (loadingContainer) loadingContainer.style.display = 'none';
    logToScreen(`Model '${name}' loaded successfully.`, 'success');

    updateSceneOutline();
}

// --- Light Retention Logic ---
function confirmLightRetention(callback) {
    const keepLights = document.getElementById('keep-existing-lights')?.checked || false;
    
    if (!keepLights && selectableObjects.length > 0) {
        clearUserLights();
    }
    
    callback();
}

function clearUserLights() {
    if (transformControl.object && selectableObjects.includes(transformControl.object)) {
        transformControl.detach();
    }
    if (selectionHelper) selectionHelper.visible = false;

    // Clone array to avoid modification issues during iteration
    const lightsToRemove = [...selectableObjects];
    lightsToRemove.forEach(handle => {
        const light = handle.userData.light;
        const helper = handle.userData.helper;

        scene.remove(light);
        scene.remove(helper);
        scene.remove(handle);
    });

    selectableObjects.length = 0; // Clear array
    selectedLightHandle = null;
    undoHistory = [];
    updateUndoButtonVisibility();
    updateSelectionUI();
    updateSceneOutline();
    logToScreen('All custom lights cleared.', 'info');
}

// --- Wireframe Visibility Logic ---
let helpersVisible = true;

function toggleHelpers() {
    helpersVisible = !helpersVisible;
    const btn = document.getElementById('toggle-helpers-btn');

    // Update Button Text
    btn.textContent = helpersVisible ? 'Hide Light Wireframes' : 'Show Light Wireframes';

    selectableObjects.forEach(handle => {
        const helper = handle.userData.helper;
        handle.visible = helpersVisible;
        helper.visible = helpersVisible;
    });

    // Also toggle selection if hidden
    if (!helpersVisible) {
        deselect();
    }

    logToScreen(`Light Wireframes ${helpersVisible ? 'Visible' : 'Hidden'}`, 'info');
}


// --- Updated Load Functions ---

function loadGLBFromUrl(url, name = 'Standard Model') {
    confirmLightRetention(() => {
        const loadingBar = document.getElementById('loading-bar');
        const loadingContainer = document.getElementById('loading-bar-container');
        loadingContainer.style.display = 'block';

        const loader = new GLTFLoader();

        loader.load(url, function (gltf) {
            try {
                onModelLoaded(gltf, name);
            } catch (error) {
                logToScreen('Model Setup Error: ' + error.message, 'error');
                loadingContainer.style.display = 'none';
            }
        }, function (xhr) {
            if (xhr.lengthComputable) {
                const progress = (xhr.loaded / xhr.total) * 100;
                loadingBar.style.width = progress + '%';
            }
        }, function (error) {
            logToScreen('Error loading model: ' + error.message, 'error');
            loadingContainer.style.display = 'none';
        });
    });
}


function loadGLB(file) {
    confirmLightRetention(() => {
        const reader = new FileReader();
        const loadingBar = document.getElementById('loading-bar');
        const loadingContainer = document.getElementById('loading-bar-container');

        loadingContainer.style.display = 'block';

        reader.onload = function (e) {
            const contents = e.target.result;
            const loader = new GLTFLoader();
            const name = file.name.replace('.glb', '').replace('.gltf', '');

            try {
                loader.parse(contents, '', function (gltf) {
                    onModelLoaded(gltf, name);
                }, function (err) {
                    logToScreen('Error parsing GLTF: ' + err, 'error');
                    loadingContainer.style.display = 'none';
                });
            } catch (error) {
                logToScreen('Loader Error: ' + error.message, 'error');
                loadingContainer.style.display = 'none';
            }
        };

        reader.onprogress = function (data) {
            if (data.lengthComputable) {
                const progress = (data.loaded / data.total) * 100;
                loadingBar.style.width = progress + '%';
            }
        };

        reader.readAsArrayBuffer(file);
    });
}

// --- Money Mode Logic ---
async function generateMoney(targetAmount) {
    confirmLightRetention(async () => {
        const keepExisting = document.getElementById('keep-existing-check')?.checked || false;

        // 1. Clear existing if needed
        if (!keepExisting) {
            // Detach transform controls before removing objects
            if (transformControl.object) transformControl.detach();
            if (selectionHelper) selectionHelper.visible = false;

            while (moneyGroup.children.length > 0) {
                moneyGroup.remove(moneyGroup.children[0]);
            }
            moneyLabels = [];
            
            loadedModels.forEach(m => scene.remove(m.object));
            loadedModels = [];
        }

        undoHistory = [];
        updateUndoButtonVisibility();
        
        logToScreen(`Generating cash for £${targetAmount.toLocaleString()}...`, 'info');

        // 2. Calculate and group denominations
        let remaining = targetAmount;
        const denomGroups = []; // Array of {denom, count}
        const requiredModels = []; // For pre-loading
        
        for (const denom of moneyDenominations) {
            if (remaining >= denom.value) {
                const count = Math.floor(remaining / denom.value);
                remaining -= count * denom.value;
                denomGroups.push({ denom, count });
                for (let i = 0; i < count; i++) {
                    requiredModels.push(denom);
                }
            }
        }
        
        if (requiredModels.length === 0) {
            logToScreen('Amount too small to generate with available models.', 'warning');
            return;
        }
        
        const loadingContainer = document.getElementById('loading-bar-container');
        loadingContainer.style.display = 'block';
        
        // 3. Load all required models concurrently
        const loader = new GLTFLoader();
        
        // Ensure all unique models are loaded into cache
        const uniquePaths = [...new Set(requiredModels.map(m => m.path))];
        const loadPromises = uniquePaths.map(path => {
            if (loadedMoneyModels.has(path)) {
                return Promise.resolve();
            }
            return new Promise((resolve, reject) => {
                loader.load(path, (gltf) => {
                    // Enable shadows
                    gltf.scene.traverse((node) => {
                        if (node.isMesh) {
                            node.castShadow = true;
                            node.receiveShadow = true;
                        }
                    });
                    loadedMoneyModels.set(path, gltf.scene);
                    resolve();
                }, undefined, reject);
            });
        });
        
        try {
            await Promise.all(loadPromises);
        } catch (e) {
            logToScreen(`Error loading money models: ${e.message}`, 'error');
            loadingContainer.style.display = 'none';
            return;
        }
        
        loadingContainer.style.display = 'none';
        
        // 4. Calculate total size and find empty space
        const stackSpacing = 0.05;
        const clusterSpacing = 0.125;
        
        let totalWidth = 0;
        let maxDepth = 0;
        const groupStats = [];

        for (const group of denomGroups) {
            const { denom, count } = group;
            const cachedScene = loadedMoneyModels.get(denom.path);
            const box = new THREE.Box3().setFromObject(cachedScene);
            const size = box.getSize(new THREE.Vector3());
            
            const cols = Math.ceil(Math.sqrt(count));
            const rows = Math.ceil(count / cols);
            const clusterWidth = cols * (size.x + stackSpacing);
            const clusterDepth = rows * (size.z + stackSpacing);

            groupStats.push({ denom, count, size, cols, clusterWidth, clusterDepth });
            totalWidth += clusterWidth + clusterSpacing;
            maxDepth = Math.max(maxDepth, clusterDepth);
        }

        const totalBoxSize = new THREE.Vector3(totalWidth, 1, maxDepth);
        const spawnPos = findEmptySpace(totalBoxSize);
        
        // 5. Instantiate and arrange
        let clusterOffsetX = spawnPos.x;

        for (const stats of groupStats) {
            const { denom, count, size, cols } = stats;
            const cachedScene = loadedMoneyModels.get(denom.path);

            // Add Label for this cluster
            const totalGroupValue = denom.value * count;
            const labelText = formatLargeCurrency(totalGroupValue);
            const labelPos = new THREE.Vector3(
                clusterOffsetX + (stats.clusterWidth / 2),
                0.1, // Near floor
                spawnPos.z + stats.clusterDepth + 0.3 // Just in front of the cluster
            );
            const label = createTextLabel(labelText, labelPos);
            label.visible = document.getElementById('show-labels-check')?.checked || false;
            moneyGroup.add(label);
            moneyLabels.push(label);

            for (let i = 0; i < count; i++) {
                const col = i % cols;
                const row = Math.floor(i / cols);

                const instance = cachedScene.clone();
                instance.name = `£${denom.value.toLocaleString()} Stack`;
                
                instance.position.x = clusterOffsetX + (col * (size.x + stackSpacing));
                instance.position.z = spawnPos.z + (row * (size.z + stackSpacing));
                
                moneyGroup.add(instance);
            }

            clusterOffsetX += stats.clusterWidth + clusterSpacing;
        }

        // 6. Update Camera and UI
        logToScreen(`Successfully generated £${(targetAmount - remaining).toLocaleString()}`, 'success');
        if (remaining > 0) {
            logToScreen(`Remainder: £${remaining.toLocaleString()} (Too small for available stacks)`, 'info');
        }

        updateSceneOutline();
        
        // Focus on the new money
        const moneyBox = new THREE.Box3().setFromObject(moneyGroup);
        fitCameraToSelection(camera, controls, [moneyGroup]);

        // Place light above new money
        const center = moneyBox.getCenter(new THREE.Vector3());
        const lightPos = new THREE.Vector3(center.x, moneyBox.max.y + 2, center.z);
        const intensity = targetAmount < 1000000 ? 20 : 50;
        addInteractableLight(lightPos, intensity);
        
        updateSceneOutline();
    });
}

function findEmptySpace(size) {
    const margin = 1.0; // 1m buffer
    const obstacles = [];
    
    // Collect all existing bounding boxes
    loadedModels.forEach(m => obstacles.push(new THREE.Box3().setFromObject(m.object)));
    if (moneyGroup && moneyGroup.children.length > 0) {
        // Only consider the static parts of moneyGroup if they exist
        obstacles.push(new THREE.Box3().setFromObject(moneyGroup));
    }

    if (obstacles.length === 0) return new THREE.Vector3(0, 0, 0);

    const step = 0.5;
    const maxSearch = 40; // Search up to 40m out
    
    // Spiral search pattern
    for (let radius = 0; radius < maxSearch; radius += step) {
        for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;
            
            const testBox = new THREE.Box3(
                new THREE.Vector3(x, 0, z),
                new THREE.Vector3(x + size.x, size.y, z + size.z)
            );

            let collision = false;
            for (const obs of obstacles) {
                if (testBox.intersectsBox(obs.clone().expandByScalar(margin))) {
                    collision = true;
                    break;
                }
            }

            if (!collision) return new THREE.Vector3(x, 0, z);
        }
    }

    return new THREE.Vector3(0, 0, 5); // Fallback
}

function createTextLabel(text, position) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 512;
    canvas.height = 128;

    // Background (semi-transparent dark)
    context.fillStyle = 'rgba(20, 20, 20, 0.9)';
    if (context.roundRect) {
        context.roundRect(0, 0, 512, 128, 20);
    } else {
        context.fillRect(0, 0, 512, 128);
    }
    context.fill();

    // Border
    context.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    context.lineWidth = 8;
    context.stroke();

    // Text
    context.font = 'Bold 80px Arial';
    context.fillStyle = '#ffffff';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text, 256, 64);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.MeshBasicMaterial({ 
        map: texture, 
        transparent: true 
    });

    const width = 0.3;
    const height = 0.075;
    const geometry = new THREE.PlaneGeometry(width, height);
    
    const group = new THREE.Group();
    
    // Front Mesh
    const front = new THREE.Mesh(geometry, material);
    group.add(front);
    
    // Back Mesh (Rotated so text isn't mirrored)
    const back = new THREE.Mesh(geometry, material);
    back.rotation.y = Math.PI;
    group.add(back);

    group.position.copy(position);
    // Align to bottom edge on floor
    group.position.y = height / 2 + 0.01; 
    
    return group;
}

// --- Formatting Helpers ---
function formatLargeCurrency(value) {
    if (value >= 1000000000) {
        const val = value / 1000000000;
        return `£${val % 1 === 0 ? val : val.toFixed(1)} Billion`;
    } else if (value >= 1000000) {
        const val = value / 1000000;
        return `£${val % 1 === 0 ? val : val.toFixed(1)} Million`;
    } else if (value >= 1000) {
        return `£${(value / 1000).toLocaleString()}k`;
    } else {
        return `£${value.toLocaleString()}`;
    }
}
function fitCameraToSelection(camera, controls, selection, fitOffset = 1.2) {
    const box = new THREE.Box3();
    for (const object of selection) box.expandByObject(object);

    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    const maxSize = Math.max(size.x, size.y, size.z);
    const fitHeightDistance = maxSize / (2 * Math.atan(Math.PI * camera.fov / 360));
    const fitWidthDistance = fitHeightDistance / camera.aspect;
    const distance = fitOffset * Math.max(fitHeightDistance, fitWidthDistance);

    const direction = controls.target.clone().sub(camera.position).normalize().multiplyScalar(distance);

    controls.maxDistance = distance * 10;
    controls.target.copy(center);

    camera.near = distance / 100;
    camera.far = distance * 100;
    camera.updateProjectionMatrix();

    camera.position.copy(controls.target).sub(direction);
    controls.update();
}

// --- UI Logic ---
function setupUI() {
    // 0. Model Selector
    const modelSelector = document.getElementById('model-selector');
    models.forEach(m => {
        const option = document.createElement('option');
        option.value = m.path;
        option.textContent = m.name;
        modelSelector.appendChild(option);
    });

    modelSelector.addEventListener('change', (e) => {
        const path = e.target.value;
        const name = e.target.options[e.target.selectedIndex].text;
        if (path) {
            logToScreen(`Loading Default: ${name}`);
            loadGLBFromUrl(path, name);

            // Clear file input if needed
            fileInput.value = '';
        }
    });


    // 1. File Upload
    const fileInput = document.getElementById('file-input');
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            logToScreen(`Loading: ${e.target.files[0].name}`);
            loadGLB(e.target.files[0]);

            // Reset selector
            modelSelector.value = '';
        }
    });

    // 1.5 Money Mode
    const generateMoneyBtn = document.getElementById('generate-money-btn');
    const moneyAmountInput = document.getElementById('money-amount');
    const moneyDisplay = document.getElementById('money-display');
    const denominationBreakdown = document.getElementById('denomination-breakdown');
    
    if (moneyAmountInput && moneyDisplay && denominationBreakdown) {
        moneyAmountInput.addEventListener('input', (e) => {
            const amount = parseInt(e.target.value, 10);
            if (!isNaN(amount) && amount > 0) {
                moneyDisplay.textContent = '£' + amount.toLocaleString();
                
                // Calculate breakdown
                let remaining = amount;
                const counts = [];
                for (const denom of moneyDenominations) {
                    if (remaining >= denom.value) {
                        const count = Math.floor(remaining / denom.value);
                        remaining -= count * denom.value;
                        counts.push(`<div style="display:flex; justify-content:space-between; margin-bottom: 2px;">
                            <span style="color:#efefef;">£${denom.value.toLocaleString()}</span>
                            <span style="font-weight:bold; color:#4CAF50;">x${count}</span>
                        </div>`);
                    }
                }
                
                denominationBreakdown.style.display = 'block';
                denominationBreakdown.innerHTML = counts.length > 0 ? counts.join('') : '<div style="color:#ff4d4d; text-align:center;">Amount too small</div>';
                
                if (remaining > 0 && counts.length > 0) {
                    denominationBreakdown.innerHTML += `<div style="color:#ff8800; border-top: 1px solid rgba(255,255,255,0.1); margin-top:5px; padding-top:5px; font-size: 0.75rem; text-align:right;">
                        Remainder: £${remaining}
                    </div>`;
                }
            } else {
                moneyDisplay.textContent = '£' + (parseInt(e.target.value, 10) || 0).toLocaleString();
                denominationBreakdown.style.display = 'none';
                denominationBreakdown.innerHTML = '';
            }
        });
    }
    
    if (generateMoneyBtn && moneyAmountInput) {
        generateMoneyBtn.addEventListener('click', () => {
            const amount = parseInt(moneyAmountInput.value, 10);
            if (!isNaN(amount) && amount > 0) {
                generateMoney(amount);
                // Clear any regular model
                modelSelector.value = '';
            } else {
                logToScreen('Please enter a valid amount.', 'error');
            }
        });
    }

    // 2. FOV Slider
    const fovSlider = document.getElementById('fov-slider');
    const fovVal = document.getElementById('fov-val');
    fovSlider.addEventListener('input', (e) => {
        camera.fov = parseFloat(e.target.value);
        camera.updateProjectionMatrix();
        fovVal.textContent = e.target.value;
    });

    // 3. Env Intensity
    const envSlider = document.getElementById('env-slider');
    const envVal = document.getElementById('env-val');
    envSlider.addEventListener('input', (e) => {
        scene.environmentIntensity = parseFloat(e.target.value);
        envVal.textContent = e.target.value;
    });

    // 4. Sun Intensity
    const dirSlider = document.getElementById('dir-slider');
    const dirVal = document.getElementById('dir-val');
    dirSlider.addEventListener('input', (e) => {
        dirLight.intensity = parseFloat(e.target.value);
        dirVal.textContent = e.target.value;
    });

    // 4.5 Ambient Intensity
    const ambSlider = document.getElementById('amb-slider');
    const ambVal = document.getElementById('amb-val');
    ambSlider.addEventListener('input', (e) => {
        ambientLight.intensity = parseFloat(e.target.value);
        ambVal.textContent = e.target.value;
    });

    // 5. Add Light Button
    document.getElementById('add-light-btn').addEventListener('click', () => {
        addInteractableLight();
    });

    // 5.5 Toggle Helpers Button (NEW)
    document.getElementById('toggle-helpers-btn').addEventListener('click', toggleHelpers);

    // 5.6 Toggle Grid Button
    document.getElementById('toggle-grid-btn').addEventListener('click', (e) => {
        floorGrid.visible = !floorGrid.visible;
        e.target.textContent = floorGrid.visible ? 'Hide Floor Grid' : 'Show Floor Grid';
        logToScreen(`Floor Grid ${floorGrid.visible ? 'Visible' : 'Hidden'}`);
    });

    // 5.7 Background Color
    const bgColorInput = document.getElementById('bg-color');
    if (bgColorInput) {
        bgColorInput.addEventListener('input', (e) => {
            scene.background = new THREE.Color(e.target.value);
        });
    }

    // 5.8 Environment Upload
    const envUpload = document.getElementById('env-upload');
    if (envUpload) {
        envUpload.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const url = URL.createObjectURL(file);
            const extension = file.name.split('.').pop().toLowerCase();

            logToScreen(`Loading environment: ${file.name}`);

            if (extension === 'hdr') {
                new RGBELoader().load(url, (texture) => {
                    texture.mapping = THREE.EquirectangularReflectionMapping;
                    scene.environment = texture;
                    scene.background = texture;
                    logToScreen('HDR Environment Loaded', 'success');
                }, undefined, (err) => {
                    logToScreen('Error loading HDR: ' + err, 'error');
                });
            } else {
                new THREE.TextureLoader().load(url, (texture) => {
                    texture.mapping = THREE.EquirectangularReflectionMapping;
                    texture.colorSpace = THREE.SRGBColorSpace;
                    scene.environment = texture;
                    scene.background = texture;
                    logToScreen('Image Environment Loaded', 'success');
                }, undefined, (err) => {
                    logToScreen('Error loading Image: ' + err, 'error');
                });
            }
        });
    }

    // 6. Reset Camera
    document.getElementById('reset-cam-btn').addEventListener('click', () => {
        const allObjects = [...loadedModels.map(m => m.object)];
        if (moneyGroup && moneyGroup.children.length > 0) allObjects.push(moneyGroup);
        
        if (allObjects.length > 0) {
            fitCameraToSelection(camera, controls, allObjects);
        } else {
            camera.position.set(2, 2, 5);
            controls.target.set(0, 0, 0);
            controls.update();
        }
    });

    // 7. Selected Light UI
    const colorInput = document.getElementById('sel-light-color');
    const intensitySlider = document.getElementById('sel-light-intensity');
    const intensityVal = document.getElementById('sel-light-int-val');
    const deleteBtn = document.getElementById('delete-light-btn');

    colorInput.addEventListener('input', (e) => {
        if (selectedLightHandle) {
            const light = selectedLightHandle.userData.light;
            light.color.set(e.target.value);
            selectedLightHandle.material.color.set(e.target.value);
        }
    });

    intensitySlider.addEventListener('input', (e) => {
        if (selectedLightHandle) {
            const light = selectedLightHandle.userData.light;
            light.intensity = parseFloat(e.target.value);
            intensityVal.textContent = e.target.value;
        }
    });

    deleteBtn.addEventListener('click', () => {
        if (selectedLightHandle) {
            const light = selectedLightHandle.userData.light;
            const helper = selectedLightHandle.userData.helper;

            scene.remove(light);
            scene.remove(helper);
            scene.remove(selectedLightHandle);

            // Remove from selectables
            const index = selectableObjects.indexOf(selectedLightHandle);
            if (index > -1) selectableObjects.splice(index, 1);

            if (transformControl && transformControl.object === light) transformControl.detach();
            if (selectionHelper) selectionHelper.visible = false;

            selectedLightHandle = null;
            updateSelectionUI();
            updateSceneOutline();
            logToScreen('Light deleted.', 'info');
        }
    });

    // 8. Movement Buttons (Touch/Click)
    const moveStep = 0.5;

    // Helper to add repeat on hold (optional but good for touch) - keeping simple click for now
    document.getElementById('move-x-left').addEventListener('click', () => moveSelectedLight(-moveStep, 0, 0));
    document.getElementById('move-x-right').addEventListener('click', () => moveSelectedLight(moveStep, 0, 0));
    document.getElementById('move-z-fwd').addEventListener('click', () => moveSelectedLight(0, 0, moveStep));
    document.getElementById('move-z-back').addEventListener('click', () => moveSelectedLight(0, 0, -moveStep));
    document.getElementById('move-y-up').addEventListener('click', () => moveSelectedLight(0, moveStep, 0));
    document.getElementById('move-y-down').addEventListener('click', () => moveSelectedLight(0, -moveStep, 0));

    // --- NEW: Rendering Effects Toggles ---

    // A. Ambient Occlusion (SSAO)
    const aoToggle = document.getElementById('ao-toggle');
    aoToggle.addEventListener('change', (e) => {
        if (ssaoPass) {
            ssaoPass.enabled = e.target.checked;
            logToScreen(`AO ${e.target.checked ? 'Enabled' : 'Disabled'}`, 'info');
        }
    });

    // B. Cavity (GTAO)
    const cavityToggle = document.getElementById('cavity-toggle');
    cavityToggle.addEventListener('change', (e) => {
        if (gtaoPass) {
            gtaoPass.enabled = e.target.checked;
            logToScreen(`Cavity ${e.target.checked ? 'Enabled' : 'Disabled'}`, 'info');
        }
    });

    // C. Ray Tracing (SSR)
    const ssrToggle = document.getElementById('ssr-toggle');
    ssrToggle.addEventListener('change', (e) => {
        if (ssrPass) {
            ssrPass.enabled = e.target.checked;
            // SSR needs ground reference sometimes, keeping it simple for now
            logToScreen(`Ray Tracing ${e.target.checked ? 'Enabled' : 'Disabled'}`, 'info');
        }
    });

    // 7. Transform Controls UI
    const btnTrans = document.getElementById('transform-translate');
    const btnRot = document.getElementById('transform-rotate');
    const btnScale = document.getElementById('transform-scale');

    // 8. Scene Export
    const screenshotBtn = document.getElementById('screenshot-btn');
    if (screenshotBtn) {
        screenshotBtn.addEventListener('click', () => {
            takeScreenshot();
        });
    }

    const exportBtn = document.getElementById('export-glb-btn');
    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            exportSceneToGLB();
        });
    }

    // 9. Labels Toggle
    const labelsToggle = document.getElementById('show-labels-check');
    if (labelsToggle) {
        labelsToggle.addEventListener('change', (e) => {
            const visible = e.target.checked;
            moneyLabels.forEach(label => label.visible = visible);
        });
    }

    if (btnTrans && btnRot && btnScale) {
        const updateTransformButtons = (mode) => {
            btnTrans.className = mode === 'translate' ? 'action-btn' : 'action-btn secondary';
            btnRot.className = mode === 'rotate' ? 'action-btn' : 'action-btn secondary';
            btnScale.className = mode === 'scale' ? 'action-btn' : 'action-btn secondary';
            if (transformControl) transformControl.setMode(mode);
        };

        btnTrans.addEventListener('click', () => updateTransformButtons('translate'));
        btnRot.addEventListener('click', () => updateTransformButtons('rotate'));
        btnScale.addEventListener('click', () => updateTransformButtons('scale'));
    }

    const undoBtn = document.getElementById('undo-btn');
    if (undoBtn) {
        undoBtn.addEventListener('click', () => {
            if (undoHistory.length > 0) {
                const lastMove = undoHistory.pop();
                const obj = lastMove.object;
                
                obj.position.copy(lastMove.position);
                obj.rotation.copy(lastMove.rotation);
                obj.scale.copy(lastMove.scale);
                
                // Sync Light Helper if it was a light
                if (obj.isLight) {
                    const handle = selectableObjects.find(h => h.userData.light === obj);
                    if (handle) {
                        handle.position.copy(obj.position);
                        handle.userData.helper.update();
                    }
                }
                
                // Update selection helper
                if (selectionHelper && selectionHelper.visible && transformControl.object === obj) {
                    selectionHelper.setFromObject(obj);
                }
                
                logToScreen('Undone last move', 'info');
                updateUndoButtonVisibility();
            }
        });
    }

    // --- Mobile Toggle Logic ---
    const mobileToggleBtn = document.getElementById('mobile-menu-toggle');
    const uiContainer = document.querySelector('.ui-container');

    if (mobileToggleBtn) {
        mobileToggleBtn.addEventListener('click', () => {
            uiContainer.classList.toggle('open');
            // Optional: Toggle icon state if we want X vs Menu icon
            const isOpen = uiContainer.classList.contains('open');
            if (isOpen) {
                mobileToggleBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`; // X icon
            } else {
                mobileToggleBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>`; // Menu icon
            }
        });

        // Close menu when clicking strictly outside cards on the backdrop (optional polish)
        uiContainer.addEventListener('click', (e) => {
            if (e.target === uiContainer) {
                uiContainer.classList.remove('open');
                mobileToggleBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>`;
            }
        });
    }
}


// --- Scene Outline Logic ---
function updateSceneOutline() {
    const listContainer = document.getElementById('scene-outline-list');
    if (!listContainer) return;
    
    listContainer.innerHTML = '';
    outlineObjects = [];
    
    loadedModels.forEach((m) => {
        outlineObjects.push({ name: m.name, object: m.object });
    });
    
    if (moneyGroup && moneyGroup.children.length > 0) {
        moneyGroup.children.forEach((child, index) => {
            outlineObjects.push({ name: child.name || `Cash Stack ${index + 1}`, object: child });
        });
    }
    
    selectableObjects.forEach((handle, index) => {
        const light = handle.userData.light;
        outlineObjects.push({ name: `Point Light ${index + 1}`, object: light, handle: handle });
    });
    
    if (outlineObjects.length === 0) {
        listContainer.innerHTML = '<div class="no-objects">No objects found.</div>';
        return;
    }
    
    const currentSelected = transformControl?.object;

    outlineObjects.forEach((item) => {
        const div = document.createElement('div');
        div.className = 'outline-item';
        
        // Highlight if selected
        if (currentSelected && (currentSelected === item.object || (item.handle && currentSelected === item.handle))) {
            div.classList.add('active');
        }
        
        div.textContent = item.name;
        
        div.addEventListener('click', () => {
            selectObject(item.handle || item.object);
        });
        
        listContainer.appendChild(div);
    });
}

function updateUndoButtonVisibility() {
    const undoBtn = document.getElementById('undo-btn');
    if (undoBtn) {
        undoBtn.style.display = undoHistory.length > 0 ? 'block' : 'none';
        undoBtn.textContent = `Undo (${undoHistory.length})`;
    }
}

// --- Export Logic ---

function exportSceneToGLB() {
    logToScreen('Exporting scene to GLB...', 'info');
    
    const exporter = new GLTFExporter();
    
    // Temporarily hide helpers and UI objects
    const originalHelpersVisible = helpersVisible;
    if (helpersVisible) {
        // We don't want the light spheres/helpers in the export
        selectableObjects.forEach(h => h.visible = false);
        selectableObjects.forEach(h => h.userData.helper.visible = false);
    }
    
    const originalGridVisible = floorGrid.visible;
    floorGrid.visible = false;
    
    // Detach transform controls if any
    const attachedObj = transformControl.object;
    if (attachedObj) transformControl.detach();

    const options = {
        binary: true,
        trs: false,
        onlyVisible: true,
        truncateDrawRange: true,
        binary: true,
        forceIndices: false,
        forcePowerOfTwoTextures: false
    };

    exporter.parse(
        scene,
        function (result) {
            if (result instanceof ArrayBuffer) {
                saveArrayBuffer(result, '3d-comparison-scene.glb');
            } else {
                const output = JSON.stringify(result, null, 2);
                saveString(output, '3d-comparison-scene.gltf');
            }
            
            // Restore visibility
            if (originalHelpersVisible) {
                selectableObjects.forEach(h => h.visible = true);
                selectableObjects.forEach(h => h.userData.helper.visible = true);
            }
            floorGrid.visible = originalGridVisible;
            if (attachedObj) transformControl.attach(attachedObj);
            
            logToScreen('Scene exported successfully!', 'success');
        },
        function (error) {
            logToScreen('Error exporting scene: ' + error, 'error');
            
            // Restore visibility on error too
            if (originalHelpersVisible) {
                selectableObjects.forEach(h => h.visible = true);
                selectableObjects.forEach(h => h.userData.helper.visible = true);
            }
            floorGrid.visible = originalGridVisible;
            if (attachedObj) transformControl.attach(attachedObj);
        },
        options
    );
}

function saveArrayBuffer(buffer, filename) {
    save(new Blob([buffer], { type: 'application/octet-stream' }), filename);
}

function saveString(text, filename) {
    save(new Blob([text], { type: 'text/plain' }), filename);
}

function save(blob, filename) {
    const link = document.createElement('a');
    link.style.display = 'none';
    document.body.appendChild(link);
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    document.body.removeChild(link);
}

function takeScreenshot() {
    logToScreen('Taking screenshot...', 'info');
    
    const format = document.getElementById('screenshot-format').value;
    const extension = format === 'image/png' ? 'png' : 'jpg';

    // 1. Temporarily hide helpers/controls for a clean shot
    const originalHelpersVisible = helpersVisible;
    if (helpersVisible) {
        selectableObjects.forEach(h => h.visible = false);
        selectableObjects.forEach(h => h.userData.helper.visible = false);
    }
    
    const attachedObj = transformControl.object;
    if (attachedObj) transformControl.detach();
    if (selectionHelper) selectionHelper.visible = false;
    
    const originalGridVisible = floorGrid.visible;
    floorGrid.visible = false;

    // 2. Render the clean frame WITH all post-processing effects
    if (composer) {
        composer.render();
    } else {
        renderer.render(scene, camera);
    }
    
    // 3. Capture the data
    const dataURL = renderer.domElement.toDataURL(format);
    
    // 4. Download
    const link = document.createElement('a');
    link.download = `3d-comparison-capture-${new Date().getTime()}.${extension}`;
    link.href = dataURL;
    link.click();

    // 5. Restore UI
    if (originalHelpersVisible) {
        selectableObjects.forEach(h => h.visible = true);
        selectableObjects.forEach(h => h.userData.helper.visible = true);
    }
    if (attachedObj) transformControl.attach(attachedObj);
    if (selectionHelper && attachedObj) selectionHelper.visible = true;
    floorGrid.visible = originalGridVisible;
    
    logToScreen('Screenshot saved!', 'success');
}

function addInteractableLight(position = null, intensity = 50) {
    const pl = new THREE.PointLight(0xffffff, intensity, 100);

    if (position) {
        pl.position.copy(position);
    } else {
        pl.position.copy(camera.position).add(new THREE.Vector3(0, 0, -1)); // Slightly in front
    }

    // Helper (visual range)
    const helper = new THREE.PointLightHelper(pl, 0.5);
    scene.add(pl);
    scene.add(helper);

    // Clickable Handle (Sphere)
    const geometry = new THREE.SphereGeometry(0.3, 16, 16);
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const handle = new THREE.Mesh(geometry, material);
    handle.position.copy(pl.position);

    // Link them up
    handle.userData = { light: pl, helper: helper };

    scene.add(handle);
    selectableObjects.push(handle);

    // RESPECT Helpers Visible state
    handle.visible = helpersVisible;
    helper.visible = helpersVisible;

    logToScreen('Interactable Point Light added', 'success');

    // Auto-select
    selectObject(handle);
    updateSceneOutline();
}

function onPointerDown(event) {
    if (transformControl && (transformControl.dragging || transformControl.axis !== null)) {
        return; // Ignore clicks if interacting with transform controls
    }

    // Calculate pointer position in normalized device coordinates (-1 to +1) for both components
    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(pointer, camera);

    // Build array of all clickable objects
    const intersectables = [...selectableObjects];
    loadedModels.forEach(m => intersectables.push(m.object));
    if (moneyGroup) intersectables.push(...moneyGroup.children);

    const intersects = raycaster.intersectObjects(intersectables, true); // true for recursive

    if (intersects.length > 0) {
        // Find the top-level object
        let clickedObj = intersects[0].object;
        
        // Traverse up until we find a known root
        while (clickedObj.parent && 
               !loadedModels.some(m => m.object === clickedObj) && 
               clickedObj.parent !== moneyGroup && 
               !selectableObjects.includes(clickedObj)) {
            clickedObj = clickedObj.parent;
        }

        // If it's a light handle
        if (selectableObjects.includes(clickedObj)) {
            selectObject(clickedObj); // Highlights the handle UI
            if (transformControl) transformControl.attach(clickedObj.userData.light);
            if (selectionHelper) selectionHelper.visible = false;
        } 
        // If it's a model or money stack
        else {
            if (selectedLightHandle) {
                selectedLightHandle.material.wireframe = false;
                selectedLightHandle = null;
                updateSelectionUI();
            }
            if (transformControl) transformControl.attach(clickedObj);
            if (selectionHelper) {
                selectionHelper.setFromObject(clickedObj);
                selectionHelper.visible = true;
            }
        }
        updateSceneOutline();
    } else {
        // Only deselect if we clicked on empty space (not UI)
        if (event.target.id === 'canvas-container' || event.target.tagName === 'CANVAS') {
            deselect();
        }
    }
}

function selectObject(target) {
    // If it's a light handle (mesh), use that. If it's a light itself, find its handle.
    let handle = target;
    if (!selectableObjects.includes(target)) {
         handle = selectableObjects.find(h => h.userData.light === target);
    }

    if (handle) {
        if (selectedLightHandle) selectedLightHandle.material.wireframe = false;
        selectedLightHandle = handle;
        selectedLightHandle.material.wireframe = true;
        if (transformControl) transformControl.attach(handle.userData.light);
        if (selectionHelper) selectionHelper.visible = false;
        updateSelectionUI();
    } else {
        // Model selection
        if (selectedLightHandle) {
            selectedLightHandle.material.wireframe = false;
            selectedLightHandle = null;
        }
        if (transformControl) transformControl.attach(target);
        if (selectionHelper) {
            selectionHelper.setFromObject(target);
            selectionHelper.visible = true;
        }
        updateSelectionUI();
    }
    
    updateSceneOutline();
}

function deselect() {
    if (transformControl) transformControl.detach();
    if (selectionHelper) selectionHelper.visible = false;
    
    if (selectedLightHandle) {
        selectedLightHandle.material.wireframe = false;
        selectedLightHandle = null;
    }
    
    updateSelectionUI();
    updateSceneOutline();
}

function updateSelectionUI() {
    const panel = document.getElementById('selected-light-panel');
    if (selectedLightHandle) {
        panel.style.display = 'block';
        const light = selectedLightHandle.userData.light;

        document.getElementById('sel-light-color').value = '#' + light.color.getHexString();
        document.getElementById('sel-light-intensity').value = light.intensity;
        document.getElementById('sel-light-int-val').textContent = light.intensity;

    } else {
        panel.style.display = 'none';
    }
}

function moveSelectedLight(xDelta, yDelta, zDelta) {
    if (!selectedLightHandle) return;

    const light = selectedLightHandle.userData.light;
    const handle = selectedLightHandle;
    const helper = selectedLightHandle.userData.helper;

    light.position.x += xDelta;
    light.position.y += yDelta;
    light.position.z += zDelta;

    // Sync handle and helper
    handle.position.copy(light.position);
    helper.update();
}

function onKeyDown(event) {
    if (!selectedLightHandle) return;

    const moveStep = 0.5; // Meters per keypress

    switch (event.key) {
        case 'ArrowUp':
            if (event.shiftKey) {
                moveSelectedLight(0, moveStep, 0);
            } else {
                moveSelectedLight(0, 0, -moveStep);
            }
            break;
        case 'ArrowDown':
            if (event.shiftKey) {
                moveSelectedLight(0, -moveStep, 0);
            } else {
                moveSelectedLight(0, 0, moveStep);
            }
            break;
        case 'ArrowLeft':
            moveSelectedLight(-moveStep, 0, 0);
            break;
        case 'ArrowRight':
            moveSelectedLight(moveStep, 0, 0);
            break;
        default:
            return; // Exit if not a navigation key
    }
}

function onWindowResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    renderer.setSize(width, height);
    if (composer) composer.setSize(width, height);
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();

    // Use composer if active, otherwise fallback (init handles fallback implicitly by always creating composer now)
    if (composer) {
        composer.render();
    } else {
        renderer.render(scene, camera);
    }
}

// Run
init();