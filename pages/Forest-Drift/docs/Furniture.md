Make slot **8** a general **Place Object** tool, with the torch becoming just one item in an object catalogue. `E` should open the object-selection/edit modal while that mode is active, and every furniture item should be generated from logical dimensions rather than imported meshes.

# Coding-agent prompt — Procedural Furniture & Place Object System

Implement the first complete **procedural furniture / placeable object system** for the existing SvelteKit + TypeScript + Three.js game.

The game already has:

- procedural terrain
- foundations
- multi-level buildings
- walls
- floors/ceilings
- roofs
- stairs
- doors/windows with procedural frames
- paint/material system
- Remove Mode
- world save/load
- hotbar building tools
- an existing object-placement mode in **hotbar slot 8**
- currently, slot 8 can place only a **torch**

Extend that existing system rather than creating a parallel furniture-placement system.

The core interaction should become:

```text
8
= Place Object mode

E
= open Object / Furniture modal

Mouse
= position preview

R
= rotate object

Left Click
= place object

Right Click / Esc
= cancel current placement

X
= existing Remove Mode
```

The most important architectural requirement is:

> **Furniture must be procedural, just like the procedural window and door system.**

Do NOT use downloaded or fixed-size furniture models as the core implementation.

The game should generate the furniture geometry from compact logical definitions.

---

## 1. Hotbar slot 8 becomes Place Object

Keep:

```text
Hotbar Slot 8
```

but rename/reframe it as:

```text
PLACE OBJECT
```

rather than:

```text
TORCH
```

The torch remains available as one placeable object.

When slot 8 is selected, show something like:

```text
PLACE OBJECT

Chair

E    Objects
R    Rotate
Click Place
```

If no furniture has been selected yet, default to the most recently used object.

For a new player, a sensible initial default is:

```text
Chair
```

or preserve Torch if that minimizes migration complexity.

---

# 2. E opens the object modal

While **Place Object mode** is active:

```text
E
```

opens the object selection/edit modal.

This is a core control and must be preserved.

Do NOT use `E` as general interact while the Place Object tool is active.

When the modal opens:

- release pointer lock
- show cursor
- suspend placement clicks
- prevent click-through
- allow selecting furniture
- allow changing procedural dimensions/settings
- close and return naturally to placement

When the modal closes:

- retain chosen object
- regenerate ghost preview
- allow pointer lock to resume
- do not place an object from the click that closed the modal

---

# 3. Furniture catalogue

Implement this first-scope catalogue.

## Sleeping

```text
Bed
Bedside / Small Table
Wardrobe
```

## Seating

```text
Chair
Stool
Bench
```

## Tables / Work

```text
Table
Work Bench
```

## Kitchen

```text
Kitchen Counter
Kitchen Counter with Sink
Furnace / Stove
Cupboard
```

## Storage

```text
Chest
Barrel
Shelf
Bookcase
```

## Comfort / Lighting

```text
Fireplace / Hearth
Lantern
Torch
```

That gives approximately 18–19 useful objects.

Do NOT add dozens of decorative items yet.

---

# 4. Object modal layout

Make the modal easy to navigate.

Suggested UI:

```text
OBJECTS

[ Search... ]

Recently Used

Furniture
  Sleeping
  Seating
  Tables
  Kitchen
  Storage
  Lighting

--------------------------------

[ preview / icon ]

Chair

Width      0.50m
Depth      0.50m
Height     0.90m

Material   Oak / Current material

[ Select ]

--------------------------------
```

A left category list plus grid of object cards is preferable.

Object cards should show:

- name
- simple thumbnail/icon if available
- category
- currently selected state

Do not build a huge inventory UI yet.

---

# 5. E is also the edit entry point

While Place Object mode is active:

```text
E
```

should always bring up the same object modal.

If a new object has not yet been placed:

the modal edits the placement preset.

Later we may support editing an already placed object.

For this task, concentrate on:

```text
choose object
change dimensions/options
place object
```

Do not implement a complicated in-world furniture edit mode unless one already exists.

---

# 6. Procedural object architecture

Create a generic logical representation.

Something like:

```ts
type PlaceableObjectType =
  | 'torch'
  | 'lantern'
  | 'bed'
  | 'small-table'
  | 'wardrobe'
  | 'chair'
  | 'stool'
  | 'bench'
  | 'table'
  | 'workbench'
  | 'kitchen-counter'
  | 'kitchen-counter-sink'
  | 'furnace'
  | 'cupboard'
  | 'chest'
  | 'barrel'
  | 'shelf'
  | 'bookcase'
  | 'fireplace';
```

