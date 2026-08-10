import adapter from '@sveltejs/adapter-static';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
	},
	kit: {
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
	}
};

export default config;
