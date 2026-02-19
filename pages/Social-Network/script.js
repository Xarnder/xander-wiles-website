// Import Firebase SDKs from CDN
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, addDoc, query, where, onSnapshot, doc, updateDoc, deleteDoc, orderBy } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL, listAll, getMetadata } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

// --- PASTE YOUR FIREBASE CONFIG HERE ---
const firebaseConfig = {
    apiKey: "AIzaSyC2wLw45JmXYov0lYOpMMZf3IYavURMwNc",
    authDomain: "social-network-b6579.firebaseapp.com",
    projectId: "social-network-b6579",
    storageBucket: "social-network-b6579.firebasestorage.app",
    messagingSenderId: "686831441900",
    appId: "1:686831441900:web:28d02d913ce6382e58d2c9"
};

// Initialize
let app, auth, db, storage;
try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    storage = getStorage(app);
    console.log("Firebase initialized successfully");
} catch (e) {
    console.error("Firebase Init Error: Check your firebaseConfig in app.js", e);
    document.body.innerHTML = `<h1 style="color:white;text-align:center;margin-top:50px">Error: Check Console for Firebase Config issues.</h1>`;
}

// State
let currentUser = null;
let currentPhotoBlob = null; // Holds the processed image
let cropper = null; // CropperJS instance
let allFriends = [];
let currentCalendarDate = new Date();
let undoTimeout = null;
let tempUndoData = null; // Store old date for undo
let isSelectionMode = false;
let selectedFriendIds = new Set();

// DOM Elements
const views = {
    login: document.getElementById('login-view'),
    dashboard: document.getElementById('dashboard-view')
};
const modal = document.getElementById('modal');
const friendForm = document.getElementById('friend-form');
const friendsGrid = document.getElementById('friends-grid');
const searchInput = document.getElementById('search-input');
const filterCategory = document.getElementById('filter-category');
const statusMsg = document.getElementById('status-msg');

// --- AUTHENTICATION ---
document.getElementById('google-login-btn').addEventListener('click', async () => {
    try {
        const provider = new GoogleAuthProvider();
        await signInWithPopup(auth, provider);
    } catch (error) {
        console.error("Login Failed", error);
        document.getElementById('auth-debug').innerText = "Login failed: " + error.message;
    }
});

document.getElementById('logout-btn').addEventListener('click', () => signOut(auth));

onAuthStateChanged(auth, (user) => {
    currentUser = user;
    if (user) {
        console.log("User logged in:", user.email);
        views.login.classList.add('hidden');
        views.dashboard.classList.remove('hidden');
        document.getElementById('user-name').textContent = user.displayName;
        loadFriends();
        updateStorageStats(); // Initial load
    } else {
        console.log("User logged out");
        views.login.classList.remove('hidden');
        views.dashboard.classList.add('hidden');
    }
});

// Mobile Menu Logic
const mobileMenuBtn = document.getElementById('mobile-menu-btn');
const headerActions = document.getElementById('header-actions');

if (mobileMenuBtn) {
    mobileMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        headerActions.classList.toggle('show');
    });

    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
        if (!headerActions.contains(e.target) && !mobileMenuBtn.contains(e.target)) {
            headerActions.classList.remove('show');
        }
    });
}

// --- IMAGE PROCESSING (4MP WebP) ---
// --- IMAGE PROCESSING (4MP WebP) ---
// --- IMAGE PROCESSING (4MP WebP) ---
// --- IMAGE CROPPING LOGIC ---
const cropModal = document.getElementById('crop-modal');
const cropImage = document.getElementById('crop-image');

document.getElementById('photo-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    statusMsg.innerText = "Loading image for cropping...";

    // Helper: Initialize Cropper
    const startCropper = (url) => {
        cropImage.src = url;
        cropModal.classList.remove('hidden');

        if (cropper) cropper.destroy();

        cropper = new Cropper(cropImage, {
            aspectRatio: 1,
            viewMode: 0,
            dragMode: 'move',
            autoCropArea: 0.8,
            restore: false,
            guides: true,
            center: true,
            highlight: false,
            cropBoxMovable: true,
            cropBoxResizable: true,
            toggleDragModeOnDblclick: false,
            zoomOnTouch: true,
            zoomOnWheel: true,
        });
        statusMsg.innerText = "";
    };

    // Helper: Handle HEIC or Standard Load
    const handleFile = async () => {
        // Check for HEIC
        if (file.type === "image/heic" || file.type === "image/heif" || file.name.toLowerCase().endsWith('.heic')) {
            statusMsg.innerText = "Converting HEIC...";
            if (typeof heic2any !== 'undefined') {
                try {
                    const convertedBlob = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.8 });
                    const resultBlob = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
                    startCropper(URL.createObjectURL(resultBlob));
                } catch (e) {
                    console.error(e);
                    statusMsg.innerText = "Error converting HEIC.";
                }
            } else {
                statusMsg.innerText = "HEIC converter missing.";
            }
        } else {
            // Standard Image
            const url = URL.createObjectURL(file);
            startCropper(url);
        }
    };

    handleFile();
    // Reset input so same file can be selected again if cancelled
    e.target.value = '';
});

// Crop & Save Button
document.getElementById('crop-save').addEventListener('click', () => {
    if (!cropper) return;

    statusMsg.innerText = "Processing crop...";

    // Get cropped canvas (resized to decent max dimension)
    const canvas = cropper.getCroppedCanvas({
        width: 1000,
        height: 1000,
        imageSmoothingEnabled: true,
        imageSmoothingQuality: 'high',
    });

    canvas.toBlob((blob) => {
        currentPhotoBlob = blob;

        // Update Preview
        const previewUrl = URL.createObjectURL(blob);
        document.getElementById('photo-preview').style.backgroundImage = `url(${previewUrl})`;
        document.getElementById('photo-preview').innerHTML = '';

        // Cleanup
        cropModal.classList.add('hidden');
        cropper.destroy();
        cropper = null;
        statusMsg.innerText = `Ready: ${(blob.size / 1024).toFixed(0)}KB`;
    }, 'image/webp', 0.85);
});

// Cancel Button
document.getElementById('crop-cancel').addEventListener('click', () => {
    cropModal.classList.add('hidden');
    if (cropper) {
        cropper.destroy();
        cropper = null;
    }
    statusMsg.innerText = "Cancelled.";
});

// --- CRUD OPERATIONS ---

