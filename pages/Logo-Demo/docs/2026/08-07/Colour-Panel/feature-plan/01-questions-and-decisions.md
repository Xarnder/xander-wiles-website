# Logo Demo — Colour Panel: Questions and Decisions

**Feature cycle:** 2026-08-07  
**Status:** **Locked** (2026-08-07) — answers recorded from checkbox selections. Technical plan updated. **Do not implement until you approve coding in chat.**

**Decision status legend:**

| Status | Meaning |
|--------|---------|
| `Needs user answer` | Blocks or strongly shapes implementation — waiting on you |
| `Recommended default` | Sensible default if you want to defer; confirm or override |
| `Safe to decide now` | Can be decided during implementation without your input |
| `Locked` | Confirmed from your answers |

---

## How to use this file

1. ~~Resolve questions~~ Done.  
2. Approve coding in chat when ready.  
3. Implement against [`02-technical-plan.md`](./02-technical-plan.md).

---

## Locked decision summary

| Q | Decision | Status |
|---|----------|--------|
| Q1 | **A** — Right slide-over sheet (mirror Reorder) | `Locked` |
| Q2 | **A** — Always re-extract; **clear customs on every logo change** | `Locked` |
| Q3 | **A** — **Flat single list** (extremes first, then others, then customs) | `Locked` |
| Q4 | **A** — Every geometry element with resolvable paint | `Locked` |
| Q5 | **A** — Up to 4 per shape; global auto cap 24; endpoints preferred | `Locked` |
| Q6 | **B** — Exact HEX + near-duplicate merge for auto colours | `Locked` |
| Q7 | **A** — Hex + rgb/rgba + gradient stops + class-style fill map | `Locked` |
| Q8 | **A** — **EyeDropper API only** (no canvas fallback) | `Locked` |
| Q9 | **A** — Remove customs only; Refresh rebuilds autos | `Locked` |
| Q10 | **B** — Swatches + HEX + RGB + logo label, company name, date, thumbnail | `Locked` |
| Q11 | **A** — `jspdf` client library | `Locked` |
| Q12 | **A** — Independent UX; shared extractor module underneath | `Locked` |
| Q13 | **A** — Session only (no localStorage for palette) | `Locked` |
| Q14 | **A** — HEX `#RRGGBB` uppercase copy; RGB display `rgb(r, g, b)`; HEX copy only | `Locked` |
| Q15 | **A** — Opaque only; composite translucent on white | `Locked` |
| Notes | None provided | `Locked` |

### Notable overrides vs original recommended defaults

| Topic | Recommended was | You chose |
|-------|-----------------|-----------|
| Logo change / customs | Per-logo session map (B) | **Clear customs on every logo change (A)** |
| List grouping | Grouped sections (B) | **Flat single list (A)** |
| Colour picker | Hybrid EyeDropper + canvas (C) | **EyeDropper API only (A)** |

---

## Panel placement & UX

### Question 1: Where should the Colour Panel live in the UI?

- **Status**: `Locked`
- **Why it matters**: The footer bar is already dense (nav, upload, name, font, scales, SVG colors). A wrong placement either hides the palette, crowds the canvas, or fights the existing Reorder sheet pattern. A full-width permanent panel would shrink the logo preview; a tiny popover may not fit HEX+RGB+export.
- **Recommended Default**: **Slide-over sheet** on the right (same interaction language as `ReorderMenu.svelte`): closed by default; toggle from a footer “Colours” button; Escape / backdrop / close button dismisses.
- **Options**:
  - [x] A — Right slide-over sheet (recommended; mirror Reorder)
  - [ ] B — Left slide-over sheet
  - [ ] C — Bottom sheet / drawer above the footer
  - [ ] D — Persistent side column that collapses to a thin strip
  - [ ] E — Modal dialog centered over the canvas
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: A — Right slide-over sheet

---

### Question 2: When the user switches logos, what happens to the palette?

