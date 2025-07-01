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
    const padSizeInfo = document.getElementById('pad-size-info');
    const outOfFuelMessage = document.getElementById('out-of-fuel-message');
    const outOfFuelP1 = document.getElementById('out-of-fuel-p1');
    const outOfFuelP2 = document.getElementById('out-of-fuel-p2');
    const messageStats = document.getElementById('message-stats');

    // Multiplayer UI Elements
    const playerModeToggle = document.getElementById('player-mode-toggle');
    const player2InputContainer = document.getElementById('player2-input-container');
    const nameInputP2 = document.getElementById('name-input-p2');
    const labelSingle = document.getElementById('label-single');
    const labelMulti = document.getElementById('label-multi');
    const instructionP1 = document.getElementById('instruction-p1');
    const instructionP2 = document.getElementById('instruction-p2');

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

    // --- Game Configuration ---
    const settings = {
        initialHeight: 100, initialCoal: 100, 
        maxVSpeedForSafeLanding: 1, 
        maxHSpeedForSafeLanding: 0.6, // FIX: Updated horizontal speed limit
        GRAVITY_PULL: 0.03, THRUST_POWER: 0.1, FUEL_CONSUMPTION_RATE: 0.25,
        THRUST_POWER_X: 0.05,
        FUEL_CONSUMPTION_RATE_X: 0.05,
        MAX_PAD_WIDTH_PERCENT: 0.12,
    };
    const HIGH_SCORE_KEY = 'rocketLanderHighScore';

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

    // --- Keyboard Input Listeners ---
    window.addEventListener('keydown', (e) => {
        if (messageArea.classList.contains('visible')) {
            if (e.key === 'Enter') { e.preventDefault(); restartGame(); return; }
            if ((e.key === ' ' || e.code === 'Space') && spaceRestartEnabled) { e.preventDefault(); restartGame(); return; }
        }
        if (state.players && !state.isGameOver) { keysPressed[e.key] = true; }
    });
    window.addEventListener('keyup', (e) => { keysPressed[e.key] = false; });
    
    // --- UI Logic ---
    function showStartScreen() {
        body.classList.remove('game-active');
        gameScreen.style.display = 'none';
        startScreen.style.display = 'block';
        messageArea.classList.remove('visible', 'success', 'crash');
        if (gameLoopId) { cancelAnimationFrame(gameLoopId); gameLoopId = null; }
        gameMusic.pause();
        gameMusic.currentTime = 0;
        displayHighScore();
    }
    
    function restartGame() { startGame(); }

    // --- Game Logic ---
    function resetGameState() {
        const rocketH = canvas.height * 0.12;
        const rocketBodyW = rocketH * (22 / 65), rocketFinW = rocketH * (12 / 65), rocketWidth = rocketBodyW + rocketFinW * 2;
        const minPadWidth = rocketWidth * (isMultiplayer ? 2.5 : 1) + 4;
        const maxPadWidth = canvas.width * settings.MAX_PAD_WIDTH_PERCENT * (isMultiplayer ? 1.5 : 1);
        const padWidth = minPadWidth + Math.random() * Math.max(0, (maxPadWidth - minPadWidth));
        const padX = Math.random() * (canvas.width - padWidth);

        state = { landingPadX: padX, landingPadWidth: padWidth, isGameOver: false, winner: null, winnerDeclared: false, planets: [], players: [] };

        const createPlayer = (name, startX, controls, finColor, noseColor) => ({
            name: name || "Anonymous", height: settings.initialHeight, speed: 0, coal: settings.initialCoal,
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

        const numPlanets = Math.floor(Math.random() * 2) + 2;
        for (let i = 0; i < numPlanets; i++) {
            let candidatePlanet, isOverlapping, attempts = 0;
            do {
                isOverlapping = false;
                candidatePlanet = { radius: (Math.random() * 80) + 70, x: Math.random() * canvas.width, y: Math.random() * (canvas.height * 0.4) + 20, color1: `hsl(${Math.random() * 360}, 60%, 70%)`, color2: `hsl(${Math.random() * 360}, 50%, 50%)`, hasRings: Math.random() > 0.6 };
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

        resetGameState();
        body.classList.add('game-active');
        startScreen.style.display = 'none';
        messageArea.classList.remove('visible', 'success', 'crash');
        messageStats.classList.remove('visible');
        outOfFuelMessage.classList.remove('visible');
        outOfFuelP1.classList.remove('visible');
        outOfFuelP2.classList.remove('visible');

        gameScreen.style.display = 'flex';
        resizeCanvas();
        if (gameLoopId) cancelAnimationFrame(gameLoopId);
        gameLoopId = requestAnimationFrame(gameLoop);

        const hSpeedRule = `Max H-Speed: <strong>${settings.maxHSpeedForSafeLanding} m/s</strong>.`;
        const vSpeedRule = `Max V-Speed: <strong>${settings.maxVSpeedForSafeLanding} m/s</strong>.`;
        
        // FIX: Update instructions with player-specific controls
        if (isMultiplayer) {
            instructionP1.innerHTML = `<strong>${state.players[0].name} (P1):</strong> Use <strong>W A D</strong> to fly.`;
            instructionP2.innerHTML = `<strong>${state.players[1].name} (P2):</strong> Use <strong>← ↑ →</strong> to fly. Land on the pad with ${vSpeedRule} ${hSpeedRule}`;
        } else {
            instructionP1.innerHTML = 'Use <strong> W / ↑ </strong> for main thruster. Use <strong> A/D </strong> or <strong> ←/→ </strong> for side thrusters.';
            instructionP2.innerHTML = `Land on the pad. ${vSpeedRule} ${hSpeedRule}`;
        }

        padSizeInfo.innerHTML = `Landing Pad Size: <strong>${state.landingPadWidth.toFixed(0)}m</strong>`;
        gameMusic.currentTime = 0;
        gameMusic.play();
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
                successSound.currentTime = 0; successSound.play();
                player.isLanding = true;
                player.finalShockwaveWidth = canvas.width * 0.8;
                state.players.forEach(p => { if (p !== player) p.coal = 0; });
                showEndGameMessage(`Winner: ${player.name}!`, `${player.name} landed safely! The other pilot is now in a freefall...`, 'success', player);
            } else {
                crashPlayer(player);
                if (state.players.every(p => p.isCrashed)) {
                    state.winnerDeclared = true;
                    thrustSound.pause();
                    showEndGameMessage(`It's a Draw!`, `Both pilots have crashed their landers. Mission failed.`, 'crash', player);
                }
            }
        } else { // Single Player
            state.isGameOver = true;
            if (isSuccess) {
                successSound.currentTime = 0; successSound.play();
                player.isLanded = true; player.isLanding = true;
                player.finalShockwaveWidth = canvas.width * 0.8;
                const score = Math.round(player.coal * 10 + (settings.maxVSpeedForSafeLanding - player.speed) * 500);
                const isNewHighScore = updateHighScore(score);
                displayHighScore();
                let scoreMessage = `Your Score: ${score.toLocaleString()}. You landed with ${player.coal.toFixed(0)}kg of fuel.`;
                if (isNewHighScore) scoreMessage += " A new high score!";
                showEndGameMessage(`Congratulations, ${player.name}!`, scoreMessage, 'success', player);
            } else {
                crashPlayer(player);
                let crashReason = !landedOnPad ? "You missed the landing pad."
                                : !isSafeVSpeed ? `You crashed at ${player.speed.toFixed(1)} m/s vertically.`
                                : !isSafeHSpeed ? `You skidded across the pad at ${player.speedX.toFixed(1)} m/s horizontally.`
                                : "You have crashed.";
                showEndGameMessage(`Better Luck Next Time, ${player.name}!`, `${crashReason} The lander and its ${player.coal.toFixed(0)}kg of fuel are now a crater.`, 'crash', player);
            }
        }
    }

    function crashPlayer(player) {
        if (player.isCrashed || player.isLanded) return;
        crashSound.currentTime = 0; crashSound.play();
        player.isCrashed = true;
        player.isExploding = true;
        player.explosionAlpha = 1;
        player.finalExplosionRadius = canvas.height * 0.1 + player.coal * 1.5 + player.speed * 2;
    }

    function showEndGameMessage(title, text, type, player) {
        thrustSound.pause();
        messageArea.classList.remove('success', 'crash');
        messageArea.classList.add(type);
        messageTitle.textContent = title;
        messageText.textContent = text;

        if (player) {
            // FIX: Add a label to the stats box
            messageStats.innerHTML = `
                <p class="message-stats-label">${player.name}'s Final Stats:</p>
                <div><span>Final V-Speed:</span> <strong>${player.speed.toFixed(2)} m/s</strong></div>
                <div><span>Final H-Speed:</span> <strong>${player.speedX.toFixed(2)} m/s</strong></div>
                <div><span>Fuel Remaining:</span> <strong>${Math.max(0, player.coal).toFixed(0)} kg</strong></div>
            `;
            messageStats.classList.add('visible');
        } else {
            messageStats.classList.remove('visible');
        }

        restartTimer = setTimeout(() => { spaceRestartEnabled = true; }, 5000);
        setTimeout(() => { messageArea.classList.add('visible'); }, isMultiplayer ? 2000 : 500);
    }

    function gameLoop() {
        if (!state.players) return;
        
        state.players.forEach(player => {
            if (player.isExploding && player.explosionAlpha > 0) {
                if (player.explosionRadius < player.finalExplosionRadius) player.explosionRadius += 2;
                else player.explosionAlpha -= 0.02;
            }
            if (player.isLanding && player.landingShockwaveWidth < player.finalShockwaveWidth) player.landingShockwaveWidth += 25;
        });

        if (!state.isGameOver) {
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

                if (player.isThrusting) { player.speed -= settings.THRUST_POWER; player.coal -= settings.FUEL_CONSUMPTION_RATE; }
                player.speed += settings.GRAVITY_PULL;
                player.height -= player.speed;
                if (player.isThrustingLeft) { player.speedX -= settings.THRUST_POWER_X; player.coal -= settings.FUEL_CONSUMPTION_RATE_X; }
                if (player.isThrustingRight) { player.speedX += settings.THRUST_POWER_X; player.coal -= settings.FUEL_CONSUMPTION_RATE_X; }
                player.x += player.speedX;
                const rocketH = canvas.height * 0.12, finW = rocketH * (12 / 65), bodyW = rocketH * (22 / 65), rocketWidth = bodyW + finW * 2;
                if (player.x < rocketWidth / 2) { player.x = rocketWidth / 2; player.speedX = 0; }
                if (player.x > canvas.width - rocketWidth / 2) { player.x = canvas.width - rocketWidth / 2; player.speedX = 0; }
                if (player.height <= 0) { player.height = 0; handlePlayerLanding(player); }
            });

            if (anyThrusting && thrustSound.paused) thrustSound.play();
            else if (!anyThrusting && !thrustSound.paused) thrustSound.pause();
        }
        
        if (isMultiplayer && !state.isGameOver && state.players.every(p => p.isLanded || p.isCrashed)) {
            state.isGameOver = true;
        }

        stars.forEach(star => { star.phase += 0.03; star.alpha = Math.abs(Math.sin(star.phase)) * 0.8 + 0.2; });
        updateHUD();
        draw();
        gameLoopId = requestAnimationFrame(gameLoop);
    }

    function updateHUD() {
        if (!state.players || state.players.length === 0) return;
        if (isMultiplayer) {
            statsDisplay.innerHTML = state.players.map(p => `
                <div class="player-stats">
                    <div class="player-name" style="color: ${p.finColor}; text-shadow: 0 0 5px ${p.finColor};">${p.name}</div>
                    <div class="stats-line">
                        <span>H-Spd:</span>${p.speedX.toFixed(1)}
                        <span>V-Spd:</span>${p.speed.toFixed(1)}
                        <span>Height:</span>${p.height.toFixed(0)}
                        <span>Fuel:</span>${Math.max(0, p.coal).toFixed(0)}
                    </div>
                </div>
            `).join('<div class="hud-separator"></div>');
        } else {
            const p = state.players[0];
            statsDisplay.innerHTML = `<span>H-Speed:</span> ${p.speedX.toFixed(1)}m/s <span>Height:</span> ${p.height.toFixed(0)}m <span>V-Speed:</span> ${p.speed.toFixed(1)}m/s <span>Fuel:</span> ${p.coal.toFixed(0)}kg`;
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
                ctx.beginPath(); ctx.arc(rocketX, groundY, player.explosionRadius, Math.PI, 2 * Math.PI); ctx.fill();
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
        const fuelBarHeight = 20;
        if (state.players && state.players.length > 0) {
            if (isMultiplayer) {
                if (state.players.length === 2) {
                    const p1 = state.players[0]; const p1x = 20; const p1y = 20;
                    ctx.fillStyle = "rgba(255, 255, 255, 0.1)"; ctx.fillRect(p1x, p1y, fuelBarWidth, fuelBarHeight);
                    const p1CurrentFuelWidth = (p1.coal / settings.initialCoal) * fuelBarWidth;
                    ctx.fillStyle = p1.finColor; ctx.fillRect(p1x, p1y, p1CurrentFuelWidth > 0 ? p1CurrentFuelWidth : 0, fuelBarHeight);
                    ctx.strokeStyle = "rgba(255, 255, 255, 0.3)"; ctx.strokeRect(p1x, p1y, fuelBarWidth, fuelBarHeight);
                    const p2 = state.players[1]; const p2x = canvas.width - fuelBarWidth - 20; const p2y = 20;
                    ctx.fillStyle = "rgba(255, 255, 255, 0.1)"; ctx.fillRect(p2x, p2y, fuelBarWidth, fuelBarHeight);
                    const p2CurrentFuelWidth = (p2.coal / settings.initialCoal) * fuelBarWidth;
                    ctx.fillStyle = p2.finColor; ctx.fillRect(p2x, p2y, p2CurrentFuelWidth > 0 ? p2CurrentFuelWidth : 0, fuelBarHeight);
                    ctx.strokeStyle = "rgba(255, 255, 255, 0.3)"; ctx.strokeRect(p2x, p2y, fuelBarWidth, fuelBarHeight);
                }
            } else { 
                const p1 = state.players[0]; const p1x = 20; const p1y = 20;
                ctx.fillStyle = "rgba(255, 255, 255, 0.1)"; ctx.fillRect(p1x, p1y, fuelBarWidth, fuelBarHeight);
                const p1CurrentFuelWidth = (p1.coal / settings.initialCoal) * fuelBarWidth;
                ctx.fillStyle = "rgb(245, 158, 11)"; ctx.fillRect(p1x, p1y, p1CurrentFuelWidth > 0 ? p1CurrentFuelWidth : 0, fuelBarHeight);
                ctx.strokeStyle = "rgba(255, 255, 255, 0.3)"; ctx.strokeRect(p1x, p1y, fuelBarWidth, fuelBarHeight);
            }
        }
    }

    function resizeCanvas() {
        const rect = canvas.parentElement.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;
        generateStars();
        if (!gameLoopId || (state.players && state.isGameOver)) {
            if (!state.players) resetGameState(); 
            draw();
        }
    }
    
    // --- Initial Setup ---
    window.addEventListener('resize', resizeCanvas);
    startButton.addEventListener('click', startGame);
    playAgainButton.addEventListener('click', restartGame);
    playerModeToggle.addEventListener('change', () => {
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
    });
    
    showStartScreen();
    player2InputContainer.style.display = 'none';
    labelMulti.classList.remove('active');
    labelSingle.classList.add('active');
});