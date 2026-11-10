/**
 * AI tab. Finder / Pinned can drop a note into the composer as context or as the only file to edit.
 * An edit is reviewed as the previous text beside the proposal, with changed lines highlighted.
 */

import { annotateDiff, applyAiProposal, formatDiffCounts, formatAiCost, previewAiCost } from './ai.js';
import { recordAiCall, renderAiUsage } from './ai-usage.js';
import { displayNoteTitle, revealAiError } from './ui.js';

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
 *   onSave: () => Promise<void>,
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
let lastEdit = null;
let accepting = false;
let saving = false;
let running = false;
let task = 'revise';

function readEls() {
    return {
        reset: document.getElementById('ai-reset'),
        resetDialog: document.getElementById('ai-reset-dialog'),
        resetStatus: document.getElementById('ai-reset-status'),
        resetSlider: document.getElementById('ai-reset-slider'),
        resetCancel: document.getElementById('ai-reset-cancel'),
        help: document.querySelector('.ai-help'),
        provider: document.getElementById('ai-provider'),
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
        save: document.getElementById('ai-save'),
        preview: document.getElementById('ai-cost-preview'),
        status: document.getElementById('ai-status'),
        error: document.getElementById('ai-error'),
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
    if (kind !== 'error' && nodes.help) nodes.help.open = false;
    if (nodes.error) {
        nodes.error.hidden = !message || kind !== 'error';
        nodes.error.textContent = kind === 'error' ? message : '';
    }
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
    if (kind === 'error') revealAiError(nodes.status);
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
    if (nodes.instructionLabel) nodes.instructionLabel.textContent = 'Input text box';
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
    const text = formatAiCost(usage);
    nodes.cost.hidden = !text;
    nodes.cost.textContent = text ? `${usage.provider === 'openai' ? 'OpenAI' : 'Gemini'} · ${text}` : '';
}

function refreshCostPreview() {
    if (!nodes?.preview || !deps) return;
    const doc = deps.getDocument();
    const editing = editAttachment();
    const contexts = attachments.filter((file) => file.role === 'context');
    const asking = contexts.length > 0 && !editing;
    const source = asking ? null : editing || (doc?.fileId ? doc : null);
    const text = previewAiCost({
        provider: nodes.provider?.value,
        task: asking ? 'context' : task,
        markdown: source?.content || '',
        selection: nodes.selection?.value || '',
        instruction: nodes.instruction?.value || '',
        contextFiles: contexts.map((file) => ({ name: file.name, markdown: file.content })),
    });
    nodes.preview.hidden = !text;
    nodes.preview.textContent = text;
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

function showSentMessage(text) {
    if (!nodes?.thread || !text) return;
    const title = document.createElement('h3');
    title.className = 'ai-sent-title';
    title.textContent = 'Message sent:';
    const message = document.createElement('p');
    message.className = 'ai-sent-message';
    message.textContent = text;
    nodes.thread.replaceChildren(title, message);
    nodes.thread.hidden = false;
}

/** Scroll only the AI content pane, leaving the PWA shell and Send dock in place. */
export function scrollAiReviewIntoView(review) {
    const pane = review?.closest('.ai-content-scroll');
    if (!pane) return;
    // Wait for the result and the finished-request controls to settle before measuring.
    requestAnimationFrame(() => requestAnimationFrame(() => {
        if (!review.isConnected || review.closest('[hidden]')) return;
        const top = pane.scrollTop + review.getBoundingClientRect().top
            - pane.getBoundingClientRect().top - pane.clientTop - 8;
        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        pane.scrollTo({ top: Math.max(0, top), behavior: reducedMotion ? 'auto' : 'smooth' });
    }));
}

const AI_DIFF_JUMP_LIMIT = 4;

function renderDiff(before, after) {
    const host = nodes?.diff;
    if (!host) return;
    return fillAiDiff(host, before, after);
}

/**
 * Paint the review: counts and the first changed lines, then the numbered preview.
 * @param {HTMLElement} host
 * @param {string} before
 * @param {string} after
 * @returns {boolean}
 */
export function fillAiDiff(host, before, after) {
    host.replaceChildren();
    const summary = annotateDiff(before, after);
    if (!summary.changes.length) {
        host.hidden = true;
        return false;
    }

    const intro = document.createElement('div');
    intro.className = 'ai-diff-summary';

    const counts = document.createElement('p');
    counts.className = 'ai-diff-counts';
    counts.textContent = formatDiffCounts(summary);
    intro.append(counts);

    const jumps = document.createElement('div');
    jumps.className = 'ai-diff-jumps';
    const jumpLabel = document.createElement('p');
    jumpLabel.className = 'ai-diff-jump-label';
    const shown = summary.changes.slice(0, AI_DIFF_JUMP_LIMIT);
    jumpLabel.textContent =
        summary.changes.length > shown.length
            ? `First ${shown.length} changed lines`
            : 'Changed lines';
    jumps.append(jumpLabel);
    for (let index = 0; index < shown.length; index += 1) {
        const change = shown[index];
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `ai-diff-jump ai-diff-jump--${change.type}`;
        btn.dataset.aiJump = String(index);

        const line = document.createElement('span');
        line.className = 'ai-diff-jump-line';
        line.textContent = `Line ${change.line}`;

        const kind = document.createElement('span');
        kind.className = 'ai-diff-jump-kind';
        kind.textContent = change.type === 'del' ? 'removed' : 'added';

        const snippet = document.createElement('span');
        snippet.className = 'ai-diff-jump-text';
        snippet.textContent = diffSnippet(change.text);

        btn.append(line, kind, snippet);
        btn.addEventListener('click', () => focusDiffChange(host, index));
        jumps.append(btn);
    }
    intro.append(jumps);

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

    let changeIndex = 0;
    for (const op of summary.ops) {
        const row = document.createElement('div');
        row.className = 'ai-diff-row';
        if (op.type === 'equal') {
            row.append(
                diffCell('equal', op.text, op.beforeLine),
                diffCell('equal', op.text, op.afterLine)
            );
        } else if (op.type === 'del') {
            row.dataset.aiChange = String(changeIndex);
            changeIndex += 1;
            row.append(diffCell('del', op.text, op.beforeLine), diffCell('pad', '', null));
        } else {
            row.dataset.aiChange = String(changeIndex);
            changeIndex += 1;
            row.append(diffCell('pad', '', null), diffCell('add', op.text, op.afterLine));
        }
        scroll.append(row);
    }

    host.append(intro, legend, scroll);
    host.hidden = false;
    return true;
}

/**
 * @param {HTMLElement} host
 * @param {number} index
 */
function focusDiffChange(host, index) {
    const row = host.querySelector(`[data-ai-change="${index}"]`);
    if (!(row instanceof HTMLElement)) return;
    host.querySelectorAll('.ai-diff-row.is-ai-jump').forEach((node) => {
        node.classList.remove('is-ai-jump');
    });
    row.classList.add('is-ai-jump');
    row.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

/**
 * @param {string} text
 */
function diffSnippet(text) {
    const flat = String(text ?? '').replace(/\s+/g, ' ').trim();
    if (!flat) return '(blank line)';
    return flat.length > 72 ? `${flat.slice(0, 71)}…` : flat;
}

/**
 * @param {'equal' | 'add' | 'del' | 'pad'} kind
 * @param {string} text
 * @param {number | null | undefined} lineNo
 */
function diffCell(kind, text, lineNo) {
    const cell = document.createElement('div');
    cell.className = `ai-diff-cell ai-diff-cell--${kind}`;
    const line = document.createElement('span');
    line.className = 'ai-diff-line';
    line.textContent = lineNo ? String(lineNo) : '';
    const mark = document.createElement('span');
    mark.className = 'ai-diff-mark';
    mark.textContent = kind === 'del' ? '−' : kind === 'add' ? '+' : '';
    const body = document.createElement('span');
    body.className = 'ai-diff-text';
    body.textContent = text;
    cell.append(line, mark, body);
    return cell;
}

function refreshResetStatus() {
    const doc = deps?.getDocument();
    if (lastEdit && doc?.fileId === lastEdit.fileId && doc.savedContent === lastEdit.markdown) {
        lastEdit.saved = true;
    }
    if (!nodes?.resetStatus) return;
    nodes.resetStatus.textContent = pending?.kind === 'edit'
        ? 'Last AI edits: not saved — this proposal has not been accepted. Reset will discard it.'
        : !lastEdit ? 'No AI edits to save in this session.'
        : lastEdit.saved ? 'Last AI edits: saved to Drive.'
        : doc?.fileId === lastEdit.fileId && doc.status === 'saving'
            ? 'Last AI edits: saving to Drive. Reset will not interrupt the save.'
            : 'Last AI edits: not confirmed saved to Drive. Reset keeps accepted edits in the document; save the note to keep them in Drive.';
}

function resetAiSession() {
    if (running || accepting) return;
    attachments = [];
    clearProposal();
    lastEdit = null;
    nodes.thread?.replaceChildren();
    if (nodes.thread) nodes.thread.hidden = true;
    if (nodes.instruction) nodes.instruction.value = '';
    if (nodes.selection) nodes.selection.value = '';
    task = 'revise';
    paintTask();
    setStatus('AI session reset.');
    nodes.resetDialog.close();
    syncAiPanel();
}

export function syncAiPanel() {
    if (!nodes || !deps) return;
    refreshResetStatus();
    if (nodes.reset) nodes.reset.disabled = running || accepting || saving;
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
        const title = named ? `Opened note: ${named}` : '';
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
        running || accepting || saving ||
        (target &&
            doc?.fileId === target.id &&
            (doc.status === 'saving' || doc.status === 'conflict'));
    if (nodes.run) {
        nodes.run.disabled = Boolean(blocked) || (!target && !attachments.length && !open);
        nodes.run.classList.toggle('is-loading', running);
        nodes.run.setAttribute('aria-busy', String(running));
        nodes.run.textContent = running ? 'Sending to AI…' : 'Send';
    }
    if (nodes.save) {
        const busy = saving || doc?.status === 'saving';
        nodes.save.disabled = running || accepting || busy || doc?.status === 'conflict' ||
            (pending?.kind !== 'edit' && (!open || !doc?.dirty));
        nodes.save.textContent = busy ? 'Saving…' : 'Save';
        nodes.save.setAttribute('aria-busy', String(busy));
        nodes.save.title = pending?.kind === 'edit'
            ? 'Apply the proposed edits and save this note to Drive.'
            : !open ? 'Accept an AI edit or open a note to save.'
            : !doc?.dirty ? 'All document changes are saved.' : 'Save this note to Drive';
    }
    if (nodes.instruction) {
        nodes.instruction.disabled = running;
        nodes.instruction.setAttribute('aria-busy', String(running));
    }
    if (nodes.selection) nodes.selection.disabled = running;
    if (nodes.accept) nodes.accept.disabled = Boolean(blocked) || pending?.kind !== 'edit';
    if (nodes.accept) nodes.accept.hidden = pending?.kind === 'reply';
    if (nodes.discard) nodes.discard.disabled = running || accepting || saving;
    refreshCostPreview();
}

/**
 * @param {{
 *   getDocument: () => { fileId?: string, fileName?: string, content?: string, status?: string },
 *   getToken: () => Promise<string | null>,
 *   onAcceptFile: (file: { fileId: string, fileName: string, markdown: string }) => Promise<boolean>,
 *   onSave: () => Promise<void>,
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
    nodes.save?.addEventListener('click', async () => {
        if (nodes.save.disabled || saving) return;
        saving = true;
        syncAiPanel();
        try {
            if (pending?.kind === 'edit' && !(await acceptProposal())) return;
            await deps.onSave();
            refreshResetStatus();
            setStatus('Saved to Drive.', 'ok');
        } catch (err) {
            setStatus(err?.message || 'Could not save the note.', 'error');
        } finally {
            saving = false;
            syncAiPanel();
        }
    });
    if (nodes.help) nodes.help.open = false;
    nodes.reset?.addEventListener('click', () => {
        refreshResetStatus();
        nodes.resetSlider.value = '0';
        nodes.resetDialog.showModal();
    });
    nodes.resetCancel?.addEventListener('click', () => nodes.resetDialog.close());
    nodes.resetSlider?.addEventListener('change', () => {
        if (Number(nodes.resetSlider.value) === 100) resetAiSession();
        nodes.resetSlider.value = '0';
    });
    nodes.provider?.addEventListener('change', () => {
        hideCost();
        refreshCostPreview();
    });
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
        if (accepting || saving) return;
        clearProposal();
        setStatus('Proposal discarded. The note was not changed.', 'ok');
        syncAiPanel();
    });
    nodes.accept?.addEventListener('click', () => {
        acceptProposal().catch((err) => setStatus(err?.message || 'Could not apply the edit', 'error'));
    });
    const refreshPreview = () => refreshCostPreview();
    nodes.instruction?.addEventListener('input', refreshPreview);
    nodes.selection?.addEventListener('input', refreshPreview);
    nodes.run.addEventListener('click', () => {
        runProposal().catch((err) => {
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

    running = true;
    setStatus('Preparing AI request…');
    syncAiPanel();
    try {
        const token = await deps.getToken();
        if (!token) {
            setStatus('Sign in again to use AI.', 'error');
            return;
        }

        clearProposal();
        setStatus(asking ? 'Reading the note…' : 'Editing the note…');
        syncAiPanel();
        showSentMessage(instruction || `${sentTask.charAt(0).toUpperCase()}${sentTask.slice(1)} (no additional instructions)`);
        if (nodes.instruction) nodes.instruction.value = '';
        refreshCostPreview();

        const provider = nodes.provider?.value || 'gemini';
        let response;
        try {
            response = await fetch('/api/markdown-gemini', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    provider,
                    task: sentTask,
                    markdown: asking ? '' : source.content,
                    selection: sentTask === 'expand' ? selection : '',
                    instruction,
                    contextFiles: contexts.map((file) => ({
                        name: file.name,
                        markdown: file.content,
                    })),
                }),
            });
        } catch {
            throw new Error('Could not reach the AI service.');
        }

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            if (response.status === 404) {
                throw new Error(
                    'AI service is not running on this server. Deploy the API on Vercel, or run npm run dev locally.'
                );
            }
            throw new Error(payload.error || `AI request failed (${response.status})`);
        }

        const usage = { ...payload.usage, provider };
        recordAiCall({
            ...usage,
            at: Date.now(),
            task: sentTask,
            fileName: source.name,
        });
        renderAiUsage();

        if (sentTask === 'context') {
            const reply = String(payload.reply || '').trim();
            if (!reply) throw new Error('The AI provider returned an empty answer.');
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
            setStatus('Answered from the attached note. The file was not changed.', 'ok');
            showCost(usage);
            syncAiPanel();
            return;
        }

        const live = targetFile();
        if (!live || live.id !== source.id || live.content !== source.content) {
            setStatus('That note changed. Send again.', 'error');
            showCost(usage);
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
            showCost(usage);
            syncAiPanel();
            return;
        }

        const hasChanges = renderDiff(source.content, applied.markdown);
        if (!hasChanges) {
            setStatus('The model returned the same text.', 'ok');
            showCost(usage);
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
        showCost(usage);
        syncAiPanel();
        scrollAiReviewIntoView(nodes.resultWrap);
    } catch (err) {
        if (nodes.instruction && !nodes.instruction.value.trim()) nodes.instruction.value = instruction;
        throw err;
    } finally {
        running = false;
        syncAiPanel();
    }
}

async function acceptProposal() {
    if (!deps || accepting || pending?.kind !== 'edit') return;
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
    const proposal = pending;
    accepting = true;
    syncAiPanel();
    let ok;
    try {
        ok = await deps.onAcceptFile({
            fileId: proposal.fileId,
            fileName: proposal.fileName,
            markdown: applied.markdown,
            original: proposal.original,
        });
    } finally {
        accepting = false;
        syncAiPanel();
    }
    if (!ok) return;
    lastEdit = { fileId: proposal.fileId, markdown: applied.markdown, saved: false };
    const chip = attachments.find((file) => file.id === proposal.fileId);
    if (chip) chip.content = applied.markdown;
    clearProposal();
    setStatus('Applied. Autosave will write this to Drive.', 'ok');
    syncAiPanel();
    return true;
}
