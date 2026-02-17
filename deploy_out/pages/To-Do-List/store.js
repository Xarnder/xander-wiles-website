// --- STATE MANAGEMENT ---

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
            addTaskLocation: 'top'
        },
        listOrder: []
    },

    listeners: [],
    dragMode: 'move',
    showArchived: false,
    sortableInstances: [],
    listSortable: null,

    // Multi-Edit State
    multiEditMode: false,
    selectedTaskIds: new Set(),
    listSearchTerm: "",

    // Search State
    searchShowArchived: false,

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
        settings: { autoArchive: false, showNumbers: false, theme: 'dark', sortMode: 'custom' },
        listOrder: []
    };
    state.selectedTaskIds.clear();
}

export function cleanupListeners() {
    state.listeners.forEach(unsub => unsub());
    state.listeners = [];
}
