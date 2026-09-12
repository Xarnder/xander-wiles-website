import { db } from './firebase-config.js';
import { doc, updateDoc, writeBatch, arrayRemove, arrayUnion, deleteDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { state } from './store.js';
import { showToast } from './utils.js';

/**
 * Scan the current application state for all types of list duplicates:
 * 1. multiBoardLists: Same list ID present in more than one board's listOrder
 * 2. sameNameLists: Different list IDs that have the same (or nearly identical) title
 */
export function scanDuplicateLists() {
    const rawLists = state.appData.rawLists || [];
    const boards = state.appData.boards || [];
    const listMap = new Map(rawLists.map(l => [l.id, l]));

    // 1. Lists on multiple boards
    const listIdToBoards = new Map();
    boards.forEach(b => {
        const uniqueListIds = new Set(b.listOrder || []);
        uniqueListIds.forEach(lid => {
            if (!listIdToBoards.has(lid)) listIdToBoards.set(lid, []);
            listIdToBoards.get(lid).push({ id: b.id, title: b.title || 'Untitled Board' });
        });
    });

    const multiBoardLists = [];
    listIdToBoards.forEach((boardList, lid) => {
        if (boardList.length > 1) {
            const listObj = listMap.get(lid);
            multiBoardLists.push({
                listId: lid,
                title: listObj ? listObj.title : 'Untitled List',
                taskCount: (listObj && listObj.taskIds) ? listObj.taskIds.length : 0,
                boards: boardList
            });
        }
    });

    // 2. Different lists with the same (or very similar) title
    const listsByTitle = new Map();
    rawLists.forEach(l => {
        const norm = (l.title || '').trim().toLowerCase();
        if (!norm) return;
        if (!listsByTitle.has(norm)) listsByTitle.set(norm, []);
        listsByTitle.get(norm).push(l);
    });

    const sameNameLists = [];
    listsByTitle.forEach((group, normTitle) => {
        if (group.length > 1) {
            sameNameLists.push({
                normalizedTitle: normTitle,
                title: group[0].title,
                count: group.length,
                lists: group.map(l => {
                    const assignedBoards = (listIdToBoards.get(l.id) || []);
                    return {
                        id: l.id,
                        title: l.title,
                        taskCount: (l.taskIds || []).length,
                        taskIds: l.taskIds || [],
                        boards: assignedBoards
                    };
                })
            });
        }
    });

    return {
        multiBoardLists,
        sameNameLists
    };
}

/**
 * Scan the current application state for all types of task duplicates:
 * 1. multiListTasks: Same task ID present in more than one list's taskIds
 * 2. sameTextTasks: Different task IDs that have identical text
 * @param {Object} options
 * @param {boolean} [options.includeArchived=false]
 * @param {boolean} [options.includeCompleted=true]
 */
export function scanDuplicateTasks(options = {}) {
    const { includeArchived = false, includeCompleted = true } = options;
    const rawLists = state.appData.rawLists || [];
    const tasks = state.appData.tasks || {};

    // 1. Same Task ID in multiple lists
    const taskIdToLists = new Map();
    rawLists.forEach(l => {
        const uniqueTaskIds = new Set(l.taskIds || []);
        uniqueTaskIds.forEach(tid => {
            if (!taskIdToLists.has(tid)) taskIdToLists.set(tid, []);
            taskIdToLists.get(tid).push({ id: l.id, title: l.title });
        });
    });

    const multiListTasks = [];
    taskIdToLists.forEach((listArr, tid) => {
        if (listArr.length > 1) {
            const task = tasks[tid];
            if (!task) return;
            if (!includeArchived && task.archived) return;
            if (!includeCompleted && task.completed) return;
            multiListTasks.push({
                taskId: tid,
                text: task.text || '(No text)',
                completed: !!task.completed,
                archived: !!task.archived,
                createdAt: task.createdAt || 0,
                lists: listArr
            });
        }
    });

    // 2. Distinct Task IDs with identical normalized text
    const tasksByText = new Map();
    Object.entries(tasks).forEach(([tid, task]) => {
        if (!task) return;
        if (!includeArchived && task.archived) return;
        if (!includeCompleted && task.completed) return;

        const norm = (task.text || '').trim().toLowerCase();
        if (!norm) return;

        if (!tasksByText.has(norm)) tasksByText.set(norm, []);
        tasksByText.get(norm).push({
            id: tid,
            text: task.text,
            completed: !!task.completed,
            archived: !!task.archived,
            createdAt: task.createdAt || 0,
            lists: taskIdToLists.get(tid) || []
        });
    });

    const sameTextTasks = [];
    tasksByText.forEach((taskArr, normText) => {
        if (taskArr.length > 1) {
            sameTextTasks.push({
                normalizedText: normText,
                text: taskArr[0].text,
                count: taskArr.length,
                tasks: taskArr.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)) // Newest first
            });
        }
    });

    // Sort groups by duplicate count descending
    sameTextTasks.sort((a, b) => b.count - a.count);

    return {
        multiListTasks,
        sameTextTasks
    };
}

/**
 * Remove a list from a specific board's listOrder without deleting the list document or tasks.
 * @param {string} listId
 * @param {string} boardId
 */
export async function removeListFromBoard(listId, boardId) {
    if (!state.currentUser) throw new Error("Not logged in");
    const board = (state.appData.boards || []).find(b => b.id === boardId);
    if (!board) throw new Error("Board not found");

    const newOrder = (board.listOrder || []).filter(id => id !== listId);
    await updateDoc(doc(db, "users", state.currentUser.uid, "boards", boardId), {
        listOrder: newOrder
    });

    // Update local state immediately
    board.listOrder = newOrder;
    if (state.appData.currentBoardId === boardId) {
        state.appData.listOrder = newOrder;
    }
}

