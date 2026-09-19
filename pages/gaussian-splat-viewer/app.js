/**
 * app.js — Gaussian Splat 3D Viewer Application
 * Features:
 *   - Drag & drop loading of .ply, .splat, .ksplat, .spz
 *   - Orbit Controls inspection mode + First-person Walk-Around mode (WASD + mouse look)
 *   - Ground & Axis Alignment suite:
 *       • Fix upside-down orientation (Flip Y)
 *       • Drop to Floor / Snap to ground plane (Y = 0) via bounding box
 *       • Center on Origin (X = 0, Z = 0)
 *       • Interactive 3D Transform Gizmo (Move, Tilt/Rotate, Scale in 3D)
 *       • Click-to-Pick Ground Point on splat surface
 *       • Micro-nudges for height (Y) and tilt (Pitch/Roll)
 *       • Axis Inversion (Flip Y, Flip Z, Flip X) & Coordinate Presets (COLMAP, OpenCV, Blender)
 *   - Procedural 3D splat presets (Cosmic Torus, Neon Bloom, Quantum Helix)
 *   - Visual ground plane & shadow disc, grid floor, axes helper
 *   - Screenshot exporter & real-time telemetry (FPS, Splat count)
 */

import * as THREE from 'three';
import * as GaussianSplats3D from '@mkkellogg/gaussian-splats-3d';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { createSampleSplatFile } from './sample-generator.js';

// Application State
const state = {
    mode: 'orbit', // 'orbit' | 'walk'
    navSpeed: 4.0, // m/s
    mouseSensitivity: 0.0022,
    fov: 65,
    flipX: 1,
    flipY: 1,
    flipZ: 1,
    rotX: 0,
    rotY: 0,
    rotZ: 0,
    posX: 0,
    posY: 0,
    posZ: 0,
    scale: 1.0,
    alphaThreshold: 1,
    currentFileName: '',
    splatCount: 0,
    fps: 0,
    showGrid: true,
    showAxes: true,
    bgColor: '#111115',
    isPointerLocked: false,
    activePreset: 'torus',
    showGizmo: false,
    gizmoMode: 'translate', // 'translate' | 'rotate' | 'scale'
    isPickingGround: false
};

// Keyboard state for Walk mode
const keys = {
    KeyW: false,
    KeyS: false,
    KeyA: false,
    KeyD: false,
    Space: false,
    KeyC: false,
    KeyQ: false,
    KeyE: false,
    ShiftLeft: false,
    ShiftRight: false
};

// Globals
let viewer = null;
let gridHelper = null;
let groundDisc = null;
let axesHelper = null;
let transformControls = null;
let transformProxy = null;
let currentBlobUrl = null;
let lastFrameTime = performance.now();
let frameCount = 0;
let fpsLastTime = performance.now();
let dragCounter = 0;

// Mobile Drawer State ('collapsed' | 'half' | 'full')
let mobileDrawerState = 'half';
let selectedMobileAxis = 'all';

// Pitch & Yaw for first-person walk mode
let pitch = 0;
let yaw = 0;

// DOM Elements Cache
const dom = {};

window.addEventListener('DOMContentLoaded', init);

async function init() {
    cacheDomElements();
    setupUIEventListeners();
    setupMobileDrawerGestures();
    setupKeyboardListeners();
    setupDragAndDrop();

    // Set initial drawer state on mobile screens
    if (window.innerWidth <= 768) {
        setMobileDrawerState('half');
    }

    initViewer();
    setupSceneHelpers();
    setupTransformControls();

    // Responsive window listener
    window.addEventListener('resize', handleWindowResize);

    // Start FPS tracking loop
    requestAnimationFrame(renderLoop);

    // Load initial demo scene (Cosmic Torus)
    await loadPresetScene('torus');
}

function handleWindowResize() {
    if (window.innerWidth <= 768) {
        if (!dom.controlsPanel.classList.contains('mobile-collapsed') &&
            !dom.controlsPanel.classList.contains('mobile-half') &&
            !dom.controlsPanel.classList.contains('mobile-full')) {
            setMobileDrawerState('half');
        }
    } else {
        dom.controlsPanel.classList.remove('mobile-collapsed', 'mobile-half', 'mobile-full');
    }

    if (transformControls) {
        const isTouchOrMobile = window.innerWidth <= 768 || ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
        transformControls.size = isTouchOrMobile ? 1.35 : 0.85;
    }
}

function setMobileDrawerState(newState) {
    mobileDrawerState = newState;
    if (!dom.controlsPanel) return;

    dom.controlsPanel.classList.remove('mobile-collapsed', 'mobile-half', 'mobile-full', 'collapsed');
    dom.controlsPanel.classList.add(`mobile-${newState}`);

    if (dom.togglePanelBtn) {
        dom.togglePanelBtn.classList.toggle('visible', newState === 'collapsed');
    }

    if (dom.drawerModeText) {
        dom.drawerModeText.textContent = (newState === 'full') ? 'Half' : 'Full';
    }

    if ('vibrate' in navigator) {
        try { navigator.vibrate(8); } catch (_) {}
    }
}

function toggleDrawerMode() {
    if (mobileDrawerState === 'full') {
        setMobileDrawerState('half');
    } else {
        setMobileDrawerState('full');
    }
}

function setupMobileDrawerGestures() {
    if (!dom.controlsPanel) return;

    let touchStartY = 0;
    let touchStartX = 0;
    let isDraggingHandle = false;

    const dragTargets = [dom.sheetDragHandle, dom.controlsPanel.querySelector('.panel-header')].filter(Boolean);

    dragTargets.forEach(target => {
        target.addEventListener('touchstart', (e) => {
            if (e.target.closest('button') || e.target.closest('input')) return;
            touchStartY = e.touches[0].clientY;
            touchStartX = e.touches[0].clientX;
            isDraggingHandle = true;
        }, { passive: true });

        target.addEventListener('touchend', (e) => {
            if (!isDraggingHandle) return;
            isDraggingHandle = false;

            const touchEndY = e.changedTouches[0].clientY;
            const touchEndX = e.changedTouches[0].clientX;
            const deltaY = touchEndY - touchStartY;
            const deltaX = touchEndX - touchStartX;

            // Detect vertical swipe gestures
            if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 35) {
                if (deltaY > 0) {
                    // Swiped Downwards
                    if (mobileDrawerState === 'full') {
                        setMobileDrawerState('half');
                    } else if (mobileDrawerState === 'half') {
                        setMobileDrawerState('collapsed');
                    }
                } else {
                    // Swiped Upwards
                    if (mobileDrawerState === 'half') {
                        setMobileDrawerState('full');
                    }
                }
            } else if (Math.abs(deltaY) < 10 && Math.abs(deltaX) < 10 && e.target.closest('#sheet-drag-handle')) {
                // Tapped on the drag handle pill
                toggleDrawerMode();
            }
        }, { passive: true });
    });
}

