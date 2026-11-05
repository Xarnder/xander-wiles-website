import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import * as model from '../../pages/Watch-Later/recommendations-model.mjs';
const root = new URL('../../pages/Watch-Later/', import.meta.url);
const source = await readFile(new URL('recommendations.js', root), 'utf8');
const html = await readFile(new URL('recommendations.html', root), 'utf8');
const tick = () => new Promise((resolve) => setImmediate(resolve));
const sample = (id, title, type = 'movie', tier = 'S') => ({
    id,
    title,
    type,
    tier,
    rank: 0,
    note: 'A good story',
    genre: 'Drama',
    year: '2020',
    imageUrl: '',
    trailerUrl: '',
});
async function setup(initialUser = null) {
    const dom = new JSDOM(html, {
        url: 'http://localhost/recommendations.html',
        runScripts: 'outside-only',
    });
    const w = dom.window,
        writes = [],
        reads = [];
    let authChange,
        snapshot,
        snapshotError,
        records = [],
        failWrite = false;
    w.HTMLDialogElement.prototype.showModal = function () {
        this.open = true;
    };
    w.HTMLDialogElement.prototype.close = function () {
        this.open = false;
    };
    const context = dom.getInternalVMContext();
    const snap = () => ({
        docs: records.map((record) => ({ id: record.id, data: () => record })),
    });
    const auth = {
        getAuth: () => ({}),
        GoogleAuthProvider: class {
            setCustomParameters() {}
        },
        setPersistence: async () => {},
        browserLocalPersistence: {},
        getRedirectResult: async () => {},
        signInWithPopup: async () => {},
        signInWithRedirect: async () => {},
        onAuthStateChanged: (_a, cb) => {
            authChange = cb;
            queueMicrotask(() => cb(initialUser));
        },
        signOut: async () => authChange(null),
    };
    const firestore = {
        getFirestore: () => ({}),
        collection: (_db, name) => {
            reads.push(name);
            return { name };
        },
        doc: (parent, name, id) => ({
            name: parent.name || name,
            id: id || 'new-id',
        }),
        onSnapshot: (_ref, cb, error) => {
            snapshot = cb;
            snapshotError = error;
            queueMicrotask(() => cb(snap()));
            return () => {};
        },
        serverTimestamp: () => 123,
        setDoc: async (ref, payload) => {
            if (failWrite) throw { code: 'permission-denied' };
            writes.push({ op: 'create', ref, payload });
            records.push({ ...payload, id: ref.id });
            snapshot(snap());
        },
        updateDoc: async (ref, payload) => {
            if (failWrite) throw { code: 'unavailable' };
            writes.push({ op: 'update', ref, payload });
            records = records.map((r) =>
                r.id === ref.id ? { ...r, ...payload } : r,
            );
            snapshot(snap());
        },
        deleteDoc: async (ref) => {
            writes.push({ op: 'delete', ref });
            records = records.filter((r) => r.id !== ref.id);
            snapshot(snap());
        },
    };
    const module = new vm.SourceTextModule(source, { context });
    await module.link(async (specifier) => {
        const exports = specifier.includes('firebase-auth')
            ? auth
            : specifier.includes('firebase-firestore')
              ? firestore
              : specifier.includes('firebase-app')
                ? { initializeApp: () => ({}) }
                : specifier.endsWith('firebase-config.js')
                  ? { firebaseConfig: {} }
                  : model;
        return new vm.SyntheticModule(
            Object.keys(exports),
            function () {
                for (const [key, value] of Object.entries(exports))
                    this.setExport(key, value);
            },
            { context },
        );
    });
    await module.evaluate();
    await tick();
    return {
        w,
        writes,
        reads,
        $: (id) => w.document.getElementById(id),
        setUser: (next) => authChange(next),
        seed: (next) => {
            records = next;
            snapshot(snap());
        },
        fail: () => snapshotError({ code: 'unavailable' }),
        failWrites: () => {
            failWrite = true;
        },
        close: () => w.close(),
    };
}
test('guest browsing, combined filters, safe text, empty results and retry', async () => {
    const app = await setup();
    try {
        const { $, w } = app;
        assert.equal($('owner-toolbar').hidden, true);
        assert.match($('collection-state').textContent, /hasn’t published/);
        assert.equal(w.document.querySelectorAll('.tier-row').length, 5);
        app.seed([
            sample('film', 'Film <script>alert(1)</script>'),
            sample('tv', 'Series', 'tv', 'A'),
        ]);
        assert.equal(
            w.document.querySelectorAll('.recommendation-card').length,
            2,
        );
        assert.equal(
            w.document.querySelectorAll('.recommendation-card script').length,
            0,
        );
        assert.equal(w.document.querySelectorAll('.edit-pick').length, 0);
        w.document.querySelector('[data-type="tv"]').click();
        assert.equal(
            w.document.querySelectorAll('.recommendation-card').length,
            1,
        );
        $('search').value = 'Missing';
        $('search').dispatchEvent(new w.Event('input'));
        assert.match($('collection-state').textContent, /No picks found/);
        app.fail();
        assert.equal($('retry').hidden, false);
        $('retry').click();
        await tick();
        assert.equal($('retry').hidden, true);
        assert.ok(app.reads.every((name) => name === 'publicRecommendations'));
    } finally {
        app.close();
    }
});
test('owner can publish, edit, remove, and loses controls immediately on sign-out', async () => {
    const app = await setup({ email: model.OWNER_EMAIL, emailVerified: true });
    try {
        const { $, w } = app;
        const form = $('recommendation-form');
        assert.equal($('owner-toolbar').hidden, false);
        $('add-recommendation').click();
        form.elements.namedItem('title').value = 'Published title';
        form.dispatchEvent(new w.Event('submit', { cancelable: true }));
        await tick();
        assert.equal(app.writes[0].op, 'create');
        assert.equal(app.writes[0].ref.name, 'publicRecommendations');
        assert.equal($('recommendation-editor').open, false);
        w.document.querySelector('.edit-pick').click();
        form.elements.namedItem('tier').value = 'S';
        form.dispatchEvent(new w.Event('submit', { cancelable: true }));
        await tick();
        assert.equal(app.writes[1].payload.tier, 'S');
        w.document.querySelector('.edit-pick').click();
        $('remove-recommendation').click();
        assert.equal($('remove-dialog').open, true);
        $('confirm-remove').click();
        await tick();
        assert.equal(app.writes[2].op, 'delete');
        assert.equal(
            w.document.querySelectorAll('.recommendation-card').length,
            0,
        );
        $('add-recommendation').click();
        app.setUser(null);
        assert.equal($('owner-toolbar').hidden, true);
        assert.equal($('recommendation-editor').open, false);
        form.dispatchEvent(new w.Event('submit', { cancelable: true }));
        await tick();
        assert.equal(app.writes.length, 3);
    } finally {
        app.close();
    }
});
test('failed save preserves draft and unverified/nonowner accounts stay read-only', async () => {
    const app = await setup({ email: model.OWNER_EMAIL, emailVerified: true });
    try {
        const { $, w } = app;
        app.failWrites();
        $('add-recommendation').click();
        const form = $('recommendation-form');
        form.elements.namedItem('title').value = 'Keep this draft';
        form.dispatchEvent(new w.Event('submit', { cancelable: true }));
        await tick();
        assert.equal($('recommendation-editor').open, true);
        assert.equal($('form-error').hidden, false);
        assert.equal(form.elements.namedItem('title').value, 'Keep this draft');
        assert.equal($('publish').disabled, false);
        for (const user of [
            { email: model.OWNER_EMAIL, emailVerified: false },
            { email: 'visitor@example.com', emailVerified: true },
        ]) {
            app.setUser(user);
            assert.equal($('owner-toolbar').hidden, true);
            assert.equal($('recommendation-editor').open, false);
        }
    } finally {
        app.close();
    }
});
