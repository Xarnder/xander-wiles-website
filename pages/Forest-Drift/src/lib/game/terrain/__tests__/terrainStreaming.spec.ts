import { describe, expect, it } from 'vitest';
import { TerrainChunk } from '../TerrainChunk';
import { TerrainManager } from '../TerrainManager';
import { TerrainHeightSampler } from '../TerrainHeightSampler';
import { createDefaultTerrainSettings } from '../TerrainSettings';

function fixture() {
	const settings = createDefaultTerrainSettings();
	settings.chunkResolution = 4;
	settings.viewDistance = 1;
	settings.chunksGeneratedPerFrame = 2;
	let clock = 0;
	return { settings, manager: new TerrainManager(settings, () => clock++) };
}

describe('incremental terrain generation', () => {
	it('produces exactly the same attributes and bounds as synchronous generation', () => {
		const settings = createDefaultTerrainSettings();
		const sampler = new TerrainHeightSampler(settings);
		const sync = new TerrainChunk(8),
			streamed = new TerrainChunk(8);
		sync.populate(-2, 3, settings.chunkSize, sampler, 7);
		const rows = streamed.populateRows(-2, 3, settings.chunkSize, sampler, 7);
		let steps = 0;
		while (!rows.next().done) steps++;
		expect(steps).toBe(9);
		for (const name of ['position', 'normal', 'color', 'uv', 'aShore'])
			expect(streamed.mesh.geometry.getAttribute(name).array).toEqual(
				sync.mesh.geometry.getAttribute(name).array
			);
		expect(streamed.mesh.geometry.boundingSphere).toEqual(sync.mesh.geometry.boundingSphere);
		sync.dispose();
		streamed.dispose();
	});
	it('keeps incomplete chunks out of rendering and ground lattices', () => {
		const { manager } = fixture();
		manager.update(0, 0);
		expect(manager.getStats().loadedChunks).toBe(0);
		expect(manager.getStats().queuedChunks).toBe(5);
		expect(manager.getSurfaceLattice(0, 0)).toBeNull();
		expect(manager.getActiveMeshes()).toHaveLength(0);
		for (let i = 0; i < 30; i++) manager.update(0, 0);
		expect(manager.getStats().loadedChunks).toBe(5);
		expect(manager.getStats().queuedChunks).toBe(0);
		expect(manager.getSurfaceLattice(0, 0)).not.toBeNull();
		manager.dispose();
	});
	it('retains the previous complete mesh until a changed revision is ready', () => {
		const { manager } = fixture();
		manager.primeAround(0, 0, 0);
		const previous = manager.getActiveMeshes()[0];
		const heights = Array.from(previous.geometry.getAttribute('position').array);
		manager.notifySettingsChanged();
		manager.update(0, 0);
		expect(manager.getActiveMeshes()[0]).toBe(previous);
		expect(Array.from(previous.geometry.getAttribute('position').array)).toEqual(heights);
		expect(manager.getSurfaceLattice(0, 0)).toBeNull();
		for (let i = 0; i < 30; i++) manager.update(0, 0);
		expect(manager.getSurfaceLattice(0, 0)?.positions).not.toBe(
			previous.geometry.getAttribute('position').array
		);
		expect(manager.getSurfaceLattice(0, 0)).not.toBeNull();
		manager.dispose();
	});
	it('cancels unfinished work on travel, settings and topology changes', () => {
		const { manager, settings } = fixture();
		manager.update(0, 0);
		manager.notifySettingsChanged();
		manager.update(100 * settings.chunkSize, 0);
		settings.chunkResolution = 8;
		manager.notifyTopologyChanged();
		for (let i = 0; i < 60; i++) manager.update(100 * settings.chunkSize, 0);
		expect(manager.getStats().loadedChunks).toBe(5);
		expect(manager.getSurfaceLattice(0, 0)).toBeNull();
		for (const mesh of manager.getActiveMeshes())
			expect(mesh.geometry.getAttribute('position').count).toBe(81);
		manager.dispose();
		expect(manager.getStats().queuedChunks).toBe(0);
	});
});
