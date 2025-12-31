/* 
    Task Master Script v17
    Includes Todoist CSV Import Feature
*/

console.log("[DEBUG] App initialized.");

// --- STATE MANAGEMENT ---
const defaultData = {
    projectTitle: "Task Master",
    lists: [
        { id: 'list-1', title: 'To Do', taskIds: [] },
        { id: 'list-2', title: 'Doing', taskIds: [] }
    ],
    tasks: {},
    settings: {
        autoArchive: false,
        showNumbers: false,
        theme: 'dark',
        sortMode: 'custom'
    }
};

let appData = loadData();
let dragMode = 'move';
let showArchived = false;
let sortableInstances = [];
let listSortable = null;

// --- DOM ELEMENTS ---
const boardContainer = document.getElementById('board-container');
const addListBtn = document.getElementById('add-list-btn');
const themeToggleBtn = document.getElementById('theme-toggle');
const modeCutBtn = document.getElementById('mode-cut-btn');
const modeCopyBtn = document.getElementById('mode-copy-btn');
const autoArchiveToggle = document.getElementById('auto-archive-toggle');
const showNumbersToggle = document.getElementById('show-numbers-toggle');
const sortSelect = document.getElementById('sort-select');
const toggleArchiveBtn = document.getElementById('toggle-archive-view-btn');
const archiveViewIcon = document.getElementById('archive-view-icon');
const projectTitleInput = document.getElementById('project-title-input');
const totalTaskCountEl = document.getElementById('total-task-count');

const optionsBtn = document.getElementById('options-btn');
const optionsModal = document.getElementById('options-modal-overlay');
const closeOptionsBtn = document.getElementById('close-options-btn');

const modalOverlay = document.getElementById('modal-overlay');
const modalInput = document.getElementById('modal-task-input');
const modalSaveBtn = document.getElementById('modal-save-btn');
const modalCloseBtn = document.getElementById('modal-close-btn');
const glowColorOptions = document.getElementById('glow-color-options');

// Bulk Add DOM
const bulkAddModal = document.getElementById('bulk-add-modal-overlay');
const bulkAddInput = document.getElementById('bulk-add-input');
const bulkAddConfirmBtn = document.getElementById('bulk-add-confirm-btn');
const bulkAddCloseBtn = document.getElementById('bulk-add-close-btn');
let currentBulkListId = null;

const currentLocationsList = document.getElementById('current-locations-list');
const manualMoveSelect = document.getElementById('manual-move-select');
const manualMoveBtn = document.getElementById('manual-move-btn');
const manualLinkBtn = document.getElementById('manual-link-btn');

const imageModal = document.getElementById('image-modal-overlay');
const fullSizeImage = document.getElementById('full-size-image');
const imageModalClose = document.getElementById('image-modal-close');

const confirmOverlay = document.getElementById('confirm-modal-overlay');
const confirmTitle = document.getElementById('confirm-title');
const confirmDesc = document.getElementById('confirm-desc');
const confirmYesBtn = document.getElementById('confirm-yes-btn');
const confirmCancelBtn = document.getElementById('confirm-cancel-btn');
const resetOverlay = document.getElementById('reset-modal-overlay');
const triggerResetBtn = document.getElementById('trigger-reset-btn');
const resetCancelBtn = document.getElementById('reset-cancel-btn');

const sliderContainer = document.getElementById('slider-container');
const sliderHandle = document.getElementById('slider-handle');

const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toast-message');
const hiddenImageInput = document.getElementById('hidden-image-input');

// Import Inputs
const uploadJsonInput = document.getElementById('upload-json');
const importTodoistInput = document.getElementById('import-todoist-csv');

let currentEditingTaskId = null;
let currentEditingListId = null;
let currentImageUploadTaskId = null;
let selectedGlowColor = 'none';
let confirmCallback = null;

// --- UTILITY FUNCTIONS ---

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const icon = themeToggleBtn.querySelector('i');
    if (theme === 'light') icon.classList.replace('ph-sun', 'ph-moon');
    else icon.classList.replace('ph-moon', 'ph-sun');
}

function updateDragModeUI() {
    if (dragMode === 'move') {
        modeCutBtn.classList.add('active');
        modeCopyBtn.classList.remove('active');
    } else {
        modeCutBtn.classList.remove('active');
        modeCopyBtn.classList.add('active');
    }
}

