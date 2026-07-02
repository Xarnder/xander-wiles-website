import {
    collection,
    doc,
    getDocs,
    onSnapshot,
    setDoc,
    updateDoc,
    deleteDoc,
    writeBatch,
    runTransaction,
    serverTimestamp,
    query,
    orderBy,
    arrayUnion,
    arrayRemove
} from 'https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js';
import {
    ref,
    uploadBytes,
    getDownloadURL,
    deleteObject,
    listAll
} from 'https://www.gstatic.com/firebasejs/12.9.0/firebase-storage.js';
import { db, storage } from './firebase-config.js';

const IDEAS_COLLECTION = 'ideas';

function clean(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
}

export function docToRow(data, id) {
    const ideaId = clean(data.ideaId || id);
    const images = Array.isArray(data.images)
        ? data.images.map(clean).filter(Boolean)
        : clean(data.images).split('|').map(clean).filter(Boolean);

    return {
        idea_id: ideaId,
        section: clean(data.section) || 'More ideas',
        subsection: clean(data.subsection),
        level: Number.parseInt(data.level, 10) || 1,
        parent_item: clean(data.parentItem || data.parent_item),
        title: clean(data.title),
        description: clean(data.description),
        full_text: clean(data.fullText || data.full_text),
        images: images.join('|'),
        sortIndex: Number.isFinite(data.sortIndex) ? data.sortIndex : 0
    };
}

export function rowToFirestore(row) {
    const images = clean(row.images)
        .split('|')
        .map(clean)
        .filter(Boolean);

    return {
        ideaId: row.ideaId || row.idea_id,
        section: clean(row.section) || 'More ideas',
        subsection: clean(row.subsection),
        level: Number.parseInt(row.level, 10) || 1,
        parentItem: clean(row.parentItem || row.parent_item),
        title: clean(row.title),
        description: clean(row.description),
        fullText: clean(row.fullText || row.full_text),
        images,
        sortIndex: Number.isFinite(row.sortIndex) ? row.sortIndex : 0,
        updatedAt: serverTimestamp()
    };
}

function sortRows(rows) {
    return [...rows].sort((a, b) => {
        const sectionCmp = clean(a.section).localeCompare(clean(b.section));
        if (sectionCmp !== 0) return sectionCmp;
        return (a.sortIndex || 0) - (b.sortIndex || 0);
    });
}

let unsubscribeIdeas = null;

export function subscribeIdeas(onRows) {
    if (unsubscribeIdeas) unsubscribeIdeas();

    const ideasQuery = query(collection(db, IDEAS_COLLECTION), orderBy('sortIndex', 'asc'));

    unsubscribeIdeas = onSnapshot(
        ideasQuery,
        (snapshot) => {
            const rows = sortRows(
                snapshot.docs.map((snap) => docToRow(snap.data(), snap.id))
            );
            onRows(rows, null);
        },
        (error) => {
            console.error('[AtHome] Firestore subscription failed', error);
            onRows([], error);
        }
    );

    return unsubscribeIdeas;
}

export async function loadIdeasOnce() {
    const ideasQuery = query(collection(db, IDEAS_COLLECTION), orderBy('sortIndex', 'asc'));
    const snapshot = await getDocs(ideasQuery);
    return sortRows(snapshot.docs.map((snap) => docToRow(snap.data(), snap.id)));
}

async function getNextIdeaId() {
    const counterRef = doc(db, 'meta', 'counters');

    return runTransaction(db, async (transaction) => {
        const counterSnap = await transaction.get(counterRef);
        const last = counterSnap.exists() ? Number(counterSnap.data().lastIdeaNumber) || 0 : 0;
        const next = last + 1;
        transaction.set(counterRef, { lastIdeaNumber: next }, { merge: true });
        return `idea-${String(next).padStart(4, '0')}`;
    });
}

