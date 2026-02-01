import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { collection, getDocs, query, where, documentId } from 'firebase/firestore';
import { format, getYear, setYear, startOfYear, endOfYear, eachMonthOfInterval, startOfMonth, endOfMonth, getDay, getDaysInMonth } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default function CalendarView() {
    const { currentUser } = useAuth();
    const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
    const [entries, setEntries] = useState(new Set());
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

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
    }, [currentYear, currentUser]);

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
            {/* UID Helper - Temporary for migration */}
            {currentUser && (
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 text-center mb-6">
                    <p className="text-sm text-text-muted mb-1">Your User UID (needed for migration):</p>
                    <code className="bg-black/20 px-2 py-1 rounded text-primary font-mono select-all">
                        {currentUser.uid}
                    </code>
                    <p className="text-xs text-text-muted mt-2">
                        Querying year: {currentYear} | Entries found: {entries.size}
                    </p>
                </div>
            )}

            {/* Controls */}
            <div className="flex items-center justify-center space-x-4 mb-8">
                <button
                    onClick={() => setCurrentYear(y => y - 1)}
                    className="p-2 rounded-full hover:bg-surface border border-transparent hover:border-border transition"
                >
                    <ChevronLeft className="w-6 h-6 text-text-muted" />
                </button>

                <select
                    value={currentYear}
                    onChange={handleYearChange}
                    className="bg-surface text-2xl font-serif font-bold py-2 px-4 rounded border border-border focus:outline-none focus:border-primary text-secondary appearance-none cursor-pointer"
                >
                    {/* Generate a range of years, e.g., 2010 to Next Year */}
                    {Array.from({ length: 20 }, (_, i) => new Date().getFullYear() + 1 - i).map(y => (
                        <option key={y} value={y}>{y}</option>
                    ))}
                </select>

                <button
                    onClick={() => setCurrentYear(y => y + 1)}
                    className="p-2 rounded-full hover:bg-surface border border-transparent hover:border-border transition"
                >
                    <ChevronRight className="w-6 h-6 text-text-muted" />
                </button>
            </div>

            {loading ? (
                <div className="text-center text-text-muted py-20">Loading calendar...</div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {monthsInYear.map((monthDate) => (
                        <div key={monthDate.toString()} className="month-container bg-surface rounded-xl border border-border p-4 shadow-sm hover:shadow-md transition duration-300">
                            <h3 className="text-center font-serif text-primary font-bold mb-4">{format(monthDate, 'MMMM')}</h3>

                            <div className="grid grid-cols-7 gap-1 text-center text-xs mb-2 text-text-muted font-bold">
                                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <div key={i}>{d}</div>)}
                            </div>

                            <div className="grid grid-cols-7 gap-1 text-center text-sm">
                                {/* Empty slots for start of month */}
                                {Array.from({ length: getDay(startOfMonth(monthDate)) }).map((_, i) => (
                                    <div key={`empty-${i}`} />
                                ))}

                                {/* Days */}
                                {Array.from({ length: getDaysInMonth(monthDate) }).map((_, i) => {
                                    const day = i + 1;
                                    const dateStr = format(new Date(currentYear, monthDate.getMonth(), day), 'yyyy-MM-dd');
                                    const hasEntry = entries.has(dateStr);
                                    const isToday = dateStr === format(new Date(), 'yyyy-MM-dd');

                                    return (
                                        <div
                                            key={day}
                                            onClick={() => navigate(`/entry/${dateStr}`)}
                                            className={`
                        h-8 w-8 flex items-center justify-center rounded-full cursor-pointer transition-all duration-200
                        ${hasEntry
                                                    ? 'font-bold text-secondary hover:bg-secondary/20 hover:text-secondary'
                                                    : 'text-text-muted opacity-50 hover:opacity-100 hover:bg-white/5'}
                        ${isToday ? 'border-2 border-primary' : ''}
                      `}
                                        >
                                            {day}
                                            {hasEntry && <div className="absolute w-1 h-1 bg-secondary rounded-full bottom-1" />}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
