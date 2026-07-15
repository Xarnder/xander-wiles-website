import { db } from './firebase-config.js';
import { doc, writeBatch, arrayUnion } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { generateId, parseNestedMarkdown } from './utils.js';
import { KANBAN_STAGES } from './kanban.js';
import { migrateNestedTree } from './nested.js';

export const TASK_IMPORT_FORMAT_VERSION = 1;
const BATCH_LIMIT = 450;
const ARRAY_UNION_CHUNK = 100;
const VALID_GLOW_COLORS = new Set(['none', '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#a855f7']);
const TASK_TEXT_KEYS = ['text', 'title', 'name', 'content', 'task', 'summary', 'description', 'label', 'body'];
const LIST_TITLE_KEYS = ['title', 'name', 'listName', 'list', 'project', 'section', 'label', 'heading'];
const LIST_TASK_KEYS = ['tasks', 'items', 'todos', 'entries', 'taskList', 'task_list'];
const SUBTASK_KEYS = ['nestedIdeas', 'subtasks', 'children', 'items', 'steps', 'subTasks', 'sub_items', 'checklist'];
const WRAPPER_KEYS = ['data', 'import', 'payload', 'project', 'result', 'content', 'body'];

function createDiagnostics() {
    return {
        errors: [],
        skips: [],
        fixes: [],
        info: [],
        counts: {
            sourceLists: 0,
            sourceTasks: 0,
            sourceSubtasks: 0,
            importedLists: 0,
            importedTasks: 0,
            importedSubtasks: 0,
            skippedLists: 0,
            skippedTasks: 0,
            skippedSubtasks: 0
        }
    };
}

function logSkip(diagnostics, message) {
    diagnostics.skips.push(message);
}

function logFix(diagnostics, message) {
    diagnostics.fixes.push(message);
}

function logInfo(diagnostics, message) {
    diagnostics.info.push(message);
}

function logError(diagnostics, message) {
    diagnostics.errors.push(message);
}

function countRawSubtasks(items) {
    let count = 0;
    asArray(items).forEach((item) => {
        if (typeof item === 'string' || typeof item === 'number') {
            if (pickString(item)) count += 1;
            return;
        }
        if (!item || typeof item !== 'object') return;
        if (extractTaskText(item)) count += 1;
        count += countRawSubtasks(getSubtaskSource(item));
    });
    return count;
}

export function buildImportReportSummary(result) {
    const diagnostics = result?.diagnostics;
    const stats = result?.data?.stats;

    if (!diagnostics) {
        return {
            headline: result?.ok ? 'Import ready' : 'Import blocked',
            subheadline: result?.errors?.[0] || 'No importable tasks found.',
            canImport: !!result?.ok,
            confirmLabel: 'Import Tasks'
        };
    }

    const { counts } = diagnostics;
    const totalSkippedItems = counts.skippedTasks + counts.skippedSubtasks;
    const failedLists = counts.skippedLists;

    if (!stats) {
        const parts = [];
        if (counts.skippedTasks > 0) parts.push(`${counts.skippedTasks} task${counts.skippedTasks === 1 ? '' : 's'}`);
        if (counts.skippedSubtasks > 0) parts.push(`${counts.skippedSubtasks} subtask${counts.skippedSubtasks === 1 ? '' : 's'}`);
        if (failedLists > 0) parts.push(`${failedLists} list${failedLists === 1 ? '' : 's'}`);

        return {
            headline: 'Import blocked',
            subheadline: parts.length
                ? `Nothing could be imported. Skipped ${parts.join(', ')}.`
                : (result?.errors?.[0] || 'No importable tasks found.'),
            canImport: false,
            confirmLabel: 'Import Tasks',
            totalSkippedItems,
            failedLists
        };
    }

    const totalImportedItems = stats.taskCount + stats.nestedCount;

    let headline = `Ready to add ${stats.taskCount} ${stats.taskCount === 1 ? 'task' : 'tasks'}`;
    if (stats.nestedCount > 0) {
        headline += ` and ${stats.nestedCount} subtask${stats.nestedCount === 1 ? '' : 's'}`;
    }
    headline += ` across ${stats.listCount} list${stats.listCount === 1 ? '' : 's'}`;

    let subheadline = `${totalImportedItems} total item${totalImportedItems === 1 ? '' : 's'} will be created.`;
    if (totalSkippedItems > 0 || failedLists > 0) {
        const parts = [];
        if (counts.skippedTasks > 0) parts.push(`${counts.skippedTasks} task${counts.skippedTasks === 1 ? '' : 's'}`);
        if (counts.skippedSubtasks > 0) parts.push(`${counts.skippedSubtasks} subtask${counts.skippedSubtasks === 1 ? '' : 's'}`);
        if (failedLists > 0) parts.push(`${failedLists} list${failedLists === 1 ? '' : 's'}`);
        subheadline += ` Skipped ${parts.join(', ')} from the source file.`;
    } else {
        subheadline += ' Nothing was skipped.';
    }

    if (counts.sourceTasks > 0 && counts.sourceTasks !== stats.taskCount) {
        subheadline += ` Source had ${counts.sourceTasks} top-level task${counts.sourceTasks === 1 ? '' : 's'}.`;
    }

    const confirmLabel = totalImportedItems > 0
        ? `Import ${stats.taskCount} ${stats.taskCount === 1 ? getTermLabel(true) : getTermLabel(false)}`
        : 'Import Tasks';

    return {
        headline,
        subheadline,
        canImport: !!result?.ok,
        totalImportedItems,
        totalSkippedItems,
        failedLists,
        confirmLabel
    };
}

