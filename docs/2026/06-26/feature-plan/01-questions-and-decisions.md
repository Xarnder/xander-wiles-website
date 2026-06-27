# Countdown — Questions and Decisions

Answer each question in the **Your answer** block. Mark your chosen option or write free text.

**Decision status legend:**


| Status                  | Meaning                                                       |
| ----------------------- | ------------------------------------------------------------- |
| **Needs user answer**   | Blocks or strongly shapes implementation — waiting on you     |
| **Recommended default** | Sensible default if you want to defer; noted in each question |
| **Safe to decide now**  | Can be decided during implementation without your input       |


---

## Q1 — Target date and time

**Status:** Needs user answer

**Question:** What is the exact target instant the countdown should reach? (Must be ≥ 10 years from today: 2026-06-26, so **no earlier than 2036-06-26**.)

**Why it matters:** This is the core constant of the entire feature. Wrong date = wrong product.

**What could go wrong:**

- Ambiguous date without time → off by up to 24 hours
- Wrong timezone → visitors see a different "zero" moment
- Date too soon → violates the "ten years or more" requirement

**Recommended default:** `2036-07-04T00:00:00` in `Europe/London` (symbolic, far-future, UK-local midnight) — **only if you have no preference**.

**Your answer:**

```
Target ISO datetime:
BST 16th July 2037 8:11:00 am 
```

---

## Q2 — Timezone display strategy

**Status:** Needs user answer

**Question:** Should the countdown count down to an absolute instant (same moment worldwide) or be labeled/displayed in a specific timezone?

**Options:**

- **A)** Absolute instant — internally UTC; all users hit zero at the same global moment
- **B)** Labeled local event time — e.g. "Midnight in London" shown as subtitle; still one instant under the hood
- **C)** No timezone label — numbers only; mystery preserved

**Why it matters:** Affects copy, testing, and how "correct" feels to international visitors.

**What could go wrong:**

- Showing local labels without defining the instant → confusion
- No label but UK-centric target → fine technically, odd narratively for non-UK visitors

**Recommended default:** **A + C** — one absolute instant, no timezone text on page.

**Your answer:**

```
A Hit zero for everyone at same time
```

---

## Q3 — Countdown units and layout

**Status:** Needs user answer

**Question:** Which time units should be displayed?

**Options:**

- **A)** Years, days, hours, minutes, seconds (all five)
- **B)** Days, hours, minutes, seconds (omit years — can be very large day count)
- **C)** Custom breakdown (e.g. only days + hours)

**Why it matters:** With 10+ years remaining, a 5-digit day count or a "years" column changes visual design significantly.

**What could go wrong:**

- Years + days double-count conceptually if not calculated carefully
- Too many columns → cramped on mobile
- Too few units → feels imprecise for a "live" countdown

**Recommended default:** **A** — years, days, hours, minutes, seconds with proper cascading math (years = floor(totalDays / 365.25) or calendar-aware — see technical plan).

**Your answer:**

```
A but units that are 0 are hidden. So once under a year no long says years
```

---

## Q4 — Mystery framing and on-page copy

**Status:** Needs user answer

**Question:** What text (if any) appears besides the numbers?

**Options:**

- **A)** No copy — numbers only
- **B)** Vague title only — e.g. "Countdown", "Something approaches", "—"
- **C)** Custom title + optional subtitle (you provide exact strings)
- **D)** Cryptic hint that teases without revealing (you provide tone guidance)

**Why it matters:** Defines the emotional tone and whether the page is minimalist or narrative.

**What could go wrong:**

- Too much copy → breaks mystery or clutters the visual
- No `<h1>` → accessibility / SEO suffers
- Cryptic copy that reads as error state → user confusion

**Recommended default:** **B** — single vague `<h1>` visually de-emphasized; numbers are hero.

**Your answer:**

```
A no text at all
```

---

## Q5 — Behavior when countdown reaches zero

**Status:** Needs user answer

**Question:** What should happen at and after the target instant?

**Options:**

- **A)** Show `00` across all units + static message (you provide copy)
- **B)** Show a single word/phrase — e.g. "Now.", "It's time.", "—"
- **C)** Transition to a different visual state (color shift, animation stop, reveal — still no explanation of event)
- **D)** Redirect to another URL
- **E)** Combination (describe)

**Why it matters:** The page may live for 10+ years; zero-state UX should be intentional, not a bug.

**What could go wrong:**

- No zero handling → negative numbers or broken display
- Redirect without your URL → dead link
- Over-dramatic reveal → contradicts "mystery" brief

