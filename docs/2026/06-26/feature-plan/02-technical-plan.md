# Countdown — Technical Plan

**Status:** Locked — decisions captured in [`01-questions-and-decisions.md`](./01-questions-and-decisions.md).

---

## Locked product decisions (summary)

| ID | Decision |
|----|----------|
| Q1 | **16 July 2037, 08:11:00 BST** → `2037-07-16T08:11:00+01:00` |
| Q2 | Absolute instant — everyone hits zero at the same global moment; no timezone label on page |
| Q3 | Years, days, hours, minutes, seconds — **hide any unit whose value is 0** (e.g. no "years" row once &lt; 1 year remains) |
| Q4 | **No visible copy** — numbers only; visually hidden `<h1>` for accessibility |
| Q5 | **Count up** after target — timer reverses direction and increments elapsed time |
| Q6 | **No global nav** — immersive full-screen; minimal home escape hatch (see Assumptions) |
| Q7 | **Public homepage card** in a homepage section |
| Q8 | **Cosmic** — deep space gradients, stars, slow drift |
| Q9 | **Inter** for countdown digits |
| Q10 | **Rich motion** — particles, parallax, glow pulses, digit flip animations |
| Q11 | **Optional ambient audio** — off by default; user enables via control |
| Q12 | Plain `TARGET_ISO` constant in source — acceptable |
| Q13 | Tab title `"Countdown"`; favicon pack cloned from site standard |
| Q14 | Vague `<meta name="description">` — no OG/Twitter cards |

---

## Architecture overview

```
┌──────────────────────────────────────────────────────────────────┐
│  Browser                                                         │
│  ┌────────────┐  ┌───────────────┐  ┌──────────────────────────┐ │
│  │ index.html │  │ countdown.css │  │ countdown.js             │ │
│  │            │  │ cosmic bg     │  │ TARGET_ISO (locked)      │ │
│  │            │  │ particles*    │  │ getTimeParts(ms, mode)   │ │
│  │            │  │ digit anims   │  │ render + unit visibility │ │
│  └────────────┘  └───────────────┘  │ count-down / count-up    │ │
│         │                 │          │ audio toggle (Q11)       │ │
│         └─────────────────┴──────────┴──────────────────────────┘ │
│  * canvas or CSS layers per Q10                                   │
│  No nav-loader.js                                                 │
│  Minimal: home link + audio mute/unmute controls                  │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                Vercel static deploy (deploy_out/)
                No server / DB / API
```

**Stack:** Static HTML, CSS, vanilla JS (`<script defer>`). Canvas layer for particle field (Q10).

---

## Main technical approach

### 1. Hard-coded target (locked)

```javascript
// countdown.js — authoritative constant
const TARGET_ISO = '2037-07-16T08:11:00+01:00'; // BST, 16 Jul 2037 08:11:00
const TARGET_MS = Date.parse(TARGET_ISO);
```

- BST on 16 July 2037 → offset `+01:00` (British Summer Time in effect)
- Validates ≥ 10 years from June 2026 ✓ (~11 years)
- Plain constant per Q12; short comment only, no obfuscation

### 2. Time breakdown — countdown and count-up (Q3 + Q5)

**Signed delta:**

```javascript
const rawDelta = TARGET_MS - Date.now();
const mode = rawDelta >= 0 ? 'down' : 'up';
const absMs = Math.abs(rawDelta);
```

**Cascading decomposition** from `absMs` (same math both modes):

| Unit | Calculation |
|------|-------------|
| Seconds | `floor(absMs / 1000) % 60` |
| Minutes | `floor(absMs / 60000) % 60` |
| Hours | `floor(absMs / 3600000) % 24` |
| Days | `floor(absMs / 86400000) % 365` |
| Years | `floor(absMs / (86400000 * 365.25))` |

**Dynamic unit visibility (Q3):**

- Build ordered list: `[years, days, hours, minutes, seconds]`
- Render only units where `value > 0`
- Edge case at exactly zero (`absMs === 0`): show **seconds = 0** (or all units as `0` briefly) — single visible column minimum so the display is never empty
- When a unit drops to 0 (e.g. years → 0), remove its column from DOM with layout transition to avoid jarring jumps

**Count-up (Q5):**

- Interval **never stops** at zero — same `setInterval(1000)` continues
- Optional CSS class `is-elapsed` on `<main>` when `mode === 'up'` for subtle visual shift (accent color, particle behavior) — not specified by user; safe default enhancement
- No redirect, no message copy (Q4 = no text)

### 3. Tick loop

```text
init() → render() → setInterval(render, 1000)
visibilitychange → resync render when tab visible
```

- Do **not** clear interval at zero (count-up requires continued ticking)
- Particle canvas: separate `requestAnimationFrame` loop, paused when `document.hidden` or `prefers-reduced-motion`

