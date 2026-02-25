import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

console.log("Script loaded. Initializing...");

// ==========================================
// 1. VARIABLE DECLARATIONS
// ==========================================

// DOM Elements
const modeSelect = document.getElementById("calcMode");
const inputsContainer = document.getElementById("inputs-container");
const resultArea = document.getElementById("result-area");
const resultContent = document.getElementById("result-content");

// Input Rows
const rowWidth = document.getElementById("row-width");
const rowHeight = document.getElementById("row-height");
const rowAspect = document.getElementById("row-aspect");
const rowDistance = document.getElementById("row-distance");
const rowFov = document.getElementById("row-fov");
const commonSizesGroup = document.getElementById("common-sizes");

// Inputs
const screenWidthInput = document.getElementById("screenWidth");
const widthUnitSelect = document.getElementById("widthUnit");
const screenHeightInput = document.getElementById("screenHeight");
const heightUnitSelect = document.getElementById("heightUnit");
const ratioWInput = document.getElementById("ratioW");
const ratioHInput = document.getElementById("ratioH");
const viewDistanceInput = document.getElementById("viewDistance");
const distUnitSelect = document.getElementById("distUnit");
const targetFovInput = document.getElementById("targetFov");

// Three.js Globals
let scene, camera, renderer, controls;
let screenMesh, eyeMesh, fovLines, floorGrid;

// ==========================================
// 2. LOGIC & CALCULATION
// ==========================================

function updateInputVisibility() {
    const mode = modeSelect.value;

    // Reset
    rowWidth.classList.remove("hidden");
    rowHeight.classList.remove("hidden");
    rowAspect.classList.remove("hidden"); // Always show Aspect Ratio
    rowDistance.classList.remove("hidden");
    rowDistance.classList.remove("hidden");
    rowFov.classList.remove("hidden");
    commonSizesGroup.classList.remove("hidden");

    if (mode === "fov") {
        rowFov.classList.add("hidden");
    } else if (mode === "distance") {
        rowDistance.classList.add("hidden");
    } else if (mode === "size") {
        rowWidth.classList.add("hidden");
        rowWidth.classList.add("hidden");
        // For screen size calculation, we hide manual height and show aspect ratio
        rowHeight.classList.add("hidden");
        commonSizesGroup.classList.add("hidden");
    }

    calculateAndRender();
}

function toMeters(value, unit) {
    if (unit === "mm") return value / 1000;
    if (unit === "cm") return value / 100;
    if (unit === "in") return value * 0.0254;
    if (unit === "ft") return value * 0.3048;
    return value;
}

function fromMeters(value, unit) {
    if (unit === "mm") return value * 1000;
    if (unit === "cm") return value * 100;
    if (unit === "in") return value / 0.0254;
    if (unit === "ft") return value / 0.3048;
    return value;
}

function updateHeightFromAspectRatio() {
    // Only applies if we have a valid width and AR
    const wVal = parseFloat(screenWidthInput.value) || 0;
    const rW = parseFloat(ratioWInput.value) || 0;
    const rH = parseFloat(ratioHInput.value) || 0;

    if (wVal > 0 && rW > 0 && rH > 0) {
        // Calculate Height
        // H = W * (rH / rW)
        // We need to respect units? W and H are in same unit so it's unitless math.

        const newHeight = wVal * (rH / rW);
        screenHeightInput.value = parseFloat(newHeight.toFixed(2));

        // Trigger calc
        calculateAndRender();
    }
}

function updateAspectRatioFromDimensions() {
    const wVal = parseFloat(screenWidthInput.value) || 0;
    const hVal = parseFloat(screenHeightInput.value) || 0;
    const rH = parseFloat(ratioHInput.value) || 9; // Default to 9 as anchor

    if (wVal > 0 && hVal > 0) {
        // Calculate matching RatioW
        // rW = (W / H) * rH
        const newRW = (wVal / hVal) * rH;

        // Update input without triggering events
        ratioWInput.value = parseFloat(newRW.toFixed(2));
    }
}

