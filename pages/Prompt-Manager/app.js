// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import {
    getAuth,
    GoogleAuthProvider,
    signInWithPopup,
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import {
    getFirestore,
    collection,
    addDoc,
    onSnapshot,
    query,
    orderBy,
    serverTimestamp,
    doc,
    updateDoc,
    deleteDoc,
    writeBatch
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

console.log("🚀 App initializing...");

// TODO: Replace this object with your exact config from the Firebase Console
const firebaseConfig = {
    apiKey: "AIzaSyAbvX0d2UKFxykkv_ZIMqKIauHIWGukK28",
    authDomain: "xanders-prompt-manager.firebaseapp.com",
    projectId: "xanders-prompt-manager",
    storageBucket: "xanders-prompt-manager.firebasestorage.app",
    messagingSenderId: "428925411386",
    appId: "1:428925411386:web:5308be7aa6aae62c515503"
};
// Initialize Firebase
let app, auth, db;
try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    console.log("✅ Firebase initialized successfully.");
} catch (error) {
    console.error("❌ Error initializing Firebase. Did you add your config?", error);
}

// DOM Elements
const authSection = document.getElementById('auth-section');
const appSection = document.getElementById('app-section');
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const userPfp = document.getElementById('user-pfp');
const userName = document.getElementById('user-name');
const addPromptForm = document.getElementById('add-prompt-form');
const promptsFeed = document.getElementById('prompts-feed');
const addPromptModal = document.getElementById('add-prompt-modal');
const openModalBtn = document.getElementById('open-modal-btn');
const closeModalBtn = document.getElementById('close-modal-btn');
const modalTitle = document.getElementById('modal-title');
const submitPromptBtn = document.getElementById('submit-prompt-btn');
const modalDeleteBtn = document.getElementById('modal-delete-btn');
const modalCategorySelect = document.getElementById('modal-category-select');
const toggleNewCategoryBtn = document.getElementById('toggle-new-category-btn');
const manualCategoryInputs = document.getElementById('manual-category-inputs');
const categoryBgColor = document.getElementById('category-bg-color');
const categoryTextColor = document.getElementById('category-text-color');
const promptCategory = document.getElementById('prompt-category');
const categoryError = document.getElementById('category-error');
const dynamicBlocksContainer = document.getElementById('dynamic-blocks-container');
const addTextBlockBtn = document.getElementById('add-text-block-btn');
const addCodeBlockBtn = document.getElementById('add-code-block-btn');
const addRememberBlockBtn = document.getElementById('add-remember-block-btn');

// Filter & Search DOM Elements
const searchInput = document.getElementById('search-prompts');
const categoryFilter = document.getElementById('category-filter');
const clearSearchBtn = document.getElementById('clear-search-btn');
const exportBtn = document.getElementById('export-btn');
const importTriggerBtn = document.getElementById('import-trigger-btn');
const importFile = document.getElementById('import-file');
const reorderBtn = document.getElementById('reorder-btn');
const promptCountDisplay = document.getElementById('prompt-count-display');

// Mobile Menu Elements
const burgerMenuBtn = document.getElementById('burger-menu-btn');
const mobileMenu = document.getElementById('mobile-menu');
const closeMobileMenu = document.getElementById('close-mobile-menu');
const mobileExportBtn = document.getElementById('mobile-export-btn');
const mobileImportBtn = document.getElementById('mobile-import-btn');
const mobileLogoutBtn = document.getElementById('mobile-logout-btn');
const mobileReorderBtn = document.getElementById('mobile-reorder-btn');

// Reorder Modal Elements
const reorderModal = document.getElementById('reorder-modal');
const reorderList = document.getElementById('reorder-list');
const closeReorderModalBtn = document.getElementById('close-reorder-modal-btn');
const cancelReorderBtn = document.getElementById('cancel-reorder-btn');
const saveReorderBtn = document.getElementById('save-reorder-btn');

let sortableInstance = null;

// Counter DOM Elements
const charCount = document.getElementById('char-count');
const tokenCount = document.getElementById('token-count');
const promptContentArea = document.getElementById('prompt-content');
const promptCodeArea = document.getElementById('prompt-code');
const promptCodeContainer = document.getElementById('prompt-code-container');

// Metadata Modal Elements
const modalMetadata = document.getElementById('modal-metadata');
const createdAtText = document.getElementById('created-at-text');
const lastEditedText = document.getElementById('last-edited-text');
const lastUsedText = document.getElementById('last-used-text');

