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
    writeBatch,
    getDocs
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// Safety shim for browser environments
if (typeof process === 'undefined') {
    var process = { env: {} };
}

// TODO: Replace this object with your exact config from the Firebase Console
const firebaseConfig = {
    apiKey: process.env.PUBLIC_PROMPT_FIREBASE_API_KEY || "AIzaSyAbvX0d2UKFxykkv_ZIMqKIauHIWGukK28",
    authDomain: process.env.PUBLIC_PROMPT_FIREBASE_AUTH_DOMAIN || "xanders-prompt-manager.firebaseapp.com",
    projectId: process.env.PUBLIC_PROMPT_FIREBASE_PROJECT_ID || "xanders-prompt-manager",
    storageBucket: process.env.PUBLIC_PROMPT_FIREBASE_STORAGE_BUCKET || "xanders-prompt-manager.firebasestorage.app",
    messagingSenderId: process.env.PUBLIC_PROMPT_FIREBASE_MESSAGING_SENDER_ID || "428925411386",
    appId: process.env.PUBLIC_PROMPT_FIREBASE_APP_ID || "1:428925411386:web:5308be7aa6aae62c515503"
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
const categoryPills = document.getElementById('category-pills');
const clearSearchBtn = document.getElementById('clear-search-btn');
const importFile = document.getElementById('import-file');
const promptCountDisplay = document.getElementById('prompt-count-display');
const toastContainer = document.getElementById('toast-container');

// Mobile Menu Elements
const burgerMenuBtn = document.getElementById('burger-menu-btn');
const mobileMenu = document.getElementById('mobile-menu');
const closeMobileMenu = document.getElementById('close-mobile-menu');
const mobileExportBtn = document.getElementById('mobile-export-btn');
const mobileImportBtn = document.getElementById('mobile-import-btn');
const mobileLogoutBtn = document.getElementById('mobile-logout-btn');
const mobileCategoryColorsBtn = document.getElementById('mobile-category-colors-btn');

// --- Category Colors Modal Elements ---
const categoryColorsModal = document.getElementById('category-colors-modal');
const closeCategoryColorsModalBtn = document.getElementById('close-category-colors-modal');
const categoryColorSelect = document.getElementById('category-color-select');
const bulkCategoryBg = document.getElementById('bulk-category-bg');
const bulkCategoryText = document.getElementById('bulk-category-text');
const updateCategoryColorsBtn = document.getElementById('update-category-colors-btn');
const mobileReorderBtn = document.getElementById('mobile-reorder-btn');
const modeRadios = document.querySelectorAll('input[name="mode-select"]');
const sortSelect = document.getElementById('sort-prompts');

// Reorder Modal Elements
const reorderModal = document.getElementById('reorder-modal');
const reorderList = document.getElementById('reorder-list');
const closeReorderModalBtn = document.getElementById('close-reorder-modal-btn');
const cancelReorderBtn = document.getElementById('cancel-reorder-btn');
const saveReorderBtn = document.getElementById('save-reorder-btn');
const mobileCategorySelect = document.getElementById('mobile-category-select');
const mobileSearchBtn = document.getElementById('mobile-search-btn');
const searchWrapper = document.getElementById('search-wrapper');

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
const importAddedText = document.getElementById('import-added-text')?.querySelector('span');
const importSkippedText = document.getElementById('import-skipped-text')?.querySelector('span');
const closeImportModalBtn = document.getElementById('close-import-modal-btn');
const importDoneBtn = document.getElementById('import-done-btn');

// History Modal Elements
const historyModal = document.getElementById('input-history-modal');
const historyList = document.getElementById('history-list');
const closeHistoryModalBtn = document.getElementById('close-history-modal-btn');

// History Delete Modal Elements
const historyDeleteModal = document.getElementById('history-delete-confirm-modal');
const closeHistoryDeleteModalBtn = document.getElementById('close-history-delete-modal-btn');
const cancelHistoryDeleteBtn = document.getElementById('cancel-history-delete-btn');
const confirmHistoryDeleteBtn = document.getElementById('confirm-history-delete-btn');

// State for Editing/Deleting
let isEditing = false;
let currentPromptId = null;
let promptIdToDelete = null;
let historyIdToDelete = null;
let historyItemElementToDelete = null;

let allPromptsData = []; // Store the full list for local filtering
let knownCategories = {}; // Maps category name to {bg, text}
let currentMode = 'prompt'; // 'prompt' or 'command'
let selectedCategory = 'all'; // Default filter category
let currentSort = 'custom'; // Default sort criteria

const historyIconSVG = `
    <svg xmlns="http://www.w3.org/2000/svg" shape-rendering="geometricPrecision" text-rendering="geometricPrecision" image-rendering="optimizeQuality" fill-rule="evenodd" clip-rule="evenodd" viewBox="0 0 512 512.584" class="history-icon-svg">
        <path fill="currentColor" fill-rule="nonzero" d="M216.773 155.955c0-10.956 8.883-19.839 19.839-19.839 10.957 0 19.84 8.883 19.84 19.839v120.763l82.657 36.334c10.013 4.409 14.56 16.104 10.151 26.117-4.409 10.014-16.104 14.56-26.117 10.152l-93.509-41.105c-7.514-2.824-12.861-10.077-12.861-18.576V155.955zM9.217 153.551a21.428 21.428 0 01-.832-5.931l.161-73.416c0-11.838 9.597-21.435 21.435-21.435 11.837 0 21.434 9.597 21.434 21.435l-.062 27.86a254.75 254.75 0 0144.093-45.53c16.773-13.472 35.563-25.045 56.182-34.24C216.231-6.518 286.347-6.44 347.474 16.978c61.173 23.435 113.425 70.235 142.233 134.828 28.812 64.598 28.733 134.717 5.313 195.845-22.547 58.856-66.726 109.447-127.57 138.854l-.759.37-.495.24-.265.125a258.922 258.922 0 01-23.987 10.066c-46.959 16.986-97.357 19.764-144.937 8.557-46.364-10.918-90.11-35.071-125.474-72.238-26.203-27.538-45.267-59.347-57.102-93.082A255.833 255.833 0 011.056 232.619c.955-10.564 10.3-18.353 20.863-17.397 10.563.955 18.353 10.299 17.397 20.863-2.812 30.836 1.015 62.169 11.417 91.805 10.047 28.639 26.294 55.709 48.667 79.223 29.987 31.513 67.06 51.99 106.344 61.241 40.482 9.536 83.286 7.197 123.097-7.201 14.161-5.123 28.013-11.813 41.303-20.069a227.878 227.878 0 0036.794-28.486c.446-.422.904-.819 1.378-1.191 22.471-22.072 39.645-48.595 50.703-77.462 19.94-52.041 20.044-111.651-4.408-166.475-24.455-54.83-68.849-94.573-120.844-114.491-52.041-19.937-111.647-20.041-166.475 4.411-17.48 7.796-33.452 17.64-47.747 29.122a215.822 215.822 0 00-37.712 39.038l17.096-.966c11.837-.648 21.963 8.421 22.61 20.258.648 11.837-8.42 21.963-20.258 22.611l-69.723 3.942c-11.018.603-20.551-7.215-22.341-17.844z"/></svg>
`;

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

mobileExportBtn.addEventListener('click', () => {
    toggleMobileMenu(false);
    handleExport();
});
mobileImportBtn.addEventListener('click', () => {
    toggleMobileMenu(false);
    importFile.click();
});
mobileLogoutBtn.addEventListener('click', () => {
    toggleMobileMenu(false);
    signOut(auth);
});

mobileReorderBtn.addEventListener('click', () => {
    toggleMobileMenu(false);
    openReorderModal();
});

mobileCategoryColorsBtn.addEventListener('click', () => {
    toggleMobileMenu(false);
    openCategoryColorsModal();
});

// Mode Toggle logic
modeRadios.forEach(radio => {
    radio.addEventListener('change', () => {
        if (radio.checked) {
            currentMode = radio.value;
            handleModeChange();
        }
    });
});

function handleModeChange() {
    console.log(`🔄 Switched to ${currentMode} mode`);
    
    // Update UI state classes
    document.body.classList.remove('command-mode-active', 'link-mode-active');
    if (currentMode === 'command') {
        document.body.classList.add('command-mode-active');
    } else if (currentMode === 'link') {
        document.body.classList.add('link-mode-active');
    }
    
    // Update labels
    if (currentMode === 'command') {
        openModalBtn.textContent = '+ New Command';
        searchInput.placeholder = 'Search commands...';
    } else if (currentMode === 'link') {
        openModalBtn.textContent = '+ New Link';
        searchInput.placeholder = 'Search links...';
    } else {
        openModalBtn.textContent = '+ New Prompt';
        searchInput.placeholder = 'Search prompts (Ctrl+K)...';
    }
    
    // Reset filters and search
    searchInput.value = '';
    selectedCategory = 'all';
    
    // Re-load categories and filter view
    loadModeSpecificCategories();
    applyFilters();
}

// Textarea Auto-Resize Logic
const autoResizeTextarea = (el) => {
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
};

[
    document.getElementById('prompt-title'),
    document.getElementById('prompt-category'),
    document.getElementById('prompt-content'),
    document.getElementById('prompt-code')
].forEach(el => {
    el.addEventListener('input', () => autoResizeTextarea(el));
});

// Modal Logic
openModalBtn.addEventListener('click', () => {
    isEditing = false;
    currentPromptId = null;
    promptCodeContainer.classList.add('hidden');
    submitPromptBtn.disabled = false;
    
    // Mode-specific modal adjustments
    if (currentMode === 'command') {
        modalTitle.textContent = "Add New Command";
        submitPromptBtn.textContent = "Add Command";
        document.getElementById('prompt-title').placeholder = "Command Title";
        document.getElementById('prompt-content').required = false;
        promptCodeContainer.classList.remove('hidden'); // Show code by default for commands
        document.getElementById('prompt-code').placeholder = "Main command...";
    } else if (currentMode === 'link') {
        modalTitle.textContent = "Add New Link";
        submitPromptBtn.textContent = "Add Link";
        document.getElementById('prompt-title').placeholder = "Link Display Name (e.g. My Website)";
        document.getElementById('prompt-content').required = true;
        document.getElementById('prompt-content').placeholder = "URL (https://...)";
        promptCodeContainer.classList.add('hidden');
        document.getElementById('prompt-code').placeholder = "Optional notes...";
    } else {
        modalTitle.textContent = "Add New Prompt";
        submitPromptBtn.textContent = "Add Prompt";
        document.getElementById('prompt-title').placeholder = "Prompt Title";
        document.getElementById('prompt-content').required = true;
        document.getElementById('prompt-content').placeholder = "Main Prompt Content...";
        promptCodeContainer.classList.add('hidden'); // Hide code by default for prompts
        document.getElementById('prompt-code').placeholder = "Optional Code Snippets...";
    }

    addPromptModal.classList.remove('hidden');
    setTimeout(() => {
        const titleEl = document.getElementById('prompt-title');
        titleEl.focus();
        autoResizeTextarea(titleEl);
        autoResizeTextarea(document.getElementById('prompt-category'));
        autoResizeTextarea(document.getElementById('prompt-content'));
        autoResizeTextarea(document.getElementById('prompt-code'));
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

// Category filter event listener removed (now handled by button clicks)

// Sort Dropdown Event
sortSelect.addEventListener('change', () => {
    currentSort = sortSelect.value;
    console.log(`🔢 Sort changed to: ${currentSort}`);
    applyFilters();
});

// Mobile Mobile Search Toggle
mobileSearchBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const group = mobileSearchBtn.closest('.search-group');
    group.classList.add('active');
    searchInput.focus();
});

// Close mobile search when clicking outside
document.addEventListener('click', (e) => {
    const isSearchGroup = e.target.closest('.search-group');
    if (!isSearchGroup && window.innerWidth <= 600) {
        document.querySelector('.search-group')?.classList.remove('active');
    }
});

// Mobile Category Dropdown Event
mobileCategorySelect.addEventListener('change', () => {
    selectedCategory = mobileCategorySelect.value;
    updateActivePill();
    applyFilters();
});

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

const handleExport = () => {
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
};

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
                mode: currentMode,
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
                mode: currentMode,
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
            }
        });

        loadModeSpecificCategories();
        applyFilters();
        console.log("✅ Data sync complete.");
    }, (error) => {
        console.error("❌ Error fetching prompts: ", error);
    });
}

