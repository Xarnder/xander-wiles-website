(() => {
    const log = (type, msg, data) => {
        const prefix = '[HouseDesignUI]';
        if (data !== undefined) {
            console[type](`${prefix} ${msg}`, data);
        } else {
            console[type](`${prefix} ${msg}`);
        }
    };

    log('info', 'script loaded');

    const pages = {
        home: {
            eyebrow: 'Overview',
            title: 'House Design Journal',
            badge: 'Editorial Overview',
            description: 'A curated dream-home journal blending comfort, beauty, practicality, privacy, and future-ready technology.',
            featured: ['Golden Ratio', '60-30-10 Colour Rule', 'Natural Light', 'Hidden Storage', 'Smart Living'],
            items: [
                { tag: 'Exterior', icon: '🏡', title: 'Exterior Vision', copy: 'Detached privacy, quiet surroundings, solar panels, smart entry, EV charging, and city-view elegance.' },
                { tag: 'Layout', icon: '🧭', title: 'Layout Logic', copy: 'Bedrooms away from noise, open communal space, cosy side rooms, mudroom flow, and elevator provision.' },
                { tag: 'Kitchen', icon: '🍽️', title: 'Kitchen Intelligence', copy: 'Large worktops, double sinks, drawer-led storage, hidden bins, good lighting, and family practicality.' },
                { tag: 'Bedroom', icon: '🛏️', title: 'Restful Sanctuary', copy: 'Silence, blackout control, charging drawers, warm materials, hidden storage, and comfort-led details.' },
                { tag: 'Garden', icon: '🌿', title: 'Landscape Experience', copy: 'Covered porch, pool, stage, maze, outdoor kitchen, great views, and family adventure.' },
                { tag: 'Technology', icon: '⚙️', title: 'Useful Innovation', copy: 'Fast Wi-Fi, air purification, hidden charging, smart lighting, safety sensors, and invisible convenience.' }
            ]
        },
        exterior: {
            eyebrow: 'Category',
            title: 'Exterior & Arrival',
            badge: 'Site Planning',
            description: 'A refined arrival sequence shaped by privacy, quiet, convenience, and presence.',
            featured: ['Detached House', 'Quiet Area', 'City View', 'Solar Panels', 'Security Cameras'],
            items: [
                { tag: 'Location', icon: '🌄', title: 'Quiet elevated location', copy: 'Prefer areas away from airports, railways, loud roads, pubs, and stadium noise.' },
                { tag: 'Arrival', icon: '🚪', title: 'Strong first impression', copy: 'Use a broad approach, smart door systems, discreet parcel storage, and a polished front-door experience.' },
                { tag: 'Mobility', icon: '🚗', title: 'Driveway intelligence', copy: 'Add EV charging, potential driveway turntable, hidden bike storage, and easy access without clutter.' },
                { tag: 'Security', icon: '🛡️', title: 'Elegant security', copy: 'Use mains-powered cameras and high-quality coverage without making the house look harsh.' },
                { tag: 'Materials', icon: '🧱', title: 'Sustainable craft', copy: 'Consider solar orientation, stone character, and resilient materials that age well.' },
                { tag: 'Identity', icon: '✨', title: 'Personal signature', copy: 'Memory details like handprints in concrete can make the house feel truly yours.' }
            ]
        },
        layout: {
            eyebrow: 'Category',
            title: 'Layout & Flow',
            badge: 'Spatial Planning',
            description: 'A house that feels calm because movement, storage, sound, and family life have been designed properly.',
            featured: ['Bedrooms Far From Noise', 'Mudroom', 'Laundry Chutes', 'Secret Rooms', 'Elevator Provision'],
            items: [
                { tag: 'Planning', icon: '🔇', title: 'Noise zoning', copy: 'Keep bedrooms away from entertaining rooms, cinema spaces, and noisy utility areas.' },
                { tag: 'Flow', icon: '↔️', title: 'Practical movement', copy: 'Link garage and kitchen, simplify trash routes, and make daily movement faster and easier.' },
                { tag: 'Atmosphere', icon: '🏠', title: 'Open plan with cosy relief', copy: 'Balance large open spaces with smaller intimate rooms that feel warm and safe.' },
                { tag: 'Character', icon: '📚', title: 'Hidden architecture', copy: 'Secret rooms, cupboard passages, and safe-room ideas add delight and theatre.' },
                { tag: 'Longevity', icon: '⬆️', title: 'Future accessibility', copy: 'Reserve a place for a small elevator and graceful ageing-in-place planning.' },
                { tag: 'Entrance', icon: '🌟', title: 'Grand threshold', copy: 'A big entrance room sets the tone and makes the house feel special immediately.' }
            ]
        },
        kitchen: {
            eyebrow: 'Category',
            title: 'Kitchen & Dining',
            badge: 'Daily Living',
            description: 'A hardworking kitchen designed around visibility, speed, cleanliness, and sociable living.',
            featured: ['Double Sinks', 'Two Dishwashers', 'Under-Cabinet Lights', 'Hidden Bins', 'Large Worktops'],
            items: [
                { tag: 'Kitchen', icon: '🍳', title: 'Cook in an open social space', copy: 'Let the kitchen connect to living zones so cooking remains part of family life.' },
                { tag: 'Storage', icon: '🗄️', title: 'Drawer-first storage', copy: 'Prefer drawers over deep cupboards so items are visible and easier to reach.' },
                { tag: 'Function', icon: '⚡', title: 'High-speed workflow', copy: 'Use double sinks, tall taps, generous prep space, and easy dishwasher loading zones.' },
                { tag: 'Safety', icon: '🧲', title: 'Child-safe precision', copy: 'Add magnetic locks, hidden knife storage, and easy-access first aid.' },
                { tag: 'Lighting', icon: '💡', title: 'Proper worktop lighting', copy: 'Under-cabinet lighting prevents shadows and makes premium surfaces feel richer.' },
                { tag: 'Surfaces', icon: '🪨', title: 'Easy-clean realism', copy: 'Choose materials that stay beautiful after years of spills, heat, and daily use.' }
            ]
        },
        bedroom: {
            eyebrow: 'Category',
            title: 'Bedrooms & Comfort',
            badge: 'Rest & Privacy',
            description: 'Sleep-first design with silence, softness, privacy, and hidden practicality.',
            featured: ['Complete Silence', 'Blackout Layers', 'Charging Drawers', 'True Mirrors', 'Warm Comfort'],
            items: [
                { tag: 'Sleep', icon: '🌙', title: 'Silence as luxury', copy: 'Quiet air conditioning, soft-close doors, and acoustic separation make a huge difference.' },
                { tag: 'Light', icon: '🪟', title: 'Layered light control', copy: 'Blend natural daylight, blackout curtains, overlap rails, and calm bedside glow.' },
                { tag: 'Storage', icon: '🧺', title: 'Hidden practicalities', copy: 'Add concealed bins, charging drawers, closet lights, and easy spare duvet storage.' },
                { tag: 'Furniture', icon: '🛋️', title: 'Comfort-first furniture', copy: 'Prioritise mattress quality, soft materials, wide mirrors, and restful layouts.' },
                { tag: 'Technology', icon: '🪞', title: 'Gentle smart features', copy: 'Smart mirrors and discreet screens can be useful when they do not create clutter.' },
                { tag: 'Family', icon: '👨‍👩‍👧', title: 'Family flexibility', copy: 'Design bedrooms that work for children, privacy, and changing needs over time.' }
            ]
        },
        living: {
            eyebrow: 'Category',
            title: 'Living, Cinema & Lounge',
            badge: 'Social Spaces',
            description: 'A comfortable and cinematic social heart for family time, games, films, and guests.',
            featured: ['Surround Sound', 'Blackout Curtains', 'Board Game Storage', 'Spare Beds', 'Comfort Seating'],
            items: [
                { tag: 'Cinema', icon: '🎬', title: 'Movie-ready atmosphere', copy: 'Use blackout layers, screens, good sound, and adaptable lighting for immersive evenings.' },
                { tag: 'Materials', icon: '🧵', title: 'Furniture that survives life', copy: 'Choose water-repellent fabrics and layouts that are resilient to spills and family use.' },
                { tag: 'Hosting', icon: '🛏️', title: 'Guest-ready flexibility', copy: 'Hidden spare beds and a nearby bathroom make the lounge more versatile.' },
                { tag: 'Sound', icon: '🔊', title: 'Built-in audio', copy: 'Surround sound should feel immersive without overwhelming the visual design.' },
                { tag: 'Comfort', icon: '🪑', title: 'True relaxation', copy: 'Choose genuinely comfortable seating rather than overly decorative pieces.' },
                { tag: 'Special Touch', icon: '🎄', title: 'Delightful storage moments', copy: 'A slide-out tree cupboard or board-game wall turns practicality into something memorable.' }
            ]
        },
        garden: {
            eyebrow: 'Category',
            title: 'Garden, Grounds & Outdoors',
            badge: 'Estate Living',
            description: 'Outdoor spaces designed for beauty, parties, play, and connection to the view.',
            featured: ['Covered Porch', 'Pool', 'Outdoor Kitchen', 'Maze', 'Stage Area'],
            items: [
                { tag: 'Garden', icon: '🌺', title: 'Landscape for memory', copy: 'Water features, stepping stones, bridges, and trees create emotional outdoor moments.' },
                { tag: 'Hosting', icon: '🍷', title: 'Outdoor entertaining', copy: 'Use long-table areas, stage space, BBQ zones, and covered seating for social gatherings.' },
                { tag: 'Family', icon: '🎠', title: 'Adventure outdoors', copy: 'A maze, trampoline, pool features, and long garden routes make the grounds exciting.' },
                { tag: 'Lifestyle', icon: '🐎', title: 'Estate lifestyle', copy: 'Horse fields, stables, indoor riding spaces, and guest-house ideas extend the vision.' },
                { tag: 'Practicality', icon: '🤖', title: 'Hidden maintenance', copy: 'Robot mowers, rainwater systems, and concealed storage help the garden stay beautiful.' },
                { tag: 'View', icon: '🌆', title: 'View as architecture', copy: 'Frame forest or city views so the landscape becomes part of the house design.' }
            ]
        },
        bathroom: {
            eyebrow: 'Category',
            title: 'Bathrooms & Wellness',
            badge: 'Hygiene & Comfort',
            description: 'Warm, easy-clean bathrooms with comfort, hygiene logic, and calm organisation.',
            featured: ['Separated Toilet Zone', 'Heated Comfort', 'Easy Shower Control', 'Hidden Storage', 'Smart Toilet'],
            items: [
                { tag: 'Warmth', icon: '🚿', title: 'Comfort after showering', copy: 'Keep the room warm, make towel storage generous, and provide a place for clean clothes.' },
                { tag: 'Planning', icon: '🧼', title: 'Hygiene-forward layout', copy: 'Where possible, separate toilet functions from brushing and washing zones.' },
                { tag: 'Function', icon: '🌡️', title: 'Better shower usability', copy: 'Place controls where you do not need to step through cold spray to reach them.' },
                { tag: 'Storage', icon: '🪥', title: 'Clutter-free storage', copy: 'Hide toothbrush charging, store toilet rolls well, and keep surfaces visually calm.' },
                { tag: 'Luxury', icon: '✨', title: 'Practical luxury', copy: 'Heated seats, soft-close lids, LED accents, and roomy showers can be genuinely useful.' },
                { tag: 'Safety', icon: '🛟', title: 'Safe temperature control', copy: 'Use anti-scald taps and smart controls that work well for adults and children.' }
            ]
        },
        utility: {
            eyebrow: 'Category',
            title: 'Utility, Workshop & Office',
            badge: 'Back-of-House',
            description: 'Quiet, efficient support rooms that make the rest of the home feel effortless.',
            featured: ['Two Washing Machines', 'Hidden Drying Racks', 'Soundproof Laundry', '3D Printer', 'Standing Desk'],
            items: [
                { tag: 'Laundry', icon: '🧺', title: 'Quiet laundry logic', copy: 'Keep washing noise controlled and drying spaces warm and hidden.' },
                { tag: 'Drying', icon: '♨️', title: 'Concealed drying systems', copy: 'Built-in drying racks and integrated storage reduce clutter.' },
                { tag: 'Workshop', icon: '🧰', title: 'Fabrication and making', copy: 'A workshop with 3D printer and tools turns the home into a creative lab.' },
                { tag: 'Office', icon: '💼', title: 'Ergonomic productivity', copy: 'Standing desks, treadmills, and good chairs make the office healthier long-term.' },
                { tag: 'Acoustics', icon: '🎧', title: 'Soundproof focus', copy: 'Sound control matters for video calls, concentration, and better work quality.' },
                { tag: 'Efficiency', icon: '⚙️', title: 'Support spaces that save time', copy: 'The best back-of-house rooms quietly remove daily friction from the household.' }
            ]
        },
        special: {
            eyebrow: 'Category',
            title: 'Special Rooms & Dream Spaces',
            badge: 'Character Features',
            description: 'Highly personalised spaces that transform the home into a world of its own.',
            featured: ['Tardis Interior', 'Green Screen Room', 'Lego Gallery', 'Control Room', 'Oval Office Replica'],
            items: [
                { tag: 'Identity', icon: '🪐', title: 'Rooms with personality', copy: 'A memorable house often includes fantasy, hobby, or story-rich rooms.' },
                { tag: 'Studio', icon: '🎥', title: 'Media creation rooms', copy: 'Green-screen, filming, and streaming spaces support serious creative work.' },
                { tag: 'Collections', icon: '🧱', title: 'Display and gallery spaces', copy: 'Lego rooms, libraries, and gaming areas make collections feel curated.' },
                { tag: 'Imagination', icon: '📘', title: 'Architecture with surprise', copy: 'Hidden slides, secret stairs, and replica rooms create delight and wonder.' },
                { tag: 'Escapism', icon: '🚪', title: 'World-building at home', copy: 'These spaces make the house feel more like an experience than just a building.' },
                { tag: 'Memory', icon: '💫', title: 'Make it unforgettable', copy: 'The most personal rooms are often what people remember first and longest.' }
            ]
        },
        technology: {
            eyebrow: 'Category',
            title: 'Smart Technology & Systems',
            badge: 'Useful Innovation',
            description: 'Technology should feel invisible, dependable, and genuinely helpful rather than gimmicky.',
            featured: ['Fast Wi-Fi', 'Air Purification', 'Smart Lights', 'Leak Sensors', 'Hidden Charging'],
            items: [
                { tag: 'Principle', icon: '🧠', title: 'Usefulness over gimmicks', copy: 'Only keep technology that saves time, improves comfort, or prevents ongoing hassle.' },
                { tag: 'Power', icon: '🔌', title: 'Hidden power everywhere', copy: 'Use abundant sockets, charging drawers, and mains-powered smart accessories where possible.' },
                { tag: 'Health', icon: '🌬️', title: 'Healthy indoor systems', copy: 'Air quality sensors, purifiers, and good filtration support sleep and wellbeing.' },
                { tag: 'Lighting', icon: '💎', title: 'Layered integrated lighting', copy: 'Mood lighting, task lights, and smart control should feel seamless and repairable.' },
                { tag: 'Security', icon: '📡', title: 'Quiet protection', copy: 'Leak sensors, alarms, smart locks, and cameras should protect the house unobtrusively.' },
                { tag: 'Connectivity', icon: '📶', title: 'Strong digital backbone', copy: 'Very fast Wi-Fi is now essential because nearly every room depends on connected devices.' }
            ]
        }
    };

    const state = {
        page: 'home',
        search: '',
        theme: localStorage.getItem('house-theme') || 'light'
    };

    const el = {
        chips: document.getElementById('chips'),
        categoryCount: document.getElementById('categoryCount'),
        sideNav: document.getElementById('sideNav'),
        pageEyebrow: document.getElementById('pageEyebrow'),
        pageTitle: document.getElementById('pageTitle'),
        pageDescription: document.getElementById('pageDescription'),
        pageBadge: document.getElementById('pageBadge'),
        featured: document.getElementById('featured'),
        cards: document.getElementById('cards'),
        searchInput: document.getElementById('searchInput'),
        themeToggle: document.getElementById('themeToggle'),
        cardTemplate: document.getElementById('cardTemplate')
    };

    function validateDom() {
        const missing = Object.entries(el).filter(([, v]) => !v).map(([k]) => k);
        if (missing.length) {
            log('error', 'missing required DOM elements; page cannot render correctly', missing);
            document.body.innerHTML = `<div style="padding:24px;font-family:Inter,sans-serif"><h1>UI Error</h1><p>Open the browser console.</p><pre>${missing.join(', ')}</pre></div>`;
            return false;
        }
        log('info', 'DOM validation passed');
        return true;
    }

    function applyTheme() {
        document.body.classList.toggle('dark', state.theme === 'dark');
        localStorage.setItem('house-theme', state.theme);
        log('info', 'theme applied', state.theme);
    }

    function getRoute() {
        const hash = window.location.hash || '#page/home';
        const parts = hash.replace('#', '').split('/');
        const page = parts[1] || 'home';

        if (!pages[page]) {
            log('warn', 'unknown route, falling back to home', hash);
            return 'home';
        }

        return page;
    }

    function renderChips() {
        el.chips.innerHTML = '';
        Object.keys(pages).forEach((key) => {
            const btn = document.createElement('button');
            btn.className = `chip ${state.page === key ? 'active' : ''}`;
            btn.type = 'button';
            btn.textContent = pages[key].title;
            btn.addEventListener('click', () => {
                log('info', 'category chip clicked', key);
                window.location.hash = `#page/${key}`;
            });
            el.chips.appendChild(btn);
        });
        el.categoryCount.textContent = `${Object.keys(pages).length} loaded`;
    }

    function renderSideNav() {
        el.sideNav.innerHTML = '';
        Object.keys(pages).forEach((key) => {
            const a = document.createElement('a');
            a.href = `#page/${key}`;
            a.className = `side-link ${state.page === key ? 'active' : ''}`;
            a.innerHTML = `<span>${pages[key].title}</span><span>›</span>`;
            el.sideNav.appendChild(a);
        });
    }

    function filterItems(items) {
        if (!state.search.trim()) return items;
        const q = state.search.trim().toLowerCase();
        const filtered = items.filter((item) => `${item.title} ${item.tag} ${item.copy}`.toLowerCase().includes(q));
        log('info', 'search filter applied', { query: q, before: items.length, after: filtered.length });
        return filtered;
    }

    function renderFeatured(page) {
        el.featured.innerHTML = '';
        (page.featured || []).forEach((text) => {
            const pill = document.createElement('div');
            pill.className = 'feature-pill';
            pill.textContent = text;
            el.featured.appendChild(pill);
        });
    }

    function makeCard(item) {
        if (!el.cardTemplate || !el.cardTemplate.content) {
            log('error', 'card template missing');
            return null;
        }

        const frag = el.cardTemplate.content.cloneNode(true);
        const tag = frag.querySelector('.idea-tag');
        const icon = frag.querySelector('.idea-icon');
        const title = frag.querySelector('.idea-title');
        const copy = frag.querySelector('.idea-copy');

        if (!tag || !icon || !title || !copy) {
            log('error', 'card template structure is incomplete', item);
            return null;
        }

        tag.textContent = item.tag;
        icon.textContent = item.icon;
        title.textContent = item.title;
        copy.textContent = item.copy;
        return frag;
    }

    function renderPage() {
        const page = pages[state.page];
        if (!page) {
            log('error', 'page data missing', state.page);
            return;
        }

        el.pageEyebrow.textContent = page.eyebrow;
        el.pageTitle.textContent = page.title;
        el.pageDescription.textContent = page.description;
        el.pageBadge.textContent = page.badge;
        renderFeatured(page);

        const visible = filterItems(page.items || []);
        el.cards.innerHTML = '';

        if (!visible.length) {
            const empty = document.createElement('div');
            empty.className = 'empty card soft';
            empty.innerHTML = '<h3>No matching ideas found</h3><p>Try a broader search like lighting, garden, storage, or smart.</p>';
            el.cards.appendChild(empty);
            log('warn', 'no cards matched current search', { page: state.page, query: state.search });
            return;
        }

        visible.forEach((item) => {
            const card = makeCard(item);
            if (card) el.cards.appendChild(card);
        });

        log('info', 'page rendered', { page: state.page, cards: visible.length });
    }

    function syncRoute() {
        state.page = getRoute();
        renderChips();
        renderSideNav();
        renderPage();
    }

    function bindEvents() {
        el.searchInput.addEventListener('input', (e) => {
            state.search = e.target.value || '';
            log('info', 'search updated', state.search);
            renderPage();
        });

        el.themeToggle.addEventListener('click', () => {
            state.theme = state.theme === 'light' ? 'dark' : 'light';
            log('info', 'theme toggle clicked', state.theme);
            applyTheme();
        });

        window.addEventListener('hashchange', () => {
            log('info', 'hash changed', window.location.hash);
            syncRoute();
        });

        window.addEventListener('resize', () => {
            log('info', 'window resized', { width: window.innerWidth, height: window.innerHeight });
        });

        window.addEventListener('error', (event) => {
            log('error', 'unhandled browser error', {
                message: event.message,
                file: event.filename,
                line: event.lineno,
                column: event.colno
            });
        });

        window.addEventListener('unhandledrejection', (event) => {
            log('error', 'unhandled promise rejection', event.reason);
        });
    }

    function init() {
        if (!validateDom()) return;
        applyTheme();
        bindEvents();
        syncRoute();
        log('info', 'app initialised successfully');
    }

    init();
})();