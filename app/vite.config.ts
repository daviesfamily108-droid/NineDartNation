import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: Number(process.env.PORT) || 5173,
    strictPort: true,
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
