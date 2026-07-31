# Work Tracker — Budget View: Questions and Decisions

**Feature cycle:** 2026-07-31  
**Status:** Locked (2026-07-31) — ready for implementation pending approval of Phase 1.

**Decision status legend:**

| Status | Meaning |
| ------ | ------- |
| `Needs user answer` | Blocks or strongly shapes implementation — waiting on you |
| `Recommended default` | Sensible default if you want to defer |
| `Safe to decide now` | Can be decided during implementation without your input |
| `Locked` | Answer recorded; drives the technical plan |

---

## Locked decision summary

| Q | Decision | Status |
|---|----------|--------|
| Q1 | **A** — Fourth top-level tab “Budgeting” only (no dashboard widget) | `Locked` |
| Q2 | **A** — Firestore `users/{uid}/settings/budgeting` | `Locked` |
| Q3 | **A** — Always sum to ≈ 100% | `Locked` |
| Q4 | **A** — Drag: adjacent neighbors only; type: take from / give to largest other | `Locked` |
| Q5 | **A** — Single plan only in v1 | `Locked` |
| Q6 | **B** — Seed with sample divisions (Rent 40% / Food 20% / Other 40%) | `Locked` |
| Q7 | **A** — Fully independent; typed total only | `Locked` |
| Q8 | **A** — Custom SVG + Pointer Events; no chart libraries | `Locked` |
| Q9 | **Custom** — Max **16** divisions; min **5%** each; soft visual floor for drag targets | `Locked` |
| Q10 | **A** — Fixed palette by index | `Locked` |
| Q11 | **B** — Solid pie; total only in the top input | `Locked` |
| Q12 | **A** — Full touch + mouse support with large hit targets | `Locked` |
| D1 | Google sign-in required | `Locked` |
| D2 | `state.currentCurrency` | `Locked` |
| D3 | 2 decimal money; precise % for sum ≈ 100% | `Locked` |
| D4 | Debounced autosave | `Locked` |
| D5 | Reuse `showConfirm` / `showAlert` | `Locked` |
| D6 | No Cloud Functions | `Locked` |
| D7 | No remote feature flag; rollback via git + rules | `Locked` |
| D8 | Escape division names | `Locked` |
| D9 | `js/budgeting.js` + tests | `Locked` |
| D10 | Extend view switcher for Budgeting tab | `Locked` |

---

## Product placement & scope

### Question 1: Where should the Budgeting UI live?

- **Status**: `Locked`
- **Why it matters**: You asked for a “new view called budgeting.” Work Tracker today has three top-level tabs (Dashboard / Time Cost / Settings) toggled in `main.js` with no URL router. Saving Pots considered a fourth tab and rejected it for that feature. A fourth tab matches your wording and gives the pie room to breathe; a dashboard widget alone would fight for space and hide the primary interaction. Wrong placement either under-ships the feature or bloats the nav.
- **Recommended Default**: **Dedicated fourth top-level tab “Budgeting”** (primary surface). No dashboard widget in v1.
- **Options**:
  - [x] A — Fourth top-level tab “Budgeting” only (recommended)
  - [ ] B — Fourth tab + compact dashboard widget summarizing total / top divisions
  - [ ] C — Dashboard widget only (no new tab)
  - [ ] D — Nested under Time Cost (like Saving Pots)
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: A — Fourth top-level tab only

---

### Question 2: Where should the budget plan persist?

- **Status**: `Locked`
- **Why it matters**: Firestore matches sessions / cuts / Saving Pots and syncs across devices for the same Google account. localStorage is faster to ship but loses data on new browsers/devices and diverges from the rest of the app. Wrong choice either surprises you with lost plans or adds rules/API work you did not want.
- **Recommended Default**: **Firestore** document `users/{uid}/settings/budgeting` (same pattern as `percentageCuts` / `savingPots`), with optional localStorage cache for instant paint.
- **Options**:
  - [x] A — Firestore `users/{uid}/settings/budgeting` (recommended)
  - [ ] B — Firestore collection `users/{uid}/budgets/{budgetId}` (supports multiple plans — see Q5)
  - [ ] C — localStorage only (`work_tracker_budgeting`)
  - [ ] D — Both: Firestore source of truth + localStorage cache
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: A — Firestore `settings/budgeting`

---

### Question 3: Must division percentages always sum to exactly 100%?