function loadModeSpecificCategories() {
    knownCategories = {};
    const categoriesSet = new Set();
    
    allPromptsData.forEach(item => {
        const itemMode = item.data.mode || 'prompt';
        if (itemMode === currentMode && item.data.category) {
            categoriesSet.add(item.data.category);
            knownCategories[item.data.category] = {
                bg: item.data.categoryBgColor || item.data.categoryColor || '#0a0514',
                text: item.data.categoryTextColor || '#ffffff'
            };
        }
    });
    
    if (selectedCategory !== 'all' && !categoriesSet.has(selectedCategory)) {
        selectedCategory = 'all';
    }
    updateCategoryFilter(categoriesSet);
    updateModalCategoryDropdown();
}

// Update the category filter buttons with unique categories
function updateCategoryFilter(categories) {
    categoryPills.innerHTML = '';

    // Create "All" button
    const allBtn = document.createElement('button');
    allBtn.className = `category-pill ${selectedCategory === 'all' ? 'active' : ''}`;
    allBtn.textContent = 'All Categories';
    allBtn.onclick = () => {
        selectedCategory = 'all';
        updateActivePill();
        applyFilters();
    };
    categoryPills.appendChild(allBtn);

    const sortedCategories = Array.from(categories).sort();
    sortedCategories.forEach(cat => {
        const btn = document.createElement('button');
        btn.className = `category-pill ${selectedCategory === cat ? 'active' : ''}`;
        btn.textContent = cat;
        
        // Apply category colors from knownCategories
        const colors = knownCategories[cat];
        if (colors) {
            btn.style.setProperty('--pill-bg', colors.bg);
            btn.style.setProperty('--pill-text', colors.text);
        }

        btn.onclick = () => {
            selectedCategory = cat;
            updateActivePill();
            applyFilters();
        };
        categoryPills.appendChild(btn);
    });

    // Populate Mobile Select
    mobileCategorySelect.innerHTML = '<option value="all">All Categories</option>';
    const sorted = Array.from(categories).sort();
    sorted.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.textContent = cat;
        if (selectedCategory === cat) opt.selected = true;
        mobileCategorySelect.appendChild(opt);
    });
}

