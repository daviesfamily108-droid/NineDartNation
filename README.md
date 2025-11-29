# Nine Dart Nation (Desktop + Mobile)

A modern React + Vite + TypeScript app with Tailwind CSS and a lightweight WebSocket server for online play.
Left-hand tabs, rounded cards, modern colors, camera capture, and end-of-game leg calculations for:
- Best/Worst **3-dart** averages
- Best **9-dart** leg (fastest leg)
- Best **checkout** (highest finishing score)

**Important rule:** Leg stats are **only** finalized/calculated at the **end of the game**. After each match ends, if a better (faster/lower-darts) leg was achieved, the match's best leg is updated accordingly.

## Quick Start

### 1) Install & run the server
```bash
cd server
npm install
npm start
```
The server defaults to `ws://localhost:8787`.

### 2) Install & run the app
Open a second terminal:
```bash
cd app
npm install
npm run dev
```
Then open the printed `http://localhost:5173` URL in your browser.

### Optional: Run both with one command
From the repo root:
```bash
npm install
npm run dev
```
This starts the server (port 8787) and the Vite dev server (usually 5173/5174).

## Notes
- Camera: uses `getUserMedia`. Grant permission in your browser. Capture stills or keep live preview.
- Online Play: Join the same **Room ID** on two devices to sync scores (peer-to-room broadcast via the websocket server).
- Tabs: Located on the left; responsive layout collapses on small screens.
- All cards have rounded corners and modern palette.
- Stats:
  - **3-dart average**: (Total points scored / darts thrown) * 3
  - **Best 9-dart leg**: The leg with **fewest darts**; if tie, lowest total darts first, then earliest achieved.
  - **Best checkout**: Highest finishing score (e.g., 170 beats 167). We track this when a leg ends via a checkout.
- Legs & Match: Legs are **only** tallied at the end of the game (press **End Game**). Until then, leg stats are provisional.

## Phone as Camera (QR pairing)

Use your phone as a video-only camera source in Offline/Online play and in the Calibrator. No audio is ever requested or sent.

Steps (desktop + phone on the same network):
- Start the server: it serves the phone page at `http://<server-host>:8787/mobile-cam.html`.
- In the app, open any camera tile (e.g., Offline Play or Calibrator) and switch mode to “Phone”.
- Generate a 4-letter code — a QR appears with a 2-minute countdown.
- On your phone: either scan the QR or open the phone page directly and enter the code:
  - Scan: the QR encodes `http://<server-host>:8787/mobile-cam.html?code=ABCD`.
  - Manual: visit `http://<server-host>:8787/mobile-cam.html` and type the code displayed on desktop.
- Allow camera access when prompted. The stream will appear on desktop. Rotate to landscape for best framing.

Behavior and limits:
- Codes expire after ~2 minutes; regenerate from desktop. The desktop auto-regenerates only if the phone hasn’t joined yet.
- One phone per code. Regenerating invalidates the previous code.
- Video-only: audio is always disabled (both getUserMedia and SDP).
- Uses public STUN for ICE; for remote/LAN usage, prefer the server’s LAN IP in the QR/link instead of `localhost`.

Troubleshooting:
- If the phone can’t connect, ensure both devices share the same network and your firewall allows port 8787.
- If scanning opens a localhost URL on your phone, switch to using the machine’s LAN IP in the link.
- If the code shows “Expired” on phone, regenerate on desktop and reconnect.

### HTTPS for iOS (recommended for phone camera)

iOS Safari requires HTTPS for `getUserMedia` when using a LAN IP. The server supports an optional HTTPS port in parallel to HTTP.

Enable HTTPS:
1. Generate a self-signed cert and key (pick one):
   - PowerShell helper (creates `server/certs/server.key` and `server/certs/server.crt`):
     - Optional: include your LAN IP so it’s valid in the SAN list
     - Example:
       - `server/certs/make-self-signed.ps1 -Ip 192.168.1.203 -OutDir server/certs`
   - mkcert (recommended):
     - `mkcert -key-file server/certs/server.key -cert-file server/certs/server.crt localhost 127.0.0.1 192.168.1.203`
   - OpenSSL (manual): create a cert with subjectAltName DNS:localhost, IP:127.0.0.1, and your LAN IP
2. Start the server with HTTPS enabled:
   - PowerShell:
     - `$env:NDN_HTTPS='1'; $env:HTTPS_PORT='8788'; node server\server.js`
3. The app will auto-detect `/api/https-info` and encode QR links with `https://<host>:8788` when available.

