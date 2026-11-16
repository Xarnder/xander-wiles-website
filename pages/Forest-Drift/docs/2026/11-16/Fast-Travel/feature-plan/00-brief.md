# Forest Drift — Fast Travel: Brief

**Feature cycle:** 2026-11-16
**Status:** **Built (2026-11-16).** Decisions are locked in [`01-questions-and-decisions.md`](01-questions-and-decisions.md). Phase records: [`../phase-0/`](../phase-0/implementation.md) to [`../phase-3/`](../phase-3/implementation.md).
**Related:** [`01-questions-and-decisions.md`](01-questions-and-decisions.md) · [`02-technical-plan.md`](02-technical-plan.md) · builds on the [Biome Minimap](../../Biome-Minimap/feature-plan/02-technical-plan.md) (its full map is where travel starts)

Paths are relative to `pages/Forest-Drift/`.

---

## 1. The idea in one paragraph

The biome map shows where the desert or the snowfield is, but getting there still means a long walk or flight: a biome can be several kilometres away. **Fast travel** lets players pick any spot on the full-screen map and jump straight there. You click the spot to drop a pin, check its biome and distance in the readout, and press **Travel here**. You land on dry ground at that spot, still carrying or riding whatever you had. **Go back** returns you to where you left. Online, other players see a brief shimmer where you vanish and where you appear, and the world's owner can switch fast travel off for everyone else.

## 2. The user problem

| Today                                                                                        | Why it's a problem                                                       |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| The full map shows biomes up to 8 km away.                                                   | Getting to one takes minutes of flying, and walking takes far longer.    |
| The only jumps today are respawning (back to the start) and rejoining (back where you left). | There's no way to get to a place you chose.                              |
| The game is a sandbox with free flight.                                                      | Travel time is a chore, not a challenge: nothing is lost by skipping it. |

## 3. Goals

1. **Travel anywhere on the map** [Q1, Q2]: pin a spot on the full map and travel there, with no cooldown and nothing to unlock.
2. **Land safely**: on dry ground, never under the terrain, in deep water or inside a wall.
3. **Keep what you have** [Q4]: a creature you carry or ride comes with you.
4. **Undo a trip** [Q6]: **Go back** to where you were before your last trip.
5. **Online** [Q3, Q7]: on for everyone by default; the owner can switch it off for others. Others see a shimmer at both ends.
6. **Instant** [Q5]: the trip is a cut, with no loading screen. Ground under your feet is there on the first frame; trees and distant terrain stream in over the next moment.

## 4. Non-goals (v1)

- Travelling to waypoints, other players or the start point from menus (Q1 picked the map only). The map shows waypoint and player markers, so you can pin next to them.
- Unlocking places by exploring, cooldowns or costs (Q2).
- A loading screen or a fly-over animation (Q5).
- Travel history beyond the last trip.

## 5. What players get

- **On the full map:**
  - click or tap a spot to drop a pin (dragging still pans);
  - the readout describes the pin: its biome, distance, direction and coordinates;
  - **Travel here** jumps there and closes the map;
  - **Go back**, after a trip, returns to where you left;
  - keyboard: `Enter` pins the crosshair; `Tab` reaches the buttons.
- **In the pause menu:** **Go back** after a trip.
- **When travel isn't allowed**, the button is greyed out and says why: "You're knocked out", or "The owner has turned off fast travel".
- **Online owners:** a "Fast travel for others" switch in Settings → Rules.

## 6. Delivery

| Phase | What                                                                                                                       | You can see                                     |
| ----- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| 0     | The jump itself, played alone: safe landing, ground ready at once, carried and ridden creatures, Go back. Measured hitch.  | A test page and numbers: how long the cut takes |
| 1     | The full map: pin, readout, **Travel here**, **Go back** (also in the pause menu), keyboard and touch.                     | Fast travel in the game, alone                  |
| 2     | Online: the owner's rule, a room-checked travel message, others' screens, rides and carries online. Needs a server deploy. | Two players travelling in one world             |
| 3     | The shimmer, performance on a slower machine, accessibility, docs, tests in three browsers.                                | Phase records with screenshots and numbers      |

Each phase ends with screenshots and a record. I commit, push and deploy when you say.
