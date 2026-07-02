import {
    createIdea,
    updateIdea,
    deleteIdea
} from './api.js';
import { onAuthChange } from './auth.js';
import { doc, writeBatch, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js';
import { db } from './firebase-config.js';

let modalEl = null;
let formEl = null;
let editingId = null;
let editMode = false;

const EDIT_MODE_KEY = 'athome-edit-mode';

function getAtHome() {
    return window.AtHome || null;
}

function isEditModeActive() {
    return document.body.classList.contains('athome-owner')
        && document.body.classList.contains('athome-edit-mode');
}

function applyEditModeUI() {
    const toggle = document.getElementById('adminEditToggle');
    const actions = document.getElementById('adminBarActions');

    document.body.classList.toggle('athome-edit-mode', editMode);

    if (toggle) {
        toggle.setAttribute('aria-pressed', String(editMode));
        toggle.classList.toggle('is-active', editMode);
    }

    if (actions) {
        actions.hidden = !editMode;
    }

    window.dispatchEvent(new CustomEvent('athome:edit-mode', {
        detail: { editMode }
    }));

    getAtHome()?.refresh?.();
}

function setEditMode(next) {
    editMode = Boolean(next);
    if (editMode) {
        localStorage.setItem(EDIT_MODE_KEY, '1');
    } else {
        localStorage.removeItem(EDIT_MODE_KEY);
    }
    applyEditModeUI();
}

function toggleEditMode() {
    setEditMode(!editMode);
}

function resetEditMode() {
    editMode = false;
    localStorage.removeItem(EDIT_MODE_KEY);
    applyEditModeUI();
}

function restoreEditModeForOwner() {
    editMode = localStorage.getItem(EDIT_MODE_KEY) === '1';
    applyEditModeUI();
}

function cacheModal() {
    modalEl = document.getElementById('ideaEditor');
    formEl = document.getElementById('ideaEditorForm');
}

function openModal(mode = 'create', row = null) {
    if (!modalEl || !formEl) return;

    editingId = mode === 'edit' && row ? row.ideaId : null;
    modalEl.hidden = false;
    document.body.classList.add('editor-open');

    const title = document.getElementById('ideaEditorTitle');
    if (title) title.textContent = mode === 'edit' ? 'Edit idea' : 'Add idea';

    formEl.section.value = row?.section || '';
    formEl.subsection.value = row?.subsection || '';
    formEl.level.value = row?.level || 1;
    formEl.parentItem.value = row?.parentItem || '';
    formEl.title.value = row?.title || '';
    formEl.description.value = row?.description || row?.fullText || '';
    formEl.fullText.value = row?.fullText || '';

    document.getElementById('ideaEditorSave')?.focus();
}

function closeModal() {
    if (!modalEl) return;
    modalEl.hidden = true;
    document.body.classList.remove('editor-open');
    editingId = null;
    formEl?.reset();
}

async function handleSave(event) {
    event.preventDefault();
    if (!formEl) return;

    const payload = {
        section: formEl.section.value,
        subsection: formEl.subsection.value,
        level: formEl.level.value,
        parentItem: formEl.parentItem.value,
        title: formEl.title.value,
        description: formEl.description.value,
        fullText: formEl.fullText.value || formEl.description.value
    };

    const saveBtn = document.getElementById('ideaEditorSave');
    if (saveBtn) saveBtn.disabled = true;

    try {
        if (editingId) {
            await updateIdea(editingId, payload);
        } else {
            await createIdea(payload);
        }
        closeModal();
    } catch (error) {
        console.error('[AtHome] Could not save idea', error);
        alert(error.message || 'Could not save idea.');
    } finally {
        if (saveBtn) saveBtn.disabled = false;
    }
}

async function handleDelete(ideaId) {
    const atHome = getAtHome();
    const row = atHome?.findRowByIdeaId?.(ideaId);
    const label = row?.title || ideaId;
    if (!window.confirm(`Delete "${label}" and its images?`)) return;

    try {
        await deleteIdea(ideaId);
    } catch (error) {
        console.error('[AtHome] Could not delete idea', error);
        alert(error.message || 'Could not delete idea.');
    }
}

async function moveIdeaInSection(ideaId, direction) {
    const atHome = getAtHome();
    const rows = atHome?.getRows?.() || [];
    const row = rows.find((item) => item.ideaId === ideaId);
    if (!row) return;

    const siblings = rows
        .filter((item) => item.section === row.section)
        .sort((a, b) => (a.sortIndex || 0) - (b.sortIndex || 0));

    const index = siblings.findIndex((item) => item.ideaId === ideaId);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= siblings.length) return;

    const reordered = [...siblings];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, moved);

    try {
        const batch = writeBatch(db);
        reordered.forEach((item, sortIndex) => {
            batch.update(doc(db, 'ideas', item.ideaId), {
                sortIndex,
                updatedAt: serverTimestamp()
            });
        });
        await batch.commit();
    } catch (error) {
        console.error('[AtHome] Could not reorder', error);
        alert(error.message || 'Could not reorder idea.');
    }
}

