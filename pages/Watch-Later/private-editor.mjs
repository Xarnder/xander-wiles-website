import { mountMediaEditor, bindTitleAutofill, populateGenrePicker } from './media-editor.mjs';
import { isOwner, youtubeId, safeImageUrl } from './recommendations-model.mjs';

export function createPrivateEditor({ getUser, getItems, getTiers, getPeople, getScores, save, remove }) {
    const dialog = mountMediaEditor();
    const form = dialog.querySelector('form');
    const $ = id => document.getElementById(id);
    let item, saving = false, newId;
    let selectedPeople = new Set();
    dialog.querySelector('.eyebrow').textContent = 'PRIVATE WATCH LIST';
    dialog.querySelector('.form-intro').textContent = 'Saved to your private watch list. Only you can see this.';
    const extra = $('private-editor-fields');
    extra.hidden = false;
    extra.innerHTML = `<label>Watch status<select name="watchStatus"><option value="first-watch">First watch</option><option value="rewatch">Rewatch</option><option value="new-episodes">New episodes coming</option></select></label>
        <fieldset class="editor-genre-picker"><legend>Watch with <span>(optional)</span></legend>
            <div id="editor-people" class="editor-genre-options" role="group" aria-label="Watch with"></div>
            <small id="editor-people-empty" hidden>Add people using Manage People on your private list.</small>
        </fieldset>`;
    const field = name => form.elements.namedItem(name);
    const titleLabel = field('title').closest('label');
    const trailerLabel = field('trailerUrl').closest('label');
    field('trailerUrl').required = true;
    trailerLabel.querySelector('span').textContent = '(required)';
    const primaryFields = document.createElement('div');
    primaryFields.className = 'private-primary-fields';
    form.querySelector('.form-intro').after(primaryFields);
    primaryFields.append(titleLabel, trailerLabel, $('trailer-title-status'),
        field('type').closest('label'), field('tier').closest('label'),
        form.querySelector('.editor-genre-picker'), extra);
    form.querySelectorAll('.form-row').forEach(row => { if (!row.children.length) row.remove(); });
    const watchedLabel = document.createElement('label');
    watchedLabel.className = 'editor-checkbox';
    watchedLabel.innerHTML = '<input name="watched" type="checkbox"> Watched';
    $('form-error').before(watchedLabel);
    const scoreStatus = document.createElement('small');
    scoreStatus.id = 'editor-score-status';
    scoreStatus.setAttribute('role', 'status');
    watchedLabel.after(scoreStatus);
    function renderPeople() {
        const names = [...new Set([...getPeople().map(person => person.name), ...selectedPeople].filter(Boolean))]
            .sort((a, b) => a.localeCompare(b));
        $('editor-people').replaceChildren(...names.map(name => {
            const button = document.createElement('button');
            button.type = 'button'; button.textContent = name;
            button.setAttribute('aria-pressed', String(selectedPeople.has(name)));
            button.onclick = () => {
                if (selectedPeople.has(name)) selectedPeople.delete(name); else selectedPeople.add(name);
                button.setAttribute('aria-pressed', String(selectedPeople.has(name)));
            };
            return button;
        }));
        $('editor-people-empty').hidden = names.length > 0;
    }
    const busy = value => { saving = value; form.querySelectorAll('input, select, textarea, button').forEach(el => el.disabled = value); };
    bindTitleAutofill(dialog, () => isOwner(getUser()) && !saving);
    $('close-editor').onclick = () => dialog.close();
    dialog.addEventListener('cancel', event => { if (saving) event.preventDefault(); });
    form.onsubmit = async event => {
        event.preventDefault();
        if (!isOwner(getUser()) || saving) return;
        $('form-error').hidden = true;
        try {
            const values = Object.fromEntries(new FormData(form));
            if (!values.title.trim()) throw new Error('Enter a title.');
            const video = youtubeId(values.trailerUrl);
            if (!video) throw new Error('Use a valid HTTPS YouTube trailer link.');
            if (values.imageUrl && !safeImageUrl(values.imageUrl)) throw new Error('Use a valid HTTPS cover image URL.');
            if (!getTiers().some(t => t.id === values.tier)) throw new Error('Choose a tier.');
            const duplicate = getItems().find(entry => entry.id !== item?.id && (video ? youtubeId(entry.url) === video : entry.movieTitle?.toLowerCase() === values.title.trim().toLowerCase()));
            if (duplicate && !window.confirm(`“${duplicate.movieTitle}” is already in your private list. Save another copy?`)) return;
            busy(true);
            const watched = field('watched').checked;
            const ownerId = getUser().uid;
            const sameTitle = item?.movieTitle === values.title.trim() && item?.type === values.type && (item?.year || '') === values.year;
            let scores = sameTitle ? { imdbScore: item.imdbScore, rtScore: item.rtScore } : {};
            if (!sameTitle || !scores.imdbScore || !scores.rtScore || scores.imdbScore === 'N/A' || scores.rtScore === 'N/A') {
                scoreStatus.textContent = 'Looking up IMDb and Rotten Tomatoes scores…';
                const fetched = await getScores(values.title.trim(), { type: values.type, year: values.year });
                scores = {
                    imdbScore: fetched.imdbScore !== 'N/A' ? fetched.imdbScore : scores.imdbScore,
                    rtScore: fetched.rtScore !== 'N/A' ? fetched.rtScore : scores.rtScore,
                    omdbPoster: fetched.omdbPoster,
                };
            }
            if (!isOwner(getUser()) || getUser().uid !== ownerId) return;
            await save(item?.id || newId, {
                movieTitle: values.title.trim(), type: values.type, tier: values.tier,
                url: video ? `https://www.youtube.com/watch?v=${video}` : '',
                thumb: values.imageUrl || safeImageUrl(scores.omdbPoster) || (video ? `https://i.ytimg.com/vi/${video}/hqdefault.jpg` : ''),
                imageUrl: values.imageUrl, genre: values.genre.trim(), year: values.year,
                note: values.note.trim(), rank: Number(values.rank),
                watchStatus: values.watchStatus, watchWith: [...selectedPeople].join(', '),
                imdbScore: scores.imdbScore || 'N/A', rtScore: scores.rtScore || 'N/A', watched,
                watchedAt: watched ? (item?.watchedAt || Date.now()) : null,
            }, !item);
            dialog.close();
        } catch (error) {
            $('form-error').textContent = error.code ? 'Couldn’t save. Your draft is still here. Please try again.' : error.message;
            $('form-error').hidden = false;
        } finally { busy(false); scoreStatus.textContent = ''; }
    };
    $('remove-recommendation').onclick = async () => {
        if (!item || saving || !isOwner(getUser()) || !window.confirm(`Remove “${item.movieTitle}” from your private list?`)) return;
        busy(true);
        try { await remove(item.id); dialog.close(); }
        catch { $('form-error').textContent = 'Couldn’t remove this title. Please try again.'; $('form-error').hidden = false; }
        finally { busy(false); }
    };
    return {
        close: () => dialog.close(),
        open(data, type = 'movie') {
            if (!isOwner(getUser()) || saving) return;
            item = data; newId = crypto.randomUUID(); form.reset();
            $('form-error').hidden = true;
            $('editor-title').textContent = item ? 'Edit title' : 'Add a title';
            $('remove-recommendation').hidden = !item;
            field('tier').replaceChildren(...getTiers().map(t => new Option(t.name, t.id)));
            const values = { title: item?.movieTitle || '', type: item?.type || type, tier: item?.tier || getTiers().at(-1)?.id,
                trailerUrl: item?.url || '', imageUrl: item?.imageUrl ?? item?.thumb ?? '', rank: item?.rank || 0 };
            for (const name of ['genre','year','note','watchStatus']) values[name] = item?.[name] || (name === 'watchStatus' ? 'first-watch' : '');
            for (const [name, value] of Object.entries(values)) field(name).value = value ?? '';
            field('watched').checked = !!item?.watched;
            populateGenrePicker(dialog, getItems().map(item => item.genre));
            selectedPeople = new Set((item?.watchWith || '').split(', ').filter(Boolean));
            renderPeople();
            scoreStatus.textContent = '';
            dialog.showModal(); field('title').focus();
        },
    };
}
