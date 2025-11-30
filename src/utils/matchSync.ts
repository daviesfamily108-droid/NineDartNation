// Lightweight match state sync helper using BroadcastChannel + localStorage
import { useMatch } from "../store/match";
import { useMatchControl } from "../store/matchControl";
import { broadcastMessage, subscribeMatchSync } from "./broadcast";

const STORAGE_KEY = "ndn:match-sync";
const CHANNEL = "ndn-match-sync";

function getSnapshotState() {
  try {
    const m = useMatch.getState();
    const c = useMatchControl.getState();
    // Pick explicit fields to keep snapshot compact and stable
    const match = {
      roomId: m.roomId,
      players: m.players,
      currentPlayerIdx: m.currentPlayerIdx,
      startingScore: m.startingScore,
      inProgress: m.inProgress,
      bestLegThisMatch: m.bestLegThisMatch,
      // Optional server-style match descriptors (may not exist in client state)
      game: (m as any).game ?? null,
      mode: (m as any).mode ?? null,
      value: (m as any).value ?? null,
    };
    // UI hints: some UI state like selectedMode is local to OfflinePlay; try to include a cached value if present
    let ui: any = {};
    try {
      if (typeof localStorage !== 'undefined') {
        const sel = localStorage.getItem('ndn:selectedMode');
        ui.selectedMode = sel || null;
      }
    } catch (e) {
      ui = { selectedMode: null };
    }
    const control = {
      paused: c.paused,
      pauseEndsAt: c.pauseEndsAt ?? null,
      pauseStartedAt: (c as any).pauseStartedAt ?? null,
    };
    return { match, control, ui, ts: Date.now() };
  } catch (e) {
    return null;
  }
}

export function writeMatchSnapshot() {
  try {
    const state = getSnapshotState();
    if (!state) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    // broadcast snapshot
    try {
      const bc = new BroadcastChannel(CHANNEL);
      bc.postMessage({ type: "snapshot", state });
      bc.close();
    } catch {}
  } catch (e) {}
}

export function readMatchSnapshot(): { match?: any; control?: any } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return { match: parsed.match, control: parsed.control };
  } catch {
    return null;
  }
}

// broadcastMessage and subscribeMatchSync live in src/utils/broadcast.ts
