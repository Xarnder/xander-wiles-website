import { state } from './store.js';
import { escapeHtml, showToast, generateId } from './utils.js';
import { handleAddTask, updateListTitle, deleteList, emptyOrphans, archiveTask, unarchiveTask, deleteTaskForever, toggleTaskComplete, handleSyncError, updateDoc } from './api.js';
import { db } from './firebase-config.js';
import { doc, writeBatch, arrayUnion, arrayRemove } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Global DOM Elements
const boardContainer = document.getElementById('board-container');
const totalTaskCountEl = document.getElementById('total-task-count');
const syncStatusText = document.getElementById('sync-status-text');

// --- RENDERING HELPERS ---

export function getSortedListObjects() {
    if (!state.appData.rawLists) return [];

    const listMap = new Map(state.appData.rawLists.map(l => [l.id, l]));
    const ordered = [];

    // Add known order
    state.appData.listOrder.forEach(id => {
        if (listMap.has(id)) {
            ordered.push(listMap.get(id));
            listMap.delete(id);
        }
    });

    // Append any new/unknown ID lists
    listMap.forEach(l => ordered.push(l));

    return ordered;
}

export function getSortedTaskIds(taskIds) {
    const mode = state.appData.settings.sortMode;
    if (mode === 'custom') return taskIds;

    let ids = [...taskIds];
    const tasks = state.appData.tasks;
    ids.sort((a, b) => {
        const taskA = tasks[a];
        const taskB = tasks[b];
        if (!taskA || !taskB) return 0;
        if (mode === 'alphabetical') return (taskA.text || '').localeCompare(taskB.text || '');
        else if (mode === 'newest') return (taskB.createdAt || 0) - (taskA.createdAt || 0);
        else if (mode === 'oldest') return (taskA.createdAt || 0) - (taskB.createdAt || 0);
        return 0;
    });
    return ids;
}

export function getOrphanedTaskIds() {
    const activeIds = new Set();
    state.appData.lists.forEach(l => {
        if (l.taskIds && Array.isArray(l.taskIds)) {
            l.taskIds.forEach(id => activeIds.add(id));
        }
    });
    const allIds = Object.keys(state.appData.tasks);
    return allIds.filter(id => !activeIds.has(id));
}

// --- CORE RENDERING ---

export function renderBoard() {
    if (!state.currentUser) return;

    // Capture Scroll Positions
    const scrollMap = new Map();
    document.querySelectorAll('.list-column').forEach(col => {
        const listId = col.dataset.listId;
        const taskList = col.querySelector('.task-list');
        if (listId && taskList) {
            scrollMap.set(listId, taskList.scrollTop);
        }
    });

    // Cleanup Sortables
    state.sortableInstances.forEach(s => s.destroy());
    state.sortableInstances = [];
    if (state.listSortable) state.listSortable.destroy();

    boardContainer.innerHTML = '';

    state.appData.lists = getSortedListObjects();

    // LIST SEARCH OVERRIDE
    if (state.listSearchTerm) {
        const term = state.listSearchTerm.toLowerCase();
        const matches = [];
        const others = [];
        state.appData.lists.forEach(l => {
            if (l.title.toLowerCase().includes(term)) {
                matches.push(l);
            } else {
                others.push(l);
            }
        });
        state.appData.lists = [...matches, ...others];
    }

    const isCustomSort = state.appData.settings.sortMode === 'custom';

    // Render Lists
    state.appData.lists.forEach(list => renderListColumn(list, false, isCustomSort));

    // Render Orphans
    if (state.showArchived) {
        const orphanTaskIds = getOrphanedTaskIds();
        if (orphanTaskIds.length > 0) {
            const orphanList = {
                id: 'orphan-archive',
                title: '🗄️ Archived / Orphans',
                taskIds: orphanTaskIds
            };
            renderListColumn(orphanList, true, false);
        }
    }

    // Restore Scroll Positions
    scrollMap.forEach((scrollTop, listId) => {
        const container = document.getElementById(`container-${listId}`);
        if (container) {
            container.scrollTop = scrollTop;
        }
    });

    // List Sorting (Reorder List Columns)
    // Assuming Sortable is global
    state.listSortable = new Sortable(boardContainer, {
        animation: 150,
        handle: '.list-drag-handle',
        direction: 'horizontal',
        filter: '.orphan-list',
        forceFallback: true,
        fallbackOnBody: true,
        onEnd: (evt) => {
            if (evt.newIndex !== evt.oldIndex) {
                // Reorder Logic
                const movedList = state.appData.lists.splice(evt.oldIndex, 1)[0];
                state.appData.lists.splice(evt.newIndex, 0, movedList);
                // Update Order in DB
                const newOrder = state.appData.lists.map(l => l.id).filter(id => id !== 'orphan-archive');
                updateDoc(doc(db, "users", state.currentUser.uid), { listOrder: newOrder });
            }
        }
    });

    updateTotalTaskCount();
}

