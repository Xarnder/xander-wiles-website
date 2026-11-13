import adapter from '@sveltejs/adapter-static';
import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter({
				pages: 'dist',
				assets: 'dist',
				fallback: '200.html',
				strict: false
			}),
			// Fixed base so SPA fallback asset URLs resolve under the monorepo path.
			paths: {
				base: '/pages/Routine'
			},
			prerender: {
				handleUnseenRoutes: 'ignore'
			}
		})
	],
	test: {
		include: ['src/**/*.{test,spec}.{js,ts}'],
		environment: 'node'
	}
});
