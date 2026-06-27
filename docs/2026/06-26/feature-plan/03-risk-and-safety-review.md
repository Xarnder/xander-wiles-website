# Countdown — Risk and Safety Review

**Updated for locked decisions** — see [`01-questions-and-decisions.md`](./01-questions-and-decisions.md).

Static, client-only feature. Risk profile: **low** security/privacy; **elevated** performance and UX complexity due to Q10 (rich animation), Q5 (count-up), and Q3 (dynamic unit columns).

---

## Security risks

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| **Target date exposed in client JS** | Low | Certain | Accepted per Q12; narrative mystery only |
| **XSS via `innerHTML`** | Low | Low | `textContent` only for digits; no user input |
| **Audio file supply chain** | Low | Low | Host `ambient.mp3` in repo; verify license; no external stream URL |
| **Font CDN** | Low | Low | `fonts.googleapis.com` — same as site |
| **Compromised deploy** | Medium | Very low | Standard repo / Vercel controls |

### Authentication and authorization

- No auth, cookies, or PII collection
- Public target datetime in source — accepted

---

## Privacy risks

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| **Vercel IP logging** | Low | Certain | Existing site policy |
| **Canvas fingerprinting** | Low | Low | Particles are decorative only; no readback/export |
| **Audio listening indicator** | None | — | User-initiated only |
| **Analytics** | None | — | Not in scope |

No additional GDPR consent beyond site-wide policy.

---

## Performance risks

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| **Canvas particle rAF + CSS animations (Q10=A)** | **High** | **High** on mobile | Cap particle count; pause rAF when tab hidden; disable entirely under `prefers-reduced-motion` |
| **Dual animation loops** | Medium | High | `setInterval(1s)` for timer + rAF for particles — keep particle logic lightweight |
| **Layout shift when units hide/show (Q3)** | **Medium** | **High** at year/day boundaries | `tabular-nums`; grid transition; min-width per column |
| **Digit flip animations every second** | Medium | High | Flip only the changed digit; skip under reduced motion |
| **Timer drift in background tabs** | Low | High | `visibilitychange` resync |
| **Audio file size** | Low | Medium | Compress MP3; `preload="none"`; load on first toggle |
| **Inter font load** | Low | Medium | `preconnect` + `font-display: swap` |

### Revised performance budget (Q10 = rich)

| Metric | Target |
|--------|--------|
| HTML + CSS + JS (excl. audio/fonts) | &lt; 80 KB |
| `ambient.mp3` | &lt; 2 MB |
| FCP | &lt; 2s on 3G Fast |
| Idle CPU | Low — rAF throttled when hidden |
| Mobile frame rate | ≥ 30fps particles; degrade to CSS-only stars if jank detected |

**Rollback trigger:** sustained jank or battery complaints on iOS Safari → reduce to CSS-only stars (Q10 fallback).

---

## Correctness / longevity risks

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| **BST offset wrong for Jul 2037** | Medium | Low | Locked: `2037-07-16T08:11:00+01:00`; verify in MT-02 against timeanddate.com |
| **Count-up math diverges from countdown** | Medium | Medium | Single `decomposeTime(absMs)` for both modes |
| **All units hidden at exactly zero** | Medium | Medium | Force-show seconds = 0 when all parts zero |
| **Years column flicker near 1-year boundary** | Low | Medium | Hide only when `years === 0`, not when rounding |
| **Count-up over multi-year elapsed** | Low | Certain after 2038+ | Same decomposition; years reappear — test with overridden clock |
| **Leap year / 365.25 approximation** | Low | Low | Document acceptable drift (&lt; 1 day over decades) |

---

## Accessibility risks

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| **No visible heading (Q4=A)** | Medium | Certain | `.visually-hidden` `<h1>Countdown</h1>` |
| **`aria-live` per-second spam** | High | High if `polite` | Use `aria-live="off"`; optional minute-boundary summary |
| **Rich motion / vestibular (Q10=A)** | **High** | **Medium** | `prefers-reduced-motion` disables particles, parallax, digit flips |
| **Seizure / flashing** | High | Low | No full-screen flash &gt; 3 Hz; glow pulse slow |
| **Low contrast on cosmic bg** | Medium | Medium | Test digits ≥ 4.5:1; avoid low-opacity gray on purple |
| **No nav — keyboard trap concern (Q6=B)** | Low | Low | Home link + audio button focusable; no trap |
| **Audio without caption** | Low | Certain | Ambient loop only — no speech; toggle labeled |
| **Count-up meaning unclear to screen readers** | Medium | Medium | `aria-label` on timer could note elapsed vs remaining on mode change |

---

## UX risks (new — from locked decisions)

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| **Count-up surprises visitors (Q5)** | Medium | High after 2037 | Intentional per owner; optional subtle `is-elapsed` visual |
| **No nav — users feel stuck (Q6=B)** | Medium | Medium | Visible-on-hover home escape in corner |
| **Public homepage card spoils mystery (Q7=C)** | Low | Medium | Vague card copy; no date in description |
| **Empty-looking page (Q4=A)** | Low | Low | Digits are the entire UI — must be visually striking |
| **Unit columns jumping (Q3)** | Medium | High | Animated grid reflow; test at boundaries |

---

## Operational risks

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| **Broken deploy** | Medium | Low | Vercel preview + MT-15 |
| **Missing `ambient.mp3`** | Medium | Medium until sourced | Block Phase 3 on asset; page works silent |
| **Homepage card in wrong section** | Low | Low | Confirm section with owner during Phase 4 |
| **Case-sensitive path** | Low | Low | `pages/Countdown/` exact casing |

---

## Edge cases (risk-focused)

| Scenario | Risk | Response |
|----------|------|----------|
| Page open across 2037-07-16 08:11 BST | Medium | Seamless switch countdown → count-up; no page reload |
| User returns years after 2037 | Low | Count-up shows elapsed time correctly |
| Audio toggled then tab backgrounded | Low | Optional: pause audio when `document.hidden` |
| Reduced motion + rich animation expectation | Medium | Functional countdown without particles — acceptable degradation |
| Share preview (Q14=B) | Low | Description vague: "Something is counting down." |
| Homepage public listing | Low | Card must not mention date or "2037" |

---

## Abuse scenarios

| Scenario | Assessment |
|----------|------------|
| DDoS | Vercel CDN — same as site |
| Scraping target from source | Accepted (Q12) |
| Hotlinking `ambient.mp3` | Low impact |

---

## Rollback triggers

Revert if:

- Target wrong by &gt; 1 minute vs `2037-07-16T08:11:00+01:00`
- Count-up broken (negative values, crash at zero)
- Severe mobile jank from particles
- Screen reader unusable
- Homepage card copy reveals date/event
- Audio autoplays without user action

Procedure: [`05-release-checklist.md`](./05-release-checklist.md).

---

## Risk acceptance (locked)

1. Client-visible `TARGET_ISO`
2. Client system clock is source of truth
3. Rich animation on by default; reduced via OS preference only (no in-page motion toggle unless added later)
4. Count-up with no explanatory copy
5. No global navigation

---

## Pre-implementation sign-off

| Area | Status |
|------|--------|
| Security | ☑ Low risk — proceed |
| Privacy | ☑ Low risk — proceed |
| Performance | ⚠ Elevated — monitor Q10 on mobile |
| Accessibility | ⚠ Requires hidden h1 + reduced motion + live region care |

**Unblocked** — implementation may proceed after owner approves Phase 1 step.
