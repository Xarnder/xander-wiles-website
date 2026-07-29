/**
 * Custom mdlist blocks: parse, repair, serialize, score helpers.
 * Syntax: fenced ```mdlist with JSON body (version 1).
 */

const MDLIST_INFO = /^mdlist\s*$/i;
const MAX_BLOCK_CHARS = 500_000;

/**
 * Written into the .md file immediately before each valid mdlist fence so
 * Cursor / Codex / other agents can extend lists without breaking the schema.
 */
export const MDLIST_AGENT_NOTE =
    '<!-- For LLMs / coding agents: You may add items to this custom ranked list. Do not change the fenced mdlist JSON format — keep version, id, title, and items (unique scores; optional tags). Look carefully at the existing structure before editing. -->';

const AGENT_NOTE_RE = /<!--\s*For LLMs \/ coding agents:[\s\S]*?-->/g;

/** Plain text of the agent note (for Preview / List disclosures). */
export function mdlistAgentNotePlain() {
    return MDLIST_AGENT_NOTE.replace(/^<!--\s*/, '').replace(/\s*-->$/, '').trim();
}

export function createId(prefix = 'id') {
    try {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
        }
    } catch {
        // fall through
    }
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function isFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
}

function coerceFiniteNumber(value) {
    if (isFiniteNumber(value)) return value;
    if (typeof value === 'string' && value.trim() !== '') {
        const n = Number(value);
        if (Number.isFinite(n)) return n;
    }
    return undefined;
}

function normalizeTags(value) {
    if (Array.isArray(value)) {
        return value
            .map((t) => (typeof t === 'string' ? t.trim() : String(t ?? '').trim()))
            .filter(Boolean);
    }
    if (typeof value === 'string' && value.trim()) {
        return value
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean);
    }
    return [];
}

/**
 * Sort items: scored descending, unscored last; stable by id.
 * @param {Array<object>} items
 */
export function sortItemsByScore(items) {
    return [...items].sort((a, b) => {
        const aHas = isFiniteNumber(a.score);
        const bHas = isFiniteNumber(b.score);
        if (aHas && bHas && a.score !== b.score) return b.score - a.score;
        if (aHas && !bHas) return -1;
        if (!aHas && bHas) return 1;
        return String(a.id || '').localeCompare(String(b.id || ''));
    });
}

/**
 * @param {Array<object>} items
 * @param {string} [exceptItemId]
 * @returns {Set<number>}
 */
export function usedScores(items, exceptItemId) {
    const set = new Set();
    for (const item of items) {
        if (exceptItemId && item.id === exceptItemId) continue;
        if (isFiniteNumber(item.score)) set.add(item.score);
    }
    return set;
}

/**
 * Fix duplicate scores while preserving relative order among previously scored items.
 * @param {Array<object>} items
 * @returns {{ items: Array<object>, repaired: boolean, warnings: string[] }}
 */
export function repairDuplicateScores(items) {
    const warnings = [];
    let repaired = false;
    const ordered = sortItemsByScore(items);
    const seen = new Set();
    const nextUniqueBelow = (preferred) => {
        let n = preferred;
        while (seen.has(n)) n -= 1;
        return n;
    };

    const out = ordered.map((item, index) => {
        if (!isFiniteNumber(item.score)) return { ...item };
        if (!seen.has(item.score)) {
            seen.add(item.score);
            return { ...item };
        }
        repaired = true;
        // Prefer descending unique integers from the top of the list.
        const preferred = typeof item.score === 'number' ? item.score : ordered.length - index;
        const score = nextUniqueBelow(preferred);
        seen.add(score);
        warnings.push(`Adjusted duplicate score for “${item.text || item.id}” → ${score}`);
        return { ...item, score };
    });

    // Keep original array membership but with updated scores; return score-sorted.
    return { items: out, repaired, warnings };
}

/**
 * Re-rank items in the given visual order with unique descending integer scores.
 * @param {Array<object>} itemsInOrder
 */
export function rerankScoresInOrder(itemsInOrder) {
    const n = itemsInOrder.length;
    return itemsInOrder.map((item, index) => ({
        ...item,
        score: n - index,
    }));
}

/**
 * Move item by delta in score-sorted order, then re-rank.
 * @param {Array<object>} items
 * @param {string} itemId
 * @param {number} delta -1 up (higher score), +1 down
 */
