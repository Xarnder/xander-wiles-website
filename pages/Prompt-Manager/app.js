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
    deleteDoc
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

// Delete Modal DOM Elements
const deleteConfirmModal = document.getElementById('delete-confirm-modal');
const closeDeleteModalBtn = document.getElementById('close-delete-modal-btn');
const cancelDeleteBtn = document.getElementById('cancel-delete-btn');
const confirmDeleteBtn = document.getElementById('confirm-delete-btn');

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

// Logout Logic
logoutBtn.addEventListener('click', async () => {
    try {
        await signOut(auth);
        console.log("✅ Logged out successfully");
    } catch (error) {
        console.error("❌ Logout failed:", error);
    }
});

// Modal Logic
openModalBtn.addEventListener('click', () => {
    isEditing = false;
    currentPromptId = null;
    modalTitle.textContent = "Add New Prompt";
    submitPromptBtn.textContent = "Save Prompt";
    addPromptForm.reset();
    addPromptModal.classList.remove('hidden');
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

// Search & Filter Events
searchInput.addEventListener('input', () => applyFilters());
categoryFilter.addEventListener('change', () => applyFilters());

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
                <button class="copy-btn">Copy</button>
            </div>
            <h3>${escapeHTML(data.title)}</h3>
            <p class="prompt-text-display" style="margin-top: 10px; line-height: 1.5; color: var(--text-muted);">${renderContentWithInputs(data.content)}</p>
            ${codeHTML}
            <div class="card-footer">
                <button class="action-btn edit-btn">Edit</button>
                <button class="action-btn delete-btn">Delete</button>
            </div>
        `;

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

            const fullText = data.codeSnippet ? `${reconstructedContent}\n\n${data.codeSnippet}` : reconstructedContent;
            copyToClipboard(fullText, copyBtn);
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

            addPromptModal.classList.remove('hidden');
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
            html += `<input type="text" class="prompt-input" placeholder="..." oninput="this.style.width = ((this.value.length + 2) * 10) + 'px';">`;
        }
    });

    return html;
}