import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import * as CANNON from 'cannon-es';

// --- Touch Detection ---
const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
let isMenuOpen = false; // State for touch menu modal

// --- Scene Configuration ---
const SCENES = [
  { name: 'Condo', path: './assets/scenes/Condo/', spawnPoint: { x: -8, y: 2, z: 12 } },
  { name: 'Bedroom', path: './assets/scenes/Bedroom/', spawnPoint: { x: 2, y: 1.5, z: 4 } },
];
let currentSceneConfig = null;


// --- UI ---
const statusEl = document.getElementById('status');
const debugEl  = document.getElementById('debug');
const fpsEl = document.getElementById('fps');
const uiPanel = document.getElementById('ui');
const btnCollapse = document.getElementById('btnCollapse');
const btnCloseMenu = document.getElementById('btnCloseMenu'); // New close button
const btnDebug = document.getElementById('btnDebug');
const toggleCollisionEl = document.getElementById('toggleCollision');
const toggleFlyEl = document.getElementById('toggleFly');
const sceneSelectorEl = document.getElementById('sceneSelector');
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


// --- LocalStorage ---
const LS = window.localStorage;
const LS_UI_COLLAPSED = 'fps.ui.collapsed';
const LS_DEBUG_VISIBLE = 'fps.debug.visible';
const LS_CURRENT_SCENE = 'fps.currentScene';
// Visual settings keys
const LS_EXPOSURE = 'fps.exposure';
const LS_FOV = 'fps.fov';
const LS_LIGHT_SCALE = 'fps.lightScale';
const LS_HQ_LIGHTING = 'fps.hqLighting';
const LS_SHADOW_QUALITY = 'fps.shadowQuality';
// Player settings keys
const LS_MOVE_SPEED = 'fps.moveSpeed';
const LS_JUMP_HEIGHT = 'fps.jumpHeight';
const LS_PLAYER_HEIGHT = 'fps.playerHeight';
const LS_PLAYER_WIDTH = 'fps.playerWidth';

// --- Load Settings ---
if (LS.getItem(LS_UI_COLLAPSED) === 'true' && !isTouchDevice) uiPanel.classList.add('collapsed');
let debugVisible = LS.getItem(LS_DEBUG_VISIBLE) !== 'false';
debugEl.style.display = debugVisible ? 'block' : 'none';

let exposure = parseFloat(LS.getItem(LS_EXPOSURE) ?? '0.25');
exposureSlider.value = exposure; exposureValue.textContent = exposure.toFixed(2);
let cameraFov = parseInt(LS.getItem(LS_FOV) ?? '75', 10);
fovSlider.value = cameraFov; fovValue.textContent = cameraFov;
let lightScale = parseFloat(LS.getItem(LS_LIGHT_SCALE) ?? '0.0020');
lightScaleSlider.value = lightScale; lightScaleValue.textContent = lightScale.toFixed(4);

const SHADOW_QUALITY_LABELS = ['Off', 'Low', 'Medium', 'High'];
let hqLighting = LS.getItem(LS_HQ_LIGHTING) !== 'false';
toggleHQLightingEl.checked = hqLighting;
let shadowQuality = parseInt(LS.getItem(LS_SHADOW_QUALITY) ?? '2', 10);
shadowQualitySlider.value = shadowQuality; shadowQualityValue.textContent = SHADOW_QUALITY_LABELS[shadowQuality];

// Load Player Settings
let baseMoveSpeed = parseFloat(LS.getItem(LS_MOVE_SPEED) ?? '4.0');
moveSpeedSlider.value = baseMoveSpeed; moveSpeedValue.textContent = baseMoveSpeed.toFixed(1);
let jumpHeight = parseFloat(LS.getItem(LS_JUMP_HEIGHT) ?? '5.5');
jumpHeightSlider.value = jumpHeight; jumpHeightValue.textContent = jumpHeight.toFixed(1);
let playerHeight = parseFloat(LS.getItem(LS_PLAYER_HEIGHT) ?? '1.6');
playerHeightSlider.value = playerHeight; playerHeightValue.textContent = playerHeight.toFixed(2) + ' m';
let playerWidth = parseFloat(LS.getItem(LS_PLAYER_WIDTH) ?? '0.35');
playerWidthSlider.value = playerWidth; playerWidthValue.textContent = playerWidth.toFixed(2) + ' m';


