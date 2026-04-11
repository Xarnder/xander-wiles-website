import { initializeApp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { initializeFirestore } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

// Safety shim for browser environments
if (typeof process === 'undefined') {
    var process = { env: {} };
}

const firebaseConfig = {
    apiKey: process.env.PUBLIC_WORK_FIREBASE_API_KEY || "AIzaSyCjNeg92N-4vHQAVLNMMNyPTBcGEsPcMBc",
    authDomain: process.env.PUBLIC_WORK_FIREBASE_AUTH_DOMAIN || "work-tracker-xander.firebaseapp.com",
    projectId: process.env.PUBLIC_WORK_FIREBASE_PROJECT_ID || "work-tracker-xander",
    storageBucket: process.env.PUBLIC_WORK_FIREBASE_STORAGE_BUCKET || "work-tracker-xander.firebasestorage.app",
    messagingSenderId: process.env.PUBLIC_WORK_FIREBASE_MESSAGING_SENDER_ID || "885496985060",
    appId: process.env.PUBLIC_WORK_FIREBASE_APP_ID || "1:885496985060:web:4cb7f5e8463471348743f1"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = initializeFirestore(app, {
    experimentalForceLongPolling: true
});
export const provider = new GoogleAuthProvider();