And:

```ts
interface PlaceableObjectDefinition {
  id: string;

  type: PlaceableObjectType;

  foundationId?: string;
  levelId?: string;

  position: {
    x: number;
    y: number;
    z: number;
  };

  rotationY: number;

  dimensions: {
    width: number;
    depth: number;
    height: number;
  };

  material?: BuildingMaterialDefinition;

  variant?: string;

  parameters?: Record<string, number | string | boolean>;
}
```

Improve this structure where appropriate.

The authoritative state must remain logical and serializable.

---

# 7. Do NOT serialize furniture mesh geometry

Never save:

```text
BufferGeometry
Mesh
Material
vertices
indices
Three.js Object3D
```

The flow must be:

```text
PlaceableObjectDefinition
        ↓
ProceduralFurnitureBuilder
        ↓
Three.js geometry
```

World saves should remain compact.

---

# 8. Generic builder architecture

Create something approximately like:

```text
PlaceableObjectManager

PlaceObjectTool

FurnitureCatalogue

ProceduralFurnitureBuilder

ObjectPlacementPreview

FurnitureMaterialResolver
```

Then specialized geometry builders:

```text
BedBuilder
ChairBuilder
BenchBuilder
TableBuilder
CounterBuilder
WardrobeBuilder
ChestBuilder
BarrelBuilder
ShelfBuilder
BookcaseBuilder
FurnaceBuilder
FireplaceBuilder
LanternBuilder
TorchBuilder
```

Do NOT scatter furniture geometry directly through UI code.

---

# 9. Shared procedural furniture primitives

Avoid implementing every object from unrelated BoxGeometry calls.

Create reusable primitives/helpers such as:

```text
makePost()
makePanel()
makeBoard()
makeShelf()
makeFrame()
makeDrawerFront()
makeRoundLeg()
makePlankTop()
makeCylinderBand()
```

and higher-level concepts:

```text
FurnitureFrame
PanelCabinet
LeggedSurface
StorageBox
ShelvingUnit
```

This will make later furniture much easier.

---

# 10. Procedural dimensions

Every furniture item should have logical dimensions.

For example:

```text
width
depth
height
```

with defaults.

The user should be able to adjust dimensions in the `E` modal where appropriate.

Do NOT allow absurdly tiny/negative values.

Use sensible per-object ranges.

---

# 11. Dimensional snapping

Furniture dimensions should snap to the existing building grid where appropriate.

For example:

```text
0.25m increments
```

or the current configured building grid.

This works particularly well for:

```text
tables
benches
counters
shelves
wardrobes
workbenches
```

Do not force every tiny detail to the building grid.

For example:

```text
chair leg thickness
```

is internally derived, not user-grid-snapped.

---

# 12. Object placement snapping

Furniture placement should use the existing fine building grid where appropriate.

However:

allow an optional:

```text
Free Placement
```

mode later.

For v1:

snap X/Z to building grid while on foundations/floors.

Rotation should initially snap to:

```text
0°
90°
180°
270°
```

This is enough for architectural furniture.

If diagonal/free rotation already exists cleanly, preserve it.

---

# 13. Rotation control

Use:

```text
R
```

to rotate the current furniture preview.

Default:

```text
+90°
```

per press.

Show:

```text
Rotation: 90°
```

briefly or in HUD.

If `R` conflicts with another tool, remember:

it only applies while slot 8 Place Object mode is active.

---

# 14. Placement surfaces

Objects should be placeable on:

```text
foundation tops
floor slabs
ground terrain where appropriate
```

Most furniture should primarily require:

```text
horizontal walkable surface
```

Do not allow furniture to float arbitrarily in space.

Use existing:

```text
WorldSurfaceSampler
```

or equivalent.

---

# 15. Furniture surface rules

Different objects can have placement restrictions.

## Indoor/general furniture

```text
Bed
Chair
Stool
Bench
Table
Work Bench
Counters
Wardrobe
Cupboard
Chest
Shelf
Bookcase
```

may be placed on:

```text
foundation
floor
sufficiently flat terrain
```

## Fireplace

Should generally require a walkable horizontal surface.

It may be allowed adjacent to a wall but should not require one yet.