function getTermLabel(singular) {
    const config = typeof window !== 'undefined' ? (window.APP_CONFIG || {}) : {};
    const terms = config.terms || { singular: 'task', plural: 'tasks' };
    return singular ? terms.singular : terms.plural;
}

const KANBAN_ALIASES = {
    new: 'new',
    todo: 'new',
    backlog: 'new',
    open: 'new',
    under_review: 'under_review',
    review: 'under_review',
    in_review: 'under_review',
    in_progress: 'under_review',
    progress: 'under_review',
    doing: 'under_review',
    almost_done: 'almost_done',
    almost: 'almost_done',
    nearly_done: 'almost_done',
    finishing: 'almost_done',
    finished: 'finished',
    done: 'finished',
    complete: 'finished',
    completed: 'finished',
    closed: 'finished'
};

export function getTaskImportInstructions() {
    return [
        'Sign in to the app first.',
        'Open Settings (gear) → Import Project Tasks (AI).',
        'Click Copy LLM Prompt and paste it into Cursor with your design docs attached.',
        'Important: ask the AI to create a real .json file on disk (e.g. project-tasks-import.json) — not just JSON in chat.',
        'In the app, click Choose JSON File and select that saved file (or paste into the box as a fallback).',
        'Click Analyze Import and review how many tasks will be added vs skipped.',
        'Choose "Create a new board" for a fresh project, or add to your current board.',
        'Click Import Tasks and wait for the progress bar to finish.',
        'If JSON fails, paste an indented outline instead — the importer accepts that too.'
    ];
}

export function getTaskImportPrompt() {
    return `You are generating a task import file for a to-do list app. Read ALL attached design documents carefully.

GOAL
Turn the design docs into an actionable project task list, grouped by module or delivery phase, saved as a real JSON file the user can import.

DELIVERABLE — READ THIS FIRST (most important)
- You MUST create an actual .json file on disk in the project/workspace
- Suggested filename: project-tasks-import.json (or <project-name>-tasks-import.json)
- In Cursor: use the file create/write tool to save the file — do NOT only print JSON in chat
- The chat reply should be SHORT: confirm the filename and path, plus a brief task/list count summary
- Do NOT dump the full JSON into the chat unless the user explicitly asks to see it
- The user will import this file via: To-Do List app → Settings → Import Project Tasks (AI) → Choose JSON File

OUTPUT DISCIPLINE (for the file contents)
- The .json file must contain ONE raw JSON object only
- Do NOT wrap the file contents in markdown code fences
- Do NOT add explanation, preamble, postamble, or apologies inside the file
- Do NOT include comments inside the JSON
- Use double quotes for all keys and string values
- No trailing commas
- Do NOT generate ids, taskIds, UUIDs, or backup/restore schema fields

REQUIRED JSON SHAPE
{
  "format": "task-import-v1",
  "projectTitle": "Short project name taken from the docs",
  "boardTitle": "Usually same as projectTitle",
  "lists": [
    {
      "title": "User Authentication",
      "description": "Optional one-line scope summary",
      "tasks": [
        {
          "text": "Implement login flow",
          "important": true,
          "subtasks": [
            "Build login form UI",
            "Wire OAuth provider",
            {
              "text": "Handle session persistence",
              "subtasks": ["Choose token strategy", "Add refresh handling"]
            }
          ]
        },
        {
          "text": "Add protected route guards",
          "subtasks": ["Create auth middleware", "Test redirect on expiry"]
        }
      ]
    }
  ]
}

HOW TO BUILD LISTS
- Create one list per major module, feature area, or delivery phase in the docs
- List titles: 2-5 words, Title Case (e.g. "Payment Integration", "Admin Dashboard")
- Use the doc's own section/module names when possible
- Do not create empty lists
- Do not duplicate the same work across multiple lists
- Avoid vague catch-all lists like "Misc" unless the source material is genuinely fragmented

HOW TO WRITE TASKS
- Top-level "tasks" = trackable deliverables someone would put on a kanban board
- Use imperative mood: "Implement...", "Design...", "Configure...", "Write tests for..."
- Keep top-level task text under 80 characters
- Aim for roughly 3-20 top-level tasks per list
- Merge tiny steps into subtasks; split oversized epics into multiple top-level tasks
- Only include work clearly implied by the design docs — do not invent features, phases, or scope

HOW TO USE SUBTASKS
- Put implementation/detail steps in "subtasks", NOT as separate top-level tasks
- Subtasks may be plain strings OR objects with "text" and nested "subtasks"
- Nest subtasks only when the doc implies real hierarchy (max 3 levels deep)
- Make subtasks concrete and specific — avoid "Handle stuff", "Do implementation", "Misc work"

PRIORITY / IMPORTANCE
- Set "important": true for blockers, security work, critical-path items, compliance, or boss sign-off dependencies
- Alternatively prefix text with "!! " (e.g. "!! Choose auth provider")
- Omit "important" or set false for normal tasks

KANBAN STATUS (optional — usually omit)
- Omit "kanbanStatus" for new work (default is "new")
- Only set when docs clearly indicate progress: "new", "under_review", "almost_done", "finished"

COMMON MISTAKES TO AVOID
- Do NOT only paste JSON in the chat — the user needs a real .json file they can upload
- Do not output markdown bullets, tables, or prose instead of JSON
- Do not create a flat list of 100 top-level tasks — group and subtask instead
- Do not repeat the same task in multiple lists
- Do not add tasks for future phases not described in the docs
- Do not use numbered markdown lists as task text (no "1. Do X")

FINAL SELF-CHECK (must pass before you respond)
1. A real .json file exists on disk with valid JSON inside
2. Chat reply names the file path (not the full JSON body)
3. "lists" is a non-empty array
4. Every list has a non-empty "title" and non-empty "tasks" array
5. Every task has non-empty "text"
6. Detail steps live in "subtasks", not as duplicate top-level tasks
7. The structure accurately reflects the attached design docs

Create the .json file now, then reply with the file path and import summary only.`;
}

