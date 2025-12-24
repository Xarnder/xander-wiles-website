console.log("Game Initialization Started...");

// --- CONFIGURATION ---
const MIN_WORD_LENGTH = 3;
let GRID_SIZE = 4;
const DICTIONARY_URL = "https://raw.githubusercontent.com/dwyl/english-words/master/words_alpha.txt";

// --- DOM ELEMENTS ---
const gridEl = document.getElementById('boggle-grid');
const currentWordEl = document.getElementById('current-word');
const messageEl = document.getElementById('message-area');
const scoreEl = document.getElementById('current-score');
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
const clearBtn = document.getElementById('clear-btn');
const submitBtn = document.getElementById('submit-btn');

// Custom Modal Elements
const customModal = document.getElementById('custom-modal');
const modalYes = document.getElementById('modal-yes');
const modalNo = document.getElementById('modal-no');

// --- AUDIO SYSTEM ---
const audioCorrect = new Audio('assets/sounds/correct.mp3');
const audioWrong = new Audio('assets/sounds/wrong.mp3');
const audioSpecial = new Audio('assets/sounds/special.mp3');

const CLICK_POOL = [];
for(let i=0; i<5; i++) {
    const a = new Audio('assets/sounds/click.mp3');
    a.preload = 'auto';
    CLICK_POOL.push(a);
}
let clickPoolIndex = 0;

function playSound(type) {
    if (type === 'click') {
        const sound = CLICK_POOL[clickPoolIndex];
        sound.currentTime = 0;
        sound.play().catch(e => {}); 
        clickPoolIndex = (clickPoolIndex + 1) % CLICK_POOL.length;
    } else {
        const sound = type === 'special' ? audioSpecial : 
                      type === 'correct' ? audioCorrect : audioWrong;
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

// --- 3D GARDEN & ASSET LOADING ---
let scene, camera, renderer, controls, orbitActive = false;
let PRELOADED_MODELS = []; 

// ASSET FILES
const GLB_FILES = ["flower1.glb", "flower2.glb", "flower3.glb"]; 
const FLOOR_FILE = "floor.glb";

// Tracking Loading Progress
let dictProgress = 0;
let modelProgress = 0;
let isAssetsLoaded = false;

function updateLoadingUI() {
    const total = (dictProgress * 0.5) + (modelProgress * 0.5);
    progressBar.style.width = total + "%";
    loadingStatus.innerText = `Loading Garden & Words... ${Math.round(total)}%`;

    if (total >= 100 && !isAssetsLoaded) {
        isAssetsLoaded = true;
        loadingStatus.innerText = "Ready!";
        loadingStatus.style.color = "#2ecc71";
        setTimeout(() => {
            loadingContainer.style.display = 'none';
            startOptions.style.display = 'flex';
            void startOptions.offsetWidth; 
            startOptions.style.opacity = '1';
        }, 800);
    }
}

function loadAssets() {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", DICTIONARY_URL, true);
    xhr.onprogress = (event) => {
        if (event.lengthComputable) {
            dictProgress = (event.loaded / event.total) * 100;
        } else {
            dictProgress = 50; 
        }
        updateLoadingUI();
    };
    xhr.onload = () => {
        if (xhr.status === 200) {
            const text = xhr.responseText;
            const words = text.split(/\r?\n/);
            dictionarySet = new Set(words.map(w => w.toUpperCase().trim()));
            dictProgress = 100;
            updateLoadingUI();
            loadModels();
        }
    };
    xhr.onerror = () => { loadingStatus.innerText = "Network Error (Dictionary)"; };
    xhr.send();
}

function loadModels() {
    const loader = new THREE.GLTFLoader();
    const totalModels = GLB_FILES.length; 
    let loadedCount = 0;
    
    if (totalModels === 0) {
        modelProgress = 100;
        updateLoadingUI();
        return;
    }

    GLB_FILES.forEach((fileName) => {
        loader.load(
            `assets/models/${fileName}`,
            (gltf) => {
                PRELOADED_MODELS.push(gltf.scene);
                loadedCount++;
                modelProgress = (loadedCount / totalModels) * 100;
                updateLoadingUI();
            },
            undefined, 
            (error) => {
                console.warn(`Could not load ${fileName}.`);
                loadedCount++;
                modelProgress = (loadedCount / totalModels) * 100;
                updateLoadingUI();
            }
        );
    });
}

function init3D() {
    const canvas = document.getElementById('garden-canvas');
    if (!canvas) return;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB); 

    camera = new THREE.PerspectiveCamera(60, canvas.clientWidth / canvas.clientHeight, 0.1, 1000);
    camera.position.set(0, 8, 12);

    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    controls = new THREE.OrbitControls(camera, canvas);
    controls.enableDamping = true; 
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 - 0.1; 
    controls.minDistance = 5;
    controls.maxDistance = 40;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);
    
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(10, 20, 10);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.left = -30;
    dirLight.shadow.camera.right = 30;
    dirLight.shadow.camera.top = 30;
    dirLight.shadow.camera.bottom = -30;
    scene.add(dirLight);

    const loader = new THREE.GLTFLoader();
    loader.load(
        `assets/models/${FLOOR_FILE}`,
        (gltf) => {
            const floor = gltf.scene;
            floor.scale.set(1, 1, 1); 
            floor.position.set(0, -0.1, 0); 
            floor.traverse((child) => { if (child.isMesh) child.receiveShadow = true; });
            scene.add(floor);
        },
        undefined,
        (error) => {
            const groundGeo = new THREE.PlaneGeometry(50, 50);
            const groundMat = new THREE.MeshStandardMaterial({ color: 0x4caf50 });
            const ground = new THREE.Mesh(groundGeo, groundMat);
            ground.rotation.x = -Math.PI / 2;
            ground.receiveShadow = true;
            scene.add(ground);
        }
    );

    onWindowResize();
    window.addEventListener('resize', onWindowResize, false);
    controls.addEventListener('start', () => { orbitActive = true; });
    controls.addEventListener('end', () => { orbitActive = false; });

    animate();
}

