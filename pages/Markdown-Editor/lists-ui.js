/**
 * Structured list UI for Custom / Mixed modes.
 */

import {
    addItem,
    appendEmptyList,
    collectAllTags,
    createId,
    deleteItem,
    deleteListFromDocument,
    filterItemsByTag,
    formatTagsInput,
    insertEmptyListAt,
    insertImportedListAt,
    mdlistAgentNotePlain,
    moveItemByDelta,
    moveItemToIndex,
    parseTagsInput,
    setItemScore,
    setItemTags,
    setItemText,
    setListTitle,
    stripMdlistAgentNotes,
} from './lists.js';
import {
    extractMarkdownHeadings,
    joinMarkdownBlocks,
    movePlainListItem,
    renderMarkdown,
    splitMarkdownBlocks,
} from './markdown.js';
import { confirmDeleteList } from './ui.js';
import { PREVIEW_TOC_OPEN_DEFAULT, PREVIEW_TOC_OPEN_KEY, PREVIEW_TOC_STICKY_DEFAULT, PREVIEW_TOC_STICKY_KEY } from './config.js';
import { notifySettingsDirty } from './settings-sync.js';

/** Persist which LLM-note disclosures are expanded across list re-renders. */
const expandedAgentNotes = new Set();

/** Active plain-list single-item mini editor closer (preview). */
let closeActivePlainMiniEditor = null;

export function readPreviewTocOpen() {
    try {
        const raw = localStorage.getItem(PREVIEW_TOC_OPEN_KEY);
        if (raw === '0') return false;
        if (raw === '1') return true;
    } catch {
        // ignore
    }
    return PREVIEW_TOC_OPEN_DEFAULT;
}

export function writePreviewTocOpen(open) {
    try {
        localStorage.setItem(PREVIEW_TOC_OPEN_KEY, open ? '1' : '0');
    } catch {
        // ignore
    }
    notifySettingsDirty();
}

export function readPreviewTocSticky() {
    try {
        const raw = localStorage.getItem(PREVIEW_TOC_STICKY_KEY);
        if (raw === '1') return true;
        if (raw === '0') return false;
    } catch {
        // ignore
    }
    return PREVIEW_TOC_STICKY_DEFAULT;
}

export function writePreviewTocSticky(sticky) {
    try {
        localStorage.setItem(PREVIEW_TOC_STICKY_KEY, sticky ? '1' : '0');
    } catch {
        // ignore
    }
    notifySettingsDirty();
}

/**
 * @param {HTMLElement} root
 * @param {object} options
 * @param {'list' | 'preview'} options.mode
 * @param {object} options.doc
 * @param {(doc: object, opts?: object) => void} options.onChange
 * @param {(msg: string, kind?: string) => void} [options.onStatus]
 * @param {string} [options.focusItemId]
 * @param {string} [options.focusPlainItemId]
 * @param {boolean} [options.placingList]
 * @param {object | null} [options.pendingImportList] — when placing, insert this list instead of an empty one
 * @param {boolean} [options.clickEdit]
 * @param {(payload: { segIndex: number, localLine: number, prefix: string }) => void} [options.onEditSpot]
 */
export function renderListsUi(root, options) {
    if (typeof closeActivePlainMiniEditor === 'function') {
        closeActivePlainMiniEditor({ abandon: true });
    }
    const {
        mode,
        doc,
        onChange,
        onStatus,
        focusItemId,
        focusPlainItemId,
        placingList = false,
        pendingImportList = null,
        clickEdit = false,
        onEditSpot = null,
    } = options;
    const scrollTop = root.scrollTop;
    const plainListScroll = capturePlainListScroll(root);
    root.replaceChildren();
    const rootMods = [];
    if (placingList) rootMods.push('lists-root--placing');
    if (clickEdit) rootMods.push('lists-root--click-edit');
    root.className = ['lists-root', ...rootMods].join(' ');
    const place = (target) => placeListAt(doc, onChange, target, pendingImportList);

    ensureEditingForFocus(doc, focusItemId);

    const validLists = (doc.segments || []).filter((s) => s.type === 'mdlist' && s.list);
    const errorLists = (doc.segments || []).filter((s) => s.type === 'mdlist' && !s.list);

    if (errorLists.length) {
        const warn = document.createElement('p');
        warn.className = 'lists-warning';
        warn.textContent = `${errorLists.length} custom list block(s) could not be parsed. Switch to Raw to edit the markdown.`;
        root.appendChild(warn);
    }

    if (mode === 'list') {
        if (!validLists.length) {
            const empty = document.createElement('div');
            empty.className = 'lists-empty';
            const p = document.createElement('p');
            p.textContent = 'No valid custom lists in this file.';
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn btn-primary';
            btn.textContent = 'Add list';
            btn.addEventListener('click', () => {
                const list = appendEmptyList(doc);
                const item = addItem(list, '');
                const seg = (doc.segments || []).find((s) => s.type === 'mdlist' && s.list === list);
                if (seg) seg._editing = true;
                onChange(doc, {
                    focusItemId: item.id,
                    editingListIds: collectEditingLists(doc),
                    tagFilters: collectTagFilters(doc),
                });
            });
            empty.append(p, btn);
            root.appendChild(empty);
            restoreScroll(root, scrollTop, plainListScroll);
            return;
        }
        for (const seg of validLists) {
            root.appendChild(renderListStack(seg, doc, onChange, onStatus, focusItemId));
        }
        const addList = document.createElement('button');
        addList.type = 'button';
        addList.className = 'btn btn-ghost btn-block';
        addList.textContent = '+ Add another list';
        addList.addEventListener('click', () => {
            const list = appendEmptyList(doc);
            const item = addItem(list, '');
            const seg = (doc.segments || []).find((s) => s.type === 'mdlist' && s.list === list);
            if (seg) seg._editing = true;
            onChange(doc, {
                focusItemId: item.id,
                editingListIds: collectEditingLists(doc),
                tagFilters: collectTagFilters(doc),
            });
        });
        root.appendChild(addList);
        restoreScroll(root, scrollTop, plainListScroll);
        focusItem(root, focusItemId);
        return;
    }

    // Preview — same layout while placing / click-editing; selection UI is layered on top
    const outline = placingList || clickEdit ? [] : buildPreviewOutline(doc);
    let tocMount = null;
    if (outline.length) {
        tocMount = document.createElement('div');
        tocMount.className = readPreviewTocSticky()
            ? 'preview-toc-mount preview-toc-mount--sticky'
            : 'preview-toc-mount';
        root.appendChild(tocMount);
    }

    for (let segIndex = 0; segIndex < (doc.segments || []).length; segIndex += 1) {
        const seg = doc.segments[segIndex];
        if (seg.type === 'markdown') {
            root.appendChild(
                renderMarkdownSegment(seg, segIndex, doc, onChange, {
                    placingList,
                    clickEdit,
                    onEditSpot,
                    pendingImportList,
                    root,
                    focusPlainItemId,
                })
            );
            continue;
        }
        if (seg.type === 'mdlist' && seg.list) {
            const stack = renderListStack(seg, doc, onChange, onStatus, focusItemId);
            stack.id = `toc-list-${seg.list.id}`;
            stack.dataset.previewSegIndex = String(segIndex);
            if (placingList) {
                enableListPlaceTarget(stack, segIndex, doc, onChange, root, pendingImportList);
            } else if (clickEdit && typeof onEditSpot === 'function') {
                enableListClickEditTarget(stack, segIndex, onEditSpot);
            }
            root.appendChild(stack);
        } else if (seg.type === 'mdlist') {
            const stack = document.createElement('div');
            stack.className = 'mdlist-stack';
            stack.dataset.previewSegIndex = String(segIndex);
            stack.appendChild(createAgentNoteDisclosure(null));
            const err = document.createElement('pre');
            err.className = 'mixed-markdown mixed-markdown--error';
            err.textContent = seg.raw || '(invalid mdlist)';
            stack.appendChild(err);
            if (placingList) {
                enableListPlaceTarget(stack, segIndex, doc, onChange, root, pendingImportList);
            } else if (clickEdit && typeof onEditSpot === 'function') {
                enableListClickEditTarget(stack, segIndex, onEditSpot);
            }
            root.appendChild(stack);
        }
    }

    if (tocMount && outline.length) {
        tocMount.appendChild(renderPreviewToc(outline, root));
    }

    if (placingList) {
        const hasPlaceable =
            root.querySelector('.md-preview--segment [data-md-line], .mdlist-stack[data-place-seg]') !=
            null;
        if (!hasPlaceable) {
            const emptyPlace = document.createElement('div');
            emptyPlace.className = 'list-place-empty';
            const p = document.createElement('p');
            p.textContent = pendingImportList
                ? `No content to anchor to yet. Place “${pendingImportList.title || 'imported list'}” at the start.`
                : 'No content to anchor to yet. Place the list at the start of the document.';
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn btn-primary';
            btn.textContent = 'Place list at start';
            btn.addEventListener('click', () => {
                place({ type: 'at-start' });
            });
            emptyPlace.append(p, btn);
            root.appendChild(emptyPlace);
        }
        onStatus?.(
            pendingImportList
                ? `Tap where to place “${pendingImportList.title || 'imported list'}”, then Above or Below.`
                : 'Tap a paragraph, heading, quote, code block, or list — then choose Above or Below.',
            'ok'
        );
    } else if (clickEdit) {
        onStatus?.('Tap the text you want to edit — Raw opens at that spot.', 'ok');
    } else if (!validLists.length && !errorLists.length) {
        const hint = document.createElement('div');
        hint.className = 'lists-empty';
        const p = document.createElement('p');
        p.className = 'lists-empty-hint';
        p.textContent = 'No custom lists yet.';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-primary';
        btn.textContent = 'Add list';
        btn.addEventListener('click', () => {
            onChange(doc, { soft: true, placingList: true, ...changeOpts(doc) });
        });
        hint.append(p, btn);
        root.appendChild(hint);
    } else {
        const addList = document.createElement('button');
        addList.type = 'button';
        addList.className = 'btn btn-ghost btn-block';
        addList.textContent = '+ Add list';
        addList.addEventListener('click', () => {
            onChange(doc, { soft: true, placingList: true, ...changeOpts(doc) });
        });
        root.appendChild(addList);
    }

    restoreScroll(root, scrollTop, plainListScroll);
    focusItem(root, focusItemId);
    focusPlainItem(root, focusPlainItemId);
}

