/**
 * AI tab. Finder / Pinned can drop a note into the composer as context or as the only file to edit.
 * An edit is reviewed as the previous text beside the proposal, with changed lines highlighted.
 */

import { applyAiProposal, diffLines, formatGeminiCost } from './ai.js';
import { displayNoteTitle } from './ui.js';

const TASK_COPY = {
    expand: {
        instructionLabel: 'Direction (optional)',
        instructionPlaceholder: 'Example: add a concrete next step',
        instructionRequired: false,
    },
    header: {
        instructionLabel: 'Direction (optional)',
        instructionPlaceholder: 'Example: sound like a project brief',
        instructionRequired: false,
    },
    summarize: {
        instructionLabel: 'Focus (optional)',
        instructionPlaceholder: 'Example: keep only the decisions',
        instructionRequired: false,
    },
    revise: {
        instructionLabel: 'Message',
        instructionPlaceholder: 'Say what to change in the file marked Edit',
        instructionRequired: true,
    },
};

/** @type {ReturnType<typeof readEls> | null} */
let nodes = null;
/** @type {null | {
 *   getDocument: Function,
 *   getToken: Function,
 *   onAcceptFile: (file: { fileId: string, fileName: string, markdown: string }) => Promise<boolean>,
 *   onGoFinder: Function,
 * }} */
let deps = null;
/** @type {Array<{ id: string, name: string, content: string, role: 'context' | 'edit' }>} */
let attachments = [];
/** @type {null | {
 *   kind: 'edit' | 'reply',
 *   task: string,
 *   fileId: string,
 *   fileName: string,
 *   original: string,
 *   selection: string,
 *   proposal: string,
 *   markdown: string,
 * }} */
let pending = null;
let running = false;
let task = 'revise';

function readEls() {
    return {
        empty: document.getElementById('ai-empty'),
        active: document.getElementById('ai-active'),
        title: document.getElementById('ai-file-title'),
        attachments: document.getElementById('ai-attachments'),
        useOpen: document.getElementById('ai-use-open'),
        thread: document.getElementById('ai-thread'),
        selectionField: document.getElementById('ai-selection-field'),
        selection: document.getElementById('ai-selection'),
        instructionLabel: document.getElementById('ai-instruction-label'),
        instruction: document.getElementById('ai-instruction'),
        run: document.getElementById('ai-run'),
        status: document.getElementById('ai-status'),
        cost: document.getElementById('ai-cost'),
        resultWrap: document.getElementById('ai-result-wrap'),
        reply: document.getElementById('ai-reply'),
        diff: document.getElementById('ai-diff'),
        accept: document.getElementById('ai-accept'),
        discard: document.getElementById('ai-discard'),
        goFinder: document.getElementById('ai-go-edit'),
        tasks: document.querySelectorAll('[data-ai-task]'),
    };
}

function setStatus(message, kind = '') {
    if (!nodes?.status) return;
    if (!message) {
        nodes.status.hidden = true;
        nodes.status.textContent = '';
        nodes.status.classList.remove('is-error', 'is-ok');
        return;
    }
    nodes.status.hidden = false;
    nodes.status.textContent = message;
    nodes.status.classList.toggle('is-error', kind === 'error');
    nodes.status.classList.toggle('is-ok', kind === 'ok');
}

function paintTask() {
    if (!nodes) return;
    const copy = TASK_COPY[task] || TASK_COPY.revise;
    for (const btn of nodes.tasks) {
        const active = btn.dataset.aiTask === task;
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-checked', active ? 'true' : 'false');
    }
    if (nodes.selectionField) nodes.selectionField.hidden = task !== 'expand';
    if (nodes.instructionLabel) nodes.instructionLabel.textContent = copy.instructionLabel;
    if (nodes.instruction) nodes.instruction.placeholder = copy.instructionPlaceholder;
}

function clearProposal() {
    pending = null;
    if (nodes?.resultWrap) nodes.resultWrap.hidden = true;
    if (nodes?.reply) {
        nodes.reply.hidden = true;
        nodes.reply.textContent = '';
    }
    if (nodes?.diff) {
        nodes.diff.hidden = true;
        nodes.diff.replaceChildren();
    }
    hideCost();
}

function hideCost() {
    if (!nodes?.cost) return;
    nodes.cost.hidden = true;
    nodes.cost.textContent = '';
}

function showCost(usage) {
    if (!nodes?.cost) return;
    const text = formatGeminiCost(usage);
    nodes.cost.hidden = !text;
    nodes.cost.textContent = text;
}

function editAttachment() {
    return attachments.find((file) => file.role === 'edit') || null;
}

/** Remember a Raw selection so Expand can use it after the user opens the AI tab. */
export function captureAiSelection(text) {
    const value = String(text || '').trim();
    if (!value || !nodes?.selection) return;
    nodes.selection.value = value;
}

