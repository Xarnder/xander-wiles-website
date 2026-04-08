
import { app, auth, db } from './firebase-config.js';
import { onAuthStateChanged, signInWithPopup, signInWithRedirect, getRedirectResult, GoogleAuthProvider, signOut, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, onSnapshot, setDoc, updateDoc, writeBatch, arrayUnion, arrayRemove, collection } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { state, setCurrentUser, cleanupListeners } from './store.js';
import * as API from './api.js';
import * as UI from './ui.js';
import * as Utils from './utils.js';
import { getTerm } from './utils.js';

console.log("[DEBUG] Main Module Initialized - v1.3 PWA Fixes");

// GLOBAL ERROR HANDLER FOR DEBUGGING
window.onerror = function (msg, url, line, col, error) {
    console.error("Global Error (details):", {
        message: msg,
        url: url,
        line: line,
        column: col,
        error: error || "No error object provided"
    });
};

// --- SERVICE WORKER REGISTRATION ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(registration => {
                console.log('ServiceWorker registration successful with scope: ', registration.scope);
            })
            .catch(err => {
                console.log('ServiceWorker registration failed: ', err);
            });

        // Removed automatic refresh on controllerchange to prevent iOS infinite reload loops.
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            console.log("Service Worker updated its controller.");
        });
    });
}

// ... existing code ...

// --- SPLASH SCREEN TIMEOUT REMOVED ---

// --- EXPOSE TO WINDOW FOR INLINE HTML ---
// This is critical for onclick="..." to work
window.handleAddTask = function (e, listId) {
    API.handleAddTask(e, listId).then((newCount) => {
        if (newCount === null) return; // Silent return if add was skipped/invalid
        console.log("DEBUG: handleAddTask finished. New Count:", newCount, "Limit:", state.appData.settings.backupFreq);
        if (newCount && newCount >= state.appData.settings.backupFreq) {
            console.log("DEBUG: Triggering Backup Modal. Element:", document.getElementById('backup-modal-overlay'));
            // Updated API to return newCount
            const modal = document.getElementById('backup-modal-overlay');
            if (modal) modal.classList.remove('hidden');
            // Reset count in DB handled by "I'll do it later" or actual backup
        }
    });
};
window.archiveTask = (taskId) => {
    API.archiveTask(taskId).then(() => {
        Utils.showToast(`${getTerm(true, true)} archived.`, "success");
    });
};
window.unarchiveTask = API.unarchiveTask;
window.deleteTaskForever = (taskId) => {
    showConfirmModal(
        `Delete ${getTerm(true, true)}?`,
        `Are you sure you want to delete this ${getTerm(true)}?`,
        () => API.deleteTaskForever(taskId),
        "ph-trash"
    );
};
window.toggleTaskComplete = function (taskId, isChecked) {
    API.toggleTaskComplete(taskId, isChecked).then(() => {
        // Auto archive logic
        if (isChecked && state.appData.settings.autoArchive) {
            setTimeout(() => {
                if (state.appData.tasks[taskId] && state.appData.tasks[taskId].completed) {
                    API.archiveTask(taskId);
                }
            }, 1000);
        }
    });
};
window.updateListTitle = API.updateListTitle;
window.deleteList = (id) => {
    showConfirmModal(
        "Delete List?",
        "Tasks will stay as orphans and won't be deleted forever.",
        () => API.deleteList(id),
        "ph-trash"
    );
};
window.emptyOrphans = API.emptyOrphans;

window.openEditModal = UI.openEditModal;
window.triggerImageUpload = UI.triggerImageUpload;
window.openImageLightbox = UI.openImageLightbox;
window.openBulkAddModal = UI.openBulkAddModal;
window.selectAllInList = UI.selectAllInList;
window.removeTaskFromList = UI.removeTaskFromList;
// window.handleDragEnd is not called by HTML mostly, but by Sortable configs which are inside UI.js
window.openArchivedTaskModal = UI.openArchivedTaskModal;
window.openEditListModal = UI.openEditListModal;
window.openBoardManager = UI.openBoardManager;
window.clearCompletedInList = API.clearCompletedInList;
window.showConfirmModal = showConfirmModal;

// --- BOARD MANAGEMENT EXPOSURE ---
window.switchBoard = API.switchBoard;
window.deleteBoard = (id) => {
    showConfirmModal(
        "Delete Board?",
        "This will permanently delete the board. All lists in this board will become orphans.",
        () => API.deleteBoard(id),
        "ph-trash"
    );
};

window.emptyOrphans = () => {
    showConfirmModal(
        `Delete All Orphaned ${getTerm(false, true)}?`,
        `This will permanently delete every ${getTerm(true)} that doesn't belong to a list. This cannot be undone.`,
        () => API.emptyOrphans(),
        "ph-trash"
    );
};

window.addNewBoard = API.addNewBoard;
window.rescueOrphanLists = API.rescueOrphanLists;
window.renderBoard = UI.renderBoard;

// --- DOM ELEMENTS ---
const loginOverlay = document.getElementById('login-overlay');
const logoutBtn = document.getElementById('logout-btn');
const googleLoginBtn = document.getElementById('google-login-btn');
const syncConsoleEl = document.getElementById('sync-console');
const boardContainer = document.getElementById('board-container');
const projectTitleInput = document.getElementById('project-title-input');

// --- AUTHENTICATION ---
// Set persistence to Local to ensure PWA and Safari keep the user logged in across sessions
setPersistence(auth, browserLocalPersistence)
    .then(() => {
        // Persistence set successfully
    })
    .catch((error) => {
        console.error("Auth Persistence Error:", error);
    });

// Handle Login Button
googleLoginBtn.addEventListener('click', () => {
    console.log("Login Button Clicked");
    const provider = new GoogleAuthProvider();

    // In iOS/Safari Safari, popups are often blocked, especially in PWA mode.
    // Try popup first. If it fails with a popup-blocked error, cleanly fallback to redirect.
    signInWithPopup(auth, provider)
        .then((result) => {
            console.log("Popup Login Success:", result.user.uid);
        })
        .catch((error) => {
            console.warn("Popup Login Error or Blocked:", error);
            // Fallback to redirect if popup is blocked or fails
            if (error.code === 'auth/popup-blocked' || error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request') {
                console.log("Falling back to redirect login...");
                signInWithRedirect(auth, provider).catch(redirectErr => {
                    console.error("Redirect Fallback Error:", redirectErr);
                    alert(`Login Failed: ${redirectErr.message}`);
                });
            } else {
                alert(`Login Error: ${error.message}`);
            }
        });
});

// Check for redirect result on page load (in case fallback was used)
// We must always call this on startup if signInWithRedirect is ever used.
getRedirectResult(auth)
    .then((result) => {
        if (result) {
            console.log("Redirect Login Success:", result.user.uid);
            // Auth state listener will handle the rest
        }
    })
    .catch((error) => {
        console.error("Redirect Login Error:", error);
        // Do not alert on redirect error unless requested, as it might just be an expired nonce or back-button navigation issue
    });


logoutBtn.onclick = () => {
    showConfirmModal(
        "Logout?",
        "Are you sure you want to sign out?",
        () => signOut(auth),
        'ph-sign-out'
    );
};

onAuthStateChanged(auth, (user) => {
    setCurrentUser(user);
    if (user) {
        console.log("Logged in:", user.uid);
        loginOverlay.classList.add('hidden');
        logoutBtn.style.display = 'flex';
        syncConsoleEl.classList.remove('hidden');
        state.lastSyncTime = Date.now();
        startSyncTimer();
        startAutomationTimer();
        setupFirestoreListeners(user.uid);
    } else {
        console.log("Logged out");
        loginOverlay.classList.remove('hidden');
        logoutBtn.style.display = 'none';
        syncConsoleEl.classList.add('hidden');
        stopSyncTimer();
        stopAutomationTimer();
        cleanupListeners();
        dateReset();
        // Splash logic removed
    }
});

function dateReset() {
    UI.resetState && UI.resetState(); // Using specialized reset if exists or direct store reset
    // Actually store.js has resetState
    import('./store.js').then(m => m.resetState());
    boardContainer.innerHTML = '';
}

