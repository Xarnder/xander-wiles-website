import { useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import Modal from './Modal';
import ImageCaption from './ImageCaption';
import { MAX_CAPTION_TAG_LENGTH, normalizeCaptionTag, readImageCaptions, updateImageCaptions } from '../utils/imageCaption';

// Mounted for one photo at a time so cancelled drafts cannot leak to another photo.
export default function ImageCaptionEditor({ image, images, onSave, onClose }) {
    const initial = readImageCaptions(image);
    const [caption, setCaption] = useState(initial.caption);
    const [taggedCaptions, setTaggedCaptions] = useState(() => initial.taggedCaptions.map((item, id) => ({ ...item, id })));
    const nextId = useRef(initial.taggedCaptions.length);
    const suggestions = [...new Set(['Meal', ...images.flatMap((photo) => readImageCaptions(photo).taggedCaptions.map((item) => item.tag))])];
    const incomplete = taggedCaptions.some((item) => !normalizeCaptionTag(item.tag) || !item.caption.trim());
    const hasDraft = Boolean(caption.trim() || taggedCaptions.length);

    const submit = (event) => {
        event.preventDefault();
        if (incomplete) return;
        onSave(updateImageCaptions(image, caption, taggedCaptions));
    };
    const updateTaggedCaption = (id, changes) => {
        setTaggedCaptions((current) => current.map((item) => item.id === id ? { ...item, ...changes } : item));
    };
    const addTaggedCaption = () => {
        const id = nextId.current++;
        setTaggedCaptions((current) => [...current, { id, tag: current.length ? '' : 'Meal', caption: '', isNew: true }]);
    };

    return (
        <Modal
            isOpen
            onClose={onClose}
            labelledBy="image-caption-title"
            fitVisualViewport
            className="glass-card w-full max-w-md max-h-full overflow-y-auto overscroll-contain p-4 sm:p-6 bg-surface"
            containerClassName="items-start sm:items-center justify-center overflow-y-auto p-4"
            backdropClassName="bg-black/80"
        >
            <form onSubmit={submit} className="space-y-4" onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
                    event.preventDefault();
                    event.stopPropagation();
                    event.currentTarget.requestSubmit();
                }
            }}>
                <div>
                    <h3 id="image-caption-title" className="text-xl font-bold text-text">Image captions</h3>
                    <p className="mt-1 text-sm text-text-muted">Add a description, tagged details, or both.</p>
                </div>
                <div>
                    <label htmlFor="image-caption-text" className="mb-1.5 block text-sm font-medium text-text">Normal caption</label>
                    <textarea id="image-caption-text" value={caption} onChange={(event) => setCaption(event.target.value)}
                        placeholder="Describe this photo (optional)…" rows={3}
                        spellCheck autoCorrect="on" autoCapitalize="sentences"
                        className="glass-input w-full min-h-24 resize-y text-base" />
                </div>
                <datalist id="image-caption-tags">{suggestions.map((label) => <option key={label} value={label} />)}</datalist>
                {taggedCaptions.map((item, index) => {
                    const isMeal = normalizeCaptionTag(item.tag).toLowerCase() === 'meal';
                    return (
                        <fieldset key={item.id} className="min-w-0 space-y-3 rounded-xl border border-border p-3">
                            <legend className="px-1 text-sm font-semibold text-text">Tagged caption {index + 1}</legend>
                            <div>
                                <div className="mb-1 flex items-center justify-between gap-2">
                                    <label htmlFor={`image-caption-tag-${item.id}`} className="text-sm font-medium text-text">Caption tag</label>
                                    <button type="button" aria-label={`Remove tagged caption ${index + 1}`}
                                        onClick={() => setTaggedCaptions((current) => current.filter((row) => row.id !== item.id))}
                                        className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-text-muted hover:bg-white/10 hover:text-red-400">
                                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                                    </button>
                                </div>
                                <input id={`image-caption-tag-${item.id}`} value={item.tag} onChange={(event) => updateTaggedCaption(item.id, { tag: event.target.value })}
                                    list="image-caption-tags" maxLength={MAX_CAPTION_TAG_LENGTH} required
                                    placeholder="Meal, Place, Book…" autoComplete="off" autoCapitalize="words" autoFocus={item.isNew}
                                    aria-describedby={`image-caption-tag-help-${item.id}`} className="glass-input w-full min-h-11 text-base" />
                                <p id={`image-caption-tag-help-${item.id}`} className="mt-1.5 text-xs text-text-muted">Use Meal or type your own tag.</p>
                            </div>
                            <div>
                                <label htmlFor={`image-caption-value-${item.id}`} className="mb-1.5 block text-sm font-medium text-text">{isMeal ? 'Meal name' : 'Caption text'}</label>
                                <textarea id={`image-caption-value-${item.id}`} value={item.caption} onChange={(event) => updateTaggedCaption(item.id, { caption: event.target.value })}
                                    placeholder={isMeal ? 'Chicken curry' : 'Add the details for this tag…'} rows={2}
                                    required spellCheck autoCorrect="on" autoCapitalize="sentences"
                                    className="glass-input w-full min-h-20 resize-y text-base" />
                            </div>
                        </fieldset>
                    );
                })}
                <button type="button" onClick={addTaggedCaption} className="glass-button flex min-h-11 w-full items-center justify-center gap-2 px-3 text-text">
                    <Plus className="h-4 w-4" aria-hidden="true" /> Add tagged caption
                </button>
                {hasDraft && (
                    <div className="rounded-xl border border-border bg-white/5 p-3 text-text">
                        <p className="mb-2 text-xs text-text-muted">Preview</p>
                        <ImageCaption image={{ caption, taggedCaptions }} />
                    </div>
                )}
                {incomplete && <p className="text-sm text-text-muted" role="status">Give each tagged caption a tag and some text, or remove it.</p>}
                <div className="flex flex-wrap gap-2 border-t border-border pt-4">
                    {hasDraft && <button type="button" onClick={() => { setCaption(''); setTaggedCaptions([]); }} className="min-h-11 px-2 text-sm text-text-muted hover:text-red-400">Remove all captions</button>}
                    <div className="ml-auto flex gap-2">
                        <button type="button" onClick={onClose} className="glass-button min-h-11 px-3 text-text">Cancel</button>
                        <button type="submit" disabled={incomplete} className="min-h-11 rounded-lg bg-primary px-4 font-bold text-[#fff] transition-colors hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed">Save captions</button>
                    </div>
                </div>
            </form>
        </Modal>
    );
}