function cacheDomElements() {
    dom.canvasContainer = document.getElementById('canvas-container');
    dom.controlsPanel = document.getElementById('controls-panel');
    dom.togglePanelBtn = document.getElementById('toggle-panel-btn');
    dom.panelCollapseBtn = document.getElementById('panel-collapse-btn');
    dom.sheetDragHandle = document.getElementById('sheet-drag-handle');
    dom.drawerModeBtn = document.getElementById('drawer-mode-btn');
    dom.drawerModeText = document.getElementById('drawer-mode-text');
    dom.mobileGizmoBar = document.getElementById('mobile-gizmo-bar');
    dom.mobileGizmoBtns = document.querySelectorAll('.mobile-gizmo-btn');
    dom.mobileAxisBtns = document.querySelectorAll('.mobile-axis-btn');
    dom.mobileNudgeDecBtn = document.getElementById('mobile-nudge-dec-btn');
    dom.mobileNudgeIncBtn = document.getElementById('mobile-nudge-inc-btn');
    dom.mobileGizmoResetBtn = document.getElementById('mobile-gizmo-reset-btn');
    dom.mobileGizmoCloseBtn = document.getElementById('mobile-gizmo-close-btn');
    dom.dropOverlay = document.getElementById('drop-overlay');
    dom.walkCrosshair = document.getElementById('walk-crosshair');
    dom.walkHintBadge = document.getElementById('walk-hint-badge');
    dom.pickGroundBanner = document.getElementById('pick-ground-banner');
    dom.cancelPickBtn = document.getElementById('cancel-pick-btn');
    dom.toastContainer = document.getElementById('toast-container');
    dom.loadingOverlay = document.getElementById('splat-loading-overlay');
    dom.loadingText = document.getElementById('splat-loading-text');
    dom.loadingSubtext = document.getElementById('splat-loading-subtext');
    dom.keybindsModal = document.getElementById('keybinds-modal');

    // Tabs
    dom.tabBtns = document.querySelectorAll('.tab-btn');
    dom.tabContents = document.querySelectorAll('.tab-content');

    // Mode Buttons
    dom.orbitModeBtn = document.getElementById('orbit-mode-btn');
    dom.walkModeBtn = document.getElementById('walk-mode-btn');

    // HUD Elements
    dom.hudModeText = document.getElementById('hud-mode-text');
    dom.hudSplatCount = document.getElementById('hud-splat-count');
    dom.hudFps = document.getElementById('hud-fps');
    dom.hudSnapshotBtn = document.getElementById('hud-snapshot-btn');
    dom.hudFullscreenBtn = document.getElementById('hud-fullscreen-btn');
    dom.hudHelpBtn = document.getElementById('hud-help-btn');

    // Nav Sliders
    dom.speedSlider = document.getElementById('speed-slider');
    dom.speedVal = document.getElementById('speed-val');
    dom.sensitivitySlider = document.getElementById('sensitivity-slider');
    dom.sensitivityVal = document.getElementById('sensitivity-val');
    dom.fovSlider = document.getElementById('fov-slider');
    dom.fovVal = document.getElementById('fov-val');
    dom.resetCameraBtn = document.getElementById('reset-camera-btn');

    // Preset Views
    dom.presetViewBtns = document.querySelectorAll('[data-view-preset]');

    // Ground & Axis Alignment Quick Buttons
    dom.fixUpsideDownBtn = document.getElementById('fix-upside-down-btn');
    dom.dropToFloorBtn = document.getElementById('drop-to-floor-btn');
    dom.resetPositionBtn = document.getElementById('reset-position-btn');
    dom.gizmoResetPosBtn = document.getElementById('gizmo-reset-pos-btn');
    dom.hudResetPosBtn = document.getElementById('hud-reset-pos-btn');
    dom.centerOriginBtn = document.getElementById('center-origin-btn');
    dom.levelTiltBtn = document.getElementById('level-tilt-btn');
    dom.pickGroundBtn = document.getElementById('pick-ground-btn');

    // 3D Gizmo Controls
    dom.gizmoToggle = document.getElementById('gizmo-toggle');
    dom.gizmoModeBtns = document.querySelectorAll('.gizmo-btn');

    // Ground Height & Nudges
    dom.posYSlider = document.getElementById('pos-y-slider');
    dom.posYVal = document.getElementById('pos-y-val');
    dom.nudgeYBtns = document.querySelectorAll('[data-nudge-y]');

    // Tilt Steppers & Sliders
    dom.rotXSlider = document.getElementById('rot-x-slider');
    dom.rotXVal = document.getElementById('rot-x-val');
    dom.rotYSlider = document.getElementById('rot-y-slider');
    dom.rotYVal = document.getElementById('rot-y-val');
    dom.rotZSlider = document.getElementById('rot-z-slider');
    dom.rotZVal = document.getElementById('rot-z-val');

    // Flip Buttons
    dom.flipXBtn = document.getElementById('flip-x-btn');
    dom.flipYBtn = document.getElementById('flip-y-btn');
    dom.flipZBtn = document.getElementById('flip-z-btn');

    // Scale & Presets
    dom.scaleSlider = document.getElementById('scale-slider');
    dom.scaleVal = document.getElementById('scale-val');
    dom.coordPresetSelect = document.getElementById('coord-preset-select');
    dom.resetTransformBtn = document.getElementById('reset-transform-btn');

    // Scene & Render
    dom.alphaSlider = document.getElementById('alpha-slider');
    dom.alphaVal = document.getElementById('alpha-val');
    dom.demoSelect = document.getElementById('demo-select');
    dom.fileInput = document.getElementById('file-input');
    dom.chooseFileBtn = document.getElementById('choose-file-btn');
    dom.gridToggle = document.getElementById('grid-toggle');
    dom.axesToggle = document.getElementById('axes-toggle');
    dom.colorSwatches = document.querySelectorAll('.color-swatch');
}