function placeListAt(doc, onChange, target, pendingImportList = null) {
    let list;
    let focusItemId = null;
    const importedTitle = pendingImportList?.title || null;
    const importedCount = Array.isArray(pendingImportList?.items)
        ? pendingImportList.items.length
        : 0;
    if (pendingImportList) {
        list = insertImportedListAt(doc, target, pendingImportList);
        focusItemId = list.items?.[0]?.id || null;
        const seg = (doc.segments || []).find((s) => s.type === 'mdlist' && s.list === list);
        if (seg) seg._editing = Boolean(focusItemId);
    } else {
        list = insertEmptyListAt(doc, target);
        const item = addItem(list, '');
        focusItemId = item.id;
        const seg = (doc.segments || []).find((s) => s.type === 'mdlist' && s.list === list);
        if (seg) seg._editing = true;
    }
    onChange(doc, {
        placingList: false,
        pendingImportList: null,
        focusItemId,
        editingListIds: collectEditingLists(doc),
        tagFilters: collectTagFilters(doc),
        statusMessage: importedTitle
            ? `Imported “${importedTitle}” (${importedCount} item${importedCount === 1 ? '' : 's'})`
            : 'Added ranked list',
        statusKind: 'ok',
    });
    return list;
}

function clearPlaceSelection(root) {
    root.querySelectorAll('.is-place-target').forEach((el) => el.classList.remove('is-place-target'));
    root.querySelectorAll('.list-place-picker').forEach((el) => el.remove());
}

