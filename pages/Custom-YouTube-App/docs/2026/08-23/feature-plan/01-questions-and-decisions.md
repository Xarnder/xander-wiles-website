# Custom YouTube App — Questions and Decisions

**Feature cycle:** 2026-08-23  
**Status:** **Locked** (2026-08-23) except **Q21** (PWA home-screen name) — still blank. Technical plan updated in [`02-technical-plan.md`](./02-technical-plan.md). **No implementation until you approve the summary in chat.**  
**Related:** [`00-brief.md`](./00-brief.md) · [`02-technical-plan.md`](./02-technical-plan.md)

**Decision status legend:**

| Status | Meaning |
|--------|---------|
| `Needs user answer` | Blocks or strongly shapes implementation — waiting on you |
| `Recommended default` | Sensible default if you want to defer; confirm or override |
| `Safe to decide now` | Can be decided during implementation without your input |
| `Locked` | Confirmed from your checkboxes / written answers |

---

## Locked decision summary

| Q | Decision | Status |
|---|----------|--------|
| Q1 | **C** — Custom subdomain; source in this monorepo; **separate Vercel project**. Not in `build.js`. | `Locked` |
| Q2 | Production host **`youtube.xanderwiles.com`**. Local `http://localhost:5173`. | `Locked` |
| Q3 | **B** — Browser **Google Identity Services** + `fetch` to YouTube Data API. Client ID only. **No `googleapis` in production.** | `Locked` |
| Q4 | **C** — Hard **email allowlist** in env (“My emails only”) **and** OAuth Testing mode (Q6). Exact emails TBD. | `Locked` (emails still needed) |
| Q5 | **A** — New dedicated Google Cloud project + OAuth Web client. Do not reuse `PUBLIC_YOUTUBE_API_KEY`. | `Locked` |
| Q6 | **A** — Consent screen stays **Testing** + test users. No Google verification in v1. | `Locked` |
| Q7 | **A** — Scope `https://www.googleapis.com/auth/youtube` only. | `Locked` |
| Q8 | **B** — **All tabs require sign-in.** No public API key for Featured. | `Locked` |
| Q9 | **A** — First 15 subscriptions, `order=relevance`, single page. | `Locked` |
| Q10 | **B** — **5** latest uploads per channel, no extra pages. | `Locked` |
| Q11 | **C** — Featured default **`GB`** + user region picker in `localStorage`. | `Locked` |
| Q12 | **B** — First **100** playlist items + Load more. Drag only among loaded items. | `Locked` |
| Q13 | **A** — **One** `playlistItems.update` for the moved item on drop. Optimistic UI; rollback on error. | `Locked` |
| Q14 | **B** — Full-screen player overlay + **shallow history** (`?v=`). | `Locked` |
| Q15 | **B** — Ship PWA; Premium-in-iframe is **best-effort**; document Safari vs home screen. Embed `youtube.com` not nocookie. | `Locked` |
| Q16 | **C** — **No** nav link, **no** homepage card. Subdomain only. | `Locked` |
| Q17 | **A** — Dark media UI, **non-YouTube-red** accent (amber/gold), Outfit (or equivalent), bottom tabs. | `Locked` |
| Q18 | **A** — Default tab **Playlists**; remember last tab; lazy-load the others. | `Locked` |
| Q19 | **B** — Show Watch Later / Liked if API returns them; play; **disable reorder** if update is forbidden. | `Locked` |
| Q20 | **A** — **Reorder only.** No create/delete playlist, no remove-from-playlist. | `Locked` |
| Q21 | Home-screen `name` / `short_name` | **`Needs user answer`** (blank) |
| Q22 | **A** — Vitest + **mocked** Playwright. No live YouTube in CI. | `Locked` |
| D1–D12 | Safe defaults (Svelte 5, Tailwind v4, `ssr=false`, quota caps, a11y fallbacks, omit `googleapis`) | `Locked` |

---

## Remaining items before / during implementation

| Item | Status |
|------|--------|
| Q21 PWA name | Still blank — see recommended default under Q21. Implementation will use **“Playlist Deck”** / **“Deck”** unless you override. |
| Exact allowlist emails | You wrote “My emails only” — values for `PUBLIC_ALLOWED_GOOGLE_EMAILS` (and Google Cloud test users) still needed. |
| Google Cloud project ID | Q5-A chosen; exact project id created in Console at setup time. |

