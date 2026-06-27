# Countdown — Test Plan

**Scope:** `pages/Countdown/` — full-screen mystery countdown with count-up after target.

**Locked target:** `2037-07-16T08:11:00+01:00` (BST)

**Test environments:**

- Local: `npm run dev` → `http://localhost:3000/pages/Countdown/`
- Vercel preview URL
- Production: `https://xanderwiles.com/pages/Countdown/`

---

## Test strategy

| Layer | Coverage |
|-------|----------|
| **Manual** | Primary — math, count-up, unit visibility, motion, audio, a11y |
| **Automated** | Optional pure-function tests for `decomposeTime` + unit filtering |
| **Exploratory** | Cosmic mood, performance on mobile, mystery tone |

---

## Manual tests

### MT-01 — Page load and assets

| Step | Expected |
|------|----------|
| Open `/pages/Countdown/` | Loads without console errors |
| Network tab | `index.html`, `countdown.css`, `countdown.js` → 200 |
| Favicon | Tab shows icon; title is **"Countdown"** |
| No `nav.html` fetch | `nav-loader.js` not loaded (Q6) |
| Hard refresh | Same behavior |

**Pass:** ☐

---

### MT-02 — Countdown accuracy (production target)

| Step | Expected |
|------|----------|
| Note `TARGET_ISO` in `countdown.js` | `2037-07-16T08:11:00+01:00` |
| Compare display vs manual calc | Within ±1 second |
| Cross-check timeanddate.com | Same remaining time ±1s |
| Wait 10 seconds | Seconds decrement smoothly |

**Pass:** ☐

```
Displayed vs expected:
```

---

### MT-03 — Dynamic unit visibility (Q3)

| Step | Expected |
|------|----------|
| With ~11 years remaining | **Years** column visible with value &gt; 0 |
| Dev override: set target ~9 months ahead | **Years** column **absent**; days/hours/min/sec shown |
| Dev override: set target ~2 hours ahead | Only hours, minutes, seconds (days/years hidden) |
| No unit shows **0** as a label value | Zero-value units omitted from display |
| 375px width | Readable; no overlap |
| 1920px width | Balanced layout |

**Pass:** ☐

---

### MT-04 — Count-up after zero (Q5)

**Method:** Dev override — set `TARGET_MS = Date.now() + 5000`, load page.

| Step | Expected |
|------|----------|
| T−5s to T−1s | Normal countdown |
| At T=0 | Display shows zero (seconds at minimum) |
| T+1s to T+30s | **Counts up** — elapsed time increments |
| T+30s | No negative values; no console errors |
| Interval | Still running (not stopped at zero) |
| Optional `is-elapsed` class | Visual shift if implemented |

**Pass:** ☐

**Extended override:** Set `TARGET_MS = Date.now() - 86400000` (1 day ago) → count-up shows ~1 day elapsed with correct units.

**Pass extended:** ☐

---

### MT-05 — Tab background / visibility

| Step | Expected |
|------|----------|
| Note displayed time | Baseline |
| Background tab 30+ seconds | — |
| Return | Time resynced (not stuck) |
| Particle animation | Paused or resynced when hidden (no runaway CPU) |

**Pass:** ☐

---

### MT-06 — Navigation / escape hatch (Q6)

| Step | Expected |
|------|----------|
| Global site nav | **Not present** |
| Home escape control | Visible on hover/focus or discreet corner |
| Click home | Navigates to `/` |
| Keyboard Tab | Home control reachable with visible focus |

**Pass:** ☐

---

### MT-07 — Homepage discovery (Q7)

| Step | Expected |
|------|----------|
| Open site homepage | Countdown card in public section |
| Card link | `/pages/Countdown/` |
| Card copy | Vague — **no date, no "2037", no event spoiler** |
| Click card | Opens countdown page |

**Pass:** ☐

---

### MT-08 — Reduced motion (Q10)

| Step | Expected |
|------|----------|
| Enable OS "Reduce motion" | Reload page |
| Particle canvas / parallax | **Stopped or not rendered** |
| Digit flip animations | Disabled — instant updates |
| Countdown / count-up | Still ticks every second |
| Cosmic gradient background | May remain static or minimal |

**Pass:** ☐

---

### MT-09 — Rich animation smoke (Q10)

| Step | Expected |
|------|----------|
| Desktop Chrome | Particles render; ≥ 30fps |
| Digit changes | Flip or glow on second tick |
| iOS Safari | No severe jank; page usable |
| No seizure-inducing flash | No rapid full-screen strobing |

**Pass:** ☐

---

### MT-10 — Screen reader

Tool: VoiceOver or NVDA.

