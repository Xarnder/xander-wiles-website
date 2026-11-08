// Fetch Video Title from YouTube
export async function getVideoData(url, { signal } = {}) {
    try {
        const response = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`, { signal });
        if (!response.ok) throw new Error("Failed to fetch video data");
        const data = await response.json();
        return typeof data.title === "string" ? data.title : null;
    } catch (e) {
        if (!signal?.aborted) console.warn("Could not fetch title:", e);
        return null;
    }
}

// Clean Title: Remove marketing words
export function cleanTitle(title) {
    if (!title) return "Untitled Movie";

    // Remove content in brackets and parentheses first (often contains "Official Trailer" etc)
    let cleaned = title.replace(/[\[\(].*?[\]\)]/g, '');

    // Keywords to remove (case-insensitive)
    const keywords = [
        'official', 'trailer', 'teaser', 'teaser trailer', 'main trailer',
        'final trailer', 'movie', 'film', '4k', 'hd', '1080p',
        'special announcement', 'clip', 'exclusive', 'new', 'premiere'
    ];

    keywords.forEach(word => {
        const regex = new RegExp(`\\b${word}\\b`, 'gi');
        cleaned = cleaned.replace(regex, '');
    });

    // Remove common separators
    cleaned = cleaned.replace(/[\|\-:]/g, ' ');

    // Collapse whitespace and trim
    cleaned = cleaned.replace(/\s+/g, ' ').trim();

    return cleaned || title;
}
