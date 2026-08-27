import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Docker uses the compose service names; outside Docker fall back to localhost.
import fs from 'node:fs'
const inDocker = fs.existsSync('/.dockerenv')
const backend = process.env.VITE_PROXY_TARGET || (inDocker ? 'http://backend:8000' : 'http://localhost:8000')
const renderer = process.env.VITE_RENDER_TARGET || (inDocker ? 'http://renderer:3100' : 'http://localhost:3100')

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: [
      'openshorts.app',
      'www.openshorts.app'
    ],
    proxy: {
      '/api': {
        target: backend,
        changeOrigin: true,
      },
      '/videos': {
        target: backend,
        changeOrigin: true,
      },
      '/thumbnails': {
        target: backend,
        changeOrigin: true,
      },
      '/creations': {
        target: backend,
        changeOrigin: true,
      },
      '/mocks': {
        target: backend,
        changeOrigin: true,
      },
      '/default-avatars': {
        target: backend,
        changeOrigin: true,
      },
      '/sounds': {
        target: backend,
        changeOrigin: true,
      },
      '/gallery': {
        target: backend,
        changeOrigin: true,
      },
      '/video': {
        target: backend,
        changeOrigin: true,
      },
      '/render': {
        target: renderer,
        changeOrigin: true,
      }
    }
  }
})
