# Time Pass

Personal countdown / count-up app with Google sign-in and Firestore sync.

**Live path:** `/pages/Time-Pass/`

## Local preview

From the repo root:

```bash
npm run dev
```

Open `http://localhost:3000/pages/Time-Pass/`.

Guest **read-only** sample events work without Firebase. Sign-in requires configuration below.

## Firebase setup (required for sign-in / sync)

Time Pass uses a **dedicated** Firebase project (not To-Do List / Journal).

1. Create a Firebase project in the [Firebase Console](https://console.firebase.google.com/).
2. Enable **Authentication → Sign-in method → Google**.
3. Add authorized domains: `localhost`, `xanderwiles.com`, `www.xanderwiles.com` (plus any preview hosts).
4. Create a **Web** app and copy the config object.
5. Create Firestore (production mode), then deploy rules from `firestore.rules` in this folder.
6. Provide config to the app **without committing secrets to git** if you treat them as sensitive. Recommended for local/dev:

```html
<!-- temporary local-only snippet before js/main.js — do not commit -->
<script>
  window.TIME_PASS_FIREBASE_CONFIG = {
    apiKey: "…",
    authDomain: "…",
    projectId: "…",
    storageBucket: "…",
    messagingSenderId: "…",
    appId: "…"
  };
</script>
```

Or replace the `PLACEHOLDER_*` values in `firebase-config.js` once you are ready (web `apiKey` is a public client identifier, but keep service-account keys out of the repo forever).

### Deploy Firestore rules

**Do this in the Firebase Console or CLI for the Time Pass project only** (does not affect other apps):

```bash
# From pages/Time-Pass/ after `firebase use` points at the Time Pass project
npx firebase-tools deploy --only firestore:rules
```

Or paste the contents of `firestore.rules` into **Firestore → Rules** and Publish.

Paths:

- `users/{uid}/events/{eventId}`
- `users/{uid}/settings/app`

## Features

- Guest preview (read-only demos)
- Google sign-in / sign-out
- CRUD events with optional time + timezone, curated colours, per-event units
- Live until / since; recurring daily / weekly (Monday) / monthly / yearly (next + last)
- Filters, search, JSON export/import, PWA offline shell

## Security notes

- Client never writes while signed out.
- Rules require `request.auth.uid == userId`.
- No service-account JSON or private keys belong in this repo.
