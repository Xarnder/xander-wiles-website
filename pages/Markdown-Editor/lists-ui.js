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
    sortItemsByScore,
    stripMdlistAgentNotes,
} from './lists.js';
import {
    extractMarkdownHeadings,
    joinMarkdownBlocks,
    movePlainListItem,
    PLAIN_LIST_MAX_DEPTH,
    plainListDepthFromIndent,
    plainListIndentForDepth,
    plainListInsertIndexAfterSubtree,
    plainListOrderedDisplayNumber,
    renderInline,
    renderMarkdown,
    setPlainListItemDepth,
    splitMarkdownBlocks,
} from './markdown.js';
import {
    commitMiniEditListItemText,
    extractDateTag,
    focusItemTextInput,
    formatDateTagLabel,
    formatDateTagsForPlainText,
    listItemBodyForEdit,
    previewMiniEditDateTag,
    readShowDatesEnabled,
    stampNewItemText,
} from './dates.js';
import { confirmDeleteList, confirmDeleteListItem, showEditorToast } from './ui.js';
import {
    DOUBLE_TAP_COPY_DEFAULT,
    DOUBLE_TAP_COPY_KEY,
    PREVIEW_TOC_OPEN_DEFAULT,
    PREVIEW_TOC_OPEN_KEY,
    PREVIEW_TOC_STICKY_DEFAULT,
    PREVIEW_TOC_STICKY_KEY,
} from './config.js';
import { notifySettingsDirty } from './settings-sync.js';

/** Persist which LLM-note disclosures are expanded across list re-renders. */
const expandedAgentNotes = new Set();

/** Active plain-list single-item mini editor closer (preview). */
let closeActivePlainMiniEditor = null;

const DOUBLE_TAP_MS = 320;
const DOUBLE_TAP_MOVE_PX = 14;

export function readDoubleTapCopyEnabled() {
    try {
        const raw = localStorage.getItem(DOUBLE_TAP_COPY_KEY);
        if (raw === '0') return false;
        if (raw === '1') return true;
    } catch {
        // ignore
    }
    return DOUBLE_TAP_COPY_DEFAULT;
}

/**
 * @param {boolean} enabled
 * @returns {boolean}
 */
export function writeDoubleTapCopyEnabled(enabled) {
    const next = Boolean(enabled);
    try {
        localStorage.setItem(DOUBLE_TAP_COPY_KEY, next ? '1' : '0');
    } catch {
        // ignore
    }
    notifySettingsDirty();
    return next;
}

/**
 * @param {string} text
 * @returns {Promise<boolean>}
 */
async function copyTextToClipboard(text) {
    const value = String(text ?? '');
    if (!value) return false;
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(value);
            return true;
        }
    } catch {
        // fall through
    }
    try {
        const ta = document.createElement('textarea');
        ta.value = value;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.top = '-9999px';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        return ok;
    } catch {
        return false;
    }
}

/**
 * Toast feedback for clipboard copy (list / item).
 * @param {string} message
 * @param {'' | 'ok' | 'warn' | 'error'} [kind]
 */
function toastCopyFeedback(message, kind = 'ok') {
    showEditorToast(message, kind, {
        key: `copy:${kind}:${message}`,
        durationMs: kind === 'error' ? 2800 : 1800,
    });
}

/**
 * @param {string} text
 * @param {(msg: string, kind?: string) => void} [_onStatus] unused; toast is the feedback channel
 * @param {string} [okMessage]
 */
async function copyWithStatus(text, _onStatus, okMessage = 'Copied') {
    const ok = await copyTextToClipboard(text);
    toastCopyFeedback(ok ? okMessage : 'Couldn’t copy to clipboard', ok ? 'ok' : 'error');
    return ok;
}

function formatMdlistItemClipboard(item) {
    const text = String(item?.text || '').trim();
    const tags = Array.isArray(item?.tags) ? item.tags.filter(Boolean) : [];
    if (!tags.length) return text;
    return text ? `${text} (${tags.join(', ')})` : tags.join(', ');
}

function formatMdlistClipboard(list) {
    const title = String(list?.title || 'Untitled list').trim() || 'Untitled list';
    const lines = (list?.items || []).map((item, index) => {
        const body = formatMdlistItemClipboard(item) || 'Untitled item';
        return `${index + 1}. ${body}`;
    });
    return [title, ...lines].join('\n');
}

function formatPlainItemClipboard(item, block) {
    const text = String(item?.text || '').trim();
    const isTask =
        Boolean(block?.task) || item?.checked === true || item?.checked === false;
    if (isTask) {
        return `${item?.checked ? '[x]' : '[ ]'} ${text}`.trim();
    }
    return text;
}

function formatPlainListClipboard(block) {
    const items = block?.items || [];
    return items
        .map((item, index) => {
            const text = String(item?.text || '').trim() || 'Untitled item';
            if (block.task || item?.checked === true || item?.checked === false) {
                return `- [${item?.checked ? 'x' : ' '}] ${text}`;
            }
            if (block.ordered) return `${index + 1}. ${text}`;
            return `- ${text}`;
        })
        .join('\n');
}

function createListAddItemButton({ position = 'bottom' } = {}) {
    const atTop = position === 'top';
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = `mdlist-add-btn mdlist-add-btn--${atTop ? 'top' : 'bottom'}`;
    addBtn.setAttribute('aria-label', atTop ? 'Add item at top' : 'Add item at bottom');
    addBtn.title = atTop ? 'Add item at top' : 'Add item at bottom';
    const addIcon = document.createElement('span');
    addIcon.className = 'mdlist-add-btn-icon';
    addIcon.setAttribute('aria-hidden', 'true');
    const arrowIcon = document.createElement('span');
    arrowIcon.className = `mdlist-add-btn-arrow mdlist-add-btn-arrow--${atTop ? 'up' : 'down'}`;
    arrowIcon.setAttribute('aria-hidden', 'true');
    addBtn.append(addIcon, arrowIcon);
    return addBtn;
}

function createBlankPlainListItem(listBlock) {
    const sample = listBlock.items?.[0];
    return {
        id: createId('pli'),
        text: stampNewItemText(''),
        checked: listBlock.task ? false : null,
        marker: sample?.marker || (listBlock.ordered ? '1.' : '-'),
        indent: plainListIndentForDepth(plainListDepthFromIndent(sample?.indent || '')),
    };
}

/**
 * Ensure a plain-list item has a `{{date:…}}` tag (same as new top-level items).
 * Idempotent when a tag is already present.
 * @param {{ text?: string }} item
 */
function ensurePlainItemDateTag(item) {
    if (!item || typeof item !== 'object') return;
    item.text = stampNewItemText(item.text || '');
}

function createListCopyButton({ label = 'Copy list', title = 'Copy list' } = {}) {
    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'mdlist-copy-btn';
    copyBtn.setAttribute('aria-label', label);
    copyBtn.title = title;
    const icon = document.createElement('span');
    icon.className = 'mdlist-copy-btn-icon';
    icon.setAttribute('aria-hidden', 'true');
    copyBtn.appendChild(icon);
    return copyBtn;
}

/**
 * @param {{ active?: boolean }} [options]
 */
