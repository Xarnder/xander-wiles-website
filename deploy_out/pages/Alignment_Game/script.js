import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// --- Configuration ---------------------------------------------------------------------
// IMPORTANT: Update these paths to match your GLB file names.
const MODELS_CONFIG = {
    userModels: [
        { name: 'User A', path: 'models/user_model_a.glb' },
        { name: 'User B', path: 'models/user_model_b.glb' },
    ],
    targetModels: [
        { name: 'Target A', path: 'models/target_model_a.glb' },
        { name: 'Target B', path: 'models/target_model_b.glb' },
    ]
};

// --- Basic Scene Setup -----------------------------------------------------------------
console.log("DEBUG: Initializing scene...");
const canvas = document.querySelector('#c');
const renderer = new THREE.WebGLRenderer({ antialias: true, canvas });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a1a);
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 5, 20);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 1, 0);

// --- Lighting --------------------------------------------------------------------------
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 2);
directionalLight.position.set(5, 10, 7.5);
scene.add(directionalLight);
console.log("DEBUG: Scene and lighting initialized.");

// --- Model Loading and Management ------------------------------------------------------
const loader = new GLTFLoader();
let userModel, targetModel;
let targetMaterial = new THREE.MeshStandardMaterial({
    color: 0x007bff,
    transparent: true,
    opacity: 0.4,
    metalness: 0.1,
    roughness: 0.8
});

function loadUserModel(path) {
    if (userModel) scene.remove(userModel); // Remove old model if it exists
    loader.load(path, (gltf) => {
        userModel = gltf.scene;
        console.log(`DEBUG: User model loaded from ${path}.`, userModel);
        scene.add(userModel);
        randomizeUserModelTransform(); // Randomize on load
    }, undefined, (error) => console.error(`DEBUG: Error loading user model from ${path}.`, error));
}

function loadTargetModel(path) {
    if (targetModel) scene.remove(targetModel); // Remove old model
    loader.load(path, (gltf) => {
        targetModel = gltf.scene;
        console.log(`DEBUG: Target model loaded from ${path}.`, targetModel);
        
        // UPDATE: Randomize target position (X, Z) and Y rotation
        targetModel.position.x = (Math.random() - 0.5) * 10; // Range: -5 to 5
        targetModel.position.y = 0; // Keep it on the ground plane
        targetModel.position.z = (Math.random() - 0.5) * 10; // Range: -5 to 5
        
        targetModel.rotation.x = 0;
        targetModel.rotation.y = Math.random() * Math.PI * 2; // Full 360-degree rotation
        targetModel.rotation.z = 0;

        console.log(`DEBUG: Target randomized to Pos: [${targetModel.position.x.toFixed(2)}, 0, ${targetModel.position.z.toFixed(2)}] Rot-Y: ${targetModel.rotation.y.toFixed(2)}`);

        targetModel.traverse((node) => {
            if (node.isMesh) node.material = targetMaterial;
        });
        scene.add(targetModel);
    }, undefined, (error) => console.error(`DEBUG: Error loading target model from ${path}.`, error));
}

// --- UI Controls and Event Listeners ----------------------------------------------------
const sliders = {
    posX: document.getElementById('posX'), posY: document.getElementById('posY'), posZ: document.getElementById('posZ'),
    rotX: document.getElementById('rotX'), rotY: document.getElementById('rotY'), rotZ: document.getElementById('rotZ'),
    scaleX: document.getElementById('scaleX'), scaleY: document.getElementById('scaleY'), scaleZ: document.getElementById('scaleZ'),
};
const valueSpans = {
    posX: document.getElementById('posX-value'), posY: document.getElementById('posY-value'), posZ: document.getElementById('posZ-value'),
    rotX: document.getElementById('rotX-value'), rotY: document.getElementById('rotY-value'), rotZ: document.getElementById('rotZ-value'),
    scaleX: document.getElementById('scaleX-value'), scaleY: document.getElementById('scaleY-value'), scaleZ: document.getElementById('scaleZ-value'),
};

function updateUserModelFromSliders() {
    if (!userModel) return;
    userModel.position.set(sliders.posX.value, sliders.posY.value, sliders.posZ.value);
    userModel.rotation.set(sliders.rotX.value, sliders.rotY.value, sliders.rotZ.value);
    userModel.scale.set(sliders.scaleX.value, sliders.scaleY.value, sliders.scaleZ.value);
    for (const key in sliders) valueSpans[key].textContent = parseFloat(sliders[key].value).toFixed(2);
}

