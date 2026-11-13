# Forest Drift — Key Mapping & Control Profiles: Feature Plan

**Status:** Built (10 Nov 2026), all phases. Every game key goes through
`src/lib/game/input/` and follows the active profile; the full-screen Controls screen
(`src/lib/components/KeyBindingsScreen.svelte`) opens from Settings → Controls, Pause → Controls
and Help → Change keys. Profiles, Undo, download and load, conflict display, and key names in help,
prompts, tool hints and tutorials all follow the bindings. A guard test fails if raw key checks
come back. The open questions are decided (section 9).

**Changes from this plan while building:** loaded files from a newer version are accepted (unknown
actions are skipped and counted) rather than refused; files may hold keys the browser takes, but
those entries are dropped on load like other bad entries; the tutorial script keeps its spoken
wording ("Press three", "Minus") while the default key is in use, so cached narration still
matches.

**Date:** 10 November 2026
**Scope:** `pages/Forest-Drift/` (SvelteKit + Three.js)

## 1. Goal

Players can rebind **every keyboard control** in Forest Drift from a **full-screen Controls
screen**. They can:

- Change any action to any key, or a key plus modifiers (e.g. `Shift + R`).
- Give each action a **primary and a secondary** key.
- See **conflicts clearly**: in the row itself, on a picture of the keyboard, in the side menu, and
  in a summary at the top of the screen.
- Save several **profiles** (e.g. "Default", "Left-handed", "AZERTY"), and switch, rename, copy and
  delete them.
- **Download** a profile (or all of them) as a `.json` file, and **load it again** later or on
  another device.

Everything else stays as it is: key bindings are stored on this device, like audio and tutorial
preferences, and are never saved in worlds or shared in multiplayer.

## 2. How keys work today

