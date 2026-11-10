/**
 * Which key bindings clash.
 *
 * Two actions conflict when they share a binding (same key and modifiers) **and** could be live at
 * the same moment (`anyContextsOverlap`), unless one of them lists the other in `sharesKeyWith`.
 * B in the Wall tool and B in Paint Mode never clash; Space for Jump and Space for Fly up don't
 * either, because walking and flying are different states.
 */
import {
	anyContextsOverlap,
	KEY_ACTIONS,
	sharesKeyOnPurpose,
	type KeyActionId
} from './keyActions';
import { bindingsCollide, type Binding } from './keyCodes';

export type BindingSlot = 0 | 1;

/** Reads an action's current primary and secondary binding. */
export type BindingResolver = (id: KeyActionId) => readonly [Binding | null, Binding | null];

export interface KeyConflict {
	/** The binding both actions use (as the first action has it). */
	readonly binding: Binding;
	readonly first: { readonly id: KeyActionId; readonly slot: BindingSlot };
	readonly second: { readonly id: KeyActionId; readonly slot: BindingSlot };
}

/** Every clashing pair, in action-list order. Each pair of slots appears once. */
export function findConflicts(resolve: BindingResolver): KeyConflict[] {
	const conflicts: KeyConflict[] = [];
	const resolved = KEY_ACTIONS.map((action) => ({ action, bindings: resolve(action.id) }));
	for (let i = 0; i < resolved.length; i++) {
		const a = resolved[i];
		for (let j = i + 1; j < resolved.length; j++) {
			const b = resolved[j];
			if (!anyContextsOverlap(a.action.contexts, b.action.contexts)) continue;
			if (sharesKeyOnPurpose(a.action, b.action)) continue;
			for (const slotA of [0, 1] as const) {
				const left = a.bindings[slotA];
				if (!left) continue;
				for (const slotB of [0, 1] as const) {
					const right = b.bindings[slotB];
					if (!right || !bindingsCollide(left, right)) continue;
					conflicts.push({
						binding: left,
						first: { id: a.action.id, slot: slotA },
						second: { id: b.action.id, slot: slotB }
					});
				}
			}
		}
	}
	return conflicts;
}

/** The conflicts one action is part of. */
export function conflictsFor(id: KeyActionId, conflicts: readonly KeyConflict[]): KeyConflict[] {
	return conflicts.filter((c) => c.first.id === id || c.second.id === id);
}
