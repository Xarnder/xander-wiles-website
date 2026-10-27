# Editing the tutorial

Edit `tutorials.ts` in this folder. The ordered entries in `lessons(touch)` are the
script: changing a `guide('stable-id', 'Spoken words here')` entry changes both
narration and subtitles. Move entries to reorder the guide. Keep IDs unique and
stable, and increment `TUTORIAL_VERSION` when changing the sequence or meaning.
There is currently no in-game script editor.

- `guide(...)` waits for Continue/F9. Use this for building practice so selecting a
  tool never falsely counts as successfully placing a piece.
- The movement lesson uses `action: 'move'` and advances after walking two metres
  and finishing its narration.
- `touch` selects mobile instructions. `select`, `place`, `customise`, and `variant`
  supply the correct wording for each input method. Numbers are spelled out for
  the voice; the corresponding digit key selects that hotbar slot.
- Keep sentences short. The speech system divides text into synchronized phrase
  clips automatically; do not write a separate subtitle track or record audio.
- After editing, use F8 for automatic preparation and playback, or open Speech
  options with F6 and use Prepare voice. Auto mode starts after the first
  instruction is ready. With manual setup, the first three instructions
  are prepared upfront; the current instruction plus two ahead are prepared during
  play. Changed text gets new cached audio; unchanged text can reuse existing clips. Text-only mode reflects
  the script immediately after the app reloads.
- Run `npx vitest run src/lib/game/tutorials src/lib/game/speech` and `npm run check`.
  The script test checks phrase limits, unique IDs and the preparation budget.

The guide covers mouse look, movement, the hotbar, foundation, all wall variants,
doors/windows/beams, ceilings/floors/roofs, stairs, all floor-detail variants,
shovel, objects, and finishing tools. Tool descriptions should stay consistent
with `../building/FoundationTypes.ts` and the tool implementations.