// --- Event Listeners ---
function toggleUIPanel() {
  uiPanel.classList.toggle('collapsed');
  LS.setItem(LS_UI_COLLAPSED, uiPanel.classList.contains('collapsed'));
}
btnCollapse.addEventListener('click', toggleUIPanel);
btnDebug.addEventListener('click', () => toggleDebug());
exposureSlider.addEventListener('input', () => { exposure = parseFloat(exposureSlider.value); exposureValue.textContent = exposure.toFixed(2); LS.setItem(LS_EXPOSURE, exposure); applyExposure(); });
fovSlider.addEventListener('input', () => {
  cameraFov = parseInt(fovSlider.value, 10);
  fovValue.textContent = cameraFov;
  LS.setItem(LS_FOV, cameraFov);
  camera.fov = cameraFov;
  camera.updateProjectionMatrix();
});
lightScaleSlider.addEventListener('input', () => { lightScale = parseFloat(lightScaleSlider.value); lightScaleValue.textContent = lightScale.toFixed(4); LS.setItem(LS_LIGHT_SCALE, lightScale); applyLightScale(); });
toggleHQLightingEl.addEventListener('change', e => { hqLighting = e.target.checked; LS.setItem(LS_HQ_LIGHTING, hqLighting); updateLightingSettings(); });
shadowQualitySlider.addEventListener('input', () => { shadowQuality = parseInt(shadowQualitySlider.value, 10); LS.setItem(LS_SHADOW_QUALITY, shadowQuality); updateLightingSettings(); });
// Player settings listeners
moveSpeedSlider.addEventListener('input', () => { baseMoveSpeed = parseFloat(moveSpeedSlider.value); moveSpeedValue.textContent = baseMoveSpeed.toFixed(1); LS.setItem(LS_MOVE_SPEED, baseMoveSpeed); });
jumpHeightSlider.addEventListener('input', () => { jumpHeight = parseFloat(jumpHeightSlider.value); jumpHeightValue.textContent = jumpHeight.toFixed(1); LS.setItem(LS_JUMP_HEIGHT, jumpHeight); });
playerHeightSlider.addEventListener('input', () => { playerHeight = parseFloat(playerHeightSlider.value); playerHeightValue.textContent = playerHeight.toFixed(2) + ' m'; LS.setItem(LS_PLAYER_HEIGHT, playerHeight); recreatePlayerBody(); });
playerWidthSlider.addEventListener('input', () => { playerWidth = parseFloat(playerWidthSlider.value); playerWidthValue.textContent = playerWidth.toFixed(2) + ' m'; LS.setItem(LS_PLAYER_WIDTH, playerWidth); recreatePlayerBody(); });


function toggleDebug(){ debugVisible = !debugVisible; debugEl.style.display = debugVisible?'block':'none'; LS.setItem(LS_DEBUG_VISIBLE, debugVisible); }
function log(...args){ console.log(...args); if(!debugVisible) return; debugEl.textContent += args.join(' ')+'\n'; debugEl.scrollTop = debugEl.scrollHeight; }
const base = (url)=> (url||'').split('/').pop();

// --- Renderer/Scene/Camera ---
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias:true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.physicallyCorrectLights = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
function applyExposure(){ renderer.toneMappingExposure = exposure; }
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0f14);
const camera = new THREE.PerspectiveCamera(cameraFov, 2, 0.05, 5000); // Use loaded FOV
const hemi = new THREE.HemisphereLight(0xffffff, 0x222233, 0.5); hemi.name = 'DefaultHemi';
const dir  = new THREE.DirectionalLight(0xffffff, 0.6); dir.position.set(10,15,10); dir.name='DefaultDir';
dir.shadow.bias = -0.0005; dir.shadow.normalBias = 0.02; // Default lights are not added to scene initially
scene.add(new THREE.AxesHelper(1.0));
const grid = new THREE.GridHelper(200,200,0x334455,0x223344); grid.material.opacity=0.15; grid.material.transparent=true; grid.position.y=-0.001; scene.add(grid);

// --- Controls (Desktop vs Touch) ---
let controls;
const euler = new THREE.Euler(0, 0, 0, 'YXZ'); // For touch camera control
const touchState = {
    look: { id: -1, active: false, startX: 0, startY: 0, currentX: 0, currentY: 0 },
    joystick: { id: -1, active: false, startX: 0, startY: 0, currentX: 0, currentY: 0 }
};

