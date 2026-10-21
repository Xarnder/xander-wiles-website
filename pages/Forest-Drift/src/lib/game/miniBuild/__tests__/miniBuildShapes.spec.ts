import { describe, expect, it } from 'vitest';
import { MiniBuildEditorState } from '../MiniBuildEditorState';
import { compileMiniBuildData } from '../MiniBuildCompiler';
import { validateMiniBuildDefinition } from '../MiniBuildValidation';
import { cloneBlock, contentHash } from '../miniBuildGrid';
import { testDefinition } from './miniBuildFixtures';

describe('limited low-poly Mini Build shapes', () => {
	it('allows 16 cuboids plus four cylinders and two spheres, including duplicate limits and undo', () => {
		const state = MiniBuildEditorState.createNew();
		for (let i = 0; i < 16; i++) expect(state.addBlock().ok).toBe(true);
		for (let i = 0; i < 4; i++) expect(state.addBlock('cylinder').ok).toBe(true);
		expect(state.addBlock('cylinder').ok).toBe(false);
		expect(state.duplicateSelected().ok).toBe(false);
		expect(state.mirrorDuplicateX().ok).toBe(false);
		for (let i = 0; i < 2; i++) expect(state.addBlock('sphere').ok).toBe(true);
		expect(state.addBlock('sphere').ok).toBe(false);
		expect(state.blockCount).toBe(22);
		expect(state.validateForSave().ok).toBe(true);
		state.undo();
		expect(state.blockCount).toBe(21);
		state.redo();
		expect(state.selectedBlock?.shape).toBe('sphere');
	});
	for (const shape of ['cylinder', 'sphere'] as const) {
		it(`${shape} uses existing grid transforms and survives serialization`, () => {
			const state = MiniBuildEditorState.createNew();
			state.addBlock(shape);
			expect(state.setPositionMeters('x', 0.3).ok).toBe(true);
			expect(state.setSizeMeters('z', 0.93).ok).toBe(true);
			expect(state.selectedBlock?.positionGrid.x).toBe(10);
			expect(state.selectedBlock?.sizeGrid.z).toBe(30);
			expect(state.setSizeMeters('y', 0).ok).toBe(false);
			const d = testDefinition([[0, 0, 0, 16, 16, 16]]);
			d.blocks = [cloneBlock(state.selectedBlock!)];
			d.blocks[0].rotation = { x: 7.5, y: 22.5, z: 45 };
			const loaded = validateMiniBuildDefinition(JSON.parse(JSON.stringify(d)));
			expect(loaded.ok).toBe(true);
			if (loaded.ok) expect(loaded.value.blocks[0].shape).toBe(shape);
			const compiled = compileMiniBuildData(d);
			expect(compiled.groups).toHaveLength(1);
			expect(compiled.groups[0].indices.length / 3).toBe(shape === 'cylinder' ? 32 : 48);
			expect([...compiled.groups[0].normals].every(Number.isFinite)).toBe(true);
			const hash = contentHash(d);
			delete d.blocks[0].shape;
			expect(contentHash(d)).not.toBe(hash);
		});
	}
	it('rejects excessive or unknown imported shapes and fractional grid positions', () => {
		for (const [shape, count] of [
			['cylinder', 5],
			['sphere', 3]
		] as const) {
			const d = testDefinition(Array.from({ length: count }, () => [0, 0, 0, 8, 8, 8]));
			d.blocks.forEach((b) => (b.shape = shape));
			expect(validateMiniBuildDefinition(d).ok).toBe(false);
			expect(() => compileMiniBuildData(d)).toThrow();
		}
		const d = testDefinition([[0, 0, 0, 8, 8, 8]]);
		expect(
			validateMiniBuildDefinition({ ...d, blocks: [{ ...d.blocks[0], shape: 'torus' }] }).ok
		).toBe(false);
		d.blocks[0].shape = 'sphere';
		d.blocks[0].positionGrid.x = 0.5;
		expect(validateMiniBuildDefinition(d).ok).toBe(false);
	});
	it('curved shapes never occlude cuboid faces using their bounding boxes', () => {
		const d = testDefinition([
			[0, 0, 0, 8, 8, 8],
			[8, 0, 0, 8, 8, 8]
		]);
		d.blocks[1].shape = 'cylinder';
		const data = compileMiniBuildData(d);
		expect(data.groups[0].indices.length / 3).toBe(12 + 32);
	});
});
