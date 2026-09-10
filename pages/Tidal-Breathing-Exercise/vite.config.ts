import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';
import adapter from '@sveltejs/adapter-static';
import path from 'path';
import fs from 'fs';

export default defineConfig({
	plugins: [
		sveltekit({
			adapter: adapter({ pages: 'dist', assets: 'dist' }),
			paths: { base: '/pages/Tidal-Breathing-Exercise' },
			prerender: {
				handleHttpError: ({ path, message }) => {
					if (path.startsWith('/assets/') || path === '/nav.html') {
						return;
					}
					throw new Error(message);
				}
			}
		}),
		{
			name: 'root-static-assets-dev',
			configureServer(server) {
				server.middlewares.use((req, res, next) => {
					if (!req.url) return next();
					const cleanUrl = req.url.split('?')[0];
					if (
						cleanUrl === '/nav.html' ||
						cleanUrl.startsWith('/assets/') ||
						cleanUrl.startsWith('/icons/') ||
						cleanUrl === '/favicon-dark.svg' ||
						cleanUrl === '/favicon-light.svg' ||
						cleanUrl === '/favicon.ico'
					) {
						const filePath = path.resolve('../..', cleanUrl.replace(/^\//, ''));
						if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
							const ext = path.extname(filePath);
							const mimeTypes: Record<string, string> = {
								'.html': 'text/html; charset=utf-8',
								'.css': 'text/css; charset=utf-8',
								'.js': 'application/javascript; charset=utf-8',
								'.svg': 'image/svg+xml',
								'.png': 'image/png',
								'.ico': 'image/x-icon',
								'.json': 'application/json'
							};
							res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
							return fs.createReadStream(filePath).pipe(res);
						}
					}
					next();
				});
			}
		}
	],
	test: { include: ['src/**/*.test.ts'] }
});
