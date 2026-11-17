/** Persistent AI provenance, stored in Markdown just like date tags. */
export const AI_TAG = '{{ai}}';
export const AI_BADGE_HTML = '<span class="md-ai-tag" title="Written by AI" aria-label="Written by AI">AI</span>';

export function aiTagRe() {
    return /\{\{[ \t]*ai[ \t]*\}\}/gi;
}

export function hasAiTag(text) {
    return aiTagRe().test(String(text ?? ''));
}

export function stripAiTags(text) {
    // Remove the single separator we insert, keeping indentation and hard breaks intact.
    return String(text ?? '').replace(/ ?\{\{[ \t]*ai[ \t]*\}\}/gi, '');
}

/** Safe plain/code text plus badges, without interpreting Markdown inside code. */
export function renderAiTextHtml(text, escapeHtml) {
    return String(text ?? '').split('\n').map(line =>
        escapeHtml(stripAiTags(line)) + (hasAiTag(line) ? ` ${AI_BADGE_HTML}` : '')
    ).join('\n');
}

function signature(line) {
    // A date refresh alone is not new authorship.
    return stripAiTags(line).replace(/\{\{\s*date\s*(?::[^}]*)?\}\}/gi, '{{date}}');
}

function previousLines(original) {
    const lines = new Map();
    for (const line of String(original).split(/\r\n|\r|\n/)) {
        const key = signature(line);
        const entry = lines.get(key) || { values: [], index: 0 };
        entry.values.push(hasAiTag(line));
        lines.set(key, entry);
    }
    return line => {
        const entry = lines.get(signature(line));
        // Matching occurrences also preserve provenance if the model dropped its tags.
        return entry && entry.index < entry.values.length ? entry.values[entry.index++] : null;
    };
}

function appendTag(line, code = false) {
    const clean = stripAiTags(line);
    if (!clean.trim()) return clean;
    if (!code && /^\s*(?:>\s*)*#{1,6}\s/.test(clean)) {
        const closing = clean.match(/\s+#+[ \t]*$/);
        if (closing) return clean.slice(0, closing.index) + ` ${AI_TAG}` + closing[0];
    }
    // Keep the closing table pipe in place; the badge belongs inside the last cell.
    if (!code && /\|[ \t]*$/.test(clean)) return clean.replace(/([ \t]*\|[ \t]*)$/, ` ${AI_TAG}$1`);
    return clean.replace(/([ \t]*)$/, ` ${AI_TAG}$1`);
}

function structuralLine(line) {
    const body = line.replace(/^\s*(?:>\s*)*/, '').trim();
    if (!body || /^(?:[-*_][ \t]*){3,}$|^={2,}$|^-{2,}$/.test(body)) return true;
    if (/^\{\{\s*date\s*(?::[^}]*)?\}\}$/i.test(body)) return true;
    const cells = body.replace(/^\||\|$/g, '').split('|');
    return body.includes('|') && cells.every(cell => /^\s*:?-{3,}:?\s*$/.test(cell));
}

function customLists(markdown) {
    const lists = new Map();
    for (const match of String(markdown).matchAll(/^(`{3,})[ \t]*mdlist[ \t]*\r?\n([\s\S]*?)^\1[ \t]*\r?$/gmi)) {
        try {
            const list = JSON.parse(match[2]);
            if (list?.id) lists.set(list.id, list);
        } catch { /* Invalid existing blocks are preserved verbatim. */ }
    }
    return lists;
}

/**
 * Mark only new/rewritten content, preserving unchanged and moved lines.
 * Pass no original for insertion-only text. Never tag Markdown delimiters or JSON syntax.
 */
export function stampAiAuthorship(markdown, original = '', { inline = false } = {}) {
    const source = String(markdown ?? '');
    const previous = previousLines(original);
    const oldLists = inline ? new Map() : customLists(original);
    const lines = source.match(/[^\r\n]*(?:\r\n|\r|\n|$)/g)?.filter(Boolean) || [];
    let fence = null;
    let comment = false;
    return lines.map((raw, index) => {
        const newline = raw.match(/(?:\r\n|\r|\n)$/)?.[0] || '';
        const line = newline ? raw.slice(0, -newline.length) : raw;
        if (fence?.mdlist) {
            if (index <= fence.end) {
                if (index === fence.end) fence = null;
                return ''; // The entire JSON block is emitted with its opening fence.
            }
        }
        const body = line.replace(/^\s*(?:>\s*)*/, '');
        const ticks = !inline && body.match(/^(`{3,}|~{3,})(.*)$/);
        if (ticks) {
            if (fence) {
                if (ticks[1][0] === fence.char && ticks[1].length >= fence.length && !ticks[2].trim()) fence = null;
            } else if (/^\s*mdlist\s*$/i.test(ticks[2]) && !/^\s*>/.test(line)) {
                const end = lines.findIndex((value, i) => i > index && value.trim() === ticks[1]);
                if (end < 0) {
                    fence = { mdlist: true, end: lines.length - 1 };
                    return lines.slice(index).join('');
                }
                const json = lines.slice(index + 1, end).join('');
                let nextJson = json;
                try {
                    const list = JSON.parse(json);
                    const old = oldLists.get(list.id);
                    let changed = false;
                    const mark = (value, before) => {
                        const next = stampAiAuthorship(value, before || '', { inline: true });
                        changed ||= next !== value;
                        return next;
                    };
                    if (typeof list.title === 'string') list.title = mark(list.title, old?.title);
                    const oldItems = new Map((old?.items || []).map(item => [item.id, item]));
                    for (const item of list.items || []) {
                        if (typeof item.text === 'string') item.text = mark(item.text, oldItems.get(item.id)?.text);
                    }
                    if (changed) nextJson = JSON.stringify(list, null, 2).replace(/\n/g, newline || '\n') + (newline || '\n');
                } catch { /* Safety validation handles malformed custom lists; don't change their syntax. */ }
                fence = { mdlist: true, end };
                return raw + nextJson + lines[end];
            } else fence = { char: ticks[1][0], length: ticks[1].length };
            return raw;
        }
        if (!inline && !fence && (comment || body.startsWith('<!--'))) {
            comment = !line.includes('-->');
            return raw;
        }
        if (!line.replace(/[\s\u200B\uFEFF]/g, '') || (!fence && structuralLine(stripAiTags(line)))) return raw;
        const inherited = previous(line);
        const tagged = inherited === null || inherited;
        return (tagged ? appendTag(line, Boolean(fence) || inline) : stripAiTags(line)) + newline;
    }).join('');
}
