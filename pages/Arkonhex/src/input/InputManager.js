export class InputManager {
    constructor(engine) {
        this.engine = engine;

        this.keys = new Set();
        this.buttons = new Set();
        this.movementX = 0;
        this.movementY = 0;
        this.wheelDeltaY = 0;
        this.isLocked = false;
        this.movementIntent = false;

        this.actionBindings = {
            break: ['Button0', 'ArrowLeft'],
            place: ['Button2', 'ArrowRight']
        };
        try {
            const saved = localStorage.getItem('arkonhex_keybindings');
            if (saved) {
                const parsed = JSON.parse(saved);
                this.actionBindings = { ...this.actionBindings, ...parsed };
            }
        } catch(e) {
            console.warn("Failed to load keybindings");
        }

        this.isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
        if (this.isTouchDevice) {
            document.body.classList.add('touch-device');
        }

        this.initEventListeners();
    }

    initEventListeners() {
        document.addEventListener('keydown', (e) => {
            this.keys.add(e.code);

            // Track if user is trying to move while frozen
            if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'].includes(e.code)) {
                this.movementIntent = true;
                if (this.engine.isRunning && !this.engine.chunksReady) {
                    console.warn(`[FreezeTracker] Movement key ${e.code} pressed, but GAME IS FROZEN (chunksReady=false). Player cannot move.`);
                } else if (!this.isLocked) {
                    console.log(`[FreezeTracker] Movement key ${e.code} pressed, but pointer is not locked.`);
                }
            }

            if (e.code === 'KeyE' || e.code === 'Escape') {
                if (this.isLocked) {
                    this.unlockPointer();

                    // Default to settings tab if E is pressed
                    if (e.code === 'KeyE') {
                        setTimeout(() => {
                            const setTab = document.querySelector('[data-tab="settings-tab"]');
                            if (setTab) setTab.click();
                        }, 50);
                    } else if (e.code === 'Escape') {
                        setTimeout(() => {
                            const setTab = document.querySelector('[data-tab="settings-tab"]');
                            if (setTab) setTab.click();
                        }, 50);
                    }
                } else {
                    // We are unlocked, meaning game is paused. Let's unpause if engine is running
                    if (this.engine.isRunning) {
                        this.lockPointer();
                    }
                }
            }
        });
        document.addEventListener('keyup', (e) => {
            this.keys.delete(e.code);
            if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'].includes(e.code)) {
                this.movementIntent = false;
            }
        });

        document.addEventListener('mousedown', (e) => {
            if (this.isLocked) {
                this.buttons.add(e.button);
            }
        });
        document.addEventListener('mouseup', (e) => this.buttons.delete(e.button));

        document.addEventListener('mousemove', (e) => {
            if (this.isLocked) {
                this.movementX += e.movementX;
                this.movementY += e.movementY;
            }
        });

        document.addEventListener('wheel', (e) => {
            if (this.isLocked) {
                this.wheelDeltaY += Math.sign(e.deltaY); // Normalize scroll amount
            }
        });

        // Pointer Lock
        document.addEventListener('pointerlockchange', () => {
            if (!this.isTouchDevice) {
                this.setLocked(!!document.pointerLockElement);
            }
        });

        this.engine.container.addEventListener('click', () => {
            if (!this.isLocked) {
                this.lockPointer();
            }
        });

        // Add pause screen interactor
        const pauseScreen = document.getElementById('pause-screen');
        if (pauseScreen) {
            pauseScreen.addEventListener('click', () => {
                if (!this.isLocked) this.lockPointer();
            });
        }
    }

    lockPointer() {
        if (this.isTouchDevice) {
            this.setLocked(true);
        } else {
            this.engine.container.requestPointerLock();
        }
    }

    unlockPointer() {
        if (this.isTouchDevice) {
            this.setLocked(false);
        } else {
            if (document.pointerLockElement) {
                document.exitPointerLock();
            }
        }
    }

    setLocked(locked) {
        this.isLocked = locked;

        const startScreen = document.getElementById('start-screen');
        const pauseScreen = document.getElementById('pause-screen');

        if (this.isLocked) {
            if (startScreen) startScreen.classList.add('hidden');
            if (pauseScreen) pauseScreen.classList.add('hidden');
            document.getElementById('ui-layer').classList.remove('ui-hidden');
            if (this.isTouchDevice) document.body.classList.add('touch-playing');
        } else {
            // If engine is running, we are pausing. Otherwise we are on start screen.
            if (this.engine.isRunning) {
                if (pauseScreen) pauseScreen.classList.remove('hidden');
            } else {
                if (startScreen) startScreen.classList.remove('hidden');
            }
            document.getElementById('ui-layer').classList.add('ui-hidden');
            if (this.isTouchDevice) document.body.classList.remove('touch-playing');
        }
    }

    isKeyDown(code) {
        return this.keys.has(code);
    }

    consumeKey(code) {
        if (this.keys.has(code)) {
            this.keys.delete(code);
            return true;
        }
        return false;
    }

    isButtonDown(button) {
        return this.buttons.has(button);
    }

    isActionDown(action) {
        const bindings = this.actionBindings[action];
        if (!bindings) return false;
        for (const b of bindings) {
            if (b.startsWith('Button')) {
                const btn = parseInt(b.replace('Button', ''));
                if (this.isButtonDown(btn)) return true;
            } else {
                if (this.isKeyDown(b)) return true;
            }
        }
        return false;
    }

    consumeButton(button) {
        if (this.buttons.has(button)) {
            this.buttons.delete(button);
            return true;
        }
        return false;
    }

    getMouseMovement() {
        const mx = this.movementX;
        const my = this.movementY;
        this.movementX = 0;
        this.movementY = 0;
        return { x: mx, y: my };
    }

    getWheelDelta() {
        const dy = this.wheelDeltaY;
        this.wheelDeltaY = 0;
        return dy;
    }
}
