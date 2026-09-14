/**
 * The Mini Build editor's working copy. Pure logic — no Three.js, no DOM — so every rule the editor
 * enforces (16 blocks, grid snapping, 4m bounds, 4 materials) is unit-tested directly.
 *
 * Transactional: nothing here touches the authoritative definition. The editor edits a draft,
 * Cancel discards it, and only Save hands a validated draft to MiniBuildSystem.
 *
 * History uses immutable logical snapshots. With at most 16 blocks a snapshot is a few kilobytes,
 * which is simpler and more robust than inverse commands — and it never captures Three.js state.
 */
import { colorMaterialFromHex } from '../building/MaterialTypes';
import {
	AXES,
	blockBox,
	blockInWorkspace,
	boundsFit,
	boundsSizeGrid,
	cloneBlock,
	cloneMaterials,
	computeBounds,
	contentHash,
	effectiveSize,
	flatAxisCount,
	gridToMeters,
	localSizeForEffective,
	metersToGrid,
	newId,
	nextQuarterTurn,
	sanitizeName,
	type Axis
} from './miniBuildGrid';
import { raisePlaneLayer } from './miniBuildSurfaces';
import { validateMiniBuildDraft } from './MiniBuildValidation';
import {
	MINI_BUILD_LIMITS,
	type GridVec3,
	type MiniBuildBlock,
	type MiniBuildBlockCollision,
	type MiniBuildDefinition,
	type MiniBuildDraft,
	type MiniBuildFinish,
	type MiniBuildMaterialSlot,
	type MiniBuildSemanticType
} from './MiniBuildTypes';

export type EditorResult = { ok: true } | { ok: false; error: string };

export const EDITOR_ERRORS = {
	maxBlocks: `Maximum ${MINI_BUILD_LIMITS.maxBlocks} blocks.`,
	bounds: 'Must fit within 4m × 4m × 4m.',
	workspace: 'Blocks must stay inside the build area above the floor.',
	maxMaterials: `Maximum ${MINI_BUILD_LIMITS.maxMaterialSlots} materials.`,
	noSelection: 'Select a block first.',
	lastMaterial: 'A design needs at least one material.',
	flat: 'A block can be flat (size 0) on only one axis.'
} as const;

const MAX_HISTORY = 200;

interface Snapshot {
	blocks: MiniBuildBlock[];
	materials: MiniBuildMaterialSlot[];
	selectedBlockId: string | null;
}

const DEFAULT_SLOT_COLORS: readonly { name: string; finish: MiniBuildFinish; color: string }[] = [
	{ name: 'Wood', finish: 'wood', color: '#8B5A2B' },
	{ name: 'Fabric', finish: 'fabric', color: '#E8DCC8' },
	{ name: 'Metal', finish: 'metal', color: '#4A4A4C' },
	{ name: 'Glass', finish: 'glass', color: '#A8D0E0' }
];

function defaultSlot(index: number): MiniBuildMaterialSlot {
	const preset = DEFAULT_SLOT_COLORS[index % DEFAULT_SLOT_COLORS.length];
	return { name: preset.name, finish: preset.finish, material: colorMaterialFromHex(preset.color) };
}

export class MiniBuildEditorState {
	private blocks: MiniBuildBlock[];
	private materials: MiniBuildMaterialSlot[];
	private nameValue: string;
	private semantic: MiniBuildSemanticType | undefined;
	private undoStack: Snapshot[] = [];
	private redoStack: Snapshot[] = [];
	private savedHash: string;
	private savedName: string;
	selectedBlockId: string | null = null;
	/** The design being edited, or null for a brand-new build. */
	sourceDesignId: string | null;
	sourceRevision: number | null;
	/** Bumped on every change so a UI can cheaply re-render. */
	version = 0;

