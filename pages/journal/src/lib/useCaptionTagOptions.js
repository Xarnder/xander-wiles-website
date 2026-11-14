import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { waitForServerSnapshot } from './serverSnapshot';
import { captionTagsFromSnapshot, mergeCaptionTagOptions } from '../utils/captionTagOptions';

// Only tag names are retained, separately for each account. Reopening several
// photo dialogs does not repeatedly download the journal to rediscover tags.
const catalogs = new Map();
const FRESH_FOR_MS = 5 * 60 * 1000;

export function useCaptionTagOptions(enabled) {
    const { currentUser } = useAuth();
    const uid = currentUser?.uid;
    const [state, setState] = useState({ uid, tags: catalogs.get(uid)?.tags || [], status: 'loading' });
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        if (!uid || !enabled) return undefined;
        let active = true;
        const controller = new AbortController();
        let timer;

        async function load() {
            const saved = catalogs.get(uid);
            if (saved && Date.now() - saved.loadedAt < FRESH_FOR_MS && attempt === 0) {
                setState({ uid, tags: saved.tags, status: 'ready' });
                return;
            }
            setState({ uid, tags: saved?.tags || [], status: 'loading' });
            timer = window.setTimeout(() => controller.abort(), 30000);
            try {
                const snapshot = await waitForServerSnapshot((next, error) => onSnapshot(
                    collection(db, 'users', uid, 'entries'), { includeMetadataChanges: true },
                    (snapshot) => {
                        if (!active || controller.signal.aborted) return;
                        const tags = captionTagsFromSnapshot(snapshot);
                        setState({ uid, tags: snapshot.metadata.fromCache ? mergeCaptionTagOptions(saved?.tags || [], tags) : tags,
                            status: snapshot.metadata.fromCache ? 'loading' : 'ready' });
                        next(snapshot);
                    }, error
                ), controller.signal);
                if (active) catalogs.set(uid, { tags: captionTagsFromSnapshot(snapshot), loadedAt: Date.now() });
            } catch {
                if (active) setState((previous) => ({ ...previous, status: 'error' }));
            } finally {
                window.clearTimeout(timer);
            }
        }

        load();
        return () => { active = false; window.clearTimeout(timer); controller.abort(); };
    }, [uid, enabled, attempt]);

    const remember = (tags) => {
        if (!uid) return;
        const previous = catalogs.get(uid);
        catalogs.set(uid, { tags: mergeCaptionTagOptions(previous?.tags || [], tags), loadedAt: previous?.loadedAt || 0 });
    };

    return { ...(state.uid === uid ? state : { tags: [], status: 'loading' }), remember,
        retry: () => setAttempt((value) => value + 1) };
}
