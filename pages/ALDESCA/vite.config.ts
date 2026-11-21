import { defineConfig } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';
import adapter from '@sveltejs/adapter-static';

export default defineConfig({
  plugins: [sveltekit({
    adapter: adapter({ pages: 'dist', assets: 'dist', strict: true }),
    paths: { base: (process.env.ALDESCA_BASE || '') as '' | `/${string}` },
    compilerOptions: { runes: true }
  })]
});
