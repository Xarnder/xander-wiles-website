import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { format, parseISO, startOfMonth, endOfMonth, startOfYear, endOfYear, eachDayOfInterval } from 'date-fns';
import { FileDown, Calendar, Type, ChevronLeft, ChevronRight, Printer } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

export default function PdfExportView() {
    const { currentUser } = useAuth();
    const [filterMode, setFilterMode] = useState('month'); // range, month, year
    const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    // Font settings (in px or rem, using state for now)
    const [fontSettings, setFontSettings] = useState({
        titleSize: 24,
        dateSize: 14,
        bodySize: 16
    });

    const [entries, setEntries] = useState([]);
    const [loading, setLoading] = useState(false);

    // Preview Pagination Logic
    const previewContainerRef = useRef(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);

    // Initial load check
    useEffect(() => {
        if (filterMode === 'range' && !startDate && !endDate) return;
        // Trigger fetch (logic below)
    }, []);

    useEffect(() => {
        async function fetchEntries() {
            if (!currentUser) return;
            // Prevent fetching if in range mode but dates are not set
            if (filterMode === 'range' && (!startDate || !endDate)) {
                setEntries([]);
                setLoading(false);
                return;
            }

            setLoading(true);
            try {
                let q;
                const entriesRef = collection(db, 'users', currentUser.uid, 'entries');
                let start, end;

                if (filterMode === 'month') {
                    const date = parseISO(selectedMonth + '-01');
                    start = startOfMonth(date);
                    end = endOfMonth(date);
                } else if (filterMode === 'year') {
                    const date = new Date(selectedYear, 0, 1);
                    start = startOfYear(date);
                    end = endOfYear(date);
                } else if (filterMode === 'range' && startDate && endDate) {
                    start = parseISO(startDate);
                    end = parseISO(endDate);
                }

                if (start && end) {
                    q = query(
                        entriesRef,
                        where('date', '>=', start),
                        where('date', '<=', end),
                        orderBy('date', 'asc')
                    );

                    const querySnapshot = await getDocs(q);
                    const fetchedEntries = querySnapshot.docs.map(doc => {
                        const data = doc.data();

                        // Parse content for inferred title (logic from EntryEditor/MonthView)
                        let title = data.title;
                        let content = data.content || '';

                        // Extract title from ++Title++ or **++Title++** markup
                        const titleMatch = content.match(/(?:\*\*)?\+\+(.*?)\+\+(?:\*\*)?/);
                        if (titleMatch && titleMatch[1]) {
                            // Handle "Date - Title" separator format
                            const parts = titleMatch[1].split(' - ');
                            if (parts.length >= 2) {
                                title = parts.slice(1).join(' - ').trim();
                            } else {
                                title = parts[0].trim();
                            }
                            // Strip the markup line from displayed content
                            content = content.replace(/(?:\*\*)?\+\+.*?\+\+(?:\*\*)?\n?/, '').trim();
                        }

                        // Fallback: if still no title, use first line of content
                        if (!title && content) {
                            title = content.split('\n')[0].replace('#', '').trim();
                        }

                        return {
                            id: doc.id,
                            ...data,
                            title: title || 'Untitled Entry',
                            // Ensure date is a string YYYY-MM-DD for consistency
                            date: format(data.date.toDate(), 'yyyy-MM-dd'),
                            content: content
                        };
                    });
                    setEntries(fetchedEntries);
                } else {
                    setEntries([]);
                }

            } catch (error) {
                console.error("Error fetching entries:", error);
            } finally {
                setLoading(false);
            }
        }

        fetchEntries();
    }, [currentUser, filterMode, selectedMonth, selectedYear, startDate, endDate]);

    // Calculate total pages (approximate) when entries change
    useEffect(() => {
        if (previewContainerRef.current) {
            // Delay slightly to allow rendering
            setTimeout(() => {
                if (previewContainerRef.current) {
                    const scrollHeight = previewContainerRef.current.scrollHeight;
                    const clientHeight = previewContainerRef.current.clientHeight;
                    // Assuming A4 ratio is maintained in view, but here we just use scroll height
                    // Page height in preview pixels (A4 is 297mm, assuming standard browser DPI roughly 1123px)
                    // But we are scaling. Let's strictly use the container's clientHeight as "one page view"
                    const pageHeight = clientHeight > 0 ? clientHeight : 1;
                    setTotalPages(Math.max(1, Math.ceil(scrollHeight / pageHeight)));
                    setCurrentPage(1); // Reset to first page on new content
                }
            }, 500);
        }
    }, [entries, fontSettings]);


    const handlePrint = () => {
        window.print();
    };

    const scrollPreview = (direction) => {
        if (!previewContainerRef.current) return;
        const container = previewContainerRef.current;
        const pageHeight = container.clientHeight; // Scroll by one viewport height

        const targetScroll = container.scrollTop + (direction * pageHeight);

        container.scrollTo({
            top: targetScroll,
            behavior: 'smooth'
        });

        // Update page number after scroll (approx)
        setTimeout(() => {
            const newPage = Math.round(container.scrollTop / pageHeight) + 1;
            setCurrentPage(newPage);
        }, 300);
    };

    return (
        <div className="h-[calc(100vh-100px)] flex flex-col md:flex-row gap-6 p-4">

            {/* Sidebar Controls - Hidden on print */}
            <div className="w-full md:w-80 flex-shrink-0 flex flex-col gap-6 print:hidden overflow-y-auto custom-scrollbar">

                {/* Mode Selection */}
                <div className="glass-card p-5">
                    <h3 className="text-lg font-bold text-white mb-4 flex items-center">
                        <Calendar className="w-5 h-5 mr-2 text-primary" />
                        Export Range
                    </h3>

                    <div className="flex bg-white/5 p-1 rounded-lg mb-4">
                        {['month', 'year', 'range'].map(mode => (
                            <button
                                key={mode}
                                onClick={() => setFilterMode(mode)}
                                className={`flex-1 py-1.5 px-2 rounded-md text-sm font-medium capitalize transition-all ${filterMode === mode ? 'bg-primary text-white shadow-lg' : 'text-text-muted hover:text-white'
                                    }`}
                            >
                                {mode}
                            </button>
                        ))}
                    </div>

                    <div className="space-y-4">
                        {filterMode === 'month' && (
                            <div>
                                <label className="block text-sm text-text-muted mb-1">Select Month</label>
                                <input
                                    type="month"
                                    value={selectedMonth}
                                    onChange={(e) => setSelectedMonth(e.target.value)}
                                    className="w-full glass-input"
                                />
                            </div>
                        )}

                        {filterMode === 'year' && (
                            <div>
                                <label className="block text-sm text-text-muted mb-1">Select Year</label>
                                <input
                                    type="number"
                                    value={selectedYear}
                                    onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                                    className="w-full glass-input"
                                />
                            </div>
                        )}

                        {filterMode === 'range' && (
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="block text-sm text-text-muted mb-1">Start</label>
                                    <input
                                        type="date"
                                        value={startDate}
                                        onChange={(e) => setStartDate(e.target.value)}
                                        className="w-full glass-input"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm text-text-muted mb-1">End</label>
                                    <input
                                        type="date"
                                        value={endDate}
                                        onChange={(e) => setEndDate(e.target.value)}
                                        className="w-full glass-input"
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Font Settings */}
                <div className="glass-card p-5">
                    <h3 className="text-lg font-bold text-white mb-4 flex items-center">
                        <Type className="w-5 h-5 mr-2 text-primary" />
                        Typography
                    </h3>

                    <div className="space-y-4">
                        <div>
                            <div className="flex justify-between text-sm mb-1">
                                <span className="text-text-muted">Title Size</span>
                                <span className="text-primary">{fontSettings.titleSize}px</span>
                            </div>
                            <input
                                type="range"
                                min="16" max="48"
                                value={fontSettings.titleSize}
                                onChange={(e) => setFontSettings({ ...fontSettings, titleSize: parseInt(e.target.value) })}
                                className="w-full accent-primary"
                            />
                        </div>
                        <div>
                            <div className="flex justify-between text-sm mb-1">
                                <span className="text-text-muted">Date Size</span>
                                <span className="text-primary">{fontSettings.dateSize}px</span>
                            </div>
                            <input
                                type="range"
                                min="10" max="24"
                                value={fontSettings.dateSize}
                                onChange={(e) => setFontSettings({ ...fontSettings, dateSize: parseInt(e.target.value) })}
                                className="w-full accent-primary"
                            />
                        </div>
                        <div>
                            <div className="flex justify-between text-sm mb-1">
                                <span className="text-text-muted">Body Size</span>
                                <span className="text-primary">{fontSettings.bodySize}px</span>
                            </div>
                            <input
                                type="range"
                                min="12" max="24"
                                value={fontSettings.bodySize}
                                onChange={(e) => setFontSettings({ ...fontSettings, bodySize: parseInt(e.target.value) })}
                                className="w-full accent-primary"
                            />
                        </div>
                    </div>
                </div>

                {/* Action Buttons */}
                <button
                    onClick={handlePrint}
                    disabled={entries.length === 0}
                    className={`w-full py-3 bg-gradient-to-r from-primary to-secondary text-white font-bold rounded-lg shadow-lg shadow-primary/30 transition-all flex items-center justify-center ${entries.length === 0 ? 'opacity-50 cursor-not-allowed' : 'hover:shadow-primary/50 hover:scale-[1.02]'
                        }`}
                >
                    <Printer className="w-5 h-5 mr-2" />
                    Export PDF
                </button>

            </div>

            {/* Preview Area */}
            <div className="flex-1 bg-gray-900/50 rounded-xl overflow-hidden flex flex-col relative print:bg-white print:text-black print:overflow-visible print:h-auto border border-white/5">

                {/* Preview Toolbar */}
                <div className="h-12 bg-white/5 border-b border-white/10 flex items-center justify-between px-4 print:hidden shrink-0">
                    <span className="text-sm text-text-muted font-medium">Print Preview</span>
                    <div className="flex items-center space-x-2">
                        <button
                            onClick={() => scrollPreview(-1)}
                            className="p-1.5 hover:bg-white/10 rounded-lg text-text-muted hover:text-white transition-colors"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span className="text-xs text-text-muted min-w-[60px] text-center">{currentPage} / {totalPages > 1 ? totalPages : '?'}</span>
                        <button
                            onClick={() => scrollPreview(1)}
                            className="p-1.5 hover:bg-white/10 rounded-lg text-text-muted hover:text-white transition-colors"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* A4 Page Container / Scrollable Area */}
                <div
                    ref={previewContainerRef}
                    className="flex-1 overflow-auto p-4 md:p-8 bg-[#1a1a1c] scroll-smooth print:p-0 print:block print:bg-white print:overflow-visible"
                    onScroll={(e) => {
                        const pageHeight = e.target.clientHeight;
                        if (pageHeight > 0) {
                            const newPage = Math.round(e.target.scrollTop / pageHeight) + 1;
                            if (newPage !== currentPage) setCurrentPage(newPage);
                        }
                    }}
                >
                    {loading ? (
                        <div className="flex flex-col items-center justify-center h-full text-text-muted">
                            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mb-4"></div>
                            <p>Loading entries...</p>
                        </div>
                    ) : (
                        <div
                            className="bg-white text-black shadow-2xl w-full md:w-[210mm] mx-auto p-[20mm] print:shadow-none print:w-full print:min-h-0 print:p-0 pb-20 mb-8"
                            style={{
                                backgroundColor: 'white',
                                minHeight: '297mm',
                                height: 'fit-content'
                            }}
                        >
                            {/* Content Rendering for Preview */}
                            {entries.length > 0 ? (
                                <div className="space-y-8">
                                    {entries.map((entry, index) => (
                                        <div key={entry.id} className="mb-8 break-inside-avoid">
                                            <div
                                                className="font-serif font-bold text-gray-900 mb-1"
                                                style={{ fontSize: `${fontSettings.titleSize}px` }}
                                            >
                                                {entry.title}
                                            </div>
                                            <div
                                                className="text-gray-500 font-medium mb-4"
                                                style={{ fontSize: `${fontSettings.dateSize}px` }}
                                            >
                                                {format(parseISO(entry.date), 'EEEE, d MMMM yyyy')}
                                            </div>
                                            <div
                                                className="prose max-w-none text-gray-800"
                                                style={{ fontSize: `${fontSettings.bodySize}px` }}
                                            >
                                                <ReactMarkdown>{entry.content}</ReactMarkdown>
                                            </div>
                                            {index < entries.length - 1 && (
                                                <hr className="my-8 border-gray-200" />
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="flex items-center justify-center h-[500px] text-gray-400">
                                    No entries found for this period.
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Print Styles */}
                <style>{`
                    @media print {
                        @page {
                            margin: 20mm;
                            size: A4;
                        }
                        body {
                            background: white;
                        }
                        .print\\:hidden {
                            display: none !important;
                        }
                        .print\\:block {
                            display: block !important;
                        }
                        .print\\:text-black {
                            color: black !important;
                        }
                        .print\\:bg-white {
                            background: white !important;
                        }
                        .print\\:shadow-none {
                            box-shadow: none !important;
                        }
                    }
                `}</style>

            </div>
        </div>
    );
}
