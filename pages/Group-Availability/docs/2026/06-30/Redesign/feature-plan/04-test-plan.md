# Test Plan — Skeuomorphic UI Redesign

**Feature cycle:** 2026-06-30  
**Theme:** Light craft paper / kraft desk / brass accents / Source Sans 3  
**Test environments:** Local (`deploy_out` or static serve), production on `xanderwiles.com`

---

## Test strategy

| Layer | Coverage |
|-------|----------|
| Visual regression | Manual + screenshot comparison |
| Functional | Manual — flows unchanged |
| Accessibility | Keyboard + **WCAG 2.1 AA** contrast audit (Q15) |
| Automated | Grep guards recommended (see below) |
| Cross-browser | Chrome, Safari (desktop + iOS), Firefox |
| Responsive | 320px, 390px, 768px, 1024px, 1440px |

---

## Pre-test setup

- [x] Decisions locked in `01-questions-and-decisions.md`
- [ ] Supabase configured
- [ ] Google OAuth on test domain
- [ ] Incognito for guest flow
- [ ] Multi-participant event for overlap + heatmap
- [ ] Verify `styles/tokens.css`, `components.css`, `calendar.css` load (Network tab)

---

## Visual acceptance criteria (locked theme)

- [ ] **Kraft paper** background — warm, opaque, subtle CSS grain (no blur, no orbs)
- [ ] **Fully light** environment — dark ink text on paper surfaces
- [ ] **Cream paper panels** (`.panel`) — beveled, opaque, tactile
- [ ] **Brass/copper** accents on links, primary buttons, focus rings, overlap scores — not cyan
- [ ] **Source Sans 3** typography throughout
- [ ] **Embossed paper** day cells — debossed empty, raised painted
- [ ] Buttons raised; click = pressed inset; hover = lighting only (no lift)
- [ ] Green/yellow availability still immediately recognizable on light paper
- [ ] **Site nav not visible** on any app page (Q8)
- [ ] Modal uses **opaque dark overlay** — no blur (Q11)

---

## Manual tests — Global / all pages

### MT-G01 — Page load and background
- **Steps:** Open `index`, `create`, `event`, `auth-callback`.
- **Expected:** Kraft CSS background; no `.background-orbs`; Source Sans 3 loads; all CSS modules 200 OK.

### MT-G02 — Typography and contrast (Q15: AA)
- **Steps:** Read titles, `.muted` text, labels on kraft and cream panels.
- **Expected:** Normal text ≥ 4.5:1; large text ≥ 3:1. **Pay special attention to muted ink on cream.**

### MT-G03 — Button states
- **Steps:** Tab, hover, click-hold on brass primary button.
- **Expected:** Brass hardware look; focus ring visible; active inset; no lift.

### MT-G04 — Ghost and danger buttons
- **Steps:** Cancel, Sign out, Delete in modal.
- **Expected:** Ghost = paper/outline style; danger = red ink/enamel, clearly destructive.

### MT-G05 — Form controls
- **Steps:** Create form inputs and selects.
- **Expected:** Inset paper/metal fields; brass focus ring; dark ink text.

### MT-G06 — Site navigation hidden (Q8)
- **Steps:** Load index, create, event.
- **Expected:** **No site nav header visible.** `#main-nav-placeholder` empty or hidden.
- **Expected:** **← Back** / **← Home** links still present and styled (brass ink).

### MT-G07 — `prefers-reduced-motion` (Q14)
- **Steps:** Enable reduced motion; reload event page; open delete modal.
- **Expected:** No modal slide animation; transitions minimal.

### MT-G08 — Config warning
- **Steps:** Inspect alert styling.
- **Expected:** Amber warning visible on light paper (high contrast).

### MT-G09 — CSS module loading (new)
- **Steps:** DevTools Network → filter CSS on event page.
- **Expected:** `styles.css` + imported `tokens.css`, `components.css`, `calendar.css` all load; no 404.

---

## Manual tests — Landing (`index.html`)

### MT-I01 — Signed-out hero
- **Expected:** Kraft desk; cream hero `.panel`; stamped-style feature bullets; brass Google button.

### MT-I02 — Google sign-in
- **Expected:** OAuth unchanged; dashboard matches light theme.

### MT-I03 — Signed-in dashboard
- **Expected:** Paper dashboard `.panel` items; brass chevron; organizer badge readable on cream.

### MT-I04 — Dashboard delete
- **Expected:** Opaque dark modal overlay; cream dialog `.panel`; no blur.

### MT-I05 — Preview as guest
- **Expected:** Event page loads without site nav; guest preview bar styled.

---

## Manual tests — Create (`create.html`)

### MT-C01 — Form layout
- **Expected:** Cream form `.panel`; beveled date fieldset; responsive grid.

