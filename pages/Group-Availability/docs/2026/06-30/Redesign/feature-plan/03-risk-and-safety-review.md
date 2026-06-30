# Risk and Safety Review — Skeuomorphic UI Redesign

**Feature cycle:** 2026-06-30  
**Scope:** Visual/interaction layer only (CSS split + HTML/JS class renames)  
**Theme:** Light craft paper / kraft desk / brass accents (decisions locked)

---

## Executive summary

This redesign remains **low risk to data integrity and security** — no Supabase, auth, or API changes. With decisions locked, the **highest risks shift to**:

1. **WCAG contrast** on kraft textured backgrounds with muted ink text (P0)
2. **Light-theme calendar cells** — green/yellow on cream paper must stay distinguishable (P1)
3. **CSS split deploy** — ensure all `@import` files reach `deploy_out` (P1)
4. **Hidden site nav** — users lose main-site navigation on app pages; need in-app back links (P2)

Texture performance risk is **low** (Q5 = CSS-only). Nav mismatch risk is **eliminated** (Q8 = hide nav).

---

## Security risks

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| Secrets in new CSS files | Low | Low | No env vars in stylesheets |
| XSS via CSS data-URI noise patterns | Low | Low | Author-controlled only |
| OAuth breakage from HTML changes | Low | Very low | Do not modify `auth-callback.js` redirect logic |
| Guest token handling | None | N/A | Unchanged |
| CSP / Google Fonts | Low | Low | Existing `fonts.googleapis.com` pattern; Source Sans 3 same origin policy |

**Verdict:** No new attack surface.

---

## Privacy risks

**None.** Styling-only change. Avatar `referrerpolicy="no-referrer"` preserved.

---

## Authentication and authorization

| Area | Change? | Notes |
|------|---------|-------|
| Google OAuth | No | |
| Guest tokens | No | |
| Organizer controls | No | JS gating unchanged |
| RLS | No | |

**Visual risk:** Brass primary buttons may look similar to ghost buttons if contrast hierarchy is weak — keep danger actions in distinct red ink/enamel.

---

## Performance risks

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| CSS split = 4 HTTP requests | Low | Certain | Files are small; HTTP/2 multiplexing; acceptable for static app |
| Build pipeline omits `styles/` subfolder | Medium | Low | Verify `deploy_out` after `npm run build` |
| CSS grain patterns repaint cost | Low | Low | Use lightweight repeating gradients; test calendar scroll |
| Google Fonts (Source Sans 3) | Low | Medium | `preconnect` + `display=swap` |
| Removing `backdrop-filter` | **Positive** | Certain | Lower GPU cost |
| Image textures | None | N/A | Q5 = CSS-only — R3 closed |

**Target:** Performance ≥ baseline; likely improves on mobile.

---

## Accessibility risks

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| **Ink on kraft fails AA** | **High** | **Medium-High** | `--text-ink: #2c2416` on `--surface-paper: #f4efe4` must be verified; muted text `#5c4f3a` is highest risk — may need darkening |
| Brass focus rings low contrast | Medium | Medium | Use `--accent-brass-dark` for `:focus-visible`; 2px+ outline |
| Light-theme likely/maybe cells | Medium | Medium | Keep saturated fills; dark ink date numbers on painted cells |
| Heatmap on cream calendar | Medium | Low | JS colors unchanged; ensure `--heatTextColor` dark greens/browns still readable on paper chrome |
| `:active` vs `:disabled` | Medium | Low | Disabled = opacity 0.5 + `cursor: not-allowed`; pressed = inset shadow |
| Color-only brush modes | Medium | Existing | Keep text labels on Likely/Maybe/Eraser buttons |
| Day cell touch targets 24px | Medium | Pre-existing | Do not shrink; brush buttons stay ≥40px |
| `prefers-reduced-motion` | Low | Low | Q14 = full support — disable modal slide |
| Class rename `.panel` | Low | Low | No ARIA impact if attributes preserved |
| Hidden nav — keyboard users | Medium | Medium | Ensure visible **← Back** / **← Home** links on every page; test tab order without nav |

**Verdict:** Contrast on **kraft + muted ink** is P0. Mandatory audit before release.

---

## UX / functional edge cases

| Edge case | Risk | Mitigation |
|-----------|------|------------|
| No site nav — user can't reach main site | Medium | `back-link` to `index.html` on create/event; index is app home |
| Kraft background + bright sunlight readability | Low | Fully light theme (Q2) helps outdoor use vs old dark UI |
| Mobile toolbar on cream page | Medium | Tray needs strong top border shadow to separate from content |
| Out-of-range cells on light paper | Medium | Use faded ink + deboss, not low-opacity white |
| Organizer preview bar (admin/guest) | Low | Opaque amber/brass tints — not translucent rgba |
| Confirm modal on light page | Low | Dark opaque overlay (Q11) provides clear focus |
| `theme-color` browser chrome | Low | Set to `--bg-kraft` so URL bar matches page |
| DECISIONS.md cyan accent docs stale | Low | Document in release notes; UI uses brass per Q4 |

---

## Compatibility risks

| Platform | Concern |
|----------|---------|
| Safari iOS | `-webkit-appearance` on time inputs; inset shadows |
| Chrome Android | Fixed toolbar + keyboard |
| Firefox | `@import` in CSS — verify load order |
| CSS `@import` in production | Confirm `build.js` copies `styles/*.css` |

---

## Dependency / integration risks

| Dependency | Risk | Mitigation |
|------------|------|------------|
| `/assets/css/style.css` hover lift | Low | Extend `transform: none` overrides for `.panel` |
| `nav-loader.js` still loads hidden nav | Low | CSS hide is sufficient; optional DOM removal reduces wasted request |
| `PLAN.md` glass UI spec | Low | Follow-up doc update |
| Cyan in `favicon-dark.svg` | None | Q13 = update favicon |

---

## Data / API safety

- No migrations, RLS changes, or new endpoints
- Rollback: revert `styles/` + HTML/JS + favicon

---

## Risk register (updated)

| ID | Risk | Priority | Status |
|----|------|----------|--------|
| R1 | Contrast failure on kraft/paper | **P0** | Open — audit in Phase 5 |
| R2 | Mobile toolbar regression | P1 | Open |
| R3 | Texture asset weight | ~~P2~~ | **Closed** (CSS-only) |
| R4 | Focus visibility on brass | P1 | Open |
| R5 | Site nav mismatch | ~~P2~~ | **Closed** (nav hidden) |
| R6 | CSS split not deployed | P1 | Open — verify build |
| R7 | Hidden nav — no escape to main site | P2 | Mitigate with back links |

---

## Sign-off criteria (safety)

Before release:

- [ ] Contrast AA on: body ink, muted text, brass button text, likely/maybe cells, alerts
- [ ] Back/home links reachable without site nav
- [ ] Keyboard path: index → create → event → modal
- [ ] Guest flow in incognito
- [ ] `deploy_out` contains `styles/tokens.css`, `components.css`, `calendar.css`
- [ ] No auth/API logic files modified (except `.panel` class strings)
