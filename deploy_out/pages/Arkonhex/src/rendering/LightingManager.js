import * as THREE from 'three';

export class LightingManager {
    constructor(engine) {
        this.engine = engine;
        this.scene = engine.scene;

        // 0.0 = Midnight, 0.25 = Sunrise, 0.3 = Noon, 0.75 = Sunset
        this.timeOfDay = 0.5;
        this.timeSpeed = 0.001; // Auto-progression per second
        this.ambientStrength = 3.5; // User-controlled ambient multiplier
        this.cycleEnabled = false; // Toggle for auto day/night progression

        // Ambient light (Soft base lighting)
        // HemisphereLight(skyColor, groundColor, intensity) 
        // We balance this precisely so shadows aren't pitch black, but baked AOC textures aren't flooded out
        this.ambientLight = new THREE.HemisphereLight(0xffffff, 0x666666, this.ambientStrength);
        this.scene.add(this.ambientLight);

        // Directional Sunlight (Dynamic, casts shadows)
        this.sunLight = new THREE.DirectionalLight(0xffffee, 1.5);
        this.sunLight.castShadow = true;

        // High quality shadow settings
        this.sunLight.shadow.mapSize.width = 4096;
        this.sunLight.shadow.mapSize.height = 4096;
        this.sunLight.shadow.camera.near = 0.5;
        this.sunLight.shadow.camera.far = 4000; // Must be > sunRadius to reach the world

        // Shadow camera frustum needs to cover the loaded chunks
        const shadowDistance = 600;
        this.sunLight.shadow.camera.left = -shadowDistance;
        this.sunLight.shadow.camera.right = shadowDistance;
        this.sunLight.shadow.camera.top = shadowDistance;
        this.sunLight.shadow.camera.bottom = -shadowDistance;
        this.sunLight.shadow.bias = -0.0001; // Decreased from -0.0005 to reduce Peter Panning over the massive distance
        this.sunLight.shadow.normalBias = 0.02; // Added to smoothly curve shadows across block edges

        this.scene.add(this.sunLight);

        // Visible Hexagon Sun Skybox Object
        const sunGeo = new THREE.CylinderGeometry(180, 180, 4, 6);
        sunGeo.rotateX(Math.PI / 2); // Flat face towards camera
        const sunMat = new THREE.MeshBasicMaterial({ color: 0xffffee, transparent: true, opacity: 0.95 });
        this.sunMesh = new THREE.Mesh(sunGeo, sunMat);
        this.scene.add(this.sunMesh);

        // Moon placeholder (Dark gray version of sun)
        const moonGeo = new THREE.CylinderGeometry(120, 120, 4, 6);
        moonGeo.rotateX(Math.PI / 2);
        // Opaque dark gray, not transparent, so stars don't shine through
        const moonMat = new THREE.MeshBasicMaterial({ color: 0x222222 });
        this.moonMesh = new THREE.Mesh(moonGeo, moonMat);
        this.scene.add(this.moonMesh);

        this.initSkyDome();
        this.initStars();
        this.initColorPalettes();
    }

    initSkyDome() {
        // Create a highly glossy, slightly metallic material for the sky
        const skyGeo = new THREE.SphereGeometry(3000, 32, 15);
        this.skyMat = new THREE.MeshPhysicalMaterial({
            color: 0xff2222, // Set via interpolation later
            metalness: 0.8, // High metalness for a deep sheen
            roughness: 0.1, // Low roughness makes it very glossy/reflective
            clearcoat: 1.0, // Add a clearcoat layer for extra gloss
            clearcoatRoughness: 0.05,
            side: THREE.BackSide,
            depthWrite: false
        });

        // We will no longer interpolate uniforms, we'll interpolate the material color directly
        // Keep the color arrays from before
        this.skyMesh = new THREE.Mesh(skyGeo, this.skyMat);
        this.scene.add(this.skyMesh);
    }

