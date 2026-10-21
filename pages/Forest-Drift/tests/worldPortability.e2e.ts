import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { unzipSync } from 'fflate';
import { createServer } from 'vite';
import type { WorldDefinition } from '../src/lib/game/world/WorldTypes';
import { openWorldMenu } from './worldHelpers';

async function checkWorldPortability(page: Page) {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	// Load the fixture through Vite so game JSON/asset imports use the same transforms as the app.
	const compiler = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
	let world: WorldDefinition;
	let packageBytes: Uint8Array;
	try {
		const fixture = await compiler.ssrLoadModule(
			'/src/lib/game/world/__tests__/exportAuditFixture.ts'
		);
		const packaging = await compiler.ssrLoadModule('/src/lib/game/world/WorldImportExport.ts');
		world = fixture.exportAuditWorld();
		packageBytes = await packaging.createWorldPackage(world);
	} finally {
		await compiler.close();
	}
	await page.goto('/');
	await page.getByRole('button', { name: 'Worlds', exact: true }).click();
	await page.getByTestId('import-world-input').setInputFiles({
		name: 'audit.forestworld',
		mimeType: 'application/zip',
		buffer: Buffer.from(packageBytes)
	});
	await expect(page.getByTestId('world-card')).toHaveCount(1);
	await page.reload();
	await page.getByRole('button', { name: 'Worlds', exact: true }).click();
	await expect(page.getByTestId('world-card')).toHaveCount(1);
	await openWorldMenu(page, world.name);
	const pending = page.waitForEvent('download');
	await page.getByTestId('world-menu-export').click();
	const download = await pending;
	const file = await download.path();
	expect(file).toBeTruthy();
	const files = unzipSync(new Uint8Array(await readFile(file!)));
	const imported = JSON.parse(new TextDecoder().decode(files['world.json']));
	// Import creates a new local identity and updates save timestamps; content stays exact.
	expect(imported.id).not.toBe(world.id);
	expect(imported).toEqual({
		...world,
		id: imported.id,
		updatedAt: imported.updatedAt,
		lastPlayedAt: imported.lastPlayedAt,
		saveRevision: imported.saveRevision
	});
	await page.getByTestId('import-world-input').setInputFiles(file!);
	await expect(page.getByTestId('world-card')).toHaveCount(2);
	const ids = await page
		.getByTestId('world-card')
		.evaluateAll((cards) => cards.map((card) => card.getAttribute('data-world-id')));
	expect(new Set(ids).size).toBe(2);
	await page.getByTestId('import-world-input').setInputFiles({
		name: 'corrupt.forestworld',
		mimeType: 'application/zip',
		buffer: Buffer.from('invalid zip')
	});
	await expect(page.getByTestId('worlds-error')).toBeVisible();
	await expect(page.getByTestId('world-card')).toHaveCount(2);
	expect(errors).toEqual([]);
}

test('imports, stores, downloads and reimports a complete world through the browser UI', async ({
	page
}) => {
	await checkWorldPortability(page);
});
