console.log("Game Initialization Started...");

// --- CONFIGURATION ---
const MIN_WORD_LENGTH = 3;
let GRID_SIZE = 4;

const DICTIONARY_URL = "https://raw.githubusercontent.com/dwyl/english-words/master/words_alpha.txt";

// --- AUDIO SYSTEM (Zero Latency Pool) ---

// 1. Preload general sounds
const audioCorrect = new Audio('assets/sounds/correct.mp3');
const audioWrong = new Audio('assets/sounds/wrong.mp3');
const audioSpecial = new Audio('assets/sounds/special.mp3');

// 2. Create a pool for Click sounds (5 copies to allow overlapping)
const CLICK_POOL = [];
for(let i=0; i<5; i++) {
    const a = new Audio('assets/sounds/click.mp3');
    a.preload = 'auto'; // Force load
    CLICK_POOL.push(a);
}
let clickPoolIndex = 0;

function playSound(type) {
    if (type === 'click') {
        // Use the pool for clicks
        const sound = CLICK_POOL[clickPoolIndex];
        sound.currentTime = 0;
        sound.play().catch(e => {}); // Ignore interaction errors
        clickPoolIndex = (clickPoolIndex + 1) % CLICK_POOL.length; // Rotate index
    } else {
        // Use standard objects for others
        let sound;
        if (type === 'correct') sound = audioCorrect;
        else if (type === 'special') sound = audioSpecial;
        else if (type === 'wrong') sound = audioWrong;
        
        // Clone for overlap on special sounds too, or just reset
        // Cloning is safer for rapid Correct answers
        if (sound) {
            const temp = sound.cloneNode();
            temp.play().catch(e => {});
        }
    }
}

const DICE_SOURCE = [
    "AAEEGN", "ABBJOO", "ACHOPS", "AFFKPS",
    "AOOTTW", "CIMOTU", "DEILRX", "DELRVY",
    "DISTTY", "EEGHNW", "EEINSU", "EHRTVW",
    "EIOSST", "ELRTTY", "HIMNQU", "HLNNRZ",
    "AAEEGN", "ABBJOO", "ACHOPS", "AFFKPS",
    "AOOTTW", "CIMOTU", "DEILRX", "DELRVY",
    "DISTTY", "EEGHNW", "EEINSU", "EHRTVW",
    "EIOSST", "ELRTTY", "HIMNQU", "HLNNRZ"
];

const FLOWERS = ["🌸", "🌹", "🌻", "🌼", "🌷", "🪷", "🌺", "💐", "🍀", "🍄"];

// --- STATE VARIABLES ---
let grid = []; 
let selectedTiles = []; 
let foundWords = new Set();
let dictionarySet = new Set();
let possibleWords = [];
let score = 0;
let isDictionaryLoaded = false;

const tileLocks = {}; 

let currentHintWord = null;
let hintStep = 0;
let magicLetterUsed = false;

// --- DOM ELEMENTS ---
const gridEl = document.getElementById('boggle-grid');
const currentWordEl = document.getElementById('current-word');
const messageEl = document.getElementById('message-area');
const scoreEl = document.getElementById('current-score');
const flowerPatchEl = document.getElementById('flower-patch');
const foundWordsListEl = document.getElementById('found-words-list');
const resetBtn = document.getElementById('reset-btn');
const startScreen = document.getElementById('start-screen');
const gameContainer = document.getElementById('game-container');
const loadingStatus = document.getElementById('loading-text');
const progressBar = document.getElementById('progress-bar');
const loadingContainer = document.getElementById('loading-container');
const startOptions = document.getElementById('start-options');
const magicBtn = document.getElementById('magic-btn');
const hintBtn = document.getElementById('hint-btn');

// --- INITIALIZATION ---

