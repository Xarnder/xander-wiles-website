# Countdown — Release Checklist

**Locked target:** `2037-07-16T08:11:00+01:00` (BST, 16 July 2037 08:11)

---

## Pre-release gates

### Planning complete

- [x] All questions answered in [`01-questions-and-decisions.md`](./01-questions-and-decisions.md)
- [x] Target ≥ 10 years from June 2026 (~11 years to Jul 2037)
- [x] Q5 documented: **count up** after target (not static zero)
- [x] Q7 documented: **public homepage card**

### Implementation complete

- [ ] `pages/Countdown/index.html`
- [ ] `pages/Countdown/countdown.js` with `TARGET_ISO = '2037-07-16T08:11:00+01:00'`
- [ ] `pages/Countdown/countdown.css` — cosmic + rich animation (Q8, Q10)
- [ ] Countdown **and** count-up modes working
- [ ] Dynamic unit hiding (Q3) — zero-value units not shown
- [ ] No global nav (Q6); home escape control present
- [ ] Visually hidden `<h1>` (Q4); no visible copy
- [ ] Audio toggle + `ambient.mp3` (Q11); **off by default**
- [ ] Favicon pack cloned (Q13)
- [ ] `<meta name="description" content="Something is counting down.">` (Q14)
- [ ] `prefers-reduced-motion` disables particles / flips
- [ ] `<noscript>` fallback (no date revealed)
- [ ] No console errors on happy path
- [ ] No secrets in page files

### Integration

- [ ] Root `index.html` — public homepage card added (Q7)
- [ ] Card copy reviewed — **no date or event spoiler**
- [ ] `nav.html` — **not** modified (confirmed)
- [ ] `build.js` — unchanged OR reviewed

### Quality assurance

- [ ] MT-01 through MT-04, MT-06, MT-07, MT-08, MT-13, MT-15 (see [`04-test-plan.md`](./04-test-plan.md))
- [ ] MT-04 count-up tested with dev override (reverted before merge)
- [ ] MT-03 unit-hiding tested at &lt;1 year override
- [ ] MT-09 rich animation on mobile Safari
- [ ] MT-10 screen reader spot check
- [ ] MT-18 production smoke
- [ ] Lighthouse accessibility ≥ 90

### Review

- [ ] Tab title: **"Countdown"** (Q13)
- [ ] Meta description vague (Q14)
- [ ] Homepage card vague (Q7)
- [ ] Target in source acceptable to owner (Q12)

---

## Deploy steps

### 1. Local verification

```bash
npm run dev
# http://localhost:3000/pages/Countdown/
```

- [ ] Countdown displays ~11 years remaining
- [ ] Home escape works
- [ ] Audio off by default

### 2. Build verification

```bash
npm run build
ls deploy_out/pages/Countdown/
```

- [ ] All assets present including `ambient.mp3` if shipped

### 3. Git / PR

- [ ] Committed when owner requests
- [ ] PR opened if using PR workflow

### 4. Vercel preview

- [ ] Build green
- [ ] MT-02 on preview URL

### 5. Production

- [ ] `https://xanderwiles.com/pages/Countdown/` → 200
- [ ] Homepage card links correctly
- [ ] MT-18 passed

---

## Rollback plan

### When to rollback

- Wrong target time or timezone
- Count-up broken at zero (crash, negative values, freeze)
- Unusable mobile performance (particle jank)
- Audio autoplays without user action
- Homepage card or meta reveals date/event
- Screen reader completely broken

### Procedure

**A — Vercel rollback:** Promote previous deployment.

**B — Git revert:** Revert Countdown commit(s); push.

**C — Partial:** Revert only `index.html` homepage card; leave page at direct URL.

### Verification after rollback

- [ ] Homepage normal
- [ ] No 500s on main routes

---

## Definition of done

### Product

1. Live at `/pages/Countdown/`
2. Counts down to **16 Jul 2037 08:11 BST** with hidden-zero units
3. **Counts up** after target with same unit rules
4. No visible text — numbers only
5. Cosmic rich animation; reduced-motion fallback
6. Optional ambient audio, off by default
7. Public homepage card with vague copy
8. No global nav

### Technical

9. Vanilla static files in `pages/Countdown/`
10. Existing Vercel / `build.js` pipeline
11. No backend / API / DB

### Quality

12. Manual tests signed off
13. No open P0/P1 bugs
14. Rollback understood

---

## Release record

| Field | Value |
|-------|-------|
| Release date | |
| Target shipped | `2037-07-16T08:11:00+01:00` |
| Commit SHA | |
| Deploy URL | `https://xanderwiles.com/pages/Countdown/` |
| Homepage section | |
| Card copy used | |
| Ambient audio source | |
| Rolled back? | Yes / No |
| Notes | |

---

## Post-release backlog (optional)

- In-page motion intensity toggle (beyond OS reduced-motion)
- Custom OG image
- Playwright visual regression
- `sessionStorage` audio preference persistence
