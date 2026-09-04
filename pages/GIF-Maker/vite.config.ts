import { defineConfig } from 'vitest/config';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';

const isolationHeaders = {
	'Cross-Origin-Opener-Policy': 'same-origin',
	'Cross-Origin-Embedder-Policy': 'require-corp'
};

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter({
				pages: 'dist',
				assets: 'dist',
				fallback: undefined,
				strict: true
			}),
			paths: {
				base: '',
				relative: true
			}
		})
	],
	optimizeDeps: {
		exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util']
	},
	server: {
		headers: isolationHeaders,
		fs: {
			allow: ['.']
		}
	},
	preview: {
		headers: isolationHeaders
	},
	worker: {
		format: 'es'
	},
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