function showPlacePicker(anchorEl, root, { onAbove, onBelow }) {
    clearPlaceSelection(root);
    anchorEl.classList.add('is-place-target');

    const picker = document.createElement('div');
    picker.className = 'list-place-picker';
    picker.setAttribute('role', 'group');
    picker.setAttribute('aria-label', 'Place new list');

    const label = document.createElement('p');
    label.className = 'list-place-picker-label';
    label.textContent = 'Place list here';

    const actions = document.createElement('div');
    actions.className = 'list-place-picker-actions';

    const aboveBtn = document.createElement('button');
    aboveBtn.type = 'button';
    aboveBtn.className = 'btn btn-primary btn-small';
    aboveBtn.textContent = 'Above';
    aboveBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        onAbove();
    });

    const belowBtn = document.createElement('button');
    belowBtn.type = 'button';
    belowBtn.className = 'btn btn-primary btn-small';
    belowBtn.textContent = 'Below';
    belowBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        onBelow();
    });

    actions.append(aboveBtn, belowBtn);
    picker.append(label, actions);

    // Keep picker with the target: after lists put after stack; for md blocks after the block
    if (anchorEl.classList.contains('mdlist-stack') || anchorEl.classList.contains('mdlist-block')) {
        anchorEl.insertAdjacentElement('afterend', picker);
    } else {
        anchorEl.insertAdjacentElement('afterend', picker);
    }

    requestAnimationFrame(() => {
        picker.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
}

function blockInsertLines(previewEl, blockEl, sourceText) {
    const start1 = Number(blockEl.getAttribute('data-md-line')) || 1;
    const blocks = [...previewEl.querySelectorAll(':scope > [data-md-line]')];
    const idx = blocks.indexOf(blockEl);
    const lineCount = String(sourceText ?? '').split('\n').length;
    let belowBeforeLine = lineCount;
    if (idx >= 0 && idx < blocks.length - 1) {
        const nextStart1 = Number(blocks[idx + 1].getAttribute('data-md-line')) || start1 + 1;
        belowBeforeLine = Math.max(0, nextStart1 - 1);
    }
    return {
        aboveBeforeLine: Math.max(0, start1 - 1),
        belowBeforeLine,
    };
}

function enableMarkdownPlaceTargets(previewEl, segIndex, sourceText, doc, onChange, root, pendingImportList = null) {
    previewEl.classList.add('md-preview--placing');
    previewEl.addEventListener('click', (event) => {
        const block = findTopLevelMdBlock(event.target, previewEl);
        if (!block) return;
        event.preventDefault();
        event.stopPropagation();

        const { aboveBeforeLine, belowBeforeLine } = blockInsertLines(previewEl, block, sourceText);
        showPlacePicker(block, root, {
            onAbove: () => {
                // Align segment text with the preview source used for line numbers
                const seg = doc.segments[segIndex];
                if (seg?.type === 'markdown') seg.text = sourceText;
                placeListAt(
                    doc,
                    onChange,
                    {
                        type: 'split-markdown',
                        segmentIndex: segIndex,
                        beforeLine: aboveBeforeLine,
                    },
                    pendingImportList
                );
            },
            onBelow: () => {
                const seg = doc.segments[segIndex];
                if (seg?.type === 'markdown') seg.text = sourceText;
                placeListAt(
                    doc,
                    onChange,
                    {
                        type: 'split-markdown',
                        segmentIndex: segIndex,
                        beforeLine: belowBeforeLine,
                    },
                    pendingImportList
                );
            },
        });
    });
}

function findTopLevelMdBlock(target, previewRoot) {
    const blocks = [...previewRoot.querySelectorAll(':scope > [data-md-line]')];
    let el = target instanceof Element ? target : target?.parentElement;
    while (el && el !== previewRoot) {
        if (blocks.includes(el)) return el;
        el = el.parentElement;
    }
    return null;
}

/**
 * Visible text around the caret under a pointer.
 * @param {HTMLElement} blockEl
 * @param {number} clientX
 * @param {number} clientY
 * @returns {{ prefix: string, word: string, blockText: string }}
 */
function textAnchorAtPoint(blockEl, clientX, clientY) {
    const fallback = {
        prefix: '',
        word: '',
        blockText: blockEl?.textContent || '',
    };
    if (!blockEl) return fallback;
    let range = null;
    try {
        if (typeof document.caretRangeFromPoint === 'function') {
            range = document.caretRangeFromPoint(clientX, clientY);
        } else if (typeof document.caretPositionFromPoint === 'function') {
            const pos = document.caretPositionFromPoint(clientX, clientY);
            if (pos?.offsetNode) {
                range = document.createRange();
                range.setStart(pos.offsetNode, pos.offset);
                range.collapse(true);
            }
        }
    } catch {
        range = null;
    }
    if (!range || !blockEl.contains(range.startContainer)) return fallback;
    try {
        const pre = document.createRange();
        pre.selectNodeContents(blockEl);
        pre.setEnd(range.startContainer, range.startOffset);
        const nodeText =
            range.startContainer.nodeType === Node.TEXT_NODE
                ? range.startContainer.nodeValue || ''
                : '';
        let start = Math.min(range.startOffset, nodeText.length);
        let end = start;
        const isWord = (char) => {
            try {
                return /[\p{L}\p{N}_'-]/u.test(char);
            } catch {
                return /[A-Za-z0-9_'-]/.test(char);
            }
        };
        while (start > 0 && isWord(nodeText[start - 1])) start -= 1;
        while (end < nodeText.length && isWord(nodeText[end])) end += 1;
        // Count repeated words using text strictly before the clicked word.
        if (range.startContainer.nodeType === Node.TEXT_NODE) {
            pre.setEnd(range.startContainer, start);
        }
        return {
            prefix: pre.toString(),
            word: nodeText.slice(start, end),
            blockText: blockEl.textContent || '',
        };
    } catch {
        return fallback;
    }
}

function enableMarkdownClickEditTargets(previewEl, segIndex, onEditSpot) {
    previewEl.classList.add('md-preview--click-edit');
    previewEl.addEventListener('click', (event) => {
        const block = findTopLevelMdBlock(event.target, previewEl);
        if (!block) return;
        event.preventDefault();
        event.stopPropagation();
        const localLine = Number(block.getAttribute('data-md-line')) || 1;
        const blocks = [...previewEl.querySelectorAll(':scope > [data-md-line]')];
        const blockIndex = blocks.indexOf(block);
        const nextBlock = blockIndex >= 0 ? blocks[blockIndex + 1] : null;
        const anchor = textAnchorAtPoint(block, event.clientX, event.clientY);
        onEditSpot({
            segIndex,
            localLine,
            nextLocalLine: nextBlock
                ? Number(nextBlock.getAttribute('data-md-line')) || undefined
                : undefined,
            ...anchor,
        });
    });
}

function enableListClickEditTarget(stackEl, segIndex, onEditSpot) {
    stackEl.classList.add('mdlist-stack--click-edit');
    stackEl.addEventListener('click', (event) => {
        if (event.target.closest?.('button, input, select, textarea, a')) return;
        event.preventDefault();
        event.stopPropagation();
        const target =
            event.target.closest?.('.mdlist-view-text, .mdlist-title, .mdlist-view-tags') ||
            stackEl;
        onEditSpot({
            segIndex,
            localLine: 1,
            ...textAnchorAtPoint(target, event.clientX, event.clientY),
        });
    });
}

function enableListPlaceTarget(stackEl, segIndex, doc, onChange, root, pendingImportList = null) {
    stackEl.dataset.placeSeg = String(segIndex);
    stackEl.classList.add('mdlist-stack--placing');
    stackEl.addEventListener('click', (event) => {
        // Ignore clicks on the picker itself if re-bound somehow
        if (event.target.closest?.('.list-place-picker')) return;
        event.preventDefault();
        event.stopPropagation();
        showPlacePicker(stackEl, root, {
            onAbove: () => {
                if (segIndex <= 0) {
                    placeListAt(doc, onChange, { type: 'at-start' }, pendingImportList);
                } else {
                    placeListAt(
                        doc,
                        onChange,
                        { type: 'after-segment', index: segIndex - 1 },
                        pendingImportList
                    );
                }
            },
            onBelow: () => {
                placeListAt(
                    doc,
                    onChange,
                    { type: 'after-segment', index: segIndex },
                    pendingImportList
                );
            },
        });
    });
}

function capturePlainListScroll(root) {
    const positions = {};
    const blocks = root.querySelectorAll(
        '.mdplain-block[data-seg-index][data-plain-list-index]'
    );
    for (const block of blocks) {
        const scroller = block.querySelector(':scope > .mdplain-items');
        if (!scroller) continue;
        const key = `${block.dataset.segIndex}:${block.dataset.plainListIndex}`;
        positions[key] = scroller.scrollTop;
    }
    return positions;
}

function restoreScroll(root, scrollTop, plainListScroll = {}) {
    requestAnimationFrame(() => {
        root.scrollTop = scrollTop;
        for (const [key, listScrollTop] of Object.entries(plainListScroll)) {
            const [segIndex, listIndex] = key.split(':');
            const block = root.querySelector(
                `.mdplain-block[data-seg-index="${CSS.escape(segIndex)}"]` +
                    `[data-plain-list-index="${CSS.escape(listIndex)}"]`
            );
            const scroller = block?.querySelector(':scope > .mdplain-items');
            if (scroller) scroller.scrollTop = listScrollTop;
        }
    });
}

/**
 * @param {object} doc
 * @returns {Array<{ id: string, level: number, title: string, kind: 'heading' | 'list' }>}
 */
function buildPreviewOutline(doc) {
    /** @type {Array<{ id: string, level: number, title: string, kind: 'heading' | 'list' }>} */
    const items = [];
    (doc.segments || []).forEach((seg, segIndex) => {
        if (seg.type === 'markdown') {
            const text = stripMdlistAgentNotes(seg.text || '');
            for (const heading of extractMarkdownHeadings(text)) {
                items.push({
                    id: `toc-s${segIndex}-l${heading.line}`,
                    level: heading.level,
                    title: heading.title,
                    kind: 'heading',
                });
            }
            return;
        }
        if (seg.type === 'mdlist' && seg.list) {
            items.push({
                id: `toc-list-${seg.list.id}`,
                level: 2,
                title: String(seg.list.title || 'List').trim() || 'List',
                kind: 'list',
            });
        }
    });
    return items;
}

function renderPreviewToc(outline, root) {
    const details = document.createElement('details');
    details.className = 'preview-toc';
    details.open = readPreviewTocOpen();
    details.addEventListener('toggle', () => {
        writePreviewTocOpen(details.open);
    });

    const summary = document.createElement('summary');
    summary.className = 'preview-toc-summary';

    const title = document.createElement('span');
    title.className = 'preview-toc-title';
    title.textContent = 'Contents';

    const meta = document.createElement('span');
    meta.className = 'preview-toc-meta';
    const n = outline.length;
    meta.textContent = `${n} section${n === 1 ? '' : 's'}`;

    const hint = document.createElement('span');
    hint.className = 'preview-toc-hint';
    hint.textContent = details.open ? 'Collapse' : 'Expand';
    details.addEventListener('toggle', () => {
        hint.textContent = details.open ? 'Collapse' : 'Expand';
    });

    summary.append(title, meta, hint);
    details.appendChild(summary);

    const nav = document.createElement('nav');
    nav.className = 'preview-toc-nav';
    nav.setAttribute('aria-label', 'Document contents');

    const list = document.createElement('ol');
    list.className = 'preview-toc-list';

    for (const item of outline) {
        const li = document.createElement('li');
        li.className = 'preview-toc-item';
        li.dataset.level = String(item.level);
        li.style.setProperty('--toc-level', String(Math.max(0, item.level - 1)));

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'preview-toc-link';
        if (item.kind === 'list') btn.classList.add('preview-toc-link--list');
        btn.textContent = item.title;
        btn.title = item.kind === 'list' ? `Jump to list: ${item.title}` : `Jump to ${item.title}`;
        btn.addEventListener('click', () => {
            jumpToTocTarget(root, item.id);
        });

        li.appendChild(btn);
        list.appendChild(li);
    }

    nav.appendChild(list);
    details.appendChild(nav);
    return details;
}

function jumpToTocTarget(root, id) {
    const target = root.querySelector(`#${CSS.escape(id)}`);
    if (!target) return;
    target.classList.remove('toc-flash');
    // Force reflow so the animation can replay
    void target.offsetWidth;
    target.classList.add('toc-flash');
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.setTimeout(() => target.classList.remove('toc-flash'), 1600);
    if (typeof target.focus === 'function') {
        const hadTabIndex = target.hasAttribute('tabindex');
        if (!hadTabIndex) target.tabIndex = -1;
        try {
            target.focus({ preventScroll: true });
        } catch {
            target.focus();
        }
        if (!hadTabIndex) {
            window.setTimeout(() => target.removeAttribute('tabindex'), 800);
        }
    }
}

function renderMarkdownSegment(seg, segIndex, doc, onChange, options = {}) {
    const placingList = Boolean(options.placingList);
    const clickEdit = Boolean(options.clickEdit);
    const onEditSpot = options.onEditSpot;
    const pendingImportList = options.pendingImportList || null;
    const listsRoot = options.root || null;
    const focusPlainItemId = options.focusPlainItemId || null;
    const wrap = document.createElement('div');
    wrap.className = 'mixed-markdown-wrap';
    const editing = Boolean(seg._editing) && !placingList && !clickEdit;

    const toolbar = document.createElement('div');
    toolbar.className = 'mixed-md-toolbar';
    const label = document.createElement('span');
    label.className = 'mixed-md-label';
    label.textContent = 'Markdown';
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'btn btn-ghost btn-small';
    toggle.textContent = editing ? 'Done' : 'Edit';
    toggle.disabled = placingList || clickEdit;
    if (!placingList && !clickEdit) {
        toggle.addEventListener('click', () => {
            if (editing) {
                seg._editing = false;
            } else {
                seg._editing = true;
                // Whole-section raw edit exits structured plain-list edit
                seg._editingPlainLists = {};
                seg._plainBlocks = null;
                seg._plainBlocksSource = null;
            }
            onChange(doc, {
                soft: true,
                tagFilters: collectTagFilters(doc),
                editingListIds: collectEditingLists(doc),
                editingPlainLists: collectEditingPlainLists(doc),
            });
        });
    }
    toolbar.append(label, toggle);
    wrap.appendChild(toolbar);

    if (editing) {
        const fieldId = `mixed-md-${segIndex}`;
        const ta = document.createElement('textarea');
        ta.id = fieldId;
        ta.className = 'mixed-markdown-editor';
        ta.value = seg.text || '';
        ta.spellcheck = true;
        ta.rows = Math.min(18, Math.max(4, (seg.text || '').split('\n').length + 1));
        ta.addEventListener('input', () => {
            seg.text = ta.value;
            onChange(doc, {
                skipRender: true,
                tagFilters: collectTagFilters(doc),
                editingListIds: collectEditingLists(doc),
                editingPlainLists: collectEditingPlainLists(doc),
            });
        });
        wrap.appendChild(ta);
        requestAnimationFrame(() => ta.focus());
    } else {
        const sourceText = stripMdlistAgentNotes(seg.text || '');
        if (!sourceText.trim()) {
            const preview = document.createElement('div');
            preview.className = 'md-preview md-preview--segment';
            preview.dataset.segIndex = String(segIndex);
            preview.innerHTML = '<p class="md-empty">Empty markdown section — tap Edit to write.</p>';
            wrap.appendChild(preview);
        } else if (placingList || clickEdit) {
            // Placement / click-edit need a single preview tree with data-md-line anchors
            const preview = document.createElement('div');
            preview.className = 'md-preview md-preview--segment';
            preview.dataset.segIndex = String(segIndex);
            preview.innerHTML = renderMarkdown(sourceText);
            assignHeadingTocIds(preview, segIndex);
            wrap.appendChild(preview);
            if (placingList && listsRoot) {
                enableMarkdownPlaceTargets(
                    preview,
                    segIndex,
                    sourceText,
                    doc,
                    onChange,
                    listsRoot,
                    pendingImportList
                );
            } else if (clickEdit && typeof onEditSpot === 'function') {
                enableMarkdownClickEditTargets(preview, segIndex, onEditSpot);
            }
        } else {
            const blocks = getCachedPlainBlocks(seg);
            // Prefer cached blocks when segment text still matches (edit session)
            const editingMap = seg._editingPlainLists || {};
            let plainListIndex = 0;
            let renderedAny = false;

            for (const block of blocks) {
                if (block.type === 'plainlist') {
                    const listIndex = plainListIndex;
                    plainListIndex += 1;
                    wrap.appendChild(
                        renderPlainListBlock({
                            block,
                            listIndex,
                            seg,
                            segIndex,
                            doc,
                            onChange,
                            editing: Boolean(editingMap[listIndex]),
                            focusPlainItemId,
                        })
                    );
                    renderedAny = true;
                    continue;
                }

                const prose = block.text || '';
                if (!prose.trim()) continue;
                const preview = document.createElement('div');
                preview.className = 'md-preview md-preview--segment md-preview--prose-chunk';
                preview.dataset.segIndex = String(segIndex);
                preview.innerHTML = renderMarkdown(prose, {
                    lineOffset: Math.max(0, (block.startLine || 1) - 1),
                });
                assignHeadingTocIds(preview, segIndex);
                wrap.appendChild(preview);
                renderedAny = true;
            }

            if (!renderedAny) {
                const preview = document.createElement('div');
                preview.className = 'md-preview md-preview--segment';
                preview.dataset.segIndex = String(segIndex);
                preview.innerHTML = '<p class="md-empty">Empty markdown section — tap Edit to write.</p>';
                wrap.appendChild(preview);
            }
        }
    }

    return wrap;
}

/**
 * Rewrite a markdown segment's plain list at `listIndex` via mutator, then notify.
 * Keeps an in-memory block cache so item identity survives skipRender typing.
 * @param {object} args
 */
function getCachedPlainBlocks(seg) {
    const sourceText = stripMdlistAgentNotes(seg.text || '');
    if (seg._plainBlocks && seg._plainBlocksSource === sourceText) {
        return seg._plainBlocks;
    }
    const blocks = splitMarkdownBlocks(sourceText);
    seg._plainBlocks = blocks;
    seg._plainBlocksSource = sourceText;
    return blocks;
}

function commitPlainBlocks(seg, blocks) {
    seg.text = joinMarkdownBlocks(blocks);
    seg._plainBlocks = blocks;
    seg._plainBlocksSource = stripMdlistAgentNotes(seg.text || '');
}

function mutatePlainListInSegment({
    seg,
    segIndex,
    listIndex,
    doc,
    onChange,
    mutator,
    opts = {},
}) {
    const blocks = getCachedPlainBlocks(seg);
    const lists = blocks.filter((b) => b.type === 'plainlist');
    const target = lists[listIndex];
    if (!target) return;
    mutator(target);
    commitPlainBlocks(seg, blocks);
    // Mini single-item edits stay in preview; full editor opts in explicitly.
    if (!opts.stayInView) {
        if (!seg._editingPlainLists) seg._editingPlainLists = {};
        seg._editingPlainLists[listIndex] = true;
    }
    const nextOpts = {
        ...changeOpts(doc, opts),
        editingPlainLists: collectEditingPlainLists(doc),
    };
    delete nextOpts.stayInView;
    // Keep the in-memory segment (and item ids) so typing/reorder stay stable.
    if (!opts.skipRender) {
        nextOpts.soft = true;
        nextOpts.persist = true;
    }
    onChange(doc, nextOpts);
}

function plainListKindLabel(block) {
    if (block.task) return 'Checklist';
    if (block.ordered) return 'Numbered list';
    return 'Bullet list';
}

function renderPlainListBlock({
    block,
    listIndex,
    seg,
    segIndex,
    doc,
    onChange,
    editing,
    focusPlainItemId,
}) {
    const wrap = document.createElement('section');
    wrap.className = editing
        ? 'mdplain-block mdplain-block--editing'
        : 'mdplain-block mdplain-block--view';
    wrap.dataset.segIndex = String(segIndex);
    wrap.dataset.plainListIndex = String(listIndex);
    wrap.dataset.mdLine = String(block.startLine || 1);
    wrap.setAttribute('data-md-line', String(block.startLine || 1));

    if (!editing) {
        wrap.appendChild(renderPlainListViewHeader(block, seg, listIndex, doc, onChange));
        const viewItems = renderPlainListViewItems(block, {
            onItemLongPress: (item, li) => {
                openPlainItemMiniEditor({
                    li,
                    item,
                    block,
                    seg,
                    segIndex,
                    listIndex,
                    doc,
                    onChange,
                });
            },
        });
        wrap.appendChild(viewItems);
        return wrap;
    }

    const header = document.createElement('div');
    header.className = 'mdplain-header';

    const titleRow = document.createElement('div');
    titleRow.className = 'mdlist-title-row';

    const title = document.createElement('h3');
    title.className = 'mdplain-title';
    title.textContent = plainListKindLabel(block);

    const count = document.createElement('span');
    count.className = 'mdlist-count';
    const n = (block.items || []).length;
    count.textContent = `${n} item${n === 1 ? '' : 's'}`;

    const doneBtn = document.createElement('button');
    doneBtn.type = 'button';
    doneBtn.className = 'btn btn-ghost btn-small';
    doneBtn.textContent = 'Done';
    doneBtn.setAttribute('aria-label', 'Done editing list');
    doneBtn.addEventListener('click', () => {
        if (seg._editingPlainLists) delete seg._editingPlainLists[listIndex];
        onChange(doc, changeOpts(doc, { soft: true, editingPlainLists: collectEditingPlainLists(doc) }));
    });

    titleRow.append(title, count, doneBtn);
    header.appendChild(titleRow);

    const hint = document.createElement('p');
    hint.className = 'mdplain-hint';
    hint.textContent = 'Drag or use arrows to reorder. Changes save as normal markdown.';
    header.appendChild(hint);
    wrap.appendChild(header);

    const ul = document.createElement('ul');
    ul.className = 'mdlist-items mdplain-items';
    ul.setAttribute('role', 'list');

    const items = block.items || [];
    if (!items.length) {
        const empty = document.createElement('li');
        empty.className = 'mdlist-empty-item';
        empty.textContent = 'No items yet.';
        ul.appendChild(empty);
    }

    items.forEach((item, index) => {
        ul.appendChild(
            renderPlainItemRow({
                item,
                index,
                block,
                total: items.length,
                preferFocus: focusPlainItemId === item.id,
                onMutate: (mutator, opts = {}) => {
                    mutatePlainListInSegment({
                        seg,
                        segIndex,
                        listIndex,
                        doc,
                        onChange,
                        mutator: (listBlock) => {
                            // Re-find item by id inside freshly parsed block
                            mutator(listBlock);
                        },
                        opts,
                    });
                },
            })
        );
    });

    wrap.appendChild(ul);

    const actions = document.createElement('div');
    actions.className = 'mdlist-actions';
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'btn btn-primary';
    addBtn.textContent = '+ Item';
    addBtn.addEventListener('click', () => {
        const newId = createId('pli');
        mutatePlainListInSegment({
            seg,
            segIndex,
            listIndex,
            doc,
            onChange,
            mutator: (listBlock) => {
                const sample = listBlock.items[0];
                listBlock.items.push({
                    id: newId,
                    text: '',
                    checked: listBlock.task ? false : null,
                    marker: sample?.marker || (listBlock.ordered ? '1.' : '-'),
                    indent: sample?.indent || '',
                });
            },
            opts: { focusPlainItemId: newId },
        });
    });
    actions.appendChild(addBtn);
    wrap.appendChild(actions);

    return wrap;
}

function renderPlainListViewHeader(block, seg, listIndex, doc, onChange) {
    const header = document.createElement('div');
    header.className = 'mdplain-header';

    const titleRow = document.createElement('div');
    titleRow.className = 'mdlist-title-row';

    const title = document.createElement('h3');
    title.className = 'mdplain-title';
    title.textContent = plainListKindLabel(block);

    const count = document.createElement('span');
    count.className = 'mdlist-count';
    const n = (block.items || []).length;
    count.textContent = `${n} item${n === 1 ? '' : 's'}`;

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'mdlist-edit-btn';
    editBtn.setAttribute('aria-label', 'Edit list');
    editBtn.title = 'Edit list order and items';
    editBtn.innerHTML =
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 20h4.5L19 9.5 14.5 5 4 15.5V20z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M13.2 6.3l4.5 4.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
    editBtn.addEventListener('click', () => {
        if (!seg._editingPlainLists) seg._editingPlainLists = {};
        seg._editingPlainLists[listIndex] = true;
        onChange(doc, changeOpts(doc, { soft: true, editingPlainLists: collectEditingPlainLists(doc) }));
    });

    titleRow.append(title, count, editBtn);
    header.appendChild(titleRow);
    return header;
}

const PLAIN_LIST_LONG_PRESS_MS = 500;
const PLAIN_LIST_LONG_PRESS_MOVE_PX = 10;

/**
 * Long-press on an element; cancels if the pointer moves too far (scroll/drag).
 * @param {HTMLElement} el
 * @param {(event: PointerEvent) => void} onLongPress
 */
function attachLongPress(el, onLongPress) {
    let timer = null;
    let startX = 0;
    let startY = 0;
    let pressed = false;
    let fired = false;

    const clearTimer = () => {
        if (timer != null) {
            clearTimeout(timer);
            timer = null;
        }
    };

    const endPress = () => {
        clearTimer();
        pressed = false;
        el.classList.remove('is-long-pressing');
    };

    el.addEventListener('pointerdown', (event) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        if (el.classList.contains('mdplain-view-item--mini-editing')) return;
        pressed = true;
        fired = false;
        startX = event.clientX;
        startY = event.clientY;
        el.classList.add('is-long-pressing');
        clearTimer();
        timer = window.setTimeout(() => {
            timer = null;
            if (!pressed) return;
            fired = true;
            el.classList.remove('is-long-pressing');
            onLongPress(event);
        }, PLAIN_LIST_LONG_PRESS_MS);
    });

    el.addEventListener('pointermove', (event) => {
        if (!pressed || timer == null) return;
        const dx = event.clientX - startX;
        const dy = event.clientY - startY;
        if (dx * dx + dy * dy > PLAIN_LIST_LONG_PRESS_MOVE_PX * PLAIN_LIST_LONG_PRESS_MOVE_PX) {
            endPress();
        }
    });

    el.addEventListener('pointerup', endPress);
    el.addEventListener('pointercancel', endPress);

    el.addEventListener(
        'click',
        (event) => {
            if (!fired) return;
            event.preventDefault();
            event.stopPropagation();
            fired = false;
        },
        true
    );

    el.addEventListener('contextmenu', (event) => {
        // Suppress native menus that conflict with long-press-to-edit.
        if (fired || pressed || timer != null) {
            event.preventDefault();
        }
    });
}

/**
 * Inline mini editor for one plain-list item (preview stays open).
 * @param {object} args
 */
function openPlainItemMiniEditor({
    li,
    item,
    block,
    seg,
    segIndex,
    listIndex,
    doc,
    onChange,
}) {
    if (!li || li.classList.contains('mdplain-view-item--mini-editing')) return;

    if (typeof closeActivePlainMiniEditor === 'function') {
        // Commit prior item without rebuilding the whole preview (keeps this `li` alive).
        closeActivePlainMiniEditor({ commit: true, deferRefresh: true });
    }

    const snapshot = {
        text: item.text || '',
        checked: item.checked === true || item.checked === false ? item.checked : null,
    };
    const isTask = snapshot.checked !== null || Boolean(block.task);

    const mutateItem = (mutator, opts = {}) => {
        mutatePlainListInSegment({
            seg,
            segIndex,
            listIndex,
            doc,
            onChange,
            mutator: (listBlock) => {
                const target = (listBlock.items || []).find((it) => it.id === item.id);
                if (!target) return;
                mutator(target, listBlock);
            },
            opts: { stayInView: true, ...opts },
        });
    };

    let closed = false;
    const cleanupOutside = () => {
        document.removeEventListener('pointerdown', onOutsidePointerDown, true);
        document.removeEventListener('keydown', onDocKeyDown, true);
    };

    const paintViewItem = (text, checked) => {
        li.classList.remove('mdplain-view-item--mini-editing');
        li.title = 'Long-press to edit this item';
        li.replaceChildren();
        if (checked === true || checked === false) {
            const label = document.createElement('label');
            label.className = 'mdplain-task-label';
            const box = document.createElement('input');
            box.type = 'checkbox';
            box.disabled = true;
            box.checked = Boolean(checked);
            const span = document.createElement('span');
            span.textContent = text || 'Untitled item';
            label.append(box, span);
            li.appendChild(label);
        } else {
            const textEl = document.createElement('span');
            textEl.className = 'mdplain-view-text';
            textEl.textContent = text || 'Untitled item';
            li.appendChild(textEl);
        }
    };

    const finish = ({ commit = true, deleted = false, deferRefresh = false, abandon = false } = {}) => {
        if (closed) return;
        closed = true;
        if (closeActivePlainMiniEditor === closeFn) closeActivePlainMiniEditor = null;
        cleanupOutside();
        if (abandon) return;

        if (deleted) {
            mutatePlainListInSegment({
                seg,
                segIndex,
                listIndex,
                doc,
                onChange,
                mutator: (listBlock) => {
                    listBlock.items = (listBlock.items || []).filter((it) => it.id !== item.id);
                },
                opts: { stayInView: true },
            });
            return;
        }

        if (!commit) {
            mutateItem(
                (target, listBlock) => {
                    target.text = snapshot.text;
                    if (snapshot.checked !== null) {
                        target.checked = snapshot.checked;
                        listBlock.task = true;
                    }
                },
                deferRefresh ? { skipRender: true } : {}
            );
            if (deferRefresh) {
                paintViewItem(snapshot.text, snapshot.checked);
            }
            return;
        }

        const nextText = textInput.value;
        const nextChecked = checkInput
            ? checkInput.checked
            : snapshot.checked !== null
              ? snapshot.checked
              : null;
        mutateItem(
            (target, listBlock) => {
                target.text = nextText;
                if (checkInput) {
                    target.checked = checkInput.checked;
                    listBlock.task = true;
                }
            },
            deferRefresh ? { skipRender: true } : {}
        );
        if (deferRefresh) {
            paintViewItem(nextText, nextChecked);
        }
    };

    const closeFn = (opts) => finish(opts);
    closeActivePlainMiniEditor = closeFn;

    li.classList.add('mdplain-view-item--mini-editing');
    li.title = '';
    li.replaceChildren();

    const editor = document.createElement('div');
    editor.className = 'mdplain-mini-editor';

    let checkInput = null;
    if (isTask) {
        const checkRow = document.createElement('label');
        checkRow.className = 'mdplain-mini-check';
        checkInput = document.createElement('input');
        checkInput.type = 'checkbox';
        checkInput.className = 'mdplain-check';
        checkInput.checked = Boolean(item.checked);
        checkInput.setAttribute('aria-label', 'Completed');
        checkInput.addEventListener('change', () => {
            mutateItem(
                (target, listBlock) => {
                    target.checked = checkInput.checked;
                    listBlock.task = true;
                },
                { skipRender: true }
            );
        });
        const checkLabel = document.createElement('span');
        checkLabel.textContent = 'Done';
        checkRow.append(checkInput, checkLabel);
        editor.appendChild(checkRow);
    }

    const textInput = document.createElement('textarea');
    textInput.className = 'mdplain-mini-text';
    textInput.rows = 2;
    textInput.value = item.text || '';
    textInput.placeholder = 'Item text';
    textInput.setAttribute('aria-label', 'Edit list item');
    textInput.spellcheck = true;

    const syncHeight = () => {
        textInput.style.height = '0px';
        const maxPx = Math.round(window.innerHeight * 0.35);
        textInput.style.height = `${Math.max(44, Math.min(textInput.scrollHeight, maxPx))}px`;
    };

    textInput.addEventListener('input', () => {
        mutateItem((target) => {
            target.text = textInput.value;
        }, { skipRender: true });
        syncHeight();
    });

    textInput.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            event.preventDefault();
            finish({ commit: false });
            return;
        }
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            finish({ commit: true });
        }
    });

    const actions = document.createElement('div');
    actions.className = 'mdplain-mini-actions';

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'btn btn-ghost btn-small';
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('mousedown', (event) => event.preventDefault());
    delBtn.addEventListener('click', () => {
        if (!window.confirm('Delete this list item?')) return;
        finish({ deleted: true });
    });

    const doneBtn = document.createElement('button');
    doneBtn.type = 'button';
    doneBtn.className = 'btn btn-primary btn-small';
    doneBtn.textContent = 'Done';
    doneBtn.addEventListener('mousedown', (event) => event.preventDefault());
    doneBtn.addEventListener('click', () => finish({ commit: true }));

    actions.append(delBtn, doneBtn);
    editor.append(textInput, actions);
    li.appendChild(editor);

    function onOutsidePointerDown(event) {
        if (li.contains(/** @type {Node} */ (event.target))) return;
        finish({ commit: true });
    }

    function onDocKeyDown(event) {
        if (event.key === 'Escape' && !closed) {
            event.preventDefault();
            finish({ commit: false });
        }
    }

    // Defer so the long-press pointerup / click does not immediately close.
    requestAnimationFrame(() => {
        if (closed) return;
        document.addEventListener('pointerdown', onOutsidePointerDown, true);
        document.addEventListener('keydown', onDocKeyDown, true);
        syncHeight();
        textInput.focus();
        textInput.select();
    });
}

