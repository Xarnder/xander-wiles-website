# Questions and Decisions — Skeuomorphic Redesign

Answer each question below before implementation begins. Status values:

- `Needs user answer` — blocks or strongly shapes visual direction
- `Recommended default` — sensible default provided; confirm or override
- `Safe to decide now` — engineering can proceed without user input

---

## Visual direction

### Question 1: Primary material theme

- **Status**: `Needs user answer`
- **Why it matters**: This is the foundational aesthetic. A “dark leather desk planner” vs “light oak + paper forms” vs “brushed aluminum control panel” drives every color, texture, shadow, and typography choice. Picking wrong means a full restyle.
- **Recommended Default**: **Warm dark desk** — dark walnut wood base, cream paper cards, brass/copper accent hardware, dark leather header strip. Fits evening/social scheduling context and contrasts well with green/yellow availability states.
- **Options**:
  - [ ] A — Dark leather desk (walnut surface, cream paper panels, leather tabs)
  - [x] B — Light craft paper (kraft/paper background, stamped labels, ink text)
  - [ ] C — Brushed metal control panel (gunmetal base, enamel buttons, LCD-style labels)
  - [ ] D — Mixed workshop (wood frame + metal switches + paper calendar insert)
  - [ ] Custom/Other: 
- **Your Answer**: 

---



### Question 2: Overall luminance (light vs dark)

- **Status**: `Needs user answer`
- **Why it matters**: The app is currently **dark-first** (`#0a0a1a` background, light text). A light skeuomorphic theme (paper on wood) changes contrast rules for calendar cells, heatmap, and mobile outdoor readability. Wrong choice hurts accessibility and brand recognition.
- **Recommended Default**: **Dark-base with light paper panels** — dark wood/leather environment with opaque cream/paper cards (not translucent). Keeps calendar green/yellow legible and matches current `theme-color` direction.
- **Options**:
  - [ ] A — Dark environment + light opaque panels (recommended)
  - [x] B — Fully light environment (paper desk, dark ink everywhere)
  - [ ] C — Fully dark environment (dark metal/leather panels, light text)
  - [ ] Custom/Other: 
- **Your Answer**: 

---



### Question 3: Typography family

- **Status**: `Recommended default`
- **Why it matters**: Font sets the “era” of the interface. A serif label + sans body reads “classic planner”; all-sans reads “modern instrument panel”. Must load from Google Fonts or self-host without bloating LCP.
- **Recommended Default**: **Source Sans 3** for UI + **IBM Plex Sans** as fallback — clean, legible on textured backgrounds; pairs well with physical UI without feeling corporate.
- **Options**:
  - [ ] A — Inter (neutral, highly legible)
  - [x] B — Source Sans 3 (recommended)
  - [ ] C — IBM Plex Sans
  - [ ] D — Serif labels (e.g. Libre Baskerville) + sans body
  - [ ] E — Keep Outfit (current font — less “physical” but zero migration friction)
  - [ ] Custom/Other: 
- **Your Answer**: 

---



### Question 4: Accent / brand color

- **Status**: `Recommended default`
- **Why it matters**: Product decision locked **cyan/teal** `#38bdf8` in `DECISIONS.md` / `PLAN.md`. Skeuomorphic themes often use brass, copper, or enamel blue instead. Changing accent affects links, focus rings, scores, favicon, and heatmap legend borders.
- **Recommended Default**: **Keep cyan as enamel accent** on metal hardware (buttons, links, focus) but render it as **opaque enamel paint**, not glowing glass — preserves brand continuity.
- **Options**:
  - [ ] A — Keep `#38bdf8` as opaque enamel/highlight (recommended)
  - [x] B — Shift to warm brass/copper for hardware accents
  - [ ] C — Shift to forest green to match “likely free” semantics
  - [ ] D — Monochrome hardware (graphite/silver only, no color accent)
  - [ ] Custom/Other: 
- **Your Answer**: 

---



### Question 5: Texture implementation strategy

- **Status**: `Recommended default`
- **Why it matters**: Pure CSS gradients/noise are maintainable and small; image textures (leather, wood grain) look richer but add HTTP weight, retina assets, and repeat-tiling artifacts. Bad tiling looks cheap; large images hurt mobile performance.
- **Recommended Default**: **CSS-first** — layered gradients, `repeating-linear-gradient` for grain, optional tiny inline SVG noise data-URI. Add 1–2 optimized WebP textures only for body background if needed.
- **Options**:
  - [x] A — CSS-only textures (recommended)
  - [ ] B — CSS + small optimized image textures (wood/leather/pape)
  - [ ] C — High-fidelity photographic textures (accept larger bundle)
  - [ ] Custom/Other: 
- **Your Answer**: 

---



## Structure & scope



### Question 6: CSS architecture

