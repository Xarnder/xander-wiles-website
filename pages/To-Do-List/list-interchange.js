/**
 * Single-list JSON interchange for To-Do List / Story Manager → Markdown Editor.
 * Format: xander-list-v1
 */

export const XANDER_LIST_FORMAT = 'xander-list-v1';

/**
 * Flatten a nested idea tree into indented markdown under the parent text.
 * @param {Array} nodes
 * @param {number} depth
 */
function formatNestedTree(nodes, depth = 0) {
    if (!Array.isArray(nodes) || !nodes.length) return '';
    const lines = [];
    const pad = '  '.repeat(depth);
    for (const node of nodes) {
        if (!node || typeof node !== 'object') continue;
        const text = String(node.text ?? '').trim() || '(untitled)';
        lines.push(`${pad}- ${text}`);
        const child = formatNestedTree(node.nestedIdeas || node.nested || [], depth + 1);
        if (child) lines.push(child);
    }
    return lines.join('\n');
}

/**
 * Serialize nested nodes for the interchange file (preserve structure).
 * @param {Array} nodes
 */
function serializeNested(nodes) {
    if (!Array.isArray(nodes)) return [];
    return nodes
        .filter((n) => n && typeof n === 'object')
        .map((n) => ({
            id: typeof n.id === 'string' ? n.id : undefined,
            text: String(n.text ?? ''),
            completed: Boolean(n.completed),
            nested: serializeNested(n.nestedIdeas || n.nested || []),
        }));
}

/**
 * Build a portable single-list payload from live app state pieces.
 * @param {object} options
 * @param {{ id: string, title?: string, taskIds?: string[] }} options.list
 * @param {Record<string, object>} options.tasks
 * @param {(task: object) => string[]} options.resolveTags
 * @param {(task: object) => boolean} [options.isImportant]
 * @param {string} [options.source]
 */
export function buildXanderListV1({
    list,
    tasks,
    resolveTags,
    isImportant = () => false,
    source = 'to-do-list',
}) {
    if (!list || typeof list !== 'object') {
        throw new Error('List is required');
    }
    const taskMap = tasks && typeof tasks === 'object' ? tasks : {};
    const items = [];

    for (const taskId of list.taskIds || []) {
        const task = taskMap[taskId];
        if (!task) continue;
        const nested = serializeNested(task.nestedIdeas || []);
        const tags = typeof resolveTags === 'function' ? resolveTags(task) : [];
        items.push({
            id: String(task.id || taskId),
            text: String(task.text ?? ''),
            tags: Array.isArray(tags) ? tags.filter(Boolean).map(String) : [],
            completed: Boolean(task.completed),
            archived: Boolean(task.archived),
            important: Boolean(isImportant(task)),
            kanbanStatus: typeof task.kanbanStatus === 'string' ? task.kanbanStatus : undefined,
            createdAt: task.createdAt ?? null,
            updatedAt: task.updatedAt ?? null,
            nested,
        });
    }

    return {
        format: XANDER_LIST_FORMAT,
        source: String(source || 'to-do-list'),
        exportedAt: new Date().toISOString(),
        list: {
            id: String(list.id || ''),
            title: String(list.title || 'Untitled list'),
        },
        items,
    };
}

/**
 * Convert interchange payload → plain markdown document.
 * List title becomes an H1; items (and nested children) become a bullet list.
 * @param {object} payload
 * @returns {string}
 */
export function xanderListToMarkdown(payload) {
    const parsed = normalizeXanderListPayload(payload);
    const title = String(parsed.list.title || 'Untitled list').trim() || 'Untitled list';
    const tree = parsed.items.map((item) => ({
        text: item.text,
        nested: item.nested || [],
    }));
    const body = formatNestedTree(tree, 0);
    if (!body) {
        return `# ${title}\n`;
    }
    return `# ${title}\n\n${body}\n`;
}