function renderListColumn(list, isOrphan, isCustomSort) {
    const listEl = document.createElement('div');
    listEl.className = `list-column ${isOrphan ? 'orphan-list' : ''}`;
    listEl.dataset.listId = list.id;

    let headerLeft = isOrphan
        ? `<input type="text" class="list-title" value="${list.title}" disabled>`
        : `<div class="list-header-left">
             <i class="ph ph-dots-six list-drag-handle" title="Drag to reorder list"></i>
             <input type="text" class="list-title" value="${list.title}" onchange="window.updateListTitle('${list.id}', this.value)">
           </div>`;

    let headerButtons = isOrphan
        ? `<button class="icon-btn danger" onclick="window.emptyOrphans()" title="Delete All"><i class="ph ph-trash"></i></button>`
        : `<div class="list-header-right">
             <button class="icon-btn multi-select-all-btn" onclick="window.selectAllInList('${list.id}')" title="Select All in List"><i class="ph ph-check-square-offset"></i></button>
             <button class="icon-btn list-action-btn" onclick="window.openBulkAddModal('${list.id}')" title="Bulk Add Tasks"><i class="ph ph-list-plus"></i></button>
             <button class="icon-btn list-action-btn" onclick="window.deleteList('${list.id}')" title="Delete List"><i class="ph ph-trash"></i></button>
           </div>`;

    const isBottom = state.appData.settings.addTaskLocation === 'bottom';

    let addFormHtml = isOrphan ? '' : `
        <div class="add-task-container ${isBottom ? '' : 'add-v-top'}">
            <form class="add-task-form" onsubmit="window.handleAddTask(event, '${list.id}')">
                <input type="text" class="add-task-input" placeholder="+ Add task" name="taskText">
                <button type="submit" class="btn primary">+</button>
            </form>
        </div>`;

    if (isBottom) {
        listEl.innerHTML = `
            <div class="list-header">
                ${headerLeft}
                ${headerButtons}
            </div>
            <div class="task-list" id="container-${list.id}"></div>
            ${addFormHtml}
        `;
    } else {
        listEl.innerHTML = `
            <div class="list-header">
                ${headerLeft}
                ${headerButtons}
            </div>
            ${addFormHtml}
            <div class="task-list" id="container-${list.id}"></div>
        `;
    }

    const taskListContainer = listEl.querySelector('.task-list');
    const taskIds = list.taskIds || [];
    const sortedIds = getSortedTaskIds(taskIds);

    let visibleCount = 0;
    let visibleIndex = 1;

    sortedIds.forEach((taskId) => {
        const task = state.appData.tasks[taskId];
        if (task) {
            // Exclusive Mode Logic
            const show = state.showArchived ? task.archived === true : !task.archived;

            if (show) {
                taskListContainer.appendChild(createTaskElement(task, list.id, visibleIndex));
                visibleIndex++;
                visibleCount++;
            }
        }
    });

    const countBadge = document.createElement('span');
    countBadge.className = 'list-count-badge';
    countBadge.textContent = visibleCount;
    if (!isOrphan) listEl.querySelector('.list-header-left').appendChild(countBadge);
    else listEl.querySelector('.list-header').insertBefore(countBadge, listEl.querySelector('.list-header-right'));

    boardContainer.appendChild(listEl);

    if (!isOrphan) {
        const sortable = new Sortable(taskListContainer, {
            group: {
                name: 'shared',
                pull: state.dragMode === 'copy' ? 'clone' : true,
                put: true
            },
            animation: 150,
            disabled: !isCustomSort,
            filter: '.archived-task',
            preventOnFilter: false, // CRITICAL: Allow touch events on filtered (archived) elements so buttons work
            forceFallback: true,
            fallbackOnBody: true,
            onEnd: handleDragEnd
        });
        state.sortableInstances.push(sortable);
    } else {
        const sortable = new Sortable(taskListContainer, {
            group: { name: 'shared', pull: true, put: false },
            animation: 150,
            sort: false
        });
        state.sortableInstances.push(sortable);
    }
}

