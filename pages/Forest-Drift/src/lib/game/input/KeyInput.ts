/**
 * The one place that turns key presses into actions.
 *
 * Game code asks "is this keydown Rotate?" (`matchesAction`) or "is Move forward held?"
 * (`KeyInput.isHeld`), never "is this `KeyR`?", so every key follows the player's bindings.
 *
 * Modifier rules:
 * - Ctrl/Cmd and Alt must match exactly, so `R` never fires on Ctrl + R.
 * - An extra Shift is allowed (it means "reverse" or "finer" for Rotate, roof rise and the
 *   rotation step), unless another action that can be live at the same time is bound to that
 *   exact Shift chord. In the Mini Build editor, Shift + ← is Shrink, so Shift + ← doesn't also
 *   move the block.
 * - Hold actions ignore modifiers entirely (holding Shift to run doesn't stop W).
 *
 * Touch buttons send a synthetic event naming the action (`createActionEvent`). It matches that
 * action whatever key is bound to it, even none, so touch never breaks when a player rebinds.
 */
import { anyContextsOverlap, findKeyAction, KEY_ACTIONS, type KeyActionId } from './keyActions';
import { codeMatches, codesOverlap, formatBinding, isModifierCode, type Binding } from './keyCodes';
import type { BindingResolver, BindingSlot } from './conflicts';
import { getBindings } from './KeyBindingsStore';

/** Property a synthetic (touch) key event carries to name its action. */
export const ACTION_EVENT_PROPERTY = 'forestAction';

/** The parts of a `KeyboardEvent` the matcher reads, so tests can pass plain objects. */
export interface KeyEventLike {
	readonly code: string;
	readonly shiftKey: boolean;
	readonly ctrlKey: boolean;
	readonly altKey: boolean;
	readonly metaKey: boolean;
	readonly repeat?: boolean;
	readonly target?: unknown;
	readonly [ACTION_EVENT_PROPERTY]?: string;
}

/** The action a synthetic event names, or undefined for a real key press. */
export function actionOfEvent(event: KeyEventLike): string | undefined {
	return event[ACTION_EVENT_PROPERTY];
}

/**
 * A `keydown`/`keyup` that triggers `id` directly. Its `code` is the action's primary key (or
 * empty when it has none), so handlers that only log the code still see something sensible.
 */
export function createActionEvent(
	type: 'keydown' | 'keyup',
	id: KeyActionId,
	resolve: BindingResolver = getBindings
): KeyboardEvent {
	const [primary, secondary] = resolve(id);
	const event = new KeyboardEvent(type, { code: (primary ?? secondary)?.code ?? '' });
	Object.defineProperty(event, ACTION_EVENT_PROPERTY, { value: id });
	return event;
}

