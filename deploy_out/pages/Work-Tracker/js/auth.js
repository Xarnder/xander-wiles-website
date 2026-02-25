import { signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { auth, provider } from './config.js';
import { state } from './state.js';
import { DOM, showAlert } from './ui.js';
import { loadHistory, addCustomSession } from './api.js';
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

            // Check for pending sessions that were saved on unload
            const pendingSessionStr = localStorage.getItem('work_tracker_pending_session');
            if (pendingSessionStr) {
                try {
                    const pendingSession = JSON.parse(pendingSessionStr);
                    addCustomSession(pendingSession).then(() => {
                        localStorage.removeItem('work_tracker_pending_session');
                        console.log("Debug: Restored pending session on load.");
                    }).catch(err => console.error("Could not upload pending session:", err));
                } catch (e) {
                    console.error("Debug: Invalid pending session format", e);
                    localStorage.removeItem('work_tracker_pending_session');
                }
            }

            loadHistory();
            checkRestorableSession();
        } else {
            state.currentUser = null;
            DOM.authSection.classList.remove('hidden');
            DOM.dashboard.classList.add('hidden');
        }
    });
}