/**
 * @param {{ id: string, name?: string, content: string, role?: 'context' | 'edit' }} file
 */
export function attachAiFile(file) {
    const id = String(file?.id || '');
    const content = String(file?.content ?? '');
    if (!id) return;
    const role = file.role === 'context' ? 'context' : 'edit';
    if (role === 'edit') {
        for (const existing of attachments) {
            if (existing.role === 'edit' && existing.id !== id) existing.role = 'context';
        }
    }
    const current = attachments.find((entry) => entry.id === id);
    if (current) {
        current.name = file.name || current.name;
        current.content = content;
        current.role = role;
    } else {
        attachments.push({
            id,
            name: file.name || 'note.md',
            content,
            role,
        });
    }
    if (attachments.length > 4) attachments = attachments.slice(-4);
    task = role === 'edit' ? 'revise' : task;
    clearProposal();
    paintTask();
    syncAiPanel();
    nodes?.instruction?.focus();
}

function setAttachmentRole(id, role) {
    const file = attachments.find((entry) => entry.id === id);
    if (!file) return;
    if (role === 'edit') {
        for (const entry of attachments) entry.role = entry.id === id ? 'edit' : 'context';
        task = 'revise';
        paintTask();
    } else {
        file.role = 'context';
    }
    clearProposal();
    syncAiPanel();
}

function removeAttachment(id) {
    attachments = attachments.filter((entry) => entry.id !== id);
    if (pending?.fileId === id) clearProposal();
    syncAiPanel();
}

function renderAttachments() {
    const host = nodes?.attachments;
    if (!host) return;
    host.replaceChildren();
    host.hidden = attachments.length === 0;
    for (const file of attachments) {
        const chip = document.createElement('div');
        chip.className = 'ai-chip';

        const name = document.createElement('p');
        name.className = 'ai-chip-name';
        name.textContent = displayNoteTitle(file.name);
        name.title = file.name;

        const modes = document.createElement('div');
        modes.className = 'ai-chip-modes';
        modes.setAttribute('role', 'radiogroup');
        modes.setAttribute('aria-label', `How to use ${file.name}`);

        for (const role of ['context', 'edit']) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'ai-chip-mode';
            btn.textContent = role === 'context' ? 'Context' : 'Edit';
            const active = file.role === role;
            btn.classList.toggle('is-active', active);
            btn.setAttribute('role', 'radio');
            btn.setAttribute('aria-checked', active ? 'true' : 'false');
            btn.addEventListener('click', () => setAttachmentRole(file.id, role));
            modes.append(btn);
        }

        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'ai-chip-remove';
        remove.textContent = 'Remove';
        remove.addEventListener('click', () => removeAttachment(file.id));

        chip.append(name, modes, remove);
        host.append(chip);
    }
}

function appendTurn(text, kind) {
    if (!nodes?.thread || !text) return;
    nodes.thread.hidden = false;
    const bubble = document.createElement('p');
    bubble.className = `ai-bubble ai-bubble--${kind}`;
    bubble.textContent = text;
    nodes.thread.append(bubble);
    bubble.scrollIntoView({ block: 'nearest' });
}

function renderDiff(before, after) {
    const host = nodes?.diff;
    if (!host) return;
    host.replaceChildren();
    const ops = diffLines(before, after);
    const changed = ops.some((op) => op.type !== 'equal');
    if (!changed) {
        host.hidden = true;
        return false;
    }

    const legend = document.createElement('p');
    legend.className = 'ai-diff-legend';
    for (const [cls, label] of [
        ['ai-diff-swatch--del', 'Removed'],
        ['ai-diff-swatch--add', 'Added'],
    ]) {
        const swatch = document.createElement('span');
        swatch.className = `ai-diff-swatch ${cls}`;
        swatch.textContent = label;
        legend.append(swatch);
    }

    const scroll = document.createElement('div');
    scroll.className = 'ai-diff-scroll';
    const head = document.createElement('div');
    head.className = 'ai-diff-head';
    for (const label of ['Previous', 'Proposed']) {
        const span = document.createElement('span');
        span.textContent = label;
        head.append(span);
    }
    scroll.append(head);

    for (const op of ops) {
        const row = document.createElement('div');
        row.className = 'ai-diff-row';
        if (op.type === 'equal') {
            row.append(diffCell('equal', op.text), diffCell('equal', op.text));
        } else if (op.type === 'del') {
            row.append(diffCell('del', op.text), diffCell('pad', ''));
        } else {
            row.append(diffCell('pad', ''), diffCell('add', op.text));
        }
        scroll.append(row);
    }

    host.append(legend, scroll);
    host.hidden = false;
    return true;
}

