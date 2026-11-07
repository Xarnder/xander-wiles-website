# Multiplayer stats — implementation notes

_2026-11-06. Pause → **Multiplayer stats** in online worlds._

## What players see

A table of everyone with a record in this world plus everyone online now:

| Column      | Meaning                                                                            |
| ----------- | ---------------------------------------------------------------------------------- |
| Hits        | Punches and creature pellets that took health from another player                  |
| Knockouts   | Hits that took another player to zero health (players are knocked out, not killed) |
| Knocked out | Times this player was knocked out themselves — by another player or a long fall    |

- Sorted by knockouts, then hits, then fewest times knocked out, then name. Your own row is
  highlighted and says "(you)"; online players have a dot in their colour, others an empty ring.
- The table updates live while the menu is open.
- Stats are kept with the world (between sessions, and when the room sleeps or restarts). The
  world's owner can **Reset stats…** (with a confirmation); everyone's table empties.
- In single-player worlds there's no button.

## How

- **The room keeps score** (`src/lib/game/net/playerScores.ts`, `ScoreBoard`), because it is the
  only judge of damage: a hit is credited exactly where the room applies punch damage
  (`RoomCore.handlePunch`) and pellet damage (`handleShotHit`), only when health was actually taken
  (`damageHealth(...).applied > 0`, so grace periods and already-knocked-out targets don't count). A
  knockout is that hit leaving the target dead. A fatal fall (`handleFall`) counts as knocked out
  with no credit to anyone.
- Records are per player id with their latest name; at most 200 players, the least recently active
  making way. Saved as one JSON string in the room's meta table (`scores`), written on each change —
  the same rate as the health write every hit already makes.
- **Messages** (still protocol 7 — both sides ignore stats messages they don't know):
  `welcome.scores` on joining; `{t:'scores', entries}` to everyone with just the changed records;
  `{t:'scores', entries: [], replace: true}` after a reset; C→S `{t:'resetScores'}`, honoured only
  for the world's owner.
- **Client**: `NetSession` → `MultiplayerSession` (keeps the table, `getScores()`, `resetScores()`,
  `onScores`) → `+page.svelte` (`scoreRows()` merges records with the roster: names, colours,
  online, you) → `PauseMenu` (`stats` panel). Online, the Session section shows Multiplayer and
  Multiplayer stats side by side, with Dev & Debug across the row below.

## Tests

- `playerScores.spec.ts` — crediting hits and knockouts, falls, names, JSON round trip and damaged
  records, the 200-player cap, reset, table merge and sorting, message parsing.
- `RoomCoreScores.spec.ts` — 18 punches credit 18 hits and a knockout for everyone to see; punching
  a knocked-out player isn't a hit; late joiners and a restarted room get the stats; only the owner
  can reset.
- `tests/multiplayer.e2e.ts` "punching…" — after the knockout, both browsers' stats tables show the
  puncher's hits and knockout and the target's knockout, each marked "(you)"; only the owner sees
  Reset, and resetting empties both tables. `STATS_SHOTS_DIR` writes `screenshots/multiplayer-stats.png`.
