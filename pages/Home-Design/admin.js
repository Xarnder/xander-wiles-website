import {
    createIdea,
    createChildIdea,
    updateIdea,
    deleteIdea,
    promoteIdeaToStandalone,
    countDescendantRows,
    getDirectChildRows,
    isRootIdea
} from './api.js';
import { onAuthChange } from './auth.js';
import { doc, writeBatch, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js';
import { db } from './firebase-config.js';

let modalEl = null;
let formEl = null;
let sectionSelectEl = null;
let subsectionSelectEl = null;
let hierarchyEl = null;
let childrenListEl = null;
let childModalEl = null;
let childFormEl = null;
let editingId = null;
let childEditingId = null;
let childParentRow = null;
let editMode = false;

const EDIT_MODE_KEY = 'athome-edit-mode';
const DEFAULT_SUBSECTION = 'Ideas';
const NEW_OPTION_VALUE = '__new__';

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
    sectionSelectEl = document.getElementById('ideaSectionSelect');
    subsectionSelectEl = document.getElementById('ideaSubsectionSelect');
    hierarchyEl = document.getElementById('ideaEditorHierarchy');
    childrenListEl = document.getElementById('ideaChildrenList');
    childModalEl = document.getElementById('childIdeaEditor');
    childFormEl = document.getElementById('childIdeaEditorForm');
}

function findParentRow(childRow) {
    const rows = getAtHome()?.getRows?.() || [];
    const parentTitle = cleanField(childRow?.parentItem);
    if (!parentTitle) return null;

    return rows.find((row) => (
        isRootIdea(row)
        && cleanField(row.title) === parentTitle
    )) || null;
}

function getParentChildren(parentRow) {
    const rows = getAtHome()?.getRows?.() || [];
    return getDirectChildRows(rows, parentRow).sort((a, b) => (
        cleanField(a.title).localeCompare(cleanField(b.title))
    ));
}

function formatParentLabel(parentRow) {
    const section = cleanField(parentRow?.section) || 'More ideas';
    const subsection = cleanField(parentRow?.subsection);
    const subsectionLabel = subsection && subsection !== DEFAULT_SUBSECTION ? ` · ${subsection}` : '';
    return `Under “${cleanField(parentRow?.title)}” in ${section}${subsectionLabel}`;
}

function renderParentChildrenList(parentRow) {
    if (!childrenListEl || !hierarchyEl) return;

    const children = getParentChildren(parentRow);
    childrenListEl.innerHTML = '';

    if (!children.length) {
        const empty = document.createElement('p');
        empty.className = 'idea-children-empty';
        empty.textContent = 'No child ideas yet. Add short details that appear under “Also consider”.';
        childrenListEl.appendChild(empty);
        return;
    }

    children.forEach((child) => {
        childrenListEl.appendChild(buildChildListItem(child, parentRow));
    });
}

function buildChildListItem(child, parentRow) {
    const item = document.createElement('article');
    item.className = 'idea-child-item';
    item.dataset.childIdeaId = child.ideaId;

    const copy = document.createElement('div');
    copy.className = 'idea-child-copy';

    const title = document.createElement('strong');
    title.textContent = child.title || 'Untitled child';

    const description = document.createElement('span');
    description.textContent = child.description || child.fullText || '';

    copy.append(title);
    if (description.textContent) copy.append(description);

    const actions = document.createElement('div');
    actions.className = 'idea-child-actions';
    actions.innerHTML = `
        <button type="button" class="idea-manage-btn" data-admin-action="edit-child"
            data-idea-id="${child.ideaId}" data-parent-id="${parentRow.ideaId}">Edit</button>
        <button type="button" class="idea-manage-btn" data-admin-action="promote-child"
            data-idea-id="${child.ideaId}" title="Turn into its own idea card">Standalone</button>
        <button type="button" class="idea-manage-btn idea-manage-delete" data-admin-action="delete-child"
            data-idea-id="${child.ideaId}">Remove</button>
    `;

    item.append(copy, actions);
    return item;
}

function setHierarchyVisible(visible, parentRow = null) {
    if (!hierarchyEl) return;
    hierarchyEl.hidden = !visible;
    if (visible && parentRow) {
        renderParentChildrenList(parentRow);
    }
}

