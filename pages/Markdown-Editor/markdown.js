/**
 * Dependency-free Markdown → safe HTML renderer (CommonMark-ish + GFM basics).
 * Escapes raw HTML; only emits tags we generate.
 */

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(text) {
    return String(text ?? '').replace(/[&<>"']/g, (ch) => ESC[ch]);
}

/**
 * Strip light inline markdown for outline labels.
 * @param {string} text
 */
function plainHeadingText(text) {
    return String(text ?? '')
        .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/(\*\*|__)(.*?)\1/g, '$2')
        .replace(/(\*|_)(.*?)\1/g, '$2')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Collect ATX / setext headings from markdown (skips fenced code).
 * @param {string} markdown
 * @returns {Array<{ line: number, level: number, title: string }>}
 */
export function extractMarkdownHeadings(markdown) {
    const lines = String(markdown ?? '').replace(/\r\n?/g, '\n').split('\n');
    /** @type {Array<{ line: number, level: number, title: string }>} */
    const headings = [];
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
            const title = plainHeadingText(atx[2]);
            if (title) {
                headings.push({ line: i + 1, level: atx[1].length, title });
            }
            continue;
        }

        if (i + 1 < lines.length && trimmed) {
            const next = lines[i + 1].trim();
            if (/^=+\s*$/.test(next)) {
                const title = plainHeadingText(trimmed);
                if (title) headings.push({ line: i + 1, level: 1, title });
                continue;
            }
            if (/^-+\s*$/.test(next) && next.length >= 2) {
                const title = plainHeadingText(trimmed);
                if (title) headings.push({ line: i + 1, level: 2, title });
            }
        }
    }

    return headings;
}

