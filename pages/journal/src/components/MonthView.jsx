import React, { useState, useEffect } from 'react'; // Force refresh
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, documentId } from 'firebase/firestore';
import { format, startOfMonth, endOfMonth, addMonths, subMonths, parseISO, getDate } from 'date-fns';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';

export default function MonthView() {
    const { currentUser } = useAuth();
    const navigate = useNavigate();
    const [currentDate, setCurrentDate] = useState(new Date());
    const [entries, setEntries] = useState({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let unsubscribe = () => { };

        async function fetchMonthEntries() {
            setLoading(true);
            if (!currentUser) return;

            try {
                const start = startOfMonth(currentDate);
                const end = endOfMonth(currentDate);
                const startId = format(start, 'yyyy-MM-dd');
                const endId = format(end, 'yyyy-MM-dd');

                const q = query(
                    collection(db, 'users', currentUser.uid, 'entries'),
                    where(documentId(), '>=', startId),
                    where(documentId(), '<=', endId)
                );

                unsubscribe = onSnapshot(q, (querySnapshot) => {
                    const newEntries = {};
                    querySnapshot.forEach((doc) => {
                        const data = doc.data();
                        let title = data.title;

                        // If no title field, or to be safe, try to extract from content like EntryEditor does
                        // Format: ++Title++ or **++Title++**
                        if (data.content) {
                            const match = data.content.match(/(?:\*\*)?\+\+(.*?)\+\+(?:\*\*)?/);
                            if (match && match[1]) {
                                // Check if it has " - " separator like "Date - Title"
                                const parts = match[1].split(' - ');
                                if (parts.length >= 2) {
                                    title = parts.slice(1).join(' - ').trim();
                                } else {
                                    title = match[1].trim();
                                }
                            }
                        }

                        // ... Inside fetchMonthEntries ...
                        // Extract image (support current and legacy schemas)
                        let imageUrl = null;
                        if (data.images && Array.isArray(data.images) && data.images.length > 0) {
                            imageUrl = data.images[0].url;
                        } else if (data.imageUrl) {
                            imageUrl = data.imageUrl;
                        } else if (data.imageMetadata && data.imageMetadata.url) {
                            imageUrl = data.imageMetadata.url;
                        }

                        newEntries[doc.id] = {
                            title: title || 'Untitled Entry',
                            imageUrl: imageUrl
                        };
                    });
                    setEntries(newEntries);
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

        fetchMonthEntries();

        return () => unsubscribe();
    }, [currentDate, currentUser]);

    // Handle arrow keys
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'ArrowLeft') {
                prevMonth();
            } else if (e.key === 'ArrowRight') {
                nextMonth();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const prevMonth = () => setCurrentDate(d => subMonths(d, 1));
    const nextMonth = () => setCurrentDate(d => addMonths(d, 1));

    const handleEntryClick = (dateKey) => {
        navigate(`/entry/${dateKey}`);
    };



    // Better way to generate days
    const monthDates = [];
    let iter = startOfMonth(currentDate);
    const endM = endOfMonth(currentDate);

    while (iter <= endM) {
        monthDates.push(new Date(iter));
        iter.setDate(iter.getDate() + 1);
    }


    return (
        <div className="space-y-6 max-w-2xl mx-auto animation-fade-in">
            {/* Header / Navigation */}
            <div className="flex items-center justify-between glass-card p-4">
                <button
                    onClick={prevMonth}
                    className="glass-button p-2 text-text-muted hover:text-white rounded-full hover:bg-white/10"
                    title="Previous Month (Left Arrow)"
                >
                    <ChevronLeft className="w-6 h-6" />
                </button>

                <div className="text-center">
                    <h2 className="text-2xl font-serif font-bold text-white">
                        {format(currentDate, 'MMMM yyyy')}
                    </h2>
                </div>

                <button
                    onClick={nextMonth}
                    className="glass-button p-2 text-text-muted hover:text-white rounded-full hover:bg-white/10"
                    title="Next Month (Right Arrow)"
                >
                    <ChevronRight className="w-6 h-6" />
                </button>
            </div>

            {/* List of Entries */}
            <div className="glass-card overflow-hidden">
                {loading ? (
                    <div className="p-8 text-center text-text-muted animate-pulse">Loading...</div>
                ) : (
                    <div className="divide-y divide-white/10">
                        {monthDates.map((dateObj) => {
                            const dateKey = format(dateObj, 'yyyy-MM-dd');
                            const entryData = entries[dateKey];
                            const isToday = format(new Date(), 'yyyy-MM-dd') === dateKey;

                            return (
                                <div
                                    key={dateKey}
                                    onClick={() => handleEntryClick(dateKey)}
                                    className={`
                                        p-4 flex items-center gap-4 cursor-pointer transition-colors duration-200
                                        ${isToday ? 'bg-primary/5 hover:bg-primary/10' : 'hover:bg-white/5'}
                                    `}
                                >
                                    {/* Date Column */}
                                    <div className={`
                                        flex flex-col items-center justify-center w-12 h-12 rounded-lg border 
                                        ${isToday
                                            ? 'border-primary/50 bg-primary/20 text-primary'
                                            : 'border-white/10 bg-white/5 text-text-muted'
                                        }
                                    `}>
                                        <span className="text-xs uppercase font-bold">{format(dateObj, 'EEE')}</span>
                                        <span className="text-lg font-bold">{format(dateObj, 'd')}</span>
                                    </div>

                                    {/* Content Column */}
                                    <div className="flex-1 min-w-0">
                                        {entryData ? (
                                            <h3 className="text-sm sm:text-lg font-medium text-white whitespace-normal sm:truncate leading-tight sm:leading-normal">
                                                {entryData.title}
                                            </h3>
                                        ) : (
                                            <h3 className="text-sm italic text-text-muted/50">No entry</h3>
                                        )}
                                    </div>

                                    {/* Connection Line / Image Thumbnail */}
                                    {entryData && entryData.imageUrl && (
                                        <div className="w-12 h-12 shrink-0 rounded-md overflow-hidden bg-white/5 border border-white/10 relative group">
                                            <img
                                                src={entryData.imageUrl}
                                                alt="Thumb"
                                                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                                                loading="lazy"
                                            />
                                        </div>
                                    )}

                                    {/* Arrow hint */}
                                    <ChevronRight className="w-4 h-4 text-text-muted/30" />
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