function updateLastSync() {
    state.lastSyncTime = Date.now();
    state.lastSyncError = null;
    UI.updateSyncUI();
}

function startSyncTimer() {
    stopSyncTimer();
    state.syncInterval = setInterval(UI.updateSyncUI, 1000);
    UI.updateSyncUI();
}

function stopSyncTimer() {
    if (state.syncInterval) clearInterval(state.syncInterval);
}

let automationInterval = null;
function startAutomationTimer() {
    if (automationInterval) clearInterval(automationInterval);
    setTimeout(() => {
        API.processAutomatedLists();
        automationInterval = setInterval(() => {
            API.processAutomatedLists();
        }, 60000); // every 60 seconds
    }, 5000);
}

function stopAutomationTimer() {
    if (automationInterval) clearInterval(automationInterval);
}

// --- FANCY THEME ORBS & META ---
function manageFancyOrbs(theme) {
    const existingOrbs = document.querySelectorAll('.fancy-orb');
    if (theme === 'fancy') {
        if (existingOrbs.length === 0) {
            for (let i = 1; i <= 3; i++) {
                const orb = document.createElement('div');
                orb.className = `fancy-orb fancy-orb-${i}`;
                orb.setAttribute('aria-hidden', 'true');
                document.body.appendChild(orb);
            }
        }
    } else {
        existingOrbs.forEach(orb => orb.remove());
    }

    // Dynamic Status Bar & Theme Color
    const themeColorMeta = document.getElementById('theme-color-meta');
    const appleStatusMeta = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
    if (theme === 'light') {
        if (themeColorMeta) themeColorMeta.setAttribute('content', '#000000');
        if (appleStatusMeta) appleStatusMeta.setAttribute('content', 'default');
    } else {
        if (themeColorMeta) themeColorMeta.setAttribute('content', '#000000');
        if (appleStatusMeta) appleStatusMeta.setAttribute('content', 'black-translucent');
    }
}

// --- FIRESTORE LISTENERS ---
function setupFirestoreListeners(uid) {
    // 1. User Settings & Project Title
    const userDocRef = doc(db, "users", uid);

    state.listeners.push(onSnapshot(userDocRef, { includeMetadataChanges: true }, (docSnap) => {
        state.hasPendingWrites = docSnap.metadata.hasPendingWrites;
        if (!docSnap.metadata.fromCache) updateLastSync();
        if (docSnap.exists()) {
            const data = docSnap.data();
            state.appData.settings = { ...state.appData.settings, ...data.settings };

            // Auto-detect drag capability if not set
            if (state.appData.settings.dragEnabled === undefined || state.appData.settings.dragEnabled === null) {
                const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
                state.appData.settings.dragEnabled = !isTouchDevice;
            }

            state.appData.projectTitle = data.projectTitle || (window.APP_CONFIG && window.APP_CONFIG.appName) || "Task Master";
            if (!state.appData.currentBoardId) {
                state.appData.listOrder = data.listOrder || [];
            }

            // If we have a listOrder but no boards, we need to migrate
            // or if we have boards but listOrder is still on the user doc, we prioritize boards later.
            // But we keep this for backwards compatibility if needed.
            if (!state.appData.currentBoardId && state.appData.boards.length > 0) {
                const lastBoard = localStorage.getItem(`lastBoard_${uid}`);
                if (lastBoard && state.appData.boards.find(b => b.id === lastBoard)) {
                    state.appData.currentBoardId = lastBoard;
                } else {
                    state.appData.currentBoardId = state.appData.boards[0].id;
                }
            }
            if (state.appData.settings.theme) {
                localStorage.setItem('theme', state.appData.settings.theme);
            }
            document.documentElement.setAttribute('data-theme', state.appData.settings.theme);
            if (projectTitleInput) projectTitleInput.value = state.appData.projectTitle;
            if (document.getElementById('auto-archive-toggle')) document.getElementById('auto-archive-toggle').checked = state.appData.settings.autoArchive;
            if (document.getElementById('show-numbers-toggle')) document.getElementById('show-numbers-toggle').checked = state.appData.settings.showNumbers;
            if (document.getElementById('drag-tasks-toggle')) document.getElementById('drag-tasks-toggle').checked = state.appData.settings.dragEnabled;
            if (document.getElementById('sort-select')) document.getElementById('sort-select').value = state.appData.settings.sortMode;
            if (document.getElementById('backup-frequency-input')) document.getElementById('backup-frequency-input').value = state.appData.settings.backupFreq || 10;
            if (document.getElementById('tasks-since-backup-display')) document.getElementById('tasks-since-backup-display').textContent = state.appData.settings.tasksSinceBackup || 0;
            if (document.getElementById('add-bottom-toggle')) document.getElementById('add-bottom-toggle').checked = (state.appData.settings.addTaskLocation === 'bottom');
            if (document.getElementById('show-site-header-toggle')) document.getElementById('show-site-header-toggle').checked = !!state.appData.settings.showSiteHeader;
            if (document.getElementById('main-nav-placeholder')) {
                document.getElementById('main-nav-placeholder').style.display = state.appData.settings.showSiteHeader ? 'block' : 'none';
            }

            // Sync Fancy Speed
            if (state.appData.settings.fancySpeed) {
                document.documentElement.style.setProperty('--fancy-speed-mult', state.appData.settings.fancySpeed);
                if (document.getElementById('fancy-speed-select')) {
                    document.getElementById('fancy-speed-select').value = state.appData.settings.fancySpeed;
                }
            }

            // Init theme icon
            const icon = document.getElementById('theme-toggle').querySelector('i');
            if (state.appData.settings.theme === 'light') {
                icon.className = 'ph ph-sun';
            } else if (state.appData.settings.theme === 'oled') {
                icon.className = 'ph ph-circle';
            } else if (state.appData.settings.theme === 'fancy') {
                icon.className = 'ph ph-sparkle';
            } else {
                icon.className = 'ph ph-moon';
            }

            // Manage fancy theme orbs
            manageFancyOrbs(state.appData.settings.theme);

        } else {
            setDoc(userDocRef, {
                settings: state.appData.settings,
                projectTitle: state.appData.projectTitle,
                listOrder: []
            });
        }
        UI.renderBoard();

        // Splash logic removed

    }, (error) => API.handleSyncError(error)));

    // 1.5 Boards
    const boardsColRef = collection(db, "users", uid, "boards");
    state.listeners.push(onSnapshot(boardsColRef, { includeMetadataChanges: true }, (snapshot) => {
        state.hasPendingWrites = snapshot.metadata.hasPendingWrites;
        if (!snapshot.metadata.fromCache) updateLastSync();

        const boards = [];
        snapshot.forEach(doc => boards.push({ id: doc.id, ...doc.data() }));
        state.appData.boards = boards;

        // Migration logic: If user doc has listOrder but boards collection is empty
        if (boards.length === 0 && state.appData.listOrder.length > 0) {
            console.log("Migrating listOrder to default board...");
            const boardId = 'main_board';
            setDoc(doc(db, "users", uid, "boards", boardId), {
                title: "Main Board",
                listOrder: state.appData.listOrder,
                createdAt: Date.now()
            }).then(() => {
                API.switchBoard(boardId);
            });
        }

        // Initialize currentBoardId if not set
        if (!state.appData.currentBoardId && boards.length > 0) {
            const defaultBoardId = state.appData.settings.defaultBoardId;
            const lastBoard = localStorage.getItem(`lastBoard_${uid}`);

            // Priority: 1. Default Board Setting, 2. Last Used (LocalStorage), 3. First Board
            if (defaultBoardId && boards.find(b => b.id === defaultBoardId)) {
                state.appData.currentBoardId = defaultBoardId;
            } else if (lastBoard && boards.find(b => b.id === lastBoard)) {
                state.appData.currentBoardId = lastBoard;
            } else {
                state.appData.currentBoardId = boards[0].id;
            }
        }

        // Update active listOrder from current board
        const currentBoard = boards.find(b => b.id === state.appData.currentBoardId);
        if (currentBoard) {
            state.appData.listOrder = currentBoard.listOrder || [];
        }

        UI.renderBoard();
    }, (error) => API.handleSyncError(error)));

    // 2. Lists
    const listsColRefReal = collection(db, "users", uid, "lists");

    state.listeners.push(onSnapshot(listsColRefReal, { includeMetadataChanges: true }, (snapshot) => {
        state.hasPendingWrites = snapshot.metadata.hasPendingWrites;
        if (!snapshot.metadata.fromCache) updateLastSync();
        const lists = [];
        snapshot.forEach(doc => lists.push({ id: doc.id, ...doc.data() }));
        state.appData.rawLists = lists;
        UI.renderBoard();
    }, (error) => API.handleSyncError(error)));

    // 3. Tasks
    const tasksColRef = collection(db, "users", uid, "tasks");

    state.listeners.push(onSnapshot(tasksColRef, { includeMetadataChanges: true }, (snapshot) => {
        state.hasPendingWrites = snapshot.metadata.hasPendingWrites;
        if (!snapshot.metadata.fromCache) updateLastSync();
        state.appData.tasks = {};
        snapshot.forEach(doc => {
            state.appData.tasks[doc.id] = { id: doc.id, ...doc.data() };
        });
        UI.renderBoard();

        // Auto-refresh search if open
        if (!document.getElementById('search-modal-overlay').classList.contains('hidden')) {
            UI.performSearch(document.getElementById('search-input').value);
        }
    }, (error) => API.handleSyncError(error)));
}