function initViewer() {
    viewer = new GaussianSplats3D.Viewer({
        rootElement: dom.canvasContainer,
        cameraUp: [0, 1, 0],
        initialCameraPosition: [0, 2.2, 5.5],
        initialCameraLookAt: [0, 0, 0],
        dynamicScene: true,
        gpuAcceleratedSort: false,
        sharedMemoryForWorkers: false,
        useBuiltInControls: true,
        selfDrivenMode: true,
        sceneRevealMode: GaussianSplats3D.SceneRevealMode.Instant,
        logLevel: GaussianSplats3D.LogLevel.None
    });

    viewer.init();
    viewer.start();
    window.viewer = viewer;

    // Configure Orbit controls
    if (viewer.controls) {
        viewer.controls.enableDamping = true;
        viewer.controls.dampingFactor = 0.08;
        viewer.controls.rotateSpeed = 0.7;
        viewer.controls.panSpeed = 0.8;
        viewer.controls.zoomSpeed = 1.2;
    }

    // Canvas click event for pointer lock in walk mode or ground picking
    dom.canvasContainer.addEventListener('click', (e) => {
        if (state.isPickingGround) {
            handleGroundPick(e);
            return;
        }

        if (state.mode === 'walk' && !state.isPointerLocked) {
            dom.canvasContainer.requestPointerLock();
        }
    });

    document.addEventListener('pointerlockchange', () => {
        state.isPointerLocked = (document.pointerLockElement === dom.canvasContainer);
        if (state.isPointerLocked) {
            syncWalkAnglesFromCamera();
            dom.walkHintBadge.classList.remove('active');
        } else if (state.mode === 'walk') {
            dom.walkHintBadge.classList.add('active');
        }
    });

    // Pointer move for mouse look
    window.addEventListener('mousemove', onMouseMove);
}

function setupSceneHelpers() {
    if (!viewer.threeScene) return;

    // Grid Floor directly at Ground Plane Y = 0
    gridHelper = new THREE.GridHelper(30, 30, 0x38bdf8, 0x334155);
    gridHelper.position.y = 0;
    gridHelper.material.opacity = 0.4;
    gridHelper.material.transparent = true;
    viewer.threeScene.add(gridHelper);

    // Ground Shadow Disc at Y = -0.005
    const groundGeo = new THREE.CircleGeometry(16, 64);
    groundGeo.rotateX(-Math.PI / 2);
    const groundMat = new THREE.MeshBasicMaterial({
        color: 0x000000,
        opacity: 0.28,
        transparent: true,
        depthWrite: false
    });
    groundDisc = new THREE.Mesh(groundGeo, groundMat);
    groundDisc.position.y = -0.005;
    viewer.threeScene.add(groundDisc);

    // Axes Helper (RGB = XYZ)
    axesHelper = new THREE.AxesHelper(2.5);
    axesHelper.position.set(-3.5, 0, -3.5);
    viewer.threeScene.add(axesHelper);
}

function setupTransformControls() {
    if (!viewer.threeScene || !viewer.renderer) return;

    transformProxy = new THREE.Object3D();
    viewer.threeScene.add(transformProxy);

    transformControls = new TransformControls(viewer.camera, viewer.renderer.domElement);
    const isTouchOrMobile = window.innerWidth <= 768 || ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    transformControls.size = isTouchOrMobile ? 1.35 : 0.85;
    transformControls.space = 'local';
    transformControls.attach(transformProxy);

    const helper = transformControls.getHelper ? transformControls.getHelper() : transformControls;
    viewer.threeScene.add(helper);
    helper.visible = false; // Hidden initially until enabled

    // Enlarge pickers on mobile for easy touch
    if (helper && helper._gizmo && helper._gizmo.picker) {
        try {
            Object.values(helper._gizmo.picker).forEach(pickerGroup => {
                if (pickerGroup && pickerGroup.traverse) {
                    pickerGroup.traverse(child => {
                        if (child.isMesh) {
                            child.scale.multiplyScalar(1.5);
                        }
                    });
                }
            });
        } catch (_) {}
    }

    // Touch / Pointer Down Capture on canvas:
    // Prevent camera OrbitControls from stealing the touch if touching a gizmo handle
    viewer.renderer.domElement.addEventListener('pointerdown', (e) => {
        if (!state.showGizmo || !transformControls || !helper.visible) return;

        const rect = viewer.renderer.domElement.getBoundingClientRect();
        const pointer = new THREE.Vector2(
            ((e.clientX - rect.left) / rect.width) * 2 - 1,
            -((e.clientY - rect.top) / rect.height) * 2 + 1
        );
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(pointer, viewer.camera);

        const currentPicker = helper._gizmo && helper._gizmo.picker && helper._gizmo.picker[state.gizmoMode];
        if (currentPicker) {
            const hits = raycaster.intersectObjects(currentPicker.children, true);
            if (hits.length > 0) {
                if (viewer.controls) viewer.controls.enabled = false;
                if ('vibrate' in navigator) {
                    try { navigator.vibrate(10); } catch (_) {}
                }
            }
        }
    }, { capture: true });

    viewer.renderer.domElement.addEventListener('pointerup', () => {
        setTimeout(() => {
            if (!transformControls.dragging && state.navMode === 'orbit' && viewer.controls) {
                viewer.controls.enabled = true;
            }
        }, 50);
    });

    transformControls.addEventListener('dragging-changed', (event) => {
        if (viewer.controls) {
            viewer.controls.enabled = !event.value;
        }
    });

    transformControls.addEventListener('change', () => {
        if (!transformControls.dragging) return;

        // Sync proxy transform to state
        state.posX = Math.round(transformProxy.position.x * 100) / 100;
        state.posY = Math.round(transformProxy.position.y * 100) / 100;
        state.posZ = Math.round(transformProxy.position.z * 100) / 100;

        const euler = new THREE.Euler().setFromQuaternion(transformProxy.quaternion, 'XYZ');
        state.rotX = (Math.round(THREE.MathUtils.radToDeg(euler.x)) + 360) % 360;
        state.rotY = (Math.round(THREE.MathUtils.radToDeg(euler.y)) + 360) % 360;
        state.rotZ = (Math.round(THREE.MathUtils.radToDeg(euler.z)) + 360) % 360;

        syncTransformUI();
        applySceneTransform();
    });
}

