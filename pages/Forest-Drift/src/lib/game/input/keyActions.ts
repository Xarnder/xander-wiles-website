/**
 * Every keyboard control in Forest Drift, listed once.
 *
 * Each action has a stable id (used in saved profiles and downloaded files, so never rename one),
 * a label for the Controls screen, its default keys, and the situations ("contexts") where it can
 * fire. Two actions only conflict when they share a key **and** their contexts can be live at the
 * same time (`contextsOverlap`). That is why B can mean "snap" in the Wall tool and "palette" in
 * Paint Mode without being reported.
 *
 * Mouse buttons and the wheel are not here: they stay fixed this round (plan, Q1). Dialog keys
 * (Enter/Space to confirm, Tab focus, Home/End in tab lists) aren't game controls (plan, Q6).
 */
import type { Binding } from './keyCodes';

// ------------------------------------------------------------------ contexts

/** The player's movement state. Only one is live at a time. */
export const STATE_CONTEXTS = ['onFoot', 'flying', 'riding', 'resting'] as const;

/** Build-side tools, one per tool family. Only one is live at a time. */
export const TOOL_CONTEXTS = [
	'tool:foundation',
	'tool:wall',
	'tool:cornerWall',
	'tool:opening',
	'tool:barrier',
	'tool:skirting',
	'tool:slab',
	'tool:roof',
	'tool:stairs',
	'tool:floorDetail',
	'tool:furniture',
	'tool:placeObject',
	'tool:shovel'
] as const;

/** Global editing modes. Each replaces the hotbar's normal handling while it's on. */
export const MODE_CONTEXTS = ['mode:move', 'mode:paint', 'mode:remove', 'mode:music'] as const;

export type StateContext = (typeof STATE_CONTEXTS)[number];
export type ToolContext = (typeof TOOL_CONTEXTS)[number];
export type ModeContext = (typeof MODE_CONTEXTS)[number];

/**
 * - `global`: any time in a world (not inside the Mini Build editor).
 * - States: walking, flying, riding a creature, or resting at a seat or bed.
 * - `build`: Build Mode is on and no global mode is.
 * - Tools: Build Mode with that tool selected (so a tool is also inside `build`).
 * - Modes: Move, Paint, Remove or Compose (music) Mode.
 * - `miniBuildEditor`: the full-screen Mini Build editor, which swallows every other key.
 */
export type KeyContext =
	'global' | StateContext | 'build' | ToolContext | ModeContext | 'miniBuildEditor';

export const ALL_CONTEXTS: readonly KeyContext[] = [
	'global',
	...STATE_CONTEXTS,
	'build',
	...TOOL_CONTEXTS,
	...MODE_CONTEXTS,
	'miniBuildEditor'
];

const isState = (c: KeyContext): c is StateContext =>
	(STATE_CONTEXTS as readonly string[]).includes(c);
const isTool = (c: KeyContext): c is ToolContext => c.startsWith('tool:');
const isEditing = (c: KeyContext) => c === 'build' || isTool(c) || c.startsWith('mode:');

/**
 * Can these two contexts be live at the same moment?
 *
 * - The Mini Build editor overlaps nothing else (it stops every key reaching the world).
 * - `global` overlaps everything in a world.
 * - Movement states rule each other out; so do tools and modes.
 * - A tool is part of Build Mode, so every tool overlaps `build`. Modes replace Build Mode's
 *   hotbar handling, so they don't.
 * - Walking, flying and riding overlap every tool and mode (you build on the move). Resting
 *   doesn't: sitting blocks building, and any build key gets you up first.
 */
export function contextsOverlap(a: KeyContext, b: KeyContext): boolean {
	if (a === b) return true;
	if (a === 'miniBuildEditor' || b === 'miniBuildEditor') return false;
	if (a === 'global' || b === 'global') return true;
	if (isState(a) && isState(b)) return false;
	if (isState(a) || isState(b)) {
		const state = isState(a) ? a : (b as StateContext);
		const other = state === a ? b : a;
		return isEditing(other) && state !== 'resting';
	}
	// Both are editing contexts.
	if (a === 'build') return isTool(b);
	if (b === 'build') return isTool(a);
	return false;
}