/**
 * Automatically remove multi-board lists from a specified board (e.g. 'main_board')
 * while keeping them on their original / primary board.
 * @param {string} boardIdToRemoveFrom e.g. 'main_board'
 */
export async function removeAllMultiBoardListsFromBoard(boardIdToRemoveFrom) {
    if (!state.currentUser) throw new Error("Not logged in");
    const { multiBoardLists } = scanDuplicateLists();
    const targetBoard = (state.appData.boards || []).find(b => b.id === boardIdToRemoveFrom);
    if (!targetBoard) throw new Error("Board not found");

    const listsToRemove = multiBoardLists
        .filter(item => item.boards.some(b => b.id === boardIdToRemoveFrom))
        .map(item => item.listId);

    if (listsToRemove.length === 0) {
        showToast("No duplicate lists found on this board.", "info");
        return 0;
    }

    const removeSet = new Set(listsToRemove);
    const newOrder = (targetBoard.listOrder || []).filter(id => !removeSet.has(id));

    await updateDoc(doc(db, "users", state.currentUser.uid, "boards", boardIdToRemoveFrom), {
        listOrder: newOrder
    });

    // Update local state
    targetBoard.listOrder = newOrder;
    if (state.appData.currentBoardId === boardIdToRemoveFrom) {
        state.appData.listOrder = newOrder;
    }

    return listsToRemove.length;
}

/**
 * Remove a task from a specific list without deleting the task document.
 * @param {string} taskId
 * @param {string} listId
 */
export async function removeTaskFromList(taskId, listId) {
    if (!state.currentUser) throw new Error("Not logged in");
    const list = (state.appData.rawLists || []).find(l => l.id === listId);
    if (!list) throw new Error("List not found");

    await updateDoc(doc(db, "users", state.currentUser.uid, "lists", listId), {
        taskIds: arrayRemove(taskId)
    });

    // Update local state
    list.taskIds = (list.taskIds || []).filter(id => id !== taskId);
}

/**
 * Permanently delete a task document and remove it from all lists.
 * @param {string} taskId
 */
export async function deleteTaskForever(taskId) {
    if (!state.currentUser) throw new Error("Not logged in");
    const batch = writeBatch(db);

    batch.delete(doc(db, "users", state.currentUser.uid, "tasks", taskId));

    (state.appData.rawLists || []).forEach(list => {
        if (list.taskIds && list.taskIds.includes(taskId)) {
            batch.update(doc(db, "users", state.currentUser.uid, "lists", list.id), {
                taskIds: arrayRemove(taskId)
            });
            list.taskIds = list.taskIds.filter(id => id !== taskId);
        }
    });

    await batch.commit();
    delete state.appData.tasks[taskId];
}

/**
 * Merge sourceList into targetList:
 * Moves all task IDs from sourceList into targetList, then deletes or unlinks sourceList.
 * @param {string} sourceListId
 * @param {string} targetListId
 * @param {boolean} [deleteSource=true]
 */
export async function mergeLists(sourceListId, targetListId, deleteSource = true) {
    if (!state.currentUser) throw new Error("Not logged in");
    if (sourceListId === targetListId) throw new Error("Cannot merge list into itself");

    const source = (state.appData.rawLists || []).find(l => l.id === sourceListId);
    const target = (state.appData.rawLists || []).find(l => l.id === targetListId);
    if (!source || !target) throw new Error("Source or target list not found");

    const tasksToMove = source.taskIds || [];

    if (tasksToMove.length > 0) {
        // Chunk task updates in blocks of 400 to safely stay under Firestore 500-op limit
        const CHUNK_SIZE = 400;
        for (let i = 0; i < tasksToMove.length; i += CHUNK_SIZE) {
            const chunk = tasksToMove.slice(i, i + CHUNK_SIZE);
            const taskBatch = writeBatch(db);
            if (i === 0) {
                taskBatch.update(doc(db, "users", state.currentUser.uid, "lists", targetListId), {
                    taskIds: arrayUnion(...tasksToMove)
                });
            }
            chunk.forEach(tid => {
                taskBatch.update(doc(db, "users", state.currentUser.uid, "tasks", tid), {
                    [`listAddedAt.${targetListId}`]: Date.now()
                });
            });
            await taskBatch.commit();
        }
    }

    const batch = writeBatch(db);
    if (deleteSource) {
        batch.delete(doc(db, "users", state.currentUser.uid, "lists", sourceListId));
        // Remove from all boards
        (state.appData.boards || []).forEach(b => {
            if (b.listOrder && b.listOrder.includes(sourceListId)) {
                batch.update(doc(db, "users", state.currentUser.uid, "boards", b.id), {
                    listOrder: arrayRemove(sourceListId)
                });
                b.listOrder = b.listOrder.filter(id => id !== sourceListId);
            }
        });
    } else {
        batch.update(doc(db, "users", state.currentUser.uid, "lists", sourceListId), {
            taskIds: []
        });
        source.taskIds = [];
    }

    await batch.commit();

    // Local state updates
    target.taskIds = [...new Set([...(target.taskIds || []), ...tasksToMove])];
    if (deleteSource) {
        state.appData.rawLists = state.appData.rawLists.filter(l => l.id !== sourceListId);
        if (state.appData.listOrder) {
            state.appData.listOrder = state.appData.listOrder.filter(id => id !== sourceListId);
        }
    }
}
