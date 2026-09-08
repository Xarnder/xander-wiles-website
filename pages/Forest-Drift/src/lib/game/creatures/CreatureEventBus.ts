import type { CreatureBehaviourState, Vec3 } from './CreatureTypes';
export type CreatureEvent =
	| { type: 'spawn' | 'despawn'; id: string; position: Vec3 }
	| { type: 'state'; id: string; state: CreatureBehaviourState }
	| { type: 'footstep'; id: string; position: Vec3 };
/** Extension seam for future sound, discovery and interactions; no gameplay is implied. */
export class CreatureEventBus {
	private listeners = new Set<(event: CreatureEvent) => void>();
	subscribe(listener: (event: CreatureEvent) => void) {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}
	emit(event: CreatureEvent) {
		for (const listener of this.listeners) listener(event);
	}
	clear() {
		this.listeners.clear();
	}
}
