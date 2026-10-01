/**
 * Local history of Markdown Editor Gemini calls.
 * Costs are estimates from token counts and the 3.1 Flash-Lite prices.
 */

import { formatGeminiUsd, geminiCostUsd } from './ai.js';

const STORAGE_KEY = 'md-editor:ai-usage';
const MAX_CALLS = 400;
const KEEP_MS = 100 * 24 * 60 * 60 * 1000;

const TASK_LABELS = {
    expand: 'Expand',
    header: 'Header',
    summarize: 'Summarize',
    revise: 'Revise',
    edit: 'Revise',
    context: 'Question',
};

function store() {
    return globalThis.localStorage;
}

/**
 * @param {number} time
 * @returns {number}
 */
export function startOfLocalDay(time) {
    const date = new Date(time);
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Monday 00:00 in the local timezone. */
export function startOfLocalWeek(time) {
    const date = new Date(time);
    const day = date.getDay();
    const daysSinceMonday = day === 0 ? 6 : day - 1;
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() - daysSinceMonday).getTime();
}

export function startOfLocalMonth(time) {
    const date = new Date(time);
    return new Date(date.getFullYear(), date.getMonth(), 1).getTime();
}

function readRaw() {
    try {
        const parsed = JSON.parse(store().getItem(STORAGE_KEY) || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function normalize(entry) {
    const at = Number(entry?.at);
    const usd = Number(entry?.usd);
    return {
        at: Number.isFinite(at) ? at : Date.now(),
        task: String(entry?.task || 'revise'),
        fileName: String(entry?.fileName || 'note.md').slice(0, 180),
        inputTokens: Math.max(0, Number(entry?.inputTokens) || 0),
        outputTokens: Math.max(0, Number(entry?.outputTokens) || 0),
        thoughtTokens: Math.max(0, Number(entry?.thoughtTokens) || 0),
        usd: Number.isFinite(usd) && usd >= 0 ? usd : null,
    };
}

export function readAiCalls() {
    return readRaw()
        .map(normalize)
        .filter((entry) => Number.isFinite(entry.at))
        .sort((a, b) => b.at - a.at);
}

/**
 * @param {{ at?: number, task?: string, fileName?: string, inputTokens?: number, outputTokens?: number, thoughtTokens?: number, usd?: number | null }} entry
 */
export function recordAiCall(entry) {
    const usageUsd = geminiCostUsd(entry);
    const next = [
        normalize({ ...entry, usd: entry?.usd == null ? usageUsd : entry.usd }),
        ...readAiCalls(),
    ]
        .filter((item) => item.at >= Date.now() - KEEP_MS)
        .slice(0, MAX_CALLS);
    store().setItem(STORAGE_KEY, JSON.stringify(next));
    return next;
}

export function clearAiCalls() {
    store().removeItem(STORAGE_KEY);
}

/**
 * @param {Array<{ at: number, usd: number | null }>} entries
 * @param {number} [now]
 */
export function summarizeAiCosts(entries, now = Date.now()) {
    const today = startOfLocalDay(now);
    const week = startOfLocalWeek(now);
    const month = startOfLocalMonth(now);
    const sumSince = (start) =>
        entries.reduce((total, entry) => {
            if (entry.at < start || entry.at > now) return total;
            return total + (Number.isFinite(entry.usd) ? entry.usd : 0);
        }, 0);
    return {
        today: sumSince(today),
        week: sumSince(week),
        month: sumSince(month),
    };
}

export function aiTaskLabel(task) {
    return TASK_LABELS[task] || 'AI';
}

function formatWhen(time) {
    return new Date(time).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
}

function money(usd) {
    if (usd == null) return 'No token count';
    return formatGeminiUsd(usd) || '$0.0000';
}

let pane = 'general';

function setPane(next) {
    pane = next === 'ai' ? 'ai' : 'general';
    const general = document.getElementById('settings-panel-general');
    const ai = document.getElementById('settings-panel-ai');
    const generalTab = document.getElementById('settings-tab-general');
    const aiTab = document.getElementById('settings-tab-ai');
    if (general) general.hidden = pane !== 'general';
    if (ai) ai.hidden = pane !== 'ai';
    if (generalTab) {
        generalTab.classList.toggle('is-active', pane === 'general');
        generalTab.setAttribute('aria-selected', pane === 'general' ? 'true' : 'false');
    }
    if (aiTab) {
        aiTab.classList.toggle('is-active', pane === 'ai');
        aiTab.setAttribute('aria-selected', pane === 'ai' ? 'true' : 'false');
    }
}

export function renderAiUsage() {
    const today = document.getElementById('ai-usage-today');
    const week = document.getElementById('ai-usage-week');
    const month = document.getElementById('ai-usage-month');
    const list = document.getElementById('ai-usage-list');
    const empty = document.getElementById('ai-usage-empty');
    const clear = document.getElementById('ai-usage-clear');
    if (!today || !week || !month || !list) return;

    const entries = readAiCalls();
    const totals = summarizeAiCosts(entries);
    today.textContent = money(totals.today);
    week.textContent = money(totals.week);
    month.textContent = money(totals.month);

    list.replaceChildren();
    for (const entry of entries) {
        const item = document.createElement('li');
        item.className = 'ai-usage-item';

        const title = document.createElement('p');
        title.className = 'ai-usage-name';
        title.textContent = entry.fileName.replace(/\.(md|markdown)$/i, '') || 'Untitled';

        const meta = document.createElement('p');
        meta.className = 'ai-usage-meta';
        meta.textContent = `${aiTaskLabel(entry.task)} · ${formatWhen(entry.at)}`;

        const cost = document.createElement('p');
        cost.className = 'ai-usage-cost';
        const detail =
            entry.usd == null
                ? ''
                : ` (${entry.inputTokens.toLocaleString('en-US')} in, ${entry.outputTokens.toLocaleString('en-US')} out${
                      entry.thoughtTokens
                          ? `, ${entry.thoughtTokens.toLocaleString('en-US')} thinking`
                          : ''
                  })`;
        cost.textContent = `${money(entry.usd)}${detail}`;

        item.append(title, meta, cost);
        list.append(item);
    }

    if (empty) empty.hidden = entries.length > 0;
    if (clear) clear.hidden = entries.length === 0;
}

export function initAiUsage() {
    const generalTab = document.getElementById('settings-tab-general');
    const aiTab = document.getElementById('settings-tab-ai');
    const clear = document.getElementById('ai-usage-clear');
    if (!generalTab || !aiTab || generalTab.dataset.bound === '1') {
        renderAiUsage();
        return;
    }
    generalTab.dataset.bound = '1';
    generalTab.addEventListener('click', () => setPane('general'));
    aiTab.addEventListener('click', () => {
        setPane('ai');
        renderAiUsage();
    });
    clear?.addEventListener('click', () => {
        if (!readAiCalls().length) return;
        if (!window.confirm('Clear AI cost history on this device?')) return;
        clearAiCalls();
        renderAiUsage();
    });
    setPane(pane);
    renderAiUsage();
}
