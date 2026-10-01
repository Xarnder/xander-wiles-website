/**
 * Pure helpers for the AI tab.
 * The model proposes Markdown. Applying it is a string transform;
 * Drive writes stay in the existing editor save path.
 */

import { parseDocument } from './lists.js';

export const AI_TASKS = Object.freeze(['expand', 'header', 'summarize', 'revise']);

/** Paid standard rates for gemini-3.1-flash-lite. Thinking tokens bill as output. */
const INPUT_USD_PER_TOKEN = 0.25 / 1_000_000;
const OUTPUT_USD_PER_TOKEN = 1.5 / 1_000_000;

/**
 * @param {{ inputTokens?: number, outputTokens?: number, thoughtTokens?: number } | null | undefined} usage
 * @returns {string}
 */
export function formatGeminiCost(usage) {
    const inputTokens = Number(usage?.inputTokens);
    const outputTokens = Number(usage?.outputTokens);
    const thoughtTokens = Number(usage?.thoughtTokens) || 0;
    if (!Number.isFinite(inputTokens) || !Number.isFinite(outputTokens)) return '';
    if (inputTokens < 0 || outputTokens < 0 || thoughtTokens < 0) return '';
    const usd =
        inputTokens * INPUT_USD_PER_TOKEN +
        (outputTokens + thoughtTokens) * OUTPUT_USD_PER_TOKEN;
    const amount = usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(2)}`;
    const thinking =
        thoughtTokens > 0 ? `, ${thoughtTokens.toLocaleString('en-US')} thinking` : '';
    return `Estimated cost ${amount} (${inputTokens.toLocaleString('en-US')} in, ${outputTokens.toLocaleString('en-US')} out${thinking}).`;
}

/**
 * @param {string} text
 * @returns {string}
 */
/**
 * Line diff. Equal lines appear in both versions; added and removed lines
 * are what the review should highlight.
 * @param {string} before
 * @param {string} after
 * @returns {Array<{ type: 'equal' | 'add' | 'del', text: string }>}
 */
export function diffLines(before, after) {
    const a = splitDiffLines(before);
    const b = splitDiffLines(after);
    if (a.length * b.length > 250_000) return diffLinesWindow(a, b);
    const n = a.length;
    const m = b.length;
    const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i -= 1) {
        for (let j = m - 1; j >= 0; j -= 1) {
            dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
        }
    }
    /** @type {Array<{ type: 'equal' | 'add' | 'del', text: string }>} */
    const ops = [];
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
        if (a[i] === b[j]) {
            ops.push({ type: 'equal', text: a[i] });
            i += 1;
            j += 1;
        } else if (dp[i + 1][j] >= dp[i][j + 1]) {
            ops.push({ type: 'del', text: a[i] });
            i += 1;
        } else {
            ops.push({ type: 'add', text: b[j] });
            j += 1;
        }
    }
    while (i < n) {
        ops.push({ type: 'del', text: a[i] });
        i += 1;
    }
    while (j < m) {
        ops.push({ type: 'add', text: b[j] });
        j += 1;
    }
    return ops;
}

/**
 * @param {string[]} a
 * @param {string[]} b
 */
function diffLinesWindow(a, b) {
    /** @type {Array<{ type: 'equal' | 'add' | 'del', text: string }>} */
    const ops = [];
    let i = 0;
    let j = 0;
    const window = 80;
    while (i < a.length && j < b.length) {
        if (a[i] === b[j]) {
            ops.push({ type: 'equal', text: a[i] });
            i += 1;
            j += 1;
            continue;
        }
        let foundI = -1;
        let foundJ = -1;
        for (let di = 0; di <= window && foundI < 0; di += 1) {
            for (let dj = 0; dj <= window; dj += 1) {
                if (i + di < a.length && j + dj < b.length && a[i + di] === b[j + dj]) {
                    foundI = i + di;
                    foundJ = j + dj;
                    break;
                }
            }
        }
        if (foundI < 0) break;
        while (i < foundI) {
            ops.push({ type: 'del', text: a[i] });
            i += 1;
        }
        while (j < foundJ) {
            ops.push({ type: 'add', text: b[j] });
            j += 1;
        }
    }
    while (i < a.length) {
        ops.push({ type: 'del', text: a[i] });
        i += 1;
    }
    while (j < b.length) {
        ops.push({ type: 'add', text: b[j] });
        j += 1;
    }
    return ops;
}

/**
 * @param {string} text
 * @returns {string[]}
 */
function splitDiffLines(text) {
    const src = String(text ?? '').replace(/\r\n/g, '\n');
    if (!src) return [];
    const lines = src.split('\n');
    if (lines[lines.length - 1] === '') lines.pop();
    return lines;
}

export function stripWrappingFence(text) {
    const trimmed = String(text ?? '').trim();
    const match = trimmed.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/);
    return match ? match[1].trim() : trimmed;
}

/**
 * @param {string} original
 * @param {string} next
 * @returns {string} empty when mdlist fences are still safe
 */
export function fenceSafetyError(original, next) {
    const before = parseDocument(original).segments.filter((seg) => seg.type === 'mdlist');
    const after = parseDocument(next).segments.filter((seg) => seg.type === 'mdlist');
    if (before.length !== after.length) {
        return 'The proposal changed how many custom lists are in the note.';
    }
    for (let i = 0; i < before.length; i += 1) {
        const prev = before[i];
        const proposed = after[i];
        if (!prev.error && proposed.error) {
            return 'The proposal broke a custom list.';
        }
        if (prev.list && proposed.list) {
            const prevIds = (prev.list.items || []).map((item) => item.id).join('\0');
            const nextIds = (proposed.list.items || []).map((item) => item.id).join('\0');
            if (prev.list.id !== proposed.list.id || prevIds !== nextIds) {
                return 'The proposal changed a custom list’s id or items.';
            }
        }
    }
    return '';
}

/**
 * @param {string} source
 * @returns {{ header: string, rest: string }}
 */
function splitOpeningHeader(source) {
    const src = String(source ?? '').replace(/^\uFEFF/, '');
    const lines = src.split('\n');
    if (!lines[0] || !lines[0].startsWith('# ')) {
        return { header: '', rest: src };
    }
    let i = 1;
    while (i < lines.length && lines[i].trim() === '') i += 1;
    if (i < lines.length && /^\{\{date:[^}]+\}\}$/.test(lines[i].trim())) {
        i += 1;
        while (i < lines.length && lines[i].trim() === '') i += 1;
    }
    if (
        i < lines.length &&
        lines[i].trim() &&
        !lines[i].startsWith('#') &&
        !lines[i].startsWith('```')
    ) {
        while (i < lines.length && lines[i].trim() !== '') i += 1;
    }
    while (i < lines.length && lines[i].trim() === '') i += 1;
    const header = lines.slice(0, i).join('\n');
    const rest = lines.slice(i).join('\n');
    return {
        header: header ? `${header.replace(/\s+$/, '')}\n\n` : '',
        rest,
    };
}

