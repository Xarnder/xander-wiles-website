import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import * as CANNON from 'cannon-es';

// --- SPLITSCREEN ---
const P1_LAYER = 1;
const P2_LAYER = 2;

let isMenuOpen = false;

// --- Scene Configuration ---
const NATURE_GRASS_DENSITY = 1000000; // Experiment with this density
const NATURE_GRASS_SCALE = 0.6;     // Experiment with this scale
const NATURE_TREE_SCALE = 0.5;      // Experiment with this scale
const NATURE_SHADOW_RADIUS = 50;     // Experiment with shadow softness (Requires PCFSoftShadowMap)
const SCENES = [
  { name: 'Condo', path: './assets/scenes/Condo/', spawnPoint: { x: -8, y: 2, z: 12 }, exposure: 0.003 },
  { name: 'Bedroom', path: './assets/scenes/Bedroom/', spawnPoint: { x: 2, y: 1.5, z: 4 }, exposure: 0.3 },
  { name: 'House', path: './assets/scenes/House/', spawnPoint: { x: 30, y: 2, z: 0 }, exposure: 0.3 },
  { name: 'Nature Scene', type: 'procedural', spawnPoint: { x: 0, y: 1, z: 0 }, exposure: 0.15 },
];
let currentSceneConfig = null;

// --- UI ---
const statusEl = document.getElementById('status');
const debugEl = document.getElementById('debug');
const fpsEl = document.getElementById('fps');
const uiPanel = document.getElementById('ui');
const btnCollapse = document.getElementById('btnCollapse');
const btnCloseMenu = document.getElementById('btnCloseMenu');
const btnDebug = document.getElementById('btnDebug');
const toggleCollisionEl = document.getElementById('toggleCollision');
const toggleFlyEl = document.getElementById('toggleFly');
const sceneSelectorEl = document.getElementById('sceneSelector');
const toggleSplitScreenEl = document.getElementById('toggleSplitScreen');
// Visual settings UI
const exposureSlider = document.getElementById('exposure');
const exposureValue = document.getElementById('exposureValue');
const fovSlider = document.getElementById('fovSlider');
const fovValue = document.getElementById('fovValue');
const lightScaleSlider = document.getElementById('lightScale');
const lightScaleValue = document.getElementById('lightScaleValue');
const toggleHQLightingEl = document.getElementById('toggleHQLighting');
const shadowQualitySlider = document.getElementById('shadowQuality');
const shadowQualityValue = document.getElementById('shadowQualityValue');
// Player settings UI
const moveSpeedSlider = document.getElementById('moveSpeed');
const moveSpeedValue = document.getElementById('moveSpeedValue');
const jumpHeightSlider = document.getElementById('jumpHeight');
const jumpHeightValue = document.getElementById('jumpHeightValue');
const playerHeightSlider = document.getElementById('playerHeight');
const playerHeightValue = document.getElementById('playerHeightValue');
const playerWidthSlider = document.getElementById('playerWidth');
const playerWidthValue = document.getElementById('playerWidthValue');
// --- SENSITIVITY SLIDER ---
const gamepadSettingsDiv = document.getElementById('gamepad-settings');
const gamepadSensSlider = document.getElementById('gamepadSens');
const gamepadSensValue = document.getElementById('gamepadSensValue');

// --- Loading UI ---
const loadingScreen = document.getElementById('loading-screen');
const progressBar = document.getElementById('progress-bar');
const loadingPercentage = document.getElementById('loading-percentage');

// --- LocalStorage ---
const LS = window.localStorage;
const LS_UI_COLLAPSED = 'fps.ui.collapsed';
const LS_DEBUG_VISIBLE = 'fps.debug.visible';
const LS_CURRENT_SCENE = 'fps.currentScene';
const LS_EXPOSURE = 'fps.exposure';
const LS_FOV = 'fps.fov';
const LS_LIGHT_SCALE = 'fps.lightScale';
const LS_HQ_LIGHTING = 'fps.hqLighting';
const LS_SHADOW_QUALITY = 'fps.shadowQuality';
const LS_MOVE_SPEED = 'fps.moveSpeed';
const LS_JUMP_HEIGHT = 'fps.jumpHeight';
const LS_PLAYER_HEIGHT = 'fps.playerHeight';
const LS_PLAYER_WIDTH = 'fps.playerWidth';
const LS_GAMEPAD_SENSITIVITY = 'fps.gamepadSensitivity'; // --- SENSITIVITY SLIDER ---
const LS_CONTROL_MODE = 'fps.controlMode'; // For manual override of touch/desktop controls

// --- Control Mode Detection & Switching ---
let preferredControlMode = LS.getItem(LS_CONTROL_MODE); // Can be 'desktop', 'touch', or null

// Auto-detect if no preference is set. window.matchMedia is more reliable for detecting primary input.
// This helps prevent desktops with touchscreens from defaulting to touch controls.
const isLikelyTouch = window.matchMedia("(pointer: coarse)").matches;

let effectiveControlMode;
if (preferredControlMode === 'desktop' || preferredControlMode === 'touch') {
  effectiveControlMode = preferredControlMode;
} else {
  // No user preference saved, so auto-detect
  effectiveControlMode = isLikelyTouch ? 'touch' : 'desktop';
}
const isTouchDevice = effectiveControlMode === 'touch';


// --- Load Settings ---
if (LS.getItem(LS_UI_COLLAPSED) === 'true' && !isTouchDevice) uiPanel.classList.add('collapsed');
let debugVisible = LS.getItem(LS_DEBUG_VISIBLE) !== 'false';
debugEl.style.display = debugVisible ? 'block' : 'none';
let exposure = parseFloat(LS.getItem(LS_EXPOSURE) ?? '0.25');
exposureSlider.value = exposure; exposureValue.textContent = exposure.toFixed(2);
let cameraFov = parseInt(LS.getItem(LS_FOV) ?? '75', 10);
fovSlider.value = cameraFov; fovValue.textContent = cameraFov;
// Fix: Must be 'let' to allow reassignment by slider
let lightScale = parseFloat(LS.getItem(LS_LIGHT_SCALE) ?? '0.00200');
let ambientIntensity = parseFloat(LS.getItem('AmbientIntensity') ?? '0.5'); // Restored default
let sunIntensity = parseFloat(LS.getItem('SunIntensity') ?? '8.5'); // Default 8.5

// Sync UI
lightScaleSlider.value = lightScale; lightScaleValue.textContent = lightScale.toFixed(5);
const ambientSlider = document.getElementById('ambientIntensity');
const ambientValueEl = document.getElementById('ambientValue');
if (ambientSlider) { ambientSlider.value = ambientIntensity; ambientValueEl.textContent = ambientIntensity; }
const sunSlider = document.getElementById('sunIntensity');
const sunValueEl = document.getElementById('sunValue');
if (sunSlider) { sunSlider.value = sunIntensity; sunValueEl.textContent = sunIntensity; }

const SHADOW_QUALITY_LABELS = ['Off', 'Low', 'Medium', 'High'];
let hqLighting = LS.getItem(LS_HQ_LIGHTING) !== 'false';
toggleHQLightingEl.checked = hqLighting;
let shadowQuality = parseInt(LS.getItem(LS_SHADOW_QUALITY) ?? '2', 10);
shadowQualitySlider.value = shadowQuality; shadowQualityValue.textContent = SHADOW_QUALITY_LABELS[shadowQuality];
let baseMoveSpeed = parseFloat(LS.getItem(LS_MOVE_SPEED) ?? '4.0');
moveSpeedSlider.value = baseMoveSpeed; moveSpeedValue.textContent = baseMoveSpeed.toFixed(1);
let jumpHeight = parseFloat(LS.getItem(LS_JUMP_HEIGHT) ?? '5.5');
jumpHeightSlider.value = jumpHeight; jumpHeightValue.textContent = jumpHeight.toFixed(1);
let playerHeight = parseFloat(LS.getItem(LS_PLAYER_HEIGHT) ?? '1.6');
playerHeightSlider.value = playerHeight; playerHeightValue.textContent = playerHeight.toFixed(2) + ' m';
let playerWidth = parseFloat(LS.getItem(LS_PLAYER_WIDTH) ?? '0.35');
playerWidthSlider.value = playerWidth; playerWidthValue.textContent = playerWidth.toFixed(2) + ' m';
// --- SENSITIVITY SLIDER ---
let gamepadSensitivity = parseFloat(LS.getItem(LS_GAMEPAD_SENSITIVITY) ?? '1.8');
gamepadSensSlider.value = gamepadSensitivity;
gamepadSensValue.textContent = gamepadSensitivity.toFixed(1);

