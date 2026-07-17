# Viper Strike

A browser-based 3D arcade strike mission built with SvelteKit, Svelte 5,
TypeScript, Three.js, Vitest, and Playwright.

On the main site it lives at **`/pages/Fighter-Jet/`** and appears on the homepage
under **Best Pages** and **Games**.

## Run the game alone (fastest for development)

```bash
cd pages/Fighter-Jet
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173/`).

Optional: open a browser tab automatically with `npm run dev -- --open`.

## Run from the main website locally

Important: the site build lives at the **repo root**, not inside
`pages/Fighter-Jet`.

```text
xander-wiles-website/          ← run site build / serve from HERE
  package.json                 ← "build": "node build.js"
  deploy_out/                  ← created by the root build
  pages/Fighter-Jet/           ← game source only
```

### Option A — full site build (same as Vercel)

```bash
cd /path/to/xander-wiles-website   # repo root, NOT pages/Fighter-Jet
npm install
npm run build
npx serve deploy_out
```

Then open:

- Home: `http://localhost:3000/`
- Game: `http://localhost:3000/pages/Fighter-Jet/`

If `serve` picks another port, use the Local URL it prints.

### Option B — game only through the site path (after a game build)

```bash
cd pages/Fighter-Jet
npm install
npm run build
cd ../..
npx serve .
```

Open `http://localhost:3000/pages/Fighter-Jet/` (port may vary). The folder
`index.html` redirects to `./dist/` for this local workflow.

## Vercel deployment

No extra Vercel project is required. The root site already deploys with:

- `vercel.json` → `buildCommand: node build.js`, `outputDirectory: deploy_out`
- `build.js` builds Fighter-Jet and injects the static output

Push/deploy the main website as usual. The game is available at:

`https://<your-domain>/pages/Fighter-Jet/`

Homepage cards link to that path. No SPA rewrite is needed (single prerendered
route).

## Model assets

**Fighter jet (canonical path):** edit and export to:

```text
assets/models/Fighter_Jet.glb
```

The game does **not** read that file directly. Before `npm run dev` or `npm run build`
(in this folder or from the repo root `npm run build`), `scripts/sync-models.mjs`
copies it to:

```text
pages/Fighter-Jet/static/models/fighter-jet.glb
```

Missiles and other optional models still go in `static/models/` only:

```text
static/models/missile.glb
```

Both fighter and missile are optional (procedural fallbacks exist). If you change
`Fighter_Jet.glb` in Blender, save to `assets/models/Fighter_Jet.glb`, then rebuild.
You do not need a manual `cp` unless you want a one-off override in `static/` only.

Asset URLs resolve relative to the current page, so they work under
`/pages/Fighter-Jet/` on the main site.

### Fighter model convention

- Y up, nose toward local `-Z`
- Origin near centre of mass
- About 15–20 m long; apply transforms before export
- Optional nodes: `EngineLeft`, `EngineRight`, `MissileLeft`, `MissileRight`, `CockpitCamera`

### Missile model convention

- Y up, nose toward local `-Z`, origin at centre, ~3–5 m long

## Controls

- Mouse or arrow keys: pitch and yaw
- `A` / `D`: roll
- `W` / `S`: throttle
- `Shift`: afterburner
- `Space`: fire
- `Tab`: cycle targets
- `C`: cycle camera
- `M`: tactical map
- `Escape`: pause
- `R`: restart after mission end
- `F2`: debug panel (development)

Gamepad and touch controls are supported.

## Custom audio (MP3)

Drop licensed MP3 files into `static/audio/` using the names listed in
[`static/audio/README.md`](static/audio/README.md). The game loads them automatically
and falls back to procedural sounds for any file that is missing. Restart dev or
rebuild the site after adding files.

## Verification

Inside `pages/Fighter-Jet`:

```bash
npm run check
npm run lint
npm run test
npm run build
```

Append `?testMode=true` for shortened mission timing and `window.__VIPER_TEST__`.
