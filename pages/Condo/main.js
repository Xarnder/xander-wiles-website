// Imports
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import * as CANNON from 'cannon-es';

// UI
const statusEl = document.getElementById('status');
const debugEl  = document.getElementById('debug');
const fpsEl = document.getElementById('fps');
const toggleCollisionEl = document.getElementById('toggleCollision');
const toggleFlyEl = document.getElementById('toggleFly');
const btnCollapse = document.getElementById('btnCollapse');
const btnDebug = document.getElementById('btnDebug');
const uiPanel = document.getElementById('ui');

const exposureSlider = document.getElementById('exposure');
const exposureValue = document.getElementById('exposureValue');
const lightScaleSlider = document.getElementById('lightScale');
const lightScaleValue = document.getElementById('lightScaleValue');

const LS = window.localStorage;
const LS_UI_COLLAPSED = 'fps.ui.collapsed';
const LS_DEBUG_VISIBLE = 'fps.debug.visible';
const LS_EXPOSURE = 'fps.exposure';
const LS_LIGHT_SCALE = 'fps.lightScale';

if (LS.getItem(LS_UI_COLLAPSED) === 'true') uiPanel.classList.add('collapsed');
let debugVisible = LS.getItem(LS_DEBUG_VISIBLE) !== 'false'; // default true
debugEl.style.display = debugVisible ? 'block' : 'none';

let exposure = parseFloat(LS.getItem(LS_EXPOSURE) ?? '0.25');
if (!Number.isFinite(exposure)) exposure = 0.25;
exposure = Math.min(2.0, Math.max(0.01, exposure));
exposureSlider.value = exposure.toFixed(2);
exposureValue.textContent = exposure.toFixed(2);

let lightScale = parseFloat(LS.getItem(LS_LIGHT_SCALE) ?? '0.0020');
if (!Number.isFinite(lightScale)) lightScale = 0.0020;
lightScale = Math.min(0.01, Math.max(0.0, lightScale));
lightScaleSlider.value = lightScale.toFixed(4);
lightScaleValue.textContent = lightScale.toFixed(4);

btnCollapse.addEventListener('click', () => {
  uiPanel.classList.toggle('collapsed');
  LS.setItem(LS_UI_COLLAPSED, uiPanel.classList.contains('collapsed'));
});
btnDebug.addEventListener('click', () => toggleDebug());
exposureSlider.addEventListener('input', () => {
  exposure = parseFloat(exposureSlider.value);
  exposureValue.textContent = exposure.toFixed(2);
  LS.setItem(LS_EXPOSURE, exposure.toFixed(2));
  applyExposure();
});
lightScaleSlider.addEventListener('input', () => {
  lightScale = parseFloat(lightScaleSlider.value);
  lightScaleValue.textContent = lightScale.toFixed(4);
  LS.setItem(LS_LIGHT_SCALE, lightScale.toFixed(4));
  applyLightScale();
});

function toggleDebug(){ debugVisible = !debugVisible; debugEl.style.display = debugVisible?'block':'none'; LS.setItem(LS_DEBUG_VISIBLE, debugVisible); }
function log(...args){ console.log(...args); if(!debugVisible) return; debugEl.textContent += args.join(' ')+'\n'; debugEl.scrollTop = debugEl.scrollHeight; }
const base = (url)=> (url||'').split('/').pop();

// Renderer/Scene/Camera
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias:true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;

// Realistic pipeline + global exposure knob
renderer.physicallyCorrectLights = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = exposure;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

function applyExposure(){ renderer.toneMappingExposure = exposure; }

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0f14);
const camera = new THREE.PerspectiveCamera(75, 2, 0.05, 5000);

// Default lights (used only if no Blender lights are present)
const hemi = new THREE.HemisphereLight(0xffffff, 0x222233, 0.5); hemi.name = 'DefaultHemi';
const dir  = new THREE.DirectionalLight(0xffffff, 0.6); dir.position.set(10,15,10); dir.name='DefaultDir';
dir.castShadow = true; dir.shadow.mapSize.set(2048,2048); dir.shadow.bias = -0.0005; dir.shadow.normalBias = 0.02;
scene.add(hemi, dir);