/**
 * @param {object} block
 * @param {{ onItemLongPress?: (item: object, li: HTMLElement) => void }} [options]
 */
function renderPlainListViewItems(block, options = {}) {
    const { onItemLongPress } = options;
    const tag = block.ordered ? 'ol' : 'ul';
    const listEl = document.createElement(tag);
    listEl.className = 'mdplain-view-items';
    if (block.task) listEl.classList.add('mdplain-view-items--task');
    listEl.setAttribute('role', 'list');
    listEl.title = typeof onItemLongPress === 'function' ? 'Long-press an item to edit' : '';

    const items = block.items || [];
    if (!items.length) {
        const empty = document.createElement('li');
        empty.className = 'mdlist-empty-item';
        empty.textContent = 'No items yet.';
        listEl.appendChild(empty);
        return listEl;
    }

    for (const item of items) {
        const li = document.createElement('li');
        li.className = 'mdplain-view-item';
        li.dataset.plainItemId = item.id;
        li.setAttribute('role', 'listitem');
        if (typeof onItemLongPress === 'function') {
            li.title = 'Long-press to edit this item';
            attachLongPress(li, () => onItemLongPress(item, li));
        }

        if (item.checked === true || item.checked === false) {
            const label = document.createElement('label');
            label.className = 'mdplain-task-label';
            const box = document.createElement('input');
            box.type = 'checkbox';
            box.disabled = true;
            box.checked = Boolean(item.checked);
            const span = document.createElement('span');
            span.textContent = item.text || 'Untitled item';
            label.append(box, span);
            li.appendChild(label);
        } else {
            const text = document.createElement('span');
            text.className = 'mdplain-view-text';
            text.textContent = item.text || 'Untitled item';
            li.appendChild(text);
        }
        listEl.appendChild(li);
    }

    return listEl;
}