function loadDictionary() {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", DICTIONARY_URL, true);
    
    xhr.onprogress = function(event) {
        if (event.lengthComputable) {
            const percentComplete = (event.loaded / event.total) * 100;
            progressBar.style.width = percentComplete + "%";
            loadingStatus.innerText = `Downloading... ${Math.round(percentComplete)}%`;
        } else {
            loadingStatus.innerText = "Downloading Dictionary... (Please wait)";
            progressBar.style.width = "50%";
        }
    };

    xhr.onload = function() {
        if (xhr.status === 200) {
            const text = xhr.responseText;
            const words = text.split(/\r?\n/);
            dictionarySet = new Set(words.map(w => w.toUpperCase().trim()));
            isDictionaryLoaded = true;
            
            progressBar.style.width = "100%";
            loadingStatus.innerText = "Dictionary Ready!";
            loadingStatus.style.color = "#2ecc71";
            
            setTimeout(() => {
                loadingContainer.style.display = 'none';
                startOptions.style.display = 'flex';
                void startOptions.offsetWidth; 
                startOptions.style.opacity = '1';
            }, 500);
        } else {
            loadingStatus.innerText = "Error loading dictionary.";
        }
    };

    xhr.onerror = function() {
        loadingStatus.innerText = "Network Error. Check internet connection.";
    };

    xhr.send();
}

loadDictionary();

window.startGame = function(size) {
    if(!isDictionaryLoaded) return;
    GRID_SIZE = size;
    startScreen.style.display = 'none';
    gameContainer.style.display = 'flex';
    gridEl.style.gridTemplateColumns = `repeat(${GRID_SIZE}, 1fr)`;
    initGame();
};

resetBtn.addEventListener('click', () => {
    if(confirm("Go back to menu?")) {
        gameContainer.style.display = 'none';
        startScreen.style.display = 'flex';
        resetSelection();
    }
});

// --- GAME LOGIC ---

function initGame() {
    foundWords.clear();
    score = 0;
    scoreEl.innerText = "0";
    flowerPatchEl.innerHTML = "";
    foundWordsListEl.innerHTML = '<span class="placeholder-text">...</span>';
    messageEl.innerText = "Tap letters to form words!";
    messageEl.style.color = "#ffeb3b";
    possibleWords = [];
    
    resetSelection();
    generateGrid();
    renderGrid();
    
    setTimeout(solveGrid, 500); 
}

function generateGrid() {
    let availableDice = [];
    while(availableDice.length < GRID_SIZE * GRID_SIZE) {
        availableDice = availableDice.concat(DICE_SOURCE);
    }
    const shuffledDice = availableDice.sort(() => Math.random() - 0.5);
    grid = [];
    for (let r = 0; r < GRID_SIZE; r++) {
        let row = [];
        for (let c = 0; c < GRID_SIZE; c++) {
            const die = shuffledDice[r * GRID_SIZE + c];
            const char = die[Math.floor(Math.random() * die.length)];
            row.push(char === "Q" ? "Qu" : char); 
        }
        grid.push(row);
    }
}

function renderGrid() {
    gridEl.innerHTML = '';
    const newGrid = gridEl.cloneNode(false);
    gridEl.parentNode.replaceChild(newGrid, gridEl);
    const container = document.getElementById('boggle-grid');

    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            const tile = document.createElement('div');
            tile.className = 'tile';
            tile.dataset.row = r;
            tile.dataset.col = c;
            tile.innerText = grid[r][c];
            
            // Mouse Interaction
            tile.addEventListener('mousedown', (e) => {
                if (!isTouchActive) toggleTile(r, c);
            });

            // Drag Interaction
            tile.addEventListener('mouseenter', (e) => {
                if (e.buttons === 1 && !isTouchActive) {
                    addTileOnly(r, c);
                }
            });

            container.appendChild(tile);
        }
    }

    container.addEventListener('touchstart', handleTouchStart, {passive: false});
    container.addEventListener('touchmove', handleTouchMove, {passive: false});
    container.addEventListener('touchend', handleTouchEnd);
}

// --- INPUT HANDLERS (TILE SPECIFIC DEBOUNCE) ---

let isTouchActive = false;
let touchTimer = null;

function toggleTile(r, c) {
    const key = `${r},${c}`;
    const now = Date.now();

    if (tileLocks[key] && now - tileLocks[key] < 1000) {
        return; // Locked
    }

    tileLocks[key] = now;

    const existingIndex = selectedTiles.findIndex(t => t.row === r && t.col === c);

    if (existingIndex !== -1) {
        selectedTiles.splice(existingIndex, 1);
        playSound('click');
    } else {
        const char = grid[r][c];
        selectedTiles.push({ row: r, col: c, char: char });
        playSound('click');
    }
    updateGridVisuals();
    updateCurrentWordDisplay();
}

