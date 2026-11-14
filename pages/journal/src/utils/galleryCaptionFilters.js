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

export function filterGalleryByCaptionTags(entries, selectedTags) {
    const selected = new Set(selectedTags.map(captionTagKey).filter(Boolean));
    if (!selected.size) return entries;
    return entries.flatMap((entry) => {
        const images = entry.images.filter((image) => readImageCaptions(image).taggedCaptions
            .some(({ tag }) => selected.has(captionTagKey(tag))));
        return images.length ? [{ ...entry, images }] : [];
    });
}