// --- GLOBAL LISTENERS & INIT ---

document.addEventListener('DOMContentLoaded', () => {
    // Add List
    document.getElementById('add-list-btn').onclick = API.addNewList;

    // Mobile Reorder
    document.getElementById('mobile-reorder-lists-btn').onclick = () => {
        UI.openMobileReorderModal();
        document.getElementById('options-modal-overlay').classList.add('hidden');
    };
    document.getElementById('close-mobile-reorder-btn').onclick = () => document.getElementById('mobile-reorder-modal-overlay').classList.add('hidden');
    document.getElementById('save-mobile-reorder-btn').onclick = UI.saveMobileReorder;

    // Network Status Listeners
    window.addEventListener('online', UI.updateSyncUI);
    window.addEventListener('offline', UI.updateSyncUI);

    // Toggle Archive View
    document.getElementById('archive-mode-btn').onclick = function () {
        state.showArchived = !state.showArchived;
        const btn = this;

        // Close options modal if open
        const optionsModal = document.getElementById('options-modal-overlay');
        if (optionsModal) optionsModal.classList.add('hidden');

        if (state.showArchived) {
            btn.classList.add('active');
            Utils.showToast("Viewing Archived Tasks");
        } else {
            btn.classList.remove('active');
            Utils.showToast("Viewing Active Tasks");
        }
        UI.renderBoard();
    };

    // Toggle Compact View
    const compactBtn = document.getElementById('compact-view-btn');
    if (compactBtn) {
        // Init default state
        document.body.classList.toggle('compact-view', state.compactView);
        compactBtn.onclick = function () {
            state.compactView = !state.compactView;
            document.body.classList.toggle('compact-view', state.compactView);
            const icon = this.querySelector('i');
            if (state.compactView) {
                this.classList.add('active');
                icon.className = 'ph ph-arrows-out-simple';
                Utils.showToast("Compact View Enabled");
            } else {
                this.classList.remove('active');
                icon.className = 'ph ph-arrows-in-simple';
                Utils.showToast("Expanded View Enabled");
            }
            UI.renderBoard();
        };
    }

    // Toggle Recent Completed Filter
    const recentCompletedBtn = document.getElementById('recent-completed-btn');
    if (recentCompletedBtn) {
        recentCompletedBtn.onclick = function () {
            state.showRecentCompleted = !state.showRecentCompleted;
            const btn = this;

            if (state.showRecentCompleted) {
                btn.classList.add('active');
                Utils.showToast("Viewing Recent Completed Tasks");
            } else {
                btn.classList.remove('active');
                Utils.showToast("Viewing All Tasks");
            }
            UI.renderBoard();
        };
    }

    // Theme Toggle
    document.getElementById('theme-toggle').onclick = () => {
        let newTheme;
        if (state.appData.settings.theme === 'dark') newTheme = 'light';
        else if (state.appData.settings.theme === 'light') newTheme = 'oled';
        else if (state.appData.settings.theme === 'oled') newTheme = 'fancy';
        else newTheme = 'dark';
        API.updateSetting('theme', newTheme);
    };

    // Project Title
    if (projectTitleInput) projectTitleInput.onchange = () => {
        updateDoc(doc(db, "users", state.currentUser.uid), { projectTitle: projectTitleInput.value }).catch(e => API.handleSyncError(e));
    };

    // Settings Inputs
    setupSettingListener('auto-archive-toggle', 'autoArchive', true);
    setupSettingListener('show-numbers-toggle', 'showNumbers', true);
    setupSettingListener('drag-tasks-toggle', 'dragEnabled', true);
    setupSettingListener('sort-select', 'sortMode', false);
    setupSettingListener('fancy-speed-select', 'fancySpeed', false, (val) => {
        document.documentElement.style.setProperty('--fancy-speed-mult', val);
        return val;
    });

    const backupFreq = document.getElementById('backup-frequency-input');
    // Confirm Limit Button
    document.getElementById('confirm-backup-freq-btn').onclick = () => {
        let val = parseInt(backupFreq.value);
        if (val < 1) val = 1;
        API.updateSetting('backupFreq', val);
        Utils.showToast("Backup limit saved!");
    };
    // Keep implicit save too
    if (backupFreq) backupFreq.onchange = (e) => {
        let val = parseInt(e.target.value);
        if (val < 1) val = 1;
        API.updateSetting('backupFreq', val);
    };

    // Reset Count Button
    document.getElementById('reset-backup-count-btn').onclick = () => {
        showConfirmModal(
            "Reset Counter?",
            "Set 'Tasks Since Backup' to 0?",
            () => {
                API.updateSetting('tasksSinceBackup', 0);
                Utils.showToast("Counter reset.");
            }
        );
    };

    setupSettingListener('add-bottom-toggle', 'addTaskLocation', true, (checked) => checked ? 'bottom' : 'top');
    setupSettingListener('show-site-header-toggle', 'showSiteHeader', true, (checked) => {
        if (document.getElementById('main-nav-placeholder')) {
            document.getElementById('main-nav-placeholder').style.display = checked ? 'block' : 'none';
        }
        return checked;
    });

    // Drag Modes
    document.getElementById('mode-cut-btn').onclick = function () {
        state.dragMode = 'move';
        this.classList.add('active');
        document.getElementById('mode-copy-btn').classList.remove('active');
        UI.renderBoard();
    };
    document.getElementById('mode-copy-btn').onclick = function () {
        state.dragMode = 'copy';
        this.classList.add('active');
        document.getElementById('mode-cut-btn').classList.remove('active');
        UI.renderBoard();
    };

    // Options Modal
    const optionsModal = document.getElementById('options-modal-overlay');
    document.getElementById('options-btn').onclick = () => {
        UI.renderDefaultBoardSelect();
        optionsModal.classList.remove('hidden');
    };
    
    document.getElementById('export-board-csv-btn').onclick = () => {
        triggerCSVExport();
        optionsModal.classList.add('hidden');
    };

    document.getElementById('export-all-boards-csv-btn').onclick = () => {
        triggerAllBoardsCSVExport();
        optionsModal.classList.add('hidden');
    };

    document.getElementById('close-options-btn').onclick = () => optionsModal.classList.add('hidden');

    // Time Automation Help Modal
    const timeHelpModal = document.getElementById('time-automation-help-modal-overlay');
    if (timeHelpModal) {
        document.getElementById('time-automation-help-btn').onclick = () => {
            optionsModal.classList.add('hidden');
            timeHelpModal.classList.remove('hidden');
        };
        document.getElementById('close-time-help-btn').onclick = () => timeHelpModal.classList.remove('hidden');
        document.getElementById('close-time-help-btn-bottom').onclick = () => timeHelpModal.classList.remove('hidden');
    }

    // Automation Report Modal
    const automationReportModal = document.getElementById('automation-report-modal-overlay');
    if (automationReportModal) {
        document.getElementById('close-automation-report-btn').onclick = () => automationReportModal.classList.add('hidden');
        document.getElementById('automation-report-ok-btn').onclick = () => automationReportModal.classList.add('hidden');
    }

    // Recent Auto-Moved Modal Trigger
    const recentAutoMovedBtn = document.getElementById('recent-auto-moved-btn');
    if (recentAutoMovedBtn) {
        recentAutoMovedBtn.onclick = () => {
            optionsModal.classList.add('hidden');
            UI.showRecentAutoMovedTasks();
        };
    }

    // Default Board Select
    const defaultBoardSelect = document.getElementById('default-board-select');
    if (defaultBoardSelect) {
        defaultBoardSelect.onchange = (e) => {
            const val = e.target.value;
            API.updateSetting('defaultBoardId', val);
            Utils.showToast(val ? "Default board updated" : "Default board cleared (using last-used)");
        };
    }

    // Multi Edit
    const multiEditBtn = document.getElementById('multi-edit-btn');
    multiEditBtn.onclick = () => {
        state.multiEditMode = !state.multiEditMode;
        UI.toggleMultiEditUI();
    };
    // Global delegation for multi select
    boardContainer.addEventListener('click', (e) => {
        if (!state.multiEditMode) return;
        const card = e.target.closest('.task-card');
        if (!card) return;
        // Allow normal button/input interactions - don't interfere with onclick handlers
        // This is critical for touch devices where preventDefault() blocks button clicks
        if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT' || e.target.closest('.icon-btn')) {
            return; // Exit early to let the button's onclick handler work
        }
        const taskId = card.dataset.taskId;
        if (state.selectedTaskIds.has(taskId)) {
            state.selectedTaskIds.delete(taskId);
            card.classList.remove('selected');
        } else {
            state.selectedTaskIds.add(taskId);
            card.classList.add('selected');
        }
        UI.updateMultiFloatingBar();
    });

    // Multi Edit Modal Actions
    const multiEditModal = document.getElementById('multi-edit-modal-overlay');
    const multiMoveSelect = document.getElementById('multi-move-select');
    document.getElementById('multi-edit-action-btn').onclick = () => {
        // Open Modal
        UI.renderGroupedListSelect(multiMoveSelect, true);
        multiEditModal.classList.remove('hidden');
    };
    document.getElementById('multi-edit-close-modal-btn').onclick = () => multiEditModal.classList.add('hidden');
    document.getElementById('multi-close-btn').onclick = () => multiEditModal.classList.add('hidden');

    // Multi Color
    document.getElementById('multi-glow-color-options').addEventListener('click', (e) => {
        const btn = e.target.closest('.color-btn');
        if (!btn) return;
        const color = btn.dataset.color;
        const batch = writeBatch(db);
        state.selectedTaskIds.forEach(id => {
            batch.update(doc(db, "users", state.currentUser.uid, "tasks", id), { glowColor: color });
        });
        batch.commit().then(() => {
            Utils.showToast(`Updated color for ${state.selectedTaskIds.size} tasks`);
            multiEditModal.classList.add('hidden');
        }).catch(e => API.handleSyncError(e));
    });

    // Multi Delete
    document.getElementById('multi-delete-btn').onclick = () => {
        showConfirmModal(
            "Archive Selected?",
            `Are you sure you want to archive ${state.selectedTaskIds.size} tasks?`,
            () => {
                const batch = writeBatch(db);
                state.selectedTaskIds.forEach(id => {
                    batch.update(doc(db, "users", state.currentUser.uid, "tasks", id), { archived: true });
                });
                batch.commit().then(() => {
                    Utils.showToast("Tasks archived.");
                    multiEditModal.classList.add('hidden');
                    state.selectedTaskIds.clear();
                    UI.updateMultiFloatingBar();
                    state.multiEditMode = false;
                    UI.toggleMultiEditUI();
                }).catch(e => API.handleSyncError(e));
            },
            "ph-archive-box"
        );
    };

    // Multi Move/Link
    document.getElementById('multi-link-btn').onclick = () => handleBatchMoveCopy('copy');
    document.getElementById('multi-move-btn').onclick = () => handleBatchMoveCopy('move');

    async function handleBatchMoveCopy(mode) {
        const targetListId = multiMoveSelect.value;
        if (!targetListId) {
            alert("Please select a destination.");
            return;
        }
        let finalTargetId = targetListId;
        const batch = writeBatch(db);

        if (targetListId === 'NEW_LIST_CREATION') {
            finalTargetId = Utils.generateId();
            const newList = {
                title: `Batch List ${new Date().toLocaleTimeString()}`,
                taskIds: []
            };
            batch.set(doc(db, "users", state.currentUser.uid, "lists", finalTargetId), newList);
            batch.update(doc(db, "users", state.currentUser.uid), {
                listOrder: arrayUnion(finalTargetId)
            });
        }

        const idsArr = Array.from(state.selectedTaskIds);
        batch.update(doc(db, "users", state.currentUser.uid, "lists", finalTargetId), {
            taskIds: arrayUnion(...idsArr)
        });

        idsArr.forEach(taskId => {
            batch.update(doc(db, "users", state.currentUser.uid, "tasks", taskId), {
                [`listAddedAt.${finalTargetId}`]: Date.now(),
                lastAutoMovedAt: null
            });
        });

        if (mode === 'move') {
            state.appData.rawLists.forEach(list => {
                if (list.id === finalTargetId) return;
                const toRemove = list.taskIds ? list.taskIds.filter(id => state.selectedTaskIds.has(id)) : [];
                if (toRemove.length > 0) {
                    batch.update(doc(db, "users", state.currentUser.uid, "lists", list.id), {
                        taskIds: arrayRemove(...toRemove)
                    });
                }
            });
        }

        await batch.commit().then(() => {
            Utils.showToast(mode === 'move' ? 'Tasks moved successfully' : 'Tasks linked successfully');
            multiEditModal.classList.add('hidden');
            state.selectedTaskIds.clear();
            UI.updateMultiFloatingBar();
            state.multiEditMode = false;
            UI.toggleMultiEditUI();
        }).catch(e => API.handleSyncError(e));
    }

    // Modal Edit Save
    document.getElementById('modal-save-btn').onclick = () => {
        const modalOverlay = document.getElementById('modal-overlay');
        const taskId = modalOverlay.dataset.taskId;
        const text = document.getElementById('modal-task-input').value;
        const nestedContainer = document.getElementById('nested-ideas-editor-container');
        const nestedIdeas = nestedContainer ? UI.serializeNestedEditorList(nestedContainer) : [];
        updateDoc(doc(db, "users", state.currentUser.uid, "tasks", taskId), {
            text: text,
            nestedIdeas: nestedIdeas,
            updatedAt: Date.now(),
            lastAutoMovedAt: null
        }).catch(e => API.handleSyncError(e));
        modalOverlay.classList.add('hidden');
    };

    document.getElementById('add-nested-idea-btn').onclick = () => {
        const container = document.getElementById('nested-ideas-editor-container');
        if (container) {
            container.appendChild(UI.createNestedIdeaEditorItem({ text: '', nestedIdeas: [] }));
        }
    };

    document.getElementById('bulk-add-nested-btn').onclick = () => {
        const bulkModal = document.getElementById('bulk-add-modal-overlay');
        bulkModal.dataset.mode = 'nested';
        bulkModal.dataset.returnToEdit = 'true'; // Flag to return to edit modal
        
        // Hide the edit modal first
        document.getElementById('modal-overlay').classList.add('hidden');
        
        bulkModal.classList.remove('hidden');
        document.getElementById('bulk-add-input').focus();
    };

    document.getElementById('modal-close-btn').onclick = () => document.getElementById('modal-overlay').classList.add('hidden');

    // Manual Move/Link (Single)
    document.getElementById('manual-move-btn').onclick = () => {
        const modalOverlay = document.getElementById('modal-overlay');
        const taskId = modalOverlay.dataset.taskId;
        const targetListId = document.getElementById('manual-move-select').value;
        if (!targetListId) {
            Utils.showToast("Please select a destination list.");
            return;
        }

        const batch = writeBatch(db);
        state.appData.rawLists.forEach(list => {
            if (list.taskIds && list.taskIds.includes(taskId)) {
                batch.update(doc(db, "users", state.currentUser.uid, "lists", list.id), {
                    taskIds: arrayRemove(taskId)
                });
            }
        });
        batch.update(doc(db, "users", state.currentUser.uid, "lists", targetListId), {
            taskIds: arrayUnion(taskId)
        });
        batch.update(doc(db, "users", state.currentUser.uid, "tasks", taskId), {
            archived: false,
            [`listAddedAt.${targetListId}`]: Date.now(),
            lastAutoMovedAt: null
        });

        batch.commit().then(() => {
            Utils.showToast("Task moved successfully.");
            modalOverlay.classList.add('hidden');
        }).catch(e => API.handleSyncError(e));
    };

    document.getElementById('manual-link-btn').onclick = () => {
        const modalOverlay = document.getElementById('modal-overlay');
        const taskId = modalOverlay.dataset.taskId;
        const targetListId = document.getElementById('manual-move-select').value;
        if (!targetListId) {
            Utils.showToast("Please select a destination list.");
            return;
        }
        const targetList = state.appData.rawLists.find(l => l.id === targetListId);
        if (targetList && targetList.taskIds && targetList.taskIds.includes(taskId)) {
            Utils.showToast(`${getTerm(true, true)} is already in that list.`);
            return;
        }
        const batch = writeBatch(db);
        batch.update(doc(db, "users", state.currentUser.uid, "lists", targetListId), {
            taskIds: arrayUnion(taskId)
        });
        batch.update(doc(db, "users", state.currentUser.uid, "tasks", taskId), {
            archived: false,
            [`listAddedAt.${targetListId}`]: Date.now(),
            lastAutoMovedAt: null
        });

        batch.commit().then(() => {
            Utils.showToast(`${getTerm(true, true)} linked successfully.`);
            UI.renderCurrentLocations(taskId);
        }).catch(e => API.handleSyncError(e));
    };

    // Bulk Add
    document.getElementById('bulk-add-close-btn').onclick = () => {
        const bulkModal = document.getElementById('bulk-add-modal-overlay');
        bulkModal.classList.add('hidden');
        
        // If we came from the edit modal, go back to it
        if (bulkModal.dataset.returnToEdit === 'true') {
            document.getElementById('modal-overlay').classList.remove('hidden');
            bulkModal.dataset.returnToEdit = 'false';
        }
    };
    document.getElementById('bulk-add-confirm-btn').onclick = () => {
        const bulkModal = document.getElementById('bulk-add-modal-overlay');
        const mode = bulkModal.dataset.mode || 'list';
        const text = document.getElementById('bulk-add-input').value;
        const items = Utils.parseNestedMarkdown(text);
        if (items.length === 0) return;

        if (mode === 'list') {
            const listId = bulkModal.dataset.listId;
            const batch = writeBatch(db);
            const listRef = doc(db, "users", state.currentUser.uid, "lists", listId);

            items.forEach(item => {
                const newId = Utils.generateId();
                const newTask = {
                    text: item.text,
                    nestedIdeas: item.nestedIdeas || [],
                    completed: false,
                    archived: false,
                    createdAt: Date.now(),
                    images: [],
                    glowColor: 'none',
                    listAddedAt: { [listId]: Date.now() }
                };
                batch.set(doc(db, "users", state.currentUser.uid, "tasks", newId), newTask);
                batch.update(listRef, { taskIds: arrayUnion(newId) });
            });
            batch.commit().then(() => {
                Utils.showToast("Bulk tasks added successfully", "success");
            }).catch(e => API.handleSyncError(e));
        } else if (mode === 'nested') {
            const container = document.getElementById('nested-ideas-editor-container');
            if (container) {
                UI.renderNestedEditorList(container, items);
                Utils.showToast("Bulk nested ideas added to editor", "success");
            }
        }

        bulkModal.classList.add('hidden');
        document.getElementById('bulk-add-input').value = '';
        
        // If we came from the edit modal, go back to it
        if (bulkModal.dataset.returnToEdit === 'true') {
            document.getElementById('modal-overlay').classList.remove('hidden');
            bulkModal.dataset.returnToEdit = 'false';
        }
    };

    // Search
    const searchModal = document.getElementById('search-modal-overlay');
    const searchInput = document.getElementById('search-input');

    // List Search - Correct Implementation
    const searchListModal = document.getElementById('search-list-modal-overlay');
    const searchListInput = document.getElementById('search-list-input');

    document.getElementById('search-list-btn').onclick = () => {
        searchListModal.classList.remove('hidden');
        searchListInput.value = state.listSearchTerm || '';
        searchListInput.focus();
    };

    document.getElementById('close-search-list-btn').onclick = () => {
        searchListModal.classList.add('hidden');
    };

    document.getElementById('view-reordered-btn').onclick = () => searchListModal.classList.add('hidden');

    document.getElementById('clear-list-search-btn').onclick = () => {
        state.listSearchTerm = "";
        searchListInput.value = "";
        UI.renderBoard();
        searchListModal.classList.add('hidden');
    };

    searchListInput.oninput = (e) => {
        state.listSearchTerm = e.target.value.trim();
        UI.renderBoard();
    };

    document.getElementById('search-show-archived-toggle').onchange = (e) => {
        state.searchShowArchived = e.target.checked;
        UI.performSearch(searchInput.value);
    };
    document.getElementById('search-btn').onclick = () => {
        searchModal.classList.remove('hidden');
        searchInput.focus();
        UI.performSearch(searchInput.value);
    };
    document.getElementById('close-search-btn').onclick = () => searchModal.classList.add('hidden');

    let searchTimeout;
    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            UI.performSearch(e.target.value);
        }, 300);
    });

    // Hidden Image Input
    document.getElementById('hidden-image-input').onchange = function (e) {
        const file = e.target.files[0];
        const taskId = this.dataset.taskId;
        if (!file || !taskId) return;

        const reader = new FileReader();
        reader.onload = function (evt) {
            const img = new Image();
            img.src = evt.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 600;
                const scaleSize = MAX_WIDTH / img.width;
                canvas.width = MAX_WIDTH;
                canvas.height = img.height * scaleSize;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.7);

                updateDoc(doc(db, "users", state.currentUser.uid, "tasks", taskId), {
                    images: arrayUnion(dataUrl)
                }).catch(e => API.handleSyncError(e));
            }
        };
        reader.readAsDataURL(file);
        this.value = '';
    };

    document.getElementById('image-modal-close').onclick = () => document.getElementById('image-modal-overlay').classList.add('hidden');

    // JSON Import/Export & Reset Logic (Shortened for brevity, but needed)
    // I should probably copy the JSON/Backup logic to utils or API if it gets too long, but main is ok.
    // JSON Import/Export & Reset Logic
    const uploadInput = document.getElementById('upload-json');
    if (uploadInput) {
        uploadInput.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async (evt) => {
                try {
                    const data = JSON.parse(evt.target.result);
                    // Get counts
                    const listCount = (data.lists && Array.isArray(data.lists)) ? data.lists.length : 0;
                    const taskCount = (data.tasks && Array.isArray(data.tasks)) ? data.tasks.length : (data.tasks ? Object.keys(data.tasks).length : 0);

                    showConfirmModal(
                        "Restore from backup?",
                        `Restore ${listCount} lists and ${taskCount} ${taskCount === 1 ? getTerm(true) : getTerm(false)}?\nThis will Add/Update your existing data.`,
                        () => restoreBackup(data)
                    );
                } catch (err) {
                    console.error("Backup Parse Error:", err);
                    Utils.showToast(`Invalid Backup File: ${err.message}`);
                    e.target.value = ''; // Reset input
                    return;
                }
                e.target.value = ''; // Reset input
            };
            reader.readAsText(file);
        };
    }
    document.getElementById('download-json-btn').onclick = () => triggerBackupDownload();

    // Todoist Import
    document.getElementById('import-todoist-csv').onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (evt) => {
            const rows = Utils.parseTodoistCSV(evt.target.result);
            // Process logic... implies API call to create multiple lists.
            // I'll skip implementing full complex Todoist logic again unless strictly requested, but user said "mixes... business logic".
            // The logic was in app.js. I should probably move the `processTodoistCSV` logic fully to API or Utils.
            // I put parse in Utils.
            // I will implement the batch creation here or in API.
            // Let's assume we alert for now or implement simply.
            // Actually, I should check if I missed moving it.
            // I missed the bulk import logic in API.js. I'll add a helper here.
            await importTodoistData(rows);
            e.target.value = '';
            optionsModal.classList.add('hidden');
        };
        reader.readAsText(file);
    };


    // Backup Modal
    const backupLaterBtn = document.getElementById('backup-later-btn');
    if (backupLaterBtn) backupLaterBtn.onclick = () => {
        document.getElementById('backup-modal-overlay').classList.add('hidden');
        API.updateSetting('tasksSinceBackup', 0);
    };
    const backupNowBtn = document.getElementById('backup-now-btn');
    if (backupNowBtn) backupNowBtn.onclick = () => {
        triggerBackupDownload();
        document.getElementById('backup-modal-overlay').classList.add('hidden');
        API.updateSetting('tasksSinceBackup', 0); // triggerBackupDownload does this too, but safe to ensure UI close logic
    };

    // Backup REMINDER Modal (The small popup)
    const reminderDownloadBtn = document.getElementById('reminder-download-btn');
    if (reminderDownloadBtn) reminderDownloadBtn.onclick = () => {
        triggerBackupDownload();
        document.getElementById('backup-reminder-modal-overlay').classList.add('hidden');
    };

    const reminderSkipBtn = document.getElementById('reminder-skip-btn');
    if (reminderSkipBtn) reminderSkipBtn.onclick = () => {
        API.updateSetting('tasksSinceBackup', 0);
        document.getElementById('backup-reminder-modal-overlay').classList.add('hidden');
    };

    // Archived Task Modal Listeners
    const archivedModal = document.getElementById('archived-task-modal-overlay');
    if (archivedModal) {
        document.getElementById('archived-cancel-btn').onclick = () => {
            archivedModal.classList.add('hidden');
        };
        document.getElementById('archived-unarchive-btn').onclick = () => {
            const taskId = archivedModal.dataset.taskId;
            if (taskId) {
                API.unarchiveTask(taskId);
                archivedModal.classList.add('hidden');
                Utils.showToast(`${getTerm(true, true)} unarchived`);
            }
        };
        document.getElementById('archived-delete-btn').onclick = () => {
            const taskId = archivedModal.dataset.taskId;
            if (taskId) {
                showConfirmModal(
                    "Delete Forever?",
                    "This task will be permanently removed. This action cannot be undone.",
                    () => {
                        API.deleteTaskForever(taskId);
                        archivedModal.classList.add('hidden');
                    },
                    "ph-trash"
                );
            }
        };
        // Close on clicking outside content
        archivedModal.onclick = (e) => {
            if (e.target === archivedModal) archivedModal.classList.add('hidden');
        }
    }

    // Edit List Modal Close
    const editListModal = document.getElementById('edit-list-modal-overlay');
    if (editListModal) {
        document.getElementById('close-edit-list-modal-btn').onclick = () => editListModal.classList.add('hidden');
        document.getElementById('edit-list-close-btn').onclick = () => editListModal.classList.add('hidden');
        editListModal.onclick = (e) => {
            if (e.target === editListModal) editListModal.classList.add('hidden');
        };
    }

});

