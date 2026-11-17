import { aiHistoryStore } from './ai-history.js';
import { hasCloudSettingsScope, requestAccessToken } from './auth.js';

let generation = 0;
let files = [];
let offset = 0;
const PAGE_SIZE = 10;

function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text != null) node.textContent = text;
    if (className) node.className = className;
    return node;
}

function downloadButton(label, name, text, type = 'text/markdown') {
    const button = element('button', label, 'btn btn-ghost btn-small');
    button.type = 'button';
    button.addEventListener('click', () => {
        const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
        const link = element('a');
        link.href = url;
        link.download = String(name || 'note.md').replace(/[\\/]/g, '_');
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
    });
    return button;
}

function snapshot(label, markdown, fileName) {
    const details = element('details', null, 'ai-history-snapshot');
    const pre = element('pre', markdown || '(Empty note)', 'ai-history-text');
    pre.tabIndex = 0;
    details.append(element('summary', label), pre);
    if (fileName) details.append(downloadButton('Download note', fileName, markdown));
    return details;
}

function dateLabel(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Unknown date' : date.toLocaleString();
}

/** All history is rendered as text, including AI output and filenames. */
export function renderAiHistoryRecord(record) {
    const details = element('details', null, 'ai-history-entry');
    const firstTurn = record.turns[0];
    const title = record.note?.name || firstTurn?.files[0]?.name || 'AI session';
    const summary = element('summary');
    summary.append(element('strong', title), element('span',
        `${dateLabel(record.completedAt || record.saveRequestedAt)} · ${record.turns.length} message${record.turns.length === 1 ? '' : 's'} · ${record.status === 'saved' ? 'Saved' : 'Save not confirmed'}`,
        'ai-history-meta'));
    details.append(summary);
    const body = element('div', null, 'ai-history-body');
    if (record.status !== 'saved') {
        body.append(element('p', 'This save was interrupted or could not be confirmed. These recovery snapshots are kept safely; check the note in Drive before relying on the changes.', 'ai-history-warning'));
    }
    if (record.note) {
        body.append(snapshot(record.status === 'saved' ? 'Saved markdown note' : 'Markdown prepared for saving', record.note.markdown, record.note.name));
    }
    record.turns.forEach((turn, index) => {
        const section = element('section', null, 'ai-history-turn');
        const mode = turn.request.task === 'context' ? 'Context' : turn.request.addOnly ? 'Add only' : 'Subtract and add';
        section.append(element('h4', `Message ${index + 1}`), element('p',
            `${dateLabel(turn.sentAt)} · ${turn.request.provider === 'openai' ? 'OpenAI' : 'Gemini'} · ${mode} · ${turn.outcome}`, 'ai-history-meta'),
            element('p', turn.request.instruction || '(No additional instructions)', 'ai-history-message'));
        for (const file of turn.files) {
            section.append(snapshot(`Attached note: ${file.name} (${file.role === 'context' ? 'context' : 'edit target'})`, file.markdown, file.name));
        }
        if (turn.response?.reply) section.append(snapshot('AI response', String(turn.response.reply)));
        if (typeof turn.proposedMarkdown === 'string') section.append(snapshot('AI proposed markdown', turn.proposedMarkdown, title));
        if (turn.error) section.append(element('p', turn.error, 'ai-history-warning'));
        body.append(section);
    });
    body.append(downloadButton('Download full session (JSON)', `ai-history-${record.id}.json`, JSON.stringify(record, null, 2), 'application/json'));
    details.append(body);
    return details;
}

export function clearAiHistoryView() {
    generation += 1; // Ignore requests that finish after sign-out or refresh.
    files = [];
    offset = 0;
    document.getElementById('ai-history-list')?.replaceChildren();
    const more = document.getElementById('ai-history-more');
    if (more) more.hidden = true;
    const status = document.getElementById('ai-history-status');
    if (status) status.textContent = '';
}

async function loadMore(token) {
    const list = document.getElementById('ai-history-list');
    const more = document.getElementById('ai-history-more');
    if (!list || !more) return;
    more.disabled = true;
    const batch = files.slice(offset, offset + PAGE_SIZE);
    offset += batch.length;
    // Preserve newest-first ordering even when reads complete out of order.
    const rows = batch.map(() => {
        const row = element('div', 'Loading session…', 'ai-history-row');
        list.append(row);
        return row;
    });
    await Promise.all(batch.map(async (file, index) => {
        try {
            const record = await aiHistoryStore.read(file);
            if (token === generation) rows[index].replaceChildren(renderAiHistoryRecord(record));
        } catch (err) {
            if (token === generation) rows[index].replaceChildren(element('p',
                `${dateLabel(file.modifiedTime)}: ${err.message || 'Could not load this session.'} Use Refresh to retry.`, 'ai-history-warning'));
        }
    }));
    if (token !== generation) return;
    more.hidden = offset >= files.length;
    more.disabled = false;
}

export async function refreshAiHistory() {
    const status = document.getElementById('ai-history-status');
    const refresh = document.getElementById('ai-history-refresh');
    if (!status || !refresh) return;
    clearAiHistoryView();
    const token = generation;
    status.textContent = 'Loading AI history from Drive…';
    refresh.disabled = true;
    const connect = document.getElementById('ai-history-connect');
    if (connect) connect.hidden = true;
    try {
        const found = await aiHistoryStore.list();
        if (token !== generation) return;
        files = found;
        status.textContent = files.length ? `${files.length} saved or recoverable session${files.length === 1 ? '' : 's'}` : 'No saved AI sessions yet.';
        await loadMore(token);
    } catch (err) {
        if (token === generation) {
            status.textContent = err.message || 'Could not load AI history. Try Refresh.';
            if (connect) connect.hidden = err.code !== 'history_permission';
        }
    } finally {
        if (token === generation) refresh.disabled = false;
    }
}

export function initAiHistory() {
    const refresh = document.getElementById('ai-history-refresh');
    if (!refresh || refresh.dataset.bound) return;
    refresh.dataset.bound = '1';
    refresh.addEventListener('click', refreshAiHistory);
    document.getElementById('settings-tab-ai')?.addEventListener('click', refreshAiHistory);
    document.getElementById('ai-history-more')?.addEventListener('click', () => loadMore(generation));
    const connect = document.getElementById('ai-history-connect');
    connect?.addEventListener('click', async () => {
        connect.disabled = true;
        try {
            await requestAccessToken({ prompt: 'consent' });
            const notice = document.getElementById('settings-sync-permission');
            if (notice && hasCloudSettingsScope()) notice.hidden = true;
            await refreshAiHistory();
        } catch (err) {
            document.getElementById('ai-history-status').textContent = err.message || 'Connection cancelled. Your AI session is still available.';
        } finally {
            connect.disabled = false;
        }
    });
}