function sanitizeUrl(url) {
    const raw = String(url ?? '').trim();
    if (!raw) return '';
    // Allow relative, http(s), mailto, and hash links only
    if (/^(https?:|mailto:|#|\/|\.\/|\.\.\/)/i.test(raw)) return raw;
    if (/^[a-z0-9][a-z0-9._\-]*$/i.test(raw)) return raw; // simple relative
    return '';
}

function renderInline(text) {
    let s = String(text ?? '');
    // Escape first, then apply markdown tokens via placeholders
    s = escapeHtml(s);

    // Images ![alt](url)
    s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, (_, alt, url, title) => {
        const safe = sanitizeUrl(url.replace(/&amp;/g, '&'));
        if (!safe) return escapeHtml(`![${alt}](${url})`);
        const t = title ? ` title="${escapeHtml(title)}"` : '';
        return `<img src="${escapeHtml(safe)}" alt="${alt}"${t} loading="lazy">`;
    });

    // Links [text](url)
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, (_, label, url, title) => {
        const safe = sanitizeUrl(url.replace(/&amp;/g, '&'));
        if (!safe) return `[${label}](${escapeHtml(url)})`;
        const t = title ? ` title="${escapeHtml(title)}"` : '';
        const ext = /^https?:/i.test(safe) ? ' target="_blank" rel="noopener noreferrer"' : '';
        return `<a href="${escapeHtml(safe)}"${t}${ext}>${label}</a>`;
    });

    // Autolink bare URLs (http/https)
    s = s.replace(/(^|[\s(])(https?:\/\/[^\s<]+[^\s<.,:;!?)]+)/g, (_, pre, url) => {
        const safe = sanitizeUrl(url);
        if (!safe) return `${pre}${url}`;
        return `${pre}<a href="${escapeHtml(safe)}" target="_blank" rel="noopener noreferrer">${url}</a>`;
    });

    // Inline code
    s = s.replace(/`([^`]+)`/g, (_, code) => `<code>${code}</code>`);

    // Bold ** or __
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/__([^_]+)__/g, '<strong>$1</strong>');

    // Italic * or _
    s = s.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
    s = s.replace(/(^|[^_\w])_([^_\n]+)_(?!_)/g, '$1<em>$2</em>');

    // Strikethrough ~~
    s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');

    return s;
}

function isHr(line) {
    return /^(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line.trim());
}

function parseTableRow(line) {
    let s = line.trim();
    if (s.startsWith('|')) s = s.slice(1);
    if (s.endsWith('|')) s = s.slice(0, -1);
    return s.split('|').map((c) => c.trim());
}

function isTableSep(line) {
    const cells = parseTableRow(line);
    return cells.length > 0 && cells.every((c) => /^:?-{3,}:?$/.test(c));
}

function fenceLang(info) {
    const lang = (info || '').trim().split(/\s+/)[0].replace(/[^a-z0-9_+#-]/gi, '');
    return lang ? ` language-${escapeHtml(lang)}` : '';
}

function withSourceLine(html, lineNum) {
    if (!lineNum || lineNum < 1) return html;
    return html.replace(/^<([a-zA-Z][\w-]*)/, `<$1 data-md-line="${lineNum}"`);
}

const PLAIN_LIST_ITEM_RE = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;

function plainListId(prefix = 'pli') {
    try {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
        }
    } catch {
        // fall through
    }
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function isOrderedListMarker(marker) {
    return /^\d+[.)]$/.test(marker);
}

/**
 * Parse one plain markdown list starting at `start` (skips fenced code via caller).
 * @param {string[]} lines
 * @param {number} start
 */
function parsePlainListAt(lines, start) {
    const first = lines[start].match(PLAIN_LIST_ITEM_RE);
    if (!first || isHr(lines[start])) return null;

    const ordered = isOrderedListMarker(first[2]);
    /** @type {Array<{ id: string, text: string, checked: boolean | null, marker: string, indent: string }>} */
    const items = [];
    let i = start;
    let hasTask = false;

    while (i < lines.length) {
        const m = lines[i].match(PLAIN_LIST_ITEM_RE);
        if (!m || isHr(lines[i])) {
            if (items.length && /^\s{2,}\S/.test(lines[i]) && lines[i].trim()) {
                items[items.length - 1].text += `\n${lines[i].trim()}`;
                i += 1;
                continue;
            }
            break;
        }
        if (isOrderedListMarker(m[2]) !== ordered) break;

        const rest = m[3];
        const task = rest.match(/^\[([ xX])\]\s+(.*)$/);
        if (task) {
            hasTask = true;
            items.push({
                id: plainListId(),
                text: task[2],
                checked: task[1].toLowerCase() === 'x',
                marker: m[2],
                indent: m[1],
            });
        } else {
            items.push({
                id: plainListId(),
                text: rest,
                checked: null,
                marker: m[2],
                indent: m[1],
            });
        }
        i += 1;
    }

    if (!items.length) return null;
    return {
        type: 'plainlist',
        ordered,
        task: hasTask,
        items,
        startLine: start + 1,
        endLine: i,
        start: start,
        end: i,
    };
}

/**
 * Split markdown into prose chunks and detectable plain lists (ul/ol/task).
 * Fenced code is kept inside prose so list-looking lines in code are ignored.
 * @param {string} markdown
 * @returns {Array<object>}
 */
export function splitMarkdownBlocks(markdown) {
    const src = String(markdown ?? '').replace(/\r\n?/g, '\n');
    const lines = src.split('\n');
    /** @type {Array<object>} */
    const blocks = [];
    let i = 0;
    let fence = null;
    let proseStart = 0;

    const flushProse = (end) => {
        if (end <= proseStart) return;
        blocks.push({
            type: 'markdown',
            text: lines.slice(proseStart, end).join('\n'),
            startLine: proseStart + 1,
            start: proseStart,
            end,
        });
        proseStart = end;
    };

    while (i < lines.length) {
        const line = lines[i];
        const fenceOpen = line.match(/^(`{3,}|~{3,})(.*)$/);

        if (fence) {
            if (line.startsWith(fence.char) && line.trim().length >= fence.len) {
                fence = null;
            }
            i += 1;
            continue;
        }

        if (fenceOpen) {
            fence = { char: fenceOpen[1][0], len: fenceOpen[1].length };
            i += 1;
            continue;
        }

        const list = parsePlainListAt(lines, i);
        if (list) {
            flushProse(i);
            blocks.push(list);
            i = list.end;
            proseStart = i;
            continue;
        }

        i += 1;
    }

    flushProse(lines.length);
    return blocks;
}

/**
 * Serialize a plain list block back to markdown lines.
 * @param {object} block
 * @returns {string}
 */
