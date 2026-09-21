import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const siteLocalLLMPath = path.resolve(__dirname, '../../assets/js/local-llm.js')

function siteLocalLLMPlugin({ externaliseForBuild }) {
  return {
    name: 'site-local-llm',
    enforce: 'pre',
    resolveId(source) {
      if (source === '/assets/js/local-llm.js') {
        if (externaliseForBuild) {
          return { id: source, external: true }
        }
        return siteLocalLLMPath
      }
      return null
    },
    load(id) {
      if (id === siteLocalLLMPath) {
        return fs.readFileSync(siteLocalLLMPath, 'utf8')
      }
      return null
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = new URL(req.url, 'http://localhost').pathname
        if (pathname !== '/assets/js/local-llm.js') {
          next()
          return
        }

        res.setHeader('Content-Type', 'text/javascript')
        fs.createReadStream(siteLocalLLMPath).pipe(res)
      })
    },
  }
}

function harperWasmPlugin() {
  const slimWasmPath = path.resolve(__dirname, 'node_modules/harper.js/dist/harper_wasm_slim_bg.wasm')
  const wasmPath = path.resolve(__dirname, 'node_modules/harper.js/dist/harper_wasm_bg.wasm')

  return {
    name: 'harper-wasm',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = new URL(req.url, 'http://localhost').pathname
        if (pathname.endsWith('/harper_wasm_slim_bg.wasm')) {
          if (fs.existsSync(slimWasmPath)) {
            res.setHeader('Content-Type', 'application/wasm')
            fs.createReadStream(slimWasmPath).pipe(res)
            return
          }
        } else if (pathname.endsWith('/harper_wasm_bg.wasm')) {
          if (fs.existsSync(wasmPath)) {
            res.setHeader('Content-Type', 'application/wasm')
            fs.createReadStream(wasmPath).pipe(res)
            return
          }
        }
        next()
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    siteLocalLLMPlugin({ externaliseForBuild: command === 'build' }),
    harperWasmPlugin(),
  ],
  optimizeDeps: {
    exclude: ['harper.js'],
  },
  base: '/pages/journal/',
  build: {
    chunkSizeWarningLimit: 1000,
  },
}))
