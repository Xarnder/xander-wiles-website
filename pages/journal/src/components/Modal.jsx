import React, { useEffect, useRef } from 'react';
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
    className = '',
    containerClassName = 'items-center justify-center p-4',
    backdropClassName = 'bg-black/60',
    zIndexClassName = 'z-[60]'
}) {
    const dialogRef = useRef(null);
    const returnFocusRef = useRef(null);
    const onCloseRef = useRef(onClose);

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
        <div className={`fixed inset-0 ${zIndexClassName} flex ${containerClassName}`}>
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
