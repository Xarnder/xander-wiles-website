/**
 * In-editor find for markdown (Raw selection + Preview/List highlights).
 * Literal phrase search with optional case-sensitivity / whole-word.
 */

/**
 * Escape a string for safe use inside a RegExp source.
 * @param {string} value
 */
export function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * @typedef {{ start: number, end: number }} SearchMatch
 */

/**
 * Find all non-overlapping matches of a literal query in text.
 * @param {string} text
 * @param {string} query
 * @param {{ caseSensitive?: boolean, wholeWord?: boolean }} [options]
 * @returns {SearchMatch[]}
 */
export function findAllMatches(text, query, options = {}) {
    const q = String(query ?? '');
    if (!q) return [];

    const source = String(text ?? '');
    const caseSensitive = Boolean(options.caseSensitive);
    const wholeWord = Boolean(options.wholeWord);

    let pattern = escapeRegExp(q);
    if (wholeWord) {
        // Prefer Unicode letter/number boundaries; fall back to \b if unsupported.
        pattern = `(?<![\\p{L}\\p{N}_])${pattern}(?![\\p{L}\\p{N}_])`;
    }

    /** @type {RegExp} */
    let re;
    try {
        re = new RegExp(pattern, `${caseSensitive ? 'g' : 'gi'}${wholeWord ? 'u' : ''}`);
    } catch {
        // Older engines: strip lookbehind / unicode property escapes.
        pattern = escapeRegExp(q);
        if (wholeWord) pattern = `\\b${pattern}\\b`;
        re = new RegExp(pattern, caseSensitive ? 'g' : 'gi');
    }

    /** @type {SearchMatch[]} */
    const matches = [];
    let match;
    let guard = 0;
    const max = Math.max(1, source.length + 1);

    while ((match = re.exec(source)) !== null) {
        const start = match.index;
        const end = start + match[0].length;
        matches.push({ start, end });
        guard += 1;
        if (guard > max) break;
        // Avoid zero-width infinite loops
        if (match[0].length === 0) {
            re.lastIndex = start + 1;
        }
    }

    return matches;
}

/**
 * Pick the match index to land on given a caret position.
 * Prefers the first match at/after the caret; otherwise wraps to 0.
 * @param {SearchMatch[]} matches
 * @param {number} caret
 */
export function matchIndexFromCaret(matches, caret) {
    if (!matches.length) return -1;
    const pos = Math.max(0, Number(caret) || 0);
    const idx = matches.findIndex((m) => m.start >= pos);
    return idx >= 0 ? idx : 0;
}

/**
 * Select a match in a textarea and scroll it into view.
 * When focus is false, briefly focuses only if needed to set the selection, then
 * restores the previously focused element (typically the search input).
 * @param {HTMLTextAreaElement} textarea
 * @param {SearchMatch} match
 * @param {{ focus?: boolean }} [options]
 */
export function selectMatchInTextarea(textarea, match, options = {}) {
    if (!textarea || !match) return;
    const shouldFocus = options.focus === true;
    const restoreEl =
        !shouldFocus &&
        document.activeElement &&
        document.activeElement !== textarea &&
        typeof document.activeElement.focus === 'function'
            ? document.activeElement
            : null;

    const start = Math.max(0, match.start);
    const end = Math.max(start, match.end);
    const value = textarea.value || '';

    const safeStart = Math.min(start, value.length);
    const safeEnd = Math.min(end, value.length);

    try {
        textarea.focus({ preventScroll: true });
    } catch {
        textarea.focus();
    }

    try {
        textarea.setSelectionRange(safeStart, safeEnd);
    } catch {
        // ignore
    }

    // Approximate scroll so the selection sits in the viewport
    const style = window.getComputedStyle(textarea);
    let lineHeight = parseFloat(style.lineHeight);
    if (!Number.isFinite(lineHeight) || lineHeight <= 0) {
        const fontSize = parseFloat(style.fontSize) || 16;
        lineHeight = fontSize * 1.5;
    }
    const paddingTop = parseFloat(style.paddingTop) || 0;
    const before = value.slice(0, safeStart);
    const lineIndex = before.split('\n').length - 1;
    const ideal = paddingTop + lineIndex * lineHeight - textarea.clientHeight * 0.35;
    const maxScroll = Math.max(0, textarea.scrollHeight - textarea.clientHeight);
    textarea.scrollTop = Math.max(0, Math.min(maxScroll, ideal));

    if (restoreEl) {
        try {
            restoreEl.focus({ preventScroll: true });
        } catch {
            restoreEl.focus();
        }
    }
}