function diffCell(kind, text) {
    const cell = document.createElement('div');
    cell.className = `ai-diff-cell ai-diff-cell--${kind}`;
    const mark = document.createElement('span');
    mark.className = 'ai-diff-mark';
    mark.textContent = kind === 'del' ? '−' : kind === 'add' ? '+' : '';
    const body = document.createElement('span');
    body.className = 'ai-diff-text';
    body.textContent = text;
    cell.append(mark, body);
    return cell;
}

export function syncAiPanel() {
    if (!nodes || !deps) return;
    const doc = deps.getDocument();
    const open = Boolean(doc?.fileId);
    const ready = attachments.length > 0 || open;
    if (nodes.empty) nodes.empty.hidden = ready;
    if (nodes.active) nodes.active.hidden = !ready;
    if (nodes.title) {
        const editing = editAttachment();
        const named =
            editing?.name ||
            (attachments.length === 1 ? attachments[0].name : '') ||
            doc?.fileName ||
            '';
        const title = named ? displayNoteTitle(named) : '';
        nodes.title.textContent = title;
        nodes.title.hidden = !title;
        nodes.title.title = named || title;
    }
    renderAttachments();
    if (nodes.useOpen) {
        const already = Boolean(doc?.fileId && attachments.some((file) => file.id === doc.fileId));
        nodes.useOpen.hidden = !open || already;
    }
    if (pending && editAttachment() && pending.fileId !== editAttachment().id) clearProposal();
    const target = editAttachment();
    const blocked =
        running ||
        (target &&
            doc?.fileId === target.id &&
            (doc.status === 'saving' || doc.status === 'conflict'));
    if (nodes.run) nodes.run.disabled = Boolean(blocked) || (!target && !attachments.length && !open);
    if (nodes.accept) nodes.accept.disabled = Boolean(blocked) || pending?.kind !== 'edit';
    if (nodes.accept) nodes.accept.hidden = pending?.kind === 'reply';
}

/**
 * @param {{
 *   getDocument: () => { fileId?: string, fileName?: string, content?: string, status?: string },
 *   getToken: () => Promise<string | null>,
 *   onAcceptFile: (file: { fileId: string, fileName: string, markdown: string }) => Promise<boolean>,
 *   onGoFinder: () => void,
 * }} options
 */
export function initAiPanel(options) {
    deps = options;
    nodes = readEls();
    if (!nodes.run || nodes.run.dataset.bound === '1') {
        syncAiPanel();
        return;
    }
    nodes.run.dataset.bound = '1';
    paintTask();

    for (const btn of nodes.tasks) {
        btn.addEventListener('click', () => {
            task = btn.dataset.aiTask || 'revise';
            clearProposal();
            setStatus('');
            paintTask();
            syncAiPanel();
        });
    }

    nodes.goFinder?.addEventListener('click', () => deps?.onGoFinder());
    nodes.useOpen?.addEventListener('click', () => {
        const doc = deps?.getDocument();
        if (!doc?.fileId) return;
        attachAiFile({
            id: doc.fileId,
            name: doc.fileName,
            content: doc.content || '',
            role: 'edit',
        });
    });
    nodes.discard?.addEventListener('click', () => {
        clearProposal();
        setStatus('');
        syncAiPanel();
    });
    nodes.accept?.addEventListener('click', () => {
        acceptProposal().catch((err) => setStatus(err?.message || 'Could not apply the edit', 'error'));
    });
    nodes.run.addEventListener('click', () => {
        runProposal().catch((err) => {
            running = false;
            if (nodes.run) nodes.run.textContent = 'Send';
            setStatus(err?.message || 'AI request failed', 'error');
            syncAiPanel();
        });
    });
    syncAiPanel();
}

function targetFile() {
    const edit = editAttachment();
    if (edit) return edit;
    const doc = deps?.getDocument();
    if (!doc?.fileId) return null;
    return {
        id: doc.fileId,
        name: doc.fileName || 'note.md',
        content: doc.content || '',
        role: 'edit',
    };
}

