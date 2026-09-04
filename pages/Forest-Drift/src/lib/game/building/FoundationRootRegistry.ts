import * as THREE from 'three';
import { foundationLocalFrame } from './FoundationLocalMath';
import type { FoundationDefinition } from './FoundationTypes';

/**
 * One "BuildingRoot" group per foundation, positioned at that foundation's world origin
 * (`foundationLocalFrame`) — the same pattern WallManager and WallPathManager each already
 * implement independently. Extracted here only for the *third* consumer (SlabManager) so that
 * pattern doesn't get duplicated a third time; WallManager/WallPathManager's existing, already-
 * tested copies are deliberately left as-is rather than retrofitted, per this project's standing
 * "don't touch the working wall systems unless asked" rule.
 */
export class FoundationRootRegistry {
	readonly group = new THREE.Group();

	private readonly getFoundation: (foundationId: string) => FoundationDefinition | undefined;
	private readonly getVertexSpacing: () => number;
	private readonly roots = new Map<string, THREE.Group>();

	constructor(
		getFoundation: (foundationId: string) => FoundationDefinition | undefined,
		getVertexSpacing: () => number
	) {
		this.getFoundation = getFoundation;
		this.getVertexSpacing = getVertexSpacing;
	}

	getOrCreate(foundationId: string): THREE.Group | null {
		const existing = this.roots.get(foundationId);
		if (existing) return existing;
		const foundation = this.getFoundation(foundationId);
		if (!foundation) return null;
		const frame = foundationLocalFrame(foundation, this.getVertexSpacing());
		const root = new THREE.Group();
		root.position.set(frame.originWorldX, frame.originWorldY, frame.originWorldZ);
		root.userData.foundationId = foundationId;
		this.group.add(root);
		this.roots.set(foundationId, root);
		return root;
	}

	remove(foundationId: string): void {
		const root = this.roots.get(foundationId);
		if (!root) return;
		this.group.remove(root);
		this.roots.delete(foundationId);
	}

	dispose(): void {
		this.roots.clear();
		this.group.clear();
	}
}