**Recommended default:** **C** — gentle visual shift + **B** phrase `"—"` or `"Now."`; timer holds at zero; no redirect.

**Your answer:**

```
F Keep counting in the oppsite direction, count up 
```

---

## Q6 — Site navigation visibility

**Status:** Needs user answer

**Question:** Should the global site header (`nav-loader.js` / `nav.html`) appear on this page?

**Options:**

- **A)** Yes — standard nav like `Hypnagogia`, `Balanced-Life`
- **B)** No — fully immersive; optional minimal "home" control only
- **C)** Hidden by default; subtle control reveals nav

**Why it matters:** Nav consumes vertical space and breaks full-screen immersion; most repo "beautiful" pages still include nav.

**What could go wrong:**

- No nav → users feel trapped; hurts discoverability of rest of site
- Full nav on mobile → crowds countdown on small screens

**Recommended default:** **A** — include nav for consistency; use CSS to keep countdown vertically centered in remaining viewport.

**Your answer:**

```
B no don't show global nav
```

---

## Q7 — Homepage and nav discovery

**Status:** Needs user answer

**Question:** How should users find this page on xanderwiles.com?

**Options (multi-select OK):**

- **A)** Not listed — direct URL / personal sharing only
- **B)** Hidden Test Pages section on homepage (`#hidden-test-pages`)
- **C)** Public homepage section (e.g. "Guides, Demos & More")
- **D)** Add to `nav.html` main navigation
- **E)** Other (describe)

**Why it matters:** Affects `index.html` and possibly `nav.html` edits; public listing changes who sees the mystery.

**What could go wrong:**

- Public listing → mystery diluted if description is too explicit
- No listing → page is orphaned except direct links
- Nav clutter if every experiment gets a top-level link

**Recommended default:** **A** or **B** — private or hidden-test until you decide to promote.

**Your answer:**

```
C Public
```

---

## Q8 — Visual / aesthetic direction

**Status:** Needs user answer

**Question:** What visual mood should the page evoke?

**Options (pick one primary, optional secondary):**

- **A)** Cosmic / deep space (gradients, stars, slow drift — like site default `style.css`)
- **B)** Ethereal / dreamlike (blobs, blur — like `Hypnagogia`)
- **C)** Minimal / typographic (dark field, sharp numbers, little motion)
- **D)** Ominous / tension (darker palette, subtle pulse)
- **E)** Warm / hopeful (amber accents like site loader gradient `#FF56A1` → `#FF9350`)
- **F)** Describe your own reference (URL, film, album art)

**Why it matters:** Drives CSS architecture and animation budget.

**What could go wrong:**

- Mismatch with mystery tone → feels random on your portfolio
- Over-animated → distracting from digits; battery drain on mobile
- Too minimal → fails "stunning" brief

**Recommended default:** **A + E** — cosmic background with warm accent on active digits; reuse existing CSS variables from `assets/css/style.css`.

**Your answer:**

```
A cosmic
```

---

## Q9 — Typography

**Status:** Recommended default

**Question:** Font choice for countdown digits?

**Options:**

- **A)** `JetBrains Mono` — already loaded on homepage; technical / precise
- **B)** `Outfit` — site default; geometric
- **C)** `Inter` — neutral readability
- **D)** Google Font import specific to this page (you name it)

**Why it matters:** Tabular figures and monospace help prevent layout shift when digits change.

**What could go wrong:**

- Proportional font → jitter on tick
- Extra font → load time

**Recommended default:** **A** for digits, **Outfit** for any title copy.

**Your answer:**

```
C
```

---

## Q10 — Animation intensity

**Status:** Needs user answer

**Question:** How much motion is appropriate?

**Options:**

- **A)** Rich — particles, parallax, glow pulses, digit flip animations
- **B)** Moderate — animated gradient/blob background; digits crossfade or slide subtly
- **C)** Minimal — static gradient; only second-digit updates animate

**Why it matters:** Performance, accessibility, and "stunning" vs "busy".

**What could go wrong:**

- **A** on low-end phones → jank, heat
- **C** → may under-deliver on "beautiful" brief

**Recommended default:** **B** — CSS-driven background motion + lightweight digit update transition; no canvas unless needed.

**Your answer:**

```
A 
```

---

## Q11 — Audio

**Status:** Needs user answer

**Question:** Should the page include sound?

**Options:**

- **A)** Silent
- **B)** Optional ambient loop (off by default; user enables)
- **C)** Subtle tick on second change (likely annoying — not recommended)

