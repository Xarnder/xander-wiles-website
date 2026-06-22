(() => {
    const DATA_FILE = 'Home Design Bullets.csv';
    const DEFAULT_SECTION = 'all';
    const DEFAULT_SUBSECTION = 'Ideas';
    const THEME_KEY = 'at-home-theme';
    const CAROUSEL_INTERVAL_MS = 5200;
    const CAROUSEL_TRANSITION_MS = 700;

    const SECTION_ACCENTS = {
        exterior: 0,
        garden: 1,
        kitchen: 2,
        bedroom: 3,
        bathroom: 4,
        'living room': 5,
        'layout floor plan': 6,
        design: 7
    };

    const state = {
        rows: [],
        sections: [],
        activeSection: DEFAULT_SECTION,
        search: '',
        theme: 'dark',
        carousel: {
            pool: [],
            index: 0,
            activePane: 0,
            timer: null,
            transitioning: false
        }
    };

    const el = {
        themeToggle: document.getElementById('themeToggle'),
        mobileMenuToggle: document.getElementById('mobileMenuToggle'),
        mobileMenu: document.getElementById('mobileMenu'),
        mobileTopicNav: document.getElementById('mobileTopicNav'),
        carousel: document.querySelector('.idea-carousel'),
        carouselSlides: Array.from(document.querySelectorAll('.carousel-slide')),
        carouselDots: document.getElementById('carouselDots'),
        carouselCounter: document.getElementById('carouselCounter'),
        heroSectionName: document.getElementById('heroSectionName'),
        ideaCount: document.getElementById('ideaCount'),
        sectionCount: document.getElementById('sectionCount'),
        detailCount: document.getElementById('detailCount'),
        heroHighlights: document.getElementById('heroHighlights'),
        searchInput: document.getElementById('searchInput'),
        visibleCount: document.getElementById('visibleCount'),
        sectionChips: document.getElementById('sectionChips'),
        sectionNav: document.getElementById('sectionNav'),
        activeEyebrow: document.getElementById('activeEyebrow'),
        activeTitle: document.getElementById('activeTitle'),
        activeDescription: document.getElementById('activeDescription'),
        activeMeta: document.getElementById('activeMeta'),
        sectionFeed: document.getElementById('sectionFeed'),
        sectionTemplate: document.getElementById('sectionTemplate'),
        subsectionTemplate: document.getElementById('subsectionTemplate'),
        ideaTemplate: document.getElementById('ideaTemplate')
    };

    function setText(node, value) {
        if (node) node.textContent = value;
    }

    function clean(value) {
        return String(value || '').replace(/\s+/g, ' ').trim();
    }

    function slugify(value) {
        return clean(value)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '') || 'section';
    }

    function normaliseKey(value) {
        return clean(value).toLowerCase();
    }

    function parseCsv(text) {
        const rows = [];
        let row = [];
        let field = '';
        let inQuotes = false;

        for (let i = 0; i < text.length; i += 1) {
            const char = text[i];
            const nextChar = text[i + 1];

            if (char === '"') {
                if (inQuotes && nextChar === '"') {
                    field += '"';
                    i += 1;
                } else {
                    inQuotes = !inQuotes;
                }
                continue;
            }

            if (char === ',' && !inQuotes) {
                row.push(field);
                field = '';
                continue;
            }

            if ((char === '\n' || char === '\r') && !inQuotes) {
                if (char === '\r' && nextChar === '\n') i += 1;
                row.push(field);
                if (row.some((cell) => clean(cell))) rows.push(row);
                row = [];
                field = '';
                continue;
            }

            field += char;
        }

        row.push(field);
        if (row.some((cell) => clean(cell))) rows.push(row);
        return rows;
    }

    function rowsToObjects(csvRows) {
        if (!csvRows.length) return { rows: [] };

        const headers = csvRows[0].map((header) => clean(header));
        const rows = csvRows.slice(1).map((cells) => {
            const row = {};
            headers.forEach((header, headerIndex) => {
                row[header] = clean(cells[headerIndex]);
            });

            return {
                section: row.section || 'More ideas',
                subsection: row.subsection || '',
                level: Number.parseInt(row.level, 10) || 1,
                parentItem: row.parent_item || '',
                title: row.title || '',
                description: row.description || '',
                fullText: row.full_text || ''
            };
        }).filter((row) => row.title || row.description || row.fullText);

        return { rows };
    }

    function createSection(sectionName) {
        return {
            id: slugify(sectionName),
            name: sectionName,
            rows: [],
            roots: [],
            subsections: new Map()
        };
    }

    function createSubsection(name) {
        return { name, roots: [] };
    }

    function buildSections(rows) {
        const sectionMap = new Map();

        rows.forEach((row, index) => {
            const sectionName = row.section || 'More ideas';
            if (!sectionMap.has(sectionName)) {
                sectionMap.set(sectionName, createSection(sectionName));
            }

            const section = sectionMap.get(sectionName);
            section.rows.push({
                ...row,
                id: `${section.id}-${slugify(row.title || row.fullText)}-${index}`,
                children: []
            });
        });

        sectionMap.forEach((section) => {
            const parentsByTitle = new Map();

            section.rows.forEach((item) => {
                if (item.level <= 1 || !item.parentItem) {
                    section.roots.push(item);
                    parentsByTitle.set(normaliseKey(item.title), item);
                }
            });

            section.rows.forEach((item) => {
                if (item.level <= 1 || !item.parentItem) return;

                const parent = parentsByTitle.get(normaliseKey(item.parentItem));
                if (parent) {
                    parent.children.push(item);
                } else {
                    section.roots.push(item);
                }
            });

            section.roots.forEach((item) => {
                const subsectionName = item.subsection || DEFAULT_SUBSECTION;
                if (!section.subsections.has(subsectionName)) {
                    section.subsections.set(subsectionName, createSubsection(subsectionName));
                }
                section.subsections.get(subsectionName).roots.push(item);
            });
        });

        return Array.from(sectionMap.values());
    }

    function itemSearchText(item) {
        const childText = (item.children || [])
            .map((child) => `${child.title} ${child.description} ${child.fullText}`)
            .join(' ');

        return `${item.section} ${item.subsection} ${item.title} ${item.description} ${item.fullText} ${childText}`.toLowerCase();
    }

    function itemMatchesSearch(item, query) {
        if (!query) return true;
        return itemSearchText(item).includes(query);
    }

    function getFilteredSections() {
        const query = state.search.trim().toLowerCase();
        const active = state.activeSection;

        return state.sections
            .filter((section) => active === DEFAULT_SECTION || section.id === active)
            .map((section) => {
                const subsections = new Map();
                let visibleTotal = 0;

                section.subsections.forEach((subsection, subsectionName) => {
                    const roots = subsection.roots
                        .map((item) => {
                            if (!query) return { ...item, displayChildren: item.children };

                            const parentMatches = itemSearchText({ ...item, children: [] }).includes(query);
                            const displayChildren = (item.children || []).filter((child) => itemMatchesSearch(child, query));

                            if (!parentMatches && !displayChildren.length) return null;
                            return {
                                ...item,
                                displayChildren: parentMatches ? item.children : displayChildren
                            };
                        })
                        .filter(Boolean);

                    if (roots.length) {
                        visibleTotal += roots.length;
                        subsections.set(subsectionName, { ...subsection, roots });
                    }
                });

                return { ...section, subsections, visibleTotal };
            })
            .filter((section) => section.visibleTotal > 0);
    }

    function getActiveSection() {
        if (state.activeSection === DEFAULT_SECTION) return null;
        return state.sections.find((section) => section.id === state.activeSection) || null;
    }

    function setActiveSection(sectionId) {
        state.activeSection = state.sections.some((section) => section.id === sectionId) ? sectionId : DEFAULT_SECTION;
        window.location.hash = `section/${state.activeSection}`;
        closeMobileMenu();
        render();
    }

    function updateRouteFromHash() {
        const hash = window.location.hash.replace(/^#/, '');
        const [, sectionId] = hash.split('/');
        state.activeSection = sectionId || DEFAULT_SECTION;
        if (state.activeSection !== DEFAULT_SECTION && !state.sections.some((section) => section.id === state.activeSection)) {
            state.activeSection = DEFAULT_SECTION;
        }
    }

    function shuffleArray(items) {
        const list = [...items];
        for (let i = list.length - 1; i > 0; i -= 1) {
            const j = Math.floor(Math.random() * (i + 1));
            [list[i], list[j]] = [list[j], list[i]];
        }
        return list;
    }

    function getCarouselCandidates() {
        return state.rows.filter((row) => row.title && (row.description || row.fullText));
    }

    function getCarouselAccent(sectionName) {
        const key = clean(sectionName).toLowerCase();
        const match = Object.keys(SECTION_ACCENTS).find((name) => key.includes(name));
        return match ? SECTION_ACCENTS[match] : Math.abs(slugify(sectionName).length) % 8;
    }

    function fillCarouselSlide(slide, item) {
        if (!slide || !item) return;

        const topic = slide.querySelector('.carousel-topic');
        const title = slide.querySelector('.carousel-title');
        const description = slide.querySelector('.carousel-description');
        const accent = getCarouselAccent(item.section);

        slide.dataset.accent = String(accent);
        setText(topic, item.subsection || item.section);
        setText(title, item.title);
        setText(description, item.description || item.fullText);
    }

    function renderCarouselDots() {
        if (!el.carouselDots) return;

        el.carouselDots.innerHTML = '';
        const visibleCount = Math.min(state.carousel.pool.length, 8);

        for (let i = 0; i < visibleCount; i += 1) {
            const dot = document.createElement('button');
            dot.type = 'button';
            dot.className = `carousel-dot${i === state.carousel.index % visibleCount ? ' is-active' : ''}`;
            dot.setAttribute('aria-label', `Go to featured idea ${i + 1}`);
            dot.addEventListener('click', () => {
                stopCarousel();
                state.carousel.index = i;
                const item = state.carousel.pool[state.carousel.index];
                const activeSlide = el.carouselSlides[state.carousel.activePane];
                fillCarouselSlide(activeSlide, item);
                updateCarouselMeta();
                startCarousel();
            });
            el.carouselDots.appendChild(dot);
        }
    }

    function updateCarouselMeta() {
        const total = state.carousel.pool.length;
        const current = total ? state.carousel.index + 1 : 0;
        setText(el.carouselCounter, total ? `${current} / ${total}` : '');

        if (!el.carouselDots) return;
        const visibleCount = Math.min(total, 8);
        el.carouselDots.querySelectorAll('.carousel-dot').forEach((dot, index) => {
            dot.classList.toggle('is-active', index === state.carousel.index % visibleCount);
        });
    }

    function nextCarouselSlide() {
        if (!state.carousel.pool.length || state.carousel.transitioning) return;

        state.carousel.index += 1;
        if (state.carousel.index >= state.carousel.pool.length) {
            state.carousel.pool = shuffleArray(getCarouselCandidates());
            state.carousel.index = 0;
            renderCarouselDots();
        }

        const item = state.carousel.pool[state.carousel.index];
        const incomingIndex = state.carousel.activePane === 0 ? 1 : 0;
        const outgoingIndex = state.carousel.activePane;
        const incoming = el.carouselSlides[incomingIndex];
        const outgoing = el.carouselSlides[outgoingIndex];

        state.carousel.transitioning = true;
        fillCarouselSlide(incoming, item);
        incoming.classList.add('is-entering');
        incoming.removeAttribute('aria-hidden');
        outgoing.classList.add('is-leaving');
        outgoing.setAttribute('aria-hidden', 'true');

        window.setTimeout(() => {
            outgoing.classList.remove('is-active', 'is-leaving');
            incoming.classList.remove('is-entering');
            incoming.classList.add('is-active');
            state.carousel.activePane = incomingIndex;
            state.carousel.transitioning = false;
            updateCarouselMeta();
        }, CAROUSEL_TRANSITION_MS);
    }

    function startCarousel() {
        stopCarousel();
        if (!state.carousel.pool.length) return;
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

        state.carousel.timer = window.setInterval(nextCarouselSlide, CAROUSEL_INTERVAL_MS);
    }

    function stopCarousel() {
        if (state.carousel.timer) {
            window.clearInterval(state.carousel.timer);
            state.carousel.timer = null;
        }
    }

    function initCarousel() {
        const candidates = getCarouselCandidates();
        if (!candidates.length || !el.carouselSlides.length) return;

        state.carousel.pool = shuffleArray(candidates);
        state.carousel.index = 0;
        state.carousel.activePane = 0;

        el.carouselSlides.forEach((slide, index) => {
            slide.classList.remove('is-entering', 'is-leaving');
            slide.classList.toggle('is-active', index === 0);
            slide.toggleAttribute('aria-hidden', index !== 0);
        });

        fillCarouselSlide(el.carouselSlides[0], state.carousel.pool[0]);
        fillCarouselSlide(el.carouselSlides[1], state.carousel.pool[Math.min(1, state.carousel.pool.length - 1)]);
        renderCarouselDots();
        updateCarouselMeta();
        startCarousel();

        el.carousel?.addEventListener('mouseenter', stopCarousel);
        el.carousel?.addEventListener('mouseleave', startCarousel);
        el.carousel?.addEventListener('focusin', stopCarousel);
        el.carousel?.addEventListener('focusout', (event) => {
            if (!el.carousel?.contains(event.relatedTarget)) startCarousel();
        });
    }

    function summarizeSection(section) {
        const subsections = Array.from(section.subsections.keys()).filter((name) => name !== DEFAULT_SUBSECTION);
        if (subsections.length) {
            return `Including ${subsections.slice(0, 3).join(', ')}${subsections.length > 3 ? ', and more' : ''}.`;
        }

        const examples = section.roots.slice(0, 3).map((item) => item.title).filter(Boolean);
        return examples.length
            ? `Featuring ${examples.join(', ')}.`
            : 'Practical and aspirational ideas for this part of the home.';
    }

    function renderStats() {
        const detailTotal = state.rows.filter((row) => row.level > 1 || row.parentItem).length;
        setText(el.ideaCount, String(state.rows.length));
        setText(el.sectionCount, String(state.sections.length));
        setText(el.detailCount, String(detailTotal));

        const activeSection = getActiveSection();
        setText(el.heroSectionName, activeSection ? activeSection.name : 'Every room, considered');

        el.heroHighlights.innerHTML = '';
        state.sections.slice(0, 5).forEach((section) => {
            const item = document.createElement('a');
            const name = document.createElement('span');
            const count = document.createElement('strong');
            item.className = 'highlight-link';
            item.href = `#section/${section.id}`;
            name.textContent = section.name;
            count.textContent = String(section.roots.length);
            item.append(name, count);
            item.addEventListener('click', (event) => {
                event.preventDefault();
                setActiveSection(section.id);
            });
            el.heroHighlights.appendChild(item);
        });
    }

    function renderNavigation() {
        const allCount = state.sections.reduce((total, section) => total + section.roots.length, 0);
        const navItems = [
            { id: DEFAULT_SECTION, name: 'All topics', count: allCount },
            ...state.sections.map((section) => ({ id: section.id, name: section.name, count: section.roots.length }))
        ];

        el.sectionChips.innerHTML = '';
        el.sectionNav.innerHTML = '';
        if (el.mobileTopicNav) el.mobileTopicNav.innerHTML = '';

        navItems.forEach((item) => {
            const isActive = item.id === state.activeSection;

            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = `section-chip${isActive ? ' is-active' : ''}`;
            chip.textContent = item.name;
            chip.addEventListener('click', () => setActiveSection(item.id));
            el.sectionChips.appendChild(chip);

            const link = document.createElement('a');
            const name = document.createElement('span');
            const count = document.createElement('strong');
            link.href = `#section/${item.id}`;
            link.className = `section-link${isActive ? ' is-active' : ''}`;
            name.textContent = item.name;
            count.textContent = String(item.count);
            link.append(name, count);
            link.addEventListener('click', (event) => {
                event.preventDefault();
                setActiveSection(item.id);
            });
            el.sectionNav.appendChild(link);

            if (el.mobileTopicNav) {
                const mobileLink = document.createElement('a');
                const mobileName = document.createElement('span');
                const mobileCount = document.createElement('strong');
                mobileLink.href = `#section/${item.id}`;
                mobileLink.className = `mobile-topic-link${isActive ? ' is-active' : ''}`;
                mobileName.textContent = item.name;
                mobileCount.textContent = String(item.count);
                mobileLink.append(mobileName, mobileCount);
                mobileLink.addEventListener('click', (event) => {
                    event.preventDefault();
                    setActiveSection(item.id);
                });
                el.mobileTopicNav.appendChild(mobileLink);
            }
        });
    }

    function renderFeed() {
        const sections = getFilteredSections();
        const activeSection = getActiveSection();
        const visibleTotal = sections.reduce((total, section) => total + section.visibleTotal, 0);

        setText(el.visibleCount, visibleTotal ? `${visibleTotal} ideas` : '');
        setText(el.activeEyebrow, activeSection ? 'Topic' : 'All topics');
        setText(el.activeTitle, activeSection ? activeSection.name : 'Design ideas');
        setText(
            el.activeDescription,
            activeSection
                ? summarizeSection(activeSection)
                : 'Browse ideas by room, space, and lifestyle.'
        );
        setText(el.activeMeta, state.search ? `Results for “${state.search}”` : '');

        el.sectionFeed.innerHTML = '';

        if (!sections.length) {
            const empty = document.createElement('div');
            empty.className = 'empty-state';
            empty.innerHTML = '<h3>No ideas found</h3><p>Try searching for kitchen, bedroom, garden, lighting, or storage.</p>';
            el.sectionFeed.appendChild(empty);
            return;
        }

        sections.forEach((section) => {
            el.sectionFeed.appendChild(renderSection(section));
        });
    }

    function renderSection(section) {
        const fragment = el.sectionTemplate.content.cloneNode(true);
        const block = fragment.querySelector('.section-block');
        const kicker = fragment.querySelector('.section-kicker');
        const title = fragment.querySelector('.section-title');
        const summary = fragment.querySelector('.section-summary');
        const total = fragment.querySelector('.section-total');
        const subsectionList = fragment.querySelector('.subsection-list');

        block.id = `feed-${section.id}`;
        setText(kicker, 'Topic');
        setText(title, section.name);
        setText(summary, summarizeSection(section));
        setText(total, `${section.visibleTotal} ideas`);

        section.subsections.forEach((subsection) => {
            subsectionList.appendChild(renderSubsection(subsection));
        });

        return fragment;
    }

    function renderSubsection(subsection) {
        const fragment = el.subsectionTemplate.content.cloneNode(true);
        const block = fragment.querySelector('.subsection-block');
        const head = fragment.querySelector('.subsection-head');
        const heading = fragment.querySelector('.subsection-head h4');
        const count = fragment.querySelector('.subsection-head span');
        const grid = fragment.querySelector('.idea-grid');
        const showHeading = subsection.name !== DEFAULT_SUBSECTION;

        if (!showHeading) {
            head.hidden = true;
        } else {
            setText(heading, subsection.name);
            setText(count, `${subsection.roots.length} ideas`);
        }

        subsection.roots.forEach((item) => {
            grid.appendChild(renderIdea(item));
        });

        return fragment;
    }

    function renderIdea(item) {
        const fragment = el.ideaTemplate.content.cloneNode(true);
        const topic = fragment.querySelector('.idea-topic');
        const title = fragment.querySelector('.idea-title');
        const description = fragment.querySelector('.idea-description');
        const relatedBlock = fragment.querySelector('.related-block');
        const relatedList = fragment.querySelector('.related-list');
        const children = item.displayChildren || item.children || [];

        setText(topic, item.subsection && item.subsection !== DEFAULT_SUBSECTION ? item.subsection : item.section);
        setText(title, item.title || item.fullText);
        setText(description, item.description || item.fullText || '');

        if (!children.length) {
            relatedBlock.hidden = true;
        } else {
            relatedList.innerHTML = '';
            children.forEach((child) => {
                const li = document.createElement('li');
                const strong = document.createElement('strong');
                const span = document.createElement('span');
                strong.textContent = child.title;
                span.textContent = child.description || child.fullText || '';
                li.append(strong);
                if (span.textContent) li.append(span);
                relatedList.appendChild(li);
            });
        }

        return fragment;
    }

    function render() {
        renderStats();
        renderNavigation();
        renderFeed();
    }

    async function loadContent() {
        try {
            const dataUrl = new URL(DATA_FILE, window.location.href);
            dataUrl.searchParams.set('v', Date.now().toString());

            const response = await fetch(dataUrl.href, { cache: 'no-store' });
            if (!response.ok) throw new Error(`Request failed with ${response.status}`);

            const text = await response.text();
            const { rows } = rowsToObjects(parseCsv(text));

            state.rows = rows;
            state.sections = buildSections(rows);
            updateRouteFromHash();
            render();
            initCarousel();
        } catch (error) {
            console.error('[AtHome] Could not load content', error);
            el.sectionFeed.innerHTML = '';

            const empty = document.createElement('div');
            empty.className = 'empty-state';
            empty.innerHTML = '<h3>Unable to load ideas</h3><p>Please refresh the page to try again.</p>';
            el.sectionFeed.appendChild(empty);
        }
    }

    function applyTheme(theme) {
        state.theme = theme === 'light' ? 'light' : 'dark';
        document.documentElement.dataset.theme = state.theme;
        localStorage.setItem(THEME_KEY, state.theme);

        if (!el.themeToggle) return;

        const isDark = state.theme === 'dark';
        el.themeToggle.setAttribute('aria-pressed', String(isDark));
        el.themeToggle.setAttribute(
            'aria-label',
            isDark ? 'Switch to light mode' : 'Switch to dark mode'
        );

        const label = el.themeToggle.querySelector('.theme-toggle-label');
        if (label) label.textContent = isDark ? 'Dark' : 'Light';
    }

    function initTheme() {
        const saved = localStorage.getItem(THEME_KEY);
        applyTheme(saved === 'light' ? 'light' : 'dark');
    }

    function closeMobileMenu() {
        if (!el.mobileMenu || !el.mobileMenuToggle) return;

        el.mobileMenu.hidden = true;
        document.body.classList.remove('mobile-menu-open');
        el.mobileMenuToggle.classList.remove('is-open');
        el.mobileMenuToggle.setAttribute('aria-expanded', 'false');
        el.mobileMenuToggle.setAttribute('aria-label', 'Open menu');
    }

    function toggleMobileMenu() {
        if (!el.mobileMenu || !el.mobileMenuToggle) return;

        const isOpening = el.mobileMenu.hidden;
        el.mobileMenu.hidden = !isOpening;
        document.body.classList.toggle('mobile-menu-open', isOpening);
        el.mobileMenuToggle.classList.toggle('is-open', isOpening);
        el.mobileMenuToggle.setAttribute('aria-expanded', String(isOpening));
        el.mobileMenuToggle.setAttribute('aria-label', isOpening ? 'Close menu' : 'Open menu');
    }

    function bindEvents() {
        el.themeToggle?.addEventListener('click', () => {
            applyTheme(state.theme === 'dark' ? 'light' : 'dark');
        });

        el.mobileMenuToggle?.addEventListener('click', toggleMobileMenu);

        el.mobileMenu?.addEventListener('click', (event) => {
            if (event.target === el.mobileMenu) closeMobileMenu();
        });

        el.mobileMenu?.querySelectorAll('a').forEach((link) => {
            link.addEventListener('click', closeMobileMenu);
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') closeMobileMenu();
        });

        el.searchInput.addEventListener('input', (event) => {
            state.search = event.target.value;
            renderFeed();
        });

        window.addEventListener('hashchange', () => {
            updateRouteFromHash();
            closeMobileMenu();
            render();
        });

        window.addEventListener('resize', () => {
            if (window.innerWidth > 760) closeMobileMenu();
        });
    }

    function init() {
        initTheme();
        bindEvents();
        loadContent();
    }

    init();
})();