export function moveItemByDelta(items, itemId, delta) {
    const sorted = sortItemsByScore(items);
    const from = sorted.findIndex((i) => i.id === itemId);
    if (from < 0) return items;
    const to = from + delta;
    if (to < 0 || to >= sorted.length) return sortItemsByScore(items);
    const next = [...sorted];
    const [row] = next.splice(from, 1);
    next.splice(to, 0, row);
    return rerankScoresInOrder(next);
}

/**
 * After drag: place itemId at newIndex in current sorted view, then re-rank.
 */
export function moveItemToIndex(items, itemId, newIndex) {
    const sorted = sortItemsByScore(items);
    const from = sorted.findIndex((i) => i.id === itemId);
    if (from < 0) return items;
    const next = [...sorted];
    const [row] = next.splice(from, 1);
    const clamped = Math.max(0, Math.min(next.length, newIndex));
    next.splice(clamped, 0, row);
    return rerankScoresInOrder(next);
}

function repairAndNormalizeList(rawObj, warnings) {
    if (!rawObj || typeof rawObj !== 'object' || Array.isArray(rawObj)) {
        return { list: null, error: 'List JSON must be an object' };
    }

    const version = coerceFiniteNumber(rawObj.version);
    if (version === undefined) {
        warnings.push('Missing version; assuming 1');
    } else if (version !== 1) {
        return { list: null, error: `Unsupported mdlist version ${version}` };
    }

    let id = typeof rawObj.id === 'string' && rawObj.id.trim() ? rawObj.id.trim() : '';
    if (!id) {
        id = createId('list');
        warnings.push('Generated missing list id');
    }

    const title = typeof rawObj.title === 'string' ? rawObj.title : undefined;
    if (!Array.isArray(rawObj.items)) {
        return { list: null, error: 'List must include an items array' };
    }

    const knownKeys = new Set(['id', 'text', 'score', 'tags']);
    let items = rawObj.items.map((entry, index) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
            warnings.push(`Replaced invalid item at index ${index}`);
            return { id: createId('item'), text: '', tags: [] };
        }
        const extras = {};
        for (const [k, v] of Object.entries(entry)) {
            if (!knownKeys.has(k)) extras[k] = v;
        }
        let itemId = typeof entry.id === 'string' && entry.id.trim() ? entry.id.trim() : '';
        if (!itemId) {
            itemId = createId('item');
            warnings.push(`Generated missing item id at index ${index}`);
        }
        const text = typeof entry.text === 'string' ? entry.text : String(entry.text ?? '');
        const score = coerceFiniteNumber(entry.score);
        const tags = normalizeTags(entry.tags);
        const item = { ...extras, id: itemId, text, tags };
        if (score !== undefined) item.score = score;
        return item;
    });

    const dup = repairDuplicateScores(items);
    items = dup.items;
    if (dup.repaired) {
        warnings.push(...dup.warnings);
        warnings.push('Resolved duplicate scores');
    } else {
        items = sortItemsByScore(items);
    }

    const list = {
        version: 1,
        id,
        items,
    };
    if (title !== undefined) list.title = title;

    // Preserve unknown top-level keys except version/id/title/items
    for (const [k, v] of Object.entries(rawObj)) {
        if (k === 'version' || k === 'id' || k === 'title' || k === 'items') continue;
        list[k] = v;
    }

    return { list, error: null };
}

/**
 * Scan markdown for fenced mdlist blocks.
 * @param {string} text
 * @returns {{ segments: Array<object>, warnings: string[], hasValidList: boolean, hasError: boolean }}
 */