// Helpers
scene.add(new THREE.AxesHelper(1.0));
const grid = new THREE.GridHelper(200,200,0x334455,0x223344); grid.material.opacity=0.15; grid.material.transparent=true; grid.position.y=-0.001; scene.add(grid);

// Pointer lock
const controls = new PointerLockControls(camera, document.body);
document.addEventListener('click', () => { if (document.pointerLockElement !== document.body) controls.lock(); });

// Physics
const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
world.broadphase = new CANNON.SAPBroadphase(world);
world.allowSleep = true;

const worldMat  = new CANNON.Material('world');
const playerMat = new CANNON.Material('player');
world.addContactMaterial(new CANNON.ContactMaterial(worldMat, playerMat, { friction: 0.0, restitution: 0.0 }));

const PLAYER_RADIUS = 0.35;
const PLAYER_HEIGHT = 1.6;
const HALF = (PLAYER_HEIGHT/2) - PLAYER_RADIUS;

const playerBody = new CANNON.Body({
  mass: 70, material: playerMat, linearDamping: 0.05, allowSleep:false, fixedRotation:true
});
playerBody.addShape(new CANNON.Sphere(PLAYER_RADIUS), new CANNON.Vec3(0, +HALF, 0));
playerBody.addShape(new CANNON.Sphere(PLAYER_RADIUS), new CANNON.Vec3(0, -HALF, 0));
playerBody.updateMassProperties();
playerBody.position.set(0,20,0);
world.addBody(playerBody);

// Input
const keys = { w:false,a:false,s:false,d:false, space:false, shift:false, q:false,e:false, ctrl:false };
addEventListener('keydown', (e) => {
  setKey(e.code, true);
  if (e.code === 'KeyF') toggleFly();
  if (e.code === 'KeyR') respawnAtOrigin();
  if (e.code === 'KeyH') toggleCollision();
  if (e.code === 'Backquote') toggleDebug();
});
addEventListener('keyup', (e) => setKey(e.code, false));
function setKey(code, v){
  if (code==='KeyW') keys.w=v; if (code==='KeyA') keys.a=v; if (code==='KeyS') keys.s=v; if (code==='KeyD') keys.d=v;
  if (code==='Space') keys.space=v; if (code==='ShiftLeft'||code==='ShiftRight') keys.shift=v;
  if (code==='KeyQ') keys.q=v; if (code==='KeyE') keys.e=v; if (code==='ControlLeft'||code==='Right') keys.ctrl=v;
  playerBody.wakeUp();
}
function respawnAtOrigin(){ playerBody.position.set(0,20,0); playerBody.velocity.set(0,0,0); }

// Loading manager
const manager = new THREE.LoadingManager();
manager.onStart = (url,l,t)=>{ statusEl.textContent = `Starting: ${base(url)} (0/${t})`; log('onStart', base(url), l, t); };
manager.onProgress=(url,l,t)=>{ const p=t?Math.round(l/t*100):0; statusEl.textContent=`Loading ${l}/${t} – ${base(url)} (${p}%)`; };
manager.onError  = (url)=>{ statusEl.textContent=`Error: ${base(url)}`; log('onError', url); };
manager.onLoad   = ()=>log('All assets loaded.');

const loader = new GLTFLoader(manager);
const draco = new DRACOLoader(); draco.setDecoderPath('https://unpkg.com/three@0.159.0/examples/jsm/libs/draco/'); loader.setDRACOLoader(draco);
loader.setMeshoptDecoder(MeshoptDecoder);

// UI toggles
let collisionSceneGroup = null;
function setCollisionVisible(on){ if (collisionSceneGroup) collisionSceneGroup.visible = on; if (toggleCollisionEl) toggleCollisionEl.checked = !!on; log('Collision render', on?'ON':'OFF'); }
function toggleCollision(){ const on = !(collisionSceneGroup && collisionSceneGroup.visible); setCollisionVisible(on); }
toggleCollisionEl?.addEventListener('change', e => setCollisionVisible(e.target.checked));

