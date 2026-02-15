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
let currentPhotoBlob = null; // Holds the processed 4MP image

// DOM Elements
const views = {
    login: document.getElementById('login-view'),
    dashboard: document.getElementById('dashboard-view')
};
const modal = document.getElementById('modal');
const friendForm = document.getElementById('friend-form');
const friendsGrid = document.getElementById('friends-grid');
const searchInput = document.getElementById('search-input');
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

// --- IMAGE PROCESSING (4MP WebP) ---
// --- IMAGE PROCESSING (4MP WebP) ---
// --- IMAGE PROCESSING (4MP WebP) ---
document.getElementById('photo-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    statusMsg.innerText = "Processing image...";

    // Helper: Process loaded image to WebP
    const processLoadedImage = (img) => {
        // Downsample logic
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const MAX_SIZE = 2500; // ~4MP roughly

        let width = img.width;
        let height = img.height;

        if (width > height) {
            if (width > MAX_SIZE) {
                height *= MAX_SIZE / width;
                width = MAX_SIZE;
            }
        } else {
            if (height > MAX_SIZE) {
                width *= MAX_SIZE / height;
                height = MAX_SIZE;
            }
        }

        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);

        // Convert to WebP
        canvas.toBlob((blob) => {
            currentPhotoBlob = blob;
            // Update Preview
            const previewUrl = URL.createObjectURL(blob);
            document.getElementById('photo-preview').style.backgroundImage = `url(${previewUrl})`;
            document.getElementById('photo-preview').innerHTML = ''; // remove text
            statusMsg.innerText = `Ready: ${(blob.size / 1024).toFixed(0)}KB`;
        }, 'image/webp', 0.85);
    };

    // Strategy: Try Native Load -> If Fail, Try HEIC Conversion -> If Fail, Error
    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
        console.log("Image loaded natively");
        processLoadedImage(img);
        URL.revokeObjectURL(url);
    };

    img.onerror = async () => {
        console.log("Native load failed, checking validity or HEIC...");

        // Check if it might be HEIC
        const isHeic = file.type === "image/heic" ||
            file.type === "image/heif" ||
            file.name.toLowerCase().endsWith('.heic') ||
            file.name.toLowerCase().endsWith('.heif');

        if (isHeic) {
            statusMsg.innerText = "Converting HEIC...";
            if (typeof heic2any === 'undefined') {
                statusMsg.innerText = "Error: HEIC converter library missing.";
                return;
            }

            try {
                const convertedBlob = await heic2any({
                    blob: file,
                    toType: "image/jpeg",
                    quality: 0.8
                });

                const resultBlob = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
                const convertedUrl = URL.createObjectURL(resultBlob);
                const img2 = new Image();

                img2.onload = () => {
                    console.log("Converted HEIC loaded successfully");
                    processLoadedImage(img2);
                    URL.revokeObjectURL(convertedUrl);
                };

                img2.onerror = (e2) => {
                    console.error("Converted image failed to load", e2);
                    statusMsg.innerText = "Error: Could not display converted image.";
                };

                img2.src = convertedUrl;

            } catch (err) {
                console.error("HEIC Conversion Failed:", err);
                // Show exact error to user for debugging
                statusMsg.innerText = "HEIC Error: " + (err.message || err);
            }
        } else {
            // Not HEIC, just a broken file
            statusMsg.innerText = "Error: Invalid image file.";
        }

        URL.revokeObjectURL(url); // Clean up original
    };

    img.src = url;
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

        const friendData = {
            userId: currentUser.uid,
            name: document.getElementById('inp-name').value,
            met: document.getElementById('inp-met').value,
            origin: document.getElementById('inp-origin').value,
            work: document.getElementById('inp-work').value,
            phone: document.getElementById('inp-phone').value,
            freq: parseInt(document.getElementById('inp-freq').value) || 30,
            lastContact: document.getElementById('inp-last').value,
            notes: document.getElementById('inp-notes').value,
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

        // Client-side sorting (easiest without complex Firestore indexes)
        // Sort by "Next Due Date" ascending
        friends.sort((a, b) => {
            const dateA = getNextDueDate(a.lastContact, a.freq);
            const dateB = getNextDueDate(b.lastContact, b.freq);
            return dateA - dateB;
        });

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

    const card = document.createElement('div');
    card.className = 'glass-card friend-card';
    card.innerHTML = `
        <img src="${data.photoURL}" class="card-img" alt="${data.name}" loading="lazy">
        <div class="card-info">
            <div style="display:flex;justify-content:space-between">
                <h3>${data.name}</h3>
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
    document.getElementById('inp-freq').value = data.freq;
    document.getElementById('inp-last').value = data.lastContact;
    document.getElementById('inp-notes').value = data.notes;

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

// Search Filter
searchInput.addEventListener('input', (e) => {
    const val = e.target.value.toLowerCase();
    const cards = document.querySelectorAll('.friend-card');
    cards.forEach(card => {
        const text = card.innerText.toLowerCase();
        card.style.display = text.includes(val) ? 'flex' : 'none';
    });
});