### 4. Visual layer (Q8 + Q10)

| Layer | Implementation |
|-------|----------------|
| Background | Cosmic radial gradients reusing site tokens (`--bg-primary`, `--accent-cyan`, `--accent-purple`) from `assets/css/style.css` |
| Stars | CSS box-shadow starfield and/or canvas particles |
| Parallax | Slow-moving gradient layers + particle depth |
| Digits | Inter (`font-variant-numeric: tabular-nums`), large centered flex/grid |
| Digit flip | CSS `transform` / `rotateX` on value change per column |
| Glow | `text-shadow` + subtle pulse on active second digit |

**`prefers-reduced-motion: reduce`:**

- Disable particle canvas animation and parallax
- Disable digit flip — instant `textContent` updates
- Keep 1s timer tick (essential function)

### 5. No global nav (Q6)

- **Exclude** `nav-loader.js` and `#main-nav-placeholder`
- **Include** minimal chrome:
  - Discreet home link (`href="/"`, icon or "Home", corner positioned, low opacity until hover/focus)
  - Audio toggle button (Q11)
- `min-height: 100dvh`; countdown centered in full viewport

### 6. Audio (Q11)

```html
<button id="audio-toggle" aria-label="Toggle ambient sound" aria-pressed="false">…</button>
<audio id="ambient-audio" loop preload="none" src="ambient.mp3"></audio>
```

- **Off by default** — no autoplay
- On enable: `audio.play()` (may require user gesture — button click satisfies this)
- Persist preference in `sessionStorage` optional (not required v1)
- Asset: `pages/Countdown/ambient.mp3` — **source TBD** (see Assumptions)

### 7. Homepage integration (Q7)

Add public card to root `index.html` — section TBD (recommend **"Guides, Demos & More"** to match atmospheric/experiential pages):

```html
<a href="/pages/Countdown/" class="page-card glass-card">
  <img src="/pages/Countdown/favicon-dark.svg" …>
  <h3>Countdown</h3>
  <p>A mystery countdown — and beyond.</p>
</a>
```

Exact card copy subject to owner approval (not provided in Q&A).

### 8. Meta tags (Q14)

```html
<meta name="description" content="Something is counting down.">
```

No Open Graph / Twitter card tags.

---

## Existing relevant files and services

### Routing / hosting

| Asset | Role |
|-------|------|
| `vercel.json` | `cleanUrls: true`; no Countdown rewrite needed |
| `build.js` | Auto-copies `pages/Countdown/` to `deploy_out/` |
| Live URL | `/pages/Countdown/` |

### Shared assets (used)

| Path | Use |
|------|-----|
| `assets/css/style.css` | Optional: CSS variables only — avoid full nav/layout import if it adds unused weight; may import selectively or duplicate tokens in page CSS |
| Root / sibling favicons | Clone pack for Q13 |

### Not used

| Path | Reason |
|------|--------|
| `assets/js/nav-loader.js` | Q6 = no nav |
| `nav.html` | Q7 = homepage only, not nav |
| Backend / DB / APIs | Out of scope |

### Reference implementations

| Path | Borrow |
|------|--------|
| `pages/Hypnagogia/hypnagogia.css` | Blob/drift keyframes (adapt to cosmic) |
| `pages/Sensory-Experience/` | Full-viewport canvas pattern |
| `assets/css/style.css` | Cosmic gradients, color tokens |
| `pages/Siewli/siewli.css` | `prefers-reduced-motion` |
| `pages/Ratio_Calculator/index.html` | Favicon head boilerplate |

---

## New files

```
pages/Countdown/
├── index.html
├── countdown.css
├── countdown.js
├── ambient.mp3              # Q11 — source TBD
├── favicon.ico              # cloned from site standard (Q13)
├── favicon-light.svg
├── favicon-dark.svg
├── favicon-16x16.png
├── favicon-32x32.png
├── apple-touch-icon.png
└── site.webmanifest         # optional, matches siblings
```

---

## Existing files to change

| File | Change |
|------|--------|
| `index.html` (root) | Add public homepage card (Q7) |
| `build.js` | No change expected |
| `vercel.json` | No change expected |
| `nav.html` | **No change** |

---

## Data model / API / auth

| Area | Status |
|------|--------|
| Database | None |
| API | None |
| Auth | None — public page |
| `localStorage` / cookies | None required; optional `sessionStorage` for audio preference |

---

## HTML structure (locked draft)

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <title>Countdown</title>
  <meta name="description" content="Something is counting down.">
  <!-- favicon pack, fonts: Inter -->
  <link rel="stylesheet" href="countdown.css">