function renderPlainItemRow({ item, index, block, total, onMutate }) {
    const li = document.createElement('li');
    li.className = 'mdlist-item mdplain-item';
    li.dataset.plainItemId = item.id;
    li.setAttribute('role', 'listitem');

    const rank = document.createElement('span');
    rank.className = 'mdlist-rank';
    rank.textContent = `#${index + 1}`;
    rank.setAttribute('aria-hidden', 'true');

    const handle = document.createElement('button');
    handle.type = 'button';
    handle.className = 'mdlist-handle';
    handle.textContent = '⋮⋮';
    handle.setAttribute('aria-label', 'Drag to reorder');

    attachPointerDrag(handle, li, {
        onDropIndex: (newIndex) => {
            onMutate((listBlock) => {
                const from = (listBlock.items || []).findIndex((it) => it.id === item.id);
                if (from < 0) return;
                listBlock.items = movePlainListItem(listBlock.items, from, newIndex);
            });
        },
    });

    const body = document.createElement('div');
    body.className = 'mdlist-item-body';

    if (item.checked === true || item.checked === false || block.task) {
        const checkRow = document.createElement('label');
        checkRow.className = 'mdplain-check-row';
        const check = document.createElement('input');
        check.type = 'checkbox';
        check.className = 'mdplain-check';
        check.checked = Boolean(item.checked);
        check.setAttribute('aria-label', 'Completed');
        check.addEventListener('change', () => {
            onMutate((listBlock) => {
                const target = (listBlock.items || []).find((it) => it.id === item.id);
                if (target) target.checked = check.checked;
                listBlock.task = true;
            }, { skipRender: true });
        });
        checkRow.appendChild(check);
        const checkLabel = document.createElement('span');
        checkLabel.textContent = 'Done';
        checkRow.appendChild(checkLabel);
        body.appendChild(checkRow);
    }

    const textInput = document.createElement('textarea');
    textInput.rows = 1;
    textInput.className = 'mdlist-text';
    textInput.value = item.text || '';
    textInput.placeholder = 'Item text';
    textInput.setAttribute('aria-label', 'Item text');

    const syncTextHeight = () => {
        const expanded = document.activeElement === textInput;
        textInput.classList.toggle('is-expanded', expanded);
        if (!expanded) {
            textInput.style.removeProperty('height');
            return;
        }
        textInput.style.height = '0px';
        const maxPx = Math.round(window.innerHeight * 0.45);
        const next = Math.max(44, Math.min(textInput.scrollHeight, maxPx));
        textInput.style.height = `${next}px`;
    };

    textInput.addEventListener('focus', () => {
        requestAnimationFrame(syncTextHeight);
    });
    textInput.addEventListener('input', () => {
        onMutate((listBlock) => {
            const target = (listBlock.items || []).find((it) => it.id === item.id);
            if (target) target.text = textInput.value;
        }, { skipRender: true });
        syncTextHeight();
    });
    textInput.addEventListener('blur', syncTextHeight);
    textInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            const newId = createId('pli');
            onMutate((listBlock) => {
                const from = (listBlock.items || []).findIndex((it) => it.id === item.id);
                const sample = listBlock.items[from] || listBlock.items[0];
                const nextItem = {
                    id: newId,
                    text: '',
                    checked: listBlock.task ? false : null,
                    marker: sample?.marker || (listBlock.ordered ? '1.' : '-'),
                    indent: sample?.indent || '',
                };
                const at = from >= 0 ? from + 1 : listBlock.items.length;
                listBlock.items.splice(at, 0, nextItem);
            }, { focusPlainItemId: newId });
        }
    });

    const moveRow = document.createElement('div');
    moveRow.className = 'mdlist-move';

    const upBtn = document.createElement('button');
    upBtn.type = 'button';
    upBtn.className = 'mdlist-move-btn';
    upBtn.setAttribute('aria-label', 'Move up');
    upBtn.title = 'Move up';
    upBtn.innerHTML = '<span class="mdlist-arrow mdlist-arrow--up" aria-hidden="true"></span>';
    upBtn.disabled = index === 0;
    upBtn.addEventListener('click', () => {
        onMutate((listBlock) => {
            const from = (listBlock.items || []).findIndex((it) => it.id === item.id);
            if (from > 0) listBlock.items = movePlainListItem(listBlock.items, from, from - 1);
        });
    });

    const downBtn = document.createElement('button');
    downBtn.type = 'button';
    downBtn.className = 'mdlist-move-btn';
    downBtn.setAttribute('aria-label', 'Move down');
    downBtn.title = 'Move down';
    downBtn.innerHTML = '<span class="mdlist-arrow mdlist-arrow--down" aria-hidden="true"></span>';
    downBtn.disabled = index >= total - 1;
    downBtn.addEventListener('click', () => {
        onMutate((listBlock) => {
            const from = (listBlock.items || []).findIndex((it) => it.id === item.id);
            if (from >= 0 && from < listBlock.items.length - 1) {
                listBlock.items = movePlainListItem(listBlock.items, from, from + 1);
            }
        });
    });

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'btn btn-ghost btn-small mdlist-delete';
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', () => {
        if (!window.confirm('Delete this list item?')) return;
        onMutate((listBlock) => {
            listBlock.items = (listBlock.items || []).filter((it) => it.id !== item.id);
        });
    });

    moveRow.append(upBtn, downBtn, delBtn);
    body.append(textInput, moveRow);
    li.append(rank, handle, body);
    return li;
}

