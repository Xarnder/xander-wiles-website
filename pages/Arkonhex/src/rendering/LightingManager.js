import * as THREE from 'three';

export class LightingManager {
    constructor(engine) {
        this.engine = engine;
        this.scene = engine.scene;

        // 0.0 = Midnight, 0.25 = Sunrise, 0.3 = Noon, 0.75 = Sunset
        this.timeOfDay = 0.5;
        this.timeSpeed = 0.001; // Auto-progression per second
        this.ambientStrength = 3.5; // User-controlled ambient multiplier

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

        // Moon placeholder (Darker gray version of sun)
        const moonGeo = new THREE.CylinderGeometry(120, 120, 4, 6);
        moonGeo.rotateX(Math.PI / 2);
        const moonMat = new THREE.MeshBasicMaterial({ color: 0xcccccc, transparent: true, opacity: 0.8 });
        this.moonMesh = new THREE.Mesh(moonGeo, moonMat);
        this.scene.add(this.moonMesh);

        this.initSkyDome();
        this.initStars();
        this.initColorPalettes();
    }

    initSkyDome() {
        const vertexShader = `
            varying vec3 vWorldPosition;
            void main() {
                vec4 worldPosition = modelMatrix * vec4( position, 1.0 );
                vWorldPosition = worldPosition.xyz;
                gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
            }
        `;

        const fragmentShader = `
            uniform vec3 topColor;
            uniform vec3 bottomColor;
            uniform float offset;
            uniform float exponent;
            varying vec3 vWorldPosition;
            void main() {
                float h = normalize( vWorldPosition ).y;
                gl_FragColor = vec4( mix( bottomColor, topColor, max( pow( max( h , 0.0), exponent ), 0.0 ) ), 1.0 );
            }
        `;

        // Pass uniforms that we will interpolate during loop
        this.skyUniforms = {
            "topColor": { value: new THREE.Color(0x0077ff) },
            "bottomColor": { value: new THREE.Color(0xffffff) },
            "offset": { value: 33 },
            "exponent": { value: 0.6 }
        };

        const skyGeo = new THREE.SphereGeometry(3000, 32, 15);
        const skyMat = new THREE.ShaderMaterial({
            uniforms: this.skyUniforms,
            vertexShader: vertexShader,
            fragmentShader: fragmentShader,
            side: THREE.BackSide,
            depthWrite: false
        });

        this.skyMesh = new THREE.Mesh(skyGeo, skyMat);
        this.scene.add(this.skyMesh);
    }

    initStars() {
        const starGeo = new THREE.BufferGeometry();
        const starPos = [];
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
            }
        }

        starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
        const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 4, transparent: true, opacity: 0.0, depthWrite: false });
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
                new THREE.Color(0x020111), // 0: Midnight
                new THREE.Color(0x020111), // 1: Midnight
                new THREE.Color(0x20124d), // 2: Sunrise
                new THREE.Color(0x1a65d6), // 3: Morning
                new THREE.Color(0x1a65d6), // 4: Noon
                new THREE.Color(0x1a65d6), // 5: Afternoon
                new THREE.Color(0x20124d), // 6: Sunset
                new THREE.Color(0x020111), // 7: Midnight
                new THREE.Color(0x020111)  // 8: Midnight
            ],
            skyBottom: [
                new THREE.Color(0x000022), // 0: Midnight
                new THREE.Color(0x000022), // 1: Midnight
                new THREE.Color(0xffa07a), // 2: Sunrise
                new THREE.Color(0x87CEEB), // 3: Morning
                new THREE.Color(0x87CEEB), // 4: Noon
                new THREE.Color(0x87CEEB), // 5: Afternoon
                new THREE.Color(0xffa07a), // 6: Sunset
                new THREE.Color(0x000022), // 7: Midnight
                new THREE.Color(0x000022)  // 8: Midnight
            ],
            sunLight: [
                new THREE.Color(0x111122), // 0: Moonlight
                new THREE.Color(0x111122), // 1: Moonlight
                new THREE.Color(0xffaa55), // 2: Sunrise
                new THREE.Color(0xffffee), // 3: Morning
                new THREE.Color(0xffffee), // 4: Noon
                new THREE.Color(0xffffee), // 5: Afternoon
                new THREE.Color(0xffaa55), // 6: Sunset
                new THREE.Color(0x111122), // 7: Moonlight
                new THREE.Color(0x111122)  // 8: Moonlight
            ],
            ambientLight: [
                new THREE.Color(0x111122), // 0: Midnight
                new THREE.Color(0x111122), // 1: Midnight
                new THREE.Color(0x664444), // 2: Sunrise
                new THREE.Color(0xbbbbbb), // 3: Morning
                new THREE.Color(0xbbbbbb), // 4: Noon
                new THREE.Color(0xbbbbbb), // 5: Afternoon
                new THREE.Color(0x664444), // 6: Sunset
                new THREE.Color(0x111122), // 7: Midnight
                new THREE.Color(0x111122)  // 8: Midnight
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
        this.timeOfDay += this.timeSpeed * delta;

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
        this.sunMesh.visible = isDaytime;

        this.moonMesh.position.set(-sunX, -sunY, -sunZ).add(playerPosition);
        this.moonMesh.lookAt(playerPosition);
        this.moonMesh.visible = !isDaytime;

        this.skyMesh.position.copy(playerPosition);
        this.stars.position.copy(playerPosition);

        // Calculate a strict star fade that maxes out slightly after sunset
        let starAlpha = 0.0;
        if (this.timeOfDay > 0.76) {
            starAlpha = Math.min(1.0, (this.timeOfDay - 0.76) * 10.0);
        } else if (this.timeOfDay < 0.24) {
            starAlpha = Math.min(1.0, (0.24 - this.timeOfDay) * 10.0);
        }
        this.stars.material.opacity = starAlpha;

        // 4. Color Interpolation Logic
        this.skyUniforms.topColor.value.copy(this.interpolateColor(this.colors.skyTop, this.timeOfDay));
        this.skyUniforms.bottomColor.value.copy(this.interpolateColor(this.colors.skyBottom, this.timeOfDay));

        this.sunLight.color.copy(this.interpolateColor(this.colors.sunLight, this.timeOfDay));
        this.ambientLight.color.copy(this.interpolateColor(this.colors.ambientLight, this.timeOfDay));

        // Scale ambient intensity with day/night: full strength at noon, dim at night
        const dayFactor = Math.max(0.15, Math.sin(Math.max(0, (this.timeOfDay - 0.2) / 0.6) * Math.PI));
        this.ambientLight.intensity = this.ambientStrength * dayFactor;
    }
}