// Delete Modal DOM Elements
const deleteConfirmModal = document.getElementById('delete-confirm-modal');
const closeDeleteModalBtn = document.getElementById('close-delete-modal-btn');
const cancelDeleteBtn = document.getElementById('cancel-delete-btn');
const confirmDeleteBtn = document.getElementById('confirm-delete-btn');

// Import Modal Elements
const importStatusModal = document.getElementById('import-status-modal');
const importAddedText = document.getElementById('import-added-text').querySelector('span');
const importSkippedText = document.getElementById('import-skipped-text').querySelector('span');
const closeImportModalBtn = document.getElementById('close-import-modal-btn');
const importDoneBtn = document.getElementById('import-done-btn');

// State for Editing/Deleting
let isEditing = false;
let currentPromptId = null;
let promptIdToDelete = null;

let allPromptsData = []; // Store the full list for local filtering
let knownCategories = {}; // Maps category name to {bg, text}

// Auth Provider
const provider = new GoogleAuthProvider();

// Login Logic
loginBtn.addEventListener('click', async () => {
    try {
        console.log("Attempting Google Login...");
        await signInWithPopup(auth, provider);
        console.log("✅ Login successful");
    } catch (error) {
        console.error("❌ Login failed:", error.message);
    }
});

// Mobile Menu Toggle Logic
const toggleMobileMenu = (show) => {
    mobileMenu.classList.toggle('hidden', !show);
};

burgerMenuBtn.addEventListener('click', () => toggleMobileMenu(true));
closeMobileMenu.addEventListener('click', () => toggleMobileMenu(false));
mobileMenu.addEventListener('click', (e) => {
    if (e.target === mobileMenu) toggleMobileMenu(false);
});

// Bind Mobile Actions to existing logic
mobileExportBtn.addEventListener('click', () => {
    toggleMobileMenu(false);
    exportBtn.click();
});
mobileImportBtn.addEventListener('click', () => {
    toggleMobileMenu(false);
    importTriggerBtn.click();
});
mobileLogoutBtn.addEventListener('click', () => {
    toggleMobileMenu(false);
    logoutBtn.click();
});

mobileReorderBtn.addEventListener('click', () => {
    toggleMobileMenu(false);
    openReorderModal();
});

reorderBtn.addEventListener('click', () => openReorderModal());

// Textarea Auto-Resize Logic
const autoResizeTextarea = (el) => {
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
};

[document.getElementById('prompt-title'), document.getElementById('prompt-category')].forEach(el => {
    el.addEventListener('input', () => autoResizeTextarea(el));
});

// Modal Logic
openModalBtn.addEventListener('click', () => {
    isEditing = false;
    currentPromptId = null;
    modalTitle.textContent = "Add New Prompt";
    submitPromptBtn.textContent = "Add Prompt";
    
    // Hide Delete button in Add mode
    modalDeleteBtn.classList.add('hidden');
    
    addPromptForm.reset();
    dynamicBlocksContainer.innerHTML = ''; // Clear dynamic blocks
    modalMetadata.classList.add('hidden');
    
    // Reset category selection
    modalCategorySelect.value = "";
    manualCategoryInputs.classList.add('hidden');
    promptCategory.value = "";
    categoryBgColor.value = "#190d33";
    categoryTextColor.value = "#ffffff";
    categoryError.classList.add('hidden');
    promptCodeContainer.classList.add('hidden');
    submitPromptBtn.disabled = false;
    addPromptModal.classList.remove('hidden');
    setTimeout(() => {
        const titleEl = document.getElementById('prompt-title');
        titleEl.focus();
        autoResizeTextarea(titleEl);
        autoResizeTextarea(document.getElementById('prompt-category'));
    }, 100);
});

// Dynamic Blocks Modal Logic
const addDynamicBlock = (type, content = '') => {
    const blockId = Date.now() + Math.random().toString(36).substr(2, 9);
    const blockDiv = document.createElement('div');
    blockDiv.className = 'dynamic-block-item';
    blockDiv.dataset.type = type;
 
    let blockLabel = '';
    let placeholder = '';
    if (type === 'code') {
        blockLabel = 'Additional Code Snippet';
        placeholder = 'Enter code...';
    } else if (type === 'remember') {
        blockLabel = 'Things to Remember (Internal Note)';
        placeholder = 'Enter notes...';
    } else {
        blockLabel = 'Additional Text Block';
        placeholder = 'Enter text...';
    }

    blockDiv.innerHTML = `
        <div class="dynamic-block-header">
            <label>${blockLabel}</label>
            <button type="button" class="remove-block-btn" data-id="${blockId}">Remove</button>
        </div>
        <textarea class="dynamic-content ${type === 'code' ? 'code-textarea' : ''}" placeholder="${placeholder}" rows="${type === 'code' ? 3 : 2}">${escapeHTML(content)}</textarea>
    `;

    dynamicBlocksContainer.appendChild(blockDiv);
    
    const textarea = blockDiv.querySelector('textarea');
    textarea.addEventListener('input', () => autoResizeTextarea(textarea));
    autoResizeTextarea(textarea);

    blockDiv.querySelector('.remove-block-btn').addEventListener('click', () => {
        blockDiv.remove();
    });
};

