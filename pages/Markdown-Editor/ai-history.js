import { getAccessToken, hasCloudSettingsScope, refreshAccessToken } from './auth.js';
import { createAppDataFile, getFileContent, listAppDataFiles, updateFileContent } from './drive.js';

const PREFIX = 'md-editor-ai-history-v1-';
const clone = value => JSON.parse(JSON.stringify(value));

export function createAiHistorySession() {
    // randomUUID is missing on older iOS; getRandomValues still supplies a unique 128-bit ID.
    const id = crypto.randomUUID ? crypto.randomUUID()
        : Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
    return { version: 1, id, startedAt: new Date().toISOString(), turns: [] };
}

/** Snapshot exactly what was sent, before attachments or the editor can change. Never store auth headers. */
export function addAiHistoryTurn(session, request, files) {
    const turn = clone({ sentAt: new Date().toISOString(), request, files, outcome: 'sending' });
    session.turns.push(turn);
    return turn;
}

export function createAiSaveAttempt(session, note = null) {
    return {
        record: clone({ ...session, status: 'pending', saveRequestedAt: new Date().toISOString(), note }),
        file: null,
        receipt: null,
        completed: null,
    };
}

export function parseAiHistory(text) {
    const record = JSON.parse(text);
    if (record?.version !== 1 || !/^[a-zA-Z0-9-]+$/.test(record.id || '') ||
        !Array.isArray(record.turns) || !['pending', 'saved'].includes(record.status) ||
        !record.turns.every(turn => typeof turn?.request?.instruction === 'string' &&
            Array.isArray(turn.files) && turn.files.every(file => typeof file?.markdown === 'string')) ||
        (record.note !== null && (typeof record.note?.id !== 'string' || typeof record.note?.markdown !== 'string'))) {
        throw new Error('This AI history file is damaged or uses an unsupported format.');
    }
    return record;
}

function sameSession(a, b) {
    const { status: aStatus, completedAt: aTime, ...aData } = a;
    const { status: bStatus, completedAt: bTime, ...bData } = b;
    return JSON.stringify(aData) === JSON.stringify(bData);
}

/** One system JSON file per session prevents simultaneous devices overwriting a shared history list. */
export function createAiHistoryStore(io) {
    async function read(file) {
        return parseAiHistory(await io.read(file.id));
    }
    async function verify(file, expected) {
        const actual = await read(file);
        if (JSON.stringify(actual) !== JSON.stringify(expected)) {
            throw new Error('Drive history verification failed. Your AI session has been kept; retry Save.');
        }
        return file;
    }
    return {
        async list() {
            const files = await io.list('');
            // A lost create response can leave duplicate names. Show each session once.
            const sessions = new Map();
            for (const file of files) {
                if (file.name?.startsWith(PREFIX) && file.name.endsWith('.json') && !sessions.has(file.name)) {
                    sessions.set(file.name, file);
                }
            }
            return [...sessions.values()];
        },
        read,
        async prepare(record) {
            const name = `${PREFIX}${record.id}.json`;
            const existing = await io.list(name);
            if (existing.length) {
                const saved = await read(existing[0]);
                if (!sameSession(saved, record)) throw new Error('AI history does not match this session. Nothing was overwritten.');
                return existing[0];
            }
            const file = await io.create(name, JSON.stringify(record), 'application/json');
            if (!file?.id) throw new Error('Drive did not confirm the AI history file. Retry Save.');
            return verify(file, record);
        },
        async complete(file, record) {
            const existing = await read(file);
            if (!sameSession(existing, record)) throw new Error('AI history changed unexpectedly. Nothing was overwritten.');
            if (existing.status === 'saved') return file;
            await io.update(file.id, JSON.stringify(record), 'application/json');
            return verify(file, record);
        },
    };
}

async function requireHistoryAccess() {
    if (!getAccessToken()) await refreshAccessToken();
    if (!hasCloudSettingsScope()) {
        const error = new Error('AI history needs Google Drive app data permission. Choose Connect history in Settings → AI, then return here and retry Save.');
        error.code = 'history_permission';
        throw error;
    }
}

export const aiHistoryStore = createAiHistoryStore({
    list: async name => { await requireHistoryAccess(); return listAppDataFiles(name); },
    read: async id => { await requireHistoryAccess(); return getFileContent(id, { cache: 'no-store' }); },
    create: async (...args) => { await requireHistoryAccess(); return createAppDataFile(...args); },
    update: async (...args) => { await requireHistoryAccess(); return updateFileContent(...args); },
});

/**
 * Write a recovery record before changing the note. Only reset after both Drive read-backs succeed.
 * Keep the attempt on failure: retrying history must never reapply additions or overwrite the note.
 */
export async function commitAiSession(attempt, { history = aiHistoryStore, saveNote, reset, onStage = () => {} }) {
    onStage('Saving AI history…');
    if (!attempt.file) attempt.file = await history.prepare(attempt.record);
    if (attempt.record.note && !attempt.receipt) {
        onStage('Saving and verifying the note…');
        const receipt = await saveNote(attempt.record.note);
        if (receipt?.id !== attempt.record.note.id || receipt?.markdown !== attempt.record.note.markdown) {
            throw new Error('The saved note did not match the reviewed AI changes. Your session has been kept.');
        }
        attempt.receipt = receipt;
    }
    onStage('Verifying AI history…');
    attempt.completed ||= { ...attempt.record, status: 'saved', completedAt: new Date().toISOString() };
    await history.complete(attempt.file, attempt.completed);
    reset();
}
