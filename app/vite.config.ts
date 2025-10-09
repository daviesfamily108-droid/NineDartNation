import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: Number(process.env.PORT) || 5173,
    strictPort: true,
    allowedHosts: (() => {
      const hosts: string[] = []
      const envUrl = process.env.RENDER_EXTERNAL_URL
      if (envUrl) {
        try { hosts.push(new URL(envUrl).hostname) } catch {}
      }
      const extra = process.env.VITE_ALLOWED_HOSTS
      if (extra) hosts.push(...extra.split(',').map(s => s.trim()).filter(Boolean))
      return hosts
    })(),
    // Allow overriding API proxy target via env when server runs on a different port
    // Set VITE_API_TARGET=http://localhost:8788 (for example)
    proxy: {
      '/api': {
        target: process.env.VITE_API_TARGET || 'http://localhost:8787',
        changeOrigin: true,
      },
      '/webhook': {
        target: process.env.VITE_API_TARGET || 'http://localhost:8787',
        changeOrigin: true,
      },
    }
  },
  preview: {
    host: true,
    port: Number(process.env.PORT) || 5173,
  }
})
