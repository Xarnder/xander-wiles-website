const storageKey = 'watchLater_linkFirst';
const changeEvent = 'watchlater:editor-order-change';
let linkFirst = true;
try { linkFirst = localStorage.getItem(storageKey) !== 'false'; } catch { /* Keep the default when storage is unavailable. */ }

window.addEventListener('storage', event => {
    if (event.key !== storageKey && event.key !== null) return;
    linkFirst = event.newValue !== 'false';
    window.dispatchEvent(new Event(changeEvent));
});

// Move the actual fields so reading order, Tab order and visual order agree.
export function applyEditorFieldOrder(editor) {
    const form = editor.querySelector('form');
    const title = form.elements.namedItem('title');
    const trailer = form.elements.namedItem('trailerUrl');
    const titleLabel = title.closest('label');
    const trailerLabel = trailer.closest('label');
    const status = editor.querySelector('#trailer-title-status');
    if (linkFirst) titleLabel.before(trailerLabel, status);
    else {
        trailerLabel.before(titleLabel);
        trailerLabel.after(status);
    }
    return linkFirst ? trailer : title;
}

export function mountEditorOrderSetting(container) {
    const group = document.createElement('div');
    group.className = 'settings-group editor-order-setting';
    group.innerHTML = `<label class="switch-container">
        <span class="editor-order-copy"><span id="editor-link-first-label">Link before title</span><small id="editor-link-first-help">Turn off to show Title first.</small></span>
        <span class="switch"><input id="editor-link-first" type="checkbox" role="switch" aria-labelledby="editor-link-first-label" aria-describedby="editor-link-first-help"><span class="slider" aria-hidden="true"></span></span>
    </label>`;
    const input = group.querySelector('input');
    input.checked = linkFirst;
    input.addEventListener('change', () => {
        linkFirst = input.checked;
        try { localStorage.setItem(storageKey, String(linkFirst)); } catch { /* The choice still works for this page. */ }
        window.dispatchEvent(new Event(changeEvent));
    });
    window.addEventListener(changeEvent, () => { input.checked = linkFirst; });
    container.prepend(group);
    return group;
}
