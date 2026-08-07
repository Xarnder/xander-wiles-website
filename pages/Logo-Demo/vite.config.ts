/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// https://vite.dev/config/
export default defineConfig({
	base: '/pages/Logo-Demo/',
	plugins: [svelte()],
	test: {
		environment: 'happy-dom',
		include: ['src/**/*.test.ts'],
	},
})
