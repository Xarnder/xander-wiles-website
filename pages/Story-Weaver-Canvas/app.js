// ====== CONFIGURATION & DATA POOLS ======
const defaultPools = {
    Name: [
        "Capt. Silas", "Lyra Vane", "Jax Thorne", "Echo", "Sterling", 
        "Kaelen", "Bryn", "Marrow", "Vesper", "Nyx", "Oberon", "Talia", 
        "Rook", "Saffron", "Cassian", "Zora", "Finnian", "Maeve", "Gideon", "Sloane"
    ],
    Role: [
        "Leader / Captain", "Navigator", "Doctor", "Swordsman", "Muscle",
        "Chef", "Archer", "Wizard", "Thief", "Crafter / Tech Genius",
        "Scholar", "Mascot / Comic Relief Character"
    ],
    Weakness: [
        "Greedy", "Gullible", "Arrogant", "Clumsy", "Fear of Spiders",
        "Lazy", "Reckless", "Pacifist", "Bad Direction Sense",
        "Easily Distracted", "Overly Empathetic"
    ],
    HairColor: [
        "Black", "Blonde", "Red", "Blue", "Green",
        "White", "Purple", "Pink", "Brown", "Bald", "Silver"
    ],
    SkinTone: [
        "Pale / Fair", "Tan", "Olive", "Deep Brown", "Ebony", 
        "Glowing / Ethereal", "Ashen / Grey", "Bronze"
    ],
    BodyType: [
        "Athletic", "Muscular / Buff", "Slim / Wiry", "Stocky / Broad", 
        "Petite", "Lanky / Tall", "Average", "Curvy"
    ],
    DistinguishingMark: [
        "Jagged Facial Scar", "Intricate Sleeve Tattoo", "Glowing Birthmark", 
        "Mechanical Eye", "Freckles", "Piercing", "Cybernetic Limb", "Nose Scar"
    ],
    Age: [
        "Youthful / Teen", "Young Adult", "Prime", "Middle-aged", "Elderly / Wise", "Ageless"
    ],
    ClothingStyle: [
        "Steampunk Gear", "Cyberpunk Neon", "Gothic Victorian", "Ragged Traveler", 
        "Formal Aristocrat", "Tactical Armor", "Simple Tunic", "Mystic Robes"
    ],
    Height: [
        "Very Short", "Short", "Average", "Tall",
        "Very Tall", "Giant", "Petite", "Lanky"
    ],
    CombatMove: [
        "Fireball", "Sneak Attack", "Heavy Slash", "Sniper Shot",
        "Healing Wave", "Shield Bash", "Lightning Strike",
        "Poison Dart", "Whirlwind", "Uppercut"
    ],
    Origin: [
        "Desert Wasteland", "Floating Archipelago", "Sunken City", "High-Tech Metropolis",
        "Forbidden Forest", "Outer Rim Station", "Ancient Temple", "Subterranean Village"
    ],
    Weapon: [
        "Plasma Katana", "Heavy Sledgehammer", "Twin Daggers", "Sniper Rifle",
        "Magic Staff", "Mechanical Gauntlets", "Spiked Shield", "Throwing Cards",
        "Chain Whip", "Blunderbuss"
    ],
    Personality: [
        "Stoic", "Hot-headed", "Calculating", "Cheerful", "Melancholy",
        "Cynical", "Brave", "Cowardly", "Mysterious", "Arrogant"
    ],
    Motivation: [
        "Revenge", "Fame", "Redemption", "Wealth", "Knowledge",
        "Protecting Loved Ones", "Anarchy", "Order", "Curiosity", "Spite"
    ],
    SignatureItem: [
        "Lucky Coin", "Tattered Map", "Old Locket", "Mechanical Eye",
        "Glowing Crystal", "Pipe", "Faded Photograph", "Ancient Scroll",
        "Deck of Cards", "Strange Key"
    ],
    EyeColor: [
        "Crimson Red", "Electric Blue", "Emerald Green", "Golden Yellow",
        "Deep Violet", "Silver", "Heterochromia (Blue/Green)", "Pitch Black", "Glowing White"
    ],
    Hobby: [
        "Cooking", "Fishing", "Gambling", "Reading", "Star-gazing",
        "Gardening", "Strumming a Lute", "Woodcarving", "Collecting Insects", "Arm-wrestling"
    ],
    Fear: [
        "Heights", "Darkness", "Failure", "Betrayal", "Closed Spaces",
        "Specific Entity", "Deep Water", "Public Speaking", "Silence", "Forgetting"
    ],
    Catchphrase: [
        "Whatever it takes.", "Piece of cake!", "I have a bad feeling about this.",
        "Watch and learn.", "Don't blink.", "Interesting...", "Next!",
        "For the glory!", "Is that all?", "Trust me."
    ],
    SocialClass: [
        "Street Urchin", "Merchant", "Aristocrat", "Military Elite", "Scholar",
        "Outlaw", "Working Class", "Royalty (In Hiding)", "Priest/Nun", "Slave/Indentured"
    ]
};

