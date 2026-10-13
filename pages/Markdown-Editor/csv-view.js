/**
 * Plain CSV grid: edit cells, add or remove rows and columns. No formulas.
 */

import { parseCsv, pasteIntoRows, serializeCsv } from './csv.js';

const EDIT_MAX_ROWS = 80;
const EDIT_MAX_COLS = 16;
const VIEW_MAX_ROWS = 120;
const VIEW_MAX_COLS = 16;

/** @type {WeakMap<HTMLElement, { readText: () => string | null }>} */
const sessions = new WeakMap();

/**
 * Latest CSV text from the open grid, including the focused cell.
 * Returns null when the sheet is view-only, so a clipped view cannot overwrite the file.
 * @param {HTMLElement | null | undefined} gridEl
 * @returns {string | null}
 */
export function readCsvGridText(gridEl) {
    if (!gridEl) return null;
    return sessions.get(gridEl)?.readText() ?? null;
}

/**
 * @param {number} index
 */
function columnLabel(index) {
    let n = index + 1;
    let label = '';
    while (n > 0) {
        n -= 1;
        label = String.fromCharCode(65 + (n % 26)) + label;
        n = Math.floor(n / 26);
    }
    return label;
}

/**
 * @param {string[][]} rows
 */
function columnCount(rows) {
    return Math.max(1, ...rows.map((row) => (Array.isArray(row) ? row.length : 0)));
}

/**
 * Keep a focused cell above the keyboard without jumping the whole page.
 * @param {HTMLElement} gridEl
 * @param {HTMLElement} input
 */
function revealInput(gridEl, input) {
    const scroller = gridEl.querySelector('.csv-scroll');
    if (!(scroller instanceof HTMLElement)) return;
    const scrollerRect = scroller.getBoundingClientRect();
    const inputRect = input.getBoundingClientRect();
    const head = scroller.querySelector('thead');
    const gutter = scroller.querySelector('.csv-row-head');
    const topInset = head instanceof HTMLElement ? head.getBoundingClientRect().height : 0;
    const leftInset = gutter instanceof HTMLElement ? gutter.getBoundingClientRect().width : 0;
    const visibleTop = scrollerRect.top + topInset;
    const visibleLeft = scrollerRect.left + leftInset;
    if (inputRect.bottom > scrollerRect.bottom) {
        scroller.scrollTop += inputRect.bottom - scrollerRect.bottom + 8;
    } else if (inputRect.top < visibleTop) {
        scroller.scrollTop -= visibleTop - inputRect.top + 8;
    }
    if (inputRect.right > scrollerRect.right) {
        scroller.scrollLeft += inputRect.right - scrollerRect.right + 8;
    } else if (inputRect.left < visibleLeft) {
        scroller.scrollLeft -= visibleLeft - inputRect.left + 8;
    }
}

/**
 * @param {HTMLElement} gridEl
 */
function bindKeyboardInset(gridEl) {
    const vv = window.visualViewport;
    const previous = gridEl.dataset.csvKeyboardBound;
    if (previous === '1') return;
    gridEl.dataset.csvKeyboardBound = '1';

    const sync = () => {
        const active = document.activeElement;
        const editing =
            active instanceof HTMLElement &&
            active.classList.contains('csv-input') &&
            gridEl.contains(active);
        if (!editing || !vv) {
            gridEl.style.paddingBottom = '';
            return;
        }
        const bottom = gridEl.getBoundingClientRect().bottom;
        const visibleBottom = vv.offsetTop + vv.height;
        const overlap = Math.max(0, bottom - visibleBottom);
        gridEl.style.paddingBottom = overlap > 24 ? `${Math.round(overlap)}px` : '';
        if (active instanceof HTMLElement) revealInput(gridEl, active);
    };

    vv?.addEventListener('resize', sync);
    vv?.addEventListener('scroll', sync);
    gridEl.addEventListener('focusin', sync);
    gridEl.addEventListener('focusout', () => {
        window.setTimeout(sync, 0);
    });
}