/**
 * Convert interchange payload → Markdown Editor mdlist object.
 * Nested children are flattened into the item text as indented bullets.
 * Scores are assigned from list order (first = highest).
 * @param {object} payload
 */
export function xanderListToMdlist(payload) {
    const parsed = normalizeXanderListPayload(payload);
    const n = parsed.items.length;
    const items = parsed.items.map((item, index) => {
        const nestedText = formatNestedTree(item.nested || []);
        let text = String(item.text ?? '').trim();
        if (nestedText) {
            text = text ? `${text}\n${nestedText}` : nestedText;
        }
        const tags = Array.isArray(item.tags) ? [...new Set(item.tags.map(String).filter(Boolean))] : [];
        if (item.archived && !tags.includes('archived')) tags.push('archived');
        if (item.important && !tags.includes('important')) tags.push('important');

        const out = {
            id: item.id || `item_${index + 1}`,
            text,
            tags,
            score: n - index,
        };
        if (item.completed) out.completed = true;
        if (item.archived) out.archived = true;
        if (item.kanbanStatus) out.kanbanStatus = item.kanbanStatus;
        return out;
    });

    return {
        version: 1,
        id: parsed.list.id || `list_${Date.now().toString(36)}`,
        title: parsed.list.title || 'Imported list',
        items,
        sourceFormat: XANDER_LIST_FORMAT,
        importedFrom: parsed.source || undefined,
        importedAt: new Date().toISOString(),
    };
}

/**
 * @param {unknown} raw
 */
export function normalizeXanderListPayload(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new Error('List JSON must be an object');
    }
    const format = raw.format;
    if (format && format !== XANDER_LIST_FORMAT) {
        throw new Error(`Unsupported list format "${format}" (expected ${XANDER_LIST_FORMAT})`);
    }
    // Allow omitting format if shape is clearly a single list export
    if (!format) {
        if (!raw.list || !Array.isArray(raw.items)) {
            throw new Error(`Missing format "${XANDER_LIST_FORMAT}" (or list + items)`);
        }
    }

    const listIn = raw.list && typeof raw.list === 'object' ? raw.list : {};
    const list = {
        id: typeof listIn.id === 'string' && listIn.id.trim() ? listIn.id.trim() : '',
        title:
            typeof listIn.title === 'string' && listIn.title.trim()
                ? listIn.title.trim()
                : 'Untitled list',
    };

    if (!Array.isArray(raw.items)) {
        throw new Error('List export must include an items array');
    }

    const items = raw.items.map((entry, index) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
            return {
                id: `item_${index + 1}`,
                text: '',
                tags: [],
                completed: false,
                archived: false,
                important: false,
                nested: [],
            };
        }
        return {
            id: typeof entry.id === 'string' && entry.id.trim() ? entry.id.trim() : `item_${index + 1}`,
            text: typeof entry.text === 'string' ? entry.text : String(entry.text ?? ''),
            tags: Array.isArray(entry.tags)
                ? entry.tags.filter((t) => typeof t === 'string' && t.trim()).map((t) => t.trim())
                : [],
            completed: Boolean(entry.completed),
            archived: Boolean(entry.archived),
            important: Boolean(entry.important),
            kanbanStatus: typeof entry.kanbanStatus === 'string' ? entry.kanbanStatus : undefined,
            createdAt: entry.createdAt ?? null,
            updatedAt: entry.updatedAt ?? null,
            nested: Array.isArray(entry.nested) ? entry.nested : [],
        };
    });

    return {
        format: XANDER_LIST_FORMAT,
        source: typeof raw.source === 'string' ? raw.source : '',
        exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : '',
        list,
        items,
    };
}

/**
 * Parse JSON text into a validated interchange payload.
 * @param {string} text
 */
export function parseXanderListJson(text) {
    let data;
    try {
        data = JSON.parse(String(text ?? ''));
    } catch (err) {
        throw new Error(err.message || 'Invalid JSON');
    }
    return normalizeXanderListPayload(data);
}
