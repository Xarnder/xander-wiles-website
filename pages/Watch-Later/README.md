# Watch Later

Two separate experiences share Firebase Authentication, but never share list data:

- `index.html` (`/pages/Watch-Later/`): the existing private watch list. Its `watches`, `tiers`, and `people` records stay scoped to the signed-in user's UID.
- `recommendations.html` (`/pages/Watch-Later/recommendations.html`): Xander's public movie and TV tier list. Visitors do not need an account. Only the verified `xanderwiles@gmail.com` account may publish, edit, rank, or remove recommendations.

The public page reads only `publicRecommendations`. There is no automatic import, migration, or sync from the private list. Publishing constructs a new record from an explicit allowlist; the Firestore rules also reject private fields such as `uid`, `watchWith`, and `watchStatus`.

## Managing recommendations

Open the public page, choose **Owner sign in**, and use the owner Google account. **Add recommendation** publishes a title, type, S–D tier, and position, with optional year, genre, note, HTTPS cover image, and YouTube trailer. Lower positions appear first within each tier. Use **Edit pick** to change or remove a recommendation. Removal affects only the public collection.

The collection starts empty. Personal rankings and movie choices are not seeded or inferred from private records.

## Local development and deployment

From the repository root, run `npm run dev` and open `/pages/Watch-Later/recommendations.html`. This page is buildless and is copied by the existing website build. Deploy website source through the repository's normal Vercel workflow; it does not use Firebase Hosting.

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
