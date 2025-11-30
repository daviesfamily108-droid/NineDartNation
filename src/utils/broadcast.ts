// Small, dependency-free broadcast helpers for inter-window messaging.
const STORAGE_KEY = "ndn:match-sync";
const CHANNEL = "ndn-match-sync";

export function broadcastMessage(msg: any) {
  try {
    const bc = new BroadcastChannel(CHANNEL);
    bc.postMessage(msg);
    bc.close();
  } catch {
    try {
      // fallback: write a one-off message into localStorage so other tabs
      // listening to storage events can pick it up.
      localStorage.setItem(`${STORAGE_KEY}:lastmsg`, JSON.stringify({ msg, ts: Date.now() }));
      // Fire a storage event so listeners wake up (some browsers don't fire for same-tab writes)
      try {
        // Prefer StorageEvent when available
        // Some test environments (jsdom) may not fully implement StorageEvent, so fall back.
        const se = new StorageEvent("storage", { key: `${STORAGE_KEY}:lastmsg`, newValue: localStorage.getItem(`${STORAGE_KEY}:lastmsg`) });
        window.dispatchEvent(se);
      } catch {
        try {
          window.dispatchEvent(new Event("storage"));
        } catch {}
      }
      // Also dispatch a same-window custom event to reliably notify listeners in this tab (useful for tests)
      try {
        window.dispatchEvent(new CustomEvent("ndn:match-sync", { detail: { msg } }));
      } catch {}
    } catch {}
  }
}

export function subscribeMatchSync(onMessage: (msg: any) => void) {
  let bc: BroadcastChannel | null = null;
  try {
    bc = new BroadcastChannel(CHANNEL);
    bc.onmessage = (ev) => {
      try {
        onMessage(ev.data);
      } catch {}
    };
  } catch {
    const onStorage = () => {
      try {
        const raw = localStorage.getItem(`${STORAGE_KEY}:lastmsg`);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        onMessage(parsed.msg);
      } catch {}
    };
    const onCustom = (ev: any) => {
      try {
        if (!ev?.detail) return;
        onMessage(ev.detail.msg);
      } catch {}
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("ndn:match-sync", onCustom as EventListener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("ndn:match-sync", onCustom as EventListener);
    };
  }
  return () => {
    try {
      if (bc) bc.close();
    } catch {}
  };
}
