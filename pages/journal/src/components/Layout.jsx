import React, { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { LogOut, Book, Calendar as CalendarIcon, Search, List, BarChart, Menu, X, FileDown, Image as ImageIcon, History, Tag, PenTool, Settings } from 'lucide-react';
import { format, subDays } from 'date-fns';
import { db } from '../firebase';
import { collection, query, where, documentId, onSnapshot } from 'firebase/firestore';
import SearchModal from './SearchModal';
import MobileMenuModal from './MobileMenuModal';
import BackupOptions from './BackupOptions';
import LeftArrowIcon from './LeftArrowIcon';
import { useEntryUi } from '../context/EntryUiContext';

function getWorkspaceTitle(pathname) {
    if (pathname.startsWith('/entry/')) return 'Entry';
    if (pathname === '/month') return 'Month View';
    if (pathname === '/images') return 'Photos';
    if (pathname === '/stats') return 'Stats';
    if (pathname === '/tags') return 'Tags';
    if (pathname === '/memories') return 'Memories';
    if (pathname === '/pdf-export') return 'PDF Export';
    if (pathname === '/settings') return 'Settings';
    if (pathname === '/') return 'Calendar';
    return 'Journal';
}

function NavItem({ path, icon: Icon, label, currentPath, onSelect }) {
    const isActive = currentPath === path || (path === '/' && currentPath.startsWith('/entry/'));
    return (
        <button
            type="button"
            onClick={() => onSelect(path)}
            className={`flex items-center w-full px-4 py-3 rounded-lg transition-all duration-200 ${isActive
                ? 'bg-primary/20 text-white'
                : 'text-text-muted hover:bg-white/5 hover:text-white'
            }`}
        >
            {React.createElement(Icon, { className: `h-5 w-5 mr-3 ${isActive ? 'text-primary' : ''}` })}
            <span className="font-medium">{label}</span>
        </button>
    );
}

export default function Layout() {
    const { currentUser, logout } = useAuth();
    const { isEditingEntry } = useEntryUi();
    const navigate = useNavigate();
    const location = useLocation();
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isQuickWriting, setIsQuickWriting] = useState(false);
    const [recentEntries, setRecentEntries] = useState({});
    const [headerTitleFontSize, setHeaderTitleFontSize] = useState(18);
    const headerTitleContainerRef = useRef(null);
    const headerTitleTextRef = useRef(null);
    const headerRef = useRef(null);
    const workspaceTitle = useMemo(() => getWorkspaceTitle(location.pathname), [location.pathname]);

    // Keep a real-time listener for the last 7 days to make "Quick Write" instantaneous
    useEffect(() => {
        if (!currentUser) {
            return;
        }

        const today = new Date();
        const weekAgo = subDays(today, 7);
        const startId = format(weekAgo, 'yyyy-MM-dd');
        const endId = format(today, 'yyyy-MM-dd');

        const q = query(
            collection(db, 'users', currentUser.uid, 'entries'),
            where(documentId(), '>=', startId),
            where(documentId(), '<=', endId)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const entries = {};
            snapshot.forEach(doc => {
                entries[doc.id] = doc.data();
            });
            setRecentEntries(entries);
        }, (err) => {
            console.error("Error listening to recent entries:", err);
        });

        return () => unsubscribe();
    }, [currentUser]);

    function handleQuickWrite() {
        if (!currentUser) return;
        setIsQuickWriting(true);
        
        // Find the dates for the last 7 days
        const today = new Date();
        const datesToCheck = [];
        for (let i = 0; i < 7; i++) {
            datesToCheck.push(format(subDays(today, i), 'yyyy-MM-dd'));
        }

        // Find the oldest date with no content within the last week
        let targetDate = datesToCheck[0]; // Default to today
        
        // Check from oldest (last item in datesToCheck) to newest (today)
        for (let i = datesToCheck.length - 1; i >= 0; i--) {
            const dateStr = datesToCheck[i];
            const entry = recentEntries[dateStr];
            const hasContent = entry && (
                (entry.content && entry.content.trim().length > 0) || 
                (entry.images && entry.images.length > 0) || 
                (entry.title && entry.title.trim().length > 0)
            );
            
            if (!hasContent) {
                targetDate = dateStr;
                break; // Found the oldest gap
            }
        }

        navigate(`/entry/${targetDate}`);
        window.setTimeout(() => setIsQuickWriting(false), 500);
    }

    async function handleLogout() {
        try {
            await logout();
            navigate('/login');
        } catch {
            console.error('Failed to log out');
        }
    }

    // Global Search Shortcut (Cmd+K / Ctrl+K)
    useEffect(() => {
        if (isEditingEntry) {
            setIsSearchOpen(false);
            return undefined;
        }

        const handleKeyDown = (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                setIsSearchOpen(prev => !prev);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isEditingEntry]);

    // Dynamic Tab Title
    useEffect(() => {
        document.title = `Journal - ${workspaceTitle}`;
    }, [workspaceTitle]);

    useLayoutEffect(() => {
        const container = headerTitleContainerRef.current;
        const text = headerTitleTextRef.current;
        if (!container || !text) return undefined;

        const MIN_SIZE = 13;
        const MAX_SIZE = 30;

        const fitTitle = () => {
            const available = container.clientWidth;
            if (available <= 0) return;

            const previousSize = text.style.fontSize;
            text.style.fontSize = `${MAX_SIZE}px`;
            const naturalWidth = text.scrollWidth;
            text.style.fontSize = previousSize;

            if (naturalWidth <= 0) return;

            const nextSize = Math.max(MIN_SIZE, Math.min(MAX_SIZE, MAX_SIZE * ((available - 1) / naturalWidth)));
            setHeaderTitleFontSize(nextSize);
        };

        const observer = new ResizeObserver(fitTitle);
        observer.observe(container);
        fitTitle();

        return () => observer.disconnect();
    }, [workspaceTitle, isEditingEntry]);

    useLayoutEffect(() => {
        const header = headerRef.current;
        if (!header) return undefined;

        const syncHeaderHeight = () => {
            document.documentElement.style.setProperty('--journal-header-height', `${header.offsetHeight}px`);
        };

        const observer = new ResizeObserver(syncHeaderHeight);
        observer.observe(header);
        syncHeaderHeight();

        return () => {
            observer.disconnect();
            document.documentElement.style.removeProperty('--journal-header-height');
        };
    }, []);

    const handleMobileNavigate = (path) => {
        setIsMobileMenuOpen(false);
        navigate(path);
    };

    const isEntryView = location.pathname.startsWith('/entry/');
    const isCalendarView = location.pathname === '/';
    const fromPath = location.state?.from;
    const isFromGallery = location.state?.fromGallery;

    function getEntryBackLabel() {
        if (isFromGallery) return 'Back to gallery';
        if (fromPath === '/stats') return 'Back to stats';
        if (fromPath === '/tags') return 'Back to tags';
        if (fromPath === '/month') return 'Back to month view';
        if (fromPath === '/memories') return 'Back to memories';
        if (fromPath === '/') return 'Back to calendar';
        if (fromPath?.startsWith('/entry/')) return 'Back to previous entry';
        if (fromPath) return 'Go back';
        return 'Back to calendar';
    }

    function handleEntryBack() {
        if (isFromGallery) {
            navigate('/images', { state: { scrollToId: location.state?.scrollToId } });
            return;
        }

        navigate(fromPath || '/');
    }

    return (
        <div className="min-h-screen flex flex-col font-body text-text">
            <SearchModal isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />
            <BackupOptions showTrigger={false} />

            {/* Glass Header */}
            <header ref={headerRef} className={`sticky top-0 z-50 px-3 sm:px-4 ${isEntryView || isCalendarView ? 'pt-2 pb-1' : 'pt-3 pb-2 sm:pt-4'}`}>
                <div className={`glass-card max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 flex items-center gap-2 sm:gap-3 transition-all duration-300 relative ${isEntryView ? 'py-2' : 'py-3'}`}>
                    <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
                        <button type="button" className="flex shrink-0 items-center cursor-pointer group" onClick={() => navigate('/')} aria-label="Go to journal calendar">
                            <div className="p-2 bg-primary/10 rounded-lg group-hover:bg-primary/20 transition-colors">
                                <Book className="h-6 w-6 text-primary" />
                            </div>
                        </button>
                        <div ref={headerTitleContainerRef} className="min-w-0 flex-1 overflow-hidden">
                            <h1
                                ref={headerTitleTextRef}
                                className="inline-flex max-w-full items-center whitespace-nowrap font-serif font-bold leading-none bg-clip-text text-transparent bg-gradient-to-r from-white to-white/70"
                                style={{ fontSize: `${headerTitleFontSize}px` }}
                            >
                                {workspaceTitle}
                            </h1>
                        </div>
                    </div>

                    {/* Desktop Actions */}
                    <div className="hidden md:flex shrink-0 items-center space-x-3">
                        <span className="text-sm text-text-muted border-r border-white/10 pr-4 mr-1">
                            {currentUser?.email}
                        </span>

                        <div className="flex items-center gap-2 border-r border-white/10 pr-4 mr-1">
                            {isEntryView && (
                                <button
                                    type="button"
                                    onClick={handleEntryBack}
                                    className="p-2 rounded-lg hover:bg-white/5 text-text-muted hover:text-primary transition-all duration-200"
                                    title={getEntryBackLabel()}
                                    aria-label={getEntryBackLabel()}
                                >
                                    <LeftArrowIcon className="h-6 w-6" />
                                </button>
                            )}
                            {!isEditingEntry && (
                                <>
                                    <button
                                        type="button"
                                        onClick={handleQuickWrite}
                                        className={`p-2 rounded-lg hover:bg-white/5 transition-all duration-200 ${isQuickWriting ? 'animate-pulse text-primary' : 'text-text-muted hover:text-primary'}`}
                                        title="Quick Write (Last unwritten day)"
                                        aria-label="Quick Write: open the oldest unwritten day from the past week"
                                        disabled={isQuickWriting}
                                    >
                                        <PenTool className="h-5 w-5" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setIsSearchOpen(true)}
                                        className="p-2 rounded-lg hover:bg-white/5 text-text-muted hover:text-primary transition-all duration-200"
                                        title="Search (Cmd+K)"
                                        aria-label="Search journal"
                                        aria-expanded={isSearchOpen}
                                    >
                                        <Search className="h-5 w-5" />
                                    </button>
                                </>
                            )}
                        </div>

                        <button
                            type="button"
                            onClick={() => navigate('/')}
                            className={`p-2 rounded-lg hover:bg-white/5 transition-all duration-200 ${location.pathname === '/' || location.pathname.startsWith('/entry/') ? 'text-primary bg-white/5' : 'text-text-muted hover:text-primary'}`}
                            title="Calendar"
                            aria-label="Calendar"
                        >
                            <CalendarIcon className="h-5 w-5" />
                        </button>

                        <button
                            type="button"
                            onClick={() => navigate('/month')}
                            className={`p-2 rounded-lg hover:bg-white/5 transition-all duration-200 ${location.pathname === '/month' ? 'text-primary bg-white/5' : 'text-text-muted hover:text-primary'}`}
                            title="Month List View"
                            aria-label="Month list view"
                        >
                            <List className="h-5 w-5" />
                        </button>

                        <button
                            type="button"
                            onClick={() => navigate('/images')}
                            className={`p-2 rounded-lg hover:bg-white/5 transition-all duration-200 ${location.pathname === '/images' ? 'text-primary bg-white/5' : 'text-text-muted hover:text-primary'}`}
                            title="Photo Gallery"
                            aria-label="Photo gallery"
                        >
                            <ImageIcon className="h-5 w-5" />
                        </button>

                        <button
                            type="button"
                            onClick={() => navigate('/stats')}
                            className={`p-2 rounded-lg hover:bg-white/5 transition-all duration-200 ${location.pathname === '/stats' ? 'text-primary bg-white/5' : 'text-text-muted hover:text-primary'}`}
                            title="Stats View"
                            aria-label="Statistics"
                        >
                            <BarChart className="h-5 w-5" />
                        </button>

                        <button
                            type="button"
                            onClick={() => navigate('/tags')}
                            className={`p-2 rounded-lg hover:bg-white/5 transition-all duration-200 ${location.pathname === '/tags' ? 'text-primary bg-white/5' : 'text-text-muted hover:text-primary'}`}
                            title="Tags"
                            aria-label="Tags"
                        >
                            <Tag className="h-5 w-5" />
                        </button>

                        <button
                            type="button"
                            onClick={() => navigate('/memories')}
                            className={`p-2 rounded-lg hover:bg-white/5 transition-all duration-200 ${location.pathname === '/memories' ? 'text-primary bg-white/5' : 'text-text-muted hover:text-primary'}`}
                            title="Memories"
                            aria-label="Memories"
                        >
                            <History className="h-5 w-5" />
                        </button>

                        <button
                            type="button"
                            onClick={() => navigate('/pdf-export')}
                            className={`p-2 rounded-lg hover:bg-white/5 transition-all duration-200 ${location.pathname === '/pdf-export' ? 'text-primary bg-white/5' : 'text-text-muted hover:text-primary'}`}
                            title="Export PDF"
                            aria-label="Export PDF"
                        >
                            <FileDown className="h-5 w-5" />
                        </button>

                        <button
                            type="button"
                            onClick={() => navigate('/settings')}
                            className={`p-2 rounded-lg hover:bg-white/5 transition-all duration-200 ${location.pathname === '/settings' ? 'text-primary bg-white/5' : 'text-text-muted hover:text-primary'}`}
                            title="Settings"
                            aria-label="Settings"
                        >
                            <Settings className="h-5 w-5" />
                        </button>

                        <button
                            type="button"
                            onClick={handleLogout}
                            className="flex items-center px-4 py-2 rounded-lg text-sm font-medium bg-white/5 hover:bg-red-500/10 hover:text-red-400 border border-transparent hover:border-red-500/20 transition-all duration-200"
                        >
                            <LogOut className="h-4 w-4 mr-2" />
                            <span>Logout</span>
                        </button>
                    </div>

                    {/* Mobile Header Controls */}
                    <div className="flex md:hidden shrink-0 items-center gap-2">
                        {isEntryView && (
                            <button
                                type="button"
                                onClick={handleEntryBack}
                                className="p-2 rounded-lg hover:bg-white/5 text-text-muted hover:text-primary transition-all duration-200"
                                title={getEntryBackLabel()}
                                aria-label={getEntryBackLabel()}
                            >
                                <LeftArrowIcon className="h-6 w-6" />
                            </button>
                        )}
                        {!isEditingEntry && (
                            <>
                                <button
                                    type="button"
                                    onClick={handleQuickWrite}
                                    className={`p-2 rounded-lg hover:bg-white/5 transition-all duration-200 ${isQuickWriting ? 'animate-pulse text-primary' : 'text-text-muted hover:text-primary'}`}
                                    disabled={isQuickWriting}
                                    aria-label="Quick Write: open the oldest unwritten day from the past week"
                                >
                                    <PenTool className="h-5 w-5" />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setIsSearchOpen(true)}
                                    className="p-2 rounded-lg hover:bg-white/5 text-text-muted hover:text-primary transition-all duration-200"
                                    aria-label="Search journal"
                                    aria-expanded={isSearchOpen}
                                >
                                    <Search className="h-5 w-5" />
                                </button>
                            </>
                        )}

                        <button
                            type="button"
                            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                            className="p-2 rounded-lg hover:bg-white/5 text-text-muted hover:text-white transition-all duration-200"
                            aria-label={isMobileMenuOpen ? 'Close navigation' : 'Open navigation'}
                            aria-expanded={isMobileMenuOpen}
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
                                <NavItem path="/" icon={CalendarIcon} label="Calendar" currentPath={location.pathname} onSelect={handleMobileNavigate} />
                                <NavItem path="/month" icon={List} label="Month View" currentPath={location.pathname} onSelect={handleMobileNavigate} />
                                <NavItem path="/images" icon={ImageIcon} label="Photos" currentPath={location.pathname} onSelect={handleMobileNavigate} />
                                <NavItem path="/stats" icon={BarChart} label="Stats" currentPath={location.pathname} onSelect={handleMobileNavigate} />
                                <NavItem path="/tags" icon={Tag} label="Tags" currentPath={location.pathname} onSelect={handleMobileNavigate} />
                                <NavItem path="/memories" icon={History} label="Memories" currentPath={location.pathname} onSelect={handleMobileNavigate} />
                                <NavItem path="/pdf-export" icon={FileDown} label="PDF Export" currentPath={location.pathname} onSelect={handleMobileNavigate} />
                                <NavItem path="/settings" icon={Settings} label="Settings" currentPath={location.pathname} onSelect={handleMobileNavigate} />
                            </>
                        }
                    />
                </div>
            </header>

            {/* Main Content */}
            <main className={`flex-1 w-full max-w-7xl mx-auto animation-fade-in ${
                isEntryView
                    ? 'px-3 pt-1 pb-3 sm:px-4 sm:pt-2 sm:pb-4 lg:px-8 lg:pt-4 lg:pb-8'
                    : isCalendarView
                        ? 'px-4 pt-1 pb-4 sm:px-6 sm:pt-1.5 sm:pb-6 lg:px-8 lg:pt-2 lg:pb-8'
                        : 'p-4 sm:p-6 lg:p-8'
            }`}>
                <Outlet />
            </main>

            {/* Floating Action Button (Quick Write) */}
            {!location.pathname.startsWith('/entry/') && currentUser && (
                <button
                    type="button"
                    onClick={handleQuickWrite}
                    className={`quick-write-fab fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full shadow-2xl transition-transform duration-300 hover:scale-110 active:scale-95 md:bottom-8 md:right-8 ${
                        isQuickWriting
                            ? 'quick-write-fab--busy cursor-wait'
                            : 'quick-write-fab--ready'
                    }`}
                    title="Quick Write (Last unwritten day)"
                    aria-label="Quick Write: open the oldest unwritten day from the past week"
                    disabled={isQuickWriting}
                >
                    {!isQuickWriting && <span className="quick-write-fab-shine" aria-hidden="true" />}
                    <PenTool className="relative z-10 h-6 w-6 text-white" />
                </button>
            )}
        </div>
    );
}
