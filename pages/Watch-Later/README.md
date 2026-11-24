# Watch Later

Two separate experiences share Firebase Authentication, but never share list data:

- `private.html` (`/pages/Watch-Later/private.html`): the private watch list. Its `watches`, `tiers`, and `people` records stay scoped to the signed-in user's UID.
- `index.html` (`/pages/Watch-Later/`): Xander's public movie and TV tier list. Visitors do not need an account. Only the verified `xanderwiles@gmail.com` account may publish, edit, rank, or remove recommendations.

The public page reads only `publicRecommendations`. There is no automatic import, migration, or sync from the private list. Publishing constructs a new record from an explicit allowlist; the Firestore rules also reject private fields such as `uid`, `watchWith`, and `watchStatus`.

## Managing recommendations

Open the public page, choose **Owner sign in**, and use the owner Google account. **Add recommendation** requires a title and valid YouTube trailer link, with a type, S–D tier, and position, plus optional year, genre, note, and HTTPS cover image. Lower positions appear first within each tier. Use **Edit pick** to change or remove a recommendation. Removal affects only the public collection.

The collection starts empty. Personal rankings and movie choices are not seeded or inferred from private records.

## Local development and deployment

From the repository root, run `npm run dev` and open `/pages/Watch-Later/`. This page is buildless and is copied by the existing website build. Deploy website source through the repository's normal Vercel workflow; it does not use Firebase Hosting.

Firestore rules are independent of the website deployment. Apply the checked-in rules to the dedicated Watch Later project:

```sh
firebase login
firebase deploy --only firestore:rules --project xanders-watch-later --config pages/Watch-Later/firebase.json
```

Do not add a broad `allow read, write` fallback. Firebase combines matching grants, so a permissive fallback would undo the private/public separation. The private queries must include `where('uid', '==', currentUser.uid)`, including tier deletion.

The rules in this checkout were published to `xanders-watch-later` through Firebase Console on 5 November 2026.

## Tests

```sh
npm ci --prefix tests/watch-later
npm test --prefix tests/watch-later
npm run test:rules --prefix tests/watch-later
```

Rules tests need the Firebase CLI and Java. They use only the local Firestore emulator, project `demo-watch-later`, and port 8187. No test writes target production. UI tests exercise the real page module in a DOM with mocked Firebase services; rules tests independently enforce access in the real emulator.

The private collection uses the compact layout at widths up to 768px. `compact-mobile.mjs` connects its controls to the existing mode, editor, filter and import handlers. Filter and import dialogs temporarily move the original controls and restore them when closed; desktop keeps its inline controls. Reorder tiers remains a persistent mode. The Filter button has no dot indicator. Reset filters shows all titles of the selected media type.

Discover shares the compact header, poster grid and dialog helpers. Its Filter opens the existing title/genre/year search, Settings opens the existing account controls, and Mode offers Watch, Details and owner-only Edit. Details retains recommendation notes and genres. The plus button is owner-only, and the page still reads and writes only `publicRecommendations`. Both pages keep their desktop layouts.

Settings includes **Link before title**, enabled by default. The browser saves this preference for both Add title forms. Turning it off puts Title first; keyboard focus follows the first field when adding, while editing an existing title still focuses Title.

New titles start with **Optional details** collapsed: year, notes, cover image, tier position and private watch-status/people controls stay available there. Genre stays visible and optional. Both forms require a valid YouTube trailer link, shown first by default. Editing an existing title expands its details; invalid optional inputs expand the section so they can be corrected.

For visual QA without signing in or changing production data, run `node tests/watch-later/private-preview.mjs` from the repository root and open `http://127.0.0.1:3108/pages/Watch-Later/private.html`, or `/pages/Watch-Later/?view=recommendations` for Discover. This preview serves the real pages with in-memory Firebase fixtures and mocked title/score lookups. Check 320, 360, 390, 430px and desktop; add the `largeText=1` query parameter to check 200% text, or `guest=1` for guest browsing on Discover. The fixture is test-only and is never imported by the production pages.
