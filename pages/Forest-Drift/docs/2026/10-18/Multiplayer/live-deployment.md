# Forest Drift live multiplayer — 18 October 2026

The room server is deployed at **https://forest-drift-mp.forest-drift-mp.workers.dev**.
The game stays at **https://xanderwiles.com/pages/Forest-Drift/** on Vercel.
`DEPLOYED_SERVER_URL` connects production builds without a query-string override.

## Account and deployment

- Cloudflare account: Xander's newly created account; Workers Free plan.
- Worker: `forest-drift-mp`; SQLite Durable Object binding: `WORLD_ROOM` / `WorldRoom`.
- Allowed production origins: `https://xanderwiles.com`, `https://www.xanderwiles.com`.
- Separate production `ADMIN_SECRET` and `CAPABILITY_SECRET` are installed as Worker secrets.
- Local recovery copies are outside Git in `~/.config/forest-drift/production-secrets.json`
  (owner-readable only). Move the admin key into a password manager. Never commit or share this file.
- The first world, **Forest Drift Online**, is a separate published copy of the bundled Main World.
  Its private owner/editor/viewer invites are in `~/.config/forest-drift/production-world.json`.
  Keep the owner invite private; give builders the editor invite and visitors the viewer invite.
- Deploy server updates with `npm run deploy` from `server/`. Deploy frontend changes through the
  existing GitHub → Vercel production pipeline. Avoid server deploys during a shared session.

## Verification

`docs/multiplayer-live-smoke.json` records checks against the actual Cloudflare endpoint:
invite-only snapshots, all three roles, viewer edit denial, commit delivery to other players,
persisted edits, cleanup of the test edit, and capability-based resume into the same slot.

The request reader now enforces byte limits while streaming, including requests without
Content-Length and multi-byte UTF-8. Malformed publish bodies and malformed field patches are
rejected. The route and limit regression tests run with `npm run test:unit -- --run`; Worker types
are checked separately with `npx tsc -p server/tsconfig.json`.

## Remaining release-gate work

Being deployed does not complete the plan's Phase 4 certification. The four-hour 20-player soak,
impaired-network test, real iPad/Safari playtest, in-room usage warning, presence outlines,
server-side Mini Build budgets, weekly R2 backups and backup restore drill still need their
respective implementation or measurements. Existing SQLite restore points and manual exports
remain available. No paid plan or payment method was added during this setup.
