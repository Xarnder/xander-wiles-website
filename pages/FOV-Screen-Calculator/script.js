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

// ==========================================
// 5. CHART & CSV LOGIC
// ==========================================

const chartModal = document.getElementById("chart-modal");
const showChartBtn = document.getElementById("show-chart-btn");
const closeChartBtn = document.getElementById("close-chart");
const chartContainer = document.getElementById("chart-container");
const chartLegend = document.getElementById("chart-legend");
const chartUnitSelect = document.getElementById("chartUnit");
const chartSelection = document.getElementById("chart-selection");

let chartData = null;
let chartAnimated = false; // only animate on first open

// Unit conversion factors (from feet)
const ftConversions = {
    ft: 1,
    m: 0.3048,
    cm: 30.48,
    in: 12
};

const unitLabels = {
    ft: 'ft',
    m: 'm',
    cm: 'cm',
    in: 'in'
};

function convertFromFeet(valueFt, targetUnit) {
    return valueFt * (ftConversions[targetUnit] || 1);
}

showChartBtn.addEventListener("click", () => {
    chartModal.classList.remove("hidden");
    if (!chartData) {
        loadChartData();
    } else {
        renderChart();
    }
});

closeChartBtn.addEventListener("click", () => {
    chartModal.classList.add("hidden");
});

chartUnitSelect.addEventListener("change", () => {
    chartAnimated = false; // re-animate on unit change
    renderChart();
});

async function loadChartData() {
    try {
        const response = await fetch('TV-Distance.csv');
        const csvText = await response.text();
        parseCSV(csvText);
        renderChart();
    } catch (error) {
        console.error("Error loading CSV:", error);
    }
}

function parseCSV(text) {
    const lines = text.trim().split('\n');
    const headers = lines[0].split(',');

    // Store raw data in feet (original CSV unit)
    const data = {
        labels: [],
        datasets: headers.slice(1).map(h => ({
            label: h.replace(' Line (ft)', ''),
            pointsFt: [], // store raw feet values
            color: getDatasetColor(h)
        }))
    };

    for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',');
        const size = parseFloat(cols[0]);
        data.labels.push(size);

        for (let j = 1; j < cols.length; j++) {
            const val = cols[j].trim();
            const numericVal = parseFloat(val);
            if (!isNaN(numericVal)) {
                data.datasets[j - 1].pointsFt.push({ x: size, yFt: numericVal });
            }
        }
    }
    chartData = data;
}

function getDatasetColor(header) {
    if (header.includes('Ultra HD')) return '#3b82f6'; // Blue
    if (header.includes('1080p')) return '#10b981';    // Emerald
    if (header.includes('720p')) return '#f59e0b';     // Amber
    if (header.includes('DVD')) return '#ef4444';      // Red
    return '#8b5cf6'; // Violet
}