## Torch

Preserve existing placement behavior.

If torch currently attaches to walls, keep that behavior.

## Lantern

For v1:

place on horizontal surfaces.

Hanging lanterns are future scope.

---

# 16. Ghost preview

Every placeable object must have a translucent placement preview.

Preview should show:

```text
valid placement
invalid placement
rotation
actual dimensions
```

Use the real procedural geometry at preview quality where reasonable.

Do NOT use a generic cube as preview.

---

# 17. Placement validation

Reject placement if:

```text
object intersects a wall badly
object overlaps another large furniture item
object extends outside foundation/floor support excessively
object has no supporting surface
object is on an extreme terrain slope
```

Use a coarse footprint/bounding-box check.

Do NOT use full triangle-triangle collision just for placement.

---

# 18. Furniture collision footprint

Each furniture builder must expose simple collision/placement bounds.

Something like:

```ts
interface FurnitureMetrics {
  bounds: Box3Like;

  footprint: {
    width: number;
    depth: number;
  };

  collisionType:
    | 'box'
    | 'cylinder'
    | 'none';
}
```

Use these for:

- preview overlap
- player collision
- object removal targeting

---

# 19. Player collision

Solid furniture should block the player.

Examples:

```text
bed
table
counter
wardrobe
chest
barrel
furnace
bookcase
```

Use coarse box/cylinder collision.

Do NOT use detailed mesh collision.

Small decorative light pieces such as lanterns may be non-colliding if that avoids annoying snagging.

---

# 20. Furniture materials

Integrate with the existing logical:

```text
BuildingMaterialDefinition
```

Furniture should not hard-code raw Three.js materials.

For v1, use sensible defaults such as:

```text
wood
dark wood
stone
metal
fabric
glass
```

but all should be represented through the existing material architecture.

---

# 21. Future Paint Tool compatibility

The existing Paint/Material Tool should eventually be able to recolour furniture.

For this task:

at minimum make furniture material logical rather than baked into geometry.

If easy:

allow Paint Mode to target the whole placed object.

But do not make complex sub-part painting part of this task.

---

# 22. Multi-material future-proofing

Some furniture naturally has multiple materials.

For example:

```text
Bed
wood frame
+
fabric mattress

Kitchen counter
wood cabinet
+
worktop

Furnace
stone/metal
```

Support logical material slots.

Conceptually:

```ts
interface FurnitureMaterialSlots {
  primary?: BuildingMaterialDefinition;
  secondary?: BuildingMaterialDefinition;
  accent?: BuildingMaterialDefinition;
}
```

Do not require all furniture to use one material forever.

---

# 23. Bed

Generate procedurally from:

```text
width
length/depth
height
```

Components approximately:

```text
4 legs or simple support frame
bed frame
mattress
headboard
```

Optional simple pillow if inexpensive.

Do NOT add blankets with cloth simulation.

Suggested default size around:

```text
width 1.4m
depth 2.0m
height 0.55m
```

Allow:

```text
single
double
large
```

as presets if useful.

---

# 24. Small / bedside table

Generate:

```text
4 legs
top
optional lower shelf
```

Procedural width/depth/height.

Keep it simple.

---

# 25. Wardrobe

Generate a solid procedural cabinet:

```text
body
two front door panels
small handles
base/feet
```

No functional opening required yet.

Dimensions editable.

---

# 26. Chair

Generate:

```text
4 legs
seat
backrest
```

The dimensions should derive from:

```text
width
depth
height
```

Chair proportions should remain sensible when resized.

For example:

seat height should scale within a constrained proportion rather than simply scaling every axis blindly.

---

# 27. Stool

Generate:

```text
seat
3 or 4 legs
optional foot brace
```

Simpler than Chair.

---

# 28. Bench

Generate:

```text
long seat
support legs
optional backrest parameter
```

Bench width should be highly procedural.

For example:

```text
1m
2m
3m
5m
```

should all work.

This is one object where resizing is particularly important.

---

# 29. Table

Generate:

```text
top
4 legs
optional support apron
```

Procedural:

```text
width
depth
height
```

Keep sensible leg inset.

Do not blindly put legs at exact outer corners.

---

# 30. Workbench

Use the Table system as a base but make it visibly heavier.

Generate:

```text
thick top
strong legs
cross braces
optional lower shelf
```

Do not add crafting gameplay yet.

---

# 31. Kitchen counter

