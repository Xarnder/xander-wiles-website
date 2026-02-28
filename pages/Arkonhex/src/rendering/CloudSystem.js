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

        this.cloudMeshes = new Map(); // key -> mesh

        // Simplex noise specifically for clouds
        const prng = createPRNG("arkonhex_clouds");
        this.noise = new SimplexNoise(prng);

        this.material = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.8,
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

        // Create an instanced mesh or just a scaled group
        // If density exceeds threshold, we spawn
        if (density > this.cloudThreshold) {
            const mesh = new THREE.Mesh(this.geometry, this.material);
            mesh.position.set(localX, this.cloudHeight, localZ);

            // Scale hex radius based on density to make fluffy overlapping varied hexagons
            const scaleFac = size * ((density - this.cloudThreshold) * 3 + 1);
            // Thick clouds
            mesh.scale.set(scaleFac, 10 + (density * 15), scaleFac);

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
