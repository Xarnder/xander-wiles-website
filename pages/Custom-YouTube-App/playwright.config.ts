import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT ?? 4173);

export default defineConfig({
	testDir: './tests/e2e',
	testMatch: '**/*.{spec,e2e}.{ts,js}',
	fullyParallel: false,
	retries: process.env.CI ? 2 : 0,
	use: {
		baseURL: `http://127.0.0.1:${port}/`,
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
		reuseExistingServer: false,
		timeout: 180_000,
		env: {
			PUBLIC_GOOGLE_CLIENT_ID: 'test-client-id.apps.googleusercontent.com',
			PUBLIC_ALLOWED_GOOGLE_EMAILS: 'allowed@example.com'
		}
	}
});