if (!isTouchDevice) {
    controls = new PointerLockControls(camera, document.body);
    document.addEventListener('click', () => { if (document.pointerLockElement !== document.body) controls.lock(); });
}

// --- Physics ---
const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
world.broadphase = new CANNON.SAPBroadphase(world);
world.allowSleep = true;
const worldMat  = new CANNON.Material('world');
const playerMat = new CANNON.Material('player');
world.addContactMaterial(new CANNON.ContactMaterial(worldMat, playerMat, { friction: 0.0, restitution: 0.0 }));

let playerBody;
let PLAYER_RADIUS, PLAYER_HEIGHT, HALF;

function recreatePlayerBody() {
  const oldPosition = playerBody ? new CANNON.Vec3().copy(playerBody.position) : new CANNON.Vec3(0, 20, 0);
  const oldVelocity = playerBody ? new CANNON.Vec3().copy(playerBody.velocity) : new CANNON.Vec3(0, 0, 0);
  if (playerBody) world.removeBody(playerBody);

  PLAYER_HEIGHT = playerHeight;
  PLAYER_RADIUS = playerWidth;
  HALF = (PLAYER_HEIGHT / 2) - PLAYER_RADIUS;
  if (HALF < 0) HALF = 0; // Prevent negative offset

  playerBody = new CANNON.Body({ mass: 70, material: playerMat, linearDamping: 0.05, allowSleep: false, fixedRotation: true });
  playerBody.addShape(new CANNON.Sphere(PLAYER_RADIUS), new CANNON.Vec3(0, +HALF, 0));
  playerBody.addShape(new CANNON.Sphere(PLAYER_RADIUS), new CANNON.Vec3(0, -HALF, 0));
  playerBody.updateMassProperties();
  playerBody.position.copy(oldPosition);
  playerBody.velocity.copy(oldVelocity);
  world.addBody(playerBody);
}
recreatePlayerBody(); // Initial creation

// --- Input ---
const keys = { w:false,a:false,s:false,d:false, space:false, shift:false, q:false,e:false, ctrl:false };
addEventListener('keydown', (e) => {
  setKey(e.code, true);
  if (e.code === 'KeyM') toggleUIPanel();
  if (e.code === 'KeyF') toggleFly(); if (e.code === 'KeyR') respawn();
  if (e.code === 'KeyH') toggleCollision(); if (e.code === 'Backquote') toggleDebug();
});
addEventListener('keyup', (e) => setKey(e.code, false));
function setKey(code, v){
  if (code==='KeyW') keys.w=v; if (code==='KeyA') keys.a=v; if (code==='KeyS') keys.s=v; if (code==='KeyD') keys.d=v;
  if (code==='Space') keys.space=v; if (code==='ShiftLeft'||code==='ShiftRight') keys.shift=v;
  if (code==='KeyQ') keys.q=v; if (code==='KeyE') keys.e=v; if (code==='ControlLeft'||code==='Right') keys.ctrl=v;
  playerBody.wakeUp();
}
function respawn(){
    const sp = currentSceneConfig?.spawnPoint || { x: 0, y: 20, z: 0 };
    playerBody.position.set(sp.x, sp.y, sp.z);
    playerBody.velocity.set(0, 0, 0);
    playerBody.wakeUp();
    log(`Respawned at ${sp.x}, ${sp.y}, ${sp.z}`);
}

// --- Loading ---
const manager = new THREE.LoadingManager();
manager.onStart = (url,l,t)=>{ statusEl.textContent = `Starting: ${base(url)} (0/${t})`; log('onStart', base(url), l, t); };
manager.onProgress=(url,l,t)=>{ const p=t?Math.round(l/t*100):0; statusEl.textContent=`Loading ${l}/${t} – ${base(url)} (${p}%)`; };
manager.onError  = (url)=>{ statusEl.textContent=`Error: ${base(url)}`; log('onError', url); };
manager.onLoad   = ()=>log('All assets loaded for the current scene.');
const loader = new GLTFLoader(manager);
const draco = new DRACOLoader(); draco.setDecoderPath('https://unpkg.com/three@0.159.0/examples/jsm/libs/draco/'); loader.setDRACOLoader(draco);
loader.setMeshoptDecoder(MeshoptDecoder);

