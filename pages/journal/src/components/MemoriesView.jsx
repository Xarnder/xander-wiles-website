import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { collection, query, where, documentId, onSnapshot } from 'firebase/firestore';
import { format, subDays, subMonths, subYears, parseISO, startOfWeek, endOfWeek, isSameMonth, getMonth, getYear, isSameWeek } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { History, Star, Calendar, MessageSquare, ChevronRight, Image as ImageIcon } from 'lucide-react';
import ImageWithSkeleton from './ImageWithSkeleton';

// Reuse stop words for extracting standard title pattern
const extractTitle = (content, storedTitle) => {
    if (!content) return storedTitle || '';
    const match = content.match(/(?:\*\*)?\+\+(.*?)\+\+(?:\*\*)?/);
    if (match && match[1]) {
        const parts = match[1].split(' - ');
        if (parts.length >= 2) {
            return parts.slice(1).join(' - ').trim();
        }
        return match[1].trim();
    }
    return storedTitle || '';
};

// Count words in text
const countWords = (text) => {
    if (!text) return 0;
    const cleanText = text.replace(/[#*`_~]/g, ' ');
    const words = cleanText.toLowerCase().match(/\b\w+\b/g) || [];
    return words.length;
};

// Extract image URL fallback based on schema
const extractImageUrl = (data) => {
    if (data.images && Array.isArray(data.images) && data.images.length > 0) {
        return data.images[0].url;
    } else if (data.imageUrl) {
        return data.imageUrl;
    } else if (data.imageMetadata && data.imageMetadata.url) {
        return data.imageMetadata.url;
    }
    return null;
};

export default function MemoriesView() {
    const { currentUser } = useAuth();
    const navigate = useNavigate();
    const [entries, setEntries] = useState([]);
    const [loading, setLoading] = useState(true);

    // Fetch past year of entries
    useEffect(() => {
        if (!currentUser) return;

        setLoading(true);
        const endDate = new Date();
        const startDate = subYears(endDate, 1);

        const startId = format(startDate, 'yyyy-MM-dd');
        const endId = format(endDate, 'yyyy-MM-dd');

        const q = query(
            collection(db, 'users', currentUser.uid, 'entries'),
            where(documentId(), '>=', startId),
            where(documentId(), '<=', endId)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetched = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                const wordCount = countWords(data.content || data.text);
                const title = extractTitle(data.content || data.text, data.title);
                const img = extractImageUrl(data);

                fetched.push({
                    id: doc.id,
                    date: parseISO(doc.id),
                    title: title || 'Untitled Entry',
                    wordCount,
                    imageUrl: img,
                    contentPreview: (data.content || data.text || '').substring(0, 100) + '...'
                });
            });
            // Sort by most recent
            fetched.sort((a, b) => b.id.localeCompare(a.id));
            setEntries(fetched);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching memory data:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [currentUser]);

    const memories = useMemo(() => {
        const today = new Date();
        const targets = [
            { label: 'One week ago', targetDate: subDays(today, 7), id: format(subDays(today, 7), 'yyyy-MM-dd') },
            { label: 'One month ago', targetDate: subMonths(today, 1), id: format(subMonths(today, 1), 'yyyy-MM-dd') },
            { label: 'Six months ago', targetDate: subMonths(today, 6), id: format(subMonths(today, 6), 'yyyy-MM-dd') },
            { label: 'One year ago', targetDate: subYears(today, 1), id: format(subYears(today, 1), 'yyyy-MM-dd') },
        ];

        const exactMatches = [];
        targets.forEach(t => {
            const match = entries.find(e => e.id === t.id);
            if (match) {
                exactMatches.push({ ...match, memoryLabel: t.label });
            }
        });

        return exactMatches;
    }, [entries]);

    const highlights = useMemo(() => {
        const today = new Date();
        const results = [];

        // Weekly Highlights for the past 4 weeks
        for (let i = 1; i <= 4; i++) {
            const targetWeekStart = startOfWeek(subDays(today, i * 7));
            const targetWeekEnd = endOfWeek(subDays(today, i * 7));

            const entriesInWeek = entries.filter(e =>
                e.date >= targetWeekStart && e.date <= targetWeekEnd
            );

            if (entriesInWeek.length > 0) {
                // Find highest word count
                const max = entriesInWeek.reduce((prev, current) => (prev.wordCount > current.wordCount) ? prev : current);
                if (!results.find(r => r.id === max.id)) {
                    results.push({
                        ...max,
                        highlightLabel: `Highlight of ${format(targetWeekStart, 'MMM d')} - ${format(targetWeekEnd, 'MMM d')}`,
                        highlightType: 'week'
                    });
                }
            }
        }

        // Monthly Highlights for the past 12 months
        for (let i = 1; i <= 12; i++) {
            const targetMonth = subMonths(today, i);
            const entriesInMonth = entries.filter(e =>
                getMonth(e.date) === getMonth(targetMonth) && getYear(e.date) === getYear(targetMonth)
            );

            if (entriesInMonth.length > 0) {
                const max = entriesInMonth.reduce((prev, current) => (prev.wordCount > current.wordCount) ? prev : current);
                if (!results.find(r => r.id === max.id)) {
                    results.push({
                        ...max,
                        highlightLabel: `Highlight of ${format(targetMonth, 'MMMM yyyy')}`,
                        highlightType: 'month'
                    });
                }
            }
        }

        // Sort highlights by most recent
        results.sort((a, b) => b.id.localeCompare(a.id));

        return results;
    }, [entries]);

    const MemoryCard = ({ entry, label, icon: Icon, iconColor }) => (
        <div
            onClick={() => navigate(`/entry/${entry.id}`)}
            className="glass-card overflow-hidden hover:bg-white/5 cursor-pointer transition-all duration-300 group flex flex-col h-full ring-1 ring-white/5 hover:ring-primary/30"
        >
            {/* Header */}
            <div className="bg-black/20 p-3 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Icon className={`w-4 h-4 ${iconColor}`} />
                    <span className="text-sm font-medium text-white/90">{label}</span>
                </div>
                <span className="text-xs text-text-muted">{format(entry.date, 'MMM d, yyyy')}</span>
            </div>

            {/* Content area */}
            <div className="flex-1 flex flex-col sm:flex-row">
                {entry.imageUrl && (
                    <div className="sm:w-32 h-32 shrink-0 bg-black/40 relative overflow-hidden border-b sm:border-b-0 sm:border-r border-white/5 group-hover:bg-black/20 transition-colors">
                        <img
                            src={entry.imageUrl}
                            alt="Entry visual"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                    </div>
                )}

                <div className="p-4 flex-1 flex flex-col min-w-0">
                    <h3 className="text-lg font-serif font-bold text-white mb-2 truncate group-hover:text-primary transition-colors">
                        {entry.title}
                    </h3>

                    <p className="text-sm text-text-muted/80 flex-1 overflow-hidden"
                        style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                        {entry.contentPreview.replace(/(?:\*\*)?\+\+.*?\+\+(?:\*\*)?/g, '')}
                    </p>

                    <div className="mt-4 flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-xs text-text-muted bg-white/5 px-2 py-1 rounded-md">
                            <MessageSquare className="w-3 h-3" />
                            <span>{entry.wordCount} words</span>
                        </div>

                        <div className="flex items-center text-xs text-primary font-medium opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300">
                            Read more <ChevronRight className="w-3 h-3 ml-0.5" />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-text-muted animate-pulse">
                <History className="w-12 h-12 mb-4 opacity-50" />
                <p>Retrieving memories...</p>
            </div>
        );
    }

    return (
        <div className="space-y-8 pb-12 animation-fade-in max-w-5xl mx-auto">
            {/* Header */}
            <div className="glass-card p-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3"></div>
                <h2 className="text-2xl font-serif font-bold text-white flex items-center gap-3 relative z-10">
                    <History className="text-primary w-6 h-6" />
                    Memories
                </h2>
                <p className="text-text-muted mt-2 relative z-10 max-w-2xl">
                    Look back on your journey. Rediscover entries from exactly "on this day" in the past, or browse your deepest thoughts from recent weeks and months.
                </p>
            </div>

            {/* On This Day Section */}
            {memories.length > 0 && (
                <div className="space-y-4">
                    <h3 className="text-xl font-serif font-bold text-white flex items-center gap-2 px-2">
                        <Calendar className="w-5 h-5 text-blue-400" /> On This Day
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {memories.map(m => (
                            <MemoryCard
                                key={`memory-${m.id}`}
                                entry={m}
                                label={m.memoryLabel}
                                icon={Calendar}
                                iconColor="text-blue-400"
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* Highlights Section */}
            {highlights.length > 0 && (
                <div className="space-y-4">
                    <h3 className="text-xl font-serif font-bold text-white flex items-center gap-2 px-2 pt-4 border-t border-white/10">
                        <Star className="w-5 h-5 text-yellow-400" /> Highlights
                    </h3>
                    <p className="text-xs text-text-muted px-2 mb-4">Your most extensive entries by word count for each period.</p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {highlights.map(h => (
                            <MemoryCard
                                key={`highlight-${h.id}`}
                                entry={h}
                                label={h.highlightLabel}
                                icon={Star}
                                iconColor="text-yellow-400"
                            />
                        ))}
                    </div>
                </div>
            )}

            {memories.length === 0 && highlights.length === 0 && (
                <div className="glass-card p-12 text-center text-text-muted">
                    <p className="mb-2">Keep writing to generate memories!</p>
                    <p className="text-sm opacity-60">"On this day" recaps and weekly/monthly highlights will appear here as your journal grows over the next few weeks.</p>
                </div>
            )}
        </div>
    );
}
