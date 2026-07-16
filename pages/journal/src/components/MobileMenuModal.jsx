import React from 'react';
import { X, LogOut } from 'lucide-react';
import Modal from './Modal';

export default function MobileMenuModal({ 
    isOpen, 
    onClose, 
    currentUser, 
    handleLogout, 
    navItems: NavItems
}) {
    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            labelledBy="mobile-navigation-title"
            zIndexClassName="z-[100]"
            containerClassName="md:hidden items-stretch justify-center px-4 pt-20 pb-8"
            backdropClassName="bg-black/80"
            className="w-full glass-card flex flex-col overflow-hidden shadow-2xl bg-surface/95 border border-border"
        >
                {/* Header */}
                <div className="p-4 border-b border-border flex items-center justify-between">
                    <h2 id="mobile-navigation-title" className="text-xl font-serif font-bold text-text">Navigation</h2>
                    <button 
                        type="button"
                        onClick={onClose}
                        aria-label="Close navigation"
                        className="p-2 rounded-lg hover:bg-white/5 text-text-muted hover:text-text transition-all duration-200"
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
                <div className="p-4 border-t border-border bg-black/20">
                    <button
                        type="button"
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
        </Modal>
    );
}