function showToast(msg) {
    toastMessage.innerText = msg;
    toast.classList.remove('hidden');
    setTimeout(() => { toast.classList.add('hidden'); }, 3000);
}

function generateId() {
    return 'id-' + Math.random().toString(36).substr(2, 9);
}

function escapeHtml(text) {
    if (!text) return text;
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function loadData() {
    const json = localStorage.getItem('taskmaster_v6');
    if (json) {
        try {
            const data = JSON.parse(json);
            if (!data.projectTitle) data.projectTitle = "Task Master";
            if (data.settings.showNumbers === undefined) data.settings.showNumbers = false;
            return data;
        }
        catch (e) { return defaultData; }
    }
    return defaultData;
}

function saveData() {
    appData.settings.autoArchive = autoArchiveToggle.checked;
    appData.settings.showNumbers = showNumbersToggle.checked;
    appData.settings.sortMode = sortSelect.value;
    appData.projectTitle = projectTitleInput.value;
    localStorage.setItem('taskmaster_v6', JSON.stringify(appData));
}

function getTaskReferenceCount(taskId) {
    let count = 0;
    appData.lists.forEach(list => { if (list.taskIds.includes(taskId)) count++; });
    return count;
}

// --- INITIALIZATION ---

function init() {
    document.querySelectorAll('.modal-overlay').forEach(el => el.classList.add('hidden'));

    applyTheme(appData.settings.theme);

    autoArchiveToggle.checked = appData.settings.autoArchive || false;
    showNumbersToggle.checked = appData.settings.showNumbers || false;

    if (appData.projectTitle) projectTitleInput.value = appData.projectTitle;

    if (!appData.settings.sortMode) appData.settings.sortMode = 'custom';
    sortSelect.value = appData.settings.sortMode;

    updateDragModeUI();
    renderBoard();
    setupGlobalListeners();
    setupSlider();
}

// --- RENDERING ---

function renderBoard() {
    sortableInstances.forEach(s => s.destroy());
    sortableInstances = [];
    if (listSortable) listSortable.destroy();

    boardContainer.innerHTML = '';

    const isCustomSort = appData.settings.sortMode === 'custom';

    appData.lists.forEach(list => {
        renderListColumn(list, false, isCustomSort);
    });

    if (showArchived) {
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

    // List Reordering with Fallback
    listSortable = new Sortable(boardContainer, {
        animation: 150,
        handle: '.list-drag-handle',
        direction: 'horizontal',
        filter: '.orphan-list',
        forceFallback: true,
        fallbackOnBody: true,
        fallbackClass: "sortable-fallback",
        swapThreshold: 0.65,
        onEnd: (evt) => {
            const newIndex = evt.newIndex;
            const oldIndex = evt.oldIndex;

            if (newIndex !== oldIndex) {
                const movedList = appData.lists.splice(oldIndex, 1)[0];
                appData.lists.splice(newIndex, 0, movedList);
                saveData();
            }
        }
    });

    updateTotalTaskCount();
}

function getOrphanedTaskIds() {
    const activeIds = new Set();
    appData.lists.forEach(l => l.taskIds.forEach(id => activeIds.add(id)));
    const allIds = Object.keys(appData.tasks);
    return allIds.filter(id => !activeIds.has(id));
}

function updateTotalTaskCount() {
    let total = 0;
    let completed = 0;

    // Calculate total active tasks (unique)
    // We iterate over tasks directly to get true unique count
    Object.values(appData.tasks).forEach(task => {
        if (!task.archived) {
            total++;
            if (task.completed) completed++;
        }
    });

    if (total > 0) {
        totalTaskCountEl.textContent = `Total: ${total}`;
        totalTaskCountEl.classList.remove('hidden');
    } else {
        totalTaskCountEl.classList.add('hidden');
        totalTaskCountEl.textContent = '';
    }
}

function renderListColumn(list, isOrphan, isCustomSort) {
    const listEl = document.createElement('div');
    listEl.className = `list-column ${isOrphan ? 'orphan-list' : ''}`;
    listEl.dataset.listId = list.id;

    let headerLeft = isOrphan
        ? `<input type="text" class="list-title" value="${list.title}" disabled>`
        : `<div class="list-header-left">
             <i class="ph ph-dots-six list-drag-handle" title="Drag to reorder list"></i>
             <input type="text" class="list-title" value="${list.title}" onchange="updateListTitle('${list.id}', this.value)">
           </div>`;

    let headerButtons = isOrphan
        ? `<button class="icon-btn danger" onclick="emptyOrphans()" title="Delete All"><i class="ph ph-trash"></i></button>`
        : `<div class="list-header-right">
             <button class="icon-btn" onclick="openBulkAddModal('${list.id}')" title="Bulk Add Tasks"><i class="ph ph-list-plus"></i></button>
             <button class="icon-btn" onclick="deleteList('${list.id}')" title="Delete List"><i class="ph ph-trash"></i></button>
           </div>`;

    let addFormHtml = isOrphan ? '' : `
        <div class="add-task-container">
            <form class="add-task-form" onsubmit="handleAddTask(event, '${list.id}')">
                <input type="text" class="add-task-input" placeholder="+ Add task" name="taskText">
                <button type="submit" class="btn primary">+</button>
            </form>
        </div>`;

    listEl.innerHTML = `
        <div class="list-header">
            ${headerLeft}
            ${headerButtons}
        </div>
        <div class="task-list" id="container-${list.id}"></div>
        ${addFormHtml}
    `;

    const taskListContainer = listEl.querySelector('.task-list');
    const sortedIds = getSortedTaskIds(list.taskIds);

    let visibleCount = 0;
    let visibleIndex = 1;

    sortedIds.forEach((taskId) => {
        const task = appData.tasks[taskId];
        if (task) {
            if (showArchived || !task.archived) {
                taskListContainer.appendChild(createTaskElement(task, list.id, visibleIndex));
                visibleIndex++;
                visibleCount++;
            }
        }
    });

    // Update list title with count if not orphan list
    if (!isOrphan) {
        const titleInput = listEl.querySelector('.list-title');
        // We add a data attribute to store the raw title so we don't double append counts
        // But the input value is what user sees.
        // A better approach is adding a badge next to it.
        // However, the requested design was "add a total task number at the top of the lists".
        // Let's modify headerLeft to include a badge.
        // Since we already rendered headerLeft string, we can inject a span into the list header.

        const countBadge = document.createElement('span');
        countBadge.className = 'list-count-badge';
        countBadge.textContent = visibleCount;
        listEl.querySelector('.list-header-left').appendChild(countBadge);
    } else {
        // For orphan list title is disabled input, maybe append to header
        const countBadge = document.createElement('span');
        countBadge.className = 'list-count-badge';
        countBadge.textContent = visibleCount;
        listEl.querySelector('.list-header').insertBefore(countBadge, listEl.querySelector('.list-header-right'));
    }

    if (!isCustomSort && !isOrphan) {
        taskListContainer.addEventListener('mousedown', (e) => {
            if (e.target.closest('.task-card')) showToast("Switch to 'Custom Order' to reorder.");
        }, { capture: true });
    }

    boardContainer.appendChild(listEl);

    if (!isOrphan) {
        const sortable = new Sortable(taskListContainer, {
            group: {
                name: 'shared',
                pull: dragMode === 'copy' ? 'clone' : true,
                put: true
            },
            animation: 150,
            delay: 150,
            delayOnTouchOnly: true,
            touchStartThreshold: 5,
            disabled: !isCustomSort,
            filter: '.archived-task',

            // CRITICAL FIXES FOR TASK DRAGGING
            forceFallback: true,
            fallbackOnBody: true,
            fallbackClass: "sortable-fallback",
            swapThreshold: 0.65,

            onEnd: handleDragEnd
        });
        sortableInstances.push(sortable);
    } else {
        new Sortable(taskListContainer, {
            group: { name: 'shared', pull: true, put: false },
            animation: 150,
            sort: false
        });
    }
}

function getSortedTaskIds(taskIds) {
    const mode = appData.settings.sortMode;
    if (mode === 'custom') return taskIds;

    let ids = [...taskIds];
    ids.sort((a, b) => {
        const taskA = appData.tasks[a];
        const taskB = appData.tasks[b];
        if (!taskA || !taskB) return 0;
        if (mode === 'alphabetical') return taskA.text.localeCompare(taskB.text);
        else if (mode === 'newest') return (taskB.createdAt || 0) - (taskA.createdAt || 0);
        else if (mode === 'oldest') return (taskA.createdAt || 0) - (taskB.createdAt || 0);
        return 0;
    });
    return ids;
}

function createTaskElement(task, sourceListId, number) {
    const el = document.createElement('div');
    const refCount = getTaskReferenceCount(task.id);
    const isLinked = refCount > 1;
    const isLocked = appData.settings.sortMode !== 'custom';
    const isImportant = task.text.includes('!!');

    let classes = 'task-card';
    if (isLinked) classes += ' linked-task';
    if (task.completed) classes += ' task-completed';
    if (task.archived) classes += ' archived-task';
    if (isLocked) classes += ' locked-sort';
    if (isImportant) classes += ' important';

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
            imagesHtml += `<img src="${imgData}" class="task-img-preview" onclick="openImageLightbox('${imgData}')">`;
        });
        imagesHtml += `</div>`;
    }

    let actionsHtml = '';
    if (task.archived) {
        actionsHtml = `
            <button class="icon-btn" title="Restore" onclick="unarchiveTask('${task.id}')"><i class="ph ph-arrow-u-up-left"></i></button>
            <button class="icon-btn danger" title="Delete Forever" onclick="deleteTaskForever('${task.id}')"><i class="ph ph-trash"></i></button>
        `;
    } else {
        actionsHtml = `
            <button class="icon-btn" title="Edit" onclick="openEditModal('${task.id}', '${sourceListId}')"><i class="ph ph-pencil-simple"></i></button>
            <button class="icon-btn" title="Add Image" onclick="triggerImageUpload('${task.id}')"><i class="ph ph-image"></i></button>
            <button class="icon-btn" title="Archive" onclick="archiveTask('${task.id}')"><i class="ph ph-archive"></i></button>
        `;
    }

    let numberHtml = '';
    if (appData.settings.showNumbers) {
        numberHtml = `<span class="task-number">${number}.</span>`;
    }

    el.innerHTML = `
        <input type="checkbox" class="task-checkbox" 
            ${task.completed ? 'checked' : ''} 
            ${task.archived ? 'disabled' : ''} 
            onchange="toggleTaskComplete('${task.id}', this.checked)">
        ${numberHtml}
        <div class="task-content-wrapper">
            <div class="task-text">${escapeHtml(task.text)}</div>
            ${imagesHtml}
        </div>
        <div class="task-actions">${actionsHtml}</div>
    `;
    return el;
}

