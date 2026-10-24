import { describe, expect, it } from 'vitest';
import { migrateTreeGenerator } from '../src/generatorMigration';

describe('tree-only generator compatibility', () => {
	it.each([1, 2])(
		'upgrades known version %s without changing world metadata or the input',
		(version) => {
			const manifest = {
				worldId: 'existing-world',
				name: 'Shared world',
				schemaVersion: 9,
				generatorVersion: version,
				publishedAt: '2026-10-18'
			};
			expect(migrateTreeGenerator(manifest)).toEqual({ ...manifest, generatorVersion: 3 });
			expect(manifest.generatorVersion).toBe(version);
		}
	);
	it.each([0, 3, 4])('does not relabel unrelated generator version %s', (generatorVersion) => {
		const manifest = { generatorVersion };
		expect(migrateTreeGenerator(manifest)).toBe(manifest);
	});
});
