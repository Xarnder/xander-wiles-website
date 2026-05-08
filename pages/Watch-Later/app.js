import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, query, where, doc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- REPLACE THIS WITH YOUR FIREBASE CONFIG ---
const firebaseConfig = {
    apiKey: "AIzaSyA9mjlqKO2q6-QBDL6qAXlpk7880geVwP8",
    authDomain: "xanders-watch-later.firebaseapp.com",
    projectId: "xanders-watch-later",
    storageBucket: "xanders-watch-later.firebasestorage.app",
    messagingSenderId: "673091397060",
    appId: "1:673091397060:web:b8ce34424a245bad4cb091"
};


const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// Set persistence to Local to ensure PWA and Safari keep the user logged in across sessions
setPersistence(auth, browserLocalPersistence)
    .then(() => {
        console.log("Auth Persistence set to local");
    })
    .catch((error) => {
        console.error("Auth Persistence Error:", error);
    });

// Check for redirect result on page load (in case fallback was used)
getRedirectResult(auth)
    .then((result) => {
        if (result) {
            console.log("Redirect Login Success:", result.user.displayName);
        }
    })
    .catch((error) => {
        console.error("Redirect Login Error:", error);
    });

// DOM Elements
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const inputSection = document.getElementById('input-section');
const tierContainer = document.getElementById('tier-container');
const trailerInput = document.getElementById('trailer-link');
const typeToggle = document.getElementById('type-toggle');
const watchWithInput = document.getElementById('watch-with');
const addBtn = document.getElementById('add-btn');

// Batch Elements
const toggleBatchBtn = document.getElementById('toggle-batch');
const modeLabel = document.getElementById('mode-label');
const singleInputRow = document.getElementById('single-input-row');
const batchInputRow = document.getElementById('batch-input-row');
const batchLinksArea = document.getElementById('batch-links');
const batchProgress = document.getElementById('batch-progress');

// Tier Management Elements
const editTiersBtn = document.getElementById('edit-tiers-btn');
const tierManagerSection = document.getElementById('tier-manager');
const closeManagerBtn = document.getElementById('close-manager-btn');
const tierEditList = document.getElementById('tier-edit-list');
const addTierBtn = document.getElementById('add-tier-btn');
const initialTierSelect = document.getElementById('initial-tier-select');

// People Management Elements
const editPeopleBtn = document.getElementById('edit-people-btn');
const peopleManagerSection = document.getElementById('people-manager');
const closePeopleBtn = document.getElementById('close-people-btn');
const peopleEditList = document.getElementById('people-edit-list');
const addPersonBtn = document.getElementById('add-person-btn');
const peopleTogglesContainer = document.getElementById('people-toggles');

// Edit Modal Elements
const editModal = document.getElementById('edit-modal');
const closeEditModalBtn = document.getElementById('close-edit-modal');
const editTitleInput = document.getElementById('edit-title');
const editPeopleTogglesContainer = document.getElementById('edit-people-toggles');
const editYoutubeLink = document.getElementById('edit-youtube-link');
const saveEditBtn = document.getElementById('save-edit-btn');
const deleteEntryBtn = document.getElementById('delete-entry-btn');
const editTypeSelect = document.getElementById('edit-type-select');
const batchTypeSelect = document.getElementById('batch-type-select');

let currentUser = null;
let isBatchMode = false;
let userTiers = []; // Store current tiers
let userPeople = []; // Store current people
let selectedPeople = new Set(); // Track currently selected people in UI
let editingItemId = null; // Track which item is being edited
let editingItemPeople = new Set(); // Track people for the item being edited
let appMode = 'watch'; // edit, organize, watch, select
let sortables = []; // Store SortableJS instances
let selectedCardIds = new Set(); // Track selected cards for multi-select

let cachedWatches = []; // Store raw watch data
let typeFilter = 'all'; // all, movie, tv
let peopleFilters = new Set(); // Set of person names