---

## How to answer

Fill the input under each question (and tick a checkbox for multiple choice). After you reply in chat, answers will be copied here as `Locked`.

---

## Hosting, identity, and Google Cloud

### Question 1: Where should the app be hosted? (Multiple Choice)

- **Status**: `Locked` → **C**
- **Why it matters**: This is the biggest fork in the whole plan. The main site Vercel project is a **static** export (`framework: null`, `build.js` → `deploy_out`). Other SvelteKit apps (Routine, Tax Helper) use `adapter-static` and live under `/pages/<Name>/`. A **custom subdomain** plus the `googleapis` **Node library** implies a **serverful** SvelteKit deploy (`adapter-vercel`) — which **cannot** be dropped into the current static pipeline without a separate Vercel project (or a major change to how the whole site deploys). The wrong choice means OAuth redirect URIs, PWA `start_url`/`scope`, and API architecture all have to be ripped out later. A subdomain also gives a **root-scope PWA** (better iPad “Add to Home Screen”); a `/pages/...` path gives a **nested-scope** PWA.
- **Recommended Default**: **C** — Source stays in this repo at `pages/Custom-YouTube-App/`, but **production is a separate Vercel project** on a custom subdomain (PWA at `/`, Node available if we use `googleapis` on the server). Do **not** inject this app into `build.js` unless you later choose A.
- **Options**:
  - [ ] A — Same pattern as Routine: static SPA on the main site at `https://xanderwiles.com/pages/Custom-YouTube-App/`
  - [ ] B — Custom subdomain only, **new git repo** / fully separate codebase (not this monorepo)
  - [x] C — Custom subdomain, **source in this monorepo**, **separate Vercel project** (recommended)
  - [ ] D — Custom subdomain **and** also list it on the main site (iframe or redirect from `/pages/Custom-YouTube-App/`)
  - [ ] Custom/Other: 
- **Your Answer**: C (checkbox)

### Question 2: What hostname should production use?

- **Status**: `Locked`
- **Why it matters**: Google OAuth **Authorized JavaScript origins** and **Authorized redirect URIs** must match exactly. A PWA’s `start_url` and service-worker scope are origin-specific. Guessing `youtube.xanderwiles.com` vs `yt.xanderwiles.com` vs something else means shipping the wrong origins and a broken Sign in button. DNS + Vercel domain must be created before production OAuth works.
- **Recommended Default**: A dedicated media hostname such as `youtube.xanderwiles.com` (or `watch.xanderwiles.com` if you prefer not to use the YouTube trademark in the hostname). Local: `http://localhost:5173`.
- **Your Answer**: `youtube.xanderwiles.com`

### Question 3: How should YouTube API calls be made? (Multiple Choice)

- **Status**: `Locked` → **B**
- **Why it matters**: You asked to install `googleapis` (Node) **and** to put only a **Google OAuth Client ID** in `.env.example`. Those two pull in opposite directions. `googleapis` + refresh tokens need a **client secret** kept on a **server**. The Markdown Editor (and your `.env.example` wording) match **Google Identity Services in the browser**: Client ID only, access token in memory, `fetch` to `https://www.googleapis.com/youtube/v3/...`. Putting a client secret in a static SPA leaks it. Calling YouTube **only** from the browser also avoids a proxy that could spend **your** quota for **any** visitor. Server-side `googleapis` is better for token refresh and hiding secrets, but only if Q1 provides Node.
- **Recommended Default**: **B** if Q1 is static/main-site; **A** if Q1 is a separate Vercel project with Node. Overall recommendation if you accept C+subdomain: **A** (server `googleapis`, httpOnly session, Client ID **and** secret in Vercel env — `.env.example` should list both, secret never committed). If you want zero server: **B** and **do not use** `googleapis` **at runtime** (optional stub only).
- **Options**:
  - [ ] A — **Server:** SvelteKit hooks/routes + `googleapis` + OAuth code flow; access/refresh on the server (needs Client Secret)
  - [x] B — **Browser:** Google Identity Services token client + `fetch` to YouTube Data API; Client ID only; **no** `googleapis` **in production**
  - [ ] C — Hybrid: GIS in the browser for login, SvelteKit proxy routes still use `googleapis` (still needs secret + Node)
  - [ ] Custom/Other: 