// Save (Add or Update)
friendForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = friendForm.querySelector('button');
    btn.disabled = true;
    btn.innerText = "Saving...";
    statusMsg.innerText = "";

    try {
        const editId = document.getElementById('edit-id').value;
        let photoURL = null;

        // Upload Photo if changed
        if (currentPhotoBlob) {
            statusMsg.innerText = "Uploading photo...";
            const fileName = `users/${currentUser.uid}/${Date.now()}.webp`;
            const storageRef = ref(storage, fileName);
            await uploadBytes(storageRef, currentPhotoBlob);
            photoURL = await getDownloadURL(storageRef);
            // Clear blob to prevent re-upload on next save without change
            currentPhotoBlob = null;
        }

        const val = parseInt(document.getElementById('inp-freq-val').value) || 1;
        const unit = parseInt(document.getElementById('inp-freq-unit').value) || 1;
        const freqDays = val * unit;

        const firstName = document.getElementById('inp-first-name').value.trim();
        const lastName = document.getElementById('inp-last-name').value.trim();
        const fullName = `${firstName} ${lastName}`.trim();

        const friendData = {
            userId: currentUser.uid,
            firstName: firstName,
            lastName: lastName,
            name: fullName,
            met: document.getElementById('inp-met').value,
            origin: document.getElementById('inp-origin').value,
            work: document.getElementById('inp-work').value,
            phone: document.getElementById('inp-phone').value,
            freq: freqDays,
            lastContact: document.getElementById('inp-last').value,
            notes: document.getElementById('inp-notes').value,
            notes: document.getElementById('inp-notes').value,
            category: document.getElementById('inp-category').value.trim(),
            categoryColor: document.getElementById('inp-color').value,
            isExempt: document.getElementById('inp-exempt').checked,
            updatedAt: new Date()
        };

        // Only update photo if a new one was uploaded
        if (photoURL) friendData.photoURL = photoURL;
        // Default photo if new and no upload
        if (!editId && !photoURL) friendData.photoURL = "https://ui-avatars.com/api/?background=random&name=" + encodeURIComponent(friendData.name);

        if (editId) {
            await updateDoc(doc(db, "friends", editId), friendData);
        } else {
            friendData.createdAt = new Date();
            await addDoc(collection(db, "friends"), friendData);
        }

        updateStorageStats(); // Refresh stats
        closeModal();
    } catch (error) {
        console.error("Save Error:", error);
        statusMsg.innerText = "Error: " + error.message;
    } finally {
        btn.disabled = false;
        btn.innerText = "Save";
    }
});

// Real-time Load
let unsubscribe = null;
function loadFriends() {
    if (unsubscribe) unsubscribe();

    const q = query(collection(db, "friends"), where("userId", "==", currentUser.uid));

    unsubscribe = onSnapshot(q, (snapshot) => {
        friendsGrid.innerHTML = '';
        const friends = [];
        snapshot.forEach(doc => friends.push({ id: doc.id, ...doc.data() }));

        allFriends = friends; // Store for calendar

        // Update Datalist with unique categories
        const categories = [...new Set(friends.map(f => f.category).filter(Boolean))].sort();
        const datalist = document.getElementById('category-list');
        datalist.innerHTML = categories.map(c => `<option value="${c}">`).join('');

        // Populate Category Filter
        const currentFilter = filterCategory.value;
        filterCategory.innerHTML = '<option value="">All Categories</option>' +
            categories.map(c => `<option value="${c}">${c}</option>`).join('');
        filterCategory.value = currentFilter; // Restore selection

        // Populate "Where Met" Datalist
        const metPlaces = [...new Set(friends.map(f => f.met).filter(Boolean))].sort();
        const metList = document.getElementById('met-list');
        metList.innerHTML = metPlaces.map(m => `<option value="${m}">`).join('');

        // Client-side sorting (easiest without complex Firestore indexes)
        // Sort by "Next Due Date" ascending
        friends.sort((a, b) => {
            const dateA = getNextDueDate(a.lastContact, a.freq);
            const dateB = getNextDueDate(b.lastContact, b.freq);
            return dateA - dateB;
        });

        renderCalendar(); // Update calendar widget

        if (friends.length === 0) {
            friendsGrid.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:#666">No friends added yet.</p>';
        }

        friends.forEach(friend => renderCard(friend));
    }, (err) => {
        console.error("Load Error:", err);
        friendsGrid.innerHTML = `<p style="color:red">Error loading data. Check console.</p>`;
    });
}

