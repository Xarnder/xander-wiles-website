import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { collection, query, where, documentId, onSnapshot } from 'firebase/firestore';
import { format, subDays, subMonths, subYears, startOfDay, parseISO } from 'date-fns';
import { BarChart as BarChartIcon, TrendingUp, Type, MessageSquare } from 'lucide-react';
import {
    ComposedChart,
    Bar,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer
} from 'recharts';

// List of common stop words to exclude from analysis
const STOP_WORDS = new Set([
    'a', 'an', 'the', 'and', 'but', 'or', 'if', 'because', 'as', 'what',
    'when', 'where', 'how', 'who', 'whom', 'which', 'that', 'it', 'its',
    'of', 'for', 'with', 'at', 'by', 'from', 'up', 'down', 'in', 'out',
    'on', 'off', 'over', 'under', 'again', 'further', 'then', 'once',
    'here', 'there', 'all', 'any', 'both', 'each', 'few', 'more', 'most',
    'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same',
    'so', 'than', 'too', 'very', 's', 't', 'can', 'will', 'just', 'don',
    'should', 'now', 'd', 'll', 'm', 'o', 're', 've', 'y', 'ain', 'aren',
    'couldn', 'didn', 'doesn', 'hadn', 'hasn', 'haven', 'isn', 'ma', 'mightn',
    'mustn', 'needn', 'shan', 'shouldn', 'wasn', 'weren', 'won', 'wouldn',
    'i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'ourselves', 'you',
    'your', 'yours', 'yourself', 'yourselves', 'he', 'him', 'his', 'himself',
    'she', 'her', 'hers', 'herself', 'it', 'its', 'itself', 'they', 'them',
    'their', 'theirs', 'themselves', 'what', 'which', 'who', 'whom', 'this',
    'that', 'these', 'those', 'am', 'is', 'are', 'was', 'were', 'be', 'been',
    'being', 'have', 'has', 'had', 'having', 'do', 'does', 'did', 'doing',
    'to', 'from', 'in', 'on', 'at', 'by', 'about', 'like', 'really', 'would',
    'get', 'got', 'going', 'go', 'know', 'think', 'thought', 'time', 'day'
]);

import { useNavigate } from 'react-router-dom';

