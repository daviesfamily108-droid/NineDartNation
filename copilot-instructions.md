# Copilot instructions for Nine Dart Nation

This repo is a Vite + React + TypeScript client (app/) and a tiny Node server (server/) that combines HTTP (Express) and WebSocket (ws). Aim for quick, concrete edits with minimal churn; prefer small patches over sweeping rewrites.

## Architecture (big picture)
- Client: `app/`
  - React + Vite + TS. UI is organized under `src/components/`; game logic in `src/game/`; shared state in `src/store/` (Zustand); helpers in `src/utils/`.
  - Premium theming: `src/styles/premium.css` is conditionally applied (via `premium-*` classes) when `user.fullAccess` is true.
  - Main shell: `src/App.tsx` renders a left sidebar (`Sidebar.tsx`) and the active view (Home, Online, Offline, Friends, Stats, Settings, Admin, Calibrator).
  - Online play: `components/OnlinePlay.tsx` manages a room WebSocket; can send `state` and `chat` events.
  - Calibration: `components/Calibrator.tsx` placeholder lives under its own tab; camera utilities under `utils/vision.ts` and `components/CameraView.tsx`.
- Server: `server/`
  - `server.js` starts Express and attaches a `WebSocketServer` on the same HTTP server. Rooms are kept in-memory.
  - HTTP endpoints: `GET /api/subscription` (demo fullAccess flag), `POST /webhook/stripe` (placeholder to flip fullAccess).

Data flows
- WebSocket messages: `{ type: 'join' | 'state' | 'chat', ... }`.
  - `join` sets `ws._roomId` and confirms with `{ type: 'joined', roomId, id }`.
  - `state` is rebroadcast to others in the same room.
  - `chat` is broadcast to everyone in the room (including sender echo if client doesn’t add its own copy).
- Stats and match flow live in `store/match.ts` and `utils/stats.ts`; leg-level stats are finalized at end-of-game.

## Dev workflows
- Server (HTTP+WS):
  - `cd server; npm install; npm start` → serves http://localhost:8787 and ws://localhost:8787
- Client (Vite dev):
  - `cd app; npm install; npm run dev` → defaults to http://localhost:5173 (may shift to :5174 if busy)
- Root convenience:
  - `npm run dev` runs the client (`cd app && npm run dev`). Start the server in another terminal.

## Project conventions
- Styling
  - Global styles in `src/index.css`; premium overrides in `src/styles/premium.css`.
  - Sidebar tabs use `.tab`, plus state classes `.tab--active` / `.tab--inactive` (purple-forward scheme).
- Routing
  - Tabs are controlled in `Sidebar.tsx` (`TabKey` type + `getTabs`). `App.tsx` switches on `tab` to render the page component.
- Online play
  - Use a single WS connection per session. To send: `ws.send(JSON.stringify({ type: 'chat' | 'state', ... }))`.
  - In `OnlinePlay.tsx`, the client appends the sender’s message locally and also receives broadcast messages.
- Premium wording
  - Use the label “PREMIUM” (not “FULL ACCESS”) in UI strings.

## When adding features
- Add a tab: update `TabKey` and `getTabs()` in `Sidebar.tsx`, then render in `App.tsx` with `tab === 'yourkey' && <YourComponent/>`.
- WebSocket events: extend the server `message` switch in `server/server.js` and mirror handling in the client component.
- Persisted flags: until real auth/billing exists, use `/api/subscription` for demo `fullAccess`. Do not rely on client-only booleans in production code.

## Common gotchas
- Port conflicts: Vite often falls back to 5174 if 5173 is busy; server is on 8787.
- CSS parse errors usually come from stray braces in `index.css` or Tailwind directives. Keep edits scoped; avoid duplicating blocks.
- If the header shows tabs, you’re likely rendering them inside the header—keep the sidebar and header separate as in `App.tsx`.

## Quick examples
- Send a chat message (client):
  ```ts
  ws.send(JSON.stringify({ type: 'chat', message: 'Hello room!' }))
  ```
- Broadcast a new event from server:
  ```js
  // in server.js inside ws.on('message')
  else if (data.type === 'my-event') {
    if (ws._roomId) broadcastToRoom(ws._roomId, { type: 'my-event', payload: data.payload }, null)
  }
  ```
- Add a new tab key:
  ```ts
  export type TabKey = 'score' | 'online' | 'mynew' | ...
  // add to getTabs(user)
  baseTabs.push({ key: 'mynew', label: 'My New', icon: SomeIcon })
  ```