**Why it matters:** Autoplay policies, user surprise, asset hosting.

**What could go wrong:**

- Autoplay audio → browser blocks; bad UX
- Loop without mute → drives users away

**Recommended default:** **A** — silent.

**Your answer:**

```
B
```

---

## Q12 — Target date visibility in source code

**Status:** Recommended default

**Question:** The target instant will be visible in client-side JS to anyone who views source. Is that acceptable?

**Context:** True secrecy is impossible without a server. Obfuscation is security theater.

**Why it matters:** Sets expectations for "mystery" — it's narrative mystery, not cryptographic.

**What could go wrong:**

- Assuming hidden date → spoiled by curious visitors
- Over-engineering obfuscation → complexity for no real gain

**Recommended default:** Plain constant `TARGET_MS` or ISO string in `script.js` with a short comment; no obfuscation.

**Your answer:**

```
Yes
```

---

## Q13 — Browser tab title and favicon

**Status:** Needs user answer

**Question:** What should the browser tab show?

**Options:**

- **A)** Generic — "Countdown" / site favicon set cloned from root
- **B)** Mysterious — vague title you provide; custom favicon for this page
- **C)** Reuse another page's favicon set temporarily

**Why it matters:** Tab title is visible when sharing; favicon work is ~6 files if custom.

**What could go wrong:**

- Missing page favicons → broken icon on mobile home-screen add
- Too revealing title → spoils mystery in bookmark bar

**Recommended default:** **A** — title `"Countdown"`; clone standard favicon pack from a sibling page (e.g. `Ratio_Calculator`).

**Your answer:**

```
A
```

---

## Q14 — Page `<meta>` description and SEO

**Status:** Recommended default

**Question:** Should we add meta description / Open Graph tags?

**Options:**

- **A)** Minimal — charset, viewport, title only
- **B)** Vague meta description for SEO
- **C)** Full OG/Twitter cards (needs image asset)

**Why it matters:** Link previews when shared in iMessage, Slack, etc.

**What could go wrong:**

- **C** without art → ugly default previews
- Revealing description → spoils mystery in share cards

**Recommended default:** **A** or **B** with vague copy: `"Something is counting down."`

**B**

---

## Decisions safe to make now (no answer needed)


| ID  | Decision                                                | Rationale                                     |
| --- | ------------------------------------------------------- | --------------------------------------------- |
| D1  | Vanilla HTML + CSS + JS (no framework)                  | Matches majority of `pages/`*                 |
| D2  | No backend / API / database                             | Scope is static countdown                     |
| D3  | No auth                                                 | Public page                                   |
| D4  | Deploy via existing `build.js` copy                     | No special build step                         |
| D5  | `requestAnimationFrame` or `setInterval(1000)` for tick | Simple, sufficient                            |
| D6  | `visibilitychange` listener to resync on tab focus      | Handles backgrounded tabs                     |
| D7  | `prefers-reduced-motion` disables decorative animation  | Repo precedent (`Siewli`, `ringtone-trimmer`) |
| D8  | `lang="en"` on `<html>`                                 | Site default                                  |
| D9  | Use absolute paths `/assets/...` for shared assets      | Consistent with newer pages                   |
| D10 | Folder name `pages/Countdown/` (PascalCase)             | Matches user request and repo convention      |


---

## Answer log


| Question | Answered | Date | Notes |
| -------- | -------- | ---- | ----- |
| Q1       | ☑        | 2026-06-26 | `2037-07-16T08:11:00+01:00` (BST) |
| Q2       | ☑        | 2026-06-26 | Absolute instant; no timezone label |
| Q3       | ☑        | 2026-06-26 | All 5 units; hide when value is 0 |
| Q4       | ☑        | 2026-06-26 | No visible text |
| Q5       | ☑        | 2026-06-26 | Count up after target |
| Q6       | ☑        | 2026-06-26 | No global nav |
| Q7       | ☑        | 2026-06-26 | Public homepage card |
| Q8       | ☑        | 2026-06-26 | Cosmic |
| Q9       | ☑        | 2026-06-26 | Inter |
| Q10      | ☑        | 2026-06-26 | Rich animation |
| Q11      | ☑        | 2026-06-26 | Optional ambient audio, off by default |
| Q12      | ☑        | 2026-06-26 | Plain constant in source OK |
| Q13      | ☑        | 2026-06-26 | Title "Countdown"; standard favicons |
| Q14      | ☑        | 2026-06-26 | Vague meta description (option B) |

**Planning complete — awaiting owner approval of Phase 1 implementation step.**