// --- UI Toggles ---
let collisionSceneGroup = null;
function setCollisionVisible(on){ if (collisionSceneGroup) collisionSceneGroup.visible = on; if (toggleCollisionEl) toggleCollisionEl.checked = !!on; log('Collision render', on?'ON':'OFF'); }
function toggleCollision(){ const on = !(collisionSceneGroup && collisionSceneGroup.visible); setCollisionVisible(on); }
toggleCollisionEl?.addEventListener('change', e => setCollisionVisible(e.target.checked));
let flyMode=false;
function setFly(on){ 
    flyMode=on; 
    toggleFlyEl && (toggleFlyEl.checked=on); 
    world.gravity.set(0,on?0:-9.82,0); 
    if(on) playerBody.velocity.y=0; 
    log('Fly', on?'ON':'OFF');
    if (isTouchDevice) {
        const up = document.getElementById('touch-up');
        const down = document.getElementById('touch-down');
        if (up) up.style.display = on ? 'flex' : 'none';
        if (down) down.style.display = on ? 'flex' : 'none';
    }
}
function toggleFly(){ setFly(!flyMode); }
toggleFlyEl?.addEventListener('change', e => setFly(e.target.checked));
async function loadHDRWithFallback(localPath, fallbackUrl){ return new Promise((resolve)=>{ new RGBELoader().load(localPath, t=>resolve(t), undefined, ()=>{ new RGBELoader().load(fallbackUrl, t=>resolve(t)); }); }); }

// --- Lighting Control ---
const importedLights = [];
const defaultLights = [hemi, dir];
const allLights = [];
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
function applyLightScale(){ for (const l of allLights){ if (l._baseIntensity === undefined) l._baseIntensity = l.intensity; l.intensity = l._baseIntensity * lightScale; } }

// --- Scene Asset Management ---
let currentVisualScene = null;
let currentCollisionBodies = [];

function clearCurrentScene() {
    log('--- Clearing current scene ---');
    if (currentVisualScene) {
        scene.remove(currentVisualScene);
        currentVisualScene.traverse(o => {
            if (o.geometry) o.geometry.dispose();
            if (o.material) {
                if (Array.isArray(o.material)) o.material.forEach(m => m.dispose());
                else o.material.dispose();
            }
        });
        currentVisualScene = null;
    }

    if (collisionSceneGroup) {
        scene.remove(collisionSceneGroup);
        collisionSceneGroup = null;
    }

    currentCollisionBodies.forEach(body => world.removeBody(body));
    currentCollisionBodies = [];

    importedLights.forEach(light => scene.remove(light));
    importedLights.length = 0;
    allLights.length = 0;

    scene.remove(hemi, dir);
    if(ambientFallback) scene.remove(ambientFallback);
}

async function loadScene(sceneConfig){
  clearCurrentScene();
  currentSceneConfig = sceneConfig;
  statusEl.textContent = `Loading ${sceneConfig.name}...`;
  log(`--- Loading scene: ${sceneConfig.name} ---`);
  
  try{
    // Load environment map (only once)
    if (!storedEnvMap) {
      const hdrTex = await loadHDRWithFallback( './assets/env/venice_sunset_1k.hdr', 'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/equirectangular/venice_sunset_1k.hdr' );
      hdrTex.mapping = THREE.EquirectangularReflectionMapping; const pmrem = new THREE.PMREMGenerator(renderer);
      storedEnvMap = pmrem.fromEquirectangular(hdrTex).texture; hdrTex.dispose(); pmrem.dispose();
    }
    
    // Load scene models
    const visualGLTF = await loader.loadAsync(`${sceneConfig.path}Visual_Scene.glb`);
    const collisionGLTF = await loader.loadAsync(`${sceneConfig.path}Collision_Scene.glb`);
    
    // Process visual scene
    currentVisualScene = visualGLTF.scene || visualGLTF.scenes?.[0];
    scene.add(currentVisualScene);
    currentVisualScene.traverse(o=>{ if(o.isMesh){ o.castShadow = true; o.receiveShadow = true; } });
    currentVisualScene.traverse(o=>{ if (o.isLight){ importedLights.push(o); if (o.shadow){ o.shadow.bias=-0.0005; o.shadow.normalBias=0.02; } } });
    
    // Process lights
    if (importedLights.length > 0){
      allLights.push(...importedLights);
      log('Imported lights:', importedLights.length);
    } else {
      scene.add(hemi, dir);
      allLights.push(...defaultLights);
      log('No Blender lights. Using default lights + HDRI.');
    }
    applyExposure();
    applyLightScale();
    updateLightingSettings();
    
    // Process collision scene
    const colRoot = collisionGLTF.scene || collisionGLTF.scenes?.[0];
    collisionSceneGroup = colRoot.clone(true);
    collisionSceneGroup.traverse(o => { if (o.isMesh) o.material = new THREE.MeshBasicMaterial({ color:0xff0077, wireframe:true, transparent:true, opacity:0.35 }); });
    collisionSceneGroup.visible = toggleCollisionEl.checked; scene.add(collisionSceneGroup);
    
    buildPhysicsFromCollision(colRoot);
    
    statusEl.textContent = 'Loaded. Click canvas; WASD; Space; Shift; F fly; H collision; R respawn; ` debug.';
    respawn(); // Move player to the new scene's spawn point
    
  }catch(err){ console.error(err); statusEl.textContent='Error loading GLBs.'; log('Loader error:', err?.message||err); }
}

