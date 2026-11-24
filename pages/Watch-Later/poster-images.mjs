export const POSTER_PLACEHOLDER = '/pages/Watch-Later/assets/thumbnail-placeholder.webp';

// A final, self-contained image if even the local placeholder is unavailable.
const emergencyPoster = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 450"><rect width="300" height="450" fill="#10182a"/><circle cx="210" cy="125" r="48" fill="#e6ac63"/><path d="M0 310 90 190 165 285 225 230 300 310V450H0Z" fill="#33415c"/><text x="150" y="375" text-anchor="middle" font-family="sans-serif" font-size="18" fill="#edf4ff">Thumbnail unavailable</text></svg>',
);
const bindings = new WeakMap();

function posterUrl(value, base) {
    if (typeof value !== 'string' || /^(?:\s*|undefined|null|n\/a)$/i.test(value.trim())) return '';
    try {
        const url = new URL(value.trim(), base);
        if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return '';
        // Replace the old third-party placeholder without another network request.
        if (url.hostname === 'via.placeholder.com') return '';
        return url.href;
    } catch { return ''; }
}

// Bind before assigning src: cached failures can fire immediately. Rebinding the
// legacy editor removes the previous item's listeners and queued checks.
export function setPosterImage(image, source, alt = '') {
    bindings.get(image)?.();
    const url = posterUrl(source, image.ownerDocument.baseURI);
    let stage = url && !url.endsWith(POSTER_PLACEHOLDER) ? 'original' : 'placeholder';
    let disposed = false;
    image.classList.add('poster-image');
    image.toggleAttribute('data-poster-fallback', stage === 'placeholder');
    image.alt = alt;
    image.loading = 'lazy';
    image.decoding = 'async';
    image.referrerPolicy = 'no-referrer';
    image.removeAttribute('srcset');
    image.removeAttribute('sizes');

    function cleanup() {
        disposed = true;
        image.removeEventListener('error', fallback);
        image.removeEventListener('load', loaded);
    }
    function fallback() {
        if (disposed) return;
        if (stage === 'original') {
            stage = 'placeholder';
            image.setAttribute('data-poster-fallback', '');
            image.src = POSTER_PLACEHOLDER;
        } else {
            // Never retry the same broken source or create an error loop.
            cleanup();
            image.src = emergencyPoster;
        }
    }
    function loaded() {
        if (disposed) return;
        const { naturalWidth: width, naturalHeight: height } = image;
        // Some YouTube endpoints return a tiny unavailable-image response with
        // HTTP 200 instead of an error for the requested medium/large thumbnail.
        const smallYoutubePreview = stage === 'original' &&
            /^https?:\/\/(?:i\.ytimg\.com|img\.youtube\.com)\/vi(?:_webp)?\/[^/]+\/(?:mq|hq|sd|maxres)default\./i.test(url) &&
            width <= 120 && height <= 90;
        if (width <= 1 || height <= 1 || smallYoutubePreview) fallback();
    }
    bindings.set(image, cleanup);
    image.addEventListener('error', fallback);
    image.addEventListener('load', loaded);
    image.src = stage === 'original' ? url : POSTER_PLACEHOLDER;
    if (image.complete) queueMicrotask(() => { if (!disposed && image.complete) loaded(); });
}
