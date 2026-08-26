# Playlist Deck

Personal SvelteKit PWA for YouTube playlists, a chronological subscriptions feed, and regional trending. Source lives in this monorepo at `pages/Custom-YouTube-App/`. Production is a **separate Vercel project** at `https://youtube.xanderwiles.com/` — this app is **not** wired into the main-site `build.js` pipeline, `nav.html`, or homepage.

## Local development

```bash
cd pages/Custom-YouTube-App
cp .env.example .env.local
# fill PUBLIC_GOOGLE_CLIENT_ID and PUBLIC_ALLOWED_GOOGLE_EMAILS
npm install
npm run dev
```

Open `http://localhost:5173`.

## Environment

Canonical env file: `.env.example` in this folder.

| Variable                       | Purpose                                                     |
| ------------------------------ | ----------------------------------------------------------- |
| `PUBLIC_GOOGLE_CLIENT_ID`      | OAuth 2.0 **Web** client ID (public). **No client secret.** |
| `PUBLIC_ALLOWED_GOOGLE_EMAILS` | Comma-separated Google emails allowed to use the app        |

Do not commit `.env.local`. Do not add `googleapis`. YouTube calls are browser `fetch` to Data API v3 with a GIS access token.

## Google Cloud setup

1. Create a **dedicated** Google Cloud project (do not reuse the YouTube Link Extractor API key).
2. Enable **YouTube Data API v3**.
3. Configure the OAuth consent screen:
   - User type: External
   - Publishing status: **Testing**
   - Add your Google account(s) as **test users** (the same addresses as the env allowlist)
4. Create an OAuth **Web application** client.
5. Authorized JavaScript origins (exact):
   - `http://localhost:5173`
   - `https://youtube.xanderwiles.com`
6. Authorized redirect URIs are not required for the GIS token client. Add Vercel preview origins only if you later want preview sign-in.
7. Put the client ID in `PUBLIC_GOOGLE_CLIENT_ID`. Put the same test-user emails in `PUBLIC_ALLOWED_GOOGLE_EMAILS`.

Both gates must pass: Google Testing users **and** the env allowlist. An allowlisted email that is not a test user (or the reverse) cannot sign in.

## Quota

Default YouTube Data API quota is **10,000 units/day**.

| Action                          | Units     | v1 cap                                 |
| ------------------------------- | --------- | -------------------------------------- |
| `playlists.list` mine           | 1 / page  | First page; Load more                  |
| `playlistItems.list`            | 1 / page  | First 100 items (2×50), then Load more |
| `playlistItems.update`          | **50**    | **One call per drop**, moved item only |
| `subscriptions.list`            | 1         | 15 channels, `order=relevance`         |
| `channels.list`                 | 1         | One batched id list                    |
| Channel uploads                 | 1 × 15    | 5 items each                           |
| `videos.list` chart=mostPopular | 1         | 20 videos, default region `GB`         |
| `search.list`                   | expensive | **Not used**                           |

On `quotaExceeded`, writes stop and a calm error is shown. There is no retry loop.

## PWA and YouTube Premium

- Manifest `display: standalone`, `start_url` / `scope` `/`
- Service worker caches **app shell only**. Google / YouTube / `ytimg` hosts are never cached.
- iPad: Share → Add to Home Screen
- **Premium in the iframe is best-effort.** Safari logged into youtube.com may share cookies with `https://www.youtube.com/embed`. A home-screen PWA often has a **separate cookie jar**, so the iframe can look signed-out even after GIS sign-in. Embeds use `youtube.com`, not youtube-nocookie. There is no fake Premium badge.

## Vercel (dedicated project)

1. New Vercel project pointing at this git repo.
2. **Root Directory:** `pages/Custom-YouTube-App`
3. Framework: SvelteKit (`adapter-vercel`)
4. Env: `PUBLIC_GOOGLE_CLIENT_ID`, `PUBLIC_ALLOWED_GOOGLE_EMAILS`
5. Domain: `youtube.xanderwiles.com`
6. Do **not** add this app to the main site’s `build.js`, root `vercel.json`, `nav.html`, or `index.html`.

## Tests

```bash
cd pages/Custom-YouTube-App
npm run check
npm run lint
npm run test:unit
npm run test:e2e
```

Unit tests cover allowlist matching, quota caps, feed merge, and reorder payloads. Playwright mocks YouTube JSON and does **not** call live OAuth or the live API.

Manual iPad checks: sign-in / deny, left-half drag vs right-half scroll, drop visible on YouTube.com, subscriptions newest-first, featured region persist, player Back, Add to Home Screen, Watch Later / Liked play-only if update is forbidden.

## Rollback

Stop or delete the dedicated Vercel project, remove DNS, revert this folder, revoke the OAuth client, and revoke app access in Google Account → Third-party apps. YouTube data stays on YouTube.