function assignHeadingTocIds(previewEl, segIndex) {
    if (!previewEl) return;
    const headings = previewEl.querySelectorAll(':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6');
    headings.forEach((heading) => {
        const line = heading.getAttribute('data-md-line');
        if (!line) return;
        heading.id = `toc-s${segIndex}-l${line}`;
    });
}

function focusItem(root, focusItemId) {
    if (!focusItemId) return;
    requestAnimationFrame(() => {
        const input = root.querySelector(`[data-item-id="${CSS.escape(focusItemId)}"] .mdlist-text`);
        if (input) {
            input.focus();
            input.select();
        }
    });
}

function focusPlainItem(root, focusPlainItemId) {
    if (!focusPlainItemId) return;
    requestAnimationFrame(() => {
        const input = root.querySelector(
            `[data-plain-item-id="${CSS.escape(focusPlainItemId)}"] .mdlist-text`
        );
        if (input) {
            input.focus();
            input.select();
        }
    });
}

function ensureEditingForFocus(doc, focusItemId) {
    if (!focusItemId) return;
    for (const seg of doc.segments || []) {
        if (seg.type !== 'mdlist' || !seg.list) continue;
        if ((seg.list.items || []).some((item) => item.id === focusItemId)) {
            seg._editing = true;
            return;
        }
    }
}

function changeOpts(doc, extra = {}) {
    return {
        tagFilters: collectTagFilters(doc),
        editingListIds: collectEditingLists(doc),
        editingPlainLists: collectEditingPlainLists(doc),
        ...extra,
    };
}