- **Status**: `Locked`
- **Why it matters**: A pie chart visually implies a full circle. If percentages can drift away from 100%, the chart either lies, shows an “unallocated” remainder slice, or leaves a gap. Percentage Cuts today intentionally do **not** sum to 100% (sequential deductions). Applying that model here would confuse the pie metaphor. Choosing badly breaks either drag math or user mental model.
- **Recommended Default**: **Always sum to 100%** (within a small epsilon, e.g. 0.01%). Unallocated budget is represented either by an explicit “Unallocated” division or by forcing redistribution (see Q4).
- **Options**:
  - [x] A — Always sum to 100% (recommended)
  - [ ] B — Allow sum &lt; 100%; show remaining as grey “Unallocated” slice
  - [ ] C — Allow any sum; scale pie visually to 100% of current sum (dangerous for mental math)
  - [ ] D — Allow sum &gt; 100% with over-allocated warning (block save / show error)
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: A — Always sum to 100%

---

### Question 4: When one division’s % changes (drag or type), how should other divisions adjust?

- **Status**: `Locked`
- **Why it matters**: This is the core interaction model for circumference control points. Neighbor-only drag matches classic “pie splitter” UIs (move the boundary between two slices). Proportional shrink of all others feels “fair” when typing a % but can fight the drag mental model. Wrong choice makes the pie feel broken or unpredictable.
- **Recommended Default**:
  - **Drag control point:** adjust only the **two adjacent** divisions sharing that boundary (classic pie-boundary model).
  - **Typed %:** take/give from a designated remainder strategy — prefer **shrink/grow the largest other division**, or an explicit Unallocated slice if Q3 = B.
- **Options**:
  - [x] A — Drag: adjacent neighbors only; type: take from / give to largest other (recommended hybrid)
  - [ ] B — Always redistribute remaining % proportionally across all other divisions
  - [ ] C — Always take from / give to an explicit “Unallocated” / “Free” division
  - [ ] D — Drag and type both use adjacent-neighbor only (typed % may need a “which boundary?” rule)
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: A — Hybrid (adjacent drag; typed from largest other)

---

### Question 5: Single budget plan or multiple named budgets?

- **Status**: `Locked`
- **Why it matters**: One plan keeps v1 small (matches “type in an amount and split it”). Multiple named budgets (e.g. “July salary”, “Holiday”) need list/create/delete UI and a richer data model. Shipping multi-plan prematurely slows the pie UX; shipping single-plan then bolting on multi later may force a migration.
- **Recommended Default**: **Single active plan in v1** (one total + divisions). Multi-plan is a follow-up.
- **Options**:
  - [x] A — Single plan only in v1 (recommended)
  - [ ] B — Multiple named budgets from day one
  - [ ] C — Single plan now, but schema designed for multiple later (IDs ready)
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: A — Single plan only in v1

---

## Interaction & empty state

### Question 6: What is the empty / first-run state?

- **Status**: `Locked`
- **Why it matters**: With zero divisions the pie is empty; with one division the pie is a full circle and control points are useless until a second division exists. Bad empty state leaves users unsure how to start.
- **Recommended Default**: Total defaults to empty or `0`; no divisions until user adds one. After **first** division, give it **100%**. Show helper copy: “Add divisions, then drag the points on the pie to split your budget.” Control points appear once there are **≥ 2** divisions.
- **Options**:
  - [ ] A — Empty total + empty divisions; first division = 100%; control points from 2+ divisions (recommended)
  - [x] B — Seed with sample divisions (e.g. Rent 40% / Food 20% / Other 40%)
  - [ ] C — Require total &gt; 0 before allowing divisions
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: B — Seed sample divisions (Rent 40% / Food 20% / Other 40%)

---

### Question 7: How should Budgeting relate to earnings, Saving Pots, and Percentage Cuts?

- **Status**: `Locked`
- **Why it matters**: Coupling Budgeting to live earnings (auto-fill total from pool) or to Saving Pots / cuts creates powerful workflows but also cross-feature bugs and confusing ownership of “what is money in this app.” Independent planning is simpler and matches your described flow (£10,000 typed in). Wrong coupling either silos a useful tool or creates inconsistent totals across views.
- **Recommended Default**: **Independent planning tool in v1** — user types the total; no auto-link to sessions, Saving Pots, or percentage cuts. Optional “use earnings pool as total” can be a later enhancement.
- **Options**:
  - [x] A — Fully independent; typed total only (recommended)
  - [ ] B — Optional button: “Use Saving Pot earnings pool as total”
  - [ ] C — Optional button: “Use this month’s / scoped earnings as total”
  - [ ] D — Divisions can map 1:1 to Saving Pot items or percentage cut names
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: A — Fully independent

---

### Question 8: Custom SVG pie + pointer events, or add a chart library?

- **Status**: `Locked`
- **Why it matters**: Work Tracker currently has **zero** chart libraries; all charts are custom DOM/CSS. Circumference control points are not a stock Chart.js feature — even with a library you still write custom drag math. A library adds bundle/CDN weight and a new dependency class this app has avoided. Custom SVG matches architecture but costs more interaction engineering. Choosing a library for “pie only” then fighting it for handles is a common trap.
- **Recommended Default**: **Custom SVG (or canvas) pie + Pointer Events** in a new `js/budgeting.js` / renderer — no new npm/CDN chart dependency for v1.
- **Options**:
  - [x] A — Custom SVG + Pointer Events, zero new chart libs (recommended)
  - [ ] B — Chart.js (or similar) for pie rendering + custom handles on top
  - [ ] C — D3 for arcs + drag
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: A — Custom SVG + Pointer Events

