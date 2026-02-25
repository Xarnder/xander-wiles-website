document.addEventListener('DOMContentLoaded', () => {
    // Fulfilling requirement: Starting database in production mode.
    console.log("🟢 [DEBUG] Database started in production mode (Local Array Storage).");

    // --- DOM Elements ---
    const setupScreen = document.getElementById('setup-screen');
    const settingsScreen = document.getElementById('settings-screen');
    const playScreen = document.getElementById('play-screen');
    const endScreen = document.getElementById('end-screen');
    const wordListInput = document.getElementById('word-list');
    const wordCounterEl = document.getElementById('word-counter');
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
    const showButtonsToggle = document.getElementById('show-buttons-toggle');
    const showGoBackToggle = document.getElementById('show-goback-toggle');
    const showPastWordToggle = document.getElementById('show-pastword-toggle');
    const alertModal = document.getElementById('alert-modal');
    const alertCloseBtn = document.getElementById('alert-close-btn');
    const alertMessage = document.getElementById('alert-message');
    const goBackBtn = document.getElementById('go-back-btn');
    const instructionsBtn = document.getElementById('instructions-btn');
    const instructionsModal = document.getElementById('instructions-modal');
    const closeInstructionsBtn = document.getElementById('close-instructions-btn');
    const pastWordEl = document.getElementById('past-word');
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
    let waitingForNeutral = false;
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
    let settingShowButtons = true;
    let settingShowGoBack = true;
    let settingShowPastWord = true;

    // --- Audio System ---
    const correctAudio = new Audio('Correct.mp3');
    const skipAudio = new Audio('Skip.mp3');
    const endAudio = new Audio('End.mp3');
    const countdownAudio = new Audio('Countdown.mp3');

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
        } else if (type === 'countdown') {
            // Don't reset time for countdown so it plays smoothly from where it is
            countdownAudio.play().catch(e => console.log('Audio error:', e));
        }
    }

    function stopSound(type) {
        if (type === 'countdown') {
            countdownAudio.pause();
            countdownAudio.currentTime = 0;
        }
    }

    // --- Event Listeners: Settings & Interaction ---
    const categoriesData = {
        "🎬 Actors & Actresses": [
            "Adam Driver", "Adam Sandler", "Amber Heard", "Ana de Armas", "Andrew Garfield", "Anne Hathaway", "Anthony Mackie", "Anya Taylor-Joy", "Austin Butler", "Ben Affleck", "Benedict Cumberbatch", "Brad Pitt", "Bradley Cooper", "Brendan Fraser", "Caleb McLaughlin", "Charlize Theron", "Chris Evans", "Chris Hemsworth", "Chris Pine", "Christian Bale", "Cillian Murphy", "Colin Farrell", "Daisy Ridley", "Daniel Craig", "Daniel Radcliffe", "David Harbour", "Denzel Washington", "Dwayne Johnson", "Elizabeth Olsen", "Emma Stone", "Emma Watson", "Ezra Miller", "Finn Wolfhard", "Florence Pugh", "Gal Gadot", "Gaten Matarazzo", "Glen Powell", "Hailee Steinfeld", "Harrison Ford", "Henry Cavill", "Hugh Jackman", "Jacob Elordi", "Jamie Lee", "Jason Momoa", "Jenna Ortega", "Jennifer Coolidge", "Jennifer Lawrence", "Jeremy Renner", "Jessica Chastain", "Joaquin Phoenix", "Joe Keery", "Johnny Depp", "Jonah Hill", "Ke Huy Quan", "Keanu Reeves", "Leonardo DiCaprio", "Margot Robbie", "Mark Ruffalo", "Matt Damon", "Matthew McConaughey", "Maya Hawke", "Michelle Yeoh", "Millie Bobby Brown", "Noah Schnapp", "Oscar Isaac", "Paul Rudd", "Pedro Pascal", "Ralph Fiennes", "Robert Downey Jr.", "Robert Pattinson", "Rupert Grint", "Ryan Gosling", "Ryan Reynolds", "Sadie Sink", "Samuel L. Jackson", "Scarlett Johansson", "Sebastian Stan", "Seth Rogen", "Steve Carell", "Sydney Sweeney", "Timothée Chalamet", "Tobey Maguire", "Tom Cruise", "Tom Hanks", "Tom Hardy", "Tom Hiddleston", "Tom Holland", "Will Smith", "Willem Dafoe", "Winona Ryder", "Zendaya", "Zoe Kravitz"
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
            "Bill Gates", "Elon Musk", "Jeff Bezos", "Mark Zuckerberg", "Sam Altman", "Tim Cook"
        ],
        "🐉 Fictional Characters": [
            "Agent Smith", "Ahsoka Tano", "Albus Dumbledore", "Alice", "Alien", "Aragorn", "Arya Stark", "Barbie", "Bart Simpson", "Batman", "Beatrix Kiddo", "Bilbo Baggins", "Black Panther", "Black Widow", "Bowser", "Bugs Bunny", "Buzz Lightyear", "Captain America", "Chewbacca", "Daenerys Targaryen", "Darth Vader", "Deadpool", "Doctor Strange", "Dominic Toretto", "Donkey", "Dorothy Gale", "Dracula", "Dwight Schrute", "Eleven", "Ellen Ripley", "Elsa", "Ethan Hunt", "Forrest Gump", "Frankenstein", "Freddy Krueger", "Frodo Baggins", "Furiosa", "Gandalf", "Geralt of Rivia", "Godzilla", "Goku", "Grogu", "Groot", "Gru", "Han Solo", "Hannibal Lecter", "Harley Quinn", "Harry Potter", "Hermione Granger", "Homer Simpson", "Hulk", "Indiana Jones", "Iron Man", "Jack Sparrow", "James Bond", "James T. Kirk", "Jason Bourne", "Jason Voorhees", "Jaws", "Jesse Pinkman", "Jim Hopper", "John Wick", "Jon Snow", "Katniss Everdeen", "Ken", "King Arthur", "King Kong", "Kratos", "Lara Croft", "Legolas", "Link", "Loki", "Lord Voldemort", "Luigi", "Luke Skywalker", "Mario", "Mary Poppins", "Master Chief", "Michael Myers", "Michael Scott", "Mickey Mouse", "Moana", "Monkey D. Luffy", "Mulan", "Mummy", "Naruto Uzumaki", "Neo", "Obi-Wan Kenobi", "Olaf", "Pennywise", "Peter Pan", "Pikachu", "Po", "Predator", "Princess Leia", "Princess Peach", "Rambo", "Robin Hood", "RoboCop", "Rocket Raccoon", "Rocky Balboa", "Ron Weasley", "Sarah Connor", "Saul Goodman", "Scarlet Witch", "Scooby-Doo", "Severus Snape", "Sherlock Holmes", "Shrek", "Simba", "Sonic the Hedgehog", "Spider-Man", "Spock", "SpongeBob SquarePants", "Star-Lord", "Steve Harrington", "Stitch", "Superman", "Terminator", "Thanos", "The Doctor", "The Grinch", "The Joker", "The Mandalorian", "Thor", "Tony Soprano", "Trinity", "Tyrion Lannister", "Walter White", "Wednesday Addams", "Werewolf", "Willy Wonka", "Wolverine", "Wonder Woman", "Woody", "Yoda", "Zelda", "Zorro"
        ],
        "📜 Historical Figures": [
            "Abraham Lincoln", "Albert Einstein", "Alexander the Great", "Aristotle", "Buddha", "Charles Darwin", "Cleopatra", "Confucius", "Galileo Galilei", "Genghis Khan", "George Washington", "Isaac Newton", "Jesus Christ", "Joan of Arc", "Julius Caesar", "Leonardo da Vinci", "Mahatma Gandhi", "Marie Curie", "Mark Twain", "Martin Luther King Jr.", "Michelangelo", "Moses", "Mother Teresa", "Muhammad", "Napoleon Bonaparte", "Nikola Tesla", "Pablo Picasso", "Plato", "Queen Elizabeth I", "Queen Victoria", "Sigmund Freud", "Socrates", "Steve Jobs", "Thomas Edison", "Vincent van Gogh", "William Shakespeare", "Winston Churchill"
        ],
        "📢 Activists & Other Public Figures": [
            "Greta Thunberg", "Jeffrey Epstein", "Andrew Tate"
        ],
        "📦 Common Objects": [
            "Apple", "Backpack", "Banana", "Bed", "Bookshelf", "Bus", "Car", "Chair", "Coffee Mug", "Couch", "Hat", "Keys", "Lamp", "Laptop", "Microwave", "Necklace", "Pen", "Pencil", "Phone", "Refrigerator", "Ring", "Shoes", "Sock", "Sunglasses", "Table", "Television", "Toaster", "Umbrella", "Wallet", "Watch"
        ],
        "🏅 Actual Sports": [
            "Athletics", "Badminton", "Baseball", "Basketball", "Boxing", "Cricket", "Cycling", "Football", "Golf", "Gymnastics", "Hockey", "Rowing", "Rugby", "Soccer", "Swimming", "Table Tennis", "Tennis", "Volleyball", "Wrestling"
        ],
        "🧗 Extreme Sports": [
            "BMX", "Base Jumping", "Bungee Jumping", "Cave Diving", "Kite Surfing", "Motocross", "Paragliding", "Parkour", "Rock Climbing", "Scuba Diving", "Skateboarding", "Skydiving", "Snowboarding", "Surfing", "Wakeboarding"
        ],
        "🎉 Events & Celebrations": [
            "Anniversary", "Baby Shower", "Bachelor Party", "Bachelorette Party", "Bar Mitzvah", "Birthday Party", "Engagement", "Funeral", "Graduation", "Housewarming", "Prom", "Quinceañera", "Retirement Party", "Reunion", "Wedding"
        ],
        "🚀 Space & Astronomy": [
            "Asteroid", "Black Hole", "Comet", "Constellation", "Dwarf Planet", "Eclipse", "Galaxy", "Jupiter", "Mars", "Mercury", "Meteor", "Milky Way", "Moon", "Neptune", "Orbit", "Pluto", "Saturn", "Solar System", "Star", "Sun", "Supernova", "Telescope", "Uranus", "Venus"
        ],
        "🦄 Mythical Creatures": [
            "Banshee", "Basilisk", "Centaur", "Cerberus", "Chimera", "Cyclops", "Dragon", "Fairy", "Gargoyle", "Goblin", "Gorgon", "Griffin", "Hydra", "Kraken", "Leprechaun", "Manticore", "Mermaid", "Minotaur", "Pegasus", "Phoenix", "Sasquatch", "Siren", "Sphinx", "Troll", "Unicorn", "Vampire", "Werewolf", "Yeti", "Zombie"
        ],
        "💼 Professions & Jobs": [
            "Accountant", "Actor", "Architect", "Artist", "Astronaut", "Baker", "Carpenter", "Chef", "Dentist", "Doctor", "Electrician", "Engineer", "Farmer", "Firefighter", "Judge", "Lawyer", "Mechanic", "Musician", "Nurse", "Pilot", "Plumber", "Police Officer", "Programmer", "Scientist", "Teacher", "Veterinarian", "Writer"
        ]
    };

    let selectedCategories = new Set();

    function updateWordCount() {
        if (!wordCounterEl) return;
        const text = wordListInput.value.trim();
        if (!text) {
            wordCounterEl.innerText = "0 words";
            return;
        }
        const count = text.split('\n').map(w => w.trim()).filter(w => w.length > 0).length;
        wordCounterEl.innerText = `${count} word${count === 1 ? '' : 's'}`;
    }

    if (wordListInput) {
        wordListInput.addEventListener('input', updateWordCount);
    }

    if (categoriesGrid) {
        Object.keys(categoriesData).forEach(category => {
            const btn = document.createElement('button');
            btn.className = 'neon-btn secondary category-btn';
            const categoryCount = categoriesData[category].length;
            btn.innerText = `${category} (${categoryCount})`;
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
            updateWordCount();
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
            updateWordCount();
            categoriesModal.classList.add('hidden');
        });
    }

    if (clearListBtn) {
        clearListBtn.addEventListener('click', () => {
            wordListInput.value = '';
            updateWordCount();
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
            if (tiltToggle) tiltToggle.checked = settingTiltEnabled;
            if (randomizeToggle) randomizeToggle.checked = settingRandomizeEnabled;
            if (soundToggle) soundToggle.checked = settingSoundEnabled;
            if (showButtonsToggle) showButtonsToggle.checked = settingShowButtons;
            if (showGoBackToggle) showGoBackToggle.checked = settingShowGoBack;
            if (showPastWordToggle) showPastWordToggle.checked = settingShowPastWord;

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
            if (showButtonsToggle) settingShowButtons = showButtonsToggle.checked;
            if (showGoBackToggle) settingShowGoBack = showGoBackToggle.checked;
            if (showPastWordToggle) settingShowPastWord = showPastWordToggle.checked;

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

        if (!settingShowButtons) {
            skipBtn.classList.add('hidden');
            correctBtn.classList.add('hidden');
        } else {
            skipBtn.classList.remove('hidden');
            correctBtn.classList.remove('hidden');
        }

        // Manage Instruction Visibility
        if (settingTiltEnabled && (!hasTiltedUp || !hasTiltedDown)) {
            instructionTextEl.classList.remove('hidden');
        } else {
            instructionTextEl.classList.add('hidden');
        }

        if (pastWordEl) {
            pastWordEl.innerText = '';
            pastWordEl.classList.add('hidden');
        }

        showNextWord();

        // Start Timer
        gameInterval = setInterval(() => {
            timer--;
            updateTimerDisplay();

            if (timer === 10) {
                playSound('countdown');
            }

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

        // Setup the past word text (if we have one and setting is enabled)
        if (settingShowPastWord && currentWordIndex > 0 && pastWordEl) {
            pastWordEl.innerText = words[currentWordIndex - 1];
            pastWordEl.classList.remove('hidden');
        } else if (pastWordEl) {
            pastWordEl.classList.add('hidden');
            pastWordEl.innerText = '';
        }

        // Apply roll-in animation to the new current word
        currentWordEl.classList.remove('roll-in');
        void currentWordEl.offsetWidth; // Trigger reflow
        currentWordEl.innerText = words[currentWordIndex];
        currentWordEl.classList.add('roll-in');

        currentWordStartTime = performance.now();
        console.log(`🔵 [DEBUG] Displaying word: ${words[currentWordIndex]}`);

        if (settingShowGoBack && currentWordIndex > 0) {
            if (goBackBtn) goBackBtn.classList.remove('hidden');
        } else {
            if (goBackBtn) goBackBtn.classList.add('hidden');
        }
    }

    // --- Go Back ---
    if (goBackBtn) {
        goBackBtn.addEventListener('click', () => {
            if (!isPlaying || tiltCooldown || currentWordIndex === 0) return;
            tiltCooldown = true;

            const prevWord = words[currentWordIndex - 1];

            if (correctWordsArr.length > 0 && correctWordsArr[correctWordsArr.length - 1] === prevWord) {
                correctWordsArr.pop();
                score--;
            } else if (skippedWordsArr.length > 0 && skippedWordsArr[skippedWordsArr.length - 1] === prevWord) {
                skippedWordsArr.pop();
            }

            if (answerTimes.length > 0) {
                answerTimes.pop();
            }

            currentWordIndex--;

            triggerVisualFeedback('back');

            // Apply special "roll-back" animation
            if (pastWordEl) {
                pastWordEl.classList.add('roll-out-reverse');
            }
            currentWordEl.classList.add('roll-out-reverse');

            setTimeout(() => {
                if (pastWordEl) pastWordEl.classList.remove('roll-out-reverse');
                currentWordEl.classList.remove('roll-out-reverse');
                showNextWord();
                tiltCooldown = false;
            }, 300);
        });
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

        // Trigger transition out animation
        if (settingShowPastWord && currentWordEl && pastWordEl) {
            currentWordEl.classList.add('transition-up');
        }

        setTimeout(() => {
            if (currentWordEl) currentWordEl.classList.remove('transition-up');
            showNextWord();
            tiltCooldown = false;
        }, 400); // Wait for transition animation
    }

    function triggerVisualFeedback(type) {
        // Flashes the background glass card slightly
        if (type === 'correct') {
            playScreen.classList.add('flash-green');
            setTimeout(() => playScreen.classList.remove('flash-green'), 500);
        } else if (type === 'skip') {
            playScreen.classList.add('flash-red');
            setTimeout(() => playScreen.classList.remove('flash-red'), 500);
        } else if (type === 'back') {
            playScreen.classList.add('flash-yellow');
            setTimeout(() => playScreen.classList.remove('flash-yellow'), 500);
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

        let isTiltedUp = false;
        let isTiltedDown = false;

        // Heuristic for "Shout it Out" across devices (avoiding Gimbal lock on iOS)
        if (window.innerHeight < window.innerWidth) {
            // Landscape
            if (Math.abs(gamma) < 50) {
                if (Math.abs(beta) < settingSensitivity) isTiltedUp = true;
                else if (Math.abs(beta) > 180 - settingSensitivity) isTiltedDown = true;
            }
        } else {
            // Fallback for Portrait mode
            if (beta < settingSensitivity && beta > -settingSensitivity) isTiltedUp = true;
            else if (beta > 180 - settingSensitivity || beta < -180 + settingSensitivity) isTiltedDown = true;
        }

        if (waitingForNeutral) {
            // Require the phone to return outside the trigger zones to reset
            if (!isTiltedUp && !isTiltedDown) {
                waitingForNeutral = false;
            }
            return;
        }

        if (isTiltedUp) {
            console.log("📡 [DEBUG] Sensor Threshold Met: TILTED UP - Correct");
            hasTiltedUp = true;
            waitingForNeutral = true;
            updateInstructions();
            markCorrect();
        } else if (isTiltedDown) {
            console.log("📡 [DEBUG] Sensor Threshold Met: TILTED DOWN - Skip");
            hasTiltedDown = true;
            waitingForNeutral = true;
            updateInstructions();
            markSkip();
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

        stopSound('countdown');
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
        stopSound('countdown');
        endScreen.classList.add('hidden');
        setupScreen.classList.remove('hidden');
        // Purposely NOT clearing wordListInput.value so words persist for the next round
    });

    if (restartRemoveBtn) {
        restartRemoveBtn.addEventListener('click', () => {
            stopSound('countdown');
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