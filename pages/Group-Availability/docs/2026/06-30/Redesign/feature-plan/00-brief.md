# When To Hang — Skeuomorphic UI Redesign Brief

**Feature cycle:** 2026-06-30  
**App path:** `pages/Group-Availability/`  
**Status:** Decisions locked — awaiting implementation step approval

---

## User problem

When To Hang helps groups find overlapping free time by painting day-level availability on a shared calendar. The product works, but the current interface uses **glassmorphism** (blurred translucent panels, floating orbs, semi-transparent layers). That aesthetic:

- Feels generic and “SaaS-default” rather than distinctive or tactile.
- Conflicts with the user’s goal of a **warm, physical, desk-like** experience where controls feel pressable and surfaces feel solid.
- Uses visual patterns (blur, transparency, gradient text) that the redesign explicitly rejects.

Users need an interface that feels **trustworthy, tangible, and pleasant to use** — especially on mobile, where most painting happens — without changing how scheduling, auth, or data sync work.

---

## Product goal

Replace the glassmorphism UI with a **fully opaque skeuomorphic design system**: leather, wood, metal, paper, or enamel surfaces; beveled panels; pressable buttons; lighting-driven hover/active states (no lift); high-contrast typography; and physical depth via shadows and texture — **not** blur or transparency.

This is a **visual and interaction-layer redesign only**. No change to core scheduling logic, Supabase schema, or auth flows unless decisions in Q&A require minor markup/class updates.

---

## Expected user flows (unchanged functionally)

### Flow A — Landing & dashboard (`index.html`)

1. Visitor opens `/pages/Group-Availability/`.
2. **Signed out:** sees hero value prop + **Sign in with Google**.
3. **Signed in:** sees identity bar, **Create event**, and dashboard list (organized/joined events, delete, preview as guest).

### Flow B — Create event (`create.html`)

1. Authenticated organizer opens create form.
2. Fills title, dates, timezone, optional slug, visibility, deadlines, expiry.
3. Submits → redirect to event page with share link.

### Flow C — Event participation (`event.html`)

1. User opens share link (`event.html?slug=…`).
2. Joins as Google user or guest (name entry).
3. Paints days (likely / maybe / erase) on day calendar; sets time range; saves.
4. **Blind gate:** others’ data hidden until first save.
5. Views **Best times** (overlap), **Best for everyone** (heatmap), **Everyone’s availability** (multi-grid).
6. Organizer: settings panel, share link, close event, guest preview toggle.

### Flow D — OAuth callback (`auth-callback.html`)

1. Brief “Signing you in…” screen during Google redirect handling.

---

## Design requirements (from stakeholder)

| Area | Requirement |
|------|-------------|
| Background | Warm, tactile, real-world materials; **no transparent layers** |
| Panels | Opaque material fills, subtle texture, beveled/inset borders, layered shadows |
| Buttons | Raised edges, top highlight, darker bottom; **pressed** state on click (inset, no lift) |
| Hover | Lighting/shadow/highlight shift only — **no lift** |
| Typography | Inter, Source Sans 3, IBM Plex Sans, or tasteful serif for labels |
| Forbidden | Glassmorphism, blur, frosted panels, translucent overlays |
| Sliders | If present: thick track, smaller thumb, groove/rail styling, end padding (none exist today; time uses `input[type=time]`) |
| File upload | If added, same skeuomorphic style (no upload UI today) |

---

## Scope

### In scope

- Global background and atmosphere
- Design tokens (`:root` CSS variables)
- All panel/card surfaces (replace `.glass-card` pattern)
- Buttons, form controls, badges, alerts, toasts, modals
- Calendar day cells, heatmap cells, paint toolbar
- Dashboard items, overlap cards, organizer panel
- Mobile fixed paint toolbar and safe-area behavior
- `theme-color`, manifest, favicon alignment (if decided)
- Site nav hidden on app pages (immersion mode — Q8)

### Out of scope (unless explicitly decided otherwise)

- Backend / Supabase schema or RLS changes
- New features (notifications, calendar import, etc.)
- Main site (`/assets/css/style.css`) global redesign
- Automated test infrastructure (recommended in test plan; not present today)
- URL rebrand to WhenToHang.com

---

## Success criteria (high level)

- Zero `backdrop-filter` / `-webkit-backdrop-filter` in app styles
- Zero semi-transparent panel backgrounds used as primary surfaces (accents OK if opaque-looking)
- All interactive controls have visible default, hover, active, focus, and disabled states
- Calendar painting and save flows work identically on desktop and mobile
- WCAG 2.1 AA contrast for body text on panel surfaces (target; verify per palette)
- No regression in auth, guest flow, blind gate, overlap, heatmap, organizer tools

---

## Definition of done

See `05-release-checklist.md` for the full checklist. Summary:

- All pages styled consistently with the chosen material theme
- Manual test plan executed and signed off
- Open questions in `01-questions-and-decisions.md` resolved
- Deployed to production via existing Vercel/`build.js` pipeline
- Rollback path documented and verified (CSS-only revert)

---

## Related documents

| Doc | Purpose |
|-----|---------|
| `01-questions-and-decisions.md` | Locked product/design decisions |
| `02-technical-plan.md` | Files, approach, tokens, migration strategy |
| `03-risk-and-safety-review.md` | Security, privacy, performance, a11y risks |
| `04-test-plan.md` | Manual and automated test cases |
| `05-release-checklist.md` | Pre/post deploy checklist |

---

## Current state snapshot (codebase review)

| Item | Current |
|------|---------|
| UI paradigm | Glassmorphism (`styles.css` header: “glassmorphism UI”) |
| Primary stylesheet | `styles.css` (~1,660 lines, single file) |
| Font | Outfit (Google Fonts) |
| Accent | `#38bdf8` cyan/teal |
| Background | Dark gradient + animated blurred orbs (`.background-orbs`) |
| Panel class | `.glass-card` used in HTML + JS-generated markup |
| Pages | `index.html`, `create.html`, `event.html`, `auth-callback.html` |
| JS modules | 16 files under `js/` — logic-heavy; minimal styling logic |
| Backend | Supabase (`events`, `event_participants`, `availability_slots`) |
| Tests | None in app directory |
| Sliders | None (`input[type=time]` for time range) |