- **Your Answer**: B (checkbox). **Implication:** dedicated Vercel project still, but **no Node YouTube proxy** and **`googleapis` is not a runtime dependency.**

### Question 4: Who is allowed to use the app? (Multiple Choice)

- **Status**: `Locked` → **C**
- **Why it matters**: Scope `https://www.googleapis.com/auth/youtube` can **manage** the signed-in user’s YouTube account (playlists, etc.). If the OAuth client is External and anyone can click Sign in, strangers can grant access **to their own** accounts — or, if we mistakenly used a single API key / your refresh token, **to yours**. Google will not verify this kind of “YouTube replacement” easily. An open app also burns the **10,000 unit/day** quota. Locking to test users is the only realistic v1 on a Testing consent screen.
- **Recommended Default**: **A** — Google Cloud OAuth **Testing** mode; only your account(s) as test users. Optional extra client-side allowlist on email as belt-and-braces (not a substitute for Testing mode).
- **Options**:
  - [ ] A — **Personal / test users only** (Testing consent screen) — recommended
  - [ ] B — Any Google account may sign in (still their own YouTube data); accept quota + verification burden
  - [x] C — Hard allowlist of emails in env (e.g. yours only) even if OAuth would otherwise allow more
  - [ ] Custom/Other: 
- **Your Answer**: My emails only  
- **Follow-up:** Exact addresses for `PUBLIC_ALLOWED_GOOGLE_EMAILS` are still an implementation assumption until you paste them (and add the same accounts as OAuth test users).

### Question 5: Which Google Cloud project / OAuth client? (Multiple Choice)

- **Status**: `Locked` → **A**
- **Why it matters**: Mixing this client with Markdown Editor’s Drive OAuth client (different scopes, different origins) makes consent screens and authorized origins messy. Reusing the **YouTube Link Extractor API key** is wrong for `mine` playlist writes. Creating a dedicated project keeps YouTube quota, OAuth brand, and keys isolated. A wrong project ID means enabling the wrong APIs or blowing a key used elsewhere.
- **Recommended Default**: **A** — New Google Cloud project (e.g. `yt-client-xander` or similar) with **YouTube Data API v3** enabled and a **Web application** OAuth client. Do not reuse `PUBLIC_YOUTUBE_API_KEY` for authenticated calls.
- **Options**:
  - [x] A — **New dedicated Google Cloud project + OAuth Web client** — recommended
  - [ ] B — Reuse an existing project — specify which:
  - [ ] Custom/Other: 
- **If B or custom, project / client notes:** 
- **Your Answer**: A (checkbox)

### Question 6: OAuth consent screen publishing (Multiple Choice)

- **Status**: `Locked` → **A**
- **Why it matters**: Publishing + Google verification for the YouTube scope is slow, invasive, and often **refused** for “YouTube-like” clients. Staying in **Testing** means only listed test users can sign in, and the app shows an “unverified” warning — which is acceptable for a personal iPad tool. Choosing In production without verification **breaks sign-in** for anyone not in the test list after Google’s grace period.
- **Recommended Default**: **A** — Remain in **Testing**; add your Google account(s) as test users. No verification in v1.
- **Options**:
  - [x] A — **Testing mode + test users only** — recommended
  - [ ] B — Aim for Production / verification in this cycle (high delay and rejection risk)
  - [ ] Custom/Other: 
- **Your Answer**: A (checkbox)

---

## YouTube API behaviour and quota

### Question 7: What OAuth scope should we request? (Multiple Choice)

- **Status**: `Locked` → **A**
- **Why it matters**: `https://www.googleapis.com/auth/youtube` is what you specified and is enough to **update playlist item positions**. Narrower scopes (e.g. `youtube.readonly`) **cannot** persist drag-and-drop. Broader scopes increase consent friction and verification risk. `youtube.force-ssl` is similar in practice for Data API. Requesting extra scopes “just in case” makes the Google prompt scarier and is harder to justify.
- **Recommended Default**: **A** — Exactly `https://www.googleapis.com/auth/youtube` (as specified). No Drive, no extra Google APIs.
- **Options**:
  - [x] A — `https://www.googleapis.com/auth/youtube` **only** — recommended / matches brief
  - [ ] B — `youtube.force-ssl` instead
  - [ ] C — Read-only now, add write later (breaks v1 reorder-to-YouTube)
  - [ ] Custom/Other: 