function addTileOnly(r, c) {
    const key = `${r},${c}`;
    const now = Date.now();

    if (tileLocks[key] && now - tileLocks[key] < 500) {
        return; 
    }
    tileLocks[key] = now;
    
    const isSelected = selectedTiles.some(t => t.row === r && t.col === c);
    if (!isSelected) {
        const char = grid[r][c];
        selectedTiles.push({ row: r, col: c, char: char });
        playSound('click');
        updateGridVisuals();
        updateCurrentWordDisplay();
    }
}

// TOUCH LOGIC
let lastTouchedTile = null;

function handleTouchStart(e) {
    e.preventDefault(); 
    isTouchActive = true;
    clearTimeout(touchTimer);
    touchTimer = setTimeout(() => { isTouchActive = false; }, 1000);

    const touch = e.touches[0];
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    
    if (el && el.classList.contains('tile')) {
        const r = parseInt(el.dataset.row);
        const c = parseInt(el.dataset.col);
        lastTouchedTile = {r, c};
        toggleTile(r, c); 
    }
}

function handleTouchMove(e) {
    e.preventDefault(); 
    const touch = e.touches[0];
    const el = document.elementFromPoint(touch.clientX, touch.clientY);

    if (el && el.classList.contains('tile')) {
        const r = parseInt(el.dataset.row);
        const c = parseInt(el.dataset.col);
        
        if (!lastTouchedTile || lastTouchedTile.r !== r || lastTouchedTile.c !== c) {
            lastTouchedTile = {r, c};
            addTileOnly(r, c);
        }
    }
}

function handleTouchEnd(e) {
    e.preventDefault();
    lastTouchedTile = null;
}

// --- VISUALS ---

function updateGridVisuals() {
    const allTiles = document.querySelectorAll('.tile');
    allTiles.forEach(t => t.classList.remove('selected'));

    selectedTiles.forEach(t => {
        if(t.row !== -1) {
            const el = document.querySelector(`.tile[data-row="${t.row}"][data-col="${t.col}"]`);
            if (el) el.classList.add('selected');
        }
    });
}

function updateCurrentWordDisplay() {
    const word = selectedTiles.map(t => t.char).join('');
    currentWordEl.innerText = word.length > 0 ? word : "_ _ _";
}

function showMessage(msg, type) {
    messageEl.innerText = msg;
    if(type === "success") messageEl.style.color = "#2ecc71";
    else if (type === "warning") messageEl.style.color = "#e74c3c";
    else messageEl.style.color = "#ffeb3b";
}

// --- SOLVER & HINTS ---

function solveGrid() {
    const boardCounts = {};
    for(let r=0; r<GRID_SIZE; r++) {
        for(let c=0; c<GRID_SIZE; c++) {
            let char = grid[r][c].toUpperCase().replace("QU", "Q");
            boardCounts[char] = (boardCounts[char] || 0) + 1;
        }
    }

    possibleWords = [];

    for (const word of dictionarySet) {
        if (word.length < MIN_WORD_LENGTH) continue;
        if (word.length > GRID_SIZE * GRID_SIZE) continue;

        const wordCounts = {};
        let canForm = true;
        for (const char of word) {
            wordCounts[char] = (wordCounts[char] || 0) + 1;
        }

        for (const char in wordCounts) {
            if (!boardCounts[char] || boardCounts[char] < wordCounts[char]) {
                canForm = false;
                break;
            }
        }
        if (canForm) possibleWords.push(word);
    }
    possibleWords.sort((a,b) => a.length - b.length);
}

hintBtn.addEventListener('click', () => {
    document.querySelectorAll('.hint-flash').forEach(el => el.classList.remove('hint-flash'));

    if (!currentHintWord || foundWords.has(currentHintWord)) {
        
        const unfound = possibleWords.filter(w => !foundWords.has(w));
        
        if(unfound.length === 0) {
            showMessage("No more words found!", "info");
            currentHintWord = null;
            return;
        }
        currentHintWord = unfound[0];
        hintStep = 0;
    }

    if (hintStep < currentHintWord.length) {
        const charToFind = currentHintWord[hintStep];
        let foundTile = null;
        
        const tiles = Array.from(document.querySelectorAll('.tile'));
        tiles.sort(() => Math.random() - 0.5);

        for (let t of tiles) {
             if (t.innerText.includes(charToFind) || (charToFind === 'Q' && t.innerText === 'Qu')) {
                 foundTile = t;
                 break;
             }
        }

        if (foundTile) {
            foundTile.classList.add('hint-flash');
            setTimeout(() => foundTile.classList.remove('hint-flash'), 2000);
            showMessage(`Hint: Letter ${hintStep+1} is ${charToFind}`, "info");
            hintStep++;
        }
    } else {
        showMessage(`Word was: ${currentHintWord}`, "info");
        currentHintWord = null;
    }
});

