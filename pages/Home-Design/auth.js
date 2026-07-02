import { signInWithPopup, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js';
import { auth, googleProvider } from './firebase-config.js';
import { OWNER_EMAIL } from './constants.js';

const authState = {
    user: null,
    isOwner: false,
    listeners: new Set()
};

function notify() {
    authState.listeners.forEach((listener) => {
        listener({
            user: authState.user,
            isOwner: authState.isOwner
        });
    });
    window.dispatchEvent(new CustomEvent('athome:auth', {
        detail: {
            user: authState.user,
            isOwner: authState.isOwner
        }
    }));
}

export function onAuthChange(listener) {
    authState.listeners.add(listener);
    listener({
        user: authState.user,
        isOwner: authState.isOwner
    });
    return () => authState.listeners.delete(listener);
}

export function getAuthState() {
    return {
        user: authState.user,
        isOwner: authState.isOwner
    };
}

export function isOwnerUser(user = authState.user) {
    return Boolean(user && user.email === OWNER_EMAIL);
}

function cacheElements() {
    return {
        authGuest: document.getElementById('authGuest'),
        authSignedIn: document.getElementById('authSignedIn'),
        signOutBtn: document.getElementById('authSignOut'),
        authStatus: document.getElementById('authStatus'),
        adminBar: document.getElementById('adminBar'),
        imageManagerTrigger: document.getElementById('imageManagerTrigger')
    };
}

function updateAuthUI() {
    const el = cacheElements();
    const { user, isOwner } = authState;

    if (el.authGuest) {
        el.authGuest.hidden = Boolean(user);
    }

    if (el.authSignedIn) {
        el.authSignedIn.hidden = !user;
    }

    if (el.authStatus) {
        if (!user) {
            el.authStatus.textContent = '';
            el.authStatus.classList.remove('is-owner', 'is-viewer');
        } else if (isOwner) {
            el.authStatus.textContent = user.displayName || user.email || 'Signed in';
            el.authStatus.classList.add('is-owner');
            el.authStatus.classList.remove('is-viewer');
        } else {
            el.authStatus.textContent = 'View only';
            el.authStatus.classList.add('is-viewer');
            el.authStatus.classList.remove('is-owner');
        }
    }

    if (el.adminBar) {
        el.adminBar.hidden = !isOwner;
        el.adminBar.setAttribute('aria-hidden', String(!isOwner));
    }

    if (el.imageManagerTrigger) {
        el.imageManagerTrigger.hidden = !isOwner;
    }

    document.body.classList.toggle('athome-owner', isOwner);
    document.body.classList.toggle('athome-signed-in', Boolean(user));
}

export function initAuth() {
    const el = cacheElements();

    document.getElementById('authSignIn')?.addEventListener('click', () => {
        signInWithPopup(auth, googleProvider).catch((error) => {
            console.error('[AtHome] Sign-in failed', error);
            if (el.authStatus) {
                el.authStatus.textContent = error.message || 'Sign-in failed';
                el.authStatus.classList.add('is-error');
            }
        });
    });

    el.signOutBtn?.addEventListener('click', () => {
        signOut(auth).catch((error) => {
            console.error('[AtHome] Sign-out failed', error);
        });
    });

    onAuthStateChanged(auth, (user) => {
        authState.user = user;
        authState.isOwner = isOwnerUser(user);
        updateAuthUI();
        notify();
    });
}
