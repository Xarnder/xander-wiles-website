/**
 * Pinch / pan / double-tap / wheel zoom for the full-screen image viewer.
 * Pure math up top (unit-tested); the DOM controller below drives one <img>
 * inside a stage with `touch-action: none`.
 *
 * Coordinates: translate (x, y) is the image centre’s offset from the stage
 * centre in CSS px; scale 1 = image fitted to the stage.
 */

export const MIN_SCALE = 1;
export const MAX_SCALE = 8;
export const DOUBLE_TAP_SCALE = 2.5;
/** Pinch may overshoot this far before springing back. */
const RUBBER_MIN = 0.7;
const TAP_SLOP_PX = 10;
const TAP_MS = 300;
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_SLOP_PX = 32;
const DISMISS_DISTANCE_PX = 110;
const DISMISS_VELOCITY = 0.6; // px per ms
const SWIPE_DISTANCE_PX = 70;
const SWIPE_VELOCITY = 0.45; // px per ms
/** Drag resistance at the first / last image. */
const SWIPE_EDGE_RESISTANCE = 0.25;

/**
 * Fit an image inside the stage (contain), but never stretch it past one image
 * pixel per CSS pixel — small images stay crisp instead of blurry.
 * @returns {{ w: number, h: number }}
 */
export function fitSize(stageW, stageH, imgW, imgH) {
    if (!(stageW > 0 && stageH > 0 && imgW > 0 && imgH > 0)) return { w: 0, h: 0 };
    const scale = Math.min(stageW / imgW, stageH / imgH, 1);
    return { w: imgW * scale, h: imgH * scale };
}

/** Keep the image covering the stage when zoomed; centred when smaller. */
export function clampPan(view, fit, stageW, stageH) {
    const maxX = Math.max(0, (fit.w * view.scale - stageW) / 2);
    const maxY = Math.max(0, (fit.h * view.scale - stageH) / 2);
    return {
        scale: view.scale,
        x: Math.min(maxX, Math.max(-maxX, view.x)) || 0,
        y: Math.min(maxY, Math.max(-maxY, view.y)) || 0,
    };
}

/**
 * Zoom keeping the stage point (px, py) — relative to the stage centre — fixed.
 */
export function zoomAround(view, nextScale, px, py) {
    const ratio = nextScale / view.scale;
    return {
        scale: nextScale,
        x: px - (px - view.x) * ratio,
        y: py - (py - view.y) * ratio,
    };
}

export function clampScale(scale, min = MIN_SCALE, max = MAX_SCALE) {
    return Math.min(max, Math.max(min, scale));
}

/**
 * Is the shown bitmap too coarse for the current zoom?
 * @param {number} displayDevicePx on-screen long edge of the image in device pixels
 * @param {number} shownPx long edge of the bitmap being shown
 * @param {number} fullPx long edge of the original (0 if unknown)
 */
export function wantsMoreDetail(displayDevicePx, shownPx, fullPx) {
    if (!(displayDevicePx > 0 && shownPx > 0)) return false;
    if (fullPx && fullPx <= shownPx * 1.05) return false;
    return displayDevicePx > shownPx * 1.15;
}

/**
 * @param {HTMLElement} stage
 * @param {HTMLImageElement} img
 * @param {{
 *   onTap?: () => void,
 *   onDismiss?: () => void,
 *   onSettle?: (info: { scale: number, displayDevicePx: number }) => void,
 *   onDrag?: (progress: number) => void,
 *   onSwipe?: (direction: 'prev'|'next') => void,
 *   canSwipe?: (direction: 'prev'|'next') => boolean,
 * }} handlers
 */