- **Status**: `Locked`
- **Why it matters**: Auto-extract is logo-specific. If custom picks persist across logos, the palette becomes a mixed bag and PDF export lies about “this logo.” If everything resets hard, users lose carefully sampled mid-tones when flipping one asset ahead by mistake.
- **Recommended Default**: On logo change, **re-run auto-extraction** and **clear custom picks** for that logo. Optionally keep an in-session map of custom picks keyed by `logo.id` so returning to a logo restores customs (still no cross-logo merge).
- **Options**:
  - [x] A — Always re-extract; clear customs on every logo change (simplest)
  - [ ] B — Re-extract auto colours; keep customs in a per-logo session map (recommended)
  - [ ] C — Re-extract auto colours; keep a global custom list across all logos
  - [ ] D — Never auto-refresh until user clicks “Refresh palette”
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: A — Always re-extract; clear customs on every logo change

---

### Question 3: How should palette entries be grouped / labeled?

- **Status**: `Locked`
- **Why it matters**: You asked for lightest/darkest first, then per-shape colours. Without clear grouping, duplicates look like noise. Over-grouping (every path as its own section) can make a 5-path logo feel like 20 rows.
- **Recommended Default**: Three sections in the panel: **Extremes** (lightest, darkest), **From shapes** (deduped important colours with optional shape label), **Custom** (user picks). Show shape labels as secondary text when available (`Shape 1`, layer id, or path index).
- **Options**:
  - [x] A — Flat single list (extremes first, then others, then customs)
  - [ ] B — Grouped sections: Extremes / Shapes / Custom (recommended)
  - [ ] C — Nested accordion per shape only (extremes repeated inside)
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: A — Flat single list (extremes first, then others, then customs)

---

## Colour extraction rules

### Question 4: What counts as a “shape” for per-shape extraction?

- **Status**: `Locked`
- **Why it matters**: Demo SVGs nest `<g>` groups and often have tiny/degenerate paths (see Asset 3’s near-empty paths). Treating every `<path>` as a shape can flood the palette; treating only top-level groups can hide distinct colour regions.
- **Recommended Default**: Treat paintable geometry elements as shapes: `path`, `rect`, `circle`, `ellipse`, `polygon`, `polyline`, `line` (and `use` if present). Skip elements with no resolvable fill/stroke colour. Ignore zero-area / tiny paths by a simple bbox or path-length heuristic. Prefer **resolved fill colour set** over counting every sibling micro-path.
- **Options**:
  - [x] A — Every geometry element (`path`/`rect`/…) with a resolvable paint (recommended)
  - [ ] B — Top-level `<g>` groups under the main layer only
  - [ ] C — Unique fill/stroke paint references only (ignore geometry count; “shape” ≈ unique paint)
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: A — Every geometry element with a resolvable paint

---

### Question 5: How many “most important” colours per shape, and how ranked?

- **Status**: `Locked`
- **Why it matters**: Gradients can have many stops; solid fills have one. “Most important” is subjective. Too many colours → noisy panel; too few → misses brand mid-tones you care about.
- **Recommended Default**:
  - Solid fill/stroke: include that colour (1).
  - Gradient fill: include **all unique stop colours** up to a cap of **4 per shape**, ranked by stop prominence (prefer endpoints + most saturated / most luminance-distinct stops).
  - Global palette hard cap of **24 auto colours** (plus customs), after dedupe.
- **Options**:
  - [x] A — Up to 4 per shape; global auto cap 24; endpoints preferred for gradients (recommended)
  - [ ] B — All unique stop colours, no per-shape cap (dedupe only)
  - [ ] C — Only gradient endpoints (offset 0 and 1) + solid fills
  - [ ] D — Fixed top N by saturation × area heuristic only
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: A — Up to 4 per shape; global auto cap 24; endpoints preferred

---

### Question 6: Near-duplicate colours — how aggressive should dedupe be?

