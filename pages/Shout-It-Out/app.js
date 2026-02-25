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
    const categoriesBtn = document.getElementById('categories-btn');
    const categoriesModal = document.getElementById('categories-modal');
    const closeCategoriesBtn = document.getElementById('close-categories-btn');
    const addCategoriesBtn = document.getElementById('add-categories-btn');
    const removeCategoriesBtn = document.getElementById('remove-categories-btn');
    const clearListBtn = document.getElementById('clear-list-btn');
    const categoriesGrid = document.getElementById('categories-grid');
    const timeSelect = document.getElementById('time-select');
    const customTimeInput = document.getElementById('custom-time-input');
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
    const restartRemoveBtn = document.getElementById('restart-remove-btn');
    const reviewWordsBtn = document.getElementById('review-words-btn');
    const reviewModal = document.getElementById('review-modal');
    const closeReviewBtn = document.getElementById('close-review-btn');
    const correctWordsList = document.getElementById('correct-words-list');
    const skippedWordsList = document.getElementById('skipped-words-list');

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
    let correctWordsArr = [];
    let skippedWordsArr = [];

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
    const categoriesData = {
        "🎬 Actors & Actresses": [
            "Adam Driver", "Adam Sandler", "Amber Heard", "Ana de Armas", "Andrew Garfield", "Anne Hathaway", "Anthony Mackie", "Anya Taylor-Joy", "Austin Butler", "Ben Affleck", "Benedict Cumberbatch", "Brad Pitt", "Bradley Cooper", "Brendan Fraser", "Caleb McLaughlin", "Charlize Theron", "Chris Evans", "Chris Hemsworth", "Chris Pine", "Christian Bale", "Cillian Murphy", "Colin Farrell", "Daisy Ridley", "Daniel Craig", "Daniel Radcliffe", "David Harbour", "Denzel Washington", "Dwayne Johnson", "Elizabeth Olsen", "Emma Stone", "Emma Watson", "Ezra Miller", "Finn Wolfhard", "Florence Pugh", "Gal Gadot", "Gaten Matarazzo", "Glen Powell", "Hailee Steinfeld", "Harrison Ford", "Henry Cavill", "Hugh Jackman", "Jacob Elordi", "Jamie Lee", "Jason Momoa", "Jenna Ortega", "Jennifer Coolidge", "Jennifer Lawrence", "Jeremy Renner", "Jessica Chastain", "Joaquin Phoenix", "Joe Keery", "Johnny Depp", "Jonah Hill", "Ke Huy Quan", "Keanu Reeves", "Leonardo DiCaprio", "Margot Robbie", "Mark Ruffalo", "Matt Damon", "Matthew McConaughey", "Maya Hawke", "Michelle Yeoh", "Millie Bobby Brown", "Noah Schnapp", "Oscar Isaac", "Paul Rudd", "Pedro Pascal", "Ralph Fiennes", "Robert Downey Jr.", "Robert Pattinson", "Rupert Grint", "Ryan Gosling", "Ryan Reynolds", "Sadie Sink", "Samuel L. Jackson", "Scarlett Johansson", "Sebastian Stan", "Seth Rogen", "Steve Carell", "Sydney Sweeney", "Timothée Chalamet", "Tobey Maguire", "Tom Cruse", "Tom Cruise", "Tom Hanks", "Tom Hardy", "Tom Hiddleston", "Tom Holland", "Willem Dafoe", "Will Smith", "Winona Ryder", "Zendaya", "Zoe Kravitz"
        ],
        "🎤 Musicians & Bands": [
            "Adele", "Arctic Monkeys", "Ariana Grande", "Benson Boone", "Beyoncé", "Billie Eilish", "Blackpink", "Bruno Mars", "BTS", "Cardi B", "Charli XCX", "Coldplay", "Doja Cat", "Drake", "Dua Lipa", "Ed Sheeran", "Elton John", "Eminem", "Harry Styles", "Hozier", "Imagine Dragons", "Justin Bieber", "Katy Perry", "Kendrick Lamar", "Lady Gaga", "Lana Del Rey", "Lil Nas X", "Lorde", "Miley Cyrus", "Nicki Minaj", "Olivia Rodrigo", "Post Malone", "Rihanna", "Sabrina Carpenter", "Sam Smith", "Shakira", "Snoop Dogg", "Tate McRae", "Taylor Swift", "The Weeknd"
        ],
        "🌍 Politicians, World Leaders & Royalty": [
            "Donald Trump", "Joe Biden", "Kamala Harris", "Keir Starmer", "King Charles III", "Meghan Markle", "Narendra Modi", "Pope Francis", "Prince Harry", "Rishi Sunak", "Vladimir Putin", "Volodymyr Zelenskyy", "Xi Jinping"
        ],
        "📱 Internet Personalities, Media & Reality TV": [
            "Charli D'Amelio", "IShowSpeed", "Joe Rogan", "Kai Cenat", "Kim Kardashian", "Kylie Jenner", "Mia Khalifa", "Mr Beast", "Riley Reid", "Tucker Carlson"
        ],
        "⚽️ Athletes": [
            "Cristiano Ronaldo", "Lewis Hamilton", "Lionel Messi", "Max Verstappen", "Mbappé", "Novak Djokovic", "Simone Biles", "Stephen Curry", "Tom Brady"
        ],
        "💼 Business & Technology Leaders": [
            "Bill Gates", "Elon Musk", "Jeff Bezos", "Mark Zuckberg", "Sam Altman", "Tim Cook"
        ],
        "🐉 Fictional Characters": [
            "Barbie", "Grogu", "John Wick", "Ken", "Wednesday Addams"
        ],
        "📜 Historical Figures": [
            "Isaac Newton"
        ],
        "📢 Activists & Other Public Figures": [
            "Greta Thunberg", "Jeffrey Epstein"
        ]
    };

    let selectedCategories = new Set();

    if (categoriesGrid) {
        Object.keys(categoriesData).forEach(category => {
            const btn = document.createElement('button');
            btn.className = 'neon-btn secondary category-btn';
            btn.innerText = category;
            btn.addEventListener('click', () => {
                if (selectedCategories.has(category)) {
                    selectedCategories.delete(category);
                    btn.classList.remove('category-selected');
                } else {
                    selectedCategories.add(category);
                    btn.classList.add('category-selected');
                }
            });
            categoriesGrid.appendChild(btn);
        });
    }

    if (addCategoriesBtn) {
        addCategoriesBtn.addEventListener('click', () => {
            if (selectedCategories.size === 0) {
                categoriesModal.classList.add('hidden');
                return;
            }

            const currentText = wordListInput.value.trim();
            let currentWords = currentText ? currentText.split('\n').map(w => w.trim()).filter(w => w.length > 0) : [];
            let currentWordsLower = new Set(currentWords.map(w => w.toLowerCase()));

            selectedCategories.forEach(cat => {
                categoriesData[cat].forEach(w => {
                    if (!currentWordsLower.has(w.toLowerCase())) {
                        currentWords.push(w);
                        currentWordsLower.add(w.toLowerCase());
                    }
                });
            });

            wordListInput.value = currentWords.join('\n');
            categoriesModal.classList.add('hidden');
        });
    }

    if (removeCategoriesBtn) {
        removeCategoriesBtn.addEventListener('click', () => {
            if (selectedCategories.size === 0) {
                categoriesModal.classList.add('hidden');
                return;
            }

            const currentText = wordListInput.value.trim();
            if (!currentText) {
                categoriesModal.classList.add('hidden');
                return;
            }
            let currentWords = currentText.split('\n').map(w => w.trim()).filter(w => w.length > 0);

            let wordsToRemove = new Set();
            selectedCategories.forEach(cat => {
                categoriesData[cat].forEach(w => wordsToRemove.add(w.toLowerCase()));
            });

            currentWords = currentWords.filter(w => !wordsToRemove.has(w.toLowerCase()));
            wordListInput.value = currentWords.join('\n');
            categoriesModal.classList.add('hidden');
        });
    }

    if (clearListBtn) {
        clearListBtn.addEventListener('click', () => {
            wordListInput.value = '';
            selectedCategories.clear();
            document.querySelectorAll('.category-btn').forEach(btn => btn.classList.remove('category-selected'));
            categoriesModal.classList.add('hidden');
        });
    }

    if (categoriesBtn) {
        categoriesBtn.addEventListener('click', () => {
            selectedCategories.clear();
            document.querySelectorAll('.category-btn').forEach(btn => btn.classList.remove('category-selected'));
            categoriesModal.classList.remove('hidden');
        });
    }

    if (closeCategoriesBtn) {
        closeCategoriesBtn.addEventListener('click', () => {
            categoriesModal.classList.add('hidden');
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

    if (reviewWordsBtn) {
        reviewWordsBtn.addEventListener('click', () => {
            reviewModal.classList.remove('hidden');
        });
    }

    if (closeReviewBtn) {
        closeReviewBtn.addEventListener('click', () => {
            reviewModal.classList.add('hidden');
        });
    }

    if (closeSettingsBtn) {
        // Toggle Custom Time Input
        timeSelect.addEventListener('change', () => {
            if (timeSelect.value === 'custom') {
                customTimeInput.classList.remove('hidden');
            } else {
                customTimeInput.classList.add('hidden');
            }
        });

        closeSettingsBtn.addEventListener('click', () => {
            if (timeSelect.value === 'custom') {
                let customMinutes = parseInt(customTimeInput.value);
                if (isNaN(customMinutes) || customMinutes < 1) customMinutes = 1;
                if (customMinutes > 60) customMinutes = 60;
                settingGameTime = customMinutes * 60;
            } else {
                settingGameTime = parseInt(timeSelect.value);
            }

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
        correctWordsArr = [];
        skippedWordsArr = [];

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
        correctWordsArr.push(words[currentWordIndex]);
        recordAnswerTime();
        playSound('correct');
        score++;
        triggerVisualFeedback('correct');
        advanceGame();
    }

    function markSkip() {
        if (!isPlaying || tiltCooldown) return;
        console.log("🟠 [DEBUG] Action: SKIP. Word was:", words[currentWordIndex]);
        skippedWordsArr.push(words[currentWordIndex]);
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

        // Heuristic for "Shout it Out" across devices (avoiding Gimbal lock on iOS)
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

        // Populate Review Lists
        correctWordsList.innerHTML = '';
        skippedWordsList.innerHTML = '';

        correctWordsArr.forEach(word => {
            const li = document.createElement('li');
            li.textContent = word;
            correctWordsList.appendChild(li);
        });

        skippedWordsArr.forEach(word => {
            const li = document.createElement('li');
            li.textContent = word;
            skippedWordsList.appendChild(li);
        });
    }

    // --- Restart ---
    restartBtn.addEventListener('click', () => {
        endScreen.classList.add('hidden');
        setupScreen.classList.remove('hidden');
        // Purposely NOT clearing wordListInput.value so words persist for the next round
    });

    if (restartRemoveBtn) {
        restartRemoveBtn.addEventListener('click', () => {
            endScreen.classList.add('hidden');
            setupScreen.classList.remove('hidden');

            // Remove played words from the textarea
            const playedWordsText = words.slice(0, currentWordIndex).map(w => w.toLowerCase());

            const rawText = wordListInput.value;
            const originalWords = rawText.split('\n').map(w => w.trim()).filter(w => w.length > 0);

            const remainingWords = originalWords.filter(w => !playedWordsText.includes(w.toLowerCase()));

            wordListInput.value = remainingWords.join('\n');
        });
    }
});