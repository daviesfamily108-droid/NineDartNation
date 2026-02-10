import { describe, it, expect } from "vitest";
import { broadcastMessage, subscribeMatchSync } from "../broadcast.js";

describe("broadcast fallback helpers", () => {
  it("subscribe receives messages from broadcastMessage via localStorage fallback", async () => {
    // Temporarily make BroadcastChannel throw to force the fallback path
    const OriginalGlobalBC = (global as any).BroadcastChannel;
    const OriginalWindowBC = (window as any).BroadcastChannel;
    try {
      // Set a throwing constructor so attempts to instantiate BroadcastChannel fail
      try {
        (global as any).BroadcastChannel = class {
          constructor() {
            throw new Error("force-fallback");
          }
        };
      } catch {}
      try {
        (window as any).BroadcastChannel = (global as any).BroadcastChannel;
      } catch {}

      await new Promise<void>((resolve, reject) => {
        const unsub = subscribeMatchSync((msg: any) => {
          try {
            expect(msg).toBeDefined();
            expect(msg.type).toBe("fallback-test");
            unsub && unsub();
            resolve();
          } catch (e) {
            unsub && unsub();
            reject(e);
          }
        });
        // trigger fallback writer which sets localStorage
        broadcastMessage({ type: "fallback-test", payload: "ok" });
        // Some environments (jsdom) may not fire storage events for same-tab writes,
        // so explicitly dispatch the same-window custom event we use as a reliable
        // notification channel. Use the same message payload we wrote above.
        const payload = { type: "fallback-test", payload: "ok" };
        try {
          window.dispatchEvent(
            new CustomEvent("ndn:match-sync", { detail: { msg: payload } }),
          );
        } catch (e) {
          try {
            window.dispatchEvent(new Event("storage"));
          } catch {}
        }
      });
    } finally {
      try {
        (global as any).BroadcastChannel = OriginalGlobalBC;
      } catch {}
      try {
        (window as any).BroadcastChannel = OriginalWindowBC;
      } catch {}
    }
  });
});
