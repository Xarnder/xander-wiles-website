import { state } from './store.js';
import { escapeHtml, showToast, generateId, formatDateTime, getTerm, parseNestedMarkdown, isUserTyping } from './utils.js';
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

    // Only return lists that are explicitly in the order (assigned to this board)
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

    document.body.classList.toggle('is-archived-view', state.showArchived);

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

    // Capture Focus/Typing State
    const activeEl = document.activeElement;
    let focusedListId = null;
    let focusedValue = null;
    let selectionStart = 0;
    let selectionEnd = 0;

    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
        focusedValue = activeEl.value;
        selectionStart = activeEl.selectionStart;
        selectionEnd = activeEl.selectionEnd;
        const listCol = activeEl.closest('.list-column');
        if (listCol) {
            focusedListId = listCol.dataset.listId;
        }
    }

    boardContainer.innerHTML = '';

    // ARCHIVE BADGE
    const header = document.querySelector('.app-header');
    let archiveBadge = document.getElementById('archive-view-badge');
    if (state.showArchived) {
        if (!archiveBadge) {
            archiveBadge = document.createElement('div');
            archiveBadge.id = 'archive-view-badge';
            archiveBadge.className = 'archive-view-badge';
            archiveBadge.innerHTML = `<i class="ph ph-archive-box"></i> VIEWING ARCHIVED ${getTerm(false, true).toUpperCase()}`;
            document.body.appendChild(archiveBadge);
        }
    } else if (archiveBadge) {
        archiveBadge.remove();
    }

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
    state.listSortable = new Sortable(boardContainer, {
        disabled: !state.appData.settings.dragEnabled,
        animation: 150,
        handle: '.list-drag-handle',
        direction: 'horizontal',
        filter: '.orphan-list',
        forceFallback: true,
        fallbackOnBody: true,
        delay: 200,
        delayOnTouchOnly: true,
        onEnd: (evt) => {
            if (evt.newIndex !== evt.oldIndex) {
                // Reorder Logic
                const movedList = state.appData.lists.splice(evt.oldIndex, 1)[0];
                state.appData.lists.splice(evt.newIndex, 0, movedList);
                // Update Order in DB
                const newOrder = state.appData.lists.map(l => l.id).filter(id => id !== 'orphan-archive');
                const boardId = state.appData.currentBoardId;
                if (boardId) {
                    updateDoc(doc(db, "users", state.currentUser.uid, "boards", boardId), { listOrder: newOrder });
                } else {
                    updateDoc(doc(db, "users", state.currentUser.uid), { listOrder: newOrder });
                }
            }
        }
    });

    updateBoardUI();
    updateTotalTaskCount();
    applyStaticLayouts();

    // Restore Focus/Typing State
    if (activeEl && activeEl.id) {
        const newEl = document.getElementById(activeEl.id);
        if (newEl) {
            newEl.value = focusedValue;
            newEl.focus();
            if (newEl.setSelectionRange) newEl.setSelectionRange(selectionStart, selectionEnd);
        }
    } else if (focusedListId) {
        const listCol = document.querySelector(`.list-column[data-list-id="${focusedListId}"]`);
        if (listCol) {
            const input = listCol.querySelector('.add-task-input');
            if (input) {
                input.value = focusedValue;
                input.focus();
                input.setSelectionRange(selectionStart, selectionEnd);
                // Also trigger oninput logic to enable submit button
                if (input.nextElementSibling && input.nextElementSibling.tagName === 'BUTTON') {
                    input.nextElementSibling.disabled = !input.value.trim();
                }
            }
        }
    }
}

export function updateBoardUI() {
    const currentBoard = state.appData.boards.find(b => b.id === state.appData.currentBoardId);
    const titleInput = document.getElementById('project-title-input');
    if (currentBoard && titleInput) {
        titleInput.value = currentBoard.title;
        // Update onchange specifically for board title if we are in a board
        titleInput.onchange = () => {
            import('./api.js').then(m => m.renameBoard(currentBoard.id, titleInput.value));
        };
    }

    renderBoardToggle();
}

export function renderBoardToggle() {
    const container = document.getElementById('board-toggle-container');
    if (!container) return;

    const boards = state.appData.boards;
    const currentBoard = boards.find(b => b.id === state.appData.currentBoardId);
    
    container.innerHTML = `
        <div class="board-dropdown" id="board-dropdown">
            <button class="btn primary board-dropdown-btn" id="board-dropdown-btn" onclick="window.openBoardManager()">
                <i class="ph ph-layout"></i> 
                <span>${currentBoard ? escapeHtml(currentBoard.title) : 'Select Board'}</span> 
                <i class="ph ph-caret-down"></i>
            </button>
        </div>
    `;
}

export function openBoardManager() {
    const modal = document.getElementById('board-modal-overlay');
    if (!modal) return;
    
    renderBoardManager();
    modal.classList.remove('hidden');
}

export function renderBoardManager() {
    const container = document.getElementById('board-list-container');
    if (!container) return;

    const allLists = state.appData.rawLists || [];
    const listMap = new Map(allLists.map(l => [l.id, l]));

    const allAppBoards = state.appData.boards || [];
    console.log("Rendering Board Manager with boards:", allAppBoards);

    container.innerHTML = allAppBoards.map(b => {
        const listCount = b.listOrder ? b.listOrder.length : 0;
        let taskCount = 0;
        if (b.listOrder) {
            b.listOrder.forEach(lid => {
                const list = listMap.get(lid);
                if (list && list.taskIds) {
                    taskCount += list.taskIds.length;
                }
            });
        }

        return `
            <div class="board-item ${b.id === state.appData.currentBoardId ? 'active' : ''}" 
                 onclick="window.switchBoard('${b.id}'); document.getElementById('board-modal-overlay').classList.add('hidden');">
                <i class="ph ph-sidebar"></i>
                <div class="board-item-details" style="flex-grow: 1; min-width: 0;">
                    <div style="display: flex; justify-content: space-between; align-items: center; gap: 10px;">
                        <span class="board-title" style="flex-grow:1; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(b.title)}</span>
                    </div>
                    <div class="board-stats" style="display: flex; gap: 12px; margin-top: 4px; font-size: 0.75rem; color: var(--text-secondary); opacity: 0.8;">
                        <span style="display: flex; align-items: center; gap: 3px;">
                            <i class="ph ph-list-numbers" style="font-size: 0.85rem;"></i> ${listCount} ${listCount === 1 ? 'List' : 'Lists'}
                        </span>
                        <span style="display: flex; align-items: center; gap: 3px;">
                            <i class="ph ph-check-square" style="font-size: 0.85rem;"></i> ${taskCount} ${taskCount === 1 ? getTerm(true, true) : getTerm(false, true)}
                        </span>
                    </div>
                </div>
                ${allAppBoards.length > 1 ? `
                    <button class="icon-btn danger mini-delete" 
                        onclick="event.stopPropagation(); window.deleteBoard('${b.id}')"
                        title="Delete Board"
                        style="flex-shrink: 0;">
                        <i class="ph ph-trash"></i>
                    </button>
                ` : ''}
            </div>
        `;
    }).join('');
}