function buildPhysicsFromCollision(root){
  let bodies=0; root.updateMatrixWorld(true); const v = new THREE.Vector3();
  root.traverse(obj=>{
    if(!obj.isMesh || !obj.geometry || !obj.geometry.attributes?.position) return;
    const geom = obj.geometry; const worldM = obj.matrixWorld.clone();
    const pos = geom.attributes.position; const verts = new Float32Array(pos.count*3);
    for(let i=0;i<pos.count;i++){ v.fromBufferAttribute(pos,i).applyMatrix4(worldM); verts[i*3+0]=v.x; verts[i*3+1]=v.y; verts[i*3+2]=v.z; }
    let indices = geom.index ? (geom.index.array instanceof Uint32Array ? geom.index.array : new Uint32Array(geom.index.array)) : new Uint32Array(pos.count).map((_,i)=>i);
    try{
      const shape = new CANNON.Trimesh(verts, indices);
      const body = new CANNON.Body({ mass:0, material:worldMat });
      body.addShape(shape);
      world.addBody(body);
      currentCollisionBodies.push(body); // Track for removal
      bodies++;
    } catch(e){ log('Trimesh error', obj.name||'(unnamed)', e?.message||e); }
  });
  log(`Physics: added ${bodies} static bodies from Collision_Scene.glb`);
}

function setupSceneSwitcher() {
    SCENES.forEach((s, i) => {
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = s.name;
        sceneSelectorEl.appendChild(opt);
    });

    const savedSceneIndex = parseInt(LS.getItem(LS_CURRENT_SCENE) ?? '0', 10);
    const initialSceneIndex = savedSceneIndex < SCENES.length ? savedSceneIndex : 0;
    sceneSelectorEl.value = initialSceneIndex;

    sceneSelectorEl.addEventListener('change', () => {
        const index = parseInt(sceneSelectorEl.value, 10);
        LS.setItem(LS_CURRENT_SCENE, index);
        loadScene(SCENES[index]);
    });

    loadScene(SCENES[initialSceneIndex]);
}
setupSceneSwitcher();

// --- Main Loop ---
const clock = new THREE.Clock(); let accum=0; const FIXED=1/60;
let lastTime = performance.now();
const fpsSamples = []; const FPS_N = 60;
function animate(){
  requestAnimationFrame(animate);

  if (isTouchDevice && touchState.look.active && !isMenuOpen) {
    const LOOK_SENSITIVITY = 0.003;
    const dx = touchState.look.currentX - touchState.look.startX;
    const dy = touchState.look.currentY - touchState.look.startY;
    
    euler.setFromQuaternion(camera.quaternion);
    euler.y -= dx * LOOK_SENSITIVITY;
    euler.x -= dy * LOOK_SENSITIVITY;
    euler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, euler.x));
    camera.quaternion.setFromEuler(euler);

    touchState.look.startX = touchState.look.currentX;
    touchState.look.startY = touchState.look.currentY;
  }
  
  const dt=Math.min(0.05, clock.getDelta()); accum+=dt; while(accum>=FIXED){ step(FIXED); accum-=FIXED; }
  const eye = new THREE.Vector3(0, HALF + PLAYER_RADIUS, 0);
  camera.position.set(playerBody.position.x+eye.x, playerBody.position.y+eye.y, playerBody.position.z+eye.z);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
  renderer.render(scene, camera);
  const now = performance.now(); const instFps = 1000 / (now - lastTime); lastTime = now;
  fpsSamples.push(instFps); if (fpsSamples.length > FPS_N) fpsSamples.shift();
  const avgFps = fpsSamples.reduce((a,b)=>a+b,0) / fpsSamples.length;
  fpsEl.textContent = avgFps.toFixed(0);
  const p = playerBody.position, vel = playerBody.velocity;
  const pressed = Object.entries(keys).filter(([,v])=>v).map(([k])=>k).join(',') || '—';
  statusEl.textContent = `pos(${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}) vel(${vel.x.toFixed(1)}, ${vel.y.toFixed(1)}, ${vel.z.toFixed(1)}) keys[${pressed}] fly:${flyMode?'on':'off'}`;
}
animate();

