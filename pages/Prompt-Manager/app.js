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

// Filter & Search DOM Elements
const searchInput = document.getElementById('search-prompts');
const categoryFilter = document.getElementById('category-filter');
const clearSearchBtn = document.getElementById('clear-search-btn');
const exportBtn = document.getElementById('export-btn');
const importTriggerBtn = document.getElementById('import-trigger-btn');
const importFile = document.getElementById('import-file');
const reorderBtn = document.getElementById('reorder-btn');

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
    submitPromptBtn.textContent = "Save Prompt";
    addPromptForm.reset();
    updateCounters(); // Reset counters
    addPromptModal.classList.remove('hidden');
    
    // Auto-focus Title
    setTimeout(() => {
        const titleEl = document.getElementById('prompt-title');
        titleEl.focus();
        autoResizeTextarea(titleEl);
        autoResizeTextarea(document.getElementById('prompt-category'));
    }, 100);
    modalMetadata.classList.add('hidden');
});

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
    console.log("Adding new prompt to database...");

    const title = document.getElementById('prompt-title').value;
    const category = document.getElementById('prompt-category').value;
    const content = document.getElementById('prompt-content').value;
    const code = document.getElementById('prompt-code').value;

    try {
        if (isEditing && currentPromptId) {
            // Update Existing Doc
            await updateDoc(doc(db, "prompts", currentPromptId), {
                title: title,
                category: category,
                content: content,
                codeSnippet: code,
                lastEdited: serverTimestamp()
            });
            console.log("✅ Prompt updated successfully!");
        } else {
            // Add New Doc
            await addDoc(collection(db, "prompts"), {
                title: title,
                category: category,
                content: content,
                codeSnippet: code,
                userId: auth.currentUser.uid,
                createdAt: serverTimestamp()
            });
            console.log("✅ Prompt added successfully!");
        }
        addPromptForm.reset(); // Clear the form
        addPromptModal.classList.add('hidden'); // Close the modal
    } catch (error) {
        console.error("❌ Error adding document: ", error);

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
        const categories = new Set();

        snapshot.forEach((doc) => {
            const data = doc.data();
            if (data.userId === auth.currentUser.uid) {
                allPromptsData.push({
                    id: doc.id,
                    data: data
                });
                if (data.category) categories.add(data.category);
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

// Apply local search and filter
function applyFilters() {
    const searchTerm = searchInput.value.toLowerCase();
    const selectedCategory = categoryFilter.value;

    const filtered = allPromptsData.filter(item => {
        const matchesSearch = item.data.title.toLowerCase().includes(searchTerm);
        const matchesCategory = selectedCategory === 'all' || item.data.category === selectedCategory;
        return matchesSearch && matchesCategory;
    });

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
        let tagHTML = data.category ? `<span class="prompt-tag">${escapeHTML(data.category)}</span>` : '<span></span>';

        card.innerHTML = `
            <div class="card-header">
                ${tagHTML}
                <div class="card-header-actions">
                    <button class="pin-btn ${data.isPinned ? 'active' : ''}" title="${data.isPinned ? 'Unpin' : 'Pin to Top'}">
                        <svg viewBox="0 0 122.879 122.867" class="pin-icon-svg">
                            <path d="M83.88,0.451L122.427,39c0.603,0.601,0.603,1.585,0,2.188l-13.128,13.125 c-0.602,0.604-1.586,0.604-2.187,0l-3.732-3.73l-17.303,17.3c3.882,14.621,0.095,30.857-11.37,42.32 c-0.266,0.268-0.535,0.529-0.808,0.787c-1.004,0.955-0.843,0.949-1.813-0.021L47.597,86.48L0,122.867l36.399-47.584L11.874,50.76 c-0.978-0.98-0.896-0.826,0.066-1.837c0.24-0.251,0.485-0.503,0.734-0.753C24.137,36.707,40.376,32.917,54.996,36.8l17.301-17.3 l-3.733-3.732c-0.601-0.601-0.601-1.585,0-2.188L81.691,0.451C82.295-0.15,83.279-0.15,83.88,0.451L83.88,0.451z"/>
                        </svg>
                    </button>
                    <button class="copy-btn">Copy</button>
                </div>
            </div>
            <h3>${escapeHTML(data.title)}</h3>
            <p class="prompt-text-display" style="margin-top: 10px; line-height: 1.5; color: var(--text-muted);">${renderContentWithInputs(data.content)}</p>
            ${codeHTML}
            <div class="card-footer">
                <button class="action-btn edit-btn">Edit</button>
                <button class="action-btn delete-btn">Delete</button>
            </div>
        `;
        
        if (data.isPinned) card.classList.add('pinned-card');

        // --- Handlers ---
        
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

            const fullPromptText = data.codeSnippet ? `${reconstructedContent}\n\n${data.codeSnippet}` : reconstructedContent;
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
            document.getElementById('prompt-category').value = data.category || '';
            document.getElementById('prompt-content').value = data.content;
            document.getElementById('prompt-code').value = data.codeSnippet || '';
            updateCounters(); 

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
            }, 100);
        });

        // Delete Logic
        const deleteBtn = card.querySelector('.delete-btn');
        deleteBtn.addEventListener('click', () => {
            promptIdToDelete = id;
            deleteConfirmModal.classList.remove('hidden');
        });

        promptsFeed.appendChild(card);
    });
}

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