// --- Event Listeners ---
function toggleUIPanel() { uiPanel.classList.toggle('collapsed'); LS.setItem(LS_UI_COLLAPSED, uiPanel.classList.contains('collapsed')); }
btnCollapse.addEventListener('click', toggleUIPanel);
btnDebug.addEventListener('click', () => toggleDebug());
exposureSlider.addEventListener('input', () => { exposure = parseFloat(exposureSlider.value); exposureValue.textContent = exposure.toFixed(3); LS.setItem(LS_EXPOSURE, exposure); applyExposure(); });
fovSlider.addEventListener('input', () => {
  cameraFov = parseInt(fovSlider.value, 10);
  fovValue.textContent = cameraFov; LS.setItem(LS_FOV, cameraFov);
  camera.fov = cameraFov; camera.updateProjectionMatrix();
  if (camera2) { camera2.fov = cameraFov; camera2.updateProjectionMatrix(); }
});
lightScaleSlider.addEventListener('input', () => { lightScale = parseFloat(lightScaleSlider.value); lightScaleValue.textContent = lightScale.toFixed(5); LS.setItem(LS_LIGHT_SCALE, lightScale); applyLightScale(); });
if (ambientSlider) ambientSlider.addEventListener('input', () => { ambientIntensity = parseFloat(ambientSlider.value); ambientValueEl.textContent = ambientIntensity; LS.setItem('AmbientIntensity', ambientIntensity); applyLightScale(); });
if (sunSlider) sunSlider.addEventListener('input', () => { sunIntensity = parseFloat(sunSlider.value); sunValueEl.textContent = sunIntensity; LS.setItem('SunIntensity', sunIntensity); applyLightScale(); });

toggleHQLightingEl.addEventListener('change', e => { hqLighting = e.target.checked; LS.setItem(LS_HQ_LIGHTING, hqLighting); updateLightingSettings(); });
shadowQualitySlider.addEventListener('input', () => { shadowQuality = parseInt(shadowQualitySlider.value, 10); LS.setItem(LS_SHADOW_QUALITY, shadowQuality); updateLightingSettings(); });
moveSpeedSlider.addEventListener('input', () => { baseMoveSpeed = parseFloat(moveSpeedSlider.value); moveSpeedValue.textContent = baseMoveSpeed.toFixed(1); LS.setItem(LS_MOVE_SPEED, baseMoveSpeed); });
jumpHeightSlider.addEventListener('input', () => { jumpHeight = parseFloat(jumpHeightSlider.value); jumpHeightValue.textContent = jumpHeight.toFixed(1); LS.setItem(LS_JUMP_HEIGHT, jumpHeight); });
playerHeightSlider.addEventListener('input', () => { playerHeight = parseFloat(playerHeightSlider.value); playerHeightValue.textContent = playerHeight.toFixed(2) + ' m'; LS.setItem(LS_PLAYER_HEIGHT, playerHeight); recreatePlayerBody(); if (isSplitScreen) recreatePlayer2Body(); });
playerWidthSlider.addEventListener('input', () => { playerWidth = parseFloat(playerWidthSlider.value); playerWidthValue.textContent = playerWidth.toFixed(2) + ' m'; LS.setItem(LS_PLAYER_WIDTH, playerWidth); recreatePlayerBody(); if (isSplitScreen) recreatePlayer2Body(); });
toggleSplitScreenEl.addEventListener('change', e => setSplitScreen(e.target.checked));
// --- SENSITIVITY SLIDER ---
gamepadSensSlider.addEventListener('input', () => {
  gamepadSensitivity = parseFloat(gamepadSensSlider.value);
  gamepadSensValue.textContent = gamepadSensitivity.toFixed(1);
  LS.setItem(LS_GAMEPAD_SENSITIVITY, gamepadSensitivity);
});

function toggleDebug() { debugVisible = !debugVisible; debugEl.style.display = debugVisible ? 'block' : 'none'; LS.setItem(LS_DEBUG_VISIBLE, debugVisible); }
function log(...args) { console.log(...args); if (!debugVisible) return; debugEl.textContent += args.join(' ') + '\n'; debugEl.scrollTop = debugEl.scrollHeight; }
const base = (url) => (url || '').split('/').pop();

// --- Renderer/Scene/Camera ---
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.physicallyCorrectLights = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
function applyExposure() { renderer.toneMappingExposure = exposure; }
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0f14);
const camera = new THREE.PerspectiveCamera(cameraFov, 2, 0.05, 5000);
const hemi = new THREE.HemisphereLight(0xffffff, 0x222233, 0.5); hemi.name = 'DefaultHemi';
const dir = new THREE.DirectionalLight(0xffffff, 0.6); dir.position.set(10, 15, 10); dir.name = 'DefaultDir';
dir.shadow.bias = -0.0005; dir.shadow.normalBias = 0.02;
scene.add(new THREE.AxesHelper(1.0));
const grid = new THREE.GridHelper(200, 200, 0x334455, 0x223344); grid.material.opacity = 0.15; grid.material.transparent = true; grid.position.y = -0.001; scene.add(grid);

// --- SPLITSCREEN ---
let isSplitScreen = false;
let camera2, playerBody2, playerCapsule2, controls2;
const euler2 = new THREE.Euler(0, 0, 0, 'YXZ');

// --- Controls (Desktop vs Touch) ---
let controls;
const euler = new THREE.Euler(0, 0, 0, 'YXZ');
const touchState = { look: { id: -1, active: false, startX: 0, startY: 0, currentX: 0, currentY: 0 }, joystick: { id: -1, active: false, startX: 0, startY: 0, currentX: 0, currentY: 0 } };
if (!isTouchDevice) {
  controls = new PointerLockControls(camera, document.body);
  document.addEventListener('click', () => { if (document.pointerLockElement !== document.body) controls.lock(); });
}

// --- Physics ---
const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
world.broadphase = new CANNON.SAPBroadphase(world);
world.allowSleep = true;
const worldMat = new CANNON.Material('world');
const playerMat = new CANNON.Material('player');
world.addContactMaterial(new CANNON.ContactMaterial(worldMat, playerMat, { friction: 0.0, restitution: 0.0 }));
let playerBody, playerCapsule;
let PLAYER_RADIUS, PLAYER_HEIGHT, HALF;

function createPlayerPhysicsBody() {
  const body = new CANNON.Body({ mass: 70, material: playerMat, linearDamping: 0.05, allowSleep: false, fixedRotation: true });
  body.addShape(new CANNON.Sphere(PLAYER_RADIUS), new CANNON.Vec3(0, +HALF, 0));
  body.addShape(new CANNON.Sphere(PLAYER_RADIUS), new CANNON.Vec3(0, -HALF, 0));
  body.updateMassProperties();
  return body;
}

