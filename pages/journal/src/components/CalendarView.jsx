import React, { useState, useEffect } from 'react';
import { useNavigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { collection, getDocs, query, where, documentId, getCountFromServer, onSnapshot } from 'firebase/firestore';
import { format, startOfYear, endOfYear, eachMonthOfInterval, startOfMonth, getDay, getDaysInMonth } from 'date-fns';
import { ChevronLeft, ChevronRight, Star } from 'lucide-react';

export default function CalendarView() {
    const { currentUser } = useAuth();
    const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
    const [entries, setEntries] = useState(new Map()); // Map<DateString, { wordCount: number, tags: string[] }>
    const [tags, setTags] = useState({}); // Map of tagId -> tag data
    const [totalEntries, setTotalEntries] = useState(0);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();
    const location = useLocation();
    const isEntrySelected = location.pathname.includes('/entry/');

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

    // Fetch entries for the selected year with real-time listener
    useEffect(() => {
        let unsubscribe = () => { };

        async function setupListener() {
            setLoading(true);
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
                            wordCount: countWords(data.content || ''),
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
                    setLoading(false);
                });

            } catch (error) {
                console.error("Error setting up listener:", error);
                setLoading(false);
            }
        }

        setupListener();

        return () => unsubscribe();
    }, [currentYear, currentUser]);

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

    return (
        <div className="space-y-6">
            {/* Stats Header - Hidden if entry selected on mobile to save space */}
            <div className={`glass-card p-6 flex flex-col md:flex-row md:items-center md:justify-between transition-all duration-300 ${isEntrySelected ? 'hidden md:flex' : 'flex'}`}>
                <div>
                    <h2 className="text-xl font-bold text-white mb-1">Journal Overview</h2>
                    <p className="text-text-muted text-sm">Your journey through time</p>
                </div>
                <div className="flex space-x-8 mt-4 md:mt-0 text-sm">
                    <div className="text-center md:text-right">
                        <p className="text-text-muted text-xs uppercase tracking-wider mb-1">In {currentYear}</p>
                        <p className="text-3xl font-serif font-bold text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">{entries.size}</p>
                    </div>
                    <div className="text-center md:text-right border-l border-white/10 pl-8">
                        <p className="text-text-muted text-xs uppercase tracking-wider mb-1">Total Entries</p>
                        <p className="text-3xl font-serif font-bold text-white">{totalEntries}</p>
                    </div>
                </div>
            </div>

            {/* Controls - Hidden if entry selected on mobile */}
            <div className={`items-center justify-center space-x-6 mb-8 ${isEntrySelected ? 'hidden md:flex' : 'flex'}`}>
                <button
                    onClick={prevYear}
                    className="glass-button p-3 rounded-full hover:scale-110 active:scale-95 text-text-muted hover:text-white"
                >
                    <ChevronLeft className="w-6 h-6" />
                </button>
                <h2 className="text-4xl font-serif font-bold text-white tracking-tight">{currentYear}</h2>
                <button
                    onClick={nextYear}
                    className="glass-button p-3 rounded-full hover:scale-110 active:scale-95 text-text-muted hover:text-white"
                >
                    <ChevronRight className="w-6 h-6" />
                </button>
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
                    ) : (
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
                                    <div key={monthDate.toString()} className="glass-card p-5 hover:border-primary/30 transition duration-300 group">
                                        <h3 className="text-center font-serif text-white font-bold mb-4 text-lg border-b border-white/5 pb-2 group-hover:text-primary transition-colors">{format(monthDate, 'MMMM')}</h3>

                                        <div className="grid grid-cols-7 gap-1 text-center text-xs mb-2 text-text-muted font-bold opacity-60">
                                            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                                                <div key={i}>{d}</div>
                                            ))}
                                        </div>

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
                                                let className = `aspect-square flex items-center justify-center rounded-full transition-all duration-300 text-sm relative z-0 `;

                                                if (isSelected) {
                                                    // Blue selection instead of secondary/primary
                                                    className += 'ring-2 ring-blue-400 ring-offset-2 ring-offset-[#0a0a0b] z-10 scale-110 bg-blue-600 text-white ';
                                                } else if (entry && entry.isSpecial) {
                                                    // Special Day: Yellow ring and slight glow
                                                    className += 'ring-2 ring-yellow-400 ring-offset-2 ring-offset-[#0a0a0b] z-10 font-bold bg-yellow-500 text-[#1a1b1e] ';
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
                                                        key={day}
                                                        onClick={() => navigate(`entry/${dateKey}`, { state: { from: location.pathname } })}
                                                        style={style}
                                                        className={className}
                                                        title={entry ? `${entry.wordCount} words${entry.hasTitle ? ' + Title' : ''}` : ''}
                                                    >
                                                        {day}
                                                        {/* Special Day Star Icon */}
                                                        {entry && entry.isSpecial && (
                                                            <div className="absolute -top-1 -left-1 text-yellow-400 drop-shadow-sm z-20">
                                                                <Star className="w-3 h-3 fill-yellow-400" />
                                                            </div>
                                                        )}

                                                        {/* Image Indicator - Blue Badge with Count */}
                                                        {entry && entry.imageCount > 0 && (
                                                            <div className="absolute -top-1.5 -right-1.5 flex items-center justify-center min-w-[18px] h-[18px] px-0.5 bg-blue-500 rounded-full border-2 border-[#0a0a0b] text-[10px] font-bold text-white z-20 shadow-sm">
                                                                {entry.imageCount}
                                                            </div>
                                                        )}

                                                        {/* Title Only Indicator - Red Dot on Left */}
                                                        {isTitleOnly && (
                                                            <div className="absolute top-1/2 left-0 w-1.5 h-1.5 bg-red-500 rounded-full transform -translate-x-1/2 -translate-y-1/2 ml-1"></div>
                                                        )}

                                                        {/* Tag Indicators - Max 4 Dots at bottom */}
                                                        {entry && entry.tags && entry.tags.length > 0 && (
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
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Entry Viewer / Editor Panel */}
                {isEntrySelected && (
                    <div className="w-full md:w-7/12 lg:w-2/3 animation-fade-in md:border-l border-white/10 md:pl-8">
                        <Outlet />
                    </div>
                )}
            </div>

            {/* Footer which acts as spacer and info */}
            <div className="mt-8 pt-6 border-t border-white/5 text-center pb-8">
                <p className="text-xs text-text-muted">
                    User ID: <code className="bg-black/40 px-2 py-1 rounded text-primary/70 select-all hover:text-primary cursor-pointer transition-colors" title="ID needed for migration">{currentUser?.uid}</code>
                </p>
            </div>
        </div>
    );
}