function plantNewFlower() {
    if (PRELOADED_MODELS.length === 0 || !scene) return;

    const randomIndex = Math.floor(Math.random() * PRELOADED_MODELS.length);
    const template = PRELOADED_MODELS[randomIndex];
    
    let flower;
    if (THREE.SkeletonUtils) {
        flower = THREE.SkeletonUtils.clone(template);
    } else {
        flower = template.clone();
    }

    const angle = Math.random() * Math.PI * 2;
    const radius = 1.5 + Math.random() * 10; 
    const x = Math.sin(angle) * radius;
    const z = Math.cos(angle) * radius;

    flower.position.set(x, 0, z);
    flower.rotation.y = Math.random() * Math.PI * 2;
    const scale = 1.2 + (Math.random() * 0.8); 
    flower.scale.set(scale, scale, scale);

    flower.traverse((child) => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });

    flower.userData.isFlower = true;
    scene.add(flower);

    flower.scale.set(0.1, 0.1, 0.1);
    let growFrame = 0;
    function grow() {
        if (growFrame < 20) {
            const s = 0.1 + (scale - 0.1) * (growFrame / 20); 
            flower.scale.set(s, s, s);
            growFrame++;
            requestAnimationFrame(grow);
        }
    }
    grow();
}

function onWindowResize() {
    const canvas = document.getElementById('garden-canvas');
    if (!canvas || !camera || !renderer) return;
    camera.aspect = canvas.clientWidth / canvas.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(canvas.clientWidth, canvas.clientHeight);
}

function animate() {
    requestAnimationFrame(animate);
    if(controls) controls.update();
    if(renderer && scene && camera) renderer.render(scene, camera);
}

// --- GAME STATE ---
let grid = []; 
let selectedTiles = []; 
let foundWords = new Set();
let dictionarySet = new Set();
let possibleWords = [];
let score = 0;
const tileLocks = {}; 
let currentHintWord = null;
let hintStep = 0;
let magicLetterUsed = false;
let isTouchActive = false;
let touchTimer = null;
let lastTouchedTile = null;

// --- MAIN ENTRY POINT ---
loadAssets();

window.startGame = function(size) {
    if(!isAssetsLoaded) return;
    GRID_SIZE = size;
    startScreen.style.display = 'none';
    gameContainer.style.display = 'flex';
    gridEl.style.gridTemplateColumns = `repeat(${GRID_SIZE}, 1fr)`;
    if (!scene) init3D();
    initGame();
};