export function serializePlainList(block) {
    const items = Array.isArray(block?.items) ? block.items : [];
    const ordered = Boolean(block?.ordered);
    const lines = items.map((item, index) => {
        const indent = typeof item.indent === 'string' ? item.indent : '';
        let marker;
        if (ordered) {
            const close = String(item.marker || '1.').endsWith(')') ? ')' : '.';
            marker = `${index + 1}${close}`;
        } else {
            marker = item.marker && /^[-*+]$/.test(item.marker) ? item.marker : '-';
        }
        const textLines = String(item.text ?? '').split('\n');
        const first = textLines[0] ?? '';
        let head;
        if (item.checked === true || item.checked === false) {
            const box = item.checked ? '[x]' : '[ ]';
            head = `${indent}${marker} ${box} ${first}`;
        } else {
            head = `${indent}${marker} ${first}`;
        }
        const cont = textLines
            .slice(1)
            .map((part) => `${indent}  ${part}`)
            .join('\n');
        return cont ? `${head}\n${cont}` : head;
    });
    return lines.join('\n');
}

/**
 * Rebuild markdown source from split blocks (lossless for prose chunks).
 * @param {Array<object>} blocks
 * @returns {string}
 */
export function joinMarkdownBlocks(blocks) {
    const parts = [];
    for (const block of blocks || []) {
        if (block.type === 'plainlist') {
            parts.push(serializePlainList(block));
        } else {
            parts.push(block.text ?? '');
        }
    }
    return parts.join('\n');
}

/**
 * Reorder items in a plain list by moving one index to another.
 * @param {Array<object>} items
 * @param {number} fromIndex
 * @param {number} toIndex
 */
export function movePlainListItem(items, fromIndex, toIndex) {
    const next = [...(items || [])];
    if (fromIndex < 0 || fromIndex >= next.length) return next;
    if (toIndex < 0 || toIndex >= next.length) return next;
    if (fromIndex === toIndex) return next;
    const [item] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, item);
    return next;
}

/**
 * @param {string} markdown
 * @param {{ lineOffset?: number }} [options]
 * @returns {string} sanitized HTML
 */
