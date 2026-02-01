import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { collection, getDocs, doc, writeBatch } from 'firebase/firestore';
import { format, parse } from 'date-fns';
import { Wrench } from 'lucide-react';

export default function DataRepair() {
    const { currentUser } = useAuth();
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

            const batch = writeBatch(db);
            let fixCount = 0;
            let processed = 0;
            const total = snapshot.size;

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
                                console.log(`Mismatch found! Content: ${rawDateStr} (${actualDateId}) vs Storage: ${currentId}`);

                                // New Doc Ref
                                const newDocRef = doc(db, 'users', currentUser.uid, 'entries', actualDateId);

                                // Copy data to new doc
                                batch.set(newDocRef, {
                                    ...data,
                                    date: actualDateObj, // Update stored date object too
                                });

                                // Delete old doc
                                const oldDocRef = doc(db, 'users', currentUser.uid, 'entries', currentId);
                                batch.delete(oldDocRef);

                                fixCount++;
                            }
                        }
                    }
                }
            }

            if (fixCount > 0) {
                setStatus(`Committing ${fixCount} fixes...`);
                await batch.commit();
                alert(`Success! Fixed ${fixCount} entries. The page will now reload to update the calendar.`);
                window.location.reload();
            } else {
                alert("No date mismatches found.");
            }

        } catch (error) {
            console.error("Repair failed:", error);
            alert("An error occurred during repair. Check console.");
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
        >
            <Wrench className={`h-5 w-5 ${scanning ? 'animate-spin' : ''}`} />
        </button>
    );
}