function repairJsonText(text) {
    return String(text || '')
        .replace(/^\uFEFF/, '')
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/^\uFEFF/, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
        .replace(/,\s*([}\]])/g, '$1')
        .replace(/([{,]\s*)'([^'\\]*(?:\\.[^'\\]*)*)'/g, '$1"$2"')
        .replace(/\bTrue\b/g, 'true')
        .replace(/\bFalse\b/g, 'false')
        .replace(/\bNone\b/g, 'null')
        .replace(/\bundefined\b/g, 'null')
        .trim();
}

function stripMarkdownFences(text) {
    let cleaned = String(text || '').trim();
    cleaned = cleaned.replace(/^```(?:json|javascript|js)?\s*/i, '');
    cleaned = cleaned.replace(/\s*```$/i, '');
    return cleaned.trim();
}

export function extractJsonFromText(rawText) {
    let text = String(rawText || '').trim();
    if (!text) {
        throw new Error('Import file is empty.');
    }

    text = stripMarkdownFences(text);
    const attempts = new Set();

    const addAttempt = (candidate) => {
        const value = String(candidate || '').trim();
        if (!value) return;
        attempts.add(value);
        attempts.add(repairJsonText(value));
    };

    addAttempt(text);

    const objectStart = text.indexOf('{');
    const objectEnd = text.lastIndexOf('}');
    if (objectStart !== -1 && objectEnd > objectStart) {
        addAttempt(text.slice(objectStart, objectEnd + 1));
    }

    const arrayStart = text.indexOf('[');
    const arrayEnd = text.lastIndexOf(']');
    if (arrayStart !== -1 && arrayEnd > arrayStart) {
        addAttempt(text.slice(arrayStart, arrayEnd + 1));
    }

    const errors = [];
    for (const candidate of attempts) {
        try {
            return JSON.parse(candidate);
        } catch (error) {
            errors.push(error.message);
        }
    }

    throw new Error('Could not parse JSON. You can paste indented outline text instead, or remove commentary/markdown fences and try again.');
}

function asArray(value) {
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') return Object.values(value);
    return [];
}

function asTruthy(value) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    const normalized = pickString(value).toLowerCase();
    return ['true', 'yes', 'y', '1', 'important', 'critical', 'high'].includes(normalized);
}

function pickString(value, fallback = '') {
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return fallback;
}

function pickListTitle(list, index) {
    if (!list || typeof list !== 'object') return `Imported List ${index + 1}`;
    for (const key of LIST_TITLE_KEYS) {
        const value = pickString(list[key]);
        if (value) return value;
    }
    return `Imported List ${index + 1}`;
}