function updateActivePill() {
    // Sync Mobile Select value
    if (mobileCategorySelect) {
        mobileCategorySelect.value = selectedCategory;
    }

    const pills = categoryPills.querySelectorAll('.category-pill');
    pills.forEach(pill => {
        const pillText = pill.textContent;
        const normalizedPillText = pillText === 'All Categories' ? 'all' : pillText;
        
        if (normalizedPillText === selectedCategory) {
            pill.classList.add('active');
        } else {
            pill.classList.remove('active');
        }
    });
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
    // selectedCategory is now managed as a global variable

    const filtered = allPromptsData.filter(item => {
        const itemMode = item.data.mode || 'prompt';
        if (itemMode !== currentMode) return false;
        
        const matchesSearch = item.data.title.toLowerCase().includes(searchTerm);
        const matchesCategory = selectedCategory === 'all' || item.data.category === selectedCategory;
        return matchesSearch && matchesCategory;
    });

    // Update prompt count display
    if (promptCountDisplay) {
        const totalInMode = allPromptsData.filter(item => (item.data.mode || 'prompt') === currentMode).length;
        const filteredCount = filtered.length;
        const label = currentMode === 'command' ? 'commands' : (currentMode === 'link' ? 'links' : 'prompts');
        
        if (selectedCategory !== 'all') {
            promptCountDisplay.textContent = `Showing ${filteredCount} of ${totalInMode} ${label} in "${selectedCategory}"`;
        } else if (searchTerm) {
            promptCountDisplay.textContent = `Found ${filteredCount} of ${totalInMode} ${label}`;
        } else {
            promptCountDisplay.textContent = `Total ${label.charAt(0).toUpperCase() + label.slice(1)}: ${totalInMode}`;
        }
    }

    renderPrompts(sortData(filtered));
}

