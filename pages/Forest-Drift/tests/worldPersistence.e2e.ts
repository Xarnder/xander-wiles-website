import { expect, test, type Page } from '@playwright/test';
import { createAndEnterWorld, openPauseMenu, openWorldNamed, waitForSaved } from './worldHelpers';

const DB_NAME = 'forest-drift-worlds';

/**
 * Reads a stored world straight out of IndexedDB, so assertions are about what is actually on disk
 * rather than about what the UI believes.
 */
async function readStoredWorld(page: Page, worldName: string) {
	return page.evaluate(
		([dbName, name]) =>
			new Promise<{
				id: string;
				seed: string;
				saveRevision: number;
				byteSize: number;
				foundations: number;
				walls: number;
				removedTreeIds: number;
				hasTerrainVertices: boolean;
				hasMeshData: boolean;
				keys: string[];
			} | null>((resolve, reject) => {
				const request = indexedDB.open(dbName);
				request.onerror = () => reject(new Error('cannot open db'));
				request.onsuccess = () => {
					const db = request.result;
					const tx = db.transaction('worlds', 'readonly');
					const all = tx.objectStore('worlds').getAll();
					all.onsuccess = () => {
						const world = all.result.find((candidate) => candidate.name === name);
						if (!world) {
							resolve(null);
							return;
						}
						const json = JSON.stringify(world);
						resolve({
							id: world.id,
							seed: world.seed,
							saveRevision: world.saveRevision,
							byteSize: json.length,
							foundations: world.foundations.length,
							walls: world.buildings.reduce(
								(total: number, b: { walls: unknown[] }) => total + b.walls.length,
								0
							),
							removedTreeIds: world.proceduralOverrides.removedTreeIds.length,
							// Nothing regenerable may ever appear in a save.
							hasTerrainVertices: /"positions"|"vertices"|"instanceMatrix"/.test(json),
							hasMeshData: /"geometry"|"BufferGeometry"|"__threeObj"/.test(json),
							keys: Object.keys(world).sort()
						});
					};
					all.onerror = () => reject(new Error('cannot read worlds'));
				};
			}),
		[DB_NAME, worldName] as const
	);
}

/** Injects authored buildings into a stored world, to test the *load* path without needing pointer lock. */
async function addBuildingsToStoredWorld(page: Page, worldName: string, wallCount: number) {
	return page.evaluate(
		([dbName, name, count]) =>
			new Promise<number>((resolve, reject) => {
				const request = indexedDB.open(dbName);
				request.onerror = () => reject(new Error('cannot open db'));
				request.onsuccess = () => {
					const db = request.result;
					const readTx = db.transaction('worlds', 'readonly');
					const all = readTx.objectStore('worlds').getAll();
					all.onsuccess = () => {
						const world = all.result.find((candidate) => candidate.name === name);
						if (!world) {
							reject(new Error('world not found'));
							return;
						}

						world.foundations = [
							{
								id: 'f-1',
								minGridX: -6,
								maxGridX: 6,
								minGridZ: -6,
								maxGridZ: 6,
								topY: world.player.position.y ?? 0,
								bottomY: (world.player.position.y ?? 0) - 6,
								material: { type: 'color', color: '#8a8578' }
							}
						];
						world.buildings = [
							{
								foundationId: 'f-1',
								walls: Array.from({ length: count as number }, (_, i) => ({
									id: `w-${i}`,
									foundationId: 'f-1',
									startGridX: -4 + i,
									startGridZ: -4,
									endGridX: -4 + i,
									endGridZ: 4,
									baseY: 0,
									height: 2.6,
									thickness: 0.2,
									openings: [
										{ id: `o-${i}`, type: 'window', minU: 1, maxU: 2, minY: 0.9, maxY: 2 }
									],
									material: { type: 'color', color: '#d9d1c3' }
								})),
								wallPaths: [],
								slabs: [],
								stairs: []
							}
						];
						world.buildingLevels = [
							{ id: 'l-1', foundationId: 'f-1', index: 0, baseY: 0, wallHeight: 2.6 }
						];
						world.proceduralOverrides = { removedTreeIds: ['1:1', '2:2', '3:3'] };
						world.saveRevision += 1;

						const writeTx = db.transaction(['worlds', 'worldMeta'], 'readwrite');
						writeTx.objectStore('worlds').put(world);
						const metaRequest = writeTx.objectStore('worldMeta').get(world.id);
						metaRequest.onsuccess = () => {
							const meta = metaRequest.result;
							if (meta) {
								meta.saveRevision = world.saveRevision;
								writeTx.objectStore('worldMeta').put(meta);
							}
						};
						writeTx.oncomplete = () => resolve(JSON.stringify(world).length);
						writeTx.onerror = () => reject(new Error('cannot write world'));
					};
				};
			}),
		[DB_NAME, worldName, wallCount] as const
	);
}