export function renderDefaultBoardSelect() {
    const select = document.getElementById('default-board-select');
    if (!select) return;

    const boards = state.appData.boards;
    const defaultBoardId = state.appData.settings.defaultBoardId || '';

    let html = `<option value="">None (Last Used)</option>`;
    boards.forEach(b => {
        html += `<option value="${b.id}" ${b.id === defaultBoardId ? 'selected' : ''}>${escapeHtml(b.title)}</option>`;
    });

    select.innerHTML = html;
}

export function renderGroupedListSelect(select, includeNewListOption = false) {
    if (!select) return;

    select.innerHTML = '<option value="" disabled selected>Select Destination...</option>';
    
    if (includeNewListOption) {
        const newListOpt = document.createElement('option');
        newListOpt.value = 'NEW_LIST_CREATION';
        newListOpt.textContent = '➕ Create New List...';
        newListOpt.style.fontWeight = 'bold';
        select.appendChild(newListOpt);
    }

    const boards = state.appData.boards;
    const rawLists = state.appData.rawLists || [];
    const listMap = new Map(rawLists.map(l => [l.id, l]));
    const assignedListIds = new Set();

    // Group lists by board, prioritizing the current board
    const sortedBoards = [...state.appData.boards].sort((a, b) => {
        if (a.id === state.appData.currentBoardId) return -1;
        if (b.id === state.appData.currentBoardId) return 1;
        return 0;
    });

    sortedBoards.forEach(board => {
        const group = document.createElement('optgroup');
        group.label = `Board: ${board.title}`;
        
        if (board.listOrder) {
            board.listOrder.forEach(lid => {
                const list = listMap.get(lid);
                if (list) {
                    const option = document.createElement('option');
                    option.value = list.id;
                    option.textContent = list.title;
                    group.appendChild(option);
                    assignedListIds.add(lid);
                }
            });
        }
        if (group.children.length > 0) {
            select.appendChild(group);
        }
    });

    // Unassigned / Orphans group
    const orphans = rawLists.filter(l => !assignedListIds.has(l.id));
    if (orphans.length > 0) {
        const group = document.createElement('optgroup');
        group.label = "Unassigned Lists";
        orphans.forEach(list => {
            const option = document.createElement('option');
            option.value = list.id;
            option.textContent = list.title;
            group.appendChild(option);
        });
        select.appendChild(group);
    }
}

/**
 * Deterministically decides which layout (horizontal vs vertical) each task card should use.
 * This is called once after rendering to avoid flickering caused by continuous observation.
 */
function applyStaticLayouts() {
    document.querySelectorAll('.task-card').forEach(card => {
        const textEl = card.querySelector('.task-text');
        if (!textEl) return;

        // Reset to horizontal to measure natural height in that layout
        card.classList.remove('vertical-actions');
        
        // Measure scrollHeight. 
        // 1.35 line-height * 0.9rem ~= 19.4px per line.
        // 3 lines ~= 58px. We use 60px as a safe threshold for "too long for horizontal".
        if (textEl.scrollHeight > 60) {
            card.classList.add('vertical-actions');
        }
    });
}

function renderListColumn(list, isOrphan, isCustomSort) {
    const listEl = document.createElement('div');
    listEl.className = `list-column ${isOrphan ? 'orphan-list' : ''}`;
    listEl.dataset.listId = list.id;

    const automationIcon = list.timeAutomated 
        ? `<i class="ph ph-clock" style="color: var(--accent-blue); font-size: 0.9rem; margin-left: 5px;" title="Time Automation Enabled"></i>`
        : '';

    let headerLeft = isOrphan
        ? `<div class="list-header-left">
             <input type="text" class="list-title" value="${list.title}" disabled>
             ${automationIcon}
           </div>`
        : `<div class="list-header-left">
             <i class="ph ph-dots-six list-drag-handle" title="Drag to reorder list"></i>
              <input type="text" class="list-title" value="${list.title}" onchange="window.updateListTitle('${list.id}', this.value)" spellcheck="true" autocorrect="on" autocomplete="on" autocapitalize="sentences">
              ${automationIcon}
            </div>`;

    const descriptionHtml = (!state.compactView && list.description) 
        ? `<p class="list-description">${escapeHtml(list.description)}</p>` 
        : '';

    const hideCheckboxes = window.APP_CONFIG?.hideCheckboxes;
    let headerButtons = isOrphan
        ? `<button class="icon-btn danger" onclick="window.emptyOrphans()" title="Delete All"><i class="ph ph-trash"></i></button>`
        : `<div class="list-header-right">
             ${!hideCheckboxes ? `<button class="icon-btn clean-list-btn" onclick="window.clearCompletedInList('${list.id}')" title="Clear Completed ${getTerm(false, true)}"><i class="ph ph-broom"></i></button>` : ''}
              <button id="multi-select-all-btn" class="icon-btn multi-select-all-btn" onclick="window.selectAllInList('${list.id}')" title="Select All in List"><i class="ph ph-check-square-offset"></i></button>
              <button class="icon-btn list-action-btn" onclick="window.openEditListModal('${list.id}')" title="Edit List Settings"><i class="ph ph-sliders"></i></button>
            </div>`;

    const isBottom = state.appData.settings.addTaskLocation === 'bottom';

    let addFormHtml = isOrphan ? '' : `
        <div class="add-task-container ${isBottom ? '' : 'add-v-top'}">
            <form class="add-task-form" onsubmit="window.handleAddTask(event, '${list.id}')">
                <input type="text" class="add-task-input" placeholder="+ Add ${getTerm(true)}" name="taskText" oninput="this.nextElementSibling.disabled = !this.value.trim()" spellcheck="true" autocorrect="on" autocomplete="on" autocapitalize="sentences">
                <button type="submit" class="btn primary" disabled>+</button>
            </form>
        </div>`;

    const listHeader = `
        <div class="list-header">
            ${headerLeft}
            ${headerButtons}
        </div>
        ${descriptionHtml}
    `;

    if (isBottom) {
        listEl.innerHTML = `
            ${listHeader}
            <div class="task-list" id="container-${list.id}"></div>
            ${addFormHtml}
        `;
    } else {
        listEl.innerHTML = `
            ${listHeader}
            ${addFormHtml}
            <div class="task-list" id="container-${list.id}"></div>
        `;
    }

    const taskListContainer = listEl.querySelector('.task-list');
    const taskIds = list.taskIds || [];
    const sortedIds = getSortedTaskIds(taskIds);

    let visibleCount = 0;
    let visibleIndex = 1;
    let doneCount = 0;
    sortedIds.forEach((taskId) => {
        const task = state.appData.tasks[taskId];
        if (task) {
            // Exclusive Mode Logic
            let show = false;
            if (state.showRecentCompleted) {
                show = task.completed && task.completedAt && (Date.now() - task.completedAt <= 24 * 60 * 60 * 1000);
            } else {
                show = state.showArchived ? task.archived === true : !task.archived;
            }

            if (show) {
                taskListContainer.appendChild(createTaskElement(task, list.id, visibleIndex));
                if (task.completed) doneCount++;
                visibleIndex++;
                visibleCount++;
            }
        }
    });

    if (visibleCount === 0) {
        const emptyMsg = document.createElement('div');
        emptyMsg.className = 'empty-list-msg';
        emptyMsg.innerHTML = `<i class="ph ph-shooting-star"></i> No ${getTerm(false)} here!`;
        taskListContainer.appendChild(emptyMsg);
    }

    const countBadge = document.createElement('span');
    countBadge.className = 'list-count-badge';
    countBadge.textContent = visibleCount > 0 ? `${doneCount}/${visibleCount}` : '0';
    if (visibleCount > 0 && doneCount === visibleCount) countBadge.classList.add('all-done');
    listEl.querySelector('.list-header-left').appendChild(countBadge);

    boardContainer.appendChild(listEl);

    if (!isOrphan) {
        const sortable = new Sortable(taskListContainer, {
            group: {
                name: 'shared',
                pull: state.dragMode === 'copy' ? 'clone' : true,
                put: true
            },
            animation: 150,
            disabled: (!isCustomSort || !state.appData.settings.dragEnabled),
            filter: '.archived-task',
            preventOnFilter: false, // CRITICAL: Allow touch events on filtered (archived) elements so buttons work
            forceFallback: true,
            fallbackOnBody: true,
            delay: 200,
            delayOnTouchOnly: true,
            onEnd: handleDragEnd
        });
        state.sortableInstances.push(sortable);
    } else {
        const sortable = new Sortable(taskListContainer, {
            disabled: !state.appData.settings.dragEnabled,
            group: { name: 'shared', pull: true, put: false },
            animation: 150,
            sort: false,
            delay: 200,
            delayOnTouchOnly: true
        });
        state.sortableInstances.push(sortable);
    }
}