const HIGHLIGHT_CLASS = 'search-hit';
const HIGHLIGHT_CURRENT = 'search-hit--current';

/**
 * @param {ParentNode | null | undefined} root
 */
export function clearSearchHighlights(root) {
    if (!root || typeof root.querySelectorAll !== 'function') return;
    const marks = [...root.querySelectorAll(`mark.${HIGHLIGHT_CLASS}`)];
    for (const mark of marks) {
        const parent = mark.parentNode;
        if (!parent) continue;
        while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
        parent.removeChild(mark);
        parent.normalize();
    }
}

/**
 * @param {Node} node
 */
function shouldSkipHighlightNode(node) {
    const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    if (!el || typeof el.closest !== 'function') return true;
    if (
        el.closest(
            'script, style, noscript, textarea, input, select, button, option, .preview-toc, .contents-view-header, .list-place-picker, .mdlist-actions, .mdlist-filter, .mdlist-edit-btn, .lists-empty, .editor-search-bar'
        )
    ) {
        return true;
    }
    return false;
}

/**
 * @param {ParentNode} root
 * @returns {Text[]}
 */
function collectHighlightTextNodes(root) {
    /** @type {Text[]} */
    const nodes = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
            if (!node.nodeValue) return NodeFilter.FILTER_REJECT;
            if (shouldSkipHighlightNode(node)) return NodeFilter.FILTER_REJECT;
            if (node.parentElement?.closest?.(`mark.${HIGHLIGHT_CLASS}`)) {
                return NodeFilter.FILTER_REJECT;
            }
            return NodeFilter.FILTER_ACCEPT;
        },
    });
    while (walker.nextNode()) {
        nodes.push(/** @type {Text} */ (walker.currentNode));
    }
    return nodes;
}

/**
 * @param {{ node: Text, start: number, end: number }[]} parts
 * @param {number} index
 */
function posFromCombinedIndex(parts, index) {
    for (const part of parts) {
        if (index <= part.end) {
            return { node: part.node, offset: Math.max(0, index - part.start) };
        }
    }
    const last = parts[parts.length - 1];
    return {
        node: last.node,
        offset: last.node.nodeValue ? last.node.nodeValue.length : 0,
    };
}

/**
 * @param {Text} startNode
 * @param {number} startOffset
 * @param {Text} endNode
 * @param {number} endOffset
 */
function wrapTextRange(startNode, startOffset, endNode, endOffset) {
    if (startNode === endNode) {
        const node = startNode;
        const textLen = node.nodeValue ? node.nodeValue.length : 0;
        const end = Math.min(endOffset, textLen);
        const start = Math.min(startOffset, end);
        if (start === end) return null;
        if (end < textLen) node.splitText(end);
        const mid = start > 0 ? node.splitText(start) : node;
        const mark = document.createElement('mark');
        mark.className = HIGHLIGHT_CLASS;
        mid.parentNode?.insertBefore(mark, mid);
        mark.appendChild(mid);
        return mark;
    }

    const range = document.createRange();
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);
    const mark = document.createElement('mark');
    mark.className = HIGHLIGHT_CLASS;
    try {
        range.surroundContents(mark);
    } catch {
        const contents = range.extractContents();
        mark.appendChild(contents);
        range.insertNode(mark);
    }
    return mark;
}

/**
 * Concatenate highlightable text under root (same nodes used for marks).
 * @param {ParentNode | null | undefined} root
 */
function visibleSearchText(root) {
    if (!root) return '';
    return collectHighlightTextNodes(root)
        .map((node) => node.nodeValue || '')
        .join('');
}

/**
 * Wrap all query matches in `root` with <mark class="search-hit">.
 * @param {ParentNode | null | undefined} root
 * @param {string} query
 * @param {{ caseSensitive?: boolean, wholeWord?: boolean }} [options]
 * @returns {HTMLElement[]}
 */
