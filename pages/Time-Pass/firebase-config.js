/**
 * Time Pass — Firebase web config.
 *
 * Values come from process.env (injected by build.js from .env.local / Vercel).
 * Web apiKey is a public client identifier — still prefer .env.local over committing.
 *
 * Local `npm run dev` (serve) does NOT inject env. Use:
 *   - `npm run build && npm run preview`, or
 *   - fallbacks below once configured (same pattern as To-Do List).
 */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import {
  getFirestore,
  enableMultiTabIndexedDbPersistence,
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// Safety shim for browser environments (build.js replaces process.env.* in deploy output)
if (typeof process === 'undefined') {
  var process = { env: {} };
}

const defaultConfig = {
  apiKey: process.env.PUBLIC_TIME_PASS_FIREBASE_API_KEY || '',
  authDomain: process.env.PUBLIC_TIME_PASS_FIREBASE_AUTH_DOMAIN || '',
  projectId: process.env.PUBLIC_TIME_PASS_FIREBASE_PROJECT_ID || '',
  storageBucket: process.env.PUBLIC_TIME_PASS_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: process.env.PUBLIC_TIME_PASS_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: process.env.PUBLIC_TIME_PASS_FIREBASE_APP_ID || '',
};

function resolveConfig() {
  if (typeof window !== 'undefined' && window.TIME_PASS_FIREBASE_CONFIG?.apiKey) {
    return window.TIME_PASS_FIREBASE_CONFIG;
  }
  return defaultConfig;
}

export const firebaseConfig = resolveConfig();

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
    firebaseConfig.projectId &&
    !String(firebaseConfig.apiKey).startsWith('PLACEHOLDER_')
);

let app = null;
let auth = null;
let db = null;

if (isFirebaseConfigured) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);

  enableMultiTabIndexedDbPersistence(db).catch((err) => {
    if (err.code === 'failed-precondition') {
      console.warn('Time Pass: Firestore persistence unavailable (multiple tabs).');
    } else if (err.code === 'unimplemented') {
      console.warn('Time Pass: Firestore persistence not supported in this browser.');
    } else {
      console.warn('Time Pass: Firestore persistence error', err);
    }
  });
} else {
  console.warn(
    'Time Pass: Firebase is not configured. Guest preview works; add PUBLIC_TIME_PASS_FIREBASE_* to .env.local (see README).'
  );
}

export { app, auth, db };
