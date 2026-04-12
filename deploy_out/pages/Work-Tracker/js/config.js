import { initializeApp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { initializeFirestore } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

// Safety shim for browser environments
if (typeof process === 'undefined') {
    var process = { env: {} };
}

const firebaseConfig = {
    apiKey: "AIzaSyCjNeg92N-4vHQAVLNMMNyPTBcGEsPcMBc" || "AIzaSyCjNeg92N-4vHQAVLNMMNyPTBcGEsPcMBc",
    authDomain: "work-tracker-xander.firebaseapp.com" || "work-tracker-xander.firebaseapp.com",
    projectId: "work-tracker-xander" || "work-tracker-xander",
    storageBucket: "work-tracker-xander.firebasestorage.app" || "work-tracker-xander.firebasestorage.app",
    messagingSenderId: "885496985060" || "885496985060",
    appId: "1:885496985060:web:4cb7f5e8463471348743f1" || "1:885496985060:web:4cb7f5e8463471348743f1"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = initializeFirestore(app, {
    experimentalForceLongPolling: true
});
export const provider = new GoogleAuthProvider();