// Mode Toggle Logic
toggleBatchBtn.addEventListener('click', (e) => {
    e.preventDefault();
    isBatchMode = !isBatchMode;
    if (isBatchMode) {
        modeLabel.innerText = "Batch Import";
        toggleBatchBtn.innerText = "Switch to Single Link";
        singleInputRow.classList.add('hidden');
        batchInputRow.classList.remove('hidden');
    } else {
        modeLabel.innerText = "Add Single Link";
        toggleBatchBtn.innerText = "Switch to Batch Mode";
        singleInputRow.classList.remove('hidden');
        batchInputRow.classList.add('hidden');
    }
});

// Tier Manager Toggle
if (editTiersBtn) editTiersBtn.addEventListener('click', () => tierManagerSection.classList.toggle('hidden'));
if (closeManagerBtn) closeManagerBtn.addEventListener('click', () => tierManagerSection.classList.add('hidden'));

// People Manager Toggle
if (editPeopleBtn) editPeopleBtn.addEventListener('click', () => peopleManagerSection.classList.toggle('hidden'));
if (closePeopleBtn) closePeopleBtn.addEventListener('click', () => peopleManagerSection.classList.add('hidden'));

// Mode Selector Logic
const modeSelector = document.getElementById('mode-selector');
const modeBtns = document.querySelectorAll('.mode-btn');

const batchBar = document.getElementById('batch-actions-bar');
const selectionCount = document.getElementById('selection-count');
const batchMoveBtn = document.getElementById('batch-move-btn');
const batchPeopleBtn = document.getElementById('batch-people-btn');
const batchCancelBtn = document.getElementById('batch-cancel-btn');

const batchMoveModal = document.getElementById('batch-move-modal');
const batchPeopleModal = document.getElementById('batch-people-modal');
const batchMoveList = document.getElementById('batch-move-list');
const batchPeopleToggles = document.getElementById('batch-people-toggles');
const saveBatchPeopleBtn = document.getElementById('save-batch-people-btn');

modeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        modeBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        appMode = btn.dataset.mode;
        
        // Update body class for cursors
        document.body.classList.remove('mode-edit', 'mode-organize', 'mode-watch', 'mode-select');
        document.body.classList.add(`mode-${appMode}`);
        
        if (appMode !== 'select') {
            clearSelection();
        }
        
        updateSortableState();
        
        // Show/hide filter bar based on mode
        const filterBar = document.getElementById('filter-bar');
        if (appMode === 'watch' || appMode === 'edit') {
            filterBar.classList.remove('hidden');
        } else {
            filterBar.classList.add('hidden');
        }
    });
});

// Filter Bar Logic
const typeFilterPills = document.querySelectorAll('#type-filter-pills .filter-pill');
const peopleFilterPillsContainer = document.getElementById('people-filter-pills');

typeFilterPills.forEach(pill => {
    pill.addEventListener('click', () => {
        typeFilterPills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        typeFilter = pill.dataset.type;
        renderAllCards();
    });
});

function renderFilterPeople() {
    peopleFilterPillsContainer.innerHTML = "";
    userPeople.forEach(person => {
        const pill = document.createElement('button');
        pill.className = `filter-pill ${peopleFilters.has(person.name) ? 'active' : ''}`;
        pill.innerText = person.name;
        pill.onclick = () => {
            if (peopleFilters.has(person.name)) {
                peopleFilters.delete(person.name);
            } else {
                peopleFilters.add(person.name);
            }
            renderFilterPeople();
            renderAllCards();
        };
        peopleFilterPillsContainer.appendChild(pill);
    });
}

function updateSortableState() {
    sortables.forEach(s => {
        s.option("disabled", appMode !== 'organize');
    });
}

function clearSelection() {
    selectedCardIds.clear();
    document.querySelectorAll('.media-card.selected').forEach(c => c.classList.remove('selected'));
    updateBatchBar();
}

function updateBatchBar() {
    if (selectedCardIds.size > 0 && appMode === 'select') {
        batchBar.classList.remove('hidden');
        selectionCount.innerText = `${selectedCardIds.size} selected`;
    } else {
        batchBar.classList.add('hidden');
    }
}

// Batch Actions
batchCancelBtn.addEventListener('click', clearSelection);

batchMoveBtn.addEventListener('click', () => {
    batchMoveList.innerHTML = userTiers.map(t => `
        <button onclick="executeBatchMove('${t.id}')" style="background:rgba(255,255,255,0.1); border:1px solid var(--border);">${t.name}</button>
    `).join('');
    batchMoveModal.classList.remove('hidden');
});