export function createTaskElement(task, sourceListId, number) {
    const el = document.createElement('div');
    const isLocked = state.appData.settings.sortMode !== 'custom';
    const isImportant = task.text.includes('!!');

    let listCount = 0;
    state.appData.rawLists.forEach(l => {
        if (l.taskIds && l.taskIds.includes(task.id) && l.id !== 'orphan-archive') {
            listCount++;
        }
    });
    const isLinked = listCount > 1;

    let classes = 'task-card';
    if (task.completed) classes += ' task-completed';
    if (task.archived) classes += ' archived-task';
    if (isImportant) classes += ' important';
    if (isLocked) classes += ' locked-sort';
    if (isLinked) classes += ' linked-task';
    if (state.selectedTaskIds.has(task.id)) classes += ' selected';

    el.className = classes;
    el.dataset.taskId = task.id;

    if (task.glowColor && task.glowColor !== 'none') {
        el.style.boxShadow = `0 0 10px ${task.glowColor}, inset 0 0 5px ${task.glowColor}20`;
        el.style.borderColor = task.glowColor;
    }

    let imagesHtml = '';
    if (task.images && task.images.length > 0) {
        imagesHtml = `<div class="task-images">`;
        task.images.forEach(imgData => {
            imagesHtml += `<img src="${imgData}" class="task-img-preview" onclick="window.openImageLightbox('${imgData}')">`;
        });
        imagesHtml += `</div>`;
    }

    let actionsHtml = '';
    if (task.archived) {
        // Archived Task: Click whole card to open modal
        el.setAttribute('onclick', `window.openArchivedTaskModal('${task.id}')`);
        el.style.cursor = 'pointer';

        // Minimal actions (redundant but kept for desktop ease)
        // Hidden in CSS maybe or kept small? User said "allows me to press any archived task", 
        // implies the card click is the primary interaction.
        // We will keep actionsHtml but ensuring they stop propagation.

        actionsHtml = `
            <button class="icon-btn" title="Restore" onclick="event.stopPropagation(); window.unarchiveTask('${task.id}')" ontouchstart="event.stopPropagation(); window.unarchiveTask('${task.id}')"><i class="ph ph-arrow-u-up-left"></i></button>
            <button class="icon-btn danger" title="Delete Forever" onclick="event.stopPropagation(); window.deleteTaskForever('${task.id}')" ontouchstart="event.stopPropagation(); window.deleteTaskForever('${task.id}')"><i class="ph ph-trash"></i></button>
        `;
    } else {
        actionsHtml = `
            <button class="icon-btn" title="Edit" onclick="window.openEditModal('${task.id}', '${sourceListId}')"><i class="ph ph-pencil-simple"></i></button>
            <button class="icon-btn" title="Add Image" onclick="window.triggerImageUpload('${task.id}')"><i class="ph ph-image"></i></button>
            <button class="icon-btn" title="Archive" onclick="window.archiveTask('${task.id}')"><i class="ph ph-archive"></i></button>
        `;
    }

    let numberHtml = state.appData.settings.showNumbers ? `<span class="task-number">${number}.</span>` : '';
    let linkedIconHtml = isLinked ? `<i class="ph ph-link" style="font-size: 0.8em; margin-left: 5px; color: var(--accent-blue);" title="Linked to multiple lists"></i>` : '';

    el.innerHTML = `
        <input type="checkbox" class="task-checkbox" 
            ${task.completed ? 'checked' : ''} 
            onchange="window.toggleTaskComplete('${task.id}', this.checked)"
            onclick="event.stopPropagation()"
            ontouchstart="event.stopPropagation()">
        ${numberHtml}
        <div class="task-content-wrapper">
            <div class="task-text">${escapeHtml(task.text)} ${linkedIconHtml}</div>
            ${imagesHtml}
        </div>
        <div class="task-actions">${actionsHtml}</div>
    `;
    return el;
}

export function updateTotalTaskCount() {
    let total = 0;
    Object.values(state.appData.tasks).forEach(task => {
        if (!task.archived) total++;
    });
    if (total > 0) {
        totalTaskCountEl.textContent = `Total: ${total}`;
        totalTaskCountEl.classList.remove('hidden');
    } else {
        totalTaskCountEl.classList.add('hidden');
    }
}

