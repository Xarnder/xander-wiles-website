import { normalizeCaptionTag, readImageCaptions } from './imageCaption.js';

export const captionTagKey = (tag) => normalizeCaptionTag(tag).toLowerCase();

export function getGalleryCaptionTags(entries) {
    const tags = new Map();
    for (const entry of entries) {
        for (const image of entry.images) {
            const counted = new Set();
            for (const { tag } of readImageCaptions(image).taggedCaptions) {
                const key = captionTagKey(tag);
                if (counted.has(key)) continue;
                counted.add(key);
                const option = tags.get(key) || { key, label: tag, count: 0 };
                tags.set(key, { ...option, count: option.count + 1 });
            }
        }
    }
    return [...tags.values()].sort((a, b) => a.label.localeCompare(b.label));
}

export function filterGalleryByCaptionTags(entries, selectedTags, query = '') {
    const selected = new Set(selectedTags.map(captionTagKey).filter(Boolean));
    const normalize = (text) => typeof text === 'string' ? text.normalize('NFC').toLowerCase().trim() : '';
    const terms = [...new Set(normalize(query).split(/\s+/).filter(Boolean))];
    if (!selected.size && !terms.length) return entries;
    return entries.flatMap((entry) => {
        const images = entry.images.filter((image) => {
            const { caption, taggedCaptions } = readImageCaptions(image);
            if (selected.size && !taggedCaptions.some(({ tag }) => selected.has(captionTagKey(tag)))) return false;
            const captions = [caption, ...taggedCaptions.map((item) => item.caption)].map(normalize);
            // All query words must occur on this photo; other photos on the same
            // day, entry text and tag labels cannot supply a missing word.
            return terms.every((term) => captions.some((text) => text.includes(term)));
        });
        return images.length ? [{ ...entry, images }] : [];
    });
}
