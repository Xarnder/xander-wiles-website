import React, { useId, useRef, useState } from 'react';
import { X, AlertTriangle, Loader2 } from 'lucide-react';
import Modal from './Modal';

export default function ConfirmModal({
    isOpen,
    onClose,
    onConfirm,
    title = "Confirm Action",
    message = "Are you sure you want to proceed?",
    confirmText = "Confirm",
    cancelText = "Cancel",
    isDangerous = false
}) {
    const titleId = useId();
    const cancelRef = useRef(null);
    const [confirming, setConfirming] = useState(false);

    const handleConfirm = async () => {
        setConfirming(true);
        try {
            await onConfirm();
            onClose();
        } finally {
            setConfirming(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={confirming ? () => {} : onClose}
            labelledBy={titleId}
            initialFocusRef={cancelRef}
            className="bg-surface w-full max-w-md rounded-xl shadow-2xl border border-border flex flex-col overflow-hidden"
        >
                {/* Header */}
                <div className="p-4 border-b border-border bg-white/5 flex items-center justify-between">
                    <h3 id={titleId} className="text-lg font-bold text-text flex items-center">
                        {isDangerous && <AlertTriangle className="w-5 h-5 mr-2 text-red-500" />}
                        {title}
                    </h3>
                    <button type="button" onClick={onClose} disabled={confirming} aria-label="Close dialog" className="text-text-muted hover:text-text transition-colors disabled:opacity-50">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 text-text-secondary">
                    <p>{message}</p>
                </div>

                {/* Footer */}
                <div className="p-4 bg-black/20 border-t border-border flex justify-end space-x-3">
                    <button
                        ref={cancelRef}
                        type="button"
                        onClick={onClose}
                        disabled={confirming}
                        className="px-4 py-2 rounded-lg text-text hover:bg-white/10 transition-colors text-sm font-medium"
                    >
                        {cancelText}
                    </button>
                    <button
                        type="button"
                        onClick={handleConfirm}
                        disabled={confirming}
                        className={`px-4 py-2 rounded-lg text-white text-sm font-bold shadow-lg transition-all transform hover:scale-105 ${isDangerous
                                ? 'bg-gradient-to-r from-red-600 to-red-500 shadow-red-500/20'
                                : 'bg-gradient-to-r from-primary to-secondary shadow-primary/20'
                            } disabled:opacity-60 disabled:hover:scale-100`}
                    >
                        {confirming ? <Loader2 className="w-4 h-4 animate-spin" aria-label="Working" /> : confirmText}
                    </button>
                </div>
        </Modal>
    );
}