function setupUIEventListeners() {
    // Tabs Navigation
    dom.tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.dataset.tab;
            dom.tabBtns.forEach(b => b.classList.remove('active'));
            dom.tabContents.forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            const targetContent = document.getElementById(`tab-${targetTab}`);
            if (targetContent) targetContent.classList.add('active');
        });
    });

    // Panel Collapse / Expand (Mobile Drawer & Desktop Sidebar)
    dom.panelCollapseBtn.addEventListener('click', () => {
        if (window.innerWidth <= 768) {
            setMobileDrawerState('collapsed');
        } else {
            dom.controlsPanel.classList.add('collapsed');
            dom.togglePanelBtn.classList.add('visible');
        }
    });

    dom.togglePanelBtn.addEventListener('click', () => {
        if (window.innerWidth <= 768) {
            setMobileDrawerState('half');
        } else {
            dom.controlsPanel.classList.remove('collapsed');
            dom.togglePanelBtn.classList.remove('visible');
        }
    });

    if (dom.drawerModeBtn) {
        dom.drawerModeBtn.addEventListener('click', toggleDrawerMode);
    }

    // Navigation Mode Switch
    dom.orbitModeBtn.addEventListener('click', () => setNavigationMode('orbit'));
    dom.walkModeBtn.addEventListener('click', () => setNavigationMode('walk'));

    // Speed, Sensitivity, FOV
    dom.speedSlider.addEventListener('input', (e) => {
        state.navSpeed = parseFloat(e.target.value);
        dom.speedVal.textContent = `${state.navSpeed.toFixed(1)} m/s`;
    });

    dom.sensitivitySlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        state.mouseSensitivity = val * 0.001;
        dom.sensitivityVal.textContent = `${val.toFixed(1)}x`;
    });

    dom.fovSlider.addEventListener('input', (e) => {
        state.fov = parseInt(e.target.value, 10);
        dom.fovVal.textContent = `${state.fov}°`;
        if (viewer.camera && viewer.camera.isPerspectiveCamera) {
            viewer.camera.fov = state.fov;
            viewer.camera.updateProjectionMatrix();
        }
    });

    // Preset Views
    dom.presetViewBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            setPresetView(btn.dataset.viewPreset);
        });
    });

    dom.resetCameraBtn.addEventListener('click', resetCameraView);

    // ==========================================
    // Ground & Axis Alignment Quick Actions
    // ==========================================
    dom.fixUpsideDownBtn.addEventListener('click', fixUpsideDown);
    dom.dropToFloorBtn.addEventListener('click', dropToFloor);
    dom.centerOriginBtn.addEventListener('click', centerOnOrigin);
    dom.levelTiltBtn.addEventListener('click', levelTilt);
    dom.pickGroundBtn.addEventListener('click', () => togglePickGround());
    dom.cancelPickBtn.addEventListener('click', () => togglePickGround(false));

    // 3D Gizmo Controls
    dom.gizmoToggle.addEventListener('change', (e) => {
        state.showGizmo = e.target.checked;
        if (transformControls) {
            const helper = transformControls.getHelper ? transformControls.getHelper() : transformControls;
            helper.visible = state.showGizmo;
            viewer.forceRenderNextFrame();
        }
        if (dom.mobileGizmoBar) {
            dom.mobileGizmoBar.classList.toggle('active', state.showGizmo && window.innerWidth <= 768);
        }
        showToast(`3D Gizmo ${state.showGizmo ? 'Enabled' : 'Disabled'}`, 'info');
    });

    dom.gizmoModeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            dom.gizmoModeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.gizmoMode = btn.dataset.mode;
            if (transformControls) {
                transformControls.setMode(state.gizmoMode);
                dom.gizmoToggle.checked = true;
                const helper = transformControls.getHelper ? transformControls.getHelper() : transformControls;
                helper.visible = true;
                state.showGizmo = true;
                viewer.forceRenderNextFrame();
            }
            if (dom.mobileGizmoBtns) {
                dom.mobileGizmoBtns.forEach(b => b.classList.toggle('active', b.dataset.gizmoMode === state.gizmoMode));
            }
            if (dom.mobileGizmoBar) {
                dom.mobileGizmoBar.classList.toggle('active', state.showGizmo && window.innerWidth <= 768);
            }
        });
    });

    // Mobile Gizmo Bar Handlers
    if (dom.mobileGizmoBtns) {
        dom.mobileGizmoBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                dom.mobileGizmoBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const mode = btn.dataset.gizmoMode;
                state.gizmoMode = mode;
                if (transformControls) {
                    transformControls.setMode(mode);
                    viewer.forceRenderNextFrame();
                }
                dom.gizmoModeBtns.forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
                showToast(`Gizmo: ${mode.toUpperCase()}`, 'info');
            });
        });
    }

    if (dom.mobileAxisBtns) {
        dom.mobileAxisBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                dom.mobileAxisBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                selectedMobileAxis = btn.dataset.gizmoAxis;
                showToast(`Axis: ${selectedMobileAxis.toUpperCase()}`, 'info');
            });
        });
    }

    function applyMobileNudge(dir) {
        if (state.gizmoMode === 'translate') {
            const step = 0.08 * dir;
            if (selectedMobileAxis === 'all' || selectedMobileAxis === 'y') state.posY = Math.round((state.posY + step) * 100) / 100;
            if (selectedMobileAxis === 'x') state.posX = Math.round((state.posX + step) * 100) / 100;
            if (selectedMobileAxis === 'z') state.posZ = Math.round((state.posZ + step) * 100) / 100;
        } else if (state.gizmoMode === 'rotate') {
            const step = 5 * dir;
            if (selectedMobileAxis === 'all' || selectedMobileAxis === 'y') state.rotY = (state.rotY + step + 360) % 360;
            if (selectedMobileAxis === 'x') state.rotX = (state.rotX + step + 360) % 360;
            if (selectedMobileAxis === 'z') state.rotZ = (state.rotZ + step + 360) % 360;
        } else if (state.gizmoMode === 'scale') {
            const step = 0.1 * dir;
            state.scale = Math.max(0.1, Math.min(4.0, Math.round((state.scale + step) * 10) / 10));
        }
        syncTransformUI();
        applySceneTransform();
        if ('vibrate' in navigator) {
            try { navigator.vibrate(8); } catch (_) {}
        }
    }

    if (dom.mobileNudgeDecBtn) dom.mobileNudgeDecBtn.addEventListener('click', () => applyMobileNudge(-1));
    if (dom.mobileNudgeIncBtn) dom.mobileNudgeIncBtn.addEventListener('click', () => applyMobileNudge(1));
    if (dom.mobileGizmoResetBtn) dom.mobileGizmoResetBtn.addEventListener('click', resetPosition);
    if (dom.mobileGizmoCloseBtn) dom.mobileGizmoCloseBtn.addEventListener('click', () => {
        dom.gizmoToggle.checked = false;
        dom.gizmoToggle.dispatchEvent(new Event('change'));
    });

    // Reset Position Buttons (Toolbar, Quick Alignment, HUD)
    if (dom.resetPositionBtn) dom.resetPositionBtn.addEventListener('click', resetPosition);
    if (dom.gizmoResetPosBtn) dom.gizmoResetPosBtn.addEventListener('click', resetPosition);
    if (dom.hudResetPosBtn) dom.hudResetPosBtn.addEventListener('click', resetPosition);

    // Ground Elevation Slider
    dom.posYSlider.addEventListener('input', (e) => {
        state.posY = parseFloat(e.target.value);
        dom.posYVal.textContent = `${state.posY >= 0 ? '+' : ''}${state.posY.toFixed(2)} m`;
        applySceneTransform();
    });

    // Micro Height Nudges
    dom.nudgeYBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const deltaY = parseFloat(btn.dataset.nudgeY);
            state.posY = Math.round((state.posY + deltaY) * 100) / 100;
            syncTransformUI();
            applySceneTransform();
        });
    });

    // Tilt Steppers
    document.querySelectorAll('[data-rotate-step]').forEach(btn => {
        btn.addEventListener('click', () => {
            const axis = btn.dataset.axis;
            const step = parseInt(btn.dataset.rotateStep, 10);
            stepRotate(axis, step);
        });
    });

    // Continuous Rotation Sliders
    dom.rotXSlider.addEventListener('input', (e) => {
        state.rotX = parseInt(e.target.value, 10);
        dom.rotXVal.textContent = `${state.rotX}°`;
        applySceneTransform();
    });

    dom.rotYSlider.addEventListener('input', (e) => {
        state.rotY = parseInt(e.target.value, 10);
        dom.rotYVal.textContent = `${state.rotY}°`;
        applySceneTransform();
    });

    dom.rotZSlider.addEventListener('input', (e) => {
        state.rotZ = parseInt(e.target.value, 10);
        dom.rotZVal.textContent = `${state.rotZ}°`;
        applySceneTransform();
    });

    // Flip Buttons
    dom.flipXBtn.addEventListener('click', () => toggleFlip('x'));
    dom.flipYBtn.addEventListener('click', () => toggleFlip('y'));
    dom.flipZBtn.addEventListener('click', () => toggleFlip('z'));

    // Scale Slider
    dom.scaleSlider.addEventListener('input', (e) => {
        state.scale = parseFloat(e.target.value);
        dom.scaleVal.textContent = `${state.scale.toFixed(1)}x`;
        applySceneTransform();
    });

    // Coordinate System Presets
    dom.coordPresetSelect.addEventListener('change', (e) => {
        applyCoordinatePreset(e.target.value);
    });

    dom.resetTransformBtn.addEventListener('click', resetTransforms);

    // Alpha Removal Threshold
    dom.alphaSlider.addEventListener('input', (e) => {
        state.alphaThreshold = parseInt(e.target.value, 10);
        dom.alphaVal.textContent = state.alphaThreshold;
        const scene = viewer.getSplatScene(0);
        if (scene) {
            scene.minimumAlpha = state.alphaThreshold;
            viewer.forceRenderNextFrame();
        }
    });

    // Demo Scene Selector
    dom.demoSelect.addEventListener('change', (e) => {
        state.activePreset = e.target.value;
        loadPresetScene(state.activePreset);
    });

    // File Input fallback
    dom.chooseFileBtn.addEventListener('click', () => dom.fileInput.click());
    dom.fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
            loadSplatFile(e.target.files[0]);
        }
    });

    // Scene Helpers Toggles
    dom.gridToggle.addEventListener('change', (e) => {
        state.showGrid = e.target.checked;
        if (gridHelper) gridHelper.visible = state.showGrid;
        if (groundDisc) groundDisc.visible = state.showGrid;
        viewer.forceRenderNextFrame();
    });

    dom.axesToggle.addEventListener('change', (e) => {
        state.showAxes = e.target.checked;
        if (axesHelper) axesHelper.visible = state.showAxes;
        viewer.forceRenderNextFrame();
    });

    // Background Color Swatches
    dom.colorSwatches.forEach(swatch => {
        swatch.addEventListener('click', () => {
            dom.colorSwatches.forEach(s => s.classList.remove('active'));
            swatch.classList.add('active');
            const colorHex = swatch.dataset.color;
            state.bgColor = colorHex;
            viewer.renderer.setClearColor(new THREE.Color(colorHex), 1.0);
            dom.canvasContainer.style.backgroundColor = colorHex;
            viewer.forceRenderNextFrame();
        });
    });

    // HUD Actions
    dom.hudSnapshotBtn.addEventListener('click', captureScreenshot);

    dom.hudFullscreenBtn.addEventListener('click', () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {});
        } else {
            document.exitFullscreen().catch(() => {});
        }
    });

    dom.hudHelpBtn.addEventListener('click', () => {
        dom.keybindsModal.classList.add('open');
    });

    document.querySelectorAll('.modal-close, .modal-backdrop').forEach(el => {
        el.addEventListener('click', (e) => {
            if (e.target === el) dom.keybindsModal.classList.remove('open');
        });
    });
}