export default function StatsView() {
    const { currentUser } = useAuth();
    const navigate = useNavigate();
    const [timeRange, setTimeRange] = useState('month'); // week, month, 6months, year
    const [entries, setEntries] = useState([]);
    const [loading, setLoading] = useState(true);

    // Time Range definitions
    const ranges = {
        week: { label: 'Week', days: 7 },
        month: { label: 'Month', days: 30 },
        '6months': { label: '6 Months', days: 180 },
        year: { label: 'Year', days: 365 }
    };

    // Fetch entries based on selected range
    useEffect(() => {
        if (!currentUser) return;

        setLoading(true);
        const endDate = new Date();
        let startDate = new Date();

        switch (timeRange) {
            case 'week': startDate = subDays(endDate, 7); break;
            case 'month': startDate = subMonths(endDate, 1); break;
            case '6months': startDate = subMonths(endDate, 6); break;
            case 'year': startDate = subYears(endDate, 1); break;
            default: startDate = subMonths(endDate, 1);
        }

        // Format dates for Firestore ID comparison (YYYY-MM-DD)
        const startId = format(startDate, 'yyyy-MM-dd');
        const endId = format(endDate, 'yyyy-MM-dd');

        const q = query(
            collection(db, 'users', currentUser.uid, 'entries'),
            where(documentId(), '>=', startId),
            where(documentId(), '<=', endId)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedEntries = [];
            snapshot.forEach(doc => {
                fetchedEntries.push({
                    id: doc.id,
                    ...doc.data()
                });
            });
            // Sort by date just in case
            fetchedEntries.sort((a, b) => a.id.localeCompare(b.id));
            setEntries(fetchedEntries);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching stats data:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [currentUser, timeRange]);

    // Helper to extract title from content using the standard pattern
    const extractTitle = (content, storedTitle) => {
        if (!content) return storedTitle || '';

        // Match standard header pattern: **++Date - Title++** or ++Date - Title++
        const match = content.match(/(?:\*\*)?\+\+(.*?)\+\+(?:\*\*)?/);
        if (match && match[1]) {
            // Usually format is "Day Date - Title"
            const parts = match[1].split(' - ');
            if (parts.length >= 2) {
                // Return everything after the first " - "
                return parts.slice(1).join(' - ').trim();
            }
            // If no separator, return the whole thing minus markup
            return match[1].trim();
        }

        // Fallback to stored title if no pattern found
        return storedTitle || '';
    };

    // Compute Statistics
    const stats = useMemo(() => {
        let totalWords = 0;
        const wordCounts = {};
        const chartData = [];

        // Map entries to chart data
        const entryMap = new Map();

        entries.forEach(entry => {
            // Basic word count logic: split by spaces, filter empty strings
            const text = entry.content || entry.text || '';
            // Remove markdown chars approximately
            const cleanText = text.replace(/[#*`_~]/g, ' ');
            const words = cleanText.toLowerCase().match(/\b\w+\b/g) || [];
            const count = words.length;

            totalWords += count;

            // Extract title or use stored title
            const displayTitle = extractTitle(text, entry.title);
            entryMap.set(entry.id, { count, title: displayTitle });

            // Word frequency analysis
            words.forEach(word => {
                if (!STOP_WORDS.has(word) && word.length > 2) {
                    wordCounts[word] = (wordCounts[word] || 0) + 1;
                }
            });
        });

        // Generate chart data based on range
        const data = [];
        const now = new Date();
        let iterDate = new Date();

        switch (timeRange) {
            case 'week': iterDate = subDays(now, 6); break;
            case 'month': iterDate = subDays(now, 29); break;
            case '6months': iterDate = subMonths(now, 6); break;
            case 'year': iterDate = subYears(now, 1); break;
        }
        iterDate = startOfDay(iterDate);

        let cumulativeWords = 0;
        let entryCount = 0;

        while (iterDate <= startOfDay(now)) {
            const dateKey = format(iterDate, 'yyyy-MM-dd');
            const entryData = entryMap.get(dateKey) || { count: 0, title: '' };
            const count = entryData.count;

            if (count > 0) {
                cumulativeWords += count;
                entryCount++;
            }

            const currentAvg = entryCount > 0 ? Math.round(cumulativeWords / entryCount) : 0;

            data.push({
                date: dateKey,
                displayDate: format(iterDate, timeRange === 'year' ? 'MMM d' : 'd MMM'),
                words: count,
                average: currentAvg,
                title: entryData.title,
                fullDate: iterDate.getTime()
            });

            iterDate.setDate(iterDate.getDate() + 1);
        }

        // Top Words ... (same as before)
        const sortedWords = Object.entries(wordCounts)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 10)
            .map(([word, count]) => ({ word, count }));

        return {
            totalWords,
            averageWordsPerEntry: entries.length > 0 ? Math.round(totalWords / entries.length) : 0,
            chartData: data,
            topWords: sortedWords
        };
    }, [entries, timeRange]);

    const CustomTooltip = ({ active, payload, label }) => {
        if (active && payload && payload.length) {
            // payload[0] is usually the bar (words), payload[1] might be line (avg)
            // But checking payload[0].payload gives the full data object we passed
            const data = payload[0].payload;
            return (
                <div className="bg-[#1a1b1e] border border-white/10 p-3 rounded shadow-xl text-white">
                    {/* Date removed as requested */}
                    {data.title && (
                        <p className="font-bold text-sm mb-2 text-primary break-words whitespace-pre-wrap max-w-xs">
                            {data.title}
                        </p>
                    )}
                    <p className="text-sm">
                        Word Count: <span className="font-mono text-purple-400">{data.words}</span>
                    </p>
                    {data.average > 0 && (
                        <p className="text-xs text-text-muted mt-1">
                            Average: <span className="text-pink-400">{data.average}</span>
                        </p>
                    )}
                </div>
            );
        }
        return null;
    };

    return (
        <div className="space-y-6 animation-fade-in pb-10">
            {/* Header controls ... (same) */}
            <div className="glass-card p-4 flex flex-col sm:flex-row justify-between items-center gap-4">
                <div>
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <TrendingUp className="text-primary w-5 h-5" />
                        Writing Stats
                    </h2>
                </div>

                <div className="flex bg-black/20 rounded-lg p-1">
                    {Object.entries(ranges).map(([key, { label }]) => (
                        <button
                            key={key}
                            onClick={() => setTimeRange(key)}
                            className={`px-3 py-1.5 text-sm rounded-md transition-all ${timeRange === key
                                ? 'bg-primary text-white shadow-lg'
                                : 'text-text-muted hover:text-white hover:bg-white/5'
                                }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Main Chart */}
            <div className="glass-card p-6 min-h-[400px]">
                <h3 className="text-lg font-serif font-bold text-white mb-6 flex items-center gap-2">
                    <BarChartIcon className="w-5 h-5 text-secondary" /> Word Count History
                </h3>

                <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart
                            data={stats.chartData}
                            margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                        >
                            <defs>
                                <linearGradient id="colorWords" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.8} />
                                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={false} />
                            <XAxis
                                dataKey="displayDate"
                                stroke="rgba(255,255,255,0.5)"
                                tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 12 }}
                                tickLine={false}
                                axisLine={false}
                                minTickGap={30}
                            />
                            <YAxis
                                stroke="rgba(255,255,255,0.5)"
                                tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 12 }}
                                tickLine={false}
                                axisLine={false}
                            />
                            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                            <Legend />
                            <Bar
                                dataKey="words"
                                name="Word Count"
                                fill="url(#colorWords)"
                                radius={[4, 4, 0, 0]}
                                maxBarSize={50}
                                onClick={(data) => {
                                    if (data && data.date) {
                                        navigate(`/entry/${data.date}`);
                                    }
                                }}
                                style={{ cursor: 'pointer' }}
                            />
                            <Line
                                type="monotone"
                                dataKey="average"
                                name="Avg Trend"
                                stroke="#ec4899"
                                strokeWidth={2}
                                dot={false}
                                activeDot={{ r: 6 }}
                            />
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Secondary Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Top Words */}
                <div className="glass-card p-6">
                    <h3 className="text-lg font-serif font-bold text-white mb-4 flex items-center gap-2">
                        <MessageSquare className="w-5 h-5 text-green-400" /> Most Frequent Words
                    </h3>
                    <div className="space-y-3">
                        {stats.topWords.map((item, index) => (
                            <div key={item.word} className="flex justify-between items-center group">
                                <div className="flex items-center">
                                    <span className="w-6 text-xs text-text-muted">{index + 1}.</span>
                                    <span className="text-white group-hover:text-primary transition-colors capitalize">{item.word}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    {/* Simple bar visualization for count */}
                                    <div className="w-24 h-1.5 bg-white/10 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-primary/70 rounded-full"
                                            style={{ width: `${(item.count / stats.topWords[0].count) * 100}%` }}
                                        />
                                    </div>
                                    <span className="text-sm text-text-muted w-8 text-right">{item.count}</span>
                                </div>
                            </div>
                        ))}
                        {stats.topWords.length === 0 && (
                            <div className="text-text-muted text-sm italic">Not enough data...</div>
                        )}
                    </div>
                </div>

                {/* Quick Stats Cards */}
                <div className="space-y-6">
                    <div className="glass-card p-6 flex flex-col justify-center items-center text-center h-[48%]">
                        <Type className="w-8 h-8 text-blue-400 mb-2" />
                        <div className="text-3xl font-bold text-white mb-1">{stats.totalWords.toLocaleString()}</div>
                        <div className="text-sm text-text-muted">Total Words Written</div>
                        <div className="text-xs text-text-muted/60 mt-1">in selected range</div>
                    </div>

                    <div className="glass-card p-6 flex flex-col justify-center items-center text-center h-[48%]">
                        <TrendingUp className="w-8 h-8 text-pink-400 mb-2" />
                        <div className="text-3xl font-bold text-white mb-1">{stats.averageWordsPerEntry.toLocaleString()}</div>
                        <div className="text-sm text-text-muted">Average Words / Entry</div>
                    </div>
                </div>
            </div>
        </div>
    );
}