function renderCard(data) {
    const nextDue = getNextDueDate(data.lastContact, data.freq);
    const today = new Date();
    const diffDays = Math.ceil((nextDue - today) / (1000 * 60 * 60 * 24));

    let badgeClass = 'status-ok';
    let badgeText = `Due in ${formatDuration(diffDays)}`;
    let badgeHTML = '';

    // Calculate integers for logic
    const overdueDays = Math.abs(diffDays);

    if (data.isExempt) {
        badgeHTML = `<span class="status-badge" style="background:#555; color:#ccc; border:1px solid #666">Not Tracked</span>`;
    } else if (!data.lastContact) {
        // No date set, no badge
        badgeHTML = '';
    } else {
        if (diffDays < 0) {
            badgeClass = 'status-overdue';
            badgeText = `Overdue by ${formatDuration(overdueDays)}`;
        } else if (diffDays <= 7) {
            badgeClass = 'status-due';
            badgeText = `Due soon (${formatDuration(diffDays)})`;
        }
        badgeHTML = `<span class="status-badge ${badgeClass}">${badgeText}</span>`;
    }

    // Calculate time since last contact
    let lastSeenText = '';
    if (data.isExempt) {
        lastSeenText = `<div style="opacity:0.6; font-style:italic">⏳ Last seen: Not Tracked</div>`;
    } else if (data.lastContact) {
        const lastDate = new Date(data.lastContact);
        // Reset times to midnight for accurate day diff
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const then = new Date(lastDate);
        then.setHours(0, 0, 0, 0);

        const diffTime = now - then;
        const daysSince = Math.floor(diffTime / (1000 * 60 * 60 * 24));

        if (daysSince >= 0) {
            lastSeenText = `<div>⏳ Last seen: ${formatDuration(daysSince)} ago</div>`;
        }
    }

    const categoryBadge = data.category
        ? `<span class="category-badge" style="background-color:${data.categoryColor || '#4f46e5'}">${data.category}</span>`
        : '';

    const card = document.createElement('div');
    card.className = 'glass-card friend-card';
    if (isSelectionMode) card.classList.add('selecting');
    if (selectedFriendIds.has(data.id)) card.classList.add('selected');

    card.dataset.id = data.id;
    card.dataset.category = data.category || ""; // Store for filtering

    // Selection Overlay Checkbox
    const selectionHTML = isSelectionMode ? `<div class="selection-checkbox"></div>` : '';

    card.innerHTML = `
        ${selectionHTML}
        <img src="${data.photoURL}" class="card-img" alt="${data.name}" loading="lazy" style="${isSelectionMode ? '' : 'cursor:zoom-in'}" ${!isSelectionMode ? `onclick="openImageViewer('${data.photoURL}', '${data.name.replace(/'/g, "\\'")}')"` : ''}>
        <div class="card-info">
            <div style="display:flex;justify-content:space-between; align-items:flex-start; gap:15px">
                <div>
                    <h3>${data.name}</h3>
                    ${categoryBadge}
                </div>
                ${badgeHTML}
            </div>
            <div class="card-details">
                <div>📍 ${data.origin || '-'} | 💼 ${data.work || '-'}</div>
                <div>📞 <a href="tel:${data.phone}" style="color:inherit" onclick="event.stopPropagation()">${data.phone || '-'}</a></div>
                <div>🗓 Met: ${data.met || '-'}</div>
                ${lastSeenText}
            </div>
            <p style="font-size:0.85rem; margin-top:10px">${data.notes || ''}</p>
        </div>
        <div class="card-actions" style="${isSelectionMode ? 'visibility:hidden' : ''}">
            <!-- New Today Button -->
            <button class="btn secondary-btn today-btn" style="color:var(--success); border-color:rgba(16,185,129,0.3)">Met Today</button>
            <button class="btn secondary-btn edit-btn">Edit</button>
            <button class="btn secondary-btn delete-btn" style="color:var(--danger);border-color:rgba(239,68,68,0.3)">Delete</button>
        </div>
    `;

    // Event Listeners for buttons
    if (!isSelectionMode) {
        card.querySelector('.today-btn').addEventListener('click', (e) => { e.stopPropagation(); markToday(data.id, data.lastContact); });
        card.querySelector('.delete-btn').addEventListener('click', (e) => { e.stopPropagation(); deletePerson(data.id); });
        card.querySelector('.edit-btn').addEventListener('click', (e) => { e.stopPropagation(); openEdit(data); });
    }

    // Card Selection Click
    if (isSelectionMode) {
        card.addEventListener('click', () => toggleCardSelection(data.id));
    }

    friendsGrid.appendChild(card);
}

// --- Quick Actions ---
const undoToast = document.getElementById('undo-toast');
const toastMsg = document.getElementById('toast-msg');
const toastUndoBtn = document.getElementById('toast-undo-btn');

async function markToday(id, oldDate) {
    // 1. Save state for undo
    tempUndoData = { id, oldDate };

    // 2. Optimistic Update (or just simple wait)
    const todayStr = new Date().toISOString().split('T')[0];
    await updateDoc(doc(db, "friends", id), {
        lastContact: todayStr,
        updatedAt: new Date()
    });

    // 3. Show Toast
    showUndoToast();
}

function showUndoToast() {
    undoToast.classList.remove('hidden');
    let timeLeft = 10;
    toastMsg.innerText = `Marked as Today. Undo? (${timeLeft})`;

    if (undoTimeout) clearInterval(undoTimeout);

    undoTimeout = setInterval(() => {
        timeLeft--;
        toastMsg.innerText = `Marked as Today. Undo? (${timeLeft})`;
        if (timeLeft <= 0) {
            clearInterval(undoTimeout);
            undoToast.classList.add('hidden');
            tempUndoData = null; // Clear undo capability
        }
    }, 1000);
}

toastUndoBtn.onclick = async () => {
    if (tempUndoData) {
        clearInterval(undoTimeout);
        undoToast.classList.add('hidden');

        await updateDoc(doc(db, "friends", tempUndoData.id), {
            lastContact: tempUndoData.oldDate,
            updatedAt: new Date()
        });

        tempUndoData = null;
        console.log("Action Undone");
    }
};

// Modal Logic
document.getElementById('btn-today-modal').onclick = () => {
    document.getElementById('inp-last').valueAsDate = new Date();
};

const exemptCheckbox = document.getElementById('inp-exempt');
const freqRow = document.getElementById('freq-row');
const lastRow = document.getElementById('last-contact-row');

exemptCheckbox.addEventListener('change', (e) => toggleExemptFields(e.target.checked));

function toggleExemptFields(isExempt) {
    const opacity = isExempt ? '0.3' : '1';
    const pointerEvents = isExempt ? 'none' : 'auto';

    freqRow.style.opacity = opacity;
    freqRow.style.pointerEvents = pointerEvents;

    lastRow.style.opacity = opacity;
    lastRow.style.pointerEvents = pointerEvents;
}

// Helpers
function formatDuration(totalDays) {
    if (totalDays === 0) return "today";

    const years = Math.floor(totalDays / 365);
    let remaining = totalDays % 365;

    const months = Math.floor(remaining / 30);
    remaining = remaining % 30;

    const weeks = Math.floor(remaining / 7);
    const days = remaining % 7;

    const parts = [];
    if (years > 0) parts.push(`${years}y`);
    if (months > 0) parts.push(`${months}m`);
    if (weeks > 0) parts.push(`${weeks}w`);
    if (days > 0) parts.push(`${days}d`);

    return parts.join(', ');
}

function getNextDueDate(lastContactStr, freqDays) {
    if (!lastContactStr) return new Date(); // If no date, due now
    const last = new Date(lastContactStr);
    const next = new Date(last);
    next.setDate(last.getDate() + freqDays);
    return next;
}

const deleteModal = document.getElementById('delete-modal');
const deleteMsg = document.getElementById('delete-msg');
let deleteTargetId = null;

function deletePerson(id) {
    // Find friend name for message
    const friend = allFriends.find(f => f.id === id);
    if (friend) {
        deleteTargetId = id;
        deleteMsg.innerHTML = `Are you sure you want to delete <strong>${friend.name}</strong>?<br>This cannot be undone.`;
        deleteModal.classList.remove('hidden');
    }
}

document.getElementById('cancel-delete').addEventListener('click', () => {
    deleteModal.classList.add('hidden');
    deleteTargetId = null;
});

document.getElementById('confirm-delete').addEventListener('click', async () => {
    if (!deleteTargetId) return;

    const btn = document.getElementById('confirm-delete');
    const originalText = btn.innerText;
    btn.innerText = "Deleting...";
    btn.disabled = true;

    try {
        await deleteDoc(doc(db, "friends", deleteTargetId));
        updateStorageStats();
        deleteModal.classList.add('hidden');
    } catch (e) {
        console.error("Delete Error", e);
        alert("Error deleting: " + e.message);
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
        deleteTargetId = null;
    }
});

// Storage Stats Logic
async function updateStorageStats() {
    if (!currentUser) return;
    const statsEl = document.getElementById('storage-stats');
    if (!statsEl) return;

    try {
        const listRef = ref(storage, `users/${currentUser.uid}`);
        const res = await listAll(listRef);

        let totalBytes = 0;
        // Parallel metadata fetch
        const promises = res.items.map(itemRef => getMetadata(itemRef));
        const metadataList = await Promise.all(promises);

        metadataList.forEach(meta => {
            totalBytes += meta.size;
        });

        const mb = (totalBytes / (1024 * 1024)).toFixed(2);
        statsEl.innerText = `Storage: ${mb} MB`;
    } catch (e) {
        console.error("Storage Stats Error:", e);
        statsEl.innerText = "Storage: Error";
    }
}

// Modal Logic
document.getElementById('add-btn').addEventListener('click', () => {
    friendForm.reset();
    document.getElementById('inp-first-name').value = '';
    document.getElementById('inp-last-name').value = '';
    statusMsg.innerText = ""; // Fix: Clear previous status
    document.getElementById('edit-id').value = "";
    document.getElementById('modal-title').innerText = "Add Person";

    // Default: 1 Month
    document.getElementById('inp-freq-val').value = 1;
    document.getElementById('inp-freq-unit').value = 30;
    document.getElementById('inp-exempt').checked = false;
    toggleExemptFields(false);

    // Default Color
    document.getElementById('inp-category').value = '';
    document.getElementById('inp-color').value = '#4f46e5';

    document.getElementById('photo-preview').innerHTML = '<span>Tap to Add Photo</span>';
    currentPhotoBlob = null;

    // Clear stats for new entry
    const statsContainer = document.getElementById('modal-storage-stats');
    if (statsContainer) statsContainer.innerHTML = '';

    modal.classList.remove('hidden');
});

function openEdit(data) {
    friendForm.reset();
    statusMsg.innerText = ""; // Fix: Clear previous status
    document.getElementById('edit-id').value = data.id;
    document.getElementById('modal-title').innerText = "Edit Person";

    if (data.firstName !== undefined || data.lastName !== undefined) {
        document.getElementById('inp-first-name').value = data.firstName || '';
        document.getElementById('inp-last-name').value = data.lastName || '';
    } else if (data.name) {
        // Fallback for legacy data
        const parts = data.name.split(' ');
        document.getElementById('inp-first-name').value = parts[0] || '';
        document.getElementById('inp-last-name').value = parts.slice(1).join(' ') || '';
    }
    document.getElementById('inp-met').value = data.met;
    document.getElementById('inp-origin').value = data.origin;
    document.getElementById('inp-work').value = data.work;
    document.getElementById('inp-phone').value = data.phone;

    // Calculate best unit
    let val = data.freq;
    let unit = 1;

    if (val % 30 === 0 && val !== 0) {
        val = val / 30;
        unit = 30;
    } else if (val % 7 === 0 && val !== 0) {
        val = val / 7;
        unit = 7;
    }

    document.getElementById('inp-freq-val').value = val;
    document.getElementById('inp-freq-unit').value = unit;

    document.getElementById('inp-last').value = data.lastContact;
    document.getElementById('inp-notes').value = data.notes;
    document.getElementById('inp-category').value = data.category || '';
    document.getElementById('inp-color').value = data.categoryColor || '#4f46e5';

    document.getElementById('inp-exempt').checked = data.isExempt || false;
    toggleExemptFields(data.isExempt || false);

    document.getElementById('photo-preview').style.backgroundImage = `url(${data.photoURL})`;
    document.getElementById('photo-preview').innerHTML = '';
    currentPhotoBlob = null; // Reset blob unless they pick a new one

    modal.classList.remove('hidden');

    // --- Calculate Storage Stats ---
    const statsContainer = document.getElementById('modal-storage-stats');
    if (statsContainer) {
        statsContainer.innerHTML = 'Calculating storage...';

        // 1. Calculate approximate Firestore Doc Size
        // Crude approximation: JSON stringify size
        const docSize = new Blob([JSON.stringify(data)]).size;

        // 2. Get Image Size
        let imgSizeStr = "0 KB";
        let imageSize = 0;

        if (data.photoURL && data.photoURL.includes('firebasestorage')) {
            // Create a reference from URL to get metadata
            try {
                const httpsReference = ref(storage, data.photoURL);
                getMetadata(httpsReference)
                    .then((metadata) => {
                        imageSize = metadata.size;
                        updateStatsDisplay(docSize, imageSize);
                    })
                    .catch((error) => {
                        console.log("Error getting image metadata:", error);
                        // Fallback: If we can't get metadata, we can't easily know size without downloading
                        updateStatsDisplay(docSize, 0, true);
                    });
            } catch (e) {
                console.log("Invalid storage ref", e);
                updateStatsDisplay(docSize, 0, true);
            }
        } else {
            // External image or no image
            updateStatsDisplay(docSize, 0, false, !!data.photoURL);
        }

        function updateStatsDisplay(docBytes, imgBytes, imgError = false, isExternal = false) {
            const formatSize = (bytes) => {
                if (bytes === 0) return "0 B";
                const k = 1024;
                const sizes = ['B', 'KB', 'MB'];
                const i = Math.floor(Math.log(bytes) / Math.log(k));
                return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
            };

            let imgText = formatSize(imgBytes);
            if (imgError) imgText = "Unknown (External/Error)";
            if (isExternal) imgText = "External (0 B)";

            const totalBytes = docBytes + imgBytes;

            statsContainer.innerHTML = `
                <div>Card Data: ${formatSize(docBytes)}</div>
                <div>Image: ${imgText}</div>
                <div style="border-top:1px solid #333; margin-top:4px; padding-top:4px; font-weight:bold">Total: ${formatSize(totalBytes)}</div>
            `;
        }
    }
}

function closeModal() {
    modal.classList.add('hidden');
}
document.getElementById('close-modal').addEventListener('click', closeModal);
const imageViewerModal = document.getElementById('image-viewer-modal');
const fullScreenImage = document.getElementById('full-screen-image');
const imageCaption = document.getElementById('image-caption');
const closeImageViewer = document.getElementById('close-image-viewer');

window.openImageViewer = function (url, name) {
    fullScreenImage.src = url;
    imageCaption.innerText = name;
    imageViewerModal.classList.remove('hidden');
};

closeImageViewer.onclick = () => {
    imageViewerModal.classList.add('hidden');
};

imageViewerModal.onclick = (e) => {
    if (e.target === imageViewerModal) {
        imageViewerModal.classList.add('hidden');
    }
};

// Filter Logic
function filterGrid() {
    const textVal = searchInput.value.toLowerCase();
    const catVal = filterCategory.value;
    const cards = document.querySelectorAll('.friend-card');

    cards.forEach(card => {
        const text = card.innerText.toLowerCase();
        const cardCategory = card.dataset.category || ""; // We need to add this to renderCard

        const matchesText = text.includes(textVal);
        const matchesCategory = catVal === "" || cardCategory === catVal;

        card.style.display = (matchesText && matchesCategory) ? 'flex' : 'none';
    });
}

searchInput.addEventListener('input', filterGrid);
filterCategory.addEventListener('change', filterGrid);

// Calendar Widget Logic
function renderCalendar() {
    const listEl = document.getElementById('calendar-list');
    const headerEl = document.getElementById('cal-month-year');

    // Display Month Year
    const month = currentCalendarDate.toLocaleString('default', { month: 'long' });
    const year = currentCalendarDate.getFullYear();
    headerEl.innerText = `${month} ${year}`;

    // Filter friends due in this month/year (or overdue if current month)
    const now = new Date();
    const isCurrentMonth = currentCalendarDate.getMonth() === now.getMonth() &&
        currentCalendarDate.getFullYear() === now.getFullYear();

    const dueFriends = allFriends.filter(friend => {
        if (friend.isExempt) return false; // Exclude N/A

        const nextDue = getNextDueDate(friend.lastContact, friend.freq);

        if (isCurrentMonth) {
            // Show anyone due before the end of this month (includes overdue)
            const endOfMonth = new Date(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth() + 1, 0);
            return nextDue <= endOfMonth;
        } else {
            // Standard month view
            return nextDue.getMonth() === currentCalendarDate.getMonth() &&
                nextDue.getFullYear() === currentCalendarDate.getFullYear();
        }
    });

    // Sort by day (earliest first, so most overdue is top)
    dueFriends.sort((a, b) => {
        const dateA = getNextDueDate(a.lastContact, a.freq);
        const dateB = getNextDueDate(b.lastContact, b.freq);
        return dateA - dateB;
    });

    // Top 5
    const top5 = dueFriends.slice(0, 5);

    listEl.innerHTML = '';
    if (top5.length === 0) {
        listEl.innerHTML = '<p style="text-align:center;color:var(--text-muted)">No catch-ups due this month.</p>';
        return;
    }

    top5.forEach(friend => {
        const nextDue = getNextDueDate(friend.lastContact, friend.freq);
        let dayDisplay = nextDue.getDate();

        // If overdue from previous months, show detailed date or "Overdue"
        const isOverdue = nextDue < new Date(now.setHours(0, 0, 0, 0));
        if (isOverdue && isCurrentMonth) {
            dayDisplay = "!"; // Or maybe the date 
        }

        let cycleText = friend.freq + 'd';
        if (friend.freq >= 30 && friend.freq % 30 === 0) cycleText = (friend.freq / 30) + 'mo';
        else if (friend.freq >= 7 && friend.freq % 7 === 0) cycleText = (friend.freq / 7) + 'w';

        const item = document.createElement('div');
        item.className = 'calendar-item';
        // Make the whole item clickable
        item.style.cursor = 'pointer';
        item.onclick = () => openEdit(friend);

        // Style differently if overdue?
        const badgeColor = isOverdue ? 'var(--danger)' : 'var(--primary)';

        item.innerHTML = `
            <div class="calendar-date-badge" style="background:${badgeColor}">${dayDisplay}</div>
            <img src="${friend.photoURL}" class="calendar-img" alt="${friend.name}">
            <div class="calendar-details">
                <h4>${friend.name}</h4>
                <p>Status: Due via ${cycleText} cycle</p>
            </div>
            <button class="btn secondary-btn" style="padding:5px 10px;font-size:0.8rem">View</button>
        `;
        listEl.appendChild(item);
    });
}

document.getElementById('cal-prev').addEventListener('click', () => {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
    renderCalendar();
});

document.getElementById('cal-next').addEventListener('click', () => {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
    renderCalendar();
});

// Export Logic
const exportModal = document.getElementById('export-modal');
const closeExportBtn = document.getElementById('close-export');

document.getElementById('export-btn').addEventListener('click', () => {
    exportModal.classList.remove('hidden');
    // Close mobile menu if open
    if (headerActions) headerActions.classList.remove('show');
});

closeExportBtn.addEventListener('click', () => {
    exportModal.classList.add('hidden');
});

// Close export modal on outside click
window.addEventListener('click', (e) => {
    if (e.target == exportModal) {
        exportModal.classList.add('hidden');
    }
});

function downloadFile(content, fileName, contentType) {
    const a = document.createElement("a");
    const file = new Blob([content], { type: contentType });
    a.href = URL.createObjectURL(file);
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(a.href);
}

document.getElementById('export-json').addEventListener('click', () => {
    const dataStr = JSON.stringify(allFriends, null, 2);
    downloadFile(dataStr, `my-network-${Date.now()}.json`, 'application/json');
    exportModal.classList.add('hidden');
});

document.getElementById('export-csv').addEventListener('click', () => {
    if (allFriends.length === 0) {
        alert("No data to export.");
        return;
    }

    // Define columns
    const headers = ["Name", "Met", "Origin", "Work", "Phone", "Frequency (Days)", "Last Contact", "Notes"];

    // Convert data
    const rows = allFriends.map(f => [
        `"${f.name || ''}"`,
        `"${f.met || ''}"`,
        `"${f.origin || ''}"`,
        `"${f.work || ''}"`,
        `"${f.phone || ''}"`,
        f.freq,
        `"${f.lastContact || ''}"`,
        `"${(f.notes || '').replace(/"/g, '""')}"` // Escape quotes in notes
    ]);

    // Combine
    const csvContent = [
        headers.join(","),
        ...rows.map(r => r.join(","))
    ].join("\n");

    downloadFile(csvContent, `my-network-${Date.now()}.csv`, 'text/csv');
    exportModal.classList.add('hidden');
});

