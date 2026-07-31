import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { auth, isFirebaseConfigured } from '../firebase-config.js';
import { setAuthError, setUser, setFirebaseReady } from './store.js';
import { toast } from './format.js';

let unsubAuth = null;

export async function initAuth(onUser) {
  setFirebaseReady(isFirebaseConfigured);

  if (!isFirebaseConfigured || !auth) {
    setUser(null);
    onUser(null);
    return () => {};
  }

  try {
    await setPersistence(auth, browserLocalPersistence);
  } catch (err) {
    console.warn('Auth persistence error', err);
  }

  try {
    await getRedirectResult(auth);
  } catch (err) {
    console.warn('Redirect login error', err);
  }

  unsubAuth = onAuthStateChanged(auth, (user) => {
    setUser(user);
    setAuthError(null);
    onUser(user);
  });

  return () => {
    if (unsubAuth) unsubAuth();
  };
}

export async function signInWithGoogle() {
  if (!isFirebaseConfigured || !auth) {
    toast('Firebase is not configured yet. Add your project config (see README).', 'error');
    return;
  }
  const provider = new GoogleAuthProvider();
  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    if (
      error.code === 'auth/popup-blocked' ||
      error.code === 'auth/popup-closed-by-user' ||
      error.code === 'auth/cancelled-popup-request'
    ) {
      try {
        await signInWithRedirect(auth, provider);
      } catch (redirectErr) {
        setAuthError(redirectErr.message);
        toast(`Sign-in failed: ${redirectErr.message}`, 'error');
      }
      return;
    }
    if (error.code === 'auth/popup-closed-by-user') return;
    setAuthError(error.message);
    toast(`Sign-in failed: ${error.message}`, 'error');
  }
}

export async function signOutUser() {
  if (!auth) return;
  await signOut(auth);
}
