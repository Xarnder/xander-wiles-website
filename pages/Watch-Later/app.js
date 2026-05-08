import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithRedirect, signInWithPopup, getRedirectResult, onAuthStateChanged, signOut, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, query, where, doc, updateDoc, deleteDoc, getDocs, writeBatch } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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

// GLOBAL ERROR HANDLER
window.onerror = function(msg, url, line, col, error) {
    console.error(`Error: ${msg} at ${line}:${col}`);
    return false;
};




// Environment constants from window (set in index.html)
const isStandalone = window.isStandalone;
const isIOS = window.isIOS;
const isMobile = window.isMobile;




// Check for redirect result on page load
async function handlePendingAuth() {
    try {
        const result = await getRedirectResult(auth);
        if (result) {
            console.log("[Auth] Redirect Login Success:", result.user.displayName);
        }
    } catch (error) {
        console.warn("[Auth] Redirect result error:", error.code, error.message);
    }
}

handlePendingAuth();








// DOM Elements
const googleLoginBtn = document.getElementById('google-login-btn');
const loginOverlay = document.getElementById('login-overlay');
const logoutBtn = document.getElementById('logout-btn');
const inputSection = document.getElementById('input-section');
const tierContainer = document.getElementById('tier-container');
const trailerInput = document.getElementById('trailer-link');
const typeToggle = document.getElementById('type-toggle');
const watchWithInput = document.getElementById('watch-with');
const addBtn = document.getElementById('add-btn');
const modeSelector = document.getElementById('mode-selector');

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
const autoColorBtn = document.getElementById('auto-color-btn');
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
const editStatusSelect = document.getElementById('edit-status-select');
const batchStatusSelect = document.getElementById('batch-status-select');
const statusToggle = document.getElementById('status-toggle');
const genreInput = document.getElementById('genre-input');
const editGenreInput = document.getElementById('edit-genre-input');
const genreDatalist = document.getElementById('genre-list');

// Quick Sort Elements
const quickSortBtn = document.getElementById('quick-sort-btn');
const quickSortTierModal = document.getElementById('quick-sort-tier-modal');
const quickSortTierList = document.getElementById('quick-sort-tier-list');
const prevQuickSortBtn = document.getElementById('prev-quick-sort-btn');
const nextQuickSortBtn = document.getElementById('next-quick-sort-btn');
const enableShortcutsToggle = document.getElementById('enable-shortcuts-toggle');

let currentUser = null;
let isBatchMode = false;
let userTiers = []; // Store current tiers
let userPeople = []; // Store current people
let selectedPeople = new Set(); // Track currently selected people in UI
let editingItemId = null; // Track which item is being edited
let editingItemPeople = new Set(); // Track people for the item being edited
let appMode = 'watch'; // edit, organize, watch, select

let isQuickSortMode = false;
let quickSortItems = [];
let quickSortIndex = -1;
const QUICK_SORT_TIER_KEYS = "qwertyuiopasdfghjklzxcvbnm";

let sortables = []; // Store SortableJS instances
let tierSortable = null; // Store SortableJS instance for tiers
let selectedCardIds = new Set(); // Track selected cards for multi-select

let cachedWatches = []; // Store raw watch data
let typeFilter = 'all'; // all, movie, tv
let watchStatusFilter = 'all'; // all, first-watch, rewatch
let peopleFilters = new Set(); // Set of person names
let genreFilters = new Set(); // Set of genre names
let searchQuery = ""; // Track search query

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

const modeBtns = document.querySelectorAll('.mode-btn');

const batchBar = document.getElementById('batch-actions-bar');
const selectionCount = document.getElementById('selection-count');
const batchMoveBtn = document.getElementById('batch-move-btn');
const batchPeopleBtn = document.getElementById('batch-people-btn');
const batchDeleteBtn = document.getElementById('batch-delete-btn');
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
        document.body.classList.remove('mode-edit', 'mode-organize', 'mode-watch', 'mode-select', 'mode-reorder-tiers');
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
const genreFilterPillsContainer = document.getElementById('genre-filter-pills');
const openRenameGenreModalBtn = document.getElementById('open-rename-genre-modal-btn');
const renameGenreModal = document.getElementById('rename-genre-modal');
const renameGenreSelect = document.getElementById('rename-genre-select');
const renameGenreNewNameInput = document.getElementById('rename-genre-new-name');
const confirmRenameGenreBtn = document.getElementById('confirm-rename-genre-btn');
const closeRenameGenreModalBtn = document.getElementById('close-rename-genre-modal-btn');

typeFilterPills.forEach(pill => {
    pill.addEventListener('click', () => {
        typeFilterPills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        typeFilter = pill.dataset.type;
        renderAllCards();
    });
});

const statusFilterPills = document.querySelectorAll('#status-filter-pills .filter-pill');
statusFilterPills.forEach(pill => {
    pill.addEventListener('click', () => {
        statusFilterPills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        watchStatusFilter = pill.dataset.status;
        renderAllCards();
    });
});

const searchInput = document.getElementById('search-input');
if (searchInput) {
    searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value.toLowerCase();
        renderAllCards();
    });
}

