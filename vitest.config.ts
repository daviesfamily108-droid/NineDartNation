import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['src/setupTests.ts'],
    // Allow longer timeouts to accommodate async test interactions and CI slowness
    testTimeout: 30000,
    // Stabilize on Windows + newer Node versions (e.g. Node 25): explicitly use the
    // threads pool (not forks/vmThreads) and single-thread it to avoid IPC flakiness.
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
    fileParallelism: false,
  },
})