---

### Question 9: Minimum / maximum constraints on divisions?

- **Status**: `Locked`
- **Why it matters**: Unlimited tiny slices make drag targets unusable. A hard max prevents pathological UI. Floors (e.g. min 1%) prevent “stuck at 0%” dead slices unless 0% is allowed intentionally.
- **Recommended Default**: Max **12** divisions; min percentage **0%** allowed but drag snap/min visual angle ~0.5% for hit targets; cannot remove last division without confirm (or allow empty list per Q6). No negative %.
- **Options**:
  - [ ] A — Max 12 divisions; min 0%; soft visual floor for drag targets (recommended)
  - [ ] B — Max 8; min 1% each
  - [ ] C — No hard max; min 0%
  - [x] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: Max 16 divisions, 5% min, soft visual floor for drag targets

---

### Question 10: How are division colors chosen?

- **Status**: `Locked`
- **Why it matters**: Color is how users scan the pie vs the list. Random colors look noisy; forcing manual color pickers slows setup. Collision with existing CSS tokens (`--accent-green/red/blue`) matters for dark theme readability.
- **Recommended Default**: **Fixed palette** of ~12 distinct colors from the existing design system / complementary hues; assign by division index; recycle with offset if over palette length. No per-division color picker in v1.
- **Options**:
  - [x] A — Fixed palette by index (recommended)
  - [ ] B — User-selectable color per division
  - [ ] C — Hash of division name → color
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: A — Fixed palette by index

---

### Question 11: Should the centre of the pie show a summary (donut hole)?

- **Status**: `Locked`
- **Why it matters**: A solid pie maximises slice area for dragging; a donut centre can show total / selected division amount without cluttering the list. Either works; mismatch with “big pie at the centre” only matters if the hole is so large the chart feels small.
- **Recommended Default**: **Donut** with centre showing total amount (and optionally selected division name + £ on hover/focus). Keep ring thick enough for comfortable drag targets.
- **Options**:
  - [ ] A — Donut with total in centre (recommended)
  - [x] B — Solid pie; total only in the top input
  - [ ] C — Donut showing selected division £ when a slice is selected
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: B — Solid pie; total only in top input

---

### Question 12: Mobile / touch support for circumference dragging?

- **Status**: `Locked`
- **Why it matters**: Pointer Events can cover mouse + touch, but small handles are hard on phones. If mobile is first-class, handles need larger hit areas and the layout must stack (total → pie → list). If desktop-first, typed % becomes the mobile fallback. Choosing “desktop-only” then shipping tiny handles will make the feature feel broken on phone.
- **Recommended Default**: **Pointer Events for mouse and touch** with large hit targets (≥ 44px); layout stacks on narrow viewports; typed % always available as precise fallback.
- **Options**:
  - [x] A — Full touch + mouse support with large hit targets (recommended)
  - [ ] B — Desktop drag primary; mobile uses typed % only
  - [ ] C — Desktop-only feature note; no special mobile work in v1
  - [ ] Custom/Other: <input type="text" placeholder="Type custom answer here" style="width: 100%;">
- **Your Answer**: A — Full touch + mouse with large hit targets

---

## Safe to decide now (locked with no objection)

| ID | Decision | Status |
| -- | -------- | ------ |
| D1 | Require Google sign-in for Budgeting writes (same as rest of app) | `Locked` |
| D2 | Display money with `state.currentCurrency`; no multi-currency conversion | `Locked` |
| D3 | Round displayed £ to 2 decimals via `roundMoney`; store percentages with enough precision to keep sum ≈ 100% | `Locked` |
| D4 | Debounce cloud saves (~300–1200ms), matching percentage-cuts autosave pattern | `Locked` |
| D5 | Reuse `showConfirm` / `showAlert` for delete-division confirms | `Locked` |
| D6 | No Cloud Functions — client math + Firestore rules | `Locked` |
| D7 | No remote feature flag; rollback via git revert + rules redeploy | `Locked` |
| D8 | Escape division names with existing `escapeHtml` patterns | `Locked` |
| D9 | New pure module `js/budgeting.js` (+ `budgeting.test.js`) for %/geometry math | `Locked` |
| D10 | Extend view switcher in `main.js` for Budgeting tab | `Locked` |

---

## Next step

1. Technical plan updated from these locked decisions — see [`02-technical-plan.md`](./02-technical-plan.md).
2. Await explicit approval before Phase 1 coding.