function openChildModal(parentRow, childRow = null) {
    if (!childModalEl || !childFormEl || !parentRow) return;

    childParentRow = parentRow;
    childEditingId = childRow?.ideaId || null;
    childModalEl.hidden = false;
    document.body.classList.add('editor-open');

    const title = document.getElementById('childIdeaEditorTitle');
    const eyebrow = document.getElementById('childIdeaEditorEyebrow');
    const parentLabel = document.getElementById('childIdeaParentLabel');
    const actions = document.getElementById('childIdeaEditorActions');

    if (title) title.textContent = childRow ? 'Edit child idea' : 'Add child idea';
    if (eyebrow) eyebrow.textContent = childRow ? 'Edit child' : 'New child';
    if (parentLabel) parentLabel.textContent = formatParentLabel(parentRow);
    if (actions) actions.hidden = !childRow;

    childFormEl.title.value = childRow?.title || '';
    childFormEl.description.value = childRow?.description || childRow?.fullText || '';

    document.getElementById('childIdeaTitle')?.focus();
}

function closeChildModal() {
    if (!childModalEl) return;
    childModalEl.hidden = true;
    childEditingId = null;
    childParentRow = null;
    childFormEl?.reset();

    if (!modalEl || modalEl.hidden) {
        document.body.classList.remove('editor-open');
    }
}

async function handleChildSave(event) {
    event.preventDefault();
    if (!childFormEl || !childParentRow) return;

    const title = cleanField(childFormEl.title.value);
    if (!title) {
        alert('Please enter a title for the child idea.');
        return;
    }

    const payload = {
        title,
        description: cleanField(childFormEl.description.value),
        fullText: cleanField(childFormEl.description.value)
    };

    const saveBtn = document.getElementById('childIdeaSave');
    if (saveBtn) saveBtn.disabled = true;

    try {
        if (childEditingId) {
            const originalRow = getAtHome()?.findRowByIdeaId?.(childEditingId);
            await updateIdea(childEditingId, {
                ...payload,
                section: childParentRow.section,
                subsection: childParentRow.subsection,
                level: 2,
                parentItem: childParentRow.title
            }, originalRow);
        } else {
            await createChildIdea(childParentRow, payload);
        }

        closeChildModal();
        refreshOpenParentChildrenList();
    } catch (error) {
        console.error('[AtHome] Could not save child idea', error);
        alert(error.message || 'Could not save child idea.');
    } finally {
        if (saveBtn) saveBtn.disabled = false;
    }
}

function refreshOpenParentChildrenList() {
    if (!editingId || !hierarchyEl || hierarchyEl.hidden) return;
    const parentRow = getAtHome()?.findRowByIdeaId?.(editingId);
    if (parentRow) renderParentChildrenList(parentRow);
}

async function handlePromoteChild(ideaId) {
    const atHome = getAtHome();
    const row = atHome?.findRowByIdeaId?.(ideaId);
    if (!row) return;

    const parentRow = findParentRow(row);
    const targetSection = cleanField(parentRow?.section || row.section) || 'More ideas';
    const label = row.title || ideaId;

    if (!window.confirm(
        `Make "${label}" a standalone idea?\n\nIt will appear as its own card in the "${targetSection}" section.`
    )) {
        return;
    }

    try {
        const result = await promoteIdeaToStandalone(ideaId, row, parentRow);
        closeChildModal();
        refreshOpenParentChildrenList();

        const sectionName = result?.section || targetSection;
        const sectionId = getAtHome()?.slugify?.(sectionName);
        if (sectionId) {
            window.location.hash = `section/${sectionId}`;
        }

        if (parentRow && cleanField(row.section) !== sectionName) {
            alert(`"${label}" is now a standalone idea in "${sectionName}". It was moved from "${row.section}" to match its parent.`);
        }
    } catch (error) {
        console.error('[AtHome] Could not promote child idea', error);
        alert(error.message || 'Could not promote child idea.');
    }
}

async function handleDeleteChild(ideaId) {
    const atHome = getAtHome();
    const row = atHome?.findRowByIdeaId?.(ideaId);
    const label = row?.title || ideaId;

    if (!window.confirm(`Remove child idea "${label}"?`)) return;

    try {
        await deleteIdea(ideaId);
        closeChildModal();
        refreshOpenParentChildrenList();
    } catch (error) {
        console.error('[AtHome] Could not delete child idea', error);
        alert(error.message || 'Could not delete child idea.');
    }
}

function cleanField(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
}

function getSectionOptions() {
    const rows = getAtHome()?.getRows?.() || [];
    const sections = [...new Set(rows.map((row) => cleanField(row.section)).filter(Boolean))];
    return sections.sort((a, b) => a.localeCompare(b));
}

