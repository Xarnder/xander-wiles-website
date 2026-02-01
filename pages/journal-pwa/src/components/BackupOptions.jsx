import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { collection, query, where, getDocs, documentId } from 'firebase/firestore';
import { saveAs } from 'file-saver';
import JSZip from 'jszip';
import { Download, X, FileText, Calendar, Layers, Archive, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { format, parseISO, startOfDay, endOfDay } from 'date-fns';

export default function BackupOptions() {
    const { currentUser } = useAuth();
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState(null); // { type: 'success' | 'error', message: string }

    // Backup Options State
    const [dateOption, setDateOption] = useState('all'); // all, single, range
    const [singleDate, setSingleDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-01-01'));
    const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-12-31'));

    const [grouping, setGrouping] = useState('separate'); // separate, month, year
    const [fileFormat, setFileFormat] = useState('md'); // md, json, txt

    const resetStatus = () => setStatus(null);

    const handleBackup = async () => {
        if (!currentUser) return;
        setLoading(true);
        resetStatus();

        try {
            // 1. Fetch Data
            let q;
            const entriesRef = collection(db, 'users', currentUser.uid, 'entries');

            if (dateOption === 'all') {
                q = query(entriesRef);
            } else if (dateOption === 'single') {
                q = query(entriesRef, where(documentId(), '==', singleDate));
            } else if (dateOption === 'range') {
                // Ensure correct string comparison for document IDs (ISO dates)
                q = query(entriesRef, where(documentId(), '>=', startDate), where(documentId(), '<=', endDate));
            }

            const querySnapshot = await getDocs(q);

            if (querySnapshot.empty) {
                setStatus({ type: 'error', message: 'No entries found for the selected range.' });
                setLoading(false);
                return;
            }

            const entries = [];
            querySnapshot.forEach((doc) => {
                entries.push({ id: doc.id, ...doc.data() });
            });

            // 2. Process & Generate Files
            const zip = new JSZip();
            const rootFolder = zip.folder(`journal-backup-${format(new Date(), 'yyyy-MM-dd-HHmm')}`);

            if (grouping === 'separate') {
                entries.forEach(entry => {
                    const content = formatEntryContent(entry, fileFormat);
                    const filename = `${entry.id}.${fileFormat}`;
                    rootFolder.file(filename, content);
                });
            } else if (grouping === 'month') {
                const byMonth = groupBy(entries, (e) => e.id.substring(0, 7)); // YYYY-MM
                Object.entries(byMonth).forEach(([month, monthEntries]) => {
                    const content = formatGroupedContent(monthEntries, fileFormat, `Month: ${month}`);
                    rootFolder.file(`${month}.${fileFormat}`, content);
                });
            } else if (grouping === 'year') {
                const byYear = groupBy(entries, (e) => e.id.substring(0, 4)); // YYYY
                Object.entries(byYear).forEach(([year, yearEntries]) => {
                    const content = formatGroupedContent(yearEntries, fileFormat, `Year: ${year}`);
                    rootFolder.file(`${year}.${fileFormat}`, content);
                });
            }

            // 3. Download
            // If single file (e.g., single date separate), maybe just download that file? 
            // For consistency, let's always zip if > 1 file, or if grouping is used.
            // Actually, user requested "download either a single date...". 
            // If it's a single entry and 'separate', we could download directly, but zip is safer/consistent for backups.

            const blob = await zip.generateAsync({ type: 'blob' });
            saveAs(blob, `journal-backup-${format(new Date(), 'yyyy-MM-dd')}.zip`);

            setStatus({ type: 'success', message: `Successfully backed up ${entries.length} entries!` });

            // Auto close success after delay
            setTimeout(() => {
                // setIsOpen(false); 
                // Keep open to show success message? Or maybe close.
                setStatus(null);
            }, 5000);

        } catch (error) {
            console.error("Backup failed:", error);
            setStatus({ type: 'error', message: `Backup failed: ${error.message}` });
        } finally {
            setLoading(false);
        }
    };

    // Helper: Format Content
    const formatEntryContent = (entry, fmt) => {
        const title = entry.title || entry.id;
        const body = entry.content || '';
        const date = entry.id;

        if (fmt === 'json') {
            return JSON.stringify(entry, null, 2);
        } else if (fmt === 'md') {
            return `---\ndate: ${date}\ntitle: ${title}\n---\n\n${body}`;
        } else { // txt
            return `Date: ${date}\nTitle: ${title}\n\n${body}`;
        }
    };

    const formatGroupedContent = (entries, fmt, header) => {
        if (fmt === 'json') {
            return JSON.stringify(entries, null, 2);
        }

        return entries.map(e => formatEntryContent(e, fmt)).join('\n\n' + '='.repeat(20) + '\n\n');
    };

    const groupBy = (array, keyFn) => {
        return array.reduce((result, item) => {
            const key = keyFn(item);
            (result[key] = result[key] || []).push(item);
            return result;
        }, {});
    };


    return (
        <>
            <button
                onClick={() => setIsOpen(true)}
                className="p-2 rounded-lg hover:bg-white/5 text-text-muted hover:text-primary transition-all duration-200"
                title="Backup Options"
            >
                <Download className="h-5 w-5" />
            </button>

            {isOpen && ReactDOM.createPortal(
                <div className="fixed inset-0 z-[100] flex flex-col items-center overflow-y-auto p-4 bg-black/80 backdrop-blur-md animation-fade-in">
                    <div className="glass-card w-full max-w-lg p-6 relative overflow-hidden flex flex-col max-h-[85vh] my-auto bg-[#1a1b1e]/95 shadow-2xl">
                        {/* Header */}
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-serif font-bold text-white flex items-center gap-2">
                                <Archive className="w-5 h-5 text-primary" />
                                Export & Backup
                            </h2>
                            <button
                                onClick={() => setIsOpen(false)}
                                className="p-2 rounded-full hover:bg-white/10 text-text-muted hover:text-white transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="space-y-6 overflow-y-auto custom-scrollbar pr-2 flex-1">

                            {/* Option 1: Date Range */}
                            <div className="space-y-3">
                                <label className="text-sm font-medium text-text-muted flex items-center gap-2">
                                    <Calendar className="w-4 h-4" /> Date Selection
                                </label>
                                <div className="grid grid-cols-3 gap-2">
                                    {['all', 'single', 'range'].map(opt => (
                                        <button
                                            key={opt}
                                            onClick={() => setDateOption(opt)}
                                            className={`px-3 py-2 rounded-lg text-sm transition-all border ${dateOption === opt
                                                ? 'bg-primary/20 border-primary text-white'
                                                : 'bg-white/5 border-transparent text-text-muted hover:bg-white/10'
                                                }`}
                                        >
                                            {opt.charAt(0).toUpperCase() + opt.slice(1)}
                                        </button>
                                    ))}
                                </div>

                                {dateOption === 'single' && (
                                    <div className="space-y-1">
                                        <label className="text-xs text-text-muted ml-1">Select Date</label>
                                        <input
                                            type="date"
                                            value={singleDate}
                                            onChange={(e) => setSingleDate(e.target.value)}
                                            className="w-full bg-black/60 border border-white/10 rounded-lg px-4 py-2 text-white focus:border-primary outline-none"
                                        />
                                    </div>
                                )}

                                {dateOption === 'range' && (
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-1">
                                            <label className="text-xs text-text-muted ml-1">From</label>
                                            <input
                                                type="date"
                                                value={startDate}
                                                onChange={(e) => setStartDate(e.target.value)}
                                                className="w-full bg-black/60 border border-white/10 rounded-lg px-4 py-2 text-white focus:border-primary outline-none"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-xs text-text-muted ml-1">To</label>
                                            <input
                                                type="date"
                                                value={endDate}
                                                onChange={(e) => setEndDate(e.target.value)}
                                                className="w-full bg-black/60 border border-white/10 rounded-lg px-4 py-2 text-white focus:border-primary outline-none"
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Option 2: Grouping */}
                            <div className="space-y-3">
                                <label className="text-sm font-medium text-text-muted flex items-center gap-2">
                                    <Layers className="w-4 h-4" /> Grouping
                                </label>
                                <div className="grid grid-cols-3 gap-2">
                                    {[
                                        { id: 'separate', label: 'Separate' },
                                        { id: 'month', label: 'By Month' },
                                        { id: 'year', label: 'By Year' }
                                    ].map(opt => (
                                        <button
                                            key={opt.id}
                                            onClick={() => setGrouping(opt.id)}
                                            className={`px-3 py-2 rounded-lg text-sm transition-all border ${grouping === opt.id
                                                ? 'bg-primary/20 border-primary text-white'
                                                : 'bg-white/5 border-transparent text-text-muted hover:bg-white/10'
                                                }`}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Option 3: Format */}
                            <div className="space-y-3">
                                <label className="text-sm font-medium text-text-muted flex items-center gap-2">
                                    <FileText className="w-4 h-4" /> Format
                                </label>
                                <div className="grid grid-cols-3 gap-2">
                                    {['md', 'json', 'txt'].map(fmt => (
                                        <button
                                            key={fmt}
                                            onClick={() => setFileFormat(fmt)}
                                            className={`px-3 py-2 rounded-lg text-sm uppercase transition-all border ${fileFormat === fmt
                                                ? 'bg-primary/20 border-primary text-white'
                                                : 'bg-white/5 border-transparent text-text-muted hover:bg-white/10'
                                                }`}
                                        >
                                            .{fmt}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Status Message */}
                            {status && (
                                <div className={`p-4 rounded-lg flex items-start gap-3 text-sm ${status.type === 'error' ? 'bg-red-500/10 text-red-200' : 'bg-green-500/10 text-green-200'
                                    }`}>
                                    {status.type === 'error' ? <AlertCircle className="w-5 h-5 shrink-0" /> : <CheckCircle className="w-5 h-5 shrink-0" />}
                                    <p>{status.message}</p>
                                </div>
                            )}

                        </div>

                        {/* Footer / Action */}
                        <div className="mt-6 pt-6 border-t border-white/10">
                            <button
                                onClick={handleBackup}
                                disabled={loading}
                                className="w-full py-3 rounded-lg bg-primary hover:bg-primary-dark text-white font-medium shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all"
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        Processing...
                                    </>
                                ) : (
                                    <>
                                        <Download className="w-5 h-5" />
                                        Download Backup
                                    </>
                                )}
                            </button>
                        </div>

                    </div>
                </div>,
                document.body
            )}
        </>
    );
}