/**
 * @param {HTMLElement | null} gridEl
 * @param {string} text
 * @param {(next: string) => void} onChange
 */
export function renderCsvGrid(gridEl, text, onChange) {
    if (!gridEl) return;
    const parsed = parseCsv(text);
    const rows = parsed.rows.map((row) => (Array.isArray(row) ? [...row] : ['']));
    const delimiter = parsed.delimiter;
    const writeOptions = { bom: parsed.bom, trailingNewline: parsed.trailingNewline };
    const totalCols = columnCount(rows);
    const editable = rows.length <= EDIT_MAX_ROWS && totalCols <= EDIT_MAX_COLS;
    const showRows = Math.min(rows.length, editable ? rows.length : VIEW_MAX_ROWS);
    const showCols = Math.min(totalCols, editable ? totalCols : VIEW_MAX_COLS);
    const clipped = showRows < rows.length || showCols < totalCols;
    /** @type {{ r: number, c: number } | null} */
    let active = null;
    /** @type {{ r: number, c: number } | null} */
    let pendingFocus = null;
    let notice = '';

    const syncFromDom = () => {
        for (const input of gridEl.querySelectorAll('.csv-input')) {
            if (!(input instanceof HTMLInputElement)) continue;
            const r = Number(input.dataset.row);
            const c = Number(input.dataset.col);
            if (!Number.isInteger(r) || !Number.isInteger(c) || r < 0 || c < 0) continue;
            while (rows.length <= r) rows.push([]);
            const row = rows[r];
            while (row.length <= c) row.push('');
            row[c] = input.value;
        }
    };

    const emit = (fromDom = true) => {
        if (!editable) return;
        if (fromDom) syncFromDom();
        onChange(serializeCsv(rows, delimiter, writeOptions));
    };

    sessions.set(gridEl, {
        readText() {
            if (!editable) return null;
            let changed = false;
            for (const input of gridEl.querySelectorAll('.csv-input')) {
                if (!(input instanceof HTMLInputElement)) continue;
                const r = Number(input.dataset.row);
                const c = Number(input.dataset.col);
                if ((rows[r]?.[c] ?? '') !== input.value) changed = true;
            }
            if (!changed) return null;
            syncFromDom();
            return serializeCsv(rows, delimiter, writeOptions);
        },
    });

    /** @type {(r: number, c: number) => void} */
    let setActive = () => {};

    const paint = () => {
        const focus = pendingFocus;
        pendingFocus = null;
        const colsNow = columnCount(rows);
        const rowsShown = editable ? rows.length : showRows;
        const colsShown = editable ? colsNow : showCols;
        gridEl.replaceChildren();

        const message =
            notice ||
            (!editable
                ? clipped
                    ? `This CSV is too large to edit here. Showing the first ${rowsShown} rows and ${colsShown} columns.`
                    : 'This CSV is too large to edit here.'
                : '');
        notice = '';
        if (message) {
            const note = document.createElement('p');
            note.className = 'csv-note';
            note.textContent = message;
            gridEl.appendChild(note);
        }

        const scroll = document.createElement('div');
        scroll.className = 'csv-scroll';
        const table = document.createElement('table');
        table.className = 'csv-table';

        const thead = document.createElement('thead');
        const headRow = document.createElement('tr');
        const corner = document.createElement('th');
        corner.className = 'csv-corner';
        corner.scope = 'col';
        headRow.appendChild(corner);
        for (let c = 0; c < colsShown; c += 1) {
            const th = document.createElement('th');
            th.scope = 'col';
            th.className = 'csv-col-head';
            th.dataset.col = String(c);
            th.textContent = columnLabel(c);
            headRow.appendChild(th);
        }
        thead.appendChild(headRow);
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        for (let r = 0; r < rowsShown; r += 1) {
            const tr = document.createElement('tr');
            tr.dataset.row = String(r);
            const rowHead = document.createElement('th');
            rowHead.scope = 'row';
            rowHead.className = 'csv-row-head';
            rowHead.textContent = String(r + 1);
            tr.appendChild(rowHead);

            for (let c = 0; c < colsShown; c += 1) {
                const td = document.createElement('td');
                td.dataset.row = String(r);
                td.dataset.col = String(c);
                const value = rows[r]?.[c] ?? '';
                if (editable) {
                    const input = document.createElement('input');
                    input.type = 'text';
                    input.className = 'csv-input';
                    input.value = value;
                    input.dataset.row = String(r);
                    input.dataset.col = String(c);
                    input.spellcheck = false;
                    input.autocomplete = 'off';
                    input.autocapitalize = 'off';
                    input.autocorrect = 'off';
                    input.enterKeyHint = 'next';
                    input.setAttribute('aria-label', `Row ${r + 1}, column ${columnLabel(c)}`);
                    input.addEventListener('input', () => {
                        while (rows[r].length <= c) rows[r].push('');
                        rows[r][c] = input.value;
                        setActive(r, c);
                        emit();
                    });
                    input.addEventListener('focus', () => {
                        setActive(r, c);
                        revealInput(gridEl, input);
                    });
                    input.addEventListener('paste', (event) => {
                        const pasted = event.clipboardData?.getData('text/plain') ?? '';
                        if (!pasted.includes('\n') && !pasted.includes('\t') && !pasted.includes('\r')) return;
                        event.preventDefault();
                        syncFromDom();
                        const result = pasteIntoRows(rows, r, c, pasted);
                        let next = result.rows;
                        let truncated = false;
                        if (next.length > EDIT_MAX_ROWS) {
                            next = next.slice(0, EDIT_MAX_ROWS);
                            truncated = true;
                        }
                        next = next.map((row) => {
                            if (row.length <= EDIT_MAX_COLS) return row;
                            truncated = true;
                            return row.slice(0, EDIT_MAX_COLS);
                        });
                        rows.splice(0, rows.length, ...next);
                        if (truncated) {
                            notice = `Pasted what fits. This editor edits up to ${EDIT_MAX_ROWS} rows and ${EDIT_MAX_COLS} columns.`;
                        }
                        const focusRow = Math.min(result.focusRow, rows.length - 1);
                        const focusCol = Math.min(result.focusCol, columnCount(rows) - 1);
                        pendingFocus = { r: Math.max(0, focusRow), c: Math.max(0, focusCol) };
                        emit(false);
                        paint();
                    });
                    input.addEventListener('keydown', (event) => {
                        if (event.isComposing) return;
                        const caret = input.selectionStart ?? 0;
                        const end = input.selectionEnd ?? caret;
                        const atStart = caret === 0 && end === 0;
                        const atEnd = caret === input.value.length && end === input.value.length;
                        let nextRow = r;
                        let nextCol = c;
                        if (event.key === 'Enter' && !event.shiftKey) {
                            nextRow = r + 1;
                        } else if (event.key === 'Enter' && event.shiftKey) {
                            nextRow = r - 1;
                        } else if (event.key === 'ArrowDown' && atEnd) {
                            nextRow = r + 1;
                        } else if (event.key === 'ArrowUp' && atStart) {
                            nextRow = r - 1;
                        } else if (event.key === 'ArrowLeft' && atStart) {
                            nextCol = c - 1;
                        } else if (event.key === 'ArrowRight' && atEnd) {
                            nextCol = c + 1;
                        } else {
                            return;
                        }
                        const next = gridEl.querySelector(
                            `input[data-row="${nextRow}"][data-col="${nextCol}"]`
                        );
                        if (!(next instanceof HTMLElement)) return;
                        event.preventDefault();
                        next.focus({ preventScroll: true });
                    });
                    td.appendChild(input);
                } else {
                    const cell = document.createElement('div');
                    cell.className = 'csv-read';
                    cell.textContent = value;
                    td.appendChild(cell);
                }
                tr.appendChild(td);
            }
            tbody.appendChild(tr);
        }
        table.appendChild(tbody);
        scroll.appendChild(table);
        gridEl.appendChild(scroll);

        if (editable) {
            const bar = document.createElement('div');
            bar.className = 'csv-toolbar';
            bar.setAttribute('role', 'toolbar');
            bar.setAttribute('aria-label', 'CSV editing');

            const label = document.createElement('p');
            label.className = 'csv-active-label';
            label.textContent = 'Tap a cell to edit';

            const addRow = document.createElement('button');
            addRow.type = 'button';
            addRow.className = 'btn btn-ghost';
            addRow.textContent = 'Add row';
            addRow.addEventListener('click', () => {
                syncFromDom();
                const c = active ? active.c : 0;
                rows.push(Array.from({ length: columnCount(rows) }, () => ''));
                pendingFocus = { r: rows.length - 1, c: Math.min(c, columnCount(rows) - 1) };
                emit(false);
                paint();
            });

            const addCol = document.createElement('button');
            addCol.type = 'button';
            addCol.className = 'btn btn-ghost';
            addCol.textContent = 'Add column';
            addCol.addEventListener('click', () => {
                syncFromDom();
                const r = active ? active.r : 0;
                const width = columnCount(rows);
                for (const row of rows) {
                    while (row.length < width) row.push('');
                    row.push('');
                }
                pendingFocus = { r: Math.min(r, rows.length - 1), c: columnCount(rows) - 1 };
                emit(false);
                paint();
            });

            const deleteRow = document.createElement('button');
            deleteRow.type = 'button';
            deleteRow.className = 'btn btn-ghost';
            deleteRow.textContent = 'Delete row';
            deleteRow.disabled = true;
            deleteRow.addEventListener('click', () => {
                syncFromDom();
                if (!active || rows.length <= 1) return;
                const r = active.r;
                const c = active.c;
                rows.splice(r, 1);
                pendingFocus = {
                    r: Math.min(r, rows.length - 1),
                    c: Math.min(c, columnCount(rows) - 1),
                };
                emit(false);
                paint();
            });

            const deleteCol = document.createElement('button');
            deleteCol.type = 'button';
            deleteCol.className = 'btn btn-ghost';
            deleteCol.textContent = 'Delete column';
            deleteCol.disabled = true;
            deleteCol.addEventListener('click', () => {
                syncFromDom();
                if (!active || columnCount(rows) <= 1) return;
                const r = active.r;
                const c = active.c;
                for (const row of rows) {
                    if (c < row.length) row.splice(c, 1);
                }
                pendingFocus = {
                    r: Math.min(r, rows.length - 1),
                    c: Math.min(c, columnCount(rows) - 1),
                };
                emit(false);
                paint();
            });

            bar.append(label, addRow, addCol, deleteRow, deleteCol);
            gridEl.appendChild(bar);

            setActive = (r, c) => {
                active = { r, c };
                for (const el of gridEl.querySelectorAll('.is-active')) {
                    el.classList.remove('is-active');
                }
                gridEl.querySelector(`tr[data-row="${r}"]`)?.classList.add('is-active');
                gridEl.querySelector(`.csv-col-head[data-col="${c}"]`)?.classList.add('is-active');
                gridEl.querySelector(`td[data-row="${r}"][data-col="${c}"]`)?.classList.add('is-active');
                label.textContent = `Row ${r + 1} · ${columnLabel(c)}`;
                deleteRow.disabled = rows.length <= 1;
                deleteCol.disabled = columnCount(rows) <= 1;
                deleteRow.setAttribute('aria-label', `Delete row ${r + 1}`);
                deleteCol.setAttribute('aria-label', `Delete column ${columnLabel(c)}`);
            };

            if (focus) setActive(focus.r, focus.c);
        }

        if (focus) {
            const input = gridEl.querySelector(
                `input[data-row="${focus.r}"][data-col="${focus.c}"]`
            );
            if (input instanceof HTMLElement) {
                input.focus({ preventScroll: true });
                revealInput(gridEl, input);
            }
        }
    };

    bindKeyboardInset(gridEl);
    paint();
}
