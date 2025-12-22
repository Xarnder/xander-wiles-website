import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';

// --- Configuration ---
const CONFIG = {
    gridSize: 200,      // High detail
    worldSize: 30,      
    ballRadius: 0.5,    
    learningRate: 0.01,
    momentum: 0.0,
    lScale: 1.0,        
    lAmp: 1.0,          
    lComplexity: 3      
};

// --- State Variables ---
let scene, camera, renderer, controls;
let landscapeMesh, ballMesh;
let raycaster, mouse;
let ballPos = { x: 5, z: 5 }; 
let velocity = { x: 0, z: 0 };
let isBallRolling = true;
let epochCount = 0; 
let lossHistory = [];

// --- Landscape Math State ---
let noiseParams = []; 

// UI Elements
const nnCanvas = document.getElementById('nn-viz');
const nnCtx = nnCanvas.getContext('2d');
const chartCanvas = document.getElementById('loss-chart');
const chartCtx = chartCanvas.getContext('2d');
const debugEl = document.getElementById('debug-log');
const epochEl = document.getElementById('epoch-val');
const lossEl = document.getElementById('loss-val');
const wxEl = document.getElementById('wx-val');
const wzEl = document.getElementById('wz-val');

function log(msg, type = 'info') {
    if(debugEl) {
        debugEl.innerText = `> ${msg}`;
        debugEl.style.color = type === 'error' ? '#ff6b6b' : '#4fe24a';
    }
}

function init() {
    try {
        const container = document.getElementById('canvas-container');

        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x111115);
        scene.fog = new THREE.FogExp2(0x111115, 0.02);

        camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.set(25, 20, 25); 

        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        container.appendChild(renderer.domElement);

        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.maxPolarAngle = Math.PI / 2 - 0.1;

        raycaster = new THREE.Raycaster();
        mouse = new THREE.Vector2();

        setupLights();
        createAxesAndLabels();
        
        generateLandscapeMath(); 
        createLandscape(); 
        createBall();

        window.addEventListener('resize', onWindowResize);
        window.addEventListener('pointerdown', onPointerDown);
        setupUI();

        log("Ready. Landscape Generated.");
        animate();

    } catch (error) {
        console.error(error);
        log(error.message, 'error');
    }
}

function setupLights() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6); 
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(15, 25, 15);
    dirLight.castShadow = true;
    
    const d = CONFIG.worldSize * 1.5; 
    dirLight.shadow.camera.left = -d;
    dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d;
    dirLight.shadow.camera.bottom = -d;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    scene.add(dirLight);
}

function createAxesAndLabels() {
    const corner = -CONFIG.worldSize / 2; 

    // Axis Helper
    const axesHelper = new THREE.AxesHelper(CONFIG.worldSize);
    axesHelper.position.set(corner, 0.1, corner);
    // Make axes thicker/visible by brute force or just leave default R/G/B
    scene.add(axesHelper);

    // Text Labels
    const loader = new FontLoader();
    loader.load('https://unpkg.com/three@0.160.0/examples/fonts/helvetiker_regular.typeface.json', function (font) {
        // Changed color to WHITE (0xffffff) for better visibility
        const textMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
        
        function createLabel(text, x, y, z) {
            // Increased size slightly
            const geometry = new TextGeometry(text, { font: font, size: 0.9, height: 0.1 }); 
            const mesh = new THREE.Mesh(geometry, textMaterial);
            mesh.position.set(x, y, z);
            mesh.lookAt(camera.position); 
            scene.add(mesh);
        }
        createLabel("X", corner + CONFIG.worldSize * 0.95, 0, corner);
        createLabel("Loss", corner, CONFIG.worldSize * 0.6, corner); 
        createLabel("Z", corner, 0, corner + CONFIG.worldSize * 0.95);
    });
}

function onPointerDown(event) {
    if(event.target.closest('.ui-card')) return;
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(landscapeMesh);

    if (intersects.length > 0) {
        ballPos.x = intersects[0].point.x;
        ballPos.z = intersects[0].point.z;
        resetBallState();
    }
}

