import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, enableMultiTabIndexedDbPersistence } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Safety shim for browser environments
if (typeof process === 'undefined') {
    var process = { env: {} };
}

// --- FIREBASE CONFIG ---
const defaultConfig = {
    apiKey: process.env.PUBLIC_TODO_FIREBASE_API_KEY || "AIzaSyC6PrlknJUGPIdyyUq78rKYEsbQ1v5bJNo",
    authDomain: process.env.PUBLIC_TODO_FIREBASE_AUTH_DOMAIN || "taskmaster-cloud-xander.firebaseapp.com",
    projectId: process.env.PUBLIC_TODO_FIREBASE_PROJECT_ID || "taskmaster-cloud-xander",
    storageBucket: process.env.PUBLIC_TODO_FIREBASE_STORAGE_BUCKET || "taskmaster-cloud-xander.firebasestorage.app",
    messagingSenderId: process.env.PUBLIC_TODO_FIREBASE_MESSAGING_SENDER_ID || "878016054387",
    appId: process.env.PUBLIC_TODO_FIREBASE_APP_ID || "1:878016054387:web:e38131dd806982a22a1606"
};

const firebaseConfig = (window.APP_CONFIG && window.APP_CONFIG.firebase && window.APP_CONFIG.firebase.apiKey) 
    ? window.APP_CONFIG.firebase 
    : defaultConfig;

// --- INIT FIREBASE ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Enable Offline Persistence
enableMultiTabIndexedDbPersistence(db).catch((err) => {
    if (err.code == 'failed-precondition') {
        console.warn('Persistence failed: Multiple tabs open.');
    } else if (err.code == 'unimplemented') {
        console.warn('Persistence not supported by browser.');
    }
});

export { app, auth, db };