// ZIP Export Logic
async function fetchImageBlob(url) {
    try {
        // Add cache buster here too
        const cacheUrl = url.includes('?')
            ? `${url}&t=${new Date().getTime()}`
            : `${url}?t=${new Date().getTime()}`;

        const response = await fetch(cacheUrl, { mode: 'cors' }); // Explicitly request CORS
        return await response.blob();
    } catch (e) {
        console.error("Failed to fetch image", url, e);
        return null;
    }
}

async function prepareZipImages(zip, statusEl) {
    const imgFolder = zip.folder("images");
    const idToPath = {};

    let count = 0;
    const total = allFriends.length;

    for (const friend of allFriends) {
        count++;
        if (statusEl) statusEl.innerText = `Processing image ${count}/${total}...`;

        // Skip default/placeholder if you want, or download them too.
        // UI Avatars might work if fetch is allowed.
        const url = friend.photoURL;
        if (url) {
            const blob = await fetchImageBlob(url);
            if (blob) {
                // Determine extension from blob type or default to webp
                let ext = "webp";
                if (blob.type === "image/jpeg") ext = "jpg";
                else if (blob.type === "image/png") ext = "png";

                const filename = `${friend.id}.${ext}`;
                imgFolder.file(filename, blob);
                idToPath[friend.id] = `images/${filename}`;
            }
        }
    }
    return idToPath;
}

