import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

(() => {
    'use strict';

    const GAME_VERSION = '1.0.0';
    const DEBUG = true;
    const TAU = Math.PI * 2;
    const WORLD_UP = new THREE.Vector3(0, 1, 0);
    const TRACK_WIDTH_FACTOR = 1.5;
    const TRACK_HALF_WIDTH = 9.2 * TRACK_WIDTH_FACTOR;
    const TRACK_SAMPLES = 1440;
    const TOP_SPEED = 60;

    const debug = {
        info: (...args) => DEBUG && console.info('[SplineRush]', ...args),
        warn: (...args) => DEBUG && console.warn('[SplineRush]', ...args),
        error: (...args) => console.error('[SplineRush]', ...args),
    };

    window.addEventListener('error', (event) => {
        debug.error('Window error:', event.message, event.error || 'No error object');
    });

    window.addEventListener('unhandledrejection', (event) => {
        debug.error('Unhandled promise rejection:', event.reason);
    });

    const dom = {
        canvas: document.getElementById('game-canvas'),
        overlay: document.getElementById('start-overlay'),
        startButton: document.getElementById('start-button'),
        newTrackButton: document.getElementById('new-track-button'),
        restartButton: document.getElementById('restart-button'),
        resetButton: document.getElementById('reset-button'),
        cameraButton: document.getElementById('camera-button'),
        seedInput: document.getElementById('seed-input'),
        toast: document.getElementById('toast'),
        speedValue: document.getElementById('speed-value'),
        lapValue: document.getElementById('lap-value'),
        scoreValue: document.getElementById('score-value'),
        statusValue: document.getElementById('status-value'),
        seedValue: document.getElementById('seed-value'),
        trackValue: document.getElementById('track-value'),
        inputHint: document.getElementById('input-hint'),
        mobileControls: document.getElementById('mobile-controls'),
        fullscreenButton: document.getElementById('fullscreen-button'),
    };

    Object.entries(dom).forEach(([key, value]) => {
        if (!value) debug.warn(`Missing DOM element: ${key}`);
    });

    const state = {
        scene: null,
        camera: null,
        renderer: null,
        clock: new THREE.Clock(),
        started: false,
        trackGroup: null,
        environmentGroup: null,
        track: null,
        cameraMode: 0,
        orbitTheta: 0,
        orbitPhi: 0.4,
        isDraggingCamera: false,
        lastDebugSecond: -1,
        fpsSmoothed: 60,
        toastTimeout: null,
    };

    const input = {
        throttle: false,
        brake: false,
        left: false,
        right: false,
    };

    const car = {
        group: null,
        bodyGroup: null,
        wheels: [],
        u: 0.012,
        offset: 0,
        speed: 0,

        // Steering / handling
        steer: 0,
        headingAngle: 0,      // angle of car relative to track tangent
        yawVelocity: 0,       // rotational momentum
        driftAmount: 0,       // visual/body drift feeling
        lateralVelocity: 0,
        suspension: 0,
        suspensionVelocity: 0,
        wheelSpin: 0,
        lap: 1,
        score: 0,
        lapStartTime: 0,
        bestLap: null,
        boostGlow: 0,
        offRoad: false,
        onBoost: false,
        lastU: 0.012,
        lastSpeed: 0,
    };

    const tmp = {
        v1: new THREE.Vector3(),
        v2: new THREE.Vector3(),
        v3: new THREE.Vector3(),
        v4: new THREE.Vector3(),
        q1: new THREE.Quaternion(),
        m1: new THREE.Matrix4(),
    };

    function init() {
        debug.info(`Booting Spline Rush v${GAME_VERSION}`);

        if (!dom.canvas) {
            debug.error('No #game-canvas element found. The game cannot start.');
            showToast('Canvas missing. Check index.html.', true);
            return;
        }

        try {
            state.scene = new THREE.Scene();
            state.scene.background = new THREE.Color(0x060711);
            state.scene.fog = new THREE.FogExp2(0x060711, 0.0032);

            state.camera = new THREE.PerspectiveCamera(66, 1, 0.1, 2200);
            state.camera.position.set(0, 52, 92);

            state.renderer = new THREE.WebGLRenderer({
                canvas: dom.canvas,
                antialias: true,
                alpha: false,
                powerPreference: 'high-performance',
            });
            state.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
            state.renderer.outputColorSpace = THREE.SRGBColorSpace;
            state.renderer.toneMapping = THREE.ACESFilmicToneMapping;
            state.renderer.toneMappingExposure = 1.1;
            state.renderer.shadowMap.enabled = true;
            state.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
            state.renderer.setClearColor(0x060711, 1);

            new RGBELoader()
                .setPath('assets/hdri/')
                .load('Free Galaxies 8k.hdr', (texture) => {
                    texture.mapping = THREE.EquirectangularReflectionMapping;
                    state.scene.background = texture;
                    state.scene.environment = texture;
                    debug.info('HDRI loaded successfully');
                }, undefined, (err) => {
                    debug.error('Failed to load HDRI:', err);
                });

            createLights();
            createEnvironment();
            createCar();
            bindEvents();
            resize();

            state.clock.start();
            state.renderer.setAnimationLoop(animate);
            showToast('Press Start to generate a new 3D spline track.');
            debug.info('Renderer ready:', state.renderer.info);
        } catch (error) {
            debug.error('Failed to initialise Three.js renderer. Check WebGL support and the Three.js CDN import.', error);
            showToast('Three.js failed to start. Open the console for details.', true);
        }
    }

    function createLights() {
        const hemi = new THREE.HemisphereLight(0x94d7ff, 0x111126, 1.2);
        state.scene.add(hemi);

        const sun = new THREE.DirectionalLight(0xffffff, 2.8);
        sun.position.set(-90, 130, 70);
        sun.castShadow = true;
        sun.shadow.mapSize.set(2048, 2048);
        sun.shadow.camera.near = 5;
        sun.shadow.camera.far = 360;
        sun.shadow.camera.left = -180;
        sun.shadow.camera.right = 180;
        sun.shadow.camera.top = 180;
        sun.shadow.camera.bottom = -180;
        state.scene.add(sun);

        const rim = new THREE.DirectionalLight(0x6078ff, 1.0);
        rim.position.set(100, 70, -120);
        state.scene.add(rim);
    }

    function createEnvironment() {
        if (state.environmentGroup) state.scene.remove(state.environmentGroup);
        state.environmentGroup = new THREE.Group();
        state.environmentGroup.name = 'Neon environment';
        state.scene.add(state.environmentGroup);

        // Procedural stars removed in favour of HDRI
        /*
        const starGeo = new THREE.BufferGeometry();
        const starPositions = [];
        const rng = mulberry32(102938);
        for (let i = 0; i < 850; i += 1) {
            const radius = randRange(rng, 200, 900);
            const angle = randRange(rng, 0, TAU);
            starPositions.push(
                Math.cos(angle) * radius,
                randRange(rng, 90, 420),
                Math.sin(angle) * radius,
            );
        }
        starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
        const starMat = new THREE.PointsMaterial({
            color: 0x93b7ff,
            size: 1.6,
            sizeAttenuation: true,
            transparent: true,
            opacity: 0.85,
        });
        state.environmentGroup.add(new THREE.Points(starGeo, starMat));
        */
    }

    function generateSplineTrack(seedText) {
        const seed = hashString(seedText);
        const rng = mulberry32(seed);

        disposeObject3D(state.trackGroup);
        state.trackGroup = new THREE.Group();
        state.trackGroup.name = `Spline track ${seedText}`;
        state.scene.add(state.trackGroup);

        const phaseC = rng() * TAU;

        const knotTypes = [
            [2, 3], [3, 4], [2, 5], [3, 5], [4, 5], [2, 7]
        ];
        const [p, q] = knotTypes[Math.floor(rng() * knotTypes.length)];

        // Increase points for smoothness on complex loops
        const controlPointCount = randomInt(rng, 45, 65);

        // Major and minor radii
        const R = randRange(rng, 100, 140);
        const r = randRange(rng, 35, R * 0.45);
        const verticalScale = randRange(rng, 0.6, 1.3);

        const controlPoints = [];

        for (let i = 0; i < controlPointCount; i += 1) {
            const t = (i / controlPointCount) * TAU;

            // Torus knot parametric equations
            const x = (R + r * Math.cos(q * t)) * Math.cos(p * t);
            const z = (R + r * Math.cos(q * t)) * Math.sin(p * t);
            const y = r * Math.sin(q * t) * verticalScale;

            controlPoints.push(new THREE.Vector3(x, y, z));
        }

        const curve = new THREE.CatmullRomCurve3(controlPoints, true, 'catmullrom', 0.5);
        curve.arcLengthDivisions = 4096;
        const length = curve.getLength();

        const samples = buildTrackSamples(curve, TRACK_SAMPLES, phaseC);
        const track = {
            seedText,
            seed,
            curve,
            length,
            controlPoints,
            samples,
            sampleCount: TRACK_SAMPLES,
            halfWidth: TRACK_HALF_WIDTH,
            boosts: [],
            coins: [],
        };

        createRoadMesh(track);
        createRails(track);
        createDashLines(track);
        createBoostPads(track, rng);
        createCoins(track, rng);
        createGates(track);
        createTrackDecor(track, rng);

        state.track = track;
        if (dom.seedValue) dom.seedValue.textContent = seedText;
        if (dom.trackValue) dom.trackValue.textContent = `${Math.round(length)} m / ${controlPointCount} spline points`;

        debug.info('Generated complex closed 3D spline track.', {
            seedText,
            seed,
            controlPointCount,
            trackLength: Math.round(length),
            meshSegments: TRACK_SAMPLES,
            boosts: track.boosts.length,
            coins: track.coins.length,
        });

        return track;
    }

    function buildTrackSamples(curve, sampleCount, phase) {
        const raw = [];

        // First pass: calculate centres, tangents, curvature and raw banking.
        for (let i = 0; i <= sampleCount; i += 1) {
            const u = i / sampleCount;
            const center = curve.getPointAt(u);
            const tangent = curve.getTangentAt(u).normalize();

            const prevTangent = curve.getTangentAt(wrap01(u - 3 / sampleCount)).normalize();
            const nextTangent = curve.getTangentAt(wrap01(u + 3 / sampleCount)).normalize();

            const flatRight = new THREE.Vector3().crossVectors(WORLD_UP, tangent);
            if (flatRight.lengthSq() < 0.00001) flatRight.set(1, 0, 0);
            flatRight.normalize();

            const flatNormal = new THREE.Vector3().crossVectors(tangent, flatRight).normalize();

            const turnAxis = new THREE.Vector3().crossVectors(prevTangent, nextTangent);
            const turnSign = Math.sign(turnAxis.dot(flatNormal)) || 1;
            const turnAmount = prevTangent.angleTo(nextTangent);

            // Larger-scale procedural banking.
            // The previous version changed too locally and felt twitchy/small.
            const broadWave =
                Math.sin(u * TAU * 1.35 + phase) * 0.15 +
                Math.sin(u * TAU * 2.1 + phase * 0.7) * 0.09;

            const curvatureBank = -turnSign * turnAmount * 11.5;

            raw.push({
                u,
                center,
                tangent,
                flatRight,
                flatNormal,
                rawBank: THREE.MathUtils.clamp(curvatureBank + broadWave, -0.72, 0.72),
                halfWidth: TRACK_HALF_WIDTH + Math.sin(u * TAU * 2.4 + phase) * 0.9 * TRACK_WIDTH_FACTOR,
            });
        }

        // Second pass: smooth banking over a wide window.
        // This makes the track rotation feel like a proper flowing racetrack,
        // rather than tiny local twists.
        const samples = [];
        const smoothingRadius = 18;

        for (let i = 0; i <= sampleCount; i += 1) {
            let bankTotal = 0;
            let weightTotal = 0;

            for (let j = -smoothingRadius; j <= smoothingRadius; j += 1) {
                const index = (i + j + sampleCount) % sampleCount;
                const distance = Math.abs(j) / smoothingRadius;
                const weight = 1 - distance;
                bankTotal += raw[index].rawBank * weight;
                weightTotal += weight;
            }

            const r = raw[i];
            const bank = bankTotal / weightTotal;

            const right = r.flatRight.clone();
            const normal = r.flatNormal.clone();

            const q = new THREE.Quaternion().setFromAxisAngle(r.tangent, bank);
            right.applyQuaternion(q).normalize();
            normal.applyQuaternion(q).normalize();

            samples.push({
                u: r.u,
                center: r.center,
                tangent: r.tangent,
                right,
                normal,
                bank,
                halfWidth: r.halfWidth,
            });
        }

        debug.info('Track banking smoothed.', {
            smoothingRadius,
            maxBankDegrees: Math.round(THREE.MathUtils.radToDeg(0.72)),
        });

        return samples;
    }

    function createRoadMesh(track) {
        const vertices = [];
        const normals = [];
        const uvs = [];
        const indices = [];
        const colors = [];
        const colorA = new THREE.Color(0x242633);
        const colorB = new THREE.Color(0x343648);

        for (let i = 0; i <= track.sampleCount; i += 1) {
            const s = track.samples[i];
            const tone = (Math.sin(s.u * TAU * 10) + 1) * 0.5;
            const color = colorA.clone().lerp(colorB, 0.12 + tone * 0.12);
            const left = s.center.clone().addScaledVector(s.right, -s.halfWidth).addScaledVector(s.normal, 0.06);
            const right = s.center.clone().addScaledVector(s.right, s.halfWidth).addScaledVector(s.normal, 0.06);

            vertices.push(left.x, left.y, left.z, right.x, right.y, right.z);
            normals.push(s.normal.x, s.normal.y, s.normal.z, s.normal.x, s.normal.y, s.normal.z);
            uvs.push(0, s.u * track.length / 18, 1, s.u * track.length / 18);
            colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
        }

        for (let i = 0; i < track.sampleCount; i += 1) {
            const a = i * 2;
            const b = a + 1;
            const c = (i + 1) * 2;
            const d = c + 1;
            indices.push(a, c, b, b, c, d);
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geo.setIndex(indices);
        geo.computeBoundingSphere();

        const mat = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.74,
            metalness: 0.18,
            side: THREE.DoubleSide,
        });
        const road = new THREE.Mesh(geo, mat);
        road.name = 'Drivable spline road surface';
        road.receiveShadow = true;
        road.castShadow = false;
        state.trackGroup.add(road);

        createRoadSideWalls(track);
    }

    function createRoadSideWalls(track) {
        const vertices = [];
        const normals = [];
        const indices = [];
        const wallDepth = 5.2;

        for (let side = -1; side <= 1; side += 2) {
            const startIndex = vertices.length / 3;
            for (let i = 0; i <= track.sampleCount; i += 1) {
                const s = track.samples[i];
                const top = s.center.clone()
                    .addScaledVector(s.right, side * s.halfWidth)
                    .addScaledVector(s.normal, -0.08);
                const bottom = top.clone().addScaledVector(s.normal, -wallDepth);
                const sideNormal = s.right.clone().multiplyScalar(side);

                vertices.push(top.x, top.y, top.z, bottom.x, bottom.y, bottom.z);
                normals.push(sideNormal.x, sideNormal.y, sideNormal.z, sideNormal.x, sideNormal.y, sideNormal.z);
            }
            for (let i = 0; i < track.sampleCount; i += 1) {
                const a = startIndex + i * 2;
                const b = a + 1;
                const c = startIndex + (i + 1) * 2;
                const d = c + 1;
                if (side < 0) indices.push(a, b, c, b, d, c);
                else indices.push(a, c, b, b, c, d);
            }
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        geo.setIndex(indices);
        geo.computeBoundingSphere();

        const mat = new THREE.MeshStandardMaterial({
            color: 0x151925,
            roughness: 0.85,
            metalness: 0.12,
            side: THREE.DoubleSide,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.receiveShadow = true;
        state.trackGroup.add(mesh);
    }

    function createRails(track) {
        const railMat = new THREE.MeshStandardMaterial({
            color: 0x7cd8ff,
            emissive: 0x183cff,
            emissiveIntensity: 1.4,
            roughness: 0.28,
            metalness: 0.62,
        });

        for (let side = -1; side <= 1; side += 2) {
            const edgePoints = [];
            const postMat = new THREE.MeshStandardMaterial({
                color: side < 0 ? 0x00d8ff : 0xff4fd8,
                emissive: side < 0 ? 0x003a60 : 0x5c0036,
                emissiveIntensity: 0.55,
                roughness: 0.52,
                metalness: 0.35,
            });

            for (let i = 0; i < track.sampleCount; i += 6) {
                const s = track.samples[i];
                edgePoints.push(s.center.clone()
                    .addScaledVector(s.right, side * (s.halfWidth + 1.6 * TRACK_WIDTH_FACTOR))
                    .addScaledVector(s.normal, 1.45));
            }

            const railCurve = new THREE.CatmullRomCurve3(edgePoints, true, 'catmullrom', 0.35);
            const railGeo = new THREE.TubeGeometry(railCurve, Math.max(140, Math.floor(track.sampleCount / 2)), 0.48, 7, true);
            const rail = new THREE.Mesh(railGeo, railMat);
            rail.castShadow = true;
            rail.receiveShadow = true;
            state.trackGroup.add(rail);

            const postGeo = new THREE.CylinderGeometry(0.35, 0.45, 3.3, 8);
            for (let i = 0; i < track.sampleCount; i += 36) {
                const s = track.samples[i];
                const post = new THREE.Mesh(postGeo, postMat);
                const pos = s.center.clone()
                    .addScaledVector(s.right, side * (s.halfWidth + 1.6 * TRACK_WIDTH_FACTOR))
                    .addScaledVector(s.normal, -0.2);
                post.position.copy(pos);
                post.quaternion.setFromUnitVectors(WORLD_UP, s.normal);
                post.castShadow = true;
                state.trackGroup.add(post);
            }
        }
    }

    function createDashLines(track) {
        const vertices = [];
        const normals = [];
        const indices = [];
        let quad = 0;

        for (let i = 8; i < track.sampleCount; i += 22) {
            const j = Math.min(i + 8, track.sampleCount);
            const a = track.samples[i];
            const b = track.samples[j];
            const width = 0.72 * TRACK_WIDTH_FACTOR;
            const aLeft = a.center.clone().addScaledVector(a.right, -width).addScaledVector(a.normal, 0.13);
            const aRight = a.center.clone().addScaledVector(a.right, width).addScaledVector(a.normal, 0.13);
            const bLeft = b.center.clone().addScaledVector(b.right, -width).addScaledVector(b.normal, 0.13);
            const bRight = b.center.clone().addScaledVector(b.right, width).addScaledVector(b.normal, 0.13);

            vertices.push(aLeft.x, aLeft.y, aLeft.z, aRight.x, aRight.y, aRight.z, bLeft.x, bLeft.y, bLeft.z, bRight.x, bRight.y, bRight.z);
            normals.push(a.normal.x, a.normal.y, a.normal.z, a.normal.x, a.normal.y, a.normal.z, b.normal.x, b.normal.y, b.normal.z, b.normal.x, b.normal.y, b.normal.z);
            indices.push(quad, quad + 2, quad + 1, quad + 1, quad + 2, quad + 3);
            quad += 4;
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        geo.setIndex(indices);
        geo.computeBoundingSphere();

        const mat = new THREE.MeshStandardMaterial({
            color: 0xf6fbff,
            emissive: 0x2f5fff,
            emissiveIntensity: 0.35,
            roughness: 0.45,
        });
        const dashes = new THREE.Mesh(geo, mat);
        dashes.name = 'Neon dashed centre line';
        state.trackGroup.add(dashes);
    }

    function createBoostPads(track, rng) {
        const vertices = [];
        const normals = [];
        const indices = [];
        let quad = 0;
        const boostCount = 9;

        for (let k = 0; k < boostCount; k += 1) {
            const u = wrap01(k / boostCount + randRange(rng, 0.02, 0.075));
            const len = randRange(rng, 0.010, 0.017);
            track.boosts.push({ u, length: len });

            const a = getTrackSample(track, wrap01(u - len * 0.5));
            const b = getTrackSample(track, wrap01(u + len * 0.5));
            const width = randRange(rng, 3.8, 5.8) * TRACK_WIDTH_FACTOR;
            const aLeft = a.center.clone().addScaledVector(a.right, -width).addScaledVector(a.normal, 0.18);
            const aRight = a.center.clone().addScaledVector(a.right, width).addScaledVector(a.normal, 0.18);
            const bLeft = b.center.clone().addScaledVector(b.right, -width).addScaledVector(b.normal, 0.18);
            const bRight = b.center.clone().addScaledVector(b.right, width).addScaledVector(b.normal, 0.18);

            vertices.push(aLeft.x, aLeft.y, aLeft.z, aRight.x, aRight.y, aRight.z, bLeft.x, bLeft.y, bLeft.z, bRight.x, bRight.y, bRight.z);
            normals.push(a.normal.x, a.normal.y, a.normal.z, a.normal.x, a.normal.y, a.normal.z, b.normal.x, b.normal.y, b.normal.z, b.normal.x, b.normal.y, b.normal.z);
            indices.push(quad, quad + 2, quad + 1, quad + 1, quad + 2, quad + 3);
            quad += 4;
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        geo.setIndex(indices);
        geo.computeBoundingSphere();

        const mat = new THREE.MeshStandardMaterial({
            color: 0x00f7ff,
            emissive: 0x0088ff,
            emissiveIntensity: 2.2,
            transparent: true,
            opacity: 0.78,
            roughness: 0.2,
            metalness: 0.4,
            side: THREE.DoubleSide,
        });
        const pads = new THREE.Mesh(geo, mat);
        pads.name = 'Boost pads';
        state.trackGroup.add(pads);
    }

    function createCoins(track, rng) {
        const coinGeo = new THREE.IcosahedronGeometry(1.35, 1);
        const coinMat = new THREE.MeshStandardMaterial({
            color: 0xffd96a,
            emissive: 0xffa000,
            emissiveIntensity: 1.25,
            roughness: 0.25,
            metalness: 0.55,
        });

        const coinCount = 30;
        for (let i = 0; i < coinCount; i += 1) {
            const u = wrap01((i + 0.5) / coinCount + randRange(rng, -0.01, 0.01));
            const offset = randRange(rng, -TRACK_HALF_WIDTH * 0.55, TRACK_HALF_WIDTH * 0.55);
            const s = getTrackSample(track, u);
            const mesh = new THREE.Mesh(coinGeo, coinMat);
            mesh.position.copy(s.center)
                .addScaledVector(s.right, offset)
                .addScaledVector(s.normal, 3.4);
            mesh.castShadow = true;
            state.trackGroup.add(mesh);
            track.coins.push({ u, offset, mesh, collected: false });
        }
    }

    function createGates(track) {
        // Gates (hoops) removed per user request
    }

    function createTrackDecor(track, rng) {
        // Trees (pylons) removed per user request
    }

    function createCar() {
        const group = new THREE.Group();
        group.name = 'Player car';
        group.visible = false;
        state.scene.add(group);

        const bodyGroup = new THREE.Group();
        bodyGroup.name = 'Suspended body';
        group.add(bodyGroup);

        const bodyMat = new THREE.MeshStandardMaterial({
            color: 0x19b5ff,
            emissive: 0x003a66,
            emissiveIntensity: 0.55,
            roughness: 0.38,
            metalness: 0.48,
        });
        const darkMat = new THREE.MeshStandardMaterial({
            color: 0x10121b,
            roughness: 0.52,
            metalness: 0.28,
        });
        const glassMat = new THREE.MeshStandardMaterial({
            color: 0x9be8ff,
            emissive: 0x082a4c,
            emissiveIntensity: 0.7,
            roughness: 0.12,
            metalness: 0.08,
            transparent: true,
            opacity: 0.72,
        });

        const base = new THREE.Mesh(new THREE.BoxGeometry(4.4, 1.2, 6.2), bodyMat);
        base.position.y = 0.08;
        base.castShadow = true;
        base.receiveShadow = true;
        bodyGroup.add(base);

        const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.75, 1.25, 2.55), glassMat);
        cabin.position.set(0, 1.05, -0.35);
        cabin.castShadow = true;
        bodyGroup.add(cabin);

        const spoiler = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.28, 0.72), darkMat);
        spoiler.position.set(0, 1.08, -3.1);
        spoiler.castShadow = true;
        bodyGroup.add(spoiler);

        const noseGlow = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.15, 0.18), new THREE.MeshStandardMaterial({
            color: 0xffffff,
            emissive: 0x7fe9ff,
            emissiveIntensity: 2.5,
            roughness: 0.1,
        }));
        noseGlow.position.set(0, 0.37, 3.18);
        bodyGroup.add(noseGlow);

        const rearGlow = new THREE.Mesh(new THREE.BoxGeometry(3.7, 0.18, 0.18), new THREE.MeshStandardMaterial({
            color: 0xff2878,
            emissive: 0xff0055,
            emissiveIntensity: 2.2,
            roughness: 0.1,
        }));
        rearGlow.position.set(0, 0.34, -3.2);
        bodyGroup.add(rearGlow);

        const wheelMat = new THREE.MeshStandardMaterial({
            color: 0x08090e,
            roughness: 0.62,
            metalness: 0.18,
        });
        const rimMat = new THREE.MeshStandardMaterial({
            color: 0xb8edff,
            emissive: 0x004d6d,
            emissiveIntensity: 0.8,
            roughness: 0.28,
            metalness: 0.8,
        });
        const tireGeo = new THREE.CylinderGeometry(0.72, 0.72, 0.58, 28);
        const rimGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.62, 18);
        const wheelPositions = [
            { x: -2.35, z: 2.12, front: true },
            { x: 2.35, z: 2.12, front: true },
            { x: -2.35, z: -2.25, front: false },
            { x: 2.35, z: -2.25, front: false },
        ];

        car.wheels = wheelPositions.map((cfg) => {
            const pivot = new THREE.Group();
            pivot.position.set(cfg.x, -0.88, cfg.z);
            const axle = new THREE.Group();
            const tire = new THREE.Mesh(tireGeo, wheelMat);
            tire.rotation.z = Math.PI / 2;
            tire.castShadow = true;
            tire.receiveShadow = true;
            axle.add(tire);

            const rim = new THREE.Mesh(rimGeo, rimMat);
            rim.rotation.z = Math.PI / 2;
            rim.castShadow = true;
            axle.add(rim);

            pivot.add(axle);
            group.add(pivot);
            return { pivot, axle, front: cfg.front, baseY: pivot.position.y };
        });

        car.group = group;
        car.bodyGroup = bodyGroup;
    }

    function bindEvents() {
        window.addEventListener('resize', resize);

        document.addEventListener('keydown', (event) => {
            setKey(event, true);
        });

        document.addEventListener('keyup', (event) => {
            setKey(event, false);
        });

        if (dom.startButton) dom.startButton.addEventListener('click', () => startRace(false));
        if (dom.newTrackButton) dom.newTrackButton.addEventListener('click', () => startRace(true));
        if (dom.restartButton) dom.restartButton.addEventListener('click', restartRace);
        if (dom.resetButton) dom.resetButton.addEventListener('click', resetCar);
        if (dom.cameraButton) dom.cameraButton.addEventListener('click', cycleCamera);

        if (dom.fullscreenButton) {
            // Show fullscreen button only on touch devices
            if (window.matchMedia('(pointer: coarse)').matches) {
                dom.fullscreenButton.style.display = 'block';
            }
            dom.fullscreenButton.addEventListener('click', () => {
                if (!document.fullscreenElement) {
                    document.documentElement.requestFullscreen().catch((err) => {
                        debug.error(`Error attempting to enable fullscreen: ${err.message}`);
                    });
                } else {
                    document.exitFullscreen();
                }
            });
        }

        document.querySelectorAll('[data-drive-control]').forEach((button) => {
            const control = button.getAttribute('data-drive-control');
            const down = (event) => {
                event.preventDefault();
                input[control] = true;
                button.classList.add('is-active');
            };
            const up = (event) => {
                event.preventDefault();
                input[control] = false;
                button.classList.remove('is-active');
            };
            button.addEventListener('pointerdown', down);
            button.addEventListener('pointerup', up);
            button.addEventListener('pointerleave', up);
            button.addEventListener('pointercancel', up);

            // Prevent context menu on long-press for iOS
            button.addEventListener('contextmenu', (e) => e.preventDefault());
        });

        window.addEventListener('pointerdown', (e) => {
            // Ignore if clicking on UI buttons or interactive cards
            if (e.target.closest('button, input, .glass-card, .touch-button')) return;
            state.isDraggingCamera = true;
        });

        window.addEventListener('pointermove', (e) => {
            if (state.isDraggingCamera) {
                // Automatically switch to orbit mode if we start dragging
                if (state.cameraMode !== 3) {
                    state.cameraMode = 3;
                    const labels = ['chase', 'near chase', 'cinematic', 'orbit'];
                    showToast(`Camera: ${labels[state.cameraMode]}`);
                }

                state.orbitTheta -= e.movementX * 0.008;
                state.orbitPhi = THREE.MathUtils.clamp(state.orbitPhi + e.movementY * 0.008, -0.5, 1.3);
            }
        });

        window.addEventListener('pointerup', () => {
            state.isDraggingCamera = false;
        });

        debug.info('Input events bound. Keyboard: W/A/S/D, arrows, Space, R, C.');
    }

    function setKey(event, isDown) {
        const key = event.key.toLowerCase();
        const code = event.code;

        if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'w', 'a', 's', 'd', 'r', 't', 'c'].includes(key) ||
            ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code)) {
            event.preventDefault();
        }

        if (key === 'w' || key === 'arrowup' || code === 'KeyW' || code === 'ArrowUp') input.throttle = isDown;
        if (key === 's' || key === 'arrowdown' || key === ' ' || code === 'KeyS' || code === 'ArrowDown' || code === 'Space') input.brake = isDown;
        if (key === 'a' || key === 'arrowleft' || code === 'KeyA' || code === 'ArrowLeft') input.left = isDown;
        if (key === 'd' || key === 'arrowright' || code === 'KeyD' || code === 'ArrowRight') input.right = isDown;

        if (!isDown && (key === 'r' || code === 'KeyR')) resetCar();
        if (!isDown && (key === 't' || code === 'KeyT')) restartRace();
        if (!isDown && (key === 'c' || code === 'KeyC')) cycleCamera();
    }

    function startRace(forceRandomSeed) {
        let seedText = dom.seedInput?.value.trim() || '';
        if (forceRandomSeed || !seedText) {
            seedText = `track-${Date.now().toString(36)}-${Math.floor(Math.random() * 9999)}`;
        }

        if (dom.seedInput) dom.seedInput.value = seedText;

        try {
            generateSplineTrack(seedText);
            restartRace();
            car.group.visible = true;
            state.started = true;
            if (dom.overlay) dom.overlay.classList.add('is-hidden');
            showToast('New spline track generated. Hit the boost pads!');
            debug.info('Race started.', { seedText });
        } catch (error) {
            debug.error('Could not generate/start the race.', error);
            showToast('Track generation failed. Check the console.', true);
        }
    }

    function restartRace() {
        if (!state.track || !car.group) {
            debug.warn('Restart requested before a track exists. Generate a track first.');
            return;
        }

        car.u = 0.012;
        car.lastU = car.u;
        car.offset = 0;
        car.speed = 0;
        car.lastSpeed = 0;
        car.steer = 0;
        car.headingAngle = 0;
        car.yawVelocity = 0;
        car.driftAmount = 0;
        car.lateralVelocity = 0;
        car.suspension = 0;
        car.suspensionVelocity = 0;
        car.lap = 1;
        car.score = 0;
        car.bestLap = null;
        car.lapStartTime = performance.now();
        car.boostGlow = 0;

        state.track.coins.forEach((coin) => {
            coin.collected = false;
            if (coin.mesh) coin.mesh.visible = true;
        });

        placeCarOnTrack(0);
        showToast('Race restarted.');
        debug.info('Race restarted to start line.');
    }

    function resetCar() {
        if (!state.track || !car.group) return;

        car.offset = 0;
        car.speed = 0;
        car.lastSpeed = 0;
        car.steer = 0;
        car.headingAngle = 0;
        car.yawVelocity = 0;
        car.driftAmount = 0;
        car.lateralVelocity = 0;
        car.suspension = 0;
        car.suspensionVelocity = 0;

        placeCarOnTrack(0);
        showToast('Car reset to track.');
        debug.info('Car reset to current track position.');
    }

    function cycleCamera() {
        state.cameraMode = (state.cameraMode + 1) % 4;
        const labels = ['chase', 'near chase', 'cinematic', 'orbit'];
        showToast(`Camera: ${labels[state.cameraMode]}`);
        debug.info('Camera mode changed:', labels[state.cameraMode]);
    }

    function animate() {
        const rawDt = state.clock.getDelta();
        const dt = Math.min(rawDt, 0.045);

        if (rawDt > 0.16) {
            debug.warn('Large frame delta detected. Clamping physics step.', rawDt.toFixed(3));
        }

        if (state.started && state.track) {
            updateCar(dt);
            updateCoins(dt);
        } else {
            updateIdleCamera(dt);
        }

        updateCamera(dt);
        updateHud(rawDt);

        try {
            state.renderer.render(state.scene, state.camera);
        } catch (error) {
            debug.error('Renderer failed during frame render.', error);
            showToast('Render error. Check console.', true);
            state.renderer.setAnimationLoop(null);
        }
    }

    function updateCar(dt) {
        const track = state.track;
        if (!track) return;

        const sample = getTrackSample(track, car.u);

        const steerInput = (input.left ? 1 : 0) - (input.right ? 1 : 0);
        car.steer = damp(car.steer, steerInput, 13, dt);

        const speedAbs = Math.abs(car.speed);
        const speedNorm = THREE.MathUtils.clamp(speedAbs / TOP_SPEED, 0, 1.0);

        let acceleration = 0;

        if (input.throttle) {
            acceleration += 68 + (1 - Math.min(speedNorm, 1)) * 34;
        }

        if (input.brake) {
            const brakeForce = 132 * (TOP_SPEED / 88);
            if (car.speed > 4) acceleration -= brakeForce;
            else acceleration -= brakeForce * 0.4;
        }

        const slopeDrag = sample.tangent.y * 34;

        // Calibrate drag so the car tops out exactly at TOP_SPEED when W is held
        const dragCoefficient = 63.5 / (TOP_SPEED * TOP_SPEED);
        const aeroDrag = dragCoefficient * car.speed * speedAbs;
        const rollingDrag = Math.min(Math.abs(car.speed), 4.5) * Math.sign(car.speed);

        acceleration -= slopeDrag + aeroDrag + rollingDrag;

        car.speed += acceleration * dt;
        car.speed = THREE.MathUtils.clamp(car.speed, -TOP_SPEED * 0.3, TOP_SPEED);

        // ---------------------------------------------------------------------------
        // Real steering:
        // The old version forced the car to point exactly along the spline tangent.
        // This version lets the car yaw relative to the track, then moves it based on
        // that actual heading angle.
        // ---------------------------------------------------------------------------

        const minimumSteerSpeed = THREE.MathUtils.clamp(speedAbs / 12, 0, 1);
        const forwardDirection = Math.sign(car.speed || 1);

        const turnRate =
            car.steer *
            forwardDirection *
            minimumSteerSpeed *
            THREE.MathUtils.lerp(1.9, 1.05, Math.min(speedNorm, 1));

        car.yawVelocity += turnRate * dt * 5.2;

        // Natural self-aligning force: the car wants to face the road direction again.
        const alignForce = -car.headingAngle * THREE.MathUtils.lerp(3.6, 1.7, Math.min(speedNorm, 1));
        car.yawVelocity += alignForce * dt;

        // Damping stops infinite spinning.
        car.yawVelocity *= Math.exp(-4.3 * dt);

        car.headingAngle += car.yawVelocity * dt;

        // Clamp the maximum angle relative to the road.
        // Higher value = driftier. Lower value = more arcade-locked.
        car.headingAngle = THREE.MathUtils.clamp(car.headingAngle, -0.82, 0.82);

        // Convert actual heading into track-forward and sideways movement.
        const forwardAlongTrack = Math.cos(car.headingAngle) * car.speed;
        const sidewaysAcrossTrack = Math.sin(car.headingAngle) * car.speed;

        car.u = wrap01(car.u + (forwardAlongTrack * dt) / track.length);

        // Sideways movement from actual yaw, plus a small arcade steering shove.
        car.lateralVelocity += sidewaysAcrossTrack * dt * 1.85;
        car.lateralVelocity += car.steer * speedNorm * 10.5 * dt;

        // Grip pulls the car back from sliding forever.
        const grip = THREE.MathUtils.lerp(7.8, 4.3, Math.min(speedNorm, 1));
        car.lateralVelocity *= Math.exp(-grip * dt);

        car.offset += car.lateralVelocity * dt * 4.8;

        // Visual drift amount used by body roll/camera feel.
        car.driftAmount = damp(car.driftAmount, car.headingAngle + car.lateralVelocity * 0.015, 8, dt);

        const offRoadLimit = sample.halfWidth - 1.25;
        car.offRoad = Math.abs(car.offset) > offRoadLimit;

        if (car.offRoad) {
            // car.speed *= Math.exp(-1.8 * dt); // Removed speed penalty
            car.lateralVelocity -= Math.sign(car.offset) * 13 * dt;
            car.headingAngle -= Math.sign(car.offset) * 0.65 * dt;
        }

        const maxOffset = sample.halfWidth + 0.5;

        if (Math.abs(car.offset) > maxOffset) {
            car.offset = Math.sign(car.offset) * maxOffset;
            car.lateralVelocity *= -0.22;
            // car.speed *= 0.84; // Removed speed penalty
            car.headingAngle *= 0.72;

            if (Math.random() < 0.02) {
                debug.warn('Car hit the outer soft boundary. Offset clamped.');
            }
        }

        car.onBoost = isOnBoost(track, car.u) && !car.offRoad && car.speed > 10;

        if (car.onBoost) {
            car.speed = Math.min(car.speed + 88 * dt, TOP_SPEED);
            car.boostGlow = 1;
        } else {
            car.boostGlow = Math.max(0, car.boostGlow - dt * 2.2);
        }

        updateLapCounter();
        updateSuspension(dt, sample, acceleration, speedNorm);
        placeCarOnTrack(dt);
    }

    function updateSuspension(dt, sample, acceleration, speedNorm) {
        const bump = (
            Math.sin(car.u * TAU * 28 + car.offset * 0.42) * 0.24
            + Math.sin(car.u * TAU * 71 + 1.7) * 0.12
            + Math.sin(car.u * TAU * 117 + car.offset * 0.15) * 0.06
        ) * (0.35 + speedNorm * 1.4);

        const lateralLoad = Math.abs(car.lateralVelocity) * 0.018;
        const boostLoad = car.onBoost ? 0.22 : 0;
        const target = bump + lateralLoad + boostLoad;
        const spring = 54;
        const damper = 13.5;
        const force = (target - car.suspension) * spring - car.suspensionVelocity * damper;
        car.suspensionVelocity += force * dt;
        car.suspension += car.suspensionVelocity * dt;
        car.suspension = THREE.MathUtils.clamp(car.suspension, -0.65, 1.25);

        const pitchTarget = THREE.MathUtils.clamp(-acceleration * 0.0045, -0.18, 0.18);
        const rollTarget = THREE.MathUtils.clamp(-car.steer * 0.12 - car.lateralVelocity * 0.032, -0.28, 0.28);
        car.bodyGroup.rotation.x = damp(car.bodyGroup.rotation.x, pitchTarget, 9.5, dt);
        car.bodyGroup.rotation.z = damp(car.bodyGroup.rotation.z, rollTarget, 9.5, dt);

        const compression = THREE.MathUtils.clamp(0.55 - car.suspension * 0.22, 0.25, 0.9);
        car.wheelSpin -= (car.speed * dt) / 0.72;
        car.wheels.forEach((wheel, index) => {
            const sideNoise = Math.sin(car.u * TAU * 34 + index * 1.7) * 0.07;
            wheel.pivot.position.y = wheel.baseY - compression * 0.32 + sideNoise;
            wheel.axle.rotation.x = car.wheelSpin;
            wheel.pivot.rotation.y = wheel.front ? car.steer * 0.62 : 0;
        });

        const scalePulse = 1 + car.boostGlow * 0.035;
        car.bodyGroup.scale.set(scalePulse, 1 - car.boostGlow * 0.015, scalePulse);
    }

    function placeCarOnTrack(dt) {
        const track = state.track;
        if (!track || !car.group) return;

        const s = getTrackSample(track, car.u);

        const position = s.center.clone()
            .addScaledVector(s.right, car.offset)
            .addScaledVector(s.normal, 1.60 + car.suspension);

        // Base orientation follows the road surface.
        tmp.m1.makeBasis(s.right, s.normal, s.tangent);
        const roadQuat = new THREE.Quaternion().setFromRotationMatrix(tmp.m1);

        // Extra yaw lets the car actually turn left/right instead of being glued
        // exactly to the spline tangent.
        const yawQuat = new THREE.Quaternion().setFromAxisAngle(s.normal, car.headingAngle);

        tmp.q1.copy(roadQuat).multiply(yawQuat);

        if (dt > 0) {
            car.group.position.lerp(position, 1 - Math.exp(-18 * dt));
            car.group.quaternion.slerp(tmp.q1, 1 - Math.exp(-15 * dt));
        } else {
            car.group.position.copy(position);
            car.group.quaternion.copy(tmp.q1);
        }
    }

    function updateLapCounter() {
        if (car.lastU > 0.92 && car.u < 0.08 && car.speed > 0) {
            const now = performance.now();
            const lapTime = (now - car.lapStartTime) / 1000;
            car.lapStartTime = now;
            if (car.lap > 1) {
                car.bestLap = car.bestLap === null ? lapTime : Math.min(car.bestLap, lapTime);
                car.score += Math.max(1000, Math.floor(12000 / Math.max(lapTime, 1)));
                showToast(`Lap ${car.lap} complete: ${lapTime.toFixed(1)}s`);
                debug.info('Lap complete.', { lap: car.lap, lapTime: lapTime.toFixed(2), bestLap: car.bestLap?.toFixed(2) });
            }
            car.lap += 1;
        }
    }

    function updateCoins(dt) {
        const track = state.track;
        if (!track) return;

        for (const coin of track.coins) {
            if (coin.mesh && !coin.collected) {
                coin.mesh.rotation.y += dt * 2.5;
                coin.mesh.rotation.x += dt * 1.4;
            }

            if (!coin.collected && periodicDistance(car.u, coin.u) < 0.0065 && Math.abs(car.offset - coin.offset) < 2.65) {
                coin.collected = true;
                if (coin.mesh) coin.mesh.visible = false;
                car.score += 250;
                car.speed = Math.min(car.speed + 8, 108);
                showToast('+250 energy orb');
                debug.info('Collected energy orb.', { score: car.score });
            }
        }
    }

    function updateCamera(dt) {
        if (!state.track || !car.group || !state.started) {
            return;
        }

        const s = getTrackSample(state.track, car.u);
        const speedNorm = THREE.MathUtils.clamp(Math.abs(car.speed) / 90, 0, 1);
        const carPos = car.group.position;
        let desiredPos;
        let lookAt;

        if (state.cameraMode === 0) {
            desiredPos = carPos.clone()
                .addScaledVector(s.tangent, -24 - speedNorm * 15)
                .addScaledVector(s.normal, 10 + speedNorm * 5)
                .addScaledVector(s.right, car.steer * -3.5);
            lookAt = carPos.clone()
                .addScaledVector(s.tangent, 20 + speedNorm * 18)
                .addScaledVector(s.normal, 4.5);
        } else if (state.cameraMode === 1) {
            desiredPos = carPos.clone()
                .addScaledVector(s.tangent, -12)
                .addScaledVector(s.normal, 5.8)
                .addScaledVector(s.right, -car.steer * 2.2);
            lookAt = carPos.clone().addScaledVector(s.tangent, 24).addScaledVector(s.normal, 3.8);
        } else if (state.cameraMode === 2) {
            desiredPos = carPos.clone()
                .addScaledVector(s.tangent, -42)
                .addScaledVector(s.normal, 25)
                .addScaledVector(s.right, Math.sin(performance.now() * 0.0004) * 18);
            lookAt = carPos.clone().addScaledVector(s.tangent, 28).addScaledVector(s.normal, 5.8);
        } else {
            // Orbit Mode
            const dist = 38 + speedNorm * 15;
            const ox = Math.sin(state.orbitTheta) * Math.cos(state.orbitPhi) * dist;
            const oy = Math.sin(state.orbitPhi) * dist;
            const oz = Math.cos(state.orbitTheta) * Math.cos(state.orbitPhi) * dist;

            desiredPos = carPos.clone().add(new THREE.Vector3(ox, oy, oz));
            lookAt = carPos.clone().addScaledVector(s.normal, 4);
        }

        state.camera.position.lerp(desiredPos, 1 - Math.exp(-4.8 * dt));
        state.camera.up.lerp(s.normal, 1 - Math.exp(-3.5 * dt)).normalize();
        state.camera.lookAt(lookAt);
    }

    function updateIdleCamera(dt) {
        const time = performance.now() * 0.00012;
        const radius = 170;
        state.camera.position.x = Math.cos(time) * radius;
        state.camera.position.z = Math.sin(time) * radius;
        state.camera.position.y = 78 + Math.sin(time * 2.4) * 12;
        state.camera.up.set(0, 1, 0);
        state.camera.lookAt(0, 0, 0);
    }

    function updateHud(rawDt) {
        state.fpsSmoothed = damp(state.fpsSmoothed, 1 / Math.max(rawDt, 0.0001), 4, Math.min(rawDt, 0.1));

        if (dom.speedValue) dom.speedValue.textContent = `${Math.round(Math.abs(car.speed) * 3.6)}`;
        if (dom.lapValue) dom.lapValue.textContent = `${car.lap}`;
        if (dom.scoreValue) dom.scoreValue.textContent = `${car.score}`;
        if (dom.statusValue) {
            if (!state.started) dom.statusValue.textContent = 'waiting';
            else if (car.onBoost) dom.statusValue.textContent = 'boost';
            else if (car.offRoad) dom.statusValue.textContent = 'off-road';
            else dom.statusValue.textContent = `${Math.round(state.fpsSmoothed)} fps`;
        }

        const second = Math.floor(performance.now() / 1000);
        if (DEBUG && second !== state.lastDebugSecond && state.started) {
            state.lastDebugSecond = second;
            if (!Number.isFinite(car.group.position.x) || !Number.isFinite(car.speed)) {
                debug.error('Non-finite car state detected.', { position: car.group.position, speed: car.speed, u: car.u });
            }
        }
    }

    function getTrackSample(track, u) {
        if (!track || !track.samples || track.samples.length < 2) {
            debug.error('getTrackSample called without a valid track.');
            return {
                center: new THREE.Vector3(),
                tangent: new THREE.Vector3(0, 0, 1),
                right: new THREE.Vector3(1, 0, 0),
                normal: new THREE.Vector3(0, 1, 0),
                halfWidth: TRACK_HALF_WIDTH,
            };
        }

        const wrapped = wrap01(u);
        const scaled = wrapped * track.sampleCount;
        const i0 = Math.floor(scaled) % track.sampleCount;
        const i1 = (i0 + 1) % track.sampleCount;
        const t = scaled - Math.floor(scaled);
        const a = track.samples[i0];
        const b = track.samples[i1];

        return {
            center: a.center.clone().lerp(b.center, t),
            tangent: a.tangent.clone().lerp(b.tangent, t).normalize(),
            right: a.right.clone().lerp(b.right, t).normalize(),
            normal: a.normal.clone().lerp(b.normal, t).normalize(),
            halfWidth: THREE.MathUtils.lerp(a.halfWidth, b.halfWidth, t),
        };
    }

    function isOnBoost(track, u) {
        return track.boosts.some((boost) => periodicDistance(u, boost.u) < boost.length * 0.5);
    }

    function resize() {
        if (!state.renderer || !state.camera) return;

        const width = window.innerWidth;
        const height = window.innerHeight;
        state.camera.aspect = width / Math.max(height, 1);
        state.camera.updateProjectionMatrix();
        state.renderer.setSize(width, height, false);
        debug.info('Viewport resized.', { width, height, devicePixelRatio: window.devicePixelRatio });
    }

    function showToast(message, isError = false) {
        if (!dom.toast) return;
        dom.toast.textContent = message;
        dom.toast.classList.toggle('is-error', isError);
        dom.toast.classList.add('is-visible');
        clearTimeout(state.toastTimeout);
        state.toastTimeout = window.setTimeout(() => {
            dom.toast.classList.remove('is-visible');
        }, isError ? 5200 : 2600);
    }

    function disposeObject3D(object) {
        if (!object) return;
        object.traverse((child) => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (Array.isArray(child.material)) child.material.forEach((mat) => mat.dispose());
                else child.material.dispose();
            }
        });
        if (object.parent) object.parent.remove(object);
    }

    function wrap01(value) {
        return ((value % 1) + 1) % 1;
    }

    function periodicDistance(a, b) {
        const d = Math.abs(wrap01(a) - wrap01(b));
        return Math.min(d, 1 - d);
    }

    function damp(current, target, lambda, dt) {
        return THREE.MathUtils.lerp(current, target, 1 - Math.exp(-lambda * dt));
    }

    function hashString(text) {
        let hash = 2166136261;
        for (let i = 0; i < text.length; i += 1) {
            hash ^= text.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return hash >>> 0;
    }

    function mulberry32(seed) {
        let t = seed >>> 0;
        return function random() {
            t += 0x6D2B79F5;
            let r = Math.imul(t ^ (t >>> 15), 1 | t);
            r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
            return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
        };
    }

    function randRange(rng, min, max) {
        return min + (max - min) * rng();
    }

    function randomInt(rng, min, max) {
        return Math.floor(randRange(rng, min, max + 1));
    }

    init();
})();