window.executeBatchMove = async (tierId) => {
    for (const id of selectedCardIds) {
        await updateDoc(doc(db, "watches", id), { tier: tierId });
    }
    batchMoveModal.classList.add('hidden');
    clearSelection();
};

batchPeopleBtn.addEventListener('click', () => {
    renderBatchPeopleToggles();
    if (batchTypeSelect) batchTypeSelect.value = 'no-change';
    batchPeopleModal.classList.remove('hidden');
});

let batchSelectedPeople = new Set();
function renderBatchPeopleToggles() {
    batchPeopleToggles.innerHTML = "";
    userPeople.forEach(person => {
        const pill = document.createElement('div');
        pill.className = `person-pill ${batchSelectedPeople.has(person.name) ? 'active' : ''}`;
        pill.innerText = person.name;
        pill.onclick = () => {
            if (batchSelectedPeople.has(person.name)) {
                batchSelectedPeople.delete(person.name);
            } else {
                batchSelectedPeople.add(person.name);
            }
            renderBatchPeopleToggles();
        };
        batchPeopleToggles.appendChild(pill);
    });
}

saveBatchPeopleBtn.addEventListener('click', async () => {
    const peopleStr = Array.from(batchSelectedPeople).join(', ');
    const newType = batchTypeSelect.value;
    
    for (const id of selectedCardIds) {
        const updates = { watchWith: peopleStr };
        if (newType !== 'no-change') {
            updates.type = newType;
        }
        await updateDoc(doc(db, "watches", id), updates);
    }
    batchPeopleModal.classList.add('hidden');
    batchSelectedPeople.clear();
    clearSelection();
});

document.querySelectorAll('.close-modal-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        batchMoveModal.classList.add('hidden');
        batchPeopleModal.classList.add('hidden');
    });
});

// Confirmation Modal Logic
const confirmModal = document.getElementById('confirm-modal');
const confirmTitle = document.getElementById('confirm-title');
const confirmMessage = document.getElementById('confirm-message');
const confirmYesBtn = document.getElementById('confirm-yes-btn');
const confirmNoBtn = document.getElementById('confirm-no-btn');

function showConfirm(title, message, onConfirm, onCancel) {
    confirmTitle.innerText = title;
    confirmMessage.innerText = message;
    confirmModal.classList.remove('hidden');
    
    confirmYesBtn.onclick = () => {
        onConfirm();
        confirmModal.classList.add('hidden');
    };
    
    confirmNoBtn.onclick = () => {
        if (onCancel) onCancel();
        confirmModal.classList.add('hidden');
    };
}

// Edit Modal Logic
closeEditModalBtn.addEventListener('click', () => editModal.classList.add('hidden'));

saveEditBtn.addEventListener('click', async () => {
    if (!editingItemId) return;
    const newTitle = editTitleInput.value;
    const newPeople = Array.from(editingItemPeople).join(', ');
    const newType = editTypeSelect.value;
    
    try {
        await updateDoc(doc(db, "watches", editingItemId), {
            movieTitle: newTitle,
            watchWith: newPeople,
            type: newType
        });
        editModal.classList.add('hidden');
    } catch (err) {
        console.error("Save Edit Error:", err);
    }
});

deleteEntryBtn.addEventListener('click', () => {
    if (editingItemId) deleteEntry(editingItemId);
});

window.deleteEntry = async (id) => {
    editModal.classList.add('hidden');
    showConfirm("Delete Entry?", "Are you sure you want to remove this movie/show from your list?", async () => {
        try {
            await deleteDoc(doc(db, "watches", id));
        } catch (e) {
            console.error("Delete error:", e);
        }
    }, () => {
        // If they cancel, show the edit modal again
        editModal.classList.remove('hidden');
    });
};

// Delete Tier
window.deleteTier = async (tierId) => {
    showConfirm("Delete Tier?", "This will remove the tier and move its items to the fallback tier. Continue?", async () => {
        try {
            const itemsToMigrate = query(collection(db, "watches"), where("tier", "==", tierId));
            const snapshot = await getDocs(itemsToMigrate);
            
            // Find a fallback tier (first one that isn't this one)
            const fallbackTier = userTiers.find(t => t.id !== tierId) || {id: 'default'};
            
            const batch = writeBatch(db);
            snapshot.forEach(itemDoc => {
                batch.update(itemDoc.ref, { tier: fallbackTier.id });
            });
            
            await batch.commit();
            await deleteDoc(doc(db, "tiers", tierId));
        } catch (e) {
            console.error("Error deleting tier:", e);
        }
    });
};