/** Do any of the first list's contexts overlap any of the second's? */
export function anyContextsOverlap(a: readonly KeyContext[], b: readonly KeyContext[]): boolean {
	return a.some((left) => b.some((right) => contextsOverlap(left, right)));
}

// ------------------------------------------------------------------ categories

export const KEY_CATEGORIES = [
	{ id: 'movement', title: 'Movement & camera' },
	{ id: 'interaction', title: 'Interaction' },
	{ id: 'flight', title: 'Flight' },
	{ id: 'building', title: 'Building' },
	{ id: 'buildTools', title: 'Build tools' },
	{ id: 'music', title: 'Music garden' },
	{ id: 'miniBuildEditor', title: 'Mini Build editor' },
	{ id: 'interface', title: 'Interface' }
] as const;

export type KeyCategoryId = (typeof KEY_CATEGORIES)[number]['id'];

// ------------------------------------------------------------------ actions

export interface KeyActionDef {
	/** Stable id, saved in profiles and files. Never rename one. */
	readonly id: string;
	readonly label: string;
	readonly description?: string;
	readonly category: KeyCategoryId;
	readonly contexts: readonly KeyContext[];
	/** Primary and secondary defaults. */
	readonly defaults: readonly [Binding | null, Binding | null];
	/**
	 * `press` fires once on keydown. `hold` is read every frame while the key is down and ignores
	 * modifiers (holding Shift to run doesn't stop W from working).
	 */
	readonly kind: 'press' | 'hold';
	/** Can't be rebound (Esc). Overrides for it are ignored. */
	readonly locked?: boolean;
	/**
	 * Actions this one may share a key with, on purpose. The game decides between them (the tool
	 * takes the key first) or they are meant to happen together (Shift runs and removes whole
	 * pieces). Either side may list the other.
	 */
	readonly sharesKeyWith?: readonly string[];
	/**
	 * Normally an extra Shift is allowed (it's the Run key, and it means "reverse" or "finer" for
	 * some actions). With this set, Shift must match the binding exactly.
	 */
	readonly exactShift?: boolean;
}

type ActionInput<Id extends string> = Omit<KeyActionDef, 'id' | 'defaults' | 'kind'> & {
	id: Id;
	keys: readonly Binding[];
	kind?: 'press' | 'hold';
};

/** Keeps each id as a literal type, so `matches(event, 'move.forwrd')` fails to compile. */
function action<const Id extends string>(input: ActionInput<Id>): KeyActionDef & { id: Id } {
	const { keys, kind = 'press', ...rest } = input;
	if (keys.length > 2) throw new Error(`${input.id}: at most two default keys`);
	return { ...rest, kind, defaults: [keys[0] ?? null, keys[1] ?? null] };
}

const key = (code: string, modifiers: Omit<Binding, 'code'> = {}): Binding => ({
	code,
	...modifiers
});

/** States where the player is in control and can build. */
const MOVING: readonly KeyContext[] = ['onFoot', 'flying', 'riding'];
/** Build Mode and the modes the hotbar keys still reach (they leave the mode). */
const BUILD_AND_EDIT_MODES: readonly KeyContext[] = [
	'build',
	'mode:move',
	'mode:paint',
	'mode:remove'
];

const HOTBAR_SLOTS = [
	'Foundation',
	'Walls',
	'Openings',
	'Slabs',
	'Stairs',
	'Floor detailing',
	'Shovel',
	'Place Object'
] as const;

function hotbarSlot<const N extends 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8>(n: N) {
	return action({
		id: `build.slot${n}`,
		label: `Hotbar slot ${n}: ${HOTBAR_SLOTS[n - 1]}`,
		category: 'building',
		contexts: BUILD_AND_EDIT_MODES,
		keys: [key(`Digit${n}`)]
	});
}

const INSTRUMENTS = ['Flower', 'Mushroom', 'Fern', 'Reed', 'Crystal'] as const;

function instrument<const N extends 1 | 2 | 3 | 4 | 5>(n: N) {
	return action({
		id: `music.instrument${n}`,
		label: `Instrument ${n}: ${INSTRUMENTS[n - 1]}`,
		category: 'music',
		contexts: ['mode:music'],
		keys: [key(`Digit${n}`)]
	});
}