// Sorting Helper Function
function sortData(prompts) {
    const sorted = [...prompts]; // Clone to avoid mutating the original array

    sorted.sort((a, b) => {
        // Universal Rule: Pinned items always stay at the top
        if ((b.data.isPinned || false) !== (a.data.isPinned || false)) {
            return (b.data.isPinned || false) - (a.data.isPinned || false);
        }

        switch (currentSort) {
            case 'alpha-asc':
                return a.data.title.localeCompare(b.data.title);
            case 'alpha-desc':
                return b.data.title.localeCompare(a.data.title);
            case 'created-desc':
                return (b.data.createdAt?.toMillis() || 0) - (a.data.createdAt?.toMillis() || 0);
            case 'created-asc':
                return (a.data.createdAt?.toMillis() || 0) - (b.data.createdAt?.toMillis() || 0);
            case 'edited-desc':
                const editedB = b.data.lastEdited?.toMillis() || b.data.createdAt?.toMillis() || 0;
                const editedA = a.data.lastEdited?.toMillis() || a.data.createdAt?.toMillis() || 0;
                return editedB - editedA;
            case 'edited-asc':
                const eA = a.data.lastEdited?.toMillis() || a.data.createdAt?.toMillis() || 0;
                const eB = b.data.lastEdited?.toMillis() || b.data.createdAt?.toMillis() || 0;
                return eA - eB;
            case 'used-desc':
                return (b.data.lastUsed?.toMillis() || 0) - (a.data.lastUsed?.toMillis() || 0);
            case 'used-asc':
                return (a.data.lastUsed?.toMillis() || 0) - (b.data.lastUsed?.toMillis() || 0);
            case 'custom':
            default:
                // Custom Order (Manual)
                const orderA = a.data.sortOrder !== undefined ? a.data.sortOrder : 999999;
                const orderB = b.data.sortOrder !== undefined ? b.data.sortOrder : 999999;
                if (orderA !== orderB) return orderA - orderB;
                // Fallback to newest if no order
                return (b.data.createdAt?.toMillis() || 0) - (a.data.createdAt?.toMillis() || 0);
        }
    });

    return sorted;
}

