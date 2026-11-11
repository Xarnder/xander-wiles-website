export const MAX_CAPTION_TAG_LENGTH = 40;

export function normalizeCaptionTag(value) {
    return typeof value === 'string'
        ? value.normalize('NFC').trim().replace(/\s+/g, ' ').slice(0, MAX_CAPTION_TAG_LENGTH)
        : '';
}

export function readImageCaptions(image) {
    const caption = typeof image?.caption === 'string' ? image.caption : '';
    const taggedCaptions = (Array.isArray(image?.taggedCaptions) ? image.taggedCaptions : []).flatMap((item) => {
        const tag = normalizeCaptionTag(item?.tag);
        const text = typeof item?.caption === 'string' ? item.caption.trim() : '';
        return tag && text ? [{ tag, caption: text }] : [];
    });
    // The original single-tag format used caption for the tagged text. Read it
    // as a tagged caption, leaving the separate normal caption available.
    const legacyTag = caption.trim() ? normalizeCaptionTag(image?.captionTag) : '';
    if (legacyTag && !taggedCaptions.some((item) => item.tag === legacyTag && item.caption === caption.trim())) {
        taggedCaptions.unshift({ tag: legacyTag, caption: caption.trim() });
    }
    return { caption: legacyTag ? '' : caption, taggedCaptions };
}

export function updateImageCaptions(image, caption, taggedCaptions = []) {
    const { captionTag: _legacyTag, taggedCaptions: _previousTags, ...rest } = image;
    const normalized = readImageCaptions({ caption: typeof caption === 'string' ? caption.trim() : '', taggedCaptions });
    return { ...rest, caption: normalized.caption,
        ...(normalized.taggedCaptions.length ? { taggedCaptions: normalized.taggedCaptions } : {}) };
}

export function hasImageCaption(image) {
    const { caption, taggedCaptions } = readImageCaptions(image);
    return Boolean(caption.trim() || taggedCaptions.length);
}

/** Readable text for exports. Search indexes each caption separately. */
export function imageCaptionText(image) {
    const { caption, taggedCaptions } = readImageCaptions(image);
    return [caption.trim(), ...taggedCaptions.map((item) => `${item.tag}: ${item.caption}`)].filter(Boolean).join(' — ');
}