function recreatePlayerBody() {
  const oldPosition = playerBody ? new CANNON.Vec3().copy(playerBody.position) : new CANNON.Vec3(0, 20, 0);
  const oldVelocity = playerBody ? new CANNON.Vec3().copy(playerBody.velocity) : new CANNON.Vec3(0, 0, 0);
  if (playerBody) world.removeBody(playerBody);
  PLAYER_HEIGHT = playerHeight; PLAYER_RADIUS = playerWidth;
  HALF = (PLAYER_HEIGHT / 2) - PLAYER_RADIUS;
  if (HALF < 0) HALF = 0;
  playerBody = createPlayerPhysicsBody();
  playerBody.position.copy(oldPosition);
  playerBody.velocity.copy(oldVelocity);
  world.addBody(playerBody);
  if (playerCapsule) scene.remove(playerCapsule);
  const capsuleGeo = new THREE.CapsuleGeometry(PLAYER_RADIUS, PLAYER_HEIGHT - (PLAYER_RADIUS * 2), 8, 16);
  const capsuleMat = new THREE.MeshStandardMaterial({ color: 0x0088ff, roughness: 0.6 });
  playerCapsule = new THREE.Mesh(capsuleGeo, capsuleMat);
  playerCapsule.layers.set(P1_LAYER);
  scene.add(playerCapsule);
}
recreatePlayerBody();

function recreatePlayer2Body() {
  if (!playerBody2) return;
  const oldPosition = playerBody2 ? new CANNON.Vec3().copy(playerBody2.position) : new CANNON.Vec3(0, 20, 0);
  const oldVelocity = playerBody2 ? new CANNON.Vec3().copy(playerBody2.velocity) : new CANNON.Vec3(0, 0, 0);
  if (playerBody2) world.removeBody(playerBody2);
  playerBody2 = createPlayerPhysicsBody();
  playerBody2.position.copy(oldPosition);
  playerBody2.velocity.copy(oldVelocity);
  world.addBody(playerBody2);
  if (playerCapsule2) scene.remove(playerCapsule2);
  const capsuleGeo = new THREE.CapsuleGeometry(PLAYER_RADIUS, PLAYER_HEIGHT - (PLAYER_RADIUS * 2), 8, 16);
  const capsuleMat = new THREE.MeshStandardMaterial({ color: 0xff8800, roughness: 0.6 });
  playerCapsule2 = new THREE.Mesh(capsuleGeo, capsuleMat);
  playerCapsule2.layers.set(P2_LAYER);
  scene.add(playerCapsule2);
}

function setSplitScreen(enabled) {
  isSplitScreen = enabled;
  if (enabled) {
    log('Split screen ENABLED');
    camera2 = new THREE.PerspectiveCamera(cameraFov, 1, 0.05, 5000);
    playerBody2 = createPlayerPhysicsBody();
    world.addBody(playerBody2);
    recreatePlayer2Body();
    controls2 = { getDirection: (v) => v.copy(camera2.getWorldDirection(new THREE.Vector3())) };
    camera.layers.enableAll(); camera.layers.disable(P1_LAYER);
    camera2.layers.enableAll(); camera2.layers.disable(P2_LAYER);
    respawn();
  } else {
    log('Split screen DISABLED');
    if (playerBody2) world.removeBody(playerBody2);
    if (playerCapsule2) scene.remove(playerCapsule2);
    playerBody2 = null; playerCapsule2 = null; camera2 = null; controls2 = null;
    camera.layers.enableAll();
    handleResize();
  }
}

// --- Input ---
const keys = { w: false, a: false, s: false, d: false, space: false, shift: false, q: false, e: false, ctrl: false };
const keys2 = { up: false, left: false, down: false, right: false, rshift: false };

addEventListener('keydown', (e) => {
  setKey(e.code, true);
  if (e.code === 'KeyM') toggleUIPanel();
  if (e.code === 'KeyF') toggleFly(); if (e.code === 'KeyR') respawn();
  if (e.code === 'KeyH') toggleCollision(); if (e.code === 'Backquote') toggleDebug();
});
addEventListener('keyup', (e) => setKey(e.code, false));

function setKey(code, v) {
  if (code === 'KeyW') keys.w = v; if (code === 'KeyA') keys.a = v; if (code === 'KeyS') keys.s = v; if (code === 'KeyD') keys.d = v;
  if (code === 'Space') keys.space = v; if (code === 'ShiftLeft') keys.shift = v;
  if (code === 'KeyQ') keys.q = v; if (code === 'KeyE') keys.e = v; if (code === 'ControlLeft') keys.ctrl = v;
  playerBody.wakeUp();
  if (code === 'ArrowUp') keys2.up = v; if (code === 'ArrowLeft') keys2.left = v;
  if (code === 'ArrowDown') keys2.down = v; if (code === 'ArrowRight') keys2.right = v;
  if (code === 'ShiftRight') keys2.rshift = v;
  if (playerBody2) playerBody2.wakeUp();
}

function respawn() {
  const sp = currentSceneConfig?.spawnPoint || { x: 0, y: 20, z: 0 };
  playerBody.position.set(sp.x, sp.y, sp.z);
  playerBody.velocity.set(0, 0, 0);
  playerBody.wakeUp();
  log(`P1 Respawned at ${sp.x}, ${sp.y}, ${sp.z}`);
  if (isSplitScreen && playerBody2) {
    playerBody2.position.set(sp.x + 2, sp.y, sp.z);
    playerBody2.velocity.set(0, 0, 0);
    playerBody2.wakeUp();
    log(`P2 Respawned at ${sp.x + 2}, ${sp.y}, ${sp.z}`);
  }
}