// Delete Person
window.deletePerson = async (personId) => {
    showConfirm("Remove Person?", "Are you sure you want to remove this person from your manager?", async () => {
        try {
            await deleteDoc(doc(db, "people", personId));
        } catch (e) {
            console.error("Error deleting person:", e);
        }
    });
};

// Auth Logic
loginBtn.addEventListener('click', () => {
    console.log("Login Clicked. Attempting popup...");
    // Try popup first, with fallback
    signInWithPopup(auth, provider)
        .then((result) => {
            console.log("Popup Login Success:", result.user.displayName);
        })
        .catch((error) => {
            console.warn("Popup Login Error or Blocked:", error);
            // Fallback to redirect if popup is blocked or fails
            if (error.code === 'auth/popup-blocked' || error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request') {
                console.log("Falling back to redirect login...");
                signInWithRedirect(auth, provider).catch(redirectErr => {
                    console.error("Redirect Fallback Error:", redirectErr);
                    alert(`Login Failed: ${redirectErr.message}`);
                });
            } else {
                alert("Login Error: " + error.message);
            }
        });
});

logoutBtn.addEventListener('click', () => signOut(auth));

onAuthStateChanged(auth, async (user) => {
    if (user) {
        console.log("User logged in:", user.email);
        currentUser = user;
        loginBtn.classList.add('hidden');
        document.getElementById('user-info').classList.remove('hidden');
        document.getElementById('user-name').innerText = user.displayName;
        inputSection.classList.remove('hidden');
        tierContainer.classList.remove('hidden');
        modeSelector.classList.remove('hidden');
        document.getElementById('filter-bar').classList.remove('hidden');
        document.body.classList.add('mode-watch');
        await initializeTiers();
        await initializePeople();
        loadData();
    } else {
        console.log("User logged out");
        currentUser = null;
        loginBtn.classList.remove('hidden');
        document.getElementById('user-info').classList.add('hidden');
        inputSection.classList.add('hidden');
        tierContainer.classList.add('hidden');
        modeSelector.classList.add('hidden');
        document.getElementById('filter-bar').classList.add('hidden');
        document.body.classList.remove('mode-edit', 'mode-organize', 'mode-watch', 'mode-select');
    }
});

