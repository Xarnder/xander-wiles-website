import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, enableIndexedDbPersistence } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- FIREBASE CONFIG ---
const firebaseConfig = {
    apiKey: "AIzaSyC6PrlknJUGPIdyyUq78rKYEsbQ1v5bJNo",
    authDomain: "taskmaster-cloud-xander.firebaseapp.com",
    projectId: "taskmaster-cloud-xander",
    storageBucket: "taskmaster-cloud-xander.firebasestorage.app",
    messagingSenderId: "878016054387",
    appId: "1:878016054387:web:e38131dd806982a22a1606"
};

// --- INIT FIREBASE ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Enable Offline Persistence
enableIndexedDbPersistence(db).catch((err) => {
    if (err.code == 'failed-precondition') {
        console.warn('Persistence failed: Multiple tabs open.');
    } else if (err.code == 'unimplemented') {
        console.warn('Persistence not supported by browser.');
    }
});

export { app, auth, db };
