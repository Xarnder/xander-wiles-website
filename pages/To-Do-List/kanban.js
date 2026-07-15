import { state } from './store.js';
import { escapeHtml, showToast, getTerm } from './utils.js';

export const KANBAN_STAGES = ['new', 'under_review', 'almost_done', 'finished'];

export const DEFAULT_KANBAN_LABELS = {
    new: 'New',
    under_review: 'Under Review',
    almost_done: 'Almost Done',
    finished: 'Finished'
};

export function getKanbanColumnLabel(key) {
    const labels = state.appData.settings.kanbanColumnLabels || {};
    const custom = labels[key];
    if (custom && String(custom).trim()) return String(custom).trim();
    return DEFAULT_KANBAN_LABELS[key] || key;
}

export function isValidKanbanStatus(status) {
    return KANBAN_STAGES.includes(status);
}

/** Adjacent stages for compact left/right move controls. */
export function getAdjacentKanbanStages(status) {
    const idx = KANBAN_STAGES.indexOf(status);
    if (idx < 0) {
        return { prev: null, next: KANBAN_STAGES[1] || null };
    }
    return {
        prev: idx > 0 ? KANBAN_STAGES[idx - 1] : null,
        next: idx < KANBAN_STAGES.length - 1 ? KANBAN_STAGES[idx + 1] : null
    };
}

/**
 * Resolve display/write stage for a task (Q4 + Q3 consistency).
 */
export function resolveKanbanStatus(task) {
    if (!task) return 'new';

    const raw = task.kanbanStatus;
    if (isValidKanbanStatus(raw)) {
        // Heal stale mismatches for display until next write
        if (task.completed && raw !== 'finished') return 'finished';
        if (!task.completed && raw === 'finished') return 'almost_done';
        return raw;
    }

    return task.completed ? 'finished' : 'new';
}

/**
 * Firestore fields for a stage change (Finished ↔ completed sync).
 */
export function buildKanbanStatusUpdate(status) {
    if (!isValidKanbanStatus(status)) {
        throw new Error(`Invalid kanban status: ${status}`);
    }
    if (status === 'finished') {
        return {
            kanbanStatus: 'finished',
            completed: true,
            completedAt: Date.now(),
            updatedAt: Date.now()
        };
    }
    return {
        kanbanStatus: status,
        completed: false,
        completedAt: null,
        updatedAt: Date.now()
    };
}

/**
 * Partition tasks by stage; important tasks live in their stage's pinned subsection.
 */
export function isImportantTask(task) {
    if (!task?.text) return false;
    return task.text.includes('!!') || task.text.includes('!');
}

export function partitionListTasksByStage(list) {
    const buckets = {};
    KANBAN_STAGES.forEach((stage) => {
        buckets[stage] = { pinned: [], normal: [] };
    });

    const taskIds = list.taskIds || [];
    const pinningDisabled = !!state.appData.settings.disableImportantPinning;

    taskIds.forEach((taskId) => {
        const task = state.appData.tasks[taskId];
        if (!task || task.archived) return;

        const stage = resolveKanbanStatus(task);
        const shouldPin = isImportantTask(task) && !pinningDisabled;
        if (shouldPin) {
            buckets[stage].pinned.push(task);
        } else {
            buckets[stage].normal.push(task);
        }
    });

    return buckets;
}

export function isWorkToolsEnabled() {
    return !!state.appData.settings.workToolsEnabled;
}

export function isKanbanFocused() {
    return !!(state.focusedKanbanListId && isWorkToolsEnabled());
}

export function clearExclusiveViewModes() {
    if (state.showArchived) {
        state.showArchived = false;
        const archiveBtn = document.getElementById('archive-mode-btn');
        if (archiveBtn) archiveBtn.classList.remove('active');
        const badge = document.getElementById('archive-view-badge');
        if (badge) badge.remove();
    }
    if (state.showRecentCompleted) {
        state.showRecentCompleted = false;
        const recentBtn = document.getElementById('recent-completed-btn');
        if (recentBtn) recentBtn.classList.remove('active');
    }
}

export function exitKanbanFocus({ render = true, silent = false } = {}) {
    if (!state.focusedKanbanListId) return;
    state.focusedKanbanListId = null;
    document.body.classList.remove('kanban-focus-mode');
    if (!silent) showToast('Exited Kanban view');
    if (render && typeof window.renderBoard === 'function') {
        window.renderBoard();
    }
}