// --- Loading & Scene Management (omitted for brevity, no changes) ---
const manager = new THREE.LoadingManager();
manager.onStart = (url, l, t) => {
  loadingScreen.classList.remove('fade-out');
  progressBar.style.width = '0%';
  loadingPercentage.textContent = '0%';
  statusEl.textContent = `Starting: ${base(url)} (0/${t})`;
  log('onStart', base(url), l, t);
};
manager.onProgress = (url, l, t) => {
  const p = t ? Math.round(l / t * 100) : 0;
  progressBar.style.width = `${p}%`;
  loadingPercentage.textContent = `${p}%`;
  statusEl.textContent = `Loading ${l}/${t} – ${base(url)} (${p}%)`;
};
manager.onError = (url) => {
  statusEl.textContent = `Error: ${base(url)}`;
  log('onError', url);
};
manager.onLoad = () => {
  log('All assets loaded for the current scene.');
  // Fade out after a short delay to ensure the user sees 100%
  setTimeout(() => {
    loadingScreen.classList.add('fade-out');
  }, 500);
};
const loader = new GLTFLoader(manager);
const draco = new DRACOLoader(); draco.setDecoderPath('https://unpkg.com/three@0.159.0/examples/jsm/libs/draco/'); loader.setDRACOLoader(draco);
loader.setMeshoptDecoder(MeshoptDecoder);
let collisionSceneGroup = null;
function setCollisionVisible(on) { if (collisionSceneGroup) collisionSceneGroup.visible = on; if (toggleCollisionEl) toggleCollisionEl.checked = !!on; log('Collision render', on ? 'ON' : 'OFF'); }
function toggleCollision() { const on = !(collisionSceneGroup && collisionSceneGroup.visible); setCollisionVisible(on); }
toggleCollisionEl?.addEventListener('change', e => setCollisionVisible(e.target.checked));
let flyMode = false;
function setFly(on) {
  flyMode = on;
  toggleFlyEl && (toggleFlyEl.checked = on);
  world.gravity.set(0, on ? 0 : -9.82, 0);
  if (on) { playerBody.velocity.y = 0; if (playerBody2) playerBody2.velocity.y = 0; }
  log('Fly', on ? 'ON' : 'OFF');
  if (isTouchDevice) {
    const up = document.getElementById('touch-up');
    const down = document.getElementById('touch-down');
    if (up) up.style.display = on ? 'flex' : 'none';
    if (down) down.style.display = on ? 'flex' : 'none';
  }
}
function toggleFly() { setFly(!flyMode); }
toggleFlyEl?.addEventListener('change', e => setFly(e.target.checked));
async function loadHDRWithFallback(localPath, fallbackUrl) {
  return new Promise((resolve) => {
    const loader = new RGBELoader(manager);
    loader.load(localPath, t => resolve(t), undefined, () => {
      new RGBELoader(manager).load(fallbackUrl, t => resolve(t));
    });
  });
}
const importedLights = [];
const defaultLights = [hemi, dir];
const allLights = [];
const allEmissives = [];
let storedEnvMap = null;
let ambientFallback = null;
const SHADOW_MAP_SIZES = [0, 512, 1024, 2048];
function updateLightingSettings() {
  if (hqLighting) { scene.environment = storedEnvMap; if (ambientFallback) scene.remove(ambientFallback); }
  else { scene.environment = null; if (!ambientFallback) ambientFallback = new THREE.AmbientLight(0xffffff, 0.5); scene.add(ambientFallback); }
  const shadowSize = SHADOW_MAP_SIZES[shadowQuality];
  const shadowsEnabled = hqLighting && shadowSize > 0;
  renderer.shadowMap.enabled = shadowsEnabled;
  for (const light of allLights) {
    if (light.shadow) {
      light.castShadow = shadowsEnabled;
      if (shadowsEnabled && light.shadow.mapSize.width !== shadowSize) {
        light.shadow.mapSize.set(shadowSize, shadowSize);
        if (light.shadow.map) { light.shadow.map.dispose(); light.shadow.map = null; }
      }
    }
  }
  if (shadowQualityValue) shadowQualityValue.textContent = SHADOW_QUALITY_LABELS[shadowQuality];
}
function applyLightScale() {
  // log('Applying scale:', lightScale); // Debug
  for (const l of allLights) {
    if (l.isHemisphereLight || l.isAmbientLight) {
      // Controlled by Ambient Slider
      l.intensity = ambientIntensity;
    } else if (l.isDirectionalLight) {
      // Controlled by Sun Slider (Sun)
      l.intensity = sunIntensity;
    } else {
      // Point/Spot/Rect -> Controlled by Light Scale Slider
      if (l._baseIntensity === undefined) l._baseIntensity = l.intensity;
      l.intensity = l._baseIntensity * lightScale;
    }
  }
  for (const mat of allEmissives) {
    if (mat._baseEmissive === undefined) mat._baseEmissive = mat.emissiveIntensity;
    // Map lightScale (approx 0.002) to Emissive (~1.0) -> x500
    mat.emissiveIntensity = mat._baseEmissive * (lightScale * 500);
  }
}
let currentVisualScene = null;
let currentCollisionBodies = [];
function clearCurrentScene() {
  if (currentVisualScene) { scene.remove(currentVisualScene); currentVisualScene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (Array.isArray(o.material)) o.material.forEach(m => m.dispose()); else o.material.dispose(); } }); currentVisualScene = null; }
  if (collisionSceneGroup) { scene.remove(collisionSceneGroup); collisionSceneGroup = null; }
  currentCollisionBodies.forEach(body => world.removeBody(body)); currentCollisionBodies = [];
  importedLights.forEach(light => scene.remove(light)); importedLights.length = 0; allLights.length = 0; allEmissives.length = 0;
  scene.remove(hemi, dir); if (ambientFallback) scene.remove(ambientFallback);
}
async function loadScene(sceneConfig) {
  clearCurrentScene();
  currentSceneConfig = sceneConfig;

  // Use VSMShadowMap for Nature Scene (supports soft radius), PCFSoft for others
  if (sceneConfig.name === 'Nature Scene') {
    renderer.shadowMap.type = THREE.VSMShadowMap;
  } else {
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }
  renderer.shadowMap.needsUpdate = true;

  // Apply per-scene exposure defaults
  exposure = (sceneConfig.exposure !== undefined) ? sceneConfig.exposure : 0.3;
  if (exposureSlider) {
    exposureSlider.value = exposure;
    if (exposureValue) exposureValue.textContent = exposure.toFixed(3);
  }
  applyExposure();

  statusEl.textContent = `Loading ${sceneConfig.name}...`;
  // Ensure loading screen is shown when manually switching scenes
  loadingScreen.classList.remove('fade-out');
  progressBar.style.width = '0%';
  loadingPercentage.textContent = '0%';
  try {
    if (!storedEnvMap) {
      const hdrTex = await loadHDRWithFallback('./assets/env/venice_sunset_1k.hdr', 'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/equirectangular/venice_sunset_1k.hdr');
      hdrTex.mapping = THREE.EquirectangularReflectionMapping; const pmrem = new THREE.PMREMGenerator(renderer);
      storedEnvMap = pmrem.fromEquirectangular(hdrTex).texture; hdrTex.dispose(); pmrem.dispose();
    }
    if (sceneConfig.type === 'procedural') {
      if (sceneConfig.name === 'Nature Scene') {
        await generateNatureScene();
      }
    } else {
      scene.background = new THREE.Color(0x0b0f14); // Reset background for other scenes
      const [visualGLTF, collisionGLTF] = await Promise.all([
        loader.loadAsync(`${sceneConfig.path}Visual_Scene.glb`),
        loader.loadAsync(`${sceneConfig.path}Collision_Scene.glb`)
      ]);
      currentVisualScene = visualGLTF.scene || visualGLTF.scenes?.[0];
      scene.add(currentVisualScene);
      currentVisualScene.traverse(o => {
        if (o.isMesh) {
          o.castShadow = true; o.receiveShadow = true;
          // Track emissive materials (handle single or array)
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach(m => {
            if (m && m.emissive && (m.emissive.r > 0 || m.emissive.g > 0 || m.emissive.b > 0)) {
              allEmissives.push(m);
              log('Collected emissive material:', m.name || 'unnamed', m.emissive.getHex());
            }
          });
        }
      });
      currentVisualScene.traverse(o => { if (o.isLight) { importedLights.push(o); if (o.shadow) { o.shadow.bias = -0.0005; o.shadow.normalBias = 0.02; } } });

      if (importedLights.length > 0) {
        allLights.push(...importedLights);
      } else {
        scene.add(hemi, dir);
        allLights.push(...defaultLights);
      }
      applyExposure();
      applyLightScale();
      updateLightingSettings();

      const colRoot = collisionGLTF.scene || collisionGLTF.scenes?.[0];
      collisionSceneGroup = colRoot.clone(true);
      collisionSceneGroup.traverse(o => { if (o.isMesh) o.material = new THREE.MeshBasicMaterial({ color: 0xff0077, wireframe: true, transparent: true, opacity: 0.35 }); });
      collisionSceneGroup.visible = toggleCollisionEl.checked; scene.add(collisionSceneGroup);
      buildPhysicsFromCollision(colRoot);
    }
    statusEl.textContent = 'Loaded. Click canvas to play.';
    respawn();
  } catch (err) { console.error(err); statusEl.textContent = 'Error loading GLBs.'; log('Loader error:', err?.message || err); }
}
function buildPhysicsFromCollision(root) {
  let bodies = 0; root.updateMatrixWorld(true); const v = new THREE.Vector3();
  root.traverse(obj => {
    if (!obj.isMesh || !obj.geometry || !obj.geometry.attributes?.position) return;
    const geom = obj.geometry; const worldM = obj.matrixWorld.clone();
    const pos = geom.attributes.position; const verts = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(worldM); verts[i * 3 + 0] = v.x; verts[i * 3 + 1] = v.y; verts[i * 3 + 2] = v.z; }
    let indices = geom.index ? (geom.index.array instanceof Uint32Array ? geom.index.array : new Uint32Array(geom.index.array)) : new Uint32Array(pos.count).map((_, i) => i);
    try {
      const shape = new CANNON.Trimesh(verts, indices); const body = new CANNON.Body({ mass: 0, material: worldMat }); body.addShape(shape); world.addBody(body); currentCollisionBodies.push(body); bodies++;
    } catch (e) { log('Trimesh error', obj.name || '(unnamed)', e?.message || e); }
  });
}
function setupSceneSwitcher() {
  SCENES.forEach((s, i) => { const opt = document.createElement('option'); opt.value = i; opt.textContent = s.name; sceneSelectorEl.appendChild(opt); });
  const savedSceneIndex = parseInt(LS.getItem(LS_CURRENT_SCENE) ?? '0', 10);
  const initialSceneIndex = savedSceneIndex < SCENES.length ? savedSceneIndex : 0;
  sceneSelectorEl.value = initialSceneIndex;
  sceneSelectorEl.addEventListener('change', () => { const index = parseInt(sceneSelectorEl.value, 10); LS.setItem(LS_CURRENT_SCENE, index); loadScene(SCENES[index]); });
  loadScene(SCENES[initialSceneIndex]);
}
setupSceneSwitcher();

