import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  base: '/pages/Teleprompter/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.ico',
        'favicon-16x16.png',
        'favicon-32x32.png',
        'favicon-dark.svg',
        'favicon-light.svg',
        'apple-touch-icon.png',
        'android-chrome-192x192.png',
        'android-chrome-512x512.png',
      ],
      manifest: {
        name: 'Teleprompter Flow',
        short_name: 'Teleprompter Flow',
        description:
          'On-device voice-follow teleprompter — scrolls with your speech, fully offline after first load.',
        theme_color: '#0b0d0f',
        background_color: '#0b0d0f',
        display: 'standalone',
        start_url: './',
        icons: [
          {
            src: 'android-chrome-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'android-chrome-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'apple-touch-icon.png',
            sizes: '180x180',
            type: 'image/png',
          },
        ],
      },
      workbox: {
        // App shell only — ASR bundle + ONNX weights are runtime-cached on first use
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,svg,ico,woff2,webmanifest}'],
        globIgnores: ['**/moonshine/**', '**/*.onnx', '**/moonshine.min-*.js'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.pathname.includes('/moonshine/') ||
              url.pathname.includes('moonshine.min') ||
              url.pathname.endsWith('.onnx') ||
              url.pathname.endsWith('.wasm'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'moonshine-model-weights',
              expiration: {
                maxEntries: 32,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
              matchOptions: {
                ignoreSearch: true,
              },
            },
          },
          {
            urlPattern: ({ url }) =>
              url.hostname.includes('cdn.jsdelivr.net') ||
              url.hostname.includes('download.moonshine.ai'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'moonshine-runtime-assets',
              expiration: {
                maxEntries: 64,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
  ],
  optimizeDeps: {
    exclude: ['@moonshine-ai/moonshine-js', '@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
  worker: {
    format: 'es',
  },
  build: {
    chunkSizeWarningLimit: 3000,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
