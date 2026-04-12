import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Outlet, Link, useNavigate, useLocation, useParams } from 'react-router-dom';
import { LogOut, Book, Calendar as CalendarIcon, Search, List, BarChart, Menu, X, FileDown, Image as ImageIcon, History, Tag, PenTool } from 'lucide-react';
import { format, subDays } from 'date-fns';
import { db } from '../firebase';
import { collection, query, where, getDocs, documentId } from 'firebase/firestore';
import DirectoryImporter from './DirectoryImporter';
import DataRepair from './DataRepair';
import BackupOptions from './BackupOptions';
import SearchModal from './SearchModal';
import MobileMenuModal from './MobileMenuModal';

export default function Layout() {
    const { currentUser, logout } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const params = useParams();
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isQuickWriting, setIsQuickWriting] = useState(false);

    async function handleQuickWrite() {
        if (!currentUser || isQuickWriting) return;
        
        try {
            setIsQuickWriting(true);
            const today = new Date();
            const datesToCheck = [];
            for (let i = 0; i < 7; i++) {
                datesToCheck.push(format(subDays(today, i), 'yyyy-MM-dd'));
            }

            // Fetch entries for the last 7 days to check for gaps
            const q = query(
                collection(db, 'users', currentUser.uid, 'entries'),
                where(documentId(), '>=', datesToCheck[6]),
                where(documentId(), '<=', datesToCheck[0])
            );

            const snapshot = await getDocs(q);
            const entries = {};
            snapshot.forEach(doc => {
                entries[doc.id] = doc.data();
            });

            // Find the most recent date with no content
            let targetDate = datesToCheck[0]; // Default to today
            
            for (const dateStr of datesToCheck) {
                const entry = entries[dateStr];
                const hasContent = entry && (
                    (entry.content && entry.content.trim().length > 0) || 
                    (entry.images && entry.images.length > 0) || 
                    (entry.title && entry.title.trim().length > 0)
                );
                
                if (!hasContent) {
                    targetDate = dateStr;
                    break; // Found the most recent gap (starting from today backwards)
                }
            }

            navigate(`/entry/${targetDate}`);
        } catch (err) {
            console.error("Quick write error:", err);
            // Fallback to today on error
            navigate(`/entry/${format(new Date(), 'yyyy-MM-dd')}`);
        } finally {
            setIsQuickWriting(false);
        }
    }

    async function handleLogout() {
        try {
            await logout();
            navigate('/login');
        } catch {
            console.error('Failed to log out');
        }
    }

    // Close mobile menu on navigation
    useEffect(() => {
        setIsMobileMenuOpen(false);
    }, [location.pathname]);

    // Global Search Shortcut (Cmd+K / Ctrl+K)
    useEffect(() => {
        const handleKeyDown = (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                setIsSearchOpen(prev => !prev);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // Dynamic Tab Title
    useEffect(() => {
        const path = location.pathname;
        let title = "Digital Journal";

        if (path === '/') title = "Journal - Calendar";
        else if (path === '/month') title = "Journal - Month View";
        else if (path === '/images') title = "Journal - Photos";
        else if (path === '/stats') title = "Journal - Statistics";
        else if (path === '/tags') title = "Journal - Tags";
        else if (path === '/memories') title = "Journal - Memories";
        else if (path === '/pdf-export') title = "Journal - Export PDF";
        else if (path.startsWith('/entry/')) {
            const dateStr = path.split('/').pop();
            title = `Journal - ${dateStr}`;
        }

        document.title = title;
    }, [location.pathname]);

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
                                onClick={handleQuickWrite}
                                className={`p-2 rounded-lg hover:bg-white/5 transition-all duration-200 ${isQuickWriting ? 'animate-pulse text-primary' : 'text-text-muted hover:text-primary'}`}
                                title="Quick Write (Last unwritten day)"
                                disabled={isQuickWriting}
                            >
                                <PenTool className="h-5 w-5" />
                            </button>
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
                            onClick={() => navigate('/images')}
                            className={`p-2 rounded-lg hover:bg-white/5 transition-all duration-200 ${location.pathname === '/images' ? 'text-primary bg-white/5' : 'text-text-muted hover:text-primary'}`}
                            title="Photo Gallery"
                        >
                            <ImageIcon className="h-5 w-5" />
                        </button>

                        <button
                            onClick={() => navigate('/stats')}
                            className={`p-2 rounded-lg hover:bg-white/5 transition-all duration-200 ${location.pathname === '/stats' ? 'text-primary bg-white/5' : 'text-text-muted hover:text-primary'}`}
                            title="Stats View"
                        >
                            <BarChart className="h-5 w-5" />
                        </button>

                        <button
                            onClick={() => navigate('/tags')}
                            className={`p-2 rounded-lg hover:bg-white/5 transition-all duration-200 ${location.pathname === '/tags' ? 'text-primary bg-white/5' : 'text-text-muted hover:text-primary'}`}
                            title="Tags"
                        >
                            <Tag className="h-5 w-5" />
                        </button>

                        <button
                            onClick={() => navigate('/memories')}
                            className={`p-2 rounded-lg hover:bg-white/5 transition-all duration-200 ${location.pathname === '/memories' ? 'text-primary bg-white/5' : 'text-text-muted hover:text-primary'}`}
                            title="Memories"
                        >
                            <History className="h-5 w-5" />
                        </button>

                        <button
                            onClick={() => navigate('/pdf-export')}
                            className={`p-2 rounded-lg hover:bg-white/5 transition-all duration-200 ${location.pathname === '/pdf-export' ? 'text-primary bg-white/5' : 'text-text-muted hover:text-primary'}`}
                            title="Export PDF"
                        >
                            <FileDown className="h-5 w-5" />
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
                            onClick={handleQuickWrite}
                            className={`p-2 rounded-lg hover:bg-white/5 transition-all duration-200 ${isQuickWriting ? 'animate-pulse text-primary' : 'text-text-muted hover:text-primary'}`}
                            disabled={isQuickWriting}
                        >
                            <PenTool className="h-5 w-5" />
                        </button>
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


                    {/* Mobile Navigation Modal */}
                    <MobileMenuModal
                        isOpen={isMobileMenuOpen}
                        onClose={() => setIsMobileMenuOpen(false)}
                        currentUser={currentUser}
                        handleLogout={handleLogout}
                        navItems={
                            <>
                                <NavItem path="/" icon={CalendarIcon} label="Calendar" />
                                <NavItem path="/month" icon={List} label="Month View" />
                                <NavItem path="/images" icon={ImageIcon} label="Photos" />
                                <NavItem path="/stats" icon={BarChart} label="Stats" />
                                <NavItem path="/tags" icon={Tag} label="Tags" />
                                <NavItem path="/memories" icon={History} label="Memories" />
                                <NavItem path="/pdf-export" icon={FileDown} label="PDF Export" />
                            </>
                        }
                        importer={<DirectoryImporter />}
                        repair={<DataRepair />}
                        backup={<BackupOptions />}
                    />
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 animation-fade-in">
                <Outlet />
            </main>

            {/* Floating Action Button (Quick Write) */}
            {!location.pathname.startsWith('/entry/') && currentUser && (
                <button
                    onClick={handleQuickWrite}
                    className={`fixed bottom-6 right-6 p-4 rounded-full shadow-2xl z-40 transition-all duration-300 hover:scale-110 active:scale-95 md:bottom-8 md:right-8 group ${
                        isQuickWriting 
                            ? 'bg-primary/50 animate-pulse cursor-wait' 
                            : 'bg-gradient-to-br from-primary to-primary-variant hover:shadow-[0_0_20px_rgba(139,92,246,0.4)]'
                    }`}
                    title="Quick Write (Last unwritten day)"
                    disabled={isQuickWriting}
                >
                    <PenTool className="h-6 w-6 text-white group-hover:rotate-12 transition-transform duration-200" />
                </button>
            )}
        </div>
    );
}
