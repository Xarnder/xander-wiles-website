console.log("Game Initialization Started...");

// --- CONFIGURATION ---
const MIN_WORD_LENGTH = 3;
let GRID_SIZE = 4;
const DICTIONARY_URL = "https://raw.githubusercontent.com/dwyl/english-words/master/words_alpha.txt";

// --- DOM ELEMENTS ---
let gridEl = document.getElementById('boggle-grid');
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
const clueDisplay = document.getElementById('clue-display');

// Custom Modal Elements
const customModal = document.getElementById('custom-modal');
const modalYes = document.getElementById('modal-yes');
const modalNo = document.getElementById('modal-no');

// --- CLUE DATABASE ---
const SIMPLE_CLUES = {
    "ANT": "Tiny insect", "ART": "Paintings", "ARM": "Body part",
    "ASK": "Question", "BAG": "Carrier", "BED": "Sleep here",
    "BEE": "Makes honey", "BIG": "Large", "BOX": "Container",
    "BOY": "Young man", "BUS": "Vehicle", "CAN": "Metal tin",
    "CAP": "Hat", "CAR": "Drive it", "CAT": "Meowing pet",
    "COW": "Says Moo", "CUP": "Drink from", "CUT": "Scissors do this",
    "DAD": "Father", "DAY": "Not night", "DOG": "Barking pet",
    "DRY": "Not wet", "EAR": "Hear with it", "EAT": "Consume food",
    "EGG": "Breakfast food", "EYE": "See with it", "FAN": "Cool air",
    "FLY": "Flying insect", "FUN": "Happy time", "GET": "Receive",
    "GOD": "Deity", "HAT": "Headwear", "HEN": "Chicken",
    "HIT": "Strike", "HOT": "Warm", "ICE": "Frozen water",
    "INK": "Pen fluid", "JAR": "Glass pot", "JOB": "Work",
    "JOY": "Happiness", "KEY": "Unlock door", "KID": "Child",
    "KIT": "Gear set", "LAW": "Rules", "LEG": "Walk with it",
    "LIP": "Mouth part", "MAN": "Adult male", "MAP": "Guide",
    "MUD": "Wet dirt", "MUG": "Coffee cup", "NAP": "Short sleep",
    "NET": "Catch fish", "NEW": "Fresh", "NUT": "Snack",
    "OIL": "Cooking liquid", "OLD": "Aged", "ONE": "Number 1",
    "OWL": "Night bird", "PAN": "Frying tool", "PEN": "Write tool",
    "PET": "Animal friend", "PIE": "Dessert", "PIG": "Oinking animal",
    "PIN": "Needle", "POT": "Cooking vessel", "RAT": "Rodent",
    "RED": "Color", "RUN": "Fast walk", "SAD": "Unhappy",
    "SEA": "Ocean", "SEE": "Look", "SET": "Ready",
    "SEW": "Stitch", "SIT": "Chair action", "SKY": "Up above",
    "SON": "Male child", "SUN": "Bright star", "TAX": "Money fee",
    "TEA": "Drink", "TEN": "Number 10", "TIE": "Neckwear",
    "TOE": "Foot digit", "TOP": "Summit", "TOY": "Plaything",
    "TWO": "Number 2", "USE": "Utilize", "VAN": "Vehicle",
    "WAR": "Battle", "WAY": "Path", "WEB": "Spider home",
    "WET": "Soaked", "WIN": "Victory", "YES": "Affirmative",
    "ZOO": "Animal park", "BALL": "Round toy", "BIRD": "Flying animal",
    "BLUE": "Sky color", "BOAT": "Water vehicle", "BOOK": "Reading",
    "CAKE": "Birthday treat", "COLD": "Freezing", "COOK": "Make food",
    "DOOR": "Entrance", "DUCK": "Quacking bird", "FACE": "Front of head",
    "FARM": "Grow food here", "FISH": "Swims", "FOOD": "Eat it",
    "FOOT": "Walk on it", "FROG": "Green hopper", "GAME": "Play",
    "GIRL": "Young female", "GOLD": "Shiny metal", "GOOD": "Nice",
    "HAIR": "On head", "HAND": "Five fingers", "HEAD": "Top of body",
    "HILL": "Small mountain", "HOME": "House", "HOPE": "Wish",
    "KING": "Ruler", "KITE": "Flies in wind", "LAKE": "Water body",
    "LAMP": "Light source", "LAND": "Ground", "LEAF": "Tree part",
    "LION": "Jungle king", "LOVE": "Heart feeling", "MILK": "White drink",
    "MOON": "Night light", "NAME": "Title", "NOSE": "Smell with it",
    "PARK": "Play area", "RAIN": "Water drops", "RING": "Jewelry for finger",
    "ROAD": "Street", "ROCK": "Stone", "ROOM": "Inside house",
    "ROSE": "Red flower", "SALT": "Seasoning", "SAND": "Beach soil",
    "SHIP": "Big boat", "SHOE": "Footwear", "SHOP": "Store",
    "SICK": "Ill", "SING": "Vocalize", "SNOW": "Winter ice",
    "SOAP": "Clean with it", "SOCK": "Foot cover", "SOUP": "Hot meal",
    "STAR": "Night sparkle", "STOP": "Halt", "TALL": "High",
    "TIME": "Clock", "TREE": "Plant", "WALK": "Stroll",
    "WIND": "Air", "WOOD": "Timber", "WORD": "Text",
    "WORK": "Job", "YEAR": "Time period"
};

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