export function createImageZoom(stage, img, handlers = {}) {
    let view = { scale: 1, x: 0, y: 0 };
    let fit = { w: 0, h: 0 };
    /**
     * Long edge of the original in pixels. The shape always comes from the bitmap
     * (Drive’s width/height ignore EXIF rotation); this only sets the true size so
     * swapping a screen copy for the original never jumps.
     */
    let fullLong = 0;
    let dismissY = 0;
    /** Horizontal drag offset while swiping between images (not zoomed). */
    let swipeX = 0;

    /** @type {Map<number, { x: number, y: number }>} */
    const pointers = new Map();
    let gesture = null;
    let lastTap = null;
    let tapTimer = 0;
    let wheelTimer = 0;

    const dpr = () => window.devicePixelRatio || 1;
    const stageRect = () => stage.getBoundingClientRect();

    function dims() {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        if (!fullLong || !w || !h) return { w, h };
        const k = fullLong / Math.max(w, h);
        return { w: w * k, h: h * k };
    }

    const displayDevicePx = () => Math.max(fit.w, fit.h) * view.scale * dpr();

    function render({ animate = false } = {}) {
        img.classList.toggle('is-animating', animate);
        img.style.width = `${fit.w}px`;
        img.style.height = `${fit.h}px`;
        img.style.transform = `translate(-50%, -50%) translate(${view.x + swipeX}px, ${view.y + dismissY}px) scale(${view.scale})`;
        stage.classList.toggle('is-zoomed', view.scale > 1.01);
    }

    function layout() {
        const { w, h } = dims();
        const fitNext = fitSize(stage.clientWidth, stage.clientHeight, w, h);
        if (fit.w && fitNext.w) {
            // Keep the same visual zoom across rotations / resizes.
            const ratio = fitNext.w / fit.w;
            view = { scale: view.scale, x: view.x * ratio, y: view.y * ratio };
        }
        fit = fitNext;
        view = clampPan(view, fit, stage.clientWidth, stage.clientHeight);
        render();
    }

    function settle({ animate = true } = {}) {
        const scale = clampScale(view.scale);
        if (scale !== view.scale) {
            view = zoomAround(view, scale, 0, 0);
        }
        view = clampPan(view, fit, stage.clientWidth, stage.clientHeight);
        render({ animate });
        handlers.onSettle?.({ scale: view.scale, displayDevicePx: displayDevicePx() });
    }

    function pointFromEvent(event) {
        const r = stageRect();
        return { x: event.clientX - r.left - r.width / 2, y: event.clientY - r.top - r.height / 2 };
    }

    function startGesture() {
        const pts = [...pointers.values()];
        if (pts.length >= 2) {
            const [a, b] = pts;
            gesture = {
                type: 'pinch',
                startDist: Math.hypot(b.x - a.x, b.y - a.y) || 1,
                startMid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
                startView: { ...view },
                moved: true,
            };
        } else if (pts.length === 1) {
            gesture = {
                type: 'pan',
                start: { ...pts[0] },
                last: { ...pts[0] },
                startView: { ...view },
                startTime: performance.now(),
                lastTime: performance.now(),
                velocityX: 0,
                velocityY: 0,
                axis: '',
                moved: false,
            };
        } else {
            gesture = null;
        }
    }

    function onPointerDown(event) {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        try {
            stage.setPointerCapture?.(event.pointerId);
        } catch {
            // Pointer already gone (e.g. interrupted touch) — tracking still works without capture.
        }
        pointers.set(event.pointerId, pointFromEvent(event));
        img.classList.remove('is-animating');
        startGesture();
    }

    function onPointerMove(event) {
        if (!pointers.has(event.pointerId)) return;
        pointers.set(event.pointerId, pointFromEvent(event));
        if (!gesture) return;
        event.preventDefault();
        const pts = [...pointers.values()];

        if (gesture.type === 'pinch' && pts.length >= 2) {
            const [a, b] = pts;
            const dist = Math.hypot(b.x - a.x, b.y - a.y);
            const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
            const raw = gesture.startView.scale * (dist / gesture.startDist);
            const scale = Math.min(MAX_SCALE * 1.25, Math.max(RUBBER_MIN, raw));
            // Zoom around the starting midpoint, then follow the midpoint as it moves.
            const zoomed = zoomAround(gesture.startView, scale, gesture.startMid.x, gesture.startMid.y);
            view = { scale, x: zoomed.x + (mid.x - gesture.startMid.x), y: zoomed.y + (mid.y - gesture.startMid.y) };
            render();
            return;
        }

        if (gesture.type === 'pan' && pts.length === 1) {
            const p = pts[0];
            const dx = p.x - gesture.start.x;
            const dy = p.y - gesture.start.y;
            if (!gesture.moved && Math.hypot(dx, dy) > TAP_SLOP_PX) gesture.moved = true;
            if (!gesture.moved) return;
            const now = performance.now();
            const dt = Math.max(1, now - gesture.lastTime);
            gesture.velocityX = (p.x - gesture.last.x) / dt;
            gesture.velocityY = (p.y - gesture.last.y) / dt;
            gesture.last = { ...p };
            gesture.lastTime = now;
            if (gesture.startView.scale > 1.01) {
                view = clampPan(
                    { scale: view.scale, x: gesture.startView.x + dx, y: gesture.startView.y + dy },
                    fit,
                    stage.clientWidth,
                    stage.clientHeight
                );
            } else {
                // Not zoomed: lock to the first clear direction.
                if (!gesture.axis) gesture.axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
                if (gesture.axis === 'x' && handlers.onSwipe) {
                    // Horizontal drag steps between images (resists at the ends).
                    const can = handlers.canSwipe?.(dx < 0 ? 'next' : 'prev') ?? true;
                    swipeX = can ? dx : dx * SWIPE_EDGE_RESISTANCE;
                } else if (gesture.axis === 'y' && handlers.onDismiss && event.pointerType !== 'mouse') {
                    // Vertical drag pulls the photo away to close.
                    dismissY = dy;
                    handlers.onDrag?.(Math.min(1, Math.abs(dy) / (stage.clientHeight * 0.5)));
                }
            }
            render();
        }
    }

    function handleTap(point) {
        const now = performance.now();
        if (
            lastTap &&
            now - lastTap.time < DOUBLE_TAP_MS &&
            Math.hypot(point.x - lastTap.x, point.y - lastTap.y) < DOUBLE_TAP_SLOP_PX
        ) {
            clearTimeout(tapTimer);
            lastTap = null;
            if (view.scale > 1.01) {
                view = { scale: 1, x: 0, y: 0 };
            } else {
                view = zoomAround(view, DOUBLE_TAP_SCALE, point.x, point.y);
            }
            settle();
            return;
        }
        lastTap = { ...point, time: now };
        clearTimeout(tapTimer);
        tapTimer = setTimeout(() => {
            lastTap = null;
            handlers.onTap?.();
        }, DOUBLE_TAP_MS);
    }

    function onPointerUp(event) {
        if (!pointers.has(event.pointerId)) return;
        const point = pointers.get(event.pointerId);
        pointers.delete(event.pointerId);
        const ended = gesture;

        if (pointers.size > 0) {
            // Pinch → one finger left: continue as a pan from here.
            startGesture();
            if (gesture) gesture.moved = true;
            return;
        }
        gesture = null;

        if (ended?.type === 'pan' && !ended.moved && performance.now() - ended.startTime < TAP_MS) {
            if (event.type !== 'pointercancel') handleTap(point);
            return;
        }

        if (swipeX) {
            const direction = swipeX < 0 ? 'next' : 'prev';
            const far = Math.abs(swipeX) > SWIPE_DISTANCE_PX;
            const fling = Math.abs(ended?.velocityX || 0) > SWIPE_VELOCITY && Math.sign(ended.velocityX) === Math.sign(swipeX);
            const can = handlers.canSwipe?.(direction) ?? true;
            swipeX = 0;
            if ((far || fling) && can) {
                render();
                handlers.onSwipe?.(direction);
                return;
            }
            settle();
            return;
        }

        if (dismissY) {
            const fling = Math.abs(ended?.velocityY || 0) > DISMISS_VELOCITY;
            if (Math.abs(dismissY) > DISMISS_DISTANCE_PX || fling) {
                handlers.onDismiss?.();
                return;
            }
            dismissY = 0;
            handlers.onDrag?.(0);
        }
        settle();
    }

    function onWheel(event) {
        event.preventDefault();
        const r = stageRect();
        const point = { x: event.clientX - r.left - r.width / 2, y: event.clientY - r.top - r.height / 2 };
        // Trackpad pinch arrives as ctrl+wheel with small deltas.
        const factor = Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.002));
        const next = clampScale(view.scale * factor);
        img.classList.remove('is-animating');
        view = clampPan(zoomAround(view, next, point.x, point.y), fit, stage.clientWidth, stage.clientHeight);
        render();
        clearTimeout(wheelTimer);
        wheelTimer = setTimeout(() => settle({ animate: false }), 160);
    }

    // Double taps / clicks are handled in handleTap; stop the browser selecting text.
    const onDoubleClick = (event) => event.preventDefault();

    // Safari fires its own gesture events for pinch — keep them off the page.
    const stopGesture = (event) => event.preventDefault();

    stage.addEventListener('pointerdown', onPointerDown);
    stage.addEventListener('pointermove', onPointerMove);
    stage.addEventListener('pointerup', onPointerUp);
    stage.addEventListener('pointercancel', onPointerUp);
    stage.addEventListener('wheel', onWheel, { passive: false });
    stage.addEventListener('dblclick', onDoubleClick);
    stage.addEventListener('gesturestart', stopGesture);
    stage.addEventListener('gesturechange', stopGesture);
    img.addEventListener('dragstart', stopGesture);
    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => layout()) : null;
    resizeObserver?.observe(stage);

    return {
        /** Back to fitted, centred, no drag. */
        reset() {
            clearTimeout(tapTimer);
            clearTimeout(wheelTimer);
            pointers.clear();
            gesture = null;
            lastTap = null;
            dismissY = 0;
            swipeX = 0;
            view = { scale: 1, x: 0, y: 0 };
            fit = { w: 0, h: 0 };
            fullLong = 0;
            handlers.onDrag?.(0);
            img.classList.remove('is-animating');
            img.style.transform = '';
            stage.classList.remove('is-zoomed');
        },
        /** Original pixel size, when Drive reported it (only the long edge is used). */
        setFullDims(w, h) {
            fullLong = Math.max(Number(w) || 0, Number(h) || 0);
            if (img.naturalWidth) layout();
        },
        /** On-screen long edge of the image in device pixels. */
        get displayDevicePx() {
            return displayDevicePx();
        },
        /** Call after the <img> loads a new bitmap. */
        layout,
        /** Keyboard / button zoom around the centre. */
        zoomBy(factor) {
            view = zoomAround(view, clampScale(view.scale * factor), 0, 0);
            settle();
        },
        resetZoom() {
            view = { scale: 1, x: 0, y: 0 };
            settle();
        },
        get scale() {
            return view.scale;
        },
        destroy() {
            resizeObserver?.disconnect();
            stage.removeEventListener('pointerdown', onPointerDown);
            stage.removeEventListener('pointermove', onPointerMove);
            stage.removeEventListener('pointerup', onPointerUp);
            stage.removeEventListener('pointercancel', onPointerUp);
            stage.removeEventListener('wheel', onWheel);
            stage.removeEventListener('dblclick', onDoubleClick);
            stage.removeEventListener('gesturestart', stopGesture);
            stage.removeEventListener('gesturechange', stopGesture);
            img.removeEventListener('dragstart', stopGesture);
        },
    };
}