function step(dt){
  if (flyMode && world.gravity.y !== 0) world.gravity.set(0,0,0); if (!flyMode && world.gravity.y !== -9.82) world.gravity.set(0,-9.82,0);
  const grounded = flyMode ? false : isGrounded();
  const currentBaseSpeed = flyMode ? baseMoveSpeed * 1.75 : baseMoveSpeed;
  const moveSpeed = keys.shift ? currentBaseSpeed * 1.6 : currentBaseSpeed;
  const accel = 30;
  const forward = new THREE.Vector3(); camera.getWorldDirection(forward);
  if (!flyMode){ forward.y = 0; forward.normalize(); } else { forward.normalize(); }
  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0,1,0)).normalize();
  let vx=0, vy=flyMode?0:playerBody.velocity.y, vz=0;
  if (keys.w){ vx+=forward.x; if(flyMode) vy+=forward.y; vz+=forward.z; }
  if (keys.s){ vx-=forward.x; if(flyMode) vy-=forward.y; vz-=forward.z; }
  if (keys.d){ vx+=right.x;   vz+=right.z; }
  if (keys.a){ vx-=right.x;   vz-=right.z; }
  if (flyMode){ if (keys.e||keys.space) vy+=1; if (keys.q||keys.ctrl) vy-=1; }
  const moveVec = flyMode ? new THREE.Vector3(vx,vy,vz) : new THREE.Vector3(vx,0,vz);
  if (moveVec.length() > 0.001) moveVec.normalize();
  vx = moveVec.x * moveSpeed; vy = flyMode ? moveVec.y * moveSpeed : playerBody.velocity.y; vz = moveVec.z * moveSpeed;
  playerBody.wakeUp(); const v = playerBody.velocity;
  v.x += THREE.MathUtils.clamp(vx - v.x, -accel*dt, accel*dt);
  v.z += THREE.MathUtils.clamp(vz - v.z, -accel*dt, accel*dt);
  if (flyMode){ v.y += THREE.MathUtils.clamp(vy - v.y, -accel*dt, accel*dt); }
  else if (keys.space && grounded){ v.y = jumpHeight; }
  world.step(FIXED);
}
function isGrounded(){
  const from = new CANNON.Vec3(playerBody.position.x, playerBody.position.y - HALF, playerBody.position.z);
  const to   = new CANNON.Vec3(from.x, from.y - (PLAYER_RADIUS + 0.1), from.z);
  const res  = new CANNON.RaycastResult();
  world.raycastClosest(from, to, { skipBackfaces:true, collisionFilterMask:-1 }, res);
  return res.hasHit;
}