async function runProposal() {
    if (!deps || !nodes || running) return;
    const doc = deps.getDocument();
    const editing = editAttachment();
    const contexts = attachments.filter((file) => file.role === 'context');
    const asking = contexts.length > 0 && !editing;
    if (!asking && !editing && !doc?.fileId) {
        setStatus('Open a note from Finder or Pinned first.', 'error');
        return;
    }
    if (editing && doc?.fileId === editing.id && doc.status === 'conflict') {
        setStatus('This note changed elsewhere. Resolve it in Edit, then try again.', 'error');
        return;
    }
    if (editing && doc?.fileId === editing.id && doc.status === 'saving') {
        setStatus('Wait for the current save to finish.', 'error');
        return;
    }

    const copy = TASK_COPY[task] || TASK_COPY.revise;
    const instruction = nodes.instruction?.value.trim() || '';
    const selection = nodes.selection?.value ?? '';
    const sentTask = asking ? 'context' : task;
    if ((asking || copy.instructionRequired) && !instruction) {
        setStatus(asking ? 'Ask something about the attached note.' : 'Say what should change.', 'error');
        return;
    }
    if (sentTask === 'expand' && !selection.trim()) {
        setStatus('Paste the passage to expand, or select it in Raw first.', 'error');
        return;
    }

    const source = asking ? contexts[0] : targetFile();
    if (!source) {
        setStatus('Choose a note to edit.', 'error');
        return;
    }

    const token = await deps.getToken();
    if (!token) {
        setStatus('Sign in again to use AI.', 'error');
        return;
    }

    running = true;
    clearProposal();
    nodes.run.textContent = 'Working…';
    setStatus(asking ? 'Reading the note…' : 'Editing the note…');
    syncAiPanel();
    appendTurn(instruction || TASK_COPY[task]?.instructionLabel || 'Edit', 'user');

    let response;
    try {
        response = await fetch('/api/markdown-gemini', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                task: sentTask,
                markdown: asking ? '' : source.content,
                selection: sentTask === 'expand' ? selection : '',
                instruction,
                contextFiles: (asking ? contexts : contexts).map((file) => ({
                    name: file.name,
                    markdown: file.content,
                })),
            }),
        });
    } catch {
        throw new Error('Could not reach the AI service.');
    } finally {
        running = false;
        if (nodes.run) nodes.run.textContent = 'Send';
    }

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        if (response.status === 404) {
            throw new Error(
                'AI service is not running on this server. Add GEMINI_API_KEY on Vercel, or run vercel dev locally.'
            );
        }
        throw new Error(payload.error || `AI request failed (${response.status})`);
    }

    if (sentTask === 'context') {
        const reply = String(payload.reply || '').trim();
        if (!reply) throw new Error('Gemini returned an empty answer.');
        if (nodes.reply) {
            nodes.reply.hidden = false;
            nodes.reply.textContent = reply;
        }
        if (nodes.resultWrap) nodes.resultWrap.hidden = false;
        if (nodes.accept) nodes.accept.hidden = true;
        pending = {
            kind: 'reply',
            task: 'context',
            fileId: source.id,
            fileName: source.name,
            original: source.content,
            selection: '',
            proposal: reply,
            markdown: '',
        };
        appendTurn(reply, 'assistant');
        setStatus('Answered from the attached note. The file was not changed.', 'ok');
        showCost(payload.usage);
        syncAiPanel();
        return;
    }

    const live = targetFile();
    if (!live || live.id !== source.id || live.content !== source.content) {
        setStatus('That note changed. Send again.', 'error');
        showCost(payload.usage);
        syncAiPanel();
        return;
    }

    const applied = applyAiProposal({
        task: sentTask,
        original: source.content,
        selection,
        proposal: payload.markdown,
    });
    if (!applied.ok) {
        setStatus(applied.error, 'error');
        showCost(payload.usage);
        syncAiPanel();
        return;
    }

    const hasChanges = renderDiff(source.content, applied.markdown);
    if (!hasChanges) {
        setStatus('The model returned the same text.', 'ok');
        showCost(payload.usage);
        syncAiPanel();
        return;
    }
    if (nodes.resultWrap) nodes.resultWrap.hidden = false;
    if (nodes.accept) nodes.accept.hidden = false;
    pending = {
        kind: 'edit',
        task: sentTask,
        fileId: source.id,
        fileName: source.name,
        original: source.content,
        selection,
        proposal: payload.markdown,
        markdown: applied.markdown,
    };
    setStatus('Removed lines are struck through. Added lines are highlighted. Accept writes this note.', 'ok');
    showCost(payload.usage);
    syncAiPanel();
}

async function acceptProposal() {
    if (!deps || pending?.kind !== 'edit') return;
    const live = targetFile();
    if (!live || live.id !== pending.fileId || live.content !== pending.original) {
        setStatus('That note changed. Send again.', 'error');
        clearProposal();
        syncAiPanel();
        return;
    }
    const applied = applyAiProposal({
        task: pending.task,
        original: pending.original,
        selection: pending.selection,
        proposal: pending.proposal,
    });
    if (!applied.ok) {
        setStatus(applied.error, 'error');
        return;
    }
    const ok = await deps.onAcceptFile({
        fileId: pending.fileId,
        fileName: pending.fileName,
        markdown: applied.markdown,
    });
    if (!ok) return;
    const chip = attachments.find((file) => file.id === pending.fileId);
    if (chip) chip.content = applied.markdown;
    clearProposal();
    setStatus('Applied. Autosave will write this to Drive.', 'ok');
    syncAiPanel();
}