| Finding | Where |
| --- | --- |
| Every key is a hard-coded `KeyboardEvent.code` string (`'KeyW'`, `'Digit1'`, `'BracketLeft'` …). About **40 files** check codes directly. | `grep event.code src/lib` |
| Movement is read from a `Set<string>` of held codes: `keys.has('KeyW')`, `keys.has('ShiftLeft')`. | `game/player/FirstPersonController.ts:298, 729–736, 919–924` |
| Global keys (Esc, H, F3, U, `\`, F, L) are handled in a single `handleKeyDown`. | `routes/+page.svelte:~690–775` |
| Build Mode keys (G, E, N, M, X, 9, P, ↑/↓, Delete, Esc) and the hotbar slot table `Digit1 → 1`. | `game/building/BuildToolManager.ts:47–63, 144–260` |
| Tools pick their own keys (R, B, Q, T, O, Enter, Backspace, arrows). `isCapturingKey(code)` lets a tool keep ↑/↓ or E. | `game/building/*Tool.ts`, `game/miniBuild/PlaceObjectTool.ts`, `game/music/MusicPlantPlacementTool.ts` |
| K (use creature / door / seat) is caught early with `capture: true`. | `game/ThreeScene.ts:1921, 3635` |
| **Touch buttons fake key presses**: `simulateKey(code)` dispatches a `KeyboardEvent`. | `game/ThreeScene.ts:3144`, `components/touchToolActions.ts`, `components/TouchControls.svelte` |
| The Mini Build editor has its own key set, including `Ctrl/Cmd + S/Z/Y/D`. | `components/MiniBuildEditor.svelte:360–450` |
| Key names are typed into help and prompts as plain text: the controls guide, tutorials ("Press E"), prompts ("[K] Get off"), the F3 list. | `components/ControlsGuide.svelte`, `game/tutorials/tutorials.ts`, `ThreeScene.ts:497`, `+page.svelte:2325` |
| Settings menu: categories → groups → fields (`number / boolean / select / text / color / button`). There is a `fullscreen` mode, used by the landing menu. | `components/SettingsMenu.svelte`, `game/settings/GameSettingsHost.ts:166` |
| Personal preferences are saved with a versioned `localStorage` key, a `normalize()` step and change listeners. | `game/audio/AudioPreferences.ts` (`forest-drift.audio.v1`) |

Some keys already do **different things depending on what you're doing**, and that's
intentional:

- **F** toggles flying, but edits the aimed object when Place Object is selected.
- **E** opens Customise, Placement Height or the Object Library, depending on the tool.
- **K** picks up, rides, opens a door or sits down (`creatureKeyRouting.ts`).
- **B, R, Q, T** mean something different in each tool.
- **↑/↓** cycle the hotbar, except while the Roof tool uses them for rise.

The conflict check has to understand this. A key is only in **conflict** when two actions could
fire **in the same situation**. "B snaps in the Wall tool and opens the palette in Paint" is fine.

## 3. Design

### 3.1 The list of actions (one source of truth)

New file `src/lib/game/input/keyActions.ts`. Each action is listed once:

```ts
interface KeyAction {
	id: string;                 // 'move.forward', 'build.toggle', 'roof.riseUp'
	label: string;              // 'Move forward'
	description?: string;       // shown under the label and in the help guide
	category: KeyCategoryId;    // which Controls tab it appears under
	contexts: KeyContext[];     // when it can fire — used for conflict checks
	defaults: [Binding?, Binding?]; // primary, secondary
	kind: 'press' | 'hold';     // hold = read every frame (move, run, zoom)
	locked?: boolean;           // cannot be rebound (see 3.6)
	allowModifiers?: boolean;   // false for hold actions like Run (Shift is the key itself)
}

interface Binding {
	code: string;               // KeyboardEvent.code — the physical key, not the letter
	shift?: boolean; mod?: boolean /* Ctrl or Cmd */; alt?: boolean;
}
```

**Contexts** (an action can have more than one):

| Context | When it's live |
| --- | --- |
| `global` | Any time in a world (H, F3, F6–F9, `\`, L, Esc) |
| `onFoot` | Walking, not flying or riding |
| `flying` | Free flight |
| `riding` | On a creature |
| `resting` | Sitting or lying at a Mini Build seat |
| `build` | Build Mode is on and no global mode is (hotbar slot cycling, Customise) |
| `tool:<family>` | Only while that tool is selected: `foundation`, `wall`, `cornerWall`, `opening`, `barrier`, `skirting`, `slab`, `roof`, `stairs`, `floorDetail`, `furniture`, `placeObject`, `shovel` |
| `mode:<name>` | Move, Paint, Remove or Compose (music) Mode. Each one replaces the hotbar's normal handling while it's on. |
| `miniBuildEditor` | Inside the Mini Build editor |

Overlaps (`contextsOverlap(a, b)`, a single tested function):

- `global` overlaps everything except the Mini Build editor, which overlaps nothing (it swallows every key).
- Movement states rule each other out. Tools rule each other out, and so do modes.
- Every tool overlaps `build`. Modes don't.
- Walking, flying and riding overlap every tool and mode. Resting doesn't, because sitting blocks building.

Some keys are **shared on purpose**, where the game decides between the actions: F for Toggle
flight and Place Object: edit, E for Customise and Roof: outline, ↑/↓ for the hotbar and roof
rise, and Shift for Run and Remove whole. Each such action names its partner in `sharesKeyWith`,
and a test fails if an entry is no longer needed. A third action on the same key is still
reported as a conflict.

Modifiers: `mod` means Ctrl **or** Cmd on every platform (so one binding covers Ctrl/Cmd + S). A
lone `Shift`, `Control` or `Alt` binding covers both the left and right keys.

**Starting inventory** (taken from the current code and `ControlsGuide.svelte`; the
implementation should check each one against the code as it migrates):

| Category | Actions (default key) |
| --- | --- |
| Movement & camera | Forward W · Left A · Back S · Right D · Run Shift (L+R) · Jump Space · Zoom C (hold) · Toggle camera F5 · Resting view V |
| Interaction | Use / interact K · Stop tracking player U |
| Flight | Toggle flight F · Fly up Space · Fly down Shift *(the same keys as Jump and Run, but in the `flying` context only)* |
| Building | Build Mode G · Slots 1–8 (Digit1–8) · Previous / next tool in slot ↑ / ↓ · Customise / adjust E · Move Mode M · Paint Mode P · Remove Mode X (secondary 9) · Music Mode N · Delete in Remove mode Delete / Backspace · Undo − (Numpad −) · Redo = (Numpad +) · Level up ] / PageUp · Level down [ / PageDown · Cancel / exit tool Esc |
| Build tools | Snap mode B · Rotate / cycle R · Copy style Q (Fence) · Apply style R (Fence) · Offset mode O (Skirting) · Remove last point Backspace · Finish shape Enter · Stair direction ← / → · Roof rise ↑ / ↓ · Roof type V · Place Object R / B / F / T · Move R / T *(the shovel uses Undo / Redo and Esc; it has no keys of its own)* |
| Music garden | Instrument 1–5 · Previous / next instrument Q / E · Pitch ↑ / ↓ · Volume ← / → · Note length , / . · Play / pause loop J |
| Mini Build editor | Every key in `MiniBuildEditor.svelte` (Q/E/R/T/M/F/N, 1–4, arrows, PageUp/Down, Delete, `/`, Save Ctrl+S, Undo Ctrl+Z, Redo Ctrl+Y, Duplicate Ctrl+D) |
| Interface | Help H · Render stats F3 · Speech options F6 · F7 (check use) · Auto tutorial F8 · Next instruction F9 · Screenshot `\` · Graphics quality L · Save world Ctrl/Cmd+S · Pause / back Esc *(locked)* |

### 3.2 Bindings store

New file `src/lib/game/input/KeyBindingsStore.ts`, built the same way as `AudioPreferences.ts`:

```ts
// localStorage key: 'forest-drift.keybindings.v1'
interface KeyBindingsState {
	version: 1;
	activeProfileId: string;           // 'default' or a user profile id
	profiles: KeyProfile[];            // user profiles only; Default is built in
}
interface KeyProfile {
	id: string; name: string;
	createdAt: string; updatedAt: string;
	overrides: Record<string /* actionId */, [Binding | null, Binding | null]>;
}
```

- A profile saves **only the keys you changed**. Any action without an override uses its default.
  So when a later update adds new actions, old profiles and old downloaded files still work.
- `null` in a slot means "you cleared this on purpose". That's different from "use the
  default".
- API: `getBinding(actionId)`, `setBinding(actionId, slot, binding | null)`,
  `resetAction(id)`, `resetProfile()`, `createProfile(name, from?)`, `renameProfile`,
  `deleteProfile`, `setActiveProfile`, `subscribe(listener)`, `exportProfiles(ids)`,
  `importProfiles(json) → ImportReport`.
- Reads and writes are wrapped in try/catch, like the audio store, so private windows still work
  for the session.
- `normalize()` throws out unknown action ids and invalid codes, and limits profile names to 40
  characters and the number of profiles to 20.

### 3.3 Resolving input (the one place that checks keys)

New file `src/lib/game/input/KeyInput.ts`:

```ts
matches(event: KeyboardEvent, actionId: string): boolean   // for one-off presses
isHeld(actionId: string): boolean                          // for hold actions, every frame
labelFor(actionId: string, slot?: 0 | 1): string           // "W", "Shift + R", "Unbound"
```

- `KeyInput` keeps its own set of held codes, cleared on blur, on losing pointer lock, and on
  the existing `keys.clear()` calls. `FirstPersonController` replaces `keys.has('KeyW')` with
  `input.isHeld('move.forward')`.
- **Modifiers match exactly.** `R` does not fire when `Shift + R` is pressed if `Shift + R` is
  bound to something else in the same context. Otherwise it does fire, so "hold Shift for finer
  roof steps" keeps working. Hold actions ignore modifiers.
- **Typing is never caught.** Keys pressed in `input, textarea, select, [contenteditable]` are
  ignored in one shared function (today only `handleCreatureKey` checks this).
- **Touch keeps working whatever the bindings are.** Touch buttons press a key *as the defaults
  mean it* (`simulateKey` → `createDefaultKeyEvent`): the event is matched against default
  bindings, so "R" still rotates, restyles a fence or turns a beam in whichever tool is active,
  however the keyboard is rebound. A second kind of synthetic event names one action directly
  (`createActionEvent`), for buttons that map to a single action.
- **Tools that borrow a shared key** (Roof keeps E and ↑/↓, Place Object keeps ↑/↓) say so with
  `capturesKeyOf(action)`, which compares the current keys (`actionsShareKey`). Rebinding Roof's
  outline key off E lets E open Placement Height on the roof again.
- **Exact Shift where it matters.** An extra Shift is normally allowed (Shift is Run, and K or G
  must still work while running). The tutorial keys (F6–F9) set `exactShift`, as before.
- **Key names follow the player's keyboard layout.** Bindings use `event.code` (the physical key),
  so WASD stays in the same place on AZERTY. Labels use `navigator.keyboard.getLayoutMap()` where
  the browser has it (Chromium), so the key players see as "Z" is shown as "Z". Elsewhere a
  built-in code → label table is used (`BracketLeft → [`, `ArrowUp → ↑`, `Backslash → \`).

### 3.4 Migrating the code (no behaviour change)

Each `event.code === 'KeyX'` becomes `matches(event, 'some.action')`, in this order:

1. `FirstPersonController.ts`: movement, run, jump, zoom, F5, V, the "leave seat" key list.
2. `routes/+page.svelte` `handleKeyDown`: Esc, H, F3, U, `\`, F, L.
3. `ThreeScene.ts` K handler, `DoorInteractionController.ts`, `MiniBuildInteractionRuntime.ts`.
4. `BuildToolManager.ts`: the `Digit → slot` tables become `build.slot1…8` and `music.instrument1…5`,
   and `isCapturingKey(code)` becomes `isCapturingAction(actionId)`.
5. Each tool file in `game/building`, plus `PlaceObjectTool`, `MusicPlantPlacementTool`,
   `ShovelTool`, `BuildUndoManager`, `BuildingLevelManager`.
6. `MiniBuildEditor.svelte`.
7. Touch: `touchToolActions.ts` (`code` → `actionId`), `TouchControls.svelte`.

**Dialog keys stay fixed**: Enter / Space to confirm, Esc to close, Tab focus trap, and Home/End/←/→
in tab lists (HelpCredits, JoinWorldDialog, the `*CustomizeModal`s). These are standard
accessibility keys, not game controls, so they're left out of the Controls screen.

After step 7, a repo test fails if any file in `src/lib` outside `game/input/` still contains
`event.code ===` or a `'Key…'`/`'Digit…'` literal (with a short allow-list for the dialog
keys above).

### 3.5 Making help text show the player's keys

Every place that types a key name gets it from `labelFor()` and updates when bindings change:

- `ControlsGuide.svelte`: rows become `{ actions: ['move.forward', …], text }` and are built from
  the action list. A **"Change keys"** button opens the Controls screen.
- `tutorials.ts`: `'Press G'` → `` `Press ${key('build.toggle')}` ``.
- Prompts: the creature prompt `[K] …` (`ThreeScene.ts:497`), "Press E to choose an object"
  (`PlaceObjectTool.ts:358`), RideHud, ToolHint, the door and seat prompts, the F3 list in
  `+page.svelte`.
- Unbound actions show **"Unbound"** in prompts, so a hint never names a key that does nothing.

### 3.6 Keys that can't be bound or that warn

| Key | Rule | Why |
| --- | --- | --- |
| `Escape` | **Locked** for Pause / back / cancel. It can't be given to anything else. | The browser always uses Esc to release the mouse. It's also how players cancel capture mode. |
| `Tab`, `Enter` in menus | Not game controls (3.4). Enter is still bindable for tool actions such as "Finish shape". | Accessibility |
| `F11`, `F12`, `Ctrl/Cmd + W/T/N/Q/R/L`, `Cmd + H/M` | **Refused** while capturing, with an explanation. | The browser or OS takes these first, so the binding could never work. |
| `F1`, `F5`, `Ctrl+F`, `Ctrl+P`, `Alt` alone | **Amber warning**, allowed. | The game blocks the browser default only while the mouse is captured (as F5 already does). |
| `Meta` / `OS` alone | Refused. | The OS keeps it. |

## 4. The Controls screen (UI)

### 4.1 Where players find it

- **Settings → Controls**: a new category, first in the side menu, in **both** the landing-menu
  settings (`personalSettingsCatalog()`) and the in-world settings (`buildSettingsCatalog()`). It
  shows the active profile, the number of conflicts and a large **"Open key mapping"** button.
- **Pause menu → Controls**: opens the screen directly.
- **Help guide (H) → Change keys**.

The screen is a new component, `components/KeyBindingsScreen.svelte`. It always covers the whole
viewport (`position: fixed; inset: 0; 100dvh`, safe-area padding, `z-index` above the Settings
overlay) and uses the same look as `SettingsMenu`'s `.fullscreen` style (Georgia headings, wood
accent `#b38b4b`, green action buttons). The `settingsCatalog` field types don't change. The
Controls category only adds one `button` field that opens the screen.

The game stays paused while the screen is open. `+page.svelte` adds `keyBindingsOpen` to the
input-blocking flags it already checks (`settingsOpen || …`). `FirstPersonController`'s
`manualInputBlocked` stops movement, so pressing W while choosing a key never moves the player.

### 4.2 Layout (desktop)

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ FOREST DRIFT                                                                            │
│ Controls      Profile [ My controls ▾ ] [New] [Copy] [Rename] [Delete]                 │
│               [🔍 Search actions or keys ] [⌨ Find by key]  [⬇ Download] [⬆ Load] [Done]│
│ ⚠ 2 conflicts — Show                                                                    │
├───────────────────┬────────────────────────────────────────────────────────────────────┤
│ Movement & camera │ Movement & camera                                     Reset section │
│ Interaction       │ ┌──────────────────────────────┬───────────┬───────────┬────┐       │
│ Flight            │ │ Move forward                 │ [   W   ] │ [  ↑  ]   │ ↺  │       │
│ Building     ⚠ 1  │ │ Run  (hold)                  │ [ Shift ] │ [  +  ]   │ ↺  │       │
│ Build tools       │ │ Jump                         │ [⚠ Space] │ [  +  ]   │ ↺  │       │
│ Music garden      │ │   ⚠ Conflicts with "Interact" (Interaction) [Go to it] [Swap]  │       │
│ Mini Build editor │ └──────────────────────────────┴───────────┴───────────┴────┘       │
│ Interface    ⚠ 1  │                                                                     │
│                   │ ┌──────────────── Keyboard ───────────────────────────────────┐    │
│                   │ │ Esc F1 … F12                                                 │    │
│                   │ │ ` 1 2 3 4 5 6 7 8 9 0 - = ⌫                                 │    │
│                   │ │ ⇥ Q [W] E R T Y U I O P [ ] \                                │    │
│                   │ │ ⇪ [A][S][D] F G H J K L ; ' ⏎                                │    │
│                   │ │ ⇧ Z X [C] V B N M , . / ⇧        ← ↑ ↓ →                    │    │
│                   │ └──────────────────────────────────────────────────────────────┘    │
└───────────────────┴────────────────────────────────────────────────────────────────────┘
```

- **Side menu**: one category per row. A red **⚠ count** appears beside any category with a
  conflict. "Build tools" opens into one sub-row per tool.
- **Action rows**: the label with a short description underneath, the **primary** key cap, the
  **secondary** key cap (`+` when empty), and a **↺ reset** button that shows only when the action
  differs from its default. Changed actions get a small "Changed" dot so players can see what
  they've customised.
- **Keyboard picture** (below the rows; it can be folded away): keys used by the selected section
  are filled in, conflicting keys are red with a ⚠, and locked or reserved keys are grey with a
  lock. Hovering or focusing a key lists every action on it. Clicking a key filters the rows to
  that key.
- **Search** matches action names, descriptions and key names (`"space"`, `"shift+r"`).
  **Find by key** waits for one key press and then shows everything bound to it, in every section.

### 4.3 Changing a key

1. Click (or press Enter on) a key cap. The cap pulses and reads **"Press a key…"**. A small bar
   reads *"Press any key or combination. Esc cancels · [Clear] [Cancel]"*. The message is also
   announced through an `aria-live` region.
2. Press a key:
   - A normal key, or a key with Shift/Ctrl/Alt/Cmd held: it is bound on **keydown**.
   - A modifier on its own (e.g. Shift for Run): it is bound on **keyup**, if no other key was
     pressed in between. That way `Shift` and `Shift + R` can both be chosen.
   - `Esc` cancels. A refused key (3.6) shakes the cap and explains why: *"Ctrl + W closes the
     browser tab, so it can't be used."*
   - Mouse clicks and the wheel are not captured (see open question Q1).
3. **If the key is already used in an overlapping situation**, a small dialog opens under the cap
   before anything is saved:

   > **Space is already "Jump" (Movement & camera).**
   > [**Swap**: Jump gets your old key, `E`] [**Use for both**] [**Cancel**]

   - **Swap** (the default button) gives the other action the key you just replaced, so neither
     action ends up without a key.
   - **Use for both** keeps the conflict, and it stays marked everywhere until it's resolved.
   - If the key is only used in a situation that **doesn't** overlap (e.g. B in another tool), it's
     bound straight away with a quiet note: *"Also used by Paint: palette — no conflict, different
     tool."*
4. The change applies **at once** and is saved to the active profile. There's no separate Save
   button, which matches how the rest of Settings works. A toast says *"Jump → E · Undo"*, and
   **Undo** puts back the last change (keeping the last 20).

### 4.4 How conflicts are shown

A conflict means two actions share the same binding (key **and** modifiers) and have contexts that
overlap (`contextsOverlap`). The check runs over the whole profile on every change. It is a pure
function (`findConflicts(profile) → Conflict[]`) and unit-tested.

Each conflict is shown in **several ways, never colour alone**:

| Where | What players see |
| --- | --- |
| Key cap | Red border, ⚠ icon, label `⚠ Space` |
| Under the row | *"Conflicts with **Fly up** (Flight) — [Go to it] [Swap]"* |
| Side menu | `⚠ 2` badge beside the category |
| Header | *"⚠ 2 conflicts — Show"*. "Show" jumps to and highlights the first one; pressing it again goes to the next. |
| Keyboard picture | The key is red. Hovering it lists both actions. |
| Done button | If conflicts remain: *"2 keys still do two things at once. [Fix now] [Keep and close]"* |
| Settings → Controls card and Pause menu | A small "⚠ 2 conflicts" note |

Reserved-key warnings (3.6) are **amber**, not red, and don't count as conflicts.

If an action has no key and **can't be reached any other way** (e.g. Build Mode, Pause), its row
shows an amber *"Unbound: you won't be able to do this with the keyboard"* note.

### 4.5 Profiles

- **Default** is built in and read-only (labelled "Built-in"). The first edit while Default is
  active **automatically creates a copy** called "My controls", switches to it, and says so:
  *"Created 'My controls' so the default stays intact."* That way the default can never be lost.
- **New**: starts from the defaults. **Copy**: copies the current profile. **Rename**: edit the
  name in place. **Delete**: asks first (*"Delete 'Left-handed'? This can't be undone unless
  you've downloaded it."*). If the deleted profile was active, Default becomes active.
- The profile menu lists every profile with how many keys it changes and how many conflicts it
  has: `Left-handed · 14 changed · ⚠ 1`.
- **Reset profile** (in a "…" menu) puts every key back to its default, asks first, and can be
  undone.
- Switching profiles applies at once in the running world and updates every help line.

### 4.6 Downloading and loading files

**Download** (a menu): *This profile* or *All profiles*. It creates a file with
`Blob` + `URL.createObjectURL` + `<a download>`, named
`forest-drift-controls-<profile-name>-2026-11-10.json`:

```json
{
	"format": "forest-drift.keybindings",
	"version": 1,
	"exportedAt": "2026-11-10T14:03:00.000Z",
	"game": "Forest Drift",
	"profiles": [
		{
			"name": "Left-handed",
			"overrides": {
				"move.forward": [{ "code": "KeyI" }, null],
				"tool.rotate": [{ "code": "KeyR", "shift": true }, null]
			}
		}
	]
}
```

The file holds only overrides, the same as storage (3.2), so it stays small and works with later
versions.

**Load**: a file picker (`accept=".json,application/json"`), or **drag a file anywhere onto the
screen** (a full-screen "Drop to load controls" message appears while dragging).

1. Checks: at most 256 KB, valid JSON, `format` matches, `version` ≤ the current version. Unknown
   action ids and invalid codes are **skipped, not fatal**.
2. A **preview dialog** appears before anything is saved:

   > **Load "Left-handed"?**
   > 14 changed keys · 2 actions from a newer version were skipped · ⚠ 1 conflict
   > Name: [ Left-handed (2) ] ← changed automatically if the name is taken
   > [**Load and use**] [Load only] [Replace existing "Left-handed"] [Cancel]

3. A file with several profiles lists each one with a checkbox.
4. Afterwards a toast reports the result, and any conflicts show at once (4.4).

Bad files show a plain message (*"This isn't a Forest Drift controls file."*). Nothing is saved.

### 4.7 Phones, small screens and accessibility

- Under 720 px wide, the side menu becomes a row of tabs scrolling sideways, the keyboard picture is
  hidden behind a "Show keyboard" button, and the two key caps move onto their own line under the
  label.
- On touch-only devices (`(hover: none) and (pointer: coarse)` with no key presses seen yet), a
  notice reads *"Key mapping is for physical keyboards. Touch controls are unchanged."* Profiles
  and download/load still work, so players can prepare a file for a laptop.
- Focus is trapped as in `SettingsMenu` and goes back to where it was on close. Every control can
  be reached with Tab. Key caps are `<button>`s with labels such as
  `aria-label="Move forward, primary key W. Press to change."` Conflicts use
  `aria-describedby`. Capture mode and results are announced with `aria-live="polite"`.
- Text contrast is at least 4.5:1. Conflict red and reserved amber both come with an icon and
  words.

## 5. Files

**New**

| File | Purpose |
| --- | --- |
| `src/lib/game/input/keyActions.ts` | Action list, categories, contexts, `contextsOverlap` |
| `src/lib/game/input/keyCodes.ts` | Code → label table, refused/warning key lists, `navigator.keyboard` layout labels |
| `src/lib/game/input/KeyBindingsStore.ts` | Profiles, saving, normalize, import/export, undo stack |
| `src/lib/game/input/KeyInput.ts` | `matches`, `isHeld`, `labelFor`, held-key tracking, ignoring text fields, synthetic touch actions |
| `src/lib/game/input/conflicts.ts` | `findConflicts`, `classifyCandidate` (conflict / harmless overlap / refused / warning) |
| `src/lib/components/KeyBindingsScreen.svelte` | The full-screen Controls screen |
| `src/lib/components/keybindings/KeyCap.svelte`, `KeyboardMap.svelte`, `CaptureBar.svelte`, `ConflictPrompt.svelte`, `ProfileMenu.svelte`, `ImportPreviewDialog.svelte` | Pieces of the screen |
| `src/lib/game/input/__tests__/*.spec.ts` | Unit tests |
| `tests/keyBindings.e2e.ts` | End-to-end tests |

**Changed**: the ~40 files from 3.4, plus `ControlsGuide.svelte`, `tutorials.ts`, the prompt
sources (3.5), `settingsCatalog.ts` and `personalSettingsCatalog.ts` (Controls category),
`PauseMenu.svelte` (Controls button), `LandingMenu.svelte` and `routes/+page.svelte` (open
state, input blocking).

## 6. Order of work

Each phase ships on its own and leaves the game working.

| # | Phase | Done when |
| --- | --- | --- |
| 1 | Action list, `KeyInput`, store with Default only | Unit tests pass. The defaults match every key the game uses today. |
| 2 | Migrate player movement and global keys (3.4 steps 1–3) | All existing e2e tests pass unchanged. |
| 3 | Migrate build tools, music, Mini Build editor, touch (steps 4–7) | All e2e tests pass, including `touchControls`, `touchButtons`, `miniBuild*`. The "no raw key codes" test passes. |
| 4 | Controls screen: layout, rebinding, conflict checks and display | Rebinding works live in a world. Conflicts show in all the places listed in 4.4. |
| 5 | Profiles: create, copy, rename, delete, auto-copy of Default, undo | Profiles survive a reload. |
| 6 | Download / load: files, drag-and-drop, preview, checks | A downloaded file loaded in a fresh browser gives the same bindings. |
| 7 | Help text from bindings (3.5) | Rebinding K changes "[K] Get off" and the help guide straight away. |
| 8 | Phone layout, accessibility, polish | Checked at 375 px and with the keyboard only. |

Phases 1–3 are the risky part: they touch every tool, and players should notice no change at all.
Phases 4–8 are mostly new files.

## 7. Tests

**Unit (Vitest)**

- `contextsOverlap`: the full overlap table, including "two tools never overlap" and `global` overlapping everything.
- `findConflicts`: same key in overlapping contexts → conflict. Same key in two tools → none.
  `R` vs `Shift + R` → none. Run (Shift) vs Fly down (Shift) → none (`onFoot` vs `flying`).
- Defaults: **the default profile has zero conflicts** (a test that protects future changes).
- `matches`: exact modifiers, ignoring text fields, synthetic `forestAction`, hold actions ignoring modifiers.
- Store: normalize (bad JSON, unknown ids, `null` vs missing), Default auto-copy, the 20-profile limit, try/catch on storage errors.
- Import: wrong format, newer version, an oversized file, unknown actions skipped, name collisions.
- Download → load round trip gives identical overrides.

**End-to-end (Playwright, new `tests/keyBindings.e2e.ts`)**

- Open from Settings, Pause and Help. The screen fills the viewport at 1280×800 and 375×812.
- Rebind Move forward to `I`. In a world, `I` moves the player and `W` doesn't.
- Bind `E` to Jump. The conflict dialog appears. **Swap** works. **Use for both** shows the ⚠ in the
  row, the side menu and the header, and the header "Show" jumps to it.
- Refused key (`Ctrl+W`) shows the explanation and binds nothing.
- Edit Default → "My controls" is created. Switch profiles and the bindings change live. Delete asks first.
- Download a file, then load it on a new browser page. The preview's numbers are right and the bindings apply.
- Rebind K and the creature prompt text changes.
- Touch buttons still work after their keys are rebound or cleared.
- **All existing e2e tests pass unchanged** (they use default keys).

## 8. Risks

| Risk | How it's handled |
| --- | --- |
| The migration quietly changes how some key works | Phases 2–3 aim for zero behaviour change, the existing e2e tests act as the check, and the "no raw codes" test catches any missed code |
| Keys that mean different things per tool are reported as false conflicts | The context model plus the "default profile has no conflicts" test |
| A player clears or rebinds Pause/Build and gets stuck | Esc is locked, unreachable actions get warnings, Undo, Reset profile, and the Default profile always exists |
| Browser shortcuts take the key first | Refused and warning lists (3.6), plus `preventDefault` only while the mouse is captured |
| Key names are wrong on non-QWERTY keyboards | Physical codes for matching, `getLayoutMap()` for names, and the "Find by key" check |
| Loaded files are malformed or hostile | Size limit, strict checks, data only (nothing in a file is ever run), unknown parts skipped |

## 9. Decisions

All six questions were **locked on 10 November 2026**, using the recommended answers.

| # | Question | Decision |
| --- | --- | --- |
| Q1 | Should **mouse buttons** (left/right/middle, side buttons, wheel) be rebindable too? | **Not in this round.** They appear read-only in the list ("Left click — Place / fire"). Side and middle buttons may be added in a later round. |
| Q2 | Should the **Mini Build editor** keys be in the same profiles? | **Yes**, as their own category. They're only live inside the editor, so they never conflict with game keys. |
| Q3 | Changes apply at once, or need an **Apply / Cancel**? | **Apply at once, with Undo** (last 20 changes). That matches the rest of Settings. |
| Q4 | Two keys per action, or more? | **Two** (primary and secondary). |
| Q5 | Built-in extra presets (Left-handed / arrow keys, AZERTY)? | **After Phase 6**, as an optional extra. They'd be built-in, read-only profiles. Not needed for this feature to count as done. |
| Q6 | Should the **dialog keys** (Enter/Space confirm, Tab, Home/End) be rebindable? | **No.** They're standard accessibility keys (3.4). |