function createAgentNoteDisclosure(listId) {
    const details = document.createElement('details');
    details.className = 'mdlist-agent-note';
    if (listId && expandedAgentNotes.has(listId)) {
        details.open = true;
    }
    details.addEventListener('toggle', () => {
        if (!listId) return;
        if (details.open) expandedAgentNotes.add(listId);
        else expandedAgentNotes.delete(listId);
    });

    const summary = document.createElement('summary');
    summary.className = 'mdlist-agent-note-summary';
    summary.textContent = 'LLM note';

    const body = document.createElement('p');
    body.className = 'mdlist-agent-note-body';
    body.textContent = mdlistAgentNotePlain();

    details.append(summary, body);
    return details;
}

function renderListStack(seg, doc, onChange, onStatus, focusItemId) {
    const stack = document.createElement('div');
    stack.className = 'mdlist-stack';
    stack.appendChild(createAgentNoteDisclosure(seg.list?.id || null));
    stack.appendChild(renderListBlock(seg, doc, onChange, onStatus, focusItemId));
    return stack;
}

function renderListBlock(seg, doc, onChange, onStatus, focusItemId) {
    const list = seg.list;
    const editing = Boolean(seg._editing);
    const wrap = document.createElement('section');
    wrap.className = editing ? 'mdlist-block mdlist-block--editing' : 'mdlist-block mdlist-block--view';
    wrap.dataset.listId = list.id;

    if (!editing) {
        wrap.appendChild(renderListViewHeader(seg, doc, onChange));
        wrap.appendChild(renderListViewItems(list));
        return wrap;
    }

    const header = document.createElement('div');
    header.className = 'mdlist-header';

    const titleRow = document.createElement('div');
    titleRow.className = 'mdlist-title-row';

    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.className = 'mdlist-title-input';
    titleInput.value = list.title || '';
    titleInput.placeholder = 'List title';
    titleInput.setAttribute('aria-label', 'List title');
    titleInput.addEventListener('change', () => {
        setListTitle(list, titleInput.value);
        onChange(doc, changeOpts(doc, { skipRender: true }));
    });

    const count = document.createElement('span');
    count.className = 'mdlist-count';
    const n = (list.items || []).length;
    count.textContent = `${n} item${n === 1 ? '' : 's'}`;

    const doneBtn = document.createElement('button');
    doneBtn.type = 'button';
    doneBtn.className = 'btn btn-ghost btn-small';
    doneBtn.textContent = 'Done';
    doneBtn.setAttribute('aria-label', 'Done editing list');
    doneBtn.addEventListener('click', () => {
        seg._editing = false;
        onChange(doc, changeOpts(doc, { soft: true }));
    });

    titleRow.append(titleInput, count, doneBtn);
    header.appendChild(titleRow);

    const filterRow = document.createElement('div');
    filterRow.className = 'mdlist-filter';

    const filterLabel = document.createElement('label');
    filterLabel.className = 'mdlist-filter-label';
    filterLabel.textContent = 'Filter tag';

    const filterSelect = document.createElement('select');
    filterSelect.className = 'mdlist-filter-select';
    filterSelect.setAttribute('aria-label', 'Filter by tag');
    const allOpt = document.createElement('option');
    allOpt.value = '';
    allOpt.textContent = 'All tags';
    filterSelect.appendChild(allOpt);
    for (const tag of collectAllTags(list)) {
        const opt = document.createElement('option');
        opt.value = tag;
        opt.textContent = tag;
        filterSelect.appendChild(opt);
    }
    if (seg._tagFilter) filterSelect.value = seg._tagFilter;

    filterSelect.addEventListener('change', () => {
        seg._tagFilter = filterSelect.value || '';
        onChange(doc, changeOpts(doc, { soft: true }));
    });

    filterLabel.appendChild(filterSelect);
    filterRow.appendChild(filterLabel);

    if (seg._tagFilter) {
        const clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.className = 'btn btn-ghost btn-small';
        clearBtn.textContent = 'Clear filter';
        clearBtn.addEventListener('click', () => {
            seg._tagFilter = '';
            onChange(doc, changeOpts(doc, { soft: true }));
        });
        filterRow.appendChild(clearBtn);
    }

    header.appendChild(filterRow);
    wrap.appendChild(header);

    const tagFilter = seg._tagFilter || '';
    const dragEnabled = !tagFilter;
    const visible = filterItemsByTag(list.items || [], tagFilter);

    if (tagFilter) {
        const note = document.createElement('p');
        note.className = 'mdlist-filter-note';
        note.textContent = 'Reordering is paused while a tag filter is active.';
        wrap.appendChild(note);
    }

    const ul = document.createElement('ul');
    ul.className = 'mdlist-items';
    ul.setAttribute('role', 'list');

    if (!visible.length) {
        const empty = document.createElement('li');
        empty.className = 'mdlist-empty-item';
        empty.textContent = tagFilter ? 'No items match this tag.' : 'No items yet.';
        ul.appendChild(empty);
    }

    visible.forEach((item, index) => {
        ul.appendChild(
            renderItemRow({
                item,
                index,
                list,
                dragEnabled,
                totalVisible: visible.length,
                onMutate: (mutator, opts = {}) => {
                    mutator();
                    onChange(doc, changeOpts(doc, opts));
                },
                onStatus,
                preferFocus: focusItemId === item.id,
            })
        );
    });

    wrap.appendChild(ul);

    const actions = document.createElement('div');
    actions.className = 'mdlist-actions';
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'btn btn-primary';
    addBtn.textContent = '+ Item';
    addBtn.addEventListener('click', () => {
        const item = addItem(list, '');
        onChange(doc, changeOpts(doc, { focusItemId: item.id }));
    });

    const deleteListBtn = document.createElement('button');
    deleteListBtn.type = 'button';
    deleteListBtn.className = 'btn btn-ghost btn-small mdlist-delete-list';
    deleteListBtn.textContent = 'Delete list';
    deleteListBtn.addEventListener('click', () => {
        requestDeleteList(seg, doc, onChange, onStatus);
    });

    actions.append(addBtn, deleteListBtn);
    wrap.appendChild(actions);

    return wrap;
}

async function requestDeleteList(seg, doc, onChange, onStatus) {
    const list = seg?.list;
    if (!list) return;
    const ok = await confirmDeleteList(list.title || 'Untitled list');
    if (!ok) return;
    const listId = list.id;
    if (!deleteListFromDocument(doc, listId)) {
        onStatus?.('Could not delete list', 'error');
        return;
    }
    onChange(doc, changeOpts(doc, { placingList: false }));
    onStatus?.('List deleted', 'ok');
}

function renderListViewHeader(seg, doc, onChange) {
    const list = seg.list;
    const header = document.createElement('div');
    header.className = 'mdlist-header';

    const titleRow = document.createElement('div');
    titleRow.className = 'mdlist-title-row';

    const title = document.createElement('h3');
    title.className = 'mdlist-title';
    title.textContent = list.title || 'Untitled list';

    const count = document.createElement('span');
    count.className = 'mdlist-count';
    const n = (list.items || []).length;
    count.textContent = `${n} item${n === 1 ? '' : 's'}`;

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'mdlist-edit-btn';
    editBtn.setAttribute('aria-label', 'Edit list');
    editBtn.title = 'Edit list';
    editBtn.innerHTML =
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 20h4.5L19 9.5 14.5 5 4 15.5V20z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M13.2 6.3l4.5 4.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
    editBtn.addEventListener('click', () => {
        seg._editing = true;
        onChange(doc, changeOpts(doc, { soft: true }));
    });

    titleRow.append(title, count, editBtn);
    header.appendChild(titleRow);
    return header;
}

function renderListViewItems(list) {
    const ul = document.createElement('ul');
    ul.className = 'mdlist-items mdlist-items--view';
    ul.setAttribute('role', 'list');

    const items = list.items || [];
    if (!items.length) {
        const empty = document.createElement('li');
        empty.className = 'mdlist-empty-item';
        empty.textContent = 'No items yet.';
        ul.appendChild(empty);
        return ul;
    }

    items.forEach((item, index) => {
        const li = document.createElement('li');
        li.className = 'mdlist-view-item';
        li.setAttribute('role', 'listitem');

        const rank = document.createElement('span');
        rank.className = 'mdlist-rank';
        rank.textContent = `#${index + 1}`;

        const body = document.createElement('div');
        body.className = 'mdlist-view-body';

        const text = document.createElement('span');
        text.className = 'mdlist-view-text';
        text.textContent = item.text || 'Untitled item';

        body.appendChild(text);

        const tags = Array.isArray(item.tags) ? item.tags.filter(Boolean) : [];
        if (tags.length) {
            const tagsEl = document.createElement('span');
            tagsEl.className = 'mdlist-view-tags';
            tagsEl.textContent = tags.join(' · ');
            body.appendChild(tagsEl);
        }

        li.append(rank, body);
        ul.appendChild(li);
    });

    return ul;
}

function collectTagFilters(doc) {
    const map = {};
    for (const seg of doc.segments || []) {
        if (seg.type === 'mdlist' && seg.list && seg._tagFilter) {
            map[seg.list.id] = seg._tagFilter;
        }
    }
    return map;
}

function collectEditingLists(doc) {
    const map = {};
    for (const seg of doc.segments || []) {
        if (seg.type === 'mdlist' && seg.list && seg._editing) {
            map[seg.list.id] = true;
        }
    }
    return map;
}

