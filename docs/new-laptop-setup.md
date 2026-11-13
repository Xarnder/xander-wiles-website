# Moving to a new laptop

## Install and run

Follow the clone, Node 22 and root `npm ci` commands in [README](../README.md). No global Vite, Svelte or Firebase installation is needed for normal website development. Internet access is needed for dependency installs, CDN assets and initial AI model downloads.

Root `npm run build` installs dependencies in each bundled app automatically, then builds `deploy_out/`. Root `npm ci` alone does not install those apps. For work on one app, run `npm ci` then `npm run dev` in its directory; see [local development](local-development.md). The build uses `npm ci` in nested apps to preserve the audited lockfiles and security overrides. Keep the `vendor/` directory and app `.npmrc` files when moving the project; see [dependency maintenance](dependency-maintenance.md).

`npm run preview` serves the static build. Root `npm run dev` serves source static pages and local `/api/markdown-gemini` and `/api/generate-list` handlers; it does not compile nested apps or inject build-time public settings. AI API routes need the root dev server or the deployed Vercel functions, rather than static preview alone.

## Transfer separately before wiping the old laptop

These files/data are not recovered by cloning Git. Copy only what you use, using a private transfer method; keep credentials out of commits.

- Root `.env.local` (and `.env` if used), plus app-specific environment files such as `pages/journal/.env.local` and `pages/Routine/.env`. Root `.env.example` and app templates describe the settings, not their values.
- `secrets/` service-account files. Restore any file referenced by `GOOGLE_APPLICATION_CREDENTIALS`, updating absolute paths for the new machine.
- `pages/Forest-Drift/server/.dev.vars`, including local multiplayer secrets, and `pages/Forest-Drift/server/.wrangler/state/` if you need local multiplayer worlds. Stop the Worker before copying state. Deployed Cloudflare worlds remain on Cloudflare.
- Local assets excluded by `.gitignore`: `assets/Gaussian-Splats/`, `pages/Face-Tool/models/`, `pages/XR_Viewer/assets/Make_Human.glb`, and `pages/exprimental_align_tool/` if present.
- Browser-only data: export local Forest Drift worlds and any other unsynced app data using the apps' export controls. A Git clone does not migrate localStorage, IndexedDB, browser profiles, saved permissions or cached AI models. Verify imports on the new laptop before retiring the old one.

Do not copy `node_modules`, `deploy_out`, `dist`, or `.svelte-kit` caches; regenerate them. Sign back in to Google/Firebase-backed apps and verify synced data. Existing remote data and hosting are separate from the laptop.

## Optional services and tests

For Forest Drift multiplayer, follow [the server README](../pages/Forest-Drift/server/README.md):

```bash
cd pages/Forest-Drift/server
npm ci
# Restore .dev.vars, or copy .dev.vars.example and set a private ADMIN_SECRET.
npm run dev
```

Run the game in another terminal with `cd pages/Forest-Drift && npm install && npm run dev`. Cloudflare deployment requires account login (`npx wrangler login`); do not redeploy just to move laptops. Vercel CLI users can sign in and link the existing project rather than creating a replacement project.

Browser tests need browser binaries installed from the relevant app folder (`npx playwright install`). Some Silence Cutter tests specifically use installed Chrome; see [its testing instructions](local-development.md#7-silence-cutter-sveltekit-local-ai-video-editor). ffmpeg is optional for regenerating video test fixtures.

## Verify on the new laptop

1. Run `npm run build` from the root and confirm it completes.
2. Run `npm run preview`, then check the homepage and the nested apps you use.
3. Verify Google login, Firebase sync, AI routes and restored local worlds with the appropriate dev server or deployed site.
4. Run `git status --short` and review any dependency lockfile changes.

The repository contains several independent apps; a successful site build checks compilation, not every backend credential, browser feature or end-to-end workflow.
