import React, { useState, useEffect } from 'react';
import { useNavigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { collection, getDocs, query, where, documentId, getCountFromServer, onSnapshot } from 'firebase/firestore';
import { format, startOfYear, endOfYear, eachMonthOfInterval, startOfMonth, getDay, getDaysInMonth } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function CalendarView() {
    const { currentUser } = useAuth();
    const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
    const [entries, setEntries] = useState(new Set());
    const [totalEntries, setTotalEntries] = useState(0);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();
    const location = useLocation();
    const isEntrySelected = location.pathname.includes('/entry/');

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
                    const entryDates = new Set();
                    querySnapshot.forEach((doc) => {
                        entryDates.add(doc.id);
                    });
                    setEntries(entryDates);
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
                                                const hasEntry = entries.has(dateKey);
                                                const isSelected = location.pathname.includes(dateKey);

                                                return (
                                                    <button
                                                        key={day}
                                                        onClick={() => navigate(`entry/${dateKey}`)}
                                                        className={`
                                                        aspect-square flex items-center justify-center rounded-full transition-all duration-300 text-sm relative z-0
                                                        ${hasEntry
                                                                ? 'bg-primary/20 text-primary font-bold shadow-[0_0_10px_rgba(139,92,246,0.2)] hover:bg-primary hover:text-white hover:shadow-[0_0_15px_rgba(139,92,246,0.5)]'
                                                                : 'text-text-muted hover:bg-white/10 hover:text-white'
                                                            }
                                                        ${isSelected ? 'ring-2 ring-secondary ring-offset-2 ring-offset-[#0a0a0b] z-10 scale-110 bg-primary text-white' : ''}
                                                        ${isToday && !hasEntry ? 'bg-white/10 text-white font-bold border border-white/20' : ''}
                                                    `}
                                                    >
                                                        {day}
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
