import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { format, parseISO, startOfMonth, endOfMonth, startOfYear, endOfYear, eachDayOfInterval } from 'date-fns';
import { FileDown, Calendar, Type, ChevronLeft, ChevronRight, Printer, Image as ImageIcon } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

import html2pdf from 'html2pdf.js';

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

    // Layout Options
    const [imageLayout, setImageLayout] = useState('block'); // 'block' | 'wrap'
    const [compactMode, setCompactMode] = useState(false); // If true, allow splitting across pages
    const [showContentsPage, setShowContentsPage] = useState(false);
    const [showDateRangeHeader, setShowDateRangeHeader] = useState(true);
    const [showMonthHeaders, setShowMonthHeaders] = useState(true);
    const [showPageNumbers, setShowPageNumbers] = useState(true);

    const [entries, setEntries] = useState([]);
    const [loading, setLoading] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [tocItems, setTocItems] = useState([]);

    // Preview Pagination Logic
    const previewContainerRef = useRef(null);
    const pageWrapperRef = useRef(null);
    const contentRef = useRef(null); // Ref for actual content to export
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [previewScale, setPreviewScale] = useState(1);

    // Initial load check
    useEffect(() => {
        if (filterMode === 'range' && !startDate && !endDate) return;
        // Trigger fetch (logic below)
    }, []);

    // Check if range is long enough to default to showing contents page
    useEffect(() => {
        if (filterMode === 'range' && startDate && endDate) {
            const start = parseISO(startDate);
            const end = parseISO(endDate);
            const diffTime = Math.abs(end - start);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            // If range > 32 days, default show contents to true
            if (diffDays > 32) {
                setShowContentsPage(true);
            } else {
                setShowContentsPage(false);
            }
        } else if (filterMode === 'year') {
            setShowContentsPage(true);
        } else {
            setShowContentsPage(false);
        }
    }, [filterMode, startDate, endDate, selectedYear]);


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
                    // Create Date Range Header String
                    const dateRangeStr = `${format(start, 'MMMM d, yyyy')} - ${format(end, 'MMMM d, yyyy')}`;

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
                            content: content,
                            images: data.images || (data.imageUrl ? [{ url: data.imageUrl }] : (data.imageMetadata ? [{ url: data.imageMetadata.url }] : []))
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
    // Also calculate TOC items
    useEffect(() => {
        if (previewContainerRef.current && entries.length > 0) {
            // Delay slightly to allow rendering
            setTimeout(() => {
                const container = previewContainerRef.current;
                // Need to look at the A4 page wrapper actually, not just container scroll
                const pageWrapper = pageWrapperRef.current;

                if (container && pageWrapper) {
                    const scrollHeight = container.scrollHeight;
                    const clientHeight = container.clientHeight;
                    // A4 height in pixels (approx 1123px at 96dpi, but heavily depends on scaling)
                    // We can try to deduce "one page height" from the container's visible area if it fits one page
                    // Ideally 297mm convert to px. @ 96dpi = 1122.5px. 
                    // Let's use the container clientHeight as the "viewer page height".

                    const pageHeight = clientHeight > 0 ? clientHeight : 1123;
                    setTotalPages(Math.max(1, Math.ceil(scrollHeight / pageHeight)));
                    setCurrentPage(1); // Reset to first page on new content

                    // Calculate TOC
                    // Find all month headers or first entry of each month
                    const newTocItems = [];
                    let currentMonth = '';

                    entries.forEach((entry, index) => {
                        const entryDate = parseISO(entry.date);
                        const monthStr = format(entryDate, 'MMMM yyyy');

                        if (monthStr !== currentMonth) {
                            currentMonth = monthStr;
                            // Find the DOM element for this entry
                            // We need to query selector strictly within our preview container to avoid other elements
                            // But identifiers might be tricky. Let's use ID on the entry div.
                            // Wait, we are in a timeout, render should be done.
                            // BUT, React renders might take a tick.

                            // Let's defer this calculation slightly more or rely on a separate effect if needed.
                            // For now assuming the DOM is ready in this timeout.
                        }
                    });

                    // More robust TOC calculation reading actual DOM offsets
                    const items = [];
                    let lastMonth = '';

                    // We need to select elements rendered in the preview
                    // Using a specific class or ID standard
                    const renderedEntries = pageWrapper.querySelectorAll('.journal-entry-item');

                    renderedEntries.forEach((el) => {
                        const dateStr = el.getAttribute('data-date');
                        if (!dateStr) return;

                        const date = parseISO(dateStr);
                        const monthStr = format(date, 'MMMM yyyy');

                        if (monthStr !== lastMonth) {
                            lastMonth = monthStr;
                            // Calculate page
                            // Offset relative to the wrapper top?
                            // The wrapper scrollHeight vs the pageHeight
                            const offsetTop = el.offsetTop;
                            // Add 1 for 1-based index. 
                            // If Contents Page is active, it might push things down, 
                            // but the offsetTop will reflect that if we re-run this effect! 
                            // So we need to be careful about dependency loops if we change state based on this.
                            // `showContentsPage` is a dependency of this effect (via re-render > entries potentially or just deps).

                            let pageNum = Math.ceil(offsetTop / pageHeight) + 1; // +1 to start at page 1

                            // If the offset is 0 (start of doc), it's page 1. 
                            // Actually Math.ceil(0/h) is 0. So +1 is correct. 
                            // Math.ceil(1/h) is 1 -> Page 2? No. 
                            // Page 1 is 0..pageHeight. 
                            // Page 2 is pageHeight..2*pageHeight.
                            // Floor is better. 0..1122 -> Page 1. 
                            pageNum = Math.floor(offsetTop / pageHeight) + 1;

                            items.push({ month: monthStr, page: pageNum });
                        }
                    });
                    setTocItems(items);
                }
            }, 800);
        }
    }, [entries, fontSettings, showContentsPage, showDateRangeHeader, imageLayout, compactMode]); // Re-run when layout changes

    // Calculate scale for mobile preview
    useEffect(() => {
        const container = previewContainerRef.current;
        if (!container) return;

        const A4_WIDTH_PX = 794; // 210mm at 96dpi

        const updateScale = () => {
            const containerWidth = container.clientWidth - 32; // subtract padding
            if (containerWidth < A4_WIDTH_PX) {
                setPreviewScale(containerWidth / A4_WIDTH_PX);
            } else {
                setPreviewScale(1);
            }
        };

        updateScale();
        const observer = new ResizeObserver(updateScale);
        observer.observe(container);
        return () => observer.disconnect();
    }, []);

    const handlePrint = async () => {
        if (!contentRef.current) return;
        setIsExporting(true);

        // Helper to convert modern colors (oklch) to standard rgba using canvas image data
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        const getStandardColor = (colorStr) => {
            if (!colorStr || colorStr === 'rgba(0, 0, 0, 0)' || colorStr === 'transparent') return 'transparent';

            // Optimization for simple colors
            if (colorStr.startsWith('#') || (colorStr.startsWith('rgb') && !colorStr.includes('oklch'))) {
                return colorStr;
            }

            // Force conversion to RGBA via canvas rendering
            ctx.clearRect(0, 0, 1, 1);
            ctx.fillStyle = colorStr;
            ctx.fillRect(0, 0, 1, 1);
            const data = ctx.getImageData(0, 0, 1, 1).data;
            // data is [r, g, b, a] (0-255)
            // Round alpha to 2 decimal places for cleanliness
            const alpha = Math.round((data[3] / 255) * 100) / 100;
            return `rgba(${data[0]}, ${data[1]}, ${data[2]}, ${alpha})`;
        };

        // Recursive function to bake computed styles into the clone
        const bakeStyles = (source, target) => {
            if (!source || !target) return;

            // 1. Compute styles from source
            const computed = window.getComputedStyle(source);

            // 2. Apply standardized colors to target
            target.style.color = getStandardColor(computed.color);
            target.style.backgroundColor = getStandardColor(computed.backgroundColor);
            target.style.borderColor = getStandardColor(computed.borderColor);

            // 3. Remove complex effects that might contain oklch or cause rendering issues
            target.style.boxShadow = 'none';
            target.style.textShadow = 'none';
            target.style.filter = 'none';
            target.style.backdropFilter = 'none';

            // 4. Recurse
            const sourceChildren = source.children;
            const targetChildren = target.children;

            for (let i = 0; i < sourceChildren.length; i++) {
                if (targetChildren[i]) {
                    bakeStyles(sourceChildren[i], targetChildren[i]);
                }
            }
        };

        const element = contentRef.current;
        const clone = element.cloneNode(true);

        // Reset base styles for the clone wrapper
        clone.style.transform = 'none';
        clone.style.width = '210mm';
        clone.style.height = 'auto';
        clone.style.margin = '0';
        clone.style.position = 'absolute';
        clone.style.left = '-9999px';
        clone.style.top = '0';

        // Apply fallback standard font explicitly to be safe
        clone.style.fontFamily = 'serif';

        // BAKE THE STYLES
        try {
            bakeStyles(element, clone);
        } catch (e) {
            console.error("Error baking styles:", e);
        }

        document.body.appendChild(clone);

        // Generate Filename
        const dateStr = format(new Date(), 'yyyy-MM-dd');
        const filename = `Journal_Export_${dateStr}.pdf`;

        const opt = {
            margin: [10, 10, 15, 10], // top, left, bottom, right (more bottom for page number)
            filename: filename,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true, logging: false },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
            pagebreak: { mode: ['css', 'legacy'] }
        };

        try {
            await html2pdf().set(opt).from(clone).toPdf().get('pdf').then((pdf) => {
                if (showPageNumbers) {
                    const totalPages = pdf.internal.getNumberOfPages();
                    for (let i = 1; i <= totalPages; i++) {
                        pdf.setPage(i);
                        pdf.setFontSize(10);
                        pdf.setTextColor(150);
                        const width = pdf.internal.pageSize.getWidth();
                        const height = pdf.internal.pageSize.getHeight();
                        pdf.text(`Page ${i} of ${totalPages}`, width / 2, height - 10, { align: 'center' });
                    }
                }
            }).save();
        } catch (err) {
            console.error('PDF Generation Failed:', err);
            alert(`PDF Generation Failed: ${err.message}`);
        } finally {
            document.body.removeChild(clone);
            setIsExporting(false);
        }
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

    // Helper to check if month changed
    const isNewMonth = (currentDate, prevDate) => {
        if (!prevDate) return true;
        return format(parseISO(currentDate), 'yyyy-MM') !== format(parseISO(prevDate), 'yyyy-MM');
    };

    // Helper to get date range string
    const getDateRangeString = () => {
        if (filterMode === 'month') return format(parseISO(selectedMonth + '-01'), 'MMMM yyyy');
        if (filterMode === 'year') return selectedYear.toString();
        if (filterMode === 'range' && startDate && endDate) {
            return `${format(parseISO(startDate), 'MMMM d, yyyy')} - ${format(parseISO(endDate), 'MMMM d, yyyy')}`;
        }
        return 'Journal Export';
    };

    return (
        <div className="min-h-[calc(100vh-100px)] md:h-[calc(100vh-100px)] flex flex-col md:flex-row gap-6 p-4">

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

                {/* Layout Settings */}
                <div className="glass-card p-5">
                    <h3 className="text-lg font-bold text-white mb-4 flex items-center">
                        <ImageIcon className="w-5 h-5 mr-2 text-primary" />
                        Layout
                    </h3>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm text-text-muted mb-2">Image Position</label>
                            <div className="flex bg-white/5 p-1 rounded-lg">
                                <button
                                    onClick={() => setImageLayout('block')}
                                    className={`flex-1 py-1.5 px-2 rounded-md text-sm font-medium transition-all ${imageLayout === 'block' ? 'bg-primary text-white shadow-lg' : 'text-text-muted hover:text-white'}`}
                                >
                                    Under (Block)
                                </button>
                                <button
                                    onClick={() => setImageLayout('wrap')}
                                    className={`flex-1 py-1.5 px-2 rounded-md text-sm font-medium transition-all ${imageLayout === 'wrap' ? 'bg-primary text-white shadow-lg' : 'text-text-muted hover:text-white'}`}
                                >
                                    Tight (Wrap)
                                </button>
                            </div>
                        </div>

                        <div className="flex items-center justify-between">
                            <span className="text-sm text-text-muted">Contents Page</span>
                            <div className="relative inline-block w-10 h-6 select-none transition duration-200 ease-in-out">
                                <input
                                    type="checkbox"
                                    name="toggleContents"
                                    id="toggleContents"
                                    checked={showContentsPage}
                                    onChange={(e) => setShowContentsPage(e.target.checked)}
                                    className="peer absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer"
                                />
                                <label
                                    htmlFor="toggleContents"
                                    className={`block overflow-hidden h-6 rounded-full bg-white/10 cursor-pointer peer-checked:bg-primary transition-colors`}
                                ></label>
                                <div className={`absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform duration-200 ${showContentsPage ? 'translate-x-4' : ''} pointer-events-none`}></div>
                            </div>
                        </div>

                        <div className="flex items-center justify-between">
                            <span className="text-sm text-text-muted">Date Header</span>
                            <div className="relative inline-block w-10 h-6 select-none transition duration-200 ease-in-out">
                                <input
                                    type="checkbox"
                                    name="toggleHeader"
                                    id="toggleHeader"
                                    checked={showDateRangeHeader}
                                    onChange={(e) => setShowDateRangeHeader(e.target.checked)}
                                    className="peer absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer"
                                />
                                <label
                                    htmlFor="toggleHeader"
                                    className={`block overflow-hidden h-6 rounded-full bg-white/10 cursor-pointer peer-checked:bg-primary transition-colors`}
                                ></label>
                                <div className={`absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform duration-200 ${showDateRangeHeader ? 'translate-x-4' : ''} pointer-events-none`}></div>
                            </div>
                        </div>

                        <div className="flex items-center justify-between">
                            <span className="text-sm text-text-muted">Month Headers</span>
                            <div className="relative inline-block w-10 h-6 select-none transition duration-200 ease-in-out">
                                <input
                                    type="checkbox"
                                    name="toggleMonthHeaders"
                                    id="toggleMonthHeaders"
                                    checked={showMonthHeaders}
                                    onChange={(e) => setShowMonthHeaders(e.target.checked)}
                                    className="peer absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer"
                                />
                                <label
                                    htmlFor="toggleMonthHeaders"
                                    className={`block overflow-hidden h-6 rounded-full bg-white/10 cursor-pointer peer-checked:bg-primary transition-colors`}
                                ></label>
                                <div className={`absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform duration-200 ${showMonthHeaders ? 'translate-x-4' : ''} pointer-events-none`}></div>
                            </div>
                        </div>

                        <div className="flex items-center justify-between">
                            <span className="text-sm text-text-muted">Page Numbers</span>
                            <div className="relative inline-block w-10 h-6 select-none transition duration-200 ease-in-out">
                                <input
                                    type="checkbox"
                                    name="togglePageNumbers"
                                    id="togglePageNumbers"
                                    checked={showPageNumbers}
                                    onChange={(e) => setShowPageNumbers(e.target.checked)}
                                    className="peer absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer"
                                />
                                <label
                                    htmlFor="togglePageNumbers"
                                    className={`block overflow-hidden h-6 rounded-full bg-white/10 cursor-pointer peer-checked:bg-primary transition-colors`}
                                ></label>
                                <div className={`absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform duration-200 ${showPageNumbers ? 'translate-x-4' : ''} pointer-events-none`}></div>
                            </div>
                        </div>

                        <div className="flex items-center justify-between">
                            <span className="text-sm text-text-muted">Compact Mode</span>
                            <div className="relative inline-block w-10 h-6 select-none transition duration-200 ease-in-out">
                                <input
                                    type="checkbox"
                                    name="toggle"
                                    id="compactMode"
                                    checked={compactMode}
                                    onChange={(e) => setCompactMode(e.target.checked)}
                                    className="peer absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer"
                                />
                                <label
                                    htmlFor="compactMode"
                                    className={`block overflow-hidden h-6 rounded-full bg-white/10 cursor-pointer peer-checked:bg-primary transition-colors`}
                                ></label>
                                <div className={`absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform duration-200 ${compactMode ? 'translate-x-4' : ''} pointer-events-none`}></div>
                            </div>
                        </div>
                        <p className="text-xs text-text-muted/60">
                            {compactMode ? "Entries flow continuously to save space." : "Entries try to stay on one page."}
                        </p>
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col gap-3">
                    <button
                        onClick={handlePrint}
                        disabled={entries.length === 0 || isExporting}
                        className={`w-full py-3 bg-gradient-to-r from-primary to-secondary text-white font-bold rounded-lg shadow-lg shadow-primary/30 transition-all flex items-center justify-center ${entries.length === 0 || isExporting ? 'opacity-50 cursor-not-allowed' : 'hover:shadow-primary/50 hover:scale-[1.02]'
                            }`}
                    >
                        {isExporting ? (
                            <>
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></div>
                                Generating PDF...
                            </>
                        ) : (
                            <>
                                <FileDown className="w-5 h-5 mr-2" />
                                Download PDF
                            </>
                        )}
                    </button>

                    <button
                        onClick={() => window.print()}
                        disabled={entries.length === 0 || isExporting}
                        className={`w-full py-3 bg-white/5 border border-white/10 text-white font-bold rounded-lg hover:bg-white/10 transition-all flex items-center justify-center ${entries.length === 0 ? 'opacity-50 cursor-not-allowed' : ''
                            }`}
                    >
                        <Printer className="w-5 h-5 mr-2" />
                        Print / Save as PDF
                    </button>
                    <p className="text-xs text-center text-text-muted mt-1 px-2">
                        "Download PDF" is best for mobile. "Print" is best for desktop.
                    </p>
                </div>

            </div>

            {/* Preview Area */}
            <div className="flex-1 min-h-[80vh] md:min-h-0 bg-gray-900/50 rounded-xl overflow-hidden flex flex-col relative print:bg-white print:text-black print:overflow-visible print:h-auto border border-white/5">

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
                            ref={pageWrapperRef}
                            className="mx-auto mb-8 print:!transform-none print:!w-full print:!h-auto"
                            style={{
                                width: previewScale < 1 ? `${794 * previewScale}px` : undefined,
                                height: previewScale < 1 ? 'fit-content' : undefined,
                                overflow: previewScale < 1 ? 'hidden' : undefined,
                            }}
                        >
                            <div
                                ref={contentRef}
                                className="bg-white text-black shadow-2xl p-[20mm] print:shadow-none print:min-h-0 print:p-0 pb-20 relative"
                                style={{
                                    backgroundColor: 'white',
                                    width: '210mm',
                                    minHeight: '297mm',
                                    height: 'fit-content',
                                    transform: previewScale < 1 ? `scale(${previewScale})` : undefined,
                                    transformOrigin: 'top left',
                                }}
                            >
                                {/* Date Range Header */}
                                {showDateRangeHeader && (
                                    <div className="mb-8 border-b-2 border-gray-800 pb-4">
                                        <h1 className="text-3xl font-serif font-bold text-gray-900 text-center">
                                            {getDateRangeString()}
                                        </h1>
                                    </div>
                                )}

                                {/* Contents Page */}
                                {showContentsPage && tocItems.length > 0 && (
                                    <div className="mb-12 break-after-page page-break" style={{ pageBreakAfter: 'always' }}>
                                        <h2 className="text-2xl font-serif font-bold text-gray-900 mb-6 border-b border-gray-300 pb-2">Contents</h2>
                                        <div className="space-y-2">
                                            {tocItems.map((item, index) => (
                                                <div key={index} className="flex items-baseline justify-between border-b border-gray-100 py-1">
                                                    <span className="text-lg font-medium text-gray-800">{item.month}</span>
                                                    <div className="flex-1 mx-4 border-b border-dotted border-gray-400 relative top-[-4px]"></div>
                                                    <span className="text-lg font-bold text-gray-900">{item.page}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Content Rendering for Preview */}
                                {entries.length > 0 ? (
                                    <div className="space-y-8">
                                        {entries.map((entry, index) => {
                                            const prevEntry = index > 0 ? entries[index - 1] : null;
                                            const showMonthHeader = showMonthHeaders && isNewMonth(entry.date, prevEntry?.date);

                                            return (
                                                <div key={entry.id}>
                                                    {showMonthHeader && (
                                                        <div className="mt-12 mb-8 break-before-page">
                                                            <h2 className="text-4xl font-serif font-bold text-gray-900 border-b-2 border-gray-900 pb-2">
                                                                {format(parseISO(entry.date), 'MMMM yyyy')}
                                                            </h2>
                                                        </div>
                                                    )}

                                                    <div
                                                        className={`journal-entry-item mb-8 ${compactMode ? '' : 'break-inside-avoid'}`}
                                                        data-date={entry.date}
                                                    >
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
                                                            className={`prose max-w-none text-gray-800 ${imageLayout === 'wrap' ? 'clearfix' : ''}`}
                                                            style={{ fontSize: `${fontSettings.bodySize}px` }}
                                                        >
                                                            {entry.images && entry.images.length > 0 && (
                                                                <div className={`mb-4 ${imageLayout === 'wrap' ? 'float-left w-[45%] mr-6' : 'grid gap-4'} ${entry.images.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                                                                    {entry.images.map((img, i) => (
                                                                        <div key={i} className="break-inside-avoid">
                                                                            <img
                                                                                src={img.url}
                                                                                alt={`Attachment ${i + 1}`}
                                                                                className="w-full h-auto object-contain rounded-lg border border-gray-200 max-h-[500px]"
                                                                            />
                                                                            {img.caption && (
                                                                                <div className="text-center text-gray-500 text-sm mt-1 italic font-serif">
                                                                                    {img.caption}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                            <ReactMarkdown>{entry.content}</ReactMarkdown>
                                                        </div>
                                                        {index < entries.length - 1 && !isNewMonth(entries[index + 1]?.date, entry.date) && (
                                                            <hr className={`border-gray-200 ${compactMode ? 'my-4' : 'my-8'}`} />
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="flex items-center justify-center h-[500px] text-gray-400">
                                        No entries found for this period.
                                    </div>
                                )}

                                {/* Page Number Footer for Print */}
                                {/* Page Number Footer for Print - Removed in favor of JS injection for PDF and browser default for Print */}
                                {showPageNumbers && (
                                    <div className="hidden">
                                        {/* CSS Counters don't work well with html2pdf or across all browsers in this context */}
                                    </div>
                                )}
                            </div>
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
                        /* Ensure fixed footer works by giving body height */
                        html, body {
                            height: 100%;
                            margin: 0 !important;
                            padding: 0 !important;
                        }
                        
                        .print\\:hidden {
                            display: none !important;
                        }
                        .print\\:block {
                            display: block !important;
                        }
                        .print\\:flex {
                            display: flex !important;
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
                        img {
                            max-width: 100% !important;
                            page-break-inside: avoid;
                        }
                        /* Force page break */
                        .break-after-page {
                            break-after: page;
                            page-break-after: always;
                        }
                        .break-before-page {
                            break-before: page;
                            page-break-before: always;
                        }
                    }
                `}</style>
            </div >
        </div >
    );
}