	private constructor(
		draft: MiniBuildDraft,
		sourceDesignId: string | null,
		sourceRevision: number | null
	) {
		this.blocks = draft.blocks.map(cloneBlock);
		this.materials = cloneMaterials(draft.materials);
		this.nameValue = draft.name;
		this.semantic = draft.semanticType;
		this.sourceDesignId = sourceDesignId;
		this.sourceRevision = sourceRevision;
		this.recenterIfOutsideWorkspace();
		this.savedHash = sourceDesignId ? this.hash() : '';
		this.savedName = draft.name;
		this.selectedBlockId = this.blocks[0]?.id ?? null;
	}

	static createNew(name = 'Untitled Build'): MiniBuildEditorState {
		return new MiniBuildEditorState({ name, blocks: [], materials: [defaultSlot(0)] }, null, null);
	}

	/** Opens an existing design (or a default template, with `asTemplate`) as an editable working copy. */
	static fromDefinition(
		definition: MiniBuildDefinition,
		options: { asTemplate?: boolean } = {}
	): MiniBuildEditorState {
		const draft: MiniBuildDraft = {
			name: definition.name,
			blocks: definition.blocks,
			materials: definition.materials,
			semanticType: definition.semanticType
		};
		return options.asTemplate
			? new MiniBuildEditorState(draft, null, null)
			: new MiniBuildEditorState(draft, definition.id, definition.revision);
	}

	get name(): string {
		return this.nameValue;
	}

	get semanticType(): MiniBuildSemanticType | undefined {
		return this.semantic;
	}

	getBlocks(): readonly MiniBuildBlock[] {
		return this.blocks;
	}

	getMaterials(): readonly MiniBuildMaterialSlot[] {
		return this.materials;
	}

	get blockCount(): number {
		return this.blocks.length;
	}

	get canAddBlock(): boolean {
		return this.blocks.length < MINI_BUILD_LIMITS.maxBlocks;
	}

	get canAddMaterial(): boolean {
		return this.materials.length < MINI_BUILD_LIMITS.maxMaterialSlots;
	}

	get selectedBlock(): MiniBuildBlock | undefined {
		return this.blocks.find((block) => block.id === this.selectedBlockId);
	}

	get canUndo(): boolean {
		return this.undoStack.length > 0;
	}

	get canRedo(): boolean {
		return this.redoStack.length > 0;
	}

	get isDirty(): boolean {
		return this.hash() !== this.savedHash || this.nameValue !== this.savedName;
	}

	/** Design size in metres (0 when empty). */
	getSizeMeters(): GridVec3 {
		if (this.blocks.length === 0) return { x: 0, y: 0, z: 0 };
		const size = boundsSizeGrid(computeBounds(this.blocks));
		return { x: gridToMeters(size.x), y: gridToMeters(size.y), z: gridToMeters(size.z) };
	}

	usedMaterialSlots(): number {
		return new Set(this.blocks.map((block) => block.materialSlot)).size;
	}

	toDraft(): MiniBuildDraft {
		return {
			name: sanitizeName(this.nameValue),
			blocks: this.blocks.map(cloneBlock),
			materials: cloneMaterials(this.materials),
			...(this.semantic ? { semanticType: this.semantic } : {})
		};
	}

	validateForSave(): EditorResult {
		const result = validateMiniBuildDraft(this.toDraft());
		return result.ok ? { ok: true } : { ok: false, error: result.error };
	}

	markSaved(designId: string, revision: number): void {
		this.sourceDesignId = designId;
		this.sourceRevision = revision;
		this.savedHash = this.hash();
		this.savedName = this.nameValue;
		this.version++;
	}

	setName(name: string): void {
		this.nameValue = name.slice(0, MINI_BUILD_LIMITS.maxNameLength);
		this.version++;
	}

	setSemanticType(type: MiniBuildSemanticType | undefined): void {
		this.semantic = type && type !== 'generic' ? type : undefined;
		this.version++;
	}

	/**
	 * Selecting a plane that lies in the same place as other planes puts it on top of them (in the
	 * editor and in the saved design). That is a real change to the design, so it can make the draft
	 * dirty, but it is not an undo step of its own — undo restores the selection it records, and that
	 * selection is raised again.
	 */
	selectBlock(id: string | null): void {
		this.selectedBlockId = id && this.blocks.some((block) => block.id === id) ? id : null;
		this.raiseSelectedPlane();
		this.version++;
	}