const selectAllBtn = document.getElementById('batch-select-all-btn');
const deselectAllBtn = document.getElementById('batch-deselect-all-btn');

if (selectAllBtn) {
    selectAllBtn.addEventListener('click', () => {
        const visibleCards = document.querySelectorAll('.media-card');
        visibleCards.forEach(card => {
            const id = card.dataset.id;
            selectedCardIds.add(id);
            card.classList.add('selected');
        });
        updateBatchBar();
    });
}

if (deselectAllBtn) {
    deselectAllBtn.addEventListener('click', () => {
        clearSelection();
    });
}

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

function renderFilterGenres() {
    if (!genreFilterPillsContainer) return;
    genreFilterPillsContainer.innerHTML = "";
    
    // Get unique genres from cachedWatches
    const genres = new Set();
    cachedWatches.forEach(w => {
        if (w.genre) genres.add(w.genre.trim());
    });
    
    const sortedGenres = Array.from(genres).sort();
    
    sortedGenres.forEach(genre => {
        const pill = document.createElement('button');
        pill.className = `filter-pill ${genreFilters.has(genre) ? 'active' : ''}`;
        pill.innerText = genre;
        pill.onclick = () => {
            if (genreFilters.has(genre)) {
                genreFilters.delete(genre);
            } else {
                genreFilters.add(genre);
            }
            renderFilterGenres();
            renderAllCards();
        };
        genreFilterPillsContainer.appendChild(pill);
    });
}

if (openRenameGenreModalBtn) {
    openRenameGenreModalBtn.addEventListener('click', () => {
        // Get unique genres
        const genres = new Set();
        cachedWatches.forEach(w => {
            if (w.genre) genres.add(w.genre.trim());
        });
        
        if (genres.size === 0) return alert("No genres found to rename.");
        
        const sortedGenres = Array.from(genres).sort();
        renameGenreSelect.innerHTML = sortedGenres.map(g => `<option value="${g}">${g}</option>`).join('');
        renameGenreNewNameInput.value = sortedGenres[0];
        renameGenreModal.classList.remove('hidden');
    });
}

if (closeRenameGenreModalBtn) {
    closeRenameGenreModalBtn.addEventListener('click', () => {
        renameGenreModal.classList.add('hidden');
    });
}

if (confirmRenameGenreBtn) {
    confirmRenameGenreBtn.addEventListener('click', async () => {
        const oldName = renameGenreSelect.value;
        const newName = renameGenreNewNameInput.value.trim();
        
        if (!newName || newName === oldName) {
            renameGenreModal.classList.add('hidden');
            return;
        }
        
        const itemsToUpdate = cachedWatches.filter(w => w.genre && w.genre.trim() === oldName);
        
        try {
            confirmRenameGenreBtn.disabled = true;
            confirmRenameGenreBtn.innerText = "Updating...";
            
            const promises = itemsToUpdate.map(item => 
                updateDoc(doc(db, "watches", item.id), { genre: newName })
            );
            await Promise.all(promises);
            
            renameGenreModal.classList.add('hidden');
            showSuccess(`Renamed ${itemsToUpdate.length} items`);
        } catch (err) {
            console.error("Rename Genre Error:", err);
            alert("Error renaming items.");
        } finally {
            confirmRenameGenreBtn.disabled = false;
            confirmRenameGenreBtn.innerText = "Rename All";
        }
    });
}

function showSuccess(message) {
    const overlay = document.getElementById('success-overlay');
    const msgEl = document.getElementById('success-msg');
    if (!overlay || !msgEl) return;
    
    msgEl.innerText = message;
    overlay.classList.remove('hidden');
    
    setTimeout(() => {
        overlay.classList.add('hidden');
    }, 3000);
}