const GLB_FILES = ["flower1.glb", "flower2.glb", "flower3.glb"]; 
const FLOOR_FILE = "floor.glb";

// Default Camera Positions
const DEFAULT_CAM_POS = new THREE.Vector3(0, 10, 18);
const DEFAULT_TARGET = new THREE.Vector3(0, 0, 0);

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
    camera.position.copy(DEFAULT_CAM_POS);

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
    controls.target.copy(DEFAULT_TARGET);
    
    controls.autoRotate = true; 
    controls.autoRotateSpeed = 1.0; 

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

function plantNewFlower(wordLength) {
    if (PRELOADED_MODELS.length === 0 || !scene) return null;

    const randomIndex = Math.floor(Math.random() * PRELOADED_MODELS.length);
    const template = PRELOADED_MODELS[randomIndex];
    
    let flower;
    if (THREE.SkeletonUtils) {
        flower = THREE.SkeletonUtils.clone(template);
    } else {
        flower = template.clone();
    }

    const angle = Math.random() * Math.PI * 2;
    const radius = 1.5 + Math.random() * 14; 
    const x = Math.sin(angle) * radius;
    const z = Math.cos(angle) * radius;

    flower.position.set(x, 0, z);
    flower.rotation.y = Math.random() * Math.PI * 2;
    
    let sizeScale = 1.0 + (wordLength - 3) * 0.3;
    if (sizeScale > 2.5) sizeScale = 2.5; 
    flower.scale.set(sizeScale, sizeScale, sizeScale);

    flower.traverse((child) => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });

    flower.userData.isFlower = true;
    scene.add(flower);

    const targetScale = sizeScale;
    flower.scale.set(0.1, 0.1, 0.1);
    let growFrame = 0;
    function grow() {
        if (growFrame < 20) {
            const s = 0.1 + (targetScale - 0.1) * (growFrame / 20); 
            flower.scale.set(s, s, s);
            growFrame++;
            requestAnimationFrame(grow);
        }
    }
    grow();

    return flower.position; 
}

// --- CAMERA ANIMATION ---
let cameraAnimation = null;

