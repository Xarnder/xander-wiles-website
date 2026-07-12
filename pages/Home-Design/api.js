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
    arrayRemove,
    deleteField
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

function getRowId(row) {
    return row?.ideaId || row?.idea_id || '';
}

export function normaliseTitleKey(value) {
    return clean(value).toLowerCase();
}

function isChildRow(row) {
    return Number.parseInt(row?.level, 10) > 1 && Boolean(clean(row?.parentItem || row?.parent_item));
}

function buildIdeaUpdates(fields) {
    const updates = {};

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

    return updates;
}

export function findDescendantRows(rows, anchorRow) {
    const descendants = [];
    const seenIds = new Set();
    const queue = [{
        title: clean(anchorRow.title),
        section: clean(anchorRow.section) || 'More ideas'
    }];

    while (queue.length) {
        const { title, section } = queue.shift();

        rows.forEach((row) => {
            const rowId = getRowId(row);
            if (!rowId || seenIds.has(rowId) || rowId === getRowId(anchorRow)) return;

            const matchesParent = normaliseTitleKey(row.parentItem || row.parent_item) === normaliseTitleKey(title)
                && normaliseTitleKey(row.section) === normaliseTitleKey(section)
                && isChildRow(row);

            if (!matchesParent) return;

            seenIds.add(rowId);
            descendants.push(row);
            queue.push({
                title: clean(row.title),
                section: clean(row.section) || 'More ideas'
            });
        });
    }

    rows.forEach((row) => {
        const rowId = getRowId(row);
        if (!rowId || seenIds.has(rowId) || rowId === getRowId(anchorRow) || !isChildRow(row)) return;

        const matchesMovedParent = normaliseTitleKey(row.parentItem || row.parent_item) === normaliseTitleKey(anchorRow.title)
            && normaliseTitleKey(row.section) !== normaliseTitleKey(anchorRow.section);

        if (!matchesMovedParent) return;

        seenIds.add(rowId);
        descendants.push(row);
    });

    return descendants;
}

export function getDirectChildRows(rows, parentRow) {
    const parentTitle = normaliseTitleKey(parentRow.title);

    return rows.filter((row) => {
        if (!isChildRow(row) || getRowId(row) === getRowId(parentRow)) return false;
        return normaliseTitleKey(row.parentItem || row.parent_item) === parentTitle;
    });
}

export function isRootIdea(row) {
    return !isChildRow(row);
}