function createListReorderButton({ active = false } = {}) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `mdlist-reorder-btn${active ? ' is-active' : ''}`;
    btn.setAttribute('aria-label', active ? 'Done reordering' : 'Reorder mode');
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    btn.title = active ? 'Done reordering' : 'Reorder items';
    btn.textContent = active ? 'Done' : 'Reorder';
    return btn;
}

/**
 * One-line plain label for reorder rows (strip markdown + date tags).
 * @param {string} text
 */
function listItemPlainLabel(text) {
    let s = formatDateTagsForPlainText(String(text ?? ''), false);
    s = s
        .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/(\*\*|__)(.*?)\1/g, '$2')
        .replace(/(\*|_)(.*?)\1/g, '$2')
        .replace(/~~(.*?)~~/g, '$1')
        .replace(/\s+/g, ' ')
        .trim();
    return s || 'Untitled item';
}

/**
 * Double-tap (or double-click) to copy item text. Respects settings toggle.
 * @param {HTMLElement} el
 * @param {() => string} getText
 * @param {(msg: string, kind?: string) => void} [onStatus]
 */
function attachDoubleTapCopy(el, getText, onStatus) {
    let lastTapAt = 0;
    let lastX = 0;
    let lastY = 0;

    el.addEventListener('pointerup', (event) => {
        if (!readDoubleTapCopyEnabled()) return;
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        if (el.classList.contains('mdplain-view-item--mini-editing')) return;
        if (el.closest('.lists-root--click-edit, .lists-root--placing')) return;
        // Nested tree: only the nearest item owns the double-tap.
        if (event.target instanceof Element) {
            const nearest = event.target.closest('.mdplain-view-item');
            if (nearest && nearest !== el) return;
        }

        const now = Date.now();
        const dt = now - lastTapAt;
        const dx = event.clientX - lastX;
        const dy = event.clientY - lastY;
        const near =
            dx * dx + dy * dy <= DOUBLE_TAP_MOVE_PX * DOUBLE_TAP_MOVE_PX;

        if (lastTapAt && dt > 0 && dt <= DOUBLE_TAP_MS && near) {
            lastTapAt = 0;
            event.preventDefault();
            event.stopPropagation();
            const text = String(getText() || '').trim();
            if (!text) {
                toastCopyFeedback('Nothing to copy', 'warn');
                return;
            }
            copyWithStatus(text, onStatus, 'Item copied');
            return;
        }

        lastTapAt = now;
        lastX = event.clientX;
        lastY = event.clientY;
    });
}

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
 * @param {'list' | 'preview' | 'contents'} options.mode
 * @param {object} options.doc
 * @param {(doc: object, opts?: object) => void} options.onChange
 * @param {(msg: string, kind?: string) => void} [options.onStatus]
 * @param {string} [options.focusItemId]
 * @param {string} [options.focusPlainItemId]
 * @param {string} [options.openMiniPlainItemId] — after render, open mini editor for this plain item
 * @param {string} [options.focusTocId]
 * @param {boolean} [options.placingList]
 * @param {object | null} [options.pendingImportList] — when placing, insert this list instead of an empty one
 * @param {boolean} [options.clickEdit]
 * @param {(payload: { segIndex: number, localLine: number, prefix: string }) => void} [options.onEditSpot]
 * @param {(tocId: string) => void} [options.onContentsSelect]
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
        openMiniPlainItemId = null,
        focusTocId = null,
        placingList = false,
        pendingImportList = null,
        clickEdit = false,
        onEditSpot = null,
        onContentsSelect = null,
    } = options;
    const scrollTop = root.scrollTop;
    const plainListScroll = capturePlainListScroll(root);
    root.replaceChildren();
    const rootMods = [];
    if (placingList) rootMods.push('lists-root--placing');
    if (clickEdit) rootMods.push('lists-root--click-edit');
    if (mode === 'contents') rootMods.push('lists-root--contents');
    root.className = ['lists-root', ...rootMods].join(' ');
    const place = (target) => placeListAt(doc, onChange, target, pendingImportList);

    ensureEditingForFocus(doc, focusItemId);

    const validLists = (doc.segments || []).filter((s) => s.type === 'mdlist' && s.list);
    const errorLists = (doc.segments || []).filter((s) => s.type === 'mdlist' && !s.list);

    if (errorLists.length && mode !== 'contents') {
        const warn = document.createElement('p');
        warn.className = 'lists-warning';
        warn.textContent = `${errorLists.length} custom list block(s) could not be parsed. Switch to Raw to edit the markdown.`;
        root.appendChild(warn);
    }

    if (mode === 'contents') {
        root.appendChild(
            renderContentsView(doc, {
                onSelect: typeof onContentsSelect === 'function' ? onContentsSelect : null,
            })
        );
        restoreScroll(root, scrollTop, plainListScroll);
        return;
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
                    openMiniPlainItemId,
                    onStatus,
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
    }

    if (focusTocId) {
        // Prefer jump target over restoring prior Preview scroll.
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                jumpToTocTarget(root, focusTocId);
            });
        });
    } else if (openMiniPlainItemId || focusItemId || focusPlainItemId) {
        // New/focused item handlers scroll the target into view — don't snap back.
    } else {
        restoreScroll(root, scrollTop, plainListScroll);
    }
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

/**
 * Full-page Contents view (fourth editor mode).
 * @param {object} doc
 * @param {{ onSelect?: ((tocId: string) => void) | null }} [options]
 */
