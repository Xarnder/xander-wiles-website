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
- The live world, **Forest Drift Online** (`b2c19e1b-3992-47df-bdc6-af40307a8988`), is a separate published copy of the bundled Main World.
  It was migrated through the normal game loader to schema 9 before publication.
  Its private owner/editor/viewer invites are in `~/.config/forest-drift/production-world.json`.
  Keep the owner invite private; give builders the editor invite and visitors the viewer invite.
- Deploy server updates with `npm run deploy` from `server/`. Deploy frontend changes through the
  existing GitHub → Vercel production pipeline. Avoid server deploys during a shared session.

- The monthly $10 budget email alert is enabled. This is an alert, not a spending cap.
- A private clickable invite sheet is at `~/.config/forest-drift/Forest Drift Online.html`.
- A manual export is at `~/.config/forest-drift/backups/Forest Drift Online-2026-10-18.forestworld`;
  the game package reader successfully validated its checksum, schema and import.

## Verification

`docs/multiplayer-live-smoke.json` records checks against the actual Cloudflare endpoint:
a disposable earlier-schema transport fixture (not the playable world above), including
invite-only snapshots, all three roles, viewer edit denial, commit delivery to other players,
persisted edits, cleanup of the test edit, and capability-based resume into the same slot.

The production Vercel frontend was verified in the Browser with the playable world: **1 player**,
**Saved online**. All six multiplayer E2E tests passed across Chromium, WebKit and Firefox,
including co-building and permissions; all 2,009 unit tests passed. Type checks were clean.
A separate 20-bot, 30-second live transport run had zero disconnects (see `docs/multiplayer-live-load.json`).
This short run does not substitute for the planned four-hour soak.

The request reader now enforces byte limits while streaming, including requests without
Content-Length and multi-byte UTF-8. Malformed publish bodies and malformed field patches are
rejected. The route and limit regression tests run with `npm run test:unit -- --run`; Worker types
are checked separately with `npx tsc -p server/tsconfig.json`.

The deployed multiplayer menu now includes an owner-only Cloudflare allowance breakdown
(see `in-game-usage.md`); the locator, debug movement sidebar and rear-view name-tag fix are
also integrated on `main`.

## Remaining release-gate work

Being deployed does not complete the plan's Phase 4 certification. The four-hour 20-player soak,
impaired-network test, real iPad/Safari playtest, presence outlines,
server-side Mini Build budgets, weekly R2 backups and backup restore drill still need their
respective implementation or measurements. Existing SQLite restore points and manual exports
remain available. No paid plan or payment method was added during this setup.

## Cost constraint — confirmed 18 October 2026

The owner requires a £10/month budget and an absolute £15/month ceiling, including
taxes and currency conversion. This supersedes the earlier plan to enable Workers Paid
during session months. Keep Workers Free and do not activate paid add-ons (including R2)
without a new cost-control decision from the owner.

The Cloudflare Billing → Subscriptions dashboard was checked: Workers Free is the only
active subscription and there is no payment method on file. The current multiplayer
Worker and SQLite Durable Objects therefore use free quotas; exceeding a quota fails
operations rather than purchasing overage. Availability can stop when limits are hit.

The existing $10 email alert is informational only, not a hard spending cap. Cloudflare
budget alerts do not pause or cap usage. No £15 billing cap has been configured or claimed.
A future paid setup must not rely on alerts or delayed billing monitors to guarantee this
ceiling. Preserve the free-only setup unless a genuinely enforceable alternative is agreed.

References:
- https://developers.cloudflare.com/durable-objects/platform/pricing/
- https://developers.cloudflare.com/billing/manage/budget-alerts/
