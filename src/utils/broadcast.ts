// Small, dependency-free broadcast helpers for inter-window messaging.
// NOTE: we avoid replacing or adding global handlers here; test setup
// in `src/setupTests.ts` installs a mock BroadcastChannel for Vitest which
// is preferable. The rest of this module prefers `window.BroadcastChannel`
// where available and safely falls back to localStorage + custom window
// events in environments where a BroadcastChannel is not appropriate.
const STORAGE_KEY = "ndn:match-sync";
const CHANNEL = "ndn-match-sync";

export function broadcastMessage(msg: any) {
  try {
    // Prefer browser BroadcastChannel when available. Some Node/JSDOM/Bundled
    // environments implement BroadcastChannel but with incompatible internals
    // so we only use the native window.BroadcastChannel implementation where
    // possible. In Node, the built-in BroadcastChannel can be problematic (it
    // will dispatch Node MessageEvent objects that are not DOM Events), so we
    // avoid using global BroadcastChannel in Node unless a test/mock replaces it
    // with a non-native implementation.

    const winBC =
      typeof window !== "undefined" && (window as any).BroadcastChannel
        ? (window as any).BroadcastChannel
        : null;
    let canUseBC = false;
    // Only use BroadcastChannel if it is implemented on the window (browser or jsdom).
    if (winBC && typeof winBC === "function") {
      canUseBC = true;
    }
    if (canUseBC) {
      // Use the window constructor
      const ctor = winBC;
      try {
        const bc = new ctor(CHANNEL);
        try {
          bc.postMessage(msg);
        } finally {
          try {
            bc.close();
          } catch {}
        }
        return;
      } catch (e) {
        // Fall through to localStorage fallback
      }
    }
    // Fallback to localStorage event for cross-tab messaging
  } catch {
    try {
      // fallback: write a one-off message into localStorage so other tabs
      // listening to storage events can pick it up.
      localStorage.setItem(
        `${STORAGE_KEY}:lastmsg`,
        JSON.stringify({ msg, ts: Date.now() }),
      );
      // Fire a storage event so listeners wake up (some browsers don't fire for same-tab writes)
      try {
        // Prefer StorageEvent when available
        // Some test environments (jsdom) may not fully implement StorageEvent, so fall back.
        const se = new StorageEvent("storage", {
          key: `${STORAGE_KEY}:lastmsg`,
          newValue: localStorage.getItem(`${STORAGE_KEY}:lastmsg`),
        });
        window.dispatchEvent(se);
      } catch {
        try {
          window.dispatchEvent(new Event("storage"));
        } catch {}
      }
      // Also dispatch a same-window custom event to reliably notify listeners in this tab (useful for tests)
      try {
        window.dispatchEvent(
          new CustomEvent("ndn:match-sync", { detail: { msg } }),
        );
      } catch {}
    } catch {}
  }
}

export function subscribeMatchSync(onMessage: (msg: any) => void) {
  let bc: BroadcastChannel | null = null;
  try {
    const winBC =
      typeof window !== "undefined" && (window as any).BroadcastChannel
        ? (window as any).BroadcastChannel
        : null;
    let canUseBC = false;
    if (winBC && typeof winBC === "function") {
      canUseBC = true;
    }
    if (canUseBC) {
      try {
        const ctor = winBC;
        bc = new ctor(CHANNEL);
      } catch (e) {
        throw new Error("no-bc");
      }
    } else {
      throw new Error("no-bc");
    }
    if (bc) {
      bc.onmessage = (ev: any) => {
        try {
          onMessage(ev.data);
        } catch {}
      };
    }
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
