import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

// Post-Processing Imports
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { SSRPass } from 'three/addons/postprocessing/SSRPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { models } from '../../assets/models_config.js';

// --- Global Variables ---
let camera, scene, renderer, controls;
let composer; // EffectComposer
let renderPass, ssaoPass, gtaoPass, ssrPass, outputPass;
let model;
let dirLight, ambientLight;
const container = document.getElementById('canvas-container');

// --- Interaction Globals ---
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let selectedLightHandle = null; // The mesh sphere we click on
const selectableObjects = []; // Array of light handles to raycast against


// --- Debug Helper ---
function logToScreen(message, type = 'info') {
    const consoleDiv = document.getElementById('console-output');
    const msgDiv = document.createElement('div');
    msgDiv.className = 'debug-entry';
    msgDiv.textContent = `> ${message}`;

    if (type === 'error') msgDiv.classList.add('debug-error');
    if (type === 'success') msgDiv.classList.add('debug-success');

    consoleDiv.prepend(msgDiv); // Newest at top
    console.log(`[${type.toUpperCase()}] ${message}`);
}

// --- Initialization ---
function init() {
    try {
        logToScreen('Initializing 3D Engine...');

        // 1. Scene Setup
        scene = new THREE.Scene();
        scene.background = new THREE.Color('#111115');
        // Add some fog for depth integration
        scene.fog = new THREE.FogExp2(0x111115, 0.02);

        // 2. Camera Setup
        camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.set(2, 2, 5);

        // 3. Renderer Setup (Realistic settings)
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
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
            scene.environmentIntensity = 0; // Default to 0 based on user request
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
function onModelLoaded(gltf) {
    const loadingContainer = document.getElementById('loading-bar-container');

    // Remove previous model
    if (model) scene.remove(model);

    model = gltf.scene;

    // Check for lights in the GLB
    const glbLights = [];
    model.traverse((node) => {
        if (node.isLight) glbLights.push(node);

        // Enable shadows for meshes
        if (node.isMesh) {
            node.castShadow = true;
            node.receiveShadow = true;
        }
    });

    if (glbLights.length > 0) {
        logToScreen(`Found ${glbLights.length} lights in GLB.`, 'success');
        // Optionally disable default lights if GLB has them
        // dirLight.visible = false; 
    }

    scene.add(model);

    // Auto-center camera
    fitCameraToSelection(camera, controls, [model]);

    // Measure model and place light above center (half height above top)
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    // Position = Top + (Height/2) = MaxY + (Height/2)
    const topY = box.max.y;
    const targetY = topY + (size.y / 2);
    const lightPos = new THREE.Vector3(center.x, targetY, center.z);

    // Add a point light at this position
    addInteractableLight(lightPos);

    if (loadingContainer) loadingContainer.style.display = 'none';
    logToScreen('Model loaded successfully.', 'success');

    // Update SSR selects if needed (SSR works best when it knows what to reflect, but global works too)
    // if (ssrPass) ssrPass.selects = [model];
}

function loadGLBFromUrl(url) {
    const loadingBar = document.getElementById('loading-bar');
    const loadingContainer = document.getElementById('loading-bar-container');
    loadingContainer.style.display = 'block';

    const loader = new GLTFLoader();

    loader.load(url, function (gltf) {
        try {
            onModelLoaded(gltf);
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
}


function loadGLB(file) {
    const reader = new FileReader();
    const loadingBar = document.getElementById('loading-bar');
    const loadingContainer = document.getElementById('loading-bar-container');

    loadingContainer.style.display = 'block';

    reader.onload = function (e) {
        const contents = e.target.result;
        const loader = new GLTFLoader();

        try {
            loader.parse(contents, '', function (gltf) {
                onModelLoaded(gltf);
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
}

// --- Camera Auto-Fit ---
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
        if (path) {
            logToScreen(`Loading Default: ${e.target.options[e.target.selectedIndex].text}`);
            loadGLBFromUrl(path);

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

    // 6. Reset Camera
    document.getElementById('reset-cam-btn').addEventListener('click', () => {
        if (model) fitCameraToSelection(camera, controls, [model]);
        else {
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

            selectedLightHandle = null;
            updateSelectionUI();
            logToScreen('Light deleted.', 'info');
        }
    });

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
}


// --- Interaction Logic ---

function addInteractableLight(position = null) {
    const pl = new THREE.PointLight(0xffffff, 50, 100);

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

    logToScreen('Interactable Point Light added', 'success');

    // Auto-select
    selectObject(handle);
}

function onPointerDown(event) {
    // Calculate pointer position in normalized device coordinates (-1 to +1) for both components
    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(pointer, camera);

    const intersects = raycaster.intersectObjects(selectableObjects, false);

    if (intersects.length > 0) {
        selectObject(intersects[0].object);
        // controls.enabled = false; <-- REMOVED to allow navigation
    } else {
        // Only deselect if we clicked on empty space (not UI)
        if (event.target.id === 'canvas-container' || event.target.tagName === 'CANVAS') {
            deselect();
        }
    }
}

function selectObject(handle) {
    if (selectedLightHandle) {
        // Reset previous visual state if needed (e.g. unhighlight)
        selectedLightHandle.material.wireframe = false;
    }

    selectedLightHandle = handle;
    selectedLightHandle.material.wireframe = true; // Highlight selection

    logToScreen('Light Selected', 'info');
    updateSelectionUI();
}

function deselect() {
    if (selectedLightHandle) {
        selectedLightHandle.material.wireframe = false;
    }
    selectedLightHandle = null;
    updateSelectionUI();
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

function onKeyDown(event) {
    if (!selectedLightHandle) return;

    const moveStep = 0.5; // Meters per keypress
    const light = selectedLightHandle.userData.light;
    const handle = selectedLightHandle;
    const helper = selectedLightHandle.userData.helper;

    switch (event.key) {
        case 'ArrowUp':
            if (event.shiftKey) {
                light.position.y += moveStep;
            } else {
                light.position.z -= moveStep;
            }
            break;
        case 'ArrowDown':
            if (event.shiftKey) {
                light.position.y -= moveStep;
            } else {
                light.position.z += moveStep;
            }
            break;
        case 'ArrowLeft':
            light.position.x -= moveStep;
            break;
        case 'ArrowRight':
            light.position.x += moveStep;
            break;
        default:
            return; // Exit if not a navigation key
    }

    // Sync handle and helper
    handle.position.copy(light.position);
    helper.update();
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