- **Your Answer**: A (checkbox)

### Question 8: Can Featured (trending) work while signed out? (Multiple Choice)

- **Status**: `Locked` → **B**
- **Why it matters**: `videos.list` + `chart=mostPopular` can use an **API key** (public chart). Playlists (mine) and subscriptions **cannot**. If Featured requires login, the first-run story is a hard gate. If Featured is public, we need a **separate** `PUBLIC_YOUTUBE_API_KEY` (or the existing one) and must not confuse it with OAuth. Sharing one over-used key with YouTube Link Extractor can exhaust quota for **both** tools.
- **Recommended Default**: **B** — Entire app behind Google sign-in in v1 (simpler; one quota pool under the OAuth project; no extra public key). Trending still uses `videos.list` with the user token.
- **Options**:
  - [ ] A — Featured visible signed-out via API key; other tabs gated
  - [x] B — **All tabs require sign-in** — recommended
  - [ ] Custom/Other: 
- **Your Answer**: B (checkbox)

### Question 9: How do we pick the “top 15” subscribed channels? (Multiple Choice)

- **Status**: `Locked` → **A**
- **Why it matters**: `subscriptions.list` does not return a user-curated “top” ranking. Default order is typically **relevance** (not last-watched). Alphabetical vs most recently subscribed vs first 15 in API order will change the feed completely. Fetching **all** subscriptions then ranking locally can **paginate** (`pageToken`) and burn quota. Picking the wrong 15 makes the feed feel “not my YouTube.”
- **Recommended Default**: **A** — First **15** from `subscriptions.list` with `order=relevance`, `maxResults=15`, **no extra pages** on first load (1 unit). Document that “top” means YouTube’s relevance order. Optional later: “load more channels.”
- **Options**:
  - [x] A — First 15 from API `order=relevance`, single page — recommended
  - [ ] B — First 15 `order=unread`
  - [ ] C — Alphabetical first 15 (`order=alphabetical`)
  - [ ] D — Paginate all subscriptions, then pick 15 by most recent activity (more quota, slower)
  - [ ] Custom/Other: 
- **Your Answer**: A (checkbox)

### Question 10: How many latest videos per subscribed channel? (Multiple Choice)

- **Status**: `Locked` → **B**
- **Why it matters**: Each `playlistItems.list` on an uploads playlist is **1 unit** (plus more if you paginate). 15 channels × 1 page is ~15 units plus 1 for subscriptions and 1 for batched `channels.list`. If each channel returns 50 items, the merged feed is huge and still misses true chronology across channels (you only have each channel’s latest 50). If each returns 1, the feed is thin. Unbounded pagination on 15 upload playlists is how you blow the daily quota.
- **Recommended Default**: **B** — `maxResults=5` per uploads playlist, **one page only** (15 units). Merge and sort. Enough for a “what dropped lately” feed without 15× pagination.
- **Options**:
  - [ ] A — 1 latest video per channel (very cheap, thin feed)
  - [x] B — **5 latest per channel, no extra pages** — recommended
  - [ ] C — 10 latest per channel, no extra pages
  - [ ] D — Paginate each uploads playlist until N days of history (quota trap)
  - [ ] Custom/Other: 
- **Your Answer**: B (checkbox)

### Question 11: How is Featured `regionCode` chosen? (Multiple Choice)

- **Status**: `Locked` → **C**
- **Why it matters**: `regionCode` is an **ISO 3166-1 alpha-2** country code (`GB`, `US`, …), **not** a language. `navigator.language` of `en-GB` → `GB` is reasonable; `en` alone is not a region. A wrong default (US when you want GB) makes Featured feel like someone else’s YouTube. A user toggle needs UI and persistence.
- **Recommended Default**: **C** — Default `GB` (you’re on this project in the UK) with a small selector (GB / US / IE / DE / … common set) persisted in `localStorage`. Do not silently use US.
- **Options**:
  - [ ] A — Always `US`
  - [ ] B — Parse `navigator.language` (fallback `US` if no country)
  - [x] C — **Default** `GB` **+ user region picker** — recommended
  - [ ] D — Default `GB` only, no picker in v1
  - [ ] Custom/Other: 