function setupKeyboardListeners() {
    window.addEventListener('keydown', (e) => {
        if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;

        if (keys.hasOwnProperty(e.code)) {
            keys[e.code] = true;
        }

        switch (e.code) {
            case 'KeyO':
                setNavigationMode(state.mode === 'orbit' ? 'walk' : 'orbit');
                break;
            case 'KeyR':
                resetCameraView();
                break;
            case 'KeyX':
                resetPosition();
                break;
            case 'KeyG':
                // Toggle 3D gizmo
                dom.gizmoToggle.checked = !dom.gizmoToggle.checked;
                dom.gizmoToggle.dispatchEvent(new Event('change'));
                break;
            case 'KeyH':
                if (window.innerWidth <= 768) {
                    setMobileDrawerState(mobileDrawerState === 'collapsed' ? 'half' : 'collapsed');
                } else {
                    dom.controlsPanel.classList.toggle('collapsed');
                    dom.togglePanelBtn.classList.toggle('visible', dom.controlsPanel.classList.contains('collapsed'));
                }
                break;
            case 'Escape':
                if (state.isPickingGround) {
                    togglePickGround(false);
                }
                if (dom.keybindsModal.classList.contains('open')) {
                    dom.keybindsModal.classList.remove('open');
                }
                break;
        }
    });

    window.addEventListener('keyup', (e) => {
        if (keys.hasOwnProperty(e.code)) {
            keys[e.code] = false;
        }
    });
}

/* =========================================================
   Navigation & Controls
   ========================================================= */

