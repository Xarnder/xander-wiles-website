import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, enableMultiTabIndexedDbPersistence } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- FIREBASE CONFIG ---
const defaultConfig = {
    apiKey: "test_todo_key",
    authDomain: "test_todo_domain",
    projectId: "test_todo_project",
    storageBucket: "test_todo_bucket",
    messagingSenderId: "12345",
    appId: "1:12345:web:test"
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