// --- LOGIC ---

function handleAddTask(e, listId) {
    e.preventDefault();
    const input = e.target.elements.taskText;
    const text = input.value.trim();
    if (!text) return;
    const newId = generateId();
    appData.tasks[newId] = { id: newId, text: text, completed: false, archived: false, createdAt: Date.now(), images: [], glowColor: 'none' };
    const list = appData.lists.find(l => l.id === listId);
    list.taskIds.push(newId);
    saveData();
    renderBoard();
    input.value = '';
}

function archiveTask(taskId) {
    if (appData.tasks[taskId]) {
        appData.tasks[taskId].archived = true;
        saveData();
        renderBoard();
    }
}

function unarchiveTask(taskId) {
    if (appData.tasks[taskId]) {
        appData.tasks[taskId].archived = false;
        if (getTaskReferenceCount(taskId) === 0) {
            if (appData.lists.length > 0) {
                appData.lists[0].taskIds.push(taskId);
                showToast("Task restored to first list.");
            } else {
                showToast("No lists available to restore to.");
            }
        }
        saveData();
        renderBoard();
    }
}

function deleteTaskForever(taskId) {
    showCustomConfirm("Delete forever?", "This cannot be undone.", () => {
        delete appData.tasks[taskId];
        appData.lists.forEach(list => list.taskIds = list.taskIds.filter(id => id !== taskId));
        saveData();
        renderBoard();
    });
}