let flyMode=false;
function setFly(on){ flyMode=on; toggleFlyEl && (toggleFlyEl.checked=on); world.gravity.set(0,on?0:-9.82,0); if(on) playerBody.velocity.y=0; log('Fly', on?'ON':'OFF'); }
function toggleFly(){ setFly(!flyMode); }
toggleFlyEl?.addEventListener('change', e => setFly(e.target.checked));

// HDR environment (optional) with fallback
async function loadHDRWithFallback(localPath, fallbackUrl){
  return new Promise((resolve)=>{
    new RGBELoader().load(localPath, t=>resolve(t), undefined, ()=>{
      new RGBELoader().load(fallbackUrl, t=>resolve(t));
    });
  });
}

// Lights scaling
const importedLights = [];
const defaultLights = [hemi, dir];
const allLights = []; // will be filled after load (imported or default or both)
function applyLightScale(){
  for (const l of allLights){
    if (l._baseIntensity === undefined) l._baseIntensity = l.intensity;
    l.intensity = l._baseIntensity * lightScale;
  }
}

// Load scenes + lights
async function loadScenes(){
  try{
    const hdrTex = await loadHDRWithFallback(
      './assets/env/venice_sunset_1k.hdr',
      'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/equirectangular/venice_sunset_1k.hdr'
    );
    hdrTex.mapping = THREE.EquirectangularReflectionMapping;
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envMap = pmrem.fromEquirectangular(hdrTex).texture;
    scene.environment = envMap; // comment out if you don't want IBL
    hdrTex.dispose(); pmrem.dispose();

    const visualGLTF    = await loader.loadAsync('./assets/models/Visual_Scene.glb');
    const collisionGLTF = await loader.loadAsync('./assets/models/Collision_Scene.glb');

    const visualRoot = visualGLTF.scene || visualGLTF.scenes?.[0];
    scene.add(visualRoot);

    // shadows
    visualRoot.traverse(o=>{ if(o.isMesh){ o.castShadow = true; o.receiveShadow = true; } });

    // Blender lights (KHR_lights_punctual)
    visualRoot.traverse(o=>{
      if (o.isLight){
        importedLights.push(o);
        o.castShadow = true;
        if (o.shadow){ o.shadow.mapSize.set(1024,1024); o.shadow.bias=-0.0005; o.shadow.normalBias=0.02; }
      }
    });

    // Decide which lights to scale/control: imported if present, otherwise defaults
    if (importedLights.length > 0){
      // Prefer Blender lights; remove defaults so you don't double light
      scene.remove(hemi); scene.remove(dir);
      allLights.push(...importedLights);
      log('Imported lights:', importedLights.length);
    } else {
      allLights.push(...defaultLights);
      log('No Blender lights found. Using default lights + HDRI.');
    }

    // Apply initial scales
    applyExposure();
    applyLightScale();

    // Collision wire & physics
    const colRoot = collisionGLTF.scene || collisionGLTF.scenes?.[0];
    collisionSceneGroup = colRoot.clone(true);
    collisionSceneGroup.traverse(o => { if (o.isMesh) o.material = new THREE.MeshBasicMaterial({ color:0xff0077, wireframe:true, transparent:true, opacity:0.35 }); });
    collisionSceneGroup.visible = false; scene.add(collisionSceneGroup);
    buildPhysicsFromCollision(colRoot);

    statusEl.textContent = 'Loaded. Click canvas; WASD; Space; Shift; F fly; H toggle collision; R respawn; ` debug.';
  }catch(err){
    console.error(err); statusEl.textContent='Error loading GLBs.'; log('Loader error:', err?.message||err);
  }
}
loadScenes();

