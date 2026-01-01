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
    // Some Node 25 + Windows setups will terminate the process if an unhandled
    // rejection occurs. When the backend isn't running, Vite's proxy can emit
    // ECONNREFUSED which may surface as an unhandled rejection depending on
    // runtime/tooling versions.
    //
    // In dev, we prefer to keep the frontend alive and let the browser show
    // API failures rather than killing the dev server.
    process.on('unhandledRejection', (reason) => {
      console.warn('[dev] unhandledRejection (ignored in dev):', reason)
    })
    process.on('uncaughtException', (err) => {
      console.error('[dev] uncaughtException:', err)
      // Keep the dev server alive; Vite will log and recover in many cases.
    })

    const vite = await import('vite')

    const server = await vite.createServer({
      configFile: 'vite.config.ts',
    })

    await server.listen()

    // Some environments (notably Node 25 on Windows) can end up with a non-zero
    // exit code even when the dev server is running. Force a clean exit code
    // after successful startup.
    process.exitCode = 0

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