function emptyOrphans() {
    showCustomConfirm("Delete All Orphans?", "All tasks in this list will be gone forever.", () => {
        const orphans = getOrphanedTaskIds();
        orphans.forEach(id => delete appData.tasks[id]);
        saveData();
        renderBoard();
    });
}

function toggleTaskComplete(taskId, isChecked) {
    if (appData.tasks[taskId]) {
        appData.tasks[taskId].completed = isChecked;
        saveData();
        renderBoard();
        if (isChecked && autoArchiveToggle.checked && !appData.tasks[taskId].archived) {
            setTimeout(() => {
                if (appData.tasks[taskId] && appData.tasks[taskId].completed) archiveTask(taskId);
            }, 1000);
        }
    }
}

function handleDragEnd(evt) {
    const fromIdRaw = evt.from.id.replace('container-', '');
    const toIdRaw = evt.to.id.replace('container-', '');
    if (fromIdRaw === 'orphan-archive' && toIdRaw === 'orphan-archive') return;

    if (toIdRaw && toIdRaw !== 'orphan-archive') {
        const itemEl = evt.item;
        const taskId = itemEl.dataset.taskId;

        if (fromIdRaw === 'orphan-archive') {
            const toList = appData.lists.find(l => l.id === toIdRaw);
            if (toList && !toList.taskIds.includes(taskId)) {
                toList.taskIds.splice(evt.newIndex, 0, taskId);
                if (appData.tasks[taskId]) appData.tasks[taskId].archived = false;
            } else {
                evt.item.remove();
            }
        }
        else if (dragMode === 'copy' && fromIdRaw !== toIdRaw) {
            const toList = appData.lists.find(l => l.id === toIdRaw);
            if (!toList.taskIds.includes(taskId)) {
                toList.taskIds.splice(evt.newIndex, 0, taskId);
            } else {
                evt.item.remove();
            }
        }
        else {
            appData.lists.forEach(list => {
                const container = document.getElementById(`container-${list.id}`);
                if (container) {
                    const ids = Array.from(container.children).map(el => el.dataset.taskId);
                    list.taskIds = ids;
                }
            });
        }
        saveData();
        renderBoard();
    }
}

