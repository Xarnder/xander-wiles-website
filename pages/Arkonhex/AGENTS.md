# AGENTS.md — Arkonhex Engine Developer Guide

> **For future AI coding agents and human developers.** Read this fully before making any changes to the engine.

---

## 1. What is Arkonhex?

Arkonhex is a **browser-based hexagonal voxel engine** built on top of Three.js. It is a voxel world where every map tile is a **pointy-topped hexagonal prism** instead of a cube. Think Minecraft, but with hex columns.

It is served as a static web page at:
```
/pages/Arkonhex/index.html
```

There is **no build step**, no bundler, and no Node server. It runs directly via `file://` or any static HTTP server using native ES Modules (`type="module"`). Three.js is loaded from a CDN via an `importmap` in `index.html`.

---

## 2. Phase Numbering Convention ⚠️

All development work on this engine is tracked by **Phase numbers**. The most recent completed phase is **Phase 36**.

**When you add a new feature or fix, always:**
1. Name it **Phase 36**, then **Phase 37**, etc. — never reset or repeat numbers.
2. Record it in the conversation walkthrough or any documentation you maintain.
3. Keep this file updated with the current highest phase number.

> **Current highest phase: 36**

---

## 3. File & Directory Structure

```
pages/Arkonhex/
├── index.html              — Entry point. All DOM structure, overlays, settings UI
├── style.css               — All CSS. Key classes: .overlay-screen, .hidden, #ui-layer, .ui-hidden
├── AGENTS.md               — THIS FILE
│
├── data/
│   ├── blocks.json         — Block definitions (id, name, topColor, baseColor, hardness, translucent)
│   ├── palette.json        — Named colour → hex mapping (used by BlockSystem for vertex colours)
│   └── worldSettings.json  — Seed, seaLevel, and other world parameters
│
├── assets/
│   └── sounds/             — All audio. HTML5 Audio, loaded as relative paths from PlayerSystem.js
│       ├── walking.mp3
│       ├── place.mp3
│       ├── break.mp3
│       ├── swimming.mp3
│       ├── splash.mp3
│       ├── underwater-ambients.mp3
│       └── normal-ambients.mp3
│
└── src/
    ├── core/
    │   └── Engine.js       — Bootstrap. Owns the game loop, initializes all systems in order
    │
    ├── blocks/
    │   └── BlockSystem.js  — Loads blocks.json + palette.json. Provides getBlockDef(id), getColor(name)
    │
    ├── world/
    │   ├── Chunk.js        — Data container: 3D block array for a 16×CHUNK_HEIGHT×16 hex region
    │   ├── ChunkSystem.js  — Manages chunk loading/unloading around the player
    │   └── WorldGen.js     — Procedural terrain generation using SimplexNoise
    │
    ├── rendering/
    │   ├── Renderer.js         — THREE.WebGLRenderer setup
    │   ├── ChunkMeshBuilder.js — Converts chunk block data into Three.js BufferGeometry meshes
    │   ├── CloudSystem.js      — Generates low-poly hexagonal clouds that drift across the sky
    │   └── LightingManager.js  — Ambient + directional lighting, tracks player position
    │
    ├── physics/
    │   └── PhysicsSystem.js    — AABB collision, gravity, getBlockAt(x, y, z)
    │
    ├── systems/
    │   └── PlayerSystem.js     — Camera, movement, input handling, audio, water detection
    │
    ├── ui/
    │   └── UIManager.js        — HUD, hotbar, debug overlay, settings panel wiring
    │
    └── utils/
        ├── HexUtils.js         — axialToWorld(), worldToAxial(), HEX_SIZE, hex math
        ├── MathUtils.js        — General math helpers
        └── SimplexNoise.js     — Noise library used by WorldGen
```

---

## 4. Core Architecture

### 4.1 Coordinate Systems

This is a **hex-axial + Y-up** coordinate system:

- **Axial (q, r)** — hex grid position. Each hex has integer `q` and `r` values.
- **World (x, y, z)** — Three.js 3D space. Y is vertical (up). X/Z is the ground plane.
- **Chunk-local (lq, lr, y)** — position within a chunk: `lq = q mod 16`, `lr = r mod 16`.

Conversions:
```js
import { axialToWorld, worldToAxial } from '../utils/HexUtils.js';

const { x, z } = axialToWorld(q, r);        // Hex grid → world space
const { q, r } = worldToAxial(worldX, worldZ); // World space → hex grid
```

Hex constants:
```js
HEX_SIZE = 1.0          // Center to corner radius
HEX_WIDTH = sqrt(3)     // Flat width of one hex
```

### 4.2 Block System

Blocks are loaded from `data/blocks.json`. Each block has:
```json
{
  "id": 5,
  "name": "water",
  "topColor": "blue",
  "baseColor": "blue",
  "hardness": 0.0,
  "translucent": true
}
```

> **⚠️ Critical:** Block names are **all lowercase** in `blocks.json`. Always compare with lowercase: `def.name === 'water'`, NOT `'Water'`.