const LOCK_SVG = `<svg version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" width="16px" height="20.45px" viewBox="0 0 96.108 122.88" enable-background="new 0 0 96.108 122.88" xml:space="preserve"><g><path fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" d="M2.892,56.036h8.959v-1.075V37.117c0-10.205,4.177-19.484,10.898-26.207v-0.009 C29.473,4.177,38.754,0,48.966,0C59.17,0,68.449,4.177,75.173,10.901l0.01,0.009c6.721,6.723,10.898,16.002,10.898,26.207v17.844 v1.075h7.136c1.59,0,2.892,1.302,2.892,2.891v61.062c0,1.589-1.302,2.891-2.892,2.891H2.892c-1.59,0-2.892-1.302-2.892-2.891 V58.927C0,57.338,1.302,56.036,2.892,56.036L2.892,56.036z M26.271,56.036h45.387v-1.075V36.911c0-6.24-2.554-11.917-6.662-16.03 l-0.005,0.004c-4.111-4.114-9.787-6.669-16.025-6.669c-6.241,0-11.917,2.554-16.033,6.665c-4.109,4.113-6.662,9.79-6.662,16.03 v18.051V56.036L26.271,56.036z M49.149,89.448l4.581,21.139l-12.557,0.053l3.685-21.423c-3.431-1.1-5.918-4.315-5.918-8.111 c0-4.701,3.81-8.511,8.513-8.511c4.698,0,8.511,3.81,8.511,8.511C55.964,85.226,53.036,88.663,49.149,89.448L49.149,89.448z"/></g></svg>`;
const UNLOCK_SVG = `<svg version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" width="22px" height="19.63px" viewBox="0 0 122.88 109.652" enable-background="new 0 0 122.88 109.652" xml:space="preserve"><g><path fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" d="M2.585,49.871H54.77V34.054v-0.011h0.009c0.002-9.368,3.828-17.878,9.989-24.042 c6.164-6.163,14.679-9.991,24.051-9.991V0h0.005l0,0h0.012v0.009c9.368,0.002,17.878,3.828,24.042,9.989 c6.164,6.164,9.991,14.679,9.991,24.051h0.012v0.004v15.96v2.403h-2.403h-9.811h-2.404v-2.403V33.868v-0.009h0.012 c-0.002-5.332-2.195-10.189-5.722-13.715c-3.528-3.531-8.388-5.721-13.724-5.724v0.009h-0.005l0,0h-0.011V14.42 c-5.334,0.002-10.191,2.19-13.72,5.717l0.005,0.005c-3.529,3.528-5.722,8.388-5.722,13.722h0.009v0.005v16.003h13.987 c1.422,0,2.585,1.164,2.585,2.585v54.613c0,1.422-1.163,2.583-2.585,2.583H2.585c-1.424,0-2.585-1.161-2.585-2.583V52.456 C0,51.035,1.161,49.871,2.585,49.871L2.585,49.871z M43.957,79.753l4.098,18.908l-11.232,0.045l3.297-19.162 c-3.068-0.981-5.295-3.857-5.295-7.252c0-4.202,3.411-7.613,7.614-7.613c4.202,0,7.613,3.411,7.613,7.613 C50.053,75.975,47.433,79.048,43.957,79.753L43.957,79.753z"/></g></svg>`;