function setNavigationMode(newMode) {
    state.mode = newMode;

    if (newMode === 'orbit') {
        dom.orbitModeBtn.classList.add('active');
        dom.walkModeBtn.classList.remove('active');
        dom.walkCrosshair.classList.remove('active');
        dom.walkHintBadge.classList.remove('active');
        dom.hudModeText.textContent = 'Orbit';

        if (viewer.controls) {
            viewer.controls.enabled = true;
        }
        if (document.pointerLockElement) {
            document.exitPointerLock();
        }
        showToast('Switched to Orbit Mode (Inspect / CAD)', 'info');
    } else {
        dom.walkModeBtn.classList.add('active');
        dom.orbitModeBtn.classList.remove('active');
        dom.walkCrosshair.classList.add('active');
        dom.walkHintBadge.classList.add('active');
        dom.hudModeText.textContent = 'Walk';

        if (viewer.controls) {
            viewer.controls.enabled = false;
        }
        syncWalkAnglesFromCamera();
        showToast('Walk Mode: Click canvas for mouse look, W/A/S/D to move', 'info');
    }
}

function syncWalkAnglesFromCamera() {
    if (!viewer.camera) return;
    const dir = new THREE.Vector3();
    viewer.camera.getWorldDirection(dir);
    pitch = Math.asin(Math.max(-1, Math.min(1, dir.y)));
    yaw = Math.atan2(-dir.x, -dir.z);
}

function onMouseMove(e) {
    if (state.mode !== 'walk') return;

    if (state.isPointerLocked || (e.buttons === 1 && !state.isPointerLocked)) {
        const deltaX = e.movementX || 0;
        const deltaY = e.movementY || 0;

        yaw -= deltaX * state.mouseSensitivity;
        pitch -= deltaY * state.mouseSensitivity;

        const maxPitch = Math.PI * 0.48; // ~86 degrees
        pitch = Math.max(-maxPitch, Math.min(maxPitch, pitch));

        // Update camera orientation
        const euler = new THREE.Euler(pitch, yaw, 0, 'YXZ');
        viewer.camera.quaternion.setFromEuler(euler);

        // Keep orbit control target updated in front
        const dir = new THREE.Vector3();
        viewer.camera.getWorldDirection(dir);
        if (viewer.controls) {
            viewer.controls.target.copy(viewer.camera.position).addScaledVector(dir, 4.0);
        }

        viewer.forceRenderNextFrame();
    }
}

function updateWalkMovement(deltaTime) {
    if (state.mode !== 'walk' || !viewer.camera) return;

    const moveVector = new THREE.Vector3();
    const camDir = new THREE.Vector3();
    viewer.camera.getWorldDirection(camDir);

    // Horizontal forward (ignore pitch for ground walk)
    const forward = new THREE.Vector3(camDir.x, 0, camDir.z).normalize();
    const right = new THREE.Vector3(-camDir.z, 0, camDir.x).normalize();
    const up = new THREE.Vector3(0, 1, 0);

    if (keys.KeyW) moveVector.add(forward);
    if (keys.KeyS) moveVector.sub(forward);
    if (keys.KeyD) moveVector.add(right);
    if (keys.KeyA) moveVector.sub(right);
    if (keys.Space || keys.KeyQ) moveVector.add(up);
    if (keys.KeyC || keys.KeyE) moveVector.sub(up);

    if (moveVector.lengthSq() > 0) {
        moveVector.normalize();
        const sprintMultiplier = (keys.ShiftLeft || keys.ShiftRight) ? 2.5 : 1.0;
        const step = state.navSpeed * sprintMultiplier * deltaTime;

        viewer.camera.position.addScaledVector(moveVector, step);

        if (viewer.controls) {
            viewer.controls.target.addScaledVector(moveVector, step);
        }
        viewer.forceRenderNextFrame();
    }
}

function setPresetView(preset) {
    if (!viewer.camera || !viewer.controls) return;

    const target = viewer.controls.target || new THREE.Vector3(0, 0, 0);
    const dist = 5.5;

    switch (preset) {
        case 'front':
            viewer.camera.position.set(target.x, target.y, target.z + dist);
            break;
        case 'back':
            viewer.camera.position.set(target.x, target.y, target.z - dist);
            break;
        case 'left':
            viewer.camera.position.set(target.x - dist, target.y, target.z);
            break;
        case 'right':
            viewer.camera.position.set(target.x + dist, target.y, target.z);
            break;
        case 'top':
            viewer.camera.position.set(target.x, target.y + dist, target.z + 0.001);
            break;
        case 'iso':
        default:
            viewer.camera.position.set(
                target.x + dist * 0.7,
                target.y + dist * 0.55,
                target.z + dist * 0.7
            );
            break;
    }

    viewer.camera.lookAt(target);
    viewer.controls.update();
    syncWalkAnglesFromCamera();
    viewer.forceRenderNextFrame();
}

function resetCameraView() {
    if (!viewer.camera || !viewer.controls) return;
    viewer.controls.target.set(0, 0, 0);
    viewer.camera.position.set(0, 2.2, 5.5);
    viewer.camera.lookAt(0, 0, 0);
    viewer.controls.update();
    syncWalkAnglesFromCamera();
    viewer.forceRenderNextFrame();
    showToast('Camera reset to center', 'info');
}

/* =========================================================
   Ground & Axis Alignment Suite
   ========================================================= */

function fixUpsideDown() {
    state.flipY *= -1;
    syncTransformUI();
    applySceneTransform();
    showToast(`Inverted Y axis (Flip Y: ${state.flipY < 0 ? 'ON' : 'OFF'})`, 'info');
}

function dropToFloor() {
    if (!viewer.splatMesh || viewer.getSceneCount() === 0) {
        showToast('No splat model loaded to ground', 'error');
        return;
    }

    try {
        const box = viewer.splatMesh.computeBoundingBox(true, 0);
        if (box && isFinite(box.min.y)) {
            // box.min.y is the lowest splat point in world space.
            // Ground grid is at Y = 0.
            const shiftY = -box.min.y;
            state.posY = Math.round((state.posY + shiftY) * 100) / 100;
            syncTransformUI();
            applySceneTransform();
            showToast(`Snapped to ground plane (shifted ${shiftY >= 0 ? '+' : ''}${shiftY.toFixed(2)}m)`, 'success');
        } else {
            showToast('Could not compute splat bounding box', 'error');
        }
    } catch (err) {
        console.error('Error in dropToFloor:', err);
        showToast('Drop to floor failed: ' + err.message, 'error');
    }
}

function centerOnOrigin() {
    if (!viewer.splatMesh || viewer.getSceneCount() === 0) {
        showToast('No splat model loaded', 'error');
        return;
    }

    try {
        const box = viewer.splatMesh.computeBoundingBox(true, 0);
        if (box && isFinite(box.min.x)) {
            const center = new THREE.Vector3();
            box.getCenter(center);
            state.posX = Math.round((state.posX - center.x) * 100) / 100;
            state.posZ = Math.round((state.posZ - center.z) * 100) / 100;
            syncTransformUI();
            applySceneTransform();
            showToast('Centered model horizontally on origin', 'success');
        }
    } catch (err) {
        console.error('Error in centerOnOrigin:', err);
    }
}