addTextBlockBtn.addEventListener('click', () => addDynamicBlock('text'));
addCodeBlockBtn.addEventListener('click', () => {
    if (promptCodeContainer.classList.contains('hidden')) {
        promptCodeContainer.classList.remove('hidden');
        promptCodeArea.focus();
        autoResizeTextarea(promptCodeArea);
    } else {
        addDynamicBlock('code');
    }
});
addRememberBlockBtn.addEventListener('click', () => addDynamicBlock('remember'));

closeModalBtn.addEventListener('click', () => {
    addPromptModal.classList.add('hidden');
});

// Close modal when clicking outside content
addPromptModal.addEventListener('click', (e) => {
    if (e.target === addPromptModal) {
        addPromptModal.classList.add('hidden');
    }
});

// Delete Modal Control
const closeDeleteModal = () => {
    deleteConfirmModal.classList.add('hidden');
    promptIdToDelete = null;
};

closeDeleteModalBtn.addEventListener('click', closeDeleteModal);
cancelDeleteBtn.addEventListener('click', closeDeleteModal);
deleteConfirmModal.addEventListener('click', (e) => {
    if (e.target === deleteConfirmModal) closeDeleteModal();
});

confirmDeleteBtn.addEventListener('click', async () => {
    if (!promptIdToDelete) return;
    try {
        await deleteDoc(doc(db, "prompts", promptIdToDelete));
        console.log("✅ Prompt deleted successfully");
        closeDeleteModal();
    } catch (error) {
        console.error("❌ Error deleting prompt:", error);
    }
});

// Import Modal Control
const closeImportModal = () => {
    importStatusModal.classList.add('hidden');
};

closeImportModalBtn.addEventListener('click', closeImportModal);
importDoneBtn.addEventListener('click', closeImportModal);
importStatusModal.addEventListener('click', (e) => {
    if (e.target === importStatusModal) closeImportModal();
});

// Reorder Modal Logic
const openReorderModal = () => {
    reorderList.innerHTML = '';
    
    // Populate list with current filtered prompts
    allPromptsData.forEach(item => {
        const li = document.createElement('li');
        li.className = 'reorder-item';
        li.dataset.id = item.id;
        li.innerHTML = `
            <span class="reorder-item-title">${escapeHTML(item.data.title)}</span>
            <span class="drag-handle">☰</span>
        `;
        reorderList.appendChild(li);
    });

    // Initialize Sortable
    if (!sortableInstance) {
        sortableInstance = new Sortable(reorderList, {
            animation: 150,
            handle: '.reorder-item', // Dragging anywhere on the item
            ghostClass: 'sortable-ghost',
            chosenClass: 'sortable-chosen',
            dragClass: 'sortable-drag',
            forceFallback: true // Better touch support
        });
    }

    reorderModal.classList.remove('hidden');
};

const closeReorderModal = () => {
    reorderModal.classList.add('hidden');
};

closeReorderModalBtn.addEventListener('click', closeReorderModal);
cancelReorderBtn.addEventListener('click', closeReorderModal);
reorderModal.addEventListener('click', (e) => {
    if (e.target === reorderModal) closeReorderModal();
});

saveReorderBtn.addEventListener('click', async () => {
    const items = reorderList.querySelectorAll('.reorder-item');
    const batch = writeBatch(db);
    
    items.forEach((li, index) => {
        const promptId = li.dataset.id;
        const promptRef = doc(db, "prompts", promptId);
        batch.update(promptRef, { sortOrder: index });
    });

    try {
        saveReorderBtn.disabled = true;
        saveReorderBtn.textContent = 'Saving...';
        await batch.commit();
        console.log("✅ Custom order saved successfully");
        closeReorderModal();
    } catch (err) {
        console.error("❌ Failed to save custom order:", err);
        alert("Failed to save order. Please try again.");
    } finally {
        saveReorderBtn.disabled = false;
        saveReorderBtn.textContent = 'Save Order';
    }
});

// Search & Filter Events
searchInput.addEventListener('input', () => {
    applyFilters();
    clearSearchBtn.classList.toggle('hidden', !searchInput.value);
});

clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    applyFilters();
    clearSearchBtn.classList.add('hidden');
    searchInput.focus();
});

categoryFilter.addEventListener('change', () => applyFilters());

// Category Modal Selection Interactivity
modalCategorySelect.addEventListener('change', () => {
    const selected = modalCategorySelect.value;
    if (selected && knownCategories[selected]) {
        // Sync the hidden inputs with known values
        promptCategory.value = selected;
        categoryBgColor.value = knownCategories[selected].bg;
        categoryTextColor.value = knownCategories[selected].text;
        
        // Hide manual inputs if user just selected an existing one
        manualCategoryInputs.classList.add('hidden');
    } else {
        // Option to clear if "No Category" selected
        promptCategory.value = "";
    }
});

toggleNewCategoryBtn.addEventListener('click', () => {
    manualCategoryInputs.classList.toggle('hidden');
    if (!manualCategoryInputs.classList.contains('hidden')) {
        promptCategory.focus();
    } else {
        // If hidden, clear errors and restore button
        categoryError.classList.add('hidden');
        submitPromptBtn.disabled = false;
    }
});

// Category Duplicate Validation
promptCategory.addEventListener('input', () => {
    const val = promptCategory.value.trim();
    if (val && Object.keys(knownCategories).includes(val)) {
        categoryError.classList.remove('hidden');
        submitPromptBtn.disabled = true;
    } else {
        categoryError.classList.add('hidden');
        submitPromptBtn.disabled = false;
    }
});

// Real-time Counters
const updateCounters = () => {
    const totalChars = promptContentArea.value.length + (promptCodeArea.value?.length || 0);
    const estTokens = Math.ceil(totalChars / 4);
    charCount.textContent = `${totalChars} chars`;
    tokenCount.textContent = `${estTokens} tokens`;
};

promptContentArea.addEventListener('input', updateCounters);
promptCodeArea.addEventListener('input', updateCounters);

// Keyboard Shortcuts
window.addEventListener('keydown', (e) => {
    // Cmd+K or Ctrl+K to search
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchInput.focus();
    }
    
    // Esc to close modals
    if (e.key === 'Escape') {
        addPromptModal.classList.add('hidden');
        deleteConfirmModal.classList.add('hidden');
    }
    
    // Cmd+Enter or Ctrl+Enter to save in modal
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !addPromptModal.classList.contains('hidden')) {
        e.preventDefault();
        addPromptForm.requestSubmit();
    }
});

// --- Export & Import Logic ---

