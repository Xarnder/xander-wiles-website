import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { LogOut, Book, Calendar as CalendarIcon, Search, List, BarChart, Menu, X } from 'lucide-react';
import DirectoryImporter from './DirectoryImporter';
import DataRepair from './DataRepair';
import BackupOptions from './BackupOptions';
import SearchModal from './SearchModal';

export default function Layout() {
    const { currentUser, logout } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    async function handleLogout() {
        try {
            await logout();
            navigate('/login');
        } catch {
            console.error('Failed to log out');
        }
    }

    const NavItem = ({ path, icon: Icon, label, onClick }) => {
        const isActive = location.pathname === path;
        return (
            <button
                onClick={() => {
                    navigate(path);
                    if (onClick) onClick();
                }}
                className={`flex items-center w-full px-4 py-3 rounded-lg transition-all duration-200 ${isActive
                        ? 'bg-primary/20 text-white'
                        : 'text-text-muted hover:bg-white/5 hover:text-white'
                    }`}
            >
                <Icon className={`h-5 w-5 mr-3 ${isActive ? 'text-primary' : ''}`} />
                <span className="font-medium">{label}</span>
            </button>
        );
    };

    return (
        <div className="min-h-screen flex flex-col font-body text-text">
            <SearchModal isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />

            {/* Glass Header */}
            <header className="sticky top-0 z-50 px-4 pt-4 pb-2">
                <div className="glass-card max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex justify-between items-center transition-all duration-300 relative">
                    {/* Logo / Title */}
                    <div className="flex items-center cursor-pointer group" onClick={() => navigate('/')}>
                        <div className="p-2 bg-primary/10 rounded-lg group-hover:bg-primary/20 transition-colors mr-3">
                            <Book className="h-6 w-6 text-primary" />
                        </div>
                        <h1 className="hidden sm:block text-xl font-serif font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/70">
                            Digital Journal
                        </h1>
                    </div>

                    {/* Desktop Actions */}
                    <div className="hidden md:flex items-center space-x-3">
                        <span className="text-sm text-text-muted border-r border-white/10 pr-4 mr-1">
                            {currentUser?.email}
                        </span>

                        <div className="flex items-center gap-2 border-r border-white/10 pr-4 mr-1">
                            <button
                                onClick={() => setIsSearchOpen(true)}
                                className="p-2 rounded-lg hover:bg-white/5 text-text-muted hover:text-primary transition-all duration-200"
                                title="Search (Cmd+K)"
                            >
                                <Search className="h-5 w-5" />
                            </button>
                            <DirectoryImporter />
                            <DataRepair />
                            <BackupOptions />
                        </div>

                        <button
                            onClick={() => navigate('/')}
                            className={`p-2 rounded-lg hover:bg-white/5 transition-all duration-200 ${location.pathname === '/' ? 'text-primary bg-white/5' : 'text-text-muted hover:text-primary'}`}
                            title="Calendar"
                        >
                            <CalendarIcon className="h-5 w-5" />
                        </button>

                        <button
                            onClick={() => navigate('/month')}
                            className={`p-2 rounded-lg hover:bg-white/5 transition-all duration-200 ${location.pathname === '/month' ? 'text-primary bg-white/5' : 'text-text-muted hover:text-primary'}`}
                            title="Month List View"
                        >
                            <List className="h-5 w-5" />
                        </button>

                        <button
                            onClick={() => navigate('/stats')}
                            className={`p-2 rounded-lg hover:bg-white/5 transition-all duration-200 ${location.pathname === '/stats' ? 'text-primary bg-white/5' : 'text-text-muted hover:text-primary'}`}
                            title="Stats View"
                        >
                            <BarChart className="h-5 w-5" />
                        </button>

                        <button
                            onClick={handleLogout}
                            className="flex items-center px-4 py-2 rounded-lg text-sm font-medium bg-white/5 hover:bg-red-500/10 hover:text-red-400 border border-transparent hover:border-red-500/20 transition-all duration-200"
                        >
                            <LogOut className="h-4 w-4 mr-2" />
                            <span>Logout</span>
                        </button>
                    </div>

                    {/* Mobile Header Controls */}
                    <div className="flex md:hidden items-center gap-2">
                        <button
                            onClick={() => setIsSearchOpen(true)}
                            className="p-2 rounded-lg hover:bg-white/5 text-text-muted hover:text-primary transition-all duration-200"
                        >
                            <Search className="h-5 w-5" />
                        </button>

                        <button
                            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                            className="p-2 rounded-lg hover:bg-white/5 text-text-muted hover:text-white transition-all duration-200"
                        >
                            {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
                        </button>
                    </div>

                    {/* Mobile Menu Dropdown */}
                    {isMobileMenuOpen && (
                        <div className="absolute top-full left-0 right-0 mt-2 mx-4 p-4 glass-card md:hidden flex flex-col space-y-4 animate-fade-in z-50 shadow-2xl bg-[#0a0a0b]/95 border border-white/10 backdrop-blur-xl">
                            <div className="space-y-1">
                                <NavItem path="/" icon={CalendarIcon} label="Calendar" onClick={() => setIsMobileMenuOpen(false)} />
                                <NavItem path="/month" icon={List} label="Month View" onClick={() => setIsMobileMenuOpen(false)} />
                                <NavItem path="/stats" icon={BarChart} label="Stats" onClick={() => setIsMobileMenuOpen(false)} />
                            </div>

                            <div className="h-px bg-white/10 my-2" />

                            <div className="grid grid-cols-3 gap-2 p-2">
                                <div className="flex flex-col items-center justify-center gap-1">
                                    <div className="bg-white/5 p-2 rounded-lg">
                                        <DirectoryImporter />
                                    </div>
                                    <span className="text-[10px] text-text-muted uppercase tracking-wider">Import</span>
                                </div>
                                <div className="flex flex-col items-center justify-center gap-1">
                                    <div className="bg-white/5 p-2 rounded-lg">
                                        <DataRepair />
                                    </div>
                                    <span className="text-[10px] text-text-muted uppercase tracking-wider">Repair</span>
                                </div>
                                <div className="flex flex-col items-center justify-center gap-1">
                                    <div className="bg-white/5 p-2 rounded-lg">
                                        <BackupOptions />
                                    </div>
                                    <span className="text-[10px] text-text-muted uppercase tracking-wider">Backup</span>
                                </div>
                            </div>

                            <div className="h-px bg-white/10 my-2" />

                            <button
                                onClick={handleLogout}
                                className="flex items-center w-full px-4 py-3 rounded-lg text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
                            >
                                <LogOut className="h-5 w-5 mr-3" />
                                <span className="font-medium">Logout</span>
                            </button>

                            <div className="px-4 py-2 text-xs text-text-muted text-center opacity-50">
                                {currentUser?.email}
                            </div>
                        </div>
                    )}
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 animation-fade-in">
                <Outlet />
            </main>
        </div>
    );
}