test('a saved world contains its definition and none of the regenerable world', async ({
	page
}) => {
	await page.goto('/');
	await createAndEnterWorld(page, { name: 'Definition Only', seed: 'measured-seed-1' });
	await waitForSaved(page);

	// Walk for a while so a lot of terrain and forest is generated, then save again.
	await page.keyboard.down('KeyW');
	await page.waitForTimeout(4000);
	await page.keyboard.up('KeyW');
	await page.keyboard.press('ControlOrMeta+s');
	await expect(page.getByTestId('save-toast')).toBeVisible({ timeout: 20_000 });
	await waitForSaved(page);

	const stored = await readStoredWorld(page, 'Definition Only');
	expect(stored).not.toBeNull();
	if (!stored) return;

	expect(stored.seed).toBe('measured-seed-1');
	expect(stored.keys).toEqual([
		'buildingLevels',
		'buildings',
		'createdAt',
		'environment',
		'foundations',
		'id',
		'lastPlayedAt',
		'name',
		'player',
		'proceduralOverrides',
		'saveRevision',
		'schemaVersion',
		'seed',
		'updatedAt'
	]);

	// The whole point: exploring generated terrain and thousands of trees, and the save is still
	// just the world's definition.
	expect(stored.hasTerrainVertices).toBe(false);
	expect(stored.hasMeshData).toBe(false);
	expect(stored.byteSize).toBeLessThan(16 * 1024);

	console.log(`[measured] explored empty world save = ${stored.byteSize} bytes`);
});

test('authored buildings are rebuilt into the scene when the world is loaded', async ({ page }) => {
	test.setTimeout(120_000);
	const pageErrors: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));

	await page.goto('/');
	await createAndEnterWorld(page, { name: 'Built World', seed: 'built-seed-1' });
	await waitForSaved(page);

	const emptyGeometries = await readGeometries(page);

	await openPauseMenu(page);
	await page.getByTestId('pause-quit').click();
	await expect(page.getByTestId('worlds-screen')).toBeVisible();

	// Enough walls that the loaded geometry count is unambiguous: terrain chunk counts vary between
	// runs by a few dozen, so a handful of walls would be lost in that noise.
	const savedBytes = await addBuildingsToStoredWorld(page, 'Built World', 300);
	console.log(`[measured] world with 300 walls + openings + paint = ${savedBytes} bytes`);

	// Reload so nothing about the previous session is reused, then open the world again.
	await page.reload();
	await openWorldNamed(page, 'Built World');
	await expect(page.getByTestId('stats-overlay')).toBeVisible({ timeout: 20_000 });

	// Every wall becomes a real mesh with its own geometry, rebuilt by the same managers the build
	// tools use — so the geometry count jumps by roughly the wall count.
	const loadedGeometries = await readGeometries(page);
	expect(loadedGeometries - emptyGeometries).toBeGreaterThan(200);

	// And the world on disk still says what it said: loading did not rewrite or lose the buildings.
	const stored = await readStoredWorld(page, 'Built World');
	expect(stored?.foundations).toBe(1);
	expect(stored?.walls).toBe(300);
	expect(stored?.removedTreeIds).toBe(3);

	expect(pageErrors).toEqual([]);
});

test('a manual save completes quickly enough to be invisible during play', async ({ page }) => {
	await page.goto('/');
	await createAndEnterWorld(page, { name: 'Timed World' });
	await waitForSaved(page);

	// Measures only the *synchronous* portion of a save — capturing and serializing the world, i.e.
	// everything that runs on the main thread before the IndexedDB write is handed off. That is the
	// part that could stall a frame; the write itself is asynchronous by construction.
	//
	// (Timing the whole round trip here would mostly measure this environment's frame cadence rather
	// than the save, since the resolution of a `setTimeout` waits behind the render loop.)
	const elapsed = await page.evaluate(() => {
		const start = performance.now();
		window.dispatchEvent(
			new KeyboardEvent('keydown', { code: 'KeyS', ctrlKey: true, bubbles: true })
		);
		return performance.now() - start;
	});
	await expect(page.getByTestId('save-toast')).toBeVisible({ timeout: 20_000 });
	console.log(`[measured] synchronous cost of a save = ${elapsed.toFixed(2)}ms`);

	expect(elapsed).toBeLessThan(16);
});

async function readGeometries(page: Page): Promise<number> {
	const text = await page.getByTestId('stats-overlay').innerText();
	const match = /Geo (\d+)/.exec(text);
	return match ? Number(match[1]) : 0;
}