</head>
<body>
  <a href="/" class="home-escape" aria-label="Back to home">…</a>
  <button id="audio-toggle" class="audio-toggle" aria-label="Toggle ambient sound" aria-pressed="false">…</button>
  <audio id="ambient-audio" loop preload="none" src="ambient.mp3"></audio>

  <main class="countdown-stage" id="countdown-stage">
    <h1 class="visually-hidden">Countdown</h1>
    <canvas id="particle-canvas" aria-hidden="true"></canvas>
    <div class="countdown-bg" aria-hidden="true"></div>

    <div class="countdown-display" role="timer" aria-live="off" aria-atomic="true">
      <!-- columns injected by JS: only non-zero units -->
    </div>
  </main>

  <noscript><p class="noscript-fallback">JavaScript is required for this countdown.</p></noscript>
  <script src="countdown.js" defer></script>
</body>
</html>
```

**Accessibility note (Q4):** `aria-live="off"` on timer to avoid per-second screen reader spam; visually hidden `<h1>` satisfies document outline. Consider `aria-label` on timer summarizing state on minute boundaries only.

---

## JavaScript module boundaries

| Function | Responsibility |
|----------|----------------|
| `parseTarget()` | Validate `TARGET_MS` |
| `getSignedDelta(nowMs)` | `{ mode: 'down'|'up', absMs }` |
| `decomposeTime(absMs)` | `{ years, days, hours, minutes, seconds }` |
| `getVisibleUnits(parts)` | Filter units where value &gt; 0; handle all-zero edge |
| `renderCountdown()` | Update DOM columns, toggle `is-elapsed` class |
| `animateDigit(column, newValue)` | Flip animation unless reduced motion |
| `initParticles()` | Canvas starfield / particle rAF loop |
| `initAudio()` | Toggle button, play/pause, `aria-pressed` |
| `init()` | Wire listeners, start interval |

---

## Performance considerations (Q10 = rich)

| Technique | Purpose |
|-----------|---------|
| Canvas particles with capped count (~80–150) | Visual richness without WebGL |
| Pause rAF when `document.hidden` | Battery saving |
| `prefers-reduced-motion` disables canvas + parallax | A11y + performance |
| `will-change: transform` on digit cells only | GPU digit flips |
| `tabular-nums` on Inter | Reduce layout shift |
| `preload="none"` on audio | No upfront audio download |
| Target page weight | &lt; 150 KB excl. audio; audio &lt; 2 MB |

---

## Edge cases

| Case | Handling |
|------|----------|
| `absMs === 0` at exact target | Brief zero display; next tick starts count-up |
| Unit column removed (years → hidden) | CSS transition on grid; `tabular-nums` |
| Tab backgrounded | `visibilitychange` resync |
| User changes system clock | Follows client clock (accepted) |
| BST / DST at target | Fixed `+01:00` in ISO string |
| JS disabled | `<noscript>` message; no date revealed |
| Audio play blocked | Button state reflects failure; no retry spam |
| 320px viewport | Stack unit columns vertically or 2-row grid |
| Long count-up (years after 2037) | Same decomposition; years column reappears when ≥ 1 year elapsed |

---

## Implementation phases

### Phase 1 — Core scaffold (recommended first step)

1. Create `pages/Countdown/index.html`, `countdown.css`, `countdown.js`
2. Lock `TARGET_ISO`
3. Countdown + count-up math with dynamic unit hiding
4. Minimal centered layout (no particles/audio yet)
5. Visually hidden `<h1>`, home escape link

### Phase 2 — Visual polish (Q8, Q10)

1. Cosmic CSS background layers
2. Canvas particle field + parallax
3. Digit flip / glow animations
4. `is-elapsed` visual shift for count-up mode
5. `prefers-reduced-motion` pass

### Phase 3 — Audio (Q11)

1. Source `ambient.mp3`
2. Toggle control + play/pause logic

### Phase 4 — Integration

1. Favicon pack clone (Q13)
2. Meta description (Q14)
3. Homepage card in `index.html` (Q7)

### Phase 5 — QA

1. [`04-test-plan.md`](./04-test-plan.md)
2. [`05-release-checklist.md`](./05-release-checklist.md)

---

## Definition of done (technical)

- [ ] `/pages/Countdown/` loads locally and on Vercel
- [ ] Countdown accurate to `2037-07-16T08:11:00+01:00` within 1s
- [ ] Units hidden when 0; years hidden when &lt; 1 year remains
- [ ] Count-up begins immediately after target with no errors
- [ ] No global nav; home escape works
- [ ] Ambient audio off by default; toggles on user action
- [ ] Reduced-motion mode functional
- [ ] Homepage card live
- [ ] No console errors on happy path

---

## Dependencies

| Dependency | Notes |
|------------|-------|
| Google Fonts — Inter | `fonts.googleapis.com` |
| `ambient.mp3` | Static asset; license-safe source needed |
| None (runtime npm) | Vanilla JS |

---

## Out of scope

- Server-authoritative time
- iCal export
- OG image / Twitter cards
- Nav bar integration
- Obfuscated target date