- **Your Answer**: C (checkbox)

### Question 12: Playlist items — how many to load / allow dragging? (Multiple Choice)

- **Status**: `Locked` → **B**
- **Why it matters**: `playlistItems.list` pages of 50 cost **1 unit each**. A 3,000-item playlist is 60 list calls **before** any reorder. `playlistItems.update` is **50 units per moved item**. Updating **every** item after a drag would destroy the quota. We must cap list size and **only update the moved item’s** `snippet.position` (YouTube shifts others). If we allow drag on a truncated list, positions beyond the cap are unseen — dropping “to the end” is only the end of the **loaded** window.
- **Recommended Default**: **B** — Load first **100** items (2 pages max) in v1; “Load more” fetches the next page. Drag only among **loaded** items. One `update` call per completed drop. Warn on playlists larger than the loaded window.
- **Options**:
  - [ ] A — First 50 only (1 page), no load-more in v1
  - [x] B — **First 100 + Load more** — recommended
  - [ ] C — Paginate the entire playlist on open (quota/time risk)
  - [ ] Custom/Other: 
- **Your Answer**: B (checkbox)

### Question 13: After a drag, what do we send to YouTube? (Multiple Choice)

- **Status**: `Locked` → **A**
- **Why it matters**: Each `playlistItems.update` is **50 units**. Updating all rows after every drop can exhaust the daily quota in a handful of gestures. YouTube accepts a new `snippet.position` on **the moved item** and reindexes the rest. Debouncing vs waiting for drop-finalize changes how “laggy” the official playlist feels. Wrong payload (missing `snippet.resourceId` / `playlistId`) **clears** fields — the update method **replaces** specified parts.
- **Recommended Default**: **A** — On `finalize` only, **one** `playlistItems.update` for the dragged item with `part=snippet`, including `playlistId`, `resourceId`, and new `position`. Optimistic UI; rollback on error. No updates on `consider`.
- **Options**:
  - [x] A — **Single update of the moved item on drop** — recommended
  - [ ] B — Update every item whose index changed (very expensive)
  - [ ] C — Debounce 1s after last drop then sync (can feel desynced)
  - [ ] Custom/Other: 
- **Your Answer**: A (checkbox)

---

## Player, PWA, and product chrome

### Question 14: How should the player be presented? (Multiple Choice)

- **Status**: `Locked` → **B**
- **Why it matters**: A route like `/watch/[id]` is bookmarkable and back-button friendly but fights a tabbed iPad shell (users expect to return to the same tab + scroll). A modal/full-screen overlay keeps tab state. iPadOS standalone PWAs also have quirks with `iframe` + fullscreen. Wrong choice means lost scroll position or broken back navigation.
- **Recommended Default**: **B** — Full-viewport overlay (dialog) on top of the current tab; history via SvelteKit **shallow routing** (`?v=` or `/watch/` shallow) so Back closes the player. Official IFrame API; `origin` set to the app origin.
- **Options**:
  - [ ] A — Dedicated `/watch/[videoId]` page (unmounts tab)
  - [x] B — **Full-screen overlay + shallow history** — recommended
  - [ ] C — Overlay with no URL change (Back may leave the app)
  - [ ] Custom/Other: 
- **Your Answer**: B (checkbox)

### Question 15: iPad PWA vs YouTube Premium cookies (Multiple Choice)

