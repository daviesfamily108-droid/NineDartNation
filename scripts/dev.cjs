#!/usr/bin/env node

/**
 * Dev-server launcher.
 *
 * Why this exists:
 * - On some Windows + PowerShell + Node (observed on Node v25) setups, `vite` CLI
 *   starts, prints the URLs, then exits immediately with code 1.
 * - Starting Vite via its programmatic API works fine.
 *
 * This script keeps the process alive and wires the usual signals.
 */

(async () => {
  try {
    const vite = await import('vite')

    const server = await vite.createServer({
      configFile: 'vite.config.ts',
    })

    await server.listen()

    server.printUrls()

    const shutdown = async () => {
      try {
        await server.close()
      } finally {
        process.exit(0)
      }
    }

    process.on('SIGINT', shutdown)
    process.on('SIGTERM', shutdown)

    // Keep the process alive (some environments will auto-exit when stdin closes)
    setInterval(() => {}, 1 << 30)
  } catch (err) {
    console.error(err)
    process.exit(1)
  }
})()