function getSubsectionOptions(sectionName = '') {
    const rows = getAtHome()?.getRows?.() || [];
    const section = cleanField(sectionName);
    const filtered = section
        ? rows.filter((row) => cleanField(row.section) === section)
        : rows;

    const subsections = new Set();
    filtered.forEach((row) => {
        subsections.add(cleanField(row.subsection) || DEFAULT_SUBSECTION);
    });

    return [...subsections].sort((a, b) => a.localeCompare(b));
}

function populatePickerSelect(selectEl, options, placeholder) {
    if (!selectEl) return;

    const previous = selectEl.value;
    selectEl.innerHTML = '';

    const emptyOption = document.createElement('option');
    emptyOption.value = '';
    emptyOption.textContent = placeholder;
    selectEl.appendChild(emptyOption);

    options.forEach((value) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        selectEl.appendChild(option);
    });

    const newOption = document.createElement('option');
    newOption.value = NEW_OPTION_VALUE;
    newOption.textContent = '+ Add new…';
    selectEl.appendChild(newOption);

    const validValues = new Set(['', NEW_OPTION_VALUE, ...options]);
    selectEl.value = validValues.has(previous) ? previous : '';
}

function setPickerField(selectEl, customEl, value, options, placeholder) {
    populatePickerSelect(selectEl, options, placeholder);

    const cleaned = cleanField(value);
    if (!cleaned) {
        selectEl.value = '';
        customEl.hidden = true;
        customEl.value = '';
        return;
    }

    if (options.includes(cleaned)) {
        selectEl.value = cleaned;
        customEl.hidden = true;
        customEl.value = cleaned;
        return;
    }

    selectEl.value = NEW_OPTION_VALUE;
    customEl.hidden = false;
    customEl.value = cleaned;
}

function syncPickerFromSelect(selectEl, customEl) {
    if (selectEl.value === NEW_OPTION_VALUE) {
        customEl.hidden = false;
        customEl.value = '';
        customEl.focus();
        return;
    }

    if (selectEl.value) {
        customEl.hidden = true;
        customEl.value = selectEl.value;
        return;
    }

    customEl.hidden = true;
    customEl.value = '';
}

function refreshSectionPicker(value = '') {
    setPickerField(
        sectionSelectEl,
        formEl.section,
        value,
        getSectionOptions(),
        'Choose a topic…'
    );
}

function refreshSubsectionPicker(sectionName = '', value = '') {
    setPickerField(
        subsectionSelectEl,
        formEl.subsection,
        value,
        getSubsectionOptions(sectionName),
        'Choose a subsection…'
    );
}

function resetPickerFields() {
    refreshSectionPicker('');
    refreshSubsectionPicker('', '');
}

function openModal(mode = 'create', row = null) {
    if (!modalEl || !formEl) return;

    if (mode === 'edit' && row && !isRootIdea(row)) {
        const parentRow = findParentRow(row);
        if (parentRow) {
            openChildModal(parentRow, row);
            return;
        }
    }

    editingId = mode === 'edit' && row ? row.ideaId : null;
    modalEl.hidden = false;
    document.body.classList.add('editor-open');

    const title = document.getElementById('ideaEditorTitle');
    if (title) title.textContent = mode === 'edit' ? 'Edit idea' : 'Add idea';

    refreshSectionPicker(row?.section || '');
    refreshSubsectionPicker(row?.section || '', row?.subsection || '');

    formEl.level.value = 1;
    formEl.parentItem.value = '';
    formEl.title.value = row?.title || '';
    formEl.description.value = row?.description || row?.fullText || '';
    formEl.fullText.value = row?.fullText || '';

    const showChildren = mode === 'edit' && row && isRootIdea(row);
    setHierarchyVisible(showChildren, showChildren ? row : null);

    document.getElementById('ideaEditorSave')?.focus();
}

function closeModal() {
    if (!modalEl) return;
    modalEl.hidden = true;
    document.body.classList.remove('editor-open');
    editingId = null;
    formEl?.reset();
    resetPickerFields();
    setHierarchyVisible(false);
    closeChildModal();
}

