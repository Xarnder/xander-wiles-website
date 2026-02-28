import * as THREE from 'three';
// We would import EffectComposer and SSAOPass here if we add post-processing,
// but for pure engine foundation, we'll start with high-quality core rendering.

export class Renderer {
    constructor(engine) {
        this.engine = engine;

        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(0, 20, 0);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(window.innerWidth, window.innerHeight);

        // High quality rendering settings - Default OFF for performance
        this.renderer.shadowMap.enabled = false;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        // Modern Three.js color space and tone mapping
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0;

        // Add canvas to DOM
        this.engine.container.appendChild(this.renderer.domElement);

        // Handle resize
        window.addEventListener('resize', this.onWindowResize.bind(this));

        this.engine.registerSystem(this);
    }

    onWindowResize() {
        if (!this.camera || !this.renderer) return;
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    update() {
        if (this.engine.scene && this.camera) {
            this.renderer.render(this.engine.scene, this.camera);
        }
    }

    setHighGraphics(enabled) {
        this.renderer.shadowMap.enabled = enabled;
        // Requires recompiling shaders for shadow changes to take effect
        this.engine.scene.traverse((child) => {
            if (child.isMesh && child.material) {
                child.material.needsUpdate = true;
            }
        });
    }
}
