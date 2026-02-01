import React, { useState } from 'react';
import { Upload, FolderInput, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { collection, doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { correctCommonTypos, parseJournalEntries } from '../utils/journalParser';

export default function DirectoryImporter() {
    const { currentUser } = useAuth();
    const [isImporting, setIsImporting] = useState(false);
    const [status, setStatus] = useState('idle'); // idle, scanning, parsing, uploading, success, error
    const [stats, setStats] = useState({ filesScanned: 0, entriesFound: 0, entriesUploaded: 0 });
    const [errorMessage, setErrorMessage] = useState('');

    const handleImportClick = async () => {
        if (!window.showDirectoryPicker) {
            setErrorMessage("Your browser does not support directory import. Please use Chrome, Edge, or Opera.");
            return;
        }

        if (!window.confirm("WARNING: This will overwrite any existing entries with the same date. Do you want to continue?")) {
            return;
        }

        try {
            setErrorMessage('');
            setStatus('scanning');
            setStats({ filesScanned: 0, entriesFound: 0, entriesUploaded: 0 });
            setIsImporting(true);

            const dirHandle = await window.showDirectoryPicker();
            const mdFiles = [];

            // Recursive scanner
            async function scanDir(handle) {
                for await (const entry of handle.values()) {
                    if (entry.kind === 'file') {
                        if (entry.name.endsWith('.md')) {
                            mdFiles.push(entry);
                        }
                    } else if (entry.kind === 'directory') {
                        await scanDir(entry);
                    }
                }
            }

            await scanDir(dirHandle);
            setStatus('parsing');
            setStats(prev => ({ ...prev, filesScanned: mdFiles.length }));

            const allEntries = [];

            for (const fileHandle of mdFiles) {
                const file = await fileHandle.getFile();
                const text = await file.text();
                const correctedText = correctCommonTypos(text);
                const entries = parseJournalEntries(correctedText, file.name);

                if (entries && entries.length > 0) {
                    allEntries.push(...entries);
                }
            }

            setStats(prev => ({ ...prev, entriesFound: allEntries.length }));

            if (allEntries.length === 0) {
                setStatus('error');
                setErrorMessage('No valid journal entries found in the selected directory.');
                setIsImporting(false);
                return;
            }

            setStatus('uploading');
            await uploadEntriesToFirestore(allEntries);

            setStatus('success');
            setTimeout(() => {
                setIsImporting(false);
                setStatus('idle');
            }, 5000);

        } catch (error) {
            console.error(error);
            if (error.name === 'AbortError') {
                setIsImporting(false);
                setStatus('idle');
                return;
            }
            setStatus('error');
            setErrorMessage('An error occurred: ' + error.message);
        }
    };

    const uploadEntriesToFirestore = async (entries) => {
        if (!currentUser) {
            console.error("DirectoryImporter: No current user logged in.");
            setErrorMessage("You must be logged in to import entries.");
            return;
        }

        console.log(`DirectoryImporter: Starting upload for user ${currentUser.uid} (${currentUser.email}). entries: ${entries.length}`);

        // Batch writes (limit 500)
        const batchSize = 400; // Safe margin
        const chunks = [];
        for (let i = 0; i < entries.length; i += batchSize) {
            chunks.push(entries.slice(i, i + batchSize));
        }

        let uploadedCount = 0;

        try {
            for (const chunk of chunks) {
                const batch = writeBatch(db);

                chunk.forEach(entry => {
                    const docRef = doc(db, 'users', currentUser.uid, 'entries', entry.date);
                    batch.set(docRef, {
                        date: entry.dateObj, // Firestore Timestamp from JS Date
                        title: entry.title,
                        content: entry.text, // Saving full text block as in original script
                        // Clean content without title header if preferred, but keeping logic compatible
                        userId: currentUser.uid,
                        sourceFile: entry.sourceFile,
                        updatedAt: serverTimestamp()
                    });
                });

                await batch.commit();
                uploadedCount += chunk.length;
                console.log(`DirectoryImporter: Successfully uploaded batch of ${chunk.length} entries.`);
                setStats(prev => ({ ...prev, entriesUploaded: uploadedCount }));
            }
            console.log("DirectoryImporter: Upload complete.");
        } catch (error) {
            console.error("DirectoryImporter: Error uploading entries:", error);
            if (error.code === 'permission-denied') {
                console.error("Firebase Permission Denied. Please checks your Firestore Security Rules.");
                setErrorMessage("Permission denied. Check Firestore Console Rules.");
            } else {
                setErrorMessage(`Upload failed: ${error.message}`);
            }
            throw error; // Re-throw to be caught by handleImportClick
        }
    };

    return (
        <div className="flex items-center">
            {isImporting ? (
                <div className="flex items-center space-x-3 px-3 py-2 bg-surface border border-border rounded-md text-sm">
                    {status === 'success' ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : status === 'error' ? (
                        <AlertCircle className="h-4 w-4 text-red-500" />
                    ) : (
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    )}

                    <div className="flex flex-col">
                        <span className="font-medium">
                            {status === 'scanning' && `Scanning... (${stats.filesScanned} files)`}
                            {status === 'parsing' && `Parsing... (${stats.entriesFound} entries)`}
                            {status === 'uploading' && `Uploading... (${stats.entriesUploaded}/${stats.entriesFound})`}
                            {status === 'success' && 'Import Complete!'}
                            {status === 'error' && 'Import Failed'}
                        </span>
                    </div>
                </div>
            ) : (
                <button
                    onClick={handleImportClick}
                    className="flex items-center px-3 py-2 rounded-md text-sm font-medium text-text-muted hover:text-white hover:bg-white/5 transition"
                    title="Import Folder"
                >
                    <FolderInput className="h-4 w-4 mr-2" />
                    Import
                </button>
            )}

            {errorMessage && !isImporting && (
                <div className="fixed bottom-4 right-4 bg-red-900 border border-red-700 text-white p-4 rounded-md shadow-lg z-50">
                    <p>{errorMessage}</p>
                    <button onClick={() => setErrorMessage('')} className="absolute top-1 right-2 text-xs opacity-70 hover:opacity-100">X</button>
                </div>
            )}
        </div>
    );
}
