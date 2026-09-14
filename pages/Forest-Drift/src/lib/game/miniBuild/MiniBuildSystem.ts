import * as THREE from 'three';
import type { BuildingMaterialManager } from '../building/BuildingMaterialManager';
import type { MaterialKind } from '../building/MaterialTypes';
import { getDefaultMiniBuild } from './defaultMiniBuilds';
import { MiniBuildAssetCache, type MiniBuildAssetCacheStats } from './MiniBuildAssetCache';
import {
	MiniBuildChunkBudgetManager,
	type MiniBuildBudgetCheck
} from './MiniBuildChunkBudgetManager';
import { chunkIdForPosition, cloneBlock, cloneMaterials, newId } from './miniBuildGrid';
import { MiniBuildInstanceManager, type MiniBuildInstanceStats } from './MiniBuildInstanceManager';
import { MiniBuildLibrary } from './MiniBuildLibrary';
import { validateMiniBuildDefinition, validateMiniBuildDraft } from './MiniBuildValidation';
import {
	MINI_BUILD_WORLD_LIMITS,
	type MiniBuildDefinition,
	type MiniBuildDraft,
	type MiniBuildInstance,
	type MiniBuildMaterialOverride,
	type MiniBuildMaterialSlot,
	type MiniBuildWorldState,
	type PlaceObjectSelection,
	type QuarterTurn
} from './MiniBuildTypes';

export type SystemResult<T> = { ok: true; value: T } | { ok: false; error: string; code?: string };

/** Player-facing budget copy — deliberately non-technical. Exact numbers live in the debug overlay. */
export const MINI_BUILD_MESSAGES = {
	nearLimit: 'This area is becoming very detailed.',
	primitiveLimit:
		'This area has reached its detail limit.\nRemove or simplify some nearby objects before adding this.',
	instanceLimit: 'This area has too many objects.\nRemove some nearby objects before adding this.'
} as const;

export function budgetMessage(check: MiniBuildBudgetCheck): string | null {
	if (!check.ok)
		return check.reason === 'instances'
			? MINI_BUILD_MESSAGES.instanceLimit
			: MINI_BUILD_MESSAGES.primitiveLimit;
	return check.nearLimit ? MINI_BUILD_MESSAGES.nearLimit : null;
}

/** Primitive usage of one Mini Build chunk, optionally with an object about to be added. */
export interface MiniBuildChunkReadout {
	chunkId: string;
	primitives: number;
	budget: number;
	instances: number;
	maxInstances: number;
	/** Source cuboids the pending placement/move would add to this chunk (0 when just looking). */
	added: number;
	level: 'ok' | 'near' | 'full';
}

/** "Area detail: 124 + 13 / 512 primitives" — the chunk budget line shared by building HUDs. */
export function formatAreaDetail(readout: MiniBuildChunkReadout): string {
	const added = readout.added > 0 ? ` + ${readout.added}` : '';
	return `Area detail: ${readout.primitives}${added} / ${readout.budget} primitives`;
}

export interface MiniBuildDesignSummary {
	definition: MiniBuildDefinition;
	placedCount: number;
}

export interface MiniBuildDebugStats {
	definitions: number;
	cache: MiniBuildAssetCacheStats;
	instances: MiniBuildInstanceStats;
	currentChunk: { id: string; primitives: number; budget: number; instances: number };
	renderedVertices: number;
	renderedTriangles: number;
}

export interface MiniBuildSystemOptions {
	materialManager: BuildingMaterialManager;
	getActivationRadius?: () => number;
	/** Personal-library lookup for `personal-design` selections (async-loaded elsewhere). */
	getPersonalDesign?: (id: string) => MiniBuildDefinition | undefined;
}

/**
 * The Mini Build facade: one place that keeps library, placed instances, budgets and the asset
 * cache consistent. UI and tools call these methods rather than reaching into the parts, which is
 * what guarantees the design ↔ instance invariants:
 *
 * - every instance references an existing definition (delete must resolve instances first)
 * - editing a shared design validates budgets for every copy before committing, compiles once and
 *   repoints all copies
 * - Make Unique clones the definition and retargets exactly one instance
 */
