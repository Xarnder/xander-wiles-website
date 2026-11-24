import { compactIcon as icon, createCompactPanel } from './compact-mobile.mjs';
import { youtubeId } from './recommendations-model.mjs';
import { mountEditorOrderSetting } from './editor-preferences.mjs';

// Discover reuses the compact presentation while retaining its public-only actions.
export function mountDiscoverMobile({ canEdit, addTitle, editTitle, resetSearch }) {
    const $ = id => document.getElementById(id);
    let currentMode = 'watch';
    const controls = document.createElement('div');
    controls.className = 'compact-controls';
    $('media-type-switch').before(controls);
    controls.append($('media-type-switch'));
    controls.insertAdjacentHTML('beforeend', `<div class="compact-actions mobile-only">
        <button id="mobile-mode" class="compact-icon" type="button" aria-label="Change mode" aria-haspopup="menu" aria-expanded="false" aria-controls="mobile-mode-menu"><span class="compact-icon-surface"></span></button>
        <button id="mobile-settings" class="compact-icon" type="button" aria-label="Settings" aria-haspopup="dialog" aria-expanded="false" aria-controls="discover-settings"><span class="compact-icon-surface">${icon('settings')}</span></button>
        <button id="mobile-filter" class="compact-icon" type="button" aria-label="Filter" aria-haspopup="dialog" aria-expanded="false" aria-controls="mobile-filter-panel"><span class="compact-icon-surface">${icon('filter')}</span></button>
    </div>`);
    controls.insertAdjacentHTML('afterend', `<p id="compact-count" class="mobile-only compact-count" role="status">${icon('globe')}<span>Loading collection…</span></p>`);
    document.querySelector('.site-header').insertAdjacentHTML('beforeend', `<button id="mobile-add-title" class="compact-icon mobile-only" type="button" aria-label="Add title" aria-haspopup="dialog" hidden><span class="compact-icon-surface">${icon('add')}</span></button>`);
    $('mobile-add-title').onclick = () => { $('mobile-add-title').focus(); addTitle(); };

    const mode = createCompactPanel('mobile-mode-menu', 'Mode', $('mobile-mode'), true);
    const options = [['watch', 'Watch'], ['details', 'Details'], ['edit', 'Edit']];
    mode.body.setAttribute('role', 'menu');
    mode.body.setAttribute('aria-label', 'Discover mode');
    for (const [value, label] of options) {
        const button = document.createElement('button');
        button.type = 'button'; button.dataset.mode = value;
        button.setAttribute('role', 'menuitemradio');
        button.innerHTML = `${icon(value)}<span>${label}</span><span class="mode-check" aria-hidden="true">✓</span>`;
        button.onclick = () => {
            if (value === 'edit' && !canEdit()) return;
            currentMode = value; syncMode(); mode.close();
        };
        mode.body.append(button);
    }
    mode.body.addEventListener('keydown', event => {
        const buttons = [...mode.body.querySelectorAll('button')].filter(button => !button.hidden);
        const index = buttons.indexOf(document.activeElement);
        const target = { ArrowDown: (index + 1) % buttons.length, ArrowUp: (index + buttons.length - 1) % buttons.length, Home: 0, End: buttons.length - 1 }[event.key];
        if (target !== undefined) { event.preventDefault(); buttons[target].focus(); }
    });
    $('mobile-mode').onclick = () => {
        syncMode(); mode.open(); mode.body.querySelector('[aria-checked="true"]').focus();
    };
    function syncMode() {
        $('mobile-mode').querySelector('.compact-icon-surface').innerHTML = icon(currentMode);
        $('mobile-mode').title = `Change mode: ${options.find(([value]) => value === currentMode)[1]}`;
        mode.body.querySelectorAll('button').forEach(button => {
            button.hidden = button.dataset.mode === 'edit' && !canEdit();
            button.setAttribute('aria-checked', String(button.dataset.mode === currentMode));
        });
    }

    const settings = createCompactPanel('discover-settings', 'Settings', $('mobile-settings'));
    const editorOrderSetting = mountEditorOrderSetting(settings.body);
    editorOrderSetting.hidden = !canEdit();
    $('mobile-settings').onclick = () => settings.open(document.querySelector('.account-controls'));
    const filters = createCompactPanel('mobile-filter-panel', 'Filter', $('mobile-filter'));
    const reset = document.createElement('button');
    reset.type = 'button'; reset.className = 'compact-reset'; reset.textContent = 'Reset filters';
    reset.onclick = resetSearch; filters.dialog.append(reset);
    $('mobile-filter').onclick = () => {
        filters.open(document.querySelector('.search-field')); $('search').focus();
    };

    const details = createCompactPanel('discover-details', 'Title details');
    function openDetails(item) {
        details.body.replaceChildren();
        for (const [tag, className, text] of [
            ['h3', 'discover-detail-title', item.title],
            ['p', 'card-meta', [item.year, item.genre].filter(Boolean).join(' · ')],
            ['p', 'card-note', item.note],
        ]) {
            if (!text) continue;
            const node = document.createElement(tag); node.className = className;
            node.textContent = text; details.body.append(node);
        }
        const video = youtubeId(item.trailerUrl);
        if (video) {
            const link = document.createElement('a');
            link.className = 'trailer-link'; link.textContent = 'Watch trailer';
            link.href = `https://www.youtube.com/watch?v=${video}`;
            link.target = '_blank'; link.rel = 'noopener noreferrer';
            details.body.append(link);
        }
        if (canEdit()) {
            const edit = document.createElement('button');
            edit.type = 'button'; edit.className = 'edit-pick'; edit.textContent = 'Edit pick';
            edit.onclick = () => { details.close(); editTitle(item); };
            details.body.append(edit);
        }
        details.open();
    }
    function closePanels() { mode.close(); settings.close(); filters.close(); details.close(); }
    window.matchMedia('(max-width: 768px)').addEventListener('change', closePanels);
    syncMode();
    return {
        openTitle(item, trigger) {
            trigger.focus();
            if (currentMode === 'edit' && canEdit()) { editTitle(item); return; }
            const video = youtubeId(item.trailerUrl);
            if (currentMode === 'watch' && video) {
                window.open(`https://www.youtube.com/watch?v=${video}`, '_blank', 'noopener,noreferrer');
            } else openDetails(item);
        },
        syncOwner() {
            closePanels();
            editorOrderSetting.hidden = !canEdit();
            $('mobile-add-title').hidden = !canEdit();
            if (!canEdit() && currentMode === 'edit') currentMode = 'watch';
            syncMode();
        },
        syncCount(visible, total, active) {
            $('compact-count').querySelector('span').textContent = visible === total ? `${total} ${total === 1 ? 'title' : 'titles'}` : `${visible} of ${total} titles`;
            $('mobile-filter').title = active ? 'Filter (active search)' : 'Filter';
        },
        setStatus(text) { $('compact-count').querySelector('span').textContent = text; },
    };
}
