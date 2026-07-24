import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT ?? 4173);

export default defineConfig({
	testDir: './tests',
	testMatch: '**/*.e2e.{ts,js}',
	fullyParallel: false,
	retries: process.env.CI ? 2 : 0,
	use: {
		baseURL: `http://127.0.0.1:${port}`,
		trace: 'retain-on-failure'
	},
	projects: [
		{
			name: 'chromium',
			testIgnore: '**/touch.e2e.ts',
			use: { ...devices['Desktop Chrome'] }
		},
		{
			name: 'mobile-chromium',
			testMatch: '**/touch.e2e.ts',
			use: { ...devices['iPhone 13 landscape'], browserName: 'chromium' }
		}
	],
	webServer: {
		command: `npm run build && npm run preview -- --host 127.0.0.1 --port ${port}`,
		port,
		reuseExistingServer: !process.env.CI
	}
});