// --- Procedural Nature Scene ---
async function generateNatureScene() {
  scene.background = new THREE.Color(0x87CEEB); // Light blue sky
  currentVisualScene = new THREE.Group();
  scene.add(currentVisualScene);

  // Helper: Height function for hills
  function searchHeight(x, z) {
    // Simple waves + secondary noise using sin/cos
    const large = Math.sin(x * 0.05) * Math.cos(z * 0.05) * 8;
    const small = Math.sin(x * 0.2) * Math.cos(z * 0.2) * 2;
    return large + small;
  }

  // 1. Landscape (Hills)
  // Higher resolution for hills
  const groundGeo = new THREE.PlaneGeometry(200, 200, 64, 64);
  const posAttr = groundGeo.attributes.position;

  // Displace vertices
  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const y = posAttr.getY(i); // This is Z in 2D plane logic before rotation, but PlaneGeometry is XY. 
    // Wait, PlaneGeometry default is in XY plane. 
    // usage: rotation.x = -Math.PI/2 puts it in XZ.
    // So 'y' in buffer is 'z' in world.

    // Actually, let's keep it simple: Access raw values.
    // PlaneGeometry(w, h, ...) creates verts in X-Y.
    // We want to displace Z (which becomes Y world).
    const worldX = x;
    const worldZ = -y; // Because of rotation -PI/2, world Z maps to local Y, but inverted?
    // Let's just do displacement AFTER rotation logic or just treat 'z' as 'height' in local space.
    // Local Z is height (0). We displace Z.

    // Actually, standard practice:
    // Displace Z coordinate of geometry.
    const h = searchHeight(x, -y); // Map local y to world z
    posAttr.setZ(i, h);
  }

  groundGeo.computeVertexNormals();

  const groundMat = new THREE.MeshStandardMaterial({
    color: 0x79a80a, // Significantly lighter to match grass brightness
    map: null,
    roughness: 1,
    side: THREE.DoubleSide
  });

  // Load texture for ground if we want? Use simple color for now as per previous plan, but maybe mix color?
  // Let's stick to color.

  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2; // Lie flat
  ground.receiveShadow = true;
  currentVisualScene.add(ground);

  // Physics for Hills (Heightfield) - smoother than Trimesh
  const hfShape = 64;
  const hfSize = 200;
  const elementSize = hfSize / hfShape;
  const heightData = [];

  // Cannon Heightfield orientation with -90 X rotation:
  // Local X -> World X
  // Local Y -> World -Z (Backwards)
  // Local Z -> World Y (Up)

  // We position body at (-100, 0, +100).
  // j=0 (Local Y=0) -> World Z = 100.
  // j=64 (Local Y=200) -> World Z = 100 - 200 = -100.

  for (let i = 0; i <= hfShape; i++) {
    const row = [];
    const x = -hfSize / 2 + i * elementSize; // -100 to +100
    for (let j = 0; j <= hfShape; j++) {
      // We scan Local Y (0..200).
      // Since Local Y maps to decreasing World Z, we MUST sample the height function
      // at the corresponding decreasing World Z coordinate.
      const z = hfSize / 2 - j * elementSize; // +100 to -100

      const h = searchHeight(x, z);
      row.push(h);
    }
    heightData.push(row);
  }

  const sectionsH = heightData[0].length - 1;

  const groundShape = new CANNON.Heightfield(heightData, {
    elementSize: elementSize
  });

  const groundBody = new CANNON.Body({ mass: 0, material: worldMat });
  groundBody.addShape(groundShape);

  // Align with visual mesh
  // Position: Bottom-Left corner relative to traversal direction
  // X starts at -100.
  // Z (mapped from Y) starts at +100.

  groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  groundBody.position.set(-hfSize / 2, 0, hfSize / 2); // X=-100, Z=+100

  world.addBody(groundBody);
  currentCollisionBodies.push(groundBody);

  // 2. Grass Texture
  const texLoader = new THREE.TextureLoader(manager);
  const grassTex = await texLoader.loadAsync('./assets/textures/grass.png');

  // 3. Grass Generation (PURE BILLBOARDS)
  const grassCount = NATURE_GRASS_DENSITY;
  const dummy = new THREE.Object3D();

  // Geometry: Simple Plane translated up
  const grassGeo = new THREE.PlaneGeometry(1, 1);
  grassGeo.translate(0, 0.5, 0);

  const grassMat = new THREE.MeshStandardMaterial({
    color: 0xaaaaaa, // Tint grey to reduce blowout
    map: grassTex,
    alphaTest: 0.5,
    side: THREE.DoubleSide,
    emissive: 0x000000,
    roughness: 1,
    metalness: 0
  });

  // GPU Billboarding logic (Always face camera)
  grassMat.onBeforeCompile = (shader) => {
    // 1. Force normals to point UP (like the ground) so lighting matches the terrain
    shader.vertexShader = shader.vertexShader.replace(
      '#include <beginnormal_vertex>',
      'vec3 objectNormal = vec3(0.0, 1.0, 0.0);'
    );
    // 2. Billboarding logic
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `
      #include <begin_vertex>
      
      // Billboard logic: Rotate around Y axis to face camera
      vec3 vPos = vec3(instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0));
      vec3 target = cameraPosition;
      target.y = vPos.y; // Keep vertical
      
      vec3 forward = normalize(target - vPos);
      vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), forward));
      vec3 up = vec3(0.0, 1.0, 0.0);
      
      // Extract scale from instance matrix (assuming uniform scale)
      // Length of the first column vector of upper 3x3
      float scaleX = length(vec3(instanceMatrix[0][0], instanceMatrix[0][1], instanceMatrix[0][2]));
      float scaleY = length(vec3(instanceMatrix[1][0], instanceMatrix[1][1], instanceMatrix[1][2]));

      // Position is already local 'position' (which is a plane 1x1 base).
      // Construct world rotation basis
      
      // We need to apply the generic "Billboard" rotation to the 'position' BEFORE adding it to vPos.
      // And we must respect the instance scale.
      
      vec3 transformedPos = (position.x * scaleX) * right + (position.y * scaleY) * up;
      
      // We override 'transformed' which usually is 'position' (local)
      // But Since instances usually apply a matrix, we need to be careful.
      // With InstancedMesh, Three.js applies 'instanceMatrix' in the vertex shader default logic.
      // If we *replace* projected vertex logic, we might double apply or miss apply.
      // Three.js chunk <begin_vertex> defines 'vec3 transformed = vec3( position );'
      //
      // If we modify 'transformed', later <project_vertex> will use 'modelMatrix * vec4( transformed, 1.0 )'.
      // For InstancedMesh, it uses 'instanceMatrix * vec4(transformed, 1.0)'.
      //
      // PROBLEM: If we use instanceMatrix to get vPos, we are essentially doing the transform ourselves.
      // If we leave 'transformed' as is, it gets rotated by instanceMatrix (random rotation) which we DON'T want for billboards.
      // We want the position to be: vPos + billboardOffset
      //
      // SO: We should effectively CANCEL the rotation of the instanceMatrix but KEEP the translation/scale?
      // Or just set the instance rotation to Identity in JS and only use Translation.
      // 
      // BETTER APPROACH:
      // In JS, set dummy.rotation to (0,0,0).
      // Then in shader, 'instanceMatrix' only contains Translation and Scale.
      // Then standard vertex shader applies it.
      // BUT we want rotation to camera.
      //
      // So, if we compute billboard rotation here, we can set 'transformed' to that rotated vector.
      // And if instanceMatrix has NO rotation, then 'instanceMatrix * rotatedVector' = 'translation + rotatedVector'.
      // EXACTLY.
      
      transformed = transformedPos;
      
      // Note: We need to verify 'scaleX' extraction.
      // If we just generated instances with .scale.set(s,s,s) and rotation(0,0,0), 
      // the columns are (s,0,0), (0,s,0), (0,0,s).
      // So correct.
      `
    );
  };

  const grassInstances = [];

  for (let i = 0; i < grassCount; i++) {
    const x = (Math.random() - 0.5) * 180; // Spread within 180x180 (avoid edges)
    const z = (Math.random() - 0.5) * 180;

    const y = searchHeight(x, z);

    // Scale randomization
    const s = NATURE_GRASS_SCALE * (0.8 + Math.random() * 0.7);

    dummy.position.set(x, y, z);
    dummy.rotation.set(0, 0, 0); // No rotation here, handled by shader
    dummy.scale.set(s, s, s);
    dummy.updateMatrix();
    grassInstances.push(dummy.matrix.clone());
  }

  const meshBillboard = new THREE.InstancedMesh(grassGeo, grassMat, grassInstances.length);
  meshBillboard.castShadow = true;
  meshBillboard.receiveShadow = true;

  for (let i = 0; i < grassInstances.length; i++) {
    meshBillboard.setMatrixAt(i, grassInstances[i]);
  }
  meshBillboard.instanceMatrix.needsUpdate = true;
  currentVisualScene.add(meshBillboard);


  // 4. Tree Generation
  try {
    // console.log('Loading tree...');
    const treeGltf = await loader.loadAsync('./assets/glb_models/Tree.glb');
    const treeModel = treeGltf.scene || treeGltf.scenes[0];

    // Switch to CLONING for robustness (handles multi-mesh trees)
    const treeCount = 200;
    let treesPlaced = 0;

    while (treesPlaced < treeCount) {
      const r = 20 + Math.random() * 30; // 20m to 30m radius ring
      const theta = Math.random() * Math.PI * 2;
      const x = r * Math.cos(theta);
      const z = r * Math.sin(theta);

      const y = searchHeight(x, z);

      // Create Instance
      const clone = treeModel.clone();

      // Scale controlled by constant
      const s = NATURE_TREE_SCALE * (0.8 + Math.random() * 0.6);
      clone.position.set(x, y, z);
      clone.rotation.set(0, Math.random() * Math.PI * 2, 0);
      clone.scale.set(s, s, s);

      // Enable Shadows
      clone.traverse(o => {
        if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
      });

      currentVisualScene.add(clone);

      // Physics (Cylinder)
      const treeShape = new CANNON.Cylinder(0.5 * s, 0.5 * s, 4 * s, 8); // Scale physics too
      const treeBody = new CANNON.Body({ mass: 0 });
      // Offset (Cylinder is centered) -> move up by half height
      const yOffset = 2 * s;
      treeBody.addShape(treeShape, new CANNON.Vec3(0, yOffset, 0));
      treeBody.position.copy(clone.position);
      world.addBody(treeBody);
      currentCollisionBodies.push(treeBody);

      treesPlaced++;
    }
    // console.log('Trees placed:', treesPlaced);

  } catch (err) {
    console.warn('Could not load Tree.glb:', err);
  }

  // Lighting (Custom Sun for Nature Scene)
  const sunLight = new THREE.DirectionalLight(0xfffaed, 8.5); // Strong Sun (8.5)
  sunLight.position.set(50, 100, 50);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.left = -150;
  sunLight.shadow.camera.right = 150;
  sunLight.shadow.camera.top = 150;
  sunLight.shadow.camera.bottom = -150;
  sunLight.shadow.camera.near = 1;
  sunLight.shadow.camera.far = 400;
  sunLight.shadow.bias = -0.0005;
  sunLight.shadow.radius = NATURE_SHADOW_RADIUS; // Soft shadows for clouds

  // Enable Layer 1? No, making them visible again.
  // sunLight.shadow.camera.layers.enable(1); 

  // Restore Ambient Light (Hemi)
  const hemiNature = hemi.clone();
  hemiNature.intensity = ambientIntensity;

  scene.add(hemiNature, sunLight);
  allLights.push(hemiNature, sunLight);

  // 5. Visible Clouds (Shadow Casters)
  const cloudGeo = new THREE.DodecahedronGeometry(15, 0);
  // Store clouds for animation
  currentVisualScene.userData.clouds = [];

  const cloudCount = 6; // Reduced count
  for (let i = 0; i < cloudCount; i++) {
    // Unique material for individual fading
    const cloudMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.9,
      roughness: 0.4,
      flatShading: true
    });
    const cloud = new THREE.Mesh(cloudGeo, cloudMat);

    // Higher Up (80m to 120m)
    // Start "further back" (Left side, moving Right) - Initial Offset
    const posX = -200 - (Math.random() * 200); // Start -200 to -400
    const posZ = (Math.random() - 0.5) * 300;

    cloud.position.set(posX, 80 + Math.random() * 40, posZ);

    // Scale 
    const sX = 2 + Math.random() * 2;
    const sZ = 2 + Math.random() * 2;
    cloud.scale.set(sX, 0.6, sZ);

    cloud.castShadow = true;
    cloud.receiveShadow = false;

    // Animation data
    cloud.userData.speed = 2 + Math.random() * 3; // Move speed

    currentVisualScene.add(cloud);
    currentVisualScene.userData.clouds.push(cloud);
  }

  // Visual Sun
  const sunGeo = new THREE.SphereGeometry(20, 32, 32);
  const sunMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
  const sunMesh = new THREE.Mesh(sunGeo, sunMat);
  sunMesh.position.copy(sunLight.position);
  currentVisualScene.add(sunMesh);

  applyExposure(); applyLightScale(); updateLightingSettings();

  // Spawn player higher so they don't fall through immediately if spawn is low
  // Or query height at (0,0)
  const spawnY = searchHeight(0, 0) + 2;
  currentSceneConfig.spawnPoint = { x: 0, y: spawnY, z: 0 };

  statusEl.textContent = 'Nature Scene Generated (Hills).';
  respawn();
}


