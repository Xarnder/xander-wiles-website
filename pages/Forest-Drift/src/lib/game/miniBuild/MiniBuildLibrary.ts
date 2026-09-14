import {
	cloneBlock,
	cloneDefinition,
	cloneMaterials,
	computeBounds,
	contentHash,
	newId,
	sanitizeName,
	uniqueName
} from './miniBuildGrid';
import { validateMiniBuildDraft } from './MiniBuildValidation';
import {
	MINI_BUILD_SCHEMA_VERSION,
	MINI_BUILD_WORLD_LIMITS,
	type MiniBuildDefinition,
	type MiniBuildDraft
} from './MiniBuildTypes';

export type LibraryResult<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * The world-local design registry: every definition this world's instances may reference.
 *
 * Owns the Save / Save As / Duplicate / Rename / Delete *semantics* but not their consequences for
 * placed objects — MiniBuildSystem coordinates budgets, instances and cache invalidation around
 * these calls. Designs are immutable snapshots: an update replaces the stored object with a new one
 * (revision + 1), so a reference held by an in-flight render never changes underneath it.
 */
export class MiniBuildLibrary {
	private readonly definitions = new Map<string, MiniBuildDefinition>();
	private revisionCounter = 0;
	private defaultCopyMemo: { revision: number; byTemplate: Map<string, string | null> } = {
		revision: -1,
		byTemplate: new Map()
	};

	get revision(): number {
		return this.revisionCounter;
	}

	load(definitions: readonly MiniBuildDefinition[]): void {
		this.definitions.clear();
		for (const definition of definitions)
			this.definitions.set(definition.id, cloneDefinition(definition));
		this.revisionCounter++;
	}

	serialize(): MiniBuildDefinition[] {
		return [...this.definitions.values()].map(cloneDefinition);
	}

	get(id: string): MiniBuildDefinition | undefined {
		return this.definitions.get(id);
	}

	has(id: string): boolean {
		return this.definitions.has(id);
	}

	list(): MiniBuildDefinition[] {
		return [...this.definitions.values()];
	}

	get size(): number {
		return this.definitions.size;
	}

	names(): string[] {
		return [...this.definitions.values()].map((definition) => definition.name);
	}

	/** Save As / Create: always a new definition with a new id. */
	create(
		draft: MiniBuildDraft,
		options: { now?: string; sourceDefaultId?: string; uniqueName?: boolean } = {}
	): LibraryResult<MiniBuildDefinition> {
		if (this.definitions.size >= MINI_BUILD_WORLD_LIMITS.maxDefinitionsPerWorld) {
			return { ok: false, error: 'This world has reached its design limit.' };
		}
		const validated = validateMiniBuildDraft(draft);
		if (!validated.ok) return validated;
		const now = options.now ?? new Date().toISOString();
		const name =
			options.uniqueName === false
				? validated.value.name
				: uniqueName(validated.value.name, this.names());
		const definition: MiniBuildDefinition = {
			schemaVersion: MINI_BUILD_SCHEMA_VERSION,
			id: newId(),
			name,
			revision: 1,
			blocks: validated.value.blocks,
			materials: validated.value.materials,
			bounds: computeBounds(validated.value.blocks),
			anchor: { type: 'bottom-center' },
			...(draft.semanticType ? { semanticType: draft.semanticType } : {}),
			...(options.sourceDefaultId ? { sourceDefaultId: options.sourceDefaultId } : {}),
			createdAt: now,
			updatedAt: now
		};
		this.definitions.set(definition.id, definition);
		this.revisionCounter++;
		return { ok: true, value: definition };
	}

	/** Save: same id, revision + 1. Every placed copy of this design will pick up the change. */
	update(
		id: string,
		draft: MiniBuildDraft,
		now = new Date().toISOString()
	): LibraryResult<MiniBuildDefinition> {
		const existing = this.definitions.get(id);
		if (!existing) return { ok: false, error: 'That design no longer exists.' };
		const validated = validateMiniBuildDraft(draft);
		if (!validated.ok) return validated;
		const next: MiniBuildDefinition = {
			...existing,
			name: validated.value.name,
			revision: existing.revision + 1,
			blocks: validated.value.blocks,
			materials: validated.value.materials,
			bounds: computeBounds(validated.value.blocks),
			updatedAt: now
		};
		if (draft.semanticType) next.semanticType = draft.semanticType;
		else delete next.semanticType;
		this.definitions.set(id, next);
		this.revisionCounter++;
		return { ok: true, value: next };
	}

	/** Duplicate Design: an independent copy named "<Name> Copy". */
	duplicate(id: string, now = new Date().toISOString()): LibraryResult<MiniBuildDefinition> {
		const existing = this.definitions.get(id);
		if (!existing) return { ok: false, error: 'That design no longer exists.' };
		return this.create(
			{
				name: `${existing.name} Copy`,
				blocks: existing.blocks.map(cloneBlock),
				materials: cloneMaterials(existing.materials),
				semanticType: existing.semanticType
			},
			{ now }
		);
	}

	rename(
		id: string,
		name: string,
		now = new Date().toISOString()
	): LibraryResult<MiniBuildDefinition> {
		const existing = this.definitions.get(id);
		if (!existing) return { ok: false, error: 'That design no longer exists.' };
		// Renaming does not change geometry, so the revision (and compiled asset) stays the same.
		const next = { ...existing, name: sanitizeName(name), updatedAt: now };
		this.definitions.set(id, next);
		this.revisionCounter++;
		return { ok: true, value: next };
	}

	/** Removes the definition only. Callers must have resolved every instance first. */
	remove(id: string): boolean {
		const removed = this.definitions.delete(id);
		if (removed) this.revisionCounter++;
		return removed;
	}

	/** Inserts an already-validated definition (import from the personal library). */
	insert(definition: MiniBuildDefinition): LibraryResult<MiniBuildDefinition> {
		if (this.definitions.has(definition.id)) return { ok: false, error: 'Design already exists.' };
		if (this.definitions.size >= MINI_BUILD_WORLD_LIMITS.maxDefinitionsPerWorld) {
			return { ok: false, error: 'This world has reached its design limit.' };
		}
		const copy = cloneDefinition(definition);
		this.definitions.set(copy.id, copy);
		this.revisionCounter++;
		return { ok: true, value: copy };
	}

	/**
	 * A world copy of a default design that still matches it exactly, so placing the default again
	 * reuses it. Memoised per library revision — the Place Object tool asks every frame.
	 */
	findMatchingDefaultCopy(template: MiniBuildDefinition): MiniBuildDefinition | undefined {
		if (this.defaultCopyMemo.revision !== this.revisionCounter) {
			this.defaultCopyMemo = { revision: this.revisionCounter, byTemplate: new Map() };
		}
		const memo = this.defaultCopyMemo.byTemplate;
		if (memo.has(template.id)) {
			const id = memo.get(template.id);
			return id ? this.definitions.get(id) : undefined;
		}
		const hash = contentHash(template);
		let match: MiniBuildDefinition | undefined;
		for (const definition of this.definitions.values()) {
			if (definition.sourceDefaultId === template.id && contentHash(definition) === hash) {
				match = definition;
				break;
			}
		}
		memo.set(template.id, match?.id ?? null);
		return match;
	}
}