function updateSlidersFromModel() {
    if (!userModel) return;
    sliders.posX.value = userModel.position.x;
    sliders.posY.value = userModel.position.y;
    sliders.posZ.value = userModel.position.z;
    sliders.rotX.value = userModel.rotation.x;
    sliders.rotY.value = userModel.rotation.y;
    sliders.rotZ.value = userModel.rotation.z;
    sliders.scaleX.value = userModel.scale.x;
    sliders.scaleY.value = userModel.scale.y;
    sliders.scaleZ.value = userModel.scale.z;
    updateUserModelFromSliders(); // Sync UI text
}

function randomizeUserModelTransform() {
    if (!userModel) {
        console.warn("DEBUG: Cannot randomize, user model not loaded yet.");
        return;
    }
    console.log("DEBUG: Randomizing user model transform.");
    
    userModel.position.set((Math.random() - 0.5) * 15, Math.random() * 5, (Math.random() - 0.5) * 15);
    userModel.rotation.set((Math.random() - 0.5) * Math.PI * 2, (Math.random() - 0.5) * Math.PI * 2, (Math.random() - 0.5) * Math.PI * 2);
    
    const minScale = 0.5;
    const maxScale = 2.0;
    const scaleRange = maxScale - minScale;
    userModel.scale.set(Math.random() * scaleRange + minScale, Math.random() * scaleRange + minScale, Math.random() * scaleRange + minScale);

    updateSlidersFromModel();
}

for (const key in sliders) {
    sliders[key].addEventListener('input', updateUserModelFromSliders);
}

// --- Target Opacity Slider ---
const opacitySlider = document.getElementById('targetOpacity');
const opacityValue = document.getElementById('targetOpacity-value');
opacitySlider.addEventListener('input', () => {
    targetMaterial.opacity = parseFloat(opacitySlider.value);
    opacityValue.textContent = targetMaterial.opacity.toFixed(2);
});

// --- Model Selection Button Logic ----------------------------------------------------
function createModelButtons(containerId, models, onSelect) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    models.forEach((model, index) => {
        const button = document.createElement('button');
        button.textContent = model.name;
        button.className = 'model-btn';
        if (index === 0) button.classList.add('active');

        button.addEventListener('click', () => {
            container.querySelectorAll('.model-btn').forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            onSelect(model.path);
        });
        container.appendChild(button);
    });
}

createModelButtons('user-model-selection', MODELS_CONFIG.userModels, loadUserModel);
createModelButtons('target-model-selection', MODELS_CONFIG.targetModels, loadTargetModel);

// --- Main Action Buttons (Reset, Animate) --------------------------------------------
document.getElementById('reset-btn').addEventListener('click', () => {
    console.log("DEBUG: Reset button clicked.");
    randomizeUserModelTransform();
});

document.getElementById('auto-animate-btn').addEventListener('click', () => {
    if (!userModel || !targetModel) {
        console.error("DEBUG: Cannot animate, one or both models are not loaded.");
        return;
    }
    console.log("DEBUG: Starting auto-animation...");
    gsap.to(userModel.position, { duration: 1.5, ...targetModel.position, ease: "power3.inOut" });
    gsap.to(userModel.rotation, { duration: 1.5, ...targetModel.rotation, ease: "power3.inOut" });
    gsap.to(userModel.scale, {
        duration: 1.5,
        ...targetModel.scale,
        ease: "power3.inOut",
        onUpdate: updateSlidersFromModel,
        onComplete: () => console.log("DEBUG: Auto-animation complete.")
    });
});

// --- Initial Load --------------------------------------------------------------------
if (MODELS_CONFIG.targetModels.length > 0) {
    loadTargetModel(MODELS_CONFIG.targetModels[0].path);
} else {
    console.error("DEBUG: No target models defined in MODELS_CONFIG.");
}
if (MODELS_CONFIG.userModels.length > 0) {
    loadUserModel(MODELS_CONFIG.userModels[0].path);
} else {
    console.error("DEBUG: No user models defined in MODELS_CONFIG.");
}

// --- Render Loop -----------------------------------------------------------------------
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}
animate();

// --- Window Resize Handling ------------------------------------------------------------
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});