- **Status**: `Locked`
- **Why it matters**: Gradients often have nearly identical stops (e.g. `#3465b0` vs `#2f5a9e`). Exact HEX-only dedupe leaves near-dupes; aggressive perceptual merge may hide intentional steps.
- **Recommended Default**: Dedupe exact HEX first; then merge colours within **ΔE ≈ 4** (or RGB Euclidean distance threshold ~18 on 0–255) for **auto** colours only. Never auto-merge **custom** picks away without user action.
- **Options**:
  - [ ] A — Exact HEX only
  - [x] B — Exact HEX + near-duplicate merge for auto colours (recommended)
  - [ ] C — Show all resolved colours; offer a “Simplify palette” toggle
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: B — Exact HEX + near-duplicate merge for auto colours

---

### Question 7: Which colour notations must be parsed from SVG source?

- **Status**: `Locked`
- **Why it matters**: Current helper only regexes `#hex`. Demo assets mostly use hex `stop-color`, but custom uploads may use `rgb()`, `rgba()`, named colours, or presentation attributes. Under-parsing silently drops brand colours; over-scoping delays v1.
- **Recommended Default**: v1 parse **hex** (`#RGB`/`#RRGGBB`/`#RRGGBBAA` → strip alpha for display), **rgb/rgba()**, and **`stop-color` / `fill` / `stroke`** via attributes + simple CSS class map from `<style>` in the SVG. Defer `hsl()`, ICC, and full CSS cascade.
- **Options**:
  - [x] A — Hex + rgb/rgba + gradient stops + class-style fill map (recommended)
  - [ ] B — Hex only (extend current regex approach)
  - [ ] C — Full CSS colour parsing including hsl/hwb/named colours
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: A — Hex + rgb/rgba + gradient stops + class-style fill map

---

## Canvas colour picker

### Question 8: How should the canvas colour picker work?

- **Status**: `Locked`
- **Why it matters**: Logos are rendered as `<img>`, so DOM hit-testing paths is impossible. EyeDropper is excellent UX but unsupported in Firefox (as of common 2025/26 support matrices) and requires a user gesture. Canvas raster sampling works cross-browser but needs coordinate mapping across two panels, scale, and swap layout — easy to get wrong on mobile.
- **Recommended Default**: **Hybrid** — prefer **EyeDropper API** when available; fall back to **click-to-sample on a rasterized logo overlay** (sample the logo image pixels, not the black/white panel background). Disable pick mode if sampling fails; show a short unsupported message.
- **Options**:
  - [x] A — EyeDropper API only
  - [ ] B — Canvas / image pixel sampling only (click logo)
  - [ ] C — Hybrid: EyeDropper when available, else canvas sampling (recommended)
  - [ ] D — Native `<input type="color">` only (no sampling from logo pixels)
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: A — EyeDropper API only

---

### Question 9: Can the user remove custom colours? Auto colours?

- **Status**: `Locked`
- **Why it matters**: Without remove, a mis-click pollutes the palette and PDF. Allowing deletion of auto colours may confuse “refresh” semantics.
- **Recommended Default**: Customs are removable. Auto colours are not individually deletable in v1; user can click **Refresh** to rebuild autos. Optional later: hide auto swatches.
- **Options**:
  - [x] A — Remove customs only; Refresh rebuilds autos (recommended)
  - [ ] B — Remove any colour (auto or custom)
  - [ ] C — No remove; only full reset / refresh
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: A — Remove customs only; Refresh rebuilds autos

---

## PDF export

### Question 10: What should the PDF contain beyond HEX + RGB?

- **Status**: `Locked`
- **Why it matters**: Minimal PDF is fastest and matches the ask. Adding logo preview / company name / date makes a nicer brand sheet but grows scope (layout, fonts, blob image embedding for custom logos).
- **Recommended Default**: One page (or paginated if many colours): title “Colour palette”, logo label + optional company name, date, then rows of swatch + HEX + RGB. Include a small logo thumbnail when feasible (built-in URLs easy; blob URLs also drawable).
- **Options**:
  - [ ] A — Swatches + HEX + RGB only
  - [x] B — A + logo label, company name, date, small logo thumbnail (recommended)
  - [ ] C — Multi-page brand sheet with usage notes / empty annotation lines
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: B — Swatches + HEX + RGB + logo label, company name, date, small logo thumbnail

---

### Question 11: Which PDF approach?