function getListTasks(list) {
    if (!list || typeof list !== 'object') return [];
    for (const key of LIST_TASK_KEYS) {
        if (Array.isArray(list[key])) return list[key];
    }
    return [];
}

function unwrapPayload(raw) {
    let current = raw;
    for (let depth = 0; depth < 3; depth += 1) {
        if (!current || typeof current !== 'object' || Array.isArray(current)) return current;
        let wrapped = null;
        for (const key of WRAPPER_KEYS) {
            const candidate = current[key];
            if (candidate && typeof candidate === 'object') {
                wrapped = candidate;
                break;
            }
        }
        if (!wrapped) return current;
        current = wrapped;
    }
    return current;
}

function extractTaskText(task) {
    if (typeof task === 'string' || typeof task === 'number') return pickString(task);
    if (!task || typeof task !== 'object') return '';

    for (const key of TASK_TEXT_KEYS) {
        const value = pickString(task[key]);
        if (value) return value;
    }

    return '';
}

function getSubtaskSource(task) {
    if (!task || typeof task !== 'object') return [];
    for (const key of SUBTASK_KEYS) {
        if (Array.isArray(task[key])) return task[key];
    }
    return [];
}

function normalizeKanbanStatus(value, completed) {
    const raw = pickString(value).toLowerCase().replace(/\s+/g, '_');
    const mapped = KANBAN_ALIASES[raw] || raw;
    if (KANBAN_STAGES.includes(mapped)) return mapped;
    if (completed) return 'finished';
    return 'new';
}

function normalizeGlowColor(value) {
    const color = pickString(value, 'none').toLowerCase();
    if (color === 'none') return 'none';
    const withHash = color.startsWith('#') ? color : `#${color}`;
    return VALID_GLOW_COLORS.has(withHash) ? withHash : 'none';
}

function normalizeNestedIdeas(items, diagnostics, context, parentKanbanStatus = 'new') {
    const output = [];

    asArray(items).forEach((item, index) => {
        if (typeof item === 'string' || typeof item === 'number') {
            const text = pickString(item);
            if (!text) {
                diagnostics.counts.skippedSubtasks += 1;
                logSkip(diagnostics, `Skipped empty subtask in ${context} at position ${index + 1}.`);
                return;
            }
            output.push({ text, nestedIdeas: [] });
            return;
        }

        if (!item || typeof item !== 'object') {
            diagnostics.counts.skippedSubtasks += 1;
            logSkip(diagnostics, `Skipped invalid subtask in ${context} at position ${index + 1}.`);
            return;
        }

        const text = extractTaskText(item);
        if (!text) {
            diagnostics.counts.skippedSubtasks += 1;
            logSkip(diagnostics, `Skipped subtask with no text in ${context} at position ${index + 1}.`);
            return;
        }

        const completed = asTruthy(item.completed);
        const nodeKanban = item.kanbanStatus
            ? normalizeKanbanStatus(item.kanbanStatus, completed)
            : parentKanbanStatus;

        output.push({
            id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : undefined,
            text,
            completed: typeof item.completed === 'boolean' ? item.completed : completed,
            completedAt: Number.isFinite(Number(item.completedAt)) ? Number(item.completedAt) : null,
            kanbanStatus: nodeKanban,
            nestedIdeas: normalizeNestedIdeas(
                getSubtaskSource(item),
                diagnostics,
                `${context} > "${text}"`,
                nodeKanban
            )
        });
    });

    return migrateNestedTree(output, parentKanbanStatus);
}

function applyImportantPrefix(text, important) {
    const clean = pickString(text);
    if (!clean) return '';
    if (important && !/^!+/.test(clean)) return `!! ${clean}`;
    return clean;
}

