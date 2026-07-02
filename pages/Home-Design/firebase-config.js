import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js';
import { getAuth, GoogleAuthProvider } from 'https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js';
import { initializeFirestore } from 'https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/12.9.0/firebase-storage.js';

if (typeof process === 'undefined') {
    // eslint-disable-next-line no-var
    var process = { env: {} };
}

const firebaseConfig = {
    apiKey: process.env.PUBLIC_HOME_DESIGN_FIREBASE_API_KEY,
    authDomain: process.env.PUBLIC_HOME_DESIGN_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.PUBLIC_HOME_DESIGN_FIREBASE_PROJECT_ID,
    storageBucket: process.env.PUBLIC_HOME_DESIGN_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.PUBLIC_HOME_DESIGN_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.PUBLIC_HOME_DESIGN_FIREBASE_APP_ID
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = initializeFirestore(app, { experimentalForceLongPolling: true });
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();