function blockMaterial<const N extends 1 | 2 | 3 | 4>(n: N) {
	return action({
		id: `miniBuild.material${n}`,
		label: `Block material ${n}`,
		category: 'miniBuildEditor',
		contexts: ['miniBuildEditor'],
		keys: [key(`Digit${n}`)]
	});
}

const SNAP_TOOLS: readonly KeyContext[] = [
	'tool:wall',
	'tool:cornerWall',
	'tool:opening',
	'tool:barrier',
	'tool:skirting',
	'tool:slab',
	'tool:roof'
];

export const KEY_ACTIONS = [
	// -------------------------------------------------------------- movement & camera
	action({
		id: 'move.forward',
		label: 'Move forward',
		description: 'Walk, steer a creature, or fly where you look. Also gets you up from a seat.',
		category: 'movement',
		contexts: [...MOVING, 'resting'],
		kind: 'hold',
		keys: [key('KeyW')]
	}),
	action({
		id: 'move.back',
		label: 'Move back',
		category: 'movement',
		contexts: [...MOVING, 'resting'],
		kind: 'hold',
		keys: [key('KeyS')]
	}),
	action({
		id: 'move.left',
		label: 'Move left',
		category: 'movement',
		contexts: [...MOVING, 'resting'],
		kind: 'hold',
		keys: [key('KeyA')]
	}),
	action({
		id: 'move.right',
		label: 'Move right',
		category: 'movement',
		contexts: [...MOVING, 'resting'],
		kind: 'hold',
		keys: [key('KeyD')]
	}),
	action({
		id: 'move.run',
		label: 'Run',
		description: 'Hold to run. Makes a creature sprint while riding.',
		category: 'movement',
		contexts: ['onFoot', 'riding'],
		kind: 'hold',
		keys: [key('Shift')]
	}),
	action({
		id: 'move.jump',
		label: 'Jump',
		description: 'Jump, or make a ridden creature jump. Also gets you up from a seat.',
		category: 'movement',
		contexts: ['onFoot', 'riding', 'resting'],
		kind: 'hold',
		keys: [key('Space')]
	}),
	action({
		id: 'camera.zoom',
		label: 'Zoom (hold)',
		category: 'movement',
		contexts: MOVING,
		kind: 'hold',
		keys: [key('KeyC')]
	}),
	action({
		id: 'camera.toggleView',
		label: 'First / third person',
		description: 'Switch between first-person and the above-head third-person camera.',
		category: 'movement',
		contexts: MOVING,
		keys: [key('F5')]
	}),
	action({
		id: 'camera.restingView',
		label: 'Resting view',
		description: 'While sitting or lying: switch between first- and third-person views.',
		category: 'movement',
		contexts: ['resting'],
		keys: [key('KeyV')]
	}),

	// -------------------------------------------------------------- interaction
	action({
		id: 'interact.use',
		label: 'Use',
		description:
			'Open or close a door, sit or lie down, pick up or put down a small creature, ride a two-legged creature or get off.',
		category: 'interaction',
		contexts: [...MOVING, 'resting'],
		keys: [key('KeyK')]
	}),
	action({
		id: 'multiplayer.stopTracking',
		label: 'Stop following a player',
		description: 'Online: stop the camera tracking another player.',
		category: 'interaction',
		contexts: ['global'],
		keys: [key('KeyU')]
	}),

	// -------------------------------------------------------------- flight
	action({
		id: 'flight.toggle',
		label: 'Toggle flight',
		description: 'Where flying is allowed. The mouse wheel changes fly speed.',
		category: 'flight',
		contexts: ['onFoot', 'flying'],
		keys: [key('KeyF')],
		sharesKeyWith: ['placeObject.edit']
	}),
	action({
		id: 'flight.up',
		label: 'Fly up',
		category: 'flight',
		contexts: ['flying'],
		kind: 'hold',
		keys: [key('Space')]
	}),
	action({
		id: 'flight.down',
		label: 'Fly down',
		category: 'flight',
		contexts: ['flying'],
		kind: 'hold',
		keys: [key('Shift')]
	}),

	// -------------------------------------------------------------- building
	action({
		id: 'build.toggle',
		label: 'Build Mode',
		description: 'Show or hide the building hotbar. Your selected tool is remembered.',
		category: 'building',
		contexts: MOVING,
		keys: [key('KeyG')]
	}),
	hotbarSlot(1),
	hotbarSlot(2),
	hotbarSlot(3),
	hotbarSlot(4),
	hotbarSlot(5),
	hotbarSlot(6),
	hotbarSlot(7),
	hotbarSlot(8),
	action({
		id: 'build.slotPrevious',
		label: 'Previous tool in slot',
		category: 'building',
		contexts: ['build'],
		keys: [key('ArrowUp')]
	}),
	action({
		id: 'build.slotNext',
		label: 'Next tool in slot',
		category: 'building',
		contexts: ['build'],
		keys: [key('ArrowDown')]
	}),
	action({
		id: 'build.customise',
		label: 'Customise / adjust',
		description:
			'Customise the next piece, set placement height, or open the Object Library, depending on the tool.',
		category: 'building',
		contexts: ['build', 'mode:move'],
		keys: [key('KeyE')]
	}),
	action({
		id: 'build.moveMode',
		label: 'Move Mode',
		description: 'Click an object to pick it up, click again to place it.',
		category: 'building',
		contexts: MOVING,
		keys: [key('KeyM')]
	}),
	action({
		id: 'build.paintMode',
		label: 'Paint Mode',
		category: 'building',
		contexts: BUILD_AND_EDIT_MODES,
		keys: [key('KeyP')]
	}),
	action({
		id: 'build.removeMode',
		label: 'Remove Mode',
		category: 'building',
		contexts: [...BUILD_AND_EDIT_MODES, 'mode:music'],
		keys: [key('KeyX'), key('Digit9')]
	}),
	action({
		id: 'build.musicMode',
		label: 'Compose Mode (music garden)',
		category: 'building',
		contexts: MOVING,
		keys: [key('KeyN')]
	}),
	action({
		id: 'build.undo',
		label: 'Undo',
		description: 'Undo the last building change or shovel stroke.',
		category: 'building',
		contexts: MOVING,
		keys: [key('Minus'), key('NumpadSubtract')]
	}),
	action({
		id: 'build.redo',
		label: 'Redo',
		category: 'building',
		contexts: MOVING,
		keys: [key('Equal'), key('NumpadAdd')]
	}),
	action({
		id: 'build.levelUp',
		label: 'Floor level up',
		category: 'building',
		contexts: MOVING,
		keys: [key('BracketRight'), key('PageUp')]
	}),
	action({
		id: 'build.levelDown',
		label: 'Floor level down',
		category: 'building',
		contexts: MOVING,
		keys: [key('BracketLeft'), key('PageDown')]
	}),
	action({
		id: 'remove.deleteFoundation',
		label: 'Delete foundation',
		description: 'Remove Mode: start deleting the foundation under the crosshair (asks first).',
		category: 'building',
		contexts: ['mode:remove'],
		keys: [key('Delete'), key('Backspace')]
	}),
	action({
		id: 'remove.whole',
		label: 'Remove whole piece (hold)',
		description: 'Remove Mode: hold to remove a whole fence or run instead of one segment.',
		category: 'building',
		contexts: ['mode:remove'],
		kind: 'hold',
		keys: [key('Shift')],
		sharesKeyWith: ['move.run', 'flight.down']
	}),

	// -------------------------------------------------------------- build tools
	action({
		id: 'tool.snap',
		label: 'Change snapping',
		description:
			'Walls, openings, fences, skirting, slabs and roofs: cycle the snap mode. Roof: switch to a drawn outline, then snap to wall corners.',
		category: 'buildTools',
		contexts: SNAP_TOOLS,
		keys: [key('KeyB')]
	}),
	action({
		id: 'tool.rotate',
		label: 'Rotate',
		description: 'Furniture, Place Object, Move and roofs. Hold Shift to turn the other way.',
		category: 'buildTools',
		contexts: ['tool:furniture', 'tool:placeObject', 'tool:roof', 'mode:move'],
		keys: [key('KeyR')]
	}),
	action({
		id: 'tool.rotationStep',
		label: 'Rotation snap step',
		description: 'Place Object and Move. Hold Shift to step back.',
		category: 'buildTools',
		contexts: ['tool:placeObject', 'mode:move'],
		keys: [key('KeyT')]
	}),
	action({
		id: 'tool.finish',
		label: 'Finish shape',
		description: 'Corner walls, fences and skirting: finish the run. Stairs: confirm.',
		category: 'buildTools',
		contexts: ['tool:cornerWall', 'tool:barrier', 'tool:skirting', 'tool:stairs'],
		keys: [key('Enter')]
	}),
	action({
		id: 'tool.undoPoint',
		label: 'Remove last point',
		category: 'buildTools',
		contexts: ['tool:cornerWall', 'tool:barrier', 'tool:skirting', 'tool:slab', 'tool:roof'],
		keys: [key('Backspace')]
	}),
	action({
		id: 'opening.beamOrientation',
		label: 'Beam: vertical / horizontal',
		category: 'buildTools',
		contexts: ['tool:opening'],
		keys: [key('KeyR')]
	}),
	action({
		id: 'barrier.restyle',
		label: 'Fence: apply your settings',
		description: 'Apply your current fence settings to the aimed fence.',
		category: 'buildTools',
		contexts: ['tool:barrier'],
		keys: [key('KeyR')]
	}),
	action({
		id: 'barrier.copyStyle',
		label: 'Fence: copy style',
		description: 'Copy the aimed fence’s style into your settings.',
		category: 'buildTools',
		contexts: ['tool:barrier'],
		keys: [key('KeyQ')]
	}),
	action({
		id: 'skirting.offsetMode',
		label: 'Skirting: offset mode',
		description: 'Switch between automatic and manual offset from the wall.',
		category: 'buildTools',
		contexts: ['tool:skirting'],
		keys: [key('KeyO')]
	}),
	action({
		id: 'floorDetail.cycle',
		label: 'Floor detail: cycle style',
		description: 'Plank direction, tile pattern or path framing.',
		category: 'buildTools',
		contexts: ['tool:floorDetail'],
		keys: [key('KeyR')]
	}),
	action({
		id: 'floorDetail.pathMode',
		label: 'Path: drawing mode',
		description: 'Cycle Axis, Free and Bezier drawing.',
		category: 'buildTools',
		contexts: ['tool:floorDetail'],
		keys: [key('KeyB')]
	}),
	action({
		id: 'roof.type',
		label: 'Roof: type',
		description: 'While shaping a roof: cycle the roof type.',
		category: 'buildTools',
		contexts: ['tool:roof'],
		keys: [key('KeyV')]
	}),
	action({
		id: 'roof.footprint',
		label: 'Roof: rectangle / outline',
		description: 'Switch between a rectangle and a drawn outline.',
		category: 'buildTools',
		contexts: ['tool:roof'],
		keys: [key('KeyE')],
		sharesKeyWith: ['build.customise']
	}),
	action({
		id: 'roof.riseUp',
		label: 'Roof: raise rise',
		description: 'While shaping a roof. Hold Shift for finer steps.',
		category: 'buildTools',
		contexts: ['tool:roof'],
		keys: [key('ArrowUp')],
		sharesKeyWith: ['build.slotPrevious']
	}),
	action({
		id: 'roof.riseDown',
		label: 'Roof: lower rise',
		description: 'While shaping a roof. Hold Shift for finer steps.',
		category: 'buildTools',
		contexts: ['tool:roof'],
		keys: [key('ArrowDown')],
		sharesKeyWith: ['build.slotNext']
	}),
	action({
		id: 'stairs.turnLeft',
		label: 'Stairs: turn left',
		category: 'buildTools',
		contexts: ['tool:stairs'],
		keys: [key('ArrowLeft')]
	}),
	action({
		id: 'stairs.turnRight',
		label: 'Stairs: turn right',
		category: 'buildTools',
		contexts: ['tool:stairs'],
		keys: [key('ArrowRight')]
	}),
	action({
		id: 'placeObject.copy',
		label: 'Place Object: copy aimed object',
		category: 'buildTools',
		contexts: ['tool:placeObject'],
		keys: [key('KeyB')]
	}),
	action({
		id: 'placeObject.edit',
		label: 'Place Object: edit aimed object',
		category: 'buildTools',
		contexts: ['tool:placeObject'],
		keys: [key('KeyF')],
		sharesKeyWith: ['flight.toggle']
	}),
	action({
		id: 'placeObject.recentPrevious',
		label: 'Place Object: previous recent',
		category: 'buildTools',
		contexts: ['tool:placeObject'],
		keys: [key('ArrowUp')],
		sharesKeyWith: ['build.slotPrevious']
	}),
	action({
		id: 'placeObject.recentNext',
		label: 'Place Object: next recent',
		category: 'buildTools',
		contexts: ['tool:placeObject'],
		keys: [key('ArrowDown')],
		sharesKeyWith: ['build.slotNext']
	}),
	action({
		id: 'paint.palette',
		label: 'Paint: colour palette',
		category: 'buildTools',
		contexts: ['mode:paint'],
		keys: [key('KeyB')]
	}),

	// -------------------------------------------------------------- music garden
	instrument(1),
	instrument(2),
	instrument(3),
	instrument(4),
	instrument(5),
	action({
		id: 'music.instrumentPrevious',
		label: 'Previous instrument',
		category: 'music',
		contexts: ['mode:music'],
		keys: [key('KeyQ')]
	}),
	action({
		id: 'music.instrumentNext',
		label: 'Next instrument',
		category: 'music',
		contexts: ['mode:music'],
		keys: [key('KeyE')]
	}),
	action({
		id: 'music.pitchUp',
		label: 'Pitch up',
		category: 'music',
		contexts: ['mode:music'],
		keys: [key('ArrowUp')]
	}),
	action({
		id: 'music.pitchDown',
		label: 'Pitch down',
		category: 'music',
		contexts: ['mode:music'],
		keys: [key('ArrowDown')]
	}),
	action({
		id: 'music.volumeDown',
		label: 'Volume down',
		description: 'The plant becomes paler.',
		category: 'music',
		contexts: ['mode:music'],
		keys: [key('ArrowLeft')]
	}),
	action({
		id: 'music.volumeUp',
		label: 'Volume up',
		description: 'The plant becomes more vivid.',
		category: 'music',
		contexts: ['mode:music'],
		keys: [key('ArrowRight')]
	}),
	action({
		id: 'music.shorter',
		label: 'Shorter note',
		category: 'music',
		contexts: ['mode:music'],
		keys: [key('Comma')]
	}),
	action({
		id: 'music.longer',
		label: 'Longer note',
		category: 'music',
		contexts: ['mode:music'],
		keys: [key('Period')]
	}),
	action({
		id: 'music.playLoop',
		label: 'Play / pause Music Tree loop',
		category: 'music',
		contexts: ['mode:music'],
		keys: [key('KeyJ')]
	}),

	// -------------------------------------------------------------- Mini Build editor
	action({
		id: 'miniBuild.save',
		label: 'Save design',
		category: 'miniBuildEditor',
		contexts: ['miniBuildEditor'],
		keys: [key('KeyS', { mod: true })]
	}),
	action({
		id: 'miniBuild.undo',
		label: 'Undo',
		category: 'miniBuildEditor',
		contexts: ['miniBuildEditor'],
		keys: [key('KeyZ', { mod: true })]
	}),
	action({
		id: 'miniBuild.redo',
		label: 'Redo',
		category: 'miniBuildEditor',
		contexts: ['miniBuildEditor'],
		keys: [key('KeyY', { mod: true }), key('KeyZ', { mod: true, shift: true })]
	}),
	action({
		id: 'miniBuild.duplicate',
		label: 'Duplicate block',
		category: 'miniBuildEditor',
		contexts: ['miniBuildEditor'],
		keys: [key('KeyD', { mod: true })]
	}),
	action({
		id: 'miniBuild.addBlock',
		label: 'Add block',
		category: 'miniBuildEditor',
		contexts: ['miniBuildEditor'],
		keys: [key('KeyN')]
	}),
	action({
		id: 'miniBuild.delete',
		label: 'Delete block',
		category: 'miniBuildEditor',
		contexts: ['miniBuildEditor'],
		keys: [key('Delete'), key('Backspace')]
	}),
	action({
		id: 'miniBuild.moveXMinus',
		label: 'Move block left (−X)',
		category: 'miniBuildEditor',
		contexts: ['miniBuildEditor'],
		keys: [key('ArrowLeft')]
	}),
	action({
		id: 'miniBuild.moveXPlus',
		label: 'Move block right (+X)',
		category: 'miniBuildEditor',
		contexts: ['miniBuildEditor'],
		keys: [key('ArrowRight')]
	}),
	action({
		id: 'miniBuild.moveZMinus',
		label: 'Move block back (−Z)',
		category: 'miniBuildEditor',
		contexts: ['miniBuildEditor'],
		keys: [key('ArrowUp')]
	}),
	action({
		id: 'miniBuild.moveZPlus',
		label: 'Move block forward (+Z)',
		category: 'miniBuildEditor',
		contexts: ['miniBuildEditor'],
		keys: [key('ArrowDown')]
	}),
	action({
		id: 'miniBuild.moveYPlus',
		label: 'Move block up (+Y)',
		category: 'miniBuildEditor',
		contexts: ['miniBuildEditor'],
		keys: [key('KeyE'), key('PageUp')]
	}),
	action({
		id: 'miniBuild.moveYMinus',
		label: 'Move block down (−Y)',
		category: 'miniBuildEditor',
		contexts: ['miniBuildEditor'],
		keys: [key('KeyQ'), key('PageDown')]
	}),
	action({
		id: 'miniBuild.resizeXMinus',
		label: 'Shrink block (X)',
		category: 'miniBuildEditor',
		contexts: ['miniBuildEditor'],
		keys: [key('ArrowLeft', { shift: true })]
	}),
	action({
		id: 'miniBuild.resizeXPlus',
		label: 'Grow block (X)',
		category: 'miniBuildEditor',
		contexts: ['miniBuildEditor'],
		keys: [key('ArrowRight', { shift: true })]
	}),
	action({
		id: 'miniBuild.resizeZMinus',
		label: 'Shrink block (Z)',
		category: 'miniBuildEditor',
		contexts: ['miniBuildEditor'],
		keys: [key('ArrowUp', { shift: true })]
	}),
	action({
		id: 'miniBuild.resizeZPlus',
		label: 'Grow block (Z)',
		category: 'miniBuildEditor',
		contexts: ['miniBuildEditor'],
		keys: [key('ArrowDown', { shift: true })]
	}),
	action({
		id: 'miniBuild.resizeYPlus',
		label: 'Grow block (Y)',
		category: 'miniBuildEditor',
		contexts: ['miniBuildEditor'],
		keys: [key('KeyE', { shift: true }), key('PageUp', { shift: true })]
	}),
	action({
		id: 'miniBuild.resizeYMinus',
		label: 'Shrink block (Y)',
		category: 'miniBuildEditor',
		contexts: ['miniBuildEditor'],
		keys: [key('KeyQ', { shift: true }), key('PageDown', { shift: true })]
	}),
	action({
		id: 'miniBuild.rotateY',
		label: 'Rotate block (Y)',
		category: 'miniBuildEditor',
		contexts: ['miniBuildEditor'],
		keys: [key('KeyR')]
	}),
	action({
		id: 'miniBuild.rotateX',
		label: 'Rotate block (X)',
		category: 'miniBuildEditor',
		contexts: ['miniBuildEditor'],
		keys: [key('KeyR', { shift: true })]
	}),
	action({
		id: 'miniBuild.rotateZ',
		label: 'Rotate block (Z)',
		category: 'miniBuildEditor',
		contexts: ['miniBuildEditor'],
		keys: [key('KeyR', { alt: true })]
	}),
	action({
		id: 'miniBuild.rotationStep',
		label: 'Rotation snap step',
		description: 'Hold Shift to step back.',
		category: 'miniBuildEditor',
		contexts: ['miniBuildEditor'],
		keys: [key('KeyT')]
	}),
	action({
		id: 'miniBuild.mirror',
		label: 'Mirror duplicate (X)',
		category: 'miniBuildEditor',
		contexts: ['miniBuildEditor'],
		keys: [key('KeyM')]
	}),
	action({
		id: 'miniBuild.frame',
		label: 'Frame the design',
		category: 'miniBuildEditor',
		contexts: ['miniBuildEditor'],
		keys: [key('KeyF')]
	}),
	action({
		id: 'miniBuild.selectNext',
		label: 'Select next block',
		category: 'miniBuildEditor',
		contexts: ['miniBuildEditor'],
		keys: [key('Tab')]
	}),
	action({
		id: 'miniBuild.selectPrevious',
		label: 'Select previous block',
		category: 'miniBuildEditor',
		contexts: ['miniBuildEditor'],
		keys: [key('Tab', { shift: true })]
	}),
	blockMaterial(1),
	blockMaterial(2),
	blockMaterial(3),
	blockMaterial(4),
	action({
		id: 'miniBuild.help',
		label: 'Show / hide editor help',
		category: 'miniBuildEditor',
		contexts: ['miniBuildEditor'],
		keys: [key('Slash')]
	}),

	// -------------------------------------------------------------- interface
	action({
		id: 'ui.help',
		label: 'Controls guide',
		category: 'interface',
		contexts: ['global'],
		keys: [key('KeyH')]
	}),
	action({
		id: 'world.save',
		label: 'Save world now',
		description: 'Worlds also autosave after building changes.',
		category: 'interface',
		contexts: ['global'],
		keys: [key('KeyS', { mod: true })]
	}),
	action({
		id: 'ui.graphicsQuality',
		label: 'Cycle graphics quality',
		category: 'interface',
		contexts: ['global'],
		keys: [key('KeyL')]
	}),
	action({
		id: 'ui.screenshot',
		label: 'Screenshot',
		category: 'interface',
		contexts: ['global'],
		keys: [key('Backslash')]
	}),
	action({
		id: 'ui.renderStats',
		label: 'Render statistics',
		category: 'interface',
		contexts: ['global'],
		keys: [key('F3')]
	}),
	action({
		id: 'tutorial.speechOptions',
		label: 'Speech options',
		description: 'Open speech options and narrator settings.',
		category: 'interface',
		contexts: ['global'],
		keys: [key('F6')],
		exactShift: true
	}),
	action({
		id: 'tutorial.previous',
		label: 'Previous tutorial instruction',
		category: 'interface',
		contexts: ['global'],
		keys: [key('F7')],
		exactShift: true
	}),
	action({
		id: 'tutorial.autoStart',
		label: 'Start narrated tutorial',
		category: 'interface',
		contexts: ['global'],
		keys: [key('F8')],
		exactShift: true
	}),
	action({
		id: 'tutorial.next',
		label: 'Next tutorial instruction',
		category: 'interface',
		contexts: ['global'],
		keys: [key('F9')],
		exactShift: true
	}),
	action({
		id: 'ui.back',
		label: 'Pause / back / cancel',
		description:
			'Release the mouse, open Pause, close menus or cancel placement. Fixed: the browser always uses Esc to release the mouse.',
		category: 'interface',
		contexts: ['global', 'miniBuildEditor'],
		keys: [key('Escape')],
		locked: true
	})
] as const;

export type KeyActionId = (typeof KEY_ACTIONS)[number]['id'];
export type KeyAction = (typeof KEY_ACTIONS)[number];

const BY_ID: ReadonlyMap<string, KeyActionDef> = new Map(
	KEY_ACTIONS.map((entry) => [entry.id, entry])
);

/** The action with this id, or undefined (e.g. an id from a newer version's file). */
export function findKeyAction(id: string): KeyActionDef | undefined {
	return BY_ID.get(id);
}

export function isKeyActionId(id: string): id is KeyActionId {
	return BY_ID.has(id);
}

/** True when the two actions are allowed to share a key (either one lists the other). */
export function sharesKeyOnPurpose(a: KeyActionDef, b: KeyActionDef): boolean {
	return !!a.sharesKeyWith?.includes(b.id) || !!b.sharesKeyWith?.includes(a.id);
}
