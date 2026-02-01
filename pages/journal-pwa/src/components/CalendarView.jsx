import React, { useState, useEffect } from 'react';
import { useNavigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { collection, getDocs, query, where, documentId, getCountFromServer } from 'firebase/firestore';
import { format, getYear, setYear, startOfYear, endOfYear, eachMonthOfInterval, startOfMonth, endOfMonth, getDay, getDaysInMonth } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default function CalendarView() {
    const { currentUser } = useAuth();
    const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
    const [entries, setEntries] = useState(new Set());
    const [totalEntries, setTotalEntries] = useState(0);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();
    const location = useLocation();
    const isEntrySelected = location.pathname.includes('/entry/');

    // Fetch entries for the selected year
    useEffect(() => {
        async function fetchEntriesForYear() {
            setLoading(true);
            if (!currentUser) return;

            try {
                const startId = `${currentYear}-01-01`;
                const endId = `${currentYear}-12-31`;

                // Query by Document ID range
                const q = query(
                    collection(db, 'users', currentUser.uid, 'entries'),
                    where(documentId(), '>=', startId),
                    where(documentId(), '<=', endId)
                );

                const querySnapshot = await getDocs(q);
                const entryDates = new Set();
                querySnapshot.forEach((doc) => {
                    entryDates.add(doc.id);
                });
                setEntries(entryDates);
            } catch (error) {
                console.error("Error fetching entries:", error);
            } finally {
                setLoading(false);
            }
        }

        fetchEntriesForYear();
        fetchEntriesForYear();
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

    // Keyboard Navigation
    useEffect(() => {
        function handleKeyDown(e) {
            if (entries.size === 0) return;

            const sortedDates = Array.from(entries).sort();
            // If we are just viewing the calendar, maybe we want to jump to the LATEST entry?
            // Or if we select a day. 
            // The user request said "Allow me to easily jump between years".
            // But script.js had "Next/Prev entry".
            // Since we are in CalendarView, we aren't "on" an entry. 
            // Maybe this keyboard nav is for the EntryEditor? Content said "Browse all my historical entries".
            // Use arrow keys to change YEAR in calendar view?

            if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;

            if (e.key === 'ArrowLeft') {
                setCurrentYear(y => y - 1);
            } else if (e.key === 'ArrowRight') {
                setCurrentYear(y => y + 1);
            }
        }

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [entries, currentYear]); // Re-bind when years change


    const handleYearChange = (e) => {
        setCurrentYear(parseInt(e.target.value));
    };

    const currentYearDate = new Date(currentYear, 0, 1);
    const monthsInYear = eachMonthOfInterval({
        start: startOfYear(currentYearDate),
        end: endOfYear(currentYearDate)
    });

    return (
        <div className="space-y-6">
            {/* Stats Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between bg-surface border border-border rounded-lg p-4 mb-6">
                <div>
                    <h2 className="text-lg font-bold text-primary">Journal Overview</h2>
                </div>
                <div className="flex space-x-6 mt-2 md:mt-0 text-sm">
                    <div className="text-center md:text-right">
                        <p className="text-text-muted">In {currentYear}</p>
                        <p className="text-xl font-serif font-bold text-text">{entries.size}</p>
                    </div>
                    <div className="text-center md:text-right border-l border-border pl-6">
                        <p className="text-text-muted">Total Entries</p>
                        <p className="text-xl font-serif font-bold text-secondary">{totalEntries}</p>
                    </div>
                </div>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-center space-x-4 mb-8">
                <button
                    onClick={() => setCurrentYear(prev => prev - 1)}
                    className="p-2 rounded-full hover:bg-surface text-text-muted hover:text-white transition"
                >
                    <ChevronLeft className="w-6 h-6" />
                </button>
                <h2 className="text-3xl font-serif font-bold text-primary">{currentYear}</h2>
                <button
                    onClick={() => setCurrentYear(prev => prev + 1)}
                    className="p-2 rounded-full hover:bg-surface text-text-muted hover:text-white transition"
                >
                    <ChevronRight className="w-6 h-6" />
                </button>
            </div>

            {/* Main Layout: Calendar + Editor Split */}
            <div className={`flex flex-col-reverse md:flex-row gap-6 h-full transition-all duration-300`}>
                {/* Calendar Grid */}
                <div className={`transition-all duration-300 ${isEntrySelected ? 'w-full md:w-5/12 lg:w-1/3 h-[calc(100vh-200px)] overflow-y-auto pr-2' : 'w-full'}`}>

                    {loading ? (
                        <div className="text-center text-text-muted py-20">Loading calendar...</div>
                    ) : (
                        <div className={`grid gap-8 transition-all duration-300 ${isEntrySelected
                                ? 'grid-cols-1'
                                : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
                            }`}>
                            {monthsInYear.map((monthDate) => {
                                const monthIndex = monthDate.getMonth();
                                // Get days for this month
                                const daysInMonth = getDaysInMonth(monthDate);
                                const firstDayOfMonth = getDay(startOfMonth(monthDate));
                                // 0=Sun, 1=Mon...6=Sat. 
                                // We want Mon=0, Sun=6.
                                // formula: (day + 6) % 7
                                const startOffset = (firstDayOfMonth + 6) % 7;

                                return (
                                    <div key={monthDate.toString()} className="month-container bg-surface rounded-xl border border-border p-4 shadow-sm hover:shadow-md transition duration-300">
                                        <h3 className="text-center font-serif text-primary font-bold mb-4">{format(monthDate, 'MMMM')}</h3>

                                        <div className="grid grid-cols-7 gap-1 text-center text-xs mb-2 text-text-muted font-bold">
                                            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                                                <div key={i}>{d}</div>
                                            ))}

                                            {/* Empty slots for start of month (Monday start) */}
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
                                                        aspect-square flex items-center justify-center rounded-full transition-all duration-200 text-sm
                                                        ${hasEntry
                                                                ? 'bg-primary/20 text-primary font-bold hover:bg-primary hover:text-white ring-1 ring-primary/50'
                                                                : 'text-text-muted hover:bg-surface hover:text-text'
                                                            }
                                                        ${isSelected ? 'ring-2 ring-secondary ring-offset-2 ring-offset-bg z-10' : ''}
                                                        ${isToday ? 'bg-secondary text-black font-bold' : ''}
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
                    <div className="w-full md:w-7/12 lg:w-2/3 animation-fade-in border-t md:border-t-0 md:border-l border-border md:pl-6 pt-6 md:pt-0">
                        <Outlet />
                    </div>
                )}
            </div>

            {/* Footer UID Display */}
            <div className="mt-12 pt-6 border-t border-border text-center">
                <p className="text-xs text-text-muted">
                    User ID: <code className="bg-black/20 px-1 rounded select-all hover:text-text cursor-pointer" title="ID needed for migration">{currentUser?.uid}</code>
                </p>
            </div>
        </div>
    );
}