function getNextSortIndex(rows, sectionName, excludeIds = new Set()) {
    return rows
        .filter((row) => normaliseTitleKey(row.section) === normaliseTitleKey(sectionName)
            && !excludeIds.has(getRowId(row)))
        .reduce((max, row) => Math.max(max, row.sortIndex || 0), -1) + 1;
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

export async function createChildIdea(parentRow, fields) {
    return createIdea({
        section: clean(parentRow.section) || 'More ideas',
        subsection: clean(parentRow.subsection),
        level: 2,
        parentItem: clean(parentRow.title),
        title: fields.title,
        description: fields.description,
        fullText: fields.fullText || fields.full_text || fields.description
    });
}

export async function promoteIdeaToStandalone(ideaId, originalRow, parentRow = null) {
    const rows = await loadIdeasOnce();
    const parent = parentRow || rows.find((row) => (
        isRootIdea(row)
        && normaliseTitleKey(row.title) === normaliseTitleKey(originalRow.parentItem || originalRow.parent_item)
    ));

    const section = clean(parent?.section || originalRow.section) || 'More ideas';
    const subsection = clean(parent?.subsection ?? originalRow.subsection);
    const sortIndex = getNextSortIndex(rows, section, new Set([ideaId]));

    await updateDoc(doc(db, IDEAS_COLLECTION, ideaId), {
        level: 1,
        parentItem: deleteField(),
        section,
        subsection,
        sortIndex,
        updatedAt: serverTimestamp()
    });

    return { section, subsection };
}

export async function updateIdea(ideaId, fields, originalRow = null) {
    if (originalRow) {
        return updateIdeaWithDescendants(ideaId, fields, originalRow);
    }

    const updates = {
        ...buildIdeaUpdates(fields),
        updatedAt: serverTimestamp()
    };

    await updateDoc(doc(db, IDEAS_COLLECTION, ideaId), updates);
}

async function updateIdeaWithDescendants(ideaId, fields, originalRow) {
    const rows = await loadIdeasOnce();
    const anchor = {
        ideaId,
        idea_id: ideaId,
        title: clean(originalRow.title),
        section: clean(originalRow.section) || 'More ideas',
        subsection: clean(originalRow.subsection),
        level: Number.parseInt(originalRow.level, 10) || 1,
        parentItem: clean(originalRow.parentItem || originalRow.parent_item),
        sortIndex: originalRow.sortIndex
    };

    const descendants = findDescendantRows(rows, anchor);
    const parentUpdates = buildIdeaUpdates(fields);

    const nextSection = parentUpdates.section !== undefined
        ? parentUpdates.section
        : anchor.section;
    const nextSubsection = parentUpdates.subsection !== undefined
        ? parentUpdates.subsection
        : anchor.subsection;
    const nextTitle = parentUpdates.title !== undefined
        ? parentUpdates.title
        : anchor.title;

    const sectionChanged = parentUpdates.section !== undefined
        && normaliseTitleKey(nextSection) !== normaliseTitleKey(anchor.section);
    const subsectionChanged = parentUpdates.subsection !== undefined
        && normaliseTitleKey(nextSubsection) !== normaliseTitleKey(anchor.subsection);
    const titleChanged = parentUpdates.title !== undefined
        && normaliseTitleKey(nextTitle) !== normaliseTitleKey(anchor.title);

    const anchorWasChild = isChildRow(anchor);

    if (anchorWasChild && sectionChanged) {
        parentUpdates.level = 1;
        parentUpdates.parentItem = '';
    }

    if (sectionChanged) {
        const excludeIds = new Set([ideaId, ...descendants.map(getRowId)]);
        parentUpdates.sortIndex = getNextSortIndex(rows, nextSection, excludeIds);
    }

    const batch = writeBatch(db);
    const queueUpdate = (id, updates) => {
        if (!id || !Object.keys(updates).length) return;
        batch.update(doc(db, IDEAS_COLLECTION, id), {
            ...updates,
            updatedAt: serverTimestamp()
        });
    };

    queueUpdate(ideaId, parentUpdates);

    if (!anchorWasChild && descendants.length) {
        descendants.forEach((child) => {
            const childUpdates = {};
            const childSection = clean(child.section) || 'More ideas';
            const needsSectionRepair = normaliseTitleKey(childSection) !== normaliseTitleKey(nextSection);

            if (sectionChanged || needsSectionRepair) {
                childUpdates.section = nextSection;
                childUpdates.sortIndex = parentUpdates.sortIndex;
            }

            if (subsectionChanged || needsSectionRepair) {
                childUpdates.subsection = nextSubsection;
            }

            if (titleChanged && normaliseTitleKey(child.parentItem || child.parent_item) === normaliseTitleKey(anchor.title)) {
                childUpdates.parentItem = nextTitle;
            }

            queueUpdate(getRowId(child), childUpdates);
        });
    }

    await batch.commit();

    return {
        descendantCount: descendants.length,
        movedWithParent: !anchorWasChild && sectionChanged && descendants.length > 0
    };
}

export async function countDescendantRows(ideaId, rows = null) {
    const allRows = rows || await loadIdeasOnce();
    const anchor = allRows.find((row) => getRowId(row) === ideaId);
    if (!anchor) return 0;
    return findDescendantRows(allRows, anchor).length;
}

export async function deleteIdea(ideaId) {
    const rows = await loadIdeasOnce();
    const anchor = rows.find((row) => getRowId(row) === ideaId);
    const descendants = anchor ? findDescendantRows(rows, anchor) : [];

    await Promise.all([
        deleteIdeaImages(ideaId),
        ...descendants.map((child) => deleteIdeaImages(getRowId(child)))
    ]);

    const batch = writeBatch(db);
    descendants.forEach((child) => {
        batch.delete(doc(db, IDEAS_COLLECTION, getRowId(child)));
    });
    batch.delete(doc(db, IDEAS_COLLECTION, ideaId));
    await batch.commit();

    return { descendantCount: descendants.length };
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
