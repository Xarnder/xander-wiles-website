import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT ?? 4173);

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
			use: { ...devices['Desktop Chrome'] }
		}
	],
	webServer: {
		command: `npm run build && npm run preview -- --host 127.0.0.1 --port ${port}`,
		port,
		reuseExistingServer: !process.env.CI
	}
});
