# Forest Drift multiplayer server

A Cloudflare Worker with one Durable Object (`WorldRoom`) per shared world. The room keeps the
published world in SQLite, relays player movement, holds dropped players' slots for 30 s, runs the
room clock, and shares the owner's sky, weather and time. The same `RoomCore` logic
(`src/lib/game/net/RoomCore.ts`) runs here and in the Vitest suite. Design:
`docs/multiplayer-research.plan.md`.

Phase 3 adds shared building: the world is stored as rows (`entities`), every change arrives as an
atomic batch of ops, and the room checks rights, confirmations and fit before committing it in order
(`src/lib/game/net/WorldStore.ts`). Commits are kept for catch-up, batch ids for dedupe, players'
names and last positions for notices and bookmarks, and restore points for 30 days.

**Putting it online for the first time:** follow
`docs/2026/10-16/Multiplayer/cloudflare-setup-guide.md`, a step-by-step guide that assumes no
Cloudflare experience.

## Run it locally (no Cloudflare account needed)

```bash
cd pages/Forest-Drift/server
npm install
cp .dev.vars.example .dev.vars   # then change ADMIN_SECRET to something private
npm run dev                      # http://localhost:8787 (also on your LAN IP)
```

Then run the game with `npm run dev` in `pages/Forest-Drift`. In development the game looks for the
server on the same host at port 8787. Elsewhere it uses `VITE_FOREST_DRIFT_MP_URL`, or
`?mpServer=<url>` in the address bar, which is remembered. When no server is configured, the online
buttons stay hidden.

- **Publish:** Landing screen → Online → Owner (or Worlds → a world's menu → _Publish Online…_).
  Enter the owner password (`ADMIN_SECRET`, stored as a server secret). Choose Visitor or Builder
  permissions in the Owner tab, then create the online copy. You get three
  invite links (`?mp=<worldId>#invite=<token>`): builder, visitor and owner. The local world is
  unchanged, and the links stay in the browser under _Online Worlds_.
- **Join:** open an invite link, or use _Join Online_ and paste it. The token in `#invite=` decides
  the role; the room stores only its SHA-256. After joining, the room hands back a signed capability
  that resumes the same player after a drop.
- **Two players on one machine:** a second browser profile, or set a different
  `forest-drift-mp-player-id` in localStorage.

`.dev.vars` is gitignored. Never commit it, and never paste the admin key into chat or logs. Local
worlds are stored in `.wrangler/state` and survive restarts.

## Routes

| Route                       | What it does                                                      |
| --------------------------- | ----------------------------------------------------------------- |
| `GET /health`               | `{"ok":true}`                                                     |
| `POST /w`                   | Publish a world (`Authorization: Bearer <ADMIN_SECRET>`, ≤ 10 MB) |
| `GET /w/:id/snapshot`       | The world and its manifest (`Authorization: Bearer <invite>`)     |
| `GET /w/:id/ws`             | WebSocket into the room (binary poses, JSON control messages)     |
| `GET /w/:id/export`         | The live world as one record (owner token)                        |
| `GET /w/:id/restore-points` | Earlier versions kept (owner token)                               |
| `POST /w/:id/restore`       | `{ pointId }`: go back; everyone reconnects and resyncs (owner)   |

Requests are accepted from localhost, private LAN addresses and `ALLOWED_ORIGINS` in `wrangler.jsonc`.

## Load bots

```bash
npm run bots -- --world <worldId> --invite <builder token> --count 19 --seconds 30
```

Each bot walks a circle and sends 10 poses/s. The script reports the snapshot rate, bytes per
player, round-trip times and entry ages. Results from the Phase 1 spike are in
`docs/multiplayer-performance.json`.

## Secrets

| Name                | Where                                                    | What                                                                                       |
| ------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `ADMIN_SECRET`      | `.dev.vars` locally; `wrangler secret put` in production | The publish key. Also signs capabilities unless the next one is set.                       |
| `CAPABILITY_SECRET` | optional                                                 | A separate capability-signing key. Changing it signs players out; invite links still work. |

## Deploying

See the setup guide for the first time. After that: `npm run deploy`. A deploy disconnects
everyone for a moment. Clients reconnect on their own, resume with their capability, and the room
clock carries on. Even so, avoid deploying mid-session. Logs: `npx wrangler tail`, or Workers →
forest-drift-mp → Logs in the dashboard.

## Tests

- Unit: `npx vitest --run src/lib/game/net` (in `pages/Forest-Drift`).
- End to end: `npx playwright test tests/multiplayer.e2e.ts` runs its own `wrangler dev` on port
  8791, with a throwaway key and state, in Chromium, WebKit and Firefox.

### Type checking

Run `npm run check` and `npm run check:server` from the Forest Drift project folder. The server
configuration retains strict TypeScript checking and aligns indexed-access checking with the app,
since room validation imports the same game types and geometry helpers. ESNext modules support
the shared JSON import attributes, and DOM declarations describe browser types reached through
those shared imports; they do not add browser code to the Worker bundle.
