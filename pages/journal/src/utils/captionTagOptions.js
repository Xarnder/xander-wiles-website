import { normalizeCaptionTag, readImageCaptions } from './imageCaption.js';

export const captionOptionKey = (value) => normalizeCaptionTag(value).toLowerCase();

export function mergeCaptionTagOptions(...groups) {
    const tags = new Map();
    for (const value of groups.flat()) {
        const label = normalizeCaptionTag(value);
        const key = captionOptionKey(label);
        if (label && !tags.has(key)) tags.set(key, label);
    }
    return [...tags.values()].sort((a, b) => a.localeCompare(b));
}

export function captionTagsFromImages(images = []) {
    return mergeCaptionTagOptions(...images.map((image) => readImageCaptions(image).taggedCaptions.map(({ tag }) => tag)));
}

export function captionTagsFromSnapshot(snapshot) {
    return mergeCaptionTagOptions(...snapshot.docs.map((doc) => {
        const data = doc.data() || {};
        return captionTagsFromImages(Array.isArray(data.images) ? data.images : data.imageMetadata ? [data.imageMetadata] : []);
    }));
}