	private raiseSelectedPlane(): void {
		const raised = raisePlaneLayer(this.blocks, this.selectedBlockId);
		if (raised) this.blocks = raised;
	}

	selectNext(direction: 1 | -1 = 1): void {
		if (this.blocks.length === 0) return;
		const index = this.blocks.findIndex((block) => block.id === this.selectedBlockId);
		const next = index < 0 ? 0 : (index + direction + this.blocks.length) % this.blocks.length;
		this.selectBlock(this.blocks[next].id);
	}

	addBlock(): EditorResult {
		if (!this.canAddBlock) return { ok: false, error: EDITOR_ERRORS.maxBlocks };
		const size = MINI_BUILD_LIMITS.defaultBlockSizeGrid;
		const bounds = this.blocks.length > 0 ? computeBounds(this.blocks) : null;
		const slot = this.selectedBlock?.materialSlot ?? 0;
		const candidates: GridVec3[] = [];
		if (bounds) {
			const cx = Math.floor((bounds.min.x + bounds.max.x) / 2) - size / 2;
			const cz = Math.floor((bounds.min.z + bounds.max.z) / 2) - size / 2;
			candidates.push({ x: cx, y: bounds.max.y, z: cz }, { x: cx, y: 0, z: cz }, { ...bounds.min });
		}
		candidates.push({ x: -size / 2, y: 0, z: -size / 2 });
		for (const sizeGrid of [size, 4, 2, 1]) {
			for (const position of candidates) {
				const block: MiniBuildBlock = {
					id: newId(),
					positionGrid: { ...position },
					sizeGrid: { x: sizeGrid, y: sizeGrid, z: sizeGrid },
					rotation: { x: 0, y: 0, z: 0 },
					materialSlot: slot
				};
				const result = this.commit([...this.blocks, block], this.materials, block.id);
				if (result.ok) return result;
			}
		}
		return { ok: false, error: EDITOR_ERRORS.bounds };
	}

	duplicateSelected(): EditorResult {
		const source = this.selectedBlock;
		if (!source) return { ok: false, error: EDITOR_ERRORS.noSelection };
		if (!this.canAddBlock) return { ok: false, error: EDITOR_ERRORS.maxBlocks };
		// Two grid units (0.125m) so the copy is visibly offset; one unit as a fallback near the edges.
		const offsets: GridVec3[] = [2, 1].flatMap((d) => [
			{ x: d, y: 0, z: 0 },
			{ x: -d, y: 0, z: 0 },
			{ x: 0, y: 0, z: d },
			{ x: 0, y: 0, z: -d },
			{ x: 0, y: d, z: 0 }
		]);
		let lastError: string = EDITOR_ERRORS.bounds;
		for (const offset of offsets) {
			const copy = cloneBlock(source);
			copy.id = newId();
			copy.positionGrid = {
				x: source.positionGrid.x + offset.x,
				y: source.positionGrid.y + offset.y,
				z: source.positionGrid.z + offset.z
			};
			const result = this.commit([...this.blocks, copy], this.materials, copy.id);
			if (result.ok) return result;
			lastError = result.error;
		}
		return { ok: false, error: lastError };
	}

	/** Duplicate + mirror across the design's centre X plane — chair legs, arms, bed posts. */
	mirrorDuplicateX(): EditorResult {
		const source = this.selectedBlock;
		if (!source) return { ok: false, error: EDITOR_ERRORS.noSelection };
		if (!this.canAddBlock) return { ok: false, error: EDITOR_ERRORS.maxBlocks };
		const bounds = computeBounds(this.blocks);
		const box = blockBox(source);
		const mirrorMinX = bounds.min.x + bounds.max.x - box.max.x;
		const copy = cloneBlock(source);
		copy.id = newId();
		copy.positionGrid = { ...source.positionGrid, x: mirrorMinX };
		if (mirrorMinX === source.positionGrid.x)
			copy.positionGrid.x += Math.max(1, effectiveSize(source).x);
		return this.commit([...this.blocks, copy], this.materials, copy.id);
	}

