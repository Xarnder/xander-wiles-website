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
            window.location.assign('/#page-card-search');
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
                        <a href="/#featured">Projects</a>
                        <a href="/pages/About/">About</a>
                    </nav>
                </div>
            </header>`;
        placeholder.removeAttribute('aria-busy');
        placeholder.classList.add('nav-is-ready', 'nav-load-failed');
    }

    ensureViewportFit();

    document.addEventListener('DOMContentLoaded', function () {
        ensureRecentTracker().then((api) => {
            if (api && typeof api.recordCurrentPage === 'function') {
                api.recordCurrentPage();
            }
        });

        const placeholder = document.getElementById('main-nav-placeholder');
        if (!placeholder) return;

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
    });
})();
