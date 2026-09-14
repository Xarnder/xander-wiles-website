import { describe, expect, it } from 'vitest';
import { clampBlockSize, EDITOR_ERRORS, MiniBuildEditorState } from '../MiniBuildEditorState';
import { blockBox, effectiveSize, flatAxis, isPlaneBlock } from '../miniBuildGrid';
import { MINI_BUILD_LIMITS } from '../MiniBuildTypes';
import { testDefinition } from './miniBuildFixtures';

describe('MiniBuildEditorState', () => {
	it('adds a 0.5m cuboid and counts it against the 16-block limit', () => {
		const state = MiniBuildEditorState.createNew();
		expect(state.addBlock()).toEqual({ ok: true });
		expect(state.blockCount).toBe(1);
		expect(state.selectedBlock?.sizeGrid).toEqual({ x: 8, y: 8, z: 8 });
		expect(state.getSizeMeters()).toEqual({ x: 0.5, y: 0.5, z: 0.5 });
	});

	it('rejects the 17th block with a clear message', () => {
		const state = MiniBuildEditorState.createNew();
		state.addBlock();
		state.setSizeMeters('x', 0.125);
		state.setSizeMeters('y', 0.125);
		state.setSizeMeters('z', 0.125);
		for (let i = 1; i < 16; i++) expect(state.duplicateSelected().ok).toBe(true);
		expect(state.blockCount).toBe(16);
		expect(state.canAddBlock).toBe(false);
		expect(state.addBlock()).toEqual({ ok: false, error: EDITOR_ERRORS.maxBlocks });
		expect(state.duplicateSelected()).toEqual({ ok: false, error: EDITOR_ERRORS.maxBlocks });
		expect(state.blockCount).toBe(16);
	});

	it('snaps non-grid numeric input to 0.0625m and stores integers', () => {
		const state = MiniBuildEditorState.createNew();
		state.addBlock();
		expect(state.setPositionMeters('x', 0.3).ok).toBe(true);
		expect(state.selectedBlock?.positionGrid.x).toBe(5);
		expect(state.setSizeMeters('z', 0.93).ok).toBe(true);
		expect(state.selectedBlock?.sizeGrid.z).toBe(15);
		expect(state.resizeSelected('z', 1).ok).toBe(true);
		expect(state.getSizeMeters().z).toBe(1);
		for (const value of Object.values(state.selectedBlock!.positionGrid))
			expect(Number.isInteger(value)).toBe(true);
	});

	it('flattens a block into a plane at size 0, on one axis only', () => {
		const state = MiniBuildEditorState.createNew();
		state.addBlock();
		expect(state.setSizeMeters('y', 0.01).ok).toBe(true);
		expect(state.selectedBlock?.sizeGrid.y).toBe(0);
		expect(isPlaneBlock(state.selectedBlock!)).toBe(true);
		expect(state.validateForSave().ok).toBe(true);

		// A second flat axis would make a line: typed input is refused, dragging stops at one unit.
		expect(state.setSizeMeters('x', 0)).toEqual({ ok: false, error: EDITOR_ERRORS.flat });
		expect(state.selectedBlock?.sizeGrid.x).toBe(8);
		expect(state.resizeSelected('x', -100).ok).toBe(true);
		expect(state.selectedBlock?.sizeGrid).toEqual({ x: 1, y: 0, z: 8 });
		expect(
			state.setBlockGrid(state.selectedBlockId!, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 8 })
		).toEqual({ ok: false, error: EDITOR_ERRORS.flat });
		expect(
			state.previewBlockGrid(state.selectedBlockId!, { x: 0, y: 0, z: 0 }, { x: 8, y: 0, z: 0 }).ok
		).toBe(false);

		// Resizing the flat axis back up restores a cuboid; resizing down again never goes negative.
		expect(state.resizeSelected('y', 3).ok).toBe(true);
		expect(isPlaneBlock(state.selectedBlock!)).toBe(false);
		state.resizeSelected('y', -10);
		expect(state.selectedBlock?.sizeGrid.y).toBe(0);
		expect(state.undo()).toBe(true);
		expect(state.selectedBlock?.sizeGrid.y).toBe(3);
	});

	it('keeps a plane flat through rotations and the min-side resize handle', () => {
		const state = MiniBuildEditorState.createNew();
		state.addBlock();
		state.setPositionMeters('y', 1);
		state.resizeSelected('y', -8, 'min');
		expect(effectiveSize(state.selectedBlock!)).toEqual({ x: 8, y: 0, z: 8 });
		expect(blockBox(state.selectedBlock!).min.y).toBe(24);
		expect(state.rotateSelected('x').ok).toBe(true);
		expect(flatAxis(effectiveSize(state.selectedBlock!))).toBe('z');
	});

	it('puts the last selected of two overlapping planes on top, without dirtying for lone planes', () => {
		const definition = testDefinition([
			[0, 0, 0, 16, 2, 16],
			[2, 2, 2, 12, 0, 12],
			[4, 2, 4, 4, 0, 4],
			[40, 2, 0, 4, 0, 4]
		]);
		const state = MiniBuildEditorState.fromDefinition(definition);
		const layers = () => state.getBlocks().map((block) => block.layer ?? 0);

		state.selectBlock(state.getBlocks()[3].id); // a plane with nothing in the same place
		state.selectBlock(state.getBlocks()[0].id); // a cuboid
		state.selectBlock(state.getBlocks()[1].id); // already on top of plane 2
		expect(state.isDirty).toBe(false);

		state.selectBlock(state.getBlocks()[2].id);
		expect(layers()).toEqual([0, 0, 1, 0]);
		expect(state.isDirty).toBe(true);
		expect(state.canUndo).toBe(false); // selection is not an undo step
		state.selectBlock(state.getBlocks()[1].id);
		expect(layers()[1]).toBeGreaterThan(layers()[2]);
		expect(state.validateForSave().ok).toBe(true);
		expect(state.toDraft().blocks[1].layer).toBeGreaterThan(0);

		// A duplicated plane lands in the same plane and is selected, so it goes on top.
		expect(state.duplicateSelected().ok).toBe(true);
		const copy = state.getBlocks().length - 1;
		expect(layers()[copy]).toBe(Math.max(...layers()));
		// Undo restores the earlier selection, which is raised again.
		state.undo();
		expect(state.selectedBlockId).toBe(state.getBlocks()[1].id);
		expect(layers()[1]).toBeGreaterThan(layers()[2]);
		expect(definition.blocks.every((block) => block.layer === undefined)).toBe(true);
	});

	it('clamps requested sizes: never negative, never a second flat axis', () => {
		expect(clampBlockSize({ x: 8, y: 8, z: 8 }, 'y', -3)).toBe(0);
		expect(clampBlockSize({ x: 8, y: 0, z: 8 }, 'x', 0)).toBe(1);
		expect(clampBlockSize({ x: 8, y: 0, z: 8 }, 'y', 0)).toBe(0);
		expect(clampBlockSize({ x: 8, y: 0, z: 8 }, 'z', 5.4)).toBe(5);
	});

	it('rejects moves and resizes that exceed the 4m bounds', () => {
		const state = MiniBuildEditorState.createNew();
		state.addBlock();
		state.setPositionMeters('x', 0);
		state.duplicateSelected();
		const before = blockBox(state.selectedBlock!);
		const result = state.moveSelected({ x: 80 });
		expect(result.ok).toBe(false);
		expect(blockBox(state.selectedBlock!)).toEqual(before);
		expect(state.setSizeMeters('y', 4.125).ok).toBe(false);
		expect(state.setSizeMeters('y', 4).ok).toBe(true);
		expect(state.moveSelected({ y: -1 }).ok).toBe(false);
	});

	it('rotates in 90° steps keeping the block on the grid', () => {
		const state = MiniBuildEditorState.createNew();
		state.addBlock();
		state.setSizeMeters('x', 1);
		state.setSizeMeters('z', 0.25);
		expect(state.rotateSelected('y').ok).toBe(true);
		const block = state.selectedBlock!;
		expect(block.rotation.y).toBe(90);
		expect(effectiveSize(block)).toEqual({ x: 4, y: 8, z: 16 });
		for (const value of Object.values(blockBox(block).min))
			expect(Number.isInteger(value)).toBe(true);
	});

	it('supports undo and redo of add, move, resize, rotate and material changes', () => {
		const state = MiniBuildEditorState.createNew();
		state.addBlock();
		state.addMaterialSlot();
		state.moveSelected({ x: 1 });
		state.resizeSelected('y', 2);
		state.rotateSelected('y');
		state.setBlockMaterial(1);
		const final = JSON.stringify(state.toDraft());
		let undone = 0;
		while (state.undo()) undone++;
		expect(undone).toBe(6);
		expect(state.blockCount).toBe(0);
		while (state.redo());
		expect(JSON.stringify(state.toDraft())).toBe(final);
	});

	it('limits materials to four and reassigns blocks when a slot is removed', () => {
		const state = MiniBuildEditorState.createNew();
		state.addBlock();
		for (let i = 1; i < MINI_BUILD_LIMITS.maxMaterialSlots; i++)
			expect(state.addMaterialSlot().ok).toBe(true);
		expect(state.addMaterialSlot()).toEqual({ ok: false, error: EDITOR_ERRORS.maxMaterials });
		state.setBlockMaterial(3);
		expect(state.removeMaterialSlot(3).ok).toBe(true);
		expect(state.selectedBlock?.materialSlot).toBe(0);
		expect(state.getMaterials()).toHaveLength(3);
	});

	it('mirror-duplicates across the design centre', () => {
		const state = MiniBuildEditorState.createNew();
		state.addBlock();
		state.setSizeMeters('x', 1);
		state.setPositionMeters('x', 0);
		state.duplicateSelected();
		// A leg at the left edge of a 1m-wide design.
		state.selectBlock(state.getBlocks()[0].id);
		state.setSizeMeters('x', 0.125);
		state.selectBlock(state.getBlocks()[0].id);
		expect(state.mirrorDuplicateX().ok).toBe(true);
		const mirrored = state.selectedBlock!;
		// The duplicate sits 2 units (0.125m) right, so the design spans 0–18 and the leg 0–2.
		expect(blockBox(mirrored).max.x).toBe(18);
	});

	it('is transactional: the source definition is never mutated', () => {
		const definition = testDefinition([[0, 0, 0, 2, 2, 2]]);
		const snapshot = JSON.stringify(definition);
		const state = MiniBuildEditorState.fromDefinition(definition);
		expect(state.isDirty).toBe(false);
		state.moveSelected({ x: 3 });
		state.addBlock();
		expect(state.isDirty).toBe(true);
		expect(JSON.stringify(definition)).toBe(snapshot);
	});

	it('refuses to save an empty design', () => {
		expect(MiniBuildEditorState.createNew().validateForSave().ok).toBe(false);
	});
});