- **Status**: `Safe to decide now`
- **Why it matters**: `styles.css` is ~1,660 lines. A monolithic rewrite is risky; splitting by concern improves review and rollback. Too many files adds import complexity for a no-build-step app.
- **Recommended Default**: **Refactor in place** during redesign: replace glass tokens, rename `.glass-card` → `.panel` (or keep class as alias), optionally extract `textures.css` / `components.css` only if file exceeds ~2,000 lines.
- **Options**:
  - [ ] A — Single `styles.css` rewrite (minimal churn)
  - [x] B — Split into `tokens.css`, `components.css`, `calendar.css` (recommended if splitting)
  - [ ] C — Add PostCSS/build step for nesting (out of scope for vanilla app unless approved)
  - [ ] Custom/Other: 
- **Your Answer**: 

---



### Question 7: Class naming migration (`.glass-card`)

- **Status**: `Recommended default`
- **Why it matters**: `.glass-card` appears in 3 HTML files, `confirm-modal.js`, `index-main.js`, `event-main.js`, and `calendar.js`. Renaming requires coordinated JS/HTML changes. Keeping the class as a semantic alias avoids churn but leaves misleading names in code.
- **Recommended Default**: **Introduce** `.panel` as primary class; keep `.glass-card` as deprecated alias mapping to same styles for one release, then remove alias in follow-up.
- **Options**:
  - [x] A — Rename to `.panel` everywhere in one pass (recommended for cleanliness)
  - [ ] B — Keep `.glass-card` class name, change styles only (fastest)
  - [ ] C — Dual alias `.panel.glass-card` during transition (recommended default)
  - [ ] Custom/Other: 
- **Your Answer**: 

---



### Question 8: Site navigation integration

- **Status**: `Needs user answer`
- **Why it matters**: App loads shared nav via `nav-loader.js` and `/assets/css/style.css`, which uses its own glass styles. The app already overrides `#main-nav-placeholder .xw-main-nav-header` in `styles.css`. Nav can either blend with the skeuomorphic desk or stay as site-default glass (visual discontinuity).
- **Recommended Default**: **Scoped override** — style nav header as a dark wood/metal bar matching the app background; do not change global site CSS.
- **Options**:
  - [ ] A — Match app skeuomorphic nav bar via scoped overrides only (recommended)
  - [ ] B — Leave site default glass nav unchanged
  - [x] C — Hide site nav on app pages (immersion mode)
  - [ ] Custom/Other: 
- **Your Answer**: 

---



## Component-specific



### Question 9: Calendar day cell metaphor

- **Status**: `Recommended default`
- **Why it matters**: Day cells are the most-used control. They must read clearly in likely/maybe/erase states and work at 24–26px height on mobile. “Physical tile” vs “ink stamp” vs “LED segment” changes border radius, shadow, and text color rules.
- **Recommended Default**: **Embossed paper tiles** — inset empty cells, raised painted cells with slight inner shadow for likely/maybe (wax-stamp feel), muted debossed out-of-range days.
- **Options**:
  - [x] A — Embossed paper tiles (recommended)
  - [ ] B — Plastic keycaps / enamel chips
  - [ ] C — LED segment display (metal panel aesthetic)
  - [ ] D — Minimal flat chips (less skeuomorphic, clearer at small size)
  - [ ] Custom/Other: 
- **Your Answer**: 

---



### Question 10: Heatmap color treatment

- **Status**: `Safe to decide now`
- **Why it matters**: Heatmap colors are computed in JS (`heatmap.js` — red → yellow → green gradient). CSS can add borders/shadows; changing the algorithm affects meaning (“more people free”). 
- **Recommended Default**: **Keep current heat algorithm**; apply opaque cell styling and physical borders in CSS only. No JS color logic change.
- **Options**:
  - [x] A — Keep JS heat colors, skeuomorphic cell chrome only (recommended)
  - [ ] B — Desaturate heat colors to match muted paper palette
  - [ ] C — Replace gradient with hatched/pattern density (major UX change)
  - [ ] Custom/Other: 
- **Your Answer**: 

---



### Question 11: Modal overlay (confirm dialogs)

- **Status**: `Recommended default`
- **Why it matters**: Current `.confirm-overlay` uses `backdrop-filter: blur(8px)` and semi-transparent dark fill — directly violates redesign rules. Replacement must dim the page opaquely without hiding context entirely.
- **Recommended Default**: **Opaque vignette** — solid dark felt/wood overlay at ~85–92% opacity (no blur), centered paper/metal dialog with strong shadow.
- **Options**:
  - [x] A — Opaque dark overlay, no blur (recommended)
  - [ ] B — Solid full-opacity overlay (harsher, maximum focus)
  - [ ] C — Frame dimming only (desk spotlight — lighter overlay at edges)
  - [ ] Custom/Other: 
- **Your Answer**: 

---



### Question 12: Time range controls (no sliders today)

- **Status**: `Safe to decide now`
- **Why it matters**: Event page uses native `input[type=time]` in `.time-range-row`, not range sliders. Skeuomorphic styling of native time inputs is limited cross-browser. Custom sliders would match the spec but add JS and a11y work.
- **Recommended Default**: **Style native time inputs** as inset metal/paper fields; defer custom range sliders unless UX testing shows pain.
- **Options**:
  - [x] A — Skeuomorphic native `time` inputs only (recommended)
  - [ ] B — Build custom dual-handle range slider (thick track, padded ends per spec)
  - [ ] C — Replace with two select dropdowns (hour picker)
  - [ ] Custom/Other: 