function resetPosition() {
    if (!viewer.splatMesh || viewer.getSceneCount() === 0) {
        showToast('No splat model loaded', 'error');
        return;
    }

    state.posX = 0;
    state.posZ = 0;
    state.posY = 0;
    applySceneTransform();

    // Automatically align bottom flush with the ground floor plane Y = 0
    try {
        const box = viewer.splatMesh.computeBoundingBox(true, 0);
        if (box && isFinite(box.min.y)) {
            const shiftY = -box.min.y;
            state.posY = Math.round(shiftY * 100) / 100;
        }
    } catch (err) {
        console.warn('Could not compute floor snap on resetPosition:', err);
    }

    syncTransformUI();
    applySceneTransform();
    showToast('Splat position reset to origin & ground floor', 'success');
}

function levelTilt() {
    state.rotX = 0;
    state.rotZ = 0;
    syncTransformUI();
    applySceneTransform();
    showToast('Leveled Pitch & Roll (Zero tilt against ground plane)', 'info');
}

function togglePickGround(forceState) {
    state.isPickingGround = (forceState !== undefined) ? forceState : !state.isPickingGround;
    dom.pickGroundBtn.classList.toggle('active', state.isPickingGround);
    dom.pickGroundBanner.classList.toggle('active', state.isPickingGround);
    dom.canvasContainer.classList.toggle('picking-ground', state.isPickingGround);

    if (state.isPickingGround) {
        showToast('Click any point on the splat surface to set as floor level', 'info');
    }
}

function handleGroundPick(e) {
    if (!viewer.splatMesh || !viewer.raycaster) return;

    const rect = dom.canvasContainer.getBoundingClientRect();
    const screenPos = new THREE.Vector2(e.clientX - rect.left, e.clientY - rect.top);
    const screenDim = new THREE.Vector2(rect.width, rect.height);

    viewer.raycaster.setFromCameraAndScreenPosition(viewer.camera, screenPos, screenDim);
    const hits = [];
    viewer.raycaster.intersectSplatMesh(viewer.splatMesh, hits);

    if (hits.length > 0) {
        const hitPoint = hits[0].origin;
        // Shift Y so this clicked point aligns with Y = 0
        const shiftY = -hitPoint.y;
        state.posY = Math.round((state.posY + shiftY) * 100) / 100;
        syncTransformUI();
        applySceneTransform();
        showToast(`Ground set to clicked point (${shiftY >= 0 ? '+' : ''}${shiftY.toFixed(2)}m)`, 'success');
        togglePickGround(false);
    } else {
        showToast('No splat hit! Please click directly on a visible splat surface point.', 'info');
    }
}

function toggleFlip(axis) {
    if (axis === 'x') {
        state.flipX *= -1;
        dom.flipXBtn.classList.toggle('active', state.flipX < 0);
    } else if (axis === 'y') {
        state.flipY *= -1;
        dom.flipYBtn.classList.toggle('active', state.flipY < 0);
    } else if (axis === 'z') {
        state.flipZ *= -1;
        dom.flipZBtn.classList.toggle('active', state.flipZ < 0);
    }
    applySceneTransform();
    showToast(`Flipped ${axis.toUpperCase()} axis`, 'info');
}

function stepRotate(axis, step) {
    if (axis === 'x') {
        state.rotX = (state.rotX + step + 360) % 360;
    } else if (axis === 'y') {
        state.rotY = (state.rotY + step + 360) % 360;
    } else if (axis === 'z') {
        state.rotZ = (state.rotZ + step + 360) % 360;
    }
    syncTransformUI();
    applySceneTransform();
}

function applyCoordinatePreset(preset) {
    switch (preset) {
        case 'colmap':
            // COLMAP has +Y down and +Z forward; invert Y and Z
            state.flipX = 1;
            state.flipY = -1;
            state.flipZ = -1;
            state.rotX = 0;
            state.rotY = 0;
            state.rotZ = 0;
            break;
        case 'blender':
            // Blender +Z is up; rotate around X by -90°
            state.flipX = 1;
            state.flipY = 1;
            state.flipZ = 1;
            state.rotX = 270;
            state.rotY = 0;
            state.rotZ = 0;
            break;
        case 'nerf':
            // NeRF convention
            state.flipX = 1;
            state.flipY = 1;
            state.flipZ = 1;
            state.rotX = 180;
            state.rotY = 0;
            state.rotZ = 0;
            break;
        case 'standard':
        default:
            state.flipX = 1;
            state.flipY = 1;
            state.flipZ = 1;
            state.rotX = 0;
            state.rotY = 0;
            state.rotZ = 0;
            break;
    }

    syncTransformUI();
    applySceneTransform();
    showToast(`Applied preset: ${preset.toUpperCase()}`, 'info');
}

function resetTransforms() {
    state.flipX = 1;
    state.flipY = 1;
    state.flipZ = 1;
    state.rotX = 0;
    state.rotY = 0;
    state.rotZ = 0;
    state.posX = 0;
    state.posY = 0;
    state.posZ = 0;
    state.scale = 1.0;
    dom.coordPresetSelect.value = 'standard';
    syncTransformUI();
    applySceneTransform();
    showToast('Transforms & position reset to default', 'info');
}

function syncTransformUI() {
    dom.flipXBtn.classList.toggle('active', state.flipX < 0);
    dom.flipYBtn.classList.toggle('active', state.flipY < 0);
    dom.flipZBtn.classList.toggle('active', state.flipZ < 0);
    if (dom.fixUpsideDownBtn) dom.fixUpsideDownBtn.classList.toggle('active', state.flipY < 0);

    dom.posYSlider.value = state.posY;
    dom.posYVal.textContent = `${state.posY >= 0 ? '+' : ''}${state.posY.toFixed(2)} m`;

    dom.rotXSlider.value = state.rotX;
    dom.rotXVal.textContent = `${state.rotX}°`;
    dom.rotYSlider.value = state.rotY;
    dom.rotYVal.textContent = `${state.rotY}°`;
    dom.rotZSlider.value = state.rotZ;
    dom.rotZVal.textContent = `${state.rotZ}°`;

    dom.scaleSlider.value = state.scale;
    dom.scaleVal.textContent = `${state.scale.toFixed(1)}x`;
}