function animateCameraTo(targetPos) {
    if(!controls || !camera) return;

    orbitActive = true; 
    controls.enabled = false;
    controls.autoRotate = false; 

    const startPos = camera.position.clone();
    const startTarget = controls.target.clone();
    
    const zoomPos = new THREE.Vector3(targetPos.x, targetPos.y + 3, targetPos.z + 3);
    
    const startTime = Date.now();
    const duration = 1000; 

    function stepZoomIn() {
        const now = Date.now();
        const progress = Math.min((now - startTime) / duration, 1);
        const ease = 1 - Math.pow(1 - progress, 3); 

        camera.position.lerpVectors(startPos, zoomPos, ease);
        controls.target.lerpVectors(startTarget, targetPos, ease);
        controls.update();

        if (progress < 1) {
            cameraAnimation = requestAnimationFrame(stepZoomIn);
        } else {
            setTimeout(() => {
                stepZoomOut(zoomPos, targetPos);
            }, 2000);
        }
    }

    function stepZoomOut(currentCamPos, currentTarget) {
        const startOut = Date.now();
        
        function step() {
            const now = Date.now();
            const progress = Math.min((now - startOut) / duration, 1);
            const ease = 1 - Math.pow(1 - progress, 3);

            camera.position.lerpVectors(currentCamPos, DEFAULT_CAM_POS, ease);
            controls.target.lerpVectors(currentTarget, DEFAULT_TARGET, ease);
            controls.update();

            if (progress < 1) {
                cameraAnimation = requestAnimationFrame(step);
            } else {
                orbitActive = false;
                controls.enabled = true;
                controls.autoRotate = true; 
            }
        }
        step();
    }

    if(cameraAnimation) cancelAnimationFrame(cameraAnimation);
    stepZoomIn();
}

function onWindowResize() {
    const canvas = document.getElementById('garden-canvas');
    if (!canvas || !camera || !renderer) return;
    camera.aspect = canvas.clientWidth / canvas.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    checkLayout(); // Re-check on resize
}

// --- AUTO LAYOUT CHECK ---
function checkLayout() {
    // Enable compact mode on shorter screens
    if (window.innerHeight < 820) {
        document.body.classList.add('compact-mode');
    } else {
        document.body.classList.remove('compact-mode');
    }
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
let currentClueTarget = null;

// --- MAIN ENTRY POINT ---
loadAssets();

window.startGame = function(size) {
    if(!isAssetsLoaded) return;
    GRID_SIZE = size;
    startScreen.style.display = 'none';
    gameContainer.style.display = 'flex';
    checkLayout(); 
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
    currentClueTarget = null;
    clueDisplay.innerText = "Searching for clue...";
    
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
    gridEl = document.getElementById('boggle-grid');
    gridEl.innerHTML = '';
    const newGrid = gridEl.cloneNode(false);
    gridEl.parentNode.replaceChild(newGrid, gridEl);
    gridEl = newGrid; 

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

            gridEl.appendChild(tile);
        }
    }

    gridEl.addEventListener('touchstart', handleTouchStart, {passive: false});
    gridEl.addEventListener('touchmove', handleTouchMove, {passive: false});
    gridEl.addEventListener('touchend', handleTouchEnd);
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

// --- SOLVER & TARGET LOGIC ---
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
    updateClue(); 
}

function updateClue() {
    const targets = possibleWords.filter(w => !foundWords.has(w) && SIMPLE_CLUES[w]);
    if (targets.length > 0) {
        currentClueTarget = targets[Math.floor(Math.random() * targets.length)];
        clueDisplay.innerText = `CLUE: ${SIMPLE_CLUES[currentClueTarget]}`;
        currentHintWord = currentClueTarget;
        hintStep = 0;
    } else {
        currentClueTarget = null;
        const anyWord = possibleWords.find(w => !foundWords.has(w));
        if (anyWord) {
            clueDisplay.innerText = `Find a word starting with ${anyWord[0]}...`;
            currentHintWord = anyWord;
            hintStep = 0;
        } else {
            clueDisplay.innerText = "All words found!";
        }
    }
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
        updateClue();
        if (!currentHintWord) return;
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
        submitBtn.innerText = "✅ CHECK";
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
        
        const lastFlowerPos = plantNewFlower(finalWord.length);
        if (lastFlowerPos) animateCameraTo(lastFlowerPos);

        if (finalWord.length > 5) playSound('special');
        else playSound('correct');
        
        if (finalWord === currentClueTarget) updateClue();
        
        resetSelection();

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