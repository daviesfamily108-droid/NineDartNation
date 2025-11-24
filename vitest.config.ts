import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['src/setupTests.ts'],
    // Allow longer timeouts to accommodate async test interactions and CI slowness
    testTimeout: 20000,
    // Disable worker threads to reduce environment-related fork timeouts on CI
    threads: false,
  },
})