function generateLandscapeMath() {
    noiseParams = [];
    for(let i=0; i<6; i++) {
        noiseParams.push({
            angle: Math.random() * Math.PI * 2,
            offsetX: Math.random() * 100,
            offsetZ: Math.random() * 100,
            freqMul: 0.8 + Math.random() * 0.4,
            phase: Math.random() * Math.PI * 2
        });
    }
}

function getLoss(x, z) {
    let y = 0;
    const bowl = (x * x + z * z) * 0.02;
    let amp = CONFIG.lAmp * 3.5; 
    let freq = CONFIG.lScale * 0.15;

    for(let i = 0; i < CONFIG.lComplexity; i++) {
        const p = noiseParams[i];
        const cos = Math.cos(p.angle);
        const sin = Math.sin(p.angle);
        const nx = (x * cos - z * sin) * freq + p.offsetX;
        const nz = (x * sin + z * cos) * freq + p.offsetZ;
        const layerVal = Math.sin(nx) * Math.cos(nz * p.freqMul + p.phase);
        y += layerVal * amp;
        freq *= 1.8;
        amp *= 0.5;
    }
    return y + bowl + (CONFIG.lAmp * 4) + 2; 
}

function getGradient(x, z) {
    const h = 0.01;
    const c = getLoss(x, z);
    return { 
        x: (getLoss(x + h, z) - c) / h, 
        z: (getLoss(x, z + h) - c) / h 
    };
}

function createLandscape() {
    if (landscapeMesh) {
        updateLandscapeGeometry();
        return;
    }
    const geometry = new THREE.PlaneGeometry(CONFIG.worldSize, CONFIG.worldSize, CONFIG.gridSize, CONFIG.gridSize);
    geometry.rotateX(-Math.PI / 2);
    updateLandscapeGeometry(geometry);
    const material = new THREE.MeshStandardMaterial({
        vertexColors: true, roughness: 0.6, metalness: 0.1, side: THREE.DoubleSide
    });
    landscapeMesh = new THREE.Mesh(geometry, material);
    landscapeMesh.receiveShadow = true;
    scene.add(landscapeMesh);
}

function updateLandscapeGeometry(existingGeometry) {
    const geometry = existingGeometry || landscapeMesh.geometry;
    const count = geometry.attributes.position.count;
    const positions = geometry.attributes.position;
    const colors = [];
    const colorObj = new THREE.Color();
    let minY = Infinity;
    let maxY = -Infinity;
    
    for (let i = 0; i < count; i++) {
        const x = positions.getX(i);
        const z = positions.getZ(i);
        const y = getLoss(x, z);
        positions.setY(i, y);
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
    }

    for (let i = 0; i < count; i++) {
        const y = positions.getY(i);
        let t = (y - minY) / (maxY - minY);
        t = Math.max(0, Math.min(1, t));
        const hue = THREE.MathUtils.lerp(0.66, 0.0, t); 
        const light = THREE.MathUtils.lerp(0.4, 0.6, t);
        colorObj.setHSL(hue, 0.8, light);
        colors.push(colorObj.r, colorObj.g, colorObj.b);
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
}

function createBall() {
    if (ballMesh) scene.remove(ballMesh);
    ballMesh = new THREE.Mesh(
        new THREE.SphereGeometry(CONFIG.ballRadius, 32, 32),
        new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x444444 })
    );
    ballMesh.castShadow = true;
    scene.add(ballMesh);
    resetBallState();
}

function resetBallState() {
    isBallRolling = true;
    epochCount = 0;
    lossHistory = []; 
    velocity = { x: 0, z: 0 }; 
    if(epochEl) epochEl.innerText = "0";
}

function randomizeBallPosition() {
    const range = CONFIG.worldSize / 2 - 2; 
    ballPos.x = (Math.random() - 0.5) * 2 * range;
    ballPos.z = (Math.random() - 0.5) * 2 * range;
    resetBallState();
    log("Ball respawned.");
}

