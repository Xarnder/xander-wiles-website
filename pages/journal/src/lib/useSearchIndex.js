import { useEffect, useRef, useState } from 'react';
import { collection, query, getDocs, getDocsFromCache, orderBy, limit, startAfter, documentId } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { loadSearchIndex, SEARCH_BATCH_SIZE } from './searchIndex';

export function useSearchIndex(enabled) {
    const { currentUser } = useAuth();
    const uid = currentUser?.uid;
    const [index, setIndex] = useState({ uid: null, status: 'idle', entries: [], message: '' });
    const indexRef = useRef(index);
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        if (!uid || !enabled) return undefined;
        let active = true;
        const controller = new AbortController();
        const entries = collection(db, 'users', uid, 'entries');
        loadSearchIndex({
            initialEntries: indexRef.current.uid === uid ? indexRef.current.entries : [],
            signal: controller.signal,
            readCache: () => getDocsFromCache(entries),
            readPage: (cursor) => getDocs(query(entries, orderBy(documentId(), 'desc'),
                ...(cursor ? [startAfter(cursor)] : []), limit(SEARCH_BATCH_SIZE))),
            isCurrent: () => active,
            onUpdate: (next) => {
                indexRef.current = { ...next, uid };
                setIndex(indexRef.current);
            }
        });
        return () => { active = false; controller.abort(); };
    }, [uid, enabled, attempt]);

    useEffect(() => {
        if (!uid || !enabled) return undefined;
        const recover = () => {
            const latest = indexRef.current;
            if (document.visibilityState === 'hidden' || latest.uid !== uid) return;
            if (latest.status === 'partial' || latest.status === 'error') setAttempt((value) => value + 1);
        };
        window.addEventListener('online', recover);
        window.addEventListener('pageshow', recover);
        document.addEventListener('visibilitychange', recover);
        return () => {
            window.removeEventListener('online', recover);
            window.removeEventListener('pageshow', recover);
            document.removeEventListener('visibilitychange', recover);
        };
    }, [uid, enabled]);

    // Do not expose another account's results, even for the render before effect cleanup.
    const visible = index.uid === uid ? index : { status: 'loading', entries: [], message: '' };
    return { ...visible, retry: () => setAttempt((value) => value + 1) };
}
