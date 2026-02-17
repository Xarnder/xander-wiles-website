import React, { useEffect, useRef } from 'react';
import { X, AlertTriangle } from 'lucide-react';

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
    const modalRef = useRef(null);

    // Close on escape
    useEffect(() => {
        const handleEsc = (e) => {
            if (isOpen && e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm animation-fade-in"
                onClick={onClose}
            ></div>

            {/* Modal */}
            <div
                ref={modalRef}
                className="relative bg-[#18181b] w-full max-w-md rounded-xl shadow-2xl border border-white/10 flex flex-col animation-scale-in overflow-hidden"
            >
                {/* Header */}
                <div className="p-4 border-b border-white/10 bg-white/5 flex items-center justify-between">
                    <h3 className="text-lg font-bold text-white flex items-center">
                        {isDangerous && <AlertTriangle className="w-5 h-5 mr-2 text-red-500" />}
                        {title}
                    </h3>
                    <button onClick={onClose} className="text-text-muted hover:text-white transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 text-text-secondary">
                    <p>{message}</p>
                </div>

                {/* Footer */}
                <div className="p-4 bg-black/20 border-t border-white/5 flex justify-end space-x-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-lg text-text hover:bg-white/10 transition-colors text-sm font-medium"
                    >
                        {cancelText}
                    </button>
                    <button
                        onClick={() => {
                            onConfirm();
                            onClose();
                        }}
                        className={`px-4 py-2 rounded-lg text-white text-sm font-bold shadow-lg transition-all transform hover:scale-105 ${isDangerous
                                ? 'bg-gradient-to-r from-red-600 to-red-500 shadow-red-500/20'
                                : 'bg-gradient-to-r from-primary to-secondary shadow-primary/20'
                            }`}
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
}