// --- GAMEPAD ---
let gamepad = null;
let gamepadIndex = null;
function setupGamepad() {
  window.addEventListener('gamepadconnected', (event) => {
    if (gamepad) return;
    gamepad = event.gamepad;
    gamepadIndex = gamepad.index;
    gamepadSettingsDiv.style.display = 'block'; // --- SENSITIVITY SLIDER ---
    log(`Gamepad connected: ${gamepad.id}`);
  });
  window.addEventListener('gamepaddisconnected', (event) => {
    if (gamepadIndex === event.gamepad.index) {
      log(`Gamepad disconnected: ${event.gamepad.id}`);
      gamepad = null;
      gamepadIndex = null;
      gamepadSettingsDiv.style.display = 'none'; // --- SENSITIVITY SLIDER ---
    }
  });

  // --- SENSITIVITY SLIDER --- Check for already connected gamepads on page load
  const checkGamepads = () => {
    const gamepads = navigator.getGamepads();
    for (const gp of gamepads) {
      if (gp) {
        if (gamepad) break; // Already found one
        gamepad = gp;
        gamepadIndex = gp.index;
        gamepadSettingsDiv.style.display = 'block';
        log(`Gamepad already connected: ${gamepad.id}`);
      }
    }
  };
  checkGamepads();
}
setupGamepad();

