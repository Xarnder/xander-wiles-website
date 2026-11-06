# Carried creatures at their real size — implementation notes

_2026-11-06. Revises how a carried creature is drawn (ranged weapons, `docs/2026/11-04/range-weapons/`,
decision Q22). Gameplay (pick up, firing, charges, online arbitration) is unchanged._

## What changed

|                                                     | Before                                                              | Now                                                                                                                                                                               |
| --------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Size                                                | Shrunk to fit: 0.42 m long in first person, 0.75 m under the arm    | Always its real size, the same as in the herd                                                                                                                                     |
| Third person (and how other players see you online) | Small, beside the hip, turned 34° outward, hand resting on its back | Pressed against the left side of the ribs just under the armpit, facing forward; the upper arm lies over its back and the forearm wraps down its outer side, hand under its flank |
| First person                                        | The whole (shrunken) creature in the lower-left                     | Just its head and neck, large, in the lower-left corner, turned in toward the crosshair; the rest of the body runs back out of view                                               |

Screenshots: `screenshots/carry-pose-first-person.png`, `carry-pose-behind.png`, `carry-pose-side.png`,
`carry-pose-front.png`, and online `online-remote-carry.png`.

## How

- **`HeldCreatureView`** (`src/lib/game/creatures/HeldCreatureView.ts`)
  - No scaling anywhere: holder, recoil group and creature are all scale 1.
  - The holder's origin is now the centre of the creature's **body** (its torso volume), measured
    once by `carriedBody()` from the torso's path and cross-sections, so legs, neck and tail don't
    skew where it sits. `bodyHalfSize` (across, up, along) is exposed for the character.
  - First person places the **head** (`skeleton.face`) at a fixed point in the lower-left of the
    view and lets the body fall where it will (mostly behind the camera, out of view). The head is
    held close enough to fill about 30 % of the view's height (0.2–0.7 m from the eye), a little
    further on portrait phones so it stays beside the crosshair.
- **`CharacterInstance`** (`src/lib/game/characters/CharacterInstance.ts`)
  - `carryBody` (set by the owner each frame from `bodyHalfSize`) sizes the hold.
  - `carryHold()` (pure, tested) decides where the body sits and where the hand goes, from the
    shoulder joint:
    - The body's inner side is against the ribs, and its back is 10 cm below the shoulder joint.
    - Small creatures sit a little lower, up to 18 cm, so the arm hangs rather than folding up.
    - The hand goes over and down the far side, to just under the middle. On wide creatures
      (pebblebacks), where the arm can't reach that far, the hand moves up the far side until it can.
  - Two-bone IK with the elbow pulled up and out, so the arm arches over the back instead of through
    it. The arm's reach is measured from the rig once.
- **Owners**: `ThreeScene` (your own character) and `RemoteAvatarRenderer` (other players) copy the
  held creature's body size into the character, so everyone sees the same hold.

Carryable creatures measured for this range from a tiny stilt (body about 5 cm across) to a round
pebbleback (about 42 cm across and 50 cm tall). Long ribbons keep their full length: head in front
of the player, tail out behind.

## Tests

- Unit: `HeldCreatureView.spec.ts` (body measured inside the creature; real size and body centred
  on the anchor; first-person head in the lower-left on wide and phone views),
  `characters.spec.ts` "carrying a creature under the left arm" (four body sizes on the real rig:
  beside the ribs, elbow above the back, hand on the far side, facing forward; `carryHold` lowering
  and hand placement).
- End to end: `tests/rangedWeapons.e2e.ts` "held at its real size…" (scale 1; mouth in the
  lower-left in first person; arm pose in third person; screenshots from behind, side and front
  with `RANGED_SHOTS_DIR`), plus the existing single-player and online carry tests.