// Helper: Extract YouTube Thumbnail
function getThumbnail(url) {
    try {
        const videoId = url.split('v=')[1]?.split('&')[0] || url.split('be/')[1];
        return `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
    } catch (e) {
        console.warn("Invalid URL for thumbnail extraction");
        return 'https://via.placeholder.com/160x90?text=No+Preview';
    }
}

// Fetch Video Title from YouTube
async function getVideoData(url) {
    try {
        const response = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
        if (!response.ok) throw new Error("Failed to fetch video data");
        const data = await response.json();
        return data.title;
    } catch (e) {
        console.warn("Could not fetch title:", e);
        return null;
    }
}

// Clean Title: Remove marketing words
function cleanTitle(title) {
    if (!title) return "Untitled Movie";
    
    // Remove content in brackets and parentheses first (often contains "Official Trailer" etc)
    let cleaned = title.replace(/[\[\(].*?[\]\)]/g, '');
    
    // Keywords to remove (case-insensitive)
    const keywords = [
        'official', 'trailer', 'teaser', 'teaser trailer', 'main trailer', 
        'final trailer', 'movie', 'film', '4k', 'hd', '1080p', 
        'special announcement', 'clip', 'exclusive', 'new', 'premiere'
    ];
    
    keywords.forEach(word => {
        const regex = new RegExp(`\\b${word}\\b`, 'gi');
        cleaned = cleaned.replace(regex, '');
    });
    
    // Remove common separators
    cleaned = cleaned.replace(/[\|\-:]/g, ' '); 
    
    // Collapse whitespace and trim
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    
    return cleaned || title;
}

// Add Item(s)
addBtn.addEventListener('click', async () => {
    if (isBatchMode) {
        await handleBatchAdd();
    } else {
        await handleSingleAdd();
    }
});

async function handleSingleAdd() {
    const url = trailerInput.value;
    if (!url) return alert("Paste a link first!");

    addBtn.disabled = true;
    addBtn.innerText = "Fetching Title...";

    const rawTitle = await getVideoData(url);
    const cleanedTitle = cleanTitle(rawTitle);

    await saveItem({
        url,
        thumb: getThumbnail(url),
        movieTitle: cleanedTitle,
        type: typeToggle.value,
        watchWith: Array.from(selectedPeople).join(', '),
        tier: initialTierSelect.value || userTiers[userTiers.length - 1]?.id || 'C'
    });

    trailerInput.value = "";
    selectedPeople.clear();
    renderPeopleToggles();
    addBtn.disabled = false;
    addBtn.innerText = "Add to List";
}

async function handleBatchAdd() {
    const text = batchLinksArea.value;
    if (!text) return alert("Paste some links first!");

    // Regex to find YouTube Video IDs
    const regex = /(?:v=|\/)([0-9A-Za-z_-]{11}).*/g;
    const matches = [...text.matchAll(regex)];
    const videoIds = [...new Set(matches.map(m => m[1]))];

    if (videoIds.length === 0) return alert("No valid YouTube links found!");

    addBtn.disabled = true;
    batchProgress.classList.remove('hidden');
    
    let count = 0;
    for (const id of videoIds) {
        count++;
        batchProgress.innerText = `Processing ${count} / ${videoIds.length}...`;
        
        const url = `https://www.youtube.com/watch?v=${id}`;
        const rawTitle = await getVideoData(url);
        const cleanedTitle = cleanTitle(rawTitle);

        await saveItem({
            url,
            thumb: `https://img.youtube.com/vi/${id}/mqdefault.jpg`,
            movieTitle: cleanedTitle,
            type: 'movie', // Default for batch
            watchWith: Array.from(selectedPeople).join(', '),
            tier: initialTierSelect.value || userTiers[userTiers.length - 1]?.id || 'C'
        });
    }

    batchLinksArea.value = "";
    selectedPeople.clear();
    renderPeopleToggles();
    batchProgress.innerText = `Successfully added ${videoIds.length} items!`;
    setTimeout(() => batchProgress.classList.add('hidden'), 5000);
    
    addBtn.disabled = false;
    addBtn.innerText = "Add to List";
}

async function saveItem(data) {
    const newItem = {
        uid: currentUser.uid,
        tier: data.tier || 'C',
        timestamp: Date.now(),
        ...data
    };

    try {
        await addDoc(collection(db, "watches"), newItem);
        console.log("Item saved to Firestore");
    } catch (err) {
        console.error("Firestore Save Error:", err);
    }
}

// Load & Sync Data
function loadData() {
    // Sync Tiers
    const tiersQ = query(collection(db, "tiers"), where("uid", "==", currentUser.uid));
    onSnapshot(tiersQ, (snapshot) => {
        userTiers = [];
        snapshot.forEach(doc => userTiers.push({ id: doc.id, ...doc.data() }));
        userTiers.sort((a, b) => a.order - b.order);
        
        renderTiers();
        renderTierManager();
        updateTierSelect();
    });

    // Sync People
    const peopleQ = query(collection(db, "people"), where("uid", "==", currentUser.uid));
    onSnapshot(peopleQ, (snapshot) => {
        userPeople = [];
        snapshot.forEach(doc => userPeople.push({ id: doc.id, ...doc.data() }));
        userPeople.sort((a, b) => a.name.localeCompare(b.name));
        
        renderPeopleToggles();
        renderPeopleManager();
        renderFilterPeople();
    });

    // Sync Watches
    const watchesQ = query(collection(db, "watches"), where("uid", "==", currentUser.uid));
    onSnapshot(watchesQ, (watchSnapshot) => {
        cachedWatches = [];
        watchSnapshot.forEach((doc) => {
            cachedWatches.push({ id: doc.id, ...doc.data() });
        });
        renderAllCards();
    });
}