export class MiniBuildSystem {
	readonly group = new THREE.Group();
	readonly library = new MiniBuildLibrary();
	readonly cache = new MiniBuildAssetCache();
	readonly budget = new MiniBuildChunkBudgetManager();
	readonly instances: MiniBuildInstanceManager;
	private readonly materialManager: BuildingMaterialManager;
	private readonly getPersonalDesign?: (id: string) => MiniBuildDefinition | undefined;
	private readonly listeners = new Set<() => void>();
	private loadWarnings: string[] = [];
	private playerX = 0;
	private playerZ = 0;

	constructor(options: MiniBuildSystemOptions) {
		this.group.name = 'mini-builds';
		this.materialManager = options.materialManager;
		this.getPersonalDesign = options.getPersonalDesign;
		this.instances = new MiniBuildInstanceManager({
			parent: this.group,
			library: this.library,
			cache: this.cache,
			budget: this.budget,
			resolveMaterial: (slot) => this.resolveMaterial(slot),
			getActivationRadius: options.getActivationRadius
		});
	}

	/** Autosave polls this; bumps on any authored design or instance change. */
	get revision(): number {
		return this.library.revision + this.instances.revision;
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	resolveMaterial(slot: Pick<MiniBuildMaterialSlot, 'finish' | 'material'>): THREE.Material {
		return this.materialManager.getMaterial(
			`mini-build-${slot.finish}` as MaterialKind,
			slot.material
		);
	}

	load(state: MiniBuildWorldState): string[] {
		this.library.load(state.definitions);
		const report = this.instances.load(state.instances);
		this.loadWarnings = report.warnings;
		this.notify();
		return report.warnings;
	}

	getLoadWarnings(): string[] {
		return [...this.loadWarnings];
	}

	serialize(): MiniBuildWorldState {
		return { definitions: this.library.serialize(), instances: this.instances.serialize() };
	}

	listDesigns(): MiniBuildDesignSummary[] {
		return this.library.list().map((definition) => ({
			definition,
			placedCount: this.instances.countForDesign(definition.id)
		}));
	}

	getDesign(id: string): MiniBuildDefinition | undefined {
		return this.library.get(id);
	}

	placedCount(designId: string): number {
		return this.instances.countForDesign(designId);
	}

	/**
	 * The definition a Place Object selection refers to, without importing it. Default and
	 * personal designs preview from their template until they are actually placed.
	 */
	peekSelection(selection: PlaceObjectSelection): MiniBuildDefinition | undefined {
		switch (selection.type) {
			case 'mini-build':
				return this.library.get(selection.designId) ?? this.getPersonalDesign?.(selection.designId);
			case 'personal-design':
				return this.library.get(selection.designId) ?? this.getPersonalDesign?.(selection.designId);
			case 'default-design': {
				const template = getDefaultMiniBuild(selection.defaultId);
				return template ? (this.library.findMatchingDefaultCopy(template) ?? template) : undefined;
			}
			case 'light':
				return undefined;
		}
	}

	/**
	 * Ensures the selected design exists in this world (worlds are self-contained) and returns the
	 * world copy. A default is imported once and reused while its content still matches; a personal
	 * design keeps its id so placing it again never duplicates it.
	 */
	ensureInWorld(selection: PlaceObjectSelection): SystemResult<MiniBuildDefinition> {
		if (selection.type === 'light') return { ok: false, error: 'Lights are not Mini Builds.' };
		if (selection.type === 'default-design') {
			const template = getDefaultMiniBuild(selection.defaultId);
			if (!template) return { ok: false, error: 'That default design no longer exists.' };
			const existing = this.library.findMatchingDefaultCopy(template);
			if (existing) return { ok: true, value: existing };
			const created = this.library.create(
				{
					name: template.name,
					blocks: template.blocks.map(cloneBlock),
					materials: cloneMaterials(template.materials),
					semanticType: template.semanticType
				},
				{ sourceDefaultId: template.id }
			);
			if (created.ok) this.notify();
			return created;
		}
		const inWorld = this.library.get(selection.designId);
		if (inWorld) return { ok: true, value: inWorld };
		const personal = this.getPersonalDesign?.(selection.designId);
		if (!personal) return { ok: false, error: 'That design is not available.' };
		return this.importDefinition(personal);
	}

	/** Copies an external (personal library) definition into the world after full validation. */
	importDefinition(definition: MiniBuildDefinition): SystemResult<MiniBuildDefinition> {
		const validated = validateMiniBuildDefinition(definition);
		if (!validated.ok) return validated;
		if (this.library.has(validated.value.id))
			return { ok: true, value: this.library.get(validated.value.id)! };
		const inserted = this.library.insert(validated.value);
		if (inserted.ok) this.notify();
		return inserted;
	}

	/** Brand-new design or Save As: always a new definition. Existing copies are untouched. */
	createDesign(draft: MiniBuildDraft): SystemResult<MiniBuildDefinition> {
		const created = this.library.create(draft);
		if (!created.ok) return created;
		this.cache.getData(created.value);
		this.notify();
		return created;
	}

	/**
	 * Save over an existing design: every placed copy updates. Rejected (with nothing changed) if the
	 * new block count would push any chunk containing a copy past its budget.
	 */
	saveDesign(designId: string, draft: MiniBuildDraft): SystemResult<MiniBuildDefinition> {
		const existing = this.library.get(designId);
		if (!existing) return { ok: false, error: 'That design no longer exists.' };
		const validated = validateMiniBuildDraft(draft);
		if (!validated.ok) return validated;
		const newCount = validated.value.blocks.length;
		if (newCount > existing.blocks.length) {
			const exceeded = this.instances.chunksExceededByDesignCost(designId, newCount);
			if (exceeded.length > 0) {
				return {
					ok: false,
					code: 'budget',
					error: `This change would push ${exceeded.length} area${exceeded.length === 1 ? '' : 's'} with placed copies past the detail limit. Save as a new design, or remove some nearby objects.`
				};
			}
		}
		const updated = this.library.update(designId, validated.value);
		if (!updated.ok) return updated;
		this.cache.getData(updated.value);
		this.instances.onDesignUpdated(designId);
		this.notify();
		return updated;
	}

	duplicateDesign(designId: string): SystemResult<MiniBuildDefinition> {
		const result = this.library.duplicate(designId);
		if (result.ok) this.notify();
		return result;
	}

	renameDesign(designId: string, name: string): SystemResult<MiniBuildDefinition> {
		const result = this.library.rename(designId, name);
		if (result.ok) this.notify();
		return result;
	}

	/** Never silently deletes placed objects: callers must opt in with `deleteInstances`. */
	deleteDesign(
		designId: string,
		options: { deleteInstances?: boolean } = {}
	): SystemResult<{ removedInstances: number }> {
		if (!this.library.has(designId)) return { ok: false, error: 'That design no longer exists.' };
		const placed = this.instances.countForDesign(designId);
		if (placed > 0 && !options.deleteInstances) {
			return {
				ok: false,
				code: 'in-use',
				error: `This design is used by ${placed} placed object${placed === 1 ? '' : 's'}.`
			};
		}
		const removedInstances = placed > 0 ? this.instances.removeAllForDesign(designId) : 0;
		this.library.remove(designId);
		this.cache.purgeDesign(designId);
		this.notify();
		return { ok: true, value: { removedInstances } };
	}

	/** Clones the instance's design, retargets only that instance, and returns the new design. */
	makeUnique(instanceId: string): SystemResult<MiniBuildDefinition> {
		const instance = this.instances.get(instanceId);
		const source = instance ? this.library.get(instance.designId) : undefined;
		if (!instance || !source) return { ok: false, error: 'That object no longer exists.' };
		const copy = this.library.create({
			name: `${source.name} Copy`,
			blocks: source.blocks.map(cloneBlock),
			materials: cloneMaterials(source.materials),
			semanticType: source.semanticType
		});
		if (!copy.ok) return copy;
		const retargeted = this.instances.retarget(instanceId, copy.value.id);
		if (!retargeted.ok) {
			this.library.remove(copy.value.id);
			return { ok: false, error: retargeted.error };
		}
		this.notify();
		return copy;
	}

	checkPlacementBudget(
		definition: MiniBuildDefinition,
		x: number,
		z: number,
		ignoreInstanceId?: string
	): MiniBuildBudgetCheck {
		return this.instances.checkBudget(definition, x, z, ignoreInstanceId);
	}

	placeInstance(
		designId: string,
		position: { x: number; y: number; z: number },
		rotationY: QuarterTurn,
		extras: {
			foundationId?: string | null;
			levelId?: string;
			materialOverrides?: MiniBuildMaterialOverride[];
		} = {}
	): SystemResult<MiniBuildInstance> {
		const instance: MiniBuildInstance = {
			id: newId(),
			designId,
			position: { ...position },
			rotationY
		};
		if (extras.foundationId) instance.foundationId = extras.foundationId;
		if (extras.levelId) instance.levelId = extras.levelId;
		if (extras.materialOverrides?.length)
			instance.materialOverrides = structuredClone(extras.materialOverrides);
		const result = this.instances.add(instance);
		if (!result.ok) {
			return {
				ok: false,
				code: 'budget',
				error: result.budget ? (budgetMessage(result.budget) ?? result.error) : result.error
			};
		}
		this.notify();
		return result;
	}

	removeInstance(instanceId: string): boolean {
		const removed = this.instances.remove(instanceId);
		if (removed) this.notify();
		return removed;
	}

	moveInstance(
		instanceId: string,
		position: { x: number; y: number; z: number },
		rotationY: QuarterTurn
	): SystemResult<MiniBuildInstance> {
		const result = this.instances.move(instanceId, position, rotationY);
		if (!result.ok) {
			return {
				ok: false,
				code: 'budget',
				error: result.budget ? (budgetMessage(result.budget) ?? result.error) : result.error
			};
		}
		this.notify();
		return result;
	}

	/** What Copy picks up from a placed object: same design, same rotation and material overrides. */
	copyInstance(instanceId: string): {
		designId: string;
		rotationY: QuarterTurn;
		materialOverrides?: MiniBuildMaterialOverride[];
	} | null {
		const instance = this.instances.get(instanceId);
		if (!instance) return null;
		return {
			designId: instance.designId,
			rotationY: instance.rotationY,
			...(instance.materialOverrides
				? { materialOverrides: structuredClone(instance.materialOverrides) }
				: {})
		};
	}

	update(playerX: number, playerZ: number): void {
		this.playerX = playerX;
		this.playerZ = playerZ;
		this.instances.update(playerX, playerZ);
	}

	/**
	 * Usage of the chunk containing (x, z). `added` is the cost of a pending placement; pass the moving
	 * instance's id so moving within its own chunk adds nothing.
	 */
	getChunkReadout(
		x: number,
		z: number,
		added = 0,
		movingInstanceId?: string
	): MiniBuildChunkReadout {
		const chunkId = chunkIdForPosition(x, z);
		const primitives = this.budget.getPrimitiveUsage(chunkId);
		const instances = this.budget.getInstanceCount(chunkId);
		const effectiveAdded =
			movingInstanceId && this.instances.getChunkOf(movingInstanceId) === chunkId ? 0 : added;
		const {
			primitiveBudgetPerChunk: budget,
			maxInstancesPerChunk: maxInstances,
			nearBudgetRatio
		} = this.budget.limits;
		const total = primitives + effectiveAdded;
		const extraInstances = effectiveAdded > 0 ? 1 : 0;
		const level =
			total > budget || instances + extraInstances > maxInstances
				? 'full'
				: total >= budget * nearBudgetRatio
					? 'near'
					: 'ok';
		return { chunkId, primitives, budget, instances, maxInstances, added: effectiveAdded, level };
	}

	getDebugStats(): MiniBuildDebugStats {
		const chunkId = chunkIdForPosition(this.playerX, this.playerZ);
		let renderedVertices = 0;
		let renderedTriangles = 0;
		for (const batch of this.instances.getBatches()) {
			renderedVertices += batch.asset.data.stats.vertices * batch.count;
			renderedTriangles += batch.asset.data.stats.triangles * batch.count;
		}
		return {
			definitions: this.library.size,
			cache: this.cache.getStats(),
			instances: this.instances.getStats(),
			currentChunk: {
				id: chunkId,
				primitives: this.budget.getPrimitiveUsage(chunkId),
				budget: MINI_BUILD_WORLD_LIMITS.primitiveBudgetPerChunk,
				instances: this.budget.getInstanceCount(chunkId)
			},
			renderedVertices,
			renderedTriangles
		};
	}

	dispose(): void {
		this.instances.dispose();
		this.cache.dispose();
		this.group.removeFromParent();
		this.listeners.clear();
	}

	private notify(): void {
		for (const listener of this.listeners) listener();
	}
}
