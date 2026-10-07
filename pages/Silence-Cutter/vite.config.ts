import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';

/**
 * Cross-origin isolation enables SharedArrayBuffer, which ONNX Runtime needs for multi-threaded
 * WASM inference (the CPU fallback). Model downloads from Hugging Face are CORS requests, so they
 * keep working under `require-corp`.
 */
const isolationHeaders = {
	'Cross-Origin-Opener-Policy': 'same-origin',
	'Cross-Origin-Embedder-Policy': 'require-corp'
};

/** Full production header set (CSP etc.), also used by `vite preview` so tests run under it. */
const productionHeaders: Record<string, string> = Object.fromEntries(
	Object.entries(
		JSON.parse(readFileSync(path.resolve(import.meta.dirname, 'security-headers.json'), 'utf8'))
	).filter(([k]) => !k.startsWith('$'))
) as Record<string, string>;

/** Applies response headers to every dev/preview response (including SvelteKit pages). */
function responseHeaders(): Plugin {
	const withHeaders =
		(headers: Record<string, string>) =>
		(_req: unknown, res: { setHeader(k: string, v: string): void }, next: () => void) => {
			for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
			next();
		};
	return {
		name: 'response-headers',
		configureServer(server) {
			// Dev keeps a relaxed policy (HMR); preview uses the production headers.
			server.middlewares.use(withHeaders(isolationHeaders));
			// Dev-only: serve local test/benchmark fixtures for the /spike harness. Never built.
			server.middlewares.use('/__fixtures', (req, res, next) => {
				const name = path.basename(decodeURIComponent(req.url ?? ''));
				const file = ['tests/fixtures', 'fixtures/local']
					.map((dir) => path.resolve(import.meta.dirname, dir, name))
					.find((f) => existsSync(f));
				if (!file) return next();
				res.setHeader('Content-Type', name.endsWith('.mov') ? 'video/quicktime' : 'video/mp4');
				res.setHeader('Content-Length', String(statSync(file).size));
				createReadStream(file).pipe(res);
			});
		},
		configurePreviewServer(server) {
			server.middlewares.use(withHeaders(productionHeaders));
		}
	};
}

/**
 * CrisperWhisper 2.0 weights (and their outputs) are licensed for non-commercial research only.
 * They are never bundled; the browser downloads them from Hugging Face on demand. Even so, the
 * engine is only offered when explicitly enabled for a build: on by default in `vite dev`, off by
 * default for production builds unless `CRISPERWHISPER=enabled` is set.
 */
function crisperWhisperFlag(command: 'build' | 'serve'): boolean {
	const value = process.env.CRISPERWHISPER?.toLowerCase();
	if (value === 'enabled' || value === '1' || value === 'true') return true;
	if (value === 'disabled' || value === '0' || value === 'false') return false;
	return command === 'serve';
}

export default defineConfig(({ command }) => ({
	plugins: [
		responseHeaders(),
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
			// Empty base + relative asset URLs so the built app works under /pages/Silence-Cutter/
			// on the main site (same approach as the other SvelteKit sub-apps).
			paths: {
				base: '',
				relative: true
			}
		})
	],
	define: {
		__CRISPERWHISPER_ENABLED__: JSON.stringify(crisperWhisperFlag(command)),
		__APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0')
	},
	worker: {
		format: 'es' as const
	},
	optimizeDeps: {
		// Transformers.js ships its own pre-bundled web build; pre-bundling it again breaks its
		// dynamic ONNX Runtime imports.
		exclude: ['@huggingface/transformers'],
		// Pre-bundle worker-only dependencies up front so dev never reloads mid-session.
		include: ['mediabunny', '@mediabunny/aac-encoder']
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
}));
