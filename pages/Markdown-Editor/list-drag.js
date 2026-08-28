/**
 * Pointer-driven list reorder: the dragged row follows the finger while a
 * placeholder slot slides through the list so the gap under the pointer is
 * the index that will actually be committed.
 */

const SHIFT_MS = 220;
const SHIFT_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';
const AUTO_SCROLL_EDGE_PX = 56;
const AUTO_SCROLL_MAX_PX = 16;
const TOUCH_MOVE_OPTS = { passive: false };

function prefersReducedMotion() {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function listItems(listEl) {
    return [...listEl.querySelectorAll(':scope > .mdlist-item')];
}

/**
 * Insert index among remaining rows (the list without the dragged item).
 * Uses each row's current midpoint so the gap already opened by the
 * placeholder is the stable drop target (hysteresis when crossing).
 * @param {number} clientY
 * @param {Array<{ top: number, height: number }>} rects
 * @returns {number} 0..rects.length (after-removal insert index)
 */
export function insertIndexFromRects(clientY, rects) {
    for (let i = 0; i < rects.length; i += 1) {
        const rect = rects[i];
        if (clientY < rect.top + rect.height / 2) return i;
    }
    return rects.length;
}

function translateYFromTransform(el) {
    const transform = getComputedStyle(el).transform;
    if (!transform || transform === 'none') return 0;
    if (transform.startsWith('matrix3d(')) {
        const parts = transform.slice(9, -1).split(',').map(Number);
        return parts[13] || 0;
    }
    if (transform.startsWith('matrix(')) {
        const parts = transform.slice(7, -1).split(',').map(Number);
        return parts[5] || 0;
    }
    return 0;
}

/**
 * Layout (untransformed) vertical box so in-flight FLIP slides do not
 * flicker the drop index back and forth.
 * @param {Element} el
 * @returns {{ top: number, height: number }}
 */
function layoutBox(el) {
    const rect = el.getBoundingClientRect();
    return { top: rect.top - translateYFromTransform(el), height: rect.height };
}

/**
 * @param {number} clientY
 * @param {Element[]} elements
 * @returns {number}
 */
export function insertIndexFromMidpoints(clientY, elements) {
    return insertIndexFromRects(clientY, elements.map(layoutBox));
}

function nearestScrollYParent(el) {
    let node = el.parentElement;
    while (node && node !== document.documentElement) {
        const style = getComputedStyle(node);
        const canScroll = /(auto|scroll|overlay)/.test(style.overflowY);
        if (canScroll && node.scrollHeight > node.clientHeight + 1) return node;
        node = node.parentElement;
    }
    return document.scrollingElement || document.documentElement;
}

function clearShiftStyles(el) {
    el.style.removeProperty('transition');
    el.style.removeProperty('transform');
}

/**
 * Interruptible FLIP: measure current visual tops, apply a DOM move, then
 * invert so siblings (and the placeholder) slide into the new layout.
 * @param {HTMLElement[]} elements
 * @param {() => void} applyLayout
 */
function animateReorderShift(elements, applyLayout) {
    const reduced = prefersReducedMotion() || !elements.length;
    const first = new Map();
    if (!reduced) {
        for (const el of elements) {
            first.set(el, el.getBoundingClientRect().top);
        }
        for (const el of elements) {
            el.style.transition = 'none';
            el.style.transform = '';
        }
    }
    applyLayout();
    if (reduced) return;
    for (const el of elements) {
        const last = el.getBoundingClientRect().top;
        const dy = (first.get(el) ?? last) - last;
        if (Math.abs(dy) > 0.5) el.style.transform = `translateY(${dy}px)`;
    }
    if (elements[0]) void elements[0].getBoundingClientRect();
    for (const el of elements) {
        el.style.transition = `transform ${SHIFT_MS}ms ${SHIFT_EASING}`;
        el.style.transform = '';
    }
}

function preventTouchScroll(event) {
    event.preventDefault();
}

/**
 * @param {HTMLElement} handle
 * @param {HTMLElement} row
 * @param {{ onDropIndex: (newIndex: number) => void }} options
 *   `onDropIndex` receives the after-removal insert index (0..n-1).
 */
export function attachPointerDrag(handle, row, { onDropIndex }) {
    let dragging = false;
    let pointerId = null;
    let startY = 0;
    let originLeft = 0;
    let originTop = 0;
    let fromIndex = -1;
    let toIndex = -1;
    let listEl = null;
    let placeholder = null;
    let scrollParent = null;
    let lastClientY = 0;
    let autoScrollRaf = 0;
    let suppressClick = false;

    const onSuppressClick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        handle.removeEventListener('click', onSuppressClick, true);
    };

    const stopAutoScroll = () => {
        if (autoScrollRaf) {
            cancelAnimationFrame(autoScrollRaf);
            autoScrollRaf = 0;
        }
    };

    const positionGhost = (clientY) => {
        const dy = clientY - startY;
        row.style.transform = `translate3d(${originLeft}px, ${originTop + dy}px, 0)`;
    };

    const movePlaceholderTo = (nextIndex) => {
        if (!placeholder || !listEl || nextIndex === toIndex) return;
        const others = listItems(listEl);
        const shifting = [...others, placeholder];
        animateReorderShift(shifting, () => {
            if (nextIndex >= others.length) {
                listEl.appendChild(placeholder);
            } else {
                listEl.insertBefore(placeholder, others[nextIndex]);
            }
        });
        toIndex = nextIndex;
    };

    const syncDropIndex = (clientY) => {
        if (!listEl) return;
        movePlaceholderTo(insertIndexFromMidpoints(clientY, listItems(listEl)));
    };

    const tickAutoScroll = () => {
        autoScrollRaf = 0;
        if (!dragging || !scrollParent) return;
        const viewport = window.visualViewport;
        const viewTop = viewport ? viewport.offsetTop : 0;
        const viewBottom = viewport ? viewport.offsetTop + viewport.height : window.innerHeight;
        const parentBox =
            scrollParent === document.scrollingElement || scrollParent === document.documentElement
                ? { top: viewTop, bottom: viewBottom }
                : scrollParent.getBoundingClientRect();
        const topEdge = Math.max(parentBox.top, viewTop);
        const bottomEdge = Math.min(parentBox.bottom, viewBottom);
        const y = lastClientY;
        let delta = 0;
        if (y < topEdge + AUTO_SCROLL_EDGE_PX) {
            const t = (topEdge + AUTO_SCROLL_EDGE_PX - y) / AUTO_SCROLL_EDGE_PX;
            delta = -Math.ceil(AUTO_SCROLL_MAX_PX * Math.min(1, Math.max(0, t)));
        } else if (y > bottomEdge - AUTO_SCROLL_EDGE_PX) {
            const t = (y - (bottomEdge - AUTO_SCROLL_EDGE_PX)) / AUTO_SCROLL_EDGE_PX;
            delta = Math.ceil(AUTO_SCROLL_MAX_PX * Math.min(1, Math.max(0, t)));
        }
        if (!delta) return;
        if (scrollParent === document.scrollingElement || scrollParent === document.documentElement) {
            window.scrollBy(0, delta);
        } else {
            scrollParent.scrollTop += delta;
        }
        syncDropIndex(lastClientY);
        autoScrollRaf = requestAnimationFrame(tickAutoScroll);
    };

    const unbindWindow = () => {
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('pointercancel', onPointerUp);
        document.removeEventListener('touchmove', preventTouchScroll, TOUCH_MOVE_OPTS);
        document.documentElement.classList.remove('is-mdlist-sorting');
    };

    const teardown = () => {
        stopAutoScroll();
        unbindWindow();
        if (listEl) {
            listEl.classList.remove('is-sorting');
            for (const el of listItems(listEl)) clearShiftStyles(el);
        }
        if (placeholder) {
            clearShiftStyles(placeholder);
            if (placeholder.parentElement && row.isConnected) {
                placeholder.replaceWith(row);
            } else {
                placeholder.remove();
            }
            placeholder = null;
        } else if (row.parentElement === document.body && listEl?.isConnected) {
            listEl.appendChild(row);
        }
        row.classList.remove('is-dragging', 'is-drag-ghost');
        row.style.removeProperty('position');
        row.style.removeProperty('left');
        row.style.removeProperty('top');
        row.style.removeProperty('width');
        row.style.removeProperty('height');
        row.style.removeProperty('margin');
        row.style.removeProperty('z-index');
        row.style.removeProperty('pointer-events');
        row.style.removeProperty('box-sizing');
        row.style.removeProperty('will-change');
        row.style.removeProperty('transform');
        try {
            if (pointerId != null) handle.releasePointerCapture(pointerId);
        } catch {
            // ignore
        }
        listEl = null;
        scrollParent = null;
        pointerId = null;
        dragging = false;
    };

    const onPointerMove = (event) => {
        if (!dragging || event.pointerId !== pointerId) return;
        lastClientY = event.clientY;
        positionGhost(event.clientY);
        syncDropIndex(event.clientY);
        if (!autoScrollRaf) autoScrollRaf = requestAnimationFrame(tickAutoScroll);
        if (Math.abs(event.clientY - startY) > 4) suppressClick = true;
    };

    const onPointerUp = (event) => {
        if (!dragging || event.pointerId !== pointerId) return;
        const dropIndex = toIndex;
        const origin = fromIndex;
        teardown();
        if (suppressClick) {
            handle.addEventListener('click', onSuppressClick, true);
            window.setTimeout(() => handle.removeEventListener('click', onSuppressClick, true), 400);
        }
        if (dropIndex >= 0 && dropIndex !== origin) onDropIndex(dropIndex);
    };

    const onPointerDown = (event) => {
        if (dragging) return;
        if (event.button != null && event.button !== 0) return;
        const parent = row.parentElement;
        if (!parent) return;

        event.preventDefault();
        dragging = true;
        suppressClick = false;
        pointerId = event.pointerId;
        lastClientY = event.clientY;
        listEl = parent;
        scrollParent = nearestScrollYParent(listEl);

        const items = listItems(listEl);
        fromIndex = items.indexOf(row);
        toIndex = fromIndex;
        if (fromIndex < 0) {
            dragging = false;
            pointerId = null;
            listEl = null;
            return;
        }

        const rect = row.getBoundingClientRect();
        startY = event.clientY;
        originLeft = rect.left;
        originTop = rect.top;

        placeholder = document.createElement('li');
        placeholder.className = 'mdlist-drag-placeholder';
        placeholder.setAttribute('aria-hidden', 'true');
        placeholder.style.height = `${rect.height}px`;
        row.after(placeholder);

        listEl.classList.add('is-sorting');
        document.documentElement.classList.add('is-mdlist-sorting');

        row.classList.add('is-dragging', 'is-drag-ghost');
        row.style.position = 'fixed';
        row.style.left = '0';
        row.style.top = '0';
        row.style.width = `${rect.width}px`;
        row.style.height = `${rect.height}px`;
        row.style.margin = '0';
        row.style.zIndex = '10000';
        row.style.pointerEvents = 'none';
        row.style.boxSizing = 'border-box';
        row.style.willChange = 'transform';
        document.body.appendChild(row);
        positionGhost(event.clientY);

        try {
            handle.setPointerCapture(pointerId);
        } catch {
            // Window listeners still track the gesture.
        }
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
        window.addEventListener('pointercancel', onPointerUp);
        document.addEventListener('touchmove', preventTouchScroll, TOUCH_MOVE_OPTS);
    };

    handle.addEventListener('pointerdown', onPointerDown);
    handle.addEventListener('contextmenu', (event) => {
        if (dragging) event.preventDefault();
    });
}
