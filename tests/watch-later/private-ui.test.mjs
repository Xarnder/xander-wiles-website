import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const root = new URL('../../pages/Watch-Later/', import.meta.url);
const settle = () => new Promise(resolve => setTimeout(resolve, 30));
async function setup({ linkFirst, posterFailures = false } = {}) {
    const dom = new JSDOM(await readFile(new URL('private.html', root), 'utf8'), {
        url: 'http://localhost/pages/Watch-Later/private.html' + (posterFailures ? '?posterFailures=1' : ''), runScripts: 'outside-only', pretendToBeVisual: true,
    });
    const w = dom.window, $ = id => w.document.getElementById(id), sortables = [], opened = [];
    if (linkFirst !== undefined) w.localStorage.setItem('watchLater_linkFirst', String(linkFirst));
    w.matchMedia = () => ({ matches: true, addEventListener() {} });
    w.Sortable = class {
        constructor(element, options) { this.element = element; this.options = options; sortables.push(this); }
        option(name, value) { this.options[name] = value; }
        destroy() {}
    };
    w.HTMLDialogElement.prototype.showModal = function () { this.returnFocus = w.document.activeElement; this.open = true; };
    w.HTMLDialogElement.prototype.close = function () { if (!this.open) return; this.open = false; this.returnFocus?.focus(); this.dispatchEvent(new w.Event('close')); };
    w.open = url => opened.push(url);
    w.confirm = () => true;
    w.fetch = async url => ({ ok: true, json: async () => String(url).includes('omdbapi') ? { Response: 'False' } : { title: 'Imported title | Official Trailer' } });
    const context = dom.getInternalVMContext(), modules = new Map();
    async function load(specifier) {
        const path = specifier.includes('gstatic.com') ? new URL('private-fixture.mjs', import.meta.url) : new URL(specifier, root);
        if (modules.has(path.href)) return modules.get(path.href);
        // Cache before yielding so concurrent imports share one module instance, as in a browser.
        const module = new vm.SourceTextModule(readFileSync(path, 'utf8'), { context });
        modules.set(path.href, module); await module.link(load); return module;
    }
    // Firebase's three imports share one backend, including the write log.
    await load('https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js');
    const app = await load('app.js'); await app.evaluate(); await settle();
    return { w, $, sortables, opened, writes: modules.get(new URL('private-fixture.mjs', import.meta.url).href).namespace.writes, close: () => w.close() };
}

test('Watchlist supplies poster fallbacks for movies and TV without changing saved data', async () => {
    const app = await setup({ posterFailures: true });
    try {
        const { $, w, writes } = app;
        const images = [...w.document.querySelectorAll('.media-card > img')];
        assert.ok(images[0].src.endsWith('/assets/thumbnail-placeholder.webp'));
        for (const image of images.slice(1, 4)) {
            image.dispatchEvent(new w.Event('error'));
            assert.ok(image.src.endsWith('/assets/thumbnail-placeholder.webp'));
        }
        $('media-type-switch').querySelector('[data-type="tv"]').click();
        assert.ok(w.document.querySelector('.media-card > img').src.endsWith('/assets/thumbnail-placeholder.webp'));
        assert.equal(writes.length, 0);
    } finally { app.close(); }
});

test('Add title defaults to link first and honours the saved field-order setting and focus', async () => {
    const app = await setup();
    try {
        const { $, w } = app;
        const form = $('recommendation-form');
        const firstInput = () => form.querySelector('input');
        $('mobile-add-title').click();
        assert.equal(firstInput().name, 'trailerUrl');
        assert.equal(firstInput().required, true);
        assert.equal(w.document.activeElement, firstInput());
        $('close-editor').click();
        $('mobile-settings').click(); await settle();
        assert.equal($('editor-link-first').checked, true);
        $('editor-link-first').click();
        assert.equal(w.localStorage.getItem('watchLater_linkFirst'), 'false');
        $('close-settings-modal').click(); await settle();
        $('mobile-add-title').click();
        assert.equal(firstInput().name, 'title');
        assert.equal(w.document.activeElement, firstInput());
        assert.equal(form.elements.trailerUrl.closest('label').nextElementSibling, $('trailer-title-status'));
    } finally { app.close(); }

    const restored = await setup({ linkFirst: false });
    try {
        assert.equal(restored.$('editor-link-first').checked, false);
        restored.$('mobile-add-title').click();
        assert.equal(restored.$('recommendation-form').querySelector('input').name, 'title');
        restored.$('close-editor').click();
        restored.$('editor-link-first').click();
        restored.$('mobile-add-title').click();
        assert.equal(restored.$('recommendation-form').querySelector('input').name, 'trailerUrl');
    } finally { restored.close(); }
});

