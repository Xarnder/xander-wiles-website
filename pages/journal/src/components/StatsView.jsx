import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { BarChart as BarChartIcon, TrendingUp, Type, MessageSquare, Tag, Image as ImageIcon, Download, X, Calendar, FileText, Loader, Star, Smile, Meh, Frown, Heart, Zap, Clock, ArrowRight, Flame, Target, Trophy, PenLine, ArrowUp, ArrowDown, Minus } from 'lucide-react';
import { format, subDays, subMonths, subYears, startOfDay, parseISO, differenceInDays, getDay } from 'date-fns';
import { collection, query, where, documentId, onSnapshot, getDocs } from 'firebase/firestore';
import { saveAs } from 'file-saver';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    Line, ComposedChart, Area, Cell, Legend, LabelList
} from 'recharts';
import StorageStats from './StorageStats';
import FirestoreUsage from './FirestoreUsage';
import { subEntriesToPlainText } from '../utils/entrySections';
import { useToast } from '../context/ToastContext';
import Modal from './Modal';

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
 
const MOOD_CONFIG = {
    1: { icon: Frown, label: 'Bad', color: '#f87171' },
    2: { icon: Meh, label: 'Okay', color: '#fb923c' },
    3: { icon: Smile, label: 'Good', color: '#facc15' },
    4: { icon: Heart, label: 'Great', color: '#4ade80' },
    5: { icon: Zap, label: 'Amazing', color: '#8b5cf6' },
};

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const countWordTotal = (text) => {
    const cleanText = text.replace(/[#*`_~]/g, ' ');
    return (cleanText.toLowerCase().match(/\b\w+\b/g) || []).length;
};

const computeStreaks = (entryDateKeys) => {
    if (entryDateKeys.length === 0) return { current: 0, longest: 0 };

    const sorted = [...entryDateKeys].sort();
    let longest = 1;
    let run = 1;

    for (let i = 1; i < sorted.length; i++) {
        const prev = parseISO(sorted[i - 1]);
        const curr = parseISO(sorted[i]);
        if (differenceInDays(curr, prev) === 1) {
            run += 1;
            longest = Math.max(longest, run);
        } else if (differenceInDays(curr, prev) > 1) {
            run = 1;
        }
    }

    const dateSet = new Set(sorted);
    let current = 0;
    let checkDate = startOfDay(new Date());
    const todayKey = format(checkDate, 'yyyy-MM-dd');
    if (!dateSet.has(todayKey)) {
        checkDate = subDays(checkDate, 1);
    }
    while (dateSet.has(format(checkDate, 'yyyy-MM-dd'))) {
        current += 1;
        checkDate = subDays(checkDate, 1);
    }

    return { current, longest };
};

const formatSinceLastUsed = (daysSince) => {
    if (daysSince === null || daysSince === undefined) {
        return { headline: 'Never', subline: 'Not used yet' };
    }
    if (daysSince === 0) {
        return { headline: 'Today', subline: 'Used today' };
    }
    if (daysSince === 1) {
        return { headline: '1 day', subline: 'Yesterday' };
    }
    if (daysSince < 7) {
        return { headline: `${daysSince} days`, subline: `${daysSince} days ago` };
    }
    if (daysSince < 30) {
        const weeks = Math.floor(daysSince / 7);
        return { headline: weeks === 1 ? '1 week' : `${weeks} weeks`, subline: `${daysSince} days ago` };
    }
    if (daysSince < 365) {
        const months = Math.round(daysSince / 30);
        return { headline: months === 1 ? '1 month' : `${months} months`, subline: `${daysSince} days ago` };
    }
    const years = (daysSince / 365).toFixed(1).replace(/\.0$/, '');
    return { headline: years === '1' ? '1 year' : `${years} years`, subline: `${daysSince} days ago` };
};

const buildFrequencyText = (count, spanDays) => {
    if (count <= 0) return 'Not in period';
    const freqDays = spanDays / count;
    const roundedDays = Math.round(freqDays);
    if (roundedDays <= 1) return 'Daily';
    if (roundedDays >= 30 && roundedDays < 365) {
        const mos = Math.round(roundedDays / 30);
        return mos === 1 ? 'Monthly' : `Every ${mos} mo`;
    }
    if (roundedDays >= 365) {
        const yrs = Math.round(roundedDays / 365);
        return yrs === 1 ? 'Yearly' : `Every ${yrs} yr`;
    }
    return `Every ${roundedDays} d`;
};

const getEntryText = (entry) => [entry.content || entry.text || '', subEntriesToPlainText(entry.subEntries)]
    .filter(Boolean)
    .join('\n\n');

const TrendBadge = ({ value, suffix = '%' }) => {
    if (value === null || value === undefined || Number.isNaN(value)) return null;
    const rounded = Math.round(value);
    if (rounded === 0) {
        return (
            <span className="inline-flex items-center gap-0.5 text-xs text-text-muted">
                <Minus className="w-3 h-3" /> No change
            </span>
        );
    }
    const isUp = rounded > 0;
    return (
        <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${isUp ? 'text-green-400' : 'text-red-400'}`}>
            {isUp ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
            {isUp ? '+' : ''}{rounded}{suffix}
        </span>
    );
};

import { useNavigate } from 'react-router-dom';

export default function StatsView() {
    const { currentUser } = useAuth();
    const { error: toastError } = useToast();
    const navigate = useNavigate();
    const [timeRange, setTimeRange] = useState('month'); // week, month, 6months, year
    const [entries, setEntries] = useState([]);
    const [tagHistoryEntries, setTagHistoryEntries] = useState([]);
    const [tags, setTags] = useState({});
    const [loading, setLoading] = useState(true);
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [selectedTagId, setSelectedTagId] = useState(null);
    const SPECIAL_DAY_TAG_ID = 'special-day-virtual-tag';

    // Time Range definitions
    const ranges = {
        week: { label: 'Week', days: 7 },
        month: { label: 'Month', days: 30 },
        '6months': { label: '6 Months', days: 180 },
        year: { label: 'Year', days: 365 }
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

    // Fetch all entries for all-time tag usage (last used, full tag list)
    useEffect(() => {
        if (!currentUser) return;

        const q = query(collection(db, 'users', currentUser.uid, 'entries'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetched = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                fetched.push({
                    id: doc.id,
                    tags: data.tags,
                    isSpecial: data.isSpecial,
                    title: data.title,
                    content: data.content,
                    text: data.text,
                    subEntries: data.subEntries,
                });
            });
            fetched.sort((a, b) => a.id.localeCompare(b.id));
            setTagHistoryEntries(fetched);
        }, (error) => {
            console.error('Error fetching tag history:', error);
        });

        return () => unsubscribe();
    }, [currentUser]);

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

    // Format bytes to readable string (Helper)
    const formatBytes = (bytes, decimals = 2) => {
        if (!bytes) return '0 B';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    };

    // Calculate size for a single entry (Helper)
    const calculateEntrySize = (data) => {
        let size = 0;
        if (data.textSize) {
            size += data.textSize;
        } else if (data.contentSizeInBytes) {
            size += data.contentSizeInBytes;
        } else if (data.content || data.subEntries) {
            size += new Blob([getEntryText(data)]).size;
        }
        if (Array.isArray(data.images) && data.images.length > 0) {
            size += data.images.reduce((total, image) => total + (Number(image?.size) || 0), 0);
        } else if (data.imageSize) {
            size += data.imageSize;
        } else if (data.imageMetadata && data.imageMetadata.sizeInBytes) {
            size += data.imageMetadata.sizeInBytes;
        }
        return size;
    };

    const handleExportCSV = async (selectedRange) => {
        if (!currentUser) return;
        setLoading(true);

        try {
            const entriesRef = collection(db, 'users', currentUser.uid, 'entries');
            let q = query(entriesRef);

            if (selectedRange !== 'all') {
                const endDate = new Date();
                let startDate = new Date();
                switch (selectedRange) {
                    case 'week': startDate = subDays(endDate, 7); break;
                    case 'month': startDate = subMonths(endDate, 1); break;
                    case '6months': startDate = subMonths(endDate, 6); break;
                    case 'year': startDate = subYears(endDate, 1); break;
                }
                const startId = format(startDate, 'yyyy-MM-dd');
                q = query(entriesRef, where(documentId(), '>=', startId));
            }

            const querySnapshot = await getDocs(q);
            
            const exportEntries = [];
            querySnapshot.forEach((doc) => {
                exportEntries.push({ id: doc.id, ...doc.data() });
            });

            // Sort by date
            exportEntries.sort((a, b) => a.id.localeCompare(b.id));

            // Calculate Aggregate Stats
            let totalWords = 0;
            let totalImages = 0;
            let totalSizeBytes = 0;

            const processedRows = exportEntries.map(entry => {
                const date = entry.id;
                const text = getEntryText(entry);
                const cleanTextForWords = text.replace(/[#*`_~]/g, ' ');
                const words = cleanTextForWords.toLowerCase().match(/\b\w+\b/g) || [];
                const wordCount = words.length;
                
                const imageCount = entry.images ? entry.images.length : (entry.imageUrl || entry.imageMetadata ? 1 : 0);
                const entryTitle = extractTitle(text, entry.title).replace(/"/g, '""'); // Escape quotes
                
                const entryTags = (entry.tags || [])
                    .map(tagId => tags[tagId]?.name || tagId)
                    .join('; ');

                totalWords += wordCount;
                totalImages += imageCount;
                totalSizeBytes += calculateEntrySize(entry);

                const moodLabel = entry.mood ? MOOD_CONFIG[entry.mood]?.label || entry.mood : '';
                return `"${date}","${entryTitle}",${wordCount},${imageCount},"${entryTags}","${moodLabel}"`;
            });

            const avgWords = exportEntries.length > 0 ? (totalWords / exportEntries.length).toFixed(1) : 0;
            const storageFormatted = formatBytes(totalSizeBytes);

            // CSV Content with Summary Header
            let csvContent = `SUMMARY\n`;
            csvContent += `Range,${selectedRange === 'all' ? 'All Time' : selectedRange}\n`;
            csvContent += `Total Entries,${exportEntries.length}\n`;
            csvContent += `Total Words,${totalWords}\n`;
            csvContent += `Avg Words / Entry,${avgWords}\n`;
            csvContent += `Total Images,${totalImages}\n`;
            csvContent += `Total Storage Usage,${storageFormatted}\n\n`;
            
            csvContent += "DATA\n";
            csvContent += "Date,Title,Word Count,Image Count,Tags,Mood\n";
            csvContent += processedRows.join('\n');

            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            saveAs(blob, `journal-stats-${selectedRange}-${format(new Date(), 'yyyy-MM-dd')}.csv`);
            setIsExportModalOpen(false);

        } catch (error) {
            console.error("CSV Export failed:", error);
            toastError('Export failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    // Compute Statistics
    const stats = useMemo(() => {
        let totalWords = 0;
        let totalImages = 0;
        let specialDaysCount = 0;
        let moodTotal = 0;
        let moodCount = 0;
        const wordCounts = {};
        const tagCounts = {};
        const moodDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        const dayOfWeekCounts = [0, 0, 0, 0, 0, 0, 0];
        const entryMap = new Map();
        const entryDetails = [];

        entries.forEach(entry => {
            const text = getEntryText(entry);
            const count = countWordTotal(text);

            totalWords += count;

            const imageCount = entry.images ? entry.images.length : (entry.imageUrl || entry.imageMetadata ? 1 : 0);
            totalImages += imageCount;

            if (entry.isSpecial) specialDaysCount += 1;

            if (entry.mood && MOOD_CONFIG[entry.mood]) {
                moodTotal += entry.mood;
                moodCount += 1;
                moodDistribution[entry.mood] += 1;
            }

            const entryDate = parseISO(entry.id);
            if (!isNaN(entryDate.getTime())) {
                dayOfWeekCounts[getDay(entryDate)] += 1;
            }

            const displayTitle = extractTitle(text, entry.title);
            entryMap.set(entry.id, { 
                count, 
                title: displayTitle, 
                isSpecial: entry.isSpecial || false,
                tags: entry.tags || [],
                mood: entry.mood || null
            });

            entryDetails.push({
                id: entry.id,
                title: displayTitle || 'Untitled Entry',
                words: count,
                mood: entry.mood || null,
                isSpecial: entry.isSpecial || false,
            });

            const words = text.replace(/[#*`_~]/g, ' ').toLowerCase().match(/\b\w+\b/g) || [];
            words.forEach(word => {
                if (!STOP_WORDS.has(word) && word.length > 2) {
                    wordCounts[word] = (wordCounts[word] || 0) + 1;
                }
            });

            // Tag frequency analysis
            if (entry.tags && Array.isArray(entry.tags)) {
                entry.tags.forEach(tagId => {
                    if (!tagCounts[tagId]) {
                        tagCounts[tagId] = { count: 0, totalWords: 0, lastUsed: null, usageDates: new Set() };
                    }
                    tagCounts[tagId].count += 1;
                    tagCounts[tagId].totalWords += count;
                    tagCounts[tagId].usageDates.add(entry.id);
                    if (!tagCounts[tagId].lastUsed || entry.id > tagCounts[tagId].lastUsed) {
                        tagCounts[tagId].lastUsed = entry.id;
                    }
                });
            }

            // Special Day virtual tag analysis
            if (entry.isSpecial) {
                const specialId = SPECIAL_DAY_TAG_ID;
                if (!tagCounts[specialId]) {
                    tagCounts[specialId] = { count: 0, totalWords: 0, lastUsed: null, usageDates: new Set() };
                }
                tagCounts[specialId].count += 1;
                tagCounts[specialId].totalWords += count;
                tagCounts[specialId].usageDates.add(entry.id);
                if (!tagCounts[specialId].lastUsed || entry.id > tagCounts[specialId].lastUsed) {
                    tagCounts[specialId].lastUsed = entry.id;
                }
            }
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

            // Determine bar color
            let barColor = '#8b5cf6'; // Default purple
            if (entryData.isSpecial) {
                barColor = '#facc15'; // Special yellow
            } else if (entryData.tags && entryData.tags.length > 0) {
                // Find first tag that has a defined color
                for (const tagId of entryData.tags) {
                    if (tags[tagId] && tags[tagId].color) {
                        barColor = tags[tagId].color;
                        break;
                    }
                }
            }

            data.push({
                date: dateKey,
                displayDate: format(iterDate, timeRange === 'year' ? 'MMM d' : 'd MMM'),
                words: count,
                mood: entryData.mood,
                average: currentAvg,
                title: entryData.title,
                isSpecial: entryData.isSpecial,
                color: barColor,
                fullDate: iterDate.getTime()
            });

            iterDate.setDate(iterDate.getDate() + 1);
        }

        const rangeDays = ranges[timeRange]?.days || 30;
        const spanDays = entries.length > 1 
            ? Math.ceil(Math.abs(new Date(entries[entries.length - 1].id) - new Date(entries[0].id)) / (1000 * 60 * 60 * 24)) + 1
            : rangeDays;

        // Top Words ... (same as before)
        const sortedWords = Object.entries(wordCounts)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 10)
            .map(([word, count]) => ({ word, count }));

        // Period tag stats (used in period only)
        const periodTagStats = Object.fromEntries(
            Object.entries(tagCounts).map(([tagId, tagStat]) => [tagId, { ...tagStat, usageDates: tagStat.usageDates }])
        );

        const topTags = Object.entries(tagCounts)
            .map(([tagId, tagStat]) => {
                let tagData = tags[tagId];
                if (tagId === SPECIAL_DAY_TAG_ID) {
                    tagData = { name: 'Special Day', color: '#facc15', isSpecial: true };
                }

                return {
                    tagId,
                    count: tagStat.count,
                    avgWords: Math.round(tagStat.totalWords / tagStat.count),
                    frequency: buildFrequencyText(tagStat.count, spanDays),
                    usageDates: tagStat.usageDates,
                    data: tagData,
                };
            })
            .filter(item => item.data)
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        const totalDaysInRange = data.length || rangeDays;
        const consistencyPercent = totalDaysInRange > 0
            ? Math.round((entries.length / totalDaysInRange) * 100)
            : 0;

        const { current: currentStreak, longest: longestStreak } = computeStreaks(entries.map(e => e.id));

        const moodBreakdown = Object.entries(moodDistribution)
            .map(([level, count]) => ({
                level: Number(level),
                count,
                percent: moodCount > 0 ? Math.round((count / moodCount) * 100) : 0,
                ...MOOD_CONFIG[level],
            }))
            .filter(item => item.count > 0)
            .sort((a, b) => b.level - a.level);

        const maxDayCount = Math.max(...dayOfWeekCounts, 1);
        const dayOfWeekData = DAY_LABELS.map((label, index) => ({
            day: label,
            count: dayOfWeekCounts[index],
            percent: entries.length > 0 ? Math.round((dayOfWeekCounts[index] / entries.length) * 100) : 0,
            fillOpacity: 0.4 + (dayOfWeekCounts[index] / maxDayCount) * 0.6,
        }));

        const midpoint = Math.floor(data.length / 2);
        const firstHalf = data.slice(0, midpoint);
        const secondHalf = data.slice(midpoint);
        const firstHalfWords = firstHalf.reduce((sum, d) => sum + d.words, 0);
        const secondHalfWords = secondHalf.reduce((sum, d) => sum + d.words, 0);
        const firstHalfEntries = firstHalf.filter(d => d.words > 0).length;
        const secondHalfEntries = secondHalf.filter(d => d.words > 0).length;

        const wordTrend = firstHalfWords > 0
            ? ((secondHalfWords - firstHalfWords) / firstHalfWords) * 100
            : (secondHalfWords > 0 ? 100 : 0);
        const entryTrend = firstHalfEntries > 0
            ? ((secondHalfEntries - firstHalfEntries) / firstHalfEntries) * 100
            : (secondHalfEntries > 0 ? 100 : 0);

        const entriesWithWords = entryDetails.filter(e => e.words > 0);
        const longestEntry = entriesWithWords.length > 0
            ? entriesWithWords.reduce((best, e) => (e.words > best.words ? e : best), entriesWithWords[0])
            : null;
        const shortestEntry = entriesWithWords.length > 0
            ? entriesWithWords.reduce((best, e) => (e.words < best.words ? e : best), entriesWithWords[0])
            : null;
        const highestMoodEntry = entryDetails
            .filter(e => e.mood)
            .sort((a, b) => b.mood - a.mood)[0] || null;
        const mostRecentEntry = entryDetails.length > 0
            ? [...entryDetails].sort((a, b) => b.id.localeCompare(a.id))[0]
            : null;

        const uniqueTagsUsed = Object.keys(tagCounts).filter(id => id !== SPECIAL_DAY_TAG_ID).length;

        return {
            totalWords,
            totalImages,
            totalEntries: entries.length,
            specialDaysCount,
            consistencyPercent,
            currentStreak,
            longestStreak,
            avgMood: moodCount > 0 ? (moodTotal / moodCount).toFixed(1) : null,
            moodEntries: moodCount,
            moodBreakdown,
            dayOfWeekData,
            wordTrend,
            entryTrend,
            notableEntries: {
                longest: longestEntry,
                shortest: shortestEntry,
                highestMood: highestMoodEntry,
                mostRecent: mostRecentEntry,
            },
            uniqueTagsUsed,
            averageWordsPerEntry: entries.length > 0 ? Math.round(totalWords / entries.length) : 0,
            averageImagesPerEntry: entries.length > 0 ? (totalImages / entries.length).toFixed(1) : 0,
            chartData: data,
            topWords: sortedWords,
            topTags,
            periodTagStats,
            spanDays,
        };
    }, [entries, timeRange, tags]);

    const allTimeTagStats = useMemo(() => {
        const statsMap = {};
        const ensure = (tagId) => {
            if (!statsMap[tagId]) {
                statsMap[tagId] = { lastUsed: null, totalCount: 0 };
            }
            return statsMap[tagId];
        };

        tagHistoryEntries.forEach(entry => {
            if (entry.tags && Array.isArray(entry.tags)) {
                entry.tags.forEach(tagId => {
                    const stat = ensure(tagId);
                    stat.totalCount += 1;
                    if (!stat.lastUsed || entry.id > stat.lastUsed) {
                        stat.lastUsed = entry.id;
                    }
                });
            }
            if (entry.isSpecial) {
                const stat = ensure(SPECIAL_DAY_TAG_ID);
                stat.totalCount += 1;
                if (!stat.lastUsed || entry.id > stat.lastUsed) {
                    stat.lastUsed = entry.id;
                }
            }
        });

        return statsMap;
    }, [tagHistoryEntries]);

    const allTags = useMemo(() => {
        const buildTagItem = (tagId, tagData, periodStat = null) => {
            const allTime = allTimeTagStats[tagId] || { lastUsed: null, totalCount: 0 };
            const count = periodStat?.count || 0;
            const usageDates = periodStat?.usageDates || new Set();
            const lastUsed = allTime.lastUsed;
            const lastUsedDate = lastUsed ? parseISO(lastUsed) : null;
            const daysSinceLastUsed = lastUsedDate && !isNaN(lastUsedDate.getTime())
                ? differenceInDays(startOfDay(new Date()), startOfDay(lastUsedDate))
                : null;
            const sinceLastUsed = formatSinceLastUsed(daysSinceLastUsed);

            return {
                tagId,
                count,
                allTimeCount: allTime.totalCount,
                avgWords: count > 0 ? Math.round(periodStat.totalWords / count) : 0,
                frequency: buildFrequencyText(count, stats.spanDays),
                lastUsed,
                lastUsedFormatted: lastUsedDate && !isNaN(lastUsedDate.getTime())
                    ? format(lastUsedDate, 'EEEE, MMM d, yyyy')
                    : null,
                daysSinceLastUsed,
                sinceLastUsed,
                usageDates,
                data: tagData,
                usedInPeriod: count > 0,
            };
        };

        const items = Object.entries(tags).map(([tagId, tagData]) =>
            buildTagItem(tagId, tagData, stats.periodTagStats[tagId])
        );

        const hasSpecialHistory = allTimeTagStats[SPECIAL_DAY_TAG_ID]?.totalCount > 0
            || stats.periodTagStats[SPECIAL_DAY_TAG_ID];
        if (hasSpecialHistory) {
            items.unshift(buildTagItem(
                SPECIAL_DAY_TAG_ID,
                { name: 'Special Day', color: '#facc15', isSpecial: true },
                stats.periodTagStats[SPECIAL_DAY_TAG_ID]
            ));
        }

        return items.sort((a, b) => {
            if (b.count !== a.count) return b.count - a.count;
            if (b.allTimeCount !== a.allTimeCount) return b.allTimeCount - a.allTimeCount;
            return (a.data?.name || '').localeCompare(b.data?.name || '');
        });
    }, [tags, stats.periodTagStats, stats.spanDays, allTimeTagStats]);

    const selectedTag = useMemo(() => {
        if (!selectedTagId) return null;
        return allTags.find(t => t.tagId === selectedTagId) || null;
    }, [selectedTagId, allTags]);

    const selectedTagChartData = useMemo(() => {
        if (!selectedTag) return [];

        return stats.chartData.map(day => ({
            ...day,
            used: selectedTag.usageDates.has(day.date) ? 1 : 0,
            title: selectedTag.usageDates.has(day.date) ? day.title : null,
        }));
    }, [selectedTag, stats.chartData]);

    const selectedTagEntries = useMemo(() => {
        if (!selectedTag) return [];
        const source = selectedTag.usedInPeriod ? entries : tagHistoryEntries;
        return source
            .filter(entry => {
                if (selectedTag.tagId === SPECIAL_DAY_TAG_ID) return entry.isSpecial;
                return entry.tags && entry.tags.includes(selectedTag.tagId);
            })
            .sort((a, b) => b.id.localeCompare(a.id));
    }, [entries, tagHistoryEntries, selectedTag]);

    useEffect(() => {
        if (!selectedTagId || selectedTagId === SPECIAL_DAY_TAG_ID) return;
        if (!tags[selectedTagId]) {
            setSelectedTagId(null);
        }
    }, [selectedTagId, tags]);

    const TagUsageTooltip = ({ active, payload }) => {
        if (active && payload && payload.length) {
            const data = payload[0].payload;
            if (!data.used) return null;
            const entryDate = parseISO(data.date);
            return (
                <div className="bg-surface border border-border p-3 rounded shadow-xl text-text">
                    <p className="text-xs text-text-muted mb-1">
                        {entryDate && !isNaN(entryDate.getTime()) ? format(entryDate, 'EEEE, MMM d, yyyy') : data.date}
                    </p>
                    {data.title && (
                        <p className="font-bold text-sm text-primary break-words whitespace-pre-wrap max-w-xs">
                            {data.title}
                        </p>
                    )}
                    <p className="text-xs text-text-muted mt-1">Click to open entry</p>
                </div>
            );
        }
        return null;
    };

    const CustomTooltip = ({ active, payload }) => {
        if (active && payload && payload.length) {
            // payload[0] is usually the bar (words), payload[1] might be line (avg)
            // But checking payload[0].payload gives the full data object we passed
            const data = payload[0].payload;
            return (
                <div className="bg-surface border border-border p-3 rounded shadow-xl text-text">
                    {/* Date removed as requested */}
                    {data.title && (
                        <p className="font-bold text-sm mb-2 text-primary break-words whitespace-pre-wrap max-w-xs">
                            {data.title}
                        </p>
                    )}
                    <p className="text-sm">
                        Word Count: <span className="font-mono text-purple-400">{data.words}</span>
                    </p>
                    {data.mood && MOOD_CONFIG[data.mood] && (
                        <div className="flex items-center gap-2 mt-1">
                            <span className="text-sm text-text-muted">Mood:</span>
                            {React.createElement(MOOD_CONFIG[data.mood].icon, { 
                                className: "w-4 h-4", 
                                style: { color: MOOD_CONFIG[data.mood].color } 
                            })}
                            <span className="text-sm font-bold" style={{ color: MOOD_CONFIG[data.mood].color }}>
                                {MOOD_CONFIG[data.mood].label}
                            </span>
                        </div>
                    )}
                    {data.isSpecial && (
                        <p className="text-sm text-yellow-400 flex items-center gap-1 mt-1 font-bold">
                            <Star className="w-3 h-3 fill-yellow-400" /> Special Day
                        </p>
                    )}
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

    const CustomMoodTooltip = ({ active, payload }) => {
        if (active && payload && payload.length) {
            const data = payload[0].payload;
            const mood = data.mood;
            const config = MOOD_CONFIG[mood];

            return (
                <div className="bg-surface border border-border p-3 rounded shadow-xl text-text">
                    {data.title && (
                        <p className="font-bold text-sm mb-2 text-primary break-words whitespace-pre-wrap max-w-xs">
                            {data.title}
                        </p>
                    )}
                    {mood && config ? (
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-text-muted">Mood:</span>
                            {React.createElement(config.icon, { 
                                className: "w-4 h-4", 
                                style: { color: config.color } 
                            })}
                            <span className="text-sm font-bold" style={{ color: config.color }}>
                                {config.label}
                            </span>
                        </div>
                    ) : (
                        <p className="text-sm text-text-muted">No mood recorded</p>
                    )}
                    {data.isSpecial && (
                        <p className="text-sm text-yellow-400 flex items-center gap-1 mt-1 font-bold">
                            <Star className="w-3 h-3 fill-yellow-400" /> Special Day
                        </p>
                    )}
                </div>
            );
        }
        return null;
    };

    if (loading && entries.length === 0) {
        return (
            <div className="space-y-6" role="status" aria-label="Loading journal statistics">
                <div className="glass-card h-20 animate-pulse" />
                <div className="glass-card h-[400px] p-6">
                    <div className="h-5 w-48 rounded bg-white/10 animate-pulse mb-8" />
                    <div className="h-[300px] rounded-lg bg-white/5 animate-pulse" />
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 animation-fade-in pb-10">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <TrendingUp className="text-primary w-5 h-5" />
                    Writing Stats
                </h2>
                <button
                    onClick={() => setIsExportModalOpen(true)}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm bg-white/5 hover:bg-white/10 text-text-muted hover:text-white rounded-md transition-all border border-white/10 shrink-0"
                    title="Export stats to CSV"
                >
                    <Download className="w-4 h-4" />
                    <span>Export CSV</span>
                </button>
            </div>

            {/* Sticky period selector */}
            <div
                className="sticky top-[4.5rem] md:top-[5.5rem] z-40 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-3 bg-bg/90 backdrop-blur-xl border-b border-white/10 shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
                role="toolbar"
                aria-label="Stats time range"
            >
                <div className="flex justify-center sm:justify-end">
                    <div className="flex bg-black/40 rounded-lg p-1 ring-1 ring-white/10">
                        {Object.entries(ranges).map(([key, { label }]) => (
                            <button
                                key={key}
                                type="button"
                                onClick={() => setTimeRange(key)}
                                aria-pressed={timeRange === key}
                                className={`px-3 py-2 sm:px-4 sm:py-1.5 text-sm rounded-md transition-all ${timeRange === key
                                    ? 'bg-primary text-white shadow-lg'
                                    : 'text-text-muted hover:text-white hover:bg-white/5'
                                    }`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Overview Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <div className="glass-card p-4 text-center">
                    <PenLine className="w-5 h-5 text-primary mx-auto mb-1" />
                    <div className="text-2xl font-bold text-white">{stats.totalEntries}</div>
                    <div className="text-xs text-text-muted">Entries</div>
                    <div className="mt-1"><TrendBadge value={stats.entryTrend} /></div>
                </div>
                <div className="glass-card p-4 text-center">
                    <Target className="w-5 h-5 text-green-400 mx-auto mb-1" />
                    <div className="text-2xl font-bold text-white">{stats.consistencyPercent}%</div>
                    <div className="text-xs text-text-muted">Consistency</div>
                    <div className="text-[10px] text-text-muted/60 mt-1">days with entries</div>
                </div>
                <div className="glass-card p-4 text-center">
                    <Flame className="w-5 h-5 text-orange-400 mx-auto mb-1" />
                    <div className="text-2xl font-bold text-white">{stats.currentStreak}</div>
                    <div className="text-xs text-text-muted">Current Streak</div>
                    <div className="text-[10px] text-text-muted/60 mt-1">days</div>
                </div>
                <div className="glass-card p-4 text-center">
                    <Trophy className="w-5 h-5 text-yellow-400 mx-auto mb-1" />
                    <div className="text-2xl font-bold text-white">{stats.longestStreak}</div>
                    <div className="text-xs text-text-muted">Longest Streak</div>
                    <div className="text-[10px] text-text-muted/60 mt-1">in period</div>
                </div>
                <div className="glass-card p-4 text-center">
                    <Star className="w-5 h-5 text-yellow-400 mx-auto mb-1 fill-yellow-400" />
                    <div className="text-2xl font-bold text-yellow-400">{stats.specialDaysCount}</div>
                    <div className="text-xs text-text-muted">Special Days</div>
                </div>
                <div className="glass-card p-4 text-center">
                    <Smile className="w-5 h-5 text-pink-400 mx-auto mb-1" />
                    <div className="text-2xl font-bold text-white">
                        {stats.avgMood ?? '—'}
                        {stats.avgMood && <span className="text-sm text-text-muted">/5</span>}
                    </div>
                    <div className="text-xs text-text-muted">Avg Mood</div>
                    {stats.moodEntries > 0 && (
                        <div className="text-[10px] text-text-muted/60 mt-1">{stats.moodEntries} rated</div>
                    )}
                </div>
            </div>

            {/* Period Trend + Writing Patterns */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* First vs Second Half Comparison */}
                <div className="glass-card p-6">
                    <h3 className="text-lg font-serif font-bold text-white mb-1 flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-secondary" /> Period Trend
                    </h3>
                    <p className="text-xs text-text-muted mb-4">First half vs second half of {ranges[timeRange]?.label.toLowerCase()}</p>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-white/5 rounded-lg p-4">
                            <div className="text-sm text-text-muted mb-1">Total Words</div>
                            <div className="text-2xl font-bold text-white">{stats.totalWords.toLocaleString()}</div>
                            <div className="mt-2"><TrendBadge value={stats.wordTrend} /></div>
                        </div>
                        <div className="bg-white/5 rounded-lg p-4">
                            <div className="text-sm text-text-muted mb-1">Avg / Entry</div>
                            <div className="text-2xl font-bold text-white">{stats.averageWordsPerEntry.toLocaleString()}</div>
                            <div className="text-[10px] text-text-muted/60 mt-2">{stats.uniqueTagsUsed} tags used</div>
                        </div>
                    </div>
                </div>

                {/* Day of Week Pattern */}
                <div className="glass-card p-6">
                    <h3 className="text-lg font-serif font-bold text-white mb-1 flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-primary" /> Writing by Day
                    </h3>
                    <p className="text-xs text-text-muted mb-4">Which days you journal most</p>
                    <div className="h-[140px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={stats.dayOfWeekData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                <XAxis
                                    dataKey="day"
                                    stroke="rgba(255,255,255,0.5)"
                                    tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }}
                                    tickLine={false}
                                    axisLine={false}
                                />
                                <YAxis
                                    allowDecimals={false}
                                    stroke="rgba(255,255,255,0.5)"
                                    tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }}
                                    tickLine={false}
                                    axisLine={false}
                                />
                                <Tooltip
                                    content={({ active, payload }) => {
                                        if (!active || !payload?.length) return null;
                                        const d = payload[0].payload;
                                        return (
                                            <div className="bg-surface border border-border p-2 rounded shadow-xl text-text text-sm">
                                                <span className="font-bold">{d.day}</span>: {d.count} {d.count === 1 ? 'entry' : 'entries'} ({d.percent}%)
                                            </div>
                                        );
                                    }}
                                    cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                                />
                                <Bar dataKey="count" name="Entries" radius={[4, 4, 0, 0]} maxBarSize={40}>
                                    {stats.dayOfWeekData.map((entry, index) => (
                                        <Cell
                                            key={`dow-${index}`}
                                            fill="#8b5cf6"
                                            fillOpacity={entry.fillOpacity}
                                        />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
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
                            margin={{ top: 30, right: 10, left: -20, bottom: 0 }}
                            barCategoryGap={timeRange === 'week' ? "10%" : "20%"}
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
                                    radius={[4, 4, 0, 0]}
                                    maxBarSize={timeRange === 'week' ? 100 : 50}
                                    onClick={(data) => {
                                        if (data && data.date) {
                                            navigate(`/entry/${data.date}`, { state: { from: '/stats' } });
                                        }
                                    }}
                                    style={{ cursor: 'pointer' }}
                                >
                                    {stats.chartData.map((entry, index) => (
                                        <Cell
                                            key={`cell-${index}`}
                                            fill={entry.color}
                                            fillOpacity={entry.isSpecial ? 1 : 0.8}
                                        />
                                    ))}
                                    <LabelList
                                        dataKey="words"
                                        content={(props) => {
                                            const { x, y, width, payload } = props;
                                            if (payload && payload.isSpecial && payload.words > 0) {
                                                return (
                                                    <text
                                                        x={x + width / 2}
                                                        y={y - 12}
                                                        fill="#facc15"
                                                        textAnchor="middle"
                                                        className="text-[16px] font-bold drop-shadow-[0_0_8px_rgba(250,204,21,0.6)]"
                                                    >
                                                        ★
                                                    </text>
                                                );
                                            }
                                            return null;
                                        }}
                                    />
                                </Bar>
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

            {/* Mood Chart */}
            <div className="glass-card p-6 min-h-[400px]">
                <h3 className="text-lg font-serif font-bold text-white mb-6 flex items-center gap-2">
                    <Smile className="w-5 h-5 text-primary" /> Mood Level History
                </h3>

                <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                            data={stats.chartData}
                            margin={{ top: 30, right: 10, left: -20, bottom: 0 }}
                            barCategoryGap={timeRange === 'week' ? "10%" : "20%"}
                        >
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
                                domain={[0, 5]}
                                ticks={[0, 1, 2, 3, 4, 5]}
                                stroke="rgba(255,255,255,0.5)"
                                tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 12 }}
                                tickLine={false}
                                axisLine={false}
                            />
                            <Tooltip content={<CustomMoodTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                            <Bar
                                dataKey="mood"
                                name="Mood Level"
                                radius={[4, 4, 0, 0]}
                                maxBarSize={timeRange === 'week' ? 100 : 50}
                                onClick={(data) => {
                                    if (data && data.date) {
                                        navigate(`/entry/${data.date}`, { state: { from: '/stats' } });
                                    }
                                }}
                                style={{ cursor: 'pointer' }}
                            >
                                {stats.chartData.map((entry, index) => (
                                    <Cell
                                        key={`cell-${index}`}
                                        fill={MOOD_CONFIG[entry.mood]?.color || 'rgba(255,255,255,0.05)'}
                                    />
                                ))}
                                <LabelList
                                    dataKey="mood"
                                    content={(props) => {
                                        const { x, y, width, value } = props;
                                        if (value && MOOD_CONFIG[value]) {
                                            const Icon = MOOD_CONFIG[value].icon;
                                            return (
                                                <foreignObject x={x + width / 2 - 10} y={y - 25} width={20} height={20}>
                                                    <Icon 
                                                        className="w-5 h-5" 
                                                        style={{ color: MOOD_CONFIG[value].color }} 
                                                    />
                                                </foreignObject>
                                            );
                                        }
                                        return null;
                                    }}
                                />
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Mood Breakdown + Notable Entries */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Mood Distribution */}
                <div className="glass-card p-6">
                    <h3 className="text-lg font-serif font-bold text-white mb-1 flex items-center gap-2">
                        <Heart className="w-5 h-5 text-pink-400" /> Mood Breakdown
                    </h3>
                    <p className="text-xs text-text-muted mb-4">
                        {stats.moodEntries > 0
                            ? `${stats.moodEntries} of ${stats.totalEntries} entries rated`
                            : 'No mood data in this period'}
                    </p>
                    {stats.moodBreakdown.length > 0 ? (
                        <div className="space-y-3">
                            {stats.moodBreakdown.map(item => {
                                const Icon = item.icon;
                                return (
                                    <div key={item.level} className="flex items-center gap-3">
                                        <Icon className="w-4 h-4 shrink-0" style={{ color: item.color }} />
                                        <span className="text-sm text-white w-16 shrink-0">{item.label}</span>
                                        <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                                            <div
                                                className="h-full rounded-full transition-all"
                                                style={{ width: `${item.percent}%`, backgroundColor: item.color }}
                                            />
                                        </div>
                                        <span className="text-xs text-text-muted w-16 text-right shrink-0">
                                            {item.count} ({item.percent}%)
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="text-text-muted text-sm italic py-4">Rate your mood on entries to see breakdown here.</div>
                    )}
                </div>

                {/* Notable Entries */}
                <div className="glass-card p-6">
                    <h3 className="text-lg font-serif font-bold text-white mb-4 flex items-center gap-2">
                        <Trophy className="w-5 h-5 text-yellow-400" /> Notable Entries
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {[
                            { key: 'longest', label: 'Longest Entry', icon: Type, color: 'text-blue-400', detail: (e) => `${e.words.toLocaleString()} words` },
                            { key: 'shortest', label: 'Shortest Entry', icon: PenLine, color: 'text-green-400', detail: (e) => `${e.words.toLocaleString()} words` },
                            { key: 'highestMood', label: 'Best Mood', icon: Zap, color: 'text-purple-400', detail: (e) => MOOD_CONFIG[e.mood]?.label || '' },
                            { key: 'mostRecent', label: 'Most Recent', icon: Clock, color: 'text-pink-400', detail: (e) => format(parseISO(e.id), 'MMM d') },
                        ].map(({ key, label, icon: Icon, color, detail }) => {
                            const entry = stats.notableEntries[key];
                            if (!entry) return null;
                            return (
                                <button
                                    type="button"
                                    key={key}
                                    onClick={() => navigate(`/entry/${entry.id}`, { state: { from: '/stats' } })}
                                    className="bg-white/5 border border-white/10 p-3 rounded-xl hover:bg-white/10 hover:border-primary/50 transition-all text-left group focus:outline-none focus:ring-2 focus:ring-primary"
                                >
                                    <div className="flex items-center gap-2 mb-1">
                                        <Icon className={`w-3.5 h-3.5 ${color}`} />
                                        <span className="text-[10px] uppercase tracking-wider text-text-muted font-bold">{label}</span>
                                    </div>
                                    <div className="text-sm text-white font-medium line-clamp-1 group-hover:text-primary transition-colors">
                                        {entry.title}
                                    </div>
                                    <div className="text-xs text-text-muted mt-1">{detail(entry)}</div>
                                </button>
                            );
                        })}
                        {!stats.notableEntries.mostRecent && (
                            <div className="text-text-muted text-sm italic col-span-2 py-4 text-center">No entries in this period.</div>
                        )}
                    </div>
                </div>
            </div>

            {/* Secondary Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
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

                {/* All Tags */}
                <div className="glass-card p-6">
                    <h3 className="text-lg font-serif font-bold text-white mb-1 flex items-center gap-2">
                        <Tag className="w-5 h-5 text-purple-400" /> All Tags
                    </h3>
                    <p className="text-xs text-text-muted mb-4">Click any tag to view usage history</p>
                    <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                        {(() => {
                            const maxPeriodCount = Math.max(...allTags.map(t => t.count), 1);
                            return allTags.map((item) => {
                            const isSelected = selectedTagId === item.tagId;
                            return (
                            <button
                                type="button"
                                key={item.tagId}
                                onClick={() => setSelectedTagId(isSelected ? null : item.tagId)}
                                className={`w-full flex justify-between items-center group rounded-lg px-3 py-2.5 text-left transition-colors ${
                                    isSelected
                                        ? 'bg-primary/20 ring-1 ring-primary/40'
                                        : 'hover:bg-white/5'
                                } ${!item.usedInPeriod ? 'opacity-70 hover:opacity-100' : ''}`}
                            >
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                    {item.data.isSpecial ? (
                                        <Star className="w-3 h-3 fill-yellow-400 text-yellow-400 shrink-0" />
                                    ) : (
                                        <span
                                            className="w-3 h-3 rounded-full shadow-sm shrink-0"
                                            style={{ backgroundColor: item.data.color }}
                                        />
                                    )}
                                    <div className="min-w-0">
                                        <span className={`block text-white group-hover:text-primary transition-colors truncate ${item.data.isSpecial ? 'text-yellow-400 font-bold' : ''} ${isSelected ? 'text-primary' : ''}`}>
                                            {item.data.name}
                                        </span>
                                        <span className="text-[10px] text-text-muted">
                                            {item.usedInPeriod
                                                ? `${item.count} in period`
                                                : item.allTimeCount > 0
                                                    ? 'Not in period'
                                                    : 'Never used'}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 shrink-0 ml-2">
                                    {item.usedInPeriod && (
                                        <div className="w-12 h-1.5 bg-white/10 rounded-full overflow-hidden hidden sm:block">
                                            <div
                                                className="h-full rounded-full"
                                                style={{
                                                    width: `${(item.count / maxPeriodCount) * 100}%`,
                                                    backgroundColor: item.data.color || '#8b5cf6',
                                                    opacity: 0.8,
                                                }}
                                            />
                                        </div>
                                    )}
                                    <div className="text-right min-w-[72px]">
                                        <div
                                            className="text-base sm:text-lg font-bold leading-tight"
                                            style={{ color: item.data.color || '#c4b5fd' }}
                                        >
                                            {item.sinceLastUsed.headline}
                                        </div>
                                        <div className="text-[10px] text-text-muted whitespace-nowrap">
                                            {item.allTimeCount > 0 ? 'since last used' : 'no history'}
                                        </div>
                                    </div>
                                </div>
                            </button>
                            );
                        });
                        })()}
                        {allTags.length === 0 && (
                            <div className="text-text-muted text-sm italic">No tags created yet.</div>
                        )}
                    </div>
                </div>

                {/* Quick Stats Cards */}
                <div className="space-y-6 flex flex-col">
                    <div className="glass-card p-6 flex flex-col justify-center items-center text-center">
                        <Type className="w-8 h-8 text-blue-400 mb-2" />
                        <div className="flex gap-6 w-full justify-center">
                            <div>
                                <div className="text-3xl font-bold text-white mb-1">{stats.totalWords.toLocaleString()}</div>
                                <div className="text-sm text-text-muted">Total Words</div>
                            </div>
                            <div>
                                <div className="text-3xl font-bold text-white mb-1">{stats.averageWordsPerEntry.toLocaleString()}</div>
                                <div className="text-sm text-text-muted">Avg / Entry</div>
                            </div>
                        </div>
                    </div>

                    <div className="glass-card p-6 flex flex-col justify-center items-center text-center">
                        <ImageIcon className="w-8 h-8 text-purple-400 mb-2" />
                        <div className="flex gap-6 w-full justify-center">
                            <div>
                                <div className="text-3xl font-bold text-white mb-1">{stats.totalImages.toLocaleString()}</div>
                                <div className="text-sm text-text-muted">Total Images</div>
                            </div>
                            <div>
                                <div className="text-3xl font-bold text-white mb-1">{stats.averageImagesPerEntry}</div>
                                <div className="text-sm text-text-muted">Avg / Entry</div>
                            </div>
                        </div>
                    </div>

                    <StorageStats
                        variant="global"
                        entries={entries}
                        timeFrameLabel={ranges[timeRange]?.label}
                        className="flex flex-col justify-center items-center text-center"
                    />

                    <FirestoreUsage className="flex flex-col justify-center text-center" />
                </div>
            </div>

            {/* Selected Tag Detail */}
            {selectedTag && (
                <div className="glass-card p-6 animation-fade-in space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            {selectedTag.data.isSpecial ? (
                                <Star className="w-5 h-5 fill-yellow-400 text-yellow-400 shrink-0" />
                            ) : (
                                <span
                                    className="w-4 h-4 rounded-full shadow-sm shrink-0"
                                    style={{ backgroundColor: selectedTag.data.color }}
                                />
                            )}
                            <div>
                                <h3 className={`text-lg font-serif font-bold ${selectedTag.data.isSpecial ? 'text-yellow-400' : 'text-white'}`}>
                                    {selectedTag.data.name}
                                </h3>
                                <p className="text-xs text-text-muted">Usage in selected period ({ranges[timeRange]?.label})</p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => setSelectedTagId(null)}
                            className="p-2 rounded-full hover:bg-white/10 text-text-muted hover:text-white transition-colors self-start sm:self-center"
                            aria-label="Close tag details"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Last used — prominent */}
                    <div
                        className="rounded-2xl p-6 sm:p-8 text-center border border-white/10"
                        style={{ backgroundColor: `${selectedTag.data.color || '#8b5cf6'}15` }}
                    >
                        <div className="flex items-center justify-center gap-2 mb-2">
                            <Clock className="w-5 h-5 text-text-muted" />
                            <span className="text-sm font-medium uppercase tracking-widest text-text-muted">Since Last Used</span>
                        </div>
                        {selectedTag.allTimeCount > 0 ? (
                            <>
                                <div
                                    className="text-5xl sm:text-6xl font-bold leading-none mb-2"
                                    style={{ color: selectedTag.data.color || '#c4b5fd' }}
                                >
                                    {selectedTag.sinceLastUsed.headline}
                                </div>
                                <div className="text-lg text-text-muted mb-1">
                                    {selectedTag.sinceLastUsed.subline}
                                </div>
                                {selectedTag.lastUsedFormatted && (
                                    <div className="text-sm text-white/80 font-medium">
                                        {selectedTag.lastUsedFormatted}
                                    </div>
                                )}
                            </>
                        ) : (
                            <>
                                <div className="text-4xl sm:text-5xl font-bold text-text-muted leading-none mb-2">
                                    Never
                                </div>
                                <div className="text-lg text-text-muted">
                                    This tag hasn&apos;t been used on any entry yet
                                </div>
                            </>
                        )}
                    </div>

                    {/* Tag stat cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <div className="bg-white/5 rounded-lg p-3 text-center">
                            <div className="text-2xl font-bold text-white">{selectedTag.count}</div>
                            <div className="text-xs text-text-muted">In This Period</div>
                        </div>
                        <div className="bg-white/5 rounded-lg p-3 text-center">
                            <div className="text-2xl font-bold text-white">{selectedTag.allTimeCount}</div>
                            <div className="text-xs text-text-muted">All Time</div>
                        </div>
                        <div className="bg-white/5 rounded-lg p-3 text-center col-span-2 sm:col-span-1">
                            <div className="text-2xl font-bold text-white">
                                {selectedTag.usedInPeriod ? `~${selectedTag.avgWords}` : '—'}
                            </div>
                            <div className="text-xs text-text-muted">Avg Words</div>
                        </div>
                        <div className="bg-white/5 rounded-lg p-3 text-center col-span-2 sm:col-span-3">
                            <div className="text-xl font-bold text-purple-400">{selectedTag.frequency}</div>
                            <div className="text-xs text-text-muted">Frequency in {ranges[timeRange]?.label.toLowerCase()}</div>
                        </div>
                    </div>

                    {/* Tag usage chart */}
                    <div>
                        <h4 className="text-sm font-medium text-text-muted mb-1 flex items-center gap-2">
                            <BarChartIcon className="w-4 h-4" /> When Used
                        </h4>
                        <p className="text-xs text-text-muted mb-4">
                            {selectedTag.usedInPeriod
                                ? `Usage within ${ranges[timeRange]?.label.toLowerCase()}`
                                : `No usage in ${ranges[timeRange]?.label.toLowerCase()} — chart shows the selected period`}
                        </p>
                        <div className="h-[200px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                    data={selectedTagChartData}
                                    margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                                    barCategoryGap={timeRange === 'week' ? '10%' : '20%'}
                                >
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
                                        domain={[0, 1]}
                                        ticks={[0, 1]}
                                        tickFormatter={(v) => (v === 1 ? 'Used' : '')}
                                        stroke="rgba(255,255,255,0.5)"
                                        tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 12 }}
                                        tickLine={false}
                                        axisLine={false}
                                        width={40}
                                    />
                                    <Tooltip content={<TagUsageTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                                    <Bar
                                        dataKey="used"
                                        name="Used"
                                        radius={[4, 4, 0, 0]}
                                        maxBarSize={timeRange === 'week' ? 100 : 50}
                                        onClick={(data) => {
                                            if (data && data.date && data.used) {
                                                navigate(`/entry/${data.date}`, { state: { from: '/stats' } });
                                            }
                                        }}
                                        style={{ cursor: 'pointer' }}
                                    >
                                        {selectedTagChartData.map((entry, index) => (
                                            <Cell
                                                key={`tag-cell-${index}`}
                                                fill={entry.used ? (selectedTag.data.color || '#8b5cf6') : 'transparent'}
                                                fillOpacity={entry.used ? 0.9 : 0}
                                            />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Tagged entries list */}
                    <div>
                        <div className="flex justify-between items-center mb-4">
                            <h4 className="text-sm font-medium text-text-muted flex items-center gap-2">
                                <Calendar className="w-4 h-4" />
                                {selectedTag.usedInPeriod
                                    ? 'Tagged Entries'
                                    : 'All Tagged Entries'}
                            </h4>
                            <span className="text-xs font-medium text-text-muted bg-white/5 px-3 py-1 rounded-full">
                                {selectedTagEntries.length} {selectedTagEntries.length === 1 ? 'entry' : 'entries'}
                                {!selectedTag.usedInPeriod && selectedTag.allTimeCount > 0 && ' (all time)'}
                            </span>
                        </div>
                        {selectedTagEntries.length === 0 ? (
                            <div className="text-center py-8 text-text-muted text-sm">
                                {selectedTag.allTimeCount === 0
                                    ? 'No entries use this tag yet.'
                                    : 'No entries found for this tag.'}
                            </div>
                        ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {selectedTagEntries.map(entry => {
                                const title = extractTitle(getEntryText(entry), entry.title) || 'Untitled Entry';
                                const entryDate = parseISO(entry.id);
                                const validDate = !isNaN(entryDate.getTime());

                                return (
                                    <button
                                        type="button"
                                        key={entry.id}
                                        onClick={() => navigate(`/entry/${entry.id}`, { state: { from: '/stats' } })}
                                        className="bg-white/5 border border-white/10 p-4 rounded-xl hover:bg-white/10 hover:border-primary/50 transition-all cursor-pointer group flex flex-col justify-between min-h-[90px] text-left focus:outline-none focus:ring-2 focus:ring-primary"
                                    >
                                        <div>
                                            <div className="text-xs text-primary font-bold mb-1 uppercase tracking-wider">
                                                {validDate ? format(entryDate, 'MMM d, yyyy') : entry.id}
                                            </div>
                                            <div className="text-white font-medium line-clamp-2 text-sm group-hover:text-primary transition-colors">
                                                {title}
                                            </div>
                                        </div>
                                        <div className="flex items-center text-xs text-text-muted group-hover:text-white transition-colors mt-2">
                                            Read Entry <ArrowRight className="w-3 h-3 ml-1 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                        )}
                    </div>
                </div>
            )}

            {/* Export Modal */}
            <Modal
                isOpen={isExportModalOpen}
                onClose={() => setIsExportModalOpen(false)}
                labelledBy="stats-export-title"
                zIndexClassName="z-[100]"
                backdropClassName="bg-black/80"
                className="glass-card w-full max-w-md p-6 overflow-hidden bg-surface/95 shadow-2xl border border-border"
            >
                        {/* Header */}
                        <div className="flex justify-between items-center mb-6">
                            <h2 id="stats-export-title" className="text-xl font-serif font-bold text-text flex items-center gap-2">
                                <FileText className="w-5 h-5 text-primary" />
                                Export CSV
                            </h2>
                            <button
                                type="button"
                                onClick={() => setIsExportModalOpen(false)}
                                aria-label="Close export dialog"
                                className="p-2 rounded-full hover:bg-white/10 text-text-muted hover:text-white transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <p className="text-sm text-text-muted mb-6">
                            Choose a time range to export your journal statistics. The export includes a summary of your writing metrics and detailed data for each entry.
                        </p>

                        <div className="space-y-4">
                            <label className="text-sm font-medium text-text-muted flex items-center gap-2 mb-2">
                                <Calendar className="w-4 h-4" /> Select Range
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                                {[
                                    { id: 'week', label: 'Past Week' },
                                    { id: 'month', label: 'Past Month' },
                                    { id: '6months', label: '6 Months' },
                                    { id: 'year', label: 'Past Year' },
                                    { id: 'all', label: 'All Time' }
                                ].map(opt => (
                                    <button
                                        type="button"
                                        key={opt.id}
                                        onClick={() => handleExportCSV(opt.id)}
                                        disabled={loading}
                                        className="px-4 py-3 rounded-lg text-sm bg-white/5 border border-white/5 text-white hover:bg-primary/20 hover:border-primary transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {loading && (
                            <div className="mt-6 flex justify-center items-center gap-2 text-primary animate-pulse">
                                <Loader className="w-5 h-5 animate-spin" />
                                <span className="font-medium">Generating Export...</span>
                            </div>
                        )}
            </Modal>
        </div>
    );
}