function deleteList(id) {
    showCustomConfirm("Delete List?", "Unique tasks will be moved to the Orphan Archive.", () => {
        const listToDelete = appData.lists.find(l => l.id === id);
        if (listToDelete) {
            listToDelete.taskIds.forEach(taskId => {
                if (getTaskReferenceCount(taskId) === 1) {
                    if (appData.tasks[taskId]) appData.tasks[taskId].archived = true;
                }
            });
        }
        appData.lists = appData.lists.filter(l => l.id !== id);
        saveData();
        renderBoard();
        if (!showArchived) showToast("List deleted. Enable 'Eye' icon to see orphaned tasks.");
    });
}

function triggerImageUpload(taskId) {
    currentImageUploadTaskId = taskId;
    hiddenImageInput.click();
}

hiddenImageInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) alert("Image is large. It might slow down the app.");

    const reader = new FileReader();
    reader.onload = function (event) {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 600;
            const scaleSize = MAX_WIDTH / img.width;
            canvas.width = MAX_WIDTH;
            canvas.height = img.height * scaleSize;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.7);

            const task = appData.tasks[currentImageUploadTaskId];
            if (!task.images) task.images = [];
            if (task.images.length >= 3) {
                alert("Maximum 3 images per task allowed.");
                return;
            }
            task.images.push(dataUrl);
            saveData();
            renderBoard();
            hiddenImageInput.value = '';
        };
    };
    reader.readAsDataURL(file);
});

function openImageLightbox(src) {
    fullSizeImage.src = src;
    imageModal.classList.remove('hidden');
}
imageModalClose.addEventListener('click', () => imageModal.classList.add('hidden'));
imageModal.addEventListener('click', (e) => {
    if (e.target === imageModal) imageModal.classList.add('hidden');
});

// --- SLIDER ---
function setupSlider() {
    let isDragging = false;
    let startX = 0;
    const resetEverything = () => { localStorage.removeItem('taskmaster_v6'); location.reload(); };
    const resetSlider = () => {
        sliderHandle.style.left = '2px';
        sliderHandle.style.background = 'var(--text-primary)';
        sliderHandle.innerHTML = '<i class="ph ph-caret-right"></i>';
    };
    triggerResetBtn.onclick = () => { resetOverlay.classList.remove('hidden'); resetSlider(); };
    resetCancelBtn.onclick = () => { resetOverlay.classList.add('hidden'); };
    const startDrag = (e) => { isDragging = true; startX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX; };
    const moveDrag = (e) => {
        if (!isDragging) return;
        const clientX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;
        const maxMove = sliderContainer.offsetWidth - sliderHandle.offsetWidth - 4;
        let moveX = clientX - startX;
        if (moveX < 0) moveX = 0;
        if (moveX > maxMove) moveX = maxMove;
        sliderHandle.style.left = `${moveX + 2}px`;
        if (moveX >= maxMove - 2) {
            isDragging = false;
            sliderHandle.style.background = 'var(--accent-red)';
            sliderHandle.innerHTML = '<i class="ph ph-check"></i>';
            setTimeout(resetEverything, 300);
        }
    };
    const endDrag = () => {
        if (isDragging) {
            isDragging = false;
            sliderHandle.style.transition = 'left 0.3s';
            sliderHandle.style.left = '2px';
            setTimeout(() => { sliderHandle.style.transition = 'none'; }, 300);
        }
    };
    sliderHandle.addEventListener('mousedown', startDrag);
    sliderHandle.addEventListener('touchstart', startDrag);
    document.addEventListener('mousemove', moveDrag);
    document.addEventListener('touchmove', moveDrag);
    document.addEventListener('mouseup', endDrag);
    document.addEventListener('touchend', endDrag);
}