async function handleSave(event) {
    event.preventDefault();
    if (!formEl) return;

    const section = cleanField(formEl.section.value);
    const subsection = cleanField(formEl.subsection.value);

    if (!section) {
        alert('Please choose or enter a section.');
        return;
    }

    const payload = {
        section,
        subsection,
        level: 1,
        parentItem: '',
        title: formEl.title.value,
        description: formEl.description.value,
        fullText: formEl.fullText.value || formEl.description.value
    };

    const saveBtn = document.getElementById('ideaEditorSave');
    if (saveBtn) saveBtn.disabled = true;

    try {
        if (editingId) {
            const originalRow = getAtHome()?.findRowByIdeaId?.(editingId);
            await updateIdea(editingId, payload, originalRow);
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
    const childCount = await countDescendantRows(ideaId, atHome?.getRows?.());
    const childNote = childCount
        ? ` This will also delete ${childCount} child idea${childCount === 1 ? '' : 's'}.`
        : '';

    if (!window.confirm(`Delete "${label}" and its images?${childNote}`)) return;

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

function handleAdminAction(action, ideaId, parentId = '') {
    const atHome = getAtHome();

    if (action === 'edit') {
        const row = atHome?.findRowByIdeaId?.(ideaId);
        if (row) openModal('edit', row);
        return;
    }

    if (action === 'delete') {
        handleDelete(ideaId);
        return;
    }

    if (action === 'up') {
        moveIdeaInSection(ideaId, -1);
        return;
    }

    if (action === 'down') {
        moveIdeaInSection(ideaId, 1);
        return;
    }

    if (action === 'edit-child') {
        const childRow = atHome?.findRowByIdeaId?.(ideaId);
        const parentRow = atHome?.findRowByIdeaId?.(parentId) || (childRow ? findParentRow(childRow) : null);
        if (childRow && parentRow) openChildModal(parentRow, childRow);
        return;
    }

    if (action === 'promote-child') {
        handlePromoteChild(ideaId);
        return;
    }

    if (action === 'delete-child') {
        handleDeleteChild(ideaId);
    }
}

function bindGlobalActions() {
    document.getElementById('adminEditToggle')?.addEventListener('click', toggleEditMode);
    document.getElementById('adminAddIdea')?.addEventListener('click', () => openModal('create'));
    document.getElementById('adminExportCsv')?.addEventListener('click', handleExport);
    document.getElementById('ideaEditorClose')?.addEventListener('click', closeModal);
    document.getElementById('ideaEditorCancel')?.addEventListener('click', closeModal);
    formEl?.addEventListener('submit', handleSave);
    sectionSelectEl?.addEventListener('change', () => {
        syncPickerFromSelect(sectionSelectEl, formEl.section);
        const sectionName = cleanField(formEl.section.value);
        refreshSubsectionPicker(sectionName, '');
    });
    subsectionSelectEl?.addEventListener('change', () => {
        syncPickerFromSelect(subsectionSelectEl, formEl.subsection);
    });
    formEl?.section?.addEventListener('input', () => {
        refreshSubsectionPicker(formEl.section.value, formEl.subsection.value);
    });
    document.getElementById('ideaEditorBackdrop')?.addEventListener('click', closeModal);
    document.getElementById('ideaAddChildBtn')?.addEventListener('click', () => {
        const parentRow = editingId ? getAtHome()?.findRowByIdeaId?.(editingId) : null;
        if (parentRow) openChildModal(parentRow);
    });
    childFormEl?.addEventListener('submit', handleChildSave);
    document.getElementById('childIdeaCancel')?.addEventListener('click', closeChildModal);
    document.getElementById('childIdeaEditorClose')?.addEventListener('click', closeChildModal);
    document.getElementById('childIdeaEditorBackdrop')?.addEventListener('click', closeChildModal);
    document.getElementById('childIdeaPromote')?.addEventListener('click', () => {
        if (childEditingId) handlePromoteChild(childEditingId);
    });
    document.getElementById('childIdeaDelete')?.addEventListener('click', () => {
        if (childEditingId) handleDeleteChild(childEditingId);
    });

    document.getElementById('sectionFeed')?.addEventListener('click', (event) => {
        const button = event.target.closest('[data-admin-action]');
        if (!button || !isEditModeActive()) return;

        handleAdminAction(
            button.dataset.adminAction,
            button.dataset.ideaId,
            button.dataset.parentId
        );
    });

    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;

        if (childModalEl && !childModalEl.hidden) {
            closeChildModal();
            return;
        }

        if (modalEl && !modalEl.hidden) {
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

export function buildChildControls(child, parentRow) {
    if (!isEditModeActive()) return '';

    return `
        <div class="related-child-admin">
            <button type="button" class="idea-manage-btn" data-admin-action="edit-child"
                data-idea-id="${child.ideaId}" data-parent-id="${parentRow.ideaId}">Edit</button>
            <button type="button" class="idea-manage-btn" data-admin-action="promote-child"
                data-idea-id="${child.ideaId}" title="Turn into its own idea card">Standalone</button>
            <button type="button" class="idea-manage-btn idea-manage-delete" data-admin-action="delete-child"
                data-idea-id="${child.ideaId}">Remove</button>
        </div>
    `;
}

window.AtHomeAdmin = { buildAdminControls, buildChildControls };
