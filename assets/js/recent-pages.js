// Shared recent-pages cache for the homepage "Recent" section.
(function (global) {
    const STORAGE_KEY = 'xw-recent-pages';
    const MAX_ITEMS = 8;

    function normalizeHref(href) {
        if (!href) return '';
        try {
            const url = new URL(href, global.location.origin);
            if (url.origin !== global.location.origin) {
                return url.href;
            }
            let path = url.pathname || '/';
            if (path.length > 1 && path.endsWith('/index.html')) {
                path = path.slice(0, -10);
            }
            if (path.length > 1 && !path.endsWith('/')) {
                path += '/';
            }
            return path + url.search;
        } catch {
            return href;
        }
    }

    function isHomePath(href) {
        const path = normalizeHref(href).split('?')[0];
        return path === '/' || path === '/index.html' || path === '';
    }

    function cleanTitle(title) {
        if (!title) return 'Untitled';
        return title
            .replace(/\s*[|–—-]\s*Xander Wiles.*$/i, '')
            .replace(/\s*\|\s*.*$/, '')
            .trim() || title.trim();
    }

    function readRecent() {
        try {
            const raw = global.localStorage.getItem(STORAGE_KEY);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }

    function writeRecent(items) {
        try {
            global.localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_ITEMS)));
        } catch (error) {
            console.warn('Could not save recent pages:', error);
        }
    }

    function upsertRecent(entry, options = {}) {
        if (!entry || !entry.href || isHomePath(entry.href)) return readRecent();

        const moveToFront = options.moveToFront;
        const href = normalizeHref(entry.href);
        const existingList = readRecent();
        const previousIndex = existingList.findIndex((item) => normalizeHref(item.href) === href);
        const previous = previousIndex >= 0 ? existingList[previousIndex] : null;
        const nextItem = {
            href,
            title: cleanTitle(entry.title) || (previous && previous.title) || 'Untitled',
            description: (entry.description || '').trim() || (previous && previous.description) || '',
            icon: entry.icon || (previous && previous.icon) || '',
            visitedAt: entry.visitedAt || Date.now()
        };

        // Default: new items go to front; existing items keep their manual order.
        const shouldMoveToFront = moveToFront === true || (moveToFront !== false && !previous);

        if (previous && !shouldMoveToFront) {
            const updated = existingList.slice();
            updated[previousIndex] = nextItem;
            writeRecent(updated);
            return updated;
        }

        const remaining = existingList.filter((item) => normalizeHref(item.href) !== href);
        remaining.unshift(nextItem);
        writeRecent(remaining);
        return remaining;
    }

    function guessIconFromPath(href) {
        try {
            const url = new URL(href, global.location.origin);
            if (url.origin !== global.location.origin) return '';
            const base = url.pathname.endsWith('/')
                ? url.pathname
                : url.pathname.replace(/\/[^/]*$/, '/');
            return `${base}favicon-dark.svg`;
        } catch {
            return '';
        }
    }

    function resolveAbsoluteIcon(icon, baseHref) {
        if (!icon || typeof icon !== 'string') return '';
        const trimmed = icon.trim();
        if (!trimmed) return '';
        // Emoji / non-URL icons
        if (!trimmed.startsWith('/') && !trimmed.startsWith('http') && !trimmed.startsWith('data:') && !trimmed.includes('.') && !trimmed.includes('/')) {
            return trimmed;
        }
        try {
            const base = baseHref
                ? new URL(baseHref, global.location.origin).href
                : global.location.origin;
            const url = new URL(trimmed, base);
            if (url.origin === global.location.origin) {
                return url.pathname + url.search;
            }
            return url.href;
        } catch {
            return trimmed;
        }
    }

    function preferHomepageStyleIcon(href, icon) {
        const absolute = resolveAbsoluteIcon(icon, href);
        if (!absolute) return guessIconFromPath(href);

        // Homepage cards almost always use favicon-dark.svg (or an explicit png).
        // If we only captured a generic favicon.ico / light svg from the page <head>,
        // prefer the dark SVG path used by the cards.
        if (/\bfavicon\.ico$/i.test(absolute) || /\bfavicon-light\.svg$/i.test(absolute) || /\bfavicon\.svg$/i.test(absolute)) {
            const guessed = guessIconFromPath(href);
            if (guessed) return guessed;
        }
        return absolute;
    }

    function recordCurrentPage() {
        const path = global.location.pathname || '/';
        if (isHomePath(path)) return readRecent();
        if (!path.startsWith('/pages/') && !path.startsWith('/games/') && !path.startsWith('/beta-pages/')) {
            return readRecent();
        }

        const iconLink = document.querySelector(
            'link[rel="icon"][href*="favicon-dark"], link[rel="icon"][type="image/svg+xml"], link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]'
        );

        let icon = '';
        if (iconLink && iconLink.getAttribute('href')) {
            icon = iconLink.getAttribute('href');
        }

        return upsertRecent({
            href: path,
            title: document.title,
            description: '',
            icon: preferHomepageStyleIcon(path, icon),
            visitedAt: Date.now()
        });
    }

    function recordFromCard(anchor) {
        if (!anchor || !anchor.getAttribute) return readRecent();
        const hrefAttr = anchor.getAttribute('href');
        if (!hrefAttr || hrefAttr.startsWith('#')) return readRecent();

        let href = hrefAttr;
        try {
            const url = new URL(hrefAttr, global.location.origin);
            href = url.origin === global.location.origin
                ? url.pathname + url.search
                : url.href;
        } catch {
            href = hrefAttr;
        }

        const titleEl = anchor.querySelector('h3');
        const descEl = anchor.querySelector('p:not(.recent-meta)');
        const iconEl = anchor.querySelector('img.page-icon, .page-icon');

        let icon = '';
        if (iconEl) {
            icon = iconEl.getAttribute('src') || iconEl.getAttribute('data-src') || '';
            if (!icon && iconEl.textContent) {
                icon = iconEl.textContent.trim();
            }
        }

        return upsertRecent({
            href,
            title: titleEl ? titleEl.textContent : '',
            description: descEl ? descEl.textContent : '',
            icon: preferHomepageStyleIcon(href, icon),
            visitedAt: Date.now()
        });
    }

    function removeRecent(href) {
        if (!href) return readRecent();
        const normalized = normalizeHref(href);
        const next = readRecent().filter((item) => normalizeHref(item.href) !== normalized);
        writeRecent(next);
        return next;
    }

    function moveRecent(href, direction) {
        const normalized = normalizeHref(href);
        const items = readRecent();
        const index = items.findIndex((item) => normalizeHref(item.href) === normalized);
        if (index < 0) return items;

        const target = index + direction;
        if (target < 0 || target >= items.length) return items;

        const next = items.slice();
        const [item] = next.splice(index, 1);
        next.splice(target, 0, item);
        writeRecent(next);
        return next;
    }

    function reorderRecent(fromIndex, toIndex) {
        const items = readRecent();
        if (
            fromIndex === toIndex ||
            fromIndex < 0 ||
            toIndex < 0 ||
            fromIndex >= items.length ||
            toIndex >= items.length
        ) {
            return items;
        }

        const next = items.slice();
        const [item] = next.splice(fromIndex, 1);
        next.splice(toIndex, 0, item);
        writeRecent(next);
        return next;
    }

    global.XWRecentPages = {
        STORAGE_KEY,
        MAX_ITEMS,
        normalizeHref,
        isHomePath,
        readRecent,
        upsertRecent,
        removeRecent,
        moveRecent,
        reorderRecent,
        recordCurrentPage,
        recordFromCard,
        guessIconFromPath,
        resolveAbsoluteIcon,
        preferHomepageStyleIcon
    };
})(window);
