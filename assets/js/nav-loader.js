(function () {
    'use strict';

    const MOBILE_NAV_QUERY = '(max-width: 1100px), (hover: none) and (pointer: coarse)';
    const FOCUSABLE_SELECTOR = [
        'a[href]',
        'button:not([disabled])',
        'input:not([disabled])',
        'select:not([disabled])',
        'textarea:not([disabled])',
        '[tabindex]:not([tabindex="-1"])'
    ].join(',');

    function ensureViewportFit() {
        const viewport = document.querySelector('meta[name="viewport"]');
        if (!viewport) return;

        const content = viewport.getAttribute('content') || '';
        if (!/\bviewport-fit\s*=/i.test(content)) {
            viewport.setAttribute('content', `${content.replace(/,\s*$/, '')}, viewport-fit=cover`);
        }
    }

    function ensureRecentTracker() {
        return new Promise((resolve) => {
            if (window.XWRecentPages) {
                resolve(window.XWRecentPages);
                return;
            }

            const existing = document.querySelector('script[data-xw-recent-pages]');
            if (existing) {
                existing.addEventListener('load', () => resolve(window.XWRecentPages), { once: true });
                existing.addEventListener('error', () => resolve(null), { once: true });
                return;
            }

            const script = document.createElement('script');
            script.src = '/assets/js/recent-pages.js';
            script.async = true;
            script.dataset.xwRecentPages = 'true';
            script.addEventListener('load', () => resolve(window.XWRecentPages), { once: true });
            script.addEventListener('error', () => resolve(null), { once: true });
            document.head.appendChild(script);
        });
    }

    function normalisePath(pathname) {
        let path = pathname || '/';

        try {
            path = decodeURIComponent(path);
        } catch (error) {
            // Keep the encoded path when it contains an invalid escape sequence.
        }

        path = path.replace(/\/index\.html$/i, '/').replace(/\/{2,}/g, '/');
        if (!path.startsWith('/')) path = `/${path}`;
        if (path !== '/' && !path.endsWith('/')) path += '/';
        return path;
    }

    const PAGE_ORDER_KEY = 'xw-page-order';
    const PAGE_ORDERS = [
        { id: 'alpha', label: 'A–Z' },
        { id: 'alpha-desc', label: 'Z–A' },
        { id: 'curated', label: 'Curated' }
    ];
    const pageOrderCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
    let directoryOrderWatching = false;

    function readPageOrder() {
        try {
            const value = localStorage.getItem(PAGE_ORDER_KEY);
            if (PAGE_ORDERS.some((order) => order.id === value)) return value;
        } catch (error) {
            // Ignore private-mode storage failures.
        }
        return 'alpha';
    }

    function writePageOrder(value) {
        try {
            localStorage.setItem(PAGE_ORDER_KEY, value);
        } catch (error) {
            // Ignore private-mode storage failures.
        }
    }

    function sortableEntries(list) {
        return Array.from(list.children).filter((child) => child.matches('li, a.page-card'));
    }

    function entryLabel(entry) {
        const named = entry.querySelector('.nav-item-label, h3');
        return (named ? named.textContent : entry.textContent || '')
            .replace(/\p{Extended_Pictographic}/gu, '')
            .replace(/\uFE0F/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function stampEntryOrder(list) {
        const entries = sortableEntries(list);
        let max = -1;
        entries.forEach((entry) => {
            if (entry.hasAttribute('data-xw-order-index')) {
                max = Math.max(max, Number(entry.dataset.xwOrderIndex));
            }
        });
        entries.forEach((entry) => {
            if (!entry.hasAttribute('data-xw-order-index')) {
                max += 1;
                entry.dataset.xwOrderIndex = String(max);
            }
        });
    }

    function compareEntries(mode, a, b) {
        if (mode === 'curated') {
            return Number(a.dataset.xwOrderIndex) - Number(b.dataset.xwOrderIndex);
        }
        const delta = pageOrderCollator.compare(entryLabel(a), entryLabel(b));
        return mode === 'alpha-desc' ? -delta : delta;
    }

    function sortEntryList(list, mode) {
        stampEntryOrder(list);
        const entries = sortableEntries(list);
        if (entries.length < 2) return;

        const sorted = entries.slice().sort((a, b) => compareEntries(mode, a, b));
        if (sorted.every((entry, index) => entry === entries[index])) return;

        const fragment = document.createDocumentFragment();
        sorted.forEach((entry) => fragment.appendChild(entry));
        list.appendChild(fragment);
    }

    function directoryGrids() {
        return Array.from(document.querySelectorAll('main .page-grid')).filter((grid) => {
            return !grid.closest('#recent-section, #recent-editor, .top-section-grid');
        });
    }

    function applyPageOrder(mode) {
        const order = mode || readPageOrder();
        document.querySelectorAll('.nav-submenu').forEach((list) => sortEntryList(list, order));
        directoryGrids().forEach((grid) => sortEntryList(grid, order));
        document.querySelectorAll('[data-xw-page-order]').forEach((select) => {
            if (select.value !== order) select.value = order;
        });
    }

    function createPageOrderControl(extraClass) {
        const label = document.createElement('label');
        label.className = `xw-page-order${extraClass ? ` ${extraClass}` : ''}`;
        label.title = 'Alphabetical, reverse, or the original curated order';

        const caption = document.createElement('span');
        caption.className = 'xw-page-order-label';
        caption.textContent = 'Order';

        const select = document.createElement('select');
        select.className = 'xw-page-order-select';
        select.dataset.xwPageOrder = 'true';
        PAGE_ORDERS.forEach((order) => {
            const option = document.createElement('option');
            option.value = order.id;
            option.textContent = order.label;
            select.appendChild(option);
        });
        select.value = readPageOrder();
        select.addEventListener('pointerdown', (event) => {
            event.stopPropagation();
        });
        select.addEventListener('change', () => {
            writePageOrder(select.value);
            applyPageOrder(select.value);
        });

        label.appendChild(caption);
        label.appendChild(select);
        return label;
    }

    const NAV_VIEW_KEY = 'xw-nav-view';

    function readNavView() {
        try {
            const value = localStorage.getItem(NAV_VIEW_KEY);
            if (value === 'icons' || value === 'names') return value;
        } catch (error) {
            // Ignore private-mode storage failures.
        }
        return 'icons';
    }

    function writeNavView(value) {
        try {
            localStorage.setItem(NAV_VIEW_KEY, value);
        } catch (error) {
            // Ignore private-mode storage failures.
        }
    }

    function applyNavView(view) {
        const mode = view === 'names' ? 'names' : 'icons';
        document.querySelectorAll('[data-site-header]').forEach((header) => {
            header.dataset.navView = mode;
        });
        document.querySelectorAll('[data-nav-view-choice]').forEach((button) => {
            button.setAttribute('aria-pressed', button.dataset.navViewChoice === mode ? 'true' : 'false');
        });
    }

    function createNavViewToggle() {
        const group = document.createElement('div');
        group.className = 'nav-view-toggle';
        group.setAttribute('role', 'group');
        group.setAttribute('aria-label', 'Page display');

        const choices = [
            {
                id: 'icons',
                label: 'Icons',
                title: 'Large icons',
                icon: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="1.5" width="5" height="5" rx="1"></rect><rect x="9.5" y="1.5" width="5" height="5" rx="1"></rect><rect x="1.5" y="9.5" width="5" height="5" rx="1"></rect><rect x="9.5" y="9.5" width="5" height="5" rx="1"></rect></svg>'
            },
            {
                id: 'names',
                label: 'Names',
                title: 'Names and icons',
                icon: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 4.5h3M7 4.5h7.5M1.5 8h3M7 8h7.5M1.5 11.5h3M7 11.5h7.5"></path></svg>'
            }
        ];

        choices.forEach((choice) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.dataset.navViewChoice = choice.id;
            button.title = choice.title;
            button.innerHTML = `${choice.icon}<span>${choice.label}</span>`;
            button.addEventListener('pointerdown', (event) => {
                event.stopPropagation();
            });
            button.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                writeNavView(choice.id);
                applyNavView(choice.id);
            });
            group.appendChild(button);
        });

        return group;
    }

    function mountNavViewToggles(root) {
        root.querySelectorAll('.nav-submenu a').forEach((link) => {
            if (link.hasAttribute('title')) return;
            const label = link.querySelector('.nav-item-label');
            if (label && label.textContent.trim()) link.title = label.textContent.trim();
        });

        const heading = root.querySelector('.nav-panel-heading');
        if (heading && !heading.querySelector('.nav-view-toggle')) {
            heading.appendChild(createNavViewToggle());
        }

        root.querySelectorAll('.nav-dropdown-header').forEach((dropdownHeader) => {
            if (dropdownHeader.querySelector('.nav-view-toggle')) return;
            const tools = document.createElement('div');
            tools.className = 'nav-dropdown-tools';
            const viewAll = dropdownHeader.querySelector('.nav-view-all');
            if (viewAll) dropdownHeader.insertBefore(tools, viewAll);
            else dropdownHeader.appendChild(tools);
            tools.appendChild(createNavViewToggle());
            if (viewAll) tools.appendChild(viewAll);
        });

        applyNavView(readNavView());
        fitNavIcons(root);
    }

    const iconFitCache = new Map();
    const iconFitPending = new Set();

    function measureIconFit(image) {
        const sample = 64;
        const canvas = document.createElement('canvas');
        canvas.width = sample;
        canvas.height = sample;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) return null;

        context.clearRect(0, 0, sample, sample);
        context.drawImage(image, 0, 0, sample, sample);

        let pixels;
        try {
            pixels = context.getImageData(0, 0, sample, sample).data;
        } catch (error) {
            return null;
        }

        let minX = sample;
        let minY = sample;
        let maxX = -1;
        let maxY = -1;
        for (let y = 0; y < sample; y += 1) {
            for (let x = 0; x < sample; x += 1) {
                if (pixels[((y * sample) + x) * 4 + 3] <= 18) continue;
                if (x < minX) minX = x;
                if (y < minY) minY = y;
                if (x > maxX) maxX = x;
                if (y > maxY) maxY = y;
            }
        }
        if (maxX < 0) return null;

        const width = maxX - minX + 1;
        const height = maxY - minY + 1;
        const long = Math.max(width, height) / sample;
        const short = Math.min(width, height) / sample;
        if (long < 0.04) return null;

        const contain = 0.92 / long;
        const scale = Math.min(Math.max(contain, 1), 2.2);
        const centerX = ((minX + maxX) / 2) / sample;
        const centerY = ((minY + maxY) / 2) / sample;

        return {
            scale,
            x: (0.5 - centerX) * scale * 100,
            y: (0.5 - centerY) * scale * 100
        };
    }

    function applyIconFit(element, fit) {
        if (!fit) return;
        if (fit.scale < 1.05 && Math.abs(fit.x) < 3 && Math.abs(fit.y) < 3) return;
        element.style.setProperty('--icon-scale', fit.scale.toFixed(3));
        element.style.setProperty('--icon-shift-x', `${fit.x.toFixed(2)}%`);
        element.style.setProperty('--icon-shift-y', `${fit.y.toFixed(2)}%`);
    }

    function rememberIconFit(cacheKey, fit) {
        iconFitCache.set(cacheKey, fit);
        document.querySelectorAll('[data-site-header] img.nav-item-icon, [data-site-header] svg.nav-item-icon').forEach((icon) => {
            const key = icon.getAttribute('src') || icon.dataset.iconFitKey;
            if (key === cacheKey) applyIconFit(icon, fit);
        });
    }

    function fitRasterIcon(element, cacheKey, image) {
        if (iconFitCache.has(cacheKey)) {
            applyIconFit(element, iconFitCache.get(cacheKey));
            return;
        }
        if (iconFitPending.has(cacheKey)) return;
        iconFitPending.add(cacheKey);
        const finish = () => {
            iconFitPending.delete(cacheKey);
            rememberIconFit(cacheKey, measureIconFit(image));
        };
        if (image.complete && image.naturalWidth) finish();
        else image.addEventListener('load', finish, { once: true });
    }

    function fitNavIcons(root) {
        root.querySelectorAll('img.nav-item-icon').forEach((icon) => {
            const source = icon.getAttribute('src');
            if (!source) return;
            const probe = new Image();
            probe.src = source;
            fitRasterIcon(icon, source, probe);
        });

        root.querySelectorAll('svg.nav-item-icon').forEach((icon, index) => {
            const cacheKey = icon.dataset.iconFitKey || `svg:${index}:${icon.innerHTML.length}`;
            icon.dataset.iconFitKey = cacheKey;
            if (iconFitCache.has(cacheKey)) {
                applyIconFit(icon, iconFitCache.get(cacheKey));
                return;
            }
            const clone = icon.cloneNode(true);
            clone.setAttribute('width', '64');
            clone.setAttribute('height', '64');
            const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' });
            const url = URL.createObjectURL(blob);
            const probe = new Image();
            probe.onload = () => {
                rememberIconFit(cacheKey, measureIconFit(probe));
                URL.revokeObjectURL(url);
            };
            probe.onerror = () => URL.revokeObjectURL(url);
            probe.src = url;
        });
    }

    function mountNavOrderControls(root) {
        const actions = root.querySelector('.nav-header-actions');
        if (actions && !actions.querySelector('[data-xw-page-order]')) {
            const search = actions.querySelector('[data-nav-search]');
            const control = createPageOrderControl('xw-page-order-header');
            if (search) actions.insertBefore(control, search);
            else actions.prepend(control);
        }

        const heading = root.querySelector('.nav-panel-heading');
        if (heading && !heading.querySelector('[data-xw-page-order]')) {
            heading.appendChild(createPageOrderControl('xw-page-order-panel'));
        }
    }

    function watchDirectoryGrids() {
        if (directoryOrderWatching || !('MutationObserver' in window)) return;
        const grids = directoryGrids();
        if (!grids.length) return;

        directoryOrderWatching = true;
        const observer = new MutationObserver(() => {
            const order = readPageOrder();
            directoryGrids().forEach((grid) => sortEntryList(grid, order));
        });
        grids.forEach((grid) => {
            observer.observe(grid, { childList: true, subtree: true, characterData: true });
        });
    }

    function initDirectoryPageOrder() {
        if (!document.querySelector('.section-jump-bar')) return;

        const bar = document.querySelector('.section-jump-bar');
        if (bar && !bar.querySelector('[data-xw-page-order]')) {
            const tools = document.createElement('div');
            tools.className = 'section-jump-tools';
            tools.appendChild(createPageOrderControl('xw-page-order-directory'));
            const inner = bar.querySelector('.section-jump-bar-inner');
            if (inner) bar.insertBefore(tools, inner);
            else bar.appendChild(tools);
        }

        applyPageOrder();
        watchDirectoryGrids();
    }

    function setActiveNavigation(navRoot) {
        const currentUrl = new URL(window.location.href);
        const currentPath = normalisePath(currentUrl.pathname);
        let bestMatch = null;
        let bestMatchLength = -1;

        navRoot.querySelectorAll('.nav-links a[href]:not(.nav-view-all)').forEach((link) => {
            const linkUrl = new URL(link.getAttribute('href'), window.location.origin);
            if (linkUrl.origin !== window.location.origin || linkUrl.hash) return;

            const linkPath = normalisePath(linkUrl.pathname);
            const pathMatches = linkPath === '/'
                ? currentPath === '/'
                : currentPath === linkPath || currentPath.startsWith(linkPath);

            if (!pathMatches) return;

            const linkPlaylistId = linkUrl.searchParams.get('id');
            if (linkPlaylistId && currentUrl.searchParams.get('id') !== linkPlaylistId) return;

            if (linkPath.length > bestMatchLength || linkPlaylistId) {
                bestMatch = link;
                bestMatchLength = linkPath.length;
            }
        });

        if (!bestMatch) return;

        bestMatch.classList.add('active');
        bestMatch.setAttribute('aria-current', 'page');

        const category = bestMatch.closest('.nav-has-dropdown');
        if (category) {
            category.classList.add('has-active-page');
            const disclosure = category.querySelector('.nav-disclosure');
            if (disclosure) disclosure.classList.add('has-active-page');
        }
    }

    function getVisibleFocusable(container) {
        return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)).filter((element) => {
            if (element.hidden || element.getAttribute('aria-hidden') === 'true') return false;
            if (element.closest('[hidden]')) return false;
            const style = window.getComputedStyle(element);
            return style.display !== 'none' && style.visibility !== 'hidden';
        });
    }

    function initialiseNavigation(placeholder) {
        const header = placeholder.querySelector('[data-site-header]');
        const nav = placeholder.querySelector('.main-nav');
        const toggle = placeholder.querySelector('.nav-toggle');
        const backdrop = placeholder.querySelector('.nav-backdrop');
        const disclosures = Array.from(placeholder.querySelectorAll('.nav-disclosure'));
        const mobileQuery = window.matchMedia(MOBILE_NAV_QUERY);
        let menuOpen = false;
        let lockedScrollY = 0;
        let bodyStyles = null;
        let isolatedElements = [];

        if (!header || !nav || !toggle || !backdrop) return;

        function isMobileMode() {
            return mobileQuery.matches;
        }

        function focusElement(element) {
            if (!element) return;
            try {
                element.focus({ preventScroll: true });
            } catch (error) {
                element.focus();
            }
        }

        function updateHeaderHeight() {
            const height = Math.round(header.getBoundingClientRect().height);
            const value = `${height}px`;
            document.documentElement.style.setProperty('--xw-site-nav-height', value);
            document.documentElement.style.setProperty('--site-nav-height', value);
        }

        function closeDropdown(disclosure, restoreFocus) {
            const panelId = disclosure.getAttribute('aria-controls');
            const panel = panelId ? document.getElementById(panelId) : null;
            disclosure.setAttribute('aria-expanded', 'false');
            disclosure.closest('.nav-has-dropdown')?.classList.remove('is-open');
            if (panel) panel.hidden = true;
            if (restoreFocus) focusElement(disclosure);
        }

        function closeAllDropdowns(exceptDisclosure) {
            disclosures.forEach((disclosure) => {
                if (disclosure !== exceptDisclosure) closeDropdown(disclosure, false);
            });
        }

        function openDropdown(disclosure, focusPosition) {
            const panelId = disclosure.getAttribute('aria-controls');
            const panel = panelId ? document.getElementById(panelId) : null;
            if (!panel) return;

            closeAllDropdowns(disclosure);
            disclosure.setAttribute('aria-expanded', 'true');
            disclosure.closest('.nav-has-dropdown')?.classList.add('is-open');
            panel.hidden = false;

            if (focusPosition) {
                const focusable = getVisibleFocusable(panel);
                const target = focusPosition === 'last'
                    ? focusable[focusable.length - 1]
                    : focusable[0];
                focusElement(target);
            }
        }

        function toggleDropdown(disclosure) {
            const expanded = disclosure.getAttribute('aria-expanded') === 'true';
            if (expanded) {
                closeDropdown(disclosure, false);
            } else {
                openDropdown(disclosure);
            }
        }

        function lockPageScroll() {
            if (bodyStyles) return;

            lockedScrollY = window.scrollY;
            bodyStyles = {
                position: document.body.style.position,
                top: document.body.style.top,
                left: document.body.style.left,
                right: document.body.style.right,
                width: document.body.style.width
            };

            document.body.style.position = 'fixed';
            document.body.style.top = `-${lockedScrollY}px`;
            document.body.style.left = '0';
            document.body.style.right = '0';
            document.body.style.width = '100%';
            document.body.classList.add('nav-open');
            document.documentElement.classList.add('nav-open');
        }

        function unlockPageScroll() {
            if (!bodyStyles) return;

            document.body.style.position = bodyStyles.position;
            document.body.style.top = bodyStyles.top;
            document.body.style.left = bodyStyles.left;
            document.body.style.right = bodyStyles.right;
            document.body.style.width = bodyStyles.width;
            bodyStyles = null;
            document.body.classList.remove('nav-open');
            document.documentElement.classList.remove('nav-open');
            window.scrollTo(0, lockedScrollY);
        }

        function isolateBackgroundContent() {
            isolatedElements = Array.from(document.body.children)
                .filter((element) => element !== placeholder && element.tagName !== 'SCRIPT')
                .map((element) => ({
                    element,
                    wasInert: Boolean(element.inert),
                    ariaHidden: element.getAttribute('aria-hidden')
                }));

            isolatedElements.forEach(({ element }) => {
                if ('inert' in element) {
                    element.inert = true;
                } else {
                    element.setAttribute('aria-hidden', 'true');
                }
            });
        }

        function restoreBackgroundContent() {
            isolatedElements.forEach(({ element, wasInert, ariaHidden }) => {
                if ('inert' in element) {
                    element.inert = wasInert;
                } else if (ariaHidden === null) {
                    element.removeAttribute('aria-hidden');
                } else {
                    element.setAttribute('aria-hidden', ariaHidden);
                }
            });
            isolatedElements = [];
        }

        function openMobileMenu() {
            if (!isMobileMode() || menuOpen) return;

            menuOpen = true;
            header.classList.add('nav-is-open');
            nav.classList.add('active');
            toggle.setAttribute('aria-expanded', 'true');
            toggle.setAttribute('aria-label', 'Close navigation');
            backdrop.removeAttribute('aria-hidden');
            lockPageScroll();
            isolateBackgroundContent();

            window.requestAnimationFrame(() => {
                const firstTarget = nav.querySelector('.nav-top-link, .nav-disclosure');
                focusElement(firstTarget);
            });
        }

        function closeMobileMenu(options) {
            const settings = options || {};
            if (!menuOpen) {
                closeAllDropdowns();
                return;
            }

            menuOpen = false;
            header.classList.remove('nav-is-open');
            nav.classList.remove('active');
            toggle.setAttribute('aria-expanded', 'false');
            toggle.setAttribute('aria-label', 'Open navigation');
            backdrop.setAttribute('aria-hidden', 'true');
            closeAllDropdowns();
            restoreBackgroundContent();
            unlockPageScroll();

            if (settings.restoreFocus !== false) {
                focusElement(toggle);
            }
        }

        function handleGlobalKeydown(event) {
            if (event.key === 'Escape') {
                const expanded = disclosures.find((item) => item.getAttribute('aria-expanded') === 'true');
                if (expanded) {
                    closeDropdown(expanded, true);
                    event.preventDefault();
                    return;
                }

                if (menuOpen) {
                    closeMobileMenu();
                    event.preventDefault();
                }
                return;
            }

            if (event.key !== 'Tab' || !menuOpen || !isMobileMode()) return;

            const focusable = getVisibleFocusable(header).filter((element) => element !== backdrop);
            if (!focusable.length) return;

            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                focusElement(last);
                event.preventDefault();
            } else if (!event.shiftKey && document.activeElement === last) {
                focusElement(first);
                event.preventDefault();
            }
        }

        function focusHomePageSearch() {
            const input = document.getElementById('page-card-search');
            if (!input) return false;

            const jumpBar = document.querySelector('.section-jump-bar');
            const target = jumpBar || input;
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });

            window.setTimeout(() => {
                try {
                    input.focus({ preventScroll: true });
                } catch (error) {
                    input.focus();
                }
                if (typeof input.select === 'function' && input.value) {
                    input.select();
                }
                document.dispatchEvent(new CustomEvent('xw:focus-page-search'));
            }, 180);

            return true;
        }

        function goToHomeSearch() {
            closeAllDropdowns();
            if (menuOpen) closeMobileMenu({ restoreFocus: false });

            if (focusHomePageSearch()) return;

            try {
                sessionStorage.setItem('xw-focus-search', '1');
            } catch (error) {
                // Ignore private-mode storage failures.
            }
            window.location.assign('/pages/All-Pages/#page-card-search');
        }

        toggle.addEventListener('click', () => {
            if (menuOpen) {
                closeMobileMenu();
            } else {
                openMobileMenu();
            }
        });

        backdrop.addEventListener('click', () => closeMobileMenu());

        placeholder.querySelectorAll('[data-nav-search]').forEach((button) => {
            button.addEventListener('click', (event) => {
                event.preventDefault();
                goToHomeSearch();
            });
        });

        disclosures.forEach((disclosure) => {
            disclosure.addEventListener('click', () => toggleDropdown(disclosure));
            disclosure.addEventListener('keydown', (event) => {
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                    openDropdown(disclosure, event.key === 'ArrowUp' ? 'last' : 'first');
                    event.preventDefault();
                }
            });
        });

        nav.addEventListener('click', (event) => {
            const link = event.target.closest('a[href]');
            if (!link) return;
            closeAllDropdowns();
            if (menuOpen) closeMobileMenu({ restoreFocus: false });
        });

        document.addEventListener('keydown', handleGlobalKeydown);
        const outsideInteractionEvent = 'PointerEvent' in window ? 'pointerdown' : 'mousedown';
        document.addEventListener(outsideInteractionEvent, (event) => {
            if (event.target instanceof Element && event.target.closest('.xw-page-order')) return;
            if (!header.contains(event.target)) {
                closeAllDropdowns();
                if (menuOpen) closeMobileMenu({ restoreFocus: false });
            }
        });

        header.addEventListener('focusout', () => {
            if (isMobileMode()) return;
            window.setTimeout(() => {
                if (!header.contains(document.activeElement)) closeAllDropdowns();
            }, 0);
        });

        const handleModeChange = () => {
            closeMobileMenu({ restoreFocus: false });
            closeAllDropdowns();
            updateHeaderHeight();
        };

        if (typeof mobileQuery.addEventListener === 'function') {
            mobileQuery.addEventListener('change', handleModeChange);
        } else {
            mobileQuery.addListener(handleModeChange);
        }

        if ('ResizeObserver' in window) {
            const headerObserver = new ResizeObserver(updateHeaderHeight);
            headerObserver.observe(header);
        } else {
            window.addEventListener('resize', updateHeaderHeight, { passive: true });
        }

        mountNavOrderControls(placeholder);
        mountNavViewToggles(placeholder);
        applyPageOrder();
        setActiveNavigation(nav);
        updateHeaderHeight();
        placeholder.removeAttribute('aria-busy');
        placeholder.classList.add('nav-is-ready');
        document.dispatchEvent(new CustomEvent('xw:navigation-ready'));

        let shouldFocusSearch = location.hash === '#page-card-search';
        try {
            shouldFocusSearch = shouldFocusSearch || sessionStorage.getItem('xw-focus-search') === '1';
            if (shouldFocusSearch) sessionStorage.removeItem('xw-focus-search');
        } catch (error) {
            // Ignore private-mode storage failures.
        }
        if (shouldFocusSearch) {
            window.requestAnimationFrame(() => focusHomePageSearch());
        }
    }

    function renderFallback(placeholder) {
        placeholder.innerHTML = `
            <header class="xw-main-nav-header nav-fallback">
                <div class="header-content">
                    <a href="/" class="logo" aria-label="Xander Wiles — home">
                        <img src="/favicon-dark.svg" alt="" width="32" height="32">
                        <span>Xander Wiles</span>
                    </a>
                    <nav aria-label="Fallback navigation">
                        <a href="/">Home</a>
                        <a href="/pages/All-Pages/#featured">Projects</a>
                        <a href="/pages/About/">About</a>
                    </nav>
                </div>
            </header>`;
        placeholder.removeAttribute('aria-busy');
        placeholder.classList.add('nav-is-ready', 'nav-load-failed');
    }

    ensureViewportFit();

    function runNavLoader() {
        initDirectoryPageOrder();

        ensureRecentTracker().then((api) => {
            if (api && typeof api.recordCurrentPage === 'function') {
                api.recordCurrentPage();
            }
        });

        const placeholder = document.getElementById('main-nav-placeholder');
        if (!placeholder || placeholder.classList.contains('nav-is-ready')) return;

        placeholder.setAttribute('aria-busy', 'true');

        fetch('/nav.html', { credentials: 'same-origin' })
            .then((response) => {
                if (!response.ok) throw new Error(`Navigation request failed (${response.status})`);
                return response.text();
            })
            .then((markup) => {
                placeholder.innerHTML = markup;
                initialiseNavigation(placeholder);
            })
            .catch((error) => {
                console.error('Error loading site navigation:', error);
                renderFallback(placeholder);
            });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', runNavLoader);
    } else {
        runNavLoader();
    }
})();
