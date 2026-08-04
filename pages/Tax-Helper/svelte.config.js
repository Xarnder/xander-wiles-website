import adapter from '@sveltejs/adapter-static';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
	},
	kit: {
		adapter: adapter({
			pages: 'dist',
			assets: 'dist',
			fallback: undefined,
			strict: true
		}),
		// Empty base + relative asset URLs so the built app works under /pages/Tax-Helper/
		// on the main site (same approach as Fighter-Jet / z-image-turbo-sveltekit).
		paths: {
			base: '',
			relative: true
		}
	}
};

export default config;