export function renderMarkdown(markdown, options = {}) {
    const lineOffset = Number(options.lineOffset) || 0;
    // Drop HTML comments (including mdlist agent notes) from preview surfaces.
    const src = String(markdown ?? '')
        .replace(/\r\n?/g, '\n')
        .replace(/<!--[\s\S]*?-->/g, '');
    if (!src.trim()) {
        return '<p class="md-empty">Nothing to preview yet.</p>';
    }

    const lines = src.split('\n');
    const out = [];
    let i = 0;
    let paragraph = [];
    let paragraphStart = 0;

    const flushParagraph = () => {
        if (!paragraph.length) return;
        const startLine = paragraphStart;
        const text = paragraph.join('\n').trim();
        paragraph = [];
        paragraphStart = 0;
        if (!text) return;
        const html = text
            .split('\n')
            .map((line) => renderInline(line.replace(/ {2}$/, '')))
            .join('<br>\n');
        out.push(withSourceLine(`<p>${html}</p>`, startLine));
    };

    while (i < lines.length) {
        const line = lines[i];
        const trimmed = line.trim();
        const lineNo = i + 1 + lineOffset;

        // Fenced code
        const fence = line.match(/^(`{3,}|~{3,})(.*)$/);
        if (fence) {
            flushParagraph();
            const ticks = fence[1];
            const info = fence[2] || '';
            const startLine = lineNo;
            i += 1;
            const body = [];
            while (i < lines.length) {
                if (lines[i].startsWith(ticks[0].repeat(ticks.length)) && lines[i].trim().length >= ticks.length) {
                    i += 1;
                    break;
                }
                body.push(lines[i]);
                i += 1;
            }
            const lang = fenceLang(info);
            const isMdlist = /^\s*mdlist\s*$/i.test(info);
            const cls = isMdlist ? ' class="md-code md-code--mdlist"' : ` class="md-code${lang}"`;
            out.push(withSourceLine(`<pre${cls}><code>${escapeHtml(body.join('\n'))}</code></pre>`, startLine));
            continue;
        }

        // ATX headings
        const heading = trimmed.match(/^(#{1,6})\s+(.+?)(?:\s+#*)?$/);
        if (heading) {
            flushParagraph();
            const level = heading[1].length;
            out.push(withSourceLine(`<h${level}>${renderInline(heading[2])}</h${level}>`, lineNo));
            i += 1;
            continue;
        }

        // Setext headings
        if (i + 1 < lines.length && trimmed && /^=+\s*$/.test(lines[i + 1].trim())) {
            flushParagraph();
            out.push(withSourceLine(`<h1>${renderInline(trimmed)}</h1>`, lineNo));
            i += 2;
            continue;
        }
        if (i + 1 < lines.length && trimmed && /^-+\s*$/.test(lines[i + 1].trim()) && !isHr(lines[i + 1])) {
            if (/^-+$/.test(lines[i + 1].trim()) && lines[i + 1].trim().length >= 2) {
                flushParagraph();
                out.push(withSourceLine(`<h2>${renderInline(trimmed)}</h2>`, lineNo));
                i += 2;
                continue;
            }
        }

        // Horizontal rule
        if (isHr(trimmed)) {
            flushParagraph();
            out.push(withSourceLine('<hr>', lineNo));
            i += 1;
            continue;
        }

        // Blockquote
        if (trimmed.startsWith('>')) {
            flushParagraph();
            const startLine = lineNo;
            const quoteLines = [];
            while (i < lines.length && (lines[i].trim().startsWith('>') || lines[i].trim() === '')) {
                if (lines[i].trim() === '' && quoteLines.length && i + 1 < lines.length && !lines[i + 1].trim().startsWith('>')) {
                    break;
                }
                const q = lines[i].replace(/^\s*>\s?/, '');
                quoteLines.push(q);
                i += 1;
            }
            const inner = renderMarkdown(quoteLines.join('\n'));
            out.push(withSourceLine(`<blockquote>${inner}</blockquote>`, startLine));
            continue;
        }

        // Table
        if (
            trimmed.includes('|') &&
            i + 1 < lines.length &&
            isTableSep(lines[i + 1])
        ) {
            flushParagraph();
            const startLine = lineNo;
            const headerCells = parseTableRow(line);
            const seps = parseTableRow(lines[i + 1]);
            const aligns = seps.map((c) => {
                const left = c.startsWith(':');
                const right = c.endsWith(':');
                if (left && right) return 'center';
                if (right) return 'right';
                if (left) return 'left';
                return '';
            });
            i += 2;
            const rows = [];
            while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
                rows.push(parseTableRow(lines[i]));
                i += 1;
            }
            const th = headerCells
                .map((c, idx) => {
                    const a = aligns[idx] ? ` style="text-align:${aligns[idx]}"` : '';
                    return `<th${a}>${renderInline(c)}</th>`;
                })
                .join('');
            const body = rows
                .map((row) => {
                    const tds = headerCells
                        .map((_, idx) => {
                            const a = aligns[idx] ? ` style="text-align:${aligns[idx]}"` : '';
                            return `<td${a}>${renderInline(row[idx] ?? '')}</td>`;
                        })
                        .join('');
                    return `<tr>${tds}</tr>`;
                })
                .join('');
            out.push(
                withSourceLine(
                    `<div class="md-table-wrap"><table><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table></div>`,
                    startLine
                )
            );
            continue;
        }

        // Lists (ul / ol / task)
        const listMatch = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
        if (listMatch) {
            flushParagraph();
            const startLine = lineNo;
            const items = [];
            let ordered = /^\d+[.)]/.test(listMatch[2]);
            while (i < lines.length) {
                const m = lines[i].match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
                if (!m) {
                    if (items.length && /^\s{2,}\S/.test(lines[i]) && lines[i].trim()) {
                        items[items.length - 1].text += `\n${lines[i].trim()}`;
                        i += 1;
                        continue;
                    }
                    break;
                }
                ordered = /^\d+[.)]/.test(m[2]);
                const rest = m[3];
                const task = rest.match(/^\[([ xX])\]\s+(.*)$/);
                if (task) {
                    items.push({
                        task: true,
                        checked: task[1].toLowerCase() === 'x',
                        text: task[2],
                    });
                } else {
                    items.push({ task: false, text: rest });
                }
                i += 1;
            }
            const tag = ordered ? 'ol' : 'ul';
            const cls = items.some((it) => it.task) ? ' class="md-task-list"' : '';
            const lis = items
                .map((it) => {
                    if (it.task) {
                        const checked = it.checked ? ' checked' : '';
                        return `<li class="md-task"><label><input type="checkbox" disabled${checked}> <span>${renderInline(it.text)}</span></label></li>`;
                    }
                    const html = it.text
                        .split('\n')
                        .map((part) => renderInline(part))
                        .join('<br>\n');
                    return `<li>${html}</li>`;
                })
                .join('');
            out.push(withSourceLine(`<${tag}${cls}>${lis}</${tag}>`, startLine));
            continue;
        }

        // Blank line
        if (!trimmed) {
            flushParagraph();
            i += 1;
            continue;
        }

        // Indented code block (4 spaces)
        if (/^ {4}|\t/.test(line)) {
            flushParagraph();
            const startLine = lineNo;
            const body = [];
            while (i < lines.length && (/^ {4}|\t/.test(lines[i]) || lines[i].trim() === '')) {
                if (lines[i].trim() === '' && i + 1 < lines.length && !/^ {4}|\t/.test(lines[i + 1])) break;
                body.push(lines[i].replace(/^(?: {4}|\t)/, ''));
                i += 1;
            }
            out.push(withSourceLine(`<pre class="md-code"><code>${escapeHtml(body.join('\n'))}</code></pre>`, startLine));
            continue;
        }

        if (!paragraph.length) paragraphStart = lineNo;
        paragraph.push(line);
        i += 1;
    }

    flushParagraph();
    return out.join('\n');
}

/**
 * Block near the top of the preview/list scroll viewport.
 * @param {HTMLElement} rootEl — usually `#lists-root`
 * @returns {HTMLElement | null}
 */
export function getVisiblePreviewBlock(rootEl) {
    if (!rootEl) return null;
    const blocks = rootEl.querySelectorAll(
        '.md-preview--segment > [data-md-line], .mdlist-stack[data-preview-seg-index]'
    );
    if (!blocks.length) return null;
    const rootRect = rootEl.getBoundingClientRect();
    const stickyToc = rootEl.querySelector('.preview-toc-mount--sticky');
    const stickyBottom = stickyToc?.getBoundingClientRect().bottom || rootRect.top;
    // Use a point inside the readable viewport rather than a block that may
    // only have one pixel left on screen.
    const top = Math.max(
        rootRect.top + Math.min(96, rootEl.clientHeight * 0.2),
        stickyBottom + 12
    );
    let chosen = blocks[0];
    for (const el of blocks) {
        const rect = el.getBoundingClientRect();
        if (rect.bottom > top) {
            chosen = el;
            break;
        }
        chosen = el;
    }
    return chosen instanceof HTMLElement ? chosen : null;
}

/**
 * Line number (1-based) of the block currently near the top of the preview viewport.
 * Prefer {@link getVisiblePreviewBlock} + document mapping when segments are split.
 * @param {HTMLElement} previewEl
 */
export function getPreviewFocusLine(previewEl) {
    if (!previewEl) return 1;
    const blocks = previewEl.querySelectorAll('[data-md-line]');
    if (!blocks.length) {
        const max = Math.max(0, previewEl.scrollHeight - previewEl.clientHeight);
        if (max <= 0) return 1;
        return Math.max(1, Math.round((previewEl.scrollTop / max) * 100));
    }
    const top = previewEl.getBoundingClientRect().top + 12;
    let chosen = blocks[0];
    for (const el of blocks) {
        const rect = el.getBoundingClientRect();
        if (rect.bottom > top) {
            chosen = el;
            break;
        }
        chosen = el;
    }
    return Math.max(1, Number(chosen.getAttribute('data-md-line')) || 1);
}

/**
 * Scroll preview so the block for `line` (1-based) is near the top.
 * @param {HTMLElement} previewEl
 * @param {number} line
 */
export function scrollPreviewToLine(previewEl, line) {
    if (!previewEl) return;
    const targetLine = Math.max(1, Number(line) || 1);
    const blocks = [...previewEl.querySelectorAll('[data-md-line]')];
    if (!blocks.length) {
        const max = Math.max(0, previewEl.scrollHeight - previewEl.clientHeight);
        previewEl.scrollTop = max * Math.min(1, (targetLine - 1) / 100);
        return;
    }
    let target = blocks[0];
    for (const el of blocks) {
        const n = Number(el.getAttribute('data-md-line')) || 1;
        if (n <= targetLine) target = el;
        else break;
    }
    const rootRect = previewEl.getBoundingClientRect();
    const elRect = target.getBoundingClientRect();
    previewEl.scrollTop += elRect.top - rootRect.top - 10;
}

/**
 * Scroll a textarea to a character offset and place the caret (optionally select word).
 * @param {HTMLTextAreaElement} textarea
 * @param {number} offset
 * @param {{ selectWord?: boolean, focus?: boolean }} [options]
 */
export function scrollTextareaToOffset(textarea, offset, options = {}) {
    if (!textarea) return;
    const value = textarea.value || '';
    const pos = Math.max(0, Math.min(Number(offset) || 0, value.length));
    const focus = options.focus !== false;

    let start = pos;
    let end = pos;
    if (options.selectWord) {
        try {
            const re = /[\p{L}\p{N}_]/u;
            while (start > 0 && re.test(value[start - 1])) start -= 1;
            while (end < value.length && re.test(value[end])) end += 1;
        } catch {
            while (start > 0 && /\w/.test(value[start - 1])) start -= 1;
            while (end < value.length && /\w/.test(value[end])) end += 1;
        }
        if (end <= start) {
            start = pos;
            end = pos;
        }
    }

    if (focus) {
        try {
            textarea.focus({ preventScroll: true });
        } catch {
            textarea.focus();
        }
    }

    try {
        textarea.setSelectionRange(start, end);
    } catch {
        // ignore
    }

    // Source line counts are not enough for a wrapping textarea. Measure the
    // exact rendered offset in a hidden mirror with the same typography/width.
    const markerTop = measureTextareaOffsetTop(textarea, pos);
    const maxScroll = Math.max(0, textarea.scrollHeight - textarea.clientHeight);
    const ideal = markerTop - textarea.clientHeight * 0.3;
    const targetScroll = Math.max(0, Math.min(maxScroll, ideal));
    textarea.scrollTop = targetScroll;
    // Safari can scroll the selection after setSelectionRange; reinforce once.
    requestAnimationFrame(() => {
        textarea.scrollTop = targetScroll;
    });
}

/**
 * Character offset near the top of the textarea viewport (accounts for wrapping).
 * Prefers the caret when it is currently on-screen.
 * @param {HTMLTextAreaElement} textarea
 */
export function getTextareaViewportOffset(textarea) {
    if (!textarea) return 0;
    const value = textarea.value || '';
    if (!value) return 0;

    const scrollTop = Math.max(0, textarea.scrollTop);
    const viewBottom = scrollTop + textarea.clientHeight;
    const caret = Number(textarea.selectionStart);
    if (Number.isFinite(caret) && caret >= 0) {
        const caretTop = measureTextareaOffsetTop(textarea, caret);
        if (caretTop >= scrollTop - 4 && caretTop <= viewBottom - 4) {
            return Math.max(0, Math.min(caret, value.length));
        }
    }

    if (scrollTop <= 2) return 0;

    const target = scrollTop + 12;
    let lo = 0;
    let hi = value.length;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (measureTextareaOffsetTop(textarea, mid) < target) lo = mid + 1;
        else hi = mid;
    }
    return lo;
}

/**
 * Scroll the Preview/List root so an anchored block is near the top.
 * @param {HTMLElement} rootEl
 * @param {{ segIndex?: number, localLine?: number, needle?: string } | null} anchor
 */
export function scrollListsRootToAnchor(rootEl, anchor) {
    if (!rootEl || !anchor) return;
    const segIndex = Number(anchor.segIndex);
    if (!Number.isFinite(segIndex)) return;

    const preview = rootEl.querySelector(`.md-preview--segment[data-seg-index="${segIndex}"]`);
    const stack = rootEl.querySelector(`.mdlist-stack[data-preview-seg-index="${segIndex}"]`);
    let target = null;

    if (preview) {
        const blocks = [...preview.querySelectorAll(':scope > [data-md-line]')];
        const needle = String(anchor.needle || '').trim();
        const localLine = Math.max(1, Number(anchor.localLine) || 1);

        if (needle) {
            let best = null;
            let bestDist = Infinity;
            const lower = needle.toLocaleLowerCase();
            for (const el of blocks) {
                const text = (el.textContent || '').toLocaleLowerCase();
                if (!text.includes(lower)) continue;
                const n = Number(el.getAttribute('data-md-line')) || 1;
                const dist = Math.abs(n - localLine);
                if (dist < bestDist) {
                    bestDist = dist;
                    best = el;
                }
            }
            target = best;
        }

        if (!target) {
            for (const el of blocks) {
                const n = Number(el.getAttribute('data-md-line')) || 1;
                if (n <= localLine) target = el;
                else break;
            }
        }
        if (!target) target = blocks[0] || preview;
    } else if (stack) {
        target = stack;
    }

    if (!(target instanceof HTMLElement)) return;
    const rootRect = rootEl.getBoundingClientRect();
    const stickyToc = rootEl.querySelector('.preview-toc-mount--sticky');
    const stickyBottom = stickyToc?.getBoundingClientRect().bottom || rootRect.top;
    const topPad = Math.max(10, stickyBottom - rootRect.top + 8);
    const elRect = target.getBoundingClientRect();
    rootEl.scrollTop += elRect.top - rootRect.top - topPad;
}

/**
 * Measure a character offset using textarea-equivalent wrapping.
 * @param {HTMLTextAreaElement} textarea
 * @param {number} offset
 */
function measureTextareaOffsetTop(textarea, offset) {
    const style = window.getComputedStyle(textarea);
    const mirror = document.createElement('div');
    const properties = [
        'fontFamily',
        'fontSize',
        'fontStyle',
        'fontWeight',
        'fontVariant',
        'lineHeight',
        'letterSpacing',
        'textTransform',
        'textIndent',
        'textAlign',
        'wordSpacing',
        'tabSize',
        'paddingTop',
        'paddingRight',
        'paddingBottom',
        'paddingLeft',
        'borderTopWidth',
        'borderRightWidth',
        'borderBottomWidth',
        'borderLeftWidth',
    ];
    for (const property of properties) {
        mirror.style[property] = style[property];
    }
    mirror.style.position = 'fixed';
    mirror.style.left = '-10000px';
    mirror.style.top = '0';
    mirror.style.visibility = 'hidden';
    mirror.style.pointerEvents = 'none';
    mirror.style.boxSizing = 'border-box';
    mirror.style.width = `${textarea.offsetWidth}px`;
    mirror.style.whiteSpace = 'pre-wrap';
    mirror.style.overflowWrap = 'break-word';
    mirror.style.wordBreak = 'break-word';

    const before = document.createTextNode((textarea.value || '').slice(0, offset));
    const marker = document.createElement('span');
    marker.textContent = '\u200b';
    mirror.append(before, marker);
    document.body.appendChild(mirror);
    const top = marker.offsetTop;
    mirror.remove();
    return top;
}

/**
 * Scroll a textarea to approximately the given 1-based source line.
 * @param {HTMLTextAreaElement} textarea
 * @param {number} line
 * @param {{ focus?: boolean }} [options]
 */
export function scrollTextareaToLine(textarea, line, options = {}) {
    if (!textarea) return;
    const targetLine = Math.max(1, Number(line) || 1);
    const value = textarea.value || '';
    const lines = value.split('\n');
    let pos = 0;
    for (let i = 0; i < targetLine - 1 && i < lines.length; i += 1) {
        pos += lines[i].length + 1;
    }
    scrollTextareaToOffset(textarea, pos, { focus: options.focus !== false });
}

/**
 * 1-based line roughly at the top of the textarea viewport.
 * @param {HTMLTextAreaElement} textarea
 */
export function getTextareaFocusLine(textarea) {
    if (!textarea) return 1;
    const style = window.getComputedStyle(textarea);
    let lineHeight = parseFloat(style.lineHeight);
    if (!Number.isFinite(lineHeight) || lineHeight <= 0) {
        const fontSize = parseFloat(style.fontSize) || 16;
        lineHeight = fontSize * 1.5;
    }
    const paddingTop = parseFloat(style.paddingTop) || 0;
    const line = Math.floor((textarea.scrollTop - paddingTop) / lineHeight) + 1;
    return Math.max(1, line);
}

/**
 * Render into an element (replaces children).
 * @param {HTMLElement} el
 * @param {string} markdown
 */
export function renderMarkdownInto(el, markdown) {
    if (!el) return;
    el.innerHTML = renderMarkdown(markdown);
}
