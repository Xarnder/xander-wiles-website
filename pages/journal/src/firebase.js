import { initializeApp } from "firebase/app";
import { getFirestore, initializeFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getStorage } from "firebase/storage";
import { isIOSFirestoreClient } from "./utils/entryLoad";

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);

// iOS standalone PWAs often never finish Firestore's streaming connection on
// the first launch. Reads then sit forever until the app is force-quit.
// Long polling completes on that first launch. Other browsers keep the
// default transport, which already auto-detects long polling when needed.
const useIOSLongPolling = typeof navigator !== 'undefined' && isIOSFirestoreClient(navigator.userAgent, {
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints
});

export const db = useIOSLongPolling
    ? initializeFirestore(app, { experimentalForceLongPolling: true })
    : getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();