document.getElementById('export-zip-csv').addEventListener('click', async () => {
    const statusEl = document.getElementById('export-status');
    statusEl.innerText = "Initializing ZIP...";

    try {
        const zip = new JSZip();

        // 1. Download Images
        const localPaths = await prepareZipImages(zip, statusEl);

        // 2. Generate CSV with local paths
        const headers = ["Name", "Met", "Origin", "Work", "Phone", "Frequency (Days)", "Last Contact", "Photo Path", "Notes"];
        const rows = allFriends.map(f => [
            `"${f.name || ''}"`,
            `"${f.met || ''}"`,
            `"${f.origin || ''}"`,
            `"${f.work || ''}"`,
            `"${f.phone || ''}"`,
            f.freq,
            `"${f.lastContact || ''}"`,
            `"${localPaths[f.id] || ''}"`, // Local path
            `"${(f.notes || '').replace(/"/g, '""')}"`
        ]);

        const csvContent = [
            headers.join(","),
            ...rows.map(r => r.join(","))
        ].join("\n");

        zip.file("data.csv", csvContent);

        // 3. Generate ZIP
        statusEl.innerText = "Generating ZIP file...";
        const zipBlob = await zip.generateAsync({ type: "blob" });
        downloadFile(zipBlob, `network-bundle-${Date.now()}.zip`, "application/zip");

        statusEl.innerText = "";
        exportModal.classList.add('hidden');
    } catch (err) {
        console.error(err);
        statusEl.innerText = "Error exporting ZIP.";
    }
});

