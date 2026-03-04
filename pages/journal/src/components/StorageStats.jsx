import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { HardDrive, Image as ImageIcon, FileText, Loader } from 'lucide-react';

export default function StorageStats({ variant = 'entry', entryTextSize = 0, entryImageSize = 0, entries = [], timeFrameLabel = '', className = '' }) {
    const { currentUser } = useAuth();
    const [totalSize, setTotalSize] = useState(0);
    const [loading, setLoading] = useState(true);

    // 5GB Maximum Storage Allowance
    const MAX_STORAGE_BYTES = 5 * 1024 * 1024 * 1024;
    const maxStorageFormatted = '5 GB';

    // Format bytes to readable string (KB, MB)
    const formatBytes = (bytes, decimals = 2) => {
        if (!bytes) return '0 B';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    };

    // Helper to calculate size for a single entry
    const calculateEntrySize = (data) => {
        let size = 0;
        // Text size
        if (data.textSize) {
            size += data.textSize;
        } else if (data.contentSizeInBytes) {
            size += data.contentSizeInBytes;
        } else if (data.content) {
            size += new Blob([data.content]).size;
        }

        // Image size
        if (data.imageSize) {
            size += data.imageSize;
        } else if (data.imageMetadata && data.imageMetadata.sizeInBytes) {
            size += data.imageMetadata.sizeInBytes;
        }
        return size;
    };

    // Calculate stats for filtered entries (props)
    const filteredStats = useMemo(() => {
        if (!entries || entries.length === 0) return { size: 0, images: 0 };

        let size = 0;
        let images = 0;

        entries.forEach(entry => {
            size += calculateEntrySize(entry);
            if (entry.images && entry.images.length > 0) {
                images += entry.images.length;
            } else if (entry.imageUrl || entry.image) {
                images += 1;
            }
        });

        return { size, images };
    }, [entries]);

    useEffect(() => {
        if (variant !== 'global' || !currentUser) return;

        async function calculateGlobalStorage() {
            setLoading(true);
            try {
                const q = query(collection(db, 'users', currentUser.uid, 'entries'));
                const querySnapshot = await getDocs(q);
                let totalBytes = 0;

                querySnapshot.forEach((doc) => {
                    totalBytes += calculateEntrySize(doc.data());
                });

                setTotalSize(totalBytes);
            } catch (error) {
                console.error("Error calculating storage:", error);
            } finally {
                setLoading(false);
            }
        }

        calculateGlobalStorage();
    }, [variant, currentUser]);

    if (variant === 'entry') {
        const totalEntrySize = (entryTextSize || 0) + (entryImageSize || 0);

        // Don't show if empty
        if (totalEntrySize === 0) return null;

        return (
            <div className={`mt-6 flex justify-end ${className}`}>
                <div className="group relative">
                    <div className="glass-button px-3 py-1.5 text-xs flex items-center gap-2 cursor-help hover:bg-white/10 transition-colors rounded-full border border-white/10">
                        <HardDrive className="w-3 h-3 text-secondary" />
                        <span className="text-text-muted">Storage:</span>
                        <span className="font-mono text-white font-medium">{formatBytes(totalEntrySize)}</span>
                    </div>

                    {/* Hover Tooltip / Popover */}
                    <div className="absolute bottom-full right-0 mb-2 w-48 p-3 rounded-lg bg-[#1a1b1e] border border-white/10 shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 transform translate-y-2 group-hover:translate-y-0">
                        <div className="text-xs font-bold text-text-muted mb-2 uppercase tracking-wider border-b border-white/5 pb-1">Breakdown</div>
                        <div className="space-y-2">
                            <div className="flex justify-between items-center">
                                <span className="text-xs text-text-muted flex items-center gap-1">
                                    <FileText className="w-3 h-3" /> Text
                                </span>
                                <span className="text-xs font-mono text-white">{formatBytes(entryTextSize)}</span>
                            </div>
                            {entryImageSize > 0 && (
                                <div className="flex justify-between items-center">
                                    <span className="text-xs text-text-muted flex items-center gap-1">
                                        <ImageIcon className="w-3 h-3" /> Image
                                    </span>
                                    <span className="text-xs font-mono text-white">{formatBytes(entryImageSize)}</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Global Variant
    return (
        <div className={`glass-card p-6 ${className}`}>
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-serif font-bold text-white flex items-center gap-2">
                    <HardDrive className="w-5 h-5 text-secondary" />
                    Storage Stats
                </h3>
            </div>

            {loading ? (
                <div className="flex items-center gap-2 text-text-muted animate-pulse">
                    <Loader className="w-4 h-4 animate-spin" />
                    <span className="text-sm">Calculating usage...</span>
                </div>
            ) : (
                <div className="space-y-6">
                    {/* Filtered Stats (if available) */}
                    {entries && entries.length > 0 && (
                        <div className="pb-4 border-b border-white/10">
                            <div className="text-xs font-bold text-text-muted uppercase tracking-wider mb-3">
                                {timeFrameLabel || 'Selected Range'}
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <div className="text-2xl font-bold text-white">
                                        {formatBytes(filteredStats.size)}
                                    </div>
                                    <div className="text-xs text-text-muted mt-1">Used</div>
                                </div>
                                <div>
                                    <div className="text-2xl font-bold text-white flex items-center justify-center gap-1">
                                        {filteredStats.images} <ImageIcon className="w-4 h-4 text-text-muted" />
                                    </div>
                                    <div className="text-xs text-text-muted mt-1">Images</div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Global Total w/ limit check */}
                    <div>
                        <div className="flex justify-between items-end mb-2">
                            <div className="text-xs font-bold text-text-muted uppercase tracking-wider">
                                Total Account Usage
                            </div>
                            <div className="text-xs font-mono text-primary/80">
                                {((totalSize / MAX_STORAGE_BYTES) * 100).toFixed(2)}%
                            </div>
                        </div>

                        <div className="flex items-baseline gap-2 mb-3">
                            <div className="text-3xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                                {formatBytes(totalSize)}
                            </div>
                            <div className="text-sm text-text-muted font-medium">
                                / {maxStorageFormatted}
                            </div>
                        </div>

                        {/* Progress Bar */}
                        <div className="w-full h-2.5 bg-white/10 rounded-full overflow-hidden shadow-inner">
                            <div
                                className={`h-full rounded-full transition-all duration-1000 ${(totalSize / MAX_STORAGE_BYTES) > 0.9
                                        ? 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]'
                                        : (totalSize / MAX_STORAGE_BYTES) > 0.75
                                            ? 'bg-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.5)]'
                                            : 'bg-primary shadow-[0_0_10px_rgba(139,92,246,0.5)]'
                                    }`}
                                style={{ width: `${Math.min((totalSize / MAX_STORAGE_BYTES) * 100, 100)}%` }}
                            />
                        </div>

                        <p className="text-xs text-text-muted mt-3">Total space consumed by text and images across all entries</p>
                    </div>
                </div>
            )}
        </div>
    );
}