export function generateNestedIdeasHtml(nestedIdeas) {
    if (!nestedIdeas || nestedIdeas.length === 0) return '';
    let html = '<div class="nested-ideas-list">';
    nestedIdeas.forEach(idea => {
        html += `<div class="nested-idea-display-item">
            ${escapeHtml(idea.text)}
        </div>`;
        if (idea.nestedIdeas && idea.nestedIdeas.length > 0) {
            html += generateNestedIdeasHtml(idea.nestedIdeas);
        }
    });
    html += '</div>';
    return html;
}

export function renderNestedEditorList(container, dataArray, level = 1) {
    container.innerHTML = '';
    dataArray.forEach((data) => {
        // Ensure each item has a persistent tempId for this edit session
        if (!data.tempId) {
            data.tempId = 'id-' + Math.random().toString(36).substr(2, 9);
        }
        container.appendChild(createNestedIdeaEditorItem(data, level));
    });
}

export function createNestedIdeaEditorItem(data, level = 1) {
    const div = document.createElement('div');
    div.className = 'nested-idea-editor-item';
    div.dataset.tempId = data.tempId;
    
    const row = document.createElement('div');
    row.className = 'nested-idea-editor-row';
    if (state.selectedNestedIds.includes(data.tempId)) {
        row.classList.add('selected');
    }
    
    // Level Badge
    const levelBadge = document.createElement('span');
    levelBadge.className = 'nested-level-badge';
    levelBadge.textContent = level;
    levelBadge.title = `Nesting Level ${level}`;
    
    const input = document.createElement('input');
    input.type = 'text';
    input.value = data.text || '';
    input.placeholder = 'Nested idea...';
    input.className = 'nested-idea-input';
    input.setAttribute('spellcheck', 'true');
    input.setAttribute('autocorrect', 'on');
    input.setAttribute('autocomplete', 'on');
    input.setAttribute('autocapitalize', 'sentences');

    if (state.nestedMultiSelectMode) {
        input.readOnly = true;
    }
    
    const addBtn = document.createElement('button');
    addBtn.className = 'icon-btn';
    addBtn.innerHTML = '<i class="ph ph-plus"></i>';
    addBtn.title = 'Add Sub-Idea';
    
    const delBtn = document.createElement('button');
    delBtn.className = 'icon-btn danger';
    delBtn.innerHTML = '<i class="ph ph-trash"></i>';
    delBtn.title = 'Delete';
    
    row.appendChild(levelBadge);
    row.appendChild(input);
    row.appendChild(addBtn);
    row.appendChild(delBtn);
    
    div.appendChild(row);
    
    const childContainer = document.createElement('div');
    childContainer.className = 'nested-ideas-child-container';
    div.appendChild(childContainer);
    
    if (data.nestedIdeas && data.nestedIdeas.length > 0) {
        renderNestedEditorList(childContainer, data.nestedIdeas, level + 1);
    }
    
    // Toggle Selection in Multi-Select Mode
    row.onclick = (e) => {
        if (!state.nestedMultiSelectMode) return;
        
        const tempId = data.tempId;
        const index = state.selectedNestedIds.indexOf(tempId);
        if (index > -1) {
            state.selectedNestedIds.splice(index, 1);
            row.classList.remove('selected');
        } else {
            state.selectedNestedIds.push(tempId);
            row.classList.add('selected');
        }
        updateNestedMultiActionBar();
    };

    addBtn.onclick = (e) => {
        e.stopPropagation();
        e.preventDefault();
        if (state.nestedMultiSelectMode) return;
        const newItem = { text: '', nestedIdeas: [], tempId: 'id-' + Math.random().toString(36).substr(2, 9) };
        childContainer.appendChild(createNestedIdeaEditorItem(newItem, level + 1));
    };
    
    delBtn.onclick = (e) => {
        e.stopPropagation();
        e.preventDefault();
        if (state.nestedMultiSelectMode) return;
        if (window.showConfirmModal) {
            window.showConfirmModal(
                "Delete Nested Idea?",
                "Are you sure you want to remove this idea?",
                () => {
                    div.remove();
                },
                "ph-trash"
            );
        } else {
            if (confirm("Are you sure you want to remove this idea?")) {
                div.remove();
            }
        }
    };
    
    return div;
}