function calculateAndRender() {
    const mode = modeSelect.value;

    // Internal Visualization Vars (in centimeters for 3D scene scaling)
    let visWidthCm = 0;
    let visHeightCm = 0;
    let visDistCm = 0;

    try {
        // Gather raw inputs (defaults to 0 if empty)
        let wVal = parseFloat(screenWidthInput.value) || 0;
        let hVal = parseFloat(screenHeightInput.value) || 0;
        let dVal = parseFloat(viewDistanceInput.value) || 0;
        let fovVal = parseFloat(targetFovInput.value) || 0;

        let rW = parseFloat(ratioWInput.value) || 16;
        let rH = parseFloat(ratioHInput.value) || 9;

        let resultHTML = "";

        // --- MATH LOGIC ---
        if (mode === "fov") {
            if (wVal > 0 && dVal > 0) {
                const widthM = toMeters(wVal, widthUnitSelect.value);
                const distM = toMeters(dVal, distUnitSelect.value);

                // Calc Angle
                const hFovRad = 2 * Math.atan(widthM / (2 * distM));
                const hFovDeg = hFovRad * (180 / Math.PI);

                resultHTML = `<span class="result-value">${hFovDeg.toFixed(1)}°</span> <span class="result-detail">Horizontal FOV</span>`;

                // Set Visualization Vars
                visWidthCm = fromMeters(widthM, 'cm');
                visDistCm = fromMeters(distM, 'cm');
            } else {
                resultHTML = `<span class="result-detail">Enter width and distance...</span>`;
            }

        } else if (mode === "distance") {
            if (wVal > 0 && fovVal > 0 && fovVal < 180) {
                const widthM = toMeters(wVal, widthUnitSelect.value);
                const fovRad = fovVal * (Math.PI / 180);

                // Calc Distance
                const distM = widthM / (2 * Math.tan(fovRad / 2));
                const finalDist = fromMeters(distM, widthUnitSelect.value); // Use width unit as preference

                resultHTML = `<span class="result-value">${finalDist.toFixed(1)} ${widthUnitSelect.value}</span> <span class="result-detail">Required Distance</span>`;

                visWidthCm = fromMeters(widthM, 'cm');
                visDistCm = fromMeters(distM, 'cm');
            } else {
                resultHTML = `<span class="result-detail">Enter width and target FOV...</span>`;
            }

        } else if (mode === "size") {
            if (dVal > 0 && fovVal > 0 && fovVal < 180) {
                const distM = toMeters(dVal, distUnitSelect.value);
                const fovRad = fovVal * (Math.PI / 180);

                // Calc Width
                const widthM = 2 * distM * Math.tan(fovRad / 2);

                // Calc Height based on Aspect Ratio
                const heightM = widthM / (rW / rH);

                const finalWidth = fromMeters(widthM, distUnitSelect.value);
                const finalHeight = fromMeters(heightM, distUnitSelect.value);

                resultHTML = `
                    <div style="display:flex; gap:20px; justify-content:center;">
                        <div>
                            <span class="result-value">${finalWidth.toFixed(1)} ${distUnitSelect.value}</span> 
                            <span class="result-detail">Width</span>
                        </div>
                        <div>
                            <span class="result-value">${finalHeight.toFixed(1)} ${distUnitSelect.value}</span> 
                            <span class="result-detail">Height</span>
                        </div>
                    </div>`;

                visWidthCm = fromMeters(widthM, 'cm');
                visDistCm = fromMeters(distM, 'cm');

                // For this mode specifically, we override the manual height calculation below
                visHeightCm = fromMeters(heightM, 'cm');

            } else {
                resultHTML = `<span class="result-detail">Enter distance and target FOV...</span>`;
            }
        }

        // Height is usually manual, but needed for 3D box
        // Only use manual height if NOT in 'size' mode (where we calculate it)
        if (mode !== "size") {
            const heightM = toMeters(hVal, heightUnitSelect.value);
            visHeightCm = fromMeters(heightM, 'cm');
        }

        // Update Text Result
        resultContent.innerHTML = resultHTML;

        // Update 3D Scene
        update3DScene(visWidthCm, visHeightCm, visDistCm);

    } catch (e) {
        console.error(e);
    }
}

// ==========================================
// 3. THREE.JS VISUALIZATION
// ==========================================

function init3D() {
    const container = document.getElementById('canvas-container');

    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050505); // Very dark grey
    // Fog removed to prevent tinting when zoomed out


    // Camera
    camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(200, 170, 200); // Offset view

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    // Controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.autoRotate = false;

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(10, 20, 10);
    scene.add(dirLight);

    // --- OBJECTS ---

    // 1. Grid (Floor)
    floorGrid = new THREE.GridHelper(200, 20, 0x333333, 0x111111);
    scene.add(floorGrid);

    // 2. The Screen (Box)
    const screenGeo = new THREE.BoxGeometry(1, 1, 1);
    const screenMat = new THREE.MeshStandardMaterial({
        color: 0x3b82f6,
        roughness: 0.2,
        metalness: 0.8,
        emissive: 0x112244
    });
    screenMesh = new THREE.Mesh(screenGeo, screenMat);
    scene.add(screenMesh);

    // 3. The Eye (3D Model)
    const loader = new GLTFLoader();
    loader.load('assets/3D/Sitting_Man.glb', (gltf) => {
        eyeMesh = gltf.scene;

        // Initial setup
        // The scene is in cm, standard GLB is meters -> scale by 100
        eyeMesh.scale.set(100, 100, 100);

        // Rotate to face the screen (if needed). 
        // Assuming model faces +Z, and needs to look at -Z (screen is at Z=0, Eye is at Z=positive)
        eyeMesh.rotation.y = Math.PI;

        scene.add(eyeMesh);

        // Trigger a render update to position it correctly immediately
        calculateAndRender();

        const loadingContainer = document.getElementById('loading-container');
        if (loadingContainer) {
            loadingContainer.classList.add('hidden');
        }

    }, (xhr) => {
        const loadingBar = document.getElementById('loading-bar');
        if (loadingBar) {
            if (xhr.lengthComputable) {
                const percent = (xhr.loaded / xhr.total) * 100;
                loadingBar.style.width = percent + '%';
            } else {
                loadingBar.classList.add('indeterminate');
            }
        }
    }, (error) => {
        console.error('An error occurred loading the model:', error);
        const loadingContainer = document.getElementById('loading-container');
        if (loadingContainer) {
            loadingContainer.classList.add('hidden');
        }
    });

    // 4. FOV Lines (Frustum lines)
    const lineGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(5 * 3); // 5 points
    lineGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    // Indices: Eye(0) -> Corners(1,2,3,4) -> Frame
    const indices = [
        0, 1, 0, 2, 0, 3, 0, 4, // Rays
        1, 2, 2, 3, 3, 4, 4, 1  // Screen Frame
    ];
    lineGeo.setIndex(indices);

    const lineMat = new THREE.LineBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.5 });
    fovLines = new THREE.LineSegments(lineGeo, lineMat);
    scene.add(fovLines);

    // Animation Loop
    animate();

    // Handle Resize
    window.addEventListener('resize', () => {
        const width = container.clientWidth;
        const height = container.clientHeight;
        renderer.setSize(width, height);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
    });
}

