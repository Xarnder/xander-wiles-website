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

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react(), siteLocalLLMPlugin({ externaliseForBuild: command === 'build' })],
  base: '/pages/journal/',
  build: {
    chunkSizeWarningLimit: 1000,
  },
}))