- **Your Answer**: 

---



## Brand assets



### Question 13: Favicon, manifest, and theme-color

- **Status**: `Recommended default`
- **Why it matters**: `favicon-dark.svg`, `site.webmanifest`, and `<meta name="theme-color">` are tuned to dark glass + cyan (`#0a0a1a`, `#38bdf8`). Skeuomorphic palette may need new colors for browser chrome and PWA splash.
- **Recommended Default**: **Update theme-color** to match new background; refresh favicon to skeuomorphic mini-calendar on wood/metal (SVG, same file path).
- **Options**:
  - [x] A — Update theme-color + favicon to match new theme (recommended)
  - [ ] B — Update theme-color only
  - [ ] C — Leave brand assets unchanged for this cycle
  - [ ] Custom/Other: 
- **Your Answer**: 

---



## Motion & accessibility



### Question 14: `prefers-reduced-motion`

- **Status**: `Safe to decide now`
- **Why it matters**: Current background has orb drift animation. Skeuomorphic redesign may add subtle press animations. Users with vestibular sensitivity need reduced motion respected.
- **Recommended Default**: **Respect** `prefers-reduced-motion` — disable background animation and limit transitions to opacity/shadow only (no scale/slide on modal).
- **Options**:
  - [x] A — Full reduced-motion support (recommended)
  - [ ] B — No animations at all (simplest)
  - [ ] Custom/Other: 
- **Your Answer**: 

---



### Question 15: Target contrast level

- **Status**: `Recommended default`
- **Why it matters**: Textured backgrounds and warm off-whites can fail WCAG if contrast is not verified per surface. Legal/ethical risk for public app; also affects muted helper text visibility.
- **Recommended Default**: **WCAG 2.1 AA** for normal text on primary panels; AAA aspirational for body copy on paper panels.
- **Options**:
  - [x] A — WCAG 2.1 AA minimum (recommended)
  - [ ] B — WCAG 2.1 AAA everywhere
  - [ ] C — Best effort, no formal audit
  - [ ] Custom/Other: 
- **Your Answer**: 

---



## Decisions log

**Status:** Locked — 2026-06-30

| # | Decision | Status | Chosen option | Date |
|---|----------|--------|---------------|------|
| 1 | Material theme | **Locked** | **B** — Light craft paper (kraft/paper background, stamped labels, ink text) | 2026-06-30 |
| 2 | Luminance | **Locked** | **B** — Fully light environment (paper desk, dark ink everywhere) | 2026-06-30 |
| 3 | Typography | **Locked** | **B** — Source Sans 3 | 2026-06-30 |
| 4 | Accent color | **Locked** | **B** — Warm brass/copper hardware accents (replaces cyan `#38bdf8` for UI chrome) | 2026-06-30 |
| 5 | Textures | **Locked** | **A** — CSS-only textures | 2026-06-30 |
| 6 | CSS architecture | **Locked** | **B** — Split into `tokens.css`, `components.css`, `calendar.css` | 2026-06-30 |
| 7 | Class naming | **Locked** | **A** — Rename `.glass-card` → `.panel` everywhere in one pass | 2026-06-30 |
| 8 | Site nav | **Locked** | **C** — Hide site nav on app pages (immersion mode) | 2026-06-30 |
| 9 | Day cells | **Locked** | **A** — Embossed paper tiles | 2026-06-30 |
| 10 | Heatmap | **Locked** | **A** — Keep JS heat colors; skeuomorphic cell chrome in CSS only | 2026-06-30 |
| 11 | Modal overlay | **Locked** | **A** — Opaque dark overlay, no blur | 2026-06-30 |
| 12 | Time controls | **Locked** | **A** — Skeuomorphic native `time` inputs only | 2026-06-30 |
| 13 | Brand assets | **Locked** | **A** — Update `theme-color` + favicon | 2026-06-30 |
| 14 | Reduced motion | **Locked** | **A** — Full `prefers-reduced-motion` support | 2026-06-30 |
| 15 | Contrast target | **Locked** | **A** — WCAG 2.1 AA minimum | 2026-06-30 |

### Locked theme summary (for implementers)

| Token area | Direction |
|------------|-----------|
| Atmosphere | Fully light kraft/craft-paper desk; dark ink typography |
| Panels | Opaque cream/paper cards with bevel, grain, stamped-label feel |
| Accent | Brass/copper for links, focus rings, primary hardware, scores |
| Semantic colors | Keep green `#22c55e` (likely) and yellow `#eab308` (maybe) |
| Nav | `#main-nav-placeholder` hidden on all app pages |
| Panels class | `.panel` (no `.glass-card`) |
| Stylesheets | `styles/tokens.css` → `styles/components.css` → `styles/calendar.css`, imported from `styles.css` |


