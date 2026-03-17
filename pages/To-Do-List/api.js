import { db } from './firebase-config.js';
import { doc, updateDoc, writeBatch, arrayUnion, arrayRemove, deleteDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { state } from './store.js';
import { generateId, showToast } from './utils.js';

// --- API ACTIONS ---

export function handleSyncError(error) {
    console.error("Sync Error:", error);
    state.lastSyncError = error;
    // updateSyncUI() will be called by UI loop or manually
    // We might need to export an event or callback for UI updates from API errors if strict separation is improved.
    // For now, UI module typically observes state or we let main.js handle UI sync updates.
    // But direct UI calls from here might violate strict layering if we want API to be pure.
    // However, existing app acts this way. We will try to keep it cleaner.
}

// --- ACTIONS ---

export function handleAddTask(e, listId) {
    e.preventDefault();
    const input = e.target.elements.taskText;
    const text = input.value.trim();
    if (!text) return;

    if (!state.currentUser) return;

    const newId = 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    const newTask = {
        text: text,
        completed: false,
        archived: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        images: [],
        glowColor: 'none'
    };

    const batch = writeBatch(db);
    batch.set(doc(db, "users", state.currentUser.uid, "tasks", newId), newTask);

    const isBottom = state.appData.settings.addTaskLocation === 'bottom';

    if (isBottom) {
        batch.update(doc(db, "users", state.currentUser.uid, "lists", listId), {
            taskIds: arrayUnion(newId)
        });
    } else {
        // Add to top -> Prepend
        const listObj = state.appData.rawLists.find(l => l.id === listId);
        let validIds = [];
        if (listObj && listObj.taskIds) validIds = [...listObj.taskIds];

        validIds.unshift(newId);

        batch.update(doc(db, "users", state.currentUser.uid, "lists", listId), {
            taskIds: validIds
        });
    }

    // Backup Reminder Logic
    const currentCount = state.appData.settings.tasksSinceBackup || 0;
    const newCount = currentCount + 1;
    batch.update(doc(db, "users", state.currentUser.uid), { "settings.tasksSinceBackup": newCount });

    // Note: Validation for backup popup logic is now in UI or Main, checking state.
    // API just updates the data.

    return batch.commit().then(() => {
        input.value = '';
        input.focus();
        return newCount; // Return new count for UI to decide on popup
    }).catch(e => handleSyncError(e));
}

export function archiveTask(taskId) {
    return updateDoc(doc(db, "users", state.currentUser.uid, "tasks", taskId), { archived: true })
        .catch(e => handleSyncError(e));
}

export function unarchiveTask(taskId) {
    // If task is not in any list, we need to add it to first list.
    let isOrphan = true;
    state.appData.rawLists.forEach(list => {
        if (list.taskIds && list.taskIds.includes(taskId)) isOrphan = false;
    });

    const batch = writeBatch(db);
    batch.update(doc(db, "users", state.currentUser.uid, "tasks", taskId), { archived: false });

    let restoredToFirst = false;
    if (isOrphan && state.appData.lists.length > 0) {
        batch.update(doc(db, "users", state.currentUser.uid, "lists", state.appData.lists[0].id), {
            taskIds: arrayUnion(taskId)
        });
        restoredToFirst = true;
    }
    return batch.commit().then(() => {
        if (restoredToFirst) showToast("Restored to first list.", "success");
    }).catch(e => handleSyncError(e));
}

export function deleteTaskForever(taskId) {
    if (confirm("Delete forever?")) {
        const batch = writeBatch(db);
        batch.delete(doc(db, "users", state.currentUser.uid, "tasks", taskId));

        // Remove from all lists
        state.appData.rawLists.forEach(list => {
            if (list.taskIds && list.taskIds.includes(taskId)) {
                batch.update(doc(db, "users", state.currentUser.uid, "lists", list.id), {
                    taskIds: arrayRemove(taskId)
                });
            }
        });
        return batch.commit().catch(e => handleSyncError(e));
    }
    return Promise.resolve();
}

export function toggleTaskComplete(taskId, isChecked) {
    const p = updateDoc(doc(db, "users", state.currentUser.uid, "tasks", taskId), { completed: isChecked })
        .catch(e => handleSyncError(e));

    // Auto archive logic check is usually done in UI/Main after update, or pure state reaction.
    return p;
}

export function updateListTitle(id, val) {
    return updateDoc(doc(db, "users", state.currentUser.uid, "lists", id), { title: val })
        .catch(e => handleSyncError(e));
}

export function deleteList(id) {
    if (window.showConfirmModal) {
        window.showConfirmModal(
            "Delete List?",
            "Tasks will stay as orphans and won't be deleted forever.",
            () => {
                const batch = writeBatch(db);
                batch.delete(doc(db, "users", state.currentUser.uid, "lists", id));
                const newOrder = state.appData.listOrder.filter(lid => lid !== id);

                const boardId = state.appData.currentBoardId;
                if (boardId) {
                    batch.update(doc(db, "users", state.currentUser.uid, "boards", boardId), { listOrder: newOrder });
                } else {
                    batch.update(doc(db, "users", state.currentUser.uid), { listOrder: newOrder });
                }
                batch.commit().then(() => {
                    showToast("List Deleted", "success");
                }).catch(e => handleSyncError(e));
            },
            'ph-trash'
        );
    } else if (confirm("Delete List? Tasks will stay as orphans.")) {
        // Fallback for safety
        const batch = writeBatch(db);
        batch.delete(doc(db, "users", state.currentUser.uid, "lists", id));
        // ... rest of logic
    }
}

export function emptyOrphans() {
    if (confirm("Delete all orphans forever?")) {
        const activeIds = new Set();
        state.appData.lists.forEach(l => {
            if (l.taskIds && Array.isArray(l.taskIds)) {
                l.taskIds.forEach(id => activeIds.add(id));
            }
        });
        const allIds = Object.keys(state.appData.tasks);
        const orphans = allIds.filter(id => !activeIds.has(id));

        const batch = writeBatch(db);
        orphans.forEach(id => {
            batch.delete(doc(db, "users", state.currentUser.uid, "tasks", id));
        });
        return batch.commit().catch(e => handleSyncError(e));
    }
    return Promise.resolve();
}

export function addNewList() {
    const outputId = generateId();
    const newList = {
        title: "New List",
        taskIds: []
    };

    const batch = writeBatch(db);
    batch.set(doc(db, "users", state.currentUser.uid, "lists", outputId), newList);

    const boardId = state.appData.currentBoardId;
    if (boardId) {
        batch.update(doc(db, "users", state.currentUser.uid, "boards", boardId), {
            listOrder: arrayUnion(outputId)
        });
    } else {
        batch.update(doc(db, "users", state.currentUser.uid), {
            listOrder: arrayUnion(outputId)
        });
    }
    return batch.commit().then(() => {
        showToast("New List Added!", "success");
    }).catch(e => handleSyncError(e));
}

export function addNewBoard(title = "New Board") {
    const boardId = generateId();
    const newBoard = {
        title: title.trim() || "New Board",
        listOrder: [],
        createdAt: Date.now()
    };

    return setDoc(doc(db, "users", state.currentUser.uid, "boards", boardId), newBoard)
        .then(() => {
            state.appData.boards.push({ id: boardId, ...newBoard });
            switchBoard(boardId);
            showToast("New Board Created!", "success");
        }).catch(e => handleSyncError(e));
}

export function switchBoard(boardId) {
    state.appData.currentBoardId = boardId;
    localStorage.setItem(`lastBoard_${state.currentUser.uid}`, boardId);
    
    // Sync listOrder for immediate UI update
    const board = state.appData.boards.find(b => b.id === boardId);
    if (board) {
        state.appData.listOrder = board.listOrder || [];
    }

    // UI will re-render
    import('./ui.js').then(m => m.renderBoard());
}

export function renameBoard(boardId, newTitle) {
    if (!newTitle.trim()) return;
    return updateDoc(doc(db, "users", state.currentUser.uid, "boards", boardId), { title: newTitle.trim() })
        .catch(e => handleSyncError(e));
}

export function rescueOrphanLists() {
    const allListIds = state.appData.rawLists.map(l => l.id);
    const assignedListIds = new Set();
    state.appData.boards.forEach(b => {
        if (b.listOrder) b.listOrder.forEach(id => assignedListIds.add(id));
    });

    const orphans = allListIds.filter(id => !assignedListIds.has(id));
    if (orphans.length === 0) {
        showToast("No orphan lists found.", "info");
        return Promise.resolve();
    }

    const performRescue = () => {
        let mainBoard = state.appData.boards.find(b => b.id === 'main_board');
        if (!mainBoard && state.appData.boards.length > 0) mainBoard = state.appData.boards[0];
        
        if (!mainBoard) {
            showToast("No board found to receive orphans.", "error");
            return;
        }

        return updateDoc(doc(db, "users", state.currentUser.uid, "boards", mainBoard.id), {
            listOrder: arrayUnion(...orphans)
        }).then(() => {
            showToast(`${orphans.length} lists moved to ${mainBoard.title}`, "success");
        }).catch(e => handleSyncError(e));
    };

    if (window.showConfirmModal) {
        window.showConfirmModal(
            "Rescue Orphan Lists?",
            `Move ${orphans.length} unassigned lists to Main Board?`,
            performRescue
        );
    } else if (confirm(`Move ${orphans.length} unassigned lists to Main Board?`)) {
        performRescue();
    }
    return Promise.resolve();
}


export function deleteBoard(boardId) {
    const board = state.appData.boards.find(b => b.id === boardId);
    if (!board) return Promise.resolve();

    if (state.appData.boards.length <= 1) {
        showToast("Cannot delete the only remaining board.", "error");
        return Promise.resolve();
    }

    const performDelete = () => {
        const batch = writeBatch(db);
        
        // Find target board (Main Board or first available)
        let targetBoard = state.appData.boards.find(b => b.id === 'main_board');
        if (!targetBoard || targetBoard.id === boardId) {
            targetBoard = state.appData.boards.find(b => b.id !== boardId);
        }

        if (!targetBoard) {
            showToast("No target board found for migration.", "error");
            return;
        }

        // Migrate lists
        const listsToMove = board.listOrder || [];
        if (listsToMove.length > 0) {
            batch.update(doc(db, "users", state.currentUser.uid, "boards", targetBoard.id), {
                listOrder: arrayUnion(...listsToMove)
            });
        }

        // Delete board document
        batch.delete(doc(db, "users", state.currentUser.uid, "boards", boardId));

        return batch.commit().then(() => {
            showToast(`Board deleted. Lists moved to ${targetBoard.title}`, "success");
            if (state.appData.currentBoardId === boardId) {
                switchBoard(targetBoard.id);
            }
        }).catch(e => handleSyncError(e));
    };

    if (window.showConfirmModal) {
        window.showConfirmModal(
            "Delete Board?",
            `Are you sure you want to delete "${board.title}"? All lists and tasks will be moved to the default board.`,
            performDelete,
            'ph-trash'
        );
    } else if (confirm(`Delete board "${board.title}"? All lists will be moved to the default board.`)) {
        performDelete();
    }
    return Promise.resolve();
}

export function moveListToBoard(listId, targetBoardId) {
    const sourceBoard = state.appData.boards.find(b => b.listOrder && b.listOrder.includes(listId));
    if (!sourceBoard) return Promise.resolve();
    if (sourceBoard.id === targetBoardId) return Promise.resolve();

    const batch = writeBatch(db);
    
    // Remove from source board
    batch.update(doc(db, "users", state.currentUser.uid, "boards", sourceBoard.id), {
        listOrder: arrayRemove(listId)
    });

    // Add to target board
    batch.update(doc(db, "users", state.currentUser.uid, "boards", targetBoardId), {
        listOrder: arrayUnion(listId)
    });

    return batch.commit().then(() => {
        showToast(`List moved to ${state.appData.boards.find(b => b.id === targetBoardId).title}`, "success");
    }).catch(e => handleSyncError(e));
}

export function updateSetting(settingKey, value) {
    // Nested field update support simply
    const updateObj = {};
    updateObj[`settings.${settingKey}`] = value;

    if (settingKey === 'theme') {
        localStorage.setItem('theme', value);
    }

    return updateDoc(doc(db, "users", state.currentUser.uid), updateObj)
        .catch(e => handleSyncError(e));
}

// Export raw updateDoc for UI helpers that need direct access (e.g. glow color)
export { updateDoc };
