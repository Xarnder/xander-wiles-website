import { useEffect, useRef, useState } from 'react';
import { collection, query, onSnapshot, getDocsFromCache, orderBy, limit, startAfter, documentId } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { loadSearchIndex, SEARCH_BATCH_SIZE } from './searchIndex';
import { waitForServerSnapshot } from './serverSnapshot';

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
            readPage: (cursor, signal) => waitForServerSnapshot((next, error) => onSnapshot(
                query(entries, orderBy(documentId(), 'desc'),
                    ...(cursor ? [startAfter(cursor)] : []), limit(SEARCH_BATCH_SIZE)),
                { includeMetadataChanges: true }, next, error
            ), signal),
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
        let recoveryTimer;
        const recover = () => {
            clearTimeout(recoveryTimer);
            if (document.visibilityState === 'hidden') return;
            // iOS can resume a suspended request before its old timeout fires.
            // Coalesce pageshow/visibility/online into one fresh attempt.
            recoveryTimer = setTimeout(() => {
                const latest = indexRef.current;
                if (document.visibilityState !== 'hidden' && latest.uid === uid && ['loading', 'partial', 'error'].includes(latest.status)) {
                    setAttempt((value) => value + 1);
                }
            }, 100);
        };
        const onPageShow = (event) => {
            // The initial pageshow is not a resume and may arrive mid-download.
            if (event.persisted) recover();
        };
        window.addEventListener('online', recover);
        window.addEventListener('pageshow', onPageShow);
        document.addEventListener('visibilitychange', recover);
        return () => {
            clearTimeout(recoveryTimer);
            window.removeEventListener('online', recover);
            window.removeEventListener('pageshow', onPageShow);
            document.removeEventListener('visibilitychange', recover);
        };
    }, [uid, enabled]);

    // Do not expose another account's results, even for the render before effect cleanup.
    const visible = index.uid === uid ? index : { status: 'loading', entries: [], message: '' };
    return { ...visible, retry: () => setAttempt((value) => value + 1) };
}
