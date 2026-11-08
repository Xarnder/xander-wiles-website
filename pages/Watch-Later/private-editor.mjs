import { mountMediaEditor, bindTitleAutofill } from './media-editor.mjs';
import { isOwner, youtubeId, safeImageUrl } from './recommendations-model.mjs';

export function createPrivateEditor({ getUser, getItems, getTiers, getPeople, save, remove }) {
    const dialog = mountMediaEditor();
    const form = dialog.querySelector('form');
    const $ = id => document.getElementById(id);
    let item, saving = false, newId;
    dialog.querySelector('.eyebrow').textContent = 'PRIVATE WATCH LIST';
    dialog.querySelector('.form-intro').textContent = 'Saved to your private watch list. Only you can see this.';
    const extra = $('private-editor-fields');
    extra.hidden = false;
    extra.innerHTML = `<details><summary>Private watch details</summary>
        <label>Watch status<select name="watchStatus"><option value="first-watch">First watch</option><option value="rewatch">Rewatch</option><option value="new-episodes">New episodes coming</option></select></label>
        <label>Watch with<input name="watchWith" list="editor-people" placeholder="Names separated by commas"></label><datalist id="editor-people"></datalist>
        <div class="form-row"><label>IMDb score<input name="imdbScore"></label><label>Rotten Tomatoes score<input name="rtScore"></label></div>
        <label class="editor-checkbox"><input name="watched" type="checkbox"> Watched</label></details>`;
    const field = name => form.elements.namedItem(name);
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
            if (values.trailerUrl && !video) throw new Error('Use a valid HTTPS YouTube trailer link.');
            if (values.imageUrl && !safeImageUrl(values.imageUrl)) throw new Error('Use a valid HTTPS cover image URL.');
            if (!getTiers().some(t => t.id === values.tier)) throw new Error('Choose a tier.');
            const duplicate = getItems().find(entry => entry.id !== item?.id && (video ? youtubeId(entry.url) === video : entry.movieTitle?.toLowerCase() === values.title.trim().toLowerCase()));
            if (duplicate && !window.confirm(`“${duplicate.movieTitle}” is already in your private list. Save another copy?`)) return;
            busy(true);
            const watched = field('watched').checked;
            await save(item?.id || newId, {
                movieTitle: values.title.trim(), type: values.type, tier: values.tier,
                url: video ? `https://www.youtube.com/watch?v=${video}` : '',
                thumb: values.imageUrl || (video ? `https://i.ytimg.com/vi/${video}/hqdefault.jpg` : ''),
                imageUrl: values.imageUrl, genre: values.genre.trim(), year: values.year,
                note: values.note.trim(), rank: Number(values.rank),
                watchStatus: values.watchStatus, watchWith: values.watchWith,
                imdbScore: values.imdbScore, rtScore: values.rtScore, watched,
                watchedAt: watched ? (item?.watchedAt || Date.now()) : null,
            }, !item);
            dialog.close();
        } catch (error) {
            $('form-error').textContent = error.code ? 'Couldn’t save. Your draft is still here. Please try again.' : error.message;
            $('form-error').hidden = false;
        } finally { busy(false); }
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
            for (const name of ['genre','year','note','watchStatus','watchWith','imdbScore','rtScore']) values[name] = item?.[name] || (name === 'watchStatus' ? 'first-watch' : '');
            for (const [name, value] of Object.entries(values)) field(name).value = value ?? '';
            field('watched').checked = !!item?.watched;
            $('editor-genres').replaceChildren(...[...new Set(getItems().map(i => i.genre).filter(Boolean))].map(g => new Option(g, g)));
            $('editor-people').replaceChildren(...getPeople().map(p => new Option(p.name, p.name)));
            dialog.showModal(); field(item ? 'title' : 'trailerUrl').focus();
        },
    };
}