export function parseDocument(text) {
    const source = typeof text === 'string' ? text : '';
    const segments = [];
    const warnings = [];
    let hasValidList = false;
    let hasError = false;

    const lines = source.split('\n');
    let i = 0;
    let markdownBuf = [];

    const flushMarkdown = () => {
        if (markdownBuf.length) {
            segments.push({ type: 'markdown', text: markdownBuf.join('\n') });
            markdownBuf = [];
        }
    };

    while (i < lines.length) {
        const line = lines[i];
        const fenceMatch = line.match(/^(`{3,})(.*)$/);
        if (fenceMatch) {
            const ticks = fenceMatch[1];
            const info = (fenceMatch[2] || '').trim();
            if (MDLIST_INFO.test(info)) {
                flushMarkdown();
                const openLine = line;
                i += 1;
                const bodyLines = [];
                let closed = false;
                while (i < lines.length) {
                    if (lines[i].startsWith(ticks) && lines[i].trim() === ticks) {
                        closed = true;
                        break;
                    }
                    bodyLines.push(lines[i]);
                    i += 1;
                }
                const closeLine = closed ? lines[i] : '';
                const body = bodyLines.join('\n');
                const raw = closed
                    ? `${openLine}\n${body}${body ? '\n' : ''}${closeLine}`
                    : `${openLine}\n${body}`;

                if (body.length > MAX_BLOCK_CHARS) {
                    hasError = true;
                    segments.push({
                        type: 'mdlist',
                        raw,
                        list: null,
                        error: 'mdlist block too large to parse',
                    });
                } else {
                    try {
                        const parsed = JSON.parse(body || 'null');
                        const blockWarnings = [];
                        const { list, error } = repairAndNormalizeList(parsed, blockWarnings);
                        if (error || !list) {
                            hasError = true;
                            segments.push({
                                type: 'mdlist',
                                raw,
                                list: null,
                                error: error || 'Invalid mdlist',
                            });
                            warnings.push(error || 'Invalid mdlist');
                        } else {
                            hasValidList = true;
                            if (blockWarnings.length) warnings.push(...blockWarnings);
                            segments.push({
                                type: 'mdlist',
                                raw,
                                list,
                                repaired: blockWarnings.length > 0,
                                error: null,
                            });
                        }
                    } catch (err) {
                        hasError = true;
                        segments.push({
                            type: 'mdlist',
                            raw,
                            list: null,
                            error: err.message || 'Invalid JSON in mdlist',
                        });
                        warnings.push(err.message || 'Invalid JSON in mdlist');
                    }
                }
                if (closed) i += 1;
                continue;
            }
        }
        markdownBuf.push(line);
        i += 1;
    }

    flushMarkdown();
    return { segments, warnings, hasValidList, hasError };
}

function listToJson(list) {
    const items = sortItemsByScore(list.items || []).map((item) => {
        const out = { id: item.id, text: item.text ?? '', tags: normalizeTags(item.tags) };
        if (isFiniteNumber(item.score)) out.score = item.score;
        for (const [k, v] of Object.entries(item)) {
            if (k === 'id' || k === 'text' || k === 'score' || k === 'tags') continue;
            out[k] = v;
        }
        return out;
    });

    const payload = {
        version: 1,
        id: list.id,
        items,
    };
    if (typeof list.title === 'string') payload.title = list.title;
    for (const [k, v] of Object.entries(list)) {
        if (k === 'version' || k === 'id' || k === 'title' || k === 'items') continue;
        payload[k] = v;
    }
    return `${JSON.stringify(payload, null, 2)}\n`;
}

/** Remove previously written agent notes so serialize can re-attach cleanly. */
export function stripMdlistAgentNotes(text) {
    if (!text) return '';
    return String(text)
        .replace(AGENT_NOTE_RE, '')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n');
}

/**
 * Build serialized markdown parts (same rules as the joined document text).
 * @param {{ segments: Array<object> }} doc
 * @returns {string[]}
 */
export function buildSerializeParts(doc) {
    const parts = [];
    for (const seg of doc.segments || []) {
        if (seg.type === 'markdown') {
            parts.push(stripMdlistAgentNotes(seg.text));
            continue;
        }
        if (seg.type === 'mdlist') {
            if (seg.list) {
                const body = listToJson(seg.list).replace(/\n$/, '');
                if (parts.length) {
                    const prev = parts[parts.length - 1];
                    if (prev.length && !prev.endsWith('\n')) {
                        parts[parts.length - 1] = `${prev}\n`;
                    }
                    if (prev.length && !/\n\n$/.test(parts[parts.length - 1])) {
                        parts[parts.length - 1] = `${parts[parts.length - 1].replace(/\n?$/, '\n')}\n`;
                    }
                }
                parts.push(`${MDLIST_AGENT_NOTE}\n\`\`\`mdlist\n${body}\n\`\`\``);
            } else {
                parts.push(seg.raw || '');
            }
        }
    }
    return parts;
}

/**
 * @param {{ segments: Array<object> }} doc
 * @returns {{ text: string, offsets: number[] }}
 */