function showConfirmModal(title, desc, onConfirm, iconClass = 'ph-warning-circle') {
    const modal = document.getElementById('confirm-modal-overlay');
    const titleEl = document.getElementById('confirm-title');
    const descEl = document.getElementById('confirm-desc');
    const yesBtn = document.getElementById('confirm-yes-btn');
    const cancelBtn = document.getElementById('confirm-cancel-btn');
    const iconEl = modal.querySelector('.confirm-icon-area i');

    if (iconEl) {
        iconEl.className = `ph ${iconClass}`;
    }

    titleEl.textContent = title;
    descEl.textContent = desc;
    modal.classList.remove('hidden');

    // Remove old listeners to prevent stacking
    const newYes = yesBtn.cloneNode(true);
    yesBtn.parentNode.replaceChild(newYes, yesBtn);

    const newCancel = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);

    newYes.onclick = () => {
        onConfirm();
        modal.classList.add('hidden');
    };

    newCancel.onclick = () => {
        modal.classList.add('hidden');
    };
}
function setupSettingListener(id, settingKey, isCheckbox, processVal) {
    const el = document.getElementById(id);
    if (!el) return;
    el.onchange = (e) => {
        let val = isCheckbox ? e.target.checked : e.target.value;
        if (processVal) val = processVal(val);
        API.updateSetting(settingKey, val);
    };
}

