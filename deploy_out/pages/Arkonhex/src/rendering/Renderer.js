import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export class Renderer {
    constructor(engine) {
        this.engine = engine;

        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(0, 20, 0);

        this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" }); // AA off for composer
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

        // Setup Post-Processing Composer Pipeline
        this.initPostProcessing();

        // Handle resize
        window.addEventListener('resize', this.onWindowResize.bind(this));

        this.engine.registerSystem(this);
    }

    initPostProcessing() {
        const renderTarget = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, {
            type: THREE.HalfFloatType // Better precision for lighting/shadows
        });

        this.composer = new EffectComposer(this.renderer, renderTarget);

        // 1. Raw Render
        this.renderPass = new RenderPass(this.engine.scene, this.camera);
        this.composer.addPass(this.renderPass);

        // 2. GTAO 
        const width = window.innerWidth;
        const height = window.innerHeight;
        this.gtaoPass = new GTAOPass(this.engine.scene, this.camera, width, height);
        this.gtaoPass.output = GTAOPass.OUTPUT.Default;
        this.gtaoPass.blendIntensity = 1.0; // Default visible intensity when enabled
        this.gtaoPass.enabled = false; // Off by default until slider turned up; explicitly enabled from UIManager when slider > 0
        this.gtaoPass.updateGtaoMaterial({
            radius: 8.0,          // Large world-space radius to cover inter-block distances
            distanceExponent: 1.0,
            thickness: 1.5,       // Slightly thicker AO to pick up block edges
            distanceFallOff: 1.0,
            scale: 1.0
        });
        this.gtaoPass.updatePdMaterial({
            lumaPhi: 10,
            depthPhi: 2,
            normalPhi: 3,
            radius: 12,           // Larger denoise radius for smoother AO
            rings: 2,
            samples: 16
        });
        this.composer.addPass(this.gtaoPass);

        // 3. Output (Tonemapping/Coloring)
        this.outputPass = new OutputPass();
        this.composer.addPass(this.outputPass);
    }

    onWindowResize() {
        if (!this.camera || !this.renderer) return;
        const width = window.innerWidth;
        const height = window.innerHeight;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();

        this.renderer.setSize(width, height);

        if (this.composer) {
            this.composer.setSize(width, height);
        }
        if (this.gtaoPass) {
            this.gtaoPass.updateGtaoMaterial({ resolution: new THREE.Vector2(width, height) });
        }

        // Update Thick Line resolution for the shared outline material
        const chunkSystem = this.engine.chunkSystem;
        if (chunkSystem && chunkSystem.meshBuilder && chunkSystem.meshBuilder.outlineMaterial) {
            chunkSystem.meshBuilder.outlineMaterial.resolution.set(width, height);
        }
    }

    update() {
        if (this.engine.scene && this.camera) {
            // Ensure post-processing passes use the PlayerSystem's active overriding camera
            if (this.renderPass) this.renderPass.camera = this.camera;
            if (this.gtaoPass) this.gtaoPass.camera = this.camera;

            // Render via composer rather than straight to raw renderer
            this.composer.render();
        }
    }

    setHighGraphics(enabled) {
        this.renderer.shadowMap.enabled = enabled;
        // Requires recompiling shaders for shadow changes to take effect
        this.engine.scene.traverse((child) => {
            if (child.isMesh && child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach(m => {
                        m.needsUpdate = true;
                    });
                } else {
                    child.material.needsUpdate = true;
                }
            }
        });
    }
}