function normalizeTask(task, diagnostics, context, index) {
    const important = !!(task && typeof task === 'object' && asTruthy(task.important));
    const text = applyImportantPrefix(extractTaskText(task), important);

    if (!text) {
        diagnostics.counts.skippedTasks += 1;
        logSkip(diagnostics, `Skipped task with no text in ${context} at position ${index + 1}.`);
        return null;
    }

    const completed = !!(task && typeof task === 'object' && asTruthy(task.completed));
    const archived = !!(task && typeof task === 'object' && asTruthy(task.archived));
    const kanbanStatus = normalizeKanbanStatus(task?.kanbanStatus, completed);
    const glowColor = normalizeGlowColor(task?.glowColor);

    if (task?.kanbanStatus) {
        const rawStatus = pickString(task.kanbanStatus);
        const direct = rawStatus.toLowerCase().replace(/\s+/g, '_');
        if (!KANBAN_STAGES.includes(direct)) {
            logFix(diagnostics, `Task "${text}" had kanbanStatus "${rawStatus}". Mapped to "${kanbanStatus}".`);
        }
    }
    if (task?.glowColor && glowColor === 'none' && pickString(task.glowColor, 'none') !== 'none') {
        logFix(diagnostics, `Task "${text}" had invalid glowColor "${task.glowColor}". Set to "none".`);
    }

    const createdAt = Number.isFinite(Number(task?.createdAt))
        ? Number(task.createdAt)
        : Date.now() + index;

    return {
        id: generateId(),
        text,
        completed,
        archived,
        kanbanStatus,
        completedAt: completed ? (Number(task?.completedAt) || createdAt) : null,
        createdAt,
        updatedAt: Number.isFinite(Number(task?.updatedAt)) ? Number(task.updatedAt) : null,
        glowColor,
        images: Array.isArray(task?.images) ? task.images.filter(Boolean) : [],
        nestedIdeas: normalizeNestedIdeas(
            getSubtaskSource(task),
            diagnostics,
            `${context} > "${text}"`,
            kanbanStatus
        )
    };
}

function isTaskLike(value) {
    if (typeof value === 'string' || typeof value === 'number') return !!pickString(value);
    if (!value || typeof value !== 'object') return false;
    if (getListTasks(value).length > 0) return false;
    return !!extractTaskText(value);
}

function isListLike(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    if (getListTasks(value).length > 0) return true;
    if (Array.isArray(value.taskIds)) return true;
    return LIST_TITLE_KEYS.some((key) => pickString(value[key]));
}

function isBackupFormat(data) {
    if (!data || typeof data !== 'object') return false;
    const lists = asArray(data.lists);
    const tasks = data.tasks;
    if (!lists.length || !tasks) return false;
    return lists.some((list) => Array.isArray(list?.taskIds));
}

function collectListsSource(data, diagnostics) {
    if (Array.isArray(data)) {
        if (!data.length) return [];
        if (data.every(isListLike)) {
            logInfo(diagnostics, 'Root JSON was an array of lists.');
            return data;
        }
        if (data.every(isTaskLike)) {
            logInfo(diagnostics, 'Root JSON was an array of tasks. Created one imported list.');
            return [{ title: 'Imported Tasks', tasks: data }];
        }
        logInfo(diagnostics, 'Root JSON was an array. Best-effort import applied.');
        return data;
    }

    if (Array.isArray(data?.lists)) return data.lists;

    if (Array.isArray(data?.projects)) {
        logInfo(diagnostics, 'Detected "projects" key. Converted each project into a list.');
        return data.projects.map((project, index) => ({
            title: pickListTitle(project, index),
            description: pickString(project?.description) || null,
            tasks: getListTasks(project)
        }));
    }

    if (Array.isArray(data?.boards)) {
        const boardLists = data.boards.flatMap((board) => asArray(board?.lists));
        if (boardLists.length) {
            logInfo(diagnostics, 'Detected "boards" key. Flattened board lists into one import.');
            return boardLists;
        }
    }

    if (data?.title && getListTasks(data).length) {
        logInfo(diagnostics, 'Root JSON looked like a single list. Imported it as one list.');
        return [data];
    }

    if (Array.isArray(data?.tasks)) {
        logInfo(diagnostics, 'Root JSON had tasks without lists. Created a single imported list.');
        return [{ title: pickString(data.title, 'Imported Tasks'), tasks: data.tasks }];
    }

    if (Array.isArray(data?.items) && data.items.every(isTaskLike)) {
        logInfo(diagnostics, 'Root JSON had top-level "items". Created a single imported list.');
        return [{ title: pickString(data.title, 'Imported Tasks'), tasks: data.items }];
    }

    return [];
}

function countSourceFromLists(listsSource) {
    let sourceTasks = 0;
    let sourceSubtasks = 0;
    listsSource.forEach((list) => {
        const tasks = getListTasks(list);
        sourceTasks += tasks.length;
        tasks.forEach((task) => {
            sourceSubtasks += countRawSubtasks(getSubtaskSource(task));
        });
    });
    return { sourceLists: listsSource.length, sourceTasks, sourceSubtasks };
}