function updateSortableState() {
    sortables.forEach(s => {
        s.option("disabled", appMode !== 'organize');
    });
    
    if (tierSortable) {
        tierSortable.option("disabled", appMode !== 'reorder-tiers');
    }
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

batchMoveBtn.addEventListener('click', (e) => {
    e.preventDefault();
    batchMoveList.innerHTML = userTiers.map(t => `
        <button type="button" onclick="executeBatchMove('${t.id}')" style="background:rgba(255,255,255,0.1); border:1px solid var(--border);">${t.name}</button>
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

batchDeleteBtn.addEventListener('click', () => {
    if (selectedCardIds.size === 0) return;
    
    showConfirm(
        "Batch Delete?", 
        `Are you sure you want to delete ${selectedCardIds.size} selected items? This action cannot be undone.`, 
        async () => {
            try {
                const batch = writeBatch(db);
                selectedCardIds.forEach(id => {
                    batch.delete(doc(db, "watches", id));
                });
                await batch.commit();
                clearSelection();
            } catch (err) {
                console.error("Batch Delete Error:", err);
                alert("Failed to delete some items.");
            }
        }
    );
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
    const newStatus = batchStatusSelect.value;
    
    for (const id of selectedCardIds) {
        const updates = { watchWith: peopleStr };
        if (newType !== 'no-change') {
            updates.type = newType;
        }
        if (newStatus !== 'no-change') {
            updates.watchStatus = newStatus;
        }
        await updateDoc(doc(db, "watches", id), updates);
    }
    batchPeopleModal.classList.add('hidden');
    batchSelectedPeople.clear();
    if (batchStatusSelect) batchStatusSelect.value = 'no-change';
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
closeEditModalBtn.addEventListener('click', () => {
    editModal.classList.add('hidden');
    isQuickSortMode = false;
});

// Quick Sort Logic
if (quickSortBtn) {
    quickSortBtn.addEventListener('click', () => {
        quickSortTierList.innerHTML = userTiers.map(t => `
            <button type="button" onclick="startQuickSort('${t.id}')" style="background:${t.color || 'var(--glass)'}; color:${getContrastColor(t.color || '#cccccc')}; border:1px solid var(--border); width: 100%;">${t.name}</button>
        `).join('');
        quickSortTierModal.classList.remove('hidden');
    });
}

window.startQuickSort = (tierId) => {
    quickSortTierModal.classList.add('hidden');
    quickSortItems = cachedWatches.filter(w => w.tier === tierId);
    
    if (quickSortItems.length === 0) {
        alert("No items in this tier to sort!");
        return;
    }
    
    isQuickSortMode = true;
    quickSortIndex = 0;
    openEditModal(quickSortItems[quickSortIndex].id, quickSortItems[quickSortIndex]);
};

async function saveCurrentQuickSortItem() {
    if (!editingItemId) return;
    const newTitle = editTitleInput.value;
    const newPeople = Array.from(editingItemPeople).join(', ');
    const newType = editTypeSelect.value;
    const newStatus = editStatusSelect.value;
    const newGenre = editGenreInput.value;
    
    try {
        await updateDoc(doc(db, "watches", editingItemId), {
            movieTitle: newTitle,
            watchWith: newPeople,
            type: newType,
            watchStatus: newStatus,
            genre: newGenre
        });
        console.log("Quick Sort: Item saved");
    } catch (err) {
        console.error("Quick Sort Save Error:", err);
    }
}

async function saveAndNavigate(direction) {
    await saveCurrentQuickSortItem();
    
    quickSortIndex += direction;
    
    if (quickSortIndex < 0) {
        quickSortIndex = 0;
        alert("This is the first item.");
    } else if (quickSortIndex >= quickSortItems.length) {
        isQuickSortMode = false;
        editModal.classList.add('hidden');
        alert("Finished Quick Sort for this tier!");
    } else {
        const nextItem = quickSortItems[quickSortIndex];
        openEditModal(nextItem.id, nextItem);
    }
}

if (prevQuickSortBtn) {
    prevQuickSortBtn.addEventListener('click', () => saveAndNavigate(-1));
}

if (nextQuickSortBtn) {
    nextQuickSortBtn.addEventListener('click', () => saveAndNavigate(1));
}

async function moveCurrentToTier(tierId) {
    if (!editingItemId) return;
    const newTitle = editTitleInput.value;
    const newPeople = Array.from(editingItemPeople).join(', ');
    const newType = editTypeSelect.value;
    const newStatus = editStatusSelect.value;
    const newGenre = editGenreInput.value;
    
    try {
        await updateDoc(doc(db, "watches", editingItemId), {
            movieTitle: newTitle,
            watchWith: newPeople,
            type: newType,
            watchStatus: newStatus,
            tier: tierId,
            genre: newGenre
        });
        console.log(`Quick Sort: Item moved to tier ${tierId} and saved`);
        
        // Move to next
        quickSortIndex++;
        if (quickSortIndex >= quickSortItems.length) {
            isQuickSortMode = false;
            editModal.classList.add('hidden');
            alert("Finished Quick Sort for this tier!");
        } else {
            const nextItem = quickSortItems[quickSortIndex];
            openEditModal(nextItem.id, nextItem);
        }
    } catch (err) {
        console.error("Quick Sort Move Error:", err);
    }
}

saveEditBtn.addEventListener('click', async () => {
    if (!editingItemId) return;
    const newTitle = editTitleInput.value;
    const newPeople = Array.from(editingItemPeople).join(', ');
    const newType = editTypeSelect.value;
    const newStatus = editStatusSelect.value;
    const newGenre = editGenreInput.value;
    
    try {
        await updateDoc(doc(db, "watches", editingItemId), {
            movieTitle: newTitle,
            watchWith: newPeople,
            type: newType,
            watchStatus: newStatus,
            genre: newGenre
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
    const wasInQuickSort = isQuickSortMode;
    editModal.classList.add('hidden');
    
    showConfirm("Delete Entry?", "Are you sure you want to remove this movie/show from your list?", async () => {
        try {
            await deleteDoc(doc(db, "watches", id));
            
            // If we were in Quick Sort, continue to next item
            if (wasInQuickSort) {
                isQuickSortMode = true; // Ensure state is preserved
                quickSortIndex++;
                if (quickSortIndex < quickSortItems.length) {
                    const nextItem = quickSortItems[quickSortIndex];
                    openEditModal(nextItem.id, nextItem);
                } else {
                    isQuickSortMode = false;
                    alert("Finished Quick Sort for this tier!");
                }
            }
        } catch (e) {
            console.error("Delete error:", e);
        }
    }, () => {
        // If they cancel, show the edit modal again
        if (wasInQuickSort) isQuickSortMode = true;
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
window.deletePerson = async (id) => {
    showConfirm("Delete Person?", "This will remove them from your people list. Continue?", async () => {
        try {
            await deleteDoc(doc(db, "people", id));
            showSuccess("Person removed");
        } catch (e) {
            console.error("Delete error:", e);
        }
    });
};

// Edit Person (Rename)
const renamePersonModal = document.getElementById('rename-person-modal');
const renamePersonOldNameInput = document.getElementById('rename-person-old-name');
const renamePersonNewNameInput = document.getElementById('rename-person-new-name');
const confirmRenamePersonBtn = document.getElementById('confirm-rename-person-btn');
const closeRenamePersonModalBtn = document.getElementById('close-rename-person-modal-btn');

let currentRenamingPersonId = null;

window.editPerson = async (oldName, personId) => {
    currentRenamingPersonId = personId;
    renamePersonOldNameInput.value = oldName;
    renamePersonNewNameInput.value = oldName;
    renamePersonModal.classList.remove('hidden');
    setTimeout(() => renamePersonNewNameInput.focus(), 100);
};

if (closeRenamePersonModalBtn) {
    closeRenamePersonModalBtn.addEventListener('click', () => {
        renamePersonModal.classList.add('hidden');
    });
}

if (confirmRenamePersonBtn) {
    confirmRenamePersonBtn.addEventListener('click', async () => {
        const oldName = renamePersonOldNameInput.value;
        const newName = renamePersonNewNameInput.value.trim();
        
        if (!newName || newName === oldName || !currentRenamingPersonId) {
            renamePersonModal.classList.add('hidden');
            return;
        }
        
        try {
            confirmRenamePersonBtn.disabled = true;
            confirmRenamePersonBtn.innerText = "Updating...";
            
            // 1. Update person document
            await updateDoc(doc(db, "people", currentRenamingPersonId), {
                name: newName
            });
            
            // 2. Update all watches that mention this person
            const itemsToUpdate = cachedWatches.filter(w => w.watchWith && w.watchWith.includes(oldName));
            const promises = itemsToUpdate.map(item => {
                const updatedPeople = item.watchWith.split(', ')
                    .map(p => p.trim() === oldName ? newName : p)
                    .join(', ');
                return updateDoc(doc(db, "watches", item.id), { watchWith: updatedPeople });
            });
            await Promise.all(promises);
            
            renamePersonModal.classList.add('hidden');
            showSuccess(`Renamed to ${newName}`);
        } catch (err) {
            console.error("Rename Person Error:", err);
            alert("Error renaming person.");
        } finally {
            confirmRenamePersonBtn.disabled = false;
            confirmRenamePersonBtn.innerText = "Update Everywhere";
        }
    });
}

if (googleLoginBtn) googleLoginBtn.addEventListener('click', async (e) => {
    e.preventDefault();

    
    const originalText = googleLoginBtn.innerText;
    // DO NOT use redirect in Standalone/PWA mode, it breaks the Firebase auth state
    const useRedirect = isMobile && !isStandalone && !isIOS;
    
    googleLoginBtn.innerText = useRedirect ? "Redirecting..." : "Logging in...";
    googleLoginBtn.disabled = true;
    
    // Show mini-loader
    const loginLoader = document.querySelector('.login-loader');
    if (loginLoader) loginLoader.classList.remove('hidden');
    

    
    try {
        if (useRedirect) {
            await signInWithRedirect(auth, provider);
        } else {
            const result = await signInWithPopup(auth, provider);
        }
    } catch (error) {
        alert(`Login Failed: ${error.message}`);
    } finally {
        // Only reset UI if we didn't redirect away
        if (!useRedirect) {
            googleLoginBtn.innerText = originalText;
            googleLoginBtn.disabled = false;
            if (loginLoader) loginLoader.classList.add('hidden');
        }
    }
});



logoutBtn.addEventListener('click', () => signOut(auth));

onAuthStateChanged(auth, async (user) => {
    try {
        console.log(`[Auth] State change: ${user ? 'Logged In' : 'Logged Out'}`);
        if (user) {
            currentUser = user;
            
            // Immediate UI Transition
            if (loginOverlay) loginOverlay.classList.add('hidden');
            const userInfo = document.getElementById('user-info');
            const userName = document.getElementById('user-name');
            const filterBar = document.getElementById('filter-bar');
            
            if (userInfo) userInfo.classList.remove('hidden');
            if (userName) userName.innerText = user.displayName || user.email || "User";
            if (inputSection) inputSection.classList.remove('hidden');
            if (tierContainer) tierContainer.classList.remove('hidden');
            if (modeSelector) modeSelector.classList.remove('hidden');
            if (filterBar) filterBar.classList.remove('hidden');
            document.body.classList.add('mode-watch');
            
            console.log("[Auth] UI transition complete, loading data...");
            
            // Data Initialization (in background to avoid blocking UI)
            await initializeTiers().catch(e => console.error("[Auth] Tiers Init Error:", e));
            await initializePeople().catch(e => console.error("[Auth] People Init Error:", e));
            loadData();
        } else {
            currentUser = null;
            if (loginOverlay) loginOverlay.classList.remove('hidden');
            if (document.getElementById('user-info')) document.getElementById('user-info').classList.add('hidden');
            if (inputSection) inputSection.classList.add('hidden');
            if (tierContainer) tierContainer.classList.add('hidden');
            if (modeSelector) modeSelector.classList.add('hidden');
            if (document.getElementById('filter-bar')) document.getElementById('filter-bar').classList.add('hidden');
            document.body.classList.remove('mode-edit', 'mode-organize', 'mode-watch', 'mode-select');

        }
    } catch (err) {
        console.error("[Auth] Critical error in onAuthStateChanged:", err);
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

// Helper: Extract YouTube Video ID
function getVideoId(url) {
    if (!url) return null;
    const regex = /(?:v=|\/)([0-9A-Za-z_-]{11})/;
    const match = url.match(regex);
    return match ? match[1] : null;
}

// Check for duplicates
function findDuplicate(url) {
    const id = getVideoId(url);
    if (!id) return null;
    return cachedWatches.find(w => getVideoId(w.url) === id);
}

// Duplicate Prompt Logic
const duplicateModal = document.getElementById('duplicate-modal');
const duplicateTitle = document.getElementById('duplicate-title');
const duplicateMessage = document.getElementById('duplicate-message');
const duplicateAnywayBtn = document.getElementById('duplicate-anyway-btn');
const duplicateSkipBtn = document.getElementById('duplicate-skip-btn');

function showDuplicatePrompt(title, message, onAnyway, onSkip) {
    duplicateTitle.innerText = title;
    duplicateMessage.innerText = message;
    duplicateModal.classList.remove('hidden');
    
    duplicateAnywayBtn.onclick = () => {
        onAnyway();
        duplicateModal.classList.add('hidden');
    };
    
    duplicateSkipBtn.onclick = () => {
        if (onSkip) onSkip();
        duplicateModal.classList.add('hidden');
    };
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

// Helper: Get contrast color (black/white) based on background hex
function getContrastColor(hexColor) {
    if (!hexColor) return '#ffffff';
    // Remove # if present
    const hex = hexColor.replace('#', '');
    
    // Handle short hex (e.g. #333)
    let r, g, b;
    if (hex.length === 3) {
        r = parseInt(hex.charAt(0) + hex.charAt(0), 16);
        g = parseInt(hex.charAt(1) + hex.charAt(1), 16);
        b = parseInt(hex.charAt(2) + hex.charAt(2), 16);
    } else {
        r = parseInt(hex.substr(0, 2), 16);
        g = parseInt(hex.substr(2, 2), 16);
        b = parseInt(hex.substr(4, 2), 16);
    }
    
    // Calculate brightness using the YIQ formula
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness > 128 ? '#000000' : '#ffffff';
}

// Helper: Format time ago
function timeAgo(timestamp) {
    if (!timestamp) return "";
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + "y";
    
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + "mo";
    
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + "d";
    
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + "h";
    
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + "m";
    
    return "now";
}

// Helper: HSL to Hex
function hslToHex(h, s, l) {
    l /= 100;
    const a = s * Math.min(l, 1 - l) / 100;
    const f = n => {
        const k = (n + h / 30) % 12;
        const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
        return Math.round(255 * color).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
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

    const existing = findDuplicate(url);
    if (existing) {
        showDuplicatePrompt(
            "Duplicate Detected",
            `"${existing.movieTitle}" is already in your list. Would you like to add it anyway?`,
            () => proceedWithSingleAdd(url),
            () => { trailerInput.value = ""; }
        );
        return;
    }

    await proceedWithSingleAdd(url);
}

async function proceedWithSingleAdd(url) {
    addBtn.disabled = true;
    addBtn.innerText = "Fetching Title...";

    const rawTitle = await getVideoData(url);
    const cleanedTitle = cleanTitle(rawTitle);

    await saveItem({
        url,
        thumb: getThumbnail(url),
        movieTitle: cleanedTitle,
        type: typeToggle.value,
        watchStatus: statusToggle.value,
        genre: genreInput.value,
        watchWith: Array.from(selectedPeople).join(', '),
        tier: initialTierSelect.value || (userTiers.length > 0 ? userTiers[userTiers.length - 1].id : 'default')
    });

    trailerInput.value = "";
    genreInput.value = "";
    selectedPeople.clear();
    renderPeopleToggles();
    addBtn.disabled = false;
    addBtn.innerText = "Add to List";
    
    // Auto-focus back to input
    trailerInput.focus();
}

async function handleBatchAdd() {
    const text = batchLinksArea.value;
    if (!text) return alert("Paste some links first!");

    // Regex to find YouTube Video IDs
    const regex = /(?:v=|\/)([0-9A-Za-z_-]{11})/g;
    const matches = [...text.matchAll(regex)];
    const videoIds = [...new Set(matches.map(m => m[1]))];

    if (videoIds.length === 0) return alert("No valid YouTube links found!");

    const duplicates = [];
    const uniqueVideoIds = [];

    videoIds.forEach(id => {
        const url = `https://www.youtube.com/watch?v=${id}`;
        if (findDuplicate(url)) {
            duplicates.push(id);
        } else {
            uniqueVideoIds.push(id);
        }
    });

    if (duplicates.length > 0) {
        showDuplicatePrompt(
            "Duplicates Detected",
            `${duplicates.length} of these links are already in your list. Would you like to add them anyway?`,
            () => proceedWithBatchAdd(videoIds), // Add ALL
            () => {
                if (uniqueVideoIds.length > 0) {
                    proceedWithBatchAdd(uniqueVideoIds); // Add only unique
                } else {
                    batchLinksArea.value = "";
                    batchProgress.innerText = "All items skipped (duplicates).";
                    batchProgress.classList.remove('hidden');
                    setTimeout(() => batchProgress.classList.add('hidden'), 5000);
                }
            }
        );
        return;
    }

    await proceedWithBatchAdd(uniqueVideoIds);
}

async function proceedWithBatchAdd(videoIds) {
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
            watchStatus: statusToggle.value,
            watchWith: Array.from(selectedPeople).join(', '),
            tier: initialTierSelect.value || (userTiers.length > 0 ? userTiers[userTiers.length - 1].id : 'default')
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
        tier: data.tier || (userTiers.length > 0 ? userTiers[0].id : 'default'),
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
    if (!currentUser) return;

    // Sync Tiers
    const tiersQ = query(collection(db, "tiers"), where("uid", "==", currentUser.uid));
    onSnapshot(tiersQ, (snapshot) => {
        userTiers = [];
        snapshot.forEach(doc => userTiers.push({ id: doc.id, ...doc.data() }));
        userTiers.sort((a, b) => a.order - b.order);
        
        renderTiers();
        renderTierManager();
        updateTierSelect();
        renderAllCards(); // RE-RENDER CARDS when tiers change (fix for disappearing cards on rename)
    }, (err) => {
        console.error("[Firestore] Tiers listener error:", err);
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
    }, (err) => {
        console.error("[Firestore] People listener error:", err);
    });

    // Sync Watches
    const watchesQ = query(collection(db, "watches"), where("uid", "==", currentUser.uid));
    onSnapshot(watchesQ, (watchSnapshot) => {
        cachedWatches = [];
        watchSnapshot.forEach((doc) => {
            cachedWatches.push({ id: doc.id, ...doc.data() });
        });
        updateGenreDatalist();
        renderAllCards();
    }, (err) => {
        console.error("[Firestore] Watches listener error:", err);
    });
}

function updateGenreDatalist() {
    if (!genreDatalist) return;
    const genres = new Set();
    cachedWatches.forEach(w => {
        if (w.genre) genres.add(w.genre.trim());
    });
    
    const sortedGenres = Array.from(genres).sort();
    genreDatalist.innerHTML = sortedGenres.map(g => `<option value="${g}">`).join('');
}

function renderAllCards() {
    // Clear all tier lists
    document.querySelectorAll('.tier-list').forEach(l => l.innerHTML = "");
    
    const filtered = cachedWatches.filter(watch => {
        // Type filter
        if (typeFilter !== 'all' && watch.type !== typeFilter) return false;
        
        // Watch Status filter
        if (watchStatusFilter !== 'all' && (watch.watchStatus || 'first-watch') !== watchStatusFilter) return false;
        
        // People filter (ANY match)
        if (peopleFilters.size > 0) {
            const watchPeople = watch.watchWith ? watch.watchWith.split(', ').filter(s => s) : [];
            const hasMatch = Array.from(peopleFilters).some(p => watchPeople.includes(p));
            if (!hasMatch) return false;
        }
        
        // Genre filter (ANY match)
        if (genreFilters.size > 0) {
            if (!watch.genre || !genreFilters.has(watch.genre.trim())) return false;
        }
        
        // Search filter
        if (searchQuery && !watch.movieTitle.toLowerCase().includes(searchQuery)) {
            return false;
        }
        
        return true;
    });
    
    filtered.forEach(watch => {
        renderCard(watch.id, watch);
    });

    // Update genre pills to match selection state
    renderFilterGenres();

    // Update Tier Labels with Counts
    const isFiltered = typeFilter !== 'all' || watchStatusFilter !== 'all' || peopleFilters.size > 0 || genreFilters.size > 0 || searchQuery !== "";
    
    userTiers.forEach(tier => {
        const totalInTier = cachedWatches.filter(w => w.tier === tier.id).length;
        const filteredInTier = filtered.filter(w => w.tier === tier.id).length;
        
        const tierDiv = document.querySelector(`.tier[data-tier="${tier.id}"]`);
        if (tierDiv) {
            const label = tierDiv.querySelector('.tier-label');
            if (label) {
                // Keep the tier name but add the count
                const countText = isFiltered ? `${filteredInTier}/${totalInTier}` : `${totalInTier}`;
                label.innerHTML = `
                    <span class="tier-name">${tier.name}</span>
                    <span class="tier-count">(${countText})</span>
                `;
            }
        }
    });

    // Handle Empty States
    userTiers.forEach(tier => {
        const list = document.getElementById(`list-${tier.id}`);
        if (list && list.children.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'empty-state';
            empty.innerText = searchQuery ? 'No matches found in this tier' : 'No items in this tier';
            list.appendChild(empty);
        }
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
        
        const bgColor = tier.color || '#cccccc';
        const textColor = getContrastColor(bgColor);
        
        tierDiv.innerHTML = `
            <div class="tier-label" style="background:${bgColor}; color:${textColor};">${tier.name}</div>
            <div class="tier-list" id="list-${tier.id}"></div>
        `;
        tierContainer.appendChild(tierDiv);
        
        // Init Sortable for this new list
        initSortable(tierDiv.querySelector('.tier-list'));
    });
    
    initTierSortable();
}

function initTierSortable() {
    if (tierSortable) tierSortable.destroy();
    
    tierSortable = new Sortable(tierContainer, {
        animation: 150,
        handle: '.tier-label', // Allow dragging by the label
        disabled: appMode !== 'reorder-tiers',
        onEnd: async () => {
            const tiers = Array.from(tierContainer.querySelectorAll('.tier'));
            const batch = writeBatch(db);
            
            tiers.forEach((el, index) => {
                const id = el.dataset.tier;
                batch.update(doc(db, "tiers", id), { order: index });
            });
            
            try {
                await batch.commit();
                console.log("Tier order updated");
            } catch (err) {
                console.error("Tier Order Sync Error:", err);
            }
        }
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
    const snap = await getDocs(q);
    
    if (snap.empty) {
        console.log("[Init] Initializing default tiers...");
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
}

async function initializePeople() {
    const q = query(collection(db, "people"), where("uid", "==", currentUser.uid));
    const snap = await getDocs(q);
    
    if (snap.empty) {
        console.log("[Init] Initializing default people...");
        const defaults = ["Sarah", "Dad", "Mom"];
        for (const name of defaults) {
            await addDoc(collection(db, "people"), { name, uid: currentUser.uid });
        }
    }
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
    if (userTiers.length >= 24) {
        alert("Maximum limit of 24 tiers reached. Please delete a tier to add a new one.");
        return;
    }
    const name = prompt("Tier Name:", "New Tier");
    if (!name) return;
    await addDoc(collection(db, "tiers"), {
        uid: currentUser.uid,
        name: name,
        color: '#cccccc',
        order: userTiers.length > 0 ? Math.max(...userTiers.map(t => t.order)) + 1 : 0
    });
});

if (autoColorBtn) autoColorBtn.addEventListener('click', async () => {
    if (userTiers.length === 0) return;
    
    const batch = writeBatch(db);
    userTiers.forEach((tier, index) => {
        const hue = (index / userTiers.length) * 360;
        const hex = hslToHex(hue, 70, 60); // 70% saturation, 60% lightness for vibrant colors
        batch.update(doc(db, "tiers", tier.id), { color: hex });
    });
    
    try {
        await batch.commit();
        console.log("Tier colors updated to spectrum");
    } catch (err) {
        console.error("Auto Color Sync Error:", err);
    }
});

function renderCard(id, data) {
    let list = document.getElementById(`list-${data.tier}`);
    
    // Fallback: If the assigned tier list doesn't exist, put it in the first available tier
    if (!list && userTiers.length > 0) {
        list = document.getElementById(`list-${userTiers[0].id}`);
    }
    
    if (!list) return; // Tier might not be loaded yet or no tiers exist
    
    const card = document.createElement('div');
    card.className = `media-card ${selectedCardIds.has(id) ? 'selected' : ''}`;
    card.dataset.id = id;
    
    const displayTitle = data.movieTitle || 'Movie';
    
    card.innerHTML = `
        <img src="${data.thumb}" alt="thumbnail">
        <span class="badge">${data.type.toUpperCase()}</span>
        ${data.watchStatus === 'rewatch' 
            ? '<span class="badge rewatch-badge">REWATCH</span>' 
            : data.watchStatus === 'new-episodes'
                ? '<span class="badge new-episodes-badge">NEW EPS</span>'
                : '<span class="badge first-watch-badge">FIRST WATCH</span>'}
        <div class="card-info">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 5px;">
                <h4 class="card-title" style="flex: 1;">${displayTitle}</h4>
                <span style="font-size: 9px; opacity: 0.5; white-space: nowrap; margin-top: 2px;">${timeAgo(data.timestamp)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: 4px;">
                <p style="margin:0; font-size:10px; color:#aaa;">${data.watchWith ? 'With: ' + data.watchWith : 'Solo'}</p>
                <span class="card-genre">${data.genre || ''}</span>
            </div>
        </div>
        <div class="card-actions">
            <button class="action-btn copy-link-btn" title="Copy Link" onclick="event.stopPropagation(); copyToClipboard('${data.url}')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 14px; height: 14px;">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
            </button>
            <button class="action-btn delete-card-btn" title="Quick Delete" onclick="event.stopPropagation(); deleteEntry('${id}')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 14px; height: 14px;">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    <line x1="10" y1="11" x2="10" y2="17"></line>
                    <line x1="14" y1="11" x2="14" y2="17"></line>
                </svg>
            </button>
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
            // Edit Mode or others
            openEditModal(id, data);
        }
    };
    
    list.appendChild(card);
}

window.copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => {
        // Optional: toast or visual feedback
        console.log("Copied to clipboard");
    }).catch(err => {
        console.error("Failed to copy:", err);
    });
};

function openEditModal(id, data) {
    editingItemId = id;
    editTitleInput.value = data.movieTitle || "";
    editYoutubeLink.href = data.url;
    if (editGenreInput) editGenreInput.value = data.genre || "";
    
    const editThumb = document.getElementById('edit-thumb');
    if (editThumb) editThumb.src = data.thumb || "";
    
    if (editTypeSelect) editTypeSelect.value = data.type || 'movie';
    if (editStatusSelect) editStatusSelect.value = data.watchStatus || 'first-watch';
    
    // Date Added display
    const dateAddedEl = document.getElementById('edit-date-added');
    if (dateAddedEl && data.timestamp) {
        const date = new Date(data.timestamp);
        dateAddedEl.innerText = `Added on: ${date.toLocaleDateString()} ${date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
    } else if (dateAddedEl) {
        dateAddedEl.innerText = "Added on: Unknown";
    }
    
    // Parse existing people
    editingItemPeople = new Set(data.watchWith ? data.watchWith.split(', ').filter(s => s) : []);
    renderEditPeopleToggles();
    
    editModal.classList.remove('hidden');
    
    // Quick Sort Navigation visibility
    if (isQuickSortMode) {
        prevQuickSortBtn.classList.remove('hidden');
        nextQuickSortBtn.classList.remove('hidden');
        
        // Key Guide
        const keyGuide = document.getElementById('quick-sort-key-guide');
        const keyGuideList = document.getElementById('key-guide-list');
        if (keyGuide && keyGuideList) {
            keyGuide.classList.remove('hidden');
            keyGuideList.innerHTML = userTiers.map((t, i) => `
                <div class="key-hint">
                    <span style="background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 4px; font-family: monospace; border: 1px solid var(--border);">${QUICK_SORT_TIER_KEYS[i].toUpperCase()}</span>
                    <span style="color: ${t.color || '#fff'}; margin-left: 4px;">${t.name}</span>
                </div>
            `).join('');
        }
        
        // Update title to show progress
        const titleEl = editModal.querySelector('h3');
        if (titleEl) titleEl.innerText = `Quick Sort (${quickSortIndex + 1}/${quickSortItems.length})`;
    } else {
        prevQuickSortBtn.classList.add('hidden');
        nextQuickSortBtn.classList.add('hidden');
        const keyGuide = document.getElementById('quick-sort-key-guide');
        if (keyGuide) keyGuide.classList.add('hidden');
        const titleEl = editModal.querySelector('h3');
        if (titleEl) titleEl.innerText = `Edit Entry`;
    }
    
    // Focus title input if not in Quick Sort mode
    if (!isQuickSortMode) {
        setTimeout(() => editTitleInput.focus(), 100);
    }
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

// Global Keyboard Shortcuts
window.addEventListener('keydown', (e) => {
    // 1. ESC to close modals
    if (e.key === 'Escape') {
        const openModals = document.querySelectorAll('.modal-overlay:not(.hidden)');
        openModals.forEach(m => m.classList.add('hidden'));
        
        // Also close managers
        if (tierManagerSection) tierManagerSection.classList.add('hidden');
        if (peopleManagerSection) peopleManagerSection.classList.add('hidden');
    }
    
    // 2. / or Cmd/Ctrl + F to focus search
    if (e.key === '/' || ((e.ctrlKey || e.metaKey) && e.key === 'f')) {
        if (document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
            e.preventDefault();
            if (searchInput) searchInput.focus();
        }
    }
    
    // 3. Enter in Add section or Modals
    if (e.key === 'Enter') {
        if (document.activeElement === trailerInput) {
            addBtn.click();
        } else if (document.activeElement === editTitleInput) {
            saveEditBtn.click();
        }
    }
    
    // 4. Quick Sort Navigation Arrows
    if (isQuickSortMode && !editModal.classList.contains('hidden')) {
        const isTextInput = document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA';
        const isSelect = document.activeElement.tagName === 'SELECT';
        const shortcutsEnabled = enableShortcutsToggle ? enableShortcutsToggle.checked : true;
        
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
            const shouldNavigate = (!isTextInput && !isSelect) || (document.activeElement === editTitleInput && e.key === 'ArrowDown') || (document.activeElement === editGenreInput && e.key === 'ArrowDown');
            
            if (shouldNavigate) {
                e.preventDefault();
                saveAndNavigate(1);
            }
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
            const shouldNavigate = (!isTextInput && !isSelect) || (document.activeElement === editTitleInput && e.key === 'ArrowUp') || (document.activeElement === editGenreInput && e.key === 'ArrowUp');
            
            if (shouldNavigate) {
                e.preventDefault();
                saveAndNavigate(-1);
            }
        }
        
        // 5. Tier Shortcuts (q, w, e, r...)
        if (shortcutsEnabled && !isTextInput && !isSelect) {
            const key = e.key.toLowerCase();
            const keyIndex = QUICK_SORT_TIER_KEYS.indexOf(key);
            if (keyIndex !== -1 && keyIndex < userTiers.length) {
                e.preventDefault();
                moveCurrentToTier(userTiers[keyIndex].id);
            }
        }
    }
});