// State Variables
let pools = JSON.parse(JSON.stringify(defaultPools)); // Deep copy
const variables = Object.keys(pools);

let crewData = []; // Array of character objects
let colLocks = {}; // Tracks locked status of whole columns
variables.forEach(v => colLocks[v] = false);

// ====== SVGS ======
const GRIP_SVG = `<span class="grip-handle"><svg width="12" height="18" viewBox="0 0 12 18" fill="none" xmlns="http://www.w3.org/2000/svg" style="opacity: 0.5; margin-right: 8px; cursor: inherit;"><circle cx="3" cy="3" r="1.5" fill="currentColor"/><circle cx="3" cy="9" r="1.5" fill="currentColor"/><circle cx="3" cy="15" r="1.5" fill="currentColor"/><circle cx="9" cy="3" r="1.5" fill="currentColor"/><circle cx="9" cy="9" r="1.5" fill="currentColor"/><circle cx="9" cy="15" r="1.5" fill="currentColor"/></svg></span>`;

// ====== DOM ELEMENTS ======
const tableHeadRow = document.getElementById('table-head-row');
const tableBody = document.getElementById('table-body');
const generateBtn = document.getElementById('generate-btn');
const addTraitBtn = document.getElementById('add-trait-btn');
const crewSizeInput = document.getElementById('crew-size');
const crewNameInput = document.getElementById('crew-name');
const traitCategory = document.getElementById('trait-category');
const traitValue = document.getElementById('trait-value');
const exportBtn = document.getElementById('export-btn');
const compactToggle = document.getElementById('compact-toggle');
const reorderToggle = document.getElementById('reorder-toggle');
const glassContainer = document.querySelector('.glass-container');

// ====== INITIALIZATION ======
function init() {
    // Check for mobile screen size to default to Compact Mode
    if (window.innerWidth < 768) {
        compactToggle.checked = true;
        glassContainer.classList.add('compact-mode');
        console.info("📱 Mobile Detected: Defaulting to Compact Mode");
    }

    console.log("🚀 Initializing Crew Generator...");
    buildTableHeaders();
    generateCrew(); // Initial generation
}