This should be one of the most reusable procedural items.

Generate:

```text
cabinet body
worktop
base/plinth
front cabinet panels
```

Key dimensions:

```text
width
depth
height
```

Width should easily stretch along a kitchen wall.

---

# 32. Counter with sink

Reuse the exact same counter architecture.

Add:

```text
sink basin
simple faucet
```

The sink should resize/position sensibly relative to counter width.

Do NOT implement water simulation.

The sink basin may be a simple inset box/bowl shape.

---

# 33. Furnace / stove

Create a simple cozy stove/furnace.

Possible visual structure:

```text
solid stove body
front door/opening
small top
optional short chimney stub
```

Do NOT build full chimney routing yet.

Use:

```text
stone
dark metal
```

style depending on game aesthetics.

---

# 34. Cupboard

Generate:

```text
cabinet body
front doors
handles
optional internal shelf
```

No opening interaction yet.

Can share significant architecture with Wardrobe/Counter.

---

# 35. Chest

Generate:

```text
box body
slightly raised lid
simple metal/wood trim
optional handles
```

No opening animation required yet.

But create a logical hierarchy allowing later:

```text
hinge
lid open state
storage interaction
```

without replacing the model.

---

# 36. Barrel

Use procedural cylindrical geometry.

Generate:

```text
wooden barrel body
slightly bulged middle profile
top/bottom
2–4 bands
```

Do NOT use a straight cylinder if a simple bulging profile is easy.

Prefer a lathed/ring profile.

Allow:

```text
height
diameter
```

parameters.

---

# 37. Shelf

Generate:

```text
vertical supports
multiple horizontal shelves
```

Parameters:

```text
width
height
depth
shelfCount
```

`shelfCount` should derive safely from height or be editable.

Do not create impossible overlaps.

---

# 38. Bookcase

Reuse Shelf architecture with:

```text
back panel
side panels
top/bottom
multiple shelves
```

Do NOT fill with procedural books yet unless extremely trivial.

An empty bookcase is acceptable in this scope.

---

# 39. Fireplace / hearth

Generate a simple freestanding or wall-adjacent hearth.

Use:

```text
base
side pillars
top/lintel
fire cavity
```

Optionally simple emissive/fire visual if the project already has lightweight flame effects.

Do NOT implement smoke/chimney physics.

If adding fire:

make it cheap and compatible with graphics presets.

---

# 40. Lantern

Generate:

```text
base
small frame/cage
light core
top/handle
```

Use existing lighting system if possible.

Do not add one real-time shadow-casting light per distant lantern.

Integrate with graphics quality and light-budget system.

---

# 41. Torch

Preserve current Torch behavior.

Move it into the same:

```text
FurnitureCatalogue / PlaceableObjectCatalogue
```

architecture.

Do not retain a special parallel Torch placement code path unless absolutely necessary.

---

# 42. Procedural size rules

Do not simply scale entire furniture objects uniformly.

For every object, separate:

```text
structural dimensions
```

from:

```text
detail dimensions
```

Example:

If table width doubles:

```text
table top gets longer
leg thickness changes little
legs remain near ends
```

NOT:

```text
everything stretches horizontally including leg thickness
```

This is one of the major benefits of procedural furniture.

---

# 43. Minimum and maximum dimensions

Every catalogue definition should specify constraints.

Something like:

```ts
interface FurnitureDimensionRules {
  minWidth: number;
  maxWidth: number;

  minDepth: number;
  maxDepth: number;

  minHeight: number;
  maxHeight: number;

  defaultWidth: number;
  defaultDepth: number;
  defaultHeight: number;
}
```

The `E` modal uses these.

---

# 44. Furniture presets

For useful objects, optionally expose presets.

Examples:

### Bed

```text
Single
Double
Large
```

### Table

```text
Small
Dining
Large
```

### Counter

```text
1m
2m
3m
```

### Barrel

```text
Small
Standard
Large
```

Preset selection simply changes dimensions.

The underlying system remains procedural.

---

# 45. Recently used objects

Remember:

```text
last selected object
```

and optionally the last few recently used catalogue items.

Persist this as user preference, not world state.

Then slot 8 feels fast during building.

---

# 46. Per-type last settings

Remember the last dimensions used for each furniture type during the session.

Example:

```text
Bench = 2.5m wide
Counter = 3m wide
```

When returning to that item:

restore those settings.

Persist locally if convenient.