function collectEditingPlainLists(doc) {
    const map = {};
    (doc.segments || []).forEach((seg, segIndex) => {
        if (seg.type !== 'markdown' || !seg._editingPlainLists) return;
        for (const [listIndex, on] of Object.entries(seg._editingPlainLists)) {
            if (on) map[`${segIndex}:${listIndex}`] = true;
        }
    });
    return map;
}

/**
 * Re-apply tag filters onto freshly parsed segments.
 */
export function applyTagFilters(doc, tagFilters = {}) {
    if (!tagFilters) return;
    for (const seg of doc.segments || []) {
        if (seg.type === 'mdlist' && seg.list && tagFilters[seg.list.id]) {
            seg._tagFilter = tagFilters[seg.list.id];
        }
    }
}

/**
 * Re-apply which lists are in edit mode onto freshly parsed segments.
 */
export function applyEditingLists(doc, editingListIds = {}) {
    if (!editingListIds) return;
    for (const seg of doc.segments || []) {
        if (seg.type === 'mdlist' && seg.list && editingListIds[seg.list.id]) {
            seg._editing = true;
        }
    }
}

/**
 * Re-apply which plain markdown lists are in edit mode.
 * Keys are `${segmentIndex}:${plainListIndex}`.
 */
export function applyEditingPlainLists(doc, editingPlainLists = {}) {
    if (!editingPlainLists) return;
    for (const [key, on] of Object.entries(editingPlainLists)) {
        if (!on) continue;
        const [segPart, listPart] = String(key).split(':');
        const segIndex = Number(segPart);
        const listIndex = Number(listPart);
        if (!Number.isInteger(segIndex) || !Number.isInteger(listIndex)) continue;
        const seg = doc.segments?.[segIndex];
        if (!seg || seg.type !== 'markdown') continue;
        if (!seg._editingPlainLists) seg._editingPlainLists = {};
        seg._editingPlainLists[listIndex] = true;
    }
}

function renderItemRow({ item, index, list, dragEnabled, totalVisible, onMutate, onStatus }) {
    const li = document.createElement('li');
    li.className = 'mdlist-item';
    li.dataset.itemId = item.id;
    li.setAttribute('role', 'listitem');

    const rank = document.createElement('span');
    rank.className = 'mdlist-rank';
    rank.textContent = `#${index + 1}`;
    rank.setAttribute('aria-hidden', 'true');

    const handle = document.createElement('button');
    handle.type = 'button';
    handle.className = 'mdlist-handle';
    handle.textContent = '⋮⋮';
    handle.setAttribute('aria-label', 'Drag to reorder');
    handle.disabled = !dragEnabled;
    if (!dragEnabled) handle.title = 'Clear tag filter to reorder';

    if (dragEnabled) {
        attachPointerDrag(handle, li, {
            onDropIndex: (newIndex) => {
                onMutate(() => {
                    list.items = moveItemToIndex(list.items || [], item.id, newIndex);
                });
            },
        });
    }

    const body = document.createElement('div');
    body.className = 'mdlist-item-body';

    const textInput = document.createElement('textarea');
    textInput.rows = 1;
    textInput.className = 'mdlist-text';
    textInput.value = item.text || '';
    textInput.placeholder = 'Item text';
    textInput.setAttribute('aria-label', 'Item text');

    const syncTextHeight = () => {
        const expanded = document.activeElement === textInput;
        textInput.classList.toggle('is-expanded', expanded);
        if (!expanded) {
            textInput.style.removeProperty('height');
            return;
        }
        textInput.style.height = '0px';
        const maxPx = Math.round(window.innerHeight * 0.45);
        const next = Math.max(44, Math.min(textInput.scrollHeight, maxPx));
        textInput.style.height = `${next}px`;
    };

    textInput.addEventListener('focus', () => {
        requestAnimationFrame(syncTextHeight);
    });
    textInput.addEventListener('input', () => {
        onMutate(() => setItemText(list, item.id, textInput.value), { skipRender: true });
        syncTextHeight();
    });
    textInput.addEventListener('blur', syncTextHeight);
    textInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            const created = addItem(list, '');
            onMutate(() => {}, { focusItemId: created.id });
        }
    });

    const meta = document.createElement('div');
    meta.className = 'mdlist-item-meta';

    const scoreLabel = document.createElement('label');
    scoreLabel.className = 'mdlist-score-label';
    scoreLabel.textContent = 'Score';
    const scoreInput = document.createElement('input');
    scoreInput.type = 'number';
    scoreInput.className = 'mdlist-score';
    scoreInput.step = 'any';
    scoreInput.value = item.score ?? '';
    scoreInput.setAttribute('aria-label', 'Score');
    scoreInput.addEventListener('change', () => {
        const raw = scoreInput.value.trim();
        const result = setItemScore(list, item.id, raw === '' ? null : raw);
        if (!result.ok) {
            if (onStatus) onStatus(result.error, 'error');
            scoreInput.value = item.score ?? '';
            return;
        }
        onMutate(() => {});
    });
    scoreLabel.appendChild(scoreInput);

    const tagsLabel = document.createElement('label');
    tagsLabel.className = 'mdlist-tags-label';
    tagsLabel.textContent = 'Tags';
    const tagsInput = document.createElement('input');
    tagsInput.type = 'text';
    tagsInput.className = 'mdlist-tags';
    tagsInput.placeholder = 'comma, separated';
    tagsInput.value = formatTagsInput(item.tags);
    tagsInput.setAttribute('aria-label', 'Tags');
    tagsInput.addEventListener('change', () => {
        onMutate(() => setItemTags(list, item.id, parseTagsInput(tagsInput.value)), {
            skipRender: true,
        });
    });
    tagsLabel.appendChild(tagsInput);

    meta.append(scoreLabel, tagsLabel);

    const moveRow = document.createElement('div');
    moveRow.className = 'mdlist-move';

    const upBtn = document.createElement('button');
    upBtn.type = 'button';
    upBtn.className = 'mdlist-move-btn';
    upBtn.setAttribute('aria-label', 'Move up');
    upBtn.title = 'Move up';
    upBtn.innerHTML = '<span class="mdlist-arrow mdlist-arrow--up" aria-hidden="true"></span>';
    upBtn.disabled = !dragEnabled || index === 0;
    upBtn.addEventListener('click', () => {
        onMutate(() => {
            list.items = moveItemByDelta(list.items || [], item.id, -1);
        });
    });

    const downBtn = document.createElement('button');
    downBtn.type = 'button';
    downBtn.className = 'mdlist-move-btn';
    downBtn.setAttribute('aria-label', 'Move down');
    downBtn.title = 'Move down';
    downBtn.innerHTML = '<span class="mdlist-arrow mdlist-arrow--down" aria-hidden="true"></span>';
    downBtn.disabled = !dragEnabled || index >= totalVisible - 1;
    downBtn.addEventListener('click', () => {
        onMutate(() => {
            list.items = moveItemByDelta(list.items || [], item.id, 1);
        });
    });

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'btn btn-ghost btn-small mdlist-delete';
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', () => {
        if (!window.confirm('Delete this list item?')) return;
        onMutate(() => deleteItem(list, item.id));
    });

    moveRow.append(upBtn, downBtn, delBtn);
    body.append(textInput, meta, moveRow);
    li.append(rank, handle, body);
    return li;
}

function attachPointerDrag(handle, row, { onDropIndex }) {
    let startY = 0;
    let dragging = false;
    let pointerId = null;

    const onPointerDown = (event) => {
        if (event.button != null && event.button !== 0) return;
        dragging = true;
        pointerId = event.pointerId;
        startY = event.clientY;
        handle.setPointerCapture(pointerId);
        row.classList.add('is-dragging');
        event.preventDefault();
    };

    const onPointerMove = (event) => {
        if (!dragging || event.pointerId !== pointerId) return;
        const dy = event.clientY - startY;
        row.style.transform = `translateY(${dy}px)`;
    };

    const onPointerUp = (event) => {
        if (!dragging || event.pointerId !== pointerId) return;
        dragging = false;
        row.classList.remove('is-dragging');
        row.style.transform = '';
        try {
            handle.releasePointerCapture(pointerId);
        } catch {
            // ignore
        }
        pointerId = null;

        const listEl = row.parentElement;
        if (!listEl) return;
        const siblings = [...listEl.querySelectorAll(':scope > .mdlist-item')];
        const y = event.clientY;
        let newIndex = siblings.length - 1;
        for (let i = 0; i < siblings.length; i += 1) {
            const rect = siblings[i].getBoundingClientRect();
            const mid = rect.top + rect.height / 2;
            if (y < mid) {
                newIndex = i;
                break;
            }
        }
        const fromIndex = siblings.indexOf(row);
        if (fromIndex < 0) return;
        if (newIndex !== fromIndex) onDropIndex(newIndex);
    };

    handle.addEventListener('pointerdown', onPointerDown);
    handle.addEventListener('pointermove', onPointerMove);
    handle.addEventListener('pointerup', onPointerUp);
    handle.addEventListener('pointercancel', onPointerUp);
}