| Step | Expected |
|------|----------|
| Landmarks | Visually hidden **"Countdown"** `<h1>` in rotor/outline |
| Timer region | Readable; not spamming every second (`aria-live="off"`) |
| Mode change at zero | Acceptable announcement behavior (no crash) |
| Audio toggle | `aria-pressed` reflects state |

**Pass:** ☐

```
Issues:
```

---

### MT-11 — Keyboard and controls

| Step | Expected |
|------|----------|
| Tab order | Home link → audio toggle (logical) |
| Enter/Space on audio toggle | Toggles audio |
| Focus rings | Visible on all interactive elements |

**Pass:** ☐

---

### MT-12 — Color contrast

| Step | Expected |
|------|----------|
| Digit color vs background | ≥ 4.5:1 (WCAG AA) |
| Control icons vs background | ≥ 3:1 minimum |

**Pass:** ☐

---

### MT-13 — Audio (Q11)

| Step | Expected |
|------|----------|
| Initial load | **Silent** — no autoplay |
| Click audio toggle on | Ambient loop plays |
| Click again | Stops |
| `aria-pressed` | `false` → `true` → `false` |
| Reload page | Audio off by default again (unless session persistence added) |
| Mobile Safari | Play works after user gesture |

**Pass:** ☐

---

### MT-14 — Meta / SEO (Q14)

| Step | Expected |
|------|----------|
| View page source | `<meta name="description" content="Something is counting down.">` |
| No `og:` tags | Absent |
| Description | No spoiler / no date |

**Pass:** ☐

---

### MT-15 — No visible copy (Q4)

| Step | Expected |
|------|----------|
| Visual scan of page | **Numbers only** — no title, subtitle, or labels |
| View source | Hidden `<h1>` present for a11y |

**Pass:** ☐

---

### MT-16 — Cross-browser smoke

| Browser | Load | Tick | Count-up | Motion | Audio | Pass |
|---------|------|------|----------|--------|-------|------|
| Chrome | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| Safari (macOS/iOS) | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| Firefox | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| Edge | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### MT-17 — JavaScript disabled

| Step | Expected |
|------|----------|
| Disable JS; reload | `<noscript>` fallback visible |
| Fallback text | Does not reveal target date |

**Pass:** ☐

---

### MT-18 — Production deploy smoke

| Step | Expected |
|------|----------|
| `curl -I https://xanderwiles.com/pages/Countdown/` | 200 |
| Production page | Matches local behavior |

**Pass:** ☐

---

## Automated tests

### AT-01 — Time math unit tests (recommended)

**File:** `pages/Countdown/countdown.test.js`

| Case | Input | Expected |
|------|-------|----------|
| Countdown 1s | `absMs=1000`, mode down | sec=1; y,d,h,m hidden |
| Countdown 1 year | `absMs ≈ 365.25 days` | years=1; lower units per math |
| Countdown 11 months | `absMs < 1 year` | years hidden |
| Count-up 1 day elapsed | `absMs=86400000`, mode up | days=1 |
| Exactly zero | `absMs=0` | seconds=0 shown (minimum display) |
| Unit filter | `{y:0,d:5,h:3,m:0,s:30}` | only d, h, s columns |

**Pass:** ☐ / Deferred

### AT-02 — Mode switch

| Case | Expected |
|------|----------|
| `rawDelta = 1` | mode `down` |
| `rawDelta = -1` | mode `up` |
| `rawDelta = 0` | mode `down` (or edge: zero display) |

**Pass:** ☐ / Deferred

---

## Test data — dev overrides

| Label | `TARGET_MS` | Use |
|-------|-------------|-----|
| `NEAR_ZERO` | `Date.now() + 5000` | MT-04 count-up transition |
| `ONE_DAY_AGO` | `Date.now() - 86400000` | MT-04 extended count-up |
| `NINE_MONTHS` | `Date.now() + 9*30*86400000` | MT-03 years hidden |
| `PRODUCTION` | `Date.parse('2037-07-16T08:11:00+01:00')` | Ship only this in main |

**Never commit overrides to main.**

---

## Regression scope

Re-run after changes:

| Change type | Tests |
|-------------|-------|
| JS math / tick | MT-02, MT-03, MT-04, MT-05 |
| CSS / animation | MT-08, MT-09, MT-12, MT-16 |
| Audio | MT-13 |
| Homepage | MT-07, MT-14 |
| HTML structure | MT-10, MT-15, MT-17 |

---

## Sign-off

| Role | Name | Date | Status |
|------|------|------|--------|
| Developer | | | ☐ |
| Owner (Xander) | | | ☐ |

---

## Known limitations (accepted)

1. Client system clock is authoritative
2. 365.25-day year approximation — sub-day drift over decades
3. Rich animation degrades under `prefers-reduced-motion` only (no in-page toggle)
4. Target date visible in page source (Q12)
