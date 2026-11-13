import { cleanTitle, getVideoData } from './youtube-title.mjs';
import { youtubeId } from './recommendations-model.mjs';

// Both collections mount the same form and share paste/title behavior.
export function mountMediaEditor() {
    document.body.insertAdjacentHTML('beforeend', `<dialog id="recommendation-editor" class="watch-editor" aria-labelledby="editor-title">
            <form id="recommendation-form">
                <div class="dialog-heading">
                    <div>
                        <p class="eyebrow">PUBLIC RECOMMENDATION</p>
                        <h2 id="editor-title">Add a recommendation</h2>
                    </div>
                    <button
                        type="button"
                        id="close-editor"
                        class="close-button"
                        aria-label="Close editor"
                    >
                        <img class="editor-close-icon" src="/assets/SVGs/close-icon.svg" alt="" aria-hidden="true">
                    </button>
                </div>
                <p class="form-intro">
                    Everything in this form will be public when you publish.
                </p>
                <label
                    >YouTube trailer <span>(optional)</span
                    ><input
                        name="trailerUrl"
                        aria-describedby="trailer-title-status"
                        type="url"
                        maxlength="2048"
                        placeholder="https://www.youtube.com/watch?v=…"
                /></label>
                <small id="trailer-title-status" role="status"></small>
                <label
                    >Title
                    <input
                        name="title"
                        required
                        maxlength="160"
                        placeholder="Movie or TV show title"
                /></label>
                <div class="form-row">
                    <label
                        >Type<select name="type">
                            <option value="movie">Movie</option>
                            <option value="tv">TV show</option>
                        </select></label
                    ><label
                        >Tier<select name="tier">
                            <option value="S">S · The essentials</option>
                            <option value="A" selected>
                                A · Highly recommended
                            </option>
                            <option value="B">B · Worth a watch</option>
                            <option value="C">C · For the right mood</option>
                            <option value="D">D · A little more niche</option>
                        </select></label
                    >
                </div>
                <div class="form-row">
                    <label
                        >Release year <span>(optional)</span
                        ><input
                            name="year"
                            inputmode="numeric"
                            pattern="[0-9]{4}"
                            maxlength="4"
                            placeholder="2026" /></label
                    >
                </div>
                <fieldset class="editor-genre-picker">
                    <legend>Genre <span>(optional)</span></legend>
                    <div id="editor-genres" class="editor-genre-options" role="group" aria-label="Existing genres"></div>
                    <small id="editor-genres-empty" hidden>No genres yet. Enter your first genre below.</small>
                    <label for="editor-genre-input">Or enter a new genre</label>
                    <input id="editor-genre-input" name="genre" maxlength="80" placeholder="Enter a genre…" autocomplete="off">
                    <button type="button" id="clear-editor-genre">Clear genre</button>
                </fieldset>
                <label
                    >Notes <span>(optional)</span
                    ><textarea
                        name="note"
                        rows="3"
                        maxlength="1000"
                        placeholder="A few spoiler-free words…"
                    ></textarea>
                </label>
                <label
                    >Cover image URL <span>(optional)</span
                    ><input
                        name="imageUrl"
                        type="url"
                        maxlength="2048"
                        placeholder="https://…"
                    /><small
                        >Use an HTTPS image. A trailer thumbnail is used if you
                        leave this blank.</small
                    ></label
                >
                <label
                    >Position in tier<input
                        name="rank"
                        type="number"
                        min="0"
                        max="9999"
                        step="1"
                        value="0"
                        required
                    /><small
                        >Lower numbers appear first. Equal positions sort by
                        title.</small
                    ></label
                >
                <div id="private-editor-fields" hidden></div>
                <p
                    id="form-error"
                    class="error-message"
                    role="alert"
                    hidden
                ></p>
                <div class="form-actions">
                    <button
                        type="button"
                        id="remove-recommendation"
                        class="danger-button"
                        hidden
                    >
                        Remove title</button
                    ><button type="submit" id="publish" class="primary-button">
                        Save title
                    </button>
                </div>
            </form>
        </dialog>`);
    const editor = document.getElementById('recommendation-editor');
    const input = editor.querySelector('[name="genre"]');
    input.addEventListener('input', () => syncGenreSelection(editor));
    editor.querySelector('#clear-editor-genre').addEventListener('click', () => {
        input.value = '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.focus();
    });
    return editor;
}

export function bindTitleAutofill(editor, canEdit) {
    const form = editor.querySelector('form');
    const title = form.elements.namedItem('title');
    const trailer = form.elements.namedItem('trailerUrl');
    const status = document.getElementById('trailer-title-status');
    let lookup, autoTitle = '';
    const reset = () => { lookup?.abort(); lookup = null; autoTitle = ''; status.textContent = ''; };
    form.addEventListener('reset', reset);
    editor.addEventListener('close', reset);
    trailer.addEventListener('input', async () => {
        lookup?.abort(); lookup = null; status.textContent = '';
        if (!editor.open || !canEdit() || (title.value.trim() && title.value !== autoTitle)) return;
        const id = youtubeId(trailer.value.trim());
        if (!id) return;
        const request = new AbortController(); lookup = request;
        const previous = title.value;
        status.textContent = 'Looking up the trailer title…';
        const timer = setTimeout(() => request.abort(), 8000);
        const raw = await getVideoData(`https://www.youtube.com/watch?v=${id}`, { signal: request.signal });
        clearTimeout(timer);
        if (lookup !== request || !editor.open || !canEdit()) return;
        if (title.value !== previous) { status.textContent = ''; return; }
        if (!raw || request.signal.aborted) { status.textContent = 'Title unavailable. Enter it manually.'; return; }
        title.value = autoTitle = cleanTitle(raw).slice(0, 160);
        status.textContent = 'Title filled in. You can edit it.';
    });
}

function syncGenreSelection(editor) {
    const value = editor.querySelector('[name="genre"]').value.trim().toLocaleLowerCase();
    editor.querySelectorAll('#editor-genres button').forEach(button => {
        button.setAttribute('aria-pressed', String(button.textContent.toLocaleLowerCase() === value));
    });
}

export function populateGenrePicker(editor, values) {
    const genres = new Map();
    for (const value of values) {
        const genre = String(value || '').trim();
        if (genre && !genres.has(genre.toLocaleLowerCase())) genres.set(genre.toLocaleLowerCase(), genre);
    }
    const input = editor.querySelector('[name="genre"]');
    const options = [...genres.values()].sort((a, b) => a.localeCompare(b)).map(genre => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = genre;
        button.addEventListener('click', () => {
            input.value = genre;
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });
        return button;
    });
    editor.querySelector('#editor-genres').replaceChildren(...options);
    editor.querySelector('#editor-genres-empty').hidden = options.length > 0;
    syncGenreSelection(editor);
}