document.getElementById('export-zip-html').addEventListener('click', async () => {
    const statusEl = document.getElementById('export-status');
    statusEl.innerText = "Initializing Offline Website...";

    try {
        const zip = new JSZip();

        // 1. Download Images
        const localPaths = await prepareZipImages(zip, statusEl);

        // 2. Prepare Data for Offline Usage
        // Create a data.js file that sets a global variable
        const offlineData = allFriends.map(f => ({
            ...f,
            photoURL: localPaths[f.id] || f.photoURL // Use local path if downloaded, else keep original (might rely on internet)
        }));

        zip.file("data.js", `window.networkData = ${JSON.stringify(offlineData, null, 2)};`);

        // 3. Create Viewer HTML
        const viewerHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>My Network (Offline)</title>
    <style>
        body { font-family: system-ui, sans-serif; background: #1a1a1a; color: #fff; padding: 20px; }
        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 20px; }
        .card { background: #2a2a2a; border-radius: 10px; overflow: hidden; padding: 15px; border: 1px solid #333; }
        .card img { width: 100%; height: 200px; object-fit: contain; border-radius: 8px; background: #222; }
        .card h3 { margin: 10px 0 5px; }
        .card p { margin: 5px 0; font-size: 0.9rem; color: #ccc; }
        .tag { background: #333; padding: 2px 6px; border-radius: 4px; font-size: 0.8rem; }
    </style>
</head>
<body>
    <h1>My Network (Offline Archive)</h1>
    <div id="grid" class="grid"></div>
    
    <!-- Load Data -->
    <script src="data.js"></script>
    <script>
        const grid = document.getElementById('grid');
        if (window.networkData) {
            window.networkData.forEach(p => {
                const el = document.createElement('div');
                el.className = 'card';
                el.innerHTML = \`
                    <img src="\${p.photoURL}" loading="lazy">
                    <h3>\${p.name}</h3>
                    <p>📞 \${p.phone || '-'}</p>
                    <p>📍 \${p.origin || '-'} | 💼 \${p.work || '-'}</p>
                    <p>🗓 Met: \${p.met || '-'}</p>
                    <p style="margin-top:10px; font-style:italic; color:#888">\${p.notes || ''}</p>
                \`;
                grid.appendChild(el);
            });
        }
    </script>
</body>
</html>
        `;

        zip.file("index.html", viewerHTML);

        // 4. Generate ZIP
        statusEl.innerText = "Generating ZIP file...";
        const zipBlob = await zip.generateAsync({ type: "blob" });
        downloadFile(zipBlob, `network-offline-website-${Date.now()}.zip`, "application/zip");

        statusEl.innerText = "";
        exportModal.classList.add('hidden');
    } catch (err) {
        console.error(err);
        statusEl.innerText = "Error exporting Offline Website.";
    }
});

// --- Selection Logic ---
const selectModeBtn = document.getElementById('select-mode-btn');
const cancelSelectHeaderBtn = document.getElementById('cancel-select-header-btn'); // New button
const selectionToolbar = document.getElementById('selection-toolbar');
const cancelSelectionBtn = document.getElementById('cancel-selection');
const selectionCount = document.getElementById('selection-count');
const addBtn = document.getElementById('add-btn');

selectModeBtn.addEventListener('click', () => toggleSelectionMode(true));
cancelSelectionBtn.addEventListener('click', () => toggleSelectionMode(false));
if (cancelSelectHeaderBtn) {
    cancelSelectHeaderBtn.addEventListener('click', () => toggleSelectionMode(false));
}

function toggleSelectionMode(active) {
    isSelectionMode = active;
    selectedFriendIds.clear(); // Always clear on toggle

    // Toggle UI elements
    if (active) {
        selectionToolbar.classList.remove('hidden');
        selectModeBtn.classList.add('hidden');
        if (cancelSelectHeaderBtn) cancelSelectHeaderBtn.classList.remove('hidden'); // Show header cancel
        addBtn.classList.add('hidden');
        document.getElementById('mobile-menu-btn').classList.add('hidden'); // Hide mobile menu too
        updateSelectionCount();
    } else {
        selectionToolbar.classList.add('hidden');
        selectModeBtn.classList.remove('hidden');
        if (cancelSelectHeaderBtn) cancelSelectHeaderBtn.classList.add('hidden'); // Hide header cancel
        addBtn.classList.remove('hidden');
        document.getElementById('mobile-menu-btn').classList.remove('hidden');
    }

    // Re-render cards to show/hide checkboxes & update click behavior
    loadFriends();
}


function toggleCardSelection(id) {
    if (selectedFriendIds.has(id)) {
        selectedFriendIds.delete(id);
    } else {
        selectedFriendIds.add(id);
    }
    updateSelectionCount();

    // Optimistic Update UI
    const card = document.querySelector(`.friend-card[data-id="${id}"]`);
    if (card) {
        if (selectedFriendIds.has(id)) {
            card.classList.add('selected');
        } else {
            card.classList.remove('selected');
        }
    }
}

function updateSelectionCount() {
    selectionCount.innerText = `${selectedFriendIds.size} Selected`;
}

// --- Grid Export Logic ---
document.getElementById('export-grid-img').addEventListener('click', () => generateGridExport('image'));
document.getElementById('export-grid-pdf').addEventListener('click', () => generateGridExport('pdf'));

// Add System Print Button dynamically if not present (or we can just use a new button in UI, 
// for now let's make the PDF button ask or try both?)
// Better: Add a new button to the toolbar in JS for "Print View"
const selectionActions = document.querySelector('.selection-actions');
if (selectionActions && !document.getElementById('export-print')) {
    const printBtn = document.createElement('button');
    printBtn.id = 'export-print';
    printBtn.className = 'btn secondary-btn';
    printBtn.innerText = 'Print / System PDF';
    printBtn.onclick = () => {
        generateGridExport('print');
    };
    selectionActions.appendChild(printBtn);
}

async function generateGridExport(type) {
    if (selectedFriendIds.size === 0) {
        alert("Please select at least one person.");
        return;
    }

    // Filter Selected Friends
    const selectedFriends = allFriends.filter(f => selectedFriendIds.has(f.id));

    // Render to Hidden Staging Area
    const stagingGrid = document.getElementById('export-grid');
    stagingGrid.innerHTML = ''; // Clear previous

    const imageLoadPromises = [];

    for (const friend of selectedFriends) {
        const card = document.createElement('div');
        // Simple clean styling for export
        card.style.background = "#2a2a2a";
        card.style.borderRadius = "10px";
        card.style.overflow = "hidden";
        card.style.padding = "15px";
        card.style.border = "1px solid #333";
        card.style.fontFamily = "sans-serif";
        card.style.color = "white";

        const imgBox = document.createElement('div');
        imgBox.style.width = "100%";
        imgBox.style.paddingTop = "100%"; // 1:1 Aspect Ratio
        imgBox.style.backgroundSize = "cover";
        imgBox.style.backgroundPosition = "center";
        imgBox.style.borderRadius = "8px";
        imgBox.style.marginBottom = "10px";
        imgBox.style.backgroundColor = "#222";

        // Convert image to data URL to avoid tainting canvas if possible
        let imgUrl = friend.photoURL;

        if (imgUrl && imgUrl.startsWith('http')) {
            const loadPromise = new Promise(async (resolve) => {
                let finalSrc = imgUrl;
                try {
                    // Force fresh network request
                    const cacheBusterUrl = imgUrl.includes('?')
                        ? `${imgUrl}&t=${new Date().getTime()}`
                        : `${imgUrl}?t=${new Date().getTime()}`;

                    const response = await fetch(cacheBusterUrl);
                    const blob = await response.blob();

                    // Convert to Base64
                    finalSrc = await new Promise(r => {
                        const reader = new FileReader();
                        reader.onload = () => r(reader.result);
                        reader.readAsDataURL(blob);
                    });

                } catch (e) {
                    console.warn("Fetch failed, falling back to direct URL", e);
                    finalSrc = imgUrl.includes('?')
                        ? `${imgUrl}&t=${new Date().getTime()}`
                        : `${imgUrl}?t=${new Date().getTime()}`;
                }

                // If fallback to URL, pre-load via Image object to ensure readiness
                if (finalSrc.startsWith('http')) {
                    const temp = new Image();
                    temp.crossOrigin = 'anonymous';
                    temp.onload = () => {
                        imgBox.style.backgroundImage = `url('${finalSrc}')`;
                        resolve();
                    };
                    temp.onerror = () => {
                        imgBox.style.backgroundImage = `url('${finalSrc}')`;
                        resolve();
                    };
                    temp.src = finalSrc;
                } else {
                    // Base64 ready
                    imgBox.style.backgroundImage = `url('${finalSrc}')`;
                    resolve();
                }
            });
            imageLoadPromises.push(loadPromise);
        } else {
            if (imgUrl) imgBox.style.backgroundImage = `url('${imgUrl}')`;
        }

        card.appendChild(imgBox);

        const info = document.createElement('div');
        info.innerHTML = `
            <h3 style="margin:0 0 5px 0; font-size:1.2rem;">${friend.name}</h3>
            <p style="margin:0 0 5px 0; color:#ccc; font-size:0.9rem;">${friend.work || ''}</p>
            <p style="margin:0; color:#888; font-size:0.8rem;">${friend.phone || ''}</p>
        `;
        card.appendChild(info);

        stagingGrid.appendChild(card);
    }

    // Determine grid columns based on count (rough heuristic)
    const total = selectedFriends.length;
    let columns = 4;
    if (total <= 4) columns = total;
    else if (total <= 6) columns = 3;

    // Update container width for PDF sizing logic
    stagingGrid.style.gridTemplateColumns = `repeat(${columns}, 1fr)`;

    // Wait for all images to actually load in the DOM
    if (imageLoadPromises.length > 0) {
        await Promise.all(imageLoadPromises);
    }

    // Slight delay to ensure rendering catches up
    await new Promise(r => setTimeout(r, 500));

    const element = document.getElementById('export-staging-area');

    // Capture
    if (type === 'print') {
        // For Print: We need to style the staging area for print and trigger window.print()
        // But window.print() prints the whole window. We need to hide everything else or open a new window.
        // Opening a new window is cleaner for reports.

        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <html>
            <head>
                <title>Network Export</title>
                <style>
                    body { font-family: sans-serif; padding: 20px; }
                    .grid { display: grid; grid-template-columns: repeat(${columns}, 1fr); gap: 20px; }
                    .card { break-inside: avoid; border: 1px solid #ccc; padding: 10px; border-radius: 8px; }
                    img { width: 100%; height: 200px; object-fit: cover; border-radius: 5px; }
                    h3 { margin: 10px 0 5px; }
                    p { margin: 0; color: #666; font-size: 0.9rem; }
                    @media print {
                        .no-print { display: none; }
                    }
                </style>
            </head>
            <body>
                <h1>Network Export</h1>
                <div class="grid">
                    ${stagingGrid.innerHTML}
                </div>
                <!-- Fix image sources back to original URL if they are blobs (blobs might not transfer to new window easily if revoked, but here we haven't revoked them yet) -->
                <!-- Actually, data URLs work fine in new windows -->
                <script>
                    window.onload = () => { window.print(); };
                </script>
            </body>
            </html>
        `);
        printWindow.document.close();
        return;
    }

    try {
        const canvas = await html2canvas(element, {
            backgroundColor: "#111",
            scale: 2, // High res
            useCORS: true,
            allowTaint: true,
            imageTimeout: 15000
        });

        if (type === 'image') {
            const link = document.createElement('a');
            link.download = `network-grid-${Date.now()}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
        } else if (type === 'pdf') {
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF({
                orientation: canvas.width > canvas.height ? 'l' : 'p',
                unit: 'px',
                format: [canvas.width, canvas.height]
            });

            // Add image to full page size
            pdf.addImage(canvas.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, canvas.width, canvas.height);
            pdf.save(`network-grid-${Date.now()}.pdf`);
        }

    } catch (err) {
        console.error("Export Failed", err);
        alert("Export failed. See console.");
    } finally {
        // Optional: clear staging
        stagingGrid.innerHTML = '';
        // Note: we don't automatically exit selection mode, user might want to simple export different formats
    }
}

// --- Stats View Logic ---
const statsModal = document.getElementById('stats-modal');
const statsBtn = document.getElementById('stats-btn');
const closeStatsBtn = document.getElementById('close-stats');
const statsContent = document.getElementById('stats-content');

if (statsBtn) {
    statsBtn.addEventListener('click', () => {
        calculateAndRenderStats();
        statsModal.classList.remove('hidden');
        // Close mobile menu if open
        const headerActions = document.getElementById('header-actions');
        if (headerActions) headerActions.classList.remove('show');
    });
}

if (closeStatsBtn) {
    closeStatsBtn.addEventListener('click', () => {
        statsModal.classList.add('hidden');
    });
}

// Close on outside click
window.addEventListener('click', (e) => {
    if (e.target == statsModal) {
        statsModal.classList.add('hidden');
    }
});

function calculateAndRenderStats() {
    const totalFriends = allFriends.length;
    const categoryCounts = {};

    allFriends.forEach(friend => {
        const cat = friend.category || 'Uncategorized';
        // Normalize empty string or null to Uncategorized
        const cleanCat = cat.trim() === '' ? 'Uncategorized' : cat;
        categoryCounts[cleanCat] = (categoryCounts[cleanCat] || 0) + 1;
    });

    // Sort categories by count (descending)
    const sortedCategories = Object.entries(categoryCounts)
        .sort((a, b) => b[1] - a[1]);

    let categoriesHTML = '';
    sortedCategories.forEach(([cat, count]) => {
        // Find color if available
        let color = '#4f46e5'; // Default
        const sampleFriend = allFriends.find(f => {
            const fCat = f.category || 'Uncategorized';
            const cleanFCat = fCat.trim() === '' ? 'Uncategorized' : fCat;
            return cleanFCat === cat;
        });

        if (sampleFriend && sampleFriend.categoryColor) {
            color = sampleFriend.categoryColor;
        }

        // Handle Uncategorized specific styling if needed
        if (cat === 'Uncategorized') color = '#666';

        categoriesHTML += `
            <div class="stats-category-card">
                <div style="font-size:0.85rem; color:${color}; font-weight:bold; margin-bottom:5px;">${cat}</div>
                <div class="stats-cat-count">${count}</div>
            </div>
        `;
    });

    statsContent.innerHTML = `
        <div class="stats-row">
            <h3 style="margin:0; color:var(--text-muted); font-size:1rem;">Total People</h3>
            <div class="stats-big-number">${totalFriends}</div>
        </div>
        
        <h3 style="margin:20px 0 10px; font-size:1.1rem; border-top:1px solid var(--glass-border); padding-top:15px;">By Category</h3>
        <div class="stats-grid">
            ${categoriesHTML}
        </div>
    `;
}


// --- CSV IMPORT LOGIC ---
const importBtn = document.getElementById('import-btn');
const importInput = document.getElementById('import-csv-input');
const csvPreviewModal = document.getElementById('csv-preview-modal');
const csvPreviewTableBody = document.querySelector('#csv-preview-table tbody');
const confirmImportBtn = document.getElementById('confirm-import');
const cancelImportBtn = document.getElementById('cancel-import');
let currentImportData = [];

if (importBtn && importInput) {
    importBtn.addEventListener('click', () => {
        importInput.click();
    });

    importInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Reset input for next time
        e.target.value = '';
        parseCSV(file);
    });
} else {
    console.error("CSV Import elements not found!");
}

if (cancelImportBtn) {
    cancelImportBtn.addEventListener('click', () => {
        csvPreviewModal.classList.add('hidden');
        currentImportData = [];
    });
}

if (confirmImportBtn) {
    confirmImportBtn.addEventListener('click', async () => {
        if (currentImportData.length === 0) {
            alert("No data to import.");
            return;
        }

        const btn = confirmImportBtn;
        btn.disabled = true;
        btn.innerText = "Importing...";
        
        let importCount = 0;
        try {
            const batchPromises = currentImportData.map(async (data) => {
                await addDoc(collection(db, "friends"), data);
                importCount++;
            });

            await Promise.all(batchPromises);
            
            // Success feedback
            const statusEl = document.getElementById('preview-status');
            if(statusEl) {
                statusEl.innerText = `Successfully imported ${importCount} contacts!`;
                statusEl.style.color = "var(--success)";
            }

            // Close after short delay
            setTimeout(() => {
                csvPreviewModal.classList.add('hidden');
                btn.disabled = false;
                btn.innerText = "Confirm Import";
                if(statusEl) statusEl.innerText = "";
                updateStorageStats();
            }, 1000);

        } catch (error) {
            console.error("Import Error:", error);
            alert("Error importing contacts: " + error.message);
            btn.disabled = false;
            btn.innerText = "Confirm Import";
        }
    });
}

function parseCSV(file) {
    if (typeof Papa === 'undefined') {
        alert("CSV Parser not loaded. Please refresh.");
        return;
    }

    Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
            const data = results.data;
            if (data.length === 0) {
                alert("CSV is empty.");
                return;
            }

            // Validate headers slightly less strict
            const firstRow = data[0];
            const hasKey = (key) => Object.keys(firstRow).some(k => k.trim() === key);
            
            if (!hasKey("Forename") || !hasKey("Surname")) {
                alert("Error: CSV must have 'Forename' and 'Surname' columns.");
                return;
            }

            // Process data for preview
            currentImportData = [];
            const getVal = (row, key) => row[key]?.trim() || "";

            data.forEach(row => {
                const firstName = getVal(row, "Forename");
                const lastName = getVal(row, "Surname");
                const work = getVal(row, "Line Of Work");
                const met = getVal(row, "Met At");

                if (!firstName && !lastName) return;

                const fullName = `${firstName} ${lastName}`.trim();

                const friendData = {
                    userId: currentUser.uid,
                    firstName: firstName,
                    lastName: lastName,
                    name: fullName,
                    work: work,
                    met: met,
                    origin: "",
                    phone: "",
                    freq: 30,
                    lastContact: "",
                    notes: "Imported from CSV",
                    category: "Imported",
                    categoryColor: "#888888",
                    isExempt: false,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    photoURL: `https://ui-avatars.com/api/?background=random&name=${encodeURIComponent(fullName)}` 
                };
                
                currentImportData.push(friendData);
            });

            if (currentImportData.length === 0) {
                alert("No valid rows found to import.");
                return;
            }

            renderPreview();
            csvPreviewModal.classList.remove('hidden');
        },
        error: (err) => {
            console.error("CSV Parse Error:", err);
            alert("Failed to parse CSV file.");
        }
    });
}

function renderPreview() {
    csvPreviewTableBody.innerHTML = '';
    
    if (currentImportData.length === 0) {
        csvPreviewTableBody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px;">No data to import</td></tr>';
        return;
    }

    currentImportData.forEach((item, index) => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
        
        tr.innerHTML = `
            <td style="padding: 10px;">${item.name}</td>
            <td style="padding: 10px;">${item.work || '-'}</td>
            <td style="padding: 10px;">${item.met || '-'}</td>
            <td style="padding: 10px; text-align: center;">
                <button class="btn icon-btn delete-row-btn" data-index="${index}" style="color: var(--danger); padding: 5px;">&times;</button>
            </td>
        `;
        csvPreviewTableBody.appendChild(tr);
    });

    // Add listeners to delete buttons
    document.querySelectorAll('.delete-row-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = parseInt(e.target.dataset.index);
            currentImportData.splice(index, 1);
            renderPreview();
        });
    });
}