Do not put these placement presets into the world save.

---

# 47. Object naming

Placed objects should have logical type labels for targeting/debugging.

Examples:

```text
Chair
Table
Kitchen Counter
Chest
```

Do not use arbitrary mesh names as persistence IDs.

---

# 48. Stable object IDs

Use:

```ts
crypto.randomUUID()
```

for authored furniture objects.

These are player-authored persistent entities rather than deterministic procedural terrain.

---

# 49. Remove Mode

Existing:

```text
X = Remove Mode
```

must remove furniture.

Hovering over any generated part of a furniture object should highlight the entire logical object.

Example:

clicking a table leg in Remove Mode should target:

```text
Table
```

not:

```text
table-leg-3 mesh
```

Use object metadata to resolve:

```text
mesh
→ owning PlaceableObjectDefinition
```

---

# 50. Removal behaviour

Removing furniture must delete:

```text
logical object definition
render geometry
collision
lights if applicable
picking metadata
```

No orphan meshes/resources.

---

# 51. World save integration

Extend the World definition with something like:

```ts
placeableObjects: PlaceableObjectDefinition[];
```

or integrate with an existing authored-object collection.

Save:

```text
object ID
type
position
rotation
dimensions
parameters
material overrides
```

Do NOT save geometry.

---

# 52. Save/load exactness

After:

```text
place furniture
save
reload
```

the exact same:

```text
object type
dimensions
position
rotation
materials
variant
```

must regenerate.

---

# 53. Import/export worlds

Furniture must naturally be included in existing world export/import.

Do not create a separate furniture save file.

Update world schema/migrations.

Existing worlds with no furniture array should migrate to:

```text
placeableObjects: []
```

or equivalent.

---

# 54. Placement on upper floors

Furniture must work on:

```text
ground floor
first floor
second floor
etc.
```

Use the existing multi-surface world querying.

Do NOT assume Y = foundation top.

If placing on a slab at foundation-local Y=6m:

the furniture must rest at that level.

---

# 55. Place near walls

Furniture should be easy to place close to walls.

Do not make collision margins so conservative that:

```text
bed
wardrobe
counter
bookcase
```

cannot sit against a wall.

Allow a tiny configurable clearance.

---

# 56. Optional wall alignment helper

If easy, add a placement helper:

When furniture is very close to a wall and approximately aligned:

```text
soft snap rotation
```

to the wall direction.

Do NOT make this mandatory.

The player can still use `R`.

This is particularly useful for:

```text
counter
wardrobe
bookcase
bed
```

but it is optional for this scope.

---

# 57. Placement footprint display

While previewing large furniture:

show a subtle footprint/bounds indication on the floor.

Especially useful for:

```text
bed
table
counter
wardrobe
```

Invalid overlaps can show an invalid-state footprint.

Keep this subtle.

---

# 58. Object modal parameter controls

The modal should adapt to selected furniture.

Examples:

## Chair

```text
Width
Depth
Height
```

## Bench

```text
Width
Depth
Height
Backrest: On/Off
```

## Shelf

```text
Width
Height
Depth
Shelves: 2–8
```

## Barrel

```text
Diameter
Height
```

## Bed

```text
Width
Length
Height
Headboard: On/Off
```

Do not show irrelevant generic sliders for every object.

---

# 59. UI state example

When slot 8 is active:

```text
PLACE OBJECT

Kitchen Counter

Width: 2.00m
Depth: 0.60m
Height: 0.90m

E    Edit / Objects
R    Rotate
Click Place
```

When `E` opens:

```text
OBJECTS

Furniture
Lighting

[Chair] [Stool] [Bench]
[Table] [Workbench]
[Bed] [Wardrobe]
[Counter] [Sink Counter]
[Chest] [Barrel]
...

Selected:
Kitchen Counter

Width   [-] 2.00m [+]
Depth   [-] 0.60m [+]
Height  [-] 0.90m [+]

[ Done ]
```

---

# 60. Avoid one modal per furniture type

Do not create:

```text
BedModal
ChairModal
TableModal
...
```

Create one schema-driven Object Editor.

Each furniture catalogue entry describes editable parameters.

Conceptually:

```ts
interface PlaceableObjectCatalogueEntry {
  type: PlaceableObjectType;

  name: string;
  category: string;

  defaultDimensions: {...};

  editableParameters: ObjectParameterDefinition[];

  builder: FurnitureBuilder;
}
```