	deleteSelected(): EditorResult {
		const source = this.selectedBlock;
		if (!source) return { ok: false, error: EDITOR_ERRORS.noSelection };
		const index = this.blocks.indexOf(source);
		const remaining = this.blocks.filter((block) => block !== source);
		const nextSelection = remaining[Math.min(index, remaining.length - 1)]?.id ?? null;
		return this.commit(remaining, this.materials, nextSelection);
	}

	moveSelected(delta: Partial<GridVec3>): EditorResult {
		const source = this.selectedBlock;
		if (!source) return { ok: false, error: EDITOR_ERRORS.noSelection };
		return this.setBlockGrid(source.id, {
			x: source.positionGrid.x + (delta.x ?? 0),
			y: source.positionGrid.y + (delta.y ?? 0),
			z: source.positionGrid.z + (delta.z ?? 0)
		});
	}

	/** Numeric panel input in metres — snapped to the 0.0625m grid before it is ever stored. */
	setPositionMeters(axis: Axis, meters: number): EditorResult {
		const source = this.selectedBlock;
		if (!source) return { ok: false, error: EDITOR_ERRORS.noSelection };
		return this.setBlockGrid(source.id, { ...source.positionGrid, [axis]: metersToGrid(meters) });
	}

	/**
	 * Grows/shrinks the selected block's effective size on one axis (max side moves). Shrinking can
	 * flatten the block into a plane; it stops one grid unit short when another axis is already flat.
	 */
	resizeSelected(axis: Axis, deltaGrid: number, side: 'min' | 'max' = 'max'): EditorResult {
		const source = this.selectedBlock;
		if (!source) return { ok: false, error: EDITOR_ERRORS.noSelection };
		const size = effectiveSize(source);
		const nextSize = clampBlockSize(size, axis, size[axis] + deltaGrid);
		const applied = nextSize - size[axis];
		const position = { ...source.positionGrid };
		if (side === 'min') position[axis] -= applied;
		return this.setBlockGrid(source.id, position, { ...size, [axis]: nextSize });
	}

	setSizeMeters(axis: Axis, meters: number): EditorResult {
		const source = this.selectedBlock;
		if (!source) return { ok: false, error: EDITOR_ERRORS.noSelection };
		const size = effectiveSize(source);
		const grid = Math.max(MINI_BUILD_LIMITS.minBlockSizeGrid, metersToGrid(meters));
		if (clampBlockSize(size, axis, grid) !== grid) return { ok: false, error: EDITOR_ERRORS.flat };
		return this.setBlockGrid(source.id, source.positionGrid, { ...size, [axis]: grid });
	}

	/** Rotates the selected block 90° about an axis, keeping its centre as close as the grid allows. */
	rotateSelected(axis: Axis): EditorResult {
		const source = this.selectedBlock;
		if (!source) return { ok: false, error: EDITOR_ERRORS.noSelection };
		const before = effectiveSize(source);
		const rotation = { ...source.rotation, [axis]: nextQuarterTurn(source.rotation[axis]) };
		const after = effectiveSize({ sizeGrid: source.sizeGrid, rotation });
		const position = { ...source.positionGrid };
		for (const a of AXES) position[a] += Math.floor((before[a] - after[a]) / 2);
		const next = this.blocks.map((block) =>
			block.id === source.id ? { ...cloneBlock(block), rotation, positionGrid: position } : block
		);
		return this.commit(next, this.materials, source.id);
	}

