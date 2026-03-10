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
    const priorityWordListInput = document.getElementById('priority-word-list');
    const priorityWordCounterEl = document.getElementById('priority-word-counter');
    const priorityFrequencySelect = document.getElementById('priority-frequency');
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
    const mainMenuReviewBtn = document.getElementById('main-menu-review-btn');
    const correctWordsList = document.getElementById('correct-words-list');
    const skippedWordsList = document.getElementById('skipped-words-list');
    const lastGameStatsContainer = document.getElementById('last-game-stats-container');
    const lastGameScoreEl = document.getElementById('last-game-score');
    const lastGameDetailedStatsEl = document.getElementById('last-game-detailed-stats');
    const playerNameInput = document.getElementById('player-name-input');
    const lastGamePlayerNameEl = document.getElementById('last-game-player-name');
    const finalPlayerNameEl = document.getElementById('final-player-name');
    const exportCsvBtn = document.getElementById('export-csv-btn');
    const exportTxtBtn = document.getElementById('export-txt-btn');
    const playScreenWrapper = document.getElementById('play-screen-wrapper');
    const mainNavPlaceholder = document.getElementById('main-nav-placeholder');
    const pauseSliderArea = document.getElementById('pause-slider-area');
    const pauseSlider = document.getElementById('pause-slider');
    const pauseModal = document.getElementById('pause-modal');
    const resumeBtn = document.getElementById('resume-btn');
    const pauseTimerDisplay = document.getElementById('pause-timer-display');
    const pauseScoreDisplay = document.getElementById('pause-score-display');
    const pauseEndKeepBtn = document.getElementById('pause-end-keep-btn');
    const pauseEndRemoveBtn = document.getElementById('pause-end-remove-btn');
    const multiPersonToggle = document.getElementById('multi-person-toggle');
    const multiPersonSettings = document.getElementById('multi-person-settings');
    const phrasesPerPlayerInput = document.getElementById('phrases-per-player');
    const passTimeInput = document.getElementById('pass-time');
    const passScreen = document.getElementById('pass-screen');
    const passCountdownEl = document.getElementById('pass-countdown');

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
    let currentPlayerName = '';
    let isPaused = false;
    let isPassingPhone = false;
    let phrasesShownInCurrentTurn = 0;

    // --- Settings State ---
    let settingGameTime = 60;
    let settingSensitivity = 45; // angle threshold
    let settingTiltEnabled = true;
    let settingRandomizeEnabled = true;
    let settingSoundEnabled = true;
    let settingShowButtons = true;
    let settingShowGoBack = true;
    let settingShowPastWord = true;
    let settingMultiPersonEnabled = false;
    let settingPhrasesPerPlayer = 3;
    let settingPassTime = 5;

    // --- Audio System ---
    const correctAudio = new Audio('Correct.mp3');
    const skipAudio = new Audio('Skip.mp3');
    const endAudio = new Audio('End.mp3');
    const countdownAudio = new Audio('Countdown.mp3');
    const uiAudio = new Audio('ui-sound.mp3');
    const thirtySecAudio = new Audio('30-Seconds-Remaining.mp3');
    const oneMinAudio = new Audio('1-minute-remaing.mp3');
    const twoMinAudio = new Audio('2-minutes-remaing.mp3');
    const passAudio = new Audio('pass.mp3');

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
        } else if (type === '30sec') {
            thirtySecAudio.currentTime = 0;
            thirtySecAudio.play().catch(e => console.log('Audio error:', e));
        } else if (type === '1min') {
            oneMinAudio.currentTime = 0;
            oneMinAudio.play().catch(e => console.log('Audio error:', e));
        } else if (type === '2min') {
            twoMinAudio.currentTime = 0;
            twoMinAudio.play().catch(e => console.log('Audio error:', e));
        } else if (type === 'ui') {
            uiAudio.currentTime = 0;
            uiAudio.play().catch(e => console.log('Audio error:', e));
        } else if (type === 'pass') {
            passAudio.currentTime = 0;
            passAudio.play().catch(e => console.log('Audio error:', e));
        }
    }

    function stopSound(type) {
        if (type === 'countdown') {
            countdownAudio.pause();
            countdownAudio.currentTime = 0;
        } else if (type === 'all') {
            countdownAudio.pause();
            thirtySecAudio.pause();
            oneMinAudio.pause();
            twoMinAudio.pause();
            uiAudio.pause();
            passAudio.pause();
            countdownAudio.currentTime = 0;
            thirtySecAudio.currentTime = 0;
            oneMinAudio.currentTime = 0;
            twoMinAudio.currentTime = 0;
            uiAudio.currentTime = 0;
            passAudio.currentTime = 0;
        }
    }

    // iOS Safari requires sound to be triggered by a direct user interaction first
    let audioInitialized = false;
    function initializeAudio() {
        if (audioInitialized) return;

        // Play and immediately pause all sounds silently
        const sounds = [correctAudio, skipAudio, endAudio, countdownAudio, uiAudio, thirtySecAudio, oneMinAudio, twoMinAudio, passAudio];
        sounds.forEach(audio => {
            audio.volume = 0; // mute temporarily
            audio.play().then(() => {
                audio.pause();
                audio.currentTime = 0;
                audio.volume = 1; // restore volume
            }).catch(e => console.log('Audio init error:', e));
        });
        audioInitialized = true;
    }

    // Global UI Click Sound logic
    document.addEventListener('click', (e) => {
        const btn = e.target.tagName === 'BUTTON' ? e.target : e.target.closest('button');
        if (btn) {
            if (btn.id === 'skip-btn' || btn.id === 'correct-btn' || btn.classList.contains('category-btn')) {
                return; // Exclude gameplay/category ones that don't need UI sound
            }
            playSound('ui');
        }
    });

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
            "Abraham Lincoln", "Albert Einstein", "Alexander the Great", "Aristotle", "Buddha", "Charles Darwin", "Cleopatra", "Confucius", "Galileo Galilei", "Genghis Khan", "George Washington", "Isaac Newton", "Jesus Christ", "Joan of Arc", "Julius Caesar", "Leonardo da Vinci", "Mahatma Gandhi", "Marie Curie", "Mark Twain", "Martin Luther King Jr.", "Michelangelo", "Moses", "Mother Teresa", "Muhammad", "Napoleon Bonaparte", "Nikola Tesla", "Pablo Picasso", "Plato", "Queen Elizabeth II", "Queen Victoria", "Sigmund Freud", "Socrates", "Steve Jobs", "Thomas Edison", "Vincent van Gogh", "William Shakespeare", "Winston Churchill"
        ],
        "🌍 Countries": [
            "Afghanistan", "Albania", "Algeria", "Argentina", "Australia", "Austria", "Bahamas", "Bangladesh", "Belgium", "Bolivia", "Brazil", "Canada", "Chile", "China", "Colombia", "Costa Rica", "Croatia", "Cuba", "Cyprus", "Czech Republic", "Denmark", "Dominican Republic", "Ecuador", "Egypt", "Ethiopia", "Fiji", "Finland", "France", "Germany", "Ghana", "Greece", "Guatemala", "Haiti", "Honduras", "Hungary", "Iceland", "India", "Indonesia", "Iran", "Iraq", "Ireland", "Israel", "Italy", "Jamaica", "Japan", "Jordan", "Kenya", "Kuwait", "Lebanon", "Libya", "Madagascar", "Malaysia", "Maldives", "Mali", "Mexico", "Monaco", "Mongolia", "Morocco", "Nepal", "Netherlands", "New Zealand", "Nigeria", "North Korea", "Norway", "Pakistan", "Panama", "Peru", "Philippines", "Poland", "Portugal", "Qatar", "Romania", "Russia", "Saudi Arabia", "Senegal", "Serbia", "Singapore", "Slovakia", "South Africa", "South Korea", "Spain", "Sri Lanka", "Sudan", "Sweden", "Switzerland", "Syria", "Taiwan", "Thailand", "Turkey", "Ukraine", "United Arab Emirates", "United Kingdom", "United States", "Uruguay", "Uzbekistan", "Vatican City", "Venezuela", "Vietnam", "Zimbabwe"
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
        if (wordCounterEl) {
            const text = wordListInput.value.trim();
            if (!text) {
                wordCounterEl.innerText = "0 words";
            } else {
                const count = text.split('\n').map(w => w.trim()).filter(w => w.length > 0).length;
                wordCounterEl.innerText = `${count} word${count === 1 ? '' : 's'}`;
            }
        }
        if (priorityWordCounterEl && priorityWordListInput) {
            const prioText = priorityWordListInput.value.trim();
            if (!prioText) {
                priorityWordCounterEl.innerText = "0 words";
            } else {
                const count = prioText.split('\n').map(w => w.trim()).filter(w => w.length > 0).length;
                priorityWordCounterEl.innerText = `${count} word${count === 1 ? '' : 's'}`;
            }
        }
    }

    if (wordListInput) {
        wordListInput.addEventListener('input', () => {
            updateWordCount();
            localStorage.setItem('SHOUT_IT_OUT_NORMAL_WORDS', wordListInput.value);
        });

        // Load from local storage or pre-load Historical Figures if empty
        const savedNormalWords = localStorage.getItem('SHOUT_IT_OUT_NORMAL_WORDS');
        if (savedNormalWords !== null) {
            wordListInput.value = savedNormalWords;
            updateWordCount();
        } else if (wordListInput.value.trim() === '') {
            const defaultCategory = "📜 Historical Figures";
            if (categoriesData[defaultCategory]) {
                wordListInput.value = categoriesData[defaultCategory].join('\n');
                updateWordCount();
                localStorage.setItem('SHOUT_IT_OUT_NORMAL_WORDS', wordListInput.value);

                // Add to selected UI state so user knows it's active
                selectedCategories.add(defaultCategory);
            }
        }
    }

    if (priorityWordListInput) {
        priorityWordListInput.addEventListener('input', () => {
            updateWordCount();
            localStorage.setItem('SHOUT_IT_OUT_PRIORITY_WORDS', priorityWordListInput.value);
        });

        const savedPriorityWords = localStorage.getItem('SHOUT_IT_OUT_PRIORITY_WORDS');
        if (savedPriorityWords !== null) {
            priorityWordListInput.value = savedPriorityWords;
            updateWordCount();
        }
    }

    if (categoriesGrid) {
        Object.keys(categoriesData).forEach(category => {
            const btn = document.createElement('button');
            btn.className = 'neon-btn secondary category-btn';

            // Apply selected styling on load if it's the default category we preloaded
            if (selectedCategories.has(category)) {
                btn.classList.add('category-selected');
            }

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
            localStorage.setItem('SHOUT_IT_OUT_NORMAL_WORDS', wordListInput.value);
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
            localStorage.setItem('SHOUT_IT_OUT_NORMAL_WORDS', wordListInput.value);
            categoriesModal.classList.add('hidden');
        });
    }

    if (clearListBtn) {
        clearListBtn.addEventListener('click', () => {
            wordListInput.value = '';
            updateWordCount();
            localStorage.setItem('SHOUT_IT_OUT_NORMAL_WORDS', '');
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
            if (multiPersonToggle) {
                multiPersonToggle.checked = settingMultiPersonEnabled;
                if (settingMultiPersonEnabled) multiPersonSettings.classList.remove('hidden');
                else multiPersonSettings.classList.add('hidden');
            }
            if (phrasesPerPlayerInput) phrasesPerPlayerInput.value = settingPhrasesPerPlayer;
            if (passTimeInput) passTimeInput.value = settingPassTime;

            setupScreen.classList.add('hidden');
            settingsScreen.classList.remove('hidden');
        });
    }

    if (tiltToggle && sensitivitySelect && showButtonsToggle) {
        tiltToggle.addEventListener('change', (e) => {
            sensitivitySelect.disabled = !e.target.checked;

            // Prevent both from being disabled
            if (!e.target.checked) {
                showButtonsToggle.disabled = true;
                showButtonsToggle.parentElement.style.opacity = '0.5';
            } else {
                showButtonsToggle.disabled = false;
                showButtonsToggle.parentElement.style.opacity = '1';
            }
        });

        showButtonsToggle.addEventListener('change', (e) => {
            // Prevent both from being disabled
            if (!e.target.checked) {
                tiltToggle.disabled = true;
                tiltToggle.parentElement.style.opacity = '0.5';
            } else {
                tiltToggle.disabled = false;
                tiltToggle.parentElement.style.opacity = '1';
            }
        });

        // Initial state load
        sensitivitySelect.disabled = !tiltToggle.checked;
        if (!tiltToggle.checked) {
            showButtonsToggle.disabled = true;
            showButtonsToggle.parentElement.style.opacity = '0.5';
        }
        if (!showButtonsToggle.checked) {
            tiltToggle.disabled = true;
            tiltToggle.parentElement.style.opacity = '0.5';
        }
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

    if (mainMenuReviewBtn) {
        mainMenuReviewBtn.addEventListener('click', () => {
            reviewModal.classList.remove('hidden');
        });
    }

    if (exportCsvBtn) {
        exportCsvBtn.addEventListener('click', () => {
            let nameToExport = currentPlayerName ? currentPlayerName : "Anonymous";

            const totalPlayed = currentWordIndex;
            let percentage = totalPlayed > 0 ? Math.round((score / totalPlayed) * 100) : 0;
            let fastestTime = "N/A";
            let averageTime = "N/A";
            if (answerTimes.length > 0) {
                fastestTime = Math.min(...answerTimes).toFixed(1) + "s";
                const sumTimes = answerTimes.reduce((a, b) => a + b, 0);
                averageTime = (sumTimes / answerTimes.length).toFixed(1) + "s";
            }

            let csvContent = `"Shout It Out Game Stats"\n`;
            csvContent += `"Player Name","${nameToExport}"\n`;
            csvContent += `"Score","${score}"\n`;
            csvContent += `"Correct out of Total","${score} out of ${totalPlayed} (${percentage}%)"\n`;
            csvContent += `"Fastest Guess","${fastestTime}"\n`;
            csvContent += `"Avg. Time per Word","${averageTime}"\n\n`;
            csvContent += `"Player Name","Word","Correctness","Time Taken","Is Priority"\n`;

            correctWordsArr.forEach(wordObj => {
                let prioMarker = wordObj.isPriority ? "*" : "";
                // Escape quotes in word just in case
                let cleanWord = wordObj.text.replace(/"/g, '""');
                let timeStr = wordObj.timeTaken ? wordObj.timeTaken.toFixed(1) + "s" : "N/A";
                csvContent += `"${nameToExport}","${cleanWord}","Correct","${timeStr}","${prioMarker}"\n`;
            });

            skippedWordsArr.forEach(wordObj => {
                let prioMarker = wordObj.isPriority ? "*" : "";
                let cleanWord = wordObj.text.replace(/"/g, '""');
                let timeStr = wordObj.timeTaken ? wordObj.timeTaken.toFixed(1) + "s" : "N/A";
                csvContent += `"${nameToExport}","${cleanWord}","Skipped","${timeStr}","${prioMarker}"\n`;
            });

            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.setAttribute("href", url);
            link.setAttribute("download", `shout_it_out_${nameToExport.replace(/\s+/g, '_')}_stats.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        });
    }

    if (exportTxtBtn) {
        exportTxtBtn.addEventListener('click', () => {
            let txtContent = "";
            let nameToExport = currentPlayerName ? currentPlayerName : "Anonymous";

            const totalPlayed = currentWordIndex;
            let percentage = totalPlayed > 0 ? Math.round((score / totalPlayed) * 100) : 0;
            let fastestTime = "N/A";
            let averageTime = "N/A";
            if (answerTimes.length > 0) {
                fastestTime = Math.min(...answerTimes).toFixed(1) + "s";
                const sumTimes = answerTimes.reduce((a, b) => a + b, 0);
                averageTime = (sumTimes / answerTimes.length).toFixed(1) + "s";
            }

            txtContent += "--- Shout It Out Game Stats ---\n\n";
            txtContent += `Player Name: ${nameToExport}\n`;
            txtContent += `Score: ${score}\n`;
            txtContent += `${score} correct out of ${totalPlayed} (${percentage}%)\n`;
            txtContent += `Fastest Guess: ${fastestTime}\n`;
            txtContent += `Avg. Time per Word: ${averageTime}\n\n`;

            txtContent += `--- Correct Words ---\n`;
            if (correctWordsArr.length === 0) txtContent += "None\n";
            correctWordsArr.forEach(wordObj => {
                let prioMarker = wordObj.isPriority ? " *" : "";
                let timeStr = wordObj.timeTaken ? ` (${wordObj.timeTaken.toFixed(1)}s)` : "";
                txtContent += `- ${wordObj.text}${timeStr}${prioMarker}\n`;
            });

            txtContent += `\n--- Skipped Words ---\n`;
            if (skippedWordsArr.length === 0) txtContent += "None\n";
            skippedWordsArr.forEach(wordObj => {
                let prioMarker = wordObj.isPriority ? " *" : "";
                let timeStr = wordObj.timeTaken ? ` (${wordObj.timeTaken.toFixed(1)}s)` : "";
                txtContent += `- ${wordObj.text}${timeStr}${prioMarker}\n`;
            });

            const blob = new Blob([txtContent], { type: 'text/plain;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.setAttribute("href", url);
            link.setAttribute("download", `shout_it_out_${nameToExport.replace(/\s+/g, '_')}_stats.txt`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
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

        if (multiPersonToggle) {
            multiPersonToggle.addEventListener('change', (e) => {
                if (e.target.checked) multiPersonSettings.classList.remove('hidden');
                else multiPersonSettings.classList.add('hidden');
            });
        }

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

            if (multiPersonToggle) settingMultiPersonEnabled = multiPersonToggle.checked;
            if (phrasesPerPlayerInput) settingPhrasesPerPlayer = parseInt(phrasesPerPlayerInput.value) || 3;
            if (passTimeInput) settingPassTime = parseInt(passTimeInput.value) || 5;

            settingsScreen.classList.add('hidden');
            setupScreen.classList.remove('hidden');
        });
    }

    startBtn.addEventListener('click', async () => {
        console.log("🔵 [DEBUG] Start button clicked.");

        // Initialize audio payload for Safari iOS
        if (settingSoundEnabled) {
            initializeAudio();
        }

        // Parse user input
        const rawText = wordListInput.value.trim();
        const rawPrioText = priorityWordListInput ? priorityWordListInput.value.trim() : '';
        currentPlayerName = playerNameInput ? playerNameInput.value.trim() : '';

        if (!rawText && !rawPrioText) {
            console.warn("🟠 [DEBUG] Input is empty. User needs to provide words.");
            alertMessage.innerText = "Please enter some words first!";
            alertModal.classList.remove('hidden');
            return;
        }

        // Split by new line, clean up empty strings
        let normalWords = rawText ? rawText.split('\n').map(w => w.trim()).filter(w => w.length > 0) : [];
        let priorityWords = rawPrioText ? rawPrioText.split('\n').map(w => w.trim()).filter(w => w.length > 0) : [];

        // Shuffle words dynamically based on setting
        if (settingRandomizeEnabled) {
            // Fisher-Yates shuffle for true randomness
            for (let i = normalWords.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [normalWords[i], normalWords[j]] = [normalWords[j], normalWords[i]];
            }
            for (let i = priorityWords.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [priorityWords[i], priorityWords[j]] = [priorityWords[j], priorityWords[i]];
            }
            console.log("🔵 [DEBUG] Words loaded and shuffled.");
        } else {
            console.log("🔵 [DEBUG] Words loaded in original order.");
        }

        // Interleave priority words
        words = [];
        const freqStr = priorityFrequencySelect ? priorityFrequencySelect.value : "3";
        const frequency = parseInt(freqStr);

        let normalIdx = 0;
        let prioIdx = 0;
        let counter = 1;

        while (normalIdx < normalWords.length || prioIdx < priorityWords.length) {
            if ((counter % frequency === 0 && prioIdx < priorityWords.length) || normalIdx >= normalWords.length) {
                words.push({ text: priorityWords[prioIdx], isPriority: true });
                prioIdx++;
            } else if (normalIdx < normalWords.length) {
                words.push({ text: normalWords[normalIdx], isPriority: false });
                normalIdx++;
            }
            counter++;
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
        phrasesShownInCurrentTurn = 0;
        isPassingPhone = false;
        if (passScreen) passScreen.classList.add('hidden');

        // Initialize Timer Display
        updateTimerDisplay();

        // Switch UI Screens
        setupScreen.classList.add('hidden');
        endScreen.classList.add('hidden');
        if (mainNavPlaceholder) mainNavPlaceholder.classList.add('hidden');
        playScreenWrapper.classList.remove('hidden');
        isPaused = false;
        if (pauseSlider) pauseSlider.value = 0;

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
        if (gameInterval) clearInterval(gameInterval);
        gameInterval = setInterval(() => {
            if (isPaused || isPassingPhone) return;
            timer--;
            updateTimerDisplay();

            if (timer === 120) {
                playSound('2min');
            } else if (timer === 60) {
                playSound('1min');
            } else if (timer === 30) {
                playSound('30sec');
            } else if (timer === 10) {
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
        timerEl.innerText = `Time: ${m}:${s.toString().padStart(2, '0')}`;

        if (timer <= 10) {
            timerEl.classList.add('timer-warning');
        } else {
            timerEl.classList.remove('timer-warning');
        }
    }

    function showNextWord() {
        if (currentWordIndex >= words.length) {
            endGame();
            return;
        }

        // Setup the past word text (if we have one and setting is enabled)
        if (settingShowPastWord && currentWordIndex > 0 && pastWordEl) {
            pastWordEl.innerText = words[currentWordIndex - 1].text;
            if (words[currentWordIndex - 1].isPriority) {
                pastWordEl.classList.add('priority-word');
            } else {
                pastWordEl.classList.remove('priority-word');
            }
            pastWordEl.classList.remove('hidden');
        } else if (pastWordEl) {
            pastWordEl.classList.add('hidden');
            pastWordEl.innerText = '';
        }

        // Apply roll-in animation to the new current word
        currentWordEl.classList.remove('roll-in');
        void currentWordEl.offsetWidth; // Trigger reflow

        const newWord = words[currentWordIndex].text;
        currentWordEl.innerText = newWord;

        // Dynamically scale text based on length
        const wordLength = newWord.length;
        let dynamicFontSize = "12rem"; // Huge max size for short words

        if (wordLength > 20) {
            dynamicFontSize = "4rem";
        } else if (wordLength > 15) {
            dynamicFontSize = "6rem";
        } else if (wordLength > 10) {
            dynamicFontSize = "8rem";
        } else if (wordLength > 5) {
            dynamicFontSize = "10rem";
        }

        // Apply media query specific overrides if on mobile
        if (window.innerWidth <= 768 || window.innerHeight <= 600) {
            if (wordLength > 20) {
                dynamicFontSize = "2rem";
            } else if (wordLength > 15) {
                dynamicFontSize = "2.5rem";
            } else if (wordLength > 10) {
                dynamicFontSize = "3.2rem";
            } else if (wordLength > 5) {
                dynamicFontSize = "4rem";
            } else {
                dynamicFontSize = "5rem";
            }
        }

        currentWordEl.style.fontSize = dynamicFontSize;

        if (words[currentWordIndex].isPriority) {
            currentWordEl.classList.add('priority-word');
        } else {
            currentWordEl.classList.remove('priority-word');
        }

        currentWordEl.classList.add('roll-in');

        currentWordStartTime = performance.now();
        console.log(`🔵 [DEBUG] Displaying word: ${words[currentWordIndex].text}`);

        if (settingShowGoBack && currentWordIndex > 0) {
            if (goBackBtn) goBackBtn.classList.remove('hidden');
        } else {
            if (goBackBtn) goBackBtn.classList.add('hidden');
        }
    }

    // --- Go Back ---
    if (goBackBtn) {
        goBackBtn.addEventListener('click', () => {
            if (!isPlaying || tiltCooldown || currentWordIndex === 0 || isPaused || isPassingPhone) return;
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
        words[currentWordIndex].timeTaken = timeTakenMs / 1000;
    }

    function markCorrect() {
        if (!isPlaying || tiltCooldown || isPaused || isPassingPhone) return;
        console.log("🟢 [DEBUG] Action: CORRECT. Word was:", words[currentWordIndex].text);
        correctWordsArr.push(words[currentWordIndex]);
        recordAnswerTime();
        playSound('correct');
        score++;
        triggerVisualFeedback('correct');
        advanceGame();
    }

    function markSkip() {
        if (!isPlaying || tiltCooldown || isPaused || isPassingPhone) return;
        console.log("🟠 [DEBUG] Action: SKIP. Word was:", words[currentWordIndex].text);
        skippedWordsArr.push(words[currentWordIndex]);
        recordAnswerTime();
        playSound('skip');
        triggerVisualFeedback('skip');
        advanceGame();
    }

    function advanceGame() {
        tiltCooldown = true;
        currentWordIndex++;
        phrasesShownInCurrentTurn++;

        // Trigger transition out animation
        if (settingShowPastWord && currentWordEl && pastWordEl) {
            currentWordEl.classList.add('transition-up');
        }

        setTimeout(() => {
            if (currentWordEl) currentWordEl.classList.remove('transition-up');

            if (settingMultiPersonEnabled && phrasesShownInCurrentTurn >= settingPhrasesPerPlayer && currentWordIndex < words.length) {
                startPassScreen();
            } else {
                showNextWord();
                tiltCooldown = false;
            }
        }, 400); // Wait for transition animation
    }

    function startPassScreen() {
        isPassingPhone = true;
        phrasesShownInCurrentTurn = 0;
        playSound('pass'); // Sound for pass start
        if (passScreen) passScreen.classList.remove('hidden');
        if (playScreen) playScreen.classList.add('disabled-game');

        let passTimerLimit = settingPassTime;
        if (passCountdownEl) passCountdownEl.innerText = passTimerLimit;

        const passInterval = setInterval(() => {
            passTimerLimit--;
            if (passTimerLimit <= 0) {
                clearInterval(passInterval);
                if (passScreen) passScreen.classList.add('hidden');
                if (playScreen) playScreen.classList.remove('disabled-game');
                isPassingPhone = false;
                playSound('ui'); // Sound for turn completion
                showNextWord();
                tiltCooldown = false;
            } else {
                if (passCountdownEl) passCountdownEl.innerText = passTimerLimit;
            }
        }, 1000);
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
        if (!isPlaying || tiltCooldown || !settingTiltEnabled || isPaused || isPassingPhone) return;

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
        if (!isPlaying || tiltCooldown || isPaused) return;
        if (e.key === 'ArrowUp') {
            markCorrect();
        } else if (e.key === 'ArrowDown') {
            markSkip();
        }
    });

    // --- End Game Flow ---
    function generateStatsHtml() {
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
        return statsHtml;
    }

    function endGame() {
        console.log(`🔴 [DEBUG] Game Over. Final Score: ${score}`);
        isPlaying = false;
        clearInterval(gameInterval);

        stopSound('all');
        playSound('end');

        playScreenWrapper.classList.add('hidden');
        if (mainNavPlaceholder) mainNavPlaceholder.classList.remove('hidden');
        playScreen.classList.remove('disabled-game');
        pauseSliderArea.classList.remove('disabled-game');
        pauseModal.classList.add('hidden');
        if (pauseSlider) pauseSlider.value = 0;

        endScreen.classList.remove('hidden');

        if (currentPlayerName) {
            finalPlayerNameEl.innerText = currentPlayerName;
            finalPlayerNameEl.classList.remove('hidden');
        } else {
            finalPlayerNameEl.innerText = '';
            finalPlayerNameEl.classList.add('hidden');
        }

        finalScoreEl.innerText = `Score: ${score}`;

        finalStatsEl.innerHTML = generateStatsHtml();

        // Populate Review Lists
        correctWordsList.innerHTML = '';
        skippedWordsList.innerHTML = '';

        let allReviewedWords = [...correctWordsArr, ...skippedWordsArr];
        let maxTimeTaken = Math.max(1, ...allReviewedWords.map(w => w.timeTaken || 0));

        function createWordListItem(wordObj) {
            const li = document.createElement('li');
            li.style.display = 'flex';
            li.style.flexDirection = 'column';
            li.style.gap = '8px';
            li.style.marginBottom = '12px';
            li.style.padding = '8px 12px';
            li.style.background = 'rgba(255, 255, 255, 0.05)';
            li.style.borderRadius = '8px';
            li.style.borderBottom = 'none'; // reset css

            const topRow = document.createElement('div');
            topRow.style.display = 'flex';
            topRow.style.justifyContent = 'space-between';
            topRow.style.alignItems = 'center';
            topRow.style.gap = '10px';

            const wordSpan = document.createElement('span');
            wordSpan.textContent = wordObj.text;
            wordSpan.style.fontWeight = '600';
            wordSpan.style.wordBreak = 'break-word';
            if (wordObj.isPriority) wordSpan.classList.add('priority-word');

            let timeVal = wordObj.timeTaken || 0;
            const timeSpan = document.createElement('span');
            timeSpan.style.fontSize = '0.9rem';
            timeSpan.style.opacity = '0.8';
            timeSpan.style.whiteSpace = 'nowrap';
            timeSpan.textContent = timeVal.toFixed(1) + 's';

            topRow.appendChild(wordSpan);
            topRow.appendChild(timeSpan);

            const barContainer = document.createElement('div');
            barContainer.style.width = '100%';
            barContainer.style.height = '6px';
            barContainer.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
            barContainer.style.borderRadius = '3px';
            barContainer.style.overflow = 'hidden';

            const barFill = document.createElement('div');
            barFill.style.height = '100%';

            let percent = maxTimeTaken > 0 ? (timeVal / maxTimeTaken) : 0;
            barFill.style.width = `${Math.max(2, percent * 100)}%`;

            let hue = (1 - percent) * 120; // 0 = red (long time), 120 = green (short time)
            barFill.style.backgroundColor = `hsl(${hue}, 80%, 50%)`;
            barFill.style.borderRadius = '3px';

            barContainer.appendChild(barFill);

            li.appendChild(topRow);
            li.appendChild(barContainer);

            return li;
        }

        correctWordsArr.forEach(wordObj => {
            correctWordsList.appendChild(createWordListItem(wordObj));
        });

        skippedWordsArr.forEach(wordObj => {
            skippedWordsList.appendChild(createWordListItem(wordObj));
        });
    }

    // --- Restart ---
    function updateMainMenuStats() {
        if (currentPlayerName) {
            lastGamePlayerNameEl.innerText = currentPlayerName;
            lastGamePlayerNameEl.classList.remove('hidden');
        } else {
            lastGamePlayerNameEl.innerText = '';
            lastGamePlayerNameEl.classList.add('hidden');
        }
        lastGameScoreEl.innerText = `Score: ${score} `;
        lastGameDetailedStatsEl.innerHTML = generateStatsHtml();
        lastGameStatsContainer.classList.remove('hidden');
    }

    restartBtn.addEventListener('click', () => {
        stopSound('all');
        endScreen.classList.add('hidden');
        updateMainMenuStats();
        setupScreen.classList.remove('hidden');
        // Purposely NOT clearing wordListInput.value so words persist for the next round
    });

    if (restartRemoveBtn) {
        restartRemoveBtn.addEventListener('click', () => {
            stopSound('all');
            endScreen.classList.add('hidden');
            updateMainMenuStats();
            setupScreen.classList.remove('hidden');

            // Remove played words from the textareas
            const playedNormalText = words.slice(0, currentWordIndex).filter(w => !w.isPriority).map(w => w.text.toLowerCase());
            const playedPriorityText = words.slice(0, currentWordIndex).filter(w => w.isPriority).map(w => w.text.toLowerCase());

            const rawText = wordListInput.value;
            const originalWords = rawText.split('\n').map(w => w.trim()).filter(w => w.length > 0);
            const remainingWords = originalWords.filter(w => !playedNormalText.includes(w.toLowerCase()));
            wordListInput.value = remainingWords.join('\n');

            if (priorityWordListInput) {
                const rawPrioText = priorityWordListInput.value;
                const originalPrioWords = rawPrioText.split('\n').map(w => w.trim()).filter(w => w.length > 0);
                const remainingPrioWords = originalPrioWords.filter(w => !playedPriorityText.includes(w.toLowerCase()));
                priorityWordListInput.value = remainingPrioWords.join('\n');
            }

            updateWordCount();

            // Save to cache locally
            localStorage.setItem('SHOUT_IT_OUT_NORMAL_WORDS', wordListInput.value);
            if (priorityWordListInput) {
                localStorage.setItem('SHOUT_IT_OUT_PRIORITY_WORDS', priorityWordListInput.value);
            }
            showToast("Words list has been saved to cache locally.");
        });
    }

    if (pauseSlider) {
        let validSlide = false;

        function checkValidSlide(clientX) {
            const rect = pauseSlider.getBoundingClientRect();
            const clickPosition = (clientX - rect.left) / rect.width;
            validSlide = clickPosition < 0.3;
        }

        pauseSlider.addEventListener('mousedown', (e) => {
            checkValidSlide(e.clientX);
        });

        pauseSlider.addEventListener('touchstart', (e) => {
            if (e.touches && e.touches.length > 0) {
                checkValidSlide(e.touches[0].clientX);
            }
        }, { passive: true });

        pauseSlider.addEventListener('input', (e) => {
            if (!validSlide && e.target.value > 10) {
                e.target.value = 0;
                return;
            }
            if (e.target.value > 90) {
                if (!isPaused) {
                    isPaused = true;
                    playScreen.classList.add('disabled-game');
                    pauseSliderArea.classList.add('disabled-game');

                    if (pauseTimerDisplay) {
                        const m = Math.floor(timer / 60);
                        const s = timer % 60;
                        pauseTimerDisplay.innerText = `Time: ${m}:${s.toString().padStart(2, '0')}`;
                    }
                    if (pauseScoreDisplay) {
                        const totalPlayed = currentWordIndex;
                        const percentage = totalPlayed > 0 ? Math.round((score / totalPlayed) * 100) : 0;
                        pauseScoreDisplay.innerText = `${score} correct out of ${totalPlayed} (${percentage}%)`;
                    }

                    pauseModal.classList.remove('hidden');
                }
            }
        });
        pauseSlider.addEventListener('change', (e) => {
            if (e.target.value <= 90) {
                e.target.value = 0; // snap back if not full
            }
        });
    }

    if (resumeBtn) {
        resumeBtn.addEventListener('click', () => {
            isPaused = false;
            playScreen.classList.remove('disabled-game');
            pauseSliderArea.classList.remove('disabled-game');
            pauseModal.classList.add('hidden');
            pauseSlider.value = 0;
        });
    }

    function goBackToStartMenu(removeUsed) {
        isPaused = false;
        clearInterval(gameInterval);
        isPlaying = false;
        stopSound('all');

        playScreenWrapper.classList.add('hidden');
        if (mainNavPlaceholder) mainNavPlaceholder.classList.remove('hidden');
        playScreen.classList.remove('disabled-game');
        pauseSliderArea.classList.remove('disabled-game');
        pauseModal.classList.add('hidden');
        if (pauseSlider) pauseSlider.value = 0;

        updateMainMenuStats();
        setupScreen.classList.remove('hidden');

        if (removeUsed) {
            // Remove played words from the textareas
            const playedNormalText = words.slice(0, currentWordIndex).filter(w => !w.isPriority).map(w => w.text.toLowerCase());
            const playedPriorityText = words.slice(0, currentWordIndex).filter(w => w.isPriority).map(w => w.text.toLowerCase());

            const rawText = wordListInput.value;
            const originalWords = rawText.split('\n').map(w => w.trim()).filter(w => w.length > 0);
            const remainingWords = originalWords.filter(w => !playedNormalText.includes(w.toLowerCase()));
            wordListInput.value = remainingWords.join('\n');

            if (priorityWordListInput) {
                const rawPrioText = priorityWordListInput.value;
                const originalPrioWords = rawPrioText.split('\n').map(w => w.trim()).filter(w => w.length > 0);
                const remainingPrioWords = originalPrioWords.filter(w => !playedPriorityText.includes(w.toLowerCase()));
                priorityWordListInput.value = remainingPrioWords.join('\n');
            }

            updateWordCount();

            localStorage.setItem('SHOUT_IT_OUT_NORMAL_WORDS', wordListInput.value);
            if (priorityWordListInput) {
                localStorage.setItem('SHOUT_IT_OUT_PRIORITY_WORDS', priorityWordListInput.value);
            }
            showToast("Words list has been updated and saved to cache.");
        }
    }

    if (pauseEndKeepBtn) {
        pauseEndKeepBtn.addEventListener('click', () => {
            goBackToStartMenu(false);
        });
    }

    if (pauseEndRemoveBtn) {
        pauseEndRemoveBtn.addEventListener('click', () => {
            goBackToStartMenu(true);
        });
    }
});

function showToast(message) {
    const toast = document.createElement('div');
    toast.innerText = message;
    toast.style.position = 'fixed';
    toast.style.bottom = '20px';
    toast.style.left = '50%';
    toast.style.transform = 'translateX(-50%)';
    toast.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
    toast.style.color = '#fff';
    toast.style.padding = '10px 20px';
    toast.style.borderRadius = '8px';
    toast.style.zIndex = '10000';
    toast.style.fontFamily = "'Outfit', sans-serif";
    toast.style.fontSize = '0.95rem';
    toast.style.boxShadow = '0 0 10px rgba(0, 210, 255, 0.5)';
    toast.style.border = '1px solid rgba(0, 210, 255, 0.3)';
    toast.style.transition = 'opacity 0.3s ease-in-out';
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => {
            if (document.body.contains(toast)) {
                document.body.removeChild(toast);
            }
        }, 300);
    }, 3000);
}