Then UI generates controls from the catalogue definition.

---

# 61. Builder contract

Define something like:

```ts
interface ProceduralObjectBuilder {
  build(
    definition: PlaceableObjectDefinition,
    context: ProceduralObjectBuildContext
  ): BuiltPlaceableObject;

  getMetrics(
    definition: PlaceableObjectDefinition
  ): FurnitureMetrics;
}
```

This provides a clean extension point for future placeable objects.

---

# 62. Built object contract

Something like:

```ts
interface BuiltPlaceableObject {
  object: THREE.Object3D;

  bounds: THREE.Box3;

  collision: ObjectCollisionDefinition[];

  dispose(): void;
}
```

Avoid leaking resources when rebuilding previews.

---

# 63. Preview lifecycle

Changing a slider in the `E` modal:

```text
Width 2m → 3m
```

should rebuild only the ghost preview.

Do not mutate an already placed furniture item accidentally.

When placement is confirmed:

create authoritative state and permanent runtime object.

---

# 64. Geometry disposal

Repeatedly:

```text
E
change size
change object
change size
```

must not leak geometries/materials.

Dispose transient preview resources correctly.

Reuse shared materials where appropriate.

---

# 65. Shadow optimization

Furniture nearby can:

```text
castShadow
receiveShadow
```

at HIGH/ULTRA.

But not every tiny object needs dynamic shadows at long distance.

Use the existing graphics preset rules.

Lantern/torch lights should also respect:

```text
max dynamic lights
distance
graphics quality
```

---

# 66. Static optimization

Placed furniture is static.

Where appropriate:

```ts
matrixAutoUpdate = false;
```

after placement.

Do not run per-frame updates for furniture with no animation.

---

# 67. Object count

A player may eventually place hundreds or thousands of pieces.

Do not give every furniture item expensive update code.

Idle furniture should have effectively zero CPU update cost.

---

# 68. Furniture rendering granularity

For v1 it is acceptable for each furniture object to be one or a small number of meshes.

Where possible:

merge procedural parts into one geometry per material slot.

For example:

```text
Chair:
wood geometry
```

rather than:

```text
seat Mesh
back Mesh
leg Mesh
leg Mesh
leg Mesh
leg Mesh
```

if merging is straightforward.

Maintain logical object identity separately.

---

# 69. Do NOT implement functional gameplay yet

For this scope:

```text
Bed
```

does not need sleeping.

```text
Chest
```

does not need inventory.

```text
Chair
```

does not need sitting.

```text
Sink
```

does not need water.

```text
Workbench
```

does not need crafting.

```text
Furnace
```

does not need cooking.

This task is:

```text
procedural generation
placement
collision
materials
save/load
```

Interaction gameplay can come later.

---

# 70. Future interaction readiness

However, make logical type identity clean enough that later:

```text
E on chair
→ Sit

E on bed
→ Sleep

E on chest
→ Open

E on furnace
→ Cook
```

can be added without redesigning persistence.

Do not implement these interactions yet.

---

# 71. Future furniture styles

We will later want style variants such as:

```text
rustic
modern
fantasy
dwarven
alien
mushroom
wood
stone
metal
```

For now:

implement one robust simple style per furniture type.

But build procedural geometry so later a:

```ts
styleId
```

can choose different procedural recipes.

Do not make the first geometry style inseparable from the object type.

---

# 72. Visual target

Furniture should look intentionally simple but coherent.

Aim for:

```text
clean stylized 3D
slightly chunky
readable silhouettes
real dimensional depth
good shadows
compatible with procedural materials
```

Avoid:

```text
placeholder cubes with labels
```

but also avoid trying to make photoreal furniture.

---

# 73. Testing — catalogue

Add unit tests ensuring every registered catalogue item:

```text
has unique type
has builder
has valid dimensions
has valid editable parameters
can produce finite geometry
```

---

# 74. Geometry tests

For each furniture type:

ensure generated:

```text
positions are finite
indices valid
bounding box finite
dimensions approximately match definition
```

Test at:

```text
minimum dimensions
default dimensions
maximum reasonable dimensions
```

---

# 75. Procedural resizing tests

At minimum:

## Bench

Doubling width:

```text
top becomes longer
leg thickness remains sensible
legs relocate toward ends
```

## Table

Increasing width does not stretch leg thickness.

## Counter