// Render the final list
function renderPrompts(prompts) {
    promptsFeed.innerHTML = '';

    if (prompts.length === 0) {
        const message = currentMode === 'command' ? 'No commands found matching your criteria.' : (currentMode === 'link' ? 'No links found matching your criteria.' : 'No prompts found matching your criteria.');
        promptsFeed.innerHTML = `<div class="glass-card text-center"><p style="color: var(--text-muted);">${message}</p></div>`;
        return;
    }

    prompts.forEach((item) => {
        const {
            id,
            data
        } = item;
        const card = document.createElement('div');
        card.className = 'glass-card';
        card.dataset.id = id;

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
 
        const isCommand = (data.mode === 'command');
        const isLink = (data.mode === 'link');
        
        let contentHTML = '';
        if (isLink && data.content) {
            contentHTML = `<p class="prompt-text-display link-display" style="margin-top: 10px; line-height: 1.5; color: #06d6a0; font-weight: 500; word-break: break-all;"><a href="${data.content}" target="_blank" rel="noopener noreferrer" style="color: inherit; text-decoration: none;">${escapeHTML(data.content)}</a></p>`;
        } else if (!isCommand && data.content) {
            contentHTML = `<p class="prompt-text-display" style="margin-top: 10px; line-height: 1.5; color: var(--text-muted);">${renderContentWithInputs(data.content)}</p>`;
        }

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
                    ${((data.content && /_{3,}/.test(data.content)) || (data.additionalBlocks && data.additionalBlocks.some(b => b.type === 'text' && /_{3,}/.test(b.content)))) ? `
                    <button class="history-btn outline-btn action-btn" title="Input History">
                        ${historyIconSVG}
                    </button>` : ''}
                    <button class="copy-btn" title="${isLink ? 'Copy Link' : 'Copy Text'}">
                        <svg viewBox="0 0 115.77 122.88" class="copy-icon-svg">
                            <path d="M89.62,13.96v7.73h12.19h0.01v0.02c3.85,0.01,7.34,1.57,9.86,4.1c2.5,2.51,4.06,5.98,4.07,9.82h0.02v0.02 v73.27v0.01h-0.02c-0.01,3.84-1.57,7.33-4.1,9.86c-2.51,2.5-5.98,4.06-9.82,4.07v0.02h-0.02h-61.7H40.1v-0.02 c-3.84-0.01-7.34-1.57-9.86-4.1c-2.5-2.51-4.06-5.98-4.07-9.82h-0.02v-0.02V92.51H13.96h-0.01v-0.02c-3.84-0.01-7.34-1.57-9.86-4.1 c-2.5-2.51-4.06-5.98-4.07-9.82H0v-0.02V13.96v-0.01h0.02c0.01-3.85,1.58-7.34,4.1-9.86c2.51-2.5,5.98-4.06,9.82-4.07V0h0.02h61.7 h0.01v0.02c3.85,0.01,7.34,1.57,9.86,4.1c2.5,2.51,4.06,5.98,4.07,9.82h0.02V13.96L89.62,13.96z M79.04,21.69v-7.73v-0.02h0.02 c0-0.91-0.39-1.75-1.01-2.37c-0.61-0.61-1.46-1-2.37-1v0.02h-0.01h-61.7h-0.02v-0.02c-0.91,0-1.75,0.39-2.37,1.01 c-0.61,0.61-1,1.46-1,2.37h0.02v0.01v64.59v0.02h-0.02c0,0.91,0.39,1.75,1.01,2.37c0.61,0.61,1.46,1,2.37,1v-0.02h0.01h12.19V35.65 v-0.01h0.02c0.01-3.85,1.58-7.34,4.1-9.86c2.51-2.5,5.98-4.06,9.82-4.07v-0.02h0.02H79.04L79.04,21.69z M105.18,108.92V35.65v-0.02 h0.02c0-0.91-0.39-1.75-1.01-2.37c-0.61-0.61-1.46-1-2.37-1v0.02h-0.01h-61.7h-0.02v-0.02c-0.91,0-1.75,0.39-2.37,1.01 c-0.61,0.61-1,1.46-1,2.37h0.02v0.01v73.27v0.02h-0.02c0,0.91,0.39,1.75,1.01,2.37c0.61,0.61,1.46,1,2.37,1v-0.02h0.01h61.7h0.02 v0.02c0.91,0,1.75-0.39,2.37-1.01c0.61-0.61,1-1.46,1-2.37h-0.02V108.92L105.18,108.92z" fill="currentColor"/>
                        </svg>
                    </button>
                    ${isLink ? `
                    <button class="action-btn visit-btn" onclick="window.open('${escapeHTML(data.content)}', '_blank')" title="Visit Link">
                        <svg viewBox="0 0 122.88 115.71" class="shortcut-icon-svg">
                            <path d="M116.56,3.69l-3.84,53.76l-17.69-15c-19.5,8.72-29.96,23.99-30.51,43.77c-17.95-26.98-7.46-50.4,12.46-65.97 L64.96,3L116.56,3.69L116.56,3.69z M28.3,0h14.56v19.67H32.67c-4.17,0-7.96,1.71-10.72,4.47c-2.75,2.75-4.46,6.55-4.46,10.72 l-0.03,46c0.03,4.16,1.75,7.95,4.5,10.71c2.76,2.76,6.56,4.48,10.71,4.48h58.02c4.15,0,7.95-1.72,10.71-4.48 c2.76-2.76,4.48-6.55,4.48-10.71v-6.96h17.01v11.33c0,7.77-3.2,17.04-8.32,22.16c-5.12,5.12-12.21,8.32-19.98,8.32H28.3 c-7.77,0-14.86-3.2-19.98-8.32C3.19,102.26,0,95.18,0,87.41l0.03-59.1C0,20.52,3.19,13.43,8.31,8.31C13.43,3.19,20.51,0,28.3,0 L28.3,0z" fill="currentColor"/>
                        </svg>
                    </button>` : ''}
                    <button class="action-btn edit-btn" title="Edit ${isCommand ? 'Command' : (isLink ? 'Link' : 'Prompt')}">
                        <svg viewBox="0 0 121.48 122.88" class="edit-icon-svg">
                            <path d="M96.84,2.22l22.42,22.42c2.96,2.96,2.96,7.8,0,10.76l-12.4,12.4L73.68,14.62l12.4-12.4 C89.04-0.74,93.88-0.74,96.84,2.22L96.84,2.22z M70.18,52.19L70.18,52.19l0,0.01c0.92,0.92,1.38,2.14,1.38,3.34 c0,1.2-0.46,2.41-1.38,3.34v0.01l-0.01,0.01L40.09,88.99l0,0h-0.01c-0.26,0.26-0.55,0.48-0.84,0.67h-0.01 c-0.3,0.19-0.61,0.34-0.93,0.45c-1.66,0.58-3.59,0.2-4.91-1.12h-0.01l0,0v-0.01c-0.26-0.26-0.48-0.55-0.67-0.84v-0.01 c-0.19-0.3-0.34-0.61-0.45-0.93c-0.58-1.66-0.2-3.59,1.11-4.91v-0.01l30.09-30.09l0,0h0.01c0.92-0.92,2.14-1.38,3.34-1.38 c1.2,0,2.41,0.46,3.34,1.38L70.18,52.19L70.18,52.19L70.18,52.19z M45.48,109.11c-8.98,2.78-17.95,5.55-26.93,8.33 C-2.55,123.97-2.46,128.32,3.3,108l9.07-32v0l-0.03-0.03L67.4,20.9l33.18,33.18l-55.07,55.07L45.48,109.11L45.48,109.11z M18.03,81.66l21.79,21.79c-5.9,1.82-11.8,3.64-17.69,5.45c-13.86,4.27-13.8,7.13-10.03-6.22L18.03,81.66L18.03,81.66z" fill="currentColor"/>
                        </svg>
                    </button>
                </div>
            </div>
            <div class="prompt-body">
                ${contentHTML}
                ${codeHTML}
                ${additionalBlocksHTML}
                <div class="card-body-footer">
                    <button class="collapse-btn-bottom" title="Collapse Content">Collapse</button>
                </div>
            </div>
            <div class="card-tag-row">
                ${tagHTML}
            </div>
        `;
        
        if (data.isPinned) card.classList.add('pinned-card');

        // --- Handlers ---
        
        // Expansion Toggle Logic
        const toggleExpansion = (forceState) => {
            const isExpanding = forceState !== undefined ? forceState : !card.classList.contains('expanded');
            
            if (window.innerWidth > 800) {
                const myOffset = card.offsetTop;
                const allCardsInRow = Array.from(promptsFeed.querySelectorAll('.glass-card'))
                    .filter(c => Math.abs(c.offsetTop - myOffset) < 10);
                
                let targetHeight = 0;
                if (isExpanding) {
                    // Temporarily expand the trigger card to measure its natural content height
                    const body = card.querySelector('.prompt-body');
                    const wasExpanded = card.classList.contains('expanded');
                    card.classList.add('expanded');
                    body.style.maxHeight = 'none';
                    targetHeight = body.scrollHeight;
                    body.style.maxHeight = ''; // Reset for the animation
                    if (!wasExpanded) card.classList.remove('expanded'); // Reset state if we were just measuring
                }

                allCardsInRow.forEach(c => {
                    const body = c.querySelector('.prompt-body');
                    if (isExpanding) {
                        c.classList.add('expanded');
                        // Apply fixed height only if it's the trigger or needed to match the row
                        body.style.maxHeight = (targetHeight + 20) + 'px'; // +20 for better padding
                    } else {
                        c.classList.remove('expanded');
                        body.style.maxHeight = '';
                    }
                });
            } else {
                card.classList.toggle('expanded', isExpanding);
                const body = card.querySelector('.prompt-body');
                body.style.maxHeight = isExpanding ? '2000px' : ''; 
            }
        };

        const expandBtn = card.querySelector('.expand-btn');
        expandBtn.addEventListener('click', () => toggleExpansion());
        
        const bottomCollapseBtn = card.querySelector('.collapse-btn-bottom');
        bottomCollapseBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleExpansion(false);
            // After collapsing, scroll back to the top of this card if it's off-screen
            const rect = card.getBoundingClientRect();
            if (rect.top < 0) {
                card.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
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

        // History Logic
        const historyBtn = card.querySelector('.history-btn');
        if (historyBtn) {
            historyBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                openHistoryModal(id);
            });
        }

        // Copy Logic
        const copyBtn = card.querySelector('.copy-btn');
        copyBtn.addEventListener('click', () => {
            let fullPromptText = "";
            const allInputValues = []; // Gather all values across all blocks
            const displayP = card.querySelector('.prompt-text-display');
            
            if (displayP && data.content) {
                const inputs = displayP.querySelectorAll('.prompt-input');
                let inputIndex = 0;
                fullPromptText = data.content.replace(/_{3,}/g, () => {
                    const el = inputs[inputIndex++];
                    const val = el?.textContent || '___';
                    const trimmedVal = val.trim();
                    if (trimmedVal) allInputValues.push(trimmedVal);
                    return trimmedVal || '___';
                });
            } else if (data.content) {
                // Fallback for existing data or prompts without interactive inputs
                fullPromptText = data.content;
            }

            if (data.codeSnippet) {
                fullPromptText += (fullPromptText ? "\n\n" : "") + data.codeSnippet;
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
                            const val = blockInputs[inputIdx++]?.textContent || '___';
                            const trimmedVal = val.trim();
                            if (trimmedVal) allInputValues.push(trimmedVal);
                            return trimmedVal || '___';
                        });
                    }
                    fullPromptText += (fullPromptText ? "\n\n" : "") + blockContent;
                });
            }

            // Save to history if we have any inputs
            if (allInputValues.length > 0) {
                saveInputHistory(id, allInputValues);
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
            const itemMode = data.mode || 'prompt';
            modalTitle.textContent = itemMode === 'command' ? "Edit Command" : (itemMode === 'link' ? "Edit Link" : "Edit Prompt");
            submitPromptBtn.textContent = itemMode === 'command' ? "Update Command" : (itemMode === 'link' ? "Update Link" : "Update Prompt");
            
            // Sync currentMode to item mode for editing context
            currentMode = itemMode;
            document.body.classList.remove('command-mode-active', 'link-mode-active');
            if (currentMode === 'command') document.body.classList.add('command-mode-active');
            if (currentMode === 'link') document.body.classList.add('link-mode-active');
            
            // Set the correct radio button
            const targetRadio = document.querySelector(`input[name="mode-select"][value="${currentMode}"]`);
            if (targetRadio) targetRadio.checked = true;

            openModalBtn.textContent = currentMode === 'command' ? '+ New Command' : (currentMode === 'link' ? '+ New Link' : '+ New Prompt');
            searchInput.placeholder = currentMode === 'command' ? 'Search commands...' : (currentMode === 'link' ? 'Search links...' : 'Search prompts (Ctrl+K)...');

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
            document.getElementById('prompt-code').placeholder = itemMode === 'command' ? "Main command..." : (itemMode === 'link' ? "Optional notes..." : "Optional Code Snippets...");
            
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
        button.classList.add('copied');

        setTimeout(() => {
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

    showToast("Copied to clipboard!");
}

// Helper to show a toast message
function showToast(message) {
    if (!toastContainer) return;

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
        <span>${message}</span>
    `;

    toastContainer.appendChild(toast);

    // Trigger reflow for animation
    setTimeout(() => toast.classList.add('show'), 10);

    // Remove after 3 seconds
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
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

// --- Category Colors Modal Logic ---
function openCategoryColorsModal() {
    categoryColorSelect.innerHTML = '<option value="" disabled selected>Choose a category...</option>';
    
    // Get unique categories for current mode
    const categories = [...new Set(allPromptsData
        .filter(item => (item.data.mode || 'prompt') === currentMode)
        .map(item => item.data.category)
        .filter(cat => cat && cat.trim() !== ''))];
    
    categories.sort().forEach(cat => {
        const option = document.createElement('option');
        option.value = cat;
        option.textContent = cat;
        categoryColorSelect.appendChild(option);
    });
    
    categoryColorsModal.classList.remove('hidden');
}

categoryColorSelect.addEventListener('change', () => {
    const selectedCat = categoryColorSelect.value;
    // Find first item with this category to get current colors
    const match = allPromptsData.find(item => 
        item.data.category === selectedCat && 
        (item.data.mode || 'prompt') === currentMode
    );
    
    if (match) {
        bulkCategoryBg.value = match.data.categoryBgColor || match.data.categoryColor || '#0a0514';
        bulkCategoryText.value = match.data.categoryTextColor || '#ffffff';
    }
});

if (closeCategoryColorsModalBtn) {
    closeCategoryColorsModalBtn.addEventListener('click', () => {
        categoryColorsModal.classList.add('hidden');
    });
}

// Close category colors modal on background click
if (categoryColorsModal) {
    categoryColorsModal.addEventListener('click', (e) => {
        if (e.target === categoryColorsModal) {
            categoryColorsModal.classList.add('hidden');
        }
    });
}

if (updateCategoryColorsBtn) {
    updateCategoryColorsBtn.addEventListener('click', async () => {
        const categoryName = categoryColorSelect.value;
        const newBg = bulkCategoryBg.value;
        const newText = bulkCategoryText.value;
        
        if (!categoryName) {
            alert("Please select a category first.");
            return;
        }
        
        updateCategoryColorsBtn.disabled = true;
        const originalText = updateCategoryColorsBtn.textContent;
        updateCategoryColorsBtn.textContent = "Updating...";
        
        try {
            const batch = writeBatch(db);
            const matches = allPromptsData.filter(item => 
                item.data.category === categoryName && 
                (item.data.mode || 'prompt') === currentMode
            );
            
            matches.forEach(item => {
                const docRef = doc(db, "prompts", item.id);
                batch.update(docRef, {
                    categoryBgColor: newBg,
                    categoryTextColor: newText
                });
            });
            
            await batch.commit();
            console.log(`✅ Updated colors for ${matches.length} entries in ${categoryName}`);
            
            categoryColorsModal.classList.add('hidden');
        } catch (err) {
            console.error("❌ Failed to update category colors:", err);
            alert("Failed to update colors. Check console for details.");
        } finally {
            updateCategoryColorsBtn.disabled = false;
            updateCategoryColorsBtn.textContent = originalText;
        }
    });
}

// Function to turn ___ into interactive inputs
function renderContentWithInputs(content) {
    const parts = content.split(/_{3,}/g);
    if (parts.length === 1) return escapeHTML(content);

    let html = '';
    parts.forEach((part, index) => {
        html += escapeHTML(part);
        if (index < parts.length - 1) {
            html += `<span contenteditable="plaintext-only" class="prompt-input" data-placeholder="..."></span>`;
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

// --- Input History Logic ---
async function saveInputHistory(promptId, inputs) {
    if (!auth.currentUser) return;
    try {
        await addDoc(collection(db, "prompts", promptId, "history"), {
            inputs: inputs,
            timestamp: serverTimestamp()
        });
        console.log("✅ Input history saved.");
    } catch (err) {
        console.error("❌ Failed to save history:", err);
    }
}

async function openHistoryModal(promptId) {
    currentPromptId = promptId; // Fix: Set currentPromptId so delete works
    historyList.innerHTML = '<div class="text-center"><p>Loading history...</p></div>';
    historyModal.classList.remove('hidden');

    try {
        // Fetch historical entries ordered by timestamp
        const q = query(collection(db, "prompts", promptId, "history"), orderBy("timestamp", "desc"));
        const snapshot = await getDocs(q);
        
        historyList.innerHTML = '';
        if (snapshot.empty) {
            historyList.innerHTML = '<div class="text-center"><p style="color: var(--text-muted);">No history found for this prompt.</p></div>';
            return;
        }

        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const dateStr = data.timestamp ? timeAgo(data.timestamp.toDate()) : 'Recently';
            const preview = data.inputs.join('\n');
            
            const item = document.createElement('div');
            item.className = 'history-item';
            item.innerHTML = `
                <div class="history-item-info">
                    <span class="history-item-date">${dateStr}</span>
                    <span class="history-item-preview" title="${escapeHTML(preview)}">${escapeHTML(preview)}</span>
                </div>
                <div class="history-item-actions">
                    <button class="history-restore-btn">Restore</button>
                    <button class="history-delete-btn" title="Delete Entry">&times;</button>
                </div>
            `;
            
            item.querySelector('.history-restore-btn').onclick = () => {
                restoreHistory(promptId, data.inputs);
                historyModal.classList.add('hidden');
                showToast("Inputs restored!");
            };
            
            item.querySelector('.history-delete-btn').onclick = (e) => {
                e.stopPropagation();
                historyIdToDelete = docSnap.id;
                historyItemElementToDelete = item;
                historyDeleteModal.classList.remove('hidden');
            };
            
            historyList.appendChild(item);
        });
    } catch (err) {
        console.error("❌ Error fetching history:", err);
        historyList.innerHTML = '<div class="text-center"><p style="color: #f72585;">Error loading history.</p></div>';
    }
}

function restoreHistory(promptId, inputsArr) {
    // Find the card in the feed using data-id
    const card = document.querySelector(`.glass-card[data-id="${promptId}"]`);
    if (!card) return;

    const inputs = card.querySelectorAll('.prompt-input');
    inputs.forEach((input, index) => {
        if (inputsArr[index] !== undefined) {
            input.textContent = inputsArr[index];
        }
    });
}

// History Modal Close Handlers
if (closeHistoryModalBtn) {
    closeHistoryModalBtn.onclick = () => historyModal.classList.add('hidden');
}
if (historyModal) {
    historyModal.onclick = (e) => {
        if (e.target === historyModal) historyModal.classList.add('hidden');
    };
}

// History Delete Modal Logic
const closeHistoryDeleteModal = () => {
    historyDeleteModal.classList.add('hidden');
    historyIdToDelete = null;
    historyItemElementToDelete = null;
};

if (closeHistoryDeleteModalBtn) closeHistoryDeleteModalBtn.onclick = closeHistoryDeleteModal;
if (cancelHistoryDeleteBtn) cancelHistoryDeleteBtn.onclick = closeHistoryDeleteModal;
if (confirmHistoryDeleteBtn) {
    confirmHistoryDeleteBtn.onclick = async () => {
        if (!historyIdToDelete || !currentPromptId) return;
        
        try {
            await deleteDoc(doc(db, "prompts", currentPromptId, "history", historyIdToDelete));
            if (historyItemElementToDelete) historyItemElementToDelete.remove();
            if (historyList.children.length === 0) {
                historyList.innerHTML = '<div class="text-center"><p style="color: var(--text-muted);">No history found for this prompt.</p></div>';
            }
            closeHistoryDeleteModal();
            showToast("History entry deleted.");
        } catch (err) {
            console.error("❌ Failed to delete history entry:", err);
            showToast("Failed to delete entry.");
        }
    };
}
if (historyDeleteModal) {
    historyDeleteModal.onclick = (e) => {
        if (e.target === historyDeleteModal) closeHistoryDeleteModal();
    };
}