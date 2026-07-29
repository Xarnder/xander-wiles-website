/**
 * Structured list UI for Custom / Mixed modes.
 */

import {
    addItem,
    appendEmptyList,
    collectAllTags,
    deleteItem,
    deleteListFromDocument,
    filterItemsByTag,
    formatTagsInput,
    insertEmptyListAt,
    mdlistAgentNotePlain,
    moveItemByDelta,
    moveItemToIndex,
    parseTagsInput,
    setItemScore,
    setItemTags,
    setItemText,
    setListTitle,
    splitMarkdownByHeaders,
    stripMdlistAgentNotes,
} from './lists.js';
import { renderMarkdown } from './markdown.js';
import { confirmDeleteList } from './ui.js';

/** Persist which LLM-note disclosures are expanded across list re-renders. */
const expandedAgentNotes = new Set();

/**
 * @param {HTMLElement} root
 * @param {object} options
 * @param {'list' | 'preview'} options.mode
 * @param {object} options.doc
 * @param {(doc: object, opts?: object) => void} options.onChange
 * @param {(msg: string, kind?: string) => void} [options.onStatus]
 * @param {string} [options.focusItemId]
 * @param {boolean} [options.placingList]
 */
export function renderListsUi(root, options) {
    const { mode, doc, onChange, onStatus, focusItemId, placingList = false } = options;
    const scrollTop = root.scrollTop;
    root.replaceChildren();
    root.className = placingList ? 'lists-root lists-root--placing' : 'lists-root';

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
            restoreScroll(root, scrollTop);
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
        restoreScroll(root, scrollTop);
        focusItem(root, focusItemId);
        return;
    }

    // Preview
    if (placingList) {
        renderPlacementMode(root, doc, onChange, onStatus, scrollTop);
        return;
    }

    for (let segIndex = 0; segIndex < (doc.segments || []).length; segIndex += 1) {
        const seg = doc.segments[segIndex];
        if (seg.type === 'markdown') {
            root.appendChild(renderMarkdownSegment(seg, segIndex, doc, onChange));
            continue;
        }
        if (seg.type === 'mdlist' && seg.list) {
            root.appendChild(renderListStack(seg, doc, onChange, onStatus, focusItemId));
        } else if (seg.type === 'mdlist') {
            const stack = document.createElement('div');
            stack.className = 'mdlist-stack';
            stack.appendChild(createAgentNoteDisclosure(null));
            const err = document.createElement('pre');
            err.className = 'mixed-markdown mixed-markdown--error';
            err.textContent = seg.raw || '(invalid mdlist)';
            stack.appendChild(err);
            root.appendChild(stack);
        }
    }

    if (!validLists.length && !errorLists.length) {
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

    restoreScroll(root, scrollTop);
    focusItem(root, focusItemId);
}

function renderPlacementMode(root, doc, onChange, onStatus, scrollTop) {
    const banner = document.createElement('div');
    banner.className = 'list-place-banner';
    const title = document.createElement('p');
    title.className = 'list-place-banner-title';
    title.textContent = 'Choose where to add the list';
    const hint = document.createElement('p');
    hint.className = 'list-place-banner-hint';
    hint.textContent = 'Markdown is split by headings. Tap a slot to place the new list there.';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn btn-ghost btn-small';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', () => {
        onChange(doc, { soft: true, placingList: false, ...changeOpts(doc) });
    });
    banner.append(title, hint, cancel);
    root.appendChild(banner);

    const segments = doc.segments || [];
    if (!segments.length) {
        root.appendChild(
            createPlaceSlot({
                label: 'Place list here',
                hint: 'Empty document',
                onPick: () => placeListAt(doc, onChange, { type: 'at-start' }),
            })
        );
        restoreScroll(root, scrollTop);
        return;
    }

    root.appendChild(
        createPlaceSlot({
            label: 'Place list here',
            hint: 'At start of document',
            onPick: () => placeListAt(doc, onChange, { type: 'at-start' }),
        })
    );

    for (let segIndex = 0; segIndex < segments.length; segIndex += 1) {
        const seg = segments[segIndex];
        if (seg.type === 'markdown') {
            const text = seg.text || '';
            const sections = splitMarkdownByHeaders(text);
            for (let s = 0; s < sections.length; s += 1) {
                const section = sections[s];
                root.appendChild(renderPlacementSection(section));
                const afterTitle = section.title
                    ? `After “${truncateLabel(section.title)}”`
                    : sections.length === 1
                      ? 'After this markdown'
                      : 'After this section';
                root.appendChild(
                    createPlaceSlot({
                        label: 'Place list here',
                        hint: afterTitle,
                        onPick: () =>
                            placeListAt(doc, onChange, {
                                type: 'split-markdown',
                                segmentIndex: segIndex,
                                beforeLine: section.endLine,
                            }),
                    })
                );
            }
            continue;
        }

        if (seg.type === 'mdlist' && seg.list) {
            const wasEditing = Boolean(seg._editing);
            seg._editing = false;
            const preview = renderListBlock(seg, doc, () => {}, onStatus, null);
            seg._editing = wasEditing;
            preview.classList.add('mdlist-block--placement-preview');
            preview.querySelectorAll('button, input, select, textarea').forEach((el) => {
                el.disabled = true;
                el.tabIndex = -1;
            });
            root.appendChild(preview);
            root.appendChild(
                createPlaceSlot({
                    label: 'Place list here',
                    hint: `After list “${truncateLabel(seg.list.title || 'List')}”`,
                    onPick: () =>
                        placeListAt(doc, onChange, { type: 'after-segment', index: segIndex }),
                })
            );
        } else if (seg.type === 'mdlist') {
            const err = document.createElement('pre');
            err.className = 'mixed-markdown mixed-markdown--error';
            err.textContent = seg.raw || '(invalid mdlist)';
            root.appendChild(err);
            root.appendChild(
                createPlaceSlot({
                    label: 'Place list here',
                    hint: 'After invalid list block',
                    onPick: () =>
                        placeListAt(doc, onChange, { type: 'after-segment', index: segIndex }),
                })
            );
        }
    }

    restoreScroll(root, scrollTop);
}

