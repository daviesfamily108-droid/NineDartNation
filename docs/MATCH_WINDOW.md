Match window (new-tab) behaviour
=================================

Overview
--------
You can open a dedicated match window (separate tab) from the Camera toolbar. The opener writes a compact snapshot of the current match state to localStorage and broadcasts a snapshot via BroadcastChannel when available. The new window imports that snapshot and subscribes to live updates (pause/quit) via BroadcastChannel with a storage-event fallback.

Limitations
-----------
- Camera sharing: browsers generally disallow accessing the same camera device from two tabs at once. The new tab will need to request camera permission independently if it needs live camera input. For a shared stream approach, see the experimental PoC in `src/components/CameraHandoffPoC.tsx` (frame forwarding via BroadcastChannel) — it's a PoC and not production-ready.
- Real-time sync: pause and quit messages are broadcast; future messages (visits/score updates) will be added incrementally.

How it works
------------
1. Parent writes snapshot via `writeMatchSnapshot()` and opens the new tab with `?match=1`.
2. Child `MatchPage` reads the snapshot (`readMatchSnapshot`) and subscribes to `subscribeMatchSync` for live messages.
3. Pause and quit are broadcast via `broadcastMessage({ type: 'pause'|'quit', ... })` so both windows remain in sync.

Files to look at
----------------
- `src/utils/matchSync.ts` — snapshot + BroadcastChannel helpers
- `src/components/MatchPage.tsx` — dedicated match page that imports snapshot
- `src/components/CameraView.tsx` — button to open match in new window and broadcasts pause/quit
- `src/components/CameraHandoffPoC.tsx` — experimental camera frame transfer PoC