function renderChart() {
    if (!chartData) return;

    const unit = chartUnitSelect.value;
    const unitLabel = unitLabels[unit];

    const width = 400;
    const height = 300;
    const padding = 45;

    const xMin = Math.min(...chartData.labels);
    const xMax = Math.max(...chartData.labels);

    // Find the max Y across all datasets in the selected unit
    let yMaxRaw = 0;
    chartData.datasets.forEach(ds => {
        ds.pointsFt.forEach(pt => {
            const converted = convertFromFeet(pt.yFt, unit);
            if (converted > yMaxRaw) yMaxRaw = converted;
        });
    });
    // Round yMax up to a nice number
    const yMax = Math.ceil(yMaxRaw / 5) * 5 || 20;
    const yStep = yMax <= 10 ? 2 : yMax <= 30 ? 5 : 10;

    const getX = (val) => padding + ((val - xMin) / (xMax - xMin)) * (width - 2 * padding);
    const getY = (val) => (height - padding) - (val / yMax) * (height - 2 * padding);

    let svgHtml = `<svg viewBox="0 0 ${width} ${height}" class="chart-svg">`;

    // Grid lines & Axes
    svgHtml += `<line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" class="axis-line" />`;
    svgHtml += `<line x1="${padding}" y1="${padding}" x2="${padding}" y2="${height - padding}" class="axis-line" />`;

    // X-Axis Labels (Screen Size)
    chartData.labels.forEach(val => {
        const x = getX(val);
        svgHtml += `<text x="${x}" y="${height - padding + 18}" class="axis-label" text-anchor="middle">${val}"</text>`;
        svgHtml += `<line x1="${x}" y1="${height - padding}" x2="${x}" y2="${padding}" class="grid-line" />`;
    });

    // Y-Axis Labels (Distance in selected unit)
    for (let i = 0; i <= yMax; i += yStep) {
        const y = getY(i);
        svgHtml += `<text x="${padding - 8}" y="${y + 4}" class="axis-label" text-anchor="end">${i}${unitLabel}</text>`;
        svgHtml += `<line x1="${padding}" y1="${y}" x2="${width - padding}" y2="${y}" class="grid-line" />`;
    }

    // Datasets (paths first, then points on top)
    chartData.datasets.forEach((ds, dsIndex) => {
        if (ds.pointsFt.length < 2) return;

        const convertedPoints = ds.pointsFt.map(pt => ({
            x: pt.x,
            y: convertFromFeet(pt.yFt, unit),
            yFt: pt.yFt
        }));

        let pathD = `M ${getX(convertedPoints[0].x)} ${getY(convertedPoints[0].y)}`;
        for (let i = 1; i < convertedPoints.length; i++) {
            pathD += ` L ${getX(convertedPoints[i].x)} ${getY(convertedPoints[i].y)}`;
        }

        svgHtml += `<path d="${pathD}" class="data-line" style="stroke: ${ds.color};" id="path-${dsIndex}" />`;
    });

    // Points (rendered after paths so they sit on top)
    chartData.datasets.forEach((ds, dsIndex) => {
        if (ds.pointsFt.length < 2) return;

        ds.pointsFt.forEach((pt, ptIndex) => {
            const yConverted = convertFromFeet(pt.yFt, unit);
            svgHtml += `<circle 
                cx="${getX(pt.x)}" 
                cy="${getY(yConverted)}" 
                r="4" 
                fill="${ds.color}" 
                class="data-point" 
                data-ds="${dsIndex}" 
                data-pt="${ptIndex}"
                data-size="${pt.x}" 
                data-dist-ft="${pt.yFt}"
                data-label="${ds.label}">
                <title>${ds.label}: ${yConverted.toFixed(1)}${unitLabel} at ${pt.x}"</title>
            </circle>`;
        });
    });

    svgHtml += `</svg>`;
    chartContainer.innerHTML = svgHtml;

    // Attach click handlers to data points
    chartContainer.querySelectorAll('.data-point').forEach(circle => {
        circle.addEventListener('click', handlePointClick);
    });

    // Render Legend
    chartLegend.innerHTML = chartData.datasets.map(ds => `
        <div class="legend-item">
            <div class="legend-color" style="background: ${ds.color}"></div>
            <span>${ds.label}</span>
        </div>
    `).join('');

    // Animate lines (only on first open or unit change)
    if (!chartAnimated) {
        setTimeout(() => {
            chartData.datasets.forEach((ds, i) => {
                const path = document.getElementById(`path-${i}`);
                if (path) {
                    const length = path.getTotalLength();
                    path.style.strokeDasharray = length;
                    path.style.strokeDashoffset = length;
                    path.getBoundingClientRect(); // force reflow
                    path.style.transition = `stroke-dashoffset 1.5s ease-in-out ${i * 0.2}s`;
                    path.style.strokeDashoffset = '0';
                }
            });
            chartAnimated = true;
        }, 50);
    }
}

function handlePointClick(e) {
    const circle = e.currentTarget;
    const sizeInches = parseFloat(circle.dataset.size);
    const distFt = parseFloat(circle.dataset.distFt);
    const label = circle.dataset.label;
    const unit = chartUnitSelect.value;
    const unitLabel = unitLabels[unit];

    // Convert distance from feet to the calculator's distance unit
    const distMeters = distFt * 0.3048;

    // Convert screen diagonal (inches) to width using aspect ratio
    const rW = parseFloat(ratioWInput.value) || 16;
    const rH = parseFloat(ratioHInput.value) || 9;
    const angle = Math.atan(rH / rW);
    const widthInches = sizeInches * Math.cos(angle);
    const heightInches = sizeInches * Math.sin(angle);

    // Convert to the user-chosen units in the main calculator
    const widthUnit = widthUnitSelect.value;
    const heightUnit = heightUnitSelect.value;
    const distUnit = distUnitSelect.value;

    const inchesToUnit = (inches, targetUnit) => {
        const meters = inches * 0.0254;
        return fromMeters(meters, targetUnit);
    };

    const metersToUnit = (m, targetUnit) => {
        return fromMeters(m, targetUnit);
    };

    // Set values into the calculator inputs
    screenWidthInput.value = parseFloat(inchesToUnit(widthInches, widthUnit).toFixed(1));
    screenHeightInput.value = parseFloat(inchesToUnit(heightInches, heightUnit).toFixed(1));
    viewDistanceInput.value = parseFloat(metersToUnit(distMeters, distUnit).toFixed(1));

    // Trigger recalculation
    calculateAndRender();

    // Show selection feedback
    const distConverted = convertFromFeet(distFt, unit);
    chartSelection.classList.remove('hidden');
    chartSelection.innerHTML = `
        <span class="sel-icon">📺</span>
        <span class="sel-text">
            <strong>${sizeInches}" ${label}</strong> → ${distConverted.toFixed(1)}${unitLabel} away. Values applied!
        </span>
    `;

    // Highlight the active point
    chartContainer.querySelectorAll('.data-point').forEach(c => c.classList.remove('data-point-active'));
    circle.classList.add('data-point-active');
}