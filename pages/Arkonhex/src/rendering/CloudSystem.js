import * as THREE from 'three';
import { SimplexNoise } from '../utils/SimplexNoise.js';
import { createPRNG } from '../utils/MathUtils.js';
import { axialToWorld } from '../utils/HexUtils.js';

export class CloudSystem {
    constructor(engine) {
        this.engine = engine;

        // Cloud config
        this.cloudHeight = 150; // High above terrain
        this.cloudSpeed = 2.0; // Units per second drift
        this.cloudScale = 0.003; // Noise scale for clouds
        this.cloudThreshold = 0.6; // High threshold for sparser clouds
        this.cloudRadius = 1200; // How far to render clouds
        this.castShadows = false; // Toggled by Settings Menu

        // Retained as a coordinate cache and as the public marker used by the
        // settings UI to locate this system. Cloud geometry is instanced below.
        this.cloudMeshes = new Map();
        this.cloudBuildJob = null;
        this.requestedCloudCenter = null;

        // Simplex noise specifically for clouds
        const prng = createPRNG("arkonhex_clouds");
        this.noise = new SimplexNoise(prng);

        // Cloud Material
        // USER CONFIG: Tweak 'opacity' for translucency, and 'emissiveIntensity' to make them brighter white!
        this.material = new THREE.MeshStandardMaterial({
            color: 0x222222,
            emissive: 0x222222, // Full white glow base
            emissiveIntensity: 0.8, // USER CONFIG: Increase this to make clouds glow brighter white
            roughness: 0.8,
            metalness: 0.1,
            transparent: true,
            opacity: 0.7, // USER CONFIG: Tweak this for whiter/more transparent clouds
            depthWrite: false, // Completely eliminates Z-fighting for overlapping transparent meshes
            side: THREE.FrontSide
        });

        // Optimize: instance a single hex geometry for all clouds
        // A hexagon is just a 6-sided cylinder
        this.geometry = new THREE.CylinderGeometry(1, 1, 1, 6); // Size 1x1, we scale later

        this.cloudGroup = new THREE.Group();
        this.cloudGroup.name = 'Clouds';
        this.engine.scene.add(this.cloudGroup);

        // Double-buffer the instance data so a new cloud field can be prepared
        // over several frames while the previous field remains visible.
        const qRadius = Math.floor(this.cloudRadius / 32);
        this.maxCloudInstances = 1 + 3 * qRadius * (qRadius + 1);
        this.cloudInstances = [0, 1].map(() => {
            const mesh = new THREE.InstancedMesh(
                this.geometry,
                this.material,
                this.maxCloudInstances
            );
            mesh.count = 0;
            mesh.visible = false;
            mesh.castShadow = this.castShadows;
            mesh.receiveShadow = false;
            mesh.frustumCulled = false;
            mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            this.cloudGroup.add(mesh);
            return mesh;
        });
        this.activeCloudMeshIndex = 0;
        this.instanceTransform = new THREE.Object3D();

        this.engine.registerSystem(this);
    }

    init() {
        // Build initial static cloud map around spawn
        this.updateClouds(0, 0);
    }

    update(delta, time) {
        // Dynamic Emissive Intensity based on Sun Angle
        if (this.engine.lightingManager) {
            const timeOfDay = this.engine.lightingManager.timeOfDay;
            // 0.0 = Midnight, 0.25 = Sunrise, 0.5 = Noon, 0.75 = Sunset
            const angle = (timeOfDay * Math.PI * 2) - (Math.PI / 2);
            const sunY = Math.sin(angle); // -1.0 at midnight, 1.0 at noon

            // Map sunY [-1.0, 1.0] to intensity [0.05, 0.8]
            const minIntensity = 0.00;
            const maxIntensity = 0.8;

            // Normalize sunY to [0.0, 1.0]
            let normalizedSunY = (sunY + 1.0) / 2.0;

            // Raise to a power (e.g., cubic) so it drops off much faster at sunset/sunrise
            normalizedSunY = Math.pow(normalizedSunY, 3.0);

            this.material.emissiveIntensity = minIntensity + (normalizedSunY * (maxIntensity - minIntensity));
        }

        // Slowly drift the entire group so chunks don't change internal shapes
        let currentSpeed = this.cloudSpeed;
        if (this.engine.inputManager) {
            if (this.engine.inputManager.isKeyDown('BracketRight')) {
                currentSpeed += 150.0; // Fast Forward clouds with time
            }
            if (this.engine.inputManager.isKeyDown('BracketLeft')) {
                currentSpeed -= 150.0; // Rewind clouds with time
            }
        }
        this.cloudGroup.position.x += delta * currentSpeed;

        // Periodically check chunks to spawn/despawn clouds, using relative player pos
        if (this.engine.playerSystem) {
            const pos = this.engine.playerSystem.position;
            // The position of the player *relative* to the moving cloud group
            const relX = pos.x - this.cloudGroup.position.x;
            const relZ = pos.z;

            this.updateClouds(relX, relZ);
        }

        // Advance one bounded portion of the cloud rebuild per frame. A full
        // 4,000-cell scan never blocks a single frame.
        if (this.cloudBuildJob) {
            const result = this.cloudBuildJob.next();
            if (result.done) this.cloudBuildJob = null;
        }
    }