// --- 2D VISUALIZATIONS ---

function drawNetwork() {
    const w = nnCanvas.width;
    const h = nnCanvas.height;
    nnCtx.clearRect(0, 0, w, h);

    const inputX = 40, outputX = w - 40;
    const y1 = h/3, y2 = h - h/3, yOut = h/2;
    
    const weight1 = Math.abs(ballPos.x);
    const weight2 = Math.abs(ballPos.z);
    const thick1 = Math.min(8, Math.max(1, weight1 * 0.8));
    const thick2 = Math.min(8, Math.max(1, weight2 * 0.8));

    nnCtx.lineCap = "round";
    nnCtx.beginPath();
    nnCtx.moveTo(inputX, y1);
    nnCtx.lineTo(outputX, yOut);
    nnCtx.strokeStyle = `rgba(74, 144, 226, ${Math.min(1, thick1/3)})`;
    nnCtx.lineWidth = thick1;
    nnCtx.stroke();

    nnCtx.beginPath();
    nnCtx.moveTo(inputX, y2);
    nnCtx.lineTo(outputX, yOut);
    nnCtx.strokeStyle = `rgba(74, 144, 226, ${Math.min(1, thick2/3)})`;
    nnCtx.lineWidth = thick2;
    nnCtx.stroke();

    drawNode(nnCtx, inputX, y1, "x1");
    drawNode(nnCtx, inputX, y2, "x2");
    drawNode(nnCtx, outputX, yOut, "y");
}

function drawNode(ctx, x, y, label) {
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.strokeStyle = "#4a90e2";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#aaa";
    ctx.font = "10px sans-serif";
    ctx.fillText(label, x - 5, y + 20);
}

// --- UPDATED LOSS CHART ---
function drawLossChart() {
    const w = chartCanvas.width;
    const h = chartCanvas.height;
    chartCtx.clearRect(0, 0, w, h);
    
    chartCtx.fillStyle = "rgba(0,0,0,0.2)";
    chartCtx.fillRect(0,0,w,h);

    const pLeft = 30; // More space for labels
    const pBottom = 15;
    const pTop = 15;
    const pRight = 5;
    
    // Draw Axes (Brighter White)
    chartCtx.beginPath();
    chartCtx.strokeStyle = "#ffffff";
    chartCtx.lineWidth = 1.5;
    chartCtx.moveTo(pLeft, pTop);
    chartCtx.lineTo(pLeft, h - pBottom);
    chartCtx.lineTo(w - pRight, h - pBottom);
    chartCtx.stroke();

    if (lossHistory.length < 2) return;

    // Get range
    let minVal = Infinity;
    let maxVal = -Infinity;
    
    for(let val of lossHistory) {
        if(val < minVal) minVal = val;
        if(val > maxVal) maxVal = val;
    }
    
    // Add epsilon to range to prevent divide by zero on flat lines
    let range = maxVal - minVal;
    if(range < 0.0001) range = 0.0001;

    // --- NORMALIZATION: Scale curve to fit chart height ---
    const yMin = minVal;
    const yMax = maxVal;
    
    const graphW = w - pLeft - pRight;
    const graphH = h - pTop - pBottom;

    // Draw Curve
    chartCtx.beginPath();
    chartCtx.strokeStyle = "#4fe24a"; 
    chartCtx.lineWidth = 2;

    for (let i = 0; i < lossHistory.length; i++) {
        const loss = lossHistory[i];
        
        const x = pLeft + (i / (lossHistory.length - 1)) * graphW;
        
        // Normalize: (loss - min) / (max - min)
        const ratio = (loss - yMin) / range; 
        
        // Invert Y because canvas 0 is top
        const y = (h - pBottom) - (ratio * graphH);

        if (i === 0) chartCtx.moveTo(x, y);
        else chartCtx.lineTo(x, y);
    }
    chartCtx.stroke();

    // --- DRAW LABELS ---
    chartCtx.fillStyle = "#ffffff";
    chartCtx.font = "10px sans-serif";
    chartCtx.textAlign = "right";

    // Max Label (Top)
    chartCtx.fillText(maxVal.toFixed(2), pLeft - 4, pTop + 8);
    
    // Min Label (Bottom)
    chartCtx.fillText(minVal.toFixed(2), pLeft - 4, h - pBottom);
}