function renderContentsView(doc, options = {}) {
    const { onSelect = null } = options;
    const outline = buildPreviewOutline(doc);
    const wrap = document.createElement('div');
    wrap.className = 'contents-view';

    const header = document.createElement('div');
    header.className = 'contents-view-header';
    const heading = document.createElement('h2');
    heading.className = 'contents-view-title';
    heading.textContent = 'Contents';
    const meta = document.createElement('p');
    meta.className = 'contents-view-meta';
    const n = outline.length;
    meta.textContent = n
        ? `${n} section${n === 1 ? '' : 's'}`
        : 'No headings or custom lists in this file yet.';
    header.append(heading, meta);
    wrap.appendChild(header);

    if (!outline.length) {
        const empty = document.createElement('p');
        empty.className = 'contents-view-empty';
        empty.textContent = 'Add headings in Raw or Preview to build a table of contents.';
        wrap.appendChild(empty);
        return wrap;
    }

    const nav = document.createElement('nav');
    nav.className = 'contents-view-nav';
    nav.setAttribute('aria-label', 'Document contents');

    const list = document.createElement('ol');
    list.className = 'contents-view-list';

    for (const item of outline) {
        const li = document.createElement('li');
        li.className = 'contents-view-item';
        li.dataset.level = String(item.level);
        li.style.setProperty('--toc-level', String(Math.max(0, item.level - 1)));

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'contents-view-link';
        if (item.kind === 'list') btn.classList.add('contents-view-link--list');
        btn.textContent = item.title;
        btn.title =
            item.kind === 'list'
                ? `Open Preview at list: ${item.title}`
                : `Open Preview at ${item.title}`;
        btn.addEventListener('click', () => {
            if (typeof onSelect === 'function') onSelect(item.id);
        });

        li.appendChild(btn);
        list.appendChild(li);
    }

    nav.appendChild(list);
    wrap.appendChild(nav);
    return wrap;
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
    const openMiniPlainItemId = options.openMiniPlainItemId || null;
    const wrap = document.createElement('div');
    wrap.className = 'mixed-markdown-wrap';
    // Whole-section Edit lives in Raw / Edit here — never inline in Preview.
    seg._editing = false;

    const sourceText = stripMdlistAgentNotes(seg.text || '');
    if (!sourceText.trim()) {
        const preview = document.createElement('div');
        preview.className = 'md-preview md-preview--segment';
        preview.dataset.segIndex = String(segIndex);
        preview.innerHTML = '<p class="md-empty">Empty markdown section.</p>';
        wrap.appendChild(preview);
        return wrap;
    }

    if (placingList || clickEdit) {
        // Placement / click-edit need a single preview tree with data-md-line anchors
        const preview = document.createElement('div');
        preview.className = 'md-preview md-preview--segment';
        preview.dataset.segIndex = String(segIndex);
        preview.innerHTML = renderMarkdown(sourceText, {
            showDates: readShowDatesEnabled(),
        });
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
        return wrap;
    }

    const blocks = getCachedPlainBlocks(seg);
    // Prefer cached blocks when segment text still matches (edit session)
    const editingMap = seg._editingPlainLists || {};
    const reorderingMap = seg._reorderingPlainLists || {};
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
                    onStatus: options.onStatus,
                    editing: Boolean(editingMap[listIndex]),
                    reordering: Boolean(reorderingMap[listIndex]) && !editingMap[listIndex],
                    focusPlainItemId,
                    openMiniPlainItemId,
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
            showDates: readShowDatesEnabled(),
        });
        assignHeadingTocIds(preview, segIndex);
        wrap.appendChild(preview);
        renderedAny = true;
    }

    if (!renderedAny) {
        const preview = document.createElement('div');
        preview.className = 'md-preview md-preview--segment';
        preview.dataset.segIndex = String(segIndex);
        preview.innerHTML = '<p class="md-empty">Empty markdown section.</p>';
        wrap.appendChild(preview);
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

function plainListDisplayTitle(block) {
    const titled = String(block?.title || '').trim();
    return titled || plainListKindLabel(block);
}

function applyPlainListTitleEl(titleEl, block, segIndex) {
    titleEl.textContent = plainListDisplayTitle(block);
    const titleLine = Number(block?.titleLine);
    if (block?.title && Number.isFinite(titleLine) && titleLine > 0) {
        titleEl.id = `toc-s${segIndex}-l${titleLine}`;
        titleEl.dataset.mdLine = String(titleLine);
    }
}

function renderPlainListBlock({
    block,
    listIndex,
    seg,
    segIndex,
    doc,
    onChange,
    onStatus,
    editing,
    reordering = false,
    focusPlainItemId,
    openMiniPlainItemId = null,
}) {
    const wrap = document.createElement('section');
    wrap.className = editing
        ? 'mdplain-block mdplain-block--editing'
        : reordering
          ? 'mdplain-block mdplain-block--reordering'
          : 'mdplain-block mdplain-block--view';
    wrap.dataset.segIndex = String(segIndex);
    wrap.dataset.plainListIndex = String(listIndex);
    wrap.dataset.mdLine = String(block.startLine || 1);
    wrap.setAttribute('data-md-line', String(block.startLine || 1));

    if (!editing) {
        wrap.appendChild(
            renderPlainListViewHeader(block, seg, segIndex, listIndex, doc, onChange, onStatus, {
                reordering,
            })
        );
        if (reordering) {
            wrap.appendChild(
                renderPlainListReorderItems({
                    block,
                    listIndex,
                    seg,
                    segIndex,
                    doc,
                    onChange,
                })
            );
            return wrap;
        }
        const viewItems = renderPlainListViewItems(block, {
            onStatus,
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
                    onStatus,
                });
            },
        });
        wrap.appendChild(viewItems);
        if (openMiniPlainItemId) {
            const item = (block.items || []).find((it) => it.id === openMiniPlainItemId);
            const li =
                item &&
                viewItems.querySelector(
                    `[data-plain-item-id="${CSS.escape(openMiniPlainItemId)}"]`
                );
            if (item && li) {
                requestAnimationFrame(() => {
                    openPlainItemMiniEditor({
                        li,
                        item,
                        block,
                        seg,
                        segIndex,
                        listIndex,
                        doc,
                        onChange,
                        onStatus,
                    });
                });
            }
        }
        return wrap;
    }

    // Entering full edit exits reorder mode.
    if (seg._reorderingPlainLists) delete seg._reorderingPlainLists[listIndex];

    const header = document.createElement('div');
    header.className = 'mdplain-header';

    const titleRow = document.createElement('div');
    titleRow.className = 'mdlist-title-row';

    const title = document.createElement('h3');
    title.className = 'mdplain-title';
    applyPlainListTitleEl(title, block, segIndex);

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
                    text: stampNewItemText(''),
                    checked: listBlock.task ? false : null,
                    marker: sample?.marker || (listBlock.ordered ? '1.' : '-'),
                    indent: plainListIndentForDepth(plainListDepthFromIndent(sample?.indent || '')),
                });
            },
            opts: { focusPlainItemId: newId },
        });
    });
    actions.appendChild(addBtn);
    wrap.appendChild(actions);

    return wrap;
}

