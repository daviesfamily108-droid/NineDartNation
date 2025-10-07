import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Inject React import for any JSX to cover edge cases where classic runtime might be assumed
  esbuild: {
    jsxInject: `import React from 'react'`,
  },
})