test('optional details start collapsed, keep genre optional, retain values and reveal validation errors', async () => {
    const app = await setup();
    try {
        const { $, w, writes } = app;
        const form = $('recommendation-form'), optional = $('editor-optional-fields');
        $('mobile-add-title').click();
        assert.equal(optional.open, false);
        assert.equal(form.elements.genre.required, false);
        assert.equal(form.elements.genre.closest('details'), null);
        for (const name of ['year', 'note', 'imageUrl', 'rank', 'watchStatus', 'watched']) {
            assert.equal(form.elements[name].closest('details'), optional);
        }
        assert.equal($('editor-people').closest('details'), optional);
        form.elements.title.value = 'Only the main fields';
        form.elements.trailerUrl.value = 'https://youtu.be/abcdefghijk';
        assert.equal(form.checkValidity(), true);
        form.dispatchEvent(new w.Event('submit', { cancelable: true })); await settle();
        assert.equal($('recommendation-editor').open, false);
        assert.equal(writes.at(-1).payload.genre, '');
        assert.equal(writes.at(-1).payload.year, '');

        $('mobile-add-title').click();
        optional.open = true;
        form.elements.title.value = 'With optional details';
        form.elements.trailerUrl.value = 'https://youtu.be/01234567890';
        form.elements.year.value = 'bad';
        optional.open = false;
        assert.equal(form.checkValidity(), false);
        assert.equal(optional.open, true, 'Invalid hidden fields must be revealed for correction');
        form.elements.year.value = '2024';
        form.elements.note.value = 'Keep this note when collapsed';
        optional.open = false;
        assert.equal(form.checkValidity(), true);
        form.dispatchEvent(new w.Event('submit', { cancelable: true })); await settle();
        assert.equal(writes.at(-1).payload.year, '2024');
        assert.equal(writes.at(-1).payload.note, 'Keep this note when collapsed');
        $('mobile-add-title').click();
        optional.open = true;
        $('close-editor').click(); $('mobile-add-title').click();
        assert.equal(optional.open, false, 'Each new title starts collapsed');
    } finally { app.close(); }
});

test('compact modes reuse poster, selection and both sortable handlers; keyboard and focus return work', async () => {
    const app = await setup();
    try {
        const { $, w, sortables, opened } = app;
        assert.equal($('compact-count').textContent.trim(), '9 of 10 titles');
        assert.equal(w.document.querySelectorAll('.media-card').length, 9);
        assert.equal($('owner-navigation').querySelector('a').getAttribute('href'), '/pages/Watch-Later/?view=recommendations');
        const card = () => w.document.querySelector('.media-card');
        card().click(); assert.equal(opened.length, 1);
        for (const mode of ['edit', 'organize', 'select', 'reorder-tiers', 'watch']) {
            $('mobile-mode').focus(); $('mobile-mode').click();
            assert.equal($('mobile-mode-menu').open, true);
            const selected = $('mobile-mode-menu').querySelector(`[data-mode="${mode}"]`);
            selected.click();
            assert.equal(selected.getAttribute('aria-checked'), 'true');
            assert.equal($('mobile-mode-menu').open, false);
            assert.equal(w.document.activeElement, $('mobile-mode'));
            assert.equal($('mobile-mode').getAttribute('aria-expanded'), 'false');
            assert.equal(w.document.body.classList.contains(`mode-${mode}`), true);
            assert.equal(sortables.find(s => s.element.id === 'tier-container').options.disabled, mode !== 'reorder-tiers');
            assert.equal(sortables.find(s => s.element.id === 'list-first').options.disabled, mode !== 'organize');
            if (mode === 'edit') { card().click(); assert.equal($('recommendation-editor').open, true); $('close-editor').click(); }
            if (mode === 'organize') { card().click(); assert.equal(opened.length, 1); assert.equal($('recommendation-editor').open, false); }
            if (mode === 'select') { card().click(); assert.equal(card().classList.contains('selected'), true); assert.equal($('batch-actions-bar').classList.contains('hidden'), false); }
        }
        assert.equal(card().classList.contains('selected'), false);
        $('mobile-mode').click();
        $('mobile-mode-menu').querySelector('[data-mode="watch"]').dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        assert.equal(w.document.activeElement.dataset.mode, 'edit');
        $('mobile-mode-menu').dispatchEvent(new w.Event('cancel', { cancelable: true }));
        assert.equal($('mobile-mode-menu').open, false);
        $('mobile-mode').click(); $('mobile-mode-menu').querySelector('[data-mode="organize"]').click();
        await sortables.find(s => s.element.id === 'list-first').options.onEnd({ item: card(), to: $('list-second') });
        assert.equal(app.writes.at(-1).payload.tier, 'second');
        await settle();
        $('mobile-mode').click(); $('mobile-mode-menu').querySelector('[data-mode="reorder-tiers"]').click();
        $('tier-container').prepend($('tier-container').lastElementChild);
        await sortables.find(s => s.element.id === 'tier-container').options.onEnd();
        assert.ok(app.writes.some(write => write.ref.name === 'tiers' && write.ref.id === 'second' && write.payload.order === 0));
        assert.ok(app.writes.some(write => write.ref.name === 'tiers' && write.ref.id === 'first' && write.payload.order === 1));
    } finally { app.close(); }
});

