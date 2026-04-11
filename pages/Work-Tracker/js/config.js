import { initializeApp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { initializeFirestore } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: process.env.PUBLIC_WORK_FIREBASE_API_KEY,
    authDomain: process.env.PUBLIC_WORK_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.PUBLIC_WORK_FIREBASE_PROJECT_ID,
    storageBucket: process.env.PUBLIC_WORK_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.PUBLIC_WORK_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.PUBLIC_WORK_FIREBASE_APP_ID
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = initializeFirestore(app, {
    experimentalForceLongPolling: true
});
export const provider = new GoogleAuthProvider();