export function highlightQueryInRoot(root, query, options = {}) {
    clearSearchHighlights(root);
    if (!root || !String(query ?? '')) return [];

    const nodes = collectHighlightTextNodes(root);
    if (!nodes.length) return [];

    /** @type {{ node: Text, start: number, end: number }[]} */
    const parts = [];
    let combined = '';
    for (const node of nodes) {
        const start = combined.length;
        combined += node.nodeValue || '';
        parts.push({ node, start, end: combined.length });
    }

    const matches = findAllMatches(combined, query, options);
    if (!matches.length) return [];

    /** @type {HTMLElement[]} */
    const marks = [];
    for (let i = matches.length - 1; i >= 0; i -= 1) {
        const m = matches[i];
        const startPos = posFromCombinedIndex(parts, m.start);
        const endPos = posFromCombinedIndex(parts, m.end);
        const mark = wrapTextRange(startPos.node, startPos.offset, endPos.node, endPos.offset);
        if (mark) marks.unshift(mark);
    }
    return marks;
}

/**
 * Scroll a hit into view inside a scrollable container.
 * @param {HTMLElement | null | undefined} el
 * @param {HTMLElement | null | undefined} container
 */
export function scrollHitIntoView(el, container) {
    if (!el) return;
    if (!container) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        return;
    }
    const cRect = container.getBoundingClientRect();
    const eRect = el.getBoundingClientRect();
    const delta = eRect.top - cRect.top - container.clientHeight * 0.3;
    container.scrollTop += delta;
}

/**
 * Create and bind the editor find UI controller.
 * @param {object} options
 * @param {() => object} options.getEls
 * @param {() => string} options.getText — current markdown source
 * @param {() => 'list'|'preview'|'raw'|string} options.getViewMode
 * @param {() => HTMLElement|null|undefined} [options.getHighlightRoot] — Preview/List content root
 * @param {() => boolean} options.isActive — editor view with a file open
 * @param {(msg: string, kind?: string) => void} [options.onStatus]
 * @param {() => void} [options.onLayout] — called when the find bar opens/closes (nav height)
 */
