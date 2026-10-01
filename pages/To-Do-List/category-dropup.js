/** Slim-phone press-hold-drag category picker for the full-screen task editor. */

const SLIM_QUERY = '(max-width: 500px)';
const HOLD_MS = 180;
const DRAG_OPEN_PX = 8;
const CANCEL_PX = 18;
const BUTTON_SELECTOR = '.tag-mode-btn';

export function isSlimCategoryDropup() {
    return window.matchMedia(SLIM_QUERY).matches;
}

let measureCtx = null;

function measureLabelWidth(text, sizePx, fontFamily) {
    if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
    measureCtx.font = `800 ${sizePx}px ${fontFamily}`;
    return measureCtx.measureText(text).width;
}

/** Largest bold size that fits each visible category label inside its button. */
export function fitCategoryDropupText(bar) {
    if (!bar) return;
    const buttons = bar.querySelectorAll(BUTTON_SELECTOR);
        if (!isSlimCategoryDropup()) {
        for (const btn of buttons) {
            btn.style.removeProperty('font-size');
            btn.style.removeProperty('line-height');
            btn.style.removeProperty('font-weight');
        }
        return;
    }

    const picking = bar.classList.contains('is-picking');
    for (const btn of buttons) {
        if (!picking && !btn.classList.contains('is-selected')) continue;
        const cs = getComputedStyle(btn);
        if (cs.display === 'none' || btn.clientWidth < 8 || btn.clientHeight < 8) continue;
        const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
        const padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
        const chevron = !picking && btn.classList.contains('is-selected') ? 22 : 0;
        const maxW = Math.max(8, btn.clientWidth - padX - chevron - 2);
        const maxH = Math.max(8, Math.floor(btn.clientHeight - padY - 2));
        const text = (btn.textContent || '').trim();
        let lo = 8;
        let hi = maxH;
        let best = lo;
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            if (measureLabelWidth(text, mid, cs.fontFamily || 'sans-serif') <= maxW) {
                best = mid;
                lo = mid + 1;
            } else {
                hi = mid - 1;
            }
        }
        btn.style.setProperty('font-weight', '800', 'important');
        btn.style.setProperty('line-height', '1', 'important');
        btn.style.setProperty('font-size', `${best}px`, 'important');
    }
}

function pickingHost(bar) {
    return bar.closest('.add-task-composer') || bar.closest('.app-header');
}

/**
 * One-gesture category change on a narrow screen.
 * Wider layouts keep the existing tap-to-select buttons.
 * @param {HTMLElement | null} bar
 * @param {(tagId: string) => void} onSelect
 */