export function serializeDocumentWithOffsets(doc) {
    const parts = buildSerializeParts(doc);
    /** @type {number[]} */
    const offsets = [];
    let pos = 0;
    for (let i = 0; i < parts.length; i += 1) {
        offsets.push(pos);
        pos += parts[i].length;
        if (i < parts.length - 1) pos += 1; // join('\n')
    }
    return { text: parts.join('\n'), offsets, parts };
}

/**
 * @param {{ segments: Array<object> }} doc
 */
export function serializeDocument(doc) {
    return serializeDocumentWithOffsets(doc).text;
}

/**
 * Character offset in the serialized document for a preview block line.
 * `localLine` is 1-based (matches `data-md-line` from the markdown renderer).
 * @param {{ segments: Array<object> }} doc
 * @param {number} segIndex
 * @param {number} localLine
 * @param {string | {
 *   prefix?: string,
 *   word?: string,
 *   blockText?: string,
 *   nextLocalLine?: number
 * }} [anchor] — rendered text around the preview target
 */
export function offsetFromPreviewAnchor(doc, segIndex, localLine, anchor = '') {
    const { offsets, parts } = serializeDocumentWithOffsets(doc);
    if (!parts.length) return 0;
    const index = Math.max(0, Math.min(Number(segIndex) || 0, parts.length - 1));
    const base = offsets[index] ?? 0;
    const part = parts[index] ?? '';
    const seg = (doc.segments || [])[index];
    const details =
        typeof anchor === 'string'
            ? { prefix: anchor }
            : anchor && typeof anchor === 'object'
              ? anchor
              : {};

    if (!seg || seg.type !== 'markdown') {
        const visibleNeedle = firstSourceNeedle(details.word || details.blockText || '');
        const found = visibleNeedle ? indexOfText(part, visibleNeedle) : -1;
        return found >= 0 ? base + found : base;
    }

    // Preview line numbers come from the serialized markdown segment. Agent
    // notes have already been stripped from markdown segments by serialization.
    const lineIdx = Math.max(0, (Number(localLine) || 1) - 1);
    const lines = part.split('\n');
    const safeIdx = Math.min(lineIdx, Math.max(0, lines.length - 1));
    let blockStart = 0;
    for (let i = 0; i < safeIdx; i += 1) {
        blockStart += (lines[i] || '').length + 1;
    }

    let blockEnd = part.length;
    const nextLine = Number(details.nextLocalLine);
    if (Number.isFinite(nextLine) && nextLine > safeIdx + 1) {
        const nextIdx = Math.min(nextLine - 1, lines.length);
        blockEnd = 0;
        for (let i = 0; i < nextIdx; i += 1) {
            blockEnd += (lines[i] || '').length + (i < lines.length - 1 ? 1 : 0);
        }
    }

    const blockSource = part.slice(blockStart, Math.max(blockStart, blockEnd));
    const clickedWord = firstSourceNeedle(details.word || '');
    if (clickedWord) {
        const occurrence = countNeedleOccurrences(details.prefix || '', clickedWord);
        const found = indexOfOccurrence(blockSource, clickedWord, Math.max(1, occurrence));
        if (found >= 0) return base + blockStart + found;
        const fallback = nearestTextIndex(part, clickedWord, blockStart);
        if (fallback >= 0) return base + fallback;
    }

    // For ordinary Preview → Raw switching, anchor to the first substantial
    // visible token in the block. Markdown punctuation may sit before it, but
    // the token itself exists verbatim in the source.
    const blockNeedle = firstSourceNeedle(details.blockText || '');
    if (blockNeedle) {
        const found = indexOfText(blockSource, blockNeedle);
        if (found >= 0) return base + blockStart + found;
        const fallback = nearestTextIndex(part, blockNeedle, blockStart);
        if (fallback >= 0) return base + fallback;
    }

    return Math.max(0, base + Math.min(blockStart, part.length));
}

/**
 * Map a serialized-document character offset back to a Preview anchor.
 * @param {{ segments: Array<object> }} doc
 * @param {number} offset
 * @returns {{ segIndex: number, localLine: number, needle: string }}
 */