Block IDs used in world generation (from `WorldGen.js`):
| ID | Name    |
|----|---------|
| 0  | Air     |
| 1  | grass   |
| 2  | dirt    |
| 3  | stone   |
| 4  | sand    |
| 5  | water   |
| 6  | wood    |
| 7  | leaves  |
| 8  | bedrock |

Colours are stored as **linear normalised RGB arrays** `[r, g, b]` (converted from sRGB hex via `THREE.Color.convertSRGBToLinear()`). Never use raw hex values for vertex colours.

### 4.3 Chunks

- Chunk size: **16×16** hex columns, **CHUNK_HEIGHT** (64) blocks tall.
- Chunk key: `` `${chunkQ},${chunkR}` `` where `chunkQ = Math.floor(q / 16)`.
- `ChunkSystem` manages a map of active chunks. Each `Chunk` stores a flat `Uint8Array` of block IDs.
- Chunks have a `isDirty` flag — set it to `true` to trigger a mesh rebuild on next update.

### 4.4 Physics

`PhysicsSystem.getBlockAt(x, y, z)` is the central method for querying the voxel world at any 3D world position. It converts to axial, finds the chunk, and returns the block ID.

```js
const blockId = this.physics.getBlockAt(worldX, worldY, worldZ);
```

Returns `0` (air) if the chunk isn't loaded or Y is out of bounds.

A block is considered **solid** if `def.hardness > 0`. Water (`hardness: 0.0`) is **non-solid** — the player physically passes through it.

### 4.5 Engine Init Order

`Engine.init()` in `src/core/Engine.js` initializes systems in this order:
1. `BlockSystem` — must be first (others depend on block data)
2. `Renderer`
3. `LightingManager`
4. `WorldGen`
5. `ChunkSystem`
6. `PhysicsSystem`
7. `InputManager`
8. `PlayerSystem`
9. `UIManager`
10. `CloudSystem`

The game loop runs via `requestAnimationFrame`. Each frame calls `system.update(delta, time)` on all registered systems.

---

## 5. World Generation

`WorldGen.js` drives all procedural terrain. Key parameters:
- **`seaLevel`**: loaded from `worldSettings.json` (currently `16`). This is the Y level at which water fills.
- **Noise scale**: `nx = worldPos.x * 0.006` — low scale = large, sweeping terrain features.
- **`shapedHeight`**: the pre-water terrain height calculated from octave noise. Uses `Math.pow(heightValue, 1.8)` shaping + `* 0.85` scaling + `+12` baseline.
- **Ocean trenches**: when `surfaceY <= seaLevel`, depth is calculated from the raw `heightValue` using a quadratic easing curve (`depthRatio^2`) down from a `waterThreshold` of `0.32`.

Adding new biomes: modify the `for y` loop inside `generateChunk()`. Look at how stone, sand, and grass placement is conditional on `surfaceY` relative to `seaLevel`.

---

## 6. Rendering

`ChunkMeshBuilder.js` generates Two `BufferGeometry` meshes per chunk:
- **Solid mesh** — opaque blocks
- **Translucent mesh** — water and other transparent blocks

Each hex column face is constructed from two quads split at 75%/25% using `topColor` and `baseColor`. For **water blocks**, colour is tinted darker the deeper below `y=16`, using a linear RGB scaling:
```js
const darkness = Math.min(0.7, depthOffset * 0.05);
```

Face culling: faces between two solid blocks are skipped. Translucent faces adjacent to solid blocks are always rendered.

---

## 7. Player & Audio

`PlayerSystem.js` handles all player logic. Key properties:

| Property | Purpose |
|---|---|
| `this.position` | Player **feet** world position (THREE.Vector3) |
| `this.velocity` | Physics velocity |
| `this.camera` | THREE.PerspectiveCamera |
| `this.isFlying` | Toggle with `F` key |
| `this.walkSpeed / sprintSpeed / flySpeed` | Base movement speeds |
| `this.baseFov` | Controlled by the settings FOV slider |
| `this.wasSubmerged` | Previous frame camera-water state |
| `this.wasFeetInWater` | Previous frame feet-water state |

### Water Detection (Dual Threshold)
- **Feet (`isFeetInWater`)** — queries `this.position.y`. Triggers `splash.mp3` on entry/exit.
- **Camera (`isSubmerged`)** — queries `this.camera.getWorldPosition()`. Controls blue tint overlay, `swimming.mp3`, and underwater ambient crossfade.

> **Important**: always use `this.camera.getWorldPosition(vec)` to get the camera's true scene position. The camera is parented to `pitchObject` → `yawObject`, so `this.camera.position` alone is local, not world space.

### Audio Files
All audio is plain HTML5 `new Audio()`. Loaded from `'assets/sounds/'` (relative to the HTML page). Audio starts only after first player interaction (browser autoplay policy).

