# Routine Manager

Mobile-first web app for creating, managing, and running step-by-step routines.

Live path (after deploy): `https://xanderwiles.com/pages/Routine/`

## Architecture

- **SvelteKit + Svelte 5 + TypeScript** SPA under `pages/Routine/`
- **Standard CSS** (no Tailwind)
- **Firebase Auth (Google)** + **Cloud Firestore** for routine definitions
- Run session state is **session-local** (memory + `sessionStorage`), not stored in Firestore
- Deployed via the monorepo `build.js` → `deploy_out/pages/Routine/` → Vercel

### Why Firestore (not Storage)?

Routine records are small structured documents (name, ordered tasks, metadata). **Cloud Firestore** is the appropriate Firebase service for that. Firebase Storage is for files/blobs and is not used for routine payloads.

### Data shape

```text
users/{uid}/routines/{routineId}
  name, description?, icon?, tasks[], sortOrder, createdAt, updatedAt
```

Security rules live in `firestore.rules` (uid ownership). Deploy them separately — see below.

## Setup

```bash
cd pages/Routine
npm install
cp .env.example .env
```

Also add the same `PUBLIC_ROUTINE_FIREBASE_*` keys to the **repo root** `.env.local` (and Vercel) so production builds via `build.js` receive them.

### Firebase setup

1. Create a Firebase project (suggested ID: `routine-manager-xander`).
2. Enable **Google** sign-in in Authentication.
3. Create a **Web app** and copy the config into env vars.
4. Create a Firestore database in **production mode**.
5. Authorize domains: `localhost`, `xanderwiles.com`, `www.xanderwiles.com` (plus specific Vercel preview hosts if needed).
6. Deploy security rules (see “Firestore rules deploy” below) **after you approve the rules file**.

### Required environment variables

| Variable | Purpose |
|----------|---------|
| `PUBLIC_ROUTINE_FIREBASE_API_KEY` | Firebase web API key |
| `PUBLIC_ROUTINE_FIREBASE_AUTH_DOMAIN` | Auth domain |
| `PUBLIC_ROUTINE_FIREBASE_PROJECT_ID` | Project ID |
| `PUBLIC_ROUTINE_FIREBASE_STORAGE_BUCKET` | Storage bucket (unused for routines; still part of web config) |
| `PUBLIC_ROUTINE_FIREBASE_MESSAGING_SENDER_ID` | Messaging sender ID |
| `PUBLIC_ROUTINE_FIREBASE_APP_ID` | Web app ID |
| `PUBLIC_ROUTINE_E2E` | Set `true` for Playwright (in-memory backend; no Firebase) |

## Local development

```bash
cd pages/Routine
npm run dev
```

Open the printed local URL (with base path `/pages/Routine/`).

Without Firebase env vars, the UI shows a setup message. With `PUBLIC_ROUTINE_E2E=true`, the app signs in a fake user and uses an in-memory repository.

## Testing

```bash
cd pages/Routine
npm run check
npm run lint
npm run test:unit
PUBLIC_ROUTINE_E2E=true npx playwright install chromium   # once
npm run test:e2e
```

Playwright builds with `PUBLIC_ROUTINE_E2E=true` so the core journey does not need Google OAuth.

Manual smoke against real Firebase: sign in, create a routine, run it, confirm persistence after refresh.

## Vercel / monorepo deploy

Root build (`node build.js`) installs/builds Routine and copies `dist/` into `deploy_out/pages/Routine/`.

`vercel.json` includes an SPA rewrite to `200.html` for deep links.

Ensure Vercel project env includes `PUBLIC_ROUTINE_FIREBASE_*`.

## Firestore rules deploy (manual)

The rules file is committed at `pages/Routine/firestore.rules`. **Do not assume they are live** until you deploy them:

```bash
cd pages/Routine
npx -y firebase-tools@latest login
npx -y firebase-tools@latest use routine-manager-xander
npx -y firebase-tools@latest deploy --only firestore:rules
```

Or paste the contents of `firestore.rules` into the Firebase Console → Firestore → Rules and publish.

## Scripts

| Script | Action |
|--------|--------|
| `npm run dev` | Vite/SvelteKit dev server |
| `npm run build` | Static SPA build → `dist/` |
| `npm run preview` | Preview production build |
| `npm run check` | `svelte-check` |
| `npm run lint` | Prettier + ESLint |
| `npm run test:unit` | Vitest |
| `npm run test:e2e` | Playwright |
