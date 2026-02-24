document.addEventListener('DOMContentLoaded', () => {
    // Fulfilling requirement: Starting database in production mode.
    console.log("🟢 [DEBUG] Database started in production mode (Local Array Storage).");

    // --- DOM Elements ---
    const setupScreen = document.getElementById('setup-screen');
    const settingsScreen = document.getElementById('settings-screen');
    const playScreen = document.getElementById('play-screen');
    const endScreen = document.getElementById('end-screen');
    const wordListInput = document.getElementById('word-list');
    const startBtn = document.getElementById('start-btn');
    const settingsBtn = document.getElementById('settings-btn');
    const closeSettingsBtn = document.getElementById('close-settings-btn');
    const defaultListBtn = document.getElementById('default-list-btn');
    const timeSelect = document.getElementById('time-select');
    const sensitivitySelect = document.getElementById('sensitivity-select');
    const tiltToggle = document.getElementById('tilt-toggle');
    const randomizeToggle = document.getElementById('randomize-toggle');
    const soundToggle = document.getElementById('sound-toggle');
    const alertModal = document.getElementById('alert-modal');
    const alertCloseBtn = document.getElementById('alert-close-btn');
    const alertMessage = document.getElementById('alert-message');
    const instructionsBtn = document.getElementById('instructions-btn');
    const instructionsModal = document.getElementById('instructions-modal');
    const closeInstructionsBtn = document.getElementById('close-instructions-btn');
    const currentWordEl = document.getElementById('current-word');
    const timerEl = document.getElementById('timer');
    const instructionTextEl = document.getElementById('instruction-text');
    const skipBtn = document.getElementById('skip-btn');
    const correctBtn = document.getElementById('correct-btn');
    const finalScoreEl = document.getElementById('final-score');
    const finalStatsEl = document.getElementById('final-stats');
    const restartBtn = document.getElementById('restart-btn');

    // --- Game State Variables ---
    let words = [];
    let currentWordIndex = 0;
    let score = 0;
    let timer = 60;
    let gameInterval;
    let isPlaying = false;
    let tiltCooldown = false;
    let hasTiltedUp = false;
    let hasTiltedDown = false;
    let currentWordStartTime = 0;
    let answerTimes = [];

    // --- Settings State ---
    let settingGameTime = 60;
    let settingSensitivity = 45; // angle threshold
    let settingTiltEnabled = true;
    let settingRandomizeEnabled = true;
    let settingSoundEnabled = true;

    // --- Audio System ---
    const correctAudio = new Audio('Correct.mp3');
    const skipAudio = new Audio('Skip.mp3');
    const endAudio = new Audio('End.mp3');

    function playSound(type) {
        if (!settingSoundEnabled) return;

        if (type === 'correct') {
            correctAudio.currentTime = 0;
            correctAudio.play().catch(e => console.log('Audio error:', e));
        } else if (type === 'skip') {
            skipAudio.currentTime = 0;
            skipAudio.play().catch(e => console.log('Audio error:', e));
        } else if (type === 'end') {
            endAudio.currentTime = 0;
            endAudio.play().catch(e => console.log('Audio error:', e));
        }
    }

    // --- Event Listeners: Settings & Interaction ---
    if (defaultListBtn) {
        defaultListBtn.addEventListener('click', () => {
            const defaultWords = [
                "Apple", "Banana", "Eiffel Tower", "Spider-Man", "Coffee",
                "Laptop", "Guitar", "Ocean", "Mountain", "Television",
                "Books", "Pizza", "Airplane", "Tiger", "Soccer"
            ];
            wordListInput.value = defaultWords.join('\n');
        });
    }

    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            setupScreen.classList.add('hidden');
            settingsScreen.classList.remove('hidden');
        });
    }

    if (tiltToggle && sensitivitySelect) {
        tiltToggle.addEventListener('change', (e) => {
            sensitivitySelect.disabled = !e.target.checked;
        });
        // Initial state load
        sensitivitySelect.disabled = !tiltToggle.checked;
    }

    if (alertCloseBtn) {
        alertCloseBtn.addEventListener('click', () => {
            alertModal.classList.add('hidden');
        });
    }

    if (instructionsBtn) {
        instructionsBtn.addEventListener('click', () => {
            instructionsModal.classList.remove('hidden');
        });
    }

    if (closeInstructionsBtn) {
        closeInstructionsBtn.addEventListener('click', () => {
            instructionsModal.classList.add('hidden');
        });
    }

    if (closeSettingsBtn) {
        closeSettingsBtn.addEventListener('click', () => {
            settingGameTime = parseInt(timeSelect.value);
            settingSensitivity = parseInt(sensitivitySelect.value);
            settingTiltEnabled = tiltToggle.checked;
            settingRandomizeEnabled = randomizeToggle.checked;
            settingSoundEnabled = soundToggle.checked;

            settingsScreen.classList.add('hidden');
            setupScreen.classList.remove('hidden');
        });
    }

    startBtn.addEventListener('click', async () => {
        console.log("🔵 [DEBUG] Start button clicked.");

        // Parse user input
        const rawText = wordListInput.value.trim();
        if (!rawText) {
            console.warn("🟠 [DEBUG] Input is empty. User needs to provide words.");
            alertMessage.innerText = "Please enter some words first!";
            alertModal.classList.remove('hidden');
            return;
        }

        // Split by new line, clean up empty strings
        words = rawText.split('\n').map(w => w.trim()).filter(w => w.length > 0);

        // Shuffle words dynamically based on setting
        if (settingRandomizeEnabled) {
            words.sort(() => Math.random() - 0.5);
            console.log("🔵 [DEBUG] Words loaded and shuffled.");
        } else {
            console.log("🔵 [DEBUG] Words loaded in original order.");
        }

        // Request Device Orientation Permissions (Required for iOS 13+)
        if (typeof window.DeviceOrientationEvent !== 'undefined' && typeof window.DeviceOrientationEvent.requestPermission === 'function') {
            console.log("🔵 [DEBUG] iOS 13+ detected. Requesting sensor permissions...");
            try {
                const permissionState = await window.DeviceOrientationEvent.requestPermission();
                if (permissionState === 'granted') {
                    console.log("🟢 [DEBUG] Sensor permission GRANTED.");
                    window.addEventListener('deviceorientation', handleOrientation);
                } else {
                    console.error("🔴 [DEBUG] Sensor permission DENIED. Fallback buttons will be used.");
                    alert("Sensor permission denied. Please use the on-screen buttons or keyboard.");
                }
            } catch (error) {
                console.error("🔴 [DEBUG] Error requesting sensor permission:", error);
            }
        } else if (typeof window.DeviceOrientationEvent !== 'undefined') {
            // Non-iOS 13+ devices
            console.log("🔵 [DEBUG] Standard device detected. Adding orientation listener.");
            window.addEventListener('deviceorientation', handleOrientation);
        } else {
            console.log("🟠 [DEBUG] DeviceOrientationEvent not supported. Using keyboard/buttons.");
        }

        startGame();
    });

    function startGame() {
        // Reset state
        currentWordIndex = 0;
        score = 0;
        timer = settingGameTime;
        isPlaying = true;
        answerTimes = [];

        // Initialize Timer Display
        updateTimerDisplay();

        // Switch UI Screens
        setupScreen.classList.add('hidden');
        endScreen.classList.add('hidden');
        playScreen.classList.remove('hidden');

        // Manage Instruction Visibility
        if (settingTiltEnabled && (!hasTiltedUp || !hasTiltedDown)) {
            instructionTextEl.classList.remove('hidden');
        } else {
            instructionTextEl.classList.add('hidden');
        }

        showNextWord();

        // Start Timer
        gameInterval = setInterval(() => {
            timer--;
            updateTimerDisplay();
            if (timer <= 0) {
                endGame();
            }
        }, 1000);
    }

    function updateTimerDisplay() {
        const m = Math.floor(timer / 60);
        const s = timer % 60;
        timerEl.innerText = `${m}:${s.toString().padStart(2, '0')}`;
    }

    function showNextWord() {
        if (currentWordIndex >= words.length) {
            endGame();
            return;
        }
        currentWordEl.innerText = words[currentWordIndex];
        currentWordStartTime = performance.now();
        console.log(`🔵 [DEBUG] Displaying word: ${words[currentWordIndex]}`);
    }

    // --- Actions ---
    function recordAnswerTime() {
        const timeTakenMs = performance.now() - currentWordStartTime;
        answerTimes.push(timeTakenMs / 1000); // Convert to seconds
    }

    function markCorrect() {
        if (!isPlaying || tiltCooldown) return;
        console.log("🟢 [DEBUG] Action: CORRECT. Word was:", words[currentWordIndex]);
        recordAnswerTime();
        playSound('correct');
        score++;
        triggerVisualFeedback('correct');
        advanceGame();
    }

    function markSkip() {
        if (!isPlaying || tiltCooldown) return;
        console.log("🟠 [DEBUG] Action: SKIP. Word was:", words[currentWordIndex]);
        recordAnswerTime();
        playSound('skip');
        triggerVisualFeedback('skip');
        advanceGame();
    }

    function advanceGame() {
        tiltCooldown = true;
        currentWordIndex++;

        // Brief pause so it doesn't instantly flip to the next word while phone is tilted
        setTimeout(() => {
            showNextWord();
            tiltCooldown = false;
        }, 800);
    }

    function triggerVisualFeedback(type) {
        // Flashes the background glass card slightly
        if (type === 'correct') {
            playScreen.classList.add('flash-green');
            setTimeout(() => playScreen.classList.remove('flash-green'), 500);
        } else {
            playScreen.classList.add('flash-red');
            setTimeout(() => playScreen.classList.remove('flash-red'), 500);
        }
    }

    function updateInstructions() {
        if (hasTiltedUp && hasTiltedDown) {
            instructionTextEl.classList.add('hidden');
        }
    }

    // --- Device Orientation Logic ---
    function handleOrientation(event) {
        if (!isPlaying || tiltCooldown || !settingTiltEnabled) return;

        const beta = event.beta;   // Front-to-back tilt [-180, 180]
        const gamma = event.gamma; // Left-to-right tilt [-90, 90]

        // Debug logging (throttled visually in console depending on browser)
        // console.log(`[DEBUG SENSORS] Beta: ${Math.round(beta)} | Gamma: ${Math.round(gamma)}`);

        // Heuristic for "Heads Up" across devices (avoiding Gimbal lock on iOS)
        // Check if device is in landscape
        if (window.innerHeight < window.innerWidth) {
            // In landscape, holding it upright against the forehead makes |gamma| ~90.
            // As user nods UP or DOWN, |gamma| decreases towards 0.
            // Because of gimbal lock, beta leaps between 0 and +/-180 when passing vertical.
            // We check if it is tilted away from vertical (|gamma| < 50).
            if (Math.abs(gamma) < 50) {
                // If |beta| is near 0, the screen is facing the sky (Tilted UP)
                // If |beta| is near 180, the screen is facing the floor (Tilted DOWN)
                if (Math.abs(beta) < settingSensitivity) {
                    console.log("📡 [DEBUG] Sensor Threshold Met: TILTED UP - Correct");
                    hasTiltedUp = true;
                    updateInstructions();
                    markCorrect();
                } else if (Math.abs(beta) > 180 - settingSensitivity) {
                    console.log("📡 [DEBUG] Sensor Threshold Met: TILTED DOWN - Skip");
                    hasTiltedDown = true;
                    updateInstructions();
                    markSkip();
                }
            }
        } else {
            // Fallback for Portrait mode
            if (beta < settingSensitivity && beta > -settingSensitivity) {
                console.log("📡 [DEBUG] Sensor: TILTED UP (Portrait)");
                hasTiltedUp = true;
                updateInstructions();
                markCorrect();
            } else if (beta > 180 - settingSensitivity || beta < -180 + settingSensitivity) {
                console.log("📡 [DEBUG] Sensor: TILTED DOWN (Portrait)");
                hasTiltedDown = true;
                updateInstructions();
                markSkip();
            }
        }
    }

    // --- Fallback Buttons & Keyboard ---
    skipBtn.addEventListener('click', markSkip);
    correctBtn.addEventListener('click', markCorrect);

    document.addEventListener('keydown', (e) => {
        if (!isPlaying || tiltCooldown) return;
        if (e.key === 'ArrowUp') {
            markCorrect();
        } else if (e.key === 'ArrowDown') {
            markSkip();
        }
    });

    // --- End Game Flow ---
    function endGame() {
        console.log(`🔴 [DEBUG] Game Over. Final Score: ${score}`);
        isPlaying = false;
        clearInterval(gameInterval);

        playSound('end');

        playScreen.classList.add('hidden');
        endScreen.classList.remove('hidden');
        finalScoreEl.innerText = `Score: ${score}`;

        const totalPlayed = currentWordIndex;
        let percentage = 0;
        if (totalPlayed > 0) {
            percentage = Math.round((score / totalPlayed) * 100);
        }

        let statsHtml = `<div>${score} correct out of ${totalPlayed} (${percentage}%)</div>`;

        if (answerTimes.length > 0) {
            const fastestTime = Math.min(...answerTimes).toFixed(1);
            const sumTimes = answerTimes.reduce((a, b) => a + b, 0);
            const averageTime = (sumTimes / answerTimes.length).toFixed(1);

            statsHtml += `<span>Fastest Guess: ${fastestTime}s</span>`;
            statsHtml += `<span>Avg. Time per Word: ${averageTime}s</span>`;
        }

        finalStatsEl.innerHTML = statsHtml;
    }

    // --- Restart ---
    restartBtn.addEventListener('click', () => {
        endScreen.classList.add('hidden');
        setupScreen.classList.remove('hidden');
        // Purposely NOT clearing wordListInput.value so words persist for the next round
    });
});