// --- Bulk Delete Logic ---
const deleteSelectedBtn = document.getElementById('delete-selected-btn');
const slideDeleteModal = document.getElementById('slide-delete-modal');
const deleteSlider = document.getElementById('delete-slider');
const sliderThumb = document.getElementById('slider-thumb');
const cancelSlideDeleteBtn = document.getElementById('cancel-slide-delete');
const slideDeleteMsg = document.getElementById('slide-delete-msg');

if (deleteSelectedBtn) {
    deleteSelectedBtn.addEventListener('click', () => {
        if (selectedFriendIds.size === 0) return;
        
        slideDeleteMsg.innerText = `Deleting ${selectedFriendIds.size} contacts. This cannot be undone.`;
        deleteSlider.value = 0;
        updateSliderVisuals(0);
        slideDeleteModal.classList.remove('hidden');
    });
}

if (cancelSlideDeleteBtn) {
    cancelSlideDeleteBtn.addEventListener('click', () => {
        slideDeleteModal.classList.add('hidden');
        deleteSlider.value = 0;
        updateSliderVisuals(0);
    });
}

// Slider Logic
if (deleteSlider && sliderThumb) {
    deleteSlider.addEventListener('input', (e) => {
        const val = e.target.value;
        updateSliderVisuals(val);
        
        if (parseInt(val) === 100) {
            performBulkDelete();
        }
    });

    // Reset if dropped before 100
    deleteSlider.addEventListener('change', (e) => {
        if (parseInt(e.target.value) < 100) {
            // Animate back
            deleteSlider.value = 0;
            updateSliderVisuals(0);
        }
    });
    
    // Also handle touch end if change doesn't fire reliably on all browsers
    deleteSlider.addEventListener('touchend', (e) => {
        if (parseInt(deleteSlider.value) < 100) {
            deleteSlider.value = 0;
            updateSliderVisuals(0);
        }
    });
}