	/**
	 * Applies a whole transform in grid units (drag handles commit through this). `effective` is the
	 * requested world-axis size; it is mapped back through the block's rotation.
	 */
	setBlockGrid(id: string, positionGrid: GridVec3, effective?: GridVec3): EditorResult {
		const source = this.blocks.find((block) => block.id === id);
		if (!source) return { ok: false, error: EDITOR_ERRORS.noSelection };
		const position = {
			x: Math.round(positionGrid.x),
			y: Math.round(positionGrid.y),
			z: Math.round(positionGrid.z)
		};
		const sizeGrid = effective
			? localSizeForEffective(
					{
						x: Math.max(MINI_BUILD_LIMITS.minBlockSizeGrid, Math.round(effective.x)),
						y: Math.max(MINI_BUILD_LIMITS.minBlockSizeGrid, Math.round(effective.y)),
						z: Math.max(MINI_BUILD_LIMITS.minBlockSizeGrid, Math.round(effective.z))
					},
					source.rotation
				)
			: { ...source.sizeGrid };
		const next = this.blocks.map((block) =>
			block.id === id ? { ...cloneBlock(block), positionGrid: position, sizeGrid } : block
		);
		return this.commit(next, this.materials, id);
	}

	/** Checks a transform without applying it — the viewport's live drag preview. */
	previewBlockGrid(id: string, positionGrid: GridVec3, effective: GridVec3): EditorResult {
		const source = this.blocks.find((block) => block.id === id);
		if (!source) return { ok: false, error: EDITOR_ERRORS.noSelection };
		const candidate: MiniBuildBlock = {
			...cloneBlock(source),
			positionGrid: { ...positionGrid },
			sizeGrid: localSizeForEffective(effective, source.rotation)
		};
		return this.check(this.blocks.map((block) => (block.id === id ? candidate : block)));
	}

	setBlockMaterial(slot: number): EditorResult {
		const source = this.selectedBlock;
		if (!source) return { ok: false, error: EDITOR_ERRORS.noSelection };
		if (!Number.isInteger(slot) || slot < 0 || slot >= this.materials.length) {
			return { ok: false, error: 'That material slot does not exist.' };
		}
		if (source.materialSlot === slot) return { ok: true };
		const next = this.blocks.map((block) =>
			block.id === source.id ? { ...cloneBlock(block), materialSlot: slot } : block
		);
		return this.commit(next, this.materials, source.id);
	}

	setBlockCollision(mode: MiniBuildBlockCollision): EditorResult {
		const source = this.selectedBlock;
		if (!source) return { ok: false, error: EDITOR_ERRORS.noSelection };
		const next = this.blocks.map((block) => {
			if (block.id !== source.id) return block;
			const copy = cloneBlock(block);
			if (mode === 'auto') delete copy.collision;
			else copy.collision = mode;
			return copy;
		});
		return this.commit(next, this.materials, source.id);
	}

	addMaterialSlot(): EditorResult {
		if (!this.canAddMaterial) return { ok: false, error: EDITOR_ERRORS.maxMaterials };
		return this.commit(
			this.blocks,
			[...cloneMaterials(this.materials), defaultSlot(this.materials.length)],
			this.selectedBlockId
		);
	}

	removeMaterialSlot(index: number): EditorResult {
		if (this.materials.length <= 1) return { ok: false, error: EDITOR_ERRORS.lastMaterial };
		if (index < 0 || index >= this.materials.length)
			return { ok: false, error: 'That material slot does not exist.' };
		const materials = cloneMaterials(this.materials).filter((_, i) => i !== index);
		const blocks = this.blocks.map((block) => {
			const copy = cloneBlock(block);
			if (copy.materialSlot === index) copy.materialSlot = 0;
			else if (copy.materialSlot > index) copy.materialSlot--;
			return copy;
		});
		return this.commit(blocks, materials, this.selectedBlockId);
	}

	updateMaterialSlot(
		index: number,
		patch: { name?: string; finish?: MiniBuildFinish; color?: string }
	): EditorResult {
		const existing = this.materials[index];
		if (!existing) return { ok: false, error: 'That material slot does not exist.' };
		let material = existing.material;
		if (patch.color !== undefined) {
			try {
				material = colorMaterialFromHex(patch.color);
			} catch {
				return { ok: false, error: 'Invalid colour.' };
			}
		}
		const next: MiniBuildMaterialSlot = {
			name: patch.name !== undefined ? patch.name.slice(0, 32) : existing.name,
			finish: patch.finish ?? existing.finish,
			material
		};
		const materials = cloneMaterials(this.materials);
		materials[index] = next;
		return this.commit(this.blocks, materials, this.selectedBlockId);
	}

