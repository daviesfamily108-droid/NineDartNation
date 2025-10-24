PM2 (process manager) setup — Nine Dart Nation

This project includes an `ecosystem.config.js` for pm2 which provides a simple,
production-friendly way to run the server with auto-restarts and log management.

Recommended (Linux / macOS / servers)

1) Install pm2 globally (node/npm):

   npm install -g pm2

2) Start the app using the provided ecosystem file (from project root):

   pm2 start ecosystem.config.js

3) View logs:

   pm2 logs nine-dart-nation

4) Restart the app after code/config changes:

   pm2 restart nine-dart-nation

5) Persist pm2 across reboots (Linux example):

   pm2 save
   pm2 startup

Environment variables

- Set production env vars before starting, for example (Linux):

  export NDN_ADMIN_SECRET="your_secret_here"
  export JWT_SECRET="..."
  export REDIS_URL="redis://..."
  pm2 start ecosystem.config.js

Windows notes

- pm2 works but startup persistence differs on Windows. Consider using the
  "pm2-windows-service" package or a Windows service manager (NSSM) to run pm2
  as a service. Alternatively, use the `server/server.js` directly in a service
  wrapper.

Why pm2 helps

- Auto restarts on crashes
- Memory-based restarts (avoids slow memory leaks)
- Centralized logging and status commands

Security note

- Do not expose the admin shutdown endpoint without protecting it with `NDN_ADMIN_SECRET` and running behind a firewall / load balancer with restricted admin access.
