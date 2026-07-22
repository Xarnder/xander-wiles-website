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

            // Optional: Scroll to the section when opening
            if (isHidden) {
                // hiddenSection.scrollIntoView({ behavior: 'smooth' });
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
        const jumpLinks = Array.from(jumpBar.querySelectorAll('.section-jump-link:not([hidden])'));
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
            if (!link || link.hidden) return;
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