function renderAllCards() {
    // Clear all tier lists
    document.querySelectorAll('.tier-list').forEach(l => l.innerHTML = "");
    
    const filtered = cachedWatches.filter(watch => {
        // Type filter
        if (typeFilter !== 'all' && watch.type !== typeFilter) return false;
        
        // People filter (ANY match)
        if (peopleFilters.size > 0) {
            const watchPeople = watch.watchWith ? watch.watchWith.split(', ').filter(s => s) : [];
            const hasMatch = Array.from(peopleFilters).some(p => watchPeople.includes(p));
            if (!hasMatch) return false;
        }
        
        return true;
    });
    
    filtered.forEach(watch => {
        renderCard(watch.id, watch);
    });
}

function renderTiers() {
    // Destroy old sortables
    sortables.forEach(s => s.destroy());
    sortables = [];
    
    tierContainer.innerHTML = "";
    userTiers.forEach(tier => {
        const tierDiv = document.createElement('div');
        tierDiv.className = 'tier';
        tierDiv.dataset.tier = tier.id;
        tierDiv.innerHTML = `
            <div class="tier-label" style="background:${tier.color || '#ccc'}">${tier.name}</div>
            <div class="tier-list" id="list-${tier.id}"></div>
        `;
        tierContainer.appendChild(tierDiv);
        
        // Init Sortable for this new list
        initSortable(tierDiv.querySelector('.tier-list'));
    });
}

function renderTierManager() {
    tierEditList.innerHTML = "";
    userTiers.forEach(tier => {
        const row = document.createElement('div');
        row.className = 'tier-edit-row';
        row.innerHTML = `
            <input type="text" value="${tier.name}" onchange="updateTier('${tier.id}', {name: this.value})">
            <input type="color" value="${tier.color || '#cccccc'}" onchange="updateTier('${tier.id}', {color: this.value})">
            <button class="delete-btn" onclick="deleteTier('${tier.id}')">&times;</button>
        `;
        tierEditList.appendChild(row);
    });
}

function updateTierSelect() {
    initialTierSelect.innerHTML = userTiers.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
    // Select last one by default (usually C)
    if (userTiers.length > 0) initialTierSelect.value = userTiers[userTiers.length-1].id;
}

function renderPeopleManager() {
    peopleEditList.innerHTML = "";
    userPeople.forEach(person => {
        const row = document.createElement('div');
        row.className = 'people-edit-row';
        row.innerHTML = `
            <input type="text" value="${person.name}" onchange="updatePerson('${person.id}', this.value)">
            <button class="delete-btn" onclick="deletePerson('${person.id}')">&times;</button>
        `;
        peopleEditList.appendChild(row);
    });
}

function renderPeopleToggles() {
    peopleTogglesContainer.innerHTML = "";
    userPeople.forEach(person => {
        const pill = document.createElement('div');
        pill.className = `person-pill ${selectedPeople.has(person.name) ? 'active' : ''}`;
        pill.innerText = person.name;
        pill.onclick = () => {
            if (selectedPeople.has(person.name)) {
                selectedPeople.delete(person.name);
            } else {
                selectedPeople.add(person.name);
            }
            renderPeopleToggles();
        };
        peopleTogglesContainer.appendChild(pill);
    });
    
    if (userPeople.length === 0) {
        peopleTogglesContainer.innerHTML = `<div style="font-size:10px; color:#666;">No people added yet. Click "People" to add.</div>`;
    }
}

async function initializeTiers() {
    const q = query(collection(db, "tiers"), where("uid", "==", currentUser.uid));
    return new Promise((resolve) => {
        onSnapshot(q, async (snap) => {
            if (snap.empty) {
                console.log("Initializing default tiers...");
                const defaults = [
                    { name: 'S', color: '#ff7f7f', order: 0 },
                    { name: 'A', color: '#ffbf7f', order: 1 },
                    { name: 'B', color: '#ffff7f', order: 2 },
                    { name: 'C', color: '#7fff7f', order: 3 }
                ];
                for (const t of defaults) {
                    await addDoc(collection(db, "tiers"), { ...t, uid: currentUser.uid });
                }
            }
            resolve();
        }, { once: true });
    });
}