    initStars() {
        const starGeo = new THREE.BufferGeometry();
        const starPos = [];
        const starPhases = []; // For individual twinkling
        const STAR_COUNT = 2500;
        const RADIUS = 2800; // Far behind clouds, inside SkyDome

        for (let i = 0; i < STAR_COUNT; i++) {
            // Random point on sphere
            const u = Math.random();
            const v = Math.random();
            const theta = u * 2.0 * Math.PI;
            const phi = Math.acos(2.0 * v - 1.0);

            const x = RADIUS * Math.sin(phi) * Math.cos(theta);
            const y = RADIUS * Math.sin(phi) * Math.sin(theta);
            const z = RADIUS * Math.cos(phi);

            // Only add upper hemisphere stars
            if (y > -500) {
                starPos.push(x, y, z);
                // Assign a random starting phase (0 to 2PI) for the sine wave twinkle
                starPhases.push(Math.random() * Math.PI * 2);
            }
        }

        starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
        starGeo.setAttribute('phase', new THREE.Float32BufferAttribute(starPhases, 1));

        // Use a ShaderMaterial to animate twinkling per-star based on time and phase
        const vertexShader = `
            attribute float phase;
            varying float vPhase;
            void main() {
                vPhase = phase;
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                gl_PointSize = 4.0;
                gl_Position = projectionMatrix * mvPosition;
            }
        `;

        const fragmentShader = `
            uniform float time;
            uniform float globalAlpha;
            varying float vPhase;
            void main() {
                // Determine twinkle base on a sine wave using time and the random phase
                float twinkle = (sin(time * 2.0 + vPhase) + 1.0) / 2.0; // 0.0 to 1.0
                
                // Keep stars mostly bright, dip to 0.3 opacity briefly
                float localAlpha = mix(0.3, 1.0, twinkle);
                
                // Multiply the individual twinkle by the day/night global alpha
                gl_FragColor = vec4(1.0, 1.0, 1.0, localAlpha * globalAlpha);
            }
        `;

        this.starUniforms = {
            time: { value: 0 },
            globalAlpha: { value: 0.0 }
        };

        const starMat = new THREE.ShaderMaterial({
            uniforms: this.starUniforms,
            vertexShader: vertexShader,
            fragmentShader: fragmentShader,
            transparent: true,
            depthWrite: false
        });

        this.stars = new THREE.Points(starGeo, starMat);
        this.scene.add(this.stars);
    }

    initColorPalettes() {
        // High resolution 9-step array:
        // 0.000: Midnight
        // 0.125: Midnight
        // 0.250: Sunrise
        // 0.375: Morning
        // 0.500: Noon
        // 0.625: Afternoon
        // 0.750: Sunset
        // 0.875: Midnight
        // 1.000: Midnight
        this.colors = {
            skyTop: [
                new THREE.Color(0x0c0505), // 0: Midnight (Slightly warmer black)
                new THREE.Color(0x4a0808), // 1: Pre-Sunrise (Lingering Red)
                new THREE.Color(0xff4422), // 2: Sunrise Start (Bright Blood Orange)
                new THREE.Color(0xff2222), // 3: Morning (Saturated Bright Red)
                new THREE.Color(0xff2222), // 4: Noon
                new THREE.Color(0xff2222), // 5: Afternoon
                new THREE.Color(0xff2222), // 6: Sunset Start (Saturated Bright Red)
                new THREE.Color(0xff4422), // 7: Sunset Deep (Bright Blood Orange)
                new THREE.Color(0x0c0505)  // 8: Midnight
            ],
            skyBottom: [
                new THREE.Color(0x050202), // 0: Midnight
                new THREE.Color(0x801010), // 1: Pre-Sunrise
                new THREE.Color(0xff5500), // 2: Sunrise Horizon (Vivid Orange-Red)
                new THREE.Color(0xff6666), // 3: Morning (Warm Red Horizon)
                new THREE.Color(0xff6666), // 4: Noon
                new THREE.Color(0xff6666), // 5: Afternoon
                new THREE.Color(0xff5500), // 6: Sunset Horizon (Vivid Orange-Red)
                new THREE.Color(0x801010), // 7: Post-Sunset
                new THREE.Color(0x050202)  // 8: Midnight
            ],
            sunLight: [
                new THREE.Color(0x221111), // 0: Moonlight (Dark Red)
                new THREE.Color(0x221111), // 1: Pre-Sunrise
                new THREE.Color(0xff6600), // 2: Sunrise (Vibrant Orange)
                new THREE.Color(0xffaaaa), // 3: Morning (Soft Red daylight)
                new THREE.Color(0xffcccc), // 4: Noon (Lightest red daylight)
                new THREE.Color(0xffaaaa), // 5: Afternoon
                new THREE.Color(0xff6600), // 6: Sunset (Vibrant Orange)
                new THREE.Color(0x221111), // 7: Post-Sunset
                new THREE.Color(0x221111)  // 8: Moonlight
            ],
            ambientLight: [
                new THREE.Color(0x1a0808), // 0: Midnight
                new THREE.Color(0x1a0808), // 1: Midnight
                new THREE.Color(0xff3300), // 2: Sunrise (Warm Orange Glow)
                new THREE.Color(0xff8888), // 3: Morning
                new THREE.Color(0xffaaaa), // 4: Noon
                new THREE.Color(0xff8888), // 5: Afternoon
                new THREE.Color(0xff3300), // 6: Sunset (Warm Orange Glow)
                new THREE.Color(0x1a0808), // 7: Midnight
                new THREE.Color(0x1a0808)  // 8: Midnight
            ]
        };
    }

    interpolateColor(array, time) {
        // 9 indices means mapping time (0.0 to 1.0) into 8 steps
        const scaledTime = time * 8.0;
        const index1 = Math.floor(scaledTime);
        const index2 = Math.min(index1 + 1, 8);

        const mixRatio = scaledTime - index1;

        const result = array[index1].clone();
        return result.lerp(array[index2], mixRatio);
    }

