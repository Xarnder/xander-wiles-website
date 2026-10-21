import { afterEach, describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { ShovelTool } from '../ShovelTool';
import { TerrainEdits } from '../TerrainEdits';
import { BuildUndoManager } from '../../building/BuildUndoManager';
import type { BuildingManager } from '../../building/BuildingManager';

afterEach(() => vi.unstubAllGlobals());
function harness() {
	const win = new EventTarget(),
		doc = new EventTarget();
	vi.stubGlobal('window', win);
	vi.stubGlobal('document', doc);
	const scene = new THREE.Scene(),
		camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
	camera.position.set(0, 8, 0);
	camera.lookAt(0, 0, 0);
	camera.updateMatrixWorld(true);
	const mesh = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshBasicMaterial());
	mesh.rotateX(-Math.PI / 2);
	mesh.updateMatrixWorld(true);
	const edits = new TerrainEdits(2),
		undo = new BuildUndoManager({} as BuildingManager);
	const tool = new ShovelTool({
		scene,
		camera,
		edits,
		undo,
		meshes: () => [mesh],
		sample: (x, z) => edits.sample(x, z, 0, () => 0),
		allowed: () => null,
		prepare: () => {},
		changed: () => {},
		canUse: () => true,
		heldInput: () => true
	});
	tool.settings.point = true;
	tool.activate();
	tool.update();
	const dispose = () => {
		tool.dispose();
		undo.dispose();
		mesh.geometry.dispose();
		mesh.material.dispose();
	};
	return { win, doc, edits, undo, tool, dispose };
}
describe('shovel input transactions', () => {
	it('commits a held gesture on release as one undo/redo entry', () => {
		const h = harness();
		h.tool.onPrimaryAction();
		expect(h.edits.get(0, 0)).toBe(0.125);
		expect(h.edits.serialize().points).toEqual([]);
		h.win.dispatchEvent(new Event('mouseup'));
		expect(h.edits.serialize().points).toEqual([[0, 0, 0.125]]);
		expect(h.undo.undo()).toBe(true);
		expect(h.edits.serialize().points).toEqual([]);
		expect(h.undo.redo()).toBe(true);
		expect(h.edits.get(0, 0)).toBe(0.125);
		h.dispose();
	});
	it.each(['Escape', 'blur', 'deactivate', 'settings'])(
		'cancels unfinished digging on %s',
		(action) => {
			const h = harness();
			h.tool.onSecondaryAction();
			expect(h.edits.get(0, 0)).toBe(-0.125);
			if (action === 'Escape')
				h.win.dispatchEvent(Object.assign(new Event('keydown'), { code: 'Escape' }));
			else if (action === 'blur') h.win.dispatchEvent(new Event('blur'));
			else if (action === 'deactivate') h.tool.deactivate();
			else h.tool.prepareForCustomize();
			expect(h.edits.serialize().points).toEqual([]);
			expect(h.undo.undo()).toBe(false);
			h.dispose();
		}
	);
	it('does not undo another writer’s later terrain change', () => {
		const h = harness();
		h.tool.onPrimaryAction();
		h.win.dispatchEvent(new Event('mouseup'));
		h.edits.apply({
			patches: [{ x: 0, z: 0, before: 0.125, after: 0.25 }],
			bounds: { minX: -2, maxX: 2, minZ: -2, maxZ: 2 }
		});
		expect(h.undo.undo()).toBe(false);
		expect(h.edits.get(0, 0)).toBe(0.25);
		h.dispose();
	});
});