// --- Main Loop ---
const clock = new THREE.Clock(); let accum = 0; const FIXED = 1 / 60;
let lastTime = performance.now();
const fpsSamples = []; const FPS_N = 60;

function animate() {
  requestAnimationFrame(animate);
  const rawDt = clock.getDelta();
  // Cap dt for physics safety
  const dt = Math.min(0.05, rawDt);

  //  // Cloud Animation
  if (currentVisualScene && currentVisualScene.userData.clouds) {
    const limit = 200; // Tighter boundary
    const fadeStart = 150; // Tighter fade
    currentVisualScene.userData.clouds.forEach(cloud => {
      // Move clouds
      cloud.position.x += cloud.userData.speed * rawDt;

      // Wrap around
      if (cloud.position.x > limit) {
        cloud.position.x = -limit;
      }

      // Fading Logic
      const absX = Math.abs(cloud.position.x);
      let targetOpacity = 0.9;
      if (absX > fadeStart) {
        const dist = absX - fadeStart;
        const range = limit - fadeStart;
        const factor = 1.0 - (dist / range);
        targetOpacity = 0.9 * Math.max(0, factor);
      }
      cloud.material.opacity = targetOpacity;
    });
  }

  // --- Gamepad Input (Split Screen P2) ---
  gamepad = (gamepadIndex !== null) ? navigator.getGamepads()[gamepadIndex] : null;
  if (isSplitScreen && gamepad) {
    const rightStickX = gamepad.axes[2];
    const rightStickY = gamepad.axes[3];
    const deadzone = 0.15;
    const rotateSpeed = gamepadSensitivity * FIXED;

    if (Math.abs(rightStickX) > deadzone) {
      euler2.y -= rightStickX * rotateSpeed;
    }
    if (Math.abs(rightStickY) > deadzone) {
      euler2.x -= rightStickY * rotateSpeed;
    }
  }

  // --- Keyboard Input (Split Screen P2) ---
  if (isSplitScreen && !gamepad) {
    const rotateSpeed = 1.5 * FIXED;
    if (keys2.left) euler2.y += rotateSpeed;
    if (keys2.right) euler2.y -= rotateSpeed;
  }

  // --- Touch Input ---
  if (isTouchDevice && touchState.look.active && !isMenuOpen) {
    const LOOK_SENSITIVITY = 0.003;
    const dx = touchState.look.currentX - touchState.look.startX;
    const dy = touchState.look.currentY - touchState.look.startY;
    euler.setFromQuaternion(camera.quaternion);
    euler.y -= dx * LOOK_SENSITIVITY;
    euler.x -= dy * LOOK_SENSITIVITY;
    camera.quaternion.setFromEuler(euler);
    touchState.look.startX = touchState.look.currentX;
    touchState.look.startY = touchState.look.currentY;
  }

  // --- Physics Step ---
  accum += dt;
  while (accum >= FIXED) {
    step(FIXED);
    accum -= FIXED;
  }

  // --- Sync Visuals with Physics ---
  const eye = new THREE.Vector3(0, HALF + PLAYER_RADIUS, 0);
  camera.position.copy(playerBody.position).add(eye);
  playerCapsule.position.copy(playerBody.position).add(new THREE.Vector3(0, (PLAYER_HEIGHT / 2) - HALF, 0));
  playerCapsule.quaternion.copy(camera.quaternion);

  if (isSplitScreen) {
    euler2.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, euler2.x));
    camera2.quaternion.setFromEuler(euler2);
    camera2.position.copy(playerBody2.position).add(eye);
    playerCapsule2.position.copy(playerBody2.position).add(new THREE.Vector3(0, (PLAYER_HEIGHT / 2) - HALF, 0));
    playerCapsule2.quaternion.copy(camera2.quaternion);
  }

  handleResize();

  // --- Stats / FPS ---
  const now = performance.now(); const instFps = 1000 / (now - lastTime); lastTime = now;
  fpsSamples.push(instFps); if (fpsSamples.length > FPS_N) fpsSamples.shift();
  const avgFps = fpsSamples.reduce((a, b) => a + b, 0) / fpsSamples.length;
  fpsEl.textContent = avgFps.toFixed(0);

  const p1_pos = playerBody.position;
  let statusText = `P1: pos(${p1_pos.x.toFixed(1)}, ${p1_pos.y.toFixed(1)}, ${p1_pos.z.toFixed(1)})`;
  if (isSplitScreen && playerBody2) {
    const p2_pos = playerBody2.position;
    statusText += ` | P2: pos(${p2_pos.x.toFixed(1)}, ${p2_pos.y.toFixed(1)}, ${p2_pos.z.toFixed(1)})`;
  }
  statusEl.textContent = statusText;
}

function handleResize() {
  const w = window.innerWidth; const h = window.innerHeight;
  renderer.setSize(w, h);
  if (isSplitScreen) {
    const halfW = Math.floor(w / 2);
    renderer.setScissorTest(true);
    renderer.setScissor(0, 0, halfW, h); renderer.setViewport(0, 0, halfW, h);
    camera.aspect = halfW / h; camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    renderer.setScissor(halfW, 0, w - halfW, h); renderer.setViewport(halfW, 0, w - halfW, h);
    camera2.aspect = (w - halfW) / h; camera2.updateProjectionMatrix();
    renderer.render(scene, camera2);
    renderer.setScissorTest(false);
  } else {
    renderer.setScissorTest(false); renderer.setViewport(0, 0, w, h);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  }
}
window.addEventListener('resize', handleResize);
animate();

function updatePlayer(dt, body, inputKeys, playerCamera, controlScheme, gamepadState = null) {
  if (flyMode && world.gravity.y !== 0) world.gravity.set(0, 0, 0);
  if (!flyMode && world.gravity.y !== -9.82) world.gravity.set(0, -9.82, 0);

  const grounded = flyMode ? false : isGrounded(body);
  const currentBaseSpeed = flyMode ? baseMoveSpeed * 1.75 : baseMoveSpeed;

  const forward = new THREE.Vector3(); playerCamera.getWorldDirection(forward);
  if (!flyMode) { forward.y = 0; }
  forward.normalize();
  const right = new THREE.Vector3().crossVectors(playerCamera.up, forward).normalize();

  let vx = 0, vy = flyMode ? 0 : body.velocity.y, vz = 0;
  let jump = false;
  let moveSpeed = currentBaseSpeed;

  if (controlScheme === 2 && gamepadState) {
    const deadzone = 0.15;
    const leftStickX = Math.abs(gamepadState.axes[0]) > deadzone ? gamepadState.axes[0] : 0;
    const leftStickY = Math.abs(gamepadState.axes[1]) > deadzone ? gamepadState.axes[1] : 0;

    vx += forward.x * -leftStickY; vz += forward.z * -leftStickY;
    vx -= right.x * leftStickX; vz -= right.z * leftStickX;

    jump = gamepadState.buttons[0].pressed; // X button for jump

  } else {
    const fwd = controlScheme === 1 ? inputKeys.w : inputKeys.up;
    const back = controlScheme === 1 ? inputKeys.s : inputKeys.down;
    const left = controlScheme === 1 ? inputKeys.a : false;
    const rightKey = controlScheme === 1 ? inputKeys.d : false;
    jump = controlScheme === 1 ? inputKeys.space : inputKeys.rshift;
    if (controlScheme === 1 && inputKeys.shift) moveSpeed *= 1.6;
    if (fwd) { vx += forward.x; if (flyMode) vy += forward.y; vz += forward.z; }
    if (back) { vx -= forward.x; if (flyMode) vy -= forward.y; vz -= forward.z; }
    if (rightKey) { vx -= right.x; vz -= right.z; }
    if (left) { vx += right.x; vz += right.z; }
  }

  if (flyMode) {
    if (inputKeys.e || (controlScheme === 1 && jump)) vy += 1;
    if (inputKeys.q || inputKeys.ctrl) vy -= 1;
  }

  const moveVec = flyMode ? new THREE.Vector3(vx, vy, vz) : new THREE.Vector3(vx, 0, vz);
  if (moveVec.length() > 0.001) moveVec.normalize();

  vx = moveVec.x * moveSpeed;
  vy = flyMode ? moveVec.y * moveSpeed : body.velocity.y;
  vz = moveVec.z * moveSpeed;

  body.wakeUp();
  const v = body.velocity;
  const accel = 30;
  v.x += THREE.MathUtils.clamp(vx - v.x, -accel * dt, accel * dt);
  v.z += THREE.MathUtils.clamp(vz - v.z, -accel * dt, accel * dt);

  if (flyMode) {
    v.y += THREE.MathUtils.clamp(vy - v.y, -accel * dt, accel * dt);
  } else if (jump && grounded) {
    v.y = jumpHeight;
  }
}