// ====== LOGIC: GENERATING THE CREW ======
function generateCrew() {
    const size = parseInt(crewSizeInput.value, 10);
    console.log(`\n🎲 Generating new crew of size: ${size}`);

    // 1. Adjust crewData array size based on input
    if (crewData.length > size) {
        crewData = crewData.slice(0, size); // Trim excess characters
    } else {
        while (crewData.length < size) {
            let newChar = { rowLocked: false, id: crewData.length };
            variables.forEach(v => {
                newChar[v] = { value: "", locked: false };
            });
            crewData.push(newChar);
        }
    }

    // 2. Loop through variables (columns) to distribute traits
    variables.forEach(v => {
        // Skip entirely if the whole column is locked
        if (colLocks[v]) {
            console.info(`🔒 Column [${v}] is locked. Skipping generation.`);
            return;
        }

        console.log(`\n🔄 Processing Variable: ${v}`);

        // Find which characters need a new trait for this variable
        let charsNeedingValue = [];
        let lockedValuesUsed = [];

        crewData.forEach(char => {
            if (char.rowLocked || char[v].locked) {
                // Keep existing value
                if (char[v].value) lockedValuesUsed.push(char[v].value);
            } else {
                charsNeedingValue.push(char);
            }
        });

        // 3. SPECIAL CONSTRAINT: Team must have a Leader
        if (v === "Role" && crewData.length > 0) {
            const hasLeader = lockedValuesUsed.includes("Leader / Captain");
            if (!hasLeader && charsNeedingValue.length > 0) {
                // Prioritize the first character (index 0) if they are in the needing list
                let leaderIndex = charsNeedingValue.findIndex(char => char.id === crewData[0].id);
                
                // If the first char is locked/unavailable, just pick the next available char
                if (leaderIndex === -1) {
                    leaderIndex = 0;
                }

                const chosenChar = charsNeedingValue[leaderIndex];
                chosenChar[v].value = "Leader / Captain";
                console.warn(`👑 Priority Assign: [${chosenChar.Name.value}] assigned 'Leader / Captain'.`);

                lockedValuesUsed.push("Leader / Captain");
                charsNeedingValue.splice(leaderIndex, 1); // Remove from needing list
            } else if (!hasLeader && charsNeedingValue.length === 0) {
                console.error("❌ ERROR: Cannot assign a Leader! All role cells are locked to other values.");
            }
        }

        // 4. Distribute values to remaining unlocked cells
        // Create an available pool by subtracting already used/locked values
        let availablePool = pools[v].filter(val => !lockedValuesUsed.includes(val));

        charsNeedingValue.forEach(char => {
            if (availablePool.length === 0) {
                console.warn(`⚠️ Pool empty for [${v}]. Resetting pool to allow duplicates.`);
                // Reset pool but exclude currently locked ones to limit dupes
                availablePool = pools[v].filter(val => !lockedValuesUsed.includes(val));

                // If it's STILL empty (e.g., all values are literally locked), use full pool
                if (availablePool.length === 0) availablePool = [...pools[v]];
            }

            const randomIndex = Math.floor(Math.random() * availablePool.length);
            const assignedValue = availablePool[randomIndex];

            char[v].value = assignedValue;
            availablePool.splice(randomIndex, 1); // Remove from pool to prevent duplicates

        });
    });

    buildTableHeaders();
    renderTable();
}

// ====== UI: RENDER TABLE ======
function buildTableHeaders() {
    tableHeadRow.innerHTML = `<th>Trait</th>`; // Corner label
    
    crewData.forEach((char, index) => {
        const th = document.createElement('th');
        th.setAttribute('draggable', reorderToggle.checked ? 'true' : 'false');
        th.dataset.index = index;
        
        // Character Column Lock Button
        const lockBtn = document.createElement('button');
        lockBtn.className = `lock-btn ${char.rowLocked ? 'locked' : ''}`;
        lockBtn.innerHTML = char.rowLocked ? LOCK_SVG : UNLOCK_SVG;
        lockBtn.onclick = (e) => {
            e.stopPropagation();
            toggleRowLock(index); // rowLocked for character is now Column Lock
        };
        lockBtn.title = "Lock Character Profile";

        const labelContainer = document.createElement('div');
        labelContainer.className = 'header-label-container';
        
        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'char-name-input';
        nameInput.value = char.Name.value || `Char ${index + 1}`;
        nameInput.oninput = (e) => {
            char.Name.value = e.target.value;
            console.log(`✏️ Char ${index + 1} renamed to: ${char.Name.value}`);
        };
        
        // Grip handle
        const grip = document.createElement('span');
        grip.className = 'header-grip';
        grip.innerHTML = GRIP_SVG;

        labelContainer.appendChild(grip);
        labelContainer.appendChild(nameInput);
        labelContainer.appendChild(lockBtn);
        th.appendChild(labelContainer);
        
        // DnD for columns
        th.addEventListener('dragstart', handleColDragStart);
        th.addEventListener('dragover', handleColDragOver);
        th.addEventListener('drop', handleColDrop);
        th.addEventListener('dragend', handleDragEnd);

        tableHeadRow.appendChild(th);
    });
}

