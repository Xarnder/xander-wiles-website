import { groupPdfTextLines, hexToRgbUnit, lineAtPoint, strokeCoversPoint, textLineBox, toWinAnsi } from './pdf-edit.js';

const PDFJS_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs';
const PDFJS_WORKER_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
const PDFLIB_URL = 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.esm.min.js';

const PEN_WIDTH = 2.2;
const HIGHLIGHT_WIDTH = 16;
const TEXT_SIZE = 16;
const MIN_ZOOM = 0.6;
const MAX_ZOOM = 3.5;

/** @type {Promise<any> | null} */
let pdfjsPromise = null;
/** @type {Promise<any> | null} */
let pdfLibPromise = null;

function loadPdfJs() {
    if (!pdfjsPromise) {
        pdfjsPromise = import(PDFJS_URL).then((lib) => {
            lib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
            return lib;
        });
    }
    return pdfjsPromise;
}

function loadPdfLib() {
    if (!pdfLibPromise) pdfLibPromise = import(PDFLIB_URL);
    return pdfLibPromise;
}

/**
 * Touch-friendly PDF viewer and markup editor.
 * Pen, highlight, and text are drawn on top of the pages and baked in on save.
 * @param {HTMLElement} root
 * @param {{ onDirty?: () => void }} [hooks]
 */
