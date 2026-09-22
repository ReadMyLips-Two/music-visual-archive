import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true, proxy: { '/api/musicbrainz': { target: 'https://musicbrainz.org', changeOrigin: true, rewrite: path => path.replace(/^\/api\/musicbrainz/, ''), configure: proxy => { proxy.on('proxyReq', request => { request.setHeader('User-Agent', 'Music Visual Archive/0.1 (local development)'); request.setHeader('Accept', 'application/json'); }) } } } },
  preview: { host: '127.0.0.1', port: 5173, strictPort: true },
})