function renderTable() {
    tableBody.innerHTML = '';

    variables.forEach((v, vIndex) => {
        const tr = document.createElement('tr');
        tr.setAttribute('draggable', reorderToggle.checked ? 'true' : 'false');
        tr.dataset.variable = v;
        tr.dataset.index = vIndex;

        // Row Header (Trait Name)
        const tdHeader = document.createElement('td');
        const rowLockBtn = document.createElement('button');
        rowLockBtn.className = `lock-btn ${colLocks[v] ? 'locked' : ''}`;
        rowLockBtn.innerHTML = colLocks[v] ? LOCK_SVG : UNLOCK_SVG;
        rowLockBtn.onclick = () => toggleColLock(v); // colLocks for trait is now Row Lock
        rowLockBtn.title = "Lock Trait Across Crew";

        const rowLabel = document.createElement('div');
        rowLabel.className = 'trait-label-container';
        const prettyName = v.replace(/([A-Z])/g, ' $1').trim();
        rowLabel.innerHTML = `
            <div class="trait-label">${GRIP_SVG}<strong>${prettyName}</strong></div>
        `;
        
        rowLabel.appendChild(rowLockBtn);
        tdHeader.appendChild(rowLabel);
        tr.appendChild(tdHeader);

        // Character Data (Columns)
        crewData.forEach((char, charIndex) => {
            const td = document.createElement('td');
            const cellDiv = document.createElement('div');
            cellDiv.className = 'cell-content';

            const text = document.createElement('span');
            text.textContent = char[v].value;

            // Cell Lock Button
            const cellLockBtn = document.createElement('button');
            const isLocked = char[v].locked || char.rowLocked || colLocks[v];
            cellLockBtn.className = `lock-btn ${isLocked ? 'locked' : ''}`;
            cellLockBtn.innerHTML = isLocked ? LOCK_SVG : UNLOCK_SVG;

            if (char.rowLocked || colLocks[v]) {
                cellLockBtn.style.opacity = '0.5';
                cellLockBtn.style.cursor = 'not-allowed';
            } else {
                cellLockBtn.onclick = () => toggleCellLock(charIndex, v);
            }

            cellDiv.appendChild(cellLockBtn);
            cellDiv.appendChild(text);
            td.appendChild(cellDiv);
            tr.appendChild(td);
        });

        // DnD for rows
        tr.addEventListener('dragstart', handleRowDragStart);
        tr.addEventListener('dragover', handleRowDragOver);
        tr.addEventListener('drop', handleRowDrop);
        tr.addEventListener('dragend', handleDragEnd);

        tableBody.appendChild(tr);
    });
}

// ====== LOCKING FUNCTIONS ======
function toggleRowLock(rowIndex) {
    crewData[rowIndex].rowLocked = !crewData[rowIndex].rowLocked;
    console.log(`Character ${rowIndex + 1} locked status: ${crewData[rowIndex].rowLocked}`);
    renderTable();
}

function toggleColLock(variable) {
    colLocks[variable] = !colLocks[variable];
    console.log(`Trait '${variable}' locked status: ${colLocks[variable]}`);
    buildTableHeaders(); // Update headers
    renderTable(); // Update body visually
}

function toggleCellLock(charIndex, variable) {
    crewData[charIndex][variable].locked = !crewData[charIndex][variable].locked;
    console.log(`Cell (Char ${charIndex + 1}, ${variable}) locked status: ${crewData[charIndex][variable].locked}`);
    renderTable();
}

// ====== DRAG & DROP HANDLERS ======
let dragSource = null;
let dragType = null; // 'row' or 'col'

function handleRowDragStart(e) {
    if (!reorderToggle.checked) return;
    dragType = 'row';
    dragSource = this;
    e.dataTransfer.effectAllowed = 'move';
    this.classList.add('dragging');
}

function handleRowDragOver(e) {
    if (e.preventDefault) e.preventDefault();
    if (dragType !== 'row') return false;
    e.dataTransfer.dropEffect = 'move';
    return false;
}

function handleRowDrop(e) {
    if (e.stopPropagation) e.stopPropagation();
    if (dragType !== 'row' || dragSource === this) return;

    const fromIndex = parseInt(dragSource.dataset.index, 10);
    const toIndex = parseInt(this.dataset.index, 10);

    // Reorder variables array
    const movedVar = variables.splice(fromIndex, 1)[0];
    variables.splice(toIndex, 0, movedVar);

    renderTable();
    return false;
}