- **Status**: `Locked`
- **Why it matters**: Dependency choice affects bundle size, offline reliability, and styling fidelity. `window.print()` needs no deps but weak layout control and awkward UX. `jspdf` is common and dependency-light. Server-side generation does not exist in this app.
- **Recommended Default**: Client-side **`jspdf`** (or equivalent small lib) generating a downloadable `.pdf`. No new backend.
- **Options**:
  - [x] A — `jspdf` client library (recommended)
  - [ ] B — Hidden HTML template + `window.print()` / “Save as PDF”
  - [ ] C — `pdf-lib`
  - [ ] D — No library: hand-built minimal PDF bytes (fragile)
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: A — `jspdf` client library

---

## Relationship to existing features

### Question 12: How should Colour Panel relate to the footer “SVG colors” toggle?

- **Status**: `Locked`
- **Why it matters**: Both features read SVG colours. Coupling them can create surprising name-colour changes when the panel opens; fully duplicating logic can drift. Wrong merge might break the existing name-tint behaviour users already have.
- **Recommended Default**: Keep behaviours **independent** in the UI. Internally, **extend/refactor** `svgColors.ts` into a richer palette module that can still export `extractSvgColors()` (lightest/darkest) for the existing toggle, so one parser powers both.
- **Options**:
  - [x] A — Independent UX; shared extractor module underneath (recommended)
  - [ ] B — Opening Colour Panel forces SVG colors toggle on
  - [ ] C — Replace the toggle with the Colour Panel extremes only
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: A — Independent UX; shared extractor module underneath

---

### Question 13: Should palette state persist in `localStorage`?

- **Status**: `Locked`
- **Why it matters**: Persisting customs across reloads is nice for built-in logos but awkward for blob custom uploads (URLs die). Over-persisting stale palettes can confuse after SVG files change.
- **Recommended Default**: **Session-only** palette state in v1 (memory). Do not persist customs to `localStorage`. Re-extract on load.
- **Options**:
  - [x] A — Session only (recommended)
  - [ ] B — Persist customs per built-in `logo.id` in localStorage
  - [ ] C — Persist last exported / last viewed palette only
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: A — Session only

---

## Copy format & display

### Question 14: Exact clipboard / display formats?

- **Status**: `Locked`
- **Why it matters**: Designers often want `#RRGGBB` uppercase or lowercase consistently; RGB may be `rgb(61, 108, 180)` or `61, 108, 180`. Inconsistent copy frustrates paste into Figma/CSS.
- **Recommended Default**: Display HEX as `#RRGGBB` uppercase. Copy HEX button copies that exact string (with `#`). Display RGB as `rgb(r, g, b)`. Optional secondary copy for RGB can be v1.1 unless you want it now.
- **Options**:
  - [x] A — HEX `#RRGGBB` uppercase copy; RGB display `rgb(r, g, b)`; HEX copy only in v1 (recommended)
  - [ ] B — Same display, plus a Copy RGB button in v1
  - [ ] C — HEX without `#` on copy
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: A — HEX `#RRGGBB` uppercase copy; RGB display `rgb(r, g, b)`; HEX copy only in v1

---

### Question 15: RGB channel value range / alpha?

- **Status**: `Locked`
- **Why it matters**: SVG can include alpha. Showing alpha in a “brand palette” may confuse print handoff; dropping alpha silently may surprise when sampling translucent pixels.
- **Recommended Default**: Palette colours are **opaque sRGB**. If source has alpha &lt; 1, either skip or composite on white before storing (document in UI as opaque). Eyedropper samples use opaque result from the API/canvas.
- **Options**:
  - [x] A — Opaque only; composite translucent on white (recommended)
  - [ ] B — Store and display alpha when present
  - [ ] C — Skip any colour with alpha &lt; 1
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: A — Opaque only; composite translucent on white

---

## Additional notes for you (optional freeform)

Anything else that should shape v1 (naming, animation, mobile priority, export filename pattern, etc.)?

**Your notes**: *(none provided)*

---

## Blockers before implementation

All product questions are locked. Remaining gate: **explicit approval to start coding** in chat.
