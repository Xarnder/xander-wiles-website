/** Slim-phone press-hold-drag picker for the editor display modes. */

const SLIM_QUERY = '(max-width: 767.98px)';
const HOLD_MS = 200;
const DRAG_OPEN_PX = 8;
const CANCEL_PX = 18;

export function isSlimViewModePicker() {
    return window.matchMedia(SLIM_QUERY).matches;
}

/**
 * Selection still goes through each button's click listener.
 * On a slim screen those trusted clicks are ignored so this gesture owns the change.
 * @param {HTMLElement | null} bar
 */
export function initViewModePicker(bar) {
    if (!bar || bar.dataset.pickerBound === '1') return;
    bar.dataset.pickerBound = '1';
    bar.setAttribute('aria-expanded', 'false');

    let session = null;

    function menuEl() {
        return bar.querySelector('.view-mode-menu');
    }

    function moreEl() {
        return bar.querySelector('.view-mode-more');
    }

    function buttonAt(x, y) {
        const el = document.elementFromPoint(x, y);
        const btn = el && el.closest ? el.closest('.view-mode-btn') : null;
        if (!btn || !bar.contains(btn)) return null;
        return btn;
    }

    function setHighlight(btn) {
        for (const candidate of bar.querySelectorAll('.view-mode-btn')) {
            candidate.classList.toggle('is-drag-over', candidate === btn);
        }
        if (session) session.highlight = btn || null;
    }

    function openMenu(latched) {
        bar.classList.add('is-picking');
        bar.dataset.pickLatch = latched ? '1' : '';
        const menu = menuEl();
        if (menu) menu.hidden = false;
        moreEl()?.setAttribute('aria-expanded', 'true');
        document.documentElement.classList.add('is-view-mode-picking');
    }

    function closeMenu() {
        bar.classList.remove('is-picking');
        delete bar.dataset.pickLatch;
        const menu = menuEl();
        if (menu) menu.hidden = true;
        moreEl()?.setAttribute('aria-expanded', 'false');
        document.documentElement.classList.remove('is-view-mode-picking');
        setHighlight(null);
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
        if (!isSlimViewModePicker()) return;
        if (event.button != null && event.button !== 0) return;
        if (session) return;
        const main = event.target instanceof Element ? event.target.closest('.view-mode-btn--main') : null;
        if (main && bar.contains(main)) {
            if (bar.classList.contains('is-picking')) closeMenu();
            return;
        }

        const latched = bar.classList.contains('is-picking') && bar.dataset.pickLatch === '1';
        session = {
            id: event.pointerId,
            originX: event.clientX,
            originY: event.clientY,
            x: event.clientX,
            y: event.clientY,
            opened: latched,
            highlight: null,
            timer: null,
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
    });

    function finish(event) {
        if (!session || event.pointerId !== session.id) return;
        const opened = session.opened;
        const highlight = session.highlight;
        endSession(event.pointerId);

        if (opened) {
            if (highlight?.dataset.viewMode) highlight.click();
            closeMenu();
            return;
        }

        openMenu(true);
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
        if (!isSlimViewModePicker()) closeMenu();
    });
}
