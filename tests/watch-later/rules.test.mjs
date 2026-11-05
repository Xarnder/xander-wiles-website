import { readFile } from 'node:fs/promises';
import { after, before, beforeEach, test } from 'node:test';
import {
    initializeTestEnvironment,
    assertFails,
    assertSucceeds,
} from '@firebase/rules-unit-testing';
import {
    collection,
    doc,
    setDoc,
    getDoc,
    getDocs,
    query,
    where,
    updateDoc,
    deleteDoc,
    serverTimestamp,
    Timestamp,
    writeBatch,
} from 'firebase/firestore';
let env;
const owner = () =>
    env
        .authenticatedContext('owner', {
            email: 'xanderwiles@gmail.com',
            email_verified: true,
        })
        .firestore();
const visitor = () =>
    env
        .authenticatedContext('visitor', {
            email: 'visitor@example.com',
            email_verified: true,
        })
        .firestore();
const guest = () => env.unauthenticatedContext().firestore();
const pick = () => ({
    title: 'Test pick',
    type: 'movie',
    tier: 'S',
    note: 'A recommendation',
    genre: 'Drama',
    year: '2020',
    rank: 0,
    imageUrl: '',
    trailerUrl: '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
});
before(async () => {
    env = await initializeTestEnvironment({
        projectId: 'demo-watch-later',
        firestore: {
            host: '127.0.0.1',
            port: 8187,
            rules: await readFile(
                new URL(
                    '../../pages/Watch-Later/firestore.rules',
                    import.meta.url,
                ),
                'utf8',
            ),
        },
    });
});
beforeEach(async () => {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        for (const name of ['watches', 'tiers', 'people'])
            await setDoc(doc(db, name, 'private'), {
                uid: 'owner',
                name: 'Private',
                tier: 'private-tier',
            });
        await setDoc(doc(db, 'publicRecommendations', 'pick'), {
            ...pick(),
            createdAt: Timestamp.fromMillis(1000),
            updatedAt: Timestamp.fromMillis(1000),
        });
    });
});
after(async () => env?.cleanup());
test('anonymous visitors can list and read public recommendations', async () => {
    await assertSucceeds(getDocs(collection(guest(), 'publicRecommendations')));
    await assertSucceeds(getDoc(doc(guest(), 'publicRecommendations', 'pick')));
});
test('guests and other signed-in users cannot read or mutate any private collection', async () => {
    for (const db of [guest(), visitor()])
        for (const name of ['watches', 'tiers', 'people']) {
            await assertFails(getDoc(doc(db, name, 'private')));
            await assertFails(
                getDocs(
                    query(collection(db, name), where('uid', '==', 'owner')),
                ),
            );
            await assertFails(
                updateDoc(doc(db, name, 'private'), { name: 'Changed' }),
            );
            await assertFails(deleteDoc(doc(db, name, 'private')));
            await assertFails(setDoc(doc(db, name, 'new'), { uid: 'owner' }));
        }
});
test('private list ownership remains usable and immutable', async () => {
    const db = owner();
    for (const name of ['watches', 'tiers', 'people']) {
        await assertSucceeds(
            getDocs(query(collection(db, name), where('uid', '==', 'owner'))),
        );
        await assertSucceeds(
            setDoc(doc(db, name, 'new'), { uid: 'owner', name: 'New' }),
        );
        await assertSucceeds(
            updateDoc(doc(db, name, 'new'), { name: 'Edited' }),
        );
        await assertFails(updateDoc(doc(db, name, 'new'), { uid: 'visitor' }));
        await assertSucceeds(deleteDoc(doc(db, name, 'new')));
    }
    await assertSucceeds(
        getDocs(
            query(
                collection(db, 'watches'),
                where('uid', '==', 'owner'),
                where('tier', '==', 'private-tier'),
            ),
        ),
    );
});
test('only exact verified owner can create, edit or remove public picks', async () => {
    const denied = [
        guest(),
        visitor(),
        env
            .authenticatedContext('unverified', {
                email: 'xanderwiles@gmail.com',
                email_verified: false,
            })
            .firestore(),
        env
            .authenticatedContext('similar', {
                email: 'xander.wiles@gmail.com',
                email_verified: true,
            })
            .firestore(),
    ];
    for (const db of denied) {
        await assertFails(
            setDoc(doc(db, 'publicRecommendations', 'new'), pick()),
        );
        await assertFails(
            updateDoc(doc(db, 'publicRecommendations', 'pick'), {
                tier: 'A',
                updatedAt: serverTimestamp(),
            }),
        );
        await assertFails(deleteDoc(doc(db, 'publicRecommendations', 'pick')));
    }
    const db = owner();
    await assertSucceeds(
        setDoc(doc(db, 'publicRecommendations', 'new'), pick()),
    );
    await assertSucceeds(
        updateDoc(doc(db, 'publicRecommendations', 'new'), {
            tier: 'A',
            updatedAt: serverTimestamp(),
        }),
    );
    await assertSucceeds(deleteDoc(doc(db, 'publicRecommendations', 'new')));
});
test('schema rejects private fields, unsafe links, invalid tiers and timestamp changes', async () => {
    const db = owner();
    for (const change of [
        { uid: 'owner' },
        { watchWith: 'Private person' },
        { watched: true },
        { tier: 'private-tier' },
        { type: 'person' },
        { rank: -1 },
        { rank: 1.5 },
        { year: '26' },
        { title: '' },
        { note: 'x'.repeat(1001) },
        { imageUrl: 'javascript:alert(1)' },
        { trailerUrl: 'https://evil.example/' },
        { createdAt: Timestamp.fromMillis(1000) },
        { updatedAt: Timestamp.fromMillis(1000) },
    ]) {
        await assertFails(
            setDoc(doc(db, 'publicRecommendations', 'invalid'), {
                ...pick(),
                ...change,
            }),
        );
    }
    await assertFails(
        updateDoc(doc(db, 'publicRecommendations', 'pick'), {
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        }),
    );
    await assertFails(
        setDoc(doc(db, 'unrecognized', 'record'), { uid: 'owner' }),
    );
});