test('mobile filters preserve and reset all options, update counts, and restore desktop controls', async () => {
    const app = await setup();
    try {
        const { $, w } = app;
        $('mobile-filter').click();
        assert.equal($('filter-groups-container').closest('dialog').id, 'mobile-filter-panel');
        const search = $('search-input');
        search.value = 'Arrival'; search.dispatchEvent(new w.Event('input')); await settle();
        assert.equal($('compact-count').textContent.trim(), '1 of 10 titles');
        assert.equal($('mobile-filter').title, 'Filter (active filters)');
        $('mobile-filter-panel').querySelector('.compact-dismiss').click();
        assert.equal($('filter-groups-container').parentElement.id, 'filter-bar');
        $('mobile-filter').click(); assert.equal(search.value, 'Arrival');
        $('mobile-filter-panel').querySelector('.compact-reset').click(); await settle();
        assert.equal($('compact-count').textContent.trim(), '10 titles');
        assert.equal($('mobile-filter').title, 'Filter');
        $('status-filter-pills').querySelector('[data-status="rewatch"]').click(); await settle();
        assert.equal($('compact-count').textContent.trim(), '1 of 10 titles');
        $('mobile-filter-panel').querySelector('.compact-reset').click();
        $('people-filter-pills').querySelector('button').click(); await settle();
        assert.equal(w.document.querySelectorAll('.media-card').length, 2);
        $('mobile-filter-panel').querySelector('.compact-reset').click(); await settle();
        const genre = [...$('genre-filter-pills').querySelectorAll('button')].find(b => b.innerText === 'Crime');
        genre.focus(); genre.click(); await settle();
        assert.equal(w.document.activeElement.dataset.filterValue, 'Crime');
        assert.equal(w.document.querySelectorAll('.media-card').length, 1);
        $('mobile-filter-panel').querySelector('.compact-reset').click(); await settle();
        $('watched-filter-pills').querySelector('[data-watched="true"]').click(); await settle();
        assert.equal(w.document.querySelectorAll('.media-card').length, 1);
        $('mobile-filter-panel').querySelector('.compact-reset').click();
        $('mobile-filter-panel').querySelector('.compact-dismiss').click();
        $('media-type-switch').querySelector('[data-type="tv"]').click(); await settle();
        assert.equal($('compact-count').textContent.trim(), '1 title');
        assert.equal(w.document.querySelector('.card-title').textContent, 'A series with a longer title');
    } finally { app.close(); }
});

test('settings persist, add-title saves, bulk import uses existing handlers and nested alerts remain usable', async () => {
    const app = await setup();
    try {
        const { $, w, writes } = app;
        $('mobile-settings').focus(); $('mobile-settings').click(); await settle();
        assert.equal($('settings-modal').open, true);
        $('debug-menu-toggle').checked = true; $('debug-menu-toggle').dispatchEvent(new w.Event('change'));
        assert.equal(w.localStorage.getItem('watchLater_debugEnabled'), 'true');
        $('close-settings-modal').click(); await settle();
        assert.equal($('settings-modal').open, false);
        assert.equal(w.document.activeElement, $('mobile-settings'));
        $('mobile-add-title').click();
        const form = $('recommendation-form');
        form.elements.title.value = 'New private title'; form.elements.trailerUrl.value = 'https://youtu.be/abcdefghijk';
        form.dispatchEvent(new w.Event('submit', { cancelable: true })); await settle();
        assert.equal($('form-error').hidden, true, $('form-error').textContent);
        assert.ok(writes.length, 'Adding a title writes to the existing collection service');
        assert.equal(writes[0].payload.movieTitle, 'New private title');
        assert.equal($('recommendation-editor').open, false);
        $('mobile-add-title').click(); $('editor-bulk-import').click();
        assert.equal($('mobile-import-panel').open, true);
        assert.equal($('batch-input-row').classList.contains('hidden'), false);
        assert.equal($('input-section').closest('dialog').id, 'mobile-import-panel');
        $('add-btn').click(); await settle();
        assert.equal($('alert-modal').closest('dialog').open, true);
        $('alert-ok-btn').click(); await settle();
        assert.equal(w.document.querySelector('.compact-legacy-host'), null);
        $('batch-links').value = 'https://youtu.be/01234567890'; $('add-btn').click();
        await new Promise(resolve => setTimeout(resolve, 300));
        assert.equal(writes.at(-1).payload.movieTitle, 'Imported title');
        assert.equal(writes.at(-1).ref.name, 'watches');
        assert.equal($('batch-links').value, '');
        $('mobile-import-panel').querySelector('.compact-dismiss').click();
        assert.equal($('input-section').parentElement.className, 'legacy-batch');
    } finally { app.close(); }
});