/**
 * @param {string} original
 * @param {string} summarySection
 * @returns {string}
 */
function insertSummary(original, summarySection) {
    const section = summarySection.trim();
    const lines = String(original ?? '').replace(/^\uFEFF/, '').split('\n');
    const start = lines.findIndex((line) => /^## Summary\s*$/.test(line.trim()));
    if (start >= 0) {
        let end = start + 1;
        while (end < lines.length) {
            const line = lines[end];
            if (/^## /.test(line) || /^```mdlist\s*$/i.test(line.trim())) break;
            end += 1;
        }
        const merged = [
            ...lines.slice(0, start),
            ...section.split('\n'),
            '',
            ...lines.slice(end),
        ];
        return merged.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
    }
    const { header, rest } = splitOpeningHeader(original);
    const body = [header.replace(/\s+$/, ''), section, rest.replace(/^\s+/, '')]
        .filter((part) => part && part.trim())
        .join('\n\n');
    return `${body.trimEnd()}\n`;
}

/**
 * @param {{ task: string, original: string, selection?: string, proposal: string }} input
 * @returns {{ ok: true, markdown: string } | { ok: false, error: string }}
 */
export function applyAiProposal(input) {
    const task = input?.task === 'edit' ? 'revise' : input?.task;
    const original = String(input?.original ?? '');
    const proposal = stripWrappingFence(input?.proposal ?? '');
    if (!AI_TASKS.includes(task)) {
        return { ok: false, error: 'Unknown AI task.' };
    }
    if (!proposal.trim()) {
        return { ok: false, error: 'The model returned empty Markdown.' };
    }

    if (task === 'expand') {
        const selection = String(input?.selection ?? '');
        if (!selection) {
            return { ok: false, error: 'Add the passage to expand.' };
        }
        const at = original.indexOf(selection);
        if (at < 0) {
            return { ok: false, error: 'That passage is no longer in the note.' };
        }
        if (original.indexOf(selection, at + selection.length) !== -1) {
            return { ok: false, error: 'That passage appears more than once. Paste a longer piece.' };
        }
        const outside = original.slice(0, at) + original.slice(at + selection.length);
        const fences = outside.match(/```mdlist[\s\S]*?```/g) || [];
        for (const fence of fences) {
            if (fence.length > 20 && proposal.includes(fence)) {
                return { ok: false, error: 'Expand returned more than the passage.' };
            }
        }
        const next = original.slice(0, at) + proposal + original.slice(at + selection.length);
        const fenceError = fenceSafetyError(original, next);
        if (fenceError) return { ok: false, error: fenceError };
        return { ok: true, markdown: next };
    }

    if (task === 'header') {
        if (proposal.includes('```') || proposal.length > 2000) {
            return { ok: false, error: 'The header should be a short title block, without code fences.' };
        }
        const { rest } = splitOpeningHeader(original);
        const next = `${proposal.trim()}\n\n${rest.replace(/^\s+/, '')}`.replace(/\n{3,}/g, '\n\n');
        const fenceError = fenceSafetyError(original, next);
        if (fenceError) return { ok: false, error: fenceError };
        return { ok: true, markdown: next.endsWith('\n') ? next : `${next}\n` };
    }

    if (task === 'summarize') {
        if (proposal.includes('```') || proposal.length > 4000) {
            return { ok: false, error: 'The summary should stay a short section, without code fences.' };
        }
        const section = proposal.trim().startsWith('## ')
            ? proposal.trim()
            : `## Summary\n\n${proposal.trim()}`;
        const next = insertSummary(original, section);
        const fenceError = fenceSafetyError(original, next);
        if (fenceError) return { ok: false, error: fenceError };
        return { ok: true, markdown: next };
    }

    const fenceError = fenceSafetyError(original, proposal);
    if (fenceError) return { ok: false, error: fenceError };
    const revised = proposal.endsWith('\n') ? proposal : `${proposal}\n`;
    return { ok: true, markdown: revised };
}