export function createEditorSearch(options) {
    const { getEls, getText, getViewMode, getHighlightRoot, isActive, onStatus, onLayout } = options;

    /** @type {SearchMatch[]} */
    let matches = [];
    let activeIndex = -1;
    let lastQuery = '';

    function els() {
        return getEls();
    }

    function isOpen() {
        const bar = els().editorSearchBar;
        return Boolean(bar && !bar.hidden);
    }

    function readOptions() {
        const e = els();
        return {
            caseSensitive: Boolean(e.editorSearchCase?.checked),
            wholeWord: Boolean(e.editorSearchWord?.checked),
        };
    }

    function highlightRoot() {
        return typeof getHighlightRoot === 'function' ? getHighlightRoot() : null;
    }

    function focusSearchInput() {
        const input = els().editorSearchInput;
        if (!input) return;
        if (document.activeElement === input) return;
        requestAnimationFrame(() => {
            try {
                input.focus({ preventScroll: true });
            } catch {
                input.focus();
            }
        });
    }

    function updateCountLabel() {
        const e = els();
        if (!e.editorSearchCount) return;
        if (!lastQuery) {
            e.editorSearchCount.textContent = '';
            e.editorSearchCount.removeAttribute('data-empty');
            return;
        }
        if (!matches.length) {
            e.editorSearchCount.textContent = 'No results';
            e.editorSearchCount.setAttribute('data-empty', 'true');
            return;
        }
        e.editorSearchCount.removeAttribute('data-empty');
        e.editorSearchCount.textContent = `${activeIndex + 1} / ${matches.length}`;
    }

    function recompute({ keepIndex = false, preferCaret = false } = {}) {
        const e = els();
        const query = e.editorSearchInput?.value ?? '';
        lastQuery = query;
        const mode = typeof getViewMode === 'function' ? getViewMode() : 'raw';
        const opts = readOptions();

        if (mode === 'raw') {
            matches = findAllMatches(getText(), query, opts);
        } else {
            // Match against visible Preview/List text so count ↔ highlights stay aligned
            const root = highlightRoot();
            clearSearchHighlights(root);
            matches = findAllMatches(visibleSearchText(root), query, opts);
        }

        if (!matches.length) {
            activeIndex = -1;
            updateCountLabel();
            return;
        }

        if (keepIndex && activeIndex >= 0 && activeIndex < matches.length) {
            // keep
        } else if (preferCaret && mode === 'raw' && e.editor) {
            activeIndex = matchIndexFromCaret(matches, e.editor.selectionStart ?? 0);
        } else if (activeIndex < 0 || activeIndex >= matches.length) {
            activeIndex = 0;
        }

        updateCountLabel();
    }

    /**
     * Paint highlights / selection for the current mode.
     * @param {{ scrollToActive?: boolean, focusEditor?: boolean }} [opts]
     */
    function syncVisual({ scrollToActive = false, focusEditor = false } = {}) {
        const e = els();
        const mode = typeof getViewMode === 'function' ? getViewMode() : 'raw';
        const root = highlightRoot();

        if (mode === 'raw') {
            clearSearchHighlights(root);
            if (scrollToActive && activeIndex >= 0 && activeIndex < matches.length && e.editor) {
                selectMatchInTextarea(e.editor, matches[activeIndex], { focus: focusEditor });
            }
            if (!focusEditor) focusSearchInput();
            return;
        }

        // Preview / List: mark matches in rendered content; never steal focus to Raw.
        if (!lastQuery || !matches.length) {
            clearSearchHighlights(root);
            if (!focusEditor) focusSearchInput();
            return;
        }

        const marks = highlightQueryInRoot(root, lastQuery, readOptions());
        // Keep activeIndex / count in sync with what we actually painted
        if (marks.length !== matches.length) {
            matches = marks.map((mark, index) => ({ start: index, end: index + 1 }));
            if (activeIndex >= marks.length) activeIndex = marks.length ? 0 : -1;
            updateCountLabel();
        }

        const current =
            activeIndex >= 0 && activeIndex < marks.length ? marks[activeIndex] : null;

        for (let i = 0; i < marks.length; i += 1) {
            marks[i].classList.toggle(HIGHLIGHT_CURRENT, i === activeIndex);
        }

        if (scrollToActive && current) {
            scrollHitIntoView(current, root instanceof HTMLElement ? root : null);
        }

        if (!focusEditor) focusSearchInput();
    }

    function revealActive({ focusEditor = false } = {}) {
        recompute({ keepIndex: true });
        if (!matches.length) {
            activeIndex = -1;
            updateCountLabel();
            clearSearchHighlights(highlightRoot());
            onStatus?.('No matches', 'warn');
            return;
        }
        if (activeIndex < 0 || activeIndex >= matches.length) activeIndex = 0;
        updateCountLabel();
        syncVisual({ scrollToActive: true, focusEditor });
    }

    function go(delta) {
        recompute({ keepIndex: true });
        if (!matches.length) {
            updateCountLabel();
            syncVisual({ scrollToActive: false });
            return;
        }
        if (activeIndex < 0) {
            activeIndex = 0;
        } else {
            activeIndex = (activeIndex + delta + matches.length) % matches.length;
        }
        revealActive({ focusEditor: false });
    }

    function open({ focus = true, seedSelection = true } = {}) {
        const e = els();
        if (!e.editorSearchBar || !isActive()) return;

        e.editorSearchBar.hidden = false;
        e.editorSearchBar.setAttribute('aria-hidden', 'false');
        if (e.btnEditorSearch) {
            e.btnEditorSearch.setAttribute('aria-expanded', 'true');
        }

        if (seedSelection && e.editor && !e.editor.hidden) {
            const selected = e.editor.value.slice(e.editor.selectionStart, e.editor.selectionEnd);
            if (selected && selected.length <= 200 && !selected.includes('\n') && e.editorSearchInput) {
                e.editorSearchInput.value = selected;
            }
        }

        recompute({ preferCaret: true });
        updateCountLabel();
        // Highlight matches in the current view without jumping yet
        syncVisual({ scrollToActive: false, focusEditor: false });

        if (focus && e.editorSearchInput) {
            requestAnimationFrame(() => {
                e.editorSearchInput.focus();
                e.editorSearchInput.select();
            });
        }
        onLayout?.();
    }

    function close({ restoreFocus = true } = {}) {
        const e = els();
        if (!e.editorSearchBar) return;
        e.editorSearchBar.hidden = true;
        e.editorSearchBar.setAttribute('aria-hidden', 'true');
        if (e.btnEditorSearch) {
            e.btnEditorSearch.setAttribute('aria-expanded', 'false');
        }
        clearSearchHighlights(highlightRoot());
        matches = [];
        activeIndex = -1;
        lastQuery = '';
        updateCountLabel();
        onLayout?.();
        if (restoreFocus && e.editor && !e.editor.hidden) {
            try {
                e.editor.focus({ preventScroll: true });
            } catch {
                e.editor.focus();
            }
        }
    }

    function toggle() {
        if (isOpen()) close();
        else open();
    }

    function onQueryInput() {
        // Update match count + live highlights — do not switch modes or move focus
        recompute({ preferCaret: true });
        updateCountLabel();
        syncVisual({ scrollToActive: false, focusEditor: false });
    }

    function bind() {
        const e = els();
        if (!e.btnEditorSearch || !e.editorSearchBar || !e.editorSearchInput) return;

        e.btnEditorSearch.addEventListener('click', () => {
            if (!isActive()) return;
            toggle();
        });

        e.editorSearchInput.addEventListener('input', () => onQueryInput());
        e.editorSearchInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                if (event.shiftKey) go(-1);
                else go(1);
            } else if (event.key === 'Escape') {
                event.preventDefault();
                close();
            }
        });

        e.editorSearchPrev?.addEventListener('click', () => go(-1));
        e.editorSearchNext?.addEventListener('click', () => go(1));
        e.editorSearchClose?.addEventListener('click', () => close());
        const syncOptClass = (input) => {
            const label = input?.closest?.('.editor-search-opt');
            if (label) label.classList.toggle('is-active', Boolean(input.checked));
        };
        if (e.editorSearchCase) {
            syncOptClass(e.editorSearchCase);
            e.editorSearchCase.addEventListener('change', () => {
                syncOptClass(e.editorSearchCase);
                recompute({ preferCaret: true });
                updateCountLabel();
                syncVisual({ scrollToActive: false, focusEditor: false });
            });
        }
        if (e.editorSearchWord) {
            syncOptClass(e.editorSearchWord);
            e.editorSearchWord.addEventListener('change', () => {
                syncOptClass(e.editorSearchWord);
                recompute({ preferCaret: true });
                updateCountLabel();
                syncVisual({ scrollToActive: false, focusEditor: false });
            });
        }

        // Keep results fresh when the textarea changes while find is open
        e.editor?.addEventListener('input', () => {
            if (!isOpen()) return;
            // Ignore editor input caused while find field is focused
            if (document.activeElement === e.editorSearchInput) return;
            const prev = activeIndex;
            recompute({ keepIndex: true });
            if (!matches.length) {
                updateCountLabel();
                syncVisual({ scrollToActive: false });
                return;
            }
            if (prev >= 0 && prev < matches.length) {
                activeIndex = prev;
            }
            updateCountLabel();
            syncVisual({ scrollToActive: false, focusEditor: false });
        });

        window.addEventListener('keydown', (event) => {
            if (!isActive()) return;
            const key = event.key?.toLowerCase();
            const meta = event.metaKey || event.ctrlKey;

            if (meta && key === 'f') {
                event.preventDefault();
                open();
                return;
            }

            if (!isOpen()) return;

            if (key === 'escape') {
                event.preventDefault();
                close();
                return;
            }

            if (key === 'f3') {
                event.preventDefault();
                go(event.shiftKey ? -1 : 1);
                return;
            }

            if (meta && key === 'g') {
                event.preventDefault();
                go(event.shiftKey ? -1 : 1);
            }
        });
    }

    return {
        bind,
        open,
        close,
        toggle,
        isOpen,
        revealCurrent: () => {
            if (!isOpen()) return;
            recompute({ keepIndex: true });
            updateCountLabel();
            if (matches.length && activeIndex >= 0) {
                syncVisual({ scrollToActive: true, focusEditor: false });
            } else {
                syncVisual({ scrollToActive: false, focusEditor: false });
            }
        },
        refresh: () => {
            if (!isOpen()) return;
            recompute({ keepIndex: true });
            updateCountLabel();
            syncVisual({ scrollToActive: false, focusEditor: false });
        },
    };
}