function normalizeBackupFormat(data, diagnostics) {
    const taskRecords = [];
    const taskMap = new Map();

    asArray(data.tasks).forEach((task, index) => {
        const normalized = normalizeTask(task, diagnostics, 'backup tasks', index);
        if (!normalized) return;
        taskRecords.push(normalized);
        if (task?.id) taskMap.set(String(task.id), normalized);
        taskMap.set(`__index_${index}`, normalized);
    });

    const claimedTaskIds = new Set();
    const lists = asArray(data.lists).map((list, listIndex) => {
        const title = pickListTitle(list, listIndex);
        const description = pickString(list?.description) || null;
        const tasks = [];

        asArray(list?.taskIds).forEach((taskId) => {
            const match = taskMap.get(String(taskId));
            if (!match) {
                diagnostics.counts.skippedTasks += 1;
                logSkip(diagnostics, `List "${title}" referenced missing task id "${taskId}".`);
                return;
            }
            if (claimedTaskIds.has(match.id)) {
                logSkip(diagnostics, `Task "${match.text}" appeared in multiple lists. Kept first list only.`);
                return;
            }
            claimedTaskIds.add(match.id);
            tasks.push(match);
        });

        getListTasks(list).forEach((task, taskIndex) => {
            const normalized = normalizeTask(task, diagnostics, `list "${title}"`, taskIndex);
            if (!normalized) return;
            if (claimedTaskIds.has(normalized.id)) return;
            claimedTaskIds.add(normalized.id);
            tasks.push(normalized);
        });

        return { title, description, tasks };
    }).filter((list) => list.title);

    const orphanTasks = taskRecords.filter((task) => !claimedTaskIds.has(task.id));
    if (orphanTasks.length > 0) {
        logInfo(diagnostics, `Moved ${orphanTasks.length} unassigned task(s) into "Imported Tasks".`);
        lists.push({
            title: 'Imported Tasks',
            description: 'Tasks from backup JSON that were not linked to a list.',
            tasks: orphanTasks
        });
    }

    return {
        projectTitle: pickString(data.projectTitle, 'Imported Project'),
        boardTitle: pickString(data.boardTitle, pickString(data.projectTitle, 'Imported Project')),
        lists
    };
}

function normalizeSimpleFormat(data, diagnostics) {
    const listsSource = collectListsSource(data, diagnostics);
    diagnostics.counts.sourceLists = listsSource.length;
    const sourceCounts = countSourceFromLists(listsSource);
    diagnostics.counts.sourceTasks = sourceCounts.sourceTasks;
    diagnostics.counts.sourceSubtasks = sourceCounts.sourceSubtasks;

    const lists = listsSource.map((list, listIndex) => {
        const title = pickListTitle(list, listIndex);
        const description = pickString(list?.description) || null;
        const tasks = getListTasks(list)
            .map((task, taskIndex) => normalizeTask(task, diagnostics, `list "${title}"`, taskIndex))
            .filter(Boolean);

        return { title, description, tasks };
    }).filter((list) => list.title);

    return {
        projectTitle: pickString(data?.projectTitle, pickString(data?.name, 'Imported Project')),
        boardTitle: pickString(data?.boardTitle, pickString(data?.projectTitle, pickString(data?.name, 'Imported Project'))),
        lists
    };
}