export function toggleNestedMultiSelect() {
    state.nestedMultiSelectMode = !state.nestedMultiSelectMode;
    state.selectedNestedIds = [];
    
    const container = document.getElementById('nested-ideas-editor-container');
    const btn = document.getElementById('toggle-nested-multi-btn');
    
    if (state.nestedMultiSelectMode) {
        container.classList.add('nested-multi-select-active');
        btn.classList.add('active');
        btn.innerHTML = '<i class="ph ph-x"></i> Exit Multi';
    } else {
        container.classList.remove('nested-multi-select-active');
        btn.classList.remove('active');
        btn.innerHTML = '<i class="ph ph-check-square"></i> Multi';
    }
    
    updateNestedMultiActionBar();
    
    // Efficiently refresh the existing data to re-render in new mode
    const currentData = serializeNestedEditorList(container);
    renderNestedEditorList(container, currentData);
}

export function updateNestedMultiActionBar() {
    const bar = document.getElementById('nested-multi-action-bar');
    if (!state.nestedMultiSelectMode || state.selectedNestedIds.length === 0) {
        bar.classList.add('hidden');
    } else {
        bar.classList.remove('hidden');
    }
}

export function handleNestedAction(action) {
    const container = document.getElementById('nested-ideas-editor-container');
    const data = serializeNestedEditorList(container);
    
    if (action === 'delete') {
        window.showConfirmModal(
            "Delete Selected?",
            `Are you sure you want to delete ${state.selectedNestedIds.length} items?`,
            () => {
                const newData = recursiveFilterById(data, state.selectedNestedIds);
                state.selectedNestedIds = [];
                renderNestedEditorList(container, newData);
                updateNestedMultiActionBar();
            },
            "ph-trash"
        );
        return;
    }

    if (action === 'indent') {
        const newData = moveSelectedNestedItems(data, state.selectedNestedIds, 1);
        renderNestedEditorList(container, newData);
    } else if (action === 'outdent') {
        const newData = moveSelectedNestedItems(data, state.selectedNestedIds, -1);
        renderNestedEditorList(container, newData);
    }
    
    // Selection persists because we use IDs!
    updateNestedMultiActionBar();
}

function recursiveFilterById(data, ids) {
    return data.filter((item) => {
        return !ids.includes(item.tempId);
    }).map((item) => {
        return {
            ...item,
            nestedIdeas: recursiveFilterById(item.nestedIdeas || [], ids)
        };
    });
}

function moveSelectedNestedItems(data, selectedIds, delta) {
    const root = { nestedIdeas: data };
    
    if (delta === 1) { // INDENT
        processIndent(root, selectedIds);
    } else { // OUTDENT
        processOutdent(root, selectedIds);
    }

    return root.nestedIdeas;
}

function processIndent(parent, selectedIds) {
    if (!parent.nestedIdeas) return;

    // Process each level
    const items = parent.nestedIdeas;
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        
        // If this item is selected, try to move it into the previous NON-SELECTED sibling
        if (selectedIds.includes(item.tempId)) {
            // Find the nearest previous sibling that is NOT selected
            let anchorIndex = -1;
            for (let k = i - 1; k >= 0; k--) {
                if (!selectedIds.includes(items[k].tempId)) {
                    anchorIndex = k;
                    break;
                }
            }

            if (anchorIndex !== -1) {
                const anchor = items[anchorIndex];
                anchor.nestedIdeas = anchor.nestedIdeas || [];
                anchor.nestedIdeas.push(item);
                items.splice(i, 1);
                i--; // adjust for removal
            }
        } else {
            // recurse
            processIndent(item, selectedIds);
        }
    }
}

function processOutdent(parent, selectedIds, grandparent = null) {
    if (!parent.nestedIdeas) return;

    const items = parent.nestedIdeas;
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        
        if (selectedIds.includes(item.tempId) && grandparent) {
            // Move item to grandparent's list, after the current parent
            const parentIndex = grandparent.nestedIdeas.indexOf(parent);
            grandparent.nestedIdeas.splice(parentIndex + 1, 0, item);
            items.splice(i, 1);
            i--; // adjust
        } else {
            // recurse
            processOutdent(item, selectedIds, parent);
        }
    }
}

export function serializeNestedEditorList(container) {
    const arr = [];
    const items = Array.from(container.children).filter(el => el.classList.contains('nested-idea-editor-item'));
    items.forEach(item => {
        const input = item.querySelector('.nested-idea-input');
        const childContainer = item.querySelector('.nested-ideas-child-container');
        if (input && input.value.trim() !== '') {
            arr.push({
                text: input.value.trim(),
                tempId: item.dataset.tempId, // Preserve tempId
                nestedIdeas: childContainer ? serializeNestedEditorList(childContainer) : []
            });
        }
    });
    return arr;
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
    if (task.lastAutoMovedAt && (Date.now() - task.lastAutoMovedAt) <= 24 * 60 * 60 * 1000) classes += ' auto-moved-recently';

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
            <button class="icon-btn copy-task-btn" title="Copy Text" onclick="event.stopPropagation(); window.copyTaskToClipboard('${task.id}')" ontouchstart="event.stopPropagation(); window.copyTaskToClipboard('${task.id}')"><i class="ph ph-copy"></i></button>
            <button class="icon-btn unarchive-task-btn" title="Restore" onclick="event.stopPropagation(); window.unarchiveTask('${task.id}')" ontouchstart="event.stopPropagation(); window.unarchiveTask('${task.id}')"><i class="ph ph-arrow-u-up-left"></i></button>
            <button class="icon-btn danger delete-task-btn" title="Delete Forever" onclick="event.stopPropagation(); window.deleteTaskForever('${task.id}')" ontouchstart="event.stopPropagation(); window.deleteTaskForever('${task.id}')"><i class="ph ph-trash"></i></button>
        `;
    } else {
        actionsHtml = `
            <button class="icon-btn copy-task-btn" title="Copy Text" onclick="event.stopPropagation(); window.copyTaskToClipboard('${task.id}')" ontouchstart="event.stopPropagation(); window.copyTaskToClipboard('${task.id}')"><i class="ph ph-copy"></i></button>
            <button class="icon-btn edit-task-btn" title="Edit" onclick="event.stopPropagation(); window.openEditModal('${task.id}', '${sourceListId}')"><i class="ph ph-pencil-simple"></i></button>
            <button class="icon-btn archive-task-btn" title="Archive" onclick="event.stopPropagation(); window.archiveTask('${task.id}')"><i class="ph ph-archive"></i></button>
        `;
    }

    let numberHtml = state.appData.settings.showNumbers ? `<span class="task-number">${number}.</span>` : '';
    let linkedIconHtml = isLinked ? `<i class="ph ph-link" style="font-size: 0.8em; margin-left: 5px; color: var(--accent-blue);" title="Linked to multiple lists"></i>` : '';

    let recentCompletedHtml = '';
    if (state.showRecentCompleted && task.completed && task.completedAt) {
        const diffMs = Date.now() - task.completedAt;
        const diffSecs = Math.max(0, Math.floor(diffMs / 1000));
        const diffMins = Math.floor(diffSecs / 60);
        const diffHrs = Math.floor(diffMins / 60);
        
        let relativeStr = '';
        if (diffHrs > 0) {
            relativeStr = `${diffHrs} hour${diffHrs > 1 ? 's' : ''} ago`;
        } else if (diffMins > 0) {
            relativeStr = `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
        } else {
            relativeStr = `${diffSecs} second${diffSecs !== 1 ? 's' : ''} ago`;
        }

        const timeStr = new Date(task.completedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
        recentCompletedHtml = `<div style="font-size: 0.75rem; color: var(--accent-green); margin-top: 4px;"><i class="ph ph-check-circle"></i> Completed at ${timeStr} (${relativeStr})</div>`;
    }

    let checkboxHtml = '';
    if (!window.APP_CONFIG || !window.APP_CONFIG.hideCheckboxes) {
        checkboxHtml = `
            <input type="checkbox" class="task-checkbox" 
                ${task.completed ? 'checked' : ''} 
                onchange="window.toggleTaskComplete('${task.id}', this.checked)"
                onclick="event.stopPropagation()"
                ontouchstart="event.stopPropagation()">
        `;
    }

    let nestedHtml = task.nestedIdeas ? generateNestedIdeasHtml(task.nestedIdeas) : '';
    const hasNested = task.nestedIdeas && task.nestedIdeas.length > 0;
    const nestedIndicatorHtml = hasNested ? `<i class="ph ph-list-plus nested-indicator" title="Has sub-ideas"></i>` : '';

    el.innerHTML = `
        ${checkboxHtml}
        ${numberHtml}
        <div class="task-content-wrapper">
            <div class="task-text">${escapeHtml(task.text)} ${linkedIconHtml} ${nestedIndicatorHtml}</div>
            ${nestedHtml}
            ${recentCompletedHtml}
            ${imagesHtml}
        </div>
        <div class="task-actions">${actionsHtml}</div>
    `;

    // Expand/Reveal actions logic
    el.addEventListener('click', () => {
        if (task.archived) return;

        const wasShowing = el.classList.contains('show-actions');

        // Close all other open actions
        document.querySelectorAll('.task-card.show-actions').forEach(card => {
            if (card !== el) card.classList.remove('show-actions');
        });

        el.classList.toggle('show-actions', !wasShowing);
    });

    return el;
}