Increasing width extends cabinet/worktop cleanly.

## Shelf

Increasing height changes spacing/structure correctly.

## Barrel

Changing diameter/height keeps a valid curved profile.

## Bed

Changing width/length maintains sensible frame/mattress proportions.

---

# 76. Placement tests

Test:

```text
foundation top
upper floor
terrain
near wall
rotation 0/90/180/270
invalid overlap
unsupported position
```

---

# 77. Save round-trip tests

Create multiple furniture items:

```text
Bed
Chair
Counter
Barrel
Chest
Lantern
```

then:

```text
serialize
reload
```

and verify exact:

```text
type
position
rotation
dimensions
parameters
materials
```

---

# 78. Remove Mode tests

Target:

```text
table leg
```

and verify logical target resolves to:

```text
Table
```

Removing it removes:

```text
geometry
collision
state
```

---

# 79. UI tests

Playwright:

1. press/select hotbar slot 8
2. Place Object mode activates
3. press `E`
4. object modal opens
5. choose Bed
6. change dimensions
7. close modal
8. preview updates
9. rotate with `R`
10. place object
11. reopen `E`
12. choose Counter
13. place second object
14. save/reload
15. both remain
16. remove one with X
17. no uncaught browser errors

---

# 80. Acceptance criteria

I should be able to:

1. press `8`
2. enter Place Object mode
3. press `E`
4. see a furniture/object catalogue
5. select Chair
6. place a procedural chair
7. select Table
8. resize it
9. see its geometry regenerate correctly
10. rotate with `R`
11. place it on a floor
12. place furniture on upper floors
13. place Bed
14. place Wardrobe
15. place Bench
16. place Stool
17. place Workbench
18. place Kitchen Counter
19. resize Counter width
20. place Sink Counter
21. place Furnace
22. place Cupboard
23. place Chest
24. place Barrel
25. place Shelf
26. change shelf count
27. place Bookcase
28. place Fireplace
29. place Lantern
30. continue placing existing Torch
31. see objects collide appropriately with player
32. remove them using existing Remove Mode
33. save/reload and retain them
34. export/import world and retain them
35. maintain good FPS with many objects

---

# Most important architectural rule

Do NOT make this:

```text
Furniture menu
→ list of static 3D assets
```

Make:

```text
FurnitureCatalogue
        ↓
PlaceableObjectDefinition
        ↓
procedural dimensions / parameters
        ↓
ProceduralFurnitureBuilder
        ↓
Three.js geometry
```

Just as the existing procedural windows and doors fit arbitrary openings, furniture should be generated to fit its authored dimensions.

---

# Most important procedural rule

Furniture dimensions must change the **construction**, not merely stretch a finished mesh.

For example:

```text
3m table
```

should mean:

```text
longer tabletop
legs remain sensibly proportioned
legs move outward
support frame adjusts
```

not:

```text
1m table mesh scaled X ×3
```

Use true procedural geometry.

---

# Most important UX rule

Preserve:

```text
8
= Place Object

E
= Objects / Edit modal

R
= Rotate

Left Click
= Place
```

The player should be able to furnish a whole house without switching through many hotbar tools.

---

# Final implementation

Before coding, inspect the existing:

```text
hotbar slot 8
torch placement code
input manager
placement preview
WorldSurfaceSampler
building level system
collision system
Remove Mode
material system
world persistence
graphics/light system
```

Refactor the existing Torch functionality into the new generic object-placement architecture rather than bolting furniture on beside it.

Run:

```bash
npm run check
npm run lint
npm run test
```

plus configured Playwright tests.

Manually test every furniture type at several dimensions.

Also test:

```text
50 objects
100 objects
500 objects
```

and inspect:

```text
draw calls
triangle count
memory
placement responsiveness
FPS
```

Fix:

```text
geometry leaks
preview leaks
bad resizing
incorrect Y placement
upper-floor placement
rotation issues
collision bugs
remove targeting
save/load failures
browser-console errors
```

before finishing.

When complete, report:

```text
Place Object architecture
slot-8 changes
E-modal architecture
FurnitureCatalogue
procedural builder system
shared procedural primitives
all furniture implemented
placement/snapping rules
collision strategy
material integration
save/load changes
Remove Mode integration
performance measurements
tests added
```

The first goal is not dozens of furniture styles. It is a **small, extremely reusable procedural furniture framework** where adding a new furniture family later becomes inexpensive.