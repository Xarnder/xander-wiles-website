/**
 * Current key names for Svelte components. Reading `keyLabel('interact.use')` in markup or a
 * `$derived` re-runs when the player rebinds, so prompts like "[K] Get off" always name the key
 * that actually works.
 */
import { subscribeKeyBindings } from './KeyBindingsStore';
import { labelForAction, labelsForAction } from './KeyInput';
import type { KeyActionId } from './keyActions';

let revision = $state(0);
let subscribed = false;

function track(): number {
	if (!subscribed && typeof window !== 'undefined') {
		subscribed = true;
		subscribeKeyBindings(() => revision++);
	}
	return revision;
}

/** The action's key right now ("K", "Shift + R"), or "Unbound". */
export function keyLabel(id: KeyActionId): string {
	track();
	return labelForAction(id);
}

/** Every key bound to the action, joined: "Delete / Backspace" (or "Unbound"). */
export function keyLabels(id: KeyActionId): string {
	track();
	return labelsForAction(id).join(' / ') || 'Unbound';
}
