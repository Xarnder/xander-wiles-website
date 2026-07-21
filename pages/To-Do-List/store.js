// --- STATE MANAGEMENT ---

import { DEFAULT_MISC_TAG, MISC_TAG_ID } from './tags.js';

export const state = {
    currentUser: null,
    lastSyncTime: Date.now(),
    lastSyncError: null,
    syncInterval: null,

    appData: {
        projectTitle: "Task Master",
        lists: [],
        rawLists: [], // Unordered lists from DB
        tasks: {},
        settings: {
            autoArchive: false,
            showNumbers: false,
            theme: 'dark',
            sortMode: 'custom',
            backupFreq: 10,
            tasksSinceBackup: 0,
            addTaskLocation: 'top',
            dailyResetTime: '04:00',
            timeAutomationConfirm: true,
            disableImportantPinning: false,
            workToolsEnabled: false,
            kanbanColumnLabels: {
                new: 'New',
                under_review: 'Under Review',
                almost_done: 'Almost Done',
                finished: 'Finished'
            },
            tags: [{ ...DEFAULT_MISC_TAG }],
            activeTagId: MISC_TAG_ID
        },
        listOrder: [],
        boards: [],
        currentBoardId: null
    },

    listeners: [],
    dragMode: 'move',
    showArchived: false,
    showRecentCompleted: false,
    compactView: true,
    focusedKanbanListId: null,
    sortableInstances: [],
    nestedSortableInstances: [],
    listSortable: null,

    // Multi-Edit State
    multiEditMode: false,
    selectedTaskIds: new Set(),
    expandedTaskId: null,
    listSearchTerm: "",

    // Search State
    searchShowArchived: false,

    // Nested Multi-Edit State (Modal)
    nestedMultiSelectMode: false,
    selectedNestedIds: [], // IDs are unique symbols or strings assigned during edit session

    // Sync State
    hasPendingWrites: false
};

// State Getters/Setters to maintain reference integrity if needed
// Or simply export the mutable 'state' object as above.

export function setCurrentUser(user) {
    state.currentUser = user;
}

export function setAppData(data) {
    // Merge or replace logic if necessary
    state.appData = { ...state.appData, ...data };
}

export function resetState() {
    state.appData = {
        projectTitle: "Task Master",
        lists: [],
        rawLists: [],
        tasks: {},
        settings: {
            autoArchive: false,
            showNumbers: false,
            theme: 'dark',
            sortMode: 'custom',
            dragEnabled: null,
            dailyResetTime: '04:00',
            timeAutomationConfirm: true,
            disableImportantPinning: false,
            workToolsEnabled: false,
            kanbanColumnLabels: {
                new: 'New',
                under_review: 'Under Review',
                almost_done: 'Almost Done',
                finished: 'Finished'
            },
            tags: [{ ...DEFAULT_MISC_TAG }],
            activeTagId: MISC_TAG_ID
        },
        listOrder: [],
        boards: [],
        currentBoardId: null
    };
    state.selectedTaskIds.clear();
    state.expandedTaskId = null;
    state.focusedKanbanListId = null;
}

export function cleanupListeners() {
    state.listeners.forEach(unsub => unsub());
    state.listeners = [];
}
