/**
 * Subtask (nestedIdeas) tree helpers — Phase 1: migration + pure utilities.
 */
import { generateId } from './utils.js';
import { isValidKanbanStatus, KANBAN_STAGES, resolveKanbanStatus } from './kanban.js';

export const NESTED_TREE_SIZE_WARN_BYTES = 100 * 1024;
export const BOARD_NESTED_MAX_DEPTH = 3;

const PERSISTED_NODE_KEYS = ['aiRawInputSubtask'];

function defaultKanbanStatus(parentKanbanStatus) {
    if (isValidKanbanStatus(parentKanbanStatus)) return parentKanbanStatus;
    return 'new';
}

function copyOptionalNodeFields(source, target) {
    PERSISTED_NODE_KEYS.forEach((key) => {
        if (source[key] !== undefined) target[key] = source[key];
    });
}

/**
 * Idempotent migration: assign id, completed, completedAt, kanbanStatus; strip tempId.
 * @param {Array} nestedIdeas
 * @param {string} parentKanbanStatus
 * @returns {Array}
 */
export function migrateNestedTree(nestedIdeas, parentKanbanStatus = 'new') {
    if (!Array.isArray(nestedIdeas)) return [];

    const stageDefault = defaultKanbanStatus(parentKanbanStatus);
    const migrated = [];

    nestedIdeas.forEach((node) => {
        const result = migrateNestedNode(node, stageDefault);
        if (result) migrated.push(result);
    });

    return migrated;
}

function migrateNestedNode(node, parentKanbanStatus) {
    if (!node || typeof node !== 'object') return null;

    const text = typeof node.text === 'string' ? node.text.trim() : String(node.text ?? '').trim();
    const childSource = Array.isArray(node.nestedIdeas) ? node.nestedIdeas : [];
    const migratedChildren = migrateNestedTree(childSource, parentKanbanStatus);

    if (!text && migratedChildren.length === 0) return null;

    const completed = typeof node.completed === 'boolean' ? node.completed : false;
    const completedAt = typeof node.completedAt === 'number' ? node.completedAt : null;

    const migrated = {
        id: typeof node.id === 'string' && node.id.trim() ? node.id.trim() : generateId(),
        text,
        completed,
        completedAt: completed ? completedAt : null,
        kanbanStatus: isValidKanbanStatus(node.kanbanStatus)
            ? node.kanbanStatus
            : parentKanbanStatus,
        nestedIdeas: migratedChildren
    };

    copyOptionalNodeFields(node, migrated);
    return migrated;
}

/**
 * Returns true when Firestore persistence should enrich legacy nested nodes.
 */
export function nestedTreeNeedsMigration(nestedIdeas, parentKanbanStatus = 'new') {
    if (!Array.isArray(nestedIdeas) || nestedIdeas.length === 0) return false;
    return nestedIdeas.some((node) => nodeNeedsMigration(node, parentKanbanStatus));
}

function nodeNeedsMigration(node, parentKanbanStatus) {
    if (!node || typeof node !== 'object') return true;
    if (typeof node.id !== 'string' || !node.id.trim()) return true;
    if (typeof node.completed !== 'boolean') return true;
    if ('tempId' in node) return true;
    if (!isValidKanbanStatus(node.kanbanStatus)) return true;
    if (node.completed && node.completedAt != null && typeof node.completedAt !== 'number') return true;
    const children = Array.isArray(node.nestedIdeas) ? node.nestedIdeas : [];
    return children.some((child) => nodeNeedsMigration(child, parentKanbanStatus));
}

/**
 * Prepare nested tree for Firestore save (editor or import paths).
 */
export function sanitizeNestedForSave(nestedIdeas, parentKanbanStatus = 'new') {
    const migrated = migrateNestedTree(nestedIdeas, parentKanbanStatus);
    const size = getNestedTreeJsonSize(migrated);
    if (size > NESTED_TREE_SIZE_WARN_BYTES) {
        console.warn(`[nested] nestedIdeas JSON is ${size} bytes (>${NESTED_TREE_SIZE_WARN_BYTES}). Approaching Firestore doc limits.`);
    }
    return migrated;
}

export function getNestedTreeJsonSize(nestedIdeas) {
    try {
        return JSON.stringify(nestedIdeas || []).length;
    } catch {
        return 0;
    }
}

export function getParentKanbanStatus(task) {
    return resolveKanbanStatus(task);
}

export function findNodeById(nestedIdeas, nodeId) {
    if (!Array.isArray(nestedIdeas) || !nodeId) return null;

    for (const node of nestedIdeas) {
        if (!node || typeof node !== 'object') continue;
        if (node.id === nodeId) return node;
        const found = findNodeById(node.nestedIdeas, nodeId);
        if (found) return found;
    }
    return null;
}

export function allSubtasksComplete(nestedIdeas) {
    if (!Array.isArray(nestedIdeas) || nestedIdeas.length === 0) return false;

    return nestedIdeas.every((node) => {
        if (!node || typeof node !== 'object') return true;
        if (!node.completed) return false;
        return allSubtasksComplete(node.nestedIdeas);
    });
}

/** Count all nodes in a nested tree (for board depth-cap hints). */
export function countNestedNodes(nestedIdeas) {
    if (!Array.isArray(nestedIdeas)) return 0;
    return nestedIdeas.reduce((sum, node) => {
        if (!node || typeof node !== 'object') return sum;
        return sum + 1 + countNestedNodes(node.nestedIdeas);
    }, 0);
}

