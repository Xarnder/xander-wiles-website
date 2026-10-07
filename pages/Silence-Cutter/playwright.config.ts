import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT ?? 4173);
const gpuArgs = [
	'--enable-unsafe-webgpu',
	'--enable-gpu',
	'--ignore-gpu-blocklist',
	...(process.platform === 'darwin' ? ['--use-angle=metal'] : [])
];

export default defineConfig({
	testDir: './tests',
	testMatch: '**/*.e2e.ts',
	fullyParallel: false,
	workers: 1,
	timeout: 60_000,
	retries: process.env.CI ? 1 : 0,
	use: {
		baseURL: `http://127.0.0.1:${port}`,
		trace: 'retain-on-failure'
	},
	projects: [
		{
			// Default: mock transcription engine, no model downloads.
			name: 'chromium',
			testIgnore: '**/asr.e2e.ts',
			use: {
				...devices['Desktop Chrome'],
				viewport: { width: 1500, height: 950 },
				// Prefer branded Chrome (proprietary H.264/AAC codecs) when installed locally.
				channel: process.env.PW_CHANNEL ?? (process.env.CI ? undefined : 'chrome'),
				launchOptions: { args: gpuArgs }
			}
		},
		{
			// Opt-in: real on-device ASR (downloads a model). `npm run test:asr`
			name: 'asr-integration',
			testMatch: '**/asr.e2e.ts',
			timeout: 15 * 60_000,
			use: {
				...devices['Desktop Chrome'],
				channel: process.env.PW_CHANNEL ?? 'chrome',
				launchOptions: { args: gpuArgs }
			}
		}
	],
	webServer: {
		command: `npm run build:bench && npx vite preview --host 127.0.0.1 --port ${port} --strictPort`,
		port,
		reuseExistingServer: !process.env.CI,
		timeout: 180_000
	}
});
