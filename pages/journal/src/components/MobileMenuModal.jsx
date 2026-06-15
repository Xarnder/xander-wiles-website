import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, LogOut } from 'lucide-react';

export default function MobileMenuModal({ 
    isOpen, 
    onClose, 
    currentUser, 
    handleLogout, 
    navItems: NavItems
}) {
    // Lock body scroll when open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [isOpen]);

    // Close on escape
    useEffect(() => {
        const handleEsc = (e) => {
            if (isOpen && e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-[100] md:hidden">
            {/* Backdrop */}
            <div 
                className="absolute inset-0 bg-black/80 backdrop-blur-md animate-fade-in"
                onClick={onClose}
            />

            {/* Modal Content */}
            <div className="absolute inset-x-4 top-20 bottom-8 glass-card flex flex-col animate-scale-in overflow-hidden shadow-2xl bg-[#0a0a0b]/95 border border-white/10">
                {/* Header */}
                <div className="p-4 border-b border-white/10 flex items-center justify-between">
                    <h2 className="text-xl font-serif font-bold text-white">Navigation</h2>
                    <button 
                        onClick={onClose}
                        className="p-2 rounded-lg hover:bg-white/5 text-text-muted hover:text-white transition-all duration-200"
                    >
                        <X className="h-6 w-6" />
                    </button>
                </div>

                {/* Body - Scrollable */}
                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                    <div className="space-y-1">
                        {NavItems}
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-white/10 bg-black/20">
                    <button
                        onClick={handleLogout}
                        className="flex items-center w-full px-4 py-3 rounded-lg text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors font-medium"
                    >
                        <LogOut className="h-5 w-5 mr-3" />
                        <span>Logout</span>
                    </button>
                    {currentUser?.email && (
                        <div className="mt-2 px-4 py-2 text-xs text-text-muted text-center opacity-50 truncate">
                            {currentUser.email}
                        </div>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
}