export function mountPdfViewer(root, hooks = {}) {
    const stage = root.querySelector('#pdf-stage');
    const statusEl = root.querySelector('#pdf-status');
    const pageLabel = root.querySelector('#pdf-page-label');
    const zoomLabel = root.querySelector('#pdf-zoom-label');
    const undoBtn = root.querySelector('#pdf-undo');
    const editBar = root.querySelector('#pdf-line-edit');
    const editInput = root.querySelector('#pdf-line-input');
    const editDone = root.querySelector('#pdf-line-done');
    const colors = root.querySelector('#pdf-colors');
    const toolButtons = [...root.querySelectorAll('[data-pdf-tool]')];
    const colorButtons = [...root.querySelectorAll('[data-pdf-color]')];

    /** @type {any} */
    let pdfDoc = null;
    /** @type {Uint8Array | null} */
    let baseBytes = null;
    /** @type {Array<object>} */
    let annotations = [];
    let tool = 'view';
    let penColor = '#111111';
    let userZoom = 1;
    let renderedZoom = 1;
    let renderToken = 0;
    let nextAnnId = 1;
    /** @type {{ pageIndex: number, pointerId: number, points: Array<{x:number,y:number}> } | null} */
    let drawing = null;
    /** @type {number | null} */
    let editingId = null;
    const TEXT_HINT = 'Tap a line to edit it.';
    const TEXT_EMPTY_HINT = 'No editable text. Tap the page to add a note.';
    /** @type {Map<number, { viewport: any, width: number, height: number, shell: HTMLElement, ink: HTMLCanvasElement }>} */
    let pages = new Map();

    const onDirty = () => {
        syncUndo();
        hooks.onDirty?.();
    };

    function setStatus(message) {
        if (!statusEl) return;
        statusEl.textContent = message || '';
        statusEl.hidden = !message;
    }

    function syncUndo() {
        if (undoBtn) undoBtn.disabled = annotations.length === 0;
    }

    function syncToolUi() {
        for (const btn of toolButtons) {
            const active = btn.getAttribute('data-pdf-tool') === tool;
            btn.classList.toggle('is-active', active);
            btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        }
        if (colors) colors.hidden = tool !== 'pen' && tool !== 'text';
        stage?.classList.toggle(
            'is-inking',
            tool === 'pen' || tool === 'highlight' || tool === 'text' || tool === 'eraser'
        );
    }

    function setTool(next) {
        if (tool === 'text' && next !== 'text') closeLineEditor();
        tool = next;
        syncToolUi();
        if (next === 'text') {
            const any = [...pages.values()].some((page) => page.lines?.length);
            setStatus(any ? TEXT_HINT : TEXT_EMPTY_HINT);
        } else if (statusEl?.textContent === TEXT_HINT || statusEl?.textContent === TEXT_EMPTY_HINT) {
            setStatus('');
        }
    }

    function pageMetrics() {
        const width = Math.max(1, (stage?.clientWidth || 320) - 16);
        return { fitWidth: width };
    }

    function updatePageLabel() {
        if (!pageLabel || !stage || !pdfDoc) return;
        const shells = [...stage.querySelectorAll('.pdf-page')];
        if (!shells.length) {
            pageLabel.textContent = '';
            return;
        }
        const mid = stage.scrollTop + stage.clientHeight * 0.35;
        let best = 0;
        let bestDist = Infinity;
        shells.forEach((shell, index) => {
            const dist = Math.abs(shell.offsetTop + shell.offsetHeight / 2 - mid);
            if (dist < bestDist) {
                bestDist = dist;
                best = index;
            }
        });
        pageLabel.textContent = `${best + 1}/${shells.length}`;
    }

    function redrawInk(pageIndex, livePoints = null) {
        const page = pages.get(pageIndex);
        if (!page) return;
        const canvas = page.ink;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const cssW = page.width;
        const cssH = page.height;
        const pxW = Math.max(1, Math.round(cssW * dpr));
        const pxH = Math.max(1, Math.round(cssH * dpr));
        if (canvas.width !== pxW || canvas.height !== pxH) {
            canvas.width = pxW;
            canvas.height = pxH;
        }
        canvas.style.width = `${cssW}px`;
        canvas.style.height = `${cssH}px`;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        for (const ann of annotations) {
            if (ann.pageIndex !== pageIndex || ann.type !== 'edit') continue;
            const [vx, vy] = page.viewport.convertToViewportPoint(ann.x, ann.y);
            const scale = page.viewport.scale || 1;
            const box = textLineBox(ann);
            const [left, top] = page.viewport.convertToViewportPoint(box.x, box.y + box.height);
            const width = box.width * scale;
            const height = box.height * scale;
            const cover = ann.cover || { r: 1, g: 1, b: 1 };
            ctx.globalAlpha = 1;
            ctx.fillStyle = `rgb(${Math.round(cover.r * 255)}, ${Math.round(cover.g * 255)}, ${Math.round(cover.b * 255)})`;
            ctx.fillRect(left, top, width, height);
            if (ann.text) {
                ctx.fillStyle = ann.color || '#111111';
                ctx.font = `${Math.max(1, (ann.size || TEXT_SIZE) * scale)}px Helvetica, Arial, sans-serif`;
                ctx.textBaseline = 'alphabetic';
                ctx.fillText(ann.text, vx, vy);
            }
            if (ann.id === editingId) {
                ctx.strokeStyle = '#1971c2';
                ctx.lineWidth = 2;
                ctx.strokeRect(left + 1, top + 1, Math.max(0, width - 2), Math.max(0, height - 2));
            }
        }
        const strokes = annotations.filter(
            (ann) => ann.pageIndex === pageIndex && (ann.type === 'ink' || ann.type === 'highlight')
        );
        if (livePoints?.length && drawing && drawing.pageIndex === pageIndex && drawing.type !== 'eraser') {
            strokes.push({
                type: drawing.type,
                color: drawing.color,
                width: drawing.width,
                points: livePoints,
            });
        }
        for (const stroke of strokes) {
            if (!stroke.points?.length) continue;
            ctx.beginPath();
            ctx.globalAlpha = stroke.type === 'highlight' ? 0.45 : 1;
            ctx.strokeStyle = stroke.color || '#111';
            ctx.lineWidth = Math.max(1, (stroke.width || PEN_WIDTH) * (page.viewport.scale || 1));
            if (stroke.points.length === 1) {
                const [x, y] = page.viewport.convertToViewportPoint(stroke.points[0].x, stroke.points[0].y);
                ctx.fillStyle = stroke.color || '#111';
                ctx.arc(x, y, ctx.lineWidth / 2, 0, Math.PI * 2);
                ctx.fill();
                continue;
            }
            stroke.points.forEach((point, index) => {
                const [x, y] = page.viewport.convertToViewportPoint(point.x, point.y);
                if (index === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            });
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
    }

    function layoutText(pageIndex) {
        const page = pages.get(pageIndex);
        if (!page) return;
        page.shell.querySelectorAll('.pdf-text-note').forEach((node) => node.remove());
        const notes = annotations.filter((ann) => ann.pageIndex === pageIndex && ann.type === 'text');
        for (const ann of notes) {
            const [vx, vy] = page.viewport.convertToViewportPoint(ann.x, ann.y + (ann.size || TEXT_SIZE));
            const visual = Math.max(10, (ann.size || TEXT_SIZE) * (page.viewport.scale || 1));
            const note = document.createElement('div');
            note.className = 'pdf-text-note';
            note.style.left = `${vx}px`;
            note.style.top = `${vy}px`;
            note.dataset.annId = String(ann.id);

            const grip = document.createElement('button');
            grip.type = 'button';
            grip.className = 'pdf-text-move';
            grip.textContent = 'Move';
            grip.setAttribute('aria-label', 'Move text');
            grip.addEventListener('pointerdown', (event) => {
                if (event.button != null && event.button !== 0) return;
                event.preventDefault();
                event.stopPropagation();
                const origin = eventToPdf(pageIndex, event);
                if (!origin) return;
                const start = { x: ann.x, y: ann.y };
                grip.setPointerCapture?.(event.pointerId);
                const move = (ev) => {
                    const now = eventToPdf(pageIndex, ev);
                    if (!now) return;
                    ann.x = start.x + (now.x - origin.x);
                    ann.y = start.y + (now.y - origin.y);
                    const [nx, ny] = page.viewport.convertToViewportPoint(ann.x, ann.y + (ann.size || TEXT_SIZE));
                    note.style.left = `${nx}px`;
                    note.style.top = `${ny}px`;
                };
                const end = (ev) => {
                    grip.removeEventListener('pointermove', move);
                    grip.removeEventListener('pointerup', end);
                    grip.removeEventListener('pointercancel', end);
                    move(ev);
                    onDirty();
                };
                grip.addEventListener('pointermove', move);
                grip.addEventListener('pointerup', end);
                grip.addEventListener('pointercancel', end);
            });

            const box = document.createElement('textarea');
            box.className = 'pdf-text-box';
            box.rows = 2;
            box.value = ann.text || '';
            box.dataset.annId = String(ann.id);
            box.setAttribute('aria-label', 'PDF text');
            box.style.fontSize = '16px';
            box.style.color = ann.color || '#111';
            const scale = visual / 16;
            box.style.transform = `scale(${scale})`;
            const maxCss = Math.max(80, page.width - vx - 52);
            box.style.width = `${Math.max(140, maxCss / scale)}px`;
            box.addEventListener('pointerdown', (event) => event.stopPropagation());
            box.addEventListener('input', () => {
                ann.text = box.value;
                onDirty();
            });
            box.addEventListener('blur', () => {
                ann.text = box.value;
                if (!String(ann.text || '').trim()) {
                    annotations = annotations.filter((item) => item !== ann);
                    note.remove();
                }
                onDirty();
            });
            note.append(grip, box);
            page.shell.appendChild(note);
        }
    }

    function eventToPdf(pageIndex, event) {
        const page = pages.get(pageIndex);
        if (!page) return null;
        const rect = page.ink.getBoundingClientRect();
        if (!rect.width || !rect.height) return null;
        const x = ((event.clientX - rect.left) / rect.width) * page.viewport.width;
        const y = ((event.clientY - rect.top) / rect.height) * page.viewport.height;
        const [pdfX, pdfY] = page.viewport.convertToPdfPoint(x, y);
        return { x: pdfX, y: pdfY };
    }

    function placeText(pageIndex, event) {
        const point = eventToPdf(pageIndex, event);
        if (!point) return;
        const ann = {
            id: nextAnnId++,
            pageIndex,
            type: 'text',
            x: point.x,
            y: point.y - TEXT_SIZE,
            size: TEXT_SIZE,
            color: penColor,
            text: '',
        };
        annotations.push(ann);
        layoutText(pageIndex);
        const boxes = pages.get(pageIndex)?.shell.querySelectorAll('.pdf-text-box');
        const box = boxes?.[boxes.length - 1];
        if (box instanceof HTMLTextAreaElement) {
            box.focus();
        }
        onDirty();
    }

    function coverCssColor(pixel) {
        if (!pixel || pixel[3] < 200) return null;
        const lum = 0.2126 * pixel[0] + 0.7152 * pixel[1] + 0.0722 * pixel[2];
        if (lum < 176) return null;
        return { r: pixel[0] / 255, g: pixel[1] / 255, b: pixel[2] / 255 };
    }

    function sampleLineColors(record, line) {
        const fallback = { cover: { r: 1, g: 1, b: 1 }, color: '#111111', pending: true };
        const canvas = record?.shell?.querySelector('.pdf-page-canvas');
        if (!(canvas instanceof HTMLCanvasElement) || canvas.width < 2 || canvas.height < 2) return fallback;
        const ctx = canvas.getContext('2d');
        if (!ctx) return fallback;
        const dpr = canvas.width / record.width;
        const scale = record.viewport?.scale || 1;
        const box = textLineBox(line);
        const [vx, vy] = record.viewport.convertToViewportPoint(box.x, box.y + box.height);
        const left = Math.max(0, Math.floor(vx * dpr));
        const top = Math.max(0, Math.floor(vy * dpr));
        const width = Math.max(2, Math.min(canvas.width - left, Math.ceil(box.width * scale * dpr)));
        const height = Math.max(2, Math.min(canvas.height - top, Math.ceil(box.height * scale * dpr)));
        try {
            const aboveY = Math.max(0, top - 2);
            const above = ctx.getImageData(left, aboveY, Math.min(width, 48), 1).data;
            let cover = null;
            for (let i = 0; i < above.length; i += 4) {
                cover = coverCssColor(above.slice(i, i + 4)) || cover;
            }
            const pixels = ctx.getImageData(left, top, width, height).data;
            let darkest = null;
            let darkLum = Infinity;
            for (let i = 0; i < pixels.length; i += 16) {
                const lum = 0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2];
                if (pixels[i + 3] < 200 || lum >= darkLum) continue;
                darkLum = lum;
                darkest = [pixels[i], pixels[i + 1], pixels[i + 2]];
            }
            const hex = (n) => Math.round(n).toString(16).padStart(2, '0');
            const color =
                darkest && darkLum <= 150 ? `#${hex(darkest[0])}${hex(darkest[1])}${hex(darkest[2])}` : '#111111';
            return { cover: cover || { r: 1, g: 1, b: 1 }, color, pending: false };
        } catch {
            return fallback;
        }
    }

    function hideLineEditor() {
        editingId = null;
        if (editBar) editBar.hidden = true;
        if (editInput instanceof HTMLInputElement) {
            editInput.value = '';
            editInput.blur();
        }
    }

    function closeLineEditor(options = {}) {
        const id = editingId;
        if (id == null) {
            if (editBar) editBar.hidden = true;
            return;
        }
        const ann = annotations.find((item) => item.id === id);
        if (ann && editInput instanceof HTMLInputElement) {
            ann.text = options.revert ? ann.original : editInput.value;
        }
        hideLineEditor();
        if (ann && ann.text === ann.original) {
            annotations = annotations.filter((item) => item.id !== ann.id);
        }
        if (ann) redrawInk(ann.pageIndex);
        onDirty();
    }

    function scrollLineIntoView(ann) {
        const record = pages.get(ann.pageIndex);
        if (!record || !stage) return;
        const [, vy] = record.viewport.convertToViewportPoint(ann.x, ann.y);
        const sizePx = (ann.size || TEXT_SIZE) * (record.viewport.scale || 1);
        const top = record.shell.offsetTop + vy - sizePx - 12;
        const viewBottom = stage.scrollTop + stage.clientHeight * 0.45;
        if (top < stage.scrollTop || top > viewBottom) stage.scrollTop = Math.max(0, top);
    }

    function openLineEditor(ann) {
        if (editingId && editingId !== ann.id) closeLineEditor();
        editingId = ann.id;
        if (editBar) editBar.hidden = false;
        if (editInput instanceof HTMLInputElement) {
            editInput.value = ann.text || '';
            editInput.focus();
            editInput.select();
        }
        if (statusEl?.textContent === TEXT_HINT || statusEl?.textContent === TEXT_EMPTY_HINT) setStatus('');
        redrawInk(ann.pageIndex);
        scrollLineIntoView(ann);
    }

    function sameTextLine(ann, line) {
        return ann.type === 'edit' && Math.abs(ann.x - line.x) <= 2 && Math.abs(ann.y - line.y) <= 2;
    }

    function beginTextEdit(pageIndex, line) {
        const record = pages.get(pageIndex);
        if (!record) return;
        const existing = annotations.find((ann) => ann.pageIndex === pageIndex && sameTextLine(ann, line));
        if (existing) {
            openLineEditor(existing);
            return;
        }
        if (editingId) closeLineEditor();
        const colors = sampleLineColors(record, line);
        const ann = {
            id: nextAnnId++,
            pageIndex,
            type: 'edit',
            text: line.text,
            original: line.text,
            x: line.x,
            y: line.y,
            width: line.width,
            size: line.size,
            color: colors.color,
            cover: colors.cover,
            coverPending: colors.pending,
        };
        annotations.push(ann);
        openLineEditor(ann);
    }

    function eraseAt(pageIndex, point) {
        if (!point) return;
        const page = pages.get(pageIndex);
        const slop = 24 / (page?.viewport?.scale || 1);
        const next = annotations.filter((ann) => {
            if (ann.pageIndex !== pageIndex) return true;
            if (ann.type === 'text') {
                const dx = ann.x - point.x;
                const dy = ann.y + (ann.size || TEXT_SIZE) * 0.5 - point.y;
                return Math.hypot(dx, dy) > slop;
            }
            if (ann.type === 'edit') return !lineAtPoint([ann], point, slop);
            if (ann.type !== 'ink' && ann.type !== 'highlight') return true;
            const width = ann.width || (ann.type === 'highlight' ? HIGHLIGHT_WIDTH : PEN_WIDTH);
            return !strokeCoversPoint(point, ann.points || [], width, slop);
        });
        if (next.length === annotations.length) return;
        if (editingId != null && !next.some((ann) => ann.id === editingId)) hideLineEditor();
        annotations = next;
        redrawInk(pageIndex);
        layoutText(pageIndex);
        onDirty();
    }

    function bindPagePointer(pageIndex, ink) {
        ink.addEventListener('pointerdown', (event) => {
            if (event.button != null && event.button !== 0) return;
            if (tool === 'view') return;
            if (tool === 'text') {
                if (event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLButtonElement) return;
                if (event.target instanceof HTMLInputElement) return;
                const point = eventToPdf(pageIndex, event);
                if (!point) return;
                const record = pages.get(pageIndex);
                const reach = 14 / (record?.viewport?.scale || 1);
                const edited = lineAtPoint(
                    annotations.filter((ann) => ann.type === 'edit' && ann.pageIndex === pageIndex),
                    point,
                    reach
                );
                if (edited) {
                    openLineEditor(edited);
                    return;
                }
                const line = lineAtPoint(record?.lines || [], point, reach);
                if (line) {
                    beginTextEdit(pageIndex, line);
                    return;
                }
                event.preventDefault();
                closeLineEditor();
                placeText(pageIndex, event);
                return;
            }
            if (tool === 'eraser') {
                event.preventDefault();
                try {
                    ink.setPointerCapture(event.pointerId);
                } catch {
                    // Synthetic or already-ended pointers cannot be captured.
                }
                drawing = { pageIndex, pointerId: event.pointerId, points: [], type: 'eraser' };
                eraseAt(pageIndex, eventToPdf(pageIndex, event));
                return;
            }
            event.preventDefault();
            try {
                ink.setPointerCapture(event.pointerId);
            } catch {
                // Synthetic or already-ended pointers cannot be captured.
            }
            const point = eventToPdf(pageIndex, event);
            if (!point) return;
            drawing = {
                pageIndex,
                pointerId: event.pointerId,
                points: [point],
                type: tool === 'highlight' ? 'highlight' : 'ink',
                color: tool === 'highlight' ? '#ffe066' : penColor,
                width: tool === 'highlight' ? HIGHLIGHT_WIDTH : PEN_WIDTH,
            };
            redrawInk(pageIndex, drawing.points);
        });
        ink.addEventListener('pointermove', (event) => {
            if (!drawing || drawing.pointerId !== event.pointerId || drawing.pageIndex !== pageIndex) return;
            const coalesced = event.getCoalescedEvents?.() || [];
            const samples = coalesced.length ? coalesced : [event];
            if (drawing.type === 'eraser') {
                for (const sample of samples) eraseAt(pageIndex, eventToPdf(pageIndex, sample));
                return;
            }
            for (const sample of samples) {
                const point = eventToPdf(pageIndex, sample);
                if (!point) continue;
                const last = drawing.points[drawing.points.length - 1];
                if (last && Math.hypot(point.x - last.x, point.y - last.y) < 0.35) continue;
                drawing.points.push(point);
            }
            redrawInk(pageIndex, drawing.points);
        });
        const finish = (event) => {
            if (!drawing || drawing.pointerId !== event.pointerId || drawing.pageIndex !== pageIndex) return;
            const stroke = drawing;
            drawing = null;
            if (stroke.type === 'eraser') return;
            if (stroke.points.length) {
                annotations.push({
                    id: nextAnnId++,
                    pageIndex,
                    type: stroke.type,
                    color: stroke.color,
                    width: stroke.width,
                    points: stroke.points.slice(),
                });
                onDirty();
            }
            redrawInk(pageIndex);
        };
        ink.addEventListener('pointerup', finish);
        ink.addEventListener('pointercancel', finish);
    }

    async function render() {
        closeLineEditor();
        const token = ++renderToken;
        const doc = pdfDoc;
        if (!doc || !stage) return;
        const prevLeft = stage.scrollLeft;
        const prevTop = stage.scrollTop;
        const prevW = stage.clientWidth || 1;
        const prevH = stage.clientHeight || 1;
        const zoomRatio = renderedZoom > 0 ? userZoom / renderedZoom : 1;
        stage.replaceChildren();
        pages = new Map();
        const { fitWidth } = pageMetrics();
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        /** @type {IntersectionObserver | null} */
        let observer = null;
        const painted = new Set();
        const sheet = document.createElement('div');
        sheet.className = 'pdf-sheet';
        stage.appendChild(sheet);

        const paint = async (index) => {
            if (painted.has(index) || token !== renderToken) return;
            painted.add(index);
            const record = pages.get(index);
            if (!record || record.painted) return;
            record.painted = true;
            const page = await doc.getPage(index + 1);
            if (token !== renderToken) return;
            const canvas = record.shell.querySelector('.pdf-page-canvas');
            if (!(canvas instanceof HTMLCanvasElement)) return;
            canvas.width = Math.max(1, Math.round(record.viewport.width * dpr));
            canvas.height = Math.max(1, Math.round(record.viewport.height * dpr));
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            const params = { canvasContext: ctx, viewport: record.viewport };
            if (dpr !== 1) params.transform = [dpr, 0, 0, dpr, 0, 0];
            await page.render(params).promise;
            if (token !== renderToken) return;
            for (const ann of annotations) {
                if (ann.pageIndex !== index || ann.type !== 'edit' || !ann.coverPending) continue;
                const colors = sampleLineColors(record, ann);
                if (colors.pending) continue;
                ann.cover = colors.cover;
                ann.color = colors.color;
                ann.coverPending = false;
            }
            const live = drawing && drawing.pageIndex === index ? drawing.points : null;
            redrawInk(index, live);
        };

        for (let index = 0; index < doc.numPages; index += 1) {
            if (token !== renderToken) return;
            const page = await doc.getPage(index + 1);
            if (token !== renderToken) return;
            const base = page.getViewport({ scale: 1 });
            const scale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, (fitWidth / base.width) * userZoom));
            const viewport = page.getViewport({ scale });
            let lines = [];
            try {
                const content = await page.getTextContent();
                lines = groupPdfTextLines(content.items);
            } catch {
                lines = [];
            }
            const shell = document.createElement('div');
            shell.className = 'pdf-page';
            shell.style.width = `${viewport.width}px`;
            shell.style.height = `${viewport.height}px`;
            shell.dataset.page = String(index);
            const canvas = document.createElement('canvas');
            canvas.className = 'pdf-page-canvas';
            canvas.style.width = `${viewport.width}px`;
            canvas.style.height = `${viewport.height}px`;
            shell.appendChild(canvas);
            const ink = document.createElement('canvas');
            ink.className = 'pdf-ink';
            shell.appendChild(ink);
            sheet.appendChild(shell);
            pages.set(index, {
                viewport,
                width: viewport.width,
                height: viewport.height,
                shell,
                ink,
                painted: false,
                lines,
            });
            bindPagePointer(index, ink);
            layoutText(index);
        }

        if (token !== renderToken) return;
        observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (!entry.isIntersecting) continue;
                    const index = Number(entry.target.getAttribute('data-page'));
                    if (!Number.isFinite(index)) continue;
                    paint(index).catch(() => {});
                    observer?.unobserve(entry.target);
                }
            },
            { root: stage, rootMargin: '800px 0px' }
        );
        for (const record of pages.values()) observer.observe(record.shell);
        stage.scrollLeft = Math.max(0, (prevLeft + prevW / 2) * zoomRatio - stage.clientWidth / 2);
        stage.scrollTop = Math.max(0, (prevTop + prevH / 2) * zoomRatio - stage.clientHeight / 2);
        renderedZoom = userZoom;
        if (zoomLabel) zoomLabel.textContent = userZoom === 1 ? 'Fit' : `${Math.round(userZoom * 100)}%`;
        updatePageLabel();
    }

    function undo() {
        if (editingId != null && editInput instanceof HTMLInputElement) {
            const open = annotations.find((item) => item.id === editingId);
            if (open) open.text = editInput.value;
        }
        if (!annotations.length) return;
        if (editingId != null && annotations[annotations.length - 1]?.id === editingId) hideLineEditor();
        const removed = annotations.pop();
        if (!removed) return;
        if (removed.type === 'text') layoutText(removed.pageIndex);
        redrawInk(removed.pageIndex);
        syncUndo();
        hooks.onDirty?.();
    }

    function flushTextFields() {
        if (editingId != null && editInput instanceof HTMLInputElement) {
            const open = annotations.find((item) => item.id === editingId);
            if (open) open.text = editInput.value;
        }
        for (const box of root.querySelectorAll('.pdf-text-box')) {
            const id = Number(box.dataset.annId);
            const ann = annotations.find((item) => item.id === id);
            if (ann && box instanceof HTMLTextAreaElement) ann.text = box.value;
        }
    }

    function annotationIsSaved(ann) {
        if (ann.type === 'text') return String(ann.text || '').trim().length > 0;
        if (ann.type === 'edit') return ann.text !== ann.original;
        return Array.isArray(ann.points) && ann.points.length > 0;
    }

    function hasEdits() {
        flushTextFields();
        return annotations.some(annotationIsSaved);
    }

    function cloneAnnotation(ann) {
        return {
            id: ann.id,
            pageIndex: ann.pageIndex,
            type: ann.type,
            x: ann.x,
            y: ann.y,
            size: ann.size,
            color: ann.color,
            width: ann.width,
            text: ann.text || '',
            original: ann.original || '',
            cover: ann.cover ? { r: ann.cover.r, g: ann.cover.g, b: ann.cover.b } : undefined,
            points: Array.isArray(ann.points) ? ann.points.map((p) => ({ x: p.x, y: p.y })) : undefined,
        };
    }

    async function exportBytes(snapshot = annotations) {
        if (!baseBytes) throw new Error('No PDF is open');
        const lib = await loadPdfLib();
        let doc;
        try {
            doc = await lib.PDFDocument.load(baseBytes.slice(), { ignoreEncryption: true });
        } catch (err) {
            throw new Error(err?.message || 'This PDF can’t be edited');
        }
        const font = await doc.embedFont(lib.StandardFonts.Helvetica);
        for (const ann of snapshot) {
            let page;
            try {
                page = doc.getPage(ann.pageIndex);
            } catch {
                continue;
            }
            const color = hexToRgbUnit(ann.color);
            const rgb = lib.rgb(color.r, color.g, color.b);
            if (ann.type === 'ink' || ann.type === 'highlight') {
                const pts = Array.isArray(ann.points) ? ann.points : [];
                const width = ann.width || PEN_WIDTH;
                const opacity = ann.type === 'highlight' ? 0.45 : 1;
                if (pts.length === 1) {
                    page.drawCircle({
                        x: pts[0].x,
                        y: pts[0].y,
                        size: width / 2,
                        color: rgb,
                        opacity,
                        borderWidth: 0,
                    });
                    continue;
                }
                for (let i = 1; i < pts.length; i += 1) {
                    page.drawLine({
                        start: pts[i - 1],
                        end: pts[i],
                        thickness: width,
                        color: rgb,
                        opacity,
                        lineCap: lib.LineCapStyle.Round,
                    });
                }
                continue;
            }
            if (ann.type === 'edit') {
                const box = textLineBox(ann);
                const cover = ann.cover || { r: 1, g: 1, b: 1 };
                page.drawRectangle({
                    x: box.x,
                    y: box.y,
                    width: box.width,
                    height: box.height,
                    color: lib.rgb(cover.r, cover.g, cover.b),
                    borderWidth: 0,
                });
                const nextText = toWinAnsi(ann.text || '');
                if (nextText) {
                    page.drawText(nextText, {
                        x: ann.x,
                        y: ann.y,
                        size: ann.size || TEXT_SIZE,
                        font,
                        color: rgb,
                    });
                }
                continue;
            }
            if (ann.type === 'text') {
                const lines = toWinAnsi(ann.text || '').split('\n');
                let y = ann.y;
                const size = ann.size || TEXT_SIZE;
                for (const line of lines) {
                    if (line) {
                        page.drawText(line, {
                            x: Math.max(0, ann.x),
                            y,
                            size,
                            font,
                            color: rgb,
                        });
                    }
                    y -= size * 1.25;
                }
            }
        }
        const bytes = new Uint8Array(await doc.save({ useObjectStreams: false }));
        const pdfjs = await loadPdfJs();
        const check = await pdfjs.getDocument({ data: bytes.slice() }).promise;
        const pageCount = check.numPages;
        await check.destroy();
        if (!pageCount) throw new Error('The edited PDF could not be opened');
        return bytes;
    }

    async function open(bytes) {
        await close();
        setStatus('Opening PDF…');
        baseBytes = bytes.slice();
        annotations = [];
        userZoom = 1;
        renderedZoom = 1;
        syncUndo();
        try {
            const pdfjs = await loadPdfJs();
            const task = pdfjs.getDocument({ data: baseBytes.slice() });
            pdfDoc = await task.promise;
            setStatus('');
            await render();
        } catch (err) {
            setStatus(err?.message || 'Could not open this PDF');
            throw err;
        }
    }

    async function commitSaved(bytes, baked) {
        const bakedIds = new Set((baked || []).map((ann) => ann.id));
        annotations = annotations.filter((ann) => !bakedIds.has(ann.id));
        const scrollTop = stage?.scrollTop || 0;
        const scrollLeft = stage?.scrollLeft || 0;
        baseBytes = bytes.slice();
        if (pdfDoc) {
            try {
                await pdfDoc.destroy();
            } catch {
                // ignore
            }
            pdfDoc = null;
        }
        const pdfjs = await loadPdfJs();
        pdfDoc = await pdfjs.getDocument({ data: baseBytes.slice() }).promise;
        await render();
        if (stage) {
            stage.scrollTop = scrollTop;
            stage.scrollLeft = scrollLeft;
        }
        updatePageLabel();
        syncUndo();
    }

    async function close() {
        renderToken += 1;
        drawing = null;
        hideLineEditor();
        annotations = [];
        baseBytes = null;
        pages = new Map();
        if (stage) stage.replaceChildren();
        if (pdfDoc) {
            try {
                await pdfDoc.destroy();
            } catch {
                // ignore
            }
        }
        pdfDoc = null;
        setStatus('');
        if (pageLabel) pageLabel.textContent = '';
        syncUndo();
    }

    toolButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
            const next = btn.getAttribute('data-pdf-tool');
            if (next) setTool(next);
        });
    });
    colorButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
            const next = btn.getAttribute('data-pdf-color');
            if (!next) return;
            penColor = next;
            colorButtons.forEach((other) => other.classList.toggle('is-active', other === btn));
            setTool('pen');
        });
    });
    undoBtn?.addEventListener('click', () => undo());
    editInput?.addEventListener('input', () => {
        const ann = annotations.find((item) => item.id === editingId);
        if (!ann || !(editInput instanceof HTMLInputElement)) return;
        ann.text = editInput.value;
        redrawInk(ann.pageIndex);
        onDirty();
    });
    editInput?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            closeLineEditor();
        } else if (event.key === 'Escape') {
            event.preventDefault();
            closeLineEditor({ revert: true });
        }
    });
    editInput?.addEventListener('blur', () => {
        window.setTimeout(() => {
            if (document.activeElement === editInput || editingId == null) return;
            closeLineEditor();
        }, 180);
    });
    editDone?.addEventListener('click', () => closeLineEditor());
    root.querySelector('#pdf-zoom-in')?.addEventListener('click', () => {
        userZoom = Math.min(MAX_ZOOM, Math.round(userZoom * 1.25 * 100) / 100);
        render().catch(() => {});
    });
    root.querySelector('#pdf-zoom-out')?.addEventListener('click', () => {
        userZoom = Math.max(MIN_ZOOM, Math.round((userZoom / 1.25) * 100) / 100);
        if (userZoom < 1.05 && userZoom > 0.95) userZoom = 1;
        render().catch(() => {});
    });
    stage?.addEventListener('scroll', () => updatePageLabel(), { passive: true });

    let lastTap = 0;
    stage?.addEventListener('pointerup', (event) => {
        if (tool !== 'view') return;
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        const now = Date.now();
        if (now - lastTap < 280) {
            userZoom = userZoom === 1 ? 2 : 1;
            lastTap = 0;
            render().catch(() => {});
            return;
        }
        lastTap = now;
    });

    /** @type {Map<number, { x: number, y: number }>} */
    const pointers = new Map();
    let pinch = null;
    stage?.addEventListener('pointerdown', (event) => {
        if (tool !== 'view') return;
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (pointers.size === 2) {
            const [a, b] = [...pointers.values()];
            const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
            pinch = { dist, zoom: userZoom };
        }
    });
    stage?.addEventListener('pointermove', (event) => {
        if (!pointers.has(event.pointerId) || !pinch) return;
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (pointers.size < 2) return;
        const [a, b] = [...pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, pinch.zoom * (dist / pinch.dist)));
        if (Math.abs(next - userZoom) < 0.04) return;
        userZoom = next;
        if (zoomLabel) zoomLabel.textContent = `${Math.round(userZoom * 100)}%`;
    });
    const endPointer = (event) => {
        const wasPinch = pointers.size >= 2;
        pointers.delete(event.pointerId);
        if (pointers.size < 2) {
            pinch = null;
            if (wasPinch) render().catch(() => {});
        }
    };
    stage?.addEventListener('pointerup', endPointer);
    stage?.addEventListener('pointercancel', endPointer);

    let resizeTimer = 0;
    window.addEventListener('resize', () => {
        if (!pdfDoc) return;
        if (root.contains(document.activeElement) && document.activeElement?.classList.contains('pdf-text-box')) {
            return;
        }
        window.clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(() => {
            render().catch(() => {});
        }, 150);
    });

    syncToolUi();
    syncUndo();

    return {
        open,
        close,
        undo,
        hasEdits,
        exportBytes,
        commitSaved,
        snapshot() {
            if (drawing && drawing.type !== 'eraser' && drawing.points?.length) {
                const stroke = drawing;
                drawing = null;
                annotations.push({
                    id: nextAnnId++,
                    pageIndex: stroke.pageIndex,
                    type: stroke.type,
                    color: stroke.color,
                    width: stroke.width,
                    points: stroke.points.slice(),
                });
                redrawInk(stroke.pageIndex);
            }
            flushTextFields();
            return annotations.filter(annotationIsSaved).map(cloneAnnotation);
        },
    };
}