Notes:
- Self-signed certs will show a browser warning the first time; accept to proceed.
- If you change LAN IP, regenerate or use mkcert with multiple SAN entries.

## Calibrator with phone stream

- Open the Calibrator tab, switch mode to “Phone”, and pair using the steps above.
- Once video is visible on desktop, click Capture to take a frame and compute homography.
- For repeatable alignment, open the in-app marker sheet (Calibrator → Marker Calibration Kit), tape the four ArUco markers on the double ring, capture a frame, and press **Detect Markers**. The calibrator will compute and auto-lock when the RMS error ≤ 1.2 px.
- Stop ends the pairing/stream. All processing is video-only.

## TV-style end-of-match summary

At match end you’ll see a summary similar to broadcast graphics:
- Match-long averages, 180s/140+/100+, highest checkout
- Per-leg winner record and finishing details
- Darts-at-double tracking (attempts and hits) for true double-out notation

## In-game chat moderation

Chat messages are lightly filtered on the client to mask common profanity with asterisks. The server also sanitizes messages before broadcasting. Players can:
- Delete a message locally.
- Report a message (sends a report to the server; online admins get a live ping).
- Block a sender locally to hide future messages from them.

Desktop: hover a message to reveal a small red X (delete) plus Report/Block buttons. Mobile: hold a message or swipe left to delete; reporting is available from the UI.


## Deployment: Netlify (frontend) + Render (backend)

This setup hosts the static site on Netlify and the Node/WebSocket API on Render.

Root build (recommended)
- Base directory: repository root
- Build command: `npm ci && npm run build`
- Publish directory: `dist`
- SPA fallback: ensure `public/_redirects` contains `/*  /index.html  200` (already included)
- Environment: set `NODE_VERSION=18` (already set in `netlify.toml`)
- Optional: set `VITE_WS_URL` to your Render WebSocket URL (wss://…)

Alternative app/ subfolder build
- Base directory: `app`
- Build command: `npm ci && npm run build`
- Publish directory: `app/dist`
- Same SPA fallback and env vars apply; use `app/public/_redirects`

1) Deploy the server to Render
- Create a new Web Service in Render pointing to `server/`.
- Runtime: Node. Build command: `npm install` (Render autodetect). Start command: `node server.js`.
- Environment variables (Render):
  - PORT: Render sets this automatically. The server reads `process.env.PORT`.
  - LOG_LEVEL: optional; `info` by default.
  - NDN_HTTPS: keep `0` on Render (Render terminates TLS at the edge). Only set `1` if you manage certs yourself.
  - NDN_TLS_KEY, NDN_TLS_CERT: only if `NDN_HTTPS=1`.
- After deploy, copy the public URL, e.g., `https://your-service.onrender.com`.

2) Configure Netlify for the app (pick one of the approaches above)
If using root build (netlify.toml is already configured):
- No changes required. Netlify will use `npm ci && npm run build` and publish `dist`.
If using the app/ subfolder approach:
- Adjust site settings accordingly.
- Netlify environment variables (Site settings → Build & deploy → Environment):
  - VITE_WS_URL: set to your Render URL with wss scheme, e.g., `wss://your-service.onrender.com`
  - (Optional dev-only) VITE_API_TARGET: used by Vite proxy locally; not needed in production builds.
  - (Optional) VITE_STRIPE_CHECKOUT_URL: your Stripe Checkout link for paid flows (shown in Settings → Pay via Stripe). If unset, a test link is used.

### Stripe: two ways to charge £2 for username change

Option A — Payment Link (simplest)
- Create a £2 Payment Link in your Stripe Dashboard.
- Set `VITE_STRIPE_CHECKOUT_URL` on Netlify to that link.
- Pros: no server secrets, quickest. Cons: payment not auto-verified.

Option B — Checkout Session + Webhook (recommended for enforcement)
- Render env:
  - `STRIPE_SECRET_KEY` = your secret key
  - `STRIPE_PRICE_ID_USERNAME_CHANGE` = price_1SC1iwRAvdcgMbFdqDMr39gu
  - `STRIPE_WEBHOOK_SECRET` (optional if verifying events)
- Client calls `/api/stripe/create-session`; server creates a Session for that price and returns `url` to redirect.
- Add a real webhook handler at `/webhook/stripe` to mark a credit upon `checkout.session.completed`.

3) Proxy /api and /webhook requests from Netlify to Render
- The app uses relative `/api/...` and `/webhook/...` calls. Redirects are already included:
  - Root build: `public/_redirects`
  - app/ build: `app/public/_redirects`
  Ensure the host matches your Render service URL.