export function previewAnchorFromOffset(doc, offset) {
    const { offsets, parts, text } = serializeDocumentWithOffsets(doc);
    if (!parts.length) {
        return { segIndex: 0, localLine: 1, needle: '' };
    }
    const pos = Math.max(0, Math.min(Number(offset) || 0, text.length));
    let segIndex = 0;
    for (let i = 0; i < offsets.length; i += 1) {
        if (offsets[i] <= pos) segIndex = i;
        else break;
    }
    const base = offsets[segIndex] ?? 0;
    const part = parts[segIndex] ?? '';
    const local = Math.max(0, Math.min(pos - base, part.length));
    const localLine = part.slice(0, local).split('\n').length || 1;
    const ahead = part.slice(local, Math.min(part.length, local + 100));
    const behind = part.slice(Math.max(0, local - 40), local);
    const needle = firstSourceNeedle(ahead) || firstSourceNeedle(behind);
    return { segIndex, localLine, needle };
}

function firstSourceNeedle(text) {
    const value = String(text || '').trim();
    if (!value) return '';
    try {
        const words = value.match(/[\p{L}\p{N}_][\p{L}\p{N}_'-]*/gu) || [];
        return words.find((word) => word.length >= 2) || words[0] || '';
    } catch {
        const words = value.match(/[A-Za-z0-9_][A-Za-z0-9_'-]*/g) || [];
        return words.find((word) => word.length >= 2) || words[0] || '';
    }
}

function indexOfText(haystack, needle, fromIndex = 0) {
    const exact = String(haystack || '').indexOf(String(needle || ''), fromIndex);
    if (exact >= 0) return exact;
    return String(haystack || '')
        .toLocaleLowerCase()
        .indexOf(String(needle || '').toLocaleLowerCase(), fromIndex);
}

function indexOfOccurrence(haystack, needle, occurrence) {
    let from = 0;
    let found = -1;
    for (let i = 0; i < occurrence; i += 1) {
        found = indexOfText(haystack, needle, from);
        if (found < 0) return -1;
        from = found + Math.max(1, needle.length);
    }
    return found;
}

function nearestTextIndex(haystack, needle, target) {
    let nearest = -1;
    let nearestDistance = Infinity;
    let from = 0;
    while (from <= String(haystack || '').length) {
        const found = indexOfText(haystack, needle, from);
        if (found < 0) break;
        const distance = Math.abs(found - target);
        if (distance < nearestDistance) {
            nearest = found;
            nearestDistance = distance;
        }
        from = found + Math.max(1, needle.length);
    }
    return nearest;
}

function countNeedleOccurrences(text, needle) {
    if (!needle) return 1;
    let count = 0;
    let from = 0;
    while (from <= String(text || '').length) {
        const found = indexOfText(text, needle, from);
        if (found < 0) break;
        count += 1;
        from = found + Math.max(1, needle.length);
    }
    return count + 1;
}

export function countValidLists(doc) {
    return (doc.segments || []).filter((s) => s.type === 'mdlist' && s.list).length;
}

export function findListSegment(doc, listId) {
    return (doc.segments || []).find((s) => s.type === 'mdlist' && s.list && s.list.id === listId);
}

export function setItemScore(list, itemId, score) {
    const items = list.items || [];
    if (score !== undefined && score !== null && score !== '') {
        const n = coerceFiniteNumber(score);
        if (n === undefined) return { ok: false, error: 'Score must be a finite number' };
        const used = usedScores(items, itemId);
        if (used.has(n)) return { ok: false, error: `Score ${n} is already used` };
        list.items = items.map((it) => (it.id === itemId ? { ...it, score: n } : it));
    } else {
        list.items = items.map((it) => {
            if (it.id !== itemId) return it;
            const next = { ...it };
            delete next.score;
            return next;
        });
    }
    list.items = sortItemsByScore(list.items);
    return { ok: true };
}

export function setItemText(list, itemId, text) {
    list.items = (list.items || []).map((it) =>
        it.id === itemId ? { ...it, text: String(text ?? '') } : it
    );
}

export function setListTitle(list, title) {
    const next = String(title ?? '').trim();
    if (next) list.title = next;
    else delete list.title;
}

export function setItemTags(list, itemId, tags) {
    list.items = (list.items || []).map((it) =>
        it.id === itemId ? { ...it, tags: normalizeTags(tags) } : it
    );
}

export function addItem(list, text = 'New item') {
    const items = list.items || [];
    const used = usedScores(items);
    let score = items.length + 1;
    while (used.has(score)) score += 1;
    const item = {
        id: createId('item'),
        text: String(text ?? 'New item'),
        score,
        tags: [],
    };
    list.items = sortItemsByScore([...items, item]);
    return item;
}

export function deleteItem(list, itemId) {
    list.items = (list.items || []).filter((it) => it.id !== itemId);
}

function mergeAdjacentMarkdown(segments) {
    const out = [];
    for (const seg of segments) {
        if (seg.type === 'markdown' && out.length && out[out.length - 1].type === 'markdown') {
            const prev = out[out.length - 1];
            const left = String(prev.text ?? '');
            const right = String(seg.text ?? '');
            if (!left) {
                prev.text = right;
            } else if (!right) {
                prev.text = left;
            } else {
                const leftJoin = left.endsWith('\n') ? left : `${left}\n`;
                prev.text = `${leftJoin}${leftJoin.endsWith('\n\n') ? '' : '\n'}${right.replace(/^\n+/, '')}`;
            }
            continue;
        }
        out.push(seg);
    }
    return out;
}

/**
 * Remove a ranked list segment from the document and merge neighboring markdown.
 * @param {object} doc
 * @param {string} listId
 * @returns {boolean}
 */
export function deleteListFromDocument(doc, listId) {
    if (!doc || !listId) return false;
    const segments = [...(doc.segments || [])];
    const index = segments.findIndex(
        (s) => s.type === 'mdlist' && s.list && s.list.id === listId
    );
    if (index < 0) return false;
    segments.splice(index, 1);
    doc.segments = mergeAdjacentMarkdown(segments);
    return true;
}

export function createEmptyList(title = 'List 1') {
    return {
        version: 1,
        id: createId('list'),
        title,
        items: [],
    };
}

/**
 * Next available default title: "List 1", "List 2", …
 * @param {object} doc
 */
export function nextDefaultListTitle(doc) {
    const used = new Set();
    for (const seg of doc?.segments || []) {
        if (seg.type !== 'mdlist' || !seg.list) continue;
        const match = String(seg.list.title || '')
            .trim()
            .match(/^list\s+(\d+)$/i);
        if (match) used.add(Number(match[1]));
    }
    let n = 1;
    while (used.has(n)) n += 1;
    return `List ${n}`;
}

/**
 * Insert a new empty mdlist at end of document (after a blank line).
 * @param {object} doc
 * @param {string} [title] defaults to next "List N"
 */
export function appendEmptyList(doc, title) {
    const list = createEmptyList(title ?? nextDefaultListTitle(doc));
    const segments = [...(doc.segments || [])];
    if (segments.length && segments[segments.length - 1].type === 'markdown') {
        const last = segments[segments.length - 1];
        if (!last.text.endsWith('\n\n') && last.text.length) {
            last.text = `${last.text.replace(/\n?$/, '\n')}\n`;
        }
    } else if (!segments.length) {
        segments.push({ type: 'markdown', text: '' });
    }
    segments.push({ type: 'mdlist', raw: '', list, repaired: false, error: null });
    doc.segments = segments;
    return list;
}

/**
 * Split markdown into sections at ATX / setext headers (skips fenced code).
 * @param {string} text
 * @returns {Array<{ startLine: number, endLine: number, title: string, level: number, text: string, isPreamble: boolean }>}
 */
export function splitMarkdownByHeaders(text) {
    const lines = String(text ?? '').split('\n');
    const breaks = [];
    let fence = null;

    for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        const fenceOpen = line.match(/^(`{3,}|~{3,})(.*)$/);
        if (fence) {
            if (line.startsWith(fence.char) && line.trim().length >= fence.len) {
                fence = null;
            }
            continue;
        }
        if (fenceOpen) {
            fence = { char: fenceOpen[1][0], len: fenceOpen[1].length };
            continue;
        }

        const trimmed = line.trim();
        const atx = trimmed.match(/^(#{1,6})\s+(.+?)(?:\s+#*)?$/);
        if (atx) {
            breaks.push({ line: i, title: atx[2].trim(), level: atx[1].length });
            continue;
        }
        if (i + 1 < lines.length && trimmed) {
            const next = lines[i + 1].trim();
            if (/^=+\s*$/.test(next)) {
                breaks.push({ line: i, title: trimmed, level: 1 });
                continue;
            }
            if (/^-{2,}\s*$/.test(next)) {
                breaks.push({ line: i, title: trimmed, level: 2 });
            }
        }
    }

    if (!breaks.length) {
        return [
            {
                startLine: 0,
                endLine: lines.length,
                title: '',
                level: 0,
                text: lines.join('\n'),
                isPreamble: true,
            },
        ];
    }

    const sections = [];
    if (breaks[0].line > 0) {
        const end = breaks[0].line;
        const chunk = lines.slice(0, end).join('\n');
        if (chunk.trim()) {
            sections.push({
                startLine: 0,
                endLine: end,
                title: 'Intro',
                level: 0,
                text: chunk,
                isPreamble: true,
            });
        }
    }

    for (let b = 0; b < breaks.length; b += 1) {
        const start = breaks[b].line;
        const end = b + 1 < breaks.length ? breaks[b + 1].line : lines.length;
        sections.push({
            startLine: start,
            endLine: end,
            title: breaks[b].title,
            level: breaks[b].level,
            text: lines.slice(start, end).join('\n'),
            isPreamble: false,
        });
    }
    return sections;
}

function ensureMarkdownBreak(text) {
    if (!text) return '';
    if (text.endsWith('\n\n')) return text;
    if (text.endsWith('\n')) return `${text}\n`;
    return `${text}\n\n`;
}

/**
 * Insert an empty list at a placement target.
 * @param {object} doc
 * @param {{ type: 'at-start' } | { type: 'after-segment', index: number } | { type: 'split-markdown', segmentIndex: number, beforeLine: number }} target
 * @param {string} [title] defaults to next "List N"
 */
export function insertEmptyListAt(doc, target, title) {
    if (!target || typeof target !== 'object') {
        return appendEmptyList(doc, title);
    }

    const list = createEmptyList(title ?? nextDefaultListTitle(doc));
    const newSeg = { type: 'mdlist', raw: '', list, repaired: false, error: null };
    const segments = [...(doc.segments || [])];

    if (target.type === 'at-start') {
        segments.unshift(newSeg);
        doc.segments = segments;
        return list;
    }

    if (target.type === 'after-segment') {
        const index = Number(target.index);
        if (!Number.isInteger(index) || index < -1) {
            return appendEmptyList(doc, title);
        }
        const insertAt = Math.min(Math.max(index + 1, 0), segments.length);
        segments.splice(insertAt, 0, newSeg);
        doc.segments = segments;
        return list;
    }

    if (target.type === 'split-markdown') {
        const segIndex = Number(target.segmentIndex);
        const beforeLine = Number(target.beforeLine);
        const seg = segments[segIndex];
        if (!seg || seg.type !== 'markdown' || !Number.isInteger(beforeLine) || beforeLine < 0) {
            return appendEmptyList(doc, title);
        }

        const lines = String(seg.text ?? '').split('\n');
        const clamped = Math.min(beforeLine, lines.length);
        const beforeText = lines.slice(0, clamped).join('\n');
        const afterText = lines.slice(clamped).join('\n');
        const parts = [];

        if (beforeText.trim()) {
            parts.push({ type: 'markdown', text: ensureMarkdownBreak(beforeText) });
        }
        parts.push(newSeg);
        if (afterText.trim() || afterText.includes('\n')) {
            // Keep trailing whitespace-only chunks only when they have structure;
            // drop pure empty leftovers.
            if (afterText.trim()) {
                parts.push({ type: 'markdown', text: afterText.replace(/^\n+/, '') });
            }
        }

        if (parts.length === 1) {
            segments.splice(segIndex, 1, newSeg);
        } else {
            segments.splice(segIndex, 1, ...parts);
        }
        doc.segments = segments;
        return list;
    }

    return appendEmptyList(doc, title);
}

export function parseTagsInput(value) {
    return normalizeTags(value);
}

export function formatTagsInput(tags) {
    return normalizeTags(tags).join(', ');
}

export function collectAllTags(list) {
    const set = new Set();
    for (const item of list.items || []) {
        for (const t of normalizeTags(item.tags)) set.add(t);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
}

export function filterItemsByTag(items, tagFilter) {
    if (!tagFilter) return sortItemsByScore(items || []);
    const tag = tagFilter.trim().toLowerCase();
    return sortItemsByScore(items || []).filter((item) =>
        normalizeTags(item.tags).some((t) => t.toLowerCase() === tag)
    );
}