export function initCategoryDropup(bar, onSelect) {
    if (!bar || bar.dataset.dropupBound === '1' || typeof onSelect !== 'function') return;
    bar.dataset.dropupBound = '1';
    bar.setAttribute('aria-expanded', 'false');

    let session = null;

    function buttonAt(x, y) {
        const el = document.elementFromPoint(x, y);
        const btn = el && el.closest ? el.closest(BUTTON_SELECTOR) : null;
        if (!btn || !bar.contains(btn)) return null;
        return btn;
    }

    function setHighlight(btn) {
        for (const candidate of bar.querySelectorAll(BUTTON_SELECTOR)) {
            candidate.classList.toggle('is-drag-over', candidate === btn);
        }
        if (session) session.highlight = btn || null;
    }

    function fitMenu() {
        const slot = bar.parentElement;
        const slotTop = slot ? slot.getBoundingClientRect().top : window.innerHeight * 0.5;
        const available = Math.max(140, slotTop - 8);
        const count = Math.max(1, bar.querySelectorAll(BUTTON_SELECTOR).length);
        const gap = 4;
        const pad = 12;
        const inner = available - pad;
        let row = Math.floor((inner - gap * (count - 1)) / count);
        row = Math.min(56, Math.max(30, row));
        bar.style.setProperty('--category-row-h', `${row}px`);
        bar.style.maxHeight = `${available}px`;
    }

    function openMenu(latched) {
        fitMenu();
        bar.classList.add('is-picking');
        bar.dataset.pickLatch = latched ? '1' : '';
        bar.setAttribute('aria-expanded', 'true');
        const root = pickingHost(bar);
        if (root) root.classList.add('is-category-picking');
        fitCategoryDropupText(bar);
    }

    function closeMenu() {
        bar.classList.remove('is-picking');
        delete bar.dataset.pickLatch;
        bar.setAttribute('aria-expanded', 'false');
        bar.style.removeProperty('max-height');
        const root = pickingHost(bar);
        if (root) root.classList.remove('is-category-picking');
        setHighlight(null);
        fitCategoryDropupText(bar);
    }

    function endSession(pointerId) {
        if (!session) return;
        clearTimeout(session.timer);
        if (pointerId != null) {
            try { bar.releasePointerCapture(pointerId); } catch (_) {}
        }
        session = null;
    }

    bar.addEventListener('pointerdown', (event) => {
        if (!isSlimCategoryDropup()) return;
        if (event.button != null && event.button !== 0) return;
        if (session) return;
        if (!event.target.closest || !event.target.closest(BUTTON_SELECTOR)) return;

        const latched = bar.classList.contains('is-picking') && bar.dataset.pickLatch === '1';
        session = {
            id: event.pointerId,
            originX: event.clientX,
            originY: event.clientY,
            x: event.clientX,
            y: event.clientY,
            opened: latched,
            highlight: null,
            timer: null
        };
        try { bar.setPointerCapture(event.pointerId); } catch (_) {}
        event.preventDefault();

        if (latched) {
            setHighlight(buttonAt(event.clientX, event.clientY));
            return;
        }

        session.timer = setTimeout(() => {
            if (!session || session.id !== event.pointerId || session.opened) return;
            session.opened = true;
            openMenu(false);
            setHighlight(buttonAt(session.x, session.y));
        }, HOLD_MS);
    });

    bar.addEventListener('pointermove', (event) => {
        if (!session || event.pointerId !== session.id) return;
        session.x = event.clientX;
        session.y = event.clientY;
        const dx = event.clientX - session.originX;
        const dy = event.clientY - session.originY;

        if (!session.opened) {
            if (Math.abs(dy) >= DRAG_OPEN_PX && Math.abs(dy) >= Math.abs(dx)) {
                clearTimeout(session.timer);
                session.opened = true;
                openMenu(false);
                setHighlight(buttonAt(event.clientX, event.clientY));
                event.preventDefault();
                return;
            }
            if (Math.hypot(dx, dy) >= CANCEL_PX) endSession(event.pointerId);
            return;
        }

        event.preventDefault();
        setHighlight(buttonAt(event.clientX, event.clientY));
    }, { passive: false });

    function finish(event) {
        if (!session || event.pointerId !== session.id) return;
        const opened = session.opened;
        const highlight = session.highlight;
        endSession(event.pointerId);
        bar.dataset.suppressClick = '1';
        setTimeout(() => { delete bar.dataset.suppressClick; }, 400);

        if (!opened) {
            openMenu(true);
            return;
        }

        const tagId = highlight && highlight.dataset.tagId;
        closeMenu();
        if (tagId) onSelect(tagId);
    }

    bar.addEventListener('pointerup', finish);
    bar.addEventListener('pointercancel', (event) => {
        if (!session || event.pointerId !== session.id) return;
        endSession(event.pointerId);
        closeMenu();
    });

    document.addEventListener('pointerdown', (event) => {
        if (session) return;
        if (!bar.classList.contains('is-picking')) return;
        if (bar.contains(event.target)) return;
        closeMenu();
    });

    window.addEventListener('resize', () => {
        if (!isSlimCategoryDropup()) {
            if (bar.classList.contains('is-picking')) closeMenu();
            else fitCategoryDropupText(bar);
            return;
        }
        if (bar.classList.contains('is-picking')) fitMenu();
        fitCategoryDropupText(bar);
    });
}

export function closeCategoryDropup(bar) {
    if (!bar) return;
    bar.classList.remove('is-picking');
    delete bar.dataset.pickLatch;
    bar.setAttribute('aria-expanded', 'false');
    bar.style.removeProperty('max-height');
    const root = pickingHost(bar);
    if (root) root.classList.remove('is-category-picking');
    for (const candidate of bar.querySelectorAll(BUTTON_SELECTOR)) {
        candidate.classList.remove('is-drag-over');
    }
    fitCategoryDropupText(bar);
}
