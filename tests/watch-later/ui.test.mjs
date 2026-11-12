import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import * as model from '../../pages/Watch-Later/recommendations-model.mjs';
const root = new URL('../../pages/Watch-Later/', import.meta.url);
const source = await readFile(new URL('recommendations.js', root), 'utf8');
const html = await readFile(new URL('index.html', root), 'utf8');
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
const youtubeSource = await readFile(new URL('youtube-title.mjs', root), 'utf8');

async function setup(initialUser = null, fetchTitle) {
    const dom = new JSDOM(html, {
        url: 'http://localhost/pages/Watch-Later/?view=recommendations',
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
    w.fetch = fetchTitle;
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
    const cache = new Map();
    await module.link(async function link(specifier) {
        if (specifier === './media-editor.mjs') {
            if (!cache.has(specifier)) {
                const shared = new vm.SourceTextModule(await readFile(new URL(specifier, root), 'utf8'), { context });
                cache.set(specifier, shared);
                await shared.link(link);
            }
            return cache.get(specifier);
        }
        if (specifier === './youtube-title.mjs') {
            return new vm.SourceTextModule(youtubeSource, { context });
        }
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
        assert.equal($('owner-navigation').hidden, true);
        assert.equal($('private-watch-link').hidden, true);
        assert.match($('collection-state').textContent, /hasn’t published/);
        assert.equal(w.document.querySelectorAll('.tier-row').length, 5);
        app.seed([
            sample('film', 'Film <script>alert(1)</script>'),
            sample('tv', 'Series', 'tv', 'A'),
        ]);
        const switcher = $('media-type-switch');
        assert.equal(switcher.querySelectorAll('button').length, 2);
        assert.equal(switcher.querySelector('[aria-pressed="true"]').dataset.type, 'movie');
        assert.equal(w.document.querySelectorAll('.recommendation-card').length, 1);
        assert.match(w.document.querySelector('.recommendation-card').textContent, /Film/);
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
        assert.equal(switcher.querySelector('[aria-pressed="true"]').dataset.type, 'tv');
        assert.match(w.document.querySelector('.recommendation-card').textContent, /Series/);
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
        assert.equal($('owner-navigation').hidden, false);
        assert.equal($('private-watch-link').hidden, false);
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
        assert.equal($('owner-navigation').hidden, true);
        assert.equal($('private-watch-link').hidden, true);
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
            assert.equal($('owner-navigation').hidden, true);
            assert.equal($('recommendation-editor').open, false);
        }
    } finally {
        app.close();
    }
});

test('pasting a YouTube link fills the cleaned title and preserves manual edits', async () => {
    const requests = [];
    const app = await setup(
        { email: model.OWNER_EMAIL, emailVerified: true },
        (url, options) => new Promise((resolve) => requests.push({ url, ...options, resolve })),
    );
    try {
        const { $, w } = app;
        $('add-recommendation').click();
        const form = $('recommendation-form');
        const trailer = form.elements.namedItem('trailerUrl');
        const title = form.elements.namedItem('title');
        const paste = (url) => {
            trailer.value = url;
            trailer.dispatchEvent(new w.Event('input'));
        };
        const reply = (request, value) => request.resolve({ ok: true, json: async () => ({ title: value }) });
        paste('https://youtu.be/abcdefghijk');
        assert.equal(new URL(requests[0].url).searchParams.get('url'), 'https://www.youtube.com/watch?v=abcdefghijk');
        reply(requests[0], 'Interstellar | Official Trailer (HD)');
        await tick();
        assert.equal(title.value, 'Interstellar');

        paste('https://youtu.be/lmnopqrstuv');
        paste('https://youtu.be/01234567890');
        assert.equal(requests[1].signal.aborted, true);
        reply(requests[1], 'Stale title');
        await tick();
        assert.equal(title.value, 'Interstellar');

        title.value = 'My preferred title';
        reply(requests[2], 'Different title | Official Trailer');
        await tick();
        assert.equal(title.value, 'My preferred title');
    } finally {
        app.close();
    }
});

test('shared private editor adds, edits tiers, preserves drafts, and blocks visitors', async () => {
    const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://example.com', runScripts: 'outside-only' });
    const w = dom.window;
    w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    w.HTMLDialogElement.prototype.close = function () { this.open = false; };
    w.confirm = () => true;
    const context = dom.getInternalVMContext(), cache = new Map();
    async function load(name) {
        if (cache.has(name)) return cache.get(name);
        const mod = new vm.SourceTextModule(await readFile(new URL(name, root), 'utf8'), { context });
        cache.set(name, mod);
        await mod.link(load);
        return mod;
    }
    const mod = await load('private-editor.mjs');
    await mod.evaluate();
    let user = { email: model.OWNER_EMAIL, emailVerified: true }, fail = false;
    const writes = [], scoreRequests = [];
    const editor = mod.namespace.createPrivateEditor({
        getUser: () => user, getItems: () => [{ genre: 'Drama', type: 'movie' }, { genre: 'Comedy', type: 'tv' }], getPeople: () => [{ name: 'Friend' }],
        getScores: async (title, options) => { scoreRequests.push({ title, options }); return { imdbScore: '8.5', rtScore: '91%', omdbPoster: 'https://example.com/poster.jpg' }; },
        getTiers: () => [{ id: 'later', name: 'Later' }, { id: 'next', name: 'Next' }],
        save: async (...args) => { if (fail) throw { code: 'unavailable' }; writes.push(args); },
        remove: async () => {},
    });
    try {
        const form = w.document.querySelector('form'), dialog = w.document.querySelector('dialog');
        editor.open(null, 'tv');
        assert.equal(form.elements.type.value, 'tv');
        assert.equal(form.elements.title, w.document.activeElement);
        assert.deepEqual([...form.querySelectorAll('[name]')].slice(0, 6).map(el => el.name), ['title', 'trailerUrl', 'type', 'tier', 'genre', 'watchStatus']);
        assert.equal(form.elements.trailerUrl.required, true);
        assert.equal(form.elements.imdbScore, undefined);
        assert.equal(form.elements.rtScore, undefined);
        form.elements.title.value = 'My series';
        form.dispatchEvent(new w.Event('submit', { cancelable: true })); await tick();
        assert.equal(writes.length, 0);
        assert.equal(w.document.getElementById('form-error').hidden, false);
        form.elements.trailerUrl.value = 'https://youtu.be/abcdefghijk';
        w.document.querySelector('#editor-people button').click();
        assert.deepEqual([...w.document.querySelectorAll('#editor-genres button')].map(b => b.textContent), ['Comedy', 'Drama']);
        w.document.querySelector('#editor-genres button').click();
        form.elements.title.value = 'My series';
        form.elements.tier.value = 'next';
        form.dispatchEvent(new w.Event('submit', { cancelable: true })); await tick();
        assert.equal(writes[0][1].movieTitle, 'My series');
        assert.equal(writes[0][1].tier, 'next');
        assert.equal(writes[0][1].genre, 'Comedy');
        assert.equal(writes[0][1].watchWith, 'Friend');
        assert.equal(writes[0][1].imdbScore, '8.5');
        assert.equal(writes[0][1].rtScore, '91%');
        assert.equal(writes[0][1].thumb, 'https://example.com/poster.jpg');
        assert.equal(scoreRequests[0].title, 'My series');
        assert.equal(scoreRequests[0].options.type, 'tv');
        assert.equal(writes[0][2], true);
        assert.equal(dialog.open, false);
        editor.open({ id: 'existing', movieTitle: 'My series', url: 'https://youtu.be/abcdefghijk', imdbScore: '9.0', rtScore: '95%', type: 'tv', tier: 'next', watchWith: 'Friend', watched: true, watchedAt: 123 });
        form.elements.tier.value = 'later';
        fail = true;
        form.dispatchEvent(new w.Event('submit', { cancelable: true })); await tick();
        assert.equal(dialog.open, true);
        assert.equal(w.document.getElementById('form-error').hidden, false);
        assert.equal(form.elements.title.value, 'My series');
        fail = false;
        form.dispatchEvent(new w.Event('submit', { cancelable: true })); await tick();
        assert.equal(writes[1][0], 'existing');
        assert.equal(writes[1][1].tier, 'later');
        assert.equal(writes[1][1].watchedAt, 123);
        assert.equal(writes[1][1].watchWith, 'Friend');
        assert.equal(writes[1][1].imdbScore, '9.0');
        assert.equal(scoreRequests.length, 1);
        user = null;
        editor.open();
        assert.equal(dialog.open, false);
        form.dispatchEvent(new w.Event('submit', { cancelable: true })); await tick();
        assert.equal(writes.length, 2);
    } finally { w.close(); }
});

test('genre picker lists all collection genres and supports selection, clearing, custom genres and edits', async () => {
    const app = await setup({ email: model.OWNER_EMAIL, emailVerified: true });
    try {
        const { $, w } = app;
        $('add-recommendation').click();
        assert.equal($('editor-genres-empty').hidden, false);
        $('close-editor').click();
        app.seed([
            { ...sample('film', 'Film'), genre: 'Drama' },
            { ...sample('series', 'Series', 'tv'), genre: 'Comedy' },
            { ...sample('other', 'Other'), genre: ' drama ' },
        ]);
        $('add-recommendation').click();
        const form = $('recommendation-form');
        const buttons = [...$('editor-genres').querySelectorAll('button')];
        assert.deepEqual(buttons.map(b => b.textContent), ['Comedy', 'Drama']);
        assert.equal($('editor-genres-empty').hidden, true);
        buttons[0].click();
        assert.equal(form.elements.genre.value, 'Comedy');
        assert.equal(buttons[0].getAttribute('aria-pressed'), 'true');
        assert.equal(app.writes.length, 0);
        $('clear-editor-genre').click();
        assert.equal(form.elements.genre.value, '');
        assert.equal(buttons[0].getAttribute('aria-pressed'), 'false');
        form.elements.genre.value = 'Mystery';
        form.elements.genre.dispatchEvent(new w.Event('input'));
        form.elements.title.value = 'A new title';
        form.dispatchEvent(new w.Event('submit', { cancelable: true })); await tick();
        assert.equal(app.writes[0].payload.genre, 'Mystery');
        $('add-recommendation').click();
        assert.deepEqual([...$('editor-genres').querySelectorAll('button')].map(b => b.textContent), ['Comedy', 'Drama', 'Mystery']);
        $('close-editor').click();
        w.document.querySelector('[aria-label="Edit A new title"]').click();
        assert.equal($('editor-genres').querySelector('[aria-pressed="true"]').textContent, 'Mystery');
    } finally { app.close(); }
});