function handleExport() {
    const atHome = getAtHome();
    if (!atHome?.exportCsvText) return;
    const csv = atHome.exportCsvText();
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'Home Design Bullets.csv';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function bindGlobalActions() {
    document.getElementById('adminEditToggle')?.addEventListener('click', toggleEditMode);
    document.getElementById('adminAddIdea')?.addEventListener('click', () => openModal('create'));
    document.getElementById('adminExportCsv')?.addEventListener('click', handleExport);
    document.getElementById('ideaEditorClose')?.addEventListener('click', closeModal);
    document.getElementById('ideaEditorCancel')?.addEventListener('click', closeModal);
    formEl?.addEventListener('submit', handleSave);
    document.getElementById('ideaEditorBackdrop')?.addEventListener('click', closeModal);

    document.getElementById('sectionFeed')?.addEventListener('click', (event) => {
        const button = event.target.closest('[data-admin-action]');
        if (!button || !isEditModeActive()) return;

        const action = button.dataset.adminAction;
        const ideaId = button.dataset.ideaId;
        if (!ideaId) return;

        if (action === 'edit') {
            const row = getAtHome()?.findRowByIdeaId?.(ideaId);
            if (row) openModal('edit', row);
        } else if (action === 'delete') {
            handleDelete(ideaId);
        } else if (action === 'up') {
            moveIdeaInSection(ideaId, -1);
        } else if (action === 'down') {
            moveIdeaInSection(ideaId, 1);
        }
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && modalEl && !modalEl.hidden) {
            closeModal();
        }
    });
}

export function initAdmin() {
    cacheModal();
    bindGlobalActions();

    onAuthChange(({ isOwner }) => {
        if (isOwner) {
            restoreEditModeForOwner();
        } else {
            resetEditMode();
        }
    });
}

export function buildAdminControls(ideaId) {
    if (!isEditModeActive()) return '';

    return `
        <div class="idea-manage-bar" data-idea-admin="${ideaId}">
            <div class="idea-manage-reorder" aria-label="Reorder idea">
                <button type="button" class="idea-manage-icon" data-admin-action="up" data-idea-id="${ideaId}" aria-label="Move idea up" title="Move up">↑</button>
                <button type="button" class="idea-manage-icon" data-admin-action="down" data-idea-id="${ideaId}" aria-label="Move idea down" title="Move down">↓</button>
            </div>
            <button type="button" class="idea-manage-btn" data-admin-action="edit" data-idea-id="${ideaId}">Edit</button>
            <button type="button" class="idea-manage-btn idea-manage-delete" data-admin-action="delete" data-idea-id="${ideaId}">Remove</button>
        </div>
    `;
}

window.AtHomeAdmin = { buildAdminControls };