export async function createIdea(fields) {
    const ideaId = await getNextIdeaId();
    const sectionRows = await loadIdeasOnce();
    const section = clean(fields.section) || 'More ideas';
    const maxSort = sectionRows
        .filter((row) => clean(row.section) === section)
        .reduce((max, row) => Math.max(max, row.sortIndex || 0), -1);

    const payload = {
        ideaId,
        section,
        subsection: clean(fields.subsection),
        level: Number.parseInt(fields.level, 10) || 1,
        parentItem: clean(fields.parentItem || fields.parent_item),
        title: clean(fields.title),
        description: clean(fields.description),
        fullText: clean(fields.fullText || fields.full_text || fields.description),
        images: [],
        sortIndex: maxSort + 1,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    };

    await setDoc(doc(db, IDEAS_COLLECTION, ideaId), payload);
    return ideaId;
}

export async function updateIdea(ideaId, fields) {
    const updates = {
        updatedAt: serverTimestamp()
    };

    if (fields.section !== undefined) updates.section = clean(fields.section) || 'More ideas';
    if (fields.subsection !== undefined) updates.subsection = clean(fields.subsection);
    if (fields.level !== undefined) updates.level = Number.parseInt(fields.level, 10) || 1;
    if (fields.parentItem !== undefined || fields.parent_item !== undefined) {
        updates.parentItem = clean(fields.parentItem || fields.parent_item);
    }
    if (fields.title !== undefined) updates.title = clean(fields.title);
    if (fields.description !== undefined) updates.description = clean(fields.description);
    if (fields.fullText !== undefined || fields.full_text !== undefined) {
        updates.fullText = clean(fields.fullText || fields.full_text);
    }
    if (fields.sortIndex !== undefined) updates.sortIndex = fields.sortIndex;
    if (fields.images !== undefined) {
        updates.images = clean(fields.images)
            .split('|')
            .map(clean)
            .filter(Boolean);
    }

    await updateDoc(doc(db, IDEAS_COLLECTION, ideaId), updates);
}

export async function deleteIdea(ideaId) {
    await deleteIdeaImages(ideaId);
    await deleteDoc(doc(db, IDEAS_COLLECTION, ideaId));
}

export async function deleteIdeaImages(ideaId) {
    const folderRef = ref(storage, `ideas/${ideaId}`);
    try {
        const listing = await listAll(folderRef);
        await Promise.all(listing.items.map((item) => deleteObject(item)));
    } catch (error) {
        if (error?.code !== 'storage/object-not-found') {
            console.warn('[AtHome] Could not delete storage folder', error);
        }
    }
}

export async function reorderIdeas(orderedIds) {
    const batch = writeBatch(db);
    orderedIds.forEach((ideaId, index) => {
        batch.update(doc(db, IDEAS_COLLECTION, ideaId), {
            sortIndex: index,
            updatedAt: serverTimestamp()
        });
    });
    await batch.commit();
}

export async function uploadIdeaImage(ideaId, blob, fileName) {
    const safeName = clean(fileName).replace(/[^a-zA-Z0-9._-]/g, '-') || 'image.webp';
    const storageRef = ref(storage, `ideas/${ideaId}/${safeName}`);
    await uploadBytes(storageRef, blob, { contentType: blob.type || 'image/webp' });
    const url = await getDownloadURL(storageRef);
    await updateDoc(doc(db, IDEAS_COLLECTION, ideaId), {
        images: arrayUnion(url),
        updatedAt: serverTimestamp()
    });
    return { url, path: `ideas/${ideaId}/${safeName}` };
}

function storageRefFromUrl(imageUrl) {
    if (!imageUrl) return null;
    try {
        return ref(storage, imageUrl);
    } catch {
        return null;
    }
}

export async function removeIdeaImage(ideaId, imageUrl) {
    await updateDoc(doc(db, IDEAS_COLLECTION, ideaId), {
        images: arrayRemove(imageUrl),
        updatedAt: serverTimestamp()
    });

    try {
        const storageRef = storageRefFromUrl(imageUrl);
        if (storageRef) await deleteObject(storageRef);
    } catch (error) {
        console.warn('[AtHome] Could not delete storage object', error);
    }
}

export function extractStoragePath(imageUrl) {
    const storageRef = storageRefFromUrl(imageUrl);
    return storageRef?.fullPath || '';
}