function handleColDragStart(e) {
    if (!reorderToggle.checked) return;
    dragType = 'col';
    dragSource = this;
    e.dataTransfer.effectAllowed = 'move';
    this.classList.add('dragging');
}

function handleColDragOver(e) {
    if (e.preventDefault) e.preventDefault();
    if (dragType !== 'col') return false;
    e.dataTransfer.dropEffect = 'move';
    return false;
}

function handleColDrop(e) {
    if (e.stopPropagation) e.stopPropagation();
    if (dragType !== 'col' || dragSource === this) return;

    const fromIndex = parseInt(dragSource.dataset.index, 10);
    const toIndex = parseInt(this.dataset.index, 10);

    // Reorder crewData array
    const movedChar = crewData.splice(fromIndex, 1)[0];
    crewData.splice(toIndex, 0, movedChar);

    buildTableHeaders();
    renderTable();
    return false;
}

function handleDragEnd() {
    this.classList.remove('dragging');
    dragSource = null;
    dragType = null;
}

// ====== EVENT LISTENERS ======
generateBtn.addEventListener('click', () => {
    console.log("-----------------------------------------");
    console.log("User clicked Generate Button.");
    generateCrew();
});

addTraitBtn.addEventListener('click', () => {
    const category = traitCategory.value;
    const value = traitValue.value.trim();

    if (value === "") {
        console.error("❌ Add Trait Error: Input is empty!");
        alert("Please enter a valid trait before adding.");
        return;
    }

    if (pools[category].includes(value)) {
        console.warn(`⚠️ Trait '${value}' already exists in ${category}.`);
        alert("This trait already exists in the selected category.");
        return;
    }

    pools[category].push(value);
    console.info(`✅ Custom Trait Added: '${value}' into[${category}] pool.`);
    traitValue.value = ""; // clear input
    alert(`Successfully added '${value}' to ${category}!`);
});

// ====== CSV EXPORT ======
function exportToCSV() {
    if (crewData.length === 0) {
        alert("No crew data to export!");
        return;
    }

    // Headers: Trait column + each character's Name
    const headers = ["Trait", ...crewData.map(char => char.Name.value)];
    
    // Rows: One for each variable
    const rows = variables.map(v => {
        const traitPrettyName = v.replace(/([A-Z])/g, ' $1').trim();
        const traitValues = crewData.map(char => {
            const val = char[v].value || "";
            return `"${val.replace(/"/g, '""')}"`;
        });
        return `${traitPrettyName},${traitValues.join(",")}`;
    });

    const csvContent = [headers.join(","), ...rows].join("\n");
    
    // Create download name from crew input
    const crewName = crewNameInput.value.trim() || 'my_fictional_crew';
    const sanitizedName = crewName.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_');
    const dateStamp = new Date().toISOString().slice(0,10);

    // Create download link
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${sanitizedName}_${dateStamp}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

exportBtn.addEventListener('click', exportToCSV);

compactToggle.addEventListener('change', () => {
    if (compactToggle.checked) {
        glassContainer.classList.add('compact-mode');
        console.log("📏 Compact Mode Enabled (Condensed Layout)");
    } else {
        glassContainer.classList.remove('compact-mode');
        console.log("✨ Regular Mode Enabled (Spacious Layout)");
    }
});

reorderToggle.addEventListener('change', () => {
    if (reorderToggle.checked) {
        glassContainer.classList.add('reorder-mode');
        console.log("🔄 Reorder Mode Enabled (Handles Visible)");
    } else {
        glassContainer.classList.remove('reorder-mode');
        console.log("🔒 Reorder Mode Disabled (Handles Hidden)");
    }
    // Update headers and table to reflect draggable status
    buildTableHeaders();
    renderTable();
});

// Start the app
init();