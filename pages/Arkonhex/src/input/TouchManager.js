export class TouchManager {
    constructor(engine, inputManager) {
        this.engine = engine;
        this.inputManager = inputManager;

        // Touch State
        this.joystickActive = false;
        this.joystickTouchId = null;
        this.joystickBaseX = 0;
        this.joystickBaseY = 0;
        this.joystickMoveX = 0;
        this.joystickMoveY = 0;

        this.lookTouchId = null;
        this.lastLookX = 0;
        this.lastLookY = 0;

        this.hotbarTouchId = null;
        this.hotbarStartX = 0;
        this.lastHotbarSwipeTime = 0;

        // Ensure container exists
        this.initDOM();

        // UI Elements
        this.container = document.getElementById('touch-controls');
        this.joystickZone = document.getElementById('tc-joystick-zone');
        this.joystickBase = document.getElementById('tc-joystick-base');
        this.joystickKnob = document.getElementById('tc-joystick-knob');
        this.lookZone = document.getElementById('tc-look-zone');

        this.btnJump = document.getElementById('tc-btn-jump');
        this.btnFly = document.getElementById('tc-btn-fly');
        this.btnMenu = document.getElementById('tc-btn-menu');
        this.btnBreak = document.getElementById('tc-btn-break');
        this.btnPlace = document.getElementById('tc-btn-place');

        this.initEvents();
    }

    initDOM() {
        if (document.getElementById('touch-controls')) return;
        const uiLayer = document.getElementById('ui-layer');
        if (!uiLayer) return;

        const touchHtml = `
            <div id="touch-controls" style="display: none;">
                <div id="tc-joystick-zone">
                    <div id="tc-joystick-base">
                        <div id="tc-joystick-knob"></div>
                    </div>
                </div>
                <div id="tc-look-zone"></div>
                <div id="tc-actions">
                    <button id="tc-btn-jump" class="tc-btn tc-btn-small">⬆️</button>
                    <button id="tc-btn-fly" class="tc-btn tc-btn-small">✈️</button>
                    <button id="tc-btn-break" class="tc-btn tc-btn-large">⛏️</button>
                    <button id="tc-btn-place" class="tc-btn tc-btn-large">🧱</button>
                </div>
                <button id="tc-btn-menu" class="tc-btn tc-btn-small tc-top-right">⏸️</button>
            </div>
        `;
        uiLayer.insertAdjacentHTML('beforeend', touchHtml);
    }

    initEvents() {
        if (!this.container) return;

        this.hotbarContainer = document.querySelector('.hotbar');
        if (this.hotbarContainer) {
            this.hotbarContainer.addEventListener('touchstart', (e) => this.handleHotbarStart(e), { passive: false });
            this.hotbarContainer.addEventListener('touchmove', (e) => this.handleHotbarMove(e), { passive: false });
            this.hotbarContainer.addEventListener('touchend', (e) => this.handleHotbarEnd(e), { passive: false });
            this.hotbarContainer.addEventListener('touchcancel', (e) => this.handleHotbarEnd(e), { passive: false });
        }

        // Joystick Logic
        this.joystickZone.addEventListener('touchstart', (e) => this.handleJoystickStart(e), { passive: false });
        this.joystickZone.addEventListener('touchmove', (e) => this.handleJoystickMove(e), { passive: false });
        this.joystickZone.addEventListener('touchend', (e) => this.handleJoystickEnd(e), { passive: false });
        this.joystickZone.addEventListener('touchcancel', (e) => this.handleJoystickEnd(e), { passive: false });

        // Look Logic
        this.lookZone.addEventListener('touchstart', (e) => this.handleLookStart(e), { passive: false });
        this.lookZone.addEventListener('touchmove', (e) => this.handleLookMove(e), { passive: false });
        this.lookZone.addEventListener('touchend', (e) => this.handleLookEnd(e), { passive: false });
        this.lookZone.addEventListener('touchcancel', (e) => this.handleLookEnd(e), { passive: false });

        // Buttons
        this.bindButton(this.btnJump, 'Space');
        this.bindButton(this.btnFly, 'KeyF');
        
        // Mouse/Action buttons
        this.bindMouseButton(this.btnBreak, 0); // Left click
        this.bindMouseButton(this.btnPlace, 2); // Right click

        // Menu button
        if (this.btnMenu) {
            this.btnMenu.addEventListener('touchstart', (e) => {
                e.preventDefault();
                // We use unlockPointer directly to gracefully pause
                this.inputManager.unlockPointer();
            }, { passive: false });
        }
    }

    bindButton(element, code) {
        if (!element) return;
        element.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.inputManager.keys.add(code);
            element.classList.add('active');
        }, { passive: false });
        
        const removeKey = (e) => {
            e.preventDefault();
            this.inputManager.keys.delete(code);
            element.classList.remove('active');
        };

        element.addEventListener('touchend', removeKey, { passive: false });
        element.addEventListener('touchcancel', removeKey, { passive: false });
    }

    bindMouseButton(element, buttonCode) {
        if (!element) return;
        element.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.inputManager.buttons.add(buttonCode);
            element.classList.add('active');
        }, { passive: false });
        
        const removeBtn = (e) => {
            e.preventDefault();
            this.inputManager.buttons.delete(buttonCode);
            element.classList.remove('active');
        };

        element.addEventListener('touchend', removeBtn, { passive: false });
        element.addEventListener('touchcancel', removeBtn, { passive: false });
    }

    handleJoystickStart(e) {
        e.preventDefault();
        if (this.joystickActive) return;

        const touch = e.changedTouches[0];
        this.joystickTouchId = touch.identifier;
        this.joystickActive = true;

        const rect = this.joystickZone.getBoundingClientRect();
        this.joystickBaseX = touch.clientX - rect.left;
        this.joystickBaseY = touch.clientY - rect.top;

        this.joystickBase.style.left = `${this.joystickBaseX}px`;
        this.joystickBase.style.top = `${this.joystickBaseY}px`;
        this.joystickBase.style.opacity = '1';

        this.updateJoystickKnob(this.joystickBaseX, this.joystickBaseY);
    }

    handleJoystickMove(e) {
        e.preventDefault();
        if (!this.joystickActive) return;

        for (let i = 0; i < e.changedTouches.length; i++) {
            const touch = e.changedTouches[i];
            if (touch.identifier === this.joystickTouchId) {
                const rect = this.joystickZone.getBoundingClientRect();
                this.updateJoystickKnob(touch.clientX - rect.left, touch.clientY - rect.top);
                break;
            }
        }
    }

    handleJoystickEnd(e) {
        e.preventDefault();
        for (let i = 0; i < e.changedTouches.length; i++) {
            const touch = e.changedTouches[i];
            if (touch.identifier === this.joystickTouchId) {
                this.joystickActive = false;
                this.joystickTouchId = null;
                this.joystickBase.style.opacity = '0';
                this.joystickMoveX = 0;
                this.joystickMoveY = 0;
                this.joystickKnob.style.transform = `translate(0px, 0px)`;
                break;
            }
        }
    }

    updateJoystickKnob(x, y) {
        const maxDist = 40; // Max distance knob can travel from base
        let dx = x - this.joystickBaseX;
        let dy = y - this.joystickBaseY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > maxDist) {
            dx = (dx / dist) * maxDist;
            dy = (dy / dist) * maxDist;
        }

        this.joystickKnob.style.transform = `translate(${dx}px, ${dy}px)`;

        this.joystickMoveX = dx / maxDist;
        this.joystickMoveY = dy / maxDist;
    }

    handleLookStart(e) {
        e.preventDefault();
        if (this.lookTouchId !== null) return;

        const touch = e.changedTouches[0];
        this.lookTouchId = touch.identifier;
        this.lastLookX = touch.clientX;
        this.lastLookY = touch.clientY;
    }

    handleLookMove(e) {
        e.preventDefault();
        if (this.lookTouchId === null) return;

        for (let i = 0; i < e.changedTouches.length; i++) {
            const touch = e.changedTouches[i];
            if (touch.identifier === this.lookTouchId) {
                const deltaX = touch.clientX - this.lastLookX;
                const deltaY = touch.clientY - this.lastLookY;

                // Increased sensitivity for touch screens to rotate faster
                this.inputManager.movementX += deltaX * 3.5; 
                this.inputManager.movementY += deltaY * 3.5;

                this.lastLookX = touch.clientX;
                this.lastLookY = touch.clientY;
                break;
            }
        }
    }

    handleLookEnd(e) {
        e.preventDefault();
        for (let i = 0; i < e.changedTouches.length; i++) {
            const touch = e.changedTouches[i];
            if (touch.identifier === this.lookTouchId) {
                this.lookTouchId = null;
                break;
            }
        }
    }

    handleHotbarStart(e) {
        if (this.hotbarTouchId !== null) return;
        const touch = e.changedTouches[0];
        this.hotbarTouchId = touch.identifier;
        this.hotbarStartX = touch.clientX;
    }

    handleHotbarMove(e) {
        e.preventDefault(); // Prevent page scroll on hotbar swipe
        if (this.hotbarTouchId === null) return;

        const now = Date.now();
        if (now - this.lastHotbarSwipeTime < 150) return; // Debounce swipes to prevent rapid spinning

        for (let i = 0; i < e.changedTouches.length; i++) {
            const touch = e.changedTouches[i];
            if (touch.identifier === this.hotbarTouchId) {
                const deltaX = touch.clientX - this.hotbarStartX;
                if (Math.abs(deltaX) > 40) { // Swipe threshold
                    // Set virtual mouse wheel delta in InputManager
                    this.inputManager.wheelDeltaY = deltaX > 0 ? 1 : -1;
                    this.hotbarStartX = touch.clientX; // Reset start so you can keep swiping
                    this.lastHotbarSwipeTime = now;
                }
                break;
            }
        }
    }

    handleHotbarEnd(e) {
        for (let i = 0; i < e.changedTouches.length; i++) {
            const touch = e.changedTouches[i];
            if (touch.identifier === this.hotbarTouchId) {
                this.hotbarTouchId = null;
                break;
            }
        }
    }

    getMovementVector() {
        return {
            x: this.joystickMoveX,
            y: this.joystickMoveY
        };
    }
}
