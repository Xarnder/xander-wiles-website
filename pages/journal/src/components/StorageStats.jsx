import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { HardDrive, Image as ImageIcon, FileText, Loader } from 'lucide-react';

export default function StorageStats({ variant = 'entry', entryTextSize = 0, entryImageSize = 0, className = '' }) {
    const { currentUser } = useAuth();
    const [totalSize, setTotalSize] = useState(0);
    const [loading, setLoading] = useState(true);

    // Format bytes to readable string (KB, MB)
    const formatBytes = (bytes, decimals = 2) => {
        if (!bytes) return '0 B';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    };

    useEffect(() => {
        if (variant !== 'global' || !currentUser) return;

        async function calculateGlobalStorage() {
            setLoading(true);
            try {
                const q = query(collection(db, 'users', currentUser.uid, 'entries'));
                const querySnapshot = await getDocs(q);
                let totalBytes = 0;

                querySnapshot.forEach((doc) => {
                    const data = doc.data();

                    // Add text size (New Schema -> Fallback Schema -> Estimate)
                    if (data.textSize) {
                        totalBytes += data.textSize;
                    } else if (data.contentSizeInBytes) {
                        totalBytes += data.contentSizeInBytes;
                    } else if (data.content) {
                        totalBytes += new Blob([data.content]).size;
                    }

                    // Add image size (New Schema -> Fallback Schema)
                    if (data.imageSize) {
                        totalBytes += data.imageSize;
                    } else if (data.imageMetadata && data.imageMetadata.sizeInBytes) {
                        totalBytes += data.imageMetadata.sizeInBytes;
                    }
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
            <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-serif font-bold text-white flex items-center gap-2">
                    <HardDrive className="w-5 h-5 text-secondary" />
                    Account Storage
                </h3>
            </div>

            {loading ? (
                <div className="flex items-center gap-2 text-text-muted animate-pulse">
                    <Loader className="w-4 h-4 animate-spin" />
                    <span className="text-sm">Calculating usage...</span>
                </div>
            ) : (
                <div>
                    <div className="text-3xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                        {formatBytes(totalSize)}
                    </div>
                    <p className="text-sm text-text-muted mt-1">Total space used across all entries</p>
                </div>
            )}
        </div>
    );
}
