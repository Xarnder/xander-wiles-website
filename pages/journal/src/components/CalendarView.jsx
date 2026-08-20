import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { useNavigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { collection, query, where, documentId, getCountFromServer, onSnapshot } from 'firebase/firestore';
import { format, startOfYear, endOfYear, eachMonthOfInterval, startOfMonth, getDay, getDaysInMonth } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { subEntriesToPlainText } from '../utils/entrySections';
import { areCalendarImageCountsEnabled, subscribeCalendarImageCounts, areCalendarTagDotsEnabled, subscribeCalendarTagDots } from '../lib/calendarDisplay';

const CALENDAR_MONTH_NAMES = Array.from({ length: 12 }, (_, monthIndex) =>
    format(new Date(2024, monthIndex, 1), 'MMMM')
);
const MONTH_TITLE_MIN_SIZE = 16;
const MONTH_TITLE_MAX_SIZE = 48;

export default function CalendarView() {
    const { currentUser } = useAuth();
    const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
    const [entries, setEntries] = useState(new Map()); // Map<DateString, { wordCount: number, tags: string[] }>
    const [tags, setTags] = useState({}); // Map of tagId -> tag data
    const [totalEntries, setTotalEntries] = useState(0);
    const [showImageCounts, setShowImageCounts] = useState(areCalendarImageCountsEnabled);
    const [showTagDots, setShowTagDots] = useState(areCalendarTagDotsEnabled);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [reloadKey, setReloadKey] = useState(0);
    const navigate = useNavigate();
    const location = useLocation();
    const isEntrySelected = location.pathname.includes('/entry/');
    const monthTitleRef = useRef(null);
    const monthTitleMeasureRef = useRef(null);
    const [monthTitleFontSize, setMonthTitleFontSize] = useState(MONTH_TITLE_MIN_SIZE);

    // Helper to count words
    const countWords = (str) => {
        if (!str) return 0;
        return str.trim().split(/\s+/).length;
    };

    // Fetch tags
    useEffect(() => {
        if (!currentUser) return;
        const tagsQuery = query(collection(db, 'users', currentUser.uid, 'tags'));
        const unsubscribe = onSnapshot(tagsQuery, (snapshot) => {
            const tagsMap = {};
            snapshot.forEach(doc => {
                tagsMap[doc.id] = doc.data();
            });
            setTags(tagsMap);
        });
        return () => unsubscribe();
    }, [currentUser]);

    useEffect(() => subscribeCalendarImageCounts(setShowImageCounts), []);
    useEffect(() => subscribeCalendarTagDots(setShowTagDots), []);

    // Fetch entries for the selected year with real-time listener
    useEffect(() => {
        let unsubscribe = () => { };

        async function setupListener() {
            setLoading(true);
            setLoadError('');
            if (!currentUser) return;

            try {
                const startId = `${currentYear}-01-01`;
                const endId = `${currentYear}-12-31`;

                const q = query(
                    collection(db, 'users', currentUser.uid, 'entries'),
                    where(documentId(), '>=', startId),
                    where(documentId(), '<=', endId)
                );

                unsubscribe = onSnapshot(q, (querySnapshot) => {
                    const entryData = new Map();
                    querySnapshot.forEach((doc) => {
                        const data = doc.data();
                        entryData.set(doc.id, {
                            wordCount: countWords([data.content || '', subEntriesToPlainText(data.subEntries)].filter(Boolean).join(' ')),
                            imageCount: (data.images ? data.images.length : (data.imageUrl || data.imageMetadata ? 1 : 0)),
                            hasTitle: !!data.title && data.title.trim().length > 0,
                            tags: data.tags || [],
                            isSpecial: data.isSpecial || false
                        });
                    });
                    setEntries(entryData);
                    setLoading(false);
                }, (error) => {
                    console.error("Error fetching entries:", error);
                    setLoadError('The calendar could not be loaded. Check your connection and try again.');
                    setLoading(false);
                });

            } catch (error) {
                console.error("Error setting up listener:", error);
                setLoadError('The calendar could not be loaded. Check your connection and try again.');
                setLoading(false);
            }
        }

        setupListener();

        return () => unsubscribe();
    }, [currentYear, currentUser, reloadKey]);

    // Fetch total count (all time)
    useEffect(() => {
        async function fetchTotal() {
            if (!currentUser) return;
            try {
                const coll = collection(db, 'users', currentUser.uid, 'entries');
                const snapshot = await getCountFromServer(coll);
                setTotalEntries(snapshot.data().count);
            } catch (e) {
                console.error("Error fetching total count:", e);
            }
        }
        fetchTotal();
    }, [currentUser]);

    // Navigation handlers
    const prevYear = () => setCurrentYear(y => y - 1);
    const nextYear = () => setCurrentYear(y => y + 1);

    const currentYearDate = new Date(currentYear, 0, 1);
    const monthsInYear = eachMonthOfInterval({
        start: startOfYear(currentYearDate),
        end: endOfYear(currentYearDate)
    });

    useLayoutEffect(() => {
        if (loading) return undefined;

        const container = monthTitleRef.current;
        const measure = monthTitleMeasureRef.current;
        if (!container || !measure) return undefined;

        const fitMonthTitles = () => {
            const available = container.clientWidth;
            if (available <= 0) return;

            let widest = 0;
            for (const monthName of CALENDAR_MONTH_NAMES) {
                measure.textContent = monthName;
                widest = Math.max(widest, measure.scrollWidth);
            }

            if (widest <= 0) return;

            const nextSize = Math.max(
                MONTH_TITLE_MIN_SIZE,
                Math.min(MONTH_TITLE_MAX_SIZE, MONTH_TITLE_MAX_SIZE * ((available - 1) / widest))
            );
            setMonthTitleFontSize((currentSize) => (
                Math.abs(currentSize - nextSize) < 0.25 ? currentSize : nextSize
            ));
        };

        const observer = new ResizeObserver(fitMonthTitles);
        observer.observe(container);
        fitMonthTitles();

        let cancelled = false;
        if (document.fonts?.ready) {
            document.fonts.ready.then(() => {
                if (!cancelled) fitMonthTitles();
            });
        }

        return () => {
            cancelled = true;
            observer.disconnect();
        };
    }, [loading, isEntrySelected]);

    // Auto-scroll to current month on mobile
    useEffect(() => {
        if (!loading && currentYear === new Date().getFullYear() && window.innerWidth < 640) {
            const timer = setTimeout(() => {
                const element = document.getElementById('current-month-card');
                if (element) {
                    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }, 100);
            return () => clearTimeout(timer);
        }
    }, [currentYear, loading]);

    return (
        <div className={isEntrySelected ? 'md:space-y-4' : 'space-y-3'}>
            {/* Stats + year — Hidden if entry selected on mobile to save space */}
            <div className={`glass-card px-3 py-2 flex-wrap items-center justify-center gap-x-5 gap-y-2 transition-all duration-300 ${isEntrySelected ? 'hidden md:flex' : 'flex'}`}>
                <div className="text-center">
                    <p className="text-text-muted text-[10px] uppercase tracking-wider leading-none mb-1">In {currentYear}</p>
                    <p className="text-2xl font-serif font-bold text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary leading-none">{entries.size}</p>
                </div>
                <div className="text-center">
                    <p className="text-text-muted text-[10px] uppercase tracking-wider leading-none mb-1">Total Entries</p>
                    <p className="text-2xl font-serif font-bold text-white leading-none">{totalEntries}</p>
                </div>
                <div className="h-8 w-px bg-white/10" aria-hidden="true" />
                <div className="flex items-center gap-1.5">
                    <button
                        type="button"
                        onClick={prevYear}
                        className="glass-button p-1.5 rounded-full hover:scale-110 active:scale-95 text-text-muted hover:text-white"
                        aria-label={`Show ${currentYear - 1}`}
                    >
                        <ChevronLeft className="w-5 h-5" />
                    </button>
                    <h2 className="min-w-[4.5rem] text-center text-2xl font-serif font-bold text-white tracking-tight leading-none">{currentYear}</h2>
                    <button
                        type="button"
                        onClick={nextYear}
                        className="glass-button p-1.5 rounded-full hover:scale-110 active:scale-95 text-text-muted hover:text-white"
                        aria-label={`Show ${currentYear + 1}`}
                    >
                        <ChevronRight className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* Main Layout: Calendar + Editor Split */}
            <div className={`flex flex-col md:flex-row gap-6 h-full transition-all duration-300 relative`}>

                {/* Calendar Grid */}
                <div className={`transition-all duration-500 ease-in-out
                    ${isEntrySelected
                        ? 'hidden md:block md:w-5/12 lg:w-1/3 md:h-[calc(100vh-250px)] md:overflow-y-auto md:pr-4 custom-scrollbar'
                        : 'w-full'}
                `}>

                    {loading ? (
                        <div className="text-center text-text-muted py-20 animate-pulse">Loading secular time...</div>
                    ) : loadError ? (
                        <div role="alert" className="glass-card p-8 text-center">
                            <p className="text-text-secondary mb-4">{loadError}</p>
                            <button type="button" onClick={() => setReloadKey((key) => key + 1)} className="glass-button px-4 py-2 text-text">
                                Try again
                            </button>
                        </div>
                    ) : (
                        <>
                            <span
                                ref={monthTitleMeasureRef}
                                aria-hidden="true"
                                className="pointer-events-none fixed -left-[9999px] top-0 whitespace-nowrap font-serif font-bold"
                                style={{ fontSize: `${MONTH_TITLE_MAX_SIZE}px` }}
                            />
                            <div className={`grid gap-6 transition-all duration-300 ${isEntrySelected
                                ? 'grid-cols-1'
                                : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
                                }`}>
                            {monthsInYear.map((monthDate) => {
                                const monthIndex = monthDate.getMonth();
                                const daysInMonth = getDaysInMonth(monthDate);
                                const firstDayOfMonth = getDay(startOfMonth(monthDate));
                                const startOffset = (firstDayOfMonth + 6) % 7; // Mon=0

                                // Calculate min and max words for this month
                                let minWords = Infinity;
                                let maxWords = 0;
                                let hasEntriesInMonth = false;

                                for (let i = 1; i <= daysInMonth; i++) {
                                    const dateKey = format(new Date(currentYear, monthIndex, i), 'yyyy-MM-dd');
                                    const entry = entries.get(dateKey);
                                    if (entry) {
                                        hasEntriesInMonth = true;
                                        if (entry.wordCount < minWords) minWords = entry.wordCount;
                                        if (entry.wordCount > maxWords) maxWords = entry.wordCount;
                                    }
                                }

                                if (!hasEntriesInMonth) {
                                    minWords = 0;
                                    maxWords = 0;
                                }

                                return (
                                    <div 
                                        key={monthDate.toString()} 
                                        id={monthIndex === new Date().getMonth() && currentYear === new Date().getFullYear() ? 'current-month-card' : undefined}
                                        className="glass-card p-5 hover:border-primary/30 transition duration-300 group"
                                    >
                                        <h3
                                            ref={monthIndex === 0 ? monthTitleRef : undefined}
                                            className="w-full text-center font-serif text-white font-bold mb-4 whitespace-nowrap border-b border-white/5 pb-2 leading-tight group-hover:text-primary transition-colors"
                                            style={{ fontSize: `${monthTitleFontSize}px` }}
                                        >
                                            {format(monthDate, 'MMMM')}
                                        </h3>

                                        <div className="grid grid-cols-7 gap-1 text-center text-xs mb-2 text-text-muted font-bold opacity-60">
                                            {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d, i) => (
                                                <div key={i}>{d}</div>
                                            ))}
                                        </div>

                                        <div className="relative">
                                        <div className="grid grid-cols-7 gap-1 text-center">
                                            {/* Empty slots */}
                                            {Array.from({ length: startOffset }).map((_, i) => (
                                                <div key={`empty-${i}`} />
                                            ))}

                                            {/* Days */}
                                            {Array.from({ length: daysInMonth }).map((_, i) => {
                                                const day = i + 1;
                                                const dateObj = new Date(currentYear, monthIndex, day);
                                                const isToday = day === new Date().getDate() && monthIndex === new Date().getMonth() && currentYear === new Date().getFullYear();
                                                const dateKey = format(dateObj, 'yyyy-MM-dd');
                                                const entry = entries.get(dateKey);
                                                const isSelected = location.pathname.includes(dateKey);
                                                const isTitleOnly = entry && entry.hasTitle && entry.wordCount === 0;

                                                // Calculate Intensity and Color
                                                let style = {};
                                                let className = `aspect-square flex items-center justify-center rounded-sm transition-all duration-300 text-sm relative z-0 `;

                                                if (isSelected) {
                                                    // Blue selection instead of secondary/primary
                                                    className += 'ring-2 ring-blue-400 ring-offset-2 ring-offset-bg z-10 scale-110 bg-blue-600 text-white ';
                                                } else if (entry && entry.isSpecial) {
                                                    // Special Day: Yellow ring and slight glow
                                                    className += 'ring-2 ring-yellow-400 ring-offset-2 ring-offset-bg z-10 font-bold bg-yellow-500 text-[#1a1b1e] ';
                                                    style = {
                                                        boxShadow: '0 0 15px rgba(234, 179, 8, 0.4)'
                                                    };
                                                } else if (entry && !isTitleOnly) {
                                                    // Normalize word count 0..1 relative to month
                                                    let intensity = 0;
                                                    if (maxWords > minWords) {
                                                        intensity = (entry.wordCount - minWords) / (maxWords - minWords);
                                                    } else if (maxWords === minWords && maxWords > 0) {
                                                        intensity = 0.5; // If all entries have same length (and not 0), pick a middle ground
                                                    }

                                                    // Interpolate Lightness: High L (light purple) -> Low L (dark purple)
                                                    // Primary Purple is roughly H=265
                                                    // Light: L=95%, Dark: L=30%
                                                    const minL = 30;
                                                    const maxL = 95;
                                                    const lightness = maxL - (intensity * (maxL - minL));

                                                    const backgroundColor = `hsl(265, 85%, ${lightness}%)`;

                                                    // Determine text color based on background lightness
                                                    // If background is light (>60%), use dark text. Else white.
                                                    const textColor = lightness > 60 ? '#1a1b1e' : '#ffffff';

                                                    style = {
                                                        backgroundColor: backgroundColor,
                                                        color: textColor,
                                                        boxShadow: `0 0 ${5 + intensity * 10}px ${backgroundColor}`
                                                    };

                                                    // Hover effect is handled by CSS or dynamic style? 
                                                    // For inline styles, hover is tricky. Let's rely on standard hover classes but let inline bg override.
                                                    // Actually, Tailwind hover classes won't override inline styles easily without !important.
                                                    // We can use a group-hover or just let it be. 
                                                    // Let's add a basic hover scale.
                                                    className += 'hover:scale-110 font-bold ';

                                                } else {
                                                    className += 'text-text-muted hover:bg-white/10 hover:text-white ';
                                                    if (isToday) {
                                                        className += 'bg-white/10 text-white font-bold border border-white/20 ';
                                                    }
                                                }

                                                return (
                                                    <button
                                                        type="button"
                                                        key={day}
                                                        onClick={() => navigate(`/entry/${dateKey}`, { state: { from: location.pathname } })}
                                                        style={style}
                                                        className={className}
                                                        title={entry ? `${entry.wordCount} words${entry.hasTitle ? ' + Title' : ''}` : ''}
                                                        aria-label={`${format(dateObj, 'MMMM d, yyyy')}${entry ? `, ${entry.wordCount} words, ${entry.imageCount} images${entry.isSpecial ? ', special day' : ''}` : ', no entry'}`}
                                                    >
                                                        {day}

                                                        {/* Title Only Indicator - Red Dot on Left */}
                                                        {isTitleOnly && (
                                                            <div className="absolute top-1/2 left-0 w-1.5 h-1.5 bg-red-500 rounded-full transform -translate-x-1/2 -translate-y-1/2 ml-1"></div>
                                                        )}

                                                        {/* Tag Indicators - Max 4 Dots at bottom */}
                                                        {showTagDots && entry && entry.tags && entry.tags.length > 0 && (
                                                            <div className="absolute bottom-1 left-0 right-0 flex justify-center gap-0.5 px-0.5 pointer-events-none">
                                                                {entry.tags.slice(0, 4).map(tagId => {
                                                                    const tagColor = tags[tagId]?.color;
                                                                    if (!tagColor) return null;
                                                                    return (
                                                                        <div
                                                                            key={tagId}
                                                                            className="w-1.5 h-1.5 rounded-full shadow-sm"
                                                                            style={{ backgroundColor: tagColor }}
                                                                        />
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        {showImageCounts && (
                                        <div className="pointer-events-none absolute inset-0 z-30 grid grid-cols-7 gap-1" aria-hidden="true">
                                            {Array.from({ length: startOffset }).map((_, i) => (
                                                <div key={`image-badge-empty-${i}`} />
                                            ))}
                                            {Array.from({ length: daysInMonth }).map((_, i) => {
                                                const dateKey = format(new Date(currentYear, monthIndex, i + 1), 'yyyy-MM-dd');
                                                const imageCount = entries.get(dateKey)?.imageCount || 0;

                                                return (
                                                    <div key={`image-badge-${dateKey}`} className="relative aspect-square">
                                                        {imageCount > 0 && (
                                                            <div className="absolute -top-1.5 -right-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-bg bg-blue-500 px-0.5 text-[10px] font-bold text-white shadow-sm">
                                                                {imageCount}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        )}
                                        </div>
                                    </div>
                                );
                            })}
                            </div>
                        </>
                    )}
                </div>

                {/* Entry Viewer / Editor Panel */}
                {isEntrySelected && (
                    <div className="w-full md:w-7/12 lg:w-2/3 animation-fade-in md:border-l border-white/10 md:pl-8">
                        <Outlet />
                    </div>
                )}
            </div>

            <div className="pb-8" aria-hidden="true" />
        </div>
    );
}