export function toggleKanbanFocus(listId) {
    if (!isWorkToolsEnabled() || !listId) return;

    if (state.focusedKanbanListId === listId) {
        exitKanbanFocus();
        return;
    }

    clearExclusiveViewModes();
    state.focusedKanbanListId = listId;
    document.body.classList.add('kanban-focus-mode');
    showToast('Kanban view');
    if (typeof window.renderBoard === 'function') {
        window.renderBoard();
    }
}

/**
 * Focus chrome + connected Kanban board (headers / stretch / bodies).
 * Tasks filled by ui.populateKanbanFocus.
 */
export function renderKanbanFocus(boardContainer, list) {
    document.body.classList.add('kanban-focus-mode');
    boardContainer.classList.add('kanban-focus-board');

    const shell = document.createElement('div');
    shell.className = 'kanban-focus-shell';
    shell.dataset.listId = list.id;

    const headersHtml = KANBAN_STAGES.map((stage, index) => {
        const label = escapeHtml(getKanbanColumnLabel(stage));
        return `
            <div class="kanban-column-header" data-stage="${stage}" data-list-id="${list.id}" style="grid-column:${index + 1}">
                <h3 class="kanban-column-title">${label}</h3>
                <span class="kanban-column-count" data-stage-count="${stage}">0</span>
            </div>
        `;
    }).join('');

    const pinnedZonesHtml = KANBAN_STAGES.map((stage, index) => {
        return `
            <div class="kanban-pinned-zone" id="kanban-pinned-${list.id}-${stage}"
                data-kanban-stage="${stage}" data-list-id="${list.id}"
                style="grid-column:${index + 1}"></div>
        `;
    }).join('');

    const panesHtml = KANBAN_STAGES.map((stage, index) => {
        return `
            <div class="kanban-column-pane" data-stage="${stage}" data-list-id="${list.id}" style="grid-column:${index + 1}">
                <div class="kanban-column-body">
                    <div class="task-list kanban-stage-tasks" id="kanban-stage-${list.id}-${stage}" data-kanban-stage="${stage}"></div>
                </div>
            </div>
        `;
    }).join('');

    shell.innerHTML = `
        <div class="kanban-focus-bar">
            <div class="kanban-focus-bar-left">
                <button type="button" class="icon-btn kanban-toggle-btn kanban-close-btn is-active"
                    onclick="window.toggleKanbanFocus('${list.id}')"
                    title="Close Kanban"
                    aria-pressed="true"
                    aria-label="Close Kanban">
                    <i class="ph ph-x"></i>
                </button>
                <span class="kanban-focus-eyebrow"><i class="ph ph-kanban"></i> Kanban</span>
                <input type="text" class="list-title kanban-focus-title" value="${list.title.replace(/"/g, '&quot;')}"
                    onchange="window.updateListTitle('${list.id}', this.value)"
                    spellcheck="true" autocorrect="on" autocomplete="on" autocapitalize="sentences"
                    aria-label="List title">
            </div>
            <div class="kanban-focus-bar-right">
                <button type="button" class="icon-btn multi-select-all-btn" onclick="window.selectAllInList('${list.id}')" title="Select All in List">
                    <i class="ph ph-check-square-offset"></i>
                </button>
                <button type="button" class="icon-btn list-action-btn" onclick="window.openEditListModal('${list.id}')" title="Edit List Settings">
                    <i class="ph ph-sliders"></i>
                </button>
            </div>
        </div>
        <div class="kanban-board-add hidden" id="kanban-add-top-${list.id}" data-add-position="top"></div>
        <div class="kanban-columns" role="region" aria-label="Kanban columns for ${escapeHtml(list.title)}">
            ${headersHtml}
            <div class="kanban-pinned-band hidden" id="kanban-pinned-band-${list.id}" aria-label="Pinned tasks">
                <div class="kanban-pinned-header"><i class="ph ph-push-pin-simple-fill"></i> Pinned</div>
                <div class="kanban-pinned-stretch-grid" id="kanban-pinned-stretch-${list.id}"></div>
                <div class="kanban-pinned-zones-row" id="kanban-pinned-grid-${list.id}">
                    ${pinnedZonesHtml}
                </div>
            </div>
            <div class="kanban-body-stack">
                <div class="kanban-stretch-grid" id="kanban-stretch-grid-${list.id}"></div>
                <div class="kanban-panes-row" id="kanban-panes-row-${list.id}">
                    ${panesHtml}
                </div>
            </div>
        </div>
        <div class="kanban-board-add hidden" id="kanban-add-bottom-${list.id}" data-add-position="bottom"></div>
    `;

    boardContainer.appendChild(shell);
}

export function getKanbanEmptyMessage() {
    return `<div class="empty-list-msg kanban-empty-msg"><i class="ph ph-shooting-star"></i> No ${getTerm(false)} here</div>`;
}
