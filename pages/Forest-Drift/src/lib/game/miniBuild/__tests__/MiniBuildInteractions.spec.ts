import { describe, expect, it } from 'vitest';
import {
	createInteraction,
	resolveMiniBuildInteraction,
	validateInteractions
} from '../MiniBuildInteractions';
import { testDefinition } from './miniBuildFixtures';
import { validateMiniBuildDefinition } from '../MiniBuildValidation';
import { MiniBuildEditorState } from '../MiniBuildEditorState';
import { MiniBuildLibrary } from '../MiniBuildLibrary';
import { contentHash } from '../miniBuildGrid';
import { miniBuildAssetKey } from '../MiniBuildAssetCache';

const chair = () => testDefinition([[0, 0, 0, 32, 16, 32]], { unit: 1 });
describe('authored interaction data', () => {
	it('migrates old definitions without inferring interactions from furniture geometry', () => {
		const old = { ...chair(), schemaVersion: 4 };
		const result = validateMiniBuildDefinition(old);
		expect(result.ok && result.value.interactionLocations).toEqual([]);
	});
	it('round trips enabled, rotated, stable IDs and strips runtime-only data', () => {
		const location = {
			...createInteraction('sit', { x: 16, y: 16, z: 16 }),
			rotationY: 37.5,
			occupiedBy: 'bad',
			cameraOffset: { x: 4 }
		};
		const result = validateMiniBuildDefinition(
			JSON.parse(JSON.stringify({ ...chair(), interactionLocations: [location] }))
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.interactionLocations?.[0]).toEqual({
			...location,
			occupiedBy: undefined,
			cameraOffset: undefined
		});
		expect(Object.keys(result.value.interactionLocations![0])).not.toContain('occupiedBy');
	});
	it.each([
		['duplicate IDs', (a: ReturnType<typeof createInteraction>) => [a, a]],
		[
			'non-finite position',
			(a: ReturnType<typeof createInteraction>) => [
				{ ...a, positionGrid: { x: Infinity, y: 0, z: 0 } }
			]
		],
		['unsnapped rotation', (a: ReturnType<typeof createInteraction>) => [{ ...a, rotationY: 13 }]],
		['unsupported type', (a: ReturnType<typeof createInteraction>) => [{ ...a, type: 'dance' }]],
		[
			'negative collider',
			(a: ReturnType<typeof createInteraction>) => [
				{ ...a, collider: { ...a.collider, sizeGrid: { x: -1, y: 1, z: 1 } } }
			]
		],
		[
			'unsupported collider',
			(a: ReturnType<typeof createInteraction>) => [
				{ ...a, collider: { ...a.collider, type: 'capsule' } }
			]
		],
		[
			'limit',
			(a: ReturnType<typeof createInteraction>) =>
				Array.from({ length: 9 }, (_, i) => ({ ...a, id: String(i) }))
		]
	])('rejects %s', (_label, mutate) =>
		expect(validateInteractions(mutate(createInteraction('sit', { x: 0, y: 0, z: 0 }))).ok).toBe(
			false
		)
	);
	it.each([0, 90, 180, 270, 37.5])('composes instance and local yaw at %s degrees', (yaw) => {
		const definition = chair(),
			location = createInteraction('lie', { x: 32, y: 16, z: 16 });
		location.rotationY = 90;
		const resolved = resolveMiniBuildInteraction(
			definition,
			{ id: 'i', designId: definition.id, position: { x: 10, y: 2, z: 20 }, rotationY: yaw },
			location
		);
		expect(resolved.position.x).toBeCloseTo(10 + Math.cos((yaw * Math.PI) / 180) * 0.5);
		expect(resolved.position.z).toBeCloseTo(20 - Math.sin((yaw * Math.PI) / 180) * 0.5);
		expect(resolved.position.y).toBe(2.5);
		expect(resolved.yaw).toBeCloseTo(((yaw + 90) * Math.PI) / 180);
	});
	it('preserves relative anchors when grounding elevated geometry', () => {
		const definition = testDefinition([[0, 16, 0, 32, 16, 32]], { unit: 1 });
		const result = validateMiniBuildDefinition({
			...definition,
			interactionLocations: [createInteraction('sit', { x: 16, y: 32, z: 16 })]
		});
		expect(result.ok && result.value.interactionLocations![0].positionGrid.y).toBe(16);
	});
	it('edits, rotates, duplicates, deletes and undoes anchors without spending block budget', () => {
		const state = MiniBuildEditorState.fromDefinition(chair());
		state.addInteraction('sit');
		const id = state.selectedInteraction!.id;
		expect(state.blockCount).toBe(1);
		state.moveSelected({ x: 4 });
		state.rotateSelected('y', 1, 90);
		expect(state.selectedInteraction!.rotationY).toBe(90);
		state.duplicateSelected();
		expect(state.getInteractions()).toHaveLength(2);
		expect(state.selectedInteraction!.id).not.toBe(id);
		state.deleteSelected();
		expect(state.getInteractions()).toHaveLength(1);
		state.undo();
		expect(state.getInteractions()).toHaveLength(2);
		state.redo();
		expect(state.getInteractions()).toHaveLength(1);
		expect(state.toDraft().interactionLocations?.[0].id).toBe(id);
	});
	it('retains compiled geometry identity on interaction-only revisions, and copies anchors independently', () => {
		const library = new MiniBuildLibrary();
		const original = chair();
		library.load([original]);
		const draft = {
			...original,
			interactionLocations: [createInteraction('sit', { x: 16, y: 16, z: 16 })]
		};
		const updated = library.update(original.id, draft);
		expect(updated.ok).toBe(true);
		if (!updated.ok) return;
		expect(updated.value.revision).toBe(2);
		expect(contentHash(updated.value)).toBe(contentHash(original));
		expect(miniBuildAssetKey(updated.value)).toBe(miniBuildAssetKey(original));
		const copy = library.duplicate(original.id);
		expect(copy.ok).toBe(true);
		if (!copy.ok) return;
		expect(copy.value.interactionLocations).toEqual(updated.value.interactionLocations);
		expect(copy.value.interactionLocations).not.toBe(updated.value.interactionLocations);
	});
});
