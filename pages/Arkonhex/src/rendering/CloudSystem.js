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

        this.cloudMeshes = new Map(); // key -> mesh

        // Simplex noise specifically for clouds
        const prng = createPRNG("arkonhex_clouds");
        this.noise = new SimplexNoise(prng);

        // Cloud Material
        // USER CONFIG: Tweak 'opacity' for translucency, and 'emissiveIntensity' to make them brighter white!
        this.material = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            emissive: 0xffffff, // Full white glow base
            emissiveIntensity: 0.8, // USER CONFIG: Increase this to make clouds glow brighter white
            roughness: 0.8,
            metalness: 0.1,
            transparent: true,
            opacity: 0.8, // USER CONFIG: Tweak this for whiter/more transparent clouds
            depthWrite: false, // Completely eliminates Z-fighting for overlapping transparent meshes
            side: THREE.FrontSide
        });

        // Optimize: instance a single hex geometry for all clouds
        // A hexagon is just a 6-sided cylinder
        this.geometry = new THREE.CylinderGeometry(1, 1, 1, 6); // Size 1x1, we scale later

        this.cloudGroup = new THREE.Group();
        this.engine.scene.add(this.cloudGroup);

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
        this.cloudGroup.position.x += delta * this.cloudSpeed;

        // Periodically check chunks to spawn/despawn clouds, using relative player pos
        if (this.engine.playerSystem) {
            const pos = this.engine.playerSystem.position;
            // The position of the player *relative* to the moving cloud group
            const relX = pos.x - this.cloudGroup.position.x;
            const relZ = pos.z;

            this.updateClouds(relX, relZ);
        }
    }

    updateClouds(relX, relZ) {
        // We evaluate clouds on a much larger macro grid so we don't spam thousands of meshes.
        // Let's use a huge virtual hex grid, e.g., cloud block 32 units wide.
        const CLOUD_SIZE = 32;

        const qRad = Math.floor(this.cloudRadius / CLOUD_SIZE);

        const pQ = Math.round(relX / (CLOUD_SIZE * Math.sqrt(3)));
        const pR = Math.round(relZ / (CLOUD_SIZE * 1.5));

        const neededClouds = new Set();

        for (let dq = -qRad; dq <= qRad; dq++) {
            for (let dr = -qRad; dr <= qRad; dr++) {
                if ((Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2 <= qRad) {
                    const q = pQ + dq;
                    const r = pR + dr;

                    const key = `${q},${r}`;
                    neededClouds.add(key);

                    if (!this.cloudMeshes.has(key)) {
                        this.spawnCloudAt(q, r, CLOUD_SIZE);
                    } else {
                        // Update existing cloud drift offset via noise density check
                        this.updateCloudMesh(q, r, this.cloudMeshes.get(key), CLOUD_SIZE);
                    }
                }
            }
        }

        // Cull far clouds
        for (const [key, mesh] of this.cloudMeshes.entries()) {
            if (!neededClouds.has(key)) {
                if (mesh) this.cloudGroup.remove(mesh);
                this.cloudMeshes.delete(key);
            }
        }
    }

    spawnCloudAt(q, r, size) {
        // Local Position within the moving Cloud Group
        const localX = (Math.sqrt(3) * q + Math.sqrt(3) / 2 * r) * size;
        const localZ = (3 / 2 * r) * size;

        // Static noise query based purely on coordinate
        const nx = localX * this.cloudScale;
        const nz = localZ * this.cloudScale;

        // We use rigid cutoff noise threshold to make clear distinct fluffy shapes
        let density = this.noise.noise2D(nx, nz);
        density = (density + 1) / 2; // [0, 1]

        // MACRO NOISE MASK: Evaluate the noise at a massive zoomed-out scale to carve huge blue-sky gaps
        let macroNoise = this.noise.noise2D(nx * 0.05, nz * 0.05);
        macroNoise = (macroNoise + 1) / 2; // [0, 1]

        // If the region rolls low on the macro scale, explicitly kill the clouds in this chunk
        if (macroNoise < 0.45) { // 45% of the world will be vast open blue skies
            density = 0;
        }

        // Create an instanced mesh or just a scaled group
        // If density exceeds threshold, we spawn
        if (density > this.cloudThreshold) {
            const mesh = new THREE.Mesh(this.geometry, this.material);
            // Stagger spawn height using a deterministic pseudo-random number based on the grid coordinate (q, r).
            // This guarantees that adjacent/overlapping hexes are forcefully pushed onto completely different height planes!
            const pseudoRandom = Math.abs(Math.sin(q * 12.9898 + r * 78.233)) * 60.0;
            mesh.position.set(localX, this.cloudHeight + pseudoRandom, localZ);

            // Scale hex radius based on density to make fluffy overlapping varied hexagons
            const scaleFac = size * ((density - this.cloudThreshold) * 3 + 1);
            // Thick clouds
            mesh.scale.set(scaleFac, 10 + (density * 15), scaleFac);
            mesh.castShadow = this.castShadows;
            mesh.receiveShadow = false; // Never let clouds cast shadows onto themselves or each other

            this.cloudGroup.add(mesh);
            this.cloudMeshes.set(`${q},${r}`, mesh);

            // Slightly optimize cull bounds
            mesh.matrixAutoUpdate = false;
            mesh.updateMatrix();
        } else {
            // Put a null marker so we don't keep testing
            this.cloudMeshes.set(`${q},${r}`, null);
        }
    }

    updateCloudMesh(q, r, mesh, size) {
        // Because the noise and scale are completely static to the grid tile, we do not need to do anything! 
        // The drift is handled entirely by the parent CloudGroup moving globally.
        // We just leave the mesh exactly where it is.
        return;
    }
}
