import { shapeCount, shapeLimit, shapeLimitError } from './miniBuildShapes';
import { createInteraction, validateInteractions } from './MiniBuildInteractions';
import type { MiniBuildInteractionLocation, MiniBuildInteractionType } from './MiniBuildTypes';
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
	angleDeltaUnits,
	AXES,
	blockBox,
	blockCenterGrid,
	blockExtentBox,
	blockInWorkspace,
	boundsFit,
	boundsSizeGrid,
	cloneBlock,
	cloneInteraction,
	cloneMaterials,
	computeBounds,
	contentHash,
	effectiveSize,
	flatAxisCount,
	gridToMeters,
	isAngledBlock,
	localSizeForEffective,
	metersToGrid,
	newId,
	orientationMatrix,
	quarterOf,
	quarterRotation,
	sanitizeName,
	snapAngle,
	stepAngle,
	stepAngleUnit,
	type Axis
} from './miniBuildGrid';
import { raisePlaneLayer } from './miniBuildSurfaces';
import { MINI_BUILD_TEXTURES, type MiniBuildTextureEntry } from './miniBuildTextures';
import { validateMiniBuildDraft } from './MiniBuildValidation';
import {
	MINI_BUILD_LIMITS,
	MINI_BUILD_ROTATION,
	type GridVec3,
	type MiniBuildBlock,
	type MiniBuildBlockCollision,
	type MiniBuildDefinition,
	type MiniBuildDraft,
	type MiniBuildFinish,
	type MiniBuildMaterialSlot,
	type MiniBuildSemanticType,
	type MiniBuildTextureId,
	type SnapAngle
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
	interactionLocations: MiniBuildInteractionLocation[];
	selectedInteractionId: string | null;
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
	private interactionLocations: MiniBuildInteractionLocation[] = [];
	selectedInteractionId: string | null = null;
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
		this.interactionLocations = (draft.interactionLocations ?? []).map(cloneInteraction);
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
			interactionLocations: definition.interactionLocations,
			blocks: definition.blocks,
			materials: definition.materials,
			semanticType: definition.semanticType
		};
		return options.asTemplate
			? new MiniBuildEditorState(draft, null, null)
			: new MiniBuildEditorState(draft, definition.id, definition.revision);
	}

	getInteractions(): readonly MiniBuildInteractionLocation[] {
		return this.interactionLocations;
	}
	get selectedInteraction(): MiniBuildInteractionLocation | undefined {
		return this.interactionLocations.find((l) => l.id === this.selectedInteractionId);
	}
	selectInteraction(id: string | null): void {
		this.selectedBlockId = null;
		this.selectedInteractionId = id;
		this.version++;
	}
	private commitInteractions(
		next: MiniBuildInteractionLocation[],
		selected: string | null
	): EditorResult {
		const validated = validateInteractions(next);
		if (!validated.ok) return validated;
		this.undoStack.push(this.snapshot());
		if (this.undoStack.length > MAX_HISTORY) this.undoStack.shift();
		this.redoStack = [];
		this.interactionLocations = validated.value;
		this.selectInteraction(selected);
		return { ok: true };
	}
	addInteraction(type: MiniBuildInteractionType): EditorResult {
		const block = this.selectedBlock;
		const box = block
			? blockExtentBox(block)
			: this.blocks.length
				? computeBounds(this.blocks)
				: null;
		const position = box
			? {
					x: Math.round((box.min.x + box.max.x) / 2),
					y: Math.ceil(box.max.y),
					z: Math.round((box.min.z + box.max.z) / 2)
				}
			: { x: 0, y: 16, z: 0 };
		const location = createInteraction(type, position);
		return this.commitInteractions([...this.interactionLocations, location], location.id);
	}
	updateInteraction(
		id: string,
		changes: Partial<Pick<MiniBuildInteractionLocation, 'positionGrid' | 'rotationY' | 'enabled'>>
	): EditorResult {
		return this.commitInteractions(
			this.interactionLocations.map((l) => (l.id === id ? { ...l, ...changes } : l)),
			id
		);
	}
	deleteInteraction(): EditorResult {
		return this.commitInteractions(
			this.interactionLocations.filter((l) => l.id !== this.selectedInteractionId),
			null
		);
	}
	duplicateInteraction(): EditorResult {
		const source = this.selectedInteraction;
		if (!source) return { ok: false, error: 'Select an interaction first.' };
		const copy = cloneInteraction(source);
		copy.id = newId();
		copy.positionGrid.x += 4;
		return this.commitInteractions([...this.interactionLocations, copy], copy.id);
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
		return shapeCount(this.blocks, 'cuboid') < MINI_BUILD_LIMITS.maxBlocks;
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
			interactionLocations: this.interactionLocations.map(cloneInteraction),
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
		this.selectedInteractionId = null;
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

	addBlock(shape: NonNullable<MiniBuildBlock['shape']> = 'cuboid'): EditorResult {
		if (shapeCount(this.blocks, shape) >= shapeLimit(shape))
			return {
				ok: false,
				error: `Maximum ${shapeLimit(shape)} ${shape === 'cuboid' ? 'blocks' : shape + 's'}.`
			};
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
		for (const sizeGrid of [size, 8, 4, 2, 1]) {
			for (const position of candidates) {
				const block: MiniBuildBlock = {
					id: newId(),
					shape,
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
		if (this.selectedInteraction) return this.duplicateInteraction();
		const source = this.selectedBlock;
		if (!source) return { ok: false, error: EDITOR_ERRORS.noSelection };
		const limitError = shapeLimitError([...this.blocks, source]);
		if (limitError) return { ok: false, error: limitError };
		// Four grid units (0.125m) so the copy is visibly offset; smaller steps as fallbacks near the edges.
		const offsets: GridVec3[] = [4, 2, 1].flatMap((d) => [
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
		const limitError = shapeLimitError([...this.blocks, source]);
		if (limitError) return { ok: false, error: limitError };
		const bounds = computeBounds(this.blocks);
		const copy = cloneBlock(source);
		copy.id = newId();
		if (isAngledBlock(source)) {
			// Mirroring across X turns Rz·Rx·Ry into Rz(−z)·Rx(x)·Ry(−y); the cuboid itself is symmetric.
			copy.rotation = {
				x: source.rotation.x,
				y: snapAngle(-source.rotation.y),
				z: snapAngle(-source.rotation.z)
			};
			const centre = blockCenterGrid(source);
			const size = effectiveSize(copy);
			copy.positionGrid = {
				x: Math.round(bounds.min.x + bounds.max.x - centre.x - size.x / 2),
				y: Math.round(centre.y - size.y / 2),
				z: Math.round(centre.z - size.z / 2)
			};
		} else {
			const box = blockBox(source);
			copy.positionGrid = { ...source.positionGrid, x: bounds.min.x + bounds.max.x - box.max.x };
		}
		if (
			copy.positionGrid.x === source.positionGrid.x &&
			JSON.stringify(copy.rotation) === JSON.stringify(source.rotation)
		)
			copy.positionGrid.x += Math.max(1, effectiveSize(source).x);
		return this.commit([...this.blocks, copy], this.materials, copy.id);
	}

	deleteSelected(): EditorResult {
		if (this.selectedInteraction) return this.deleteInteraction();
		const source = this.selectedBlock;
		if (!source) return { ok: false, error: EDITOR_ERRORS.noSelection };
		const index = this.blocks.indexOf(source);
		const remaining = this.blocks.filter((block) => block !== source);
		const nextSelection = remaining[Math.min(index, remaining.length - 1)]?.id ?? null;
		return this.commit(remaining, this.materials, nextSelection);
	}

	moveSelected(delta: Partial<GridVec3>): EditorResult {
		const location = this.selectedInteraction;
		if (location)
			return this.updateInteraction(location.id, {
				positionGrid: {
					x: location.positionGrid.x + (delta.x ?? 0),
					y: location.positionGrid.y + (delta.y ?? 0),
					z: location.positionGrid.z + (delta.z ?? 0)
				}
			});
		const source = this.selectedBlock;
		if (!source) return { ok: false, error: EDITOR_ERRORS.noSelection };
		return this.setBlockGrid(source.id, {
			x: source.positionGrid.x + (delta.x ?? 0),
			y: source.positionGrid.y + (delta.y ?? 0),
			z: source.positionGrid.z + (delta.z ?? 0)
		});
	}

	/** Numeric panel input in metres — snapped to the 0.03125m grid before it is ever stored. */
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
		if (isAngledBlock(source)) {
			// An angled block grows along whichever of its own axes is closest to the world axis.
			const { localAxis, sign } = nearestLocalAxis(source, axis);
			const next = resizeBlockLocal(
				source,
				localAxis,
				deltaGrid,
				(side === 'max' ? sign : -sign) as 1 | -1
			);
			return this.setBlockGrid(source.id, next.positionGrid, next.effective);
		}
		const size = effectiveSize(source);
		const nextSize = clampBlockSize(size, axis, size[axis] + deltaGrid);
		const applied = nextSize - size[axis];
		const position = { ...source.positionGrid };
		if (side === 'min') position[axis] -= applied;
		return this.setBlockGrid(source.id, position, { ...size, [axis]: nextSize });
	}

	/**
	 * Size along a world axis. An angled block has no world-axis size, so for it `axis` names one of
	 * the block's own axes (the panel labels them so) and the block grows about its centre.
	 */
	setSizeMeters(axis: Axis, meters: number): EditorResult {
		const source = this.selectedBlock;
		if (!source) return { ok: false, error: EDITOR_ERRORS.noSelection };
		if (isAngledBlock(source)) {
			const grid = Math.max(MINI_BUILD_LIMITS.minBlockSizeGrid, metersToGrid(meters));
			if (clampBlockSize(source.sizeGrid, axis, grid) !== grid)
				return { ok: false, error: EDITOR_ERRORS.flat };
			const next = resizeBlockLocal(
				source,
				AXES.indexOf(axis) as 0 | 1 | 2,
				grid - source.sizeGrid[axis],
				0
			);
			return this.setBlockGrid(source.id, next.positionGrid, next.effective);
		}
		const size = effectiveSize(source);
		const grid = Math.max(MINI_BUILD_LIMITS.minBlockSizeGrid, metersToGrid(meters));
		if (clampBlockSize(size, axis, grid) !== grid) return { ok: false, error: EDITOR_ERRORS.flat };
		return this.setBlockGrid(source.id, source.positionGrid, { ...size, [axis]: grid });
	}

	/**
	 * Rotates the selected block one snap step (`step` degrees, 90° by default) about an axis, keeping
	 * its centre where it is (see `rotateBlockTo`). An angle set with a finer step first snaps to the
	 * next angle on this step's grid.
	 */
	rotateSelected(
		axis: Axis,
		direction: 1 | -1 = 1,
		step: number = MINI_BUILD_ROTATION.defaultStep
	): EditorResult {
		const location = this.selectedInteraction;
		if (location)
			return axis === 'y'
				? this.updateInteraction(location.id, {
						rotationY: stepAngle(location.rotationY, step, direction)
					})
				: { ok: false, error: 'Interaction planes stay horizontal. Rotate them around Y.' };
		const source = this.selectedBlock;
		if (!source) return { ok: false, error: EDITOR_ERRORS.noSelection };
		return this.setBlockAngle(source.id, axis, stepAngle(source.rotation[axis], step, direction));
	}

	/** Typed angle for the selected block, snapped to `step` (default: the 7.5° unit). */
	setRotationDegrees(
		axis: Axis,
		degrees: number,
		step: number = MINI_BUILD_ROTATION.unitDegrees
	): EditorResult {
		const source = this.selectedBlock;
		if (!source) return { ok: false, error: EDITOR_ERRORS.noSelection };
		return this.setBlockAngle(source.id, axis, snapAngle(degrees, step));
	}

	/** Turns one block to `angle` about one axis — one undo step, however far it turns. */
	setBlockAngle(id: string, axis: Axis, angle: SnapAngle): EditorResult {
		const source = this.blocks.find((block) => block.id === id);
		if (!source) return { ok: false, error: EDITOR_ERRORS.noSelection };
		const turned = turnBlock(source, axis, angle);
		if (turned.rotation[axis] === source.rotation[axis]) return { ok: true };
		const next = this.blocks.map((block) => (block.id === id ? turned : block));
		return this.commit(next, this.materials, id);
	}

	/** Checks a rotation without applying it — the viewport's rotation-ring preview. */
	previewBlockAngle(id: string, axis: Axis, angle: SnapAngle): EditorResult {
		const source = this.blocks.find((block) => block.id === id);
		if (!source) return { ok: false, error: EDITOR_ERRORS.noSelection };
		const turned = turnBlock(source, axis, angle);
		return this.check(this.blocks.map((block) => (block.id === id ? turned : block)));
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
		const candidate = withGridTransform(source, positionGrid, effective);
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

	/**
	 * Picking a texture (not Auto / Flat) also sets the colour to the texture's natural swatch — the
	 * colour tints the texture, so this starts it looking like itself; recolour it afterwards — and
	 * moves the finish into line where the texture implies one (glass is transparent, wood is wood).
	 */
	updateMaterialSlot(
		index: number,
		patch: { name?: string; finish?: MiniBuildFinish; color?: string; texture?: MiniBuildTextureId }
	): EditorResult {
		const existing = this.materials[index];
		if (!existing) return { ok: false, error: 'That material slot does not exist.' };
		let material = existing.material;
		let finish = patch.finish ?? existing.finish;
		let texture = existing.texture;
		if (patch.texture !== undefined && patch.texture !== (existing.texture ?? 'auto')) {
			texture = patch.texture === 'auto' ? undefined : patch.texture;
			if (patch.texture !== 'auto' && patch.texture !== 'flat') {
				const entry = MINI_BUILD_TEXTURES[patch.texture];
				material = colorMaterialFromHex(entry.swatch);
				if (patch.finish === undefined) finish = finishForTexture(entry.group, finish);
			}
		}
		if (patch.color !== undefined) {
			try {
				material = colorMaterialFromHex(patch.color);
			} catch {
				return { ok: false, error: 'Invalid colour.' };
			}
		}
		const next: MiniBuildMaterialSlot = {
			name: patch.name !== undefined ? patch.name.slice(0, 32) : existing.name,
			finish,
			material,
			...(texture ? { texture } : {})
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
		return (
			contentHash({ blocks: this.blocks, materials: this.materials }) +
			(this.semantic ?? '') +
			JSON.stringify(this.interactionLocations)
		);
	}

	private check(blocks: readonly MiniBuildBlock[]): EditorResult {
		const limitError = shapeLimitError(blocks);
		if (limitError) return { ok: false, error: limitError };
		for (const block of blocks) {
			if (block.shape && block.shape !== 'cuboid' && flatAxisCount(block.sizeGrid))
				return { ok: false, error: 'Cylinders and spheres need positive size on all axes.' };
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
		if (selectedBlockId) this.selectedInteractionId = null;
		this.raiseSelectedPlane();
		this.version++;
		return { ok: true };
	}

	private snapshot(): Snapshot {
		return {
			interactionLocations: this.interactionLocations.map(cloneInteraction),
			selectedInteractionId: this.selectedInteractionId,
			blocks: this.blocks.map(cloneBlock),
			materials: cloneMaterials(this.materials),
			selectedBlockId: this.selectedBlockId
		};
	}

	private restore(snapshot: Snapshot): void {
		this.interactionLocations = snapshot.interactionLocations.map(cloneInteraction);
		this.selectedInteractionId = snapshot.selectedInteractionId;
		this.blocks = snapshot.blocks.map(cloneBlock);
		this.materials = cloneMaterials(snapshot.materials);
		this.selectedBlockId =
			snapshot.selectedBlockId && this.blocks.some((block) => block.id === snapshot.selectedBlockId)
				? snapshot.selectedBlockId
				: (this.blocks[0]?.id ?? null);
		if (this.selectedInteractionId) this.selectedBlockId = null;
		this.raiseSelectedPlane();
		this.version++;
	}

	/** Designs loaded from elsewhere may sit off-centre; bring them into the editor workspace. */
	private recenterIfOutsideWorkspace(): void {
		if (this.blocks.every(blockInWorkspace)) return;
		const bounds = computeBounds(this.blocks);
		const shiftX = -Math.floor((bounds.min.x + bounds.max.x) / 2);
		const shiftZ = -Math.floor((bounds.min.z + bounds.max.z) / 2);
		for (const location of this.interactionLocations) {
			location.positionGrid.x += shiftX;
			location.positionGrid.y -= bounds.min.y;
			location.positionGrid.z += shiftZ;
		}
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

/** A copy of `block` with a new grid-box min corner and effective size (mapped back to local size). */
export function withGridTransform(
	block: MiniBuildBlock,
	positionGrid: GridVec3,
	effective: GridVec3
): MiniBuildBlock {
	return {
		...cloneBlock(block),
		positionGrid: { ...positionGrid },
		sizeGrid: localSizeForEffective(effective, block.rotation)
	};
}

/**
 * Turns a block about one axis to `angle`, one 7.5° unit at a time along the shorter way round.
 *
 * Inside a quarter turn only the visible cuboid turns — the grid box, and so the position, stays put
 * and the block turns exactly about its centre. Each time the angle crosses a quarter turn the grid
 * box's extents swap, and its min corner moves to keep the centre fixed. When that would put the
 * corner on a half unit it rounds down on one crossing and up on the next (by the parity of the
 * quarter turns), so the half units cancel: spinning a block all the way round on any axis, in any
 * step, brings it back to exactly where it started.
 */
export function rotateBlockTo(block: MiniBuildBlock, axis: Axis, angle: SnapAngle): MiniBuildBlock {
	let current = cloneBlock(block);
	let remaining = angleDeltaUnits(current.rotation[axis], angle);
	while (remaining !== 0) {
		const direction = remaining > 0 ? 1 : -1;
		remaining -= direction;
		const rotation = {
			...current.rotation,
			[axis]: stepAngleUnit(current.rotation[axis], direction)
		};
		const position = { ...current.positionGrid };
		if (quarterOf(rotation[axis]) !== quarterOf(current.rotation[axis])) {
			const before = effectiveSize(current);
			const after = effectiveSize({ sizeGrid: current.sizeGrid, rotation });
			const q = quarterRotation(rotation);
			const odd = ((q.x + q.y + q.z) / 90) % 2 === 1;
			for (const a of AXES) {
				const half = (before[a] - after[a]) / 2;
				position[a] += odd ? Math.floor(half) : Math.ceil(half);
			}
		}
		current = { ...current, rotation, positionGrid: position };
	}
	return cloneBlock(current);
}

/**
 * `rotateBlockTo` as the editor applies it: a turn that would sink part of the block below the floor
 * (standing a plank up, tilting a block that rests on the floor) lifts it just onto the floor
 * instead of being refused.
 */
export function turnBlock(block: MiniBuildBlock, axis: Axis, angle: SnapAngle): MiniBuildBlock {
	const turned = rotateBlockTo(block, axis, angle);
	const below = -blockExtentBox(turned).min.y;
	if (below > 0) turned.positionGrid.y += below;
	return turned;
}

/** The block's own axis most nearly along a world axis, and which way it points. */
export function nearestLocalAxis(
	block: Pick<MiniBuildBlock, 'rotation'>,
	axis: Axis
): { localAxis: 0 | 1 | 2; sign: 1 | -1 } {
	const m = orientationMatrix(block.rotation);
	const row = AXES.indexOf(axis) * 3;
	let best: 0 | 1 | 2 = 0;
	for (const k of [1, 2] as const) if (Math.abs(m[row + k]) > Math.abs(m[row + best])) best = k;
	return { localAxis: best, sign: m[row + best] < 0 ? -1 : 1 };
}

/**
 * Resizes a block along one of its own axes. `side` +1 moves the face on the positive end of that
 * axis (the other face stays put), −1 the negative end, 0 grows about the centre. Returns the grid
 * transform for `setBlockGrid` / `previewBlockGrid`; an angled block's moved centre is rounded to
 * the nearest grid position.
 */
export function resizeBlockLocal(
	block: MiniBuildBlock,
	localAxis: 0 | 1 | 2,
	deltaGrid: number,
	side: 1 | -1 | 0
): { positionGrid: GridVec3; effective: GridVec3 } {
	const axis = AXES[localAxis];
	const sizeGrid = {
		...block.sizeGrid,
		[axis]: clampBlockSize(block.sizeGrid, axis, block.sizeGrid[axis] + deltaGrid)
	};
	const applied = sizeGrid[axis] - block.sizeGrid[axis];
	const m = orientationMatrix(block.rotation);
	const centre = blockCenterGrid(block);
	const shift = (side * applied) / 2;
	const effective = effectiveSize({ sizeGrid, rotation: block.rotation });
	const positionGrid = {
		x: Math.round(centre.x + m[localAxis] * shift - effective.x / 2),
		y: Math.round(centre.y + m[3 + localAxis] * shift - effective.y / 2),
		z: Math.round(centre.z + m[6 + localAxis] * shift - effective.z / 2)
	};
	return { positionGrid, effective };
}

/** The finish a picked texture implies; plaster and ground keep any finish but glass or metal. */
function finishForTexture(
	group: MiniBuildTextureEntry['group'],
	current: MiniBuildFinish
): MiniBuildFinish {
	if (group === 'Fabric') return 'fabric';
	if (group === 'Wood') return 'wood';
	if (group === 'Stone') return 'stone';
	if (group === 'Glass') return 'glass';
	return current === 'glass' || current === 'metal' ? 'plain' : current;
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
