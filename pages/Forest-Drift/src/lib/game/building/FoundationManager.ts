import * as THREE from 'three';
import { FoundationMesh } from './FoundationMesh';
import type { FoundationDefinition } from './FoundationTypes';

/** World-unit tolerance on the containment test, so the player never flickers between terrain and foundation height right at an edge. */
const EDGE_TOLERANCE = 0.001;

interface FoundationEntry {
	definition: FoundationDefinition;
	mesh: FoundationMesh;
}

/**
 * Stores placed foundations and their Three.js representations. Foundations are persistent world
 * objects — independent of terrain chunk lifetime, never owned by TerrainChunk/TerrainManager.
 *
 * Uses a simple Map for now (the prototype's foundation counts are tiny); getTopYAt() is the one
 * hot path a future spatial index (grid buckets, quadtree) would slot in behind unchanged.
 *
 * Vertex spacing is read live (via getVertexSpacing) rather than frozen at construction, so a
 * foundation placed after a live chunkSize/chunkResolution change uses the *current* grid — see
 * the "Terrain settings changes" note in the README for the accepted limitation this implies for
 * foundations placed before such a change.
 */
export class FoundationManager {
	readonly group = new THREE.Group();

	private readonly getVertexSpacing: () => number;
	private readonly foundations = new Map<string, FoundationEntry>();
	private showBounds = false;

	constructor(getVertexSpacing: () => number) {
		this.getVertexSpacing = getVertexSpacing;
	}

	addFoundation(definition: FoundationDefinition): void {
		const mesh = new FoundationMesh(definition, this.getVertexSpacing());
		mesh.setBoundsVisible(this.showBounds);
		this.group.add(mesh.object);
		this.foundations.set(definition.id, { definition, mesh });
	}

	removeFoundation(id: string): boolean {
		const entry = this.foundations.get(id);
		if (!entry) return false;
		this.group.remove(entry.mesh.object);
		entry.mesh.dispose();
		this.foundations.delete(id);
		return true;
	}

	getFoundation(id: string): FoundationDefinition | undefined {
		return this.foundations.get(id)?.definition;
	}

	getFoundations(): FoundationDefinition[] {
		return Array.from(this.foundations.values(), (entry) => entry.definition);
	}

	setShowBounds(visible: boolean): void {
		this.showBounds = visible;
		for (const entry of this.foundations.values()) entry.mesh.setBoundsVisible(visible);
	}

	/** Highest foundation top surface covering (worldX, worldZ), or null if no foundation covers it. */
	getTopYAt(worldX: number, worldZ: number): number | null {
		const spacing = this.getVertexSpacing();
		let best: number | null = null;
		for (const { definition } of this.foundations.values()) {
			const minX = definition.minGridX * spacing - EDGE_TOLERANCE;
			const maxX = definition.maxGridX * spacing + EDGE_TOLERANCE;
			const minZ = definition.minGridZ * spacing - EDGE_TOLERANCE;
			const maxZ = definition.maxGridZ * spacing + EDGE_TOLERANCE;
			if (worldX < minX || worldX > maxX || worldZ < minZ || worldZ > maxZ) continue;
			if (best === null || definition.topY > best) best = definition.topY;
		}
		return best;
	}

	/** Plain, serializable world-state — never Three.js objects. */
	serialize(): FoundationDefinition[] {
		return this.getFoundations();
	}

	/** Replaces all current foundations with the given definitions (e.g. loaded from a future server/database). */
	load(definitions: FoundationDefinition[]): void {
		for (const id of Array.from(this.foundations.keys())) this.removeFoundation(id);
		for (const definition of definitions) this.addFoundation(definition);
	}

	dispose(): void {
		for (const entry of this.foundations.values()) entry.mesh.dispose();
		this.foundations.clear();
		this.group.clear();
	}
}