export function updateSyncUI() {
    if (!state.currentUser) return;
    const now = Date.now();
    const diff = Math.floor((now - state.lastSyncTime) / 1000);
    const dot = document.getElementById('sync-dot');

    let timeStr = 'Synced';
    if (!dot) return;

    // Reset classes
    dot.className = 'sync-dot';

    // ERROR STATE
    if (state.lastSyncError) {
        dot.classList.add('offline');
        let errMsg = "Sync Error";
        if (state.lastSyncError.code === 'resource-exhausted') errMsg = "Quota Exceeded";
        else if (state.lastSyncError.code === 'permission-denied') errMsg = "Permission Denied";
        else if (state.lastSyncError.code === 'unavailable') errMsg = "Network Issue";

        syncStatusText.innerText = errMsg;
        return;
    }

    if (!navigator.onLine) {
        if (state.hasPendingWrites) {
            dot.classList.add('offline'); // You might want a different color for "Offline with Changes"
            // For now, let's say offline with changes is 'syncing' style or a new 'warning' style if we had one.
            // But requirement was "Offline (Changes Queued)".
            // Let's modify CSS for a new class if needed, or re-use existing.
            // Let's assume 'offline' means red, maybe we want Orange.
            dot.style.backgroundColor = 'var(--accent-orange)';
            timeStr = 'Offline (Changes Queued)';
        } else {
            dot.classList.add('offline');
            timeStr = 'Offline';
            dot.style.backgroundColor = ''; // Reset inline style
        }
    } else {
        // ONLINE
        dot.style.backgroundColor = ''; // Reset inline

        if (state.hasPendingWrites) {
            dot.classList.add('syncing');
            timeStr = 'Syncing...';
        } else {
            if (diff < 5) {
                dot.classList.add('online');
                timeStr = 'Synced';
            } else if (diff < 60) {
                dot.classList.add('online');
                timeStr = 'Synced ' + diff + 's ago';
            } else {
                dot.classList.add('syncing'); // Idle but old sync? No, kept original logic for "old sync" maybe?
                // Actually original logic:
                // if (navigator.onLine) { dot.classList.add('syncing'); timeStr = ...m ago }
                // That seems to imply "Active but not synced recently".
                // I will improve this: If no pending writes, and online, it is Synced.
                // The time diff is just informational.
                dot.classList.add('online');
                timeStr = diff < 60 ? 'Synced ' + diff + 's ago' : 'Synced ' + Math.floor(diff / 60) + 'm ago';
            }
        }
    }

    if (syncStatusText) syncStatusText.innerText = timeStr;
}

// --- DRAG END HANDLER ---

export function handleDragEnd(evt) {
    const fromIdRaw = evt.from.id.replace('container-', '');
    const toIdRaw = evt.to.id.replace('container-', '');

    if (fromIdRaw === 'orphan-archive' && toIdRaw === 'orphan-archive') return;

    const taskId = evt.item.dataset.taskId;

    const getHiddenArchivedIds = (listId) => {
        if (state.showArchived) return [];
        const listObj = state.appData.rawLists.find(l => l.id === listId);
        if (!listObj || !listObj.taskIds) return [];
        return listObj.taskIds.filter(tid => {
            const task = state.appData.tasks[tid];
            return task && task.archived;
        });
    };

    const batch = writeBatch(db);

    if (toIdRaw !== 'orphan-archive') {
        const toContainer = document.getElementById(`container-${toIdRaw}`);
        const newToIds = Array.from(toContainer.children)
            .filter(el => !el.classList.contains('sortable-ghost'))
            .map(el => el.dataset.taskId);

        const hiddenToIds = getHiddenArchivedIds(toIdRaw);
        const finalToIds = [...newToIds, ...hiddenToIds];

        batch.update(doc(db, "users", state.currentUser.uid, "lists", toIdRaw), { taskIds: finalToIds });

        if (fromIdRaw === 'orphan-archive') {
            batch.update(doc(db, "users", state.currentUser.uid, "tasks", taskId), { archived: false });
        }
    }

    if (fromIdRaw !== 'orphan-archive' && fromIdRaw !== toIdRaw) {
        const fromContainer = document.getElementById(`container-${fromIdRaw}`);
        const newFromIds = Array.from(fromContainer.children)
            .map(el => el.dataset.taskId); // Note: Sortable already removed item from DOM if move

        const hiddenFromIds = getHiddenArchivedIds(fromIdRaw);
        const finalFromIds = [...newFromIds, ...hiddenFromIds];

        batch.update(doc(db, "users", state.currentUser.uid, "lists", fromIdRaw), { taskIds: finalFromIds });
    }

    if (fromIdRaw === toIdRaw && fromIdRaw !== 'orphan-archive') {
        const container = document.getElementById(`container-${fromIdRaw}`);
        const newIds = Array.from(container.children).map(el => el.dataset.taskId);
        const hiddenIds = getHiddenArchivedIds(fromIdRaw);
        const finalIds = [...newIds, ...hiddenIds];
        batch.update(doc(db, "users", state.currentUser.uid, "lists", fromIdRaw), { taskIds: finalIds });
    }

    batch.commit().catch(e => handleSyncError(e));
}