function update3DScene(widthCm, heightCm, distCm) {
    if (!screenMesh || !eyeMesh) return;

    // Safety checks
    if (widthCm < 0.1) widthCm = 0.1;
    if (heightCm < 0.1) heightCm = 0.1;
    if (distCm < 0) distCm = 0;

    // 1. Update Screen Size
    screenMesh.scale.set(widthCm, heightCm, 1);
    // Center of screen is (0, height/2, 0)
    screenMesh.position.set(0, heightCm / 2, 0);

    // 2. Update Eye Position (Moved back by distCm on Z axis)
    // The model's origin is at the eye, so we just place it.
    eyeMesh.position.set(0, heightCm / 2, distCm);

    // 3. Update FOV Lines
    const halfW = widthCm / 2;
    const halfH = heightCm / 2;
    const centerY = heightCm / 2;

    const positions = fovLines.geometry.attributes.position.array;

    // Point 0: Eye
    positions[0] = 0;
    positions[1] = centerY;
    positions[2] = distCm;

    // Point 1: Top Left
    positions[3] = -halfW;
    positions[4] = centerY + halfH;
    positions[5] = 0;

    // Point 2: Top Right
    positions[6] = halfW;
    positions[7] = centerY + halfH;
    positions[8] = 0;

    // Point 3: Bottom Right
    positions[9] = halfW;
    positions[10] = centerY - halfH;
    positions[11] = 0;

    // Point 4: Bottom Left
    positions[12] = -halfW;
    positions[13] = centerY - halfH;
    positions[14] = 0;

    fovLines.geometry.attributes.position.needsUpdate = true;
    fovLines.geometry.computeBoundingSphere();
}

function animate() {
    requestAnimationFrame(animate);
    if (controls) controls.update();
    if (renderer) renderer.render(scene, camera);
}

// ==========================================
// 4. INITIALIZATION
// ==========================================

// Attach Listeners
const allInputs = document.querySelectorAll('input, select');
allInputs.forEach(el => {
    // Skip AR inputs for the generic listener to avoid double-firing or conflicts if we want custom behavior
    if (el !== ratioWInput && el !== ratioHInput) {
        el.addEventListener('input', calculateAndRender);
    }
});

// Specific listeners for AR to drive Height
ratioWInput.addEventListener('input', updateHeightFromAspectRatio);
ratioHInput.addEventListener('input', updateHeightFromAspectRatio);

// Specific listeners for Dimensions to drive AR
screenWidthInput.addEventListener('input', updateAspectRatioFromDimensions);
screenHeightInput.addEventListener('input', updateAspectRatioFromDimensions);

// Mode Switch
modeSelect.addEventListener("change", updateInputVisibility);

// Size Template Buttons
document.querySelectorAll('.size-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const diag = parseFloat(e.currentTarget.dataset.diag);
        if (diag > 0) applyDiagonalSize(diag);
    });
});

function applyDiagonalSize(diagInches) {
    const rW = parseFloat(ratioWInput.value) || 16;
    const rH = parseFloat(ratioHInput.value) || 9;

    // Angle of diagonal
    const angle = Math.atan(rH / rW);

    // W and H in inches
    const wInches = diagInches * Math.cos(angle);
    const hInches = diagInches * Math.sin(angle);

    // Helper to convert FROM inches to target unit
    const toUnit = (inches, unit) => {
        if (unit === 'mm') return inches * 25.4;
        if (unit === 'cm') return inches * 2.54;
        if (unit === 'm') return inches * 0.0254;
        if (unit === 'ft') return inches / 12;
        return inches;
    };

    // Update Inputs
    screenWidthInput.value = parseFloat(toUnit(wInches, widthUnitSelect.value).toFixed(1));
    screenHeightInput.value = parseFloat(toUnit(hInches, heightUnitSelect.value).toFixed(1));

    // Trigger Calc
    calculateAndRender();
}

// Boot up
updateInputVisibility();
init3D();
calculateAndRender();