function triggerBackupDownload() {
    // Generate JSON backup data
    // Map tasks to ensure clean structure (glowColor, images, etc)
    const backupData = {
        exportDate: new Date().toISOString(),
        projectTitle: state.appData.projectTitle,
        settings: state.appData.settings,
        listOrder: state.appData.listOrder,
        lists: state.appData.rawLists.map(list => ({
            id: list.id,
            title: list.title,
            taskIds: list.taskIds || []
        })),
        tasks: Object.entries(state.appData.tasks).map(([id, task]) => ({
            id: id,
            text: task.text,
            completed: task.completed,
            archived: task.archived,
            createdAt: task.createdAt,
            glowColor: task.glowColor || 'none',
            images: task.images || []
        }))
    };

    const jsonStr = JSON.stringify(backupData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    // Format Date: YYYY-MM-DD_HH-mm
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-').slice(0, 5);

    // Sanitize Project Title
    const safeTitle = (state.appData.projectTitle || getTerm(false, true)).replace(/[^a-z0-9]/gi, '_').toLowerCase();

    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeTitle}_backup_${dateStr}_${timeStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // Reset Reminder Count
    if (state.currentUser) {
        API.updateSetting('tasksSinceBackup', 0);
    }
}

async function triggerCSVExport() {
    const board = state.appData.boards.find(b => b.id === state.appData.currentBoardId);
    if (!board) return Utils.showToast("No board selected for export");

    const data = generateBoardGridData(board);
    if (!data) return Utils.showToast("Board has no lists to export");

    Utils.showToast("Generating CSV...", "info");

    const csvLines = assembleCSVLines([ { boardTitle: board.title, ...data } ]);
    downloadCSV(csvLines.join("\n"), `${(window.APP_CONFIG?.appName || "Task-Master").replace(/\s+/g, '-')}-Export`);
}

async function triggerAllBoardsCSVExport() {
    const allBoards = state.appData.boards || [];
    if (allBoards.length === 0) return Utils.showToast("No boards found to export");

    Utils.showToast("Generating Global CSV...", "info");

    const exportData = allBoards.map(board => {
        const gridData = generateBoardGridData(board);
        return gridData ? { boardTitle: board.title, ...gridData } : null;
    }).filter(Boolean);

    if (exportData.length === 0) return Utils.showToast("No boards with data to export");

    const csvLines = assembleCSVLines(exportData);
    downloadCSV(csvLines.join("\n"), `${(window.APP_CONFIG?.appName || "Task-Master").replace(/\s+/g, '-')}-Full-Project-Export`);
}

function generateBoardGridData(board) {
    const lists = board.listOrder.map(lid => state.appData.rawLists.find(l => l.id === lid)).filter(Boolean);
    if (lists.length === 0) return null;

    const csvGrid = [];
    const headers = [];
    let currentColumnOffset = 0;

    lists.forEach(list => {
        const listTasks = (list.taskIds || []).map(id => state.appData.tasks[id]).filter(Boolean);
        if (listTasks.length === 0) {
            headers[currentColumnOffset] = list.title;
            currentColumnOffset++;
            return;
        }

        let listDepth = 0;
        const findMaxDepth = (task, depth) => {
            listDepth = Math.max(listDepth, depth);
            if (task.nestedIdeas) task.nestedIdeas.forEach(sub => findMaxDepth(sub, depth + 1));
        };
        listTasks.forEach(t => findMaxDepth(t, 0));

        headers[currentColumnOffset] = list.title;
        for (let i = 1; i <= listDepth; i++) {
            headers[currentColumnOffset + i] = `${list.title} > Level ${i}`;
        }

        const rowsForList = [];
        const flattenToRows = (node, depth, currentRow) => {
            const myRow = [...currentRow];
            
            let statusPrefix = "";
            if (node.archived) statusPrefix += "[ARCHIVED] ";
            if (node.completed) statusPrefix += "[DONE] ";
            
            myRow[depth] = statusPrefix + (node.text || "");
            
            if (node.nestedIdeas && node.nestedIdeas.length > 0) {
                node.nestedIdeas.forEach(child => flattenToRows(child, depth + 1, myRow));
            } else {
                rowsForList.push(myRow);
            }
        };

        listTasks.forEach(t => flattenToRows(t, 0, new Array(listDepth + 1).fill("")));

        rowsForList.forEach((r, idx) => {
            if (!csvGrid[idx]) csvGrid[idx] = [];
            for (let c = 0; c < r.length; c++) {
                csvGrid[idx][currentColumnOffset + c] = r[c];
            }
        });

        currentColumnOffset += (listDepth + 1);
    });

    return { headers, csvGrid };
}

function assembleCSVLines(boardDataArray) {
    const allLines = [];
    const escapeCSV = (val) => {
        if (!val) return '""';
        const str = String(val).replace(/"/g, '""');
        return `"${str}"`;
    };

    boardDataArray.forEach((data, index) => {
        if (index > 0) allLines.push(""); // Spacing between boards
        
        // Board Separator Row
        allLines.push(escapeCSV(`### BOARD: ${data.boardTitle} ###`));
        
        // Headers
        allLines.push(data.headers.map(h => escapeCSV(h)).join(","));

        // Data Rows
        data.csvGrid.forEach(gridRow => {
            const row = [];
            for (let i = 0; i < data.headers.length; i++) {
                row.push(escapeCSV(gridRow[i]));
            }
            allLines.push(row.join(","));
        });
    });

    return allLines;
}

function downloadCSV(csvContent, baseFilename) {
    const finalContent = "\uFEFF" + csvContent; // BOM for UTF-8
    const blob = new Blob([finalContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const timestamp = new Date().toISOString().split('T')[0];
    
    link.href = url;
    link.download = `${baseFilename}-${timestamp}.csv`;
    link.click();
    
    setTimeout(() => URL.revokeObjectURL(url), 100);
    Utils.showToast("CSV Export downloaded!", "success");
}

async function restoreBackup(data) {
    Utils.showToast("Restoring Backup...");

    if (!data || typeof data !== 'object') {
        Utils.showToast("Error: Restore data is empty or invalid.");
        console.error("Restore Error: Data is not an object", data);
        return;
    }

    try {
        const batch = writeBatch(db);
        const userRef = doc(db, "users", state.currentUser.uid);

        // 1. Restore Settings & Project Title
        batch.set(userRef, {
            projectTitle: data.projectTitle || "My Project",
            settings: data.settings || {},
            listOrder: data.listOrder || []
        }, { merge: true });

        // 2. Restore Lists
        const restoredListIds = [];
        if (data.lists && Array.isArray(data.lists)) {
            data.lists.forEach(l => {
                const listRef = doc(db, "users", state.currentUser.uid, "lists", l.id);
                if (!l.id) console.warn("Skipping list without ID in restore:", l);
                else {
                    batch.set(listRef, l);
                    restoredListIds.push(l.id);
                }
            });
        }

        // 2.5 Assign to Main Board (New Boards Architecture)
        const mainBoardId = 'main_board';
        batch.set(doc(db, "users", state.currentUser.uid, "boards", mainBoardId), {
            title: "Main Board",
            listOrder: arrayUnion(...restoredListIds),
            createdAt: Date.now()
        }, { merge: true });

        // 3. Restore Tasks
        // Handle both Object (legacy) and Array (new robust) formats
        if (data.tasks) {
            if (Array.isArray(data.tasks)) {
                data.tasks.forEach(task => {
                    if (task && task.id) {
                        batch.set(doc(db, "users", state.currentUser.uid, "tasks", task.id), task);
                    } else {
                        console.warn("Skipping invalid task in restore (array format):", task);
                    }
                });
            } else if (typeof data.tasks === 'object') {
                // Legacy Object format
                Object.keys(data.tasks).forEach(tid => {
                    const t = data.tasks[tid];
                    if (t) {
                        batch.set(doc(db, "users", state.currentUser.uid, "tasks", tid), t);
                    }
                });
            } else {
                console.warn("Restore: 'tasks' field has unknown type:", typeof data.tasks);
            }
        } else {
            console.warn("Restore: No 'tasks' field found in backup.");
        }

        await batch.commit();
        Utils.showToast("Backup Restored Successfully!");
        setTimeout(() => location.reload(), 1500);

    } catch (e) {
        console.error("Critical Restore Error:", e);
        if (e.code === 'permission-denied') {
            Utils.showToast("Restore Failed: Permission Denied. You may be offline or logged out.");
        } else if (e.code === 'resource-exhausted') {
            Utils.showToast("Restore Failed: Quota Exceeded.");
        } else {
            Utils.showToast(`Restore Failed: ${e.message}`);
        }
    }
}

async function importTodoistData(rows) {
    if (!rows || rows.length === 0) return;
    Utils.showToast("Importing Todoist Data...");

    const batch = writeBatch(db);
    const importedListIds = [];

    // Group tasks by project (list)
    const listsMap = {};
    rows.forEach(row => {
        const projectName = row.Project || "Todoist Import";
        if (!listsMap[projectName]) listsMap[projectName] = [];
        listsMap[projectName].push(row);
    });

    for (const [title, tasks] of Object.entries(listsMap)) {
        const listId = Utils.generateId();
        importedListIds.push(listId);

        const taskIds = [];
        tasks.forEach(t => {
            const taskId = Utils.generateId();
            taskIds.push(taskId);
            batch.set(doc(db, "users", state.currentUser.uid, "tasks", taskId), {
                text: t.Content || "Untitled Task",
                completed: false,
                archived: false,
                createdAt: Date.now(),
                images: [],
                glowColor: 'none'
            });
        });

        batch.set(doc(db, "users", state.currentUser.uid, "lists", listId), {
            title: title,
            taskIds: taskIds
        });
    }

    // Assign to Main Board
    const mainBoardId = 'main_board';
    batch.set(doc(db, "users", state.currentUser.uid, "boards", mainBoardId), {
        title: "Main Board",
        listOrder: arrayUnion(...importedListIds),
        createdAt: Date.now()
    }, { merge: true });

    await batch.commit();
    Utils.showToast(`Imported ${importedListIds.length} lists from Todoist!`);
    if (state.appData.currentBoardId !== mainBoardId) {
        API.switchBoard(mainBoardId);
    }
}

// Re-implement Reset Slider Logic if crucial, else basic button
// Original had a complex slider.
document.getElementById('trigger-reset-btn').onclick = () => {
    document.getElementById('options-modal-overlay').classList.add('hidden');
    document.getElementById('reset-modal-overlay').classList.remove('hidden');
};
document.getElementById('reset-cancel-btn').onclick = () => document.getElementById('reset-modal-overlay').classList.add('hidden');
document.getElementById('reset-download-backup-btn').onclick = () => {
    triggerBackupDownload();
    // unlock slider logic
    document.getElementById('slider-container').classList.remove('disabled');
};
// Attach slider events
const sliderContainer = document.getElementById('slider-container');
const sliderHandle = document.getElementById('slider-handle');
const sliderTrack = document.getElementById('slider-track');
let isDragging = false;
let startX = 0;

sliderHandle.addEventListener('mousedown', startDrag);
sliderHandle.addEventListener('touchstart', startDrag);

function startDrag(e) {
    if (sliderContainer.classList.contains('disabled')) return;
    isDragging = true;
    startX = (e.pageX || e.touches[0].pageX) - sliderHandle.offsetLeft;
    document.addEventListener('mousemove', moveDrag);
    document.addEventListener('touchmove', moveDrag);
    document.addEventListener('mouseup', endDrag);
    document.addEventListener('touchend', endDrag);
}

function moveDrag(e) {
    if (!isDragging) return;
    let x = (e.pageX || e.touches[0].pageX) - startX;
    let max = sliderContainer.offsetWidth - sliderHandle.offsetWidth;

    if (x < 0) x = 0;
    if (x > max) x = max;

    sliderHandle.style.left = x + 'px';

    // Visual feedback opacity
    sliderTrack.style.opacity = 1 - (x / max);

    // Check if completed
    if (x >= max - 5) {
        isDragging = false;
        endDrag();
        performAppReset();
    }
}

function endDrag() {
    if (!isDragging) {
        document.removeEventListener('mousemove', moveDrag);
        document.removeEventListener('touchmove', moveDrag);
        document.removeEventListener('mouseup', endDrag);
        document.removeEventListener('touchend', endDrag);

        // Snap back if not complete
        if (parseInt(sliderHandle.style.left) < (sliderContainer.offsetWidth - sliderHandle.offsetWidth - 10)) {
            sliderHandle.style.left = '0px';
            sliderTrack.style.opacity = '1';
        }
    }
}

async function performAppReset() {
    // Delete all
    const batch = writeBatch(db);
    // ... logic
    state.appData.rawLists.forEach(l => batch.delete(doc(db, "users", state.currentUser.uid, "lists", l.id)));
    Object.keys(state.appData.tasks).forEach(tid => batch.delete(doc(db, "users", state.currentUser.uid, "tasks", tid)));
    batch.delete(doc(db, "users", state.currentUser.uid)); // reset settings
    await batch.commit();
    Utils.showToast("Reset Complete");
    document.getElementById('reset-modal-overlay').classList.add('hidden');
    location.reload();
}

// --- BULK DELETE FOREVER (ARCHIVED) ---
const bulkDeleteModal = document.getElementById('bulk-delete-modal-overlay');
const bulkDeleteSliderContainer = document.getElementById('bulk-delete-slider-container');
const bulkDeleteSliderHandle = document.getElementById('bulk-delete-slider-handle');
const bulkDeleteSliderTrack = document.getElementById('bulk-delete-slider-track');
let isBulkDeleteDragging = false;
let bulkDeleteStartX = 0;

document.getElementById('multi-delete-forever-btn').onclick = () => {
    if (state.selectedTaskIds.size === 0) return;
    bulkDeleteModal.classList.remove('hidden');
};

document.getElementById('bulk-delete-cancel-btn').onclick = () => {
    bulkDeleteModal.classList.add('hidden');
    resetBulkDeleteSlider();
};

function resetBulkDeleteSlider() {
    bulkDeleteSliderHandle.style.left = '0px';
    bulkDeleteSliderTrack.style.opacity = '1';
}

bulkDeleteSliderHandle.addEventListener('mousedown', startBulkDeleteDrag);
bulkDeleteSliderHandle.addEventListener('touchstart', startBulkDeleteDrag);

function startBulkDeleteDrag(e) {
    isBulkDeleteDragging = true;
    bulkDeleteStartX = (e.pageX || e.touches[0].pageX) - bulkDeleteSliderHandle.offsetLeft;
    document.addEventListener('mousemove', moveBulkDeleteDrag);
    document.addEventListener('touchmove', moveBulkDeleteDrag);
    document.addEventListener('mouseup', endBulkDeleteDrag);
    document.addEventListener('touchend', endBulkDeleteDrag);
}

function moveBulkDeleteDrag(e) {
    if (!isBulkDeleteDragging) return;
    let x = (e.pageX || e.touches[0].pageX) - bulkDeleteStartX;
    let max = bulkDeleteSliderContainer.offsetWidth - bulkDeleteSliderHandle.offsetWidth;

    if (x < 0) x = 0;
    if (x > max) x = max;

    bulkDeleteSliderHandle.style.left = x + 'px';
    bulkDeleteSliderTrack.style.opacity = 1 - (x / max);

    if (x >= max - 5) {
        isBulkDeleteDragging = false;
        endBulkDeleteDrag();
        performBulkDeleteForever();
    }
}

function endBulkDeleteDrag() {
    if (isBulkDeleteDragging) {
        isBulkDeleteDragging = false;
        document.removeEventListener('mousemove', moveBulkDeleteDrag);
        document.removeEventListener('touchmove', moveBulkDeleteDrag);
        document.removeEventListener('mouseup', endBulkDeleteDrag);
        document.removeEventListener('touchend', endBulkDeleteDrag);

        // Snap back
        resetBulkDeleteSlider();
    } else {
        document.removeEventListener('mousemove', moveBulkDeleteDrag);
        document.removeEventListener('touchmove', moveBulkDeleteDrag);
        document.removeEventListener('mouseup', endBulkDeleteDrag);
        document.removeEventListener('touchend', endBulkDeleteDrag);
    }
}

async function performBulkDeleteForever() {
    const ids = Array.from(state.selectedTaskIds);
    if (ids.length === 0) return;

    const batch = writeBatch(db);
    const uid = state.currentUser.uid;

    ids.forEach(taskId => {
        // Delete Task Doc
        batch.delete(doc(db, "users", uid, "tasks", taskId));
        
        // Remove from all lists
        state.appData.rawLists.forEach(list => {
            if (list.taskIds && list.taskIds.includes(taskId)) {
                batch.update(doc(db, "users", uid, "lists", list.id), {
                    taskIds: arrayRemove(taskId)
                });
            }
        });
    });

    try {
        await batch.commit();
        Utils.showToast(`Permanently deleted ${ids.length} tasks.`);
        state.selectedTaskIds.clear();
        state.multiEditMode = false;
        UI.toggleMultiEditUI();
        bulkDeleteModal.classList.add('hidden');
        resetBulkDeleteSlider();
    } catch (e) {
        API.handleSyncError(e);
    }
}

// --- GLOBAL KEYBOARD SHORTCUTS ---
window.addEventListener('keydown', (e) => {
    // 1. Esc to close all modals
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay:not(.hidden)').forEach(modal => {
            modal.classList.add('hidden');
        });
    }
    // 2. Cmd/Ctrl + K for search
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        const searchBtn = document.getElementById('search-btn');
        if (searchBtn) searchBtn.click();
    }
});

// --- NESTED MULTI-SELECT HANDLERS ---
window.toggleNestedMultiSelect = UI.toggleNestedMultiSelect;
window.handleNestedAction = UI.handleNestedAction;

document.getElementById('toggle-nested-multi-btn').onclick = window.toggleNestedMultiSelect;
document.getElementById('nested-delete-btn').onclick = () => window.handleNestedAction('delete');
document.getElementById('nested-indent-btn').onclick = () => window.handleNestedAction('indent');
document.getElementById('nested-outdent-btn').onclick = () => window.handleNestedAction('outdent');

// --- LIST DESCRIPTION HANDLER ---
document.getElementById('edit-list-save-desc-btn').onclick = () => {
    const modal = document.getElementById('edit-list-modal-overlay');
    const listId = modal.dataset.listId;
    const desc = document.getElementById('edit-list-description-input').value.trim();
    
    if (listId) {
        API.updateListDescription(listId, desc).then(() => {
            Utils.showToast("List info updated", "success");
        });
    }
};
