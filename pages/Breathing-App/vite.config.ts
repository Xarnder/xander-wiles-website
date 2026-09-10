import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';
import adapter from '@sveltejs/adapter-static';
export default defineConfig({
	plugins: [
		sveltekit({
			adapter: adapter({ pages: 'dist', assets: 'dist' }),
			paths: { base: '/pages/Breathing-App' }
		})
	],
	test: { include: ['src/**/*.test.ts'] }
});