/** Is the player typing (text field, select, or editable text)? Keys there are never actions. */
export function isTypingTarget(target: unknown): boolean {
	if (!target || typeof target !== 'object') return false;
	const element = target as {
		tagName?: string;
		isContentEditable?: boolean;
		closest?: (selector: string) => unknown;
	};
	if (['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName ?? '')) return true;
	if (element.isContentEditable) return true;
	return typeof element.closest === 'function' && !!element.closest('[contenteditable="true"]');
}

/** Is `binding` + Shift bound to another action that can be live alongside `id`? */
function shiftChordClaimed(id: KeyActionId, binding: Binding, resolve: BindingResolver): boolean {
	const action = findKeyAction(id);
	if (!action) return false;
	for (const other of KEY_ACTIONS) {
		if (other.id === id || !anyContextsOverlap(action.contexts, other.contexts)) continue;
		for (const candidate of resolve(other.id)) {
			if (
				candidate?.shift &&
				!!candidate.mod === !!binding.mod &&
				!!candidate.alt === !!binding.alt &&
				codesOverlap(candidate.code, binding.code)
			)
				return true;
		}
	}
	return false;
}

function bindingMatches(
	id: KeyActionId,
	binding: Binding,
	event: KeyEventLike,
	hold: boolean,
	resolve: BindingResolver
): boolean {
	if (!codeMatches(binding.code, event.code)) return false;
	// A lone modifier key (Shift to run) or a hold action: modifiers don't matter.
	if (hold || isModifierCode(binding.code)) return true;
	if (!!binding.mod !== (event.ctrlKey || event.metaKey)) return false;
	if (!!binding.alt !== event.altKey) return false;
	if (binding.shift) return event.shiftKey;
	return !event.shiftKey || !shiftChordClaimed(id, binding, resolve);
}

/** Does this key event trigger the action, with its current bindings? */
export function matchesAction(
	event: KeyEventLike,
	id: KeyActionId,
	resolve: BindingResolver = getBindings
): boolean {
	const synthetic = actionOfEvent(event);
	if (synthetic !== undefined) return synthetic === id;
	const hold = findKeyAction(id)?.kind === 'hold';
	return resolve(id).some(
		(binding) => !!binding && bindingMatches(id, binding, event, hold, resolve)
	);
}

/** The first of `ids` this event triggers, or undefined. */
export function firstMatchingAction<const Id extends KeyActionId>(
	event: KeyEventLike,
	ids: readonly Id[],
	resolve: BindingResolver = getBindings
): Id | undefined {
	return ids.find((id) => matchesAction(event, id, resolve));
}

/** How a key is shown in prompts and help: "W", "Shift + R", or "Unbound". */
export function labelForAction(
	id: KeyActionId,
	slot?: BindingSlot,
	options: { resolve?: BindingResolver; apple?: boolean } = {}
): string {
	const pair = (options.resolve ?? getBindings)(id);
	const binding = slot === undefined ? (pair[0] ?? pair[1]) : pair[slot];
	return binding ? formatBinding(binding, { apple: options.apple }) : 'Unbound';
}

/** Every key bound to the action, e.g. ["−", "Numpad −"]. Empty when unbound. */
export function labelsForAction(
	id: KeyActionId,
	options: { resolve?: BindingResolver; apple?: boolean } = {}
): string[] {
	return (options.resolve ?? getBindings)(id)
		.filter((binding): binding is Binding => !!binding)
		.map((binding) => formatBinding(binding, { apple: options.apple }));
}

type KeyTarget = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;

/**
 * Tracks which keys are down, for hold actions read every frame (movement, run, zoom).
 *
 * Held keys are forgotten on window blur and whenever `clear()` is called (losing the pointer
 * lock, respawning, opening a menu), so a key released while the page wasn't listening never
 * stays "stuck".
 */
export class KeyInput {
	private readonly heldCodes = new Set<string>();
	private readonly heldActions = new Set<string>();

	constructor(private readonly resolve: BindingResolver = getBindings) {}

	readonly handleKeyDown = (event: KeyEventLike): void => {
		const synthetic = actionOfEvent(event);
		if (synthetic !== undefined) {
			this.heldActions.add(synthetic);
			return;
		}
		if (isTypingTarget(event.target)) return;
		this.heldCodes.add(event.code);
	};

	readonly handleKeyUp = (event: KeyEventLike): void => {
		const synthetic = actionOfEvent(event);
		if (synthetic !== undefined) {
			this.heldActions.delete(synthetic);
			return;
		}
		this.heldCodes.delete(event.code);
	};

	readonly clear = (): void => {
		this.heldCodes.clear();
		this.heldActions.clear();
	};

	/** Start listening. Returns a function that stops. */
	attach(target: KeyTarget = window, blurTarget: KeyTarget | null = target): () => void {
		const down = this.handleKeyDown as unknown as EventListener;
		const up = this.handleKeyUp as unknown as EventListener;
		target.addEventListener('keydown', down);
		target.addEventListener('keyup', up);
		blurTarget?.addEventListener('blur', this.clear);
		return () => {
			target.removeEventListener('keydown', down);
			target.removeEventListener('keyup', up);
			blurTarget?.removeEventListener('blur', this.clear);
			this.clear();
		};
	}

	/** Is any key bound to this action down right now (or its touch button held)? */
	isHeld(id: KeyActionId): boolean {
		if (this.heldActions.has(id)) return true;
		for (const binding of this.resolve(id)) {
			if (!binding) continue;
			for (const code of this.heldCodes) if (codeMatches(binding.code, code)) return true;
		}
		return false;
	}

	/** Same as `matchesAction`, using this input's bindings. */
	matches(event: KeyEventLike, id: KeyActionId): boolean {
		return matchesAction(event, id, this.resolve);
	}
}
