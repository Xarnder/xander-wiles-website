import * as THREE from 'three';

export class LightingManager {
    constructor(scene) {
        this.scene = scene;

        // Ambient light (Soft base lighting)
        this.ambientLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.4);
        this.scene.add(this.ambientLight);

        // Directional Sunlight (Dynamic, casts shadows)
        this.sunLight = new THREE.DirectionalLight(0xffffee, 1.5);
        this.sunLight.position.set(50, 100, 50);
        this.sunLight.castShadow = true;

        // High quality shadow settings
        this.sunLight.shadow.mapSize.width = 2048;
        this.sunLight.shadow.mapSize.height = 2048;
        this.sunLight.shadow.camera.near = 0.5;
        this.sunLight.shadow.camera.far = 500;

        // Shadow camera frustum needs to cover the loaded chunks
        const shadowDistance = 100; // Adjust based on render distance
        this.sunLight.shadow.camera.left = -shadowDistance;
        this.sunLight.shadow.camera.right = shadowDistance;
        this.sunLight.shadow.camera.top = shadowDistance;
        this.sunLight.shadow.camera.bottom = -shadowDistance;

        this.sunLight.shadow.bias = -0.0005;

        this.scene.add(this.sunLight);

        // Visible Hexagon Sun Skybox Object
        // A short 6-sided cylinder forms a hexagon coin
        const sunGeo = new THREE.CylinderGeometry(60, 60, 4, 6);
        // Rotate so the flat hex face points outward on the Z axis
        sunGeo.rotateX(Math.PI / 2);

        const sunMat = new THREE.MeshBasicMaterial({ color: 0xffffee, transparent: true, opacity: 0.95 });
        this.sunMesh = new THREE.Mesh(sunGeo, sunMat);
        this.scene.add(this.sunMesh);
    }

    // Update sunlight position to follow player so shadows always encapsulate the view area
    update(playerPosition) {
        const sunOffset = new THREE.Vector3(50, 100, 50);
        this.sunLight.position.copy(playerPosition).add(sunOffset);
        this.sunLight.target.position.copy(playerPosition);
        this.sunLight.target.updateMatrixWorld();

        // Position the visible sun mesh far away in the sky in the same direction
        const sunDir = new THREE.Vector3(50, 100, 50).normalize();
        const sunDist = 900; // Far into the sky

        this.sunMesh.position.copy(playerPosition).add(sunDir.multiplyScalar(sunDist));
        this.sunMesh.lookAt(playerPosition);
    }
}