resetBtn.addEventListener('click', () => {
    customModal.style.display = 'flex';
});

modalYes.addEventListener('click', () => {
    customModal.style.display = 'none';
    gameContainer.style.display = 'none';
    startScreen.style.display = 'flex';
    resetSelection();
});

modalNo.addEventListener('click', () => {
    customModal.style.display = 'none';
});

// --- GAME LOGIC ---
function initGame() {
    foundWords.clear();
    score = 0;
    scoreEl.innerText = "0";
    messageEl.innerText = "Tap letters to form words!";
    messageEl.style.color = "#ffeb3b";
    foundWordsListEl.innerHTML = '<span class="placeholder-text">...</span>';
    possibleWords = [];
    
    if (scene) {
        const toRemove = [];
        scene.traverse((child) => {
            if (child.userData.isFlower) toRemove.push(child);
        });
        toRemove.forEach(child => scene.remove(child));
    }

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
            
            tile.addEventListener('mousedown', () => { if (!isTouchActive) toggleTile(r, c); });
            tile.addEventListener('mouseenter', (e) => { 
                if (e.buttons === 1 && !isTouchActive) addTileOnly(r, c); 
            });

            container.appendChild(tile);
        }
    }

    container.addEventListener('touchstart', handleTouchStart, {passive: false});
    container.addEventListener('touchmove', handleTouchMove, {passive: false});
    container.addEventListener('touchend', handleTouchEnd);
}

// --- INPUT LOGIC ---
function toggleTile(r, c) {
    const key = `${r},${c}`;
    const now = Date.now();
    if (tileLocks[key] && now - tileLocks[key] < 1000) return;
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
    if (tileLocks[key] && now - tileLocks[key] < 500) return;
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

function handleTouchStart(e) {
    if (orbitActive) return;
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
    if (orbitActive) return;
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
    const word = selectedTiles.map(t => t.char === '?' ? '-' : t.char).join('');
    currentWordEl.innerText = word.length > 0 ? word : "_ _ _";
}

function showMessage(msg, type) {
    messageEl.innerText = msg;
    if(type === "success") messageEl.style.color = "#2ecc71";
    else if (type === "warning") messageEl.style.color = "#e74c3c";
    else messageEl.style.color = "#ffeb3b";
}

// --- SOLVER & HINT ---
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
    possibleWords.sort(() => Math.random() - 0.5);
}

// --- BUTTONS ---
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

clearBtn.addEventListener('click', () => {
    resetSelection();
    showMessage("Start a new word", "neutral");
});

submitBtn.addEventListener('click', submitWord);

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

function submitWord() {
    const now = Date.now();
    if(tileLocks['submit'] && now - tileLocks['submit'] < 1000) return;
    tileLocks['submit'] = now;

    submitBtn.style.opacity = "0.5";
    submitBtn.innerText = "Wait...";
    setTimeout(() => {
        submitBtn.style.opacity = "1";
        submitBtn.innerText = "✅ CHECK WORD";
    }, 1000); 

    let word = selectedTiles.map(t => t.char).join('').toUpperCase();

    if (word.length < MIN_WORD_LENGTH) {
        showMessage("Too short!", "warning");
        playSound('wrong');
        setTimeout(resetSelection, 800);
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
            showMessage("No match!", "warning");
            playSound('wrong');
            setTimeout(resetSelection, 800);
            return;
        }
    } else {
        finalWord = word;
    }

    if (foundWords.has(finalWord)) {
        showMessage("Already found!", "info");
        playSound('wrong');
        setTimeout(resetSelection, 800);
    } else if (dictionarySet.has(finalWord)) {
        foundWords.add(finalWord);
        score += finalWord.length > 4 ? 3 : 1;
        scoreEl.innerText = score;
        
        showMessage(`Great! "${finalWord}"`, "success");
        addWordToList(finalWord);
        resetSelection();
        
        plantNewFlower();

        if (finalWord.length > 5) playSound('special');
        else playSound('correct');

    } else {
        showMessage("Not in dictionary.", "warning");
        playSound('wrong');
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