// --- Touch Controls Initialization ---
function initTouchControls() {
    if (!isTouchDevice) return;

    // --- NEW LOGIC: Setup Menu/Gameplay mode ---
    uiPanel.classList.add('collapsed'); // Start with menu closed on mobile
    btnCollapse.style.display = 'none'; // Hide desktop collapse button
    btnCloseMenu.style.display = 'block'; // Show new mobile close button

    function openMenu() {
        isMenuOpen = true;
        uiPanel.classList.remove('collapsed');
    }
    function closeMenu() {
        isMenuOpen = false;
        uiPanel.classList.add('collapsed');
    }

    btnCloseMenu.addEventListener('click', closeMenu);
    // --- END NEW LOGIC ---

    const controlsHTML = `
        <div id="touch-controls" style="display: block;">
            <div id="touch-menu-button" title="Open Menu">
              <span></span><span></span><span></span>
            </div>
            <div class="touch-joystick-base">
                <div class="touch-joystick-stick"></div>
            </div>
            <div class="touch-buttons">
                <div id="touch-up" class="touch-button" style="display: none;">E</div>
                <div id="touch-down" class="touch-button" style="display: none;">Q</div>
                <div id="touch-jump" class="touch-button">⇪</div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', controlsHTML);
    
    const joystickBase = document.querySelector('.touch-joystick-base');
    const joystickStick = document.querySelector('.touch-joystick-stick');
    const baseRadius = joystickBase.offsetWidth / 2;
    const stickRadius = joystickStick.offsetWidth / 2;
    const maxDelta = baseRadius - stickRadius;

    // --- NEW: Add listener for on-screen menu button ---
    const menuButton = document.getElementById('touch-menu-button');
    menuButton.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        menuButton.classList.add('active');
    });
    menuButton.addEventListener('touchend', (e) => {
        menuButton.classList.remove('active');
        openMenu();
    });
    
    function handleTouchStart(e) {
        if (isMenuOpen) return; // If menu is open, do nothing for gameplay
        e.preventDefault();

        for (const touch of e.changedTouches) {
            const targetButton = e.target.closest('.touch-button');
            if (targetButton) {
                targetButton.classList.add('active');
                if (targetButton.id === 'touch-jump') keys.space = true;
                if (targetButton.id === 'touch-up') keys.e = true;
                if (targetButton.id === 'touch-down') keys.q = true;
                playerBody.wakeUp();
                continue;
            }

            if (touch.clientX < window.innerWidth / 2 && !touchState.joystick.active) {
                touchState.joystick.id = touch.identifier;
                touchState.joystick.active = true;
                touchState.joystick.startX = touch.clientX;
                touchState.joystick.startY = touch.clientY;
                joystickBase.style.left = `${touch.clientX}px`;
                joystickBase.style.top = `${touch.clientY}px`;
                joystickBase.style.transform = `translate(-50%, -50%)`;
            }
            else if (touch.clientX >= window.innerWidth / 2 && !touchState.look.active) {
                touchState.look.id = touch.identifier;
                touchState.look.active = true;
                touchState.look.startX = touch.clientX;
                touchState.look.startY = touch.clientY;
                touchState.look.currentX = touch.clientX;
                touchState.look.currentY = touch.clientY;
            }
        }
    }

    function handleTouchMove(e) {
        if (isMenuOpen) return; // If menu is open, do nothing for gameplay
        e.preventDefault();
        for (const touch of e.changedTouches) {
            if (touch.identifier === touchState.joystick.id) {
                const dx = touch.clientX - touchState.joystick.startX;
                const dy = touch.clientY - touchState.joystick.startY;
                const angle = Math.atan2(dy, dx);
                const distance = Math.min(maxDelta, Math.hypot(dx, dy));
                
                joystickStick.style.transform = `translate(${Math.cos(angle) * distance}px, ${Math.sin(angle) * distance}px)`;

                const normalizedX = (Math.cos(angle) * distance) / maxDelta;
                const normalizedY = (Math.sin(angle) * distance) / maxDelta;

                keys.w = normalizedY < -0.2;
                keys.s = normalizedY > 0.2;
                keys.a = normalizedX < -0.2;
                keys.d = normalizedX > 0.2;
                playerBody.wakeUp();
            } else if (touch.identifier === touchState.look.id) {
                touchState.look.currentX = touch.clientX;
                touchState.look.currentY = touch.clientY;
            }
        }
    }

    function handleTouchEnd(e) {
        if (isMenuOpen) return; // If menu is open, do nothing for gameplay
        e.preventDefault();
        for (const touch of e.changedTouches) {
            const activeButtons = document.querySelectorAll('.touch-button.active');
            activeButtons.forEach(btn => {
                btn.classList.remove('active');
                if (btn.id === 'touch-jump') keys.space = false;
                if (btn.id === 'touch-up') keys.e = false;
                if (btn.id === 'touch-down') keys.q = false;
            });

            if (touch.identifier === touchState.joystick.id) {
                touchState.joystick.active = false;
                touchState.joystick.id = -1;
                joystickStick.style.transform = `translate(0, 0)`;
                joystickBase.style.left = `12vw`;
                joystickBase.style.bottom = `12vw`;
                joystickBase.style.top = 'auto';
                joystickBase.style.transform = `translate(-50%, 50%)`;
                keys.w = keys.a = keys.s = keys.d = false;
            } else if (touch.identifier === touchState.look.id) {
                touchState.look.active = false;
                touchState.look.id = -1;
            }
        }
    }

    window.addEventListener('touchstart', handleTouchStart, { passive: false });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd, { passive: false });
    window.addEventListener('touchcancel', handleTouchEnd, { passive: false });
}

initTouchControls();