export function updateTotalTaskCount() {
    let totalAll = 0;
    let totalBoard = 0;
    const isArchivedView = state.showArchived;

    // Total All logic
    Object.values(state.appData.tasks).forEach(task => {
        if (isArchivedView) {
            if (task.archived) totalAll++;
        } else {
            if (!task.archived) totalAll++;
        }
    });

    // Total in Board logic
    const currentBoard = state.appData.boards.find(b => b.id === state.appData.currentBoardId);
    if (currentBoard && currentBoard.listOrder) {
        const boardTaskIds = new Set();
        currentBoard.listOrder.forEach(listId => {
            const list = state.appData.rawLists.find(l => l.id === listId);
            if (list && list.taskIds) {
                list.taskIds.forEach(tid => {
                    const task = state.appData.tasks[tid];
                    if (task) {
                        const match = isArchivedView ? task.archived : !task.archived;
                        if (match) boardTaskIds.add(tid);
                    }
                });
            }
        });
        totalBoard = boardTaskIds.size;
    }

    if (totalAll > 0) {
        const prefix = isArchivedView ? "Archived " : "";
        totalTaskCountEl.textContent = `${prefix}Total All: ${totalAll} | In Board: ${totalBoard}`;
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

        let taskUpdates = {};
        if (fromIdRaw !== toIdRaw) {
            taskUpdates[`listAddedAt.${toIdRaw}`] = Date.now();
            taskUpdates.lastAutoMovedAt = null;
        }
        if (fromIdRaw === 'orphan-archive') {
            taskUpdates.archived = false;
        }
        if (Object.keys(taskUpdates).length > 0) {
            batch.update(doc(db, "users", state.currentUser.uid, "tasks", taskId), taskUpdates);
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

    // Reset Nested Multi-Select State
    state.nestedMultiSelectMode = false;
    state.selectedNestedIds = [];
    const multiBtn = document.getElementById('toggle-nested-multi-btn');
    if (multiBtn) {
        multiBtn.classList.remove('active');
        multiBtn.innerHTML = '<i class="ph ph-check-square"></i> Multi';
    }
    const actionBar = document.getElementById('nested-multi-action-bar');
    if (actionBar) actionBar.classList.add('hidden');

    const nestedContainer = document.getElementById('nested-ideas-editor-container');
    if (nestedContainer) {
        nestedContainer.classList.remove('nested-multi-select-active');
        nestedContainer.innerHTML = '';
        renderNestedEditorList(nestedContainer, task.nestedIdeas || []);
    }

    // Populate Timestamps
    document.getElementById('task-created-at').textContent = formatDateTime(task.createdAt);
    document.getElementById('task-updated-at').textContent = formatDateTime(task.updatedAt || task.createdAt);

    const autoItem = document.getElementById('task-automation-item');
    const autoValue = document.getElementById('task-automation-value');
    if (autoItem) autoItem.classList.add('hidden'); 

    const list = state.appData.rawLists.find(l => l.id === listId);
    
    const formatDiff = (diffMs) => {
        const diffSecs = Math.max(0, Math.floor(diffMs / 1000));
        const diffMins = Math.floor(diffSecs / 60);
        const diffHrs = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHrs / 24);
        if (diffDays > 0) return `${diffDays} day${diffDays > 1 ? 's' : ''}`;
        if (diffHrs > 0) return `${diffHrs} hour${diffHrs > 1 ? 's' : ''}`;
        if (diffMins > 0) return `${diffMins} minute${diffMins > 1 ? 's' : ''}`;
        return `${diffSecs} second${diffSecs !== 1 ? 's' : ''}`;
    };

    const autoLabel = document.getElementById('task-automation-label');
    if (autoValue) autoValue.style.color = ''; // reset color

    if (list && list.timeAutomated && list.timeDestinationId) {
        const type = list.timeMoveType || 'duration';
        const val = list.timeDurationValue || 0;
        const unit = list.timeDurationUnit || 'days';
        
        let multiplier = 1000 * 60; // minutes
        if (unit === 'hours') multiplier *= 60;
        if (unit === 'days') multiplier *= 60 * 24;
        if (unit === 'weeks') multiplier *= 60 * 24 * 7;
        if (unit === 'months') multiplier *= 60 * 24 * 30; // approx
        if (unit === 'years') multiplier *= 60 * 24 * 365; // approx
        
        const durationMs = val * multiplier;
        const addedAt = task.listAddedAt?.[list.id] || task.createdAt;
        const targetMs = addedAt + durationMs;

        if (type === 'duration') {
            if (Date.now() >= targetMs) {
                if (autoLabel) autoLabel.textContent = "Auto-Move Status:";
                if (autoValue) autoValue.innerHTML = `<span style="color:var(--accent-red)">Overdue (Pending Move)</span>`;
            } else {
                if (autoLabel) autoLabel.textContent = "Auto-Moves in:";
                if (autoValue) autoValue.textContent = `${formatDiff(targetMs - Date.now())} at ${formatDateTime(targetMs)}`;
            }
            if (autoItem) autoItem.classList.remove('hidden');
        } else if (type === 'schedule') {
            const timeStr = list.scheduleTime || '00:00';
            const [hours, mins] = timeStr.split(':').map(Number);
            const minDateMs = Math.max(Date.now(), targetMs);
            
            let candidate = new Date(minDateMs);
            candidate.setHours(hours, mins, 0, 0);
            
            // If the calculated time for the starting day is in the past compared to our minimum required date
            if (candidate.getTime() <= minDateMs) {
                candidate.setDate(candidate.getDate() + 1);
            }
            
            const sType = list.scheduleType || 'daily';
            let safeCounter = 0;
            while (safeCounter < 40) {
                if (sType === 'weekly' && candidate.getDay() !== 1) {
                    candidate.setDate(candidate.getDate() + 1);
                } else if (sType === 'monthly' && candidate.getDate() !== 1) {
                    candidate.setDate(candidate.getDate() + 1);
                } else {
                    break;
                }
                safeCounter++;
            }
            
            const nextRunMs = candidate.getTime();
            
            if (autoLabel) autoLabel.textContent = "Auto-Moves in:";
            if (autoValue) autoValue.textContent = `${formatDiff(nextRunMs - Date.now())} at ${formatDateTime(nextRunMs)}`;
            if (autoItem) autoItem.classList.remove('hidden');
        }
    } else if (task.lastAutoMovedAt && (Date.now() - task.lastAutoMovedAt) <= 24 * 60 * 60 * 1000) {
        if (autoLabel) autoLabel.textContent = "Auto-Moved:";
        if (autoValue) {
            autoValue.textContent = `${formatDiff(Date.now() - task.lastAutoMovedAt)} ago at ${formatDateTime(task.lastAutoMovedAt)}`;
            autoValue.style.color = 'var(--accent-green)';
        }
        if (autoItem) autoItem.classList.remove('hidden');
    }

    const select = document.getElementById('manual-move-select');
    renderGroupedListSelect(select);

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

    // Add Image Button in Modal
    const modalAddImageBtn = document.getElementById('modal-add-image-btn');
    if (modalAddImageBtn) {
        modalAddImageBtn.onclick = () => {
            window.triggerImageUpload(taskId);
        };
    }

    modalOverlay.classList.remove('hidden');
    const input = document.getElementById('modal-task-input');
    if (input) input.focus();
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
        // Find board for this list
        const board = state.appData.boards.find(b => b.listOrder && b.listOrder.includes(list.id));
        const boardName = board ? board.title : 'Unassigned';

        const div = document.createElement('div');
        div.className = 'location-item';
        div.innerHTML = `
            <div style="display: flex; flex-direction: column;">
                <span class="location-name">${escapeHtml(list.title)}</span>
                <span style="font-size: 0.75rem; color: var(--text-secondary); opacity: 0.8;">Board: ${escapeHtml(boardName)}</span>
            </div>
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
    const bulkModal = document.getElementById('bulk-add-modal-overlay');
    bulkModal.dataset.listId = listId;
    bulkModal.classList.remove('hidden');
    const input = document.getElementById('bulk-add-input');
    if (input) input.focus();
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
    const deleteBtn = document.getElementById('multi-delete-forever-btn');
    const editBtn = document.getElementById('multi-edit-action-btn');
    
    const count = state.selectedTaskIds.size;
    selectedCountEl.textContent = `${count} Selected`;
    
    if (count > 0) {
        floatingBar.classList.remove('hidden');
        if (state.showArchived) {
            deleteBtn.classList.remove('hidden');
            deleteBtn.style.display = 'flex';
            editBtn.classList.add('hidden');
            editBtn.style.display = 'none';
        } else {
            deleteBtn.classList.add('hidden');
            deleteBtn.style.display = 'none';
            editBtn.classList.remove('hidden');
            editBtn.style.display = 'flex';
        }
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
    const isCustomSort = state.appData.settings.sortMode === 'custom';
    const isDragEnabled = state.appData.settings.dragEnabled;
    const shouldDisableList = !enable || !isDragEnabled;

    if (state.listSortable) state.listSortable.option("disabled", shouldDisableList);
    state.sortableInstances.forEach(s => {
        const isOrphan = s.el.closest('.orphan-list') !== null;
        const shouldDisableTasks = isOrphan 
            ? (!enable || !isDragEnabled) 
            : (!enable || !isDragEnabled || !isCustomSort);
        s.option("disabled", shouldDisableTasks);
    });
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
    const searchTerm = getTerm(false);

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
                matches.push({ task, context: [{ boardName: 'System', listName: 'Archived / Orphan', index: '-' }] });
            } else if (getOrphanedTaskIds().includes(task.id)) {
                matches.push({ task, context: [{ boardName: 'System', listName: 'Orphan', index: '-' }] });
            }
        }
    });

    if (matches.length === 0) {
        searchEmptyState.classList.remove('hidden');
        searchEmptyState.querySelector('p').textContent = `No ${getTerm(false)} found.`;
    } else {
        searchEmptyState.classList.add('hidden');
        matches.forEach(match => {
            renderSearchResultItem(match.task, match.context);
        });
    }
}

function getTaskContext(taskId) {
    const contexts = [];
    const allLists = state.appData.rawLists || [];
    
    allLists.forEach(list => {
        if (list.taskIds && list.taskIds.includes(taskId)) {
            const index = list.taskIds.indexOf(taskId) + 1;
            // Find board for this list
            const board = state.appData.boards.find(b => b.listOrder && b.listOrder.includes(list.id));
            contexts.push({
                boardName: board ? board.title : 'Unassigned',
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
        badge.style.display = 'flex';
        badge.style.alignItems = 'center';
        badge.style.gap = '5px';
        badge.innerHTML = `
            <i class="ph ph-layout" title="Board"></i> ${ctx.boardName} 
            <i class="ph ph-caret-right" style="opacity:0.5; font-size:0.8rem;"></i>
            <i class="ph ph-list-dashes" title="List"></i> ${ctx.listName} 
            <span style="opacity:0.6; margin-left:3px;">#${ctx.index}</span>
        `;
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
    if (state.multiEditMode) return;
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

// --- MOBILE REORDER ---
let mobileSortableInstance = null;

export function openMobileReorderModal() {
    const modal = document.getElementById('mobile-reorder-modal-overlay');
    const container = document.getElementById('mobile-reorder-list-container');

    // Clear old
    container.innerHTML = '';

    // Get lists excluding orphan-archive
    const activeLists = state.appData.lists.filter(l => l.id !== 'orphan-archive');

    activeLists.forEach(list => {
        const item = document.createElement('div');
        item.className = 'mobile-reorder-list-item';
        item.dataset.listId = list.id;
        item.innerHTML = `
            <i class="ph ph-dots-six-vertical list-drag-handle" style="opacity: 0.5;"></i>
            <span style="flex-grow: 1; pointer-events: none;">${escapeHtml(list.title)}</span>
            <i class="ph ph-list" style="opacity: 0.5;"></i>
        `;
        container.appendChild(item);
    });

    // Init sortable if not already or destroy old
    if (mobileSortableInstance) mobileSortableInstance.destroy();

    mobileSortableInstance = new Sortable(container, {
        disabled: !state.appData.settings.dragEnabled,
        animation: 150,
        handle: '.mobile-reorder-list-item', // They drag the whole card
        forceFallback: true,
        fallbackOnBody: true,
        delay: 200,
        delayOnTouchOnly: true
    });

    modal.classList.remove('hidden');
}

export function saveMobileReorder() {
    const container = document.getElementById('mobile-reorder-list-container');
    const newOrder = Array.from(container.children).map(el => el.dataset.listId);

    // Update DB
    updateDoc(doc(db, "users", state.currentUser.uid), { listOrder: newOrder })
        .then(() => {
            document.getElementById('mobile-reorder-modal-overlay').classList.add('hidden');
            showToast("Lists reordered");
        })
        .catch(e => handleSyncError(e));
}

/**
 * Opens the new Edit List Modal
 */
export function openEditListModal(listId) {
    const list = state.appData.rawLists.find(l => l.id === listId);
    if (!list) return;

    const modal = document.getElementById('edit-list-modal-overlay');
    const titleEl = document.getElementById('edit-list-title');
    const descInput = document.getElementById('edit-list-description-input');
    const bulkInput = document.getElementById('edit-list-bulk-input');
    const boardSelect = document.getElementById('edit-list-board-select');
    const deleteBtn = document.getElementById('edit-list-delete-btn');
    const moveBtn = document.getElementById('edit-list-move-btn');
    const bulkAddBtn = document.getElementById('edit-list-bulk-add-btn');

    modal.dataset.listId = listId;
    titleEl.textContent = `Manage: ${list.title}`;
    descInput.value = list.description || '';
    bulkInput.value = '';

    // Populate Boards Select
    boardSelect.innerHTML = '<option value="" disabled selected>Select Board...</option>';
    state.appData.boards.forEach(board => {
        const option = document.createElement('option');
        option.value = board.id;
        option.textContent = board.title;
        // Mark current board
        const currentBoard = state.appData.boards.find(b => b.listOrder && b.listOrder.includes(listId));
        if (currentBoard && board.id === currentBoard.id) {
            option.textContent += ' (Current)';
        }
        boardSelect.appendChild(option);
    });

    // --- TIME AUTOMATION UI ---
    const oldAutoToggle = document.getElementById('automation-enable-toggle');
    const pAutoToggle = oldAutoToggle.cloneNode(true);
    oldAutoToggle.parentNode.replaceChild(pAutoToggle, oldAutoToggle);

    const oldAutoTrigger = document.getElementById('automation-trigger-select');
    const pAutoTrigger = oldAutoTrigger.cloneNode(true);
    oldAutoTrigger.parentNode.replaceChild(pAutoTrigger, oldAutoTrigger);

    const unlockBtn = document.getElementById('automation-unlock-btn');
    const newUnlockBtn = unlockBtn.cloneNode(true);
    unlockBtn.parentNode.replaceChild(newUnlockBtn, unlockBtn);

    const pAutoContainer = document.getElementById('automation-settings-container');
    const pAutoDurationVal = document.getElementById('automation-duration-val');
    const pAutoDurationUnit = document.getElementById('automation-duration-unit');
    const pAutoScheduleGroup = document.getElementById('automation-schedule-group');
    const pAutoScheduleType = document.getElementById('automation-schedule-type');
    const pAutoScheduleTime = document.getElementById('automation-schedule-time');
    const pAutoDestList = document.getElementById('automation-dest-list');
    
    // Clone save btn early so it can be managed by lock state
    const pAutoSaveBtn = document.getElementById('automation-save-btn');
    const newSaveBtn = pAutoSaveBtn.cloneNode(true);
    pAutoSaveBtn.parentNode.replaceChild(newSaveBtn, pAutoSaveBtn);

    const pAutoDurationLabel = document.getElementById('automation-duration-label');

    let isAutomationUnlocked = false;
    const setAutomationLockState = (unlocked) => {
        isAutomationUnlocked = unlocked;
        const inputs = [pAutoToggle, pAutoTrigger, pAutoDurationVal, pAutoDurationUnit, pAutoScheduleType, pAutoScheduleTime, pAutoDestList, newSaveBtn];
        inputs.forEach(el => el.disabled = !unlocked);
        pAutoContainer.style.opacity = unlocked ? '1' : '0.5';
        pAutoContainer.style.pointerEvents = unlocked ? 'auto' : 'none';
        newUnlockBtn.innerHTML = unlocked ? '<i class="ph ph-lock-key-open"></i> Lock' : '<i class="ph ph-lock-key"></i> Edit Time Automation';
    };
    newUnlockBtn.onclick = () => setAutomationLockState(!isAutomationUnlocked);
    setAutomationLockState(false);

    pAutoToggle.checked = !!list.timeAutomated;
    if (list.timeAutomated) {
        pAutoContainer.classList.remove('hidden');
    } else {
        pAutoContainer.classList.add('hidden');
    }

    pAutoToggle.addEventListener('change', (e) => {
        if (e.target.checked) pAutoContainer.classList.remove('hidden');
        else pAutoContainer.classList.add('hidden');
    });

    pAutoTrigger.value = list.timeMoveType || 'duration';
    pAutoDurationVal.value = list.timeDurationValue || 0;
    pAutoDurationUnit.value = list.timeDurationUnit || 'days';
    pAutoScheduleType.value = list.scheduleType || 'daily';
    pAutoScheduleTime.value = list.scheduleTime || '00:00';

    const updateTriggerUI = () => {
        if (pAutoTrigger.value === 'schedule') {
            pAutoScheduleGroup.classList.remove('hidden');
            pAutoDurationLabel.textContent = "Rules apply to tasks older than (0 for all):";
        } else {
            pAutoScheduleGroup.classList.add('hidden');
            pAutoDurationLabel.textContent = "Move tasks after:";
        }
    };
    pAutoTrigger.addEventListener('change', updateTriggerUI);
    updateTriggerUI();

    pAutoDestList.innerHTML = '<option value="" disabled selected>Select List...</option>';
    state.appData.rawLists.forEach(l => {
        if (l.id !== list.id && l.id !== 'orphan-archive') {
            const opt = document.createElement('option');
            opt.value = l.id;
            opt.textContent = l.title;
            if (list.timeDestinationId === l.id) opt.selected = true;
            pAutoDestList.appendChild(opt);
        }
    });

    newSaveBtn.onclick = () => {
        updateDoc(doc(db, "users", state.currentUser.uid, "lists", listId), {
            timeAutomated: pAutoToggle.checked,
            timeMoveType: pAutoTrigger.value,
            timeDurationValue: parseInt(pAutoDurationVal.value) || 0,
            timeDurationUnit: pAutoDurationUnit.value,
            scheduleType: pAutoScheduleType.value,
            scheduleTime: pAutoScheduleTime.value,
            timeDestinationId: pAutoDestList.value || null
        }).then(() => {
            showToast("Automation Settings Saved!", "success");
        }).catch(e => handleSyncError(e));
    };
    // --- END TIME AUTOMATION UI ---

    modal.classList.remove('hidden');

    // Remove old listeners
    const newBulk = bulkAddBtn.cloneNode(true);
    bulkAddBtn.parentNode.replaceChild(newBulk, bulkAddBtn);

    const newMove = moveBtn.cloneNode(true);
    moveBtn.parentNode.replaceChild(newMove, moveBtn);

    const newDelete = deleteBtn.cloneNode(true);
    deleteBtn.parentNode.replaceChild(newDelete, deleteBtn);

    // Handlers
    newBulk.onclick = () => {
        const text = bulkInput.value;
        const items = parseNestedMarkdown(text);
        if (items.length === 0) return;

        const batch = writeBatch(db);
        const listRef = doc(db, "users", state.currentUser.uid, "lists", listId);

        items.forEach(item => {
            const newId = generateId();
            batch.set(doc(db, "users", state.currentUser.uid, "tasks", newId), {
                text: item.text,
                nestedIdeas: item.nestedIdeas || [],
                completed: false,
                archived: false,
                createdAt: Date.now(),
                images: [],
                glowColor: 'none',
                listAddedAt: { [listId]: Date.now() }
            });
            batch.update(listRef, { taskIds: arrayUnion(newId) });
        });
        batch.commit().catch(e => handleSyncError(e));
        bulkInput.value = '';
        showToast("Bulk tasks added!", "success");
    };

    newMove.onclick = () => {
        const targetBoardId = boardSelect.value;
        if (!targetBoardId) return;
        import('./api.js').then(api => {
            api.moveListToBoard(listId, targetBoardId).then(() => {
                modal.classList.add('hidden');
            });
        });
    };

    newDelete.onclick = () => {
        window.showConfirmModal(
            `Delete ${getTerm(true, true)} List?`,
            `Are you sure you want to delete this list and all ${getTerm(false)} inside it? This action cannot be undone.`,
            () => {
                import('./api.js').then(api => {
                    api.deleteList(listId).then((success) => {
                        if (success !== false) modal.classList.add('hidden');
                    });
                });
            },
            "ph-trash"
        );
    };
}
// --- BOARD MODAL LISTENERS ---
document.getElementById('close-board-modal-btn').onclick = () => {
    document.getElementById('board-modal-overlay').classList.add('hidden');
};

document.getElementById('modal-add-board-btn').onclick = () => {
    document.getElementById('add-board-modal-overlay').classList.remove('hidden');
    const input = document.getElementById('new-board-title-input');
    input.value = '';
    input.focus();
};

document.getElementById('modal-rescue-boards-btn').onclick = () => {
    window.rescueOrphanLists();
};

// Add Board Modal
document.getElementById('cancel-add-board-btn').onclick = () => {
    document.getElementById('add-board-modal-overlay').classList.add('hidden');
};

document.getElementById('confirm-add-board-btn').onclick = () => {
    const title = document.getElementById('new-board-title-input').value.trim();
    if (!title) return;
    
    window.addNewBoard(title).then(() => {
        document.getElementById('add-board-modal-overlay').classList.add('hidden');
        document.getElementById('board-modal-overlay').classList.add('hidden');
        renderBoard(); // Re-render to show new board in layout if needed
    });
};

// Also handle Enter key in new board input
document.getElementById('new-board-title-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        document.getElementById('confirm-add-board-btn').click();
    }
});

export function showAutomationReport(movedTasksLog, title = `${getTerm(false, true)} Auto-Moved`, subtitle = `The following ${getTerm(false)} were moved automatically:`) {
    if (!movedTasksLog || movedTasksLog.length === 0) return;
    if (isUserTyping()) {
        console.log("[Automation] User is typing, suppression modal popup.");
        return;
    }
    const modal = document.getElementById('automation-report-modal-overlay');
    const listContainer = document.getElementById('automation-report-list');
    if (!modal || !listContainer) return;
    
    const h2 = modal.querySelector('h2');
    if(h2) h2.textContent = title;
    
    const p = modal.querySelector('p');
    if(p) p.textContent = subtitle;

    listContainer.innerHTML = '';
    movedTasksLog.forEach(log => {
        const item = document.createElement('div');
        item.style.padding = '10px';
        item.style.marginBottom = '10px';
        item.style.background = 'rgba(255, 255, 255, 0.05)';
        item.style.borderRadius = '8px';
        item.style.fontSize = '0.9rem';
        item.innerHTML = `
            <div style="font-weight: bold; margin-bottom: 4px;">${log.text}</div>
            <div style="font-size: 0.8rem; color: var(--text-secondary);">
                <i class="ph ph-arrow-circle-right" style="color: var(--accent-blue);"></i> Moved from <strong>${log.from}</strong> to <strong>${log.to}</strong>
            </div>
        `;
        listContainer.appendChild(item);
    });
    
    modal.classList.remove('hidden');
}

export function showRecentAutoMovedTasks() {
    const now = Date.now();
    const twentyFourHours = 24 * 60 * 60 * 1000;
    const recentTasks = [];

    Object.values(state.appData.tasks).forEach(task => {
        if (task.lastAutoMovedAt && (now - task.lastAutoMovedAt) <= twentyFourHours) {
            const fromList = state.appData.rawLists.find(l => l.id === task.lastAutoMovedFromListId)?.title || "Unknown List";
            const toList = state.appData.rawLists.find(l => l.id === task.lastAutoMovedToListId)?.title || "Unknown List";
            recentTasks.push({
                text: escapeHtml(task.text),
                from: escapeHtml(fromList),
                to: escapeHtml(toList),
                timeMs: task.lastAutoMovedAt
            });
        }
    });

    if (recentTasks.length === 0) {
        import('./utils.js').then(utils => utils.showToast("No tasks moved by automation in the last 24 hours.", "info"));
        return;
    }

    recentTasks.sort((a, b) => b.timeMs - a.timeMs);
    showAutomationReport(recentTasks, "Recent Automations", "Tasks moved by Time Automation in the last 24 hours:");
}
