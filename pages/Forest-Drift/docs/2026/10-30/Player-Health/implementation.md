# Forest Drift — Player Health: Implementation Notes

**Feature cycle:** 2026-10-30
**Plan:** [`feature-plan/02-technical-plan.md`](feature-plan/02-technical-plan.md) (revision 2) · Decisions: [`feature-plan/01-questions-and-decisions.md`](feature-plan/01-questions-and-decisions.md)

Paths are relative to `pages/Forest-Drift/`.

## What was built

| Area | Files |
| ---- | ----- |
| Shared rules (browser + Worker) | `src/lib/game/player/PlayerHealth.ts` (36 points, 8 s + 3 s regeneration, 2 s grace, `PLAYER_HEALTH_ENABLED` kill switch), `src/lib/game/player/fallDamage.ts` (safe to 4 m, 2 per metre beyond, rounded up; water ≥ 1 m cancels) |
| Physics | `FirstPersonController.ts`: tracks the peak of each airborne spell and emits `onLanded`. Immune after flight, restore/interaction exit, tutorial movement, gravity off, movement lock, or `markSupportRemoved()`. Movement itself is unchanged. |
| Authorities | `src/lib/game/player/HealthAuthority.ts` (`LocalHealthAuthority`: single player, saved in the world), `src/lib/game/net/RoomHealthAuthority.ts` (online: predicts, the room's value wins) |
| Scene | `ThreeScene.ts`: landing → water/rule checks → authority; death blocks input; `respawnAfterDeath()` uses the world spawn; `noticeRemovedSupport()` (Q21); `getRules`, `setFallDamageRule`, `getHealth`, `debugDropPlayer` |
| UI | `HealthBar.svelte`, `DamageVignette.svelte`, `DeathCard.svelte`, `src/lib/game/audio/landingThud.ts`; bottom HUD stack and live region in `+page.svelte`; `Hotbar.svelte` `embedded` prop; `--fd-health*` tokens in `theme.css` |
| Single-player data | `SavedPlayerState.health?`, `WorldDefinition.rules?` (`WorldTypes.ts`), carried by `WorldSerializer.ts`, checked in `WorldValidation.ts`, and tracked by the autosave player signature. New worlds get `rules.fallDamage: true`. No schema bump. |
| Settings | New **Rules → Health → Fall damage** category in `settingsCatalog.ts`. It's owner-only online (added to `OWNER_CATEGORY_IDS`). |
| Online | Protocol **v5** (`protocol.ts`): `fall`, `respawn`, private `health`, `welcome.health`, `welcome.rules.fallDamage`, `SharedEnvironment.rules`. `RoomCore.ts` owns per-player health, tracks airborne spells from poses, caps over-long reports, and handles respawn, join and leave. `WorldRoom.ts`: new `player_health` table. `worker.ts`: manifest `fallDamage` from the published world. |

## Follow-up the same day: full-width bar, number readout, punching

**Bar.** The health row (bar plus a small `24/36` readout) now spans the hotbar's full width. Its width is measured from the hotbar, and the last width is kept when the hotbar is hidden, so pressing G doesn't resize it. This replaces Q4 A and Q18 A. The readout is `aria-hidden` because the meter already gives screen readers the value.

**Punching (online only).** Left click, or the new touch **Punch** button, works in *normal* mode only: not building, not in music, remove, paint or move mode, not seated, not flying, not dead.

| Rule | Value | Where |
| ---- | ----- | ----- |
| Damage | 2 points (18 punches from full) | `src/lib/game/player/punch.ts` `PUNCH_DAMAGE` |
| Reach | 2.5 m from the eye; the aim must pass within 0.5 m of the body (shins, waist or chest) | `findPunchTarget` (browser) |
| Cooldown | 500 ms (client and room) | `PUNCH_COOLDOWN_MS` |
| Room check | Feet within 4.5 m horizontally (reach plus 2 m lag slack) and 2.5 m vertically; facing within 75° (unchecked within 1 m) | `punchPlausible` (room) |
| Who | Owner and editors; viewers can't punch. Attacker not dead and not seated. Target connected, alive, and not in its 2 s grace after join or respawn. | `RoomCore.handlePunch` |
| Rule | Owner's **Rules → Player damage (punching)**, online only. **On by default.** | `SharedEnvironment.rules.playerDamage` |

The browser only says *who* it aimed at (`punch` message: id plus target slot). The room decides whether the punch lands and how much it costs, from the poses it already holds. The attacker gets `punchResult { hit }` (a brief X hit marker and a soft thud), never the target's health. The target gets a private `health` message carrying `source: { kind: 'player', by: slot }`, so it plays the same vignette and thud as a fall. If the punch knocks them out, the death card reads "You were knocked out, by Name". Other players see the punch as the existing build-reach arm pose for 250 ms (the `building` pose flag), so no new animation data was added. There's no knockback, and walls don't block a punch (2.5 m reach).

Protocol stays at **v5** (it hasn't shipped yet), with `punch`, `punchResult`, `health.source` and `rules.playerDamage` added.

## Where the build differs from plan revision 2

1. **Health is written to storage on every change, not only on leave.** A Durable Object loses its memory when it hibernates, and an idle room can hibernate with players still connected. Each hit or respawn writes one row to a new `player_health` table (a separate table, so the existing `players` table is unchanged). Leaving writes the value at that moment, with regeneration restarting on the next join, so time away doesn't heal. Leaving while dead clears both the health row and the bookmark, so the player rejoins full at the world spawn.
2. **The owner toggles the rule in Settings → Rules**, not in `OnlineOwnerPanel`. Settings is already how the owner controls sky and weather online. It locks itself for everyone else and broadcasts through the same `env` message.
3. **No separate in-game "Larger HUD" option** (that was listed as a follow-up anyway).
4. The bit-identical movement check was run once against the `HEAD` controller (900 frames of jumps, falls and flight: identical) rather than kept as a permanent snapshot test. `FirstPersonController.spec.ts` is unchanged and passes.

## Verification

- **Unit (first build):** `npx vitest run`: 207 files, 2,498 tests passing. New suites: `fallDamage`, `PlayerHealth`, `HealthAuthority`, `FirstPersonLanding`, `RoomHealthAuthority`, `RoomCoreHealth`, plus additions to `WorldSerializer`, `WorldValidation`, `RoomCore` and `server/tests/worker`.
- **E2E:** `tests/playerHealth.e2e.ts`: 5 of 5 passing in Chromium. It covers layout above the hotbar, dropping into place without a hotbar, 10 m → 24, death card, Enter respawns, health kept across save and reload, the default (pre-rules) world taking no damage, reduced motion, and the 375×812 touch layout with no overlap and no pointer events.
- **Checks:** `svelte-check` (0 errors), `tsc` for the app and server, ESLint and Prettier on every changed file.
- **In the dev browser:**
  - Bar position and segment states.
  - 10 m → 24 with the ghost trail, then 30 m → death card with focus on Respawn.
  - The hotbar variant panel clears the bar by 12 px.
  - G drops the bar exactly onto the hotbar's former bottom.
  - Removing a 6 m foundation under the player costs nothing, while a plain 6 m drop costs 4.

## Not verified yet

- **The landing thud** is synthesised with WebAudio and was never actually listened to.
- **Online play in two real browsers** against `wrangler dev` (manual test 15). The room logic is covered by `RoomCoreHealth.spec.ts` with fake connections, and the existing `multiplayer.e2e.ts` regression run is reported separately.
- **VoiceOver and iPad Pro M4** manual passes.
- **Walking frame-pacing benchmark and 20-player soak:** not re-run.

## Deploying

Protocol v5 means **the Worker and the static site must go out together**. A v4 client gets "Please refresh the game to update it". Deploy the Worker (`cd server && npx wrangler deploy`), then the site. To roll back, set `PLAYER_HEALTH_ENABLED = false` (client only), or turn the rule off per world, or revert both together (see the plan's rollback section).