| File | Triggered by |
|---|---|
| `walking.mp3` | On ground + horizontal velocity > 2 |
| `place.mp3` | Right-click block placement |
| `break.mp3` | Left-click block destruction |
| `splash.mp3` | Feet crossing water surface |
| `swimming.mp3` | Camera submerged + moving |
| `underwater-ambients.mp3` | Camera submerged (looping, crossfaded) |
| `normal-ambients.mp3` | Camera above water (looping, randomly seeked at sine troughs) |

---

## 8. UI Layer & CSS Classes

All in-game UI lives inside `<div id="ui-layer" class="ui-hidden">`. This parent has a rule:
```css
#ui-layer.ui-hidden > :not(#start-screen):not(#pause-screen) { display: none !important; }
```

> **⚠️ Critical gotcha:** Any DOM element that needs to be shown/hidden independently during gameplay (e.g. the water overlay) must sit **outside** of `#ui-layer` to avoid being suppressed by this rule. The `water-overlay` div is intentionally placed after the `#ui-layer` closing tag for this exact reason.

The correct toggle pattern for overlays outside `#ui-layer`:
```js
overlay.style.display = 'block'; // Show
overlay.style.display = 'none';  // Hide
```

For elements **inside** `#ui-layer`, use the `.hidden` class:
```js
el.classList.add('hidden');    // Hide
el.classList.remove('hidden'); // Show
```

---

## 9. Settings

The settings panel in the pause menu (`#settings-tab`) currently exposes:
- **Render Distance** slider (`#rd-slider`) — controls `ChunkSystem` load radius
- **Field of View** slider (`#fov-slider`) — controls `PlayerSystem.baseFov`

Settings are wired in `UIManager.js`. Add new settings there.

---

## 10. Adding New Features — Checklist

When starting any new feature:

1. **Assign the next Phase number** (currently continuing from Phase 36).
2. **Check block names are lowercase** before any `def.name` comparison.
3. **Use `physics.getBlockAt(x, y, z)`** for any voxel world queries — don't manually compute chunk keys.
4. **Use `axialToWorld / worldToAxial`** from `HexUtils.js` for all coordinate conversions — never hardcode hex math.
5. **New DOM overlays**: add them outside `#ui-layer` and toggle via `style.display`.
6. **New audio**: add `.mp3` to `assets/sounds/`, instantiate with `new Audio('assets/sounds/name.mp3')` inside `PlayerSystem` constructor.
7. **New block types**: add an entry to `data/blocks.json` and `data/palette.json` with the new colour name.
8. **New world features**: modify `WorldGen.generateChunk()` — the `for (let y ...)` loop is where block placement decisions are made.
9. **Mesh changes**: work in `ChunkMeshBuilder.js`. The two mesh types (solid / translucent) are built in parallel.

---

## 11. Known Quirks & Gotchas

- **`def.name` is always lowercase** — `blocks.json` uses `"water"` not `"Water"`. Mismatching case will silently fail detection.
- **`this.camera.position` is local** — always use `this.camera.getWorldPosition(vec)` in PlayerSystem because the camera is nested inside a yaw/pitch rig.
- **Ambient audio needs first interaction** — both ambient tracks are started on first `moveDir.lengthSq() > 0` frame, not immediately, to comply with browser autoplay policy.
- **Normal ambient randomly seeks** — `normalAmbient.currentTime` is jumped to a random position each time the sine envelope crosses below 0.05 (near-silence trough). This makes a long file behave like randomised clips.
- **Water body is non-solid** (`hardness: 0.0`) — players physically pass through it. Buoyancy / swim physics are not yet implemented.
- **No build step** — if you add new JS files, import them directly with relative `../path/to/file.js` paths. No bundling required.
- **Delta is capped at 0.1s** in the engine loop — prevents physics explosions when the tab is backgrounded.

---

## 12. Performance & Thread Management ⚠️

Arkonhex is a high-performance voxel engine running in a single-threaded environment. To prevent freezing or stutters, follow these strict rules:

### 12.1 Frame Yielding (No Main Thread Blocking)
ALL mesh building, block iterating, and chunk loading logic MUST use **Generator functions** (`function*`) and `yield` control back to the main thread periodically. Do not allow `for` loops to iterate over thousands of blocks synchronously. Use time-slicing logic (e.g., `if (count % 32 === 0) yield;`).

### 12.2 Event-Driven Grid Updates
**NEVER** execute grid-wide recalculations inside a continuous `update(delta)` loop if they can be avoided.
When checking if chunks need loading, unloading, or mesh rebaking based on player position, track the player's active **Chunk Coordinates** (`cq`, `cr`) and ONLY trigger chunk-system updates when the player enters a new chunk border. Avoid polling large arrays 60 times a second.

### 12.3 Async Semaphore Locking
When querying IndexedDB (via `ChunkStorage.js`) or other asynchronous data sources, maintain explicit boolean locks (e.g., `this.isLoadingDB = true`). Do not queue parallel microtasks that try to initialize generators simultaneously, as they will overwrite each other's state and stall the engine.