// --- STANDARD CONTROLS & LISTENERS ---

function setupGlobalListeners() {
    document.getElementById('download-json-btn').onclick = () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(appData));
        const anchor = document.createElement('a');
        anchor.href = dataStr;
        anchor.download = (appData.projectTitle || "taskmaster") + "_backup.json";
        anchor.click();
    };

    uploadJsonInput.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try { appData = JSON.parse(event.target.result); init(); } catch (err) { alert('Invalid JSON'); }
        };
        reader.readAsText(file);
    };

    // --- TODOIST CSV IMPORT LISTENER ---
    importTodoistInput.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            handleTodoistImport(event.target.result);
            // Reset input so same file can be selected again if needed
            importTodoistInput.value = '';
        };
        reader.readAsText(file);
    };

    addListBtn.onclick = () => {
        appData.lists.push({ id: generateId(), title: 'New List', taskIds: [] });
        saveData();
        renderBoard();
    };

    // Open Options Modal
    optionsBtn.onclick = () => {
        optionsModal.classList.remove('hidden');
    };

    closeOptionsBtn.onclick = () => {
        optionsModal.classList.add('hidden');
    }

    sortSelect.onchange = (e) => {
        appData.settings.sortMode = e.target.value;
        saveData();
        renderBoard();
        if (appData.settings.sortMode !== 'custom') showToast(`Sorted by ${e.target.options[e.target.selectedIndex].text}. Custom ordering disabled.`);
    };

    toggleArchiveBtn.onclick = () => {
        showArchived = !showArchived;
        if (showArchived) {
            archiveViewIcon.classList.replace('ph-eye-slash', 'ph-eye');
            toggleArchiveBtn.classList.add('active');
        } else {
            archiveViewIcon.classList.replace('ph-eye', 'ph-eye-slash');
            toggleArchiveBtn.classList.remove('active');
        }
        renderBoard();
    };

    showNumbersToggle.onchange = () => {
        appData.settings.showNumbers = showNumbersToggle.checked;
        saveData();
        renderBoard();
    }

    modeCutBtn.onclick = () => { dragMode = 'move'; updateDragModeUI(); renderBoard(); };
    modeCopyBtn.onclick = () => { dragMode = 'copy'; updateDragModeUI(); renderBoard(); };

    themeToggleBtn.onclick = () => {
        const newTheme = appData.settings.theme === 'dark' ? 'light' : 'dark';
        appData.settings.theme = newTheme;
        applyTheme(newTheme);
        saveData();
    };

    modalSaveBtn.onclick = () => {
        if (currentEditingTaskId && appData.tasks[currentEditingTaskId]) {
            appData.tasks[currentEditingTaskId].text = modalInput.value;
            appData.tasks[currentEditingTaskId].glowColor = selectedGlowColor; // Save Glow
            saveData();
            renderBoard();
            modalOverlay.classList.add('hidden');
        }
    };
    modalCloseBtn.onclick = () => modalOverlay.classList.add('hidden');

    confirmYesBtn.onclick = () => { if (confirmCallback) confirmCallback(); confirmOverlay.classList.add('hidden'); confirmCallback = null; };
    confirmCancelBtn.onclick = () => { confirmOverlay.classList.add('hidden'); confirmCallback = null; };

    manualMoveBtn.onclick = () => {
        const targetListId = manualMoveSelect.value;
        if (!targetListId) return alert("Please select a list.");
        if (!currentEditingListId || !currentEditingTaskId) return;

        const targetList = appData.lists.find(l => l.id === targetListId);
        const sourceList = appData.lists.find(l => l.id === currentEditingListId);

        if (targetList && sourceList) {
            if (!targetList.taskIds.includes(currentEditingTaskId)) {
                targetList.taskIds.push(currentEditingTaskId);
            }
            sourceList.taskIds = sourceList.taskIds.filter(id => id !== currentEditingTaskId);
            saveData();
            renderBoard();
            modalOverlay.classList.add('hidden');
            showToast(`Moved to "${targetList.title}"`);
        }
    };

    manualLinkBtn.onclick = () => {
        const targetListId = manualMoveSelect.value;
        if (!targetListId) return alert("Please select a list.");
        const targetList = appData.lists.find(l => l.id === targetListId);
        if (targetList) {
            if (!targetList.taskIds.includes(currentEditingTaskId)) {
                targetList.taskIds.push(currentEditingTaskId);
                saveData();
                renderBoard();
                modalOverlay.classList.add('hidden');
                showToast(`Linked to "${targetList.title}"`);
            } else {
                alert("Task is already in that list.");
            }
        }
    };

    projectTitleInput.onchange = () => {
        appData.projectTitle = projectTitleInput.value;
        saveData();
    };

    // Bulk Add Logic
    bulkAddCloseBtn.onclick = () => bulkAddModal.classList.add('hidden');

    bulkAddConfirmBtn.onclick = () => {
        const rawText = bulkAddInput.value;
        if (!rawText.trim()) return;
        const lines = rawText.split(/\r?\n/).filter(line => line.trim() !== '');
        const list = appData.lists.find(l => l.id === currentBulkListId);
        if (list) {
            lines.forEach(line => {
                const newId = generateId();
                appData.tasks[newId] = { id: newId, text: line.trim(), completed: false, archived: false, createdAt: Date.now(), images: [], glowColor: 'none' };
                list.taskIds.push(newId);
            });
            saveData();
            renderBoard();
            bulkAddModal.classList.add('hidden');
            showToast(`Added ${lines.length} tasks.`);
        }
    };

    // Color Picker Logic
    document.querySelectorAll('.color-btn').forEach(btn => {
        btn.onclick = () => {
            selectedGlowColor = btn.dataset.color;
            document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
        };
    });
}