function animate() {
    requestAnimationFrame(animate);

    if (isBallRolling && ballMesh) {
        const grad = getGradient(ballPos.x, ballPos.z);
        
        velocity.x = (CONFIG.momentum * velocity.x) - (CONFIG.learningRate * grad.x);
        velocity.z = (CONFIG.momentum * velocity.z) - (CONFIG.learningRate * grad.z);

        ballPos.x += velocity.x;
        ballPos.z += velocity.z;

        const limit = CONFIG.worldSize / 2 - 0.5;
        if(ballPos.x > limit) { ballPos.x = limit; velocity.x = 0; }
        if(ballPos.x < -limit) { ballPos.x = -limit; velocity.x = 0; }
        if(ballPos.z > limit) { ballPos.z = limit; velocity.z = 0; }
        if(ballPos.z < -limit) { ballPos.z = -limit; velocity.z = 0; }

        const y = getLoss(ballPos.x, ballPos.z);
        ballMesh.position.set(ballPos.x, y + CONFIG.ballRadius, ballPos.z);

        epochCount++;
        lossHistory.push(y); 
        if(lossHistory.length > 300) lossHistory.shift(); 

        epochEl.innerText = epochCount;
        lossEl.innerText = y.toFixed(4);
        wxEl.innerText = ballPos.x.toFixed(2);
        wzEl.innerText = ballPos.z.toFixed(2);

        const speed = Math.sqrt(velocity.x**2 + velocity.z**2);
        if (speed < 0.0001 && Math.abs(grad.x) < 0.005 && Math.abs(grad.z) < 0.005) {
            isBallRolling = false;
            log(`Converged in ${epochCount} epochs.`);
        }
    }

    drawNetwork();
    drawLossChart();
    controls.update();
    renderer.render(scene, camera);
}

function setupUI() {
    const lrSlider = document.getElementById('learning-rate');
    const lrVal = document.getElementById('lr-value');
    lrSlider.addEventListener('input', (e) => {
        CONFIG.learningRate = parseFloat(e.target.value);
        lrVal.innerText = CONFIG.learningRate;
    });

    const momSlider = document.getElementById('momentum');
    const momVal = document.getElementById('mom-value');
    momSlider.addEventListener('input', (e) => {
        CONFIG.momentum = parseFloat(e.target.value);
        momVal.innerText = CONFIG.momentum;
    });

    const scaleSlider = document.getElementById('scale');
    const scaleVal = document.getElementById('scale-value');
    scaleSlider.addEventListener('input', (e) => {
        CONFIG.lScale = parseFloat(e.target.value);
        scaleVal.innerText = CONFIG.lScale;
        updateLandscapeGeometry();
    });

    const intSlider = document.getElementById('intensity');
    const intVal = document.getElementById('intensity-value');
    intSlider.addEventListener('input', (e) => {
        CONFIG.lAmp = parseFloat(e.target.value);
        intVal.innerText = CONFIG.lAmp;
        updateLandscapeGeometry();
    });

    const compSlider = document.getElementById('complexity');
    const compVal = document.getElementById('complexity-value');
    compSlider.addEventListener('input', (e) => {
        CONFIG.lComplexity = parseInt(e.target.value);
        compVal.innerText = CONFIG.lComplexity;
        updateLandscapeGeometry();
    });

    document.getElementById('btn-reset-ball').addEventListener('click', randomizeBallPosition);
    document.getElementById('btn-new-landscape').addEventListener('click', () => {
        log("Generating new landscape...");
        generateLandscapeMath(); 
        updateLandscapeGeometry();
        randomizeBallPosition();
    });
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

init();