    update(playerPosition, delta, inputManager) {
        // Automatic Time Progression
        if (this.cycleEnabled) {
            this.timeOfDay += this.timeSpeed * delta;
        }

        // Manual Time Controls mapping [ ] keys
        if (inputManager) {
            if (inputManager.isKeyDown('BracketRight')) {
                this.timeOfDay += 0.2 * delta; // Fast Forward
            }
            if (inputManager.isKeyDown('BracketLeft')) {
                this.timeOfDay -= 0.2 * delta; // Rewind
            }
        }

        // Wrap around loop securely between 0 and 1
        if (this.timeOfDay > 1.0) this.timeOfDay -= 1.0;
        if (this.timeOfDay < 0.0) this.timeOfDay += 1.0;

        // 1. Arc Mathematics 
        const angle = (this.timeOfDay * Math.PI * 2) - (Math.PI / 2);

        // Push sun much further back behind clouds
        const sunRadius = 2700;
        const sunX = Math.cos(angle) * sunRadius;
        const sunY = Math.sin(angle) * sunRadius;
        const sunZ = 1200; // Tilt the sun orbit so cliffs cast shadows at noon

        // Determine if sun is above the horizon (Daytime)
        const isDaytime = sunY > -100; // Slight grace edge so it doesn't vanish rigidly

        // 2. Lighting Positioning
        if (isDaytime) {
            this.sunLight.position.set(sunX, sunY, sunZ).add(playerPosition);
            this.sunLight.intensity = Math.max(0.1, sunY / sunRadius) * 1.5;
        } else {
            // Moonlight
            this.sunLight.position.set(-sunX, -sunY, -sunZ).add(playerPosition);
            this.sunLight.intensity = Math.max(0.1, -sunY / sunRadius) * 0.3;
        }

        this.sunLight.target.position.copy(playerPosition);
        this.sunLight.target.updateMatrixWorld();

        // 3. Render Sky Meshes
        this.sunMesh.position.set(sunX, sunY, sunZ).add(playerPosition);
        this.sunMesh.lookAt(playerPosition);
        // Horizon Persistence: Sun and Moon stay visible even when below horizon
        this.sunMesh.visible = true;

        this.moonMesh.position.set(-sunX, -sunY, -sunZ).add(playerPosition);
        this.moonMesh.lookAt(playerPosition);
        this.moonMesh.visible = true;

        // Adjust mesh opacity based on height for a smoother fade at the very edge of the world sphere
        const sunHeightFactor = Math.max(0, Math.min(1, (sunY / sunRadius) + 0.5));
        const moonHeightFactor = Math.max(0, Math.min(1, (-sunY / sunRadius) + 0.5));

        this.sunMesh.material.opacity = Math.max(0.2, sunHeightFactor);
        this.moonMesh.material.opacity = Math.max(0.4, moonHeightFactor);

        this.skyMesh.position.copy(playerPosition);
        this.stars.position.copy(playerPosition);

        // Calculate star fade: very faint during the day, full at night
        let globalStarAlpha = 0.02; // Barely visible faint visibility during the day
        if (this.timeOfDay > 0.7) { // Sunset starts around 0.75, fade up a bit earlier
            // Scale opacity from 0.02 to 1.0 between 0.7 and 0.8
            globalStarAlpha = 0.02 + Math.min(0.98, (this.timeOfDay - 0.7) * 9.8);
        } else if (this.timeOfDay < 0.3) { // Sunrise ending around 0.25, fade down later
            // Scale opacity down from 1.0 to 0.02 between 0.2 and 0.3
            globalStarAlpha = 1.0 - Math.min(0.98, Math.max(0, this.timeOfDay - 0.2) * 9.8);
        }

        // Update Shader uniforms
        if (this.starUniforms) {
            this.starUniforms.globalAlpha.value = globalStarAlpha;
            // The engine clock delta isn't passed here to increment a raw timer, 
            // so we'll use performance.now() or timeOfDay * huge_number for a continuous time signal.
            // Using timeOfDay means they twinkle faster if the user fast-forwards time, which is cool!
            this.starUniforms.time.value = performance.now() * 0.001;
        }

        // 4. Color Interpolation Logic (Simplified for glossy material)
        // Since it's a physical material, we only have one base color. 
        // We'll use the skyTop colors for the main hue. The sun's light/specular highlights will naturally
        // create a gradient effect on the glossy sphere.
        this.skyMat.color.copy(this.interpolateColor(this.colors.skyTop, this.timeOfDay));

        this.sunLight.color.copy(this.interpolateColor(this.colors.sunLight, this.timeOfDay));
        this.ambientLight.color.copy(this.interpolateColor(this.colors.ambientLight, this.timeOfDay));

        // Scale ambient intensity with day/night: full strength at noon, dim at night
        const dayFactor = Math.max(0.15, Math.sin(Math.max(0, (this.timeOfDay - 0.2) / 0.6) * Math.PI));
        this.ambientLight.intensity = this.ambientStrength * dayFactor;
    }
}
