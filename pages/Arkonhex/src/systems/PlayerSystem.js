import * as THREE from 'three';
import { worldToAxial, axialToWorld, HEX_SIZE, HEX_HEIGHT } from '../utils/HexUtils.js';

export class PlayerSystem {
    constructor(engine, input, physics, chunkSystem) {
        this.engine = engine;
        this.input = input;
        this.physics = physics;
        this.chunkSystem = chunkSystem;

        // Player state
        this.position = new THREE.Vector3(0, 100, 0); // Start high up
        this.velocity = new THREE.Vector3(0, 0, 0);
        this.onGround = false;

        this.walkSpeed = 10;
        this.sprintSpeed = 18;
        this.flySpeed = 30;
        this.jumpForce = 12;
        this.playerHeight = 1.8;
        this.playerRadius = 0.4;

        this.isFlying = false;
        this.lastSpacePress = 0;

        this.baseFov = 75;

        // Setup Audio sounds
        this.placeSound = new Audio('assets/sounds/place.mp3');
        this.placeSound.volume = 0.5;
        this.walkSound = new Audio('assets/sounds/walking.mp3');
        this.walkSound.volume = 0.3;
        this.walkSound.loop = true;
        this.isWalking = false;

        this.breakSound = new Audio('assets/sounds/break.mp3');
        this.breakSound.volume = 0.8;

        this.swimSound = new Audio('assets/sounds/swimming.mp3');
        this.swimSound.volume = 0.4;
        this.swimSound.loop = true;
        this.isSwimming = false;

        this.splashSound = new Audio('assets/sounds/splash.mp3');
        this.splashSound.volume = 0.7;

        // Ambient audio tracks — crossfade between environment states
        this.underwaterAmbient = new Audio('assets/sounds/underwater-ambients.mp3');
        this.underwaterAmbient.loop = true;
        this.underwaterAmbient.volume = 0;

        this.normalAmbient = new Audio('assets/sounds/normal-ambients.mp3');
        this.normalAmbient.loop = true;
        this.normalAmbient.volume = 0;

        this.wasSubmerged = false;
        this.wasFeetInWater = false;
        this.ambientStarted = false;
        this.ambientTime = 0; // Tracks elapsed time for ambient volume modulation
        this.lastSineWasLow = false; // Used to detect sine trough crossing for random seek

        // Setup Camera with expanded draw distance (default was 1000)
        this.camera = new THREE.PerspectiveCamera(this.baseFov, window.innerWidth / window.innerHeight, 0.1, 8000);
        this.pitchObject = new THREE.Object3D();
        this.yawObject = new THREE.Object3D();

        this.yawObject.position.y = this.playerHeight;
        this.yawObject.add(this.pitchObject);
        this.pitchObject.add(this.camera);
        this.engine.scene.add(this.yawObject);

        // Raycasting for block interaction
        this.raycaster = new THREE.Raycaster();
        this.selectedBlock = null;

        // Highlight Mesh
        const geometry = new THREE.CylinderGeometry(HEX_SIZE * 1.05, HEX_SIZE * 1.05, 1.05, 6);
        const material = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.5 });
        this.highlightMesh = new THREE.Mesh(geometry, material);
        this.highlightMesh.visible = false;
        this.engine.scene.add(this.highlightMesh);

        // Let engine know about the camera for rendering
        if (this.engine.systems.find(s => s.renderer)) {
            const rendererSys = this.engine.systems.find(s => s.renderer);
            rendererSys.camera = this.camera;
        }

        this.engine.registerSystem(this);
    }

    update(delta, time) {
        if (!this.input.isLocked) return;

        this.updateMouseLook();
        this.updateMovement(delta);
        this.updateInteraction();

        // Sync visual objects
        this.yawObject.position.copy(this.position);
        this.yawObject.position.y += this.playerHeight;

        // Update loaded chunks based on player position
        const { q, r } = worldToAxial(this.position.x, this.position.z);
        this.chunkSystem.updateLoadedChunks(q, r);
    }

    updateMouseLook() {
        const movement = this.input.getMouseMovement();
        const sensitivity = 0.002;

        this.yawObject.rotation.y -= movement.x * sensitivity;
        this.pitchObject.rotation.x -= movement.y * sensitivity;

        // Clamp pitch
        this.pitchObject.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.pitchObject.rotation.x));
    }

    updateMovement(delta) {
        // Calculate forward and right vectors based on yaw
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.yawObject.quaternion);
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.yawObject.quaternion);

        forward.y = 0; right.y = 0;
        forward.normalize(); right.normalize();

        // Input direction
        let moveDir = new THREE.Vector3(0, 0, 0);
        if (this.input.isKeyDown('KeyW')) moveDir.add(forward);
        if (this.input.isKeyDown('KeyS')) moveDir.sub(forward);
        if (this.input.isKeyDown('KeyA')) moveDir.sub(right);
        if (this.input.isKeyDown('KeyD')) moveDir.add(right);

        if (moveDir.lengthSq() > 0) moveDir.normalize();

        // Toggle Fly Mode with 'F'
        if (this.input.consumeKey('KeyF')) {
            this.isFlying = !this.isFlying;
            if (this.isFlying) this.velocity.y = 0;
        }

        // Jump
        if (this.input.isKeyDown('Space') && this.onGround && !this.isFlying) {
            this.velocity.y = this.jumpForce;
            this.onGround = false;
        }

        const isSprinting = this.input.isKeyDown('ShiftLeft');
        const isHyperSprinting = this.input.isKeyDown('ControlLeft') || this.input.isKeyDown('ControlRight');

        let currentWalk = this.walkSpeed;
        let currentSprint = this.sprintSpeed;
        let currentFly = this.flySpeed;

        if (isHyperSprinting) {
            currentWalk *= 2;
            currentSprint *= 2;
            currentFly *= 2;
        }

        // ---- FOOT-LEVEL water detection (triggers splash only) ----
        // Check if the bottom of the player's hitbox is inside a water block
        const feetBlockId = this.physics.getBlockAt(this.position.x, Math.floor(this.position.y), this.position.z);
        let isFeetInWater = false;
        if (feetBlockId !== 0) {
            const footDef = this.chunkSystem.engine.blockSystem.getBlockDef(feetBlockId);
            if (footDef && footDef.name === 'water') isFeetInWater = true;
        }

        // Splash fires when feet cross the water boundary (entry or exit)
        if (isFeetInWater && !this.wasFeetInWater) {
            this.splashSound.currentTime = 0;
            this.splashSound.play().catch(e => console.warn(e));
        } else if (!isFeetInWater && this.wasFeetInWater) {
            this.splashSound.currentTime = 0;
            this.splashSound.play().catch(e => console.warn(e));
        }
        this.wasFeetInWater = isFeetInWater;

        // ---- CAMERA-LEVEL water detection (tint, swim sound, underwater ambience) ----
        let isSubmerged = false;
        const cameraWorldPos = new THREE.Vector3();
        this.camera.getWorldPosition(cameraWorldPos);
        const camBlockId = this.physics.getBlockAt(cameraWorldPos.x, cameraWorldPos.y, cameraWorldPos.z);
        if (camBlockId !== 0) {
            const camDef = this.chunkSystem.engine.blockSystem.getBlockDef(camBlockId);
            if (camDef && camDef.name === 'water') isSubmerged = true;
        }

        // Ambient audio crossfade — start both on first movement, then crossfade between states
        if (!this.ambientStarted && moveDir.lengthSq() > 0) {
            this.ambientStarted = true;
            this.normalAmbient.play().catch(e => console.warn(e));
            this.normalAmbient.volume = isSubmerged ? 0 : 0.35;
            this.underwaterAmbient.play().catch(e => console.warn(e));
            this.underwaterAmbient.volume = isSubmerged ? 0.45 : 0;
        }

        if (this.ambientStarted) {
            this.ambientTime += delta;

            // Slow sine-wave envelope for normal ambients: period ~20s, range [0 .. 0.4]
            const sineEnvelope = (Math.sin(2 * Math.PI * this.ambientTime / 20.0) + 1) / 2; // 0..1
            const maxNormalVol = 0.4;
            const targetNormalVol = isSubmerged ? 0 : sineEnvelope * maxNormalVol;

            // When the sine hits its quiet trough (envelope < 0.05), randomly seek to a new 
            // position in the file — inaudible because we're near silence.
            const isTrough = sineEnvelope < 0.05;
            if (isTrough && !this.lastSineWasLow) {
                // Seek to a random timestamp within the loaded audio (if duration is known)
                const dur = this.normalAmbient.duration;
                if (dur && isFinite(dur) && dur > 0) {
                    this.normalAmbient.currentTime = Math.random() * dur;
                }
            }
            this.lastSineWasLow = isTrough;

            const targetUnderVol = isSubmerged ? 0.45 : 0;
            // Lerp towards target volume each frame (smooth crossfade over ~1 second)
            this.underwaterAmbient.volume = Math.max(0, Math.min(1,
                this.underwaterAmbient.volume + (targetUnderVol - this.underwaterAmbient.volume) * 0.05));
            this.normalAmbient.volume = Math.max(0, Math.min(1,
                this.normalAmbient.volume + (targetNormalVol - this.normalAmbient.volume) * 0.05));
        }
        if (isSubmerged) {
            currentWalk *= 0.33;
            currentSprint *= 0.33;
            currentFly *= 0.33;

            // Toggle UI overlay
            const overlay = document.getElementById('water-overlay');
            if (overlay) overlay.style.display = 'block';

            // Handle swimming sound
            if (moveDir.lengthSq() > 0 && !this.isSwimming) {
                this.swimSound.play().catch(e => console.warn(e));
                this.isSwimming = true;
            } else if (moveDir.lengthSq() === 0 && this.isSwimming) {
                this.swimSound.pause();
                this.isSwimming = false;
            }
        } else {
            const overlay = document.getElementById('water-overlay');
            if (overlay) overlay.style.display = 'none';

            if (this.isSwimming) {
                this.swimSound.pause();
                this.isSwimming = false;
            }
        }

        const baseSpeed = isSprinting ? currentSprint : currentWalk;
        const speed = this.isFlying ? currentFly : baseSpeed;

        // Dynamic FOV Tweening
        let targetFov = this.baseFov;
        if (isHyperSprinting && moveDir.lengthSq() > 0) {
            targetFov += 15; // Zoom out effect for speed
        }

        if (Math.abs(this.camera.fov - targetFov) > 0.1) {
            this.camera.fov += (targetFov - this.camera.fov) * 10 * delta;
            this.camera.updateProjectionMatrix();
        }

        // Apply horizontal movement with some damping (friction)
        this.velocity.x += (moveDir.x * speed - this.velocity.x) * 10 * delta;
        this.velocity.z += (moveDir.z * speed - this.velocity.z) * 10 * delta;

        // Flying vertical movement
        if (this.isFlying) {
            let vertDir = 0;
            if (this.input.isKeyDown('Space')) vertDir += 1;
            if (this.input.isKeyDown('ShiftLeft')) vertDir -= 1; // Sneak/Descend

            this.velocity.y += (vertDir * speed - this.velocity.y) * 10 * delta;
            this.physics.gravity = 0;
        } else {
            this.physics.gravity = -30;
        }

        // Apply physics
        const result = this.physics.resolveCollision(
            this.position,
            this.velocity,
            this.playerRadius,
            this.playerHeight,
            delta
        );

        this.onGround = result.onGround;

        // Handle Walk Audio
        const horizontalSpeedSq = this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z;
        if (this.onGround && !this.isFlying && horizontalSpeedSq > 2.0) {
            if (!this.isWalking) {
                this.walkSound.play().catch(e => console.warn(e));
                this.isWalking = true;
            }
            // Adjust pitch based on sprint
            this.walkSound.playbackRate = this.input.isKeyDown('ShiftLeft') ? 1.5 : 1.0;
        } else {
            if (this.isWalking) {
                this.walkSound.pause();
                this.walkSound.currentTime = 0;
                this.isWalking = false;
            }
        }

        // Fall off world protection
        if (this.position.y < -50) {
            this.position.y = 50;
            this.velocity.y = 0;
        }
    }

    updateInteraction() {
        // Set raycaster to center of screen
        this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);

        // Gather meshes to test
        const meshes = Array.from(this.chunkSystem.chunks.values())
            .map(c => c.mesh)
            .filter(m => m !== null);

        let closestIntersection = null;

        // Note: The chunks are Groups containing multiple meshes (solid, transparent)
        const intersects = this.raycaster.intersectObjects(meshes, true);

        if (intersects.length > 0 && intersects[0].distance < 8) {
            closestIntersection = intersects[0];
        }

        if (closestIntersection) {
            // Find block coordinate
            const hitPoint = closestIntersection.point;
            // Nudge point slightly inside the block using the face normal
            const inwardPoint = hitPoint.clone().sub(closestIntersection.face.normal.clone().multiplyScalar(0.1));
            const { q, r } = worldToAxial(inwardPoint.x, inwardPoint.z);
            const y = Math.floor(inwardPoint.y);

            this.selectedBlock = { q, r, y, normal: closestIntersection.face.normal };

            // Update highlight mesh
            const hexPos = axialToWorld(q, r);
            this.highlightMesh.position.set(hexPos.x, y + 0.5, hexPos.z);
            this.highlightMesh.visible = true;

            // Handle Clicks
            if (this.input.consumeButton(0)) { // Left Click - Break
                this.breakBlock(q, r, y);
            } else if (this.input.consumeButton(2)) { // Right Click - Place
                const norm = closestIntersection.face.normal;

                // Determine block position to place
                let placeY = y;
                let placeQ = q;
                let placeR = r;

                if (Math.abs(norm.y) > 0.5) {
                    placeY += Math.sign(norm.y);
                } else {
                    // Place horizontally
                    const outward = hitPoint.clone().add(norm.clone().multiplyScalar(0.5));
                    const nextAxial = worldToAxial(outward.x, outward.z);
                    placeQ = nextAxial.q;
                    placeR = nextAxial.r;
                }

                // For now, place dirt (id 2) or whatever is selected in UI
                this.placeBlock(placeQ, placeR, placeY, 2);
            }
        } else {
            this.selectedBlock = null;
            this.highlightMesh.visible = false;
        }
    }

    breakBlock(q, r, y) {
        if (this.setBlockGlobal(q, r, y, 0)) { // Air
            this.breakSound.currentTime = 0;
            this.breakSound.play().catch(e => console.warn(e));
        }
    }

    placeBlock(q, r, y, id) {
        // Don't place inside player
        if (Math.abs(this.position.x - q) < 1 &&
            Math.abs(this.position.z - r) < 1 &&
            y >= Math.floor(this.position.y) &&
            y <= Math.floor(this.position.y + this.playerHeight)) {
            return;
        }

        const success = this.setBlockGlobal(q, r, y, id);

        // Play placement audio on success
        if (success) {
            this.placeSound.currentTime = 0;
            this.placeSound.play().catch(e => console.warn(e));
        }
    }

    setBlockGlobal(GlobalQ, GlobalR, y, id) {
        const CHUNK_SIZE = 16;
        const cq = Math.floor(GlobalQ / CHUNK_SIZE);
        const cr = Math.floor(GlobalR / CHUNK_SIZE);

        const chunk = this.chunkSystem.chunks.get(`${cq},${cr}`);
        if (chunk) {
            const lq = GlobalQ - (cq * CHUNK_SIZE);
            const lr = GlobalR - (cr * CHUNK_SIZE);
            if (chunk.setBlock(lq, lr, y, id)) {
                // Determine if we need to update neighboring chunks due to edge changes
                if (lq === 0) this.dirtyChunk(cq - 1, cr);
                if (lq === CHUNK_SIZE - 1) this.dirtyChunk(cq + 1, cr);
                if (lr === 0) this.dirtyChunk(cq, cr - 1);
                if (lr === CHUNK_SIZE - 1) this.dirtyChunk(cq, cr + 1);
                return true;
            }
        }
        return false;
    }

    dirtyChunk(cq, cr) {
        const chunk = this.chunkSystem.chunks.get(`${cq},${cr}`);
        if (chunk) chunk.isDirty = true;
    }
}
