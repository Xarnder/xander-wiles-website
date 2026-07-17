import adapter from '@sveltejs/adapter-static';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter({
			pages: 'dist',
			assets: 'dist',
			fallback: undefined,
			strict: true
		}),
		// Empty base + relative asset URLs so the built app works under /pages/Fighter-Jet/
		// on the main site (same approach as z-image-turbo-sveltekit).
		paths: {
			base: '',
			relative: true
		}
	},
	compilerOptions: {
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
	}
};

export default config;
