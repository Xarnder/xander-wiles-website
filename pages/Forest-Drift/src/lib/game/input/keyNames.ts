/**
 * Key names for plain TypeScript (tool HUD hints). Read when a hint is built, so a tool's hints
 * show the player's keys the next time its HUD refreshes. Svelte components use
 * `keyLabels.svelte.ts`, which also re-renders when the bindings change.
 */
import { labelForAction } from './KeyInput';
import type { KeyActionId } from './keyActions';

/** The action's key right now: "B", "Shift + R", or "Unbound". */
export function keyName(id: KeyActionId): string {
	return labelForAction(id);
}

/**
 * Keys for a column-aligned hint ("B    Copy"): the names joined with "/", padded to five
 * characters, and always followed by at least two spaces.
 */
export function padKey(...ids: KeyActionId[]): string {
	const label = ids.map((id) => labelForAction(id)).join('/');
	return label.length >= 4 ? `${label}  ` : label.padEnd(5);
}
