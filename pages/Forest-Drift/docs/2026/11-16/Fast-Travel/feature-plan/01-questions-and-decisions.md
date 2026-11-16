# Forest Drift — Fast Travel: Questions and Decisions

**Feature cycle:** 2026-11-16
**Status:** **Locked (2026-11-16).** You answered Q1–Q8 in chat as multiple choice. Q5 is an instant cut; every other answer was the recommended one. Q9–Q12 take their recommended defaults unless you say otherwise.
**Related:** [`00-brief.md`](00-brief.md) · [`02-technical-plan.md`](02-technical-plan.md)

---

## Locked decision summary

| Q   | Topic                      | Status                | Decision (locked)                                                                                                                |
| --- | -------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Destinations               | Answered              | **Any point on the full map.** No menu travel to waypoints, players or the start point.                                          |
| Q2  | Limits                     | Answered              | **Free, anywhere, anytime.** Not while knocked out; never into deep water (nearest dry ground instead).                          |
| Q3  | Online                     | Answered              | **Everyone; the owner can switch it off for others.** Saved with the world. The owner can always travel.                         |
| Q4  | Carried or ridden creature | Answered              | **It comes with you.** It keeps its coat, as when you walk it into another biome.                                                |
| Q5  | Transition                 | Answered              | **Instant cut.** No fade or loading veil; trees and far terrain stream in after.                                                 |
| Q6  | Undo                       | Answered              | **"Go back"** on the full map and in the pause menu. Only the last trip; forgotten when you leave the world.                     |
| Q7  | What others see            | Answered              | **A shimmer at both ends.**                                                                                                      |
| Q8  | Choosing the spot          | Answered              | **Click to pin, then "Travel here".** `Enter` pins the crosshair. Dragging still pans.                                           |
| Q9  | Where you land             | `Recommended default` | On the highest surface at the spot, as respawning does: a roof if you pin a building. Out of deep water by the nearest dry ring. |
| Q10 | Flying when you travel     | `Recommended default` | You keep flying and arrive 2 m above the ground; walking, you arrive standing.                                                   |
| Q11 | What a trip interrupts     | `Recommended default` | Sitting on furniture ends (you stand up first). Building tools stay as they were. The full map closes.                           |
| Q12 | Phases and tests           | `Recommended default` | Phases 0–3 as in the brief; unit, room and e2e tests in three browsers, with screenshots and numbers.                            |

---

## Q9: Where you land

- **Why it matters:** a pin can land on a lake, a cliff or a house.
- **Default:** use the same rule as respawning:
  - the player's feet go on the highest supporting surface at the spot;
  - if that's in deep water, they move to the nearest ring of dry ground (up to about 200 m away);
  - the readout says "Lands on the shore" when that will happen.
- **Alternative:** always land on the terrain, never on builds. It could put you inside a house.

## Q10: Flying when you travel

- **Default:** keep flying and arrive 2 m above the ground, so you can keep looking around. If you were walking, you arrive standing.
- **Alternative:** always arrive standing.

## Q11: What a trip interrupts

- **Default:**
  - sitting or lying on furniture ends as if you'd stood up;
  - carried and ridden creatures come along (Q4);
  - building tools, the hotbar and flight are kept;
  - the full map closes and play resumes.
- **Not allowed while:** knocked out (the death card is showing).

## Q12: Phases and tests

- **Default:** Phases 0–3 as in the brief.
- **Tests:**
  - unit tests for landing and Go back;
  - room tests for the online rule and the travel message;
  - e2e tests for the map flow in Chromium, WebKit and Firefox;
  - a two-player online e2e test;
  - a measurement of the cut's hitch.
