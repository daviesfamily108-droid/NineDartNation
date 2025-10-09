import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    sourcemap: true,
  },
  server: {
    // Bind to all interfaces so Render (and other PaaS) can detect the open port
    host: true,
    // Respect platform-provided PORT if present; fall back locally
    port: Number(process.env.PORT) || 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
      '/webhook': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    }
  },
  // Ensure vite preview also binds correctly in hosted environments
  preview: {
    host: true,
    port: Number(process.env.PORT) || 5173,
  },
})
