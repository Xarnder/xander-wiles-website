// Mobile presentation only: collection state and mutations remain in app.js.
import { mountEditorOrderSetting } from './editor-preferences.mjs';
const paths = {
    watch: '<path d="m8 4 13 8-13 8Z"/>',
    edit: '<path d="m16 3 5 5-12 12-6 1 1-6Z M14 5l5 5"/>',
    organize: '<path d="M12 3v18M3 12h18m-12-6 3-3 3 3m-6 12 3 3 3-3M6 9l-3 3 3 3m12-6 3 3-3 3"/>',
    select: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="m7 12 3 3 7-7"/>',
    'reorder-tiers': '<path d="M9 5h12M9 12h12M9 19h12M3 4v16m-2-2 2 2 2-2M1 6l2-2 2 2"/>',
    settings: '<path d="m9 3 1-2h4l1 2 3 2 2-.2 2 3.4-1.3 1.8v4L22 16l-2 3.4-2-.2-3 1.8-1 2h-4l-1-2-3-1.8-2 .2L2 16l1.3-2v-4L2 8.2l2-3.4L6 5Z"/><circle cx="12" cy="12" r="3.5"/>',
    filter: '<path d="M3 4h18l-7 8v8l-4-2v-6Z"/>',
    add: '<path d="M12 4v16M4 12h16"/>',
    details: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7v.01"/>',
    globe: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
    lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;

export function createCompactPanel(id, title, trigger, menu = false) {
    const dialog = document.createElement('dialog');
    dialog.id = id;
    dialog.className = `compact-panel${menu ? ' compact-mode-panel' : ''}`;
    dialog.setAttribute('aria-labelledby', `${id}-title`);
    dialog.innerHTML = `<div class="compact-panel-heading"><h2 id="${id}-title">${title}</h2><button type="button" class="compact-dismiss" aria-label="Close ${title.toLowerCase()}">×</button></div><div class="compact-panel-body"></div>`;
    document.body.append(dialog);
    let restore, returnFocus;
    const close = () => {
        if (!dialog.open) return;
        restore?.(); restore = null;
        dialog.close();
        trigger?.setAttribute('aria-expanded', 'false');
        (trigger || returnFocus)?.focus();
    };
    dialog.querySelector('.compact-dismiss').onclick = close;
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    dialog.addEventListener('keydown', event => {
        // Keep page-wide shortcuts from dismissing or focusing controls behind the sheet.
        event.stopPropagation();
    });
    let backdropPress = false;
    dialog.addEventListener('pointerdown', event => { backdropPress = event.target === dialog; });
    dialog.addEventListener('click', event => { if (backdropPress && event.target === dialog) close(); });
    return {
        dialog, body: dialog.querySelector('.compact-panel-body'), close,
        open(content) {
            if (dialog.open) return;
            returnFocus = trigger || document.activeElement;
            if (content) {
                const placeholder = document.createComment('compact panel content');
                content.before(placeholder);
                dialog.querySelector('.compact-panel-body').append(content);
                restore = () => placeholder.replaceWith(content);
            }
            dialog.showModal();
            trigger?.setAttribute('aria-expanded', 'true');
        },
    };
}

export { icon as compactIcon };

export function mountCompactMobile({ getMode, setMode, addTitle, prepareImport, resetFilters }) {
    const $ = id => document.getElementById(id);
    const mobile = window.matchMedia('(max-width: 768px)');
    const controls = document.createElement('div');
    controls.className = 'compact-controls';
    $('media-type-switch').before(controls);
    controls.append($('media-type-switch'));
    controls.insertAdjacentHTML('beforeend', `<div class="compact-actions mobile-only">
        <button id="mobile-mode" class="compact-icon" type="button" aria-label="Change mode" aria-haspopup="menu" aria-expanded="false" aria-controls="mobile-mode-menu"><span class="compact-icon-surface"></span></button>
        <button id="mobile-settings" class="compact-icon" type="button" aria-label="Settings" aria-haspopup="dialog" aria-expanded="false" aria-controls="settings-modal"><span class="compact-icon-surface">${icon('settings')}</span></button>
        <button id="mobile-filter" class="compact-icon" type="button" aria-label="Filter" aria-haspopup="dialog" aria-expanded="false" aria-controls="mobile-filter-panel"><span class="compact-icon-surface">${icon('filter')}</span></button>
    </div>`);
    controls.insertAdjacentHTML('afterend', `<p id="compact-count" class="mobile-only compact-count" role="status">${icon('lock')}<span>0 titles</span></p>`);
    document.querySelector('.site-header').insertAdjacentHTML('beforeend', `<button id="mobile-add-title" class="compact-icon mobile-only" type="button" aria-label="Add title" aria-haspopup="dialog"><span class="compact-icon-surface">${icon('add')}</span></button>`);
    $('mobile-add-title').onclick = () => { $('mobile-add-title').focus(); addTitle(); };
    let settingsTrigger;
    $('mobile-settings').onclick = () => { settingsTrigger = $('mobile-settings'); $('open-settings-btn').click(); };
    $('open-settings-btn').addEventListener('click', () => { settingsTrigger ||= $('open-settings-btn'); });


    const mode = createCompactPanel('mobile-mode-menu', 'Mode', $('mobile-mode'), true);
    const modes = [['watch', 'Watch'], ['edit', 'Edit'], ['organize', 'Organize'], ['select', 'Select'], ['reorder-tiers', 'Reorder tiers']];
    mode.body.setAttribute('role', 'menu');
    mode.body.setAttribute('aria-label', 'Watchlist mode');
    for (const [value, label] of modes) {
        const button = document.createElement('button');
        button.type = 'button'; button.dataset.mode = value;
        button.setAttribute('role', 'menuitemradio');
        button.innerHTML = `${icon(value)}<span>${label}</span><span class="mode-check" aria-hidden="true">✓</span>`;
        button.onclick = () => { setMode(value); syncMode(); mode.close(); };
        mode.body.append(button);
    }
    mode.body.addEventListener('keydown', event => {
        const buttons = [...mode.body.querySelectorAll('button')];
        const index = buttons.indexOf(document.activeElement);
        const target = { ArrowDown: (index + 1) % buttons.length, ArrowUp: (index + buttons.length - 1) % buttons.length, Home: 0, End: buttons.length - 1 }[event.key];
        if (target !== undefined) { event.preventDefault(); buttons[target].focus(); }
    });
    $('mobile-mode').onclick = () => {
        syncMode(); mode.open();
        mode.body.querySelector('[aria-checked="true"]').focus();
    };

    const filters = createCompactPanel('mobile-filter-panel', 'Filter', $('mobile-filter'));
    const reset = document.createElement('button');
    reset.type = 'button'; reset.className = 'compact-reset'; reset.textContent = 'Reset filters';
    reset.onclick = resetFilters;
    filters.dialog.append(reset);
    const openFilters = () => filters.open($('filter-groups-container'));
    $('mobile-filter').onclick = openFilters;
    $('search-input').setAttribute('aria-label', 'Search titles');
    for (const [id, label] of [['group-status', 'Watch status'], ['group-watched', 'Watched'], ['group-people', 'Watch with'], ['group-genre', 'Genre']]) {
        const heading = document.createElement('h3');
        heading.className = 'mobile-filter-label'; heading.textContent = label;
        $(id).prepend(heading);
    }
    const genreHeading = document.createElement('div');
    genreHeading.className = 'mobile-filter-heading';
    const genreLabel = $('group-genre').querySelector('.mobile-filter-label');
    genreLabel.before(genreHeading);
    genreHeading.append(genreLabel);
    const genreEdit = $('open-rename-genre-modal-btn');
    const genreEditHome = genreEdit.parentElement;
    // Keep keyboard order aligned with the mobile heading and preserve desktop placement.
    const placeGenreEdit = () => (mobile.matches ? genreHeading : genreEditHome).append(genreEdit);
    mobile.addEventListener('change', placeGenreEdit);
    placeGenreEdit();
    // Existing manager handlers run after closing the sheet, with their UI unobstructed.
    filters.body.addEventListener('click', event => {
        if (event.target.closest('#edit-people-btn, #open-rename-genre-modal-btn')) filters.close();
    }, true);

    const bulk = createCompactPanel('mobile-import-panel', 'Bulk import links', $('mobile-add-title'));
    const openImport = () => {
        prepareImport();
        bulk.open($('input-section'));
        $('batch-links').focus();
    };

    // Preserve all legacy Settings handlers, adding native modal focus/Escape handling.
    const settings = $('settings-modal');
    mountEditorOrderSetting(settings.querySelector('.settings-actions'));
    new MutationObserver(() => {
        const visible = !settings.classList.contains('hidden');
        if (visible && !settings.open) settings.showModal();
        if (!visible) {
            if (settings.open) settings.close();
            settingsTrigger?.focus(); settingsTrigger = null;
        }
        $('mobile-settings').setAttribute('aria-expanded', String(visible));
    }).observe(settings, { attributes: true, attributeFilter: ['class'] });
    settings.addEventListener('cancel', () => settings.classList.add('hidden'));
    settings.addEventListener('keydown', event => event.stopPropagation());
    settings.addEventListener('close', () => settings.classList.add('hidden'));
    settings.addEventListener('click', event => { if (event.target === settings) settings.classList.add('hidden'); });

    // Legacy alerts/duplicate prompts must remain above a native import/settings sheet.
    // Move the same nodes temporarily so every existing callback keeps its reference.
    document.querySelectorAll('div.modal, div.modal-overlay').forEach(overlay => {
        let host, placeholder;
        new MutationObserver(() => {
            if (!overlay.classList.contains('hidden') && !host && document.querySelector('dialog[open]')) {
                host = document.createElement('dialog');
                host.className = 'compact-legacy-host';
                host.setAttribute('aria-label', overlay.querySelector('h2, h3')?.textContent || 'Watchlist');
                placeholder = document.createComment('legacy modal');
                overlay.before(placeholder); host.append(overlay); document.body.append(host);
                host.addEventListener('cancel', () => overlay.classList.add('hidden'));
                host.addEventListener('keydown', event => event.stopPropagation());
                host.showModal();
            } else if (overlay.classList.contains('hidden') && host) {
                host.close(); placeholder.replaceWith(overlay); host.remove(); host = null;
            }
        }).observe(overlay, { attributes: true, attributeFilter: ['class'] });
    });

    function syncMode() {
        const current = getMode();
        $('mobile-mode').querySelector('.compact-icon-surface').innerHTML = icon(current);
        $('mobile-mode').title = `Change mode: ${modes.find(([value]) => value === current)?.[1]}`;
        mode.body.querySelectorAll('button').forEach(button => button.setAttribute('aria-checked', String(button.dataset.mode === current)));
    }
    function closePanels() { mode.close(); filters.close(); bulk.close(); }
    mobile.addEventListener('change', closePanels);
    syncMode();
    return {
        syncMode, openFilters, openImport, closePanels,
        syncFilters(shown, total, active) {
            $('compact-count').querySelector('span').textContent = shown === total ? `${total} ${total === 1 ? 'title' : 'titles'}` : `${shown} of ${total} titles`;
            $('mobile-filter').title = active ? 'Filter (active filters)' : 'Filter';
            document.querySelectorAll('#filter-groups-container .filter-pill').forEach(button => button.setAttribute('aria-pressed', String(button.classList.contains('active'))));
        },
    };
}
