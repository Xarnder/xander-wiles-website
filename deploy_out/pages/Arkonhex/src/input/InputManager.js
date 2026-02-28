export class InputManager {
    constructor(engine) {
        this.engine = engine;

        this.keys = new Set();
        this.buttons = new Set();
        this.movementX = 0;
        this.movementY = 0;
        this.isLocked = false;

        this.initEventListeners();
    }

    initEventListeners() {
        document.addEventListener('keydown', (e) => {
            this.keys.add(e.code);
            if (e.code === 'KeyE' || e.code === 'Escape') {
                if (this.isLocked) {
                    document.exitPointerLock();

                    // Small hack to default to inventory tab if E is pressed
                    if (e.code === 'KeyE') {
                        setTimeout(() => {
                            const invTab = document.querySelector('[data-tab="inventory-tab"]');
                            if (invTab) invTab.click();
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
                        this.engine.container.requestPointerLock();
                    }
                }
            }
        });
        document.addEventListener('keyup', (e) => this.keys.delete(e.code));

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

        // Pointer Lock
        document.addEventListener('pointerlockchange', () => {
            this.isLocked = !!document.pointerLockElement;

            const startScreen = document.getElementById('start-screen');
            const pauseScreen = document.getElementById('pause-screen');

            if (this.isLocked) {
                if (startScreen) startScreen.classList.add('hidden');
                if (pauseScreen) pauseScreen.classList.add('hidden');
                document.getElementById('ui-layer').classList.remove('ui-hidden');
            } else {
                // If engine is running, we are pausing. Otherwise we are on start screen.
                if (this.engine.isRunning) {
                    if (pauseScreen) pauseScreen.classList.remove('hidden');
                } else {
                    if (startScreen) startScreen.classList.remove('hidden');
                }
                document.getElementById('ui-layer').classList.add('ui-hidden');
            }
        });

        this.engine.container.addEventListener('click', () => {
            if (!this.isLocked) {
                this.engine.container.requestPointerLock();
            }
        });
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
}