function parseOutlineSections(text, diagnostics) {
    const cleaned = String(text || '').trim();
    if (!cleaned) return null;

    const lines = cleaned.split('\n');
    const sections = [];
    let current = null;

    const pushSection = () => {
        if (!current) return;
        const items = parseNestedMarkdown(current.body.join('\n'));
        if (items.length) sections.push({ title: current.title, tasks: items });
        else {
            diagnostics.counts.skippedLists += 1;
            logSkip(diagnostics, `Skipped empty outline section "${current.title}".`);
        }
    };

    lines.forEach((line) => {
        const headingMatch = line.match(/^\s*#{1,6}\s*LIST:\s*(.+)$/i) || line.match(/^\s*LIST:\s*(.+)$/i);
        if (headingMatch) {
            pushSection();
            current = { title: headingMatch[1].trim(), body: [] };
            return;
        }
        if (!current) current = { title: 'Imported Tasks', body: [] };
        current.body.push(line);
    });
    pushSection();

    diagnostics.counts.sourceLists = sections.length || 1;

    if (!sections.length) {
        const items = parseNestedMarkdown(cleaned);
        if (!items.length) return null;
        diagnostics.counts.sourceTasks = items.length;
        diagnostics.counts.sourceSubtasks = items.reduce((sum, item) => (
            sum + countRawSubtasks(item?.nestedIdeas || [])
        ), 0);
        return [{
            title: 'Imported Tasks',
            description: null,
            tasks: items.map((item, index) => normalizeTask(item, diagnostics, 'outline import', index)).filter(Boolean)
        }];
    }

    diagnostics.counts.sourceTasks = sections.reduce((sum, section) => sum + section.tasks.length, 0);
    diagnostics.counts.sourceSubtasks = sections.reduce((sum, section) => (
        sum + section.tasks.reduce((taskSum, task) => taskSum + countRawSubtasks(task?.nestedIdeas || []), 0)
    ), 0);

    return sections.map((section, listIndex) => ({
        title: pickString(section.title, `Imported List ${listIndex + 1}`),
        description: null,
        tasks: section.tasks
            .map((task, taskIndex) => normalizeTask(task, diagnostics, `outline list "${section.title}"`, taskIndex))
            .filter(Boolean)
    }));
}

function parseOutlineImport(rawText, diagnostics) {
    const sections = parseOutlineSections(rawText, diagnostics);
    if (!sections || !sections.length) {
        return { ok: false, errors: diagnostics.errors, diagnostics, data: null };
    }

    return normalizeImportData({
        projectTitle: 'Imported Project',
        boardTitle: 'Imported Project',
        lists: sections
    }, diagnostics, { fromOutline: true });
}

export function normalizeImportData(raw, seedDiagnostics = null, options = {}) {
    const diagnostics = seedDiagnostics || createDiagnostics();
    const errors = diagnostics.errors;

    if (!raw || (typeof raw !== 'object' && !Array.isArray(raw))) {
        logError(diagnostics, 'Import data must be a JSON object or array.');
        return { ok: false, errors: diagnostics.errors, diagnostics, data: null };
    }

    const unwrapped = unwrapPayload(raw);
    if (unwrapped !== raw) logInfo(diagnostics, 'Detected wrapped JSON payload. Unwrapped one level automatically.');

    const intermediate = isBackupFormat(unwrapped)
        ? normalizeBackupFormat(unwrapped, diagnostics)
        : normalizeSimpleFormat(unwrapped, diagnostics);

    if (isBackupFormat(unwrapped)) {
        diagnostics.counts.sourceLists = asArray(unwrapped.lists).length;
        diagnostics.counts.sourceTasks = asArray(unwrapped.tasks).length;
        logInfo(diagnostics, 'Detected backup-style JSON. IDs were regenerated to avoid collisions.');
    }
    if (options.fromOutline) {
        logInfo(diagnostics, 'Imported from indented outline text instead of JSON.');
    }

    const lists = intermediate.lists
        .map((list) => ({
            id: generateId(),
            title: list.title,
            description: list.description || null,
            tasks: list.tasks
        }))
        .filter((list) => list.tasks.length > 0);

    const removedEmptyLists = intermediate.lists.length - lists.length;
    if (removedEmptyLists > 0) {
        diagnostics.counts.skippedLists += removedEmptyLists;
        logSkip(diagnostics, `Removed ${removedEmptyLists} list(s) with no valid tasks.`);
    }

    if (!lists.length) {
        logError(diagnostics, 'No importable lists with tasks were found.');
    }

    const taskCount = lists.reduce((sum, list) => sum + list.tasks.length, 0);
    if (!taskCount) {
        logError(diagnostics, 'No importable tasks were found.');
    }

    const nestedCount = lists.reduce((sum, list) => (
        sum + list.tasks.reduce((taskSum, task) => taskSum + countNestedIdeas(task.nestedIdeas), 0)
    ), 0);

    diagnostics.counts.importedLists = lists.length;
    diagnostics.counts.importedTasks = taskCount;
    diagnostics.counts.importedSubtasks = nestedCount;

    const hasErrors = diagnostics.errors.length > 0;

    return {
        ok: !hasErrors,
        errors: diagnostics.errors,
        diagnostics,
        data: hasErrors ? null : {
            projectTitle: pickString(intermediate.projectTitle, 'Imported Project'),
            boardTitle: pickString(intermediate.boardTitle, pickString(intermediate.projectTitle, 'Imported Project')),
            lists,
            stats: {
                listCount: lists.length,
                taskCount,
                nestedCount,
                importantCount: lists.reduce((sum, list) => (
                    sum + list.tasks.filter((task) => /^!+/.test(task.text)).length
                ), 0),
                sourceListCount: diagnostics.counts.sourceLists,
                sourceTaskCount: diagnostics.counts.sourceTasks,
                sourceSubtaskCount: diagnostics.counts.sourceSubtasks,
                skippedListCount: diagnostics.counts.skippedLists,
                skippedTaskCount: diagnostics.counts.skippedTasks,
                skippedSubtaskCount: diagnostics.counts.skippedSubtasks
            }
        }
    };
}

function countNestedIdeas(items) {
    return asArray(items).reduce((sum, item) => (
        sum + 1 + countNestedIdeas(item?.nestedIdeas)
    ), 0);
}

export function parseTaskImportText(rawText) {
    const diagnostics = createDiagnostics();
    const trimmed = String(rawText || '').trim();
    if (!trimmed) {
        logError(diagnostics, 'Paste JSON or an indented outline before analyzing.');
        return { ok: false, errors: diagnostics.errors, diagnostics, data: null };
    }

    try {
        const raw = extractJsonFromText(trimmed);
        return normalizeImportData(raw, diagnostics);
    } catch (jsonError) {
        logInfo(diagnostics, `JSON parse failed: ${jsonError.message}`);
        const outlineResult = parseOutlineImport(trimmed, diagnostics);
        if (outlineResult.ok) return outlineResult;

        logError(diagnostics, jsonError.message || 'Failed to parse import file.');
        logError(diagnostics, 'Outline fallback also found no importable tasks.');
        return {
            ok: false,
            errors: diagnostics.errors,
            diagnostics,
            data: null
        };
    }
}

export function buildImportPreviewLines(data) {
    return data.lists.map((list) => {
        const previewTasks = list.tasks.slice(0, 5).map((task) => {
            const subtaskCount = countNestedIdeas(task.nestedIdeas);
            const suffix = subtaskCount ? ` (+${subtaskCount} subtask${subtaskCount === 1 ? '' : 's'})` : '';
            return `${task.text}${suffix}`;
        });
        const remaining = Math.max(0, list.tasks.length - 5);
        return {
            title: list.title,
            description: list.description,
            taskCount: list.tasks.length,
            previewTasks,
            remaining
        };
    });
}

async function commitBatch(batch, opCount) {
    if (!opCount) return;
    await batch.commit();
}

async function appendListsToBoard(userId, boardId, listIds, enqueueSet) {
    for (let i = 0; i < listIds.length; i += ARRAY_UNION_CHUNK) {
        const chunk = listIds.slice(i, i + ARRAY_UNION_CHUNK);
        await enqueueSet(doc(db, 'users', userId, 'boards', boardId), {
            listOrder: arrayUnion(...chunk)
        }, true);
    }
}

export async function executeTaskImport(userId, normalizedData, options = {}, onProgress = () => {}) {
    if (!userId) throw new Error('You must be signed in to import tasks.');
    if (!normalizedData?.lists?.length) throw new Error('Nothing to import.');

    const target = options.target === 'new_board' ? 'new_board' : 'current_board';
    const boardTitle = pickString(options.boardTitle, normalizedData.boardTitle || normalizedData.projectTitle || 'Imported Board');
    const boardId = target === 'new_board' ? generateId() : options.boardId;

    if (!boardId) throw new Error('No target board selected for import.');

    let batch = writeBatch(db);
    let opCount = 0;
    const importedListIds = [];
    const boardOps = target === 'new_board'
        ? 1
        : Math.ceil(normalizedData.lists.length / ARRAY_UNION_CHUNK);
    const totalOps = normalizedData.lists.length
        + normalizedData.lists.reduce((sum, list) => sum + list.tasks.length, 0)
        + boardOps;
    let completedOps = 0;

    const flush = async () => {
        await commitBatch(batch, opCount);
        batch = writeBatch(db);
        opCount = 0;
    };

    const enqueueSet = async (ref, payload, merge = false) => {
        if (merge) batch.set(ref, payload, { merge: true });
        else batch.set(ref, payload);
        opCount += 1;
        completedOps += 1;
        onProgress(Math.min(100, Math.round((completedOps / totalOps) * 100)));
        if (opCount >= BATCH_LIMIT) await flush();
    };

    for (const list of normalizedData.lists) {
        importedListIds.push(list.id);
        const taskIds = [];

        for (const task of list.tasks) {
            taskIds.push(task.id);
            const { id, ...taskFields } = task;
            await enqueueSet(doc(db, 'users', userId, 'tasks', id), taskFields);
        }

        await enqueueSet(doc(db, 'users', userId, 'lists', list.id), {
            title: list.title,
            description: list.description || '',
            taskIds
        });
    }

    if (target === 'new_board') {
        await enqueueSet(doc(db, 'users', userId, 'boards', boardId), {
            title: boardTitle,
            listOrder: importedListIds,
            createdAt: Date.now()
        });
    } else {
        await flush();
        await appendListsToBoard(userId, boardId, importedListIds, async (ref, payload, merge) => {
            if (merge) batch.set(ref, payload, { merge: true });
            else batch.set(ref, payload);
            opCount += 1;
            completedOps += 1;
            onProgress(Math.min(100, Math.round((completedOps / totalOps) * 100)));
            if (opCount >= BATCH_LIMIT) await flush();
        });
    }

    await flush();

    return {
        boardId,
        boardTitle,
        listCount: normalizedData.lists.length,
        taskCount: normalizedData.stats.taskCount,
        nestedCount: normalizedData.stats.nestedCount,
        skippedTaskCount: normalizedData.stats.skippedTaskCount || 0,
        skippedSubtaskCount: normalizedData.stats.skippedSubtaskCount || 0,
        skippedListCount: normalizedData.stats.skippedListCount || 0,
        createdNewBoard: target === 'new_board'
    };
}
