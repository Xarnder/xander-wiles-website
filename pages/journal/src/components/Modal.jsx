import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
].join(',');

export default function Modal({
    isOpen,
    onClose,
    children,
    labelledBy,
    initialFocusRef,
    fitVisualViewport = false,
    className = '',
    containerClassName = 'items-center justify-center p-4',
    backdropClassName = 'bg-black/60',
    zIndexClassName = 'z-[60]'
}) {
    const containerRef = useRef(null);
    const dialogRef = useRef(null);
    const returnFocusRef = useRef(null);
    const onCloseRef = useRef(onClose);

    // Keep caption controls inside the visible screen when a phone keyboard opens.
    useLayoutEffect(() => {
        const viewport = window.visualViewport;
        const container = containerRef.current;
        if (!isOpen || !fitVisualViewport || !viewport || !container) return undefined;
        let frame;
        let settleTimer;
        const update = () => {
            container.style.top = `${viewport.offsetTop}px`;
            container.style.height = `${viewport.height}px`;
            container.style.bottom = 'auto';
        };
        const schedule = () => {
            window.cancelAnimationFrame(frame);
            window.clearTimeout(settleTimer);
            frame = window.requestAnimationFrame(update);
            // Safari can report a resize before the final keyboard/orientation dimensions.
            settleTimer = window.setTimeout(update, 350);
        };
        update();
        const events = [[viewport, 'resize'], [viewport, 'scroll'], [window, 'resize'], [window, 'pageshow']];
        events.forEach(([target, event]) => target.addEventListener(event, schedule));
        return () => {
            window.cancelAnimationFrame(frame);
            window.clearTimeout(settleTimer);
            events.forEach(([target, event]) => target.removeEventListener(event, schedule));
            container.style.top = '';
            container.style.height = '';
            container.style.bottom = '';
        };
    }, [isOpen, fitVisualViewport]);

    useEffect(() => {
        onCloseRef.current = onClose;
    }, [onClose]);

    useEffect(() => {
        if (!isOpen) return undefined;

        returnFocusRef.current = document.activeElement;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        const focusTimer = window.setTimeout(() => {
            const target = initialFocusRef?.current
                || dialogRef.current?.querySelector(FOCUSABLE_SELECTOR)
                || dialogRef.current;
            target?.focus();
        }, 0);

        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                onCloseRef.current();
                return;
            }

            if (event.key !== 'Tab' || !dialogRef.current) return;
            const focusable = Array.from(dialogRef.current.querySelectorAll(FOCUSABLE_SELECTOR));
            if (focusable.length === 0) {
                event.preventDefault();
                dialogRef.current.focus();
                return;
            }

            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };

        document.addEventListener('keydown', handleKeyDown, true);
        return () => {
            window.clearTimeout(focusTimer);
            document.removeEventListener('keydown', handleKeyDown, true);
            document.body.style.overflow = previousOverflow;
            returnFocusRef.current?.focus?.();
        };
    }, [isOpen, initialFocusRef]);

    if (!isOpen) return null;

    return createPortal(
        <div ref={containerRef} className={`fixed inset-0 ${zIndexClassName} flex ${containerClassName}`}>
            <button
                type="button"
                className={`absolute inset-0 w-full h-full backdrop-blur-sm animation-fade-in cursor-default ${backdropClassName}`}
                onClick={onClose}
                aria-label="Close dialog"
                tabIndex={-1}
            />
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={labelledBy}
                tabIndex={-1}
                className={`relative animation-scale-in ${className}`}
            >
                {children}
            </div>
        </div>,
        document.body
    );
}
