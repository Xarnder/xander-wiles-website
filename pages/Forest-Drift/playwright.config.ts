import { defineConfig, devices } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const port = Number(process.env.PLAYWRIGHT_PORT ?? 4173);
// macOS 27 protects Firefox's shared app-data directory even when -profile points elsewhere.
// Keep test app-data separate: https://github.com/microsoft/playwright/issues/42768
const firefoxHome =
	process.platform === 'darwin' ? mkdtempSync(join(tmpdir(), 'forest-drift-firefox-')) : undefined;

export default defineConfig({
	testDir: './tests',
	testMatch: '**/*.e2e.{ts,js}',
	fullyParallel: false,
	/**
	 * One worker, deliberately. Every test now opens a real world, which means a real WebGL context
	 * with shadow cascades and postprocessing; running two of those concurrently on one GPU makes
	 * both several times slower and turns ordinary assertions into timeouts. Serial is slower in
	 * wall-clock terms but is the only way these stay meaningful rather than flaky.
	 */
	workers: 1,
	/** World creation + first-frame shader compilation is genuinely slow; 30s left no headroom. */
	timeout: 60_000,
	retries: process.env.CI ? 2 : 0,
	use: {
		baseURL: `http://127.0.0.1:${port}`,
		trace: 'retain-on-failure'
	},
	projects: [
		{
			name: 'chromium',
			use: {
				...devices['Desktop Chrome'],
				// Opt in for GPU measurements; keep functional CI behaviour unchanged.
				launchOptions:
					process.env.FOREST_DRIFT_GPU === '1' && process.platform === 'darwin'
						? { args: ['--use-angle=metal', '--enable-gpu'] }
						: undefined
			}
		},
		{
			name: 'webkit-speech',
			testMatch: /(phonon|speechAutoStart)\.e2e\.ts$/,
			use: { ...devices['Desktop Safari'] }
		},
		{
			name: 'firefox-speech',
			testMatch: /(phonon|speechAutoStart)\.e2e\.ts$/,
			use: {
				...devices['Desktop Firefox'],
				launchOptions: firefoxHome
					? {
							env: {
								...Object.fromEntries(
									Object.entries(process.env).filter(
										(entry): entry is [string, string] => entry[1] !== undefined
									)
								),
								CFFIXED_USER_HOME: firefoxHome
							}
						}
					: undefined
			}
		},
		{
			name: 'webkit-worlds',
			testMatch: /worldPortability\.e2e\.ts$/,
			use: { ...devices['Desktop Safari'] }
		},
		// Multiplayer has to work in every engine: the same world from a seed, and the same online
		// session. These two run only the online checks (the full suite stays Chromium-only, as before).
		{
			name: 'webkit-online',
			testMatch: /(determinism|multiplayer)\.e2e\.ts$/,
			use: { ...devices['Desktop Safari'] }
		},
		{
			name: 'firefox-online',
			testMatch: /(determinism|multiplayer)\.e2e\.ts$/,
			use: {
				...devices['Desktop Firefox'],
				launchOptions: firefoxHome
					? {
							env: {
								...Object.fromEntries(
									Object.entries(process.env).filter(
										(entry): entry is [string, string] => entry[1] !== undefined
									)
								),
								CFFIXED_USER_HOME: firefoxHome
							}
						}
					: undefined
			}
		}
	],
	webServer: {
		command: `npm run build && npm run preview -- --host 127.0.0.1 --port ${port}`,
		port,
		reuseExistingServer: !process.env.CI
	}
});