    updateClouds(relX, relZ) {
        const CLOUD_SIZE = 32;
        const qRad = Math.floor(this.cloudRadius / CLOUD_SIZE);
        const pQ = Math.round(relX / (CLOUD_SIZE * Math.sqrt(3)));
        const pR = Math.round(relZ / (CLOUD_SIZE * 1.5));
        const centerKey = `${pQ},${pR}`;

        // The field only changes after crossing a 32-unit macro-cell. The old
        // implementation rebuilt Sets and checked every cloud on every frame.
        if (centerKey === this.requestedCloudCenter) return;

        this.requestedCloudCenter = centerKey;
        this.cloudBuildJob = this.buildCloudFieldGenerator(pQ, pR, qRad, CLOUD_SIZE);
    }

    *buildCloudFieldGenerator(centerQ, centerR, qRadius, size) {
        const inactiveIndex = 1 - this.activeCloudMeshIndex;
        const targetMesh = this.cloudInstances[inactiveIndex];
        const nextCloudCoordinates = new Map();
        const transform = this.instanceTransform;
        let instanceCount = 0;
        let visitedCount = 0;

        targetMesh.visible = false;

        for (let dq = -qRadius; dq <= qRadius; dq++) {
            for (let dr = -qRadius; dr <= qRadius; dr++) {
                if ((Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2 > qRadius) {
                    continue;
                }

                const q = centerQ + dq;
                const r = centerR + dr;
                const localX = (Math.sqrt(3) * q + Math.sqrt(3) / 2 * r) * size;
                const localZ = (3 / 2 * r) * size;
                const nx = localX * this.cloudScale;
                const nz = localZ * this.cloudScale;

                let density = (this.noise.noise2D(nx, nz) + 1) / 2;
                const macroNoise = (this.noise.noise2D(nx * 0.01, nz * 0.01) + 1) / 2;
                if (macroNoise < 0.4) density = 0;

                const key = `${q},${r}`;
                if (density > this.cloudThreshold) {
                    const pseudoRandom = Math.abs(Math.sin(q * 12.9898 + r * 78.233)) * 60;
                    const scaleFac = size * ((density - this.cloudThreshold) * 3 + 1);

                    transform.position.set(localX, this.cloudHeight + pseudoRandom, localZ);
                    transform.scale.set(scaleFac, 10 + density * 15, scaleFac);
                    transform.updateMatrix();
                    targetMesh.setMatrixAt(instanceCount, transform.matrix);

                    nextCloudCoordinates.set(key, true);
                    instanceCount++;
                } else {
                    nextCloudCoordinates.set(key, null);
                }

                visitedCount++;
                if (visitedCount % 128 === 0) yield;
            }
        }

        targetMesh.count = instanceCount;
        targetMesh.castShadow = this.castShadows;
        targetMesh.receiveShadow = false;
        targetMesh.instanceMatrix.needsUpdate = true;

        this.cloudInstances[this.activeCloudMeshIndex].visible = false;
        targetMesh.visible = true;
        this.activeCloudMeshIndex = inactiveIndex;
        this.cloudMeshes = nextCloudCoordinates;
    }

    dispose() {
        this.engine.scene.remove(this.cloudGroup);
        this.geometry.dispose();
        this.material.dispose();
    }
}