- **Status**: `Locked` → **B**
- **Why it matters**: The IFrame Player can use **YouTube’s own cookies** for Premium / account playback **in Safari** if the user is logged into youtube.com. A **home-screen PWA** is often a **separate cookie jar**. Result: signed into *this* app via OAuth (Data API) but the **iframe still sees a logged-out YouTube** — ads, 1080p caps, no Premium. Treating “Premium playback” as a hard v1 guarantee will fail on iPad installed mode. YouTube-nocookie embeds make this **worse**.
- **Recommended Default**: **B** — Use `https://www.youtube.com/embed` (not nocookie). Document: **best in Safari**; standalone PWA may not inherit Premium. v1 still ships as a PWA for chrome-less UI. No fake “Premium badge” that we cannot honour.
- **Options**:
  - [ ] A — PWA is required; Premium-in-iframe is a hard acceptance criterion (high risk of fail)
  - [x] B — **Ship PWA; Premium iframe is best-effort; document Safari vs home screen** — recommended
  - [ ] C — Do not ship as PWA in v1; Safari-only so cookies more likely match
  - [ ] D — Open videos in the YouTube app / new tab instead of iframe (abandons in-app player)
  - [ ] Custom/Other: 
- **Your Answer**: B (checkbox)

### Question 16: Site nav and homepage card? (Multiple Choice)

- **Status**: `Locked` → **C**
- **Why it matters**: Other apps are linked from `nav.html` and `index.html`. A personal YouTube client with a powerful scope should **not** be a drive-by feature for every visitor if Q4 is personal-only. A public card also advertises a ToS-grey “YouTube client.” A custom subdomain might be unlisted on purpose.
- **Recommended Default**: **C** — **No** homepage card and **no** nav link in v1. Access via the subdomain (or direct `/pages/...` URL). Add a private bookmark. Revisit when/if the app is something you’re willing to show publicly.
- **Options**:
  - [ ] A — Nav + homepage card when shipping
  - [ ] B — Nav only
  - [x] C — **No public links** (URL / subdomain only) — recommended
  - [ ] Custom/Other: 
- **Your Answer**: C (checkbox)

### Question 17: Visual design direction (Multiple Choice)

- **Status**: `Locked` → **A**
- **Why it matters**: An iPad “native” client wants a **dark media** surface, large type, and a real tab bar — not a light marketing page and not a YouTube-red clone (trademark + “fake YouTube” look). Generic AI looks (purple glow, Inter-on-white) would feel cheap next to Routine / Time Pass. Wrong direction means a visual rewrite.
- **Recommended Default**: **A** — Dark OLED-friendly media app: near-black canvas, one warm accent (amber/gold, **not** YouTube red), large rounded tiles, SF-like geometric sans via a licensed/open font (e.g. **Outfit** already used on the site — not Inter/Roboto/Arial). Bottom tab bar with filled icons + labels. Motion short; honour `prefers-reduced-motion`.
- **Options**:
  - [x] A — **Dark media / non-YouTube-red accent** — recommended
  - [ ] B — Light iPadOS-like (white bars, grey content)
  - [ ] C — Closely mimic YouTube’s own dark theme (ToS / brand risk)
  - [ ] D — Match Routine’s daylight teal (odd for video)
  - [ ] Custom/Other: 
- **Your Answer**: A (checkbox)

### Question 18: Default tab after sign-in (Multiple Choice)

- **Status**: `Locked` → **A**
- **Why it matters**: First paint quota and first impression. Opening Subscriptions on every launch costs the 15-upload fan-out immediately. Playlists is the unique feature (drag). Featured is cheapest (1 unit) but least “yours.”
- **Recommended Default**: **A** — **Playlists** (the differentiator). Lazy-load Subscriptions and Featured on first visit to that tab. Remember last tab in `localStorage`.
- **Options**:
  - [x] A — **Playlists** + remember last tab — recommended
  - [ ] B — Subscriptions
  - [ ] C — Featured
  - [ ] D — Always last tab, fallback Playlists
  - [ ] Custom/Other: 
- **Your Answer**: A (checkbox)

### Question 19: Include Watch Later / Liked videos in Playlists? (Multiple Choice)

- **Status**: `Locked` → **B**
- **Why it matters**: Those are special playlists (`WL`, `LL`) and sometimes **omit** or restrict `playlistItems.update`. Drag-to-reorder may **403**. Mixing them with user playlists without a warning looks like a bug. They are also easy to confuse with the site’s **Watch Later** page (local, unrelated).
- **Recommended Default**: **B** — Show them in the list if the API returns them, but **disable drag** if update fails or if IDs are known-special; still allow playback. Label them. Do not use the site Watch Later store.
- **Options**:
  - [ ] A — Hide WL / Likes entirely
  - [x] B — **Show, play, no reorder if API forbids** — recommended
  - [ ] C — Treat like any playlist (may error on drop)
  - [ ] Custom/Other: 