async function initializePeople() {
    const q = query(collection(db, "people"), where("uid", "==", currentUser.uid));
    return new Promise((resolve) => {
        onSnapshot(q, async (snap) => {
            if (snap.empty) {
                console.log("Initializing default people...");
                const defaults = ["Sarah", "Dad", "Mom"];
                for (const name of defaults) {
                    await addDoc(collection(db, "people"), { name, uid: currentUser.uid });
                }
            }
            resolve();
        }, { once: true });
    });
}

window.updatePerson = async (id, newName) => {
    await updateDoc(doc(db, "people", id), { name: newName });
};


addPersonBtn.addEventListener('click', async () => {
    const name = prompt("Person's Name:");
    if (!name) return;
    await addDoc(collection(db, "people"), {
        uid: currentUser.uid,
        name: name
    });
});

window.updateTier = async (id, data) => {
    await updateDoc(doc(db, "tiers", id), data);
};


addTierBtn.addEventListener('click', async () => {
    const name = prompt("Tier Name:", "New Tier");
    if (!name) return;
    await addDoc(collection(db, "tiers"), {
        uid: currentUser.uid,
        name: name,
        color: '#cccccc',
        order: userTiers.length > 0 ? Math.max(...userTiers.map(t => t.order)) + 1 : 0
    });
});

function renderCard(id, data) {
    const list = document.getElementById(`list-${data.tier}`);
    if (!list) return; // Tier might have been deleted or not loaded yet
    
    const card = document.createElement('div');
    card.className = `media-card ${selectedCardIds.has(id) ? 'selected' : ''}`;
    card.dataset.id = id;
    
    const displayTitle = data.movieTitle || 'Movie';
    
    card.innerHTML = `
        <img src="${data.thumb}" alt="thumbnail">
        <span class="badge">${data.type.toUpperCase()}</span>
        <div class="card-info">
            <h4 class="card-title">${displayTitle}</h4>
            <p style="margin:0; font-size:10px; color:#aaa;">${data.watchWith ? 'With: ' + data.watchWith : 'Solo'}</p>
        </div>
    `;
    
    card.onclick = (e) => {
        if (appMode === 'organize') return;
        if (appMode === 'select') {
            if (selectedCardIds.has(id)) {
                selectedCardIds.delete(id);
                card.classList.remove('selected');
            } else {
                selectedCardIds.add(id);
                card.classList.add('selected');
            }
            updateBatchBar();
            return;
        }
        if (appMode === 'watch') {
            window.open(data.url, '_blank');
        } else {
            // Edit Mode
            openEditModal(id, data);
        }
    };
    
    list.appendChild(card);
}

function openEditModal(id, data) {
    editingItemId = id;
    editTitleInput.value = data.movieTitle || "";
    editYoutubeLink.href = data.url;
    if (editTypeSelect) editTypeSelect.value = data.type || 'movie';
    
    // Parse existing people
    editingItemPeople = new Set(data.watchWith ? data.watchWith.split(', ').filter(s => s) : []);
    renderEditPeopleToggles();
    
    editModal.classList.remove('hidden');
}

function renderEditPeopleToggles() {
    editPeopleTogglesContainer.innerHTML = "";
    userPeople.forEach(person => {
        const pill = document.createElement('div');
        pill.className = `person-pill ${editingItemPeople.has(person.name) ? 'active' : ''}`;
        pill.innerText = person.name;
        pill.onclick = () => {
            if (editingItemPeople.has(person.name)) {
                editingItemPeople.delete(person.name);
            } else {
                editingItemPeople.add(person.name);
            }
            renderEditPeopleToggles();
        };
        editPeopleTogglesContainer.appendChild(pill);
    });
}


// Initialize Drag & Drop
function initSortable(el) {
    const s = new Sortable(el, {
        group: 'tiers',
        animation: 150,
        disabled: appMode !== 'organize',
        onEnd: async (evt) => {
            const id = evt.item.dataset.id;
            const newTier = evt.to.parentElement.dataset.tier;
            console.log(`Moving ${id} to Tier ${newTier}`);

            try {
                const itemRef = doc(db, "watches", id);
                await updateDoc(itemRef, { tier: newTier });
            } catch (err) {
                console.error("Move Error:", err);
            }
        }
    });
    sortables.push(s);
}