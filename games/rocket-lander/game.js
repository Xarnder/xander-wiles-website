document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const body = document.body;
    const startScreen = document.getElementById('start-screen');
    const welcomeTitle = document.getElementById('welcome-title');
    const gameScreen = document.getElementById('game-screen');
    const nameInput = document.getElementById('name-input');
    const startButton = document.getElementById('start-button');
    const highScoreDisplay = document.getElementById('high-score-display');
    const canvas = document.getElementById('gameview');
    const ctx = canvas.getContext('2d');
    const statsDisplay = document.getElementById('stats-display');
    const messageArea = document.getElementById('message-area');
    const messageTitle = document.getElementById('message-title');
    const messageText = document.getElementById('message-text');
    const playAgainButton = document.getElementById('play-again-button');
    const menuEndButton = document.getElementById('menu-end-button');
    const padSizeInfo = document.getElementById('pad-size-info');
    const outOfFuelMessage = document.getElementById('out-of-fuel-message');
    const outOfFuelP1 = document.getElementById('out-of-fuel-p1');
    const outOfFuelP2 = document.getElementById('out-of-fuel-p2');
    const messageStats = document.getElementById('message-stats');
    const restartHint = document.getElementById('restart-hint');

    // Multiplayer UI Elements
    const playerModeToggle = document.getElementById('player-mode-toggle');
    const player2InputContainer = document.getElementById('player2-input-container');
    const nameInputP2 = document.getElementById('name-input-p2');
    const labelSingle = document.getElementById('label-single');
    const labelMulti = document.getElementById('label-multi');
    const instructionP1 = document.getElementById('instruction-p1');
    const instructionP2 = document.getElementById('instruction-p2');
    const helpButton = document.getElementById('help-button');
    const helpPanel = document.getElementById('help-panel');
    const helpClose = document.getElementById('help-close');
    const hardModeToggle = document.getElementById('hard-mode-toggle');
    const fuelInput = document.getElementById('fuel-input');
    const muteButton = document.getElementById('mute-button');
    const muteButtonStart = document.getElementById('mute-button-start');
    const pauseButton = document.getElementById('pause-button');
    const menuButton = document.getElementById('menu-button');
    const pauseOverlay = document.getElementById('pause-overlay');
    const resumeButton = document.getElementById('resume-button');
    const quitButton = document.getElementById('quit-button');
    const confirmModal = document.getElementById('confirm-modal');
    const confirmOk = document.getElementById('confirm-ok');
    const confirmCancel = document.getElementById('confirm-cancel');
    const confirmTitle = document.getElementById('confirm-title');
    const confirmText = document.getElementById('confirm-text');
    let confirmResolver = null;

    // --- Touch Control Elements ---
    const touchControlsContainer = document.getElementById('touch-controls-container');
    const touchControlsSingle = document.getElementById('touch-controls-single');
    const touchControlsMulti = document.getElementById('touch-controls-multi');
    const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

    // --- Sound Effects & Music ---
    const thrustSound = new Audio('audio/rocket.mp3');
    thrustSound.loop = true;
    thrustSound.volume = 0.5;
    const gameMusic = new Audio('audio/rocket_game_music.mp3');
    gameMusic.loop = true;
    gameMusic.volume = 0.3;
    const successSound = new Audio('audio/landed.mp3');
    successSound.volume = 0.7;
    const crashSound = new Audio('audio/boom.mp3');
    crashSound.volume = 0.7;
    const allAudio = [thrustSound, gameMusic, successSound, crashSound];

    function playAudio(audio) {
        if (isMuted) return;
        const playPromise = audio.play();
        if (playPromise && typeof playPromise.catch === 'function') {
            playPromise.catch(() => {});
        }
    }

    // --- Game Configuration ---
    const settings = {
        initialHeight: 100, initialCoal: 100, 
        maxVSpeedForSafeLanding: 1, 
        maxHSpeedForSafeLanding: 0.6,
        GRAVITY_PULL: 0.03, THRUST_POWER: 0.1, FUEL_CONSUMPTION_RATE: 0.25,
        THRUST_POWER_X: 0.05,
        FUEL_CONSUMPTION_RATE_X: 0.05,
        MAX_PAD_WIDTH_PERCENT: 0.20, 
    };
    const HIGH_SCORE_KEY = 'rocketLanderHighScore';
    const FUEL_KEY = 'rocketLanderInitialFuel';
    const NAME_KEY = 'rocketLanderName';
    const NAME_P2_KEY = 'rocketLanderNameP2';
    const MUTE_KEY = 'rocketLanderMuted';
    const HARD_MODE_KEY = 'rocketLanderHardMode';
    const MODE_KEY = 'rocketLanderMultiplayer';

    // Restore saved preferences
    const savedFuel = localStorage.getItem(FUEL_KEY);
    if (savedFuel) fuelInput.value = savedFuel;
    const savedName = localStorage.getItem(NAME_KEY);
    if (savedName) nameInput.value = savedName;
    const savedNameP2 = localStorage.getItem(NAME_P2_KEY);
    if (savedNameP2) nameInputP2.value = savedNameP2;
    if (localStorage.getItem(HARD_MODE_KEY) !== null) {
        hardModeToggle.checked = localStorage.getItem(HARD_MODE_KEY) === '1';
    }
    if (localStorage.getItem(MODE_KEY) === '1') {
        playerModeToggle.checked = true;
    }

    let isMuted = localStorage.getItem(MUTE_KEY) === '1';
    let isPaused = false;
    let pausedByVisibility = false;

    // --- Starfield ---
    let stars = [];
    function generateStars() {
        stars = [];
        const starCount = (canvas.width / 8);
        for (let i = 0; i < starCount; i++) {
            stars.push({
                x: Math.random() * canvas.width,
                y: Math.random() * (canvas.height - 10),
                radius: Math.random() * 1.5,
                alpha: Math.random() * 0.5 + 0.2,
                phase: Math.random() * Math.PI * 2
            });
        }
    }

    // --- Game State ---
    let state = {};
    let keysPressed = {};
    let gameLoopId = null;
    let lastTime = 0;
    let restartTimer = null;
    let spaceRestartEnabled = false;
    let isMultiplayer = false;

    // --- High Score Logic ---
    function getHighScore() { return parseInt(localStorage.getItem(HIGH_SCORE_KEY) || '0', 10); }
    function updateHighScore(score) {
        const currentHighScore = getHighScore();
        if (score > currentHighScore) {
            localStorage.setItem(HIGH_SCORE_KEY, score);
            return true;
        }
        return false;
    }
    function displayHighScore() { highScoreDisplay.textContent = `High Score: ${getHighScore().toLocaleString()}`; }

    // --- Input Listeners ---
    window.addEventListener('keydown', (e) => {
        const tag = (e.target && e.target.tagName) || '';
        const typing = tag === 'INPUT' || tag === 'TEXTAREA';

        if (e.key === 'Escape') {
            e.preventDefault();
            if (confirmModal && !confirmModal.hidden) {
                closeConfirm(false);
                return;
            }
            if (messageArea.classList.contains('visible')) return;
            if (helpPanel && !helpPanel.hidden) { setHelpOpen(false); return; }
            if (body.classList.contains('game-active') && state.players && !state.isGameOver) {
                togglePause();
            }
            return;
        }

        if (messageArea.classList.contains('visible')) {
            if (e.key === 'Enter') { e.preventDefault(); restartGame(); return; }
            if ((e.key === ' ' || e.code === 'Space') && spaceRestartEnabled) { e.preventDefault(); restartGame(); return; }
            return;
        }

        if (typing) return;

        if (!body.classList.contains('game-active') && e.key === 'Enter') {
            e.preventDefault();
            startGame();
            return;
        }

        if (isPaused) return;
        if (state.players && !state.isGameOver) {
            keysPressed[e.key] = true;
            if (e.key === ' ' || e.code === 'Space') e.preventDefault();
        }
    });
    window.addEventListener('keyup', (e) => { keysPressed[e.key] = false; });

    function applyMuteState() {
        allAudio.forEach(a => { a.muted = isMuted; });
        const label = isMuted ? 'Sound Off' : 'Sound On';
        const icon = isMuted ? '🔇' : '♪';
        if (muteButtonStart) {
            muteButtonStart.textContent = label;
            muteButtonStart.setAttribute('aria-pressed', isMuted ? 'true' : 'false');
            muteButtonStart.classList.toggle('is-muted', isMuted);
        }
        if (muteButton) {
            muteButton.textContent = icon;
            muteButton.setAttribute('aria-pressed', isMuted ? 'true' : 'false');
            muteButton.classList.toggle('is-muted', isMuted);
            muteButton.setAttribute('aria-label', isMuted ? 'Unmute' : 'Mute');
        }
        localStorage.setItem(MUTE_KEY, isMuted ? '1' : '0');
        if (isMuted) {
            thrustSound.pause();
        }
    }

    function toggleMute() {
        isMuted = !isMuted;
        applyMuteState();
    }

    function setPaused(paused) {
        if (!body.classList.contains('game-active') || !state.players || state.isGameOver) return;
        if (messageArea.classList.contains('visible')) return;
        isPaused = paused;
        pauseOverlay.hidden = !paused;
        if (paused) {
            thrustSound.pause();
            gameMusic.pause();
            clearThrustTouches();
            keysPressed = {};
            if (isTouchDevice) touchControlsContainer.style.display = 'none';
            setHelpOpen(false);
        } else {
            lastTime = 0;
            if (!isMuted) playAudio(gameMusic);
            if (isTouchDevice) touchControlsContainer.style.display = 'flex';
        }
        pauseButton.setAttribute('aria-label', paused ? 'Resume' : 'Pause');
        pauseButton.textContent = paused ? '▶' : '❚❚';
    }

    function togglePause() {
        setPaused(!isPaused);
    }

    function quitToMenu() {
        isPaused = false;
        pauseOverlay.hidden = true;
        if (confirmModal) confirmModal.hidden = true;
        confirmResolver = null;
        pausedByVisibility = false;
        clearTimeout(restartTimer);
        spaceRestartEnabled = false;
        showStartScreen();
    }

    function showConfirmModal({ title, text, confirmLabel = 'Go Home', cancelLabel = 'Keep Flying' } = {}) {
        return new Promise((resolve) => {
            if (confirmResolver) confirmResolver(false);
            confirmResolver = resolve;
            if (confirmTitle) confirmTitle.textContent = title || 'Return to Menu?';
            if (confirmText) confirmText.textContent = text || 'Current mission will be abandoned.';
            if (confirmOk) confirmOk.textContent = confirmLabel;
            if (confirmCancel) confirmCancel.textContent = cancelLabel;
            thrustSound.pause();
            gameMusic.pause();
            keysPressed = {};
            clearThrustTouches();
            lastTime = 0;
            confirmModal.hidden = false;
            confirmOk.focus();
        });
    }

    function closeConfirm(result) {
        if (confirmModal) confirmModal.hidden = true;
        if (!result && body.classList.contains('game-active') && !isPaused && !isMuted && state.players && !state.isGameOver && !(helpPanel && !helpPanel.hidden)) {
            lastTime = 0;
            playAudio(gameMusic);
        }
        if (confirmResolver) {
            const resolve = confirmResolver;
            confirmResolver = null;
            resolve(!!result);
        }
    }

    async function requestQuitToMenu() {
        if (messageArea.classList.contains('visible')) {
            quitToMenu();
            return;
        }
        const confirmed = await showConfirmModal({
            title: 'Return to Menu?',
            text: 'Current mission will be abandoned.',
            confirmLabel: 'Go Home',
            cancelLabel: 'Keep Flying'
        });
        if (confirmed) quitToMenu();
    }
    
    // Touch Controls Logic
    function mapTouchToKey(element, key) {
        if (!element) return;
        element.addEventListener('touchstart', (e) => {
            e.preventDefault();
            e.stopPropagation();
            keysPressed[key] = true;
        }, { passive: false });

        element.addEventListener('touchend', (e) => {
            e.preventDefault();
            e.stopPropagation();
            keysPressed[key] = false;
        });

        element.addEventListener('touchcancel', (e) => {
            e.preventDefault();
            e.stopPropagation();
            keysPressed[key] = false;
        });
    }

    const touchThrustZone = document.getElementById('touch-thrust-zone');
    const activeThrustTouches = new Set();
    const thrustTouchSides = new Map();

    function setThrustFromTouches() {
        if (isMultiplayer) {
            let p1 = false;
            let p2 = false;
            for (const id of activeThrustTouches) {
                const side = thrustTouchSides.get(id);
                if (side === 'p1') p1 = true;
                if (side === 'p2') p2 = true;
            }
            keysPressed['w'] = p1;
            keysPressed['ArrowUp'] = p2;
        } else {
            const thrusting = activeThrustTouches.size > 0;
            keysPressed['w'] = thrusting;
            keysPressed['ArrowUp'] = thrusting;
            keysPressed[' '] = thrusting;
        }
    }

    function clearThrustTouches() {
        activeThrustTouches.clear();
        thrustTouchSides.clear();
        keysPressed['w'] = false;
        keysPressed['ArrowUp'] = false;
        keysPressed[' '] = false;
    }

    if (isTouchDevice) {
        mapTouchToKey(document.getElementById('touch-sp-left'), 'a');
        mapTouchToKey(document.getElementById('touch-sp-right'), 'd');
        mapTouchToKey(document.getElementById('touch-p1-left'), 'a');
        mapTouchToKey(document.getElementById('touch-p1-right'), 'd');
        mapTouchToKey(document.getElementById('touch-p2-left'), 'ArrowLeft');
        mapTouchToKey(document.getElementById('touch-p2-right'), 'ArrowRight');

        const onThrustStart = (e) => {
            if (messageArea.classList.contains('visible') || (helpPanel && !helpPanel.hidden)) return;
            e.preventDefault();
            const rect = touchThrustZone.getBoundingClientRect();
            for (const touch of e.changedTouches) {
                activeThrustTouches.add(touch.identifier);
                if (isMultiplayer) {
                    const localX = touch.clientX - rect.left;
                    thrustTouchSides.set(touch.identifier, localX < rect.width / 2 ? 'p1' : 'p2');
                }
            }
            setThrustFromTouches();
        };

        const onThrustEnd = (e) => {
            for (const touch of e.changedTouches) {
                activeThrustTouches.delete(touch.identifier);
                thrustTouchSides.delete(touch.identifier);
            }
            setThrustFromTouches();
        };

        touchThrustZone.addEventListener('touchstart', onThrustStart, { passive: false });
        touchThrustZone.addEventListener('touchend', onThrustEnd, { passive: false });
        touchThrustZone.addEventListener('touchcancel', onThrustEnd, { passive: false });
    }

    // --- UI Logic ---
    function setHelpOpen(open) {
        if (!helpPanel || !helpButton) return;
        helpPanel.hidden = !open;
        helpButton.setAttribute('aria-expanded', open ? 'true' : 'false');
        helpButton.setAttribute('aria-label', open ? 'Hide controls' : 'Show controls');
        if (open) {
            thrustSound.pause();
            gameMusic.pause();
            keysPressed = {};
            clearThrustTouches();
            lastTime = 0;
        } else if (body.classList.contains('game-active') && !isPaused && !isMuted && state.players && !state.isGameOver) {
            lastTime = 0;
            playAudio(gameMusic);
        }
    }

    function isGameplayFrozen() {
        return isPaused
            || (helpPanel && !helpPanel.hidden)
            || messageArea.classList.contains('visible')
            || (confirmModal && !confirmModal.hidden);
    }

    function syncPlayerModeUI() {
        isMultiplayer = playerModeToggle.checked;
        if (isMultiplayer) {
            welcomeTitle.textContent = 'Welcome, Captains!';
            player2InputContainer.style.display = 'block';
            labelMulti.classList.add('active');
            labelSingle.classList.remove('active');
            highScoreDisplay.style.display = 'none';
        } else {
            welcomeTitle.textContent = 'Welcome, Captain!';
            player2InputContainer.style.display = 'none';
            labelMulti.classList.remove('active');
            labelSingle.classList.add('active');
            highScoreDisplay.style.display = 'block';
        }
        localStorage.setItem(MODE_KEY, isMultiplayer ? '1' : '0');
    }

    function clampFuelInput() {
        let v = parseFloat(fuelInput.value);
        if (Number.isNaN(v)) v = settings.initialCoal;
        v = Math.max(10, Math.min(1000, Math.round(v)));
        fuelInput.value = v;
        localStorage.setItem(FUEL_KEY, v);
        return v;
    }

    function showStartScreen() {
        body.classList.remove('game-active');
        gameScreen.style.display = 'none';
        startScreen.style.display = 'block';
        messageArea.classList.remove('visible', 'success', 'crash');
        isPaused = false;
        pauseOverlay.hidden = true;
        if (confirmModal) confirmModal.hidden = true;
        confirmResolver = null;
        setHelpOpen(false);
        if (isTouchDevice) {
            touchControlsContainer.style.display = 'none';
            clearThrustTouches();
        }
        if (gameLoopId) { cancelAnimationFrame(gameLoopId); gameLoopId = null; }
        gameMusic.pause();
        gameMusic.currentTime = 0;
        thrustSound.pause();
        displayHighScore();
        syncPlayerModeUI();
    }
    
    function restartGame() { startGame(); }

    // --- Game Logic ---
    function resetGameState() {
        const rocketH = canvas.height * 0.12;
        const rocketBodyW = rocketH * (22 / 65), rocketFinW = rocketH * (12 / 65), rocketWidth = rocketBodyW + rocketFinW * 2;
        
        const minPadWidth = rocketWidth * (isMultiplayer ? 3 : 2);
        const maxPadWidth = canvas.width * settings.MAX_PAD_WIDTH_PERCENT * (isMultiplayer ? 1.5 : 1);
        const padWidth = minPadWidth + Math.random() * Math.max(0, (maxPadWidth - minPadWidth));
        const padX = Math.random() * (canvas.width - padWidth);

        const initialFuel = clampFuelInput();
        localStorage.setItem(NAME_KEY, nameInput.value.trim());
        localStorage.setItem(NAME_P2_KEY, nameInputP2.value.trim());
        localStorage.setItem(HARD_MODE_KEY, hardModeToggle.checked ? '1' : '0');

        state = { 
            landingPadX: padX, 
            landingPadWidth: padWidth, 
            isGameOver: false, 
            winner: null, 
            winnerDeclared: false, 
            planets: [], 
            players: [],
            isHardMode: hardModeToggle.checked,
            ufos: [],
            nextUfoSpawn: Date.now() + 3000
        };

        settings.initialCoal = initialFuel;

        const createPlayer = (name, startX, controls, finColor, noseColor) => ({
            name: name || "Anonymous", height: settings.initialHeight, speed: 0, coal: initialFuel,
            x: startX, speedX: 0, isThrusting: false, isThrustingLeft: false, isThrustingRight: false,
            isLanded: false, isCrashed: false, fuelWarningShown: false,
            isExploding: false, explosionRadius: 0, finalExplosionRadius: 0, explosionAlpha: 1,
            isLanding: false, landingShockwaveWidth: 0, finalShockwaveWidth: 0,
            controls, finColor, noseColor
        });

        if (isMultiplayer) {
            const p1Name = nameInput.value || "Player 1";
            const p2Name = nameInputP2.value || "Player 2";
            state.players.push(createPlayer(p1Name, canvas.width / 3, { up: ['w'], left: ['a'], right: ['d'] }, '#ef4444', '#ef4444'));
            state.players.push(createPlayer(p2Name, canvas.width * 2 / 3, { up: ['ArrowUp'], left: ['ArrowLeft'], right: ['ArrowRight'] }, '#3b82f6', '#3b82f6'));
        } else {
            state.players.push(createPlayer(nameInput.value || "Anonymous", canvas.width / 2, { up: ['w', 'ArrowUp', ' '], left: ['a', 'ArrowLeft'], right: ['d', 'ArrowRight'] }, '#ef4444', '#ef4444'));
        }

        let numPlanets;
        let planetRadiusMin, planetRadiusRange;

        if (isTouchDevice) {
            numPlanets = 1;
            planetRadiusMin = 30;
            planetRadiusRange = 40;
        } else {
            numPlanets = Math.floor(Math.random() * 2) + 2;
            planetRadiusMin = 70;
            planetRadiusRange = 80;
        }

        for (let i = 0; i < numPlanets; i++) {
            let candidatePlanet, isOverlapping, attempts = 0;
            do {
                isOverlapping = false;
                candidatePlanet = { 
                    radius: (Math.random() * planetRadiusRange) + planetRadiusMin, 
                    x: Math.random() * canvas.width, 
                    y: Math.random() * (canvas.height * 0.4) + 20, 
                    color1: `hsl(${Math.random() * 360}, 60%, 70%)`, 
                    color2: `hsl(${Math.random() * 360}, 50%, 50%)`, 
                    hasRings: Math.random() > 0.6 
                };
                for (const existingPlanet of state.planets) {
                    const distance = Math.hypot(candidatePlanet.x - existingPlanet.x, candidatePlanet.y - existingPlanet.y);
                    if (distance < candidatePlanet.radius + existingPlanet.radius + 50) { isOverlapping = true; break; }
                } attempts++;
            } while (isOverlapping && attempts < 10);
            state.planets.push(candidatePlanet);
        }

        keysPressed = {};
        thrustSound.pause();
        thrustSound.currentTime = 0;
    }

    function startGame() {
        isMultiplayer = playerModeToggle.checked;
        clearTimeout(restartTimer);
        spaceRestartEnabled = false;
        isPaused = false;
        pausedByVisibility = false;
        pauseOverlay.hidden = true;
        pauseButton.textContent = '❚❚';
        pauseButton.setAttribute('aria-label', 'Pause');
        
        body.classList.add('game-active');
        startScreen.style.display = 'none';
        messageArea.classList.remove('visible', 'success', 'crash');
        messageStats.classList.remove('visible');
        outOfFuelMessage.classList.remove('visible');
        outOfFuelP1.classList.remove('visible');
        outOfFuelP2.classList.remove('visible');
        gameScreen.style.display = 'flex';

        if (isTouchDevice) {
            clearThrustTouches();
            touchControlsContainer.style.display = 'flex';
            if (isMultiplayer) {
                touchControlsSingle.style.display = 'none';
                touchControlsMulti.style.display = 'flex';
            } else {
                touchControlsSingle.style.display = 'flex';
                touchControlsMulti.style.display = 'none';
            }
        }

        setHelpOpen(false);
        localStorage.setItem(MODE_KEY, isMultiplayer ? '1' : '0');
        localStorage.setItem(HARD_MODE_KEY, hardModeToggle.checked ? '1' : '0');

        const hSpeedRule = `Max H-Speed: <strong>${settings.maxHSpeedForSafeLanding} m/s</strong>.`;
        const vSpeedRule = `Max V-Speed: <strong>${settings.maxVSpeedForSafeLanding} m/s</strong>.`;
        if (isMultiplayer) {
            const p1Name = nameInput.value || 'Player 1';
            const p2Name = nameInputP2.value || 'Player 2';
            instructionP1.innerHTML = `<strong>${p1Name} (P1):</strong> <strong>W</strong> thrust, <strong>A</strong> / <strong>D</strong> strafe.`;
            instructionP2.innerHTML = `<strong>${p2Name} (P2):</strong> <strong>↑</strong> thrust, <strong>←</strong> / <strong>→</strong> strafe.<br>Land with ${vSpeedRule} ${hSpeedRule}`;
        } else if (isTouchDevice) {
            instructionP1.innerHTML = 'Hold anywhere on the <strong>right ⅔</strong> of the screen to thrust. Use the arrow buttons on the left to strafe.';
            instructionP2.innerHTML = `Land on the pad. ${vSpeedRule} ${hSpeedRule}`;
        } else {
            instructionP1.innerHTML = 'Main thrust: <strong>W</strong> / <strong>↑</strong> / <strong>Space</strong>. Strafe: <strong>A</strong> / <strong>D</strong> or <strong>←</strong> / <strong>→</strong>.';
            instructionP2.innerHTML = `Land on the pad. ${vSpeedRule} ${hSpeedRule}<br><strong>Esc</strong> pauses.`;
        }
        padSizeInfo.innerHTML = 'Landing Pad Size: <strong>—</strong>';

        if (gameLoopId) cancelAnimationFrame(gameLoopId);

        // Double rAF: wait until flex layout has applied final play-area size
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                resizeCanvas();
                resetGameState();
                padSizeInfo.innerHTML = `Landing Pad Size: <strong>${state.landingPadWidth.toFixed(0)}m</strong>`;
                lastTime = 0;
                gameLoopId = requestAnimationFrame(gameLoop);
                gameMusic.currentTime = 0;
                playAudio(gameMusic);
            });
        });
    }

    function handlePlayerLanding(player) {
        if (player.isLanded || player.isCrashed) return; 
        if (state.winnerDeclared) { if (!player.isLanded) crashPlayer(player); return; }

        const rocketH = canvas.height * 0.12, bodyW = rocketH * (22 / 65), finW = rocketH * (12 / 65);
        const rocketLeftEdge = player.x - (bodyW / 2 + finW), rocketRightEdge = player.x + (bodyW / 2 + finW);
        const landedOnPad = rocketLeftEdge >= state.landingPadX && rocketRightEdge <= state.landingPadX + state.landingPadWidth;
        const isSafeVSpeed = player.speed <= settings.maxVSpeedForSafeLanding;
        const isSafeHSpeed = Math.abs(player.speedX) <= settings.maxHSpeedForSafeLanding;
        const isSuccess = landedOnPad && isSafeVSpeed && isSafeHSpeed;

        if (isMultiplayer) {
            if (isSuccess) {
                state.winnerDeclared = true;
                state.winner = player;
                player.isLanded = true;
                successSound.currentTime = 0; playAudio(successSound);
                player.isLanding = true;
                player.finalShockwaveWidth = canvas.width * 0.8;
                state.players.forEach(p => { if (p !== player) p.coal = 0; });
                showEndGameMessage(`Winner: ${player.name}!`, `${player.name} landed safely! The other pilot is now in a freefall...`, 'success', player);
            } else {
                crashPlayer(player, canvas.height - 10);
                if (state.players.every(p => p.isCrashed)) {
                    state.winnerDeclared = true;
                    thrustSound.pause();
                    showEndGameMessage(`It's a Draw!`, `Both pilots have crashed their landers. Mission failed.`, 'crash', player);
                }
            }
        } else { // Single Player
            state.isGameOver = true;
            if (isSuccess) {
                successSound.currentTime = 0; playAudio(successSound);
                player.isLanded = true; player.isLanding = true;
                player.finalShockwaveWidth = canvas.width * 0.8;
                const score = Math.round(player.coal * 10 + (settings.maxVSpeedForSafeLanding - player.speed) * 500);
                const isNewHighScore = updateHighScore(score);
                displayHighScore();
                let scoreMessage = `Your Score: ${score.toLocaleString()}. You landed with ${player.coal.toFixed(0)}kg of fuel.`;
                if (isNewHighScore) scoreMessage += " A new high score!";
                showEndGameMessage(`Congratulations, ${player.name}!`, scoreMessage, 'success', player);
            } else {
                crashPlayer(player, canvas.height - 10);
                let crashReason = !landedOnPad ? "You missed the landing pad."
                                : !isSafeVSpeed ? `You crashed at ${player.speed.toFixed(1)} m/s vertically.`
                                : !isSafeHSpeed ? `You skidded across the pad at ${player.speedX.toFixed(1)} m/s horizontally.`
                                : "You have crashed.";
                showEndGameMessage(`Better Luck Next Time, ${player.name}!`, `${crashReason} The lander and its ${player.coal.toFixed(0)}kg of fuel are now a crater.`, 'crash', player);
            }
        }
    }

    function crashPlayer(player, y) {
        if (player.isCrashed || player.isLanded) return;
        crashSound.currentTime = 0; playAudio(crashSound);
        player.isCrashed = true;
        player.isExploding = true;
        player.explosionAlpha = 1;
        player.explosionY = y !== undefined ? y : (canvas.height - 10);
        player.finalExplosionRadius = canvas.height * 0.1 + player.coal * 1.5 + player.speed * 2;
    }

    function showEndGameMessage(title, text, type, player) {
        if (isTouchDevice) {
            touchControlsContainer.style.display = 'none';
            clearThrustTouches();
        }
        isPaused = false;
        pauseOverlay.hidden = true;
        thrustSound.pause();
        messageArea.classList.remove('success', 'crash');
        messageArea.classList.add(type);
        messageTitle.textContent = title;
        messageText.textContent = text;

        if (player) {
            const vSafe = player.speed <= settings.maxVSpeedForSafeLanding;
            const hSafe = Math.abs(player.speedX) <= settings.maxHSpeedForSafeLanding;
            const highScore = getHighScore();
            messageStats.innerHTML = `
                <p class="message-stats-label">${player.name}'s Final Stats:</p>
                <div><span>Final V-Speed:</span> <strong class="${vSafe ? 'stat-ok' : 'stat-danger'}">${player.speed.toFixed(2)} m/s</strong> <span>(max ${settings.maxVSpeedForSafeLanding})</span></div>
                <div><span>Final H-Speed:</span> <strong class="${hSafe ? 'stat-ok' : 'stat-danger'}">${player.speedX.toFixed(2)} m/s</strong> <span>(max ±${settings.maxHSpeedForSafeLanding})</span></div>
                <div><span>Fuel Remaining:</span> <strong>${Math.max(0, player.coal).toFixed(0)} kg</strong></div>
                ${!isMultiplayer ? `<div><span>High Score:</span> <strong>${highScore.toLocaleString()}</strong></div>` : ''}
            `;
            messageStats.classList.add('visible');
        } else {
            messageStats.classList.remove('visible');
        }

        if (restartHint) {
            restartHint.innerHTML = isTouchDevice
                ? 'Tap <strong>Play Again</strong> for another try'
                : 'Press <strong>Enter</strong> to play again';
        }

        spaceRestartEnabled = true;
        clearTimeout(restartTimer);
        setTimeout(() => { messageArea.classList.add('visible'); }, isMultiplayer ? 2000 : 400);
    }

    function gameLoop(timestamp) {
        if (!state.players) return;
        
        if (!lastTime) lastTime = timestamp;
        const dt = Math.min((timestamp - lastTime) / 16.666, 4);
        lastTime = timestamp;

        const frozen = isGameplayFrozen();
        
        state.players.forEach(player => {
            if (frozen) return;
            if (player.isExploding && player.explosionAlpha > 0) {
                if (player.explosionRadius < player.finalExplosionRadius) player.explosionRadius += 2 * dt;
                else player.explosionAlpha -= 0.02 * dt;
            }
            if (player.isLanding && player.landingShockwaveWidth < player.finalShockwaveWidth) player.landingShockwaveWidth += 25 * dt;
        });

        if (!state.isGameOver && !frozen) {
            let anyThrusting = false;
            state.players.forEach((player, index) => {
                if (player.isLanded || player.isCrashed) return;

                player.isThrusting = player.controls.up.some(k => keysPressed[k]) && player.coal > 0;
                player.isThrustingLeft = player.controls.left.some(k => keysPressed[k]) && player.coal > 0;
                player.isThrustingRight = player.controls.right.some(k => keysPressed[k]) && player.coal > 0;

                if (player.isThrusting || player.isThrustingLeft || player.isThrustingRight) anyThrusting = true;
                
                if (player.coal <= 0 && !player.fuelWarningShown) {
                    player.fuelWarningShown = true;
                    if (isMultiplayer) {
                        if (index === 0) outOfFuelP1.classList.add('visible');
                        else outOfFuelP2.classList.add('visible');
                    } else {
                        outOfFuelMessage.classList.add('visible');
                    }
                }

                if (player.isThrusting) { player.speed -= settings.THRUST_POWER * dt; player.coal -= settings.FUEL_CONSUMPTION_RATE * dt; }
                player.speed += settings.GRAVITY_PULL * dt;
                player.height -= player.speed * dt;
                if (player.isThrustingLeft) { player.speedX -= settings.THRUST_POWER_X * dt; player.coal -= settings.FUEL_CONSUMPTION_RATE_X * dt; }
                if (player.isThrustingRight) { player.speedX += settings.THRUST_POWER_X * dt; player.coal -= settings.FUEL_CONSUMPTION_RATE_X * dt; }
                player.x += player.speedX * dt;
                const rocketH = canvas.height * 0.12, finW = rocketH * (12 / 65), bodyW = rocketH * (22 / 65), rocketWidth = bodyW + finW * 2;
                if (player.x < rocketWidth / 2) { player.x = rocketWidth / 2; player.speedX = 0; }
                if (player.x > canvas.width - rocketWidth / 2) { player.x = canvas.width - rocketWidth / 2; player.speedX = 0; }
                if (player.height <= 0) { player.height = 0; handlePlayerLanding(player); }
            });

            if (anyThrusting && thrustSound.paused && !isMuted) playAudio(thrustSound);
            else if ((!anyThrusting || isMuted) && !thrustSound.paused) thrustSound.pause();
        } else if (frozen) {
            thrustSound.pause();
        }
        
        // UFO Logic
        if (state.isHardMode && !state.isGameOver && !frozen) {
            const now = Date.now();
            if (now > state.nextUfoSpawn && state.ufos.length < 3) {
                const fromLeft = Math.random() > 0.5;
                state.ufos.push({
                    x: fromLeft ? -70 : canvas.width + 70,
                    y: canvas.height * 0.15 + Math.random() * (canvas.height * 0.5),
                    speed: (fromLeft ? 1 : -1) * (1.5 + Math.random() * 2),
                    width: 60,
                    height: 25
                });
                state.nextUfoSpawn = now + 2000 + Math.random() * 4000;
            }

            state.ufos = state.ufos.filter(ufo => {
                ufo.x += ufo.speed * dt;
                
                // Collision check with all players for THIS ufo
                state.players.forEach(player => {
                    if (player.isLanded || player.isCrashed) return;
                    
                    const rocketH = canvas.height * 0.12;
                    const bodyW = rocketH * (22 / 65), finW = rocketH * (12 / 65);
                    const rocketWidth = bodyW + finW * 2;
                    const groundY = canvas.height - 10;
                    const skyH = groundY - rocketH;
                    const rocketBaseY = groundY - (player.height / settings.initialHeight * skyH);
                    const rocketTopY = rocketBaseY - rocketH;
                    
                    const ufoLeft = ufo.x - ufo.width / 2;
                    const ufoRight = ufo.x + ufo.width / 2;
                    const ufoTop = ufo.y - ufo.height / 2;
                    const ufoBottom = ufo.y + ufo.height / 2;

                    const rocketLeft = player.x - rocketWidth / 2;
                    const rocketRight = player.x + rocketWidth / 2;

                    if (rocketRight > ufoLeft && rocketLeft < ufoRight && rocketBaseY > ufoTop && rocketTopY < ufoBottom) {
                        crashPlayer(player, (rocketBaseY + rocketTopY) / 2);
                        if (isMultiplayer) {
                            if (state.players.every(p => p.isCrashed)) {
                                state.winnerDeclared = true;
                                showEndGameMessage(`Alien Abduction?`, `Both pilots collided with UFOs!`, 'crash', player);
                            }
                        } else {
                            state.isGameOver = true;
                            showEndGameMessage(`UFO Collision!`, `You were taken out by an unidentified flying object.`, 'crash', player);
                        }
                    }
                });

                return ufo.x > -100 && ufo.x < canvas.width + 100;
            });
        }

        stars.forEach(star => { star.phase += 0.03 * dt; star.alpha = Math.abs(Math.sin(star.phase)) * 0.8 + 0.2; });
        updateHUD();
        draw();
        gameLoopId = requestAnimationFrame(gameLoop);
    }

    function speedClass(value, maxSafe, absolute = false) {
        const v = absolute ? Math.abs(value) : value;
        if (v > maxSafe) return 'stat-danger';
        if (v > maxSafe * 0.7) return 'stat-warn';
        return 'stat-ok';
    }

    function formatStatLine(p) {
        const hClass = speedClass(p.speedX, settings.maxHSpeedForSafeLanding, true);
        const vClass = speedClass(p.speed, settings.maxVSpeedForSafeLanding);
        const fuelClass = p.coal <= settings.initialCoal * 0.2 ? 'stat-danger' : (p.coal <= settings.initialCoal * 0.4 ? 'stat-warn' : '');
        return `
            <span>H</span><strong class="${hClass}">${p.speedX.toFixed(1)}</strong>
            <span>V</span><strong class="${vClass}">${p.speed.toFixed(1)}</strong>
            <span>Alt</span>${p.height.toFixed(0)}
            <span>Fuel</span><strong class="${fuelClass}">${Math.max(0, p.coal).toFixed(0)}</strong>
        `;
    }

    function updateHUD() {
        if (!state.players || state.players.length === 0) return;
        if (isMultiplayer) {
            statsDisplay.innerHTML = state.players.map(p => `
                <div class="player-stats">
                    <div class="player-name" style="color: ${p.finColor};">${p.name}</div>
                    <div class="stats-line">${formatStatLine(p)}</div>
                </div>
            `).join('');
        } else {
            const p = state.players[0];
            const hClass = speedClass(p.speedX, settings.maxHSpeedForSafeLanding, true);
            const vClass = speedClass(p.speed, settings.maxVSpeedForSafeLanding);
            const fuelClass = p.coal <= settings.initialCoal * 0.2 ? 'stat-danger' : (p.coal <= settings.initialCoal * 0.4 ? 'stat-warn' : '');
            statsDisplay.innerHTML = `<span>H-Speed</span> <strong class="${hClass}">${p.speedX.toFixed(1)}</strong>m/s <span>Height</span> ${p.height.toFixed(0)}m <span>V-Speed</span> <strong class="${vClass}">${p.speed.toFixed(1)}</strong>m/s <span>Fuel</span> <strong class="${fuelClass}">${Math.max(0, p.coal).toFixed(0)}</strong>kg`;
        }
    }

    function draw() {
        if (!state.players) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#0a0a0b"; ctx.fillRect(0, 0, canvas.width, canvas.height);
        stars.forEach(star => { ctx.fillStyle = `rgba(255, 255, 255, ${star.alpha})`; ctx.beginPath(); ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2); ctx.fill(); });
        if (state.planets) {
            state.planets.forEach(p => {
                if (p.hasRings) {
                    ctx.save();
                    ctx.beginPath();
                    ctx.ellipse(p.x, p.y, p.radius * 1.8, p.radius * 0.5, Math.PI / 9, 0, Math.PI * 2);
                    ctx.ellipse(p.x, p.y, p.radius * 1.4, p.radius * 0.35, Math.PI / 9, Math.PI * 2, 0, true);
                    ctx.fillStyle = 'rgba(229, 231, 235, 0.2)'; ctx.fill();
                    ctx.restore();
                }
                const grad = ctx.createRadialGradient(p.x - p.radius * 0.3, p.y - p.radius * 0.3, p.radius * 0.1, p.x, p.y, p.radius);
                grad.addColorStop(0, p.color1); grad.addColorStop(1, p.color2);
                ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2); ctx.fill();
            });
        }

        const groundY = canvas.height - 10;
        ctx.fillStyle = "rgb(161, 161, 170)"; ctx.fillRect(0, groundY, canvas.width, 10);
        ctx.fillStyle = "#f59e0b"; ctx.fillRect(state.landingPadX, groundY, state.landingPadWidth, 5);
        ctx.strokeStyle = "black"; ctx.lineWidth = 1; ctx.strokeRect(state.landingPadX, groundY, state.landingPadWidth, 5);
        
        // --- Draw Flags at the ends of the landing pad ---
        const flagPoleHeight = 35;
        const flagWidth = 20;
        const flagHeight = 15;
        const windPhase = Date.now() * 0.005;
        const windWave = Math.sin(windPhase) * 4;

        // Left Flag
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(state.landingPadX, groundY);
        ctx.lineTo(state.landingPadX, groundY - flagPoleHeight);
        ctx.stroke();

        ctx.fillStyle = "#ef4444"; // Bright Red
        ctx.beginPath();
        ctx.moveTo(state.landingPadX, groundY - flagPoleHeight);
        ctx.lineTo(state.landingPadX + flagWidth + windWave, groundY - flagPoleHeight + flagHeight / 2);
        ctx.lineTo(state.landingPadX, groundY - flagPoleHeight + flagHeight);
        ctx.closePath();
        ctx.fill();

        // Right Flag
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(state.landingPadX + state.landingPadWidth, groundY);
        ctx.lineTo(state.landingPadX + state.landingPadWidth, groundY - flagPoleHeight);
        ctx.stroke();

        ctx.fillStyle = "#ef4444"; // Bright Red
        ctx.beginPath();
        ctx.moveTo(state.landingPadX + state.landingPadWidth, groundY - flagPoleHeight);
        ctx.lineTo(state.landingPadX + state.landingPadWidth - flagWidth - windWave, groundY - flagPoleHeight + flagHeight / 2);
        ctx.lineTo(state.landingPadX + state.landingPadWidth, groundY - flagPoleHeight + flagHeight);
        ctx.closePath();
        ctx.fill();

        // --- Draw UFOs if active ---
        if (state.ufos && state.ufos.length > 0) {
            state.ufos.forEach(ufo => {
                const { x, y, width, height } = ufo;
                ctx.save();
                // Saucer body
                const saucerGrad = ctx.createLinearGradient(x, y - height / 2, x, y + height / 2);
                saucerGrad.addColorStop(0, '#94a3b8');
                saucerGrad.addColorStop(0.5, '#475569');
                saucerGrad.addColorStop(1, '#1e293b');
                ctx.fillStyle = saucerGrad;
                ctx.beginPath();
                ctx.ellipse(x, y, width / 2, height / 2, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
                ctx.stroke();

                // Glass dome
                ctx.fillStyle = 'rgba(6, 182, 212, 0.6)';
                ctx.beginPath();
                ctx.ellipse(x, y - height / 4, width / 4, height / 2, 0, Math.PI, 2 * Math.PI);
                ctx.fill();

                // Glowing lights
                const lightCount = 5;
                const time = Date.now() * 0.01;
                for (let i = 0; i < lightCount; i++) {
                    const angle = (i / lightCount) * Math.PI * 2 + time;
                    const lx = x + Math.cos(angle) * (width / 2.5);
                    const ly = y + Math.sin(angle) * (height / 6);
                    const alpha = 0.5 + Math.sin(time + i) * 0.5;
                    ctx.fillStyle = `rgba(245, 158, 11, ${alpha})`;
                    ctx.beginPath();
                    ctx.arc(lx, ly, 2, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.restore();
            });
        }

        ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
        ctx.fillRect(state.landingPadX + 4, groundY, 8, 5);
        ctx.fillRect(state.landingPadX + state.landingPadWidth - 12, groundY, 8, 5);

        state.players.forEach(player => {
            const rocketH = canvas.height * 0.12, bodyW = rocketH * (22 / 65), noseH = rocketH * (20 / 65), bodyH = rocketH * (45 / 65), finW = rocketH * (12 / 65), finH = rocketH * (20 / 65);
            const skyH = groundY - rocketH, rocketBaseY = groundY - (player.height / settings.initialHeight * skyH), noseConeTipY = rocketBaseY - rocketH;
            const rocketX = player.x, bodyTopY = noseConeTipY + noseH, bodyBottomY = bodyTopY + bodyH;
            if (!player.isLanded && !player.isCrashed) {
                if (player.isThrusting) {
                    ctx.fillStyle = 'rgb(245, 158, 11)'; const flameH = rocketH * 0.4 + Math.random() * (rocketH * 0.2), flameW = bodyW * 0.8;
                    ctx.beginPath(); ctx.moveTo(rocketX - flameW / 2, bodyBottomY); ctx.lineTo(rocketX + flameW / 2, bodyBottomY); ctx.lineTo(rocketX, bodyBottomY + flameH); ctx.closePath(); ctx.fill();
                }
                const thrusterY = bodyTopY + bodyH * 0.6; ctx.fillStyle = 'rgba(229, 231, 235, 0.9)';
                if (player.isThrustingLeft) { const size = rocketH * 0.2, len = size + Math.random() * (size * 0.5), wbl = (size / 3) + (Math.random() - 0.5) * 4; ctx.beginPath(); ctx.moveTo(rocketX + bodyW / 2, thrusterY); ctx.lineTo(rocketX + bodyW / 2 + len, thrusterY - wbl); ctx.lineTo(rocketX + bodyW / 2 + len, thrusterY + wbl); ctx.closePath(); ctx.fill(); }
                if (player.isThrustingRight) { const size = rocketH * 0.2, len = size + Math.random() * (size * 0.5), wbl = (size / 3) + (Math.random() - 0.5) * 4; ctx.beginPath(); ctx.moveTo(rocketX - bodyW / 2, thrusterY); ctx.lineTo(rocketX - bodyW / 2 - len, thrusterY - wbl); ctx.lineTo(rocketX - bodyW / 2 - len, thrusterY + wbl); ctx.closePath(); ctx.fill(); }
            }
            if (player.isLanding) {
                const prog = player.landingShockwaveWidth / player.finalShockwaveWidth, alpha = Math.sin(prog * Math.PI); const color = `rgba(161, 161, 170, ${alpha * 0.7})`;
                const shockH = 15, shockY = groundY - shockH, shockX = player.x - player.landingShockwaveWidth / 2;
                ctx.fillStyle = color; ctx.fillRect(shockX, shockY, player.landingShockwaveWidth, shockH);
            }
            if (player.isExploding && player.explosionAlpha > 0) {
                ctx.fillStyle = `rgba(245, 158, 11, ${player.explosionAlpha})`; 
                ctx.beginPath(); ctx.arc(rocketX, player.explosionY, player.explosionRadius, 0, 2 * Math.PI); ctx.fill();
            } else if (!player.isExploding) {
                ctx.fillStyle = player.finColor;
                ctx.beginPath(); ctx.moveTo(rocketX - bodyW / 2, bodyBottomY - finH); ctx.lineTo(rocketX - bodyW / 2 - finW, bodyBottomY); ctx.lineTo(rocketX - bodyW / 2, bodyBottomY); ctx.closePath(); ctx.fill();
                ctx.beginPath(); ctx.moveTo(rocketX + bodyW / 2, bodyBottomY - finH); ctx.lineTo(rocketX + bodyW / 2 + finW, bodyBottomY); ctx.lineTo(rocketX + bodyW / 2, bodyBottomY); ctx.closePath(); ctx.fill();
                ctx.fillStyle = player.noseColor;
                ctx.beginPath(); ctx.moveTo(rocketX, noseConeTipY); ctx.lineTo(rocketX - bodyW / 2, bodyTopY); ctx.lineTo(rocketX + bodyW / 2, bodyTopY); ctx.closePath(); ctx.fill();
                ctx.fillStyle = "#E5E7EB"; ctx.fillRect(rocketX - bodyW / 2, bodyTopY, bodyW, bodyH);
                const winR = bodyW * 0.27, winY = bodyTopY + bodyH * 0.4;
                ctx.fillStyle = "#06b6d4"; ctx.beginPath(); ctx.arc(rocketX, winY, winR, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = "rgba(255, 255, 255, 0.4)"; ctx.beginPath(); ctx.arc(rocketX + winR * 0.3, winY - winR * 0.3, winR * 0.5, 0, Math.PI * 2); ctx.fill();
            }
        });

        const fuelBarWidth = Math.min(canvas.width * 0.25, 180);
        const fuelBarHeight = 10;
        const fuelBarY = 48;
        const fuelColorFor = (ratio, fallback) => {
            if (ratio <= 0.2) return '#ef4444';
            if (ratio <= 0.4) return '#f59e0b';
            return fallback;
        };
        if (state.players && state.players.length > 0) {
            if (isMultiplayer) {
                if (state.players.length === 2) {
                    const p1 = state.players[0]; const p1x = 20;
                    const p1Ratio = Math.max(0, p1.coal / settings.initialCoal);
                    ctx.fillStyle = "rgba(255, 255, 255, 0.1)"; ctx.fillRect(p1x, fuelBarY, fuelBarWidth, fuelBarHeight);
                    ctx.fillStyle = fuelColorFor(p1Ratio, p1.finColor); ctx.fillRect(p1x, fuelBarY, p1Ratio * fuelBarWidth, fuelBarHeight);
                    ctx.strokeStyle = "rgba(255, 255, 255, 0.3)"; ctx.strokeRect(p1x, fuelBarY, fuelBarWidth, fuelBarHeight);
                    const p2 = state.players[1]; const p2x = canvas.width - fuelBarWidth - 20;
                    const p2Ratio = Math.max(0, p2.coal / settings.initialCoal);
                    ctx.fillStyle = "rgba(255, 255, 255, 0.1)"; ctx.fillRect(p2x, fuelBarY, fuelBarWidth, fuelBarHeight);
                    ctx.fillStyle = fuelColorFor(p2Ratio, p2.finColor); ctx.fillRect(p2x, fuelBarY, p2Ratio * fuelBarWidth, fuelBarHeight);
                    ctx.strokeStyle = "rgba(255, 255, 255, 0.3)"; ctx.strokeRect(p2x, fuelBarY, fuelBarWidth, fuelBarHeight);
                }
            } else { 
                const p1 = state.players[0]; const p1x = 20;
                const p1Ratio = Math.max(0, p1.coal / settings.initialCoal);
                ctx.fillStyle = "rgba(255, 255, 255, 0.1)"; ctx.fillRect(p1x, fuelBarY, fuelBarWidth, fuelBarHeight);
                ctx.fillStyle = fuelColorFor(p1Ratio, "rgb(245, 158, 11)"); ctx.fillRect(p1x, fuelBarY, p1Ratio * fuelBarWidth, fuelBarHeight);
                ctx.strokeStyle = "rgba(255, 255, 255, 0.3)"; ctx.strokeRect(p1x, fuelBarY, fuelBarWidth, fuelBarHeight);
            }
        }
    }

    function resizeCanvas() {
        const parent = canvas.parentElement;
        if (!parent) return;

        // clientWidth/Height are the content box — matches what absolute canvas fills
        const displayWidth = Math.max(1, Math.round(parent.clientWidth));
        const displayHeight = Math.max(1, Math.round(parent.clientHeight));

        // Keep backing-store pixels 1:1 with CSS pixels so nothing stretches/squashes
        if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
            canvas.width = displayWidth;
            canvas.height = displayHeight;
            generateStars();
        }

        if (!gameLoopId || (state.players && state.isGameOver)) {
            // This check might need adjustment if it causes issues, but it's for resizing the end screen correctly.
            if (!state.players) resetGameState();
            draw();
        }
    }

    // Keep buffer size locked to the play area whenever layout changes (HUD, nav, orientation, etc.)
    const gameArea = canvas.parentElement;
    if (typeof ResizeObserver !== 'undefined' && gameArea) {
        const playAreaObserver = new ResizeObserver(() => {
            resizeCanvas();
        });
        playAreaObserver.observe(gameArea);
    }
    
    // --- Initial Setup ---
    window.addEventListener('resize', resizeCanvas);
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', resizeCanvas);
    }
    helpButton.addEventListener('click', () => {
        setHelpOpen(helpPanel.hidden);
    });
    helpClose.addEventListener('click', () => setHelpOpen(false));
    muteButton.addEventListener('click', toggleMute);
    muteButtonStart.addEventListener('click', toggleMute);
    pauseButton.addEventListener('click', () => {
        if (messageArea.classList.contains('visible')) return;
        togglePause();
    });
    resumeButton.addEventListener('click', () => setPaused(false));
    quitButton.addEventListener('click', requestQuitToMenu);
    menuButton.addEventListener('click', requestQuitToMenu);
    menuEndButton.addEventListener('click', quitToMenu);
    confirmOk.addEventListener('click', () => closeConfirm(true));
    confirmCancel.addEventListener('click', () => closeConfirm(false));
    confirmModal.addEventListener('click', (e) => {
        if (e.target === confirmModal) closeConfirm(false);
    });
    document.addEventListener('visibilitychange', () => {
        if (!body.classList.contains('game-active') || !state.players || state.isGameOver) return;
        if (document.hidden) {
            if (!isPaused && !(helpPanel && !helpPanel.hidden)) {
                pausedByVisibility = true;
                setPaused(true);
            }
        } else if (pausedByVisibility) {
            pausedByVisibility = false;
            setPaused(false);
        }
    });
    nameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); startGame(); }
    });
    nameInputP2.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); startGame(); }
    });
    fuelInput.addEventListener('change', clampFuelInput);
    fuelInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); clampFuelInput(); startGame(); }
    });
    hardModeToggle.addEventListener('change', () => {
        localStorage.setItem(HARD_MODE_KEY, hardModeToggle.checked ? '1' : '0');
    });
    startButton.addEventListener('click', startGame);
    playAgainButton.addEventListener('click', restartGame);
    playerModeToggle.addEventListener('change', syncPlayerModeUI);

    applyMuteState();
    showStartScreen();
    if (!isTouchDevice) {
        setTimeout(() => nameInput.focus(), 50);
    }
});