// --- SUBMIT & MAGIC ---

magicBtn.addEventListener('click', () => {
    const now = Date.now();
    if(tileLocks['magic'] && now - tileLocks['magic'] < 1000) return;
    tileLocks['magic'] = now;

    if(magicLetterUsed) {
        showMessage("Only 1 Magic Letter per word!", "warning");
        return;
    }
    selectedTiles.push({ row: -1, col: -1, char: "?" });
    magicLetterUsed = true;
    updateCurrentWordDisplay();
    playSound('click');
});

document.getElementById('clear-btn').addEventListener('click', () => {
    resetSelection();
    showMessage("Start a new word", "neutral");
});

document.getElementById('submit-btn').addEventListener('click', submitWord);

function submitWord() {
    const now = Date.now();
    if(tileLocks['submit'] && now - tileLocks['submit'] < 1000) return;
    tileLocks['submit'] = now;

    const btn = document.getElementById('submit-btn');
    btn.style.opacity = "0.5";
    btn.innerText = "Wait...";

    setTimeout(() => {
        btn.style.opacity = "1";
        btn.innerText = "✅ CHECK WORD";
    }, 1000); 

    let word = selectedTiles.map(t => t.char).join('').toUpperCase();

    if (word.length < MIN_WORD_LENGTH) {
        showMessage("Too short! Need 3+ letters.", "warning");
        playSound('wrong');
        return;
    }

    let finalWord = null;

    if (word.includes("?")) {
        const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        for (let letter of alphabet) {
            const testWord = word.replace("?", letter);
            if (dictionarySet.has(testWord)) {
                finalWord = testWord; 
                break; 
            }
        }
        
        if (!finalWord) {
            showMessage("No word matches!", "warning");
            playSound('wrong');
            // AUTOMATIC CLEAR ON WRONG
            setTimeout(resetSelection, 800);
            return;
        }
    } else {
        finalWord = word;
    }

    if (foundWords.has(finalWord)) {
        showMessage(`Already found "${finalWord}"!`, "info");
        playSound('wrong');
        // AUTOMATIC CLEAR ON DUPLICATE
        setTimeout(resetSelection, 800);
    } else if (dictionarySet.has(finalWord)) {
        foundWords.add(finalWord);
        
        let points = 1;
        if (finalWord.length >= 5) points = 3;
        else if (finalWord.length === 4) points = 2;
        
        score += points;
        scoreEl.innerText = score;
        
        showMessage(`Great! "${finalWord}"`, "success");
        growFlower();
        addWordToList(finalWord);
        resetSelection();

        // SPECIAL SOUND CHECK (Length > 5 means 6, 7, 8...)
        if (finalWord.length > 5) {
            playSound('special');
        } else {
            playSound('correct');
        }

    } else {
        showMessage("Not in dictionary.", "warning");
        playSound('wrong');
        // AUTOMATIC CLEAR ON WRONG
        setTimeout(resetSelection, 800);
    }
}

function resetSelection() {
    selectedTiles = [];
    magicLetterUsed = false;
    updateGridVisuals();
    updateCurrentWordDisplay();
}

function addWordToList(word) {
    const placeholder = foundWordsListEl.querySelector('.placeholder-text');
    if (placeholder) placeholder.remove();
    const tag = document.createElement('span');
    tag.className = 'word-tag';
    tag.innerText = word;
    foundWordsListEl.prepend(tag);
}

function growFlower() {
    const flower = document.createElement('div');
    flower.className = 'flower';
    flower.innerText = FLOWERS[Math.floor(Math.random() * FLOWERS.length)];
    flowerPatchEl.appendChild(flower);
}