function buildPhysicsFromCollision(root){
  let bodies=0;
  root.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  root.traverse(obj=>{
    if(!obj.isMesh || !obj.geometry || !obj.geometry.attributes?.position) return;
    const geom = obj.geometry; const worldM = obj.matrixWorld.clone();
    const pos = geom.attributes.position; const verts = new Float32Array(pos.count*3);
    for(let i=0;i<pos.count;i++){ v.fromBufferAttribute(pos,i).applyMatrix4(worldM); verts[i*3+0]=v.x; verts[i*3+1]=v.y; verts[i*3+2]=v.z; }
    let indices;
    if (geom.index){ indices = geom.index.array instanceof Uint32Array ? geom.index.array : new Uint32Array(geom.index.array); }
    else { indices = new Uint32Array(pos.count); for(let i=0;i<pos.count;i++) indices[i]=i; }
    try{ const shape = new CANNON.Trimesh(verts, indices); const body = new CANNON.Body({ mass:0, material:worldMat }); body.addShape(shape); world.addBody(body); bodies++; }
    catch(e){ log('Trimesh error', obj.name||'(unnamed)', e?.message||e); }
  });
  log(`Physics: added ${bodies} static bodies from Collision_Scene.glb`);
}

// Simulation + FPS counter
const clock = new THREE.Clock(); let accum=0; const FIXED=1/60;
let lastTime = performance.now();
const fpsSamples = []; const FPS_N = 60;

function animate(){
  requestAnimationFrame(animate);
  const dt=Math.min(0.05, clock.getDelta()); accum+=dt; while(accum>=FIXED){ step(FIXED); accum-=FIXED; }

  const eye = new THREE.Vector3(0, HALF, 0);
  camera.position.set(playerBody.position.x+eye.x, playerBody.position.y+eye.y, playerBody.position.z+eye.z);

  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
  renderer.render(scene, camera);

  // FPS
  const now = performance.now();
  const instFps = 1000 / (now - lastTime);
  lastTime = now;
  fpsSamples.push(instFps);
  if (fpsSamples.length > FPS_N) fpsSamples.shift();
  const avgFps = fpsSamples.reduce((a,b)=>a+b,0) / fpsSamples.length;
  fpsEl.textContent = avgFps.toFixed(0);

  // Status line
  const p = playerBody.position, vel = playerBody.velocity;
  const pressed = Object.entries(keys).filter(([k,v])=>v).map(([k])=>k).join(',') || '—';
  statusEl.textContent = `Exposure ${renderer.toneMappingExposure.toFixed(2)}  |  LightScale ${lightScale.toFixed(4)}  |  pos(${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)})  vel(${vel.x.toFixed(2)}, ${vel.y.toFixed(2)}, ${vel.z.toFixed(2)})  keys[${pressed}]  fly:${flyMode?'on':'off'}`;
}
animate();

function step(dt){
  if (flyMode && world.gravity.y !== 0) world.gravity.set(0,0,0);
  if (!flyMode && world.gravity.y !== -9.82) world.gravity.set(0,-9.82,0);

  const grounded = flyMode ? false : isGrounded();

  const baseSpeed = flyMode ? 7.0 : 4.0;
  const moveSpeed = keys.shift ? baseSpeed*1.6 : baseSpeed;
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

  // ✅ Correct normalization in fly mode (bug fix)
  if (flyMode){
    const len=Math.hypot(vx,vy,vz)||1;
    vx = vx/len*moveSpeed;
    vy = vy/len*moveSpeed;
    vz = vz/len*moveSpeed;
  } else {
    const len=Math.hypot(vx,vz)||1;
    vx = vx/len*moveSpeed;
    vz = vz/len*moveSpeed;
  }

  playerBody.wakeUp();
  const v = playerBody.velocity;
  v.x += THREE.MathUtils.clamp(vx - v.x, -accel*dt, accel*dt);
  v.z += THREE.MathUtils.clamp(vz - v.z, -accel*dt, accel*dt);
  if (flyMode){ v.y += THREE.MathUtils.clamp(vy - v.y, -accel*dt, accel*dt); }
  else if (keys.space && grounded){ v.y = 5.5; }

  world.step(FIXED);
}
function isGrounded(){
  const from = new CANNON.Vec3(playerBody.position.x, playerBody.position.y - HALF, playerBody.position.z);
  const to   = new CANNON.Vec3(from.x, from.y - (PLAYER_RADIUS + 0.2), from.z);
  const ray  = new CANNON.Ray(from, to);
  const res  = new CANNON.RaycastResult();
  ray.intersectWorld(world, { result: res, skipBackfaces:true, collisionFilterMask:-1, mode:CANNON.Ray.ANY });
  return res.hasHit;
}