// --- TODOIST CSV IMPORT LOGIC ---

// Simple CSV parser that handles commas inside quotes
function parseCSV(text) {
    console.log("[CSV DEBUG] Starting raw parse...");
    const rows = [];
    let row = [];
    let curVal = '';
    let inQuote = false;

    // Remove Byte Order Mark if present (common in Todoist exports)
    if (text.charCodeAt(0) === 0xFEFF) {
        text = text.slice(1);
    }

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const nextChar = text[i + 1];

        if (inQuote) {
            if (char === '"' && nextChar === '"') {
                curVal += '"';
                i++; // Skip escaped quote
            } else if (char === '"') {
                inQuote = false;
            } else {
                curVal += char;
            }
        } else {
            if (char === '"') {
                inQuote = true;
            } else if (char === ',') {
                row.push(curVal);
                curVal = '';
            } else if (char === '\n' || char === '\r') {
                row.push(curVal);
                if (row.length > 0 && (row.length > 1 || row[0] !== '')) {
                    rows.push(row);
                }
                row = [];
                curVal = '';
                // Handle \r\n
                if (char === '\r' && nextChar === '\n') {
                    i++;
                }
            } else {
                curVal += char;
            }
        }
    }
    // Push last row if exists
    if (curVal || row.length > 0) {
        row.push(curVal);
        rows.push(row);
    }

    console.log(`[CSV DEBUG] Parsed ${rows.length} rows.`);
    return rows;
}