function updateSliderVisuals(val) {
    // thumb is 40px wide, container is roughly 100% width.
    // We need to move the visual thumb to match the input thumb position.
    // Input range usually maps 0-100% of available width.
    // Let's just use calc for the left position.
    // The input range track width is 100% of container (minus some padding).
    // Let's assume the container has padding.
    // Simple approach: left = val% - but we need to account for thumb width.
    
    const containerWidth = deleteSlider.parentElement.clientWidth; // approx 400px max
    const thumbWidth = 40;
    const padding = 5;
    
    // visual thumb position logic
    // 0% -> left: 5px
    // 100% -> left: containerWidth - thumbWidth - 5px
    
    const maxLeft = containerWidth - thumbWidth - padding;
    const minLeft = padding;
    const range = maxLeft - minLeft;
    
    const leftPos = minLeft + (range * (val / 100));
    sliderThumb.style.left = `${leftPos}px`;
    
    // Optional transparency change
    sliderThumb.style.opacity = 0.5 + (val/200); 
}

async function performBulkDelete() {
    deleteSlider.disabled = true; // Prevent multiple triggers
    sliderThumb.innerHTML = '<div class="spinner"></div>';
    slideDeleteMsg.innerText = "Deleting...";
    
    const idsToDelete = Array.from(selectedFriendIds);
    let deletedCount = 0;
    
    try {
        const promiseBatch = idsToDelete.map(async (id) => {
            await deleteDoc(doc(db, "friends", id));
            deletedCount++;
        });

        await Promise.all(promiseBatch);
        
        // Success
        slideDeleteModal.classList.add('hidden');
        toggleSelectionMode(false); // Exit selection mode
        
        // Show success toast (reuse undo toast styled differently or create new)
        const toast = document.createElement('div');
        toast.style.cssText = "position:fixed; bottom:20px; right:20px; background:var(--success); color:white; padding:15px; border-radius:10px; z-index:2000;";
        toast.innerText = `Deleted ${deletedCount} contacts.`;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
        
        updateStorageStats();

    } catch (error) {
        console.error("Bulk Delete Error:", error);
        alert("Failed to delete some contacts: " + error.message);
        slideDeleteModal.classList.add('hidden');
    } finally {
        // Reset slider
        deleteSlider.disabled = false;
        deleteSlider.value = 0;
        updateSliderVisuals(0);
        sliderThumb.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>'; 
    }
}