/**
 * Return a new tree with one node's completed state updated.
 */
export function setNodeCompleted(nestedIdeas, nodeId, completed) {
    if (!Array.isArray(nestedIdeas) || !nodeId) return nestedIdeas || [];

    return nestedIdeas.map((node) => {
        if (!node || typeof node !== 'object') return node;

        if (node.id === nodeId) {
            return {
                ...node,
                completed: !!completed,
                completedAt: completed ? Date.now() : null,
                nestedIdeas: Array.isArray(node.nestedIdeas) ? node.nestedIdeas : []
            };
        }

        const children = Array.isArray(node.nestedIdeas) ? node.nestedIdeas : [];
        if (children.length === 0) return node;

        return {
            ...node,
            nestedIdeas: setNodeCompleted(children, nodeId, completed)
        };
    });
}

/**
 * Reorder direct children under a parent node (parentNodeId null = task root).
 */
export function reorderNestedSiblings(nestedIdeas, parentNodeId, orderedChildIds) {
    if (!Array.isArray(nestedIdeas)) return [];

    const reorderLevel = (siblings) => {
        if (!Array.isArray(siblings)) return [];
        const byId = new Map();
        siblings.forEach((node) => {
            if (node?.id) byId.set(node.id, node);
        });

        const reordered = orderedChildIds
            .map((id) => byId.get(id))
            .filter(Boolean);

        siblings.forEach((node) => {
            if (node?.id && !orderedChildIds.includes(node.id)) {
                reordered.push(node);
            }
        });

        return reordered;
    };

    if (parentNodeId == null || parentNodeId === 'root') {
        return reorderLevel(nestedIdeas);
    }

    return nestedIdeas.map((node) => {
        if (!node || typeof node !== 'object') return node;

        if (node.id === parentNodeId) {
            return {
                ...node,
                nestedIdeas: reorderLevel(node.nestedIdeas || [])
            };
        }

        const children = Array.isArray(node.nestedIdeas) ? node.nestedIdeas : [];
        if (children.length === 0) return node;

        return {
            ...node,
            nestedIdeas: reorderNestedSiblings(children, parentNodeId, orderedChildIds)
        };
    });
}

export function getParentKanbanSpan(task) {
    const parentStatus = getParentKanbanStatus(task);
    const stagesWithOpen = new Set();

    const walk = (nodes) => {
        if (!Array.isArray(nodes)) return;
        nodes.forEach((node) => {
            if (!node || typeof node !== 'object') return;
            if (!node.completed) {
                stagesWithOpen.add(
                    isValidKanbanStatus(node.kanbanStatus) ? node.kanbanStatus : parentStatus
                );
            }
            walk(node.nestedIdeas);
        });
    };

    walk(task?.nestedIdeas);

    const columns = stagesWithOpen.size > 0
        ? KANBAN_STAGES.filter((stage) => stagesWithOpen.has(stage))
        : [parentStatus];

    const startIndex = KANBAN_STAGES.indexOf(columns[0]);
    const endIndex = KANBAN_STAGES.indexOf(columns[columns.length - 1]);

    return {
        columns,
        startIndex: startIndex >= 0 ? startIndex : 0,
        endIndex: endIndex >= 0 ? endIndex + 1 : 1,
        span: Math.max(1, (endIndex >= 0 ? endIndex : 0) - (startIndex >= 0 ? startIndex : 0) + 1)
    };
}

export function isMultiColumnKanbanStretch(task) {
    return getParentKanbanSpan(task).span > 1;
}

export function getKanbanPlacementStage(task) {
    return getParentKanbanSpan(task).columns[0] || getParentKanbanStatus(task);
}

export function setNodeKanbanStatus(nestedIdeas, nodeId, kanbanStatus) {
    if (!Array.isArray(nestedIdeas) || !nodeId || !isValidKanbanStatus(kanbanStatus)) {
        return nestedIdeas || [];
    }

    return nestedIdeas.map((node) => {
        if (!node || typeof node !== 'object') return node;

        if (node.id === nodeId) {
            return {
                ...node,
                kanbanStatus,
                nestedIdeas: Array.isArray(node.nestedIdeas) ? node.nestedIdeas : []
            };
        }

        const children = Array.isArray(node.nestedIdeas) ? node.nestedIdeas : [];
        if (children.length === 0) return node;

        return {
            ...node,
            nestedIdeas: setNodeKanbanStatus(children, nodeId, kanbanStatus)
        };
    });
}

/** True if any nested node text contains term (case-insensitive). */
export function nestedIdeasMatchSearch(nestedIdeas, term) {
    if (!term || !Array.isArray(nestedIdeas)) return null;

    const lower = term.toLowerCase();

    const walk = (nodes) => {
        for (const node of nodes) {
            if (!node || typeof node !== 'object') continue;
            const text = typeof node.text === 'string' ? node.text : '';
            if (text.toLowerCase().includes(lower)) return text;
            const childHit = walk(node.nestedIdeas);
            if (childHit) return childHit;
        }
        return null;
    };

    return walk(nestedIdeas);
}

export function taskMatchesSearch(task, term) {
    if (!task || !term) return { matched: false };

    const lower = term.toLowerCase();
    if (typeof task.text === 'string' && task.text.toLowerCase().includes(lower)) {
        return { matched: true, source: 'parent' };
    }

    const nestedText = nestedIdeasMatchSearch(task.nestedIdeas, term);
    if (nestedText) {
        return { matched: true, source: 'nested', nestedText };
    }

    return { matched: false };
}