// --- MODALS & INTERACTIONS ---

const modalOverlay = document.getElementById('modal-overlay');

export function openEditModal(taskId, listId) {
    const task = state.appData.tasks[taskId];
    if (!task) return;
    document.getElementById('modal-task-input').value = task.text;
    modalOverlay.dataset.taskId = taskId;

    const select = document.getElementById('manual-move-select');
    select.innerHTML = '<option value="" disabled selected>Select Destination...</option>';

    const sortedLists = getSortedListObjects();
    sortedLists.forEach(list => {
        if (list.id === 'orphan-archive') return;
        const option = document.createElement('option');
        option.value = list.id;
        option.textContent = list.title;
        select.appendChild(option);
    });

    renderCurrentLocations(taskId);

    const colorBtns = document.querySelectorAll('#glow-color-options .color-btn');
    colorBtns.forEach(btn => {
        btn.classList.toggle('selected', btn.dataset.color === (task.glowColor || 'none'));
        btn.onclick = () => {
            updateDoc(doc(db, "users", state.currentUser.uid, "tasks", taskId), { glowColor: btn.dataset.color })
                .catch(e => handleSyncError(e));
            colorBtns.forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
        }
    });

    modalOverlay.classList.remove('hidden');
}

export function renderCurrentLocations(taskId) {
    const container = document.getElementById('current-locations-list');
    container.innerHTML = '';

    const currentLists = state.appData.rawLists.filter(list => list.taskIds && list.taskIds.includes(taskId));

    if (currentLists.length === 0) {
        container.innerHTML = '<div class="location-item"><span class="location-name">Orphans / Archived</span></div>';
        return;
    }

    currentLists.forEach(list => {
        const div = document.createElement('div');
        div.className = 'location-item';
        div.innerHTML = `
            <span class="location-name">${escapeHtml(list.title)}</span>
            <button class="location-remove-btn" onclick="window.removeTaskFromList('${taskId}', '${list.id}')" title="Remove from this list">
                <i class="ph ph-x"></i>
            </button>
        `;
        container.appendChild(div);
    });
}

export function removeTaskFromList(taskId, listId) {
    if (confirm("Remove functionality from specific list?")) {
        updateDoc(doc(db, "users", state.currentUser.uid, "lists", listId), {
            taskIds: arrayRemove(taskId)
        }).then(() => {
            renderCurrentLocations(taskId);
        }).catch(e => handleSyncError(e));
    }
}

// Image Lightbox
const imageModal = document.getElementById('image-modal-overlay');
export function openImageLightbox(src) {
    document.getElementById('full-size-image').src = src;
    imageModal.classList.remove('hidden');
}

// Bulk Add
const bulkModal = document.getElementById('bulk-add-modal-overlay');
export function openBulkAddModal(listId) {
    bulkModal.dataset.listId = listId;
    bulkModal.classList.remove('hidden');
}

// Multi Select UI
export function toggleMultiEditUI() {
    const multiEditBtn = document.getElementById('multi-edit-btn');
    const floatingBar = document.getElementById('multi-edit-floating-bar');

    if (state.multiEditMode) {
        multiEditBtn.classList.add('active');
        document.body.classList.add('multi-edit-active');
        enableSortables(false);
    } else {
        multiEditBtn.classList.remove('active');
        document.body.classList.remove('multi-edit-active');
        floatingBar.classList.add('hidden');
        state.selectedTaskIds.clear();
        document.querySelectorAll('.task-card.selected').forEach(el => el.classList.remove('selected'));
        enableSortables(true);
    }
}

export function updateMultiFloatingBar() {
    const selectedCountEl = document.getElementById('multi-selected-count');
    const floatingBar = document.getElementById('multi-edit-floating-bar');
    const count = state.selectedTaskIds.size;
    selectedCountEl.textContent = `${count} Selected`;
    if (count > 0) {
        floatingBar.classList.remove('hidden');
    } else {
        floatingBar.classList.add('hidden');
    }
}

