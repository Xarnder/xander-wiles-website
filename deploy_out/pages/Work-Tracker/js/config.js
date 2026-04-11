import { initializeApp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { initializeFirestore } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "test_work_key",
    authDomain: "test_work_domain",
    projectId: "test_work_project",
    storageBucket: "test_work_bucket",
    messagingSenderId: "12345",
    appId: "1:12345:web:test"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = initializeFirestore(app, {
    experimentalForceLongPolling: true
});
export const provider = new GoogleAuthProvider();