function renderPlainListViewHeader(
    block,
    seg,
    segIndex,
    listIndex,
    doc,
    onChange,
    onStatus,
    { reordering = false } = {}
) {
    const header = document.createElement('div');
    header.className = 'mdplain-header';

    const titleRow = document.createElement('div');
    titleRow.className = 'mdlist-title-row';

    const title = document.createElement('h3');
    title.className = 'mdplain-title';
    applyPlainListTitleEl(title, block, segIndex);

    const count = document.createElement('span');
    count.className = 'mdlist-count';
    const n = (block.items || []).length;
    count.textContent = `${n} item${n === 1 ? '' : 's'}`;

    const actions = document.createElement('div');
    actions.className = 'mdlist-header-actions';

    const reorderBtn = createListReorderButton({ active: reordering });
    reorderBtn.addEventListener('click', () => {
        if (!seg._reorderingPlainLists) seg._reorderingPlainLists = {};
        if (!seg._editingPlainLists) seg._editingPlainLists = {};
        delete seg._editingPlainLists[listIndex];
        seg._reorderingPlainLists[listIndex] = !reordering;
        onChange(
            doc,
            changeOpts(doc, {
                soft: true,
                editingPlainLists: collectEditingPlainLists(doc),
                reorderingPlainLists: collectReorderingPlainLists(doc),
            })
        );
    });

    if (reordering) {
        actions.appendChild(reorderBtn);
        titleRow.append(title, count, actions);
        header.appendChild(titleRow);
        return header;
    }

    const addTopBtn = createListAddItemButton({ position: 'top' });
    addTopBtn.addEventListener('click', () => {
        const newId = createId('pli');
        if (seg._reorderingPlainLists) delete seg._reorderingPlainLists[listIndex];
        mutatePlainListInSegment({
            seg,
            segIndex,
            listIndex,
            doc,
            onChange,
            mutator: (listBlock) => {
                if (!Array.isArray(listBlock.items)) listBlock.items = [];
                const item = createBlankPlainListItem(listBlock);
                item.id = newId;
                listBlock.items.unshift(item);
            },
            opts: { stayInView: true, openMiniPlainItemId: newId },
        });
    });

    const addBottomBtn = createListAddItemButton({ position: 'bottom' });
    addBottomBtn.addEventListener('click', () => {
        const newId = createId('pli');
        if (seg._reorderingPlainLists) delete seg._reorderingPlainLists[listIndex];
        mutatePlainListInSegment({
            seg,
            segIndex,
            listIndex,
            doc,
            onChange,
            mutator: (listBlock) => {
                if (!Array.isArray(listBlock.items)) listBlock.items = [];
                const item = createBlankPlainListItem(listBlock);
                item.id = newId;
                listBlock.items.push(item);
            },
            opts: { stayInView: true, openMiniPlainItemId: newId },
        });
    });

    const copyBtn = createListCopyButton({
        label: 'Copy list',
        title: 'Copy entire list',
    });
    copyBtn.addEventListener('click', () => {
        const text = formatPlainListClipboard(block);
        if (!text.trim()) {
            toastCopyFeedback('Nothing to copy', 'warn');
            return;
        }
        copyWithStatus(text, onStatus, 'List copied');
    });

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'mdlist-edit-btn';
    editBtn.setAttribute('aria-label', 'Edit list');
    editBtn.title = 'Edit list order and items';
    editBtn.innerHTML =
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 20h4.5L19 9.5 14.5 5 4 15.5V20z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M13.2 6.3l4.5 4.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
    editBtn.addEventListener('click', () => {
        if (seg._reorderingPlainLists) delete seg._reorderingPlainLists[listIndex];
        if (!seg._editingPlainLists) seg._editingPlainLists = {};
        seg._editingPlainLists[listIndex] = true;
        onChange(
            doc,
            changeOpts(doc, {
                soft: true,
                editingPlainLists: collectEditingPlainLists(doc),
                reorderingPlainLists: collectReorderingPlainLists(doc),
            })
        );
    });

    actions.append(addTopBtn, addBottomBtn, copyBtn, reorderBtn, editBtn);
    titleRow.append(title, count, actions);
    header.appendChild(titleRow);
    return header;
}

/**
 * Condensed one-line rows with drag handles for Reorder mode (plain lists).
 */
function renderPlainListReorderItems({ block, listIndex, seg, segIndex, doc, onChange }) {
    const ul = document.createElement('ul');
    ul.className = 'mdlist-items mdlist-items--reorder mdplain-items--reorder';
    ul.setAttribute('role', 'list');

    const items = block.items || [];
    if (!items.length) {
        const empty = document.createElement('li');
        empty.className = 'mdlist-empty-item';
        empty.textContent = 'No items yet.';
        ul.appendChild(empty);
        return ul;
    }

    items.forEach((item, index) => {
        const li = document.createElement('li');
        li.className = 'mdlist-item mdlist-reorder-item mdplain-item';
        li.dataset.plainItemId = item.id;
        const depth = plainListDepthFromIndent(item.indent);
        li.dataset.depth = String(depth);
        if (depth > 0) li.classList.add('mdplain-item--nested');
        li.setAttribute('role', 'listitem');

        const rank = document.createElement('span');
        rank.className = 'mdlist-rank';
        rank.textContent = `#${index + 1}`;
        rank.setAttribute('aria-hidden', 'true');

        const handle = document.createElement('button');
        handle.type = 'button';
        handle.className = 'mdlist-handle';
        handle.textContent = '⋮⋮';
        handle.setAttribute('aria-label', `Drag to reorder item ${index + 1}`);
        handle.title = 'Drag to reorder';

        attachPointerDrag(handle, li, {
            onDropIndex: (newIndex) => {
                mutatePlainListInSegment({
                    seg,
                    segIndex,
                    listIndex,
                    doc,
                    onChange,
                    mutator: (listBlock) => {
                        const from = (listBlock.items || []).findIndex((it) => it.id === item.id);
                        if (from < 0) return;
                        listBlock.items = movePlainListItem(listBlock.items, from, newIndex);
                    },
                    opts: { stayInView: true },
                });
            },
        });

        const text = document.createElement('span');
        text.className = 'mdlist-reorder-text';
        const label = listItemPlainLabel(item.text);
        if (block.task || item.checked === true || item.checked === false) {
            text.textContent = `${item.checked ? '☑' : '☐'} ${label}`;
        } else {
            text.textContent = label;
        }

        li.append(rank, handle, text);
        ul.appendChild(li);
    });

    return ul;
}

const PLAIN_LIST_LONG_PRESS_MS = 500;
const PLAIN_LIST_LONG_PRESS_MOVE_PX = 10;