export function selectAllInList(listId) {
    if (!state.multiEditMode) return;

    const container = document.getElementById(`container-${listId}`);
    if (!container) return;

    const visibleCards = Array.from(container.querySelectorAll('.task-card'));
    if (visibleCards.length === 0) return;

    const allSelected = visibleCards.every(card => state.selectedTaskIds.has(card.dataset.taskId));

    visibleCards.forEach(card => {
        const id = card.dataset.taskId;
        if (allSelected) {
            state.selectedTaskIds.delete(id);
            card.classList.remove('selected');
        } else {
            state.selectedTaskIds.add(id);
            card.classList.add('selected');
        }
    });

    updateMultiFloatingBar();
}

export function enableSortables(enable) {
    if (state.listSortable) state.listSortable.option("disabled", !enable);
    state.sortableInstances.forEach(s => s.option("disabled", !enable));
}

// --- IMAGE UPLOAD TRADITIONAL ---
export function triggerImageUpload(taskId) {
    const input = document.getElementById('hidden-image-input');
    input.dataset.taskId = taskId;
    input.click();
}

// --- SEARCH ---

export function performSearch(query) {
    const searchResultsContainer = document.getElementById('search-results-container');
    const searchEmptyState = document.getElementById('search-empty-state');

    const term = query.trim().toLowerCase();
    searchResultsContainer.innerHTML = '';

    if (!term) {
        searchEmptyState.classList.remove('hidden');
        searchEmptyState.querySelector('p').textContent = "Type to search...";
        return;
    }

    const matches = [];

    Object.values(state.appData.tasks).forEach(task => {
        if (!task) return;
        if ((state.searchShowArchived || !task.archived) && task.text.toLowerCase().includes(term)) {
            const context = getTaskContext(task.id);
            if (context.length > 0) {
                matches.push({ task, context });
            } else if (state.showArchived && task.archived) {
                matches.push({ task, context: [{ listName: 'Archived / Orphan', index: '-' }] });
            } else if (getOrphanedTaskIds().includes(task.id)) {
                matches.push({ task, context: [{ listName: 'Orphan', index: '-' }] });
            }
        }
    });

    if (matches.length === 0) {
        searchEmptyState.classList.remove('hidden');
        searchEmptyState.querySelector('p').textContent = "No tasks found.";
    } else {
        searchEmptyState.classList.add('hidden');
        matches.forEach(match => {
            renderSearchResultItem(match.task, match.context);
        });
    }
}

function getTaskContext(taskId) {
    const contexts = [];
    state.appData.lists.forEach(list => {
        if (list.taskIds && list.taskIds.includes(taskId)) {
            const index = list.taskIds.indexOf(taskId) + 1;
            contexts.push({
                listName: list.title,
                listId: list.id,
                index: index
            });
        }
    });
    return contexts;
}

function renderSearchResultItem(task, contexts) {
    const searchResultsContainer = document.getElementById('search-results-container');
    const sourceListId = contexts[0]?.listId || 'orphan-archive';

    const taskEl = createTaskElement(task, sourceListId, contexts[0]?.index || 0);

    const contextContainer = document.createElement('div');
    contextContainer.style.marginBottom = '6px';
    contextContainer.style.display = 'flex';
    contextContainer.style.flexWrap = 'wrap';

    contexts.forEach(ctx => {
        const badge = document.createElement('span');
        badge.className = 'search-context-badge';
        badge.innerHTML = `<i class="ph ph-list-dashes"></i> ${ctx.listName} <span style="opacity:0.6; margin-left:3px;">#${ctx.index}</span>`;
        contextContainer.appendChild(badge);
    });

    const wrapper = document.createElement('div');
    wrapper.style.marginBottom = '12px';

    wrapper.appendChild(contextContainer);
    wrapper.appendChild(taskEl);

    searchResultsContainer.appendChild(wrapper);
}

// --- ARCHIVED TASK INTERACTION ---

export function openArchivedTaskModal(taskId) {
    const task = state.appData.tasks[taskId];
    if (!task) return;

    const modal = document.getElementById('archived-task-modal-overlay');
    if (!modal) return; // Guard clause if modal not yet in DOM

    modal.dataset.taskId = taskId;

    // Set text logic could go here if we wanted to show task preview
    const previewEl = document.getElementById('archived-task-preview');
    if (previewEl) previewEl.textContent = task.text;

    modal.classList.remove('hidden');
}