function handleTodoistImport(csvText) {
    if (!csvText) {
        alert("File is empty.");
        return;
    }

    console.log("[CSV DEBUG] Processing content...");
    const rows = parseCSV(csvText);

    if (rows.length < 2) {
        alert("Invalid CSV format or empty file.");
        return;
    }

    let addedLists = 0;
    let addedTasks = 0;
    let currentListId = null;

    // We assume standard Todoist CSV columns.
    // Index 0: TYPE, Index 1: CONTENT

    // Check if the current app is empty-ish. If so, we can clear defaults.
    // If not, we just append.

    rows.forEach((row, index) => {
        const type = row[0]; // 'section' or 'task'
        const content = row[1]; // Name or Content

        if (!type || !content) return;

        // Skip header or metadata rows
        if (type === 'TYPE' || type === 'meta') {
            console.log("[CSV DEBUG] Skipping metadata/header row.");
            return;
        }

        if (type === 'section') {
            // CREATE NEW LIST
            const newListId = generateId();
            const newList = {
                id: newListId,
                title: content,
                taskIds: []
            };
            appData.lists.push(newList);
            currentListId = newListId;
            addedLists++;
            console.log(`[CSV DEBUG] Created List: ${content}`);
        } else if (type === 'task') {
            // CREATE NEW TASK
            const newTaskId = generateId();
            const newTask = {
                id: newTaskId,
                text: content,
                completed: false, // Todoist CSV exports usually export incomplete tasks, or we treat them as active
                archived: false,
                createdAt: Date.now(),
                images: [],
                glowColor: 'none'
            };

            // If task appears before any section, create an Inbox list
            if (!currentListId) {
                const inboxId = generateId();
                appData.lists.unshift({
                    id: inboxId,
                    title: "Inbox (Imported)",
                    taskIds: []
                });
                currentListId = inboxId;
                console.log("[CSV DEBUG] Created Default Inbox for uncategorized tasks.");
            }

            appData.tasks[newTaskId] = newTask;
            const currentList = appData.lists.find(l => l.id === currentListId);
            if (currentList) currentList.taskIds.push(newTaskId);

            addedTasks++;
        }
    });

    saveData();
    renderBoard();
    optionsModal.classList.add('hidden');
    showToast(`Imported ${addedLists} lists and ${addedTasks} tasks.`);
    console.log(`[CSV DEBUG] Complete. Lists: ${addedLists}, Tasks: ${addedTasks}`);
}

// Global Wrappers
window.openBulkAddModal = function (listId) {
    currentBulkListId = listId;
    bulkAddInput.value = '';
    bulkAddModal.classList.remove('hidden');
};

window.removeTaskFromList = function (listId, taskId) {
    const list = appData.lists.find(l => l.id === listId);
    if (list) {
        if (getTaskReferenceCount(taskId) <= 1 && !appData.tasks[taskId].archived) {
            if (!confirm("This is the last list containing this task. Removing it will archive it. Continue?")) return;
            appData.tasks[taskId].archived = true;
        }
        list.taskIds = list.taskIds.filter(id => id !== taskId);
        saveData();
        renderBoard();
        renderTaskLocations(taskId);
        populateMoveDropdown(taskId);
    }
};

function renderTaskLocations(taskId) {
    currentLocationsList.innerHTML = '';
    const lists = appData.lists.filter(l => l.taskIds.includes(taskId));
    if (lists.length === 0) {
        currentLocationsList.innerHTML = '<div style="color:#888; font-size:0.9rem;">Not in any active lists (Archived).</div>';
        return;
    }
    lists.forEach(list => {
        const div = document.createElement('div');
        div.className = 'location-item';
        div.innerHTML = `
            <span class="location-name">${escapeHtml(list.title)}</span>
            <button class="location-remove-btn" title="Remove from this list" onclick="removeTaskFromList('${list.id}', '${taskId}')">
                <i class="ph ph-trash"></i>
            </button>
        `;
        currentLocationsList.appendChild(div);
    });
}

function populateMoveDropdown(taskId) {
    manualMoveSelect.innerHTML = '<option value="" disabled selected>Select Destination...</option>';
    appData.lists.forEach(list => {
        if (!list.taskIds.includes(taskId) && list.id !== 'orphan-archive') {
            const option = document.createElement('option');
            option.value = list.id;
            option.innerText = list.title;
            manualMoveSelect.appendChild(option);
        }
    });
}

function openEditModal(taskId, listId) {
    currentEditingTaskId = taskId;
    currentEditingListId = listId;

    const task = appData.tasks[taskId];
    modalInput.value = task.text;
    selectedGlowColor = task.glowColor || 'none';

    document.querySelectorAll('.color-btn').forEach(b => {
        b.classList.remove('selected');
        if (b.dataset.color === selectedGlowColor) b.classList.add('selected');
    });

    renderTaskLocations(taskId);
    populateMoveDropdown(taskId);
    modalOverlay.classList.remove('hidden');
}

function updateListTitle(id, val) {
    const list = appData.lists.find(l => l.id === id);
    if (list) list.title = val;
    saveData();
}

function showCustomConfirm(title, desc, callback) {
    confirmTitle.innerText = title;
    confirmDesc.innerText = desc;
    confirmCallback = callback;
    confirmOverlay.classList.remove('hidden');
}

init();