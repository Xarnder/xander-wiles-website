(() => {
    const DATA_FILE = 'Home Design Bullets.csv';
    const IMAGE_MANIFEST_FILE = 'idea-images.json';
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
        imageManifest: {},
        activeSection: DEFAULT_SECTION,
        search: '',
        theme: 'dark',
        lightbox: {
            images: [],
            index: 0
        },
        carousel: {
            pool: [],
            index: 0,
            activePane: 0,
            timer: null,
            transitionTimer: null,
            transitioning: false,
            eventsBound: false,
            hovered: false
        }
    };

    const el = {
        themeToggle: document.getElementById('themeToggle'),
        mobileMenuToggle: document.getElementById('mobileMenuToggle'),
        mobileMenu: document.getElementById('mobileMenu'),
        mobileTopicNav: document.getElementById('mobileTopicNav'),
        carousel: document.querySelector('.idea-carousel'),
        carouselStage: document.getElementById('carouselStage'),
        carouselMeasure: document.getElementById('carouselMeasure'),
        carouselSlides: Array.from(document.querySelectorAll('.carousel-slide[data-carousel-pane]')),
        carouselDots: document.getElementById('carouselDots'),
        carouselCounter: document.getElementById('carouselCounter'),
        carouselPrev: document.getElementById('carouselPrev'),
        carouselNext: document.getElementById('carouselNext'),
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
        ideaTemplate: document.getElementById('ideaTemplate'),
        imageLightbox: document.getElementById('imageLightbox'),
        lightboxImage: document.getElementById('lightboxImage'),
        lightboxCaption: document.getElementById('lightboxCaption'),
        lightboxCounter: document.getElementById('lightboxCounter'),
        lightboxPrev: document.getElementById('lightboxPrev'),
        lightboxNext: document.getElementById('lightboxNext'),
        lightboxClose: document.getElementById('lightboxClose')
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

    function ideaKey(section, title, parentItem = '') {
        const sectionSlug = slugify(section || 'more-ideas');
        const titleSlug = slugify(title || 'idea');
        if (parentItem) {
            return `${sectionSlug}::${slugify(parentItem)}::${titleSlug}`;
        }
        return `${sectionSlug}::${titleSlug}`;
    }

    function parseImageList(value) {
        return clean(value)
            .split('|')
            .map((entry) => clean(entry))
            .filter(Boolean);
    }

    function resolveImageSrc(src) {
        if (!src) return '';
        if (/^(https?:)?\/\//i.test(src) || src.startsWith('data:')) return src;
        return new URL(src, window.location.href).href;
    }

    function getItemImages(item) {
        const fromRow = parseImageList(item.images);
        const fromManifest = getManifestImagesForItem(item);
        const merged = [...fromRow, ...fromManifest];
        return [...new Set(merged.map(resolveImageSrc))];
    }

    function createImageElement(src, alt) {
        const img = document.createElement('img');
        img.src = src;
        img.alt = alt;
        img.loading = 'lazy';
        img.decoding = 'async';
        img.addEventListener('error', () => {
            const button = img.closest('.idea-media-button');
            const frame = img.closest('.carousel-media-frame');
            const track = img.closest('.idea-media-track');
            const media = img.closest('.idea-media');
            const slide = img.closest('.carousel-slide');

            button?.remove();
            frame?.remove();

            if (track && !track.children.length) {
                media?.setAttribute('hidden', '');
                media?.closest('.idea-card')?.classList.remove('has-media');
            }

            if (slide && !slide.querySelector('.carousel-media-frame')) {
                slide.classList.remove('has-media');
                slide.querySelector('.carousel-media')?.setAttribute('hidden', '');
            }
        });
        return img;
    }

    function attachImagesToRow(row, index = 0) {
        const legacyKey = ideaKey(row.section, row.title, row.level > 1 ? row.parentItem : '');
        const ideaId = clean(row.idea_id) || row.ideaId || `idea-${String(index + 1).padStart(4, '0')}`;
        return {
            ...row,
            ideaId,
            ideaKey: legacyKey,
            sortIndex: Number.isFinite(row.sortIndex) ? row.sortIndex : index,
            images: parseImageList(row.images).join('|')
        };
    }

    function getManifestImagesForItem(item) {
        if (!item) return [];

        const byId = state.imageManifest[item.ideaId] || [];
        const byLegacy = item.ideaKey ? (state.imageManifest[item.ideaKey] || []) : [];
        return [...new Set([...byId, ...byLegacy].map(clean).filter(Boolean))];
    }

    function migrateImageManifest(manifest, rows) {
        const migrated = {};
        const legacyToId = new Map(rows.map((row) => [row.ideaKey, row.ideaId]));

        Object.entries(manifest).forEach(([key, value]) => {
            if (key.startsWith('_')) {
                migrated[key] = value;
                return;
            }

            const images = Array.isArray(value) ? value.map(clean).filter(Boolean) : parseImageList(value);
            const targetId = legacyToId.get(key) || key;
            const existing = migrated[targetId] || [];
            migrated[targetId] = [...new Set([...existing, ...images])];
        });

        return migrated;
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

    function firestoreRowsToObjects(firestoreRows) {
        const rows = firestoreRows.map((row, index) => {
            const parsed = {
                idea_id: row.idea_id || row.ideaId || '',
                section: row.section || 'More ideas',
                subsection: row.subsection || '',
                level: Number.parseInt(row.level, 10) || 1,
                parentItem: row.parent_item || row.parentItem || '',
                title: row.title || '',
                description: row.description || '',
                fullText: row.full_text || row.fullText || '',
                images: row.images || '',
                sortIndex: Number.isFinite(row.sortIndex) ? row.sortIndex : index
            };

            return attachImagesToRow(parsed, index);
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
        return state.rows.filter((row) => row.title && getItemImages(row).length > 0);
    }

    function filterLoadableCarouselCandidates(rows) {
        return Promise.all(rows.map((row) => new Promise((resolve) => {
            const src = getItemImages(row)[0];
            if (!src) {
                resolve(null);
                return;
            }

            const img = new Image();
            img.onload = () => resolve(row);
            img.onerror = () => resolve(null);
            img.src = src;
        }))).then((results) => results.filter(Boolean));
    }

    function getCarouselAccent(sectionName) {
        const key = clean(sectionName).toLowerCase();
        const match = Object.keys(SECTION_ACCENTS).find((name) => key.includes(name));
        return match ? SECTION_ACCENTS[match] : Math.abs(slugify(sectionName).length) % 8;
    }

    function fillCarouselSlide(slide, item) {
        if (!slide || !item) return;

        const copy = slide.querySelector('.carousel-copy') || slide;
        const topic = copy.querySelector('.carousel-topic') || slide.querySelector('.carousel-topic');
        const title = copy.querySelector('.carousel-title') || slide.querySelector('.carousel-title');
        const description = copy.querySelector('.carousel-description') || slide.querySelector('.carousel-description');
        const media = slide.querySelector('.carousel-media');
        const accent = getCarouselAccent(item.section);
        const images = getItemImages(item);

        slide.dataset.accent = String(accent);
        slide.classList.add('has-media');
        setText(topic, item.subsection || item.section);
        setText(title, item.title);
        setText(description, item.description || item.fullText || '');

        if (!media || !images.length) {
            media?.setAttribute('hidden', '');
            slide.classList.remove('has-media');
            fitCarouselTitle(title);
            return;
        }

        media.innerHTML = '';
        media.removeAttribute('hidden');

        const figure = document.createElement('figure');
        figure.className = 'carousel-media-frame';
        const img = createImageElement(images[0], item.title || 'Featured idea image');
        img.addEventListener('load', () => {
            if (!img.naturalWidth || !img.naturalHeight) return;
            const ratio = img.naturalWidth / img.naturalHeight;
            if (ratio > 1.05) figure.dataset.orientation = 'landscape';
            else if (ratio < 0.95) figure.dataset.orientation = 'portrait';
            else figure.dataset.orientation = 'square';
        });
        img.addEventListener('click', () => openLightbox(images, 0, item.title));
        figure.appendChild(img);
        media.appendChild(figure);
        fitCarouselTitle(title);
    }

    const CAROUSEL_TITLE_MIN_PX = 16;
    const CAROUSEL_TITLE_MAX_LINES = 4;

    function fitCarouselTitle(titleEl) {
        if (!titleEl) return;

        titleEl.style.fontSize = '';
        const styles = getComputedStyle(titleEl);
        let size = parseFloat(styles.fontSize);
        if (!size) return;

        const readLineHeight = () => {
            const current = getComputedStyle(titleEl);
            const lh = parseFloat(current.lineHeight);
            return Number.isFinite(lh) ? lh : size * 0.95;
        };

        let lineHeight = readLineHeight();
        let maxHeight = lineHeight * CAROUSEL_TITLE_MAX_LINES;

        while (titleEl.scrollHeight > maxHeight + 1 && size > CAROUSEL_TITLE_MIN_PX) {
            size -= 0.5;
            titleEl.style.fontSize = `${size}px`;
            lineHeight = readLineHeight();
            maxHeight = lineHeight * CAROUSEL_TITLE_MAX_LINES;
        }
    }

    function measureCarouselStageHeight() {
        if (!el.carouselMeasure || !el.carouselStage) return 0;

        const stageWidth = el.carouselStage.getBoundingClientRect().width;
        if (stageWidth > 0) {
            el.carouselMeasure.style.width = `${stageWidth}px`;
        }

        const slides = [...el.carouselMeasure.querySelectorAll('.carousel-slide-measure')];
        if (!slides.length) return 0;

        let maxHeight = 0;
        slides.forEach((slide) => {
            fitCarouselTitle(slide.querySelector('.carousel-title'));
            maxHeight = Math.max(maxHeight, slide.offsetHeight, slide.scrollHeight);
        });

        return Math.ceil(maxHeight);
    }

    function lockCarouselStageHeight() {
        if (!el.carouselStage) return;

        let height = measureCarouselStageHeight();

        if (!height) {
            const active = el.carouselSlides[state.carousel.activePane] || el.carouselSlides[0];
            if (active) {
                fitCarouselTitle(active.querySelector('.carousel-title'));
                height = Math.max(active.scrollHeight, active.offsetHeight);
            }
        }

        height = Math.max(Math.ceil(height || 0), 280);
        el.carouselStage.style.height = `${height}px`;
        el.carouselStage.style.minHeight = `${height}px`;

        const activeSlide = el.carouselSlides[state.carousel.activePane] || el.carouselSlides[0];
        if (activeSlide) {
            fitCarouselTitle(activeSlide.querySelector('.carousel-title'));
        }
    }

    function clearCarouselStageHeight() {
        if (!el.carouselStage) return;
        el.carouselStage.style.height = '';
        el.carouselStage.style.minHeight = '';
    }

    async function buildAndLockCarouselMeasure(pool) {
        buildCarouselMeasure(pool);
        await waitForCarouselMeasureImages();
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        lockCarouselStageHeight();
    }

    function createCarouselMeasureSlide() {
        const slide = document.createElement('article');
        slide.className = 'carousel-slide-measure';
        slide.innerHTML = `
            <div class="carousel-media" hidden></div>
            <div class="carousel-copy">
                <span class="carousel-topic"></span>
                <h2 class="carousel-title"></h2>
                <p class="carousel-description"></p>
                <a class="carousel-cta" href="#content">Browse all ideas</a>
            </div>
        `;
        return slide;
    }

    function buildCarouselMeasure(pool) {
        if (!el.carouselMeasure) return;

        el.carouselMeasure.innerHTML = '';
        pool.forEach((item) => {
            const slide = createCarouselMeasureSlide();
            fillCarouselSlide(slide, item);
            el.carouselMeasure.appendChild(slide);
        });
    }

    function waitForCarouselMeasureImages() {
        if (!el.carouselMeasure) return Promise.resolve();

        const images = [...el.carouselMeasure.querySelectorAll('img')];
        if (!images.length) return Promise.resolve();

        return Promise.all(images.map((img) => new Promise((resolve) => {
            if (img.complete) {
                resolve();
                return;
            }

            img.addEventListener('load', resolve, { once: true });
            img.addEventListener('error', resolve, { once: true });
        })));
    }

    function resetCarouselSlideStates() {
        if (state.carousel.transitionTimer) {
            window.clearTimeout(state.carousel.transitionTimer);
            state.carousel.transitionTimer = null;
        }

        state.carousel.transitioning = false;

        el.carouselSlides.forEach((slide, index) => {
            slide.classList.remove('is-entering', 'is-leaving');
            slide.classList.toggle('is-active', index === state.carousel.activePane);
            slide.toggleAttribute('aria-hidden', index !== state.carousel.activePane);
        });

        updateCarouselNavButtons();
    }

    function showCarouselItemInstant(item) {
        if (!item) return;

        resetCarouselSlideStates();
        fillCarouselSlide(el.carouselSlides[state.carousel.activePane], item);
        updateCarouselMeta();
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

        updateCarouselNavButtons();
    }

    function updateCarouselNavButtons() {
        const enabled = state.carousel.pool.length > 1;
        if (el.carouselPrev) el.carouselPrev.disabled = !enabled;
        if (el.carouselNext) el.carouselNext.disabled = !enabled;
    }

    function canUseCarouselKeyboard() {
        if (el.carousel?.hidden || state.carousel.pool.length <= 1) return false;
        if (!el.imageLightbox?.hidden) return false;
        if (!document.getElementById('imageManager')?.hidden) return false;

        const active = document.activeElement;
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) {
            if (!el.carousel?.contains(active)) return false;
        }

        if (el.carousel?.contains(active)) return true;
        return state.carousel.hovered;
    }

    function transitionToCarouselItem(item) {
        return new Promise((resolve) => {
            if (!item || state.carousel.transitioning || !el.carouselSlides.length) {
                resolve(false);
                return;
            }

            if (state.carousel.transitionTimer) {
                window.clearTimeout(state.carousel.transitionTimer);
                state.carousel.transitionTimer = null;
            }

            const incomingIndex = state.carousel.activePane === 0 ? 1 : 0;
            const outgoingIndex = state.carousel.activePane;
            const incoming = el.carouselSlides[incomingIndex];
            const outgoing = el.carouselSlides[outgoingIndex];

            state.carousel.transitioning = true;
            updateCarouselNavButtons();

            fillCarouselSlide(incoming, item);
            incoming.classList.add('is-entering');
            incoming.removeAttribute('aria-hidden');
            outgoing.classList.add('is-leaving');
            outgoing.setAttribute('aria-hidden', 'true');

            state.carousel.transitionTimer = window.setTimeout(() => {
                state.carousel.transitionTimer = null;
                outgoing.classList.remove('is-active', 'is-leaving');
                incoming.classList.remove('is-entering');
                incoming.classList.add('is-active');
                state.carousel.activePane = incomingIndex;
                state.carousel.transitioning = false;
                updateCarouselMeta();
                resolve(true);
            }, CAROUSEL_TRANSITION_MS);
        });
    }

    async function stepCarousel(direction, { instant = false } = {}) {
        if (!state.carousel.pool.length) return;
        if (!instant && state.carousel.transitioning) return;

        stopCarousel();

        let nextIndex = state.carousel.index + direction;

        if (nextIndex >= state.carousel.pool.length) {
            const refreshed = await filterLoadableCarouselCandidates(getCarouselCandidates());
            state.carousel.pool = shuffleArray(refreshed);
            await buildAndLockCarouselMeasure(state.carousel.pool);
            renderCarouselDots();
            if (!state.carousel.pool.length) {
                if (el.carousel) el.carousel.hidden = true;
                updateCarouselNavButtons();
                return;
            }
            nextIndex = 0;
        } else if (nextIndex < 0) {
            nextIndex = state.carousel.pool.length - 1;
        }

        state.carousel.index = nextIndex;
        const item = state.carousel.pool[nextIndex];

        if (instant) {
            showCarouselItemInstant(item);
            startCarousel();
            return;
        }

        await transitionToCarouselItem(item);
        startCarousel();
    }

    async function nextCarouselSlide() {
        await stepCarousel(1);
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

    async function initCarousel() {
        const candidates = await filterLoadableCarouselCandidates(getCarouselCandidates());
        stopCarousel();

        if (el.carousel) {
            el.carousel.hidden = !candidates.length;
        }

        if (!candidates.length || !el.carouselSlides.length) {
            clearCarouselStageHeight();
            return;
        }

        state.carousel.pool = shuffleArray(candidates);
        state.carousel.index = 0;
        state.carousel.activePane = 0;

        await buildAndLockCarouselMeasure(state.carousel.pool);

        el.carouselSlides.forEach((slide, index) => {
            slide.classList.remove('is-entering', 'is-leaving');
            slide.classList.toggle('is-active', index === 0);
            slide.toggleAttribute('aria-hidden', index !== 0);
        });

        fillCarouselSlide(el.carouselSlides[0], state.carousel.pool[0]);
        fillCarouselSlide(el.carouselSlides[1], state.carousel.pool[Math.min(1, state.carousel.pool.length - 1)]);
        lockCarouselStageHeight();
        renderCarouselDots();
        updateCarouselMeta();
        startCarousel();

        if (state.carousel.eventsBound) return;

        state.carousel.eventsBound = true;
        el.carousel?.addEventListener('mouseenter', () => {
            state.carousel.hovered = true;
            stopCarousel();
        });
        el.carousel?.addEventListener('mouseleave', () => {
            state.carousel.hovered = false;
            startCarousel();
        });
        el.carousel?.addEventListener('focusin', stopCarousel);
        el.carousel?.addEventListener('focusout', (event) => {
            if (!el.carousel?.contains(event.relatedTarget)) startCarousel();
        });
        el.carouselPrev?.addEventListener('click', () => stepCarousel(-1, { instant: true }));
        el.carouselNext?.addEventListener('click', () => stepCarousel(1, { instant: true }));
    }

    let carouselResizeTimer = null;

    function scheduleCarouselMeasureRefresh() {
        if (!state.carousel.pool.length) return;

        if (carouselResizeTimer) window.clearTimeout(carouselResizeTimer);
        carouselResizeTimer = window.setTimeout(() => {
            carouselResizeTimer = null;
            buildAndLockCarouselMeasure(state.carousel.pool);
        }, 150);
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

    function renderIdeaMedia(container, images, caption) {
        if (!container || !images.length) {
            if (container) container.hidden = true;
            return;
        }

        container.hidden = false;
        container.innerHTML = '';

        const track = document.createElement('div');
        track.className = `idea-media-track${images.length > 1 ? ' has-multiple' : ''}`;

        images.forEach((src, index) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'idea-media-button';
            button.setAttribute('aria-label', `View image ${index + 1} for ${caption}`);

            const img = createImageElement(src, `${caption} — image ${index + 1}`);
            button.appendChild(img);
            button.addEventListener('click', () => openLightbox(images, index, caption));
            track.appendChild(button);
        });

        container.appendChild(track);

        if (images.length > 1) {
            const count = document.createElement('span');
            count.className = 'idea-media-count';
            count.textContent = `${images.length} photos`;
            container.appendChild(count);
        }
    }

    function renderIdea(item) {
        const fragment = el.ideaTemplate.content.cloneNode(true);
        const card = fragment.querySelector('.idea-card');
        const topic = fragment.querySelector('.idea-topic');
        const title = fragment.querySelector('.idea-title');
        const description = fragment.querySelector('.idea-description');
        const media = fragment.querySelector('.idea-media');
        const relatedBlock = fragment.querySelector('.related-block');
        const relatedList = fragment.querySelector('.related-list');
        const children = item.displayChildren || item.children || [];
        const images = getItemImages(item);
        const caption = item.title || item.fullText || 'Design idea';

        if (card && images.length) {
            card.classList.add('has-media');
        }

        const adminHost = fragment.querySelector('.idea-admin-host');
        if (adminHost && window.AtHomeAdmin?.buildAdminControls) {
            adminHost.innerHTML = window.AtHomeAdmin.buildAdminControls(item.ideaId);
        }

        renderIdeaMedia(media, images, caption);
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

    async function loadImageManifest() {
        try {
            const manifestUrl = new URL(IMAGE_MANIFEST_FILE, window.location.href);
            manifestUrl.searchParams.set('v', Date.now().toString());
            const response = await fetch(manifestUrl.href, { cache: 'no-store' });
            if (!response.ok) return {};

            const data = await response.json();
            const manifest = {};

            Object.entries(data).forEach(([key, value]) => {
                if (key.startsWith('_')) return;
                manifest[key] = Array.isArray(value) ? value.map(clean).filter(Boolean) : parseImageList(value);
            });

            return manifest;
        } catch (error) {
            console.warn('[AtHome] Could not load image manifest', error);
            return {};
        }
    }

    function updateLightbox() {
        const { images, index } = state.lightbox;
        if (!el.imageLightbox || !images.length) return;

        const current = images[index];
        if (el.lightboxImage) {
            el.lightboxImage.src = current;
            el.lightboxImage.alt = state.lightbox.caption || 'Idea image';
        }

        setText(el.lightboxCaption, state.lightbox.caption || '');
        setText(el.lightboxCounter, images.length > 1 ? `${index + 1} / ${images.length}` : '');

        if (el.lightboxPrev) el.lightboxPrev.hidden = images.length <= 1;
        if (el.lightboxNext) el.lightboxNext.hidden = images.length <= 1;
    }

    function openLightbox(images, index = 0, caption = '') {
        if (!el.imageLightbox || !images.length) return;

        state.lightbox = {
            images,
            index: Math.max(0, Math.min(index, images.length - 1)),
            caption
        };

        updateLightbox();
        el.imageLightbox.hidden = false;
        document.body.classList.add('lightbox-open');
        el.lightboxClose?.focus();
    }

    function closeLightbox() {
        if (!el.imageLightbox) return;

        el.imageLightbox.hidden = true;
        document.body.classList.remove('lightbox-open');
        if (el.lightboxImage) el.lightboxImage.removeAttribute('src');
    }

    function stepLightbox(direction) {
        const { images, index } = state.lightbox;
        if (!images.length) return;

        const nextIndex = (index + direction + images.length) % images.length;
        state.lightbox.index = nextIndex;
        updateLightbox();
    }

    function maybeLogIdeaKeys() {
        if (!new URLSearchParams(window.location.search).has('show-keys')) return;

        console.table(state.rows.map((row) => ({
            idea_id: row.ideaId,
            key: row.ideaKey,
            section: row.section,
            title: row.title,
            parent: row.parentItem || ''
        })));
        console.info('[AtHome] Link images in idea-images.json using idea_id from the CSV.');
    }

    function applyContentRows(firestoreRows) {
        const { rows } = firestoreRowsToObjects(firestoreRows);

        state.imageManifest = {};
        state.rows = rows;
        state.sections = buildSections(rows);
        updateRouteFromHash();
        render();
        initCarousel();
        maybeLogIdeaKeys();
        window.dispatchEvent(new CustomEvent('athome:ready'));
    }

    function showLoadError(message) {
        console.error('[AtHome] Could not load content', message);
        el.sectionFeed.innerHTML = '';

        const empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.innerHTML = `<h3>Unable to load ideas</h3><p>${message || 'Please refresh the page to try again.'}</p>`;
        el.sectionFeed.appendChild(empty);
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
            if (event.key === 'Escape') {
                if (!document.getElementById('imageManager')?.hidden) return;
                if (!el.imageLightbox?.hidden) {
                    closeLightbox();
                    return;
                }
                closeMobileMenu();
            }

            if (!el.imageLightbox?.hidden && event.key === 'ArrowLeft') {
                event.preventDefault();
                stepLightbox(-1);
                return;
            }

            if (!el.imageLightbox?.hidden && event.key === 'ArrowRight') {
                event.preventDefault();
                stepLightbox(1);
                return;
            }

            if (canUseCarouselKeyboard() && event.key === 'ArrowLeft') {
                event.preventDefault();
                stepCarousel(-1, { instant: true });
                return;
            }

            if (canUseCarouselKeyboard() && event.key === 'ArrowRight') {
                event.preventDefault();
                stepCarousel(1, { instant: true });
            }
        });

        el.lightboxClose?.addEventListener('click', closeLightbox);
        el.lightboxPrev?.addEventListener('click', () => stepLightbox(-1));
        el.lightboxNext?.addEventListener('click', () => stepLightbox(1));
        el.imageLightbox?.addEventListener('click', (event) => {
            if (event.target === el.imageLightbox) closeLightbox();
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
            scheduleCarouselMeasureRefresh();
        });
    }

    function setImageManifest(manifest) {
        state.imageManifest = manifest;
        render();
        initCarousel();
    }

    function escapeCsvField(value) {
        const text = String(value ?? '');
        if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
        return text;
    }

    function exportCsvText(rows = state.rows) {
        const headers = ['idea_id', 'section', 'subsection', 'level', 'parent_item', 'title', 'description', 'full_text', 'images', 'sort_index'];
        const lines = [headers.join(',')];

        rows.forEach((row) => {
            lines.push([
                row.ideaId,
                row.section,
                row.subsection,
                row.level,
                row.parentItem,
                row.title,
                row.description,
                row.fullText,
                row.images,
                row.sortIndex ?? ''
            ].map(escapeCsvField).join(','));
        });

        return `${lines.join('\n')}\n`;
    }

    function getIdeaImageEntries(item) {
        if (!item) return [];

        const manifestPaths = getManifestImagesForItem(item);
        const csvPaths = parseImageList(item.images);
        const entries = [];
        const seen = new Set();

        manifestPaths.forEach((path) => {
            entries.push({ path, source: 'firestore' });
            seen.add(path);
        });

        csvPaths.forEach((path) => {
            if (seen.has(path)) return;
            entries.push({ path, source: 'firestore' });
            seen.add(path);
        });

        return entries;
    }

    function updateIdeaCsvImages(ideaId, imagePaths) {
        const images = imagePaths.join('|');
        state.rows = state.rows.map((row) => (
            row.ideaId === ideaId ? { ...row, images } : row
        ));
        state.sections = buildSections(state.rows);
        render();
        initCarousel();
        return exportCsvText(state.rows);
    }

    function findRowByIdeaId(ideaId) {
        return state.rows.find((row) => row.ideaId === ideaId) || null;
    }

    function refresh() {
        render();
        initCarousel();
    }

    function bindDataEvents() {
        window.addEventListener('athome:data', (event) => {
            const rows = event.detail?.rows || [];
            if (!rows.length) {
                showLoadError('No ideas found yet. Run the Firestore seed script if this is a new project.');
                return;
            }
            applyContentRows(rows);
        });

        window.addEventListener('athome:error', (event) => {
            const error = event.detail?.error;
            showLoadError(error?.message || 'Could not connect to Firebase.');
        });

        window.addEventListener('athome:auth', () => {
            refresh();
        });

        window.addEventListener('athome:edit-mode', () => {
            refresh();
        });
    }

    function init() {
        initTheme();
        bindEvents();
        bindDataEvents();

        window.AtHome = {
            getRows: () => state.rows,
            getImageManifest: () => state.imageManifest,
            setImageManifest,
            getIdeaImageEntries,
            updateIdeaCsvImages,
            exportCsvText,
            resolveImageSrc,
            findRowByIdeaId,
            slugify,
            ideaKey,
            refresh,
            DATA_FILE
        };
    }

    init();
})();