Where these are used in code
- WebSocket URL (VITE_WS_URL): `app/src/components/WSProvider.tsx` (primary), also referenced in `CameraTile.tsx` and `Calibrator.tsx` for helpers.
- API calls (`/api/...`): throughout the app (e.g., `App.tsx`, `Friends.tsx`, `SettingsPanel.tsx`, `Tournaments.tsx`, etc.). Netlify redirects forward these to Render.
- Dev proxy target (VITE_API_TARGET): `app/vite.config.ts` to proxy `/api` and `/webhook` while running `npm run dev` locally.

Quick checklist
- [ ] Server live on Render; copy HTTPS URL.
- [ ] Netlify site uses Base `app`, Publish `app/dist`.
- [ ] Netlify env: `VITE_WS_URL=wss://<your-render-url>`.
- [ ] `app/public/_redirects` points `/api/*` and `/webhook/*` to Render.
- [ ] Open the Netlify site and confirm Online/Offline features connect and `/api/*` returns data.

## Host a production website (no dev server)

You can serve the built site from the Node server directly.

1) Build the client
  ```bash
  npm run build:client
  ```
  Outputs static files to `app/dist`.

## Progressive Web App (PWA) / Add to Home Screen

This project includes a minimal PWA setup to allow installing the website on device home screens.

- Manifest is at `public/manifest.webmanifest`.
- A simple service worker `public/sw.js` provides basic offline caching.
- On supported browsers (Chrome/Edge on Android, Chrome on Desktop), a browser prompt may appear or you can use the "Install App" button added to the footer.

Native app store links (optional):
- You can provide native app store download links via environment variables on your hosting platform (or locally with `VITE_*` variables in your dev env):
  - VITE_PLAY_STORE_URL=https://play.google.com/store/apps/details?id=com.example
  - VITE_APP_STORE_URL=https://apps.apple.com/us/app/example/id123456789
  These links are displayed in the header install picker if set.

Icons:
- The manifest currently contains placeholder icons (small transparent PNGs) in data URL form. For production, replace them with real PNG assets (192x192 and 512x512) in `public/` and update `public/manifest.webmanifest` accordingly. For example:
  - `/public/icon-192.png` (192x192)
  - `/public/icon-512.png` (512x512)

Example environment usage for Netlify or other hosting providers:
- In your site build environment variables, add `VITE_PLAY_STORE_URL` and/or `VITE_APP_STORE_URL` to show buttons to install native builds if available.

Installation options:
- Android/Chrome: Open the site in Chrome. Chrome will either prompt automatically or you can tap the menu (⋮) -> "Install app".
- iOS/Safari: Open the site in Safari, tap the Share icon -> "Add to Home Screen"; iOS does not show the same install prompt but supports an Add to Home Screen that creates a shortcut.
- Windows/Edge: Edge supports installing PWAs via the ... menu -> "Apps" -> "Install this site as an app".

Development notes:
- The site must be served over HTTPS for the service worker and automatic install prompt to work in production (localhost is allowed during development).
- The service worker is a simple pre-cache implementation — you can replace it with a more advanced strategy (Workbox) for production use.

Icon generation (optional):
- If you want to generate PNG app icons from the included SVG programmatically, install the dev deps and run:
  ```bash
  npm install --save-dev sharp
  npm run generate:icons
  ```
  This will generate `public/icon-192.png`, `public/icon-512.png`, and `public/apple-touch-icon.png` from the `public/dart-thrower.svg` file.


2) Start the server
  - HTTP only:
    ```bash
    npm run start:server
    ```
  - HTTPS (after creating certs; see HTTPS section):
    ```bash
    npm run server:https
    ```

3) Open your site
  - HTTP:  `http://<server-host>:8787/`
  - HTTPS: `https://<server-host>:8788/` (when enabled)

The server serves API + WebSockets and the built SPA (app/dist) from the same process. A static phone page remains at `/mobile-cam.html`.


### Email template previews (owner-only)

While the server is running, visit these URLs in your browser to preview account emails:

- Password reset preview: http://localhost:8787/api/email/preview?kind=reset&requesterEmail=daviesfamily108@gmail.com
- Confirm email preview: http://localhost:8787/api/email/preview?kind=confirm-email&requesterEmail=daviesfamily108@gmail.com
- Password changed preview: http://localhost:8787/api/email/preview?kind=changed&requesterEmail=daviesfamily108@gmail.com