	undo(): boolean {
		const snapshot = this.undoStack.pop();
		if (!snapshot) return false;
		this.redoStack.push(this.snapshot());
		this.restore(snapshot);
		return true;
	}

	redo(): boolean {
		const snapshot = this.redoStack.pop();
		if (!snapshot) return false;
		this.undoStack.push(this.snapshot());
		this.restore(snapshot);
		return true;
	}

	private hash(): string {
		return contentHash({ blocks: this.blocks, materials: this.materials }) + (this.semantic ?? '');
	}

	private check(blocks: readonly MiniBuildBlock[]): EditorResult {
		if (blocks.length > MINI_BUILD_LIMITS.maxBlocks)
			return { ok: false, error: EDITOR_ERRORS.maxBlocks };
		for (const block of blocks) {
			if (flatAxisCount(block.sizeGrid) > MINI_BUILD_LIMITS.maxFlatAxesPerBlock)
				return { ok: false, error: EDITOR_ERRORS.flat };
			if (!blockInWorkspace(block)) return { ok: false, error: EDITOR_ERRORS.workspace };
		}
		if (blocks.length > 0 && !boundsFit(computeBounds(blocks)))
			return { ok: false, error: EDITOR_ERRORS.bounds };
		return { ok: true };
	}

	private commit(
		blocks: MiniBuildBlock[],
		materials: MiniBuildMaterialSlot[],
		selectedBlockId: string | null
	): EditorResult {
		const result = this.check(blocks);
		if (!result.ok) return result;
		this.undoStack.push(this.snapshot());
		if (this.undoStack.length > MAX_HISTORY) this.undoStack.shift();
		this.redoStack = [];
		this.blocks = blocks.map(cloneBlock);
		this.materials = cloneMaterials(materials);
		this.selectedBlockId = selectedBlockId;
		this.raiseSelectedPlane();
		this.version++;
		return { ok: true };
	}

	private snapshot(): Snapshot {
		return {
			blocks: this.blocks.map(cloneBlock),
			materials: cloneMaterials(this.materials),
			selectedBlockId: this.selectedBlockId
		};
	}

	private restore(snapshot: Snapshot): void {
		this.blocks = snapshot.blocks.map(cloneBlock);
		this.materials = cloneMaterials(snapshot.materials);
		this.selectedBlockId =
			snapshot.selectedBlockId && this.blocks.some((block) => block.id === snapshot.selectedBlockId)
				? snapshot.selectedBlockId
				: (this.blocks[0]?.id ?? null);
		this.raiseSelectedPlane();
		this.version++;
	}

	/** Designs loaded from elsewhere may sit off-centre; bring them into the editor workspace. */
	private recenterIfOutsideWorkspace(): void {
		if (this.blocks.every(blockInWorkspace)) return;
		const bounds = computeBounds(this.blocks);
		const shiftX = -Math.floor((bounds.min.x + bounds.max.x) / 2);
		const shiftZ = -Math.floor((bounds.min.z + bounds.max.z) / 2);
		this.blocks = this.blocks.map((block) => ({
			...cloneBlock(block),
			positionGrid: {
				x: block.positionGrid.x + shiftX,
				y: block.positionGrid.y - bounds.min.y,
				z: block.positionGrid.z + shiftZ
			}
		}));
	}
}

/**
 * Clamps a requested effective size on one axis: never negative, and never 0 when another axis of
 * the same block is already 0 (a block may be a plane, not a line). Exported for the viewport's drag.
 */
export function clampBlockSize(effective: GridVec3, axis: Axis, requested: number): number {
	const next = Math.max(MINI_BUILD_LIMITS.minBlockSizeGrid, Math.round(requested));
	if (next > 0) return next;
	const othersFlat = AXES.filter((a) => a !== axis && effective[a] === 0).length;
	return othersFlat >= MINI_BUILD_LIMITS.maxFlatAxesPerBlock ? 1 : 0;
}
