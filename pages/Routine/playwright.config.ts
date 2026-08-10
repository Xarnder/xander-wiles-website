import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT ?? 4173);

export default defineConfig({
	testDir: './tests/e2e',
	testMatch: '**/*.{spec,e2e}.{ts,js}',
	fullyParallel: false,
	retries: process.env.CI ? 2 : 0,
	use: {
		baseURL: `http://127.0.0.1:${port}/pages/Routine/`,
		trace: 'retain-on-failure'
	},
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] }
		}
	],
	webServer: {
		command: `PUBLIC_ROUTINE_E2E=true npm run build && PUBLIC_ROUTINE_E2E=true npm run preview -- --host 127.0.0.1 --port ${port}`,
		port,
		reuseExistingServer: !process.env.CI,
		timeout: 180_000
	}
});
