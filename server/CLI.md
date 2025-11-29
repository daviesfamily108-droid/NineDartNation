Server CLI and environment variables

To run the server with an isolated data directory and debug logging (useful for tests and local debugging):

- Use the command-line flags (supported by `server/server.cjs` and `src/server/server.cjs`):
  - --data-dir <path> : Use a specific directory for file-based persistence (matches.json, tournaments.json, etc.)
  - --debug : Enable debug-level logging
    - --port <num> : Bind HTTP server to specific port (overrides PORT env var)
    - --log-level <level> : Set logger level for pino (debug|info|warn|error)

Examples:

# Run server with a temporary data folder and debug logs
node server/server.cjs --data-dir ./tmp-test-data --debug

# Run server from source (Node) with a temp data dir and debug logs
node src/server/server.cjs --data-dir ./tmp-test-data --debug

Environment variables (legacy and alternative):
- NDN_DATA_DIR : Path for data directory
- NDN_DEBUG : Set to '1' to enable debug logs

Notes:
- The integration tests pass `NDN_DATA_DIR` and `NDN_DEBUG` to the server process to ensure isolated runs and capture verbose logs.