function placeListAt(doc, onChange, target) {
    const list = insertEmptyListAt(doc, target);
    const item = addItem(list, '');
    const seg = (doc.segments || []).find((s) => s.type === 'mdlist' && s.list === list);
    if (seg) seg._editing = true;
    onChange(doc, {
        placingList: false,
        focusItemId: item.id,
        editingListIds: collectEditingLists(doc),
        tagFilters: collectTagFilters(doc),
    });
}

function createPlaceSlot({ label, hint, onPick }) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'list-place-slot';
    btn.setAttribute('aria-label', hint ? `${label}. ${hint}` : label);

    const line = document.createElement('span');
    line.className = 'list-place-slot-line';
    line.setAttribute('aria-hidden', 'true');

    const copy = document.createElement('span');
    copy.className = 'list-place-slot-copy';

    const main = document.createElement('span');
    main.className = 'list-place-slot-label';
    main.textContent = label;
    copy.appendChild(main);

    if (hint) {
        const sub = document.createElement('span');
        sub.className = 'list-place-slot-hint';
        sub.textContent = hint;
        copy.appendChild(sub);
    }

    btn.append(line, copy);
    btn.addEventListener('click', onPick);
    return btn;
}

function renderPlacementSection(section) {
    const wrap = document.createElement('div');
    wrap.className = 'list-place-section';

    if (section.title) {
        const heading = document.createElement('div');
        heading.className = 'list-place-section-label';
        const level = section.level > 0 ? `H${section.level}` : 'Intro';
        heading.textContent = `${level} · ${section.title}`;
        wrap.appendChild(heading);
    }

    const preview = document.createElement('div');
    preview.className = 'md-preview md-preview--segment list-place-section-preview';
    const body = stripMdlistAgentNotes(section.text || '').trim();
    if (!body) {
        preview.innerHTML = '<p class="md-empty">Empty section</p>';
    } else {
        preview.innerHTML = renderMarkdown(body);
    }
    wrap.appendChild(preview);
    return wrap;
}

function truncateLabel(text, max = 42) {
    const s = String(text || '').trim();
    if (s.length <= max) return s;
    return `${s.slice(0, max - 1)}…`;
}

function restoreScroll(root, scrollTop) {
    requestAnimationFrame(() => {
        root.scrollTop = scrollTop;
    });
}

function renderMarkdownSegment(seg, segIndex, doc, onChange) {
    const wrap = document.createElement('div');
    wrap.className = 'mixed-markdown-wrap';
    const editing = Boolean(seg._editing);

    const toolbar = document.createElement('div');
    toolbar.className = 'mixed-md-toolbar';
    const label = document.createElement('span');
    label.className = 'mixed-md-label';
    label.textContent = 'Markdown';
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'btn btn-ghost btn-small';
    toggle.textContent = editing ? 'Done' : 'Edit';
    toggle.addEventListener('click', () => {
        if (editing) {
            seg._editing = false;
        } else {
            seg._editing = true;
        }
        onChange(doc, {
            soft: true,
            tagFilters: collectTagFilters(doc),
            editingListIds: collectEditingLists(doc),
        });
    });
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
            });
        });
        wrap.appendChild(ta);
        requestAnimationFrame(() => ta.focus());
    } else {
        const preview = document.createElement('div');
        preview.className = 'md-preview md-preview--segment';
        const text = stripMdlistAgentNotes(seg.text || '').trim();
        if (!text) {
            preview.innerHTML = '<p class="md-empty">Empty markdown section — tap Edit to write.</p>';
        } else {
            preview.innerHTML = renderMarkdown(text);
        }
        wrap.appendChild(preview);
    }

    return wrap;
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

    const textInput = document.createElement('input');
    textInput.type = 'text';
    textInput.className = 'mdlist-text';
    textInput.value = item.text || '';
    textInput.placeholder = 'Item text';
    textInput.setAttribute('aria-label', 'Item text');
    textInput.addEventListener('input', () => {
        onMutate(() => setItemText(list, item.id, textInput.value), { skipRender: true });
    });
    textInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
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
