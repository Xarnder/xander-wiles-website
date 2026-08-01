// --- UPDATED: assets/js/main.js ---
// This file now handles scripts specific to the HOME PAGE, like the profile picture effect.
// The mobile navigation logic has been moved to nav-loader.js to ensure it runs AFTER the navigation is loaded.

document.addEventListener('DOMContentLoaded', () => {

    const particleCanvas = document.getElementById('particle-canvas');
    if (particleCanvas && typeof initParticleBackground === 'function') {
        initParticleBackground(particleCanvas);
    }

    // --- Unblur Profile Picture After Load (for homepage) ---
    const profilePic = document.querySelector('.profile-picture');

    // This function adds the 'loaded' class to unblur the image.
    const unblurImage = () => {
        if (profilePic) {
            profilePic.classList.add('loaded');
            // Also add to the wrapper if it exists
            const wrapper = profilePic.closest('.profile-picture-wrapper');
            if (wrapper) wrapper.classList.add('loaded');
        }
    };

    if (profilePic) {
        // If the image is already loaded by the time the script runs (e.g., from cache)
        if (profilePic.complete) {
            unblurImage();
        } else {
            // Otherwise, wait for the 'load' event to fire.
            profilePic.addEventListener('load', unblurImage);
        }
    }


    // --- Hidden Test Pages Toggle ---
    const toggleButton = document.getElementById('toggle-hidden-pages');
    const hiddenSection = document.getElementById('hidden-test-pages');

    if (toggleButton && hiddenSection) {
        toggleButton.addEventListener('click', () => {
            const isHidden = hiddenSection.style.display === 'none';
            hiddenSection.style.display = isHidden ? 'block' : 'none';
            toggleButton.textContent = isHidden ? 'Hide Hidden Test Pages' : 'Show Hidden Test Pages';

            if (typeof applyPageCardSearch === 'function') {
                applyPageCardSearch();
            }
        });
    }

    // --- Sticky section jump bar (homepage) ---
    const jumpBar = document.querySelector('.section-jump-bar');
    let sectionIds = [];
    let sections = [];
    let activeId = null;

    const refreshJumpTargets = () => {
        if (!jumpBar) return;
        const jumpLinks = Array.from(jumpBar.querySelectorAll('.section-jump-link:not([hidden]):not(.is-search-hidden)'));
        sectionIds = jumpLinks.map((link) => link.dataset.section).filter(Boolean);
        sections = sectionIds
            .map((id) => document.getElementById(id))
            .filter(Boolean);
        if (!activeId || !sectionIds.includes(activeId)) {
            activeId = sectionIds[0] || null;
        }
    };

    const setActiveLink = (id) => {
        if (!jumpBar) return;
        jumpBar.querySelectorAll('.section-jump-link').forEach((link) => {
            link.classList.toggle('active', link.dataset.section === id);
        });
    };

    const scrollActiveLinkIntoView = (id) => {
        if (!jumpBar) return;
        const active = jumpBar.querySelector(`.section-jump-link[data-section="${id}"]`);
        if (!active || active.hidden) return;
        const inner = jumpBar.querySelector('.section-jump-bar-inner');
        if (!inner) return;
        const linkRect = active.getBoundingClientRect();
        const innerRect = inner.getBoundingClientRect();
        if (linkRect.left < innerRect.left + 8 || linkRect.right > innerRect.right - 8) {
            active.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        }
    };

    const updateActiveFromScroll = () => {
        refreshJumpTargets();
        if (!sections.length || !jumpBar) return;
        const marker = jumpBar.getBoundingClientRect().bottom + 12;
        let current = sections[0].id;

        for (const section of sections) {
            if (section.getBoundingClientRect().top <= marker) {
                current = section.id;
            }
        }

        if (current !== activeId) {
            activeId = current;
            setActiveLink(current);
            scrollActiveLinkIntoView(current);
        }
    };

    if (jumpBar) {
        jumpBar.addEventListener('click', (event) => {
            const link = event.target.closest('.section-jump-link');
            if (!link || link.hidden || link.classList.contains('is-search-hidden')) return;
            const target = document.getElementById(link.dataset.section);
            if (!target) return;
            event.preventDefault();
            history.replaceState(null, '', `#${link.dataset.section}`);
            activeId = link.dataset.section;
            setActiveLink(activeId);
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });

        let ticking = false;
        window.addEventListener('scroll', () => {
            if (ticking) return;
            ticking = true;
            requestAnimationFrame(() => {
                updateActiveFromScroll();
                ticking = false;
            });
        }, { passive: true });

        refreshJumpTargets();
        if (location.hash) {
            const hashId = location.hash.slice(1);
            if (sectionIds.includes(hashId)) {
                activeId = hashId;
                setActiveLink(hashId);
            } else {
                updateActiveFromScroll();
            }
        } else {
            updateActiveFromScroll();
        }
    }

    // --- Page card search (sticky jump bar) ---
    const searchInput = document.getElementById('page-card-search');
    const searchClear = document.getElementById('page-card-search-clear');
    const searchStatus = document.getElementById('page-card-search-status');
    const searchRoot = document.querySelector('.section-jump-search');
    let searchSessionActive = false;
    let searchAllowBlur = false;
    let searchApplyQueued = false;
    let lastSearchQuery = '';

    const normalizeSearchText = (value) => String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .replace(/[^a-z0-9/#.\s_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const getSearchTokens = (query) => normalizeSearchText(query).split(' ').filter(Boolean);

    const getSearchableCards = () => Array.from(document.querySelectorAll('main a.page-card[href]')).filter((card) => {
        if (card.closest('#recent-editor')) return false;
        if (card.closest('#recent-section')) return false;
        if (card.closest('.top-section-grid')) return false;
        return true;
    });

    const isCardAvailableForSearch = (card) => {
        const hiddenRoot = card.closest('#hidden-test-pages');
        if (!hiddenRoot) return true;
        return window.getComputedStyle(hiddenRoot).display !== 'none';
    };

    const cardSearchHaystack = (card) => {
        const title = card.querySelector('h3')?.textContent || '';
        const description = card.querySelector('p:not(.recent-meta)')?.textContent || '';
        const href = card.getAttribute('href') || '';
        return normalizeSearchText(`${title} ${description} ${href}`);
    };

    const cardMatchesSearch = (card, tokens) => {
        if (!tokens.length) return true;
        const haystack = cardSearchHaystack(card);
        return tokens.every((token) => haystack.includes(token));
    };

    const sectionIdForCard = (card) => {
        if (card.closest('#recent-pages-grid') || card.closest('#recent-section')) return 'recent';
        if (card.closest('.best-pages-grid')) return 'featured';
        if (card.closest('.hero-side-stack')) return 'featured';
        const grid = card.closest('.page-grid');
        if (!grid) return null;
        let prev = grid.previousElementSibling;
        while (prev && !prev.classList?.contains('section-title') && prev.id !== 'recent') {
            prev = prev.previousElementSibling;
        }
        if (prev?.id) return prev.id;
        return null;
    };

    const keepSearchFocus = () => {
        if (!searchInput || !searchSessionActive || searchAllowBlur) return;
        if (document.activeElement === searchInput) return;
        searchInput.focus({ preventScroll: true });
    };

    const endSearchSession = ({ clear = false, blur = true } = {}) => {
        searchSessionActive = false;
        searchAllowBlur = true;
        if (clear && searchInput) {
            searchInput.value = '';
            applyPageCardSearch('');
        }
        if (blur && searchInput) searchInput.blur();
        requestAnimationFrame(() => {
            searchAllowBlur = false;
        });
    };

    const applyPageCardSearch = (rawQuery = searchInput ? searchInput.value : '') => {
        if (!searchInput) return;

        const query = String(rawQuery);
        lastSearchQuery = query;
        const tokens = getSearchTokens(query);
        const isSearching = tokens.length > 0;
        const wasSearching = document.body.classList.contains('is-page-searching');
        document.body.classList.toggle('is-page-searching', isSearching);

        if (searchClear) searchClear.hidden = !query;

        const topSectionGrid = document.querySelector('main .top-section-grid');
        if (topSectionGrid) {
            topSectionGrid.classList.toggle('is-search-hidden', isSearching);
        }

        const recentSectionEl = document.getElementById('recent-section');
        if (recentSectionEl) {
            recentSectionEl.classList.toggle('is-search-hidden', isSearching);
        }

        const cards = getSearchableCards();
        const matchedBySection = new Map();
        const matchedHrefs = new Set();

        cards.forEach((card) => {
            const available = isCardAvailableForSearch(card);
            const matches = available && cardMatchesSearch(card, tokens);
            card.classList.toggle('is-search-hidden', isSearching && !matches);
            if (matches) {
                const href = card.getAttribute('href') || '';
                matchedHrefs.add(href);
                const sectionId = sectionIdForCard(card);
                if (sectionId) matchedBySection.set(sectionId, true);
            }
        });

        const matchCount = matchedHrefs.size;

        // Hide section titles / grids with no visible matches while searching
        document.querySelectorAll('main .section-title').forEach((title) => {
            if (!isSearching) {
                title.classList.remove('is-search-hidden');
                return;
            }
            const sectionId = title.id;
            if (sectionId === 'recent') {
                title.classList.add('is-search-hidden');
                return;
            }
            const hasMatch = sectionId ? matchedBySection.has(sectionId) : false;
            title.classList.toggle('is-search-hidden', !hasMatch);
        });

        document.querySelectorAll('main .page-grid').forEach((grid) => {
            if (!isSearching) {
                grid.classList.remove('is-search-hidden');
                return;
            }
            if (grid.closest('#recent-section') || grid.closest('.top-section-grid')) {
                grid.classList.add('is-search-hidden');
                return;
            }
            const hasVisibleCard = Array.from(grid.querySelectorAll('a.page-card[href]'))
                .some((card) => !card.classList.contains('is-search-hidden'));
            grid.classList.toggle('is-search-hidden', !hasVisibleCard);
        });

        if (jumpBar) {
            jumpBar.querySelectorAll('.section-jump-link').forEach((link) => {
                if (!isSearching) {
                    link.classList.remove('is-search-hidden');
                    return;
                }
                const sectionId = link.dataset.section;
                if (sectionId === 'contact' || sectionId === 'recent') {
                    link.classList.add('is-search-hidden');
                    return;
                }
                link.classList.toggle('is-search-hidden', !matchedBySection.has(sectionId));
            });
        }

        if (searchStatus) {
            if (!isSearching) {
                searchStatus.hidden = true;
                searchStatus.textContent = '';
                searchStatus.classList.remove('is-empty');
            } else if (matchCount === 0) {
                searchStatus.hidden = false;
                searchStatus.textContent = 'No pages matched that search.';
                searchStatus.classList.add('is-empty');
            } else {
                searchStatus.hidden = false;
                searchStatus.textContent = `${matchCount} page${matchCount === 1 ? '' : 's'} matched. Press Esc when done.`;
                searchStatus.classList.remove('is-empty');
            }
        }

        refreshJumpTargets();
        updateActiveFromScroll();

        // Bring results up under the search bar when a search starts
        if (isSearching && !wasSearching && jumpBar) {
            requestAnimationFrame(() => {
                jumpBar.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
        }

        // Filtering uses classes only — restore focus if anything stole it
        if (searchSessionActive) {
            keepSearchFocus();
        }
    };

    const queuePageCardSearch = () => {
        if (searchApplyQueued) return;
        searchApplyQueued = true;
        requestAnimationFrame(() => {
            searchApplyQueued = false;
            applyPageCardSearch();
        });
    };

    const openFirstSearchMatch = () => {
        const first = getSearchableCards().find((card) => (
            isCardAvailableForSearch(card) && !card.classList.contains('is-search-hidden')
        ));
        if (!first) return false;
        searchAllowBlur = true;
        searchSessionActive = false;
        first.click();
        return true;
    };

    if (searchInput) {
        searchInput.addEventListener('focus', () => {
            searchSessionActive = true;
            searchAllowBlur = false;
            document.body.classList.add('is-page-searching-focus');
        });

        searchInput.addEventListener('blur', () => {
            document.body.classList.remove('is-page-searching-focus');
            if (!searchSessionActive || searchAllowBlur) return;
            if (!searchInput.value.trim()) {
                searchSessionActive = false;
                return;
            }
            // Keep typing focus until the user explicitly finishes
            requestAnimationFrame(keepSearchFocus);
        });

        searchInput.addEventListener('input', () => {
            searchSessionActive = true;
            queuePageCardSearch();
        });

        searchInput.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                endSearchSession({ clear: true, blur: true });
                return;
            }
            if (event.key === 'Enter') {
                const tokens = getSearchTokens(searchInput.value);
                if (!tokens.length) return;
                event.preventDefault();
                openFirstSearchMatch();
            }
        });

        if (searchClear) {
            searchClear.addEventListener('mousedown', (event) => {
                // Keep focus on input when clearing
                event.preventDefault();
            });
            searchClear.addEventListener('click', () => {
                searchInput.value = '';
                applyPageCardSearch('');
                searchSessionActive = true;
                searchInput.focus({ preventScroll: true });
            });
        }

        // Soft focus lock: while searching, clicks outside results return to the input
        document.addEventListener('pointerdown', (event) => {
            if (!searchSessionActive || !searchInput.value.trim()) return;

            const target = event.target;
            if (!(target instanceof Element)) return;

            if (searchRoot && searchRoot.contains(target)) return;

            // Allow opening a visible result or using jump links / controls
            if (target.closest('a.page-card:not(.is-search-hidden)')) {
                searchAllowBlur = true;
                searchSessionActive = false;
                return;
            }
            if (target.closest('.section-jump-link:not(.is-search-hidden)')) {
                searchAllowBlur = true;
                // Keep filter, release focus so scrolling works
                searchSessionActive = false;
                return;
            }
            if (target.closest('#toggle-hidden-pages') || target.closest('#recent-editor')) {
                searchAllowBlur = true;
                searchSessionActive = false;
                return;
            }

            // Non-result click: keep the session; blur handler will restore focus
        }, true);

        // Keyboard shortcut: / or Cmd/Ctrl+K
        document.addEventListener('keydown', (event) => {
            const tag = event.target instanceof Element ? event.target.tagName : '';
            const isTypingField = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
                || (event.target instanceof HTMLElement && event.target.isContentEditable);

            if ((event.key === 'k' || event.key === 'K') && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                searchSessionActive = true;
                searchInput.focus({ preventScroll: true });
                searchInput.select();
                return;
            }

            if (event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey && !isTypingField) {
                event.preventDefault();
                searchSessionActive = true;
                searchInput.focus({ preventScroll: true });
            }
        });

        // Nav search button / deep-link focus
        document.addEventListener('xw:focus-page-search', () => {
            searchSessionActive = true;
        });

        if (location.hash === '#page-card-search') {
            searchSessionActive = true;
            window.requestAnimationFrame(() => {
                searchInput.focus({ preventScroll: true });
            });
        }

        // Re-apply when dynamic cards (recent / playlists) change
        const searchObserver = new MutationObserver(() => {
            if (!lastSearchQuery.trim() && !searchSessionActive) return;
            queuePageCardSearch();
        });
        const observeTargets = [
            document.getElementById('recent-pages-grid'),
            document.getElementById('homepage-playlist-grid'),
            document.getElementById('hidden-test-pages')
        ].filter(Boolean);
        observeTargets.forEach((node) => {
            searchObserver.observe(node, { childList: true, subtree: true, characterData: true });
        });

        applyPageCardSearch('');
    }

    // --- Recent pages (local cache) ---
    const recentApi = window.XWRecentPages;
    const recentSection = document.getElementById('recent-section');
    const recentGrid = document.getElementById('recent-pages-grid');
    const recentJumpLink = jumpBar
        ? jumpBar.querySelector('.section-jump-link[data-section="recent"]')
        : null;

    const formatRecentTime = (timestamp) => {
        if (!timestamp) return 'Recently used';
        const diffMs = Date.now() - timestamp;
        const mins = Math.floor(diffMs / 60000);
        if (mins < 1) return 'Just now';
        if (mins < 60) return `${mins}m ago`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        if (days < 7) return `${days}d ago`;
        return 'Recently used';
    };

    const escapeHtml = (value) => String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const collectCatalogPages = () => {
        if (!recentApi) return [];
        const map = new Map();

        document.querySelectorAll('a.page-card[href]').forEach((card) => {
            if (card.closest('#recent-pages-grid') || card.closest('#recent-editor')) return;
            const hrefAttr = card.getAttribute('href');
            if (!hrefAttr || hrefAttr.startsWith('#')) return;

            let href = hrefAttr;
            try {
                const url = new URL(hrefAttr, window.location.origin);
                href = url.origin === window.location.origin
                    ? url.pathname + url.search
                    : url.href;
            } catch {
                href = hrefAttr;
            }

            const normalized = recentApi.normalizeHref(href);
            if (!normalized || recentApi.isHomePath(normalized) || map.has(normalized)) return;

            const titleEl = card.querySelector('h3');
            const descEl = card.querySelector('p:not(.recent-meta)');
            const iconEl = card.querySelector('img.page-icon');
            let icon = '';
            if (iconEl) {
                // Use the same resolved URL the browser uses for homepage cards
                icon = iconEl.currentSrc || iconEl.getAttribute('src') || iconEl.getAttribute('data-src') || '';
            } else {
                const emojiIcon = card.querySelector('.page-icon');
                if (emojiIcon && emojiIcon.textContent) icon = emojiIcon.textContent.trim();
            }

            if (icon && recentApi.resolveAbsoluteIcon) {
                icon = recentApi.resolveAbsoluteIcon(icon, normalized);
            }

            map.set(normalized, {
                href: normalized,
                title: (titleEl && titleEl.textContent.trim()) || 'Untitled',
                description: (descEl && descEl.textContent.trim()) || '',
                icon
            });
        });

        return Array.from(map.values()).sort((a, b) => a.title.localeCompare(b.title));
    };

    const catalogPages = () => collectCatalogPages();

    const findCatalogMatch = (href) => {
        if (!recentApi) return null;
        const normalized = recentApi.normalizeHref(href);
        return catalogPages().find((page) => recentApi.normalizeHref(page.href) === normalized) || null;
    };

    const resolveDisplayIcon = (item) => {
        if (!item) return '';
        const match = findCatalogMatch(item.href);
        if (match && match.icon) return match.icon;
        if (recentApi && recentApi.preferHomepageStyleIcon) {
            return recentApi.preferHomepageStyleIcon(item.href, item.icon);
        }
        return item.icon || (recentApi ? recentApi.guessIconFromPath(item.href) : '');
    };

    const syncRecentIconsFromCatalog = () => {
        if (!recentApi) return;
        const items = recentApi.readRecent();
        if (!items.length) return;

        let changed = false;
        const next = items.map((item) => {
            const match = findCatalogMatch(item.href);
            if (!match || !match.icon) return item;
            if (item.icon === match.icon && item.title === match.title && item.description === match.description) {
                return item;
            }
            changed = true;
            return {
                ...item,
                icon: match.icon,
                title: match.title || item.title,
                description: match.description || item.description
            };
        });

        if (changed) {
            try {
                localStorage.setItem(recentApi.STORAGE_KEY, JSON.stringify(next.slice(0, recentApi.MAX_ITEMS)));
            } catch (error) {
                console.warn('Could not sync recent icons:', error);
            }
        }
    };

    const renderRecentPages = () => {
        if (!recentApi || !recentSection || !recentGrid) return;

        syncRecentIconsFromCatalog();

        const items = recentApi.readRecent().filter((item) => item && item.href && !recentApi.isHomePath(item.href));
        if (!items.length) {
            recentSection.hidden = true;
            if (recentJumpLink) recentJumpLink.hidden = true;
            refreshJumpTargets();
            updateActiveFromScroll();
            if (typeof applyPageCardSearch === 'function') {
                applyPageCardSearch();
            }
            return;
        }

        recentGrid.innerHTML = items.map((item) => {
            const title = escapeHtml(item.title || 'Untitled');
            const description = escapeHtml(item.description || 'Continue where you left off.');
            const href = escapeHtml(item.href);
            const meta = escapeHtml(formatRecentTime(item.visitedAt));
            const icon = resolveDisplayIcon(item);
            const isImageIcon = typeof icon === 'string' && (
                icon.startsWith('/') ||
                icon.startsWith('http') ||
                icon.startsWith('data:') ||
                /\.(png|jpg|jpeg|svg|webp|avif|gif|ico)$/i.test(icon)
            );
            const iconHtml = isImageIcon
                ? `<img src="${escapeHtml(icon)}" class="page-icon" alt="" loading="lazy">`
                : icon
                    ? `<span class="page-icon" style="font-size: 2.4rem; display:flex; align-items:center; justify-content:center;">${escapeHtml(icon)}</span>`
                    : `<img src="${escapeHtml(recentApi.guessIconFromPath(item.href))}" class="page-icon" alt="" loading="lazy">`;

            return `
                <a href="${href}" class="page-card glass-card" data-recent-card="true">
                    ${iconHtml}
                    <h3>${title}</h3>
                    <p>${description}</p>
                    <p class="recent-meta">${meta}</p>
                </a>
            `;
        }).join('');

        recentSection.hidden = false;
        if (recentJumpLink) recentJumpLink.hidden = false;
        refreshJumpTargets();
        updateActiveFromScroll();
        if (typeof applyPageCardSearch === 'function') {
            applyPageCardSearch();
        }
    };

    if (recentApi) {
        renderRecentPages();
    }

    // Record visits when leaving via homepage cards (richer title/icon/description)
    document.body.addEventListener('click', (event) => {
        if (!recentApi) return;
        const card = event.target.closest('a.page-card[href]');
        if (!card) return;
        // Don't treat editor actions as visits
        if (card.closest('#recent-editor')) return;
        recentApi.recordFromCard(card);
    });

    // --- Recent pages editor (search + manual add) ---
    const editorSearch = document.getElementById('recent-editor-search');
    const editorResults = document.getElementById('recent-editor-results');
    const editorCurrent = document.getElementById('recent-editor-current');

    const isInRecent = (href) => {
        if (!recentApi) return false;
        const normalized = recentApi.normalizeHref(href);
        return recentApi.readRecent().some((item) => recentApi.normalizeHref(item.href) === normalized);
    };

    const renderIconHtml = (icon) => {
        const resolved = icon || '';
        const isImageIcon = typeof resolved === 'string' && (
            resolved.startsWith('/') ||
            resolved.startsWith('http') ||
            resolved.startsWith('data:') ||
            /\.(png|jpg|jpeg|svg|webp|avif|gif|ico)$/i.test(resolved)
        );
        if (isImageIcon) {
            return `<img src="${escapeHtml(resolved)}" class="page-icon recent-editor-icon" alt="" loading="lazy">`;
        }
        if (resolved) {
            return `<span class="recent-editor-emoji">${escapeHtml(resolved)}</span>`;
        }
        return `<span class="recent-editor-emoji">📄</span>`;
    };

    const renderEditorCurrent = () => {
        if (!recentApi || !editorCurrent) return;
        syncRecentIconsFromCatalog();
        const items = recentApi.readRecent();
        if (!items.length) {
            editorCurrent.innerHTML = '<p class="recent-editor-empty">Nothing in Recent yet. Search above to add a page.</p>';
            return;
        }

        editorCurrent.innerHTML = items.map((item, index) => `
            <div
                class="recent-editor-row is-sortable"
                data-href="${escapeHtml(item.href)}"
                data-index="${index}"
                draggable="true"
            >
                <span class="recent-editor-drag" aria-hidden="true" title="Drag to reorder">⋮⋮</span>
                ${renderIconHtml(resolveDisplayIcon(item))}
                <div class="recent-editor-row-copy">
                    <strong>${escapeHtml(item.title || 'Untitled')}</strong>
                    <span>${escapeHtml(item.description || item.href)}</span>
                </div>
                <div class="recent-editor-controls">
                    <button
                        type="button"
                        class="recent-editor-action is-move"
                        data-action="move-up"
                        data-href="${escapeHtml(item.href)}"
                        aria-label="Move ${escapeHtml(item.title || 'page')} up"
                        ${index === 0 ? 'disabled' : ''}
                    >↑</button>
                    <button
                        type="button"
                        class="recent-editor-action is-move"
                        data-action="move-down"
                        data-href="${escapeHtml(item.href)}"
                        aria-label="Move ${escapeHtml(item.title || 'page')} down"
                        ${index === items.length - 1 ? 'disabled' : ''}
                    >↓</button>
                    <button type="button" class="recent-editor-action is-remove" data-action="remove" data-href="${escapeHtml(item.href)}">Remove</button>
                </div>
            </div>
        `).join('');
    };

    const renderEditorResults = (query = '') => {
        if (!editorResults || !recentApi) return;
        const q = query.trim().toLowerCase();

        if (!q) {
            editorResults.innerHTML = '<p class="recent-editor-empty">Start typing to find a page.</p>';
            return;
        }

        const pages = catalogPages();
        const matches = pages.filter((page) => {
            const haystack = `${page.title} ${page.description} ${page.href}`.toLowerCase();
            return haystack.includes(q);
        }).slice(0, 12);

        if (!matches.length) {
            editorResults.innerHTML = '<p class="recent-editor-empty">No pages matched that search.</p>';
            return;
        }

        editorResults.innerHTML = matches.map((page) => {
            const added = isInRecent(page.href);
            return `
                <div class="recent-editor-row" role="option" data-href="${escapeHtml(page.href)}">
                    ${renderIconHtml(page.icon)}
                    <div class="recent-editor-row-copy">
                        <strong>${escapeHtml(page.title)}</strong>
                        <span>${escapeHtml(page.description || page.href)}</span>
                    </div>
                    <button
                        type="button"
                        class="recent-editor-action${added ? ' is-added' : ''}"
                        data-action="add"
                        data-href="${escapeHtml(page.href)}"
                        ${added ? 'disabled' : ''}
                    >${added ? 'Added' : 'Add'}</button>
                </div>
            `;
        }).join('');
    };

    const refreshEditorAndRecent = () => {
        renderRecentPages();
        renderEditorCurrent();
        if (editorSearch) renderEditorResults(editorSearch.value);
    };

    if (recentApi && editorSearch && editorResults && editorCurrent) {
        renderEditorCurrent();
        renderEditorResults('');

        editorSearch.addEventListener('input', () => {
            renderEditorResults(editorSearch.value);
        });

        const editorRoot = document.getElementById('recent-editor');
        editorRoot.addEventListener('click', (event) => {
            const button = event.target.closest('button[data-action]');
            if (!button) return;

            const href = button.getAttribute('data-href');
            const action = button.getAttribute('data-action');
            if (!href || !action) return;

            if (action === 'add') {
                const page = catalogPages().find((item) => recentApi.normalizeHref(item.href) === recentApi.normalizeHref(href));
                if (!page) return;
                recentApi.upsertRecent({
                    ...page,
                    visitedAt: Date.now()
                }, { moveToFront: true });
                refreshEditorAndRecent();
                return;
            }

            if (action === 'move-up') {
                recentApi.moveRecent(href, -1);
                refreshEditorAndRecent();
                return;
            }

            if (action === 'move-down') {
                recentApi.moveRecent(href, 1);
                refreshEditorAndRecent();
                return;
            }

            if (action === 'remove') {
                recentApi.removeRecent(href);
                refreshEditorAndRecent();
            }
        });

        // Drag-and-drop reorder for the current Recent list
        let dragIndex = null;

        editorCurrent.addEventListener('dragstart', (event) => {
            const row = event.target.closest('.recent-editor-row.is-sortable');
            if (!row || event.target.closest('button')) {
                event.preventDefault();
                return;
            }
            dragIndex = Number(row.dataset.index);
            row.classList.add('is-dragging');
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', row.dataset.href || '');
        });

        editorCurrent.addEventListener('dragend', (event) => {
            const row = event.target.closest('.recent-editor-row.is-sortable');
            if (row) row.classList.remove('is-dragging');
            editorCurrent.querySelectorAll('.recent-editor-row.is-drop-target').forEach((el) => {
                el.classList.remove('is-drop-target');
            });
            dragIndex = null;
        });

        editorCurrent.addEventListener('dragover', (event) => {
            const row = event.target.closest('.recent-editor-row.is-sortable');
            if (!row || dragIndex === null) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
            editorCurrent.querySelectorAll('.recent-editor-row.is-drop-target').forEach((el) => {
                el.classList.remove('is-drop-target');
            });
            row.classList.add('is-drop-target');
        });

        editorCurrent.addEventListener('drop', (event) => {
            const row = event.target.closest('.recent-editor-row.is-sortable');
            if (!row || dragIndex === null) return;
            event.preventDefault();
            const toIndex = Number(row.dataset.index);
            if (Number.isNaN(toIndex) || toIndex === dragIndex) return;
            recentApi.reorderRecent(dragIndex, toIndex);
            refreshEditorAndRecent();
        });
    }

    // --- Featured cards: sequential random gold glint ---
    const featuredCards = Array.from(document.querySelectorAll('.best-pages-grid .page-card'));
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (featuredCards.length > 1 && !prefersReducedMotion) {
        let lastIndex = -1;
        const glintDurationMs = 1350;
        const pauseBetweenMs = () => 700 + Math.random() * 1400;

        const glintNext = () => {
            featuredCards.forEach((card) => card.classList.remove('glinting'));

            let nextIndex = Math.floor(Math.random() * featuredCards.length);
            if (featuredCards.length > 1) {
                while (nextIndex === lastIndex) {
                    nextIndex = Math.floor(Math.random() * featuredCards.length);
                }
            }
            lastIndex = nextIndex;

            const card = featuredCards[nextIndex];
            // Restart animation cleanly if the class was already present
            void card.offsetWidth;
            card.classList.add('glinting');

            window.setTimeout(() => {
                card.classList.remove('glinting');
                window.setTimeout(glintNext, pauseBetweenMs());
            }, glintDurationMs);
        };

        window.setTimeout(glintNext, 600 + Math.random() * 800);
    } else if (featuredCards.length === 1 && !prefersReducedMotion) {
        const pulse = () => {
            const card = featuredCards[0];
            card.classList.remove('glinting');
            void card.offsetWidth;
            card.classList.add('glinting');
            window.setTimeout(() => {
                card.classList.remove('glinting');
                window.setTimeout(pulse, 1800 + Math.random() * 1200);
            }, 1350);
        };
        window.setTimeout(pulse, 800);
    }
});
