import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, enableMultiTabIndexedDbPersistence } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- FIREBASE CONFIG ---
const defaultConfig = {
    apiKey: process.env.PUBLIC_TODO_FIREBASE_API_KEY,
    authDomain: process.env.PUBLIC_TODO_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.PUBLIC_TODO_FIREBASE_PROJECT_ID,
    storageBucket: process.env.PUBLIC_TODO_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.PUBLIC_TODO_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.PUBLIC_TODO_FIREBASE_APP_ID
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
