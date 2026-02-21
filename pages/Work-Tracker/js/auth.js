import { signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { auth, provider } from './config.js';
import { state } from './state.js';
import { DOM, showAlert } from './ui.js';
import { loadHistory } from './api.js';
import { checkRestorableSession } from './timer.js';

export function setupAuth() {
    DOM.loginBtn.addEventListener('click', () => {
        signInWithPopup(auth, provider).catch((error) => {
            showAlert("Login Failed", error.message);
        });
    });

    DOM.logoutBtn.addEventListener('click', () => {
        signOut(auth).then(() => {
            location.reload();
        });
    });

    onAuthStateChanged(auth, (user) => {
        if (user) {
            state.currentUser = user;
            DOM.authSection.classList.add('hidden');
            DOM.dashboard.classList.remove('hidden');
            DOM.userNameDisplay.textContent = user.displayName || user.email;

            loadHistory();
            checkRestorableSession();
        } else {
            state.currentUser = null;
            DOM.authSection.classList.remove('hidden');
            DOM.dashboard.classList.add('hidden');
        }
    });
}
