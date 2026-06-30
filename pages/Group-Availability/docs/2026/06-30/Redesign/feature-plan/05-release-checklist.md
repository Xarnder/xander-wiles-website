# Release Checklist — Skeuomorphic UI Redesign

**Feature cycle:** 2026-06-30  
**App:** When To Hang (`pages/Group-Availability/`)  
**Theme:** Light craft paper / brass / Source Sans 3

---

## Definition of done

### Product & design

- [x] All questions answered and logged in `01-questions-and-decisions.md`
- [ ] Light kraft paper theme with dark ink typography (Q1 + Q2)
- [ ] No glassmorphism, blur, or translucent primary panels
- [ ] Brass/copper hardware accents — cyan removed from UI chrome (Q4)
- [ ] Source Sans 3 typography (Q3)
- [ ] Embossed paper calendar cells (Q9)
- [ ] Site nav hidden on app pages (Q8)
- [ ] Buttons: raised + pressed, no hover lift

### Engineering

- [ ] CSS split deployed: `styles/tokens.css`, `styles/components.css`, `styles/calendar.css` via `styles.css` entry (Q6)
- [ ] `.glass-card` fully replaced by `.panel` in HTML + JS (Q7)
- [ ] `.background-orbs` removed from HTML
- [ ] Zero `backdrop-filter` in `pages/Group-Availability/styles/`
- [ ] `#main-nav-placeholder` hidden (Q8)
- [ ] `prefers-reduced-motion` implemented (Q14)
- [ ] Favicon + manifest + `theme-color` updated to kraft/brass (Q13)
- [ ] Heatmap JS colors unchanged (Q10)
- [ ] Native time inputs only (Q12)
- [ ] No changes to `js/api.js`, auth, schema, RLS

### Quality

- [ ] Manual test plan executed — including MT-G06 (nav hidden), MT-G09 (CSS modules), MT-A13 (AA contrast)
- [ ] Muted ink `#5c4f3a` on cream passes AA (or adjusted)
- [ ] Mobile toolbar + iOS safe-area verified
- [ ] Chrome + Safari + Firefox smoke tested
- [ ] No console errors on primary flows

### Deploy

- [ ] `npm run build` succeeds
- [ ] `deploy_out/pages/Group-Availability/styles/*.css` all present
- [ ] Production smoke on `https://xanderwiles.com/pages/Group-Availability/`

### Documentation

- [x] Feature-plan folder committed
- [ ] Optional: note in `DECISIONS.md` that UI accent is brass (supersedes cyan for chrome)

---

## Pre-release checklist

### 1. Decisions gate

- [x] User answered `01-questions-and-decisions.md`
- [x] Decisions log completed
- [x] No blocking open questions

### 2. Code review focus

- [ ] CSS split: no circular `@import`s; load order tokens → components → calendar
- [ ] All `.glass-card` references removed (grep)
- [ ] JS changes are class strings only
- [ ] Brass tokens used consistently (no stray `#38bdf8` in new CSS)
- [ ] `heatmap.js` untouched

### 3. Build verification

```bash
npm run build
ls deploy_out/pages/Group-Availability/styles/
# Expect: tokens.css, components.css, calendar.css
ls deploy_out/pages/Group-Availability/styles.css
```

- [ ] All CSS files in deploy output
- [ ] `supabase-config.js` injection still works

### 4. Staging checks

- [ ] `index.html` — kraft background, no nav, signed in/out
- [ ] `create.html` — form on cream panel
- [ ] `event.html` — paint, overlap, heatmap, organizer
- [ ] Google OAuth round-trip
- [ ] Guest incognito flow
- [ ] Back/home links work without site nav

### 5. Performance

- [ ] No image textures added (Q5)
- [ ] 4 CSS files total acceptable load time
- [ ] Source Sans 3 with `display=swap`

### 6. Accessibility gate

- [ ] WCAG 2.1 AA on 6 pairs from MT-A13
- [ ] Brass `:focus-visible` on all interactives
- [ ] Tab order without nav

---

## Release steps

1. Merge to main
2. Vercel deploy
3. Verify URLs (no site nav visible):
   - `/pages/Group-Availability/index.html`
   - `/pages/Group-Availability/create.html`
   - `/pages/Group-Availability/event.html?slug={slug}`
4. Production OAuth smoke test
5. Visual sign-off from stakeholder

---

## Rollback plan

| Scenario | Action |
|----------|--------|
| CSS split 404s | Revert to single `styles.css` |
| Contrast failure in prod | Hotfix token values in `tokens.css` |
| Nav hide confuses users | Re-enable nav (revert Q8 CSS) without full rollback |
| Full revert | `git revert` styles/ + HTML + JS + favicon |

**No database rollback.**

### Rollback verification

- [ ] Prior UI or hotfixed tokens render
- [ ] Sign-in + paint + save work

---

## Post-release

### Day 0

- [ ] Production smoke
- [ ] Stakeholder visual sign-off on kraft/brass theme

### Day 1–7

- [ ] Mobile feedback (toolbar, outdoor readability)
- [ ] Monitor for “can't find main site” reports (hidden nav)

### Follow-up

- [ ] CI grep: no `backdrop-filter`, no `glass-card`
- [ ] Update `PLAN.md` §16 to skeuomorphic spec
- [ ] Update `DECISIONS.md` accent note (brass vs cyan)
- [ ] Playwright screenshot smoke (optional)

---

## Files changed summary (expected)

| File | Changed? | Notes |
|------|----------|-------|
| `styles/tokens.css` | Yes | **New** — kraft/brass/ink tokens, body, nav hide |
| `styles/components.css` | Yes | **New** — panels, buttons, forms, modal, toast |
| `styles/calendar.css` | Yes | **New** — calendar, heatmap, toolbar, mobile |
| `styles.css` | Yes | Import entry |
| `index.html` | Yes | Font, panel classes, no orbs, theme-color |
| `create.html` | Yes | Same |
| `event.html` | Yes | Same |
| `auth-callback.html` | Yes | Font + theme |
| `js/confirm-modal.js` | Yes | `.panel` |
| `js/index-main.js` | Yes | `.panel` |
| `js/event-main.js` | Yes | `.panel` |
| `js/calendar.js` | Yes | `.panel` |
| `favicon-dark.svg` | Yes | Kraft + brass |
| `site.webmanifest` | Yes | Kraft theme colors |

---

## Sign-off

| Checkpoint | Approved by | Date |
|------------|-------------|------|
| Design decisions finalized | User | 2026-06-30 |
| Implementation step 1 approved | | |
| Implementation complete | | |
| Test plan passed | | |
| Production deploy | | |