/**
 * Long-press on an element; cancels if the pointer moves too far (scroll/drag).
 * Ignores events that belong to a nested `.mdplain-view-item` (tree layout).
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

    /** True when this `el` is the item that owns the event (not an ancestor). */
    const isOwnerItem = (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return true;
        const nearest = target.closest('.mdplain-view-item');
        return !nearest || nearest === el;
    };

    el.addEventListener('pointerdown', (event) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        if (el.classList.contains('mdplain-view-item--mini-editing')) return;
        if (!isOwnerItem(event)) return;
        // Keep ancestor items from starting their own long-press on the same gesture.
        event.stopPropagation();
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
 * Inline markdown HTML for a list-item body (dates handled separately).
 * @param {string} bodyText
 * @returns {string}
 */
function listItemInlineHtml(bodyText) {
    const body = String(bodyText ?? '').trim();
    if (!body) return '';
    return body
        .split('\n')
        .map((part) => renderInline(part, { showDates: false }))
        .join('<br>\n');
}

/**
 * Fill a list-item label node. When Show dates is on, the date is a separate
 * styled chip so it doesn’t read as normal body text. Body text uses the same
 * inline markdown as preview prose (bold, italic, links, etc.).
 * @param {HTMLElement} el
 * @param {string} text
 */
function fillListItemLabel(el, text) {
    el.replaceChildren();
    const raw = String(text ?? '');
    if (!readShowDatesEnabled()) {
        const shown = formatDateTagsForPlainText(raw, false).trim();
        if (!shown) {
            el.textContent = 'Untitled item';
            return;
        }
        el.innerHTML = listItemInlineHtml(shown);
        return;
    }
    const body = listItemBodyForEdit(raw).trim();
    const label = formatDateTagLabel(extractDateTag(raw));
    if (!body && !label) {
        el.textContent = 'Untitled item';
        return;
    }
    if (body) el.innerHTML = listItemInlineHtml(body);
    if (label) {
        if (body) el.appendChild(document.createTextNode('\u00a0'));
        const mark = document.createElement('time');
        mark.className = 'md-date-tag';
        mark.textContent = label;
        el.appendChild(mark);
    }
}

function openPlainItemMiniEditor({
    li,
    item,
    block,
    seg,
    segIndex,
    listIndex,
    doc,
    onChange,
    onStatus,
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
        const depth = plainListDepthFromIndent(item.indent);
        li.dataset.depth = String(depth);
        li.classList.toggle('mdplain-view-item--nested', depth > 0);
        // Keep nested sublists; only replace the main label row.
        const nest = li.querySelector(':scope > .mdplain-view-nest');
        li.replaceChildren();
        const main = document.createElement('div');
        main.className = 'mdplain-view-item-main';
        const viewItem = {
            ...item,
            text,
            checked: checked === true || checked === false ? checked : item.checked,
        };
        appendPlainViewItemBody(main, viewItem, block, {
            orderedNumber: plainViewOrderedNumberForItem(block, item.id),
        });
        li.appendChild(main);
        if (nest) li.appendChild(nest);
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

        const nextText = commitMiniEditListItemText(snapshot.text, textInput.value);
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
    const preservedNest = li.querySelector(':scope > .mdplain-view-nest');
    li.replaceChildren();

    const editor = document.createElement('div');
    editor.className = 'mdplain-mini-editor';
    const miniDepth = plainListDepthFromIndent(item.indent);
    if (miniDepth > 0) {
        editor.classList.add('mdplain-mini-editor--nested');
        editor.dataset.depth = String(miniDepth);
    }

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
    textInput.value = listItemBodyForEdit(item.text || '');
    textInput.placeholder = 'Item text';
    textInput.setAttribute('aria-label', 'Edit list item');
    textInput.spellcheck = true;

    const syncHeight = () => {
        textInput.style.height = '0px';
        const maxPx = Math.round(window.innerHeight * 0.35);
        textInput.style.height = `${Math.max(44, Math.min(textInput.scrollHeight, maxPx))}px`;
    };

    /** @type {HTMLElement | null} */
    let dateMeta = null;
    const showDates = readShowDatesEnabled();
    if (showDates) {
        dateMeta = document.createElement('div');
        dateMeta.className = 'mdplain-mini-date';
        dateMeta.setAttribute('aria-live', 'polite');
    }

    const syncDateMeta = () => {
        if (!dateMeta) return;
        const tag = previewMiniEditDateTag(snapshot.text, textInput.value);
        const label = formatDateTagLabel(tag);
        if (label) {
            dateMeta.hidden = false;
            dateMeta.textContent = label;
            dateMeta.title = tag || '';
        } else {
            dateMeta.hidden = true;
            dateMeta.textContent = '';
            dateMeta.removeAttribute('title');
        }
    };

    textInput.addEventListener('input', () => {
        mutateItem((target) => {
            target.text = commitMiniEditListItemText(snapshot.text, textInput.value);
        }, { skipRender: true });
        syncDateMeta();
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

    const copyBtn = createListCopyButton({
        label: 'Copy item',
        title: 'Copy this item',
    });
    copyBtn.addEventListener('mousedown', (event) => event.preventDefault());
    copyBtn.addEventListener('click', () => {
        const text = formatPlainItemClipboard(
            {
                ...item,
                text: commitMiniEditListItemText(snapshot.text, textInput.value),
                checked: checkInput
                    ? checkInput.checked
                    : item.checked === true || item.checked === false
                      ? item.checked
                      : null,
            },
            block
        );
        if (!String(text || '').trim()) {
            toastCopyFeedback('Nothing to copy', 'warn');
            return;
        }
        copyWithStatus(text, onStatus, 'Item copied');
    });

    const itemIndex = (block.items || []).findIndex((it) => it.id === item.id);
    const itemCount = (block.items || []).length;
    const atTop = itemIndex <= 0;
    const atBottom = itemIndex < 0 || itemIndex >= itemCount - 1;
    const currentDepth = plainListDepthFromIndent(item.indent);
    const canAddNested = currentDepth < PLAIN_LIST_MAX_DEPTH;
    const canIndent = currentDepth < PLAIN_LIST_MAX_DEPTH;
    const canOutdent = currentDepth > 1;

    const commitCurrentFields = (target, listBlock) => {
        target.text = commitMiniEditListItemText(snapshot.text, textInput.value);
        if (checkInput) {
            target.checked = checkInput.checked;
            listBlock.task = true;
        }
    };

    const moveToEdge = (edge) => {
        if (closed) return;
        const dest = edge === 'top' ? 0 : Math.max(0, itemCount - 1);
        if (itemIndex < 0 || itemIndex === dest) return;

        // Close this editor shell; reopen on the item after the list re-renders.
        closed = true;
        if (closeActivePlainMiniEditor === closeFn) closeActivePlainMiniEditor = null;
        cleanupOutside();

        mutatePlainListInSegment({
            seg,
            segIndex,
            listIndex,
            doc,
            onChange,
            mutator: (listBlock) => {
                const idx = (listBlock.items || []).findIndex((it) => it.id === item.id);
                if (idx < 0) return;
                const target = listBlock.items[idx];
                commitCurrentFields(target, listBlock);
                const toIndex = edge === 'top' ? 0 : listBlock.items.length - 1;
                listBlock.items = movePlainListItem(listBlock.items, idx, toIndex);
            },
            opts: { stayInView: true, openMiniPlainItemId: item.id },
        });
    };

    const changeDepth = (nextDepth) => {
        if (closed) return;
        // Outdent floor is 1; Indent may raise a top-level item to depth 1+.
        const depth = Math.max(0, Math.min(PLAIN_LIST_MAX_DEPTH, nextDepth));
        if (depth < 1 && currentDepth >= 1) return; // never promote nested → top via Outdent
        if (depth === currentDepth) return;

        closed = true;
        if (closeActivePlainMiniEditor === closeFn) closeActivePlainMiniEditor = null;
        cleanupOutside();

        mutatePlainListInSegment({
            seg,
            segIndex,
            listIndex,
            doc,
            onChange,
            mutator: (listBlock) => {
                const idx = (listBlock.items || []).findIndex((it) => it.id === item.id);
                if (idx < 0) return;
                const target = listBlock.items[idx];
                commitCurrentFields(target, listBlock);
                setPlainListItemDepth(target, depth);
                // Nesting via Indent should carry the same date-tag behavior as new items.
                if (depth > currentDepth) ensurePlainItemDateTag(target);
            },
            opts: { stayInView: true, openMiniPlainItemId: item.id },
        });
    };

    const addNestedItem = () => {
        if (closed || !canAddNested) return;
        const childDepth = Math.min(currentDepth + 1, PLAIN_LIST_MAX_DEPTH);
        const newId = createId('pli');

        closed = true;
        if (closeActivePlainMiniEditor === closeFn) closeActivePlainMiniEditor = null;
        cleanupOutside();

        mutatePlainListInSegment({
            seg,
            segIndex,
            listIndex,
            doc,
            onChange,
            mutator: (listBlock) => {
                const idx = (listBlock.items || []).findIndex((it) => it.id === item.id);
                if (idx < 0) return;
                const target = listBlock.items[idx];
                commitCurrentFields(target, listBlock);
                const insertAt = plainListInsertIndexAfterSubtree(listBlock.items, idx);
                const child = {
                    id: newId,
                    text: stampNewItemText(''),
                    checked:
                        listBlock.task || target.checked === true || target.checked === false
                            ? false
                            : null,
                    marker: target.marker && /^[-*+]$/.test(target.marker) ? target.marker : '-',
                    indent: plainListIndentForDepth(childDepth),
                };
                ensurePlainItemDateTag(child);
                listBlock.items.splice(insertAt, 0, child);
            },
            opts: { stayInView: true, openMiniPlainItemId: newId },
        });
    };

    const toTopBtn = document.createElement('button');
    toTopBtn.type = 'button';
    toTopBtn.className = 'btn btn-ghost btn-small mdplain-mini-move-btn';
    toTopBtn.textContent = 'To top';
    toTopBtn.setAttribute('aria-label', 'Move item to top of list');
    toTopBtn.title = 'Move to top';
    toTopBtn.disabled = atTop;
    toTopBtn.addEventListener('mousedown', (event) => event.preventDefault());
    toTopBtn.addEventListener('click', () => moveToEdge('top'));

    const toBottomBtn = document.createElement('button');
    toBottomBtn.type = 'button';
    toBottomBtn.className = 'btn btn-ghost btn-small mdplain-mini-move-btn';
    toBottomBtn.textContent = 'To bottom';
    toBottomBtn.setAttribute('aria-label', 'Move item to bottom of list');
    toBottomBtn.title = 'Move to bottom';
    toBottomBtn.disabled = atBottom;
    toBottomBtn.addEventListener('mousedown', (event) => event.preventDefault());
    toBottomBtn.addEventListener('click', () => moveToEdge('bottom'));

    const addNestedBtn = document.createElement('button');
    addNestedBtn.type = 'button';
    addNestedBtn.className = 'btn btn-ghost btn-small mdplain-mini-move-btn';
    addNestedBtn.textContent = 'Add nested';
    addNestedBtn.setAttribute('aria-label', 'Add a nested list item under this one');
    addNestedBtn.title = currentDepth >= PLAIN_LIST_MAX_DEPTH
        ? 'Already at max nest depth'
        : 'Add nested item';
    addNestedBtn.disabled = !canAddNested;
    addNestedBtn.addEventListener('mousedown', (event) => event.preventDefault());
    addNestedBtn.addEventListener('click', () => addNestedItem());

    const indentBtn = document.createElement('button');
    indentBtn.type = 'button';
    indentBtn.className = 'btn btn-ghost btn-small mdplain-mini-move-btn';
    indentBtn.textContent = 'Indent';
    indentBtn.setAttribute('aria-label', 'Indent item one level');
    indentBtn.title = canIndent ? 'Indent one level' : 'Already at max nest depth';
    indentBtn.disabled = !canIndent;
    indentBtn.addEventListener('mousedown', (event) => event.preventDefault());
    indentBtn.addEventListener('click', () => changeDepth(currentDepth + 1));

    const outdentBtn = document.createElement('button');
    outdentBtn.type = 'button';
    outdentBtn.className = 'btn btn-ghost btn-small mdplain-mini-move-btn';
    outdentBtn.textContent = 'Outdent';
    outdentBtn.setAttribute('aria-label', 'Outdent item one level');
    outdentBtn.title = currentDepth <= 1
        ? currentDepth === 0
            ? 'Top-level items cannot outdent'
            : 'Already at minimum nest depth'
        : 'Outdent one level';
    outdentBtn.disabled = !canOutdent;
    outdentBtn.addEventListener('mousedown', (event) => event.preventDefault());
    outdentBtn.addEventListener('click', () => changeDepth(currentDepth - 1));

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'btn btn-ghost btn-small';
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('mousedown', (event) => event.preventDefault());
    delBtn.addEventListener('click', async () => {
        const ok = await confirmDeleteListItem(textInput.value || item.text);
        if (!ok) return;
        finish({ deleted: true });
    });

    const doneBtn = document.createElement('button');
    doneBtn.type = 'button';
    doneBtn.className = 'btn btn-primary btn-small';
    doneBtn.textContent = 'Done';
    doneBtn.addEventListener('mousedown', (event) => event.preventDefault());
    doneBtn.addEventListener('click', () => finish({ commit: true }));

    const actionBtns = [copyBtn, addNestedBtn, indentBtn, outdentBtn];
    // Nested items stay under their parent — list-edge moves don’t apply.
    if (currentDepth === 0) {
        actionBtns.push(toTopBtn, toBottomBtn);
    }
    actionBtns.push(delBtn, doneBtn);
    actions.append(...actionBtns);

    if (currentDepth > 0) {
        const levelBadge = document.createElement('div');
        levelBadge.className = 'mdplain-mini-level';
        levelBadge.textContent = String(currentDepth);
        levelBadge.title = `Indent level ${currentDepth} of ${PLAIN_LIST_MAX_DEPTH}`;
        levelBadge.setAttribute('aria-label', `Indent level ${currentDepth}`);
        editor.insertBefore(levelBadge, editor.firstChild);
    }

    editor.appendChild(textInput);
    if (dateMeta) {
        syncDateMeta();
        editor.appendChild(dateMeta);
    }
    editor.appendChild(actions);
    li.appendChild(editor);
    if (preservedNest) li.appendChild(preservedNest);

    function onOutsidePointerDown(event) {
        const target = event.target;
        if (!(target instanceof Node)) return;
        // Clicks inside this item (including its mini editor) stay here.
        if (li.contains(target)) return;
        if (target instanceof Element && target.closest('dialog')) return;
        // Another nested item under the same parent — let that item take over;
        // don't treat it as a blur that then races with its long-press.
        if (
            target instanceof Element &&
            target.closest('.mdplain-view-item') &&
            target.closest('.mdplain-view-items')
        ) {
            finish({ commit: true, deferRefresh: true });
            return;
        }
        finish({ commit: true });
    }

    function onDocKeyDown(event) {
        if (event.key === 'Escape' && !closed) {
            if (document.querySelector('dialog[open]')) return;
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
        focusItemTextInput(textInput);
        // Second frame: layout has the expanded mini editor height.
        requestAnimationFrame(() => {
            if (closed) return;
            scrollListTargetIntoView(editor);
        });
    });
}

/**
 * Build a depth tree from flat plain-list items.
 * @param {Array<object>} items
 * @returns {Array<{ item: object, depth: number, children: Array<object> }>}
 */
function buildPlainItemTree(items) {
    const root = { depth: -1, children: [], item: null };
    const stack = [root];
    for (const item of items || []) {
        const depth = plainListDepthFromIndent(item.indent);
        while (stack.length > 1 && stack[stack.length - 1].depth >= depth) {
            stack.pop();
        }
        const node = { item, depth, children: [] };
        stack[stack.length - 1].children.push(node);
        stack.push(node);
    }
    return root.children;
}

function isSegmentedListLayout() {
    return document.documentElement.getAttribute('data-list-layout') !== 'continuous';
}

/**
 * @param {object} item
 * @param {object} block
 * @param {HTMLElement} host
 * @param {{ orderedNumber?: number | null }} [flags]
 */
function appendPlainViewItemBody(host, item, block, flags = {}) {
    const orderedNumber = flags.orderedNumber;
    if (orderedNumber != null && Number.isFinite(orderedNumber)) {
        const num = document.createElement('span');
        num.className = 'mdplain-view-num';
        num.textContent = `${Math.max(1, Math.floor(orderedNumber))}.`;
        num.setAttribute('aria-hidden', 'true');
        host.appendChild(num);
    }
    if (item.checked === true || item.checked === false) {
        const label = document.createElement('label');
        label.className = 'mdplain-task-label';
        const box = document.createElement('input');
        box.type = 'checkbox';
        box.disabled = true;
        box.checked = Boolean(item.checked);
        const span = document.createElement('span');
        fillListItemLabel(span, item.text);
        label.append(box, span);
        host.appendChild(label);
    } else {
        const text = document.createElement('span');
        text.className = 'mdplain-view-text';
        fillListItemLabel(text, item.text);
        host.appendChild(text);
    }
}

function plainViewOrderedNumberForItem(block, itemId) {
    if (!block?.ordered || block.task) return null;
    const items = block.items || [];
    const index = items.findIndex((it) => it.id === itemId);
    if (index < 0) return null;
    return plainListOrderedDisplayNumber(items, index);
}

/**
 * @param {{ item: object, depth: number, children: Array<object> }} node
 * @param {object} block
 * @param {{ onItemLongPress?: Function, onStatus?: Function }} options
 * @param {{ nestChildren?: boolean, orderedNumber?: number | null }} [flags]
 */
function renderPlainViewItemNode(node, block, options = {}, flags = {}) {
    const { onItemLongPress, onStatus } = options;
    const nestChildren = Boolean(flags.nestChildren);
    const item = node.item;
    const orderedNumber =
        flags.orderedNumber != null
            ? flags.orderedNumber
            : plainViewOrderedNumberForItem(block, item.id);
    const li = document.createElement('li');
    li.className = 'mdplain-view-item';
    li.dataset.plainItemId = item.id;
    li.dataset.depth = String(node.depth);
    if (node.depth > 0) li.classList.add('mdplain-view-item--nested');
    li.setAttribute('role', 'listitem');

    if (typeof onItemLongPress === 'function') {
        li.title = 'Long-press to edit this item · Double-tap to copy';
        attachLongPress(li, () => onItemLongPress(item, li));
    } else {
        li.title = 'Double-tap to copy';
    }
    attachDoubleTapCopy(li, () => formatPlainItemClipboard(item, block), onStatus);

    const main = document.createElement('div');
    main.className = 'mdplain-view-item-main';
    appendPlainViewItemBody(main, item, block, { orderedNumber });
    li.appendChild(main);

    if (nestChildren && node.children.length) {
        const nest = document.createElement(block.ordered ? 'ol' : 'ul');
        nest.className = 'mdplain-view-nest';
        if (block.ordered) nest.classList.add('mdplain-view-nest--ordered');
        nest.dataset.depth = String(node.depth + 1);
        nest.setAttribute('role', 'list');
        node.children.forEach((child, siblingIndex) => {
            nest.appendChild(
                renderPlainViewItemNode(child, block, options, {
                    nestChildren: true,
                    orderedNumber: block.ordered ? siblingIndex + 1 : null,
                })
            );
        });
        li.appendChild(nest);
    }

    return li;
}

/**
 * @param {object} block
 * @param {{ onItemLongPress?: (item: object, li: HTMLElement) => void, onStatus?: Function }} [options]
 */
function renderPlainListViewItems(block, options = {}) {
    const { onItemLongPress, onStatus } = options;
    const tag = block.ordered ? 'ol' : 'ul';
    const listEl = document.createElement(tag);
    listEl.className = 'mdplain-view-items';
    if (block.task) listEl.classList.add('mdplain-view-items--task');
    if (block.ordered) listEl.classList.add('mdplain-view-items--ordered');
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

    const segmented = isSegmentedListLayout();
    if (segmented) {
        listEl.classList.add('mdplain-view-items--tree');
        const tree = buildPlainItemTree(items);
        tree.forEach((node, siblingIndex) => {
            listEl.appendChild(
                renderPlainViewItemNode(node, block, options, {
                    nestChildren: true,
                    orderedNumber: block.ordered ? siblingIndex + 1 : null,
                })
            );
        });
        return listEl;
    }

    // Continuous: flat list — nest depth is shown via text colour, not padding.
    items.forEach((item, index) => {
        const li = document.createElement('li');
        li.className = 'mdplain-view-item';
        li.dataset.plainItemId = item.id;
        const depth = plainListDepthFromIndent(item.indent);
        li.dataset.depth = String(depth);
        if (depth > 0) li.classList.add('mdplain-view-item--nested');
        li.setAttribute('role', 'listitem');
        if (typeof onItemLongPress === 'function') {
            li.title = 'Long-press to edit this item · Double-tap to copy';
            attachLongPress(li, () => onItemLongPress(item, li));
        } else {
            li.title = 'Double-tap to copy';
        }
        attachDoubleTapCopy(li, () => formatPlainItemClipboard(item, block), onStatus);

        const main = document.createElement('div');
        main.className = 'mdplain-view-item-main';
        appendPlainViewItemBody(main, item, block, {
            orderedNumber: block.ordered
                ? plainListOrderedDisplayNumber(items, index)
                : null,
        });
        li.appendChild(main);
        listEl.appendChild(li);
    });

    return listEl;
}

function renderPlainItemRow({ item, index, block, total, onMutate }) {
    const li = document.createElement('li');
    li.className = 'mdlist-item mdplain-item';
    li.dataset.plainItemId = item.id;
    const depth = plainListDepthFromIndent(item.indent);
    li.dataset.depth = String(depth);
    if (depth > 0) li.classList.add('mdplain-item--nested');
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
    const originalText = item.text || '';
    textInput.value = listItemBodyForEdit(originalText);
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
            if (target) target.text = commitMiniEditListItemText(originalText, textInput.value);
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
                    text: stampNewItemText(''),
                    checked: listBlock.task ? false : null,
                    marker: sample?.marker || (listBlock.ordered ? '1.' : '-'),
                    indent: plainListIndentForDepth(plainListDepthFromIndent(sample?.indent || '')),
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
    delBtn.addEventListener('click', async () => {
        const ok = await confirmDeleteListItem(textInput.value || item.text);
        if (!ok) return;
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
        const row = root.querySelector(`[data-item-id="${CSS.escape(focusItemId)}"]`);
        const input = row?.querySelector('.mdlist-text');
        focusItemTextInput(input);
        requestAnimationFrame(() => {
            scrollListTargetIntoView(row || input);
        });
    });
}

function focusPlainItem(root, focusPlainItemId) {
    if (!focusPlainItemId) return;
    requestAnimationFrame(() => {
        const row = root.querySelector(
            `[data-plain-item-id="${CSS.escape(focusPlainItemId)}"]`
        );
        const input = row?.querySelector('.mdlist-text');
        focusItemTextInput(input);
        requestAnimationFrame(() => {
            scrollListTargetIntoView(row || input);
        });
    });
}

/**
 * Bring a newly added / focused list row (or mini editor) into view.
 * @param {Element | null | undefined} el
 */
function scrollListTargetIntoView(el) {
    if (!el || typeof el.scrollIntoView !== 'function') return;
    try {
        el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
    } catch {
        try {
            el.scrollIntoView(true);
        } catch {
            // ignore
        }
    }
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
        reorderingListIds: collectReorderingLists(doc),
        reorderingPlainLists: collectReorderingPlainLists(doc),
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
    const reordering = Boolean(seg._reordering) && !editing;
    const wrap = document.createElement('section');
    wrap.className = editing
        ? 'mdlist-block mdlist-block--editing'
        : reordering
          ? 'mdlist-block mdlist-block--reordering'
          : 'mdlist-block mdlist-block--view';
    wrap.dataset.listId = list.id;

    if (!editing) {
        wrap.appendChild(renderListViewHeader(seg, doc, onChange, onStatus, { reordering }));
        if (reordering) {
            wrap.appendChild(renderListReorderItems(seg, doc, onChange));
        } else {
            wrap.appendChild(renderListViewItems(list, onStatus));
        }
        return wrap;
    }

    // Entering full edit exits reorder mode.
    seg._reordering = false;

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

function renderListViewHeader(seg, doc, onChange, onStatus, { reordering = false } = {}) {
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

    const actions = document.createElement('div');
    actions.className = 'mdlist-header-actions';

    const reorderBtn = createListReorderButton({ active: reordering });
    reorderBtn.addEventListener('click', () => {
        seg._editing = false;
        seg._reordering = !reordering;
        onChange(doc, changeOpts(doc, { soft: true }));
    });

    if (reordering) {
        actions.appendChild(reorderBtn);
        titleRow.append(title, count, actions);
        header.appendChild(titleRow);
        return header;
    }

    const addTopBtn = createListAddItemButton({ position: 'top' });
    addTopBtn.addEventListener('click', () => {
        const item = addItem(list, '', { position: 'top' });
        seg._reordering = false;
        seg._editing = true;
        onChange(doc, changeOpts(doc, { soft: true, focusItemId: item.id }));
    });

    const addBottomBtn = createListAddItemButton({ position: 'bottom' });
    addBottomBtn.addEventListener('click', () => {
        const item = addItem(list, '', { position: 'bottom' });
        seg._reordering = false;
        seg._editing = true;
        onChange(doc, changeOpts(doc, { soft: true, focusItemId: item.id }));
    });

    const copyBtn = createListCopyButton({
        label: 'Copy list',
        title: 'Copy entire list',
    });
    copyBtn.addEventListener('click', () => {
        const text = formatMdlistClipboard(list);
        if (!String(text || '').trim()) {
            toastCopyFeedback('Nothing to copy', 'warn');
            return;
        }
        copyWithStatus(text, onStatus, 'List copied');
    });

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'mdlist-edit-btn';
    editBtn.setAttribute('aria-label', 'Edit list');
    editBtn.title = 'Edit list';
    editBtn.innerHTML =
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 20h4.5L19 9.5 14.5 5 4 15.5V20z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M13.2 6.3l4.5 4.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
    editBtn.addEventListener('click', () => {
        seg._reordering = false;
        seg._editing = true;
        onChange(doc, changeOpts(doc, { soft: true }));
    });

    actions.append(addTopBtn, addBottomBtn, copyBtn, reorderBtn, editBtn);
    titleRow.append(title, count, actions);
    header.appendChild(titleRow);
    return header;
}

/**
 * Condensed one-line rows with drag handles for Reorder mode (custom mdlist).
 */
function renderListReorderItems(seg, doc, onChange) {
    const list = seg.list;
    const ul = document.createElement('ul');
    ul.className = 'mdlist-items mdlist-items--reorder';
    ul.setAttribute('role', 'list');

    const items = sortItemsByScore(list.items || []);
    if (!items.length) {
        const empty = document.createElement('li');
        empty.className = 'mdlist-empty-item';
        empty.textContent = 'No items yet.';
        ul.appendChild(empty);
        return ul;
    }

    items.forEach((item, index) => {
        const li = document.createElement('li');
        li.className = 'mdlist-item mdlist-reorder-item';
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
        handle.setAttribute('aria-label', `Drag to reorder item ${index + 1}`);
        handle.title = 'Drag to reorder';

        attachPointerDrag(handle, li, {
            onDropIndex: (newIndex) => {
                list.items = moveItemToIndex(list.items || [], item.id, newIndex);
                onChange(doc, changeOpts(doc, { soft: true, persist: true }));
            },
        });

        const text = document.createElement('span');
        text.className = 'mdlist-reorder-text';
        text.textContent = listItemPlainLabel(item.text);

        li.append(rank, handle, text);
        ul.appendChild(li);
    });

    return ul;
}

function renderListViewItems(list, onStatus) {
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
        li.title = 'Double-tap to copy';

        const rank = document.createElement('span');
        rank.className = 'mdlist-rank';
        rank.textContent = `#${index + 1}`;

        const body = document.createElement('div');
        body.className = 'mdlist-view-body';

        const text = document.createElement('span');
        text.className = 'mdlist-view-text';
        fillListItemLabel(text, item.text);

        body.appendChild(text);

        const tags = Array.isArray(item.tags) ? item.tags.filter(Boolean) : [];
        if (tags.length) {
            const tagsEl = document.createElement('span');
            tagsEl.className = 'mdlist-view-tags';
            tagsEl.textContent = tags.join(' · ');
            body.appendChild(tagsEl);
        }

        attachDoubleTapCopy(li, () => formatMdlistItemClipboard(item), onStatus);

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

function collectReorderingLists(doc) {
    const map = {};
    for (const seg of doc.segments || []) {
        if (seg.type === 'mdlist' && seg.list && seg._reordering && !seg._editing) {
            map[seg.list.id] = true;
        }
    }
    return map;
}

function collectReorderingPlainLists(doc) {
    const map = {};
    (doc.segments || []).forEach((seg, segIndex) => {
        if (seg.type !== 'markdown' || !seg._reorderingPlainLists) return;
        const editing = seg._editingPlainLists || {};
        for (const [listIndex, on] of Object.entries(seg._reorderingPlainLists)) {
            if (on && !editing[listIndex]) map[`${segIndex}:${listIndex}`] = true;
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

/**
 * Re-apply which custom lists are in Reorder mode.
 */
export function applyReorderingLists(doc, reorderingListIds = {}) {
    if (!reorderingListIds) return;
    for (const seg of doc.segments || []) {
        if (seg.type === 'mdlist' && seg.list && reorderingListIds[seg.list.id] && !seg._editing) {
            seg._reordering = true;
        }
    }
}

/**
 * Re-apply which plain markdown lists are in Reorder mode.
 * Keys are `${segmentIndex}:${plainListIndex}`.
 */
export function applyReorderingPlainLists(doc, reorderingPlainLists = {}) {
    if (!reorderingPlainLists) return;
    for (const [key, on] of Object.entries(reorderingPlainLists)) {
        if (!on) continue;
        const [segPart, listPart] = String(key).split(':');
        const segIndex = Number(segPart);
        const listIndex = Number(listPart);
        if (!Number.isInteger(segIndex) || !Number.isInteger(listIndex)) continue;
        const seg = doc.segments?.[segIndex];
        if (!seg || seg.type !== 'markdown') continue;
        if (seg._editingPlainLists?.[listIndex]) continue;
        if (!seg._reorderingPlainLists) seg._reorderingPlainLists = {};
        seg._reorderingPlainLists[listIndex] = true;
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
    const originalText = item.text || '';
    textInput.value = listItemBodyForEdit(originalText);
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
        onMutate(() => setItemText(list, item.id, commitMiniEditListItemText(originalText, textInput.value)), {
            skipRender: true,
        });
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
    delBtn.addEventListener('click', async () => {
        const ok = await confirmDeleteListItem(textInput.value || item.text);
        if (!ok) return;
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