function applySceneTransform() {
    const scene = viewer.getSplatScene(0);
    if (!scene) return;

    // Apply rotation as Euler
    const euler = new THREE.Euler(
        THREE.MathUtils.degToRad(state.rotX),
        THREE.MathUtils.degToRad(state.rotY),
        THREE.MathUtils.degToRad(state.rotZ),
        'XYZ'
    );
    scene.quaternion.setFromEuler(euler);

    // Apply scale & flips
    scene.scale.set(
        state.flipX * state.scale,
        state.flipY * state.scale,
        state.flipZ * state.scale
    );

    scene.position.set(state.posX, state.posY, state.posZ);
    scene.updateTransform(true);

    // Keep transform proxy synchronized with splatScene
    if (transformProxy) {
        transformProxy.position.copy(scene.position);
        transformProxy.quaternion.copy(scene.quaternion);
        transformProxy.scale.copy(scene.scale);
        transformProxy.updateMatrixWorld();
    }

    viewer.forceRenderNextFrame();
}

/* =========================================================
   Drag & Drop & Splat File Loader
   ========================================================= */

function setupDragAndDrop() {
    window.addEventListener('dragenter', (e) => {
        e.preventDefault();
        dragCounter++;
        dom.dropOverlay.classList.add('active');
    });

    window.addEventListener('dragover', (e) => {
        e.preventDefault();
    });

    window.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dragCounter--;
        if (dragCounter <= 0) {
            dragCounter = 0;
            dom.dropOverlay.classList.remove('active');
        }
    });

    window.addEventListener('drop', (e) => {
        e.preventDefault();
        dragCounter = 0;
        dom.dropOverlay.classList.remove('active');

        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const file = e.dataTransfer.files[0];
            loadSplatFile(file);
        }
    });
}

async function loadSplatFile(file) {
    const name = file.name.toLowerCase();
    const isPly = name.endsWith('.ply');
    const isSplat = name.endsWith('.splat');
    const isKsplat = name.endsWith('.ksplat');
    const isSpz = name.endsWith('.spz');

    if (!isPly && !isSplat && !isKsplat && !isSpz) {
        showToast('Unsupported format! Please drop .ply, .splat, .ksplat, or .spz', 'error');
        return;
    }

    state.currentFileName = file.name;
    showLoading(`Loading ${file.name}...`, 'Reading binary data');

    try {
        const arrayBuffer = await file.arrayBuffer();
        showLoading(`Processing ${file.name}...`, 'Parsing 3D Gaussians');

        let splatBuffer;
        if (isSplat) {
            splatBuffer = await GaussianSplats3D.SplatLoader.loadFromFileData(arrayBuffer, 0, 0, false);
        } else if (isPly) {
            splatBuffer = await GaussianSplats3D.PlyLoader.loadFromFileData(arrayBuffer, 0, 0, false);
        } else if (isKsplat) {
            splatBuffer = await GaussianSplats3D.KSplatLoader.loadFromFileData(arrayBuffer);
        } else if (isSpz) {
            splatBuffer = await GaussianSplats3D.SpzLoader.loadFromFileData(arrayBuffer, 0, 0, false);
        }

        showLoading('Building 3D Scene...', 'Uploading to GPU');

        // Cleanly replace any existing scene with the new splat buffer
        await viewer.addSplatBuffers([splatBuffer], [{}], true, false, false, true, true);

        applySceneTransform();
        updateSplatStats();
        showToast(`Successfully loaded ${file.name}`, 'success');

        // Automatically drop model onto floor plane after loading
        setTimeout(() => {
            dropToFloor();
        }, 150);
    } catch (err) {
        console.error('Error loading splat file:', err);
        showToast(`Failed to load file: ${err.message || 'Parser error'}`, 'error');
    } finally {
        hideLoading();
    }
}

async function loadPresetScene(presetName) {
    showLoading('Generating 3D Splat Scene...', `Procedural ${presetName}`);
    try {
        const file = createSampleSplatFile(presetName);
        await loadSplatFile(file);
    } catch (err) {
        console.error('Error loading preset:', err);
        showToast('Error generating preset: ' + err.message, 'error');
    } finally {
        hideLoading();
    }
}

function updateSplatStats() {
    const splatMesh = viewer.getSplatMesh();
    let count = 0;
    if (splatMesh && typeof splatMesh.getSplatCount === 'function') {
        count = splatMesh.getSplatCount();
    }
    state.splatCount = count;
    dom.hudSplatCount.textContent = count.toLocaleString();
}

/* =========================================================
   Render Loop, FPS & Screenshot
   ========================================================= */

function renderLoop(now) {
    requestAnimationFrame(renderLoop);

    const delta = (now - lastFrameTime) / 1000;
    lastFrameTime = now;

    // Update walk controls
    if (state.mode === 'walk' && delta < 0.25) {
        updateWalkMovement(delta);
    }

    // FPS Meter
    frameCount++;
    if (now - fpsLastTime >= 1000) {
        state.fps = Math.round((frameCount * 1000) / (now - fpsLastTime));
        dom.hudFps.textContent = state.fps;
        frameCount = 0;
        fpsLastTime = now;
    }
}

function captureScreenshot() {
    if (!viewer.renderer) return;

    // Flash visual feedback
    const flash = document.createElement('div');
    flash.style.cssText = 'position:fixed;inset:0;background:white;z-index:99999;opacity:0.8;transition:opacity 0.3s;pointer-events:none;';
    document.body.appendChild(flash);
    setTimeout(() => { flash.style.opacity = '0'; setTimeout(() => flash.remove(), 300); }, 50);

    // Render immediately so the WebGL front buffer contains active scene pixels
    if (typeof viewer.update === 'function') {
        viewer.update();
    }
    if (typeof viewer.render === 'function') {
        viewer.render();
    }

    const canvas = viewer.renderer.domElement;
    const dataUrl = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    link.download = `splat-${timestamp}.png`;
    link.href = dataUrl;
    link.click();
    showToast('Screenshot saved!', 'success');
}

/* =========================================================
   UI Helpers & Toasts
   ========================================================= */

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    dom.toastContainer.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('show'));

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3200);
}

function showLoading(title, subtitle = '') {
    if (dom.loadingText) dom.loadingText.textContent = title;
    if (dom.loadingSubtext) dom.loadingSubtext.textContent = subtitle;
    if (dom.loadingOverlay) {
        dom.loadingOverlay.classList.add('active');
        dom.loadingOverlay.style.display = 'flex';
    }
}

function hideLoading() {
    if (dom.loadingOverlay) {
        dom.loadingOverlay.classList.remove('active');
        dom.loadingOverlay.style.display = 'none';
    }
}
