import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { collection, getDocs, doc, writeBatch } from 'firebase/firestore';
import { format, parse } from 'date-fns';
import { Wrench } from 'lucide-react';
import { useToast } from '../context/ToastContext';

export default function DataRepair() {
    const { currentUser } = useAuth();
    const { success, error: toastError, info } = useToast();
    const [scanning, setScanning] = useState(false);
    const [status, setStatus] = useState('');

    // Helper to parse "Tuesday 1st April 2025"
    // Handles suffixes st, nd, rd, th
    function parseContentDate(dateStr) {
        try {
            // Remove day name logic if present, usually format is "Day 1st Month Year"
            // Clean ordinal suffixes: 1st -> 1, 2nd -> 2, etc.
            // Regex to match number followed by st, nd, rd, th
            const cleanDateStr = dateStr.replace(/(\d+)(st|nd|rd|th)/, '$1');

            // Expected format now: "Tuesday 1 April 2025" or "1 April 2025"
            // We can try multiple formats
            // But usually the header is "Tuesday 1st April 2025"

            // Let's split by " - " just in case (though caller should have done it)
            // But dateStr passed here is just the date part.

            // Try parsing with date-fns
            // Format: EEEE d MMMM yyyy

            const parsed = parse(cleanDateStr, 'EEEE d MMMM yyyy', new Date());
            if (isNaN(parsed)) {
                // Try fallback without day name
                return parse(cleanDateStr, 'd MMMM yyyy', new Date());
            }
            return parsed;
        } catch (e) {
            console.warn("Date parse error for:", dateStr, e);
            return null;
        }
    }

    async function handleScanAndFix() {
        if (!currentUser) return;
        if (!window.confirm("This will scan all entries and move them if the date in the content does not match the file date. Proceed?")) return;

        setScanning(true);
        setStatus('Fetching entries...');

        try {
            const entriesRef = collection(db, 'users', currentUser.uid, 'entries');
            const snapshot = await getDocs(entriesRef);

            let processed = 0;
            const total = snapshot.size;
            const existingIds = new Set(snapshot.docs.map((entryDoc) => entryDoc.id));
            const claimedTargets = new Set();
            const fixes = [];
            let collisionCount = 0;

            for (const docSnap of snapshot.docs) {
                processed++;
                setStatus(`Scanning ${processed}/${total}...`);

                const data = docSnap.data();
                const content = data.content || '';
                const currentId = docSnap.id; // YYYY-MM-DD

                // Parse header
                const match = content.match(/(?:\*\*)?\+\+(.*?)\+\+(?:\*\*)?/);
                if (match && match[1]) {
                    const fullHeader = match[1];
                    const parts = fullHeader.split(' - ');
                    if (parts.length > 0) {
                        const rawDateStr = parts[0].trim();
                        const actualDateObj = parseContentDate(rawDateStr);

                        if (actualDateObj && !isNaN(actualDateObj)) {
                            const actualDateId = format(actualDateObj, 'yyyy-MM-dd');

                            if (actualDateId !== currentId) {
                                if (existingIds.has(actualDateId) || claimedTargets.has(actualDateId)) {
                                    collisionCount++;
                                    continue;
                                }

                                claimedTargets.add(actualDateId);
                                fixes.push({ currentId, actualDateId, actualDateObj, data });
                            }
                        }
                    }
                }
            }

            if (fixes.length > 0) {
                const movesPerBatch = 200;
                let committed = 0;

                for (let i = 0; i < fixes.length; i += movesPerBatch) {
                    const batch = writeBatch(db);
                    const chunk = fixes.slice(i, i + movesPerBatch);

                    chunk.forEach(({ currentId, actualDateId, actualDateObj, data }) => {
                        const newDocRef = doc(db, 'users', currentUser.uid, 'entries', actualDateId);
                        const oldDocRef = doc(db, 'users', currentUser.uid, 'entries', currentId);
                        batch.set(newDocRef, { ...data, date: actualDateObj });
                        batch.delete(oldDocRef);
                    });

                    setStatus(`Committing ${Math.min(i + chunk.length, fixes.length)}/${fixes.length} fixes...`);
                    await batch.commit();
                    committed += chunk.length;
                }

                success(`Repaired ${committed} ${committed === 1 ? 'entry' : 'entries'}.`);
                if (collisionCount > 0) {
                    info(`Skipped ${collisionCount} date ${collisionCount === 1 ? 'collision' : 'collisions'} to protect existing entries.`);
                }
            } else {
                if (collisionCount > 0) {
                    info(`No entries moved; ${collisionCount} date ${collisionCount === 1 ? 'collision needs' : 'collisions need'} manual review.`);
                } else {
                    info('No date mismatches found.');
                }
            }

        } catch (error) {
            console.error("Repair failed:", error);
            toastError('Date repair failed. No uncommitted changes were applied.');
        } finally {
            setScanning(false);
            setStatus('');
        }
    }

    return (
        <button
            onClick={handleScanAndFix}
            disabled={scanning}
            className="p-2 rounded-full hover:bg-white/5 text-text-muted hover:text-primary transition"
            title="Repair Dates"
            aria-label={scanning ? status || 'Repairing entry dates' : 'Repair entry dates'}
        >
            <Wrench className={`h-5 w-5 ${scanning ? 'animate-spin' : ''}`} />
        </button>
    );
}