- **Your Answer**: B (checkbox)

### Question 20: Playlist mutations besides reorder? (Multiple Choice)

- **Status**: `Locked` → **A**
- **Why it matters**: Scope `youtube` **allows** insert/delete playlist items. v1 scope creep (remove video, create playlist) adds destructive UX and more 50-unit writes. Skipping them keeps the cycle to organizer + feeds + player.
- **Recommended Default**: **A** — **Reorder existing items only** in v1. No create/delete playlist, no remove-from-playlist.
- **Options**:
  - [x] A — **Reorder only** — recommended
  - [ ] B — Also remove item from playlist
  - [ ] C — Also create empty playlist / rename
  - [ ] Custom/Other: 
- **Your Answer**: A (checkbox)

### Question 21: PWA name shown under the iPad icon

- **Status**: `Needs user answer`
- **Why it matters**: `short_name` is what iPadOS puts on the home screen (≈12 characters before truncation). “Custom YouTube App” is long and uses the YouTube trademark. A wrong name is annoying to change later (`name` / `short_name` / apple-mobile-web-app-title).
- **Recommended Default**: `name`: **“Playlist Deck”**; `short_name`: **“Deck”**. Avoid “YouTube” in the icon label.
- **Your Answer**: *(blank)*  
- **If you do not answer before coding:** implementation will use the recommended default above.

### Question 22: Automated tests in v1 (Multiple Choice)

- **Status**: `Locked` → **A**
- **Why it matters**: Real Google OAuth + live YouTube in CI needs secrets and burns quota. Playwright against production YouTube is flaky. Zero tests means feed merge / position math / quota caps regress silently. Over-testing OAuth in CI blocks the pipeline.
- **Recommended Default**: **A** — Vitest for merge/sort, reorder `position` payload, quota budget helpers. Playwright with **mocked** YouTube JSON (no live API). Manual OAuth + iPad smoke in README.
- **Options**:
  - [x] A — **Unit + mocked Playwright** — recommended
  - [ ] B — Unit only
  - [ ] C — Playwright against live YouTube (quota + secrets)
  - [ ] Custom/Other: 
- **Your Answer**: A (checkbox)

---

## Safe to decide now

These are locked into [`02-technical-plan.md`](./02-technical-plan.md).

| ID | Decision |
|----|----------|
| D1 | SvelteKit + **Svelte 5 runes** + TypeScript + **Tailwind CSS v4** + `svelte-dnd-action` |
| D2 | `ssr = false` for app routes (tokens and `window` GIS / IFrame API are client-only) |
| D3 | DnD: `delayTouchStart: 80`, `useCursorForDetection: true`; `dragHandleZone` + left-half `dragHandle` overlay; `onconsider` / `onfinalize` (Svelte 5) |
| D4 | Never call `search.list` in v1; Featured is `videos.list` `chart=mostPopular` only |
| D5 | Batch `channels.list` IDs (up to 50 per request); never 15 serial `channels.list` calls |
| D6 | `part` parameters limited to what the UI needs (`snippet`, `contentDetails` as required) |
| D7 | Service worker caches **app shell only**; never cache `googleapis.com` / `accounts.google.com` / `youtube.com` |
| D8 | Thumbnails from YouTube `snippet.thumbnails`; no hotlinking policy violations beyond normal `ytimg.com` usage in a YouTube API client |
| D9 | Keyboard: tab bar, list, dialog; **visible** drag affordance + `aria-label` on the handle; move-up/down buttons for a11y (invisible overlay is not the only method) |
| D10 | `.env.example` documents Client ID + allowlist emails; **no Client Secret** (Q3-B) |
| D11 | **`googleapis` omitted** from the production browser bundle and from `package.json` (Q3-B) |
| D12 | Quality gates: `svelte-check`, lint, Vitest; Playwright mocked |

---

## Next step

Approve the locked summary and [`02-technical-plan.md`](./02-technical-plan.md) in chat (and optionally fill Q21 + allowlist emails). **No application code until then.**