exportBtn.addEventListener('click', () => {
    if (allPromptsData.length === 0) {
        alert("No prompts to export!");
        return;
    }

    // Prepare data (strip Firestore-specific IDs)
    const exportData = allPromptsData.map(item => ({
        title: item.data.title,
        category: item.data.category || '',
        categoryBgColor: item.data.categoryBgColor || item.data.categoryColor || '#0a0514',
        categoryTextColor: item.data.categoryTextColor || '#ffffff',
        content: item.data.content,
        codeSnippet: item.data.codeSnippet || '',
        isPinned: item.data.isPinned || false
    }));

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `prompts_backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.log("✅ Data exported successfully.");
});

importTriggerBtn.addEventListener('click', () => importFile.click());

importFile.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
        try {
            const importedList = JSON.parse(event.target.result);
            if (!Array.isArray(importedList)) throw new Error("Invalid format");

            let importedCount = 0;
            let skippedCount = 0;

            for (const prompt of importedList) {
                // Check for exact duplicate
                const isDuplicate = allPromptsData.some(existing => 
                    existing.data.title === prompt.title &&
                    (existing.data.category || '') === (prompt.category || '') &&
                    existing.data.content === prompt.content &&
                    (existing.data.codeSnippet || '') === (prompt.codeSnippet || '')
                );

                if (!isDuplicate) {
                    await addDoc(collection(db, "prompts"), {
                        ...prompt,
                        userId: auth.currentUser.uid,
                        createdAt: serverTimestamp()
                    });
                    importedCount++;
                } else {
                    skippedCount++;
                }
            }

            // Show Modern Import Modal
            importAddedText.textContent = importedCount;
            importSkippedText.textContent = skippedCount;
            importStatusModal.classList.remove('hidden');

            importFile.value = ''; // Reset input
        } catch (err) {
            console.error("❌ Import failed:", err);
            alert("Failed to import. Please ensure the file is a valid JSON backup.");
        }
    };
    reader.readAsText(file);
});

// Auth State Observer
onAuthStateChanged(auth, (user) => {
    if (user) {
        console.log(`👤 User logged in: ${user.displayName}`);
        authSection.classList.add('hidden');
        appSection.classList.remove('hidden');

        userName.textContent = user.displayName;
        userPfp.src = user.photoURL;

        // Load prompts once user is verified
        loadPrompts();
    } else {
        console.log("👤 User is signed out.");
        authSection.classList.remove('hidden');
        appSection.classList.add('hidden');
    }
});

// Add Prompt Logic
addPromptForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    console.log("Adding/Updating prompt in database...");

    const title = document.getElementById('prompt-title').value;
    const category = document.getElementById('prompt-category').value;
    const categoryBgColor = document.getElementById('category-bg-color').value;
    const categoryTextColor = document.getElementById('category-text-color').value;
    const content = document.getElementById('prompt-content').value;
    const code = document.getElementById('prompt-code').value;

    // Collect Dynamic Blocks
    const additionalBlocks = [];
    dynamicBlocksContainer.querySelectorAll('.dynamic-block-item').forEach(block => {
        additionalBlocks.push({
            type: block.dataset.type,
            content: block.querySelector('textarea').value
        });
    });

    try {
        if (isEditing && currentPromptId) {
            // Update Existing Doc
            await updateDoc(doc(db, "prompts", currentPromptId), {
                title: title,
                category: category,
                categoryBgColor: categoryBgColor,
                categoryTextColor: categoryTextColor,
                content: content,
                codeSnippet: code,
                additionalBlocks: additionalBlocks,
                lastEdited: serverTimestamp()
            });
            console.log("✅ Prompt updated successfully!");
        } else {
            // Add New Doc
            await addDoc(collection(db, "prompts"), {
                title: title,
                category: category,
                categoryBgColor: categoryBgColor,
                categoryTextColor: categoryTextColor,
                content: content,
                codeSnippet: code,
                additionalBlocks: additionalBlocks,
                userId: auth.currentUser.uid,
                createdAt: serverTimestamp()
            });
            console.log("✅ Prompt added successfully!");
        }
        addPromptForm.reset(); // Clear the form
        addPromptModal.classList.add('hidden'); // Close the modal
    } catch (error) {
        console.error("❌ Error adding/updating document: ", error);

        // Detailed debug warning for Production mode rules
        if (error.message.includes("Missing or insufficient permissions")) {
            console.warn("🔧 FIRESTORE RULES ERROR: Since you are in Production mode, you need to update your Firestore rules to allow read/write. Go to Firebase Console > Firestore > Rules and set them to allow read, write: if request.auth != null;");
        }
    }
});

// Load and Display Prompts Real-time
function loadPrompts() {
    if (!auth.currentUser) return;

    console.log("Fetching prompts from Firestore...");

    // Simplified query: Firestore requires a composite index for dual ordering. 
    // We'll sort by createdAt here and handle 'Pin' sorting in JS to avoid index errors.
    const q = query(collection(db, "prompts"), orderBy("createdAt", "desc"));

    onSnapshot(q, (snapshot) => {
        allPromptsData = [];
        knownCategories = {}; // Reset known categories to allow cleanup of unused tags
        const categories = new Set();

        snapshot.forEach((doc) => {
            const data = doc.data();
            if (data.userId === auth.currentUser.uid) {
                allPromptsData.push({
                    id: doc.id,
                    data: data
                });
                if (data.category) {
                    categories.add(data.category);
                    // Remember colors for this category
                    knownCategories[data.category] = {
                        bg: data.categoryBgColor || data.categoryColor || '#0a0514',
                        text: data.categoryTextColor || '#ffffff'
                    };
                }
            }
        });

        // Hybrid Sorting Logic:
        // 1. Pinned items at the top
        // 2. Custom sortOrder if available
        // 3. Fallback to newest created (createdAt)
        allPromptsData.sort((a, b) => {
            // First: Pinned status
            if ((b.data.isPinned || false) !== (a.data.isPinned || false)) {
                return (b.data.isPinned || false) - (a.data.isPinned || false);
            }
            
            // Second: Manual Sort Order
            const orderA = a.data.sortOrder !== undefined ? a.data.sortOrder : 999999;
            const orderB = b.data.sortOrder !== undefined ? b.data.sortOrder : 999999;
            if (orderA !== orderB) return orderA - orderB;
            
            // Third: fallback to Date
            const dateA = a.data.createdAt?.toMillis() || 0;
            const dateB = b.data.createdAt?.toMillis() || 0;
            return dateB - dateA;
        });

        updateCategoryFilter(categories);
        updateModalCategoryDropdown();
        applyFilters();
        console.log("✅ Data sync complete.");
    }, (error) => {
        console.error("❌ Error fetching prompts: ", error);
    });
}

// Update the select dropdown with unique categories
function updateCategoryFilter(categories) {
    const currentSelection = categoryFilter.value;
    categoryFilter.innerHTML = '<option value="all">All Categories</option>';

    const sortedCategories = Array.from(categories).sort();
    sortedCategories.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat;
        option.textContent = cat;
        categoryFilter.appendChild(option);
    });

    // Re-select previously selected category if it still exists
    if (categories.has(currentSelection)) {
        categoryFilter.value = currentSelection;
    }
}

// Update the category select within the Add/Edit Modal
function updateModalCategoryDropdown() {
    const currentVal = modalCategorySelect.value;
    modalCategorySelect.innerHTML = '<option value="">No Category</option>';

    const sortedNames = Object.keys(knownCategories).sort();
    sortedNames.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        modalCategorySelect.appendChild(option);
    });

    if (knownCategories[currentVal]) {
        modalCategorySelect.value = currentVal;
    }
}

// Apply local search and filter
function applyFilters() {
    const searchTerm = searchInput.value.toLowerCase();
    const selectedCategory = categoryFilter.value;

    const filtered = allPromptsData.filter(item => {
        const matchesSearch = item.data.title.toLowerCase().includes(searchTerm);
        const matchesCategory = selectedCategory === 'all' || item.data.category === selectedCategory;
        return matchesSearch && matchesCategory;
    });

    // Update prompt count display
    if (promptCountDisplay) {
        const total = allPromptsData.length;
        const filteredCount = filtered.length;
        if (selectedCategory !== 'all') {
            promptCountDisplay.textContent = `Showing ${filteredCount} of ${total} prompts in "${selectedCategory}"`;
        } else if (searchTerm) {
            promptCountDisplay.textContent = `Found ${filteredCount} of ${total} prompts`;
        } else {
            promptCountDisplay.textContent = `Total Prompts: ${total}`;
        }
    }

    renderPrompts(filtered);
}

// Render the final list
function renderPrompts(prompts) {
    promptsFeed.innerHTML = '';

    if (prompts.length === 0) {
        promptsFeed.innerHTML = '<div class="glass-card text-center"><p style="color: var(--text-muted);">No prompts found matching your criteria.</p></div>';
        return;
    }

    prompts.forEach((item) => {
        const {
            id,
            data
        } = item;
        const card = document.createElement('div');
        card.className = 'glass-card';

        let codeHTML = data.codeSnippet ? `<div class="prompt-code-block">${escapeHTML(data.codeSnippet)}</div>` : '';
        
        let additionalBlocksHTML = '';
        if (data.additionalBlocks && data.additionalBlocks.length > 0) {
            data.additionalBlocks.forEach(block => {
                if (block.type === 'code') {
                    additionalBlocksHTML += `<div class="prompt-code-block additional-block">${escapeHTML(block.content)}</div>`;
                } else if (block.type === 'remember') {
                    additionalBlocksHTML += `
                        <div class="prompt-remember-note">
                            <span class="remember-label">Things to Remember</span>
                            <div class="remember-content">${escapeHTML(block.content)}</div>
                        </div>`;
                } else {
                    additionalBlocksHTML += `<p class="prompt-text-display additional-block" style="line-height: 1.5; color: var(--text-muted);">${renderContentWithInputs(block.content)}</p>`;
                }
            });
        }
        
        // Handle dual colors with fallbacks for older data
        let bg = data.categoryBgColor || data.categoryColor || '#0a0514';
        let text = data.categoryTextColor || '#ffffff';
        // If it was the old single-color format, we use it as 33% opacity background
        let finalBg = (data.categoryColor && !data.categoryBgColor) ? `${bg}33` : bg;
        
        let tagHTML = data.category ? `<span class="prompt-tag" style="background: ${finalBg}; color: ${text}; border-color: ${bg}55;">${escapeHTML(data.category)}</span>` : '<span></span>';
 
        card.innerHTML = `
            <div class="card-header-main">
                <h3>${escapeHTML(data.title)}</h3>
                <div class="card-header-actions">
                    <button class="expand-btn" title="Toggle Content">
                        <svg viewBox="0 0 512 336.36" class="caret-icon">
                            <path d="M42.47.01 469.5 0C492.96 0 512 19.04 512 42.5c0 11.07-4.23 21.15-11.17 28.72L294.18 320.97c-14.93 18.06-41.7 20.58-59.76 5.65-1.8-1.49-3.46-3.12-4.97-4.83L10.43 70.39C-4.97 52.71-3.1 25.86 14.58 10.47 22.63 3.46 32.57.02 42.47.01z"/>
                        </svg>
                    </button>
                    <button class="pin-btn ${data.isPinned ? 'active' : ''}" title="${data.isPinned ? 'Unpin' : 'Pin to Top'}">
                        <svg viewBox="0 0 122.879 122.867" class="pin-icon-svg">
                            <path d="M83.88,0.451L122.427,39c0.603,0.601,0.603,1.585,0,2.188l-13.128,13.125 c-0.602,0.604-1.586,0.604-2.187,0l-3.732-3.73l-17.303,17.3c3.882,14.621,0.095,30.857-11.37,42.32 c-0.266,0.268-0.535,0.529-0.808,0.787c-1.004,0.955-0.843,0.949-1.813-0.021L47.597,86.48L0,122.867l36.399-47.584L11.874,50.76 c-0.978-0.98-0.896-0.826,0.066-1.837c0.24-0.251,0.485-0.503,0.734-0.753C24.137,36.707,40.376,32.917,54.996,36.8l17.301-17.3 l-3.733-3.732c-0.601-0.601-0.601-1.585,0-2.188L81.691,0.451C82.295-0.15,83.279-0.15,83.88,0.451L83.88,0.451z"/>
                        </svg>
                    </button>
                    <button class="copy-btn" title="Copy Text">Copy</button>
                    <button class="action-btn edit-btn" title="Edit Prompt">Edit</button>
                </div>
            </div>
            <div class="prompt-body">
                <p class="prompt-text-display" style="margin-top: 10px; line-height: 1.5; color: var(--text-muted);">${renderContentWithInputs(data.content)}</p>
                ${codeHTML}
                ${additionalBlocksHTML}
            </div>
            <div class="card-tag-row">
                ${tagHTML}
            </div>
        `;
        
        if (data.isPinned) card.classList.add('pinned-card');

        // --- Handlers ---
        
        // Expansion Toggle
        const expandBtn = card.querySelector('.expand-btn');
        expandBtn.addEventListener('click', () => {
            card.classList.toggle('expanded');
        });
        
        // 0. Pin Logic
        const pinBtn = card.querySelector('.pin-btn');
        pinBtn.addEventListener('click', async () => {
            const newPinnedState = !data.isPinned;
            try {
                await updateDoc(doc(db, "prompts", id), {
                    isPinned: newPinnedState
                });
            } catch (err) {
                console.error("❌ Failed to toggle pin:", err);
            }
        });

        // Copy Logic
        const copyBtn = card.querySelector('.copy-btn');
        copyBtn.addEventListener('click', () => {
            const displayP = card.querySelector('.prompt-text-display');
            const inputs = displayP.querySelectorAll('.prompt-input');
            let reconstructedContent = data.content;

            // Simple replacement logic for copying:
            // We find all ___ patterns and replace them one by one with the current input values
            let inputIndex = 0;
            reconstructedContent = data.content.replace(/_{3,}/g, () => {
                const val = inputs[inputIndex++]?.value || '___';
                return val;
            });

            let fullPromptText = reconstructedContent;
            if (data.codeSnippet) {
                fullPromptText += `\n\n${data.codeSnippet}`;
            }

            // Append Additional Blocks (Filter out 'remember' blocks)
            if (data.additionalBlocks && data.additionalBlocks.length > 0) {
                const additionalPs = card.querySelectorAll('.prompt-text-display.additional-block');
                let blockTextIndex = 0;

                data.additionalBlocks.forEach(block => {
                    if (block.type === 'remember') return; // Do not copy internal notes

                    let blockContent = block.content;
                    if (block.type === 'text') {
                        // Reconstruct inputs for each additional text block
                        const blockInputs = additionalPs[blockTextIndex++].querySelectorAll('.prompt-input');
                        let inputIdx = 0;
                        blockContent = block.content.replace(/_{3,}/g, () => {
                            return blockInputs[inputIdx++]?.value || '___';
                        });
                    }
                    fullPromptText += `\n\n${blockContent}`;
                });
            }

            copyToClipboard(fullPromptText, copyBtn);

            // Update Last Used in Firestore
            try {
                updateDoc(doc(db, "prompts", id), {
                    lastUsed: serverTimestamp()
                });
            } catch (err) {
                console.error("❌ Failed to update last used:", err);
            }
        });

        // Edit Logic
        const editBtn = card.querySelector('.edit-btn');
        editBtn.addEventListener('click', () => {
            isEditing = true;
            currentPromptId = id;
            modalTitle.textContent = "Edit Prompt";
            submitPromptBtn.textContent = "Update Prompt";

            document.getElementById('prompt-title').value = data.title;
            
            // Sync category components
            modalCategorySelect.value = data.category || "";
            manualCategoryInputs.classList.add('hidden');
            categoryError.classList.add('hidden');
            submitPromptBtn.disabled = false;
            
            document.getElementById('prompt-category').value = data.category || '';
            document.getElementById('category-bg-color').value = data.categoryBgColor || data.categoryColor || '#0a0514';
            document.getElementById('category-text-color').value = data.categoryTextColor || '#ffffff';
            document.getElementById('prompt-content').value = data.content;
            document.getElementById('prompt-code').value = data.codeSnippet || '';
            
            if (data.codeSnippet) {
                promptCodeContainer.classList.remove('hidden');
            } else {
                promptCodeContainer.classList.add('hidden');
            }
            
            // Render Dynamic Blocks in Modal
            dynamicBlocksContainer.innerHTML = '';
            if (data.additionalBlocks && data.additionalBlocks.length > 0) {
                data.additionalBlocks.forEach(block => {
                    addDynamicBlock(block.type, block.content);
                });
            }

            updateCounters(); 
            
            // Show Delete button in Edit mode
            modalDeleteBtn.classList.remove('hidden');

            // Show Metadata
            modalMetadata.classList.remove('hidden');
            createdAtText.innerHTML = `Created: <span>${data.createdAt ? timeAgo(data.createdAt.toDate()) : 'Recently'}</span>`;
            lastEditedText.innerHTML = `Last Edited: <span>${data.lastEdited ? timeAgo(data.lastEdited.toDate()) : 'Never'}</span>`;
            lastUsedText.innerHTML = `Last Used: <span>${data.lastUsed ? timeAgo(data.lastUsed.toDate()) : 'Never'}</span>`;

            addPromptModal.classList.remove('hidden');
            setTimeout(() => {
                const titleEl = document.getElementById('prompt-title');
                titleEl.focus();
                autoResizeTextarea(titleEl);
                autoResizeTextarea(document.getElementById('prompt-category'));
                autoResizeTextarea(document.getElementById('prompt-content'));
                autoResizeTextarea(document.getElementById('prompt-code'));
                
                // Also resize all dynamically added blocks
                dynamicBlocksContainer.querySelectorAll('textarea').forEach(tx => {
                    autoResizeTextarea(tx);
                });
            }, 100);
        });

        promptsFeed.appendChild(card);
    });
}

// Global modal delete logic
modalDeleteBtn.addEventListener('click', () => {
    if (!currentPromptId) return;
    promptIdToDelete = currentPromptId;
    deleteConfirmModal.classList.remove('hidden');
});

// Clipboard Functionality
async function copyToClipboard(text, button) {
    try {
        await navigator.clipboard.writeText(text);

        // Visual Feedback
        const originalText = button.textContent;
        button.textContent = 'Copied!';
        button.classList.add('copied');

        setTimeout(() => {
            button.textContent = originalText;
            button.classList.remove('copied');
        }, 2000);

        console.log("✅ Text copied to clipboard");
    } catch (err) {
        console.error("❌ Failed to copy: ", err);

        // Fallback for older browsers/iOS
        const textArea = document.createElement("textarea");
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        try {
            document.execCommand('copy');
            button.textContent = 'Copied!';
            button.classList.add('copied');
            setTimeout(() => {
                button.textContent = 'Copy';
                button.classList.remove('copied');
            }, 2000);
        } catch (copyErr) {
            console.error("❌ Fallback copy failed", copyErr);
        }
        document.body.removeChild(textArea);
    }
}

// Security utility to prevent XSS injection
function escapeHTML(str) {
    return str.replace(/[&<>'"]/g,
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}

// Function to turn ___ into interactive inputs
function renderContentWithInputs(content) {
    const parts = content.split(/_{3,}/g);
    if (parts.length === 1) return escapeHTML(content);

    let html = '';
    parts.forEach((part, index) => {
        html += escapeHTML(part);
        if (index < parts.length - 1) {
            html += `<input type="text" class="prompt-input" placeholder="..." oninput="this.style.width = this.value.length > 0 ? ((this.value.length + 2) * 10) + 'px' : '120px';">`;
        }
    });

    return html;
}

// Logic for "Time Ago" formatting
function timeAgo(date) {
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);

    if (seconds < 60) return "just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} min${minutes > 1 ? 's' : ''} ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} day${days > 1 ? 's' : ''} ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months} month${months > 1 ? 's' : ''} ago`;
    const years = Math.floor(months / 12);
    return `${years} year${years > 1 ? 's' : ''} ago`;
}