### MT-C02 — Date span preview
- **Expected:** Preview in brass or dark ink — readable on cream.

### MT-C03 — Timezone select
- **Expected:** Dark ink in dropdown; scrollable.

### MT-C04 — Create submit
- **Expected:** Redirect works; no console errors.

### MT-C05 — Validation
- **Expected:** Native validation; invalid fields indicated.

---

## Manual tests — Event (`event.html`)

### MT-E01 — Loading and not found
- **Expected:** Ink loading text on kraft; not-found `.panel` centered.

### MT-E02 — Guest join
- **Expected:** Identity `.panel` on cream; name form styled.

### MT-E03 — Paint toolbar
- **Expected:** Paper tray toolbar; brass or embossed active brush (not cyan glow).

### MT-E04 — Day calendar paint (Q9)
- **Expected:** Embossed paper tiles; likely/maybe look stamped/raised; out-of-range debossed/faded.

### MT-E05 — Save availability
- **Expected:** Brass save flash (not cyan); blind gate unlocks.

### MT-E06 — Time range (Q12)
- **Expected:** Native time inputs with inset skeuomorphic styling; no custom sliders.

### MT-E07 — Best times
- **Expected:** Overlap `.panel` cards; **brass** score accent (not cyan).

### MT-E08 — Copy / ICS
- **Expected:** Toast opaque paper panel above mobile toolbar.

### MT-E09 — Heatmap (Q10)
- **Expected:** JS red→yellow→green colors preserved; paper cell borders/shadows from CSS.

### MT-E10 — Everyone's availability
- **Expected:** Paper dividers between participants.

### MT-E11 — Blind gate
- **Expected:** Cream `.panel` message.

### MT-E12 — Organizer panel
- **Expected:** Settings on cream `.panel`; brass save, red delete.

### MT-E13 — Closed / deadline
- **Expected:** Badges readable on light background.

### MT-E14 — Share link
- **Expected:** Inset readonly URL field on cream panel.

### MT-E15 — Guest preview toggle
- **Expected:** Opaque admin (amber) vs guest (brass) bar states.

### MT-E16 — Remove guest
- **Expected:** Modal works.

### MT-E17 — Realtime
- **Expected:** Cell updates render with new styles.

---

## Manual tests — Mobile (≤768px)

### MT-M01 — Fixed paint toolbar
- **Expected:** Paper tray fixed bottom; safe-area; content not hidden.

### MT-M02 — Toast position
- **Expected:** Clears toolbar.

### MT-M03 — Calendar cells
- **Expected:** Tappable embossed tiles at 320px.

### MT-M04 — Create on mobile
- **Expected:** Usable without site nav.

### MT-M05 — Modal on mobile
- **Expected:** Cream dialog fits; 44px buttons.

---

## Manual tests — Auth callback

### MT-A01 — OAuth callback
- **Expected:** Kraft background; ink loading text; redirect OK.

---

## Accessibility manual tests

### MT-A11 — Keyboard navigation
- **Expected:** Full path without site nav; focus visible (brass ring).

### MT-A12 — Screen reader
- **Expected:** Brush `aria-pressed`; blind gate `aria-live`.

### MT-A13 — Contrast audit (Q15: AA)
- **Required pairs:**
  1. `--text-ink` on `--surface-paper`
  2. `--text-ink-muted` on `--surface-paper` (**critical**)
  3. Brass button label on brass fill
  4. Likely cell text on green fill
  5. Muted helper on kraft body background
  6. Alert amber text on alert background

---

## Regression checklist

- [ ] Google sign-in / sign-out
- [ ] Guest + localStorage return
- [ ] Guest → Google merge
- [ ] Blind gate
- [ ] Overlap scoring
- [ ] Heatmap scaling
- [ ] Organizer settings
- [ ] Event delete
- [ ] Realtime
- [ ] OAuth recovery
- [ ] **No `.glass-card` in codebase** (grep)
- [ ] **No `backdrop-filter` in styles/** (grep)

---

## Automated checks (recommended for CI)

```bash
# No glass blur in app styles
rg 'backdrop-filter' pages/Group-Availability/styles/ && exit 1 || exit 0

# No leftover glass-card (after rename complete)
rg 'glass-card' pages/Group-Availability/ && exit 1 || exit 0

# CSS modules exist
test -f pages/Group-Availability/styles/tokens.css
test -f pages/Group-Availability/styles/components.css
test -f pages/Group-Availability/styles/calendar.css
```

---

## Test sign-off

| Role | Name | Date | Pass/Fail |
|------|------|------|-----------|
| Implementer | | | |
| Reviewer | | | |
| Product (user) | | | |

**Minimum to ship:** MT-G01–G09, MT-I*, MT-C*, MT-E*, MT-M*, MT-A11–A13, regression checklist.
