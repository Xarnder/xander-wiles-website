import { state } from './store.js';
import { escapeHtml, showToast, getTerm } from './utils.js';

export const GROUP_BY_TAG_ICON = `<svg class="group-by-tag-icon" viewBox="0 0 478 512.29" aria-hidden="true" focusable="false"><path fill="currentColor" d="M161.37 115.54H129.6V505.7c0 3.34-3.25 6.59-6.58 6.59H52.94c-3.41 0-6.63-2.94-6.63-6.59V115.54H14.58c-3.37 0-6.82-1.15-9.56-3.57-6.1-5.27-6.7-14.51-1.46-20.58L78.84 4.96c5.99-6.62 16.46-6.7 22.25.28l71.07 85.87c2.38 2.62 3.81 6.11 3.81 9.84 0 8.13-6.51 14.59-14.6 14.59zm50.02 396.75c-3.33 0-6.59-3.25-6.59-6.59v-56.59c0-3.38 2.94-6.63 6.59-6.63h260.03c3.65 0 6.58 3.25 6.58 6.63v56.59c0 3.34-3.25 6.59-6.58 6.59H211.39zm0-142.11c-3.17 0-6.59-3.38-6.59-6.59v-56.6c0-3.25 2.98-6.62 6.59-6.62h192.84c3.61 0 6.58 3.25 6.58 6.62v56.6c0 3.33-3.33 6.59-6.58 6.59H211.39zm0-142.11c-3.17 0-6.59-3.34-6.59-6.59v-56.6c0-3.29 2.94-6.62 6.59-6.62h125.65c3.65 0 6.58 3.25 6.58 6.62v56.6c0 3.33-3.33 6.59-6.58 6.59H211.39z"/></svg>`;

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

export function isListFreezeImportantEnabled(list) {
    if (!list) return false;
    if (typeof list.freezeImportant === 'boolean') {
        return list.freezeImportant;
    }
    return !state.appData.settings?.disableImportantPinning;
}

export function partitionListTasksByStage(list) {
    const buckets = {};
    KANBAN_STAGES.forEach((stage) => {
        buckets[stage] = { pinned: [], lead: [], normal: [] };
    });

    const taskIds = list.taskIds || [];
    const isFrozen = isListFreezeImportantEnabled(list);

    taskIds.forEach((taskId) => {
        const task = state.appData.tasks[taskId];
        if (!task || task.archived) return;

        const stage = resolveKanbanStatus(task);
        const isImportant = isImportantTask(task);
        const shouldPin = isImportant && isFrozen;
        if (shouldPin) {
            buckets[stage].pinned.push(task);
        } else if (isImportant) {
            buckets[stage].lead.push(task);
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
    state.focusedMasonryListId = null;
    document.body.classList.remove('masonry-focus-mode', 'masonry-slim');
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
                <button type="button" class="icon-btn freeze-list-btn ${isListFreezeImportantEnabled(list) ? 'active' : ''}" onclick="window.toggleListFreezeImportant('${list.id}')" title="${isListFreezeImportantEnabled(list) ? 'Important tasks frozen at top (click to unfreeze)' : 'Important tasks unfrozen (click to freeze at top)'}" aria-label="Toggle freeze important tasks" aria-pressed="${isListFreezeImportantEnabled(list)}">
                    <i class="${isListFreezeImportantEnabled(list) ? 'ph-fill ph-push-pin' : 'ph ph-push-pin'}"></i>
                </button>
                <button type="button" class="icon-btn group-by-tag-btn" onclick="window.groupListByTag('${list.id}')" title="Group by tag" aria-label="Group tasks by tag">
                    ${GROUP_BY_TAG_ICON}
                </button>
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