function step(dt) {
  updatePlayer(dt, playerBody, keys, camera, 1);
  if (isSplitScreen && playerBody2) {
    updatePlayer(dt, playerBody2, keys2, camera2, 2, gamepad);
  }
  world.step(FIXED);
}

function isGrounded(body) {
  const from = new CANNON.Vec3(body.position.x, body.position.y - HALF, body.position.z);
  const to = new CANNON.Vec3(from.x, from.y - (PLAYER_RADIUS + 0.1), from.z);
  const res = new CANNON.RaycastResult();
  world.raycastClosest(from, to, { skipBackfaces: true, collisionFilterMask: -1 }, res);
  return res.hasHit;
}

// --- Touch Controls Initialization (omitted for brevity, no changes) ---
function initTouchControls() {
  if (!isTouchDevice) return;
  const touchControlsDiv = document.getElementById('touch-controls');
  if (isSplitScreen && touchControlsDiv) { touchControlsDiv.style.display = 'none'; return; }
  uiPanel.classList.add('collapsed');
  btnCollapse.style.display = 'none';
  btnCloseMenu.style.display = 'block';
  function openMenu() { isMenuOpen = true; uiPanel.classList.remove('collapsed'); }
  function closeMenu() { isMenuOpen = false; uiPanel.classList.add('collapsed'); }
  btnCloseMenu.addEventListener('click', closeMenu);
  const controlsHTML = `<div id="touch-controls" style="display: block;"><div id="touch-menu-button" title="Open Menu"><span></span><span></span><span></span></div><div class="touch-joystick-base"><div class="touch-joystick-stick"></div></div><div class="touch-buttons"><div id="touch-up" class="touch-button" style="display: none;">E</div><div id="touch-down" class="touch-button" style="display: none;">Q</div><div id="touch-jump" class="touch-button">⇪</div></div></div>`;
  document.body.insertAdjacentHTML('beforeend', controlsHTML);
  const joystickBase = document.querySelector('.touch-joystick-base');
  const joystickStick = document.querySelector('.touch-joystick-stick');
  const baseRadius = joystickBase.offsetWidth / 2;
  const stickRadius = joystickStick.offsetWidth / 2;
  const maxDelta = baseRadius - stickRadius;
  const menuButton = document.getElementById('touch-menu-button');
  menuButton.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); menuButton.classList.add('active'); });
  menuButton.addEventListener('touchend', (e) => { menuButton.classList.remove('active'); openMenu(); });
  function handleTouchStart(e) { if (isMenuOpen || isSplitScreen) return; e.preventDefault(); for (const touch of e.changedTouches) { const targetButton = e.target.closest('.touch-button'); if (targetButton) { targetButton.classList.add('active'); if (targetButton.id === 'touch-jump') keys.space = true; if (targetButton.id === 'touch-up') keys.e = true; if (targetButton.id === 'touch-down') keys.q = true; playerBody.wakeUp(); continue; } if (touch.clientX < window.innerWidth / 2 && !touchState.joystick.active) { touchState.joystick.id = touch.identifier; touchState.joystick.active = true; touchState.joystick.startX = touch.clientX; touchState.joystick.startY = touch.clientY; joystickBase.style.left = `${touch.clientX}px`; joystickBase.style.top = `${touch.clientY}px`; joystickBase.style.transform = `translate(-50%, -50%)`; } else if (touch.clientX >= window.innerWidth / 2 && !touchState.look.active) { touchState.look.id = touch.identifier; touchState.look.active = true; touchState.look.startX = touch.clientX; touchState.look.startY = touch.clientY; touchState.look.currentX = touch.clientX; touchState.look.currentY = touch.clientY; } } }
  function handleTouchMove(e) { if (isMenuOpen || isSplitScreen) return; e.preventDefault(); for (const touch of e.changedTouches) { if (touch.identifier === touchState.joystick.id) { const dx = touch.clientX - touchState.joystick.startX; const dy = touch.clientY - touchState.joystick.startY; const angle = Math.atan2(dy, dx); const distance = Math.min(maxDelta, Math.hypot(dx, dy)); joystickStick.style.transform = `translate(${Math.cos(angle) * distance}px, ${Math.sin(angle) * distance}px)`; const normalizedX = (Math.cos(angle) * distance) / maxDelta; const normalizedY = (Math.sin(angle) * distance) / maxDelta; keys.w = normalizedY < -0.2; keys.s = normalizedY > 0.2; keys.a = normalizedX < -0.2; keys.d = normalizedX > 0.2; playerBody.wakeUp(); } else if (touch.identifier === touchState.look.id) { touchState.look.currentX = touch.clientX; touchState.look.currentY = touch.clientY; } } }
  function handleTouchEnd(e) { if (isMenuOpen || isSplitScreen) return; e.preventDefault(); for (const touch of e.changedTouches) { document.querySelectorAll('.touch-button.active').forEach(btn => { btn.classList.remove('active'); if (btn.id === 'touch-jump') keys.space = false; if (btn.id === 'touch-up') keys.e = false; if (btn.id === 'touch-down') keys.q = false; }); if (touch.identifier === touchState.joystick.id) { touchState.joystick.active = false; touchState.joystick.id = -1; joystickStick.style.transform = `translate(0, 0)`; joystickBase.style.left = `12vw`; joystickBase.style.bottom = `12vw`; joystickBase.style.top = 'auto'; joystickBase.style.transform = `translate(-50%, 50%)`; keys.w = keys.a = keys.s = keys.d = false; } else if (touch.identifier === touchState.look.id) { touchState.look.active = false; touchState.look.id = -1; } } }
  window.addEventListener('touchstart', handleTouchStart, { passive: false });
  window.addEventListener('touchmove', handleTouchMove, { passive: false });
  window.addEventListener('touchend', handleTouchEnd, { passive: false });
  window.addEventListener('touchcancel', handleTouchEnd, { passive: false });
}

// --- MODIFIED: Control Mode Switcher UI ---
function setupControlSwitcher() {
  // The button is now part of the main HTML, so we just find it.
  const btn = document.getElementById('btnSwitchControls');
  if (!btn) {
    console.error("Switch Controls button not found in UI panel.");
    return;
  };

  if (isTouchDevice) {
    btn.textContent = 'Use Mouse/KB';
    btn.title = 'Switch to Mouse and Keyboard controls';
    btn.onclick = () => {
      LS.setItem(LS_CONTROL_MODE, 'desktop');
      window.location.reload();
    };
  } else {
    btn.textContent = 'Use Touch';
    btn.title = 'Switch to Touch controls';
    btn.onclick = () => {
      LS.setItem(LS_CONTROL_MODE, 'touch');
      window.location.reload();
    };
  }
}

initTouchControls();
setupControlSwitcher();