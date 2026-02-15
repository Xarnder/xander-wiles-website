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
            viewMode: 1,
            dragMode: 'move',
            autoCropArea: 1,
            restore: false,
            guides: true,
            center: true,
            highlight: false,
            cropBoxMovable: true,
            cropBoxResizable: true,
            toggleDragModeOnDblclick: false,
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

        const friendData = {
            userId: currentUser.uid,
            name: document.getElementById('inp-name').value,
            met: document.getElementById('inp-met').value,
            origin: document.getElementById('inp-origin').value,
            work: document.getElementById('inp-work').value,
            phone: document.getElementById('inp-phone').value,
            freq: freqDays,
            lastContact: document.getElementById('inp-last').value,
            notes: document.getElementById('inp-notes').value,
            category: document.getElementById('inp-category').value.trim(),
            categoryColor: document.getElementById('inp-color').value,
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
    let badgeText = `Due in ${diffDays} days`;

    if (diffDays < 0) {
        badgeClass = 'status-overdue';
        badgeText = `Overdue by ${Math.abs(diffDays)} days`;
    } else if (diffDays <= 7) {
        badgeClass = 'status-due';
        badgeText = `Due soon (${diffDays} days)`;
    }

    const categoryBadge = data.category
        ? `<span class="category-badge" style="background-color:${data.categoryColor || '#4f46e5'}">${data.category}</span>`
        : '';

    const card = document.createElement('div');
    card.className = 'glass-card friend-card';
    card.dataset.category = data.category || ""; // Store for filtering
    card.innerHTML = `
        <img src="${data.photoURL}" class="card-img" alt="${data.name}" loading="lazy">
        <div class="card-info">
            <div style="display:flex;justify-content:space-between; align-items:flex-start">
                <div>
                    <h3>${data.name}</h3>
                    ${categoryBadge}
                </div>
                <span class="status-badge ${badgeClass}">${badgeText}</span>
            </div>
            <div class="card-details">
                <div>📍 ${data.origin || '-'} | 💼 ${data.work || '-'}</div>
                <div>📞 <a href="tel:${data.phone}" style="color:inherit">${data.phone || '-'}</a></div>
                <div>🗓 Met: ${data.met || '-'}</div>
            </div>
            <p style="font-size:0.85rem; margin-top:10px">${data.notes || ''}</p>
        </div>
        <div class="card-actions">
            <button class="btn secondary-btn edit-btn">Edit</button>
            <button class="btn secondary-btn delete-btn" style="color:var(--danger);border-color:rgba(239,68,68,0.3)">Delete</button>
        </div>
    `;

    // Event Listeners for buttons
    card.querySelector('.delete-btn').addEventListener('click', () => deletePerson(data.id));
    card.querySelector('.edit-btn').addEventListener('click', () => openEdit(data));

    friendsGrid.appendChild(card);
}

// Helpers
function getNextDueDate(lastContactStr, freqDays) {
    if (!lastContactStr) return new Date(); // If no date, due now
    const last = new Date(lastContactStr);
    const next = new Date(last);
    next.setDate(last.getDate() + freqDays);
    return next;
}

async function deletePerson(id) {
    if (confirm("Are you sure?")) {
        await deleteDoc(doc(db, "friends", id));
        // Note: Ideally we should delete the image too, but we need the path.
        // For simplicity/safety, we'll implement that later or rely on lifecycle rules.
        updateStorageStats(); // Refresh stats (though image remains, so unchanged technically unless we delete it)
    }
}

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
    statusMsg.innerText = ""; // Fix: Clear previous status
    document.getElementById('edit-id').value = "";
    document.getElementById('modal-title').innerText = "Add Person";

    // Default: 1 Month
    document.getElementById('inp-freq-val').value = 1;
    document.getElementById('inp-freq-unit').value = 30;

    // Default Color
    document.getElementById('inp-category').value = '';
    document.getElementById('inp-color').value = '#4f46e5';

    document.getElementById('photo-preview').style.backgroundImage = 'none';
    document.getElementById('photo-preview').innerHTML = '<span>Tap to Add Photo</span>';
    currentPhotoBlob = null;
    modal.classList.remove('hidden');
});

function openEdit(data) {
    friendForm.reset();
    statusMsg.innerText = ""; // Fix: Clear previous status
    document.getElementById('edit-id').value = data.id;
    document.getElementById('modal-title').innerText = "Edit Person";

    document.getElementById('inp-name').value = data.name;
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

    document.getElementById('photo-preview').style.backgroundImage = `url(${data.photoURL})`;
    document.getElementById('photo-preview').innerHTML = '';
    currentPhotoBlob = null; // Reset blob unless they pick a new one

    modal.classList.remove('hidden');
}

function closeModal() {
    modal.classList.add('hidden');
}
document.getElementById('close-modal').addEventListener('click', closeModal);
window.onclick = (e) => { if (e.target == modal) closeModal(); }

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

    // Filter friends due in this month/year
    const dueFriends = allFriends.filter(friend => {
        const nextDue = getNextDueDate(friend.lastContact, friend.freq);
        return nextDue.getMonth() === currentCalendarDate.getMonth() &&
            nextDue.getFullYear() === currentCalendarDate.getFullYear();
    });

    // Sort by day (earliest first)
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
        const day = nextDue.getDate();

        let cycleText = friend.freq + 'd';
        if (friend.freq >= 30 && friend.freq % 30 === 0) cycleText = (friend.freq / 30) + 'mo';
        else if (friend.freq >= 7 && friend.freq % 7 === 0) cycleText = (friend.freq / 7) + 'w';

        const item = document.createElement('div');
        item.className = 'calendar-item';
        // Make the whole item clickable
        item.style.cursor = 'pointer';
        item.onclick = () => openEdit(friend);

        item.innerHTML = `
            <div class="calendar-date-badge">${day}</div>
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
        const response = await fetch(url);
        return await response.blob();
    } catch (e) {
        console.error("Failed to fetch image", url, e);
        return null; // Return null if fetch fails